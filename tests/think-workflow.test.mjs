import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;

async function fixture() {
  const db=new PGlite();
  await db.exec(`
    create role anon;create role authenticated;create role service_role;
    create schema auth;create table auth.users(id uuid primary key);
    create table profiles(id uuid primary key,role text,approval_status text);
    create table classes(id uuid primary key,teacher_id uuid,grade_number int,class_number int,active_lesson_plan_id uuid);
    create table lesson_plans(id uuid primary key,project_version_id uuid,think_stages text[],core_question text,ai_response_mode text,ai_question_limit int);
    create table class_projects(class_id uuid,source_version_id uuid);
    create table student_accounts(auth_user_id uuid,student_number text);
    create table class_lesson_stage_access(class_id uuid,lesson_plan_id uuid,stage_code text,access_mode text);
    create table think_stage_responses(lesson_plan_id uuid,student_number text,stage_code text,content text,submitted_at timestamptz,updated_at timestamptz);
    insert into auth.users values('${id(1)}'),('${id(2)}'),('${id(3)}'),('${id(4)}');
    insert into profiles values('${id(1)}','teacher','approved');
    insert into classes values('${id(10)}','${id(1)}',3,1,'${id(20)}'),('${id(11)}','${id(1)}',3,2,'${id(21)}');
    insert into lesson_plans values('${id(20)}','${id(30)}',array['T','H','I','N','K'],'현재 핵심 질문','THOUGHT_PROVOKING',1),
      ('${id(21)}','${id(30)}',array['T','H','I','N','K'],'다른 핵심 질문','GENERAL',2);
    insert into class_projects values('${id(10)}','${id(30)}'),('${id(11)}','${id(30)}');
    insert into student_accounts values('${id(2)}','30101'),('${id(3)}','30102'),('${id(4)}','30201');
    insert into class_lesson_stage_access select '${id(10)}','${id(20)}',unnest(array['T','H','I','N','K']),'writable';
  `);
  await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261111000000_think_workflow.sql',import.meta.url),'utf8'));
  const rpc=async (action,stage='T',payload={},actor=id(2),classId=id(10),lesson=id(20))=>
    (await db.query('select think_workflow($1,$2,$3,$4,$5,$6) value',[actor,classId,lesson,action,stage,JSON.stringify(payload)])).rows[0].value;
  return {db,rpc};
}
const saveData=(row,content,n,extra={})=>({lease:row.lease,revision:row.revision,content,requestId:id(n),...extra});

test('close permits in-flight saves and one final flush, rejects stale writes and new entry',async()=>{
  const {db,rpc}=await fixture();try {
    let row=await rpc('open');
    row=await rpc('save','T',saveData(row,'첫 문장',100));
    await db.exec("update class_lesson_stage_access set access_mode='read_only' where stage_code='T'");
    await assert.rejects(rpc('open'),/작성할 수 없는/);
    row=await rpc('save','T',saveData(row,'전송 중이던 문장',101));
    const final=saveData(row,'마지막 문장',102,{final:true,submit:true});
    row=await rpc('save','T',final);
    assert.equal(row.final_saved,true);
    assert.equal((await rpc('save','T',final)).revision,row.revision,'retry is idempotent');
    await assert.rejects(rpc('save','T',saveData(row,'마감 후 새 글',103)),/마지막 저장/);
    await assert.rejects(rpc('save','T',{...final,requestId:id(104),revision:0}),/다른 창/);
    const snapshot=await rpc('snapshot');
    assert.equal(snapshot.records[0].content,'마지막 문장');
    assert.equal(snapshot.records[0].lease,undefined);
    await db.exec("update class_lesson_stage_access set access_mode='writable' where stage_code='T'");
    const reopened=await rpc('open');assert.notEqual(reopened.lease,row.lease);
    assert.equal(reopened.content,'마지막 문장');
    await assert.rejects(rpc('save','T',saveData(row,'다른 탭 글',105)),/작성 권한/);
  } finally {await db.close();}
});

