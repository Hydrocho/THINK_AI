import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

async function request({owned=true,attached=true,studentNumber,view="live",stageCode="T",detail}={}) {
  const queries=[];let handler;
  const rows={profiles:{role:'teacher',approval_status:'approved'},classes:owned?{id:'c',grade_number:3,class_number:1}:null,
    lesson_plans:{id:'l',project_version_id:'v'},class_projects:attached?{id:'p'}:null,
    student_accounts:[{student_number:'30101',student_name:'제출',auth_user_id:'a'},{student_number:'30102',student_name:'미제출',auth_user_id:'b'}],
    think_chat_turns:[{question:'질문',answer:'답변',status:'succeeded'}],
    think_records:[{student_id:'a',content:'실제 제출',metadata:{tAnswers:['실제 제출']},submitted_at:'2026-11-22'},
      {student_id:'b',content:'비공개 초안',submitted_at:null},{student_id:'outside',content:'다른 학생',submitted_at:'2026-11-22'}]};
  const admin={async rpc(name,args){queries.push({rpc:name,args});return {data:[],error:null};},from(table){const query={table,filters:[]};queries.push(query);
    const chain={select(){return chain;},eq(...args){query.filters.push(args);return chain;},like(){return chain;},order(){return chain;},limit(){return chain;},
      maybeSingle(){return Promise.resolve({data:table==='think_records'?rows[table].find(row=>query.filters.some(([key,value])=>key==='student_id'&&row.student_id===value))||null:rows[table],error:null});},then(resolve){return Promise.resolve({data:rows[table],error:null}).then(resolve);}};return chain;}};
  const source=fs.readFileSync(new URL('../supabase/functions/get-teacher-stage-responses/index.ts',import.meta.url),'utf8')
    .replace(/^import .*;\r?\n/gm,'').replace('body: unknown','body').replace('req: Request','req').replaceAll(')!;',');');
  vm.runInNewContext(source,{Deno:{env:{get:()=>''}},Response,
    createClient:(url,key,options)=>options?{auth:{async getUser(){return {data:{user:{id:'teacher'}},error:null};}}}:admin,
    serve(fn){handler=fn;}});
  const response=await handler(new Request('https://example.test',{method:'POST',headers:{Authorization:'Bearer test','Content-Type':'application/json'},
    body:JSON.stringify({classId:'c',lessonId:'l',stageCode,view,studentNumber,detail})}));
  return {response,data:await response.json(),queries};
}
test('roster request never reads answers; detail reads only selected student in the class and stage',async()=>{
  const roster=await request();
  assert.equal(roster.response.status,200);
  assert.equal(roster.data.students.length,2);
  assert.equal(roster.queries.some(q=>q.table==='think_records'),false);
  assert.equal('response' in roster.data.students[0],false);
  const {response,data,queries}=await request({studentNumber:'30101'});
  assert.equal(response.status,200);
  assert.equal(data.response.content,'실제 제출');
  assert.equal(data.students,undefined);
  assert.deepEqual(queries.find(q=>q.table==='think_records').filters,[['class_id','c'],['lesson_id','l'],['stage','T'],['student_id','a']]);
  const draft=await request({studentNumber:'30102'});assert.equal(draft.data.response,null);
  const stranger=await request({studentNumber:'30201'});assert.equal(stranger.response.status,404);
  assert.equal(stranger.queries.some(q=>q.table==='think_records'),false);
});

test('I chat reads only the selected student class and lesson without requiring submission',async()=>{
  const {response,data,queries}=await request({stageCode:'I',studentNumber:'30102',detail:'chat'});
  assert.equal(response.status,200);assert.equal(data.turns[0].answer,'답변');
  assert.deepEqual(queries.find(q=>q.table==='think_chat_turns').filters,[['class_id','c'],['lesson_id','l'],['student_id','b']]);
  assert.equal(queries.some(q=>q.table==='think_records'),false);
  const denied=await request({owned:false,stageCode:'I',studentNumber:'30101',detail:'chat'});
  assert.equal(denied.response.status,404);assert.equal(denied.queries.some(q=>q.table==='think_chat_turns'),false);
});
test('live API rejects classes the teacher does not own and unattached lessons before reading records',async()=>{
  for(const options of [{owned:false},{attached:false}]) {
    const {response,queries}=await request(options);
    assert.equal(response.status,404);
    assert.equal(queries.some(q=>q.table==='think_records'),false);
  }
});

test('H statistics use one aggregate RPC without loading roster or raw answers',async()=>{
 const {response,queries}=await request({view:'h_rankings',stageCode:'H'});
 assert.equal(response.status,200);
 assert.equal(queries.filter(q=>q.rpc==='teacher_h_rankings').length,1);
 assert.equal(queries.some(q=>['student_accounts','think_records','think_peer_sets'].includes(q.table)),false);
 const wrong=await request({view:'h_rankings',stageCode:'T'});
 assert.equal(wrong.response.status,400);
 assert.equal(wrong.queries.some(q=>q.rpc),false);
});

test('N statistics use one aggregate RPC without loading roster or raw answers',async()=>{
 const {response,queries}=await request({view:'n_rankings',stageCode:'N'});
 assert.equal(response.status,200);
 assert.equal(queries.filter(q=>q.rpc==='teacher_n_rankings').length,1);
 assert.equal(queries.some(q=>['student_accounts','think_records','think_peer_sets'].includes(q.table)),false);
 const wrong=await request({view:'n_rankings',stageCode:'T'});
 assert.equal(wrong.response.status,400);
 assert.equal(wrong.queries.some(q=>q.rpc),false);
});
