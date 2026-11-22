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
  await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261121140000_peer_feedback.sql',import.meta.url),'utf8'));
  await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261121150000_automatic_peer_reading.sql',import.meta.url),'utf8'));
  await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261122020000_chat_usage.sql',import.meta.url),'utf8'));
  await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261122040000_review_reading.sql',import.meta.url),'utf8'));
  await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261122050000_stage_snapshot.sql',import.meta.url),'utf8'));
  await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261122060000_shared_peer_texts.sql',import.meta.url),'utf8'));
  await db.exec(`create function auth.uid() returns uuid language sql as 'select null::uuid';
    alter table class_lesson_stage_access add column updated_at timestamptz default now();
    alter table class_lesson_stage_access add unique(class_id,lesson_plan_id,stage_code);`);
  await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261122070000_class_live_teaching.sql',import.meta.url),'utf8'));
  await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261122080000_close_live_stage.sql',import.meta.url),'utf8'));
  const rpc=async (action,stage='T',payload={},actor=id(2),classId=id(10),lesson=id(20))=>
    (await db.query('select think_workflow($1,$2,$3,$4,$5,$6) value',[actor,classId,lesson,action,stage,JSON.stringify(payload)])).rows[0].value;
  return {db,rpc};
}
const saveData=(row,content,n,extra={})=>({lease:row.lease,revision:row.revision,content,requestId:id(n),...extra});

test('chat completion records provider usage once, including truncated replies',async()=>{
  const {db,rpc}=await fixture();
  try {
    const turn=await rpc('chat_start','I',{requestId:id(500),question:'테스트'});
    const usageMetadata={promptTokenCount:51,candidatesTokenCount:20,thoughtsTokenCount:90,totalTokenCount:161};
    const finish=attempt=>db.query('select finish_think_chat($1,$2,$3,$4)',
      [id(2),id(10),id(20),JSON.stringify({requestId:turn.id,attempt,answer:'부분 답변',model:'gemini-3.5-flash',finishReason:'MAX_TOKENS',usageMetadata})]);
    await finish(id(999));
    assert.equal((await db.query('select * from think_chat_usage')).rows.length,0);
    await finish(turn.attempt);
    await finish(turn.attempt);
    const snapshot=async(stage,turnId=null)=>(await db.query('select think_stage_snapshot($1,$2,$3,$4,$5) data',[id(2),id(10),id(20),stage,turnId])).rows[0].data;
    assert.deepEqual(Object.keys(await snapshot('T')),['access']);
    assert.ok(Array.isArray((await snapshot('K')).peers));
    assert.deepEqual((await snapshot('I',id(999))).turns,[]);
    const delta=await snapshot('I',turn.id);
    assert.equal(delta.turns[0].answer,'부분 답변');
    assert.equal(delta.remaining,0);
    assert.deepEqual((await db.query('select finish_reason,usage_metadata from think_chat_usage')).rows,
      [{finish_reason:'MAX_TOKENS',usage_metadata:usageMetadata}]);
  } finally {await db.close();}
});

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
    let hr=await rpc('open','H');
    const feedback={[peers[0].id]:{recommended:true}};
    hr=await rpc('save','H',saveData(hr,'',180,{metadata:{feedback}}));
    assert.equal(hr.submitted_at,null);
    feedback[peers[0].id].reaction='similar';
    hr=await rpc('save','H',{requestId:id(181),revision:hr.revision,lease:hr.lease,changes:feedback});
    assert.equal(hr.metadata.feedback[peers[0].id].recommended,true);
    const stored=(await db.query('select opinions from think_peer_sets where student_id=$1',[id(2)])).rows[0];
    assert.equal(stored.opinions[0].text,undefined);
    assert.ok(stored.opinions[0].ref);
    assert.ok(hr.submitted_at);
    await assert.rejects(rpc('save','H',saveData(hr,'',182,{metadata:{feedback:{wrong:{reaction:'similar'}}}})),/배정된 글/);
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

test('opening H rotates six first reads fairly and late submissions stay optional', async()=>{
  const {db,rpc}=await fixture();
  try {
    await db.exec("update class_lesson_stage_access set access_mode='hidden' where stage_code='H'");
    const roster=[2,3,5,6,7,8,9,12,13];
    for(const n of roster.slice(2)){
      await db.query('insert into auth.users values($1)',[id(n)]);
      await db.query('insert into student_accounts values($1,$2)',[id(n),'301'+String(n).padStart(2,'0')]);
    }
    for(const n of roster.slice(0,-1)){
      const row=await rpc('open','T',{},id(n));
      await rpc('save','T',saveData(row,'글 '+n,200+n,{submit:true}),id(n));
    }
    assert.equal((await rpc('snapshot')).peers.length,0);
    await db.exec("update class_lesson_stage_access set access_mode='writable' where stage_code='H'");
    const counts=new Map(),firsts=new Set();
    for(const n of roster.slice(0,-1)){
      const {peers,firstCount}=await rpc('snapshot','H',{},id(n));
      assert.equal(firstCount,6);assert.equal(peers.length,7);
      assert.ok(peers.every(p=>p.text!=='글 '+n));
      firsts.add(peers[0].text);
      for(const p of peers.slice(0,6)) counts.set(p.text,(counts.get(p.text)||0)+1);
    }
    assert.equal(firsts.size,8);assert.deepEqual([...new Set(counts.values())],[6]);
    const before=await rpc('snapshot');
    const feedback=Object.fromEntries(before.peers.slice(0,6).map(p=>[p.id,{reaction:'curious'}]));
    const h=await rpc('open','H');
    assert.ok((await rpc('save','H',saveData(h,'',310,{metadata:{feedback}}))).submitted_at);
    const late=await rpc('open','T',{},id(13));
    await rpc('save','T',saveData(late,'늦은 글',311,{submit:true}),id(13));
    const after=await rpc('snapshot');
    assert.equal(after.firstCount,6);
    assert.deepEqual(after.peers.slice(0,-1),before.peers);
    assert.equal(after.peers.at(-1).text,'늦은 글');
    assert.ok(after.records.find(r=>r.stage==='H').submitted_at);
  } finally {await db.close();}
});