test('peer assignment excludes self/unsubmitted, persists snapshots and validates selection',async()=>{
  const {db,rpc}=await fixture();try {
    let own=await rpc('open');await rpc('save','T',saveData(own,'내 글',110,{submit:true}));
    let other=await rpc('open','T',{},id(3));
    await rpc('save','T',saveData(other,'작성 중인 글',111),id(3));
    await rpc('assign','T',{},id(1));assert.equal((await rpc('snapshot')).peers.length,0);
    other=await rpc('open','T',{},id(3));
    await rpc('save','T',saveData(other,'친구 제출 글',112,{submit:true}),id(3));
    await rpc('assign','T',{},id(1));
    const peers=(await rpc('snapshot')).peers;
    assert.equal(peers.length,1);assert.equal(peers[0].text,'친구 제출 글');
    assert.deepEqual(Object.keys(peers[0]).sort(),['id','text']);
    other=await rpc('open','T',{},id(3));await rpc('save','T',saveData(other,'수정 글',113,{submit:true}),id(3));
    await rpc('assign','T',{},id(1));assert.deepEqual((await rpc('snapshot')).peers,peers);
    const h=await rpc('open','H');
    await assert.rejects(rpc('save','H',saveData(h,'',114,{metadata:{selectedPeerOpinion:id(999)}})),/배정된 의견/);
    await rpc('save','H',saveData(h,peers[0].text,115,{submit:true,metadata:{selectedPeerOpinion:peers[0].id}}));
    const n=await rpc('open','N');
    await rpc('save','N',saveData(n,'이유',116,{submit:true,metadata:{criteria:'fairness',selectedPeerOpinion:peers[0].id}}));
    const restored=(await rpc('snapshot')).records.find(r=>r.stage==='N');
    assert.equal(restored.metadata.criteria,'fairness');assert.ok(restored.submitted_at);
  } finally {await db.close();}
});

test('AI reserves quota once, refunds failure, persists success after closure',async()=>{
  const {db,rpc}=await fixture();try {
    const turn=await rpc('chat_start','I',{requestId:id(120),question:'왜?'});
    assert.equal(turn.coreQuestion,'현재 핵심 질문');assert.equal(turn.mode,'THOUGHT_PROVOKING');
    assert.equal((await rpc('chat_start','I',{requestId:id(120),question:'왜?'})).claimed,undefined);
    await assert.rejects(rpc('chat_start','I',{requestId:id(121),question:'다른 질문'}),/횟수/);
    await rpc('chat_finish','I',{requestId:turn.id,attempt:turn.attempt,error:'통신 오류'});
    assert.equal((await rpc('snapshot')).remaining,1);
    const retry=await rpc('chat_start','I',{requestId:id(120),question:'왜?'});
    assert.notEqual(retry.attempt,turn.attempt);
    await db.exec("update class_lesson_stage_access set access_mode='hidden' where stage_code='I'");
    await rpc('chat_finish','I',{requestId:retry.id,attempt:retry.attempt,answer:'어떤 근거인가요?'});
    assert.equal((await rpc('snapshot')).turns[0].answer,'어떤 근거인가요?');
    assert.equal((await rpc('snapshot')).remaining,0);
    await assert.rejects(rpc('chat_start','I',{requestId:id(122),question:'새 질문'}),/열려 있지/);
  } finally {await db.close();}
});

test('class/lesson isolation and direct browser DB denial',async()=>{
  const {db,rpc}=await fixture();try {
    await assert.rejects(rpc('snapshot','T',{},id(4)),/학급의 학생/);
    await assert.rejects(rpc('assign'),/배정 권한/);
    await assert.rejects(rpc('open','T',{},id(2),id(10),id(21)),/작성할 수 없는/);
    assert.equal((await rpc('snapshot','T',{},id(2),id(10),id(21))).records.length,0);
    await db.exec('set role authenticated');
    await assert.rejects(db.query('select * from think_records'),/permission denied/);
    await assert.rejects(rpc('snapshot'),/permission denied/);
    await db.exec('reset role');
  } finally {await db.close();}
});
