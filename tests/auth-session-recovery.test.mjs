import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const source = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
function setup() {
  const elements = new Map();
  const document = {getElementById(id) {
    if (!elements.has(id)) elements.set(id, {style:{}, value:'newpass', focus(){}});
    return elements.get(id);
  }};
  const alerts = [];
  const window = {};
  const context = {window, document, Map, console, alert: message => alerts.push(message)};
  vm.runInNewContext(source('js/modules/auth.js'), context);
  return {window, document, context, alerts};
}
function service(client) {
  const window = {SUPABASE_KEYS:{SUPABASE_URL:'https://example.test',SUPABASE_ANON_KEY:'test'},supabase:{createClient:()=>client}};
  vm.runInNewContext(source('js/supabase-client.js'), {window, console});
  return window.SupabaseService;
}
test('rejected password cannot become a successful login through account lookup', async () => {
  let queried = false;
  const api = service({auth:{signInWithPassword:async()=>({data:{session:null},error:{message:'invalid'}})},from(){queried=true;}});
  await assert.rejects(api.signInStudent('10101','wrong'), /로그인에 실패/);
  assert.equal(queried,false);
});
test('missing session is rejected even when sign-in returns no error', async () => {
  const api = service({auth:{signInWithPassword:async()=>({data:{user:{}},error:null})}});
  await assert.rejects(api.signInStudent('10101','wrong'), /로그인에 실패/);
});
test('session retrieval errors are propagated', async () => {
  const api = service({auth:{getSession:async()=>({data:{session:null},error:new Error('network')})}});
  await assert.rejects(api.getUserSession(), /network/);
});
test('stored student session survives status failure and retry enters lobby without login', async () => {
  const {window,context,document} = setup();
  let fail = true, entered = 0;
  window.SupabaseService = {
    isConnected:()=>true, getClient:()=>null,
    getUserSession:async()=>({user:{email:'student_10101@school.internal'}}),
    getStudentPasswordChangeStatus:async()=> {if(fail) throw new Error('network'); return {mustChangePassword:false};}
  };
  window.AuthModule.enterStudentLobby = () => {entered++;};
  vm.runInNewContext(source('js/app.js'),context);
  await window.App.restoreSession();
  assert.equal(entered,0);
  assert.equal(document.getElementById('authForms').style.display,'none');
  assert.equal(document.getElementById('authSessionRetry').style.display,'inline-block');
  fail = false;
  await window.App.restoreSession();
  assert.equal(entered,1);
  assert.equal(document.getElementById('authSessionStatus').style.display,'none');
});
for (const fail of [false,true]) test(`password change obtains a new session before entry (sign-in failure: ${fail})`, async () => {
  const {window,document,alerts} = setup();
  const calls=[];
  window.PasswordPolicy={validateStudentNewPassword:()=>({valid:true})};
  window.SupabaseService={
    changeStudentPassword:async()=>calls.push('change'),
    signInStudent:async(number,password)=>{calls.push('sign-in');assert.equal(number,'10101');assert.equal(password,'newpass');if(fail) throw new Error('network');},
    getStudentPasswordChangeStatus:async()=>{calls.push('status');return {mustChangePassword:false};}
  };
  window.AuthModule.enterStudentLobby=()=>calls.push('lobby');
  await window.AuthModule.handleStudentPasswordChange({preventDefault(){}},{studentData:{studentNumber:'10101'}});
  assert.deepEqual(calls,fail ? ['change','sign-in'] : ['change','sign-in','status','lobby']);
  assert.equal(alerts.length,fail?1:0);
  assert.equal(document.getElementById('inputNewStudentPw').value,'');
  assert.equal(window.AuthModule.changingPassword,false);
});
test('lobby refresh reloads activated lessons and remains retryable after errors', async () => {
  const {window,context,document} = setup();
  vm.runInNewContext(source('js/modules/studentLobby.js'),context);
  let fail = true;
  window.SupabaseService={fetchStudentClassLessons:async()=>{if(fail) throw new Error('network');return {subjectClasses:[{activeLesson:{id:'lesson'}}]};}};
  const state={studentData:{}};
  window.StudentLobbyModule.renderSubjectClasses=(_container,classes)=>assert.equal(classes[0].activeLesson.id,'lesson');
  await window.StudentLobbyModule.renderLobby(state);
  assert.equal(document.getElementById('refreshStudentLessons').disabled,false);
  assert.match(document.getElementById('lobbyClassLessonsContainer').innerHTML,/불러오지 못했습니다/);
  fail=false;
  await window.StudentLobbyModule.renderLobby(state);
  assert.equal(state.subjectClasses[0].activeLesson.id,'lesson');
});
