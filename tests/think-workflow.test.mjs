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
  await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261122090000_teacher_h_rankings.sql',import.meta.url),'utf8'));
  await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261122100000_teacher_h_reaction_categories.sql',import.meta.url),'utf8'));
  await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261122110000_class_peer_review_option.sql',import.meta.url),'utf8'));
  await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261122120000_teacher_n_rankings.sql',import.meta.url),'utf8'));
  await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261122130000_teacher_n_ranking_questions.sql',import.meta.url),'utf8'));
  await db.exec("alter table student_accounts add column student_name text; update student_accounts set student_name='작성 학생' where student_number='30101';");
  await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261122140000_teacher_ranking_author_names.sql',import.meta.url),'utf8'));
  await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261123010000_multiple_hearts.sql',import.meta.url),'utf8'));
  await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261125010000_teacher_all_answers.sql',import.meta.url),'utf8'));
  await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261125020000_final_writing_sharing.sql',import.meta.url),'utf8'));
  await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261125030000_release_final_writing.sql',import.meta.url),'utf8'));
  await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261125040000_final_reactions.sql',import.meta.url),'utf8'));
  const rpc=async (action,stage='T',payload={},actor=id(2),classId=id(10),lesson=id(20))=>
    (await db.query('select think_workflow($1,$2,$3,$4,$5,$6) value',[actor,classId,lesson,action,stage,JSON.stringify(payload)])).rows[0].value;
  return {db,rpc};
}
const saveData=(row,content,n,extra={})=>({lease:row.lease,revision:row.revision,content,requestId:id(n),...extra});

test('class plan disables peer reading while preserving own N submission and other classes',async()=>{
  const {db,rpc}=await fixture();
  try {
    await db.query('update classes set active_lesson_plan_id=null where id=$1',[id(10)]);
    const plan=actor=>db.query("select manage_live_teaching($1,$2,$3,'plan',$4)",[actor,id(10),id(20),JSON.stringify({enabled:true,stages:['N'],peerReviewEnabled:false})]);
    await assert.rejects(plan(id(4)),/권한/);await plan(id(1));
    assert.equal((await rpc('snapshot')).peerReviewEnabled,false);
    assert.equal((await rpc('snapshot','N',{},id(4),id(11),id(21))).peerReviewEnabled,true);
    await db.query('update classes set active_lesson_plan_id=$1 where id=$2',[id(20),id(10)]);
    const row=await rpc('open','N');
    assert.ok((await rpc('save','N',saveData(row,'내 검토',999,{metadata:{criteria:'validity'},submit:true}))).submitted_at);
    for(const action of ['review_list','review_feedback'])await assert.rejects(db.query('select think_review_reading($1,$2,$3,$4,$5)',[id(2),id(10),id(20),action,'{}']),/사용하지 않습니다/);
    const snapshot=(await db.query('select think_stage_snapshot($1,$2,$3,$4) value',[id(2),id(10),id(20),'N'])).rows[0].value;
    assert.equal(snapshot.peerReviewEnabled,false);
  } finally {await db.close();}
});

test('H rankings count saved reactions against shared texts and enforce teacher ownership',async()=>{
  const {db}=await fixture();
  try {
    await db.query("insert into think_peer_texts values($1,$2,'text1','첫 번째 글'),($1,$2,'text2','두 번째 글')",[id(10),id(20)]);
    for(const student of [id(2),id(3)]) {
      await db.query('insert into think_peer_sets(class_id,lesson_id,student_id,opinions,source_ids) values($1,$2,$3,$4,$5) on conflict(class_id,lesson_id,student_id) do update set opinions=excluded.opinions,source_ids=excluded.source_ids',
        [id(10),id(20),student,JSON.stringify([{id:'p1',ref:'text1'},{id:'p2',ref:'text2'}]),[id(40),id(41)]]);
      await db.query("insert into think_records(class_id,lesson_id,student_id,stage,metadata) values($1,$2,$3,'H',$4)",
        [id(10),id(20),student,JSON.stringify({feedback:{p1:{recommended:true,reaction:student===id(2)?'similar':'newView'},p2:{reaction:'curious'},unassigned:{recommended:true}}})]);
    }
    await db.query("insert into auth.users(id) values($1)",[id(40)]);
    await db.query("insert into student_accounts values($1,'30103','김학생')",[id(40)]);
    const query=(actor=id(1))=>db.query('select teacher_h_rankings($1,$2,$3) value',[actor,id(10),id(20)]);
    const rows=(await query()).rows[0].value;
    assert.equal(rows.length,2);
    const first=rows.find(r=>r.content==='첫 번째 글');
    assert.equal(first.studentName,'김학생');assert.equal(rows.find(r=>r.content==='두 번째 글').studentName,null);
    assert.equal(first.stars,2);assert.equal(first.likes,2);
    assert.equal(first.similar,1);assert.equal(first.newView,1);assert.equal(first.curious,0);
    assert.equal(rows.find(r=>r.content==='두 번째 글').curious,2);
    assert.equal(rows.find(r=>r.content==='두 번째 글').stars,0);
    assert.equal(JSON.stringify(rows).includes('student_id'),false);
    await db.query("insert into think_records(class_id,lesson_id,student_id,stage,content,submitted_at) values($1,$2,$3,'T','새 제출',now())",[id(10),id(20),id(2)]);
    const unread=(await query()).rows[0].value.find(row=>row.content==='새 제출');
    assert.equal(unread.stars,0);assert.equal(unread.likes,0);
    await assert.rejects(query(id(4)),/권한/);
  } finally {await db.close();}
});

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
    assert.deepEqual(Object.keys(await snapshot('T')).sort(),['access','peerReviewEnabled']);
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
    await assert.rejects(read(),/먼저 저장/);
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
    await read('review_feedback',{id:peers[0].id,reactions:['similar','newView','curious']});
    const again=await read();
    assert.deepEqual(again[0].reactions,['similar','newView','curious']);
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

