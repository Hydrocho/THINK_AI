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
test('roster loads once without polling; each name click fetches only that submission',async()=>{
  const calls=[];
  const {module,document,timers}=fixture(async(name,args)=>{calls.push({name,args});return args.studentNumber?{response:students.find(s=>s.studentNumber===args.studentNumber).response}:{students:students.map(({studentNumber,studentName})=>({studentNumber,studentName}))};});
  await module.open({classId:'c',lessonId:'l',stageCode:'T'},document.getElementById('responses'));
  const buttons=[...document.querySelectorAll('[data-student-number]')];
  assert.equal(buttons[0].dataset.studentNumber,'30101');
  assert.doesNotMatch(buttons[0].textContent,/제출 완료|미제출/);
  assert.equal(calls.length,1);assert.equal(timers.size,0);
  await module.selectStudent('30101');
  assert.match(document.querySelector('.live-response-detail').textContent,/① 나의 생각/);
  assert.equal(document.querySelector('img,svg'),null);
  await module.selectStudent('30101');
  assert.equal(document.querySelector('[aria-pressed="true"]').dataset.studentNumber,'30101');
  await module.selectStudent('30102');
  assert.match(document.querySelector('.live-response-detail').textContent,/아직 제출하지 않았습니다/);
  assert.doesNotMatch(document.getElementById('responses').textContent,/공개하지 않을 초안/);
  assert.equal(calls[0].args.view,'live');
  assert.equal(calls[0].args.stageCode,'T');
  assert.equal(calls.length,4);
  assert.equal(calls[1].args.studentNumber,'30101');
  assert.equal(calls[3].args.studentNumber,'30102');
  await module.open({classId:'c',lessonId:'l',stageCode:'H'},document.getElementById('responses'));
  assert.equal(calls.length,4);assert.equal(timers.size,0);
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

test('switching selected students ignores late detail and suppresses duplicate in-flight clicks',async()=>{
  let resolve;const calls=[];
  const {module,document}=fixture(async(name,args)=>{
    calls.push(args);
    if(!args.studentNumber)return {students};
    if(args.studentNumber==='30101')return new Promise(r=>resolve=r);
    return {response:null};
  });
  await module.open({classId:'c',lessonId:'l',stageCode:'T'},document.getElementById('responses'));
  const slow=module.selectStudent('30101');
  await module.selectStudent('30101');assert.equal(calls.length,2);
  await module.selectStudent('30102');
  resolve({response:students[1].response});await slow;
  assert.match(document.querySelector('.live-response-detail').textContent,/아직 제출하지 않았습니다/);
  assert.doesNotMatch(document.querySelector('.live-response-detail').textContent,/① 나의 생각/);
});

test('H rankings query once, sort locally and refresh only on an explicit click',async()=>{
  const calls=[];
  const {module,document,timers}=fixture(async(name,args)=>{calls.push(args);return {rankings:[
    {content:'별표 많은 글 <img src=x>',stars:3,likes:1,similar:1,newView:0,curious:0},
    {content:'새로운 관점 많은 글',stars:1,likes:5,similar:0,newView:5,curious:0},
    {content:'궁금한 글',stars:0,likes:2,similar:0,newView:0,curious:2}
  ]};});
  await module.openRankings({classId:'c',lessonId:'l',stageCode:'H'},document.getElementById('responses'));
  assert.equal(calls.length,1);assert.equal(calls[0].view,'h_rankings');assert.equal(timers.size,0);
  assert.match(document.querySelector('.live-ranking-results article').textContent,/별표 많은 글/);
  assert.equal(document.querySelector('img'),null);
  document.querySelector('[data-sort="newView"]').click();
  assert.match(document.querySelector('.live-ranking-results article').textContent,/새로운 관점 많은 글/);
  document.querySelector('[data-sort="similar"]').click();
  assert.match(document.querySelector('.live-ranking-results article').textContent,/별표 많은 글/);
  document.querySelector('[data-sort="curious"]').click();
  assert.match(document.querySelector('.live-ranking-results article').textContent,/궁금한 글/);
  assert.match(document.querySelector('.live-ranking-results article').textContent,/우리 반 함께 읽고 싶어요/);
  assert.equal(calls.length,1);
  document.querySelector('[data-query]').click();
  await Promise.resolve();
  assert.equal(calls.length,2);assert.equal(timers.size,0);
  module.close();
});

test('I chat loads on demand and switching back to submission reuses fetched data',async()=>{
  const calls=[];
  const {module,document,timers}=fixture(async(name,args)=>{
    calls.push(args);
    if(args.detail==='chat')return {turns:[{question:'<img src=x> 질문',answer:'AI 답변',status:'succeeded'}]};
    return args.studentNumber?{response:null}:{students};
  });
  await module.open({classId:'c',lessonId:'l',stageCode:'I'},document.getElementById('responses'));
  await module.selectStudent('30101');
  assert.equal(calls.length,2);
  await module.showChat();
  assert.equal(calls.length,3);assert.equal(calls[2].studentNumber,'30101');
  assert.match(document.querySelector('.live-response-detail').textContent,/AI 답변/);
  assert.equal(document.querySelector('img'),null);
  module.showSubmission();
  assert.match(document.querySelector('.live-response-detail').textContent,/아직 제출하지 않았습니다/);
  await module.showChat();assert.equal(calls.length,3);
  await module.showChat(true);assert.equal(calls.length,4);assert.equal(timers.size,0);
});

test('late AI history cannot appear under another student and empty history stays distinct from no submission',async()=>{
  let resolve;
  const {module,document}=fixture(async(name,args)=>{
    if(args.detail==='chat'&&args.studentNumber==='30101')return new Promise(r=>resolve=r);
    if(args.detail==='chat')return {turns:[]};
    return args.studentNumber?{response:null}:{students};
  });
  await module.open({classId:'c',lessonId:'l',stageCode:'I'},document.getElementById('responses'));
  await module.selectStudent('30101');const old=module.showChat();
  await module.selectStudent('30102');await module.showChat();
  resolve({turns:[{question:'첫 학생 질문',answer:'첫 학생 답변'}]});await old;
  assert.match(document.querySelector('.live-response-detail').textContent,/아직 AI와 나눈 대화가 없습니다/);
  assert.doesNotMatch(document.querySelector('.live-response-detail').textContent,/첫 학생/);
  document.querySelector('[data-detail="submission"]').click();
  assert.match(document.querySelector('.live-response-detail').textContent,/아직 제출하지 않았습니다/);
});

test('N rankings query once, sort locally and refresh only on an explicit click',async()=>{
  const calls=[];
  const {module,document,timers}=fixture(async(name,args)=>{calls.push(args);return {rankings:[
    {content:'별표 많은 글 <img src=x>',stars:3,likes:1,similar:1,newView:0,curious:0},
    {content:'새로운 관점 많은 글',stars:1,likes:5,similar:0,newView:5,curious:0},
    {content:'궁금한 글',stars:0,likes:2,similar:0,newView:0,curious:2}
  ]};});
  await module.openRankings({classId:'c',lessonId:'l',stageCode:'N'},document.getElementById('responses'));
  assert.equal(calls.length,1);assert.equal(calls[0].view,'n_rankings');assert.equal(timers.size,0);
  assert.match(document.querySelector('.live-ranking-results article').textContent,/별표 많은 글/);
  assert.equal(document.querySelector('img'),null);
  document.querySelector('[data-sort="newView"]').click();
  assert.match(document.querySelector('.live-ranking-results article').textContent,/새로운 관점 많은 글/);
  document.querySelector('[data-sort="similar"]').click();
  assert.match(document.querySelector('.live-ranking-results article').textContent,/별표 많은 글/);
  document.querySelector('[data-sort="curious"]').click();
  assert.match(document.querySelector('.live-ranking-results article').textContent,/궁금한 글/);
  assert.match(document.querySelector('.live-ranking-results article').textContent,/우리 반 함께 읽고 싶어요/);
  assert.equal(calls.length,1);
  document.querySelector('[data-query]').click();
  await Promise.resolve();
  assert.equal(calls.length,2);assert.equal(timers.size,0);
  module.close();
});

test('N rankings pair review answers with original prompts and safely preserve legacy content',async()=>{
 const {module,document}=fixture(async()=>({rankings:[
  {content:'raw',stars:2,likes:0,review:{target:'검토 대상',evidence:'확인한 자료 <img src=x>',sourceUrl:'https://example.org',judgment:'판단 내용'}},
  {content:'예전 내용',stars:1,likes:0}
 ]}));
 await module.openRankings({classId:'c',lessonId:'l',stageCode:'N'},document.getElementById('responses'));
 const cards=document.querySelectorAll('.live-ranking-results article');
 assert.match(cards[0].textContent,/다시 살펴보고 싶은 내 생각.*검토 대상/s);
 assert.match(cards[0].textContent,/다른 자료와 비교해 보니 어땠나요.*확인한 자료/s);
 assert.match(cards[0].textContent,/확인한 뒤에도 내 생각은 같은가요.*판단 내용/s);
 assert.match(cards[0].textContent,/자료 출처 링크 주소.*https:\/\/example.org/s);
 assert.equal(document.querySelector('img'),null);
 assert.match(cards[1].textContent,/예전 내용/);
});

test('ranking cards show escaped author names and an explicit missing-name fallback',async()=>{
 const {module,document}=fixture(async()=>({rankings:[{content:'글',stars:2,likes:0,studentName:'김학생 <img src=x>'},{content:'옛 글',stars:1,likes:0}]}));
 await module.openRankings({classId:'c',lessonId:'l',stageCode:'H'},document.getElementById('responses'));
 assert.match(document.querySelector('.live-ranking-results').textContent,/작성 학생: 김학생/);
 assert.match(document.querySelector('.live-ranking-results').textContent,/이름 확인 불가/);
 assert.equal(document.querySelector('img'),null);
});