test('N readers see submitted anonymous reviews in a stable order distinct from H and save independent reactions',async()=>{
  const {db,rpc}=await fixture();
  const read=(action='review_list',payload={},actor=id(2))=>db.query('select think_review_reading($1,$2,$3,$4,$5) value',[actor,id(10),id(20),action,JSON.stringify(payload)]).then(r=>r.rows[0].value);
  try {
    await assert.rejects(read(),/먼저 제출/);
    await db.exec(`insert into auth.users values('${id(5)}');insert into student_accounts values('${id(5)}','30103');`);
    for(const n of [2,3,5])for(const stage of ['T','N']) {
      const row=await rpc('open',stage,{},id(n));
      await rpc('save',stage,saveData(row,'글 '+n,n*10+(stage==='T'?1:2),{submit:true,metadata:{criteria:'validity',review:{evidence:'근거 '+n,judgment:'판단'}}}),id(n));
    }
    const peers=await read();
    assert.equal(peers.length,2);assert.ok(peers.every(p=>!p.author && !p.reader));
    const h=(await rpc('snapshot')).peers.map(p=>p.text);
    assert.notDeepEqual(peers.map(p=>p.evidence.replace('근거','글')),h);
    assert.ok(!peers.some(p=>p.evidence==='근거 2'));
    await read('review_feedback',{id:peers[0].id,reaction:'similar'});
    await read('review_feedback',{id:peers[0].id,recommended:true});
    const again=await read();
    assert.deepEqual(again.map(p=>p.id),peers.map(p=>p.id));
    assert.equal(again[0].reaction,'similar');assert.equal(again[0].recommended,true);
    await db.exec(`insert into auth.users values('${id(6)}');insert into student_accounts values('${id(6)}','30104');`);
    const late=await rpc('open','N',{},id(6));
    await rpc('save','N',saveData(late,'늦게 제출',606,{submit:true,metadata:{criteria:'validity'}}),id(6));
    const extended=await read();
    assert.deepEqual(extended.slice(0,2),again);
    assert.equal(extended[2].evidence,'늦게 제출');
    await assert.rejects(read('review_feedback',{id:peers[0].id,reaction:'newView'},id(3)),/읽을 수 없는/);
    await db.exec("update class_lesson_stage_access set access_mode='read_only' where stage_code='N'");
    await assert.rejects(read('review_feedback',{id:peers[0].id,recommended:false}),/마감/);
  }finally{await db.close();}
});


test('closing a live stage blocks entry, preserves existing submission and allows reopening',async()=>{
  const {db,rpc}=await fixture();
  const live=(action,stage='T',actor=id(1))=>db.query('select manage_live_teaching($1,$2,$3,$4,$5)',[actor,id(10),id(20),action,JSON.stringify({stage})]);
  try {
    await live('stage');
    const row=await rpc('open');
    await assert.rejects(live('close_stage','T',id(4)),/권한/);
    await live('close_stage');
    assert.equal((await rpc('snapshot')).access.T,'hidden');
    assert.equal((await rpc('snapshot')).access.H,'writable');
    await assert.rejects(rpc('open','T',{},id(3)),/작성할 수 없는/);
    await assert.rejects(rpc('open'),/작성할 수 없는/);
    const saved=await rpc('save','T',saveData(row,'입장 후 마무리',920,{submit:true,final:true}));
    assert.ok(saved.submitted_at);
    assert.equal(saved.final_saved,true);
    await live('stage');
    assert.ok((await rpc('open','T',{},id(3))).lease);
    await live('end');
    await assert.rejects(live('close_stage'),/먼저/);
  } finally {await db.close();}
});

test('live planning is independent, stage opening is cumulative, and existing writing survives end',async()=>{
  const {db,rpc}=await fixture();
  const live=async(action,payload={},actor=id(1),lesson=id(20))=>(await db.query(
    'select manage_live_teaching($1,$2,$3,$4,$5) value',[actor,id(10),lesson,action,JSON.stringify(payload)])).rows[0].value;
  try {
    await live('end');
    await db.exec("update class_lesson_stage_access set access_mode='hidden'");
    await live('plan',{enabled:true,stages:['T','H']});
    assert.equal((await rpc('snapshot')).active,false);
    assert.equal((await rpc('snapshot')).access.T,'hidden');
    await assert.rejects(live('start',{},id(4)),/권限|권한/);
    await live('start');
    await assert.rejects(rpc('open'),/작성할 수 없는/);
    await assert.rejects(live('stage',{stage:'I'}),/포함되지 않은/);
    await live('stage',{stage:'T'});
    const row=await rpc('open');
    await live('stage',{stage:'H'});
    assert.equal((await rpc('snapshot')).access.T,'writable');
    assert.equal((await rpc('snapshot')).access.H,'writable');
    await assert.rejects(live('plan',{enabled:true,stages:['T']}),/종료 후/);
    assert.equal((await db.query('select current_think_stage from classes where id=$1',[id(11)])).rows[0].current_think_stage,null);
    await live('end');
    await assert.rejects(rpc('open','H'),/작성할 수 없는/);
    const saved=await rpc('save','T',saveData(row,'종료 후 마무리한 답안',910,{submit:true,final:true}));
    assert.equal(saved.content,'종료 후 마무리한 답안');
    assert.ok(saved.submitted_at);
  } finally {await db.close();}
});