test('N teacher rankings aggregate reactions only for submitted reviews and enforce ownership',async()=>{
 const {db}=await fixture();
 try {
  await db.query("insert into think_records(class_id,lesson_id,student_id,stage,content,submitted_at) values($1,$2,$3,'N','검토 내용',now()),($1,$2,$4,'N','읽은 학생',now())",[id(10),id(20),id(2),id(3)]);
  await db.query("insert into think_review_readings(class_id,lesson_id,reader,author,position,reaction,recommended) values($1,$2,$3,$4,1,'newView',true)",[id(10),id(20),id(3),id(2)]);
  const query=actor=>db.query('select teacher_n_rankings($1,$2,$3) value',[actor,id(10),id(20)]);
  const rows=(await query(id(1))).rows[0].value;
  const unread={studentName:null,content:'읽은 학생',review:null,stars:0,likes:0,similar:0,newView:0,curious:0};
  assert.deepEqual(rows,[{studentName:'작성 학생',content:'검토 내용',review:null,stars:1,likes:1,similar:0,newView:1,curious:0},unread]);
  await assert.rejects(query(id(2)),/권한/);
  await db.query('update think_records set submitted_at=null where student_id=$1',[id(2)]);
  assert.deepEqual((await query(id(1))).rows[0].value,[unread]);
 } finally {await db.close();}
});

test('K sharing is teacher-released, class-scoped and returns only submitted peer text',async()=>{
  const {db}=await fixture();
  const read=async(actor=id(2))=>(await db.query('select think_final_reading($1,$2,$3) posts',[actor,id(10),id(20)])).rows[0].posts;
  const manage=(action,payload={})=>db.query('select manage_live_teaching($1,$2,$3,$4,$5)',[id(1),id(10),id(20),action,JSON.stringify(payload)]);
  try {
    await assert.rejects(read(),/최종 글/);
    await manage('end');
    await manage('plan',{enabled:true,stages:['K']});
    await manage('start');
    await manage('stage',{stage:'K'});
    await db.query("insert into think_records(class_id,lesson_id,student_id,stage,content,submitted_at) values($1,$2,$3,'K','본인 글',now()),($1,$2,$4,'K','친구 글',null)",[id(10),id(20),id(2),id(3)]);
    assert.deepEqual((await manage('list_finals')).rows[0].manage_live_teaching,['본인 글']);
    await assert.rejects(read(),/아직 최종 글을 공개/);
    await manage('release_finals');
    assert.deepEqual(await read(),[]);
    await db.query("update think_records set submitted_at=now() where student_id=$1",[id(3)]);
    assert.deepEqual(await read(),['친구 글']);
    const cards=async(actor,action='final_cards',payload={})=>(await db.query('select think_final_cards($1,$2,$3,$4,$5) posts',[actor,id(10),id(20),action,payload])).rows[0].posts;
    const [post]=await cards(id(2));
    assert.deepEqual(Object.keys(post).sort(),['id','reactions','recommended','text']);
    assert.equal(post.text,'친구 글');assert.notEqual(post.id,id(3));
    const feedback={id:post.id,reactions:['similar','curious'],recommended:true};
    await cards(id(2),'final_feedback',feedback);
    await cards(id(2),'final_feedback',feedback);
    assert.deepEqual(await cards(id(2)),[{...feedback,text:'친구 글'}]);
    await assert.rejects(cards(id(3),'final_feedback',feedback));
    const teacher=async()=>(await manage('list_final_cards')).rows[0].manage_live_teaching;
    assert.equal((await teacher()).find(r=>r.text==='본인 글').studentName,'작성 학생');
    const counts=(await teacher()).find(r=>r.text===post.text);
    assert.deepEqual([counts.similar,counts.curious,counts.newView,counts.stars],[1,1,0,1]);
    await cards(id(2),'final_feedback',{id:post.id,reactions:[],recommended:false});
    assert.equal((await teacher()).find(r=>r.text===post.text).stars,0);
    await assert.rejects(read(id(4)),/최종 글/);
    await manage('hide_finals');
    await assert.rejects(cards(id(2),'final_feedback',feedback));
    await assert.rejects(read(),/아직 최종 글을 공개/);
    await manage('release_finals');
    await manage('close_stage',{stage:'K'});
    await assert.rejects(read(),/최종 글/);
    await manage('end');
    await manage('plan',{enabled:true,stages:['K'],finalSharingEnabled:false});
    await manage('start');await manage('stage',{stage:'K'});
    await assert.rejects(read(),/최종 글/);
    await manage('release_finals');assert.deepEqual(await read(),['친구 글']);
  } finally {await db.close();}
});
