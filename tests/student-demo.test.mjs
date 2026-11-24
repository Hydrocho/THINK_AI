import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {parseHTML} from 'linkedom';

function fixture() {
  const {document} = parseHTML('<html><body>' +
    ['authSection','teacherAppSection','teacherPendingSection','studentLobbySection','studentAppSection','currentLessonLabel','currentProjectTitle','stepMainTitle','stepContentContainer','inputStudentNum','inputStudentPw'].map(id => `<div id="${id}"></div>`).join('') +
    '<details id="thinkBackground"><p></p></details></body></html>');
  const map = new Map();
  const storage = {getItem: k => map.get(k) ?? null, setItem: (k,v) => map.set(k,v), removeItem: k => map.delete(k), key: i => [...map.keys()][i], get length() {return map.size;}};
  const calls = [], alerts = [];
  const window = {
    AppState: {studentData: {}}, App: {updateStepNav() {}},
    ModalService: {writingExit: async () => 'draft', alert: async () => {}, confirm: async () => true},
    AuthModule: {prepareStudent(state, studentNumber, name) {state.studentData = {studentNumber,name};}, logout() {}},
    StudentLobbyModule: {exitToLobby() {}, renderLobby() {}}, addEventListener() {},
    SupabaseService: {invokeAccountFunction: async (name, body) => {calls.push({name,body}); return {reply: '어떤 기준으로 두 입장을 비교해 볼까요?'};}}
  };
  const context = {window, document, structuredClone, URL, crypto: webcrypto, sessionStorage: storage, localStorage: storage,
    setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {}, alert: text => alerts.push(text)};
  for (const name of ['studentDemo','thinkWorkflow']) vm.runInNewContext(fs.readFileSync(new URL(`../js/modules/${name}.js`, import.meta.url), 'utf8'), context);
  return {window, document, calls, alerts, map, context};
}

test('demo login enters the specified room and all five existing editors work without classroom API calls', async () => {
  const f = fixture(), demo = f.window.StudentDemo, flow = f.window.ThinkWorkflow;
  await demo.login(f.window.AppState);
  assert.match(f.document.getElementById('stepMainTitle').textContent, /유전 질환을 예방할 목적으로 배아의 유전자를 편집/);
  assert.equal(f.window.AppState.studentData.studentNumber, '111111');
  const editor = f.document.getElementById('thinkText');
  editor.value = '조건부로 찬성한다'; flow.input(editor.value);
  await flow.submit();
  await flow.navigate(2);
  assert.equal(f.document.querySelectorAll('.think-peer-card').length, 6);
  await flow.peerAction(0, 'newView');
  await flow.peerAction(0, 'recommend');
  const saved = await demo.invoke('snapshot');
  assert.equal(saved.records.find(row => row.stage === 'T').content, '조건부로 찬성한다');
  assert.equal(saved.records.find(row => row.stage === 'H').metadata.feedback['demo-peer-1'].recommended, true);
  for (const step of [3,4,5]) {
    await flow.navigate(step);
    assert.equal(f.window.AppState.currentStep, step);
    assert.equal(f.document.querySelector('textarea')?.disabled, false);
  }
  await flow.navigate(4);
  for (const [id, value] of [['reviewTarget','안전성을 확인해야 한다'],['reviewEvidence','여러 관점의 자료를 비교했다'],['reviewJudgment','확인 기준을 더 구체화하고 싶다']]) {
    f.document.getElementById(id).value = value;
  }
  flow.reviewInput();
  await flow.submit();
  await flow.reviewTab(true);
  assert.equal(f.document.querySelectorAll('.think-peer-card').length, 6);
  await flow.reviewReaction(0, 'recommend');
  assert.equal((await demo.invoke('review_list','N'))[0].recommended, true);
  assert.equal(f.calls.length, 0);
  assert.deepEqual(f.alerts, []);
  await flow.stop(); demo.end();
  assert.equal(demo.active, false);
  assert.equal(f.map.size, 0);
});

test('sample review reactions persist and AI questions use the actual existing endpoint', async () => {
  const f = fixture(), demo = f.window.StudentDemo;
  await demo.login(f.window.AppState);
  await demo.invoke('review_feedback', 'N', {id: 'demo-review-1', reactions: ['similar','curious'], recommended: true});
  const posts = await demo.invoke('review_list', 'N');
  assert.equal(posts[0].recommended, true);
  assert.equal(posts[0].reactions.length, 2);
  const first = await demo.invoke('chat', 'I', {requestId: 'one', question: '어떤 기준이 필요할까?'});
  assert.equal(first.status, 'succeeded');
  await demo.invoke('chat', 'I', {requestId: 'one', question: '어떤 기준이 필요할까?'});
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].name, 'gemini-chat');
  assert.equal((await demo.invoke('snapshot')).remaining, 19);
  vm.runInNewContext(fs.readFileSync(new URL('../js/modules/studentDemo.js', import.meta.url), 'utf8'), f.context);
  assert.equal(f.window.StudentDemo.active, true);
  assert.equal((await f.window.StudentDemo.invoke('review_list','N'))[0].recommended, true);
});

test('only matching demo credentials bypass regular student authentication', async () => {
  const f = fixture();
  vm.runInNewContext(fs.readFileSync(new URL('../js/modules/auth.js', import.meta.url), 'utf8'), f.context);
  const logins = [];
  f.window.StudentDemo.login = async () => logins.push('demo');
  f.window.SupabaseService.isConnected = () => true;
  f.window.SupabaseService.signInStudent = async (num, pw) => {logins.push([num,pw]); throw new Error('normal login');};
  const number = f.document.getElementById('inputStudentNum'), pw = f.document.getElementById('inputStudentPw');
  number.value = '111111'; pw.value = 'wrong';
  await f.window.AuthModule.handleStudentLogin({preventDefault() {}}, {});
  assert.equal(logins.length, 0);
  pw.value = '111111';
  await f.window.AuthModule.handleStudentLogin({preventDefault() {}}, {});
  assert.equal(logins[0], 'demo');
  number.value = '10101';
  await f.window.AuthModule.handleStudentLogin({preventDefault() {}}, {});
  assert.deepEqual(logins[1], ['10101','111111']);
});
