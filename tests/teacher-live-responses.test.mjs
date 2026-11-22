import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { parseHTML } from 'linkedom';

function fixture(fetch) {
  const {document}=parseHTML('<main><div id="responses"></div></main>');
  const timers=new Map();let serial=0;
  const context={document,window:{SupabaseService:{invokeAccountFunction:fetch}},
    setTimeout(fn){timers.set(++serial,fn);return serial;},clearTimeout(id){timers.delete(id);}};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(new URL('../js/modules/teacherLiveResponses.js',import.meta.url),'utf8'),context);
  return {document,timers,module:context.window.TeacherLiveResponses};
}
const students=[
  {studentNumber:'30102',studentName:'미제출 학생',response:{content:'공개하지 않을 초안',submittedAt:null}},
  {studentNumber:'30101',studentName:'<img src=x onerror=alert(1)>',response:{content:'① 나의 생각\n<svg onload=alert(1)>',submittedAt:'2026-11-22T10:00:00Z'}}
];
test('roster is ordered, submitted content is safely displayed, drafts stay hidden and refresh keeps selection',async()=>{
  const calls=[];
  const {module,document,timers}=fixture(async(name,args)=>{calls.push({name,args});return {students};});
  await module.open({classId:'c',lessonId:'l',stageCode:'T'},document.getElementById('responses'));
  const buttons=[...document.querySelectorAll('[data-student-number]')];
  assert.equal(buttons[0].dataset.studentNumber,'30101');
  assert.match(buttons[0].textContent,/제출 완료/);
  buttons[0].click();
  assert.match(document.querySelector('.live-response-detail').textContent,/① 나의 생각/);
  assert.equal(document.querySelector('img,svg'),null);
  await module.refresh();
  assert.equal(document.querySelector('[aria-pressed="true"]').dataset.studentNumber,'30101');
  document.querySelector('[data-student-number="30102"]').click();
  assert.match(document.querySelector('.live-response-detail').textContent,/아직 제출하지 않았습니다/);
  assert.doesNotMatch(document.getElementById('responses').textContent,/공개하지 않을 초안/);
  assert.equal(calls[0].args.view,'live');
  assert.equal(calls[0].args.stageCode,'T');
  module.close();assert.equal(timers.size,0);
});
test('late response cannot overwrite another stage or a closed response panel',async()=>{
  let resolve;
  const {module,document}=fixture((name,args)=>args.stageCode==='T'?new Promise(r=>resolve=r):Promise.resolve({students:[]}));
  const target=document.getElementById('responses');
  const old=module.open({classId:'c',lessonId:'l',stageCode:'T'},target);
  await module.open({classId:'c',lessonId:'l',stageCode:'H'},target);
  resolve({students});await old;
  assert.match(target.textContent,/등록된 학생이 없습니다/);
  assert.equal(target.querySelector('[data-student-number]'),null);
  module.close();
});
test('load errors are readable and refresh can recover',async()=>{
  let fail=true;
  const {module,document}=fixture(async()=>{if(fail)throw Error('연결 오류');return {students:[]};});
  await module.open({classId:'c',lessonId:'l',stageCode:'T'},document.getElementById('responses'));
  assert.match(document.querySelector('[role="status"]').textContent,/연결 오류/);
  fail=false;await module.refresh();
  assert.match(document.getElementById('responses').textContent,/등록된 학생이 없습니다/);
  module.close();
});
