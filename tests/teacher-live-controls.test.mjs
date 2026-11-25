import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { parseHTML } from 'linkedom';

test('class plan restores and saves the optional N peer reading setting',async()=>{
  const {document}=parseHTML('<main id="plan"></main>');const calls=[];
  const context={document,window:{SupabaseService:{async invokeAccountFunction(name,args){calls.push(args);}}}};
  vm.createContext(context);vm.runInContext(fs.readFileSync(new URL('../js/modules/teacherLive.js',import.meta.url),'utf8'),context);
  const live=context.window.TeacherLiveModule;
  document.getElementById('plan').innerHTML=live.planCard('c',{id:'l',think_stages:['T','N']},{enabled:true,planned_stages:['T','N'],peer_review_enabled:false},false);
  const checkbox=document.querySelector('[data-plan-peer-review]');
  assert.equal(checkbox.hasAttribute('checked'),false);
  checkbox.checked=false;
  assert.equal(document.querySelector('button'),null);
  assert.match(document.querySelector('article').getAttribute('onchange'),/savePlan/);
  await live.savePlan('c','l',checkbox);
  assert.equal(calls[0].payload.peerReviewEnabled,false);
  assert.equal(calls[0].classId,'c');assert.equal(calls[0].lessonId,'l');
  document.getElementById('plan').innerHTML=live.planCard('c',{id:'l',think_stages:['N']},{peer_review_enabled:true},true);
  assert.equal(document.querySelector('[data-plan-peer-review]').hasAttribute('checked'),true);
  assert.equal(document.querySelector('[data-plan-peer-review]').disabled,true);
});

test('plan autosave serializes requests and coalesces rapid changes to the latest choice',async()=>{
  const {document}=parseHTML('<main id="plan"></main>');const calls=[];let resolve;
  const context={document,window:{SupabaseService:{async invokeAccountFunction(name,args){calls.push(args);if(calls.length===1)await new Promise(r=>resolve=r);}}}};
  vm.createContext(context);vm.runInContext(fs.readFileSync(new URL('../js/modules/teacherLive.js',import.meta.url),'utf8'),context);
  const live=context.window.TeacherLiveModule;
  document.getElementById('plan').innerHTML=live.planCard('c',{id:'l',think_stages:['N']},{enabled:true,planned_stages:['N']},false);
  document.querySelector('[data-plan-enabled]').checked=true;document.querySelector('[data-plan-stage]').checked=true;
  const option=document.querySelector('[data-plan-peer-review]');option.checked=false;
  const first=live.savePlan('c','l',option);
  option.checked=true;const second=live.savePlan('c','l',option);
  option.checked=false;const third=live.savePlan('c','l',option);
  assert.equal(calls.length,1);resolve();await Promise.all([first,second,third]);
  assert.equal(calls.length,2);assert.equal(calls[1].payload.peerReviewEnabled,false);
  assert.match(document.querySelector('[role="status"]').textContent,/자동 저장되었습니다/);
  const stage=document.querySelector('[data-plan-stage]');stage.checked=false;
  await live.savePlan('c','l',stage);assert.equal(stage.checked,true);assert.equal(calls.length,2);
});

test('failed autosave reports failure and offers an explicit retry',async()=>{
  const {document}=parseHTML('<main id="plan"></main>');let fail=true,calls=0;
  const context={document,window:{SupabaseService:{async invokeAccountFunction(){calls++;if(fail)throw Error('연결 실패');}}}};
  vm.createContext(context);vm.runInContext(fs.readFileSync(new URL('../js/modules/teacherLive.js',import.meta.url),'utf8'),context);
  const live=context.window.TeacherLiveModule;
  document.getElementById('plan').innerHTML=live.planCard('c',{id:'l',think_stages:['N']},{},false);
  const option=document.querySelector('[data-plan-peer-review]');option.checked=false;
  await live.savePlan('c','l',option);
  assert.match(document.querySelector('[role="status"]').textContent,/저장하지 못했습니다/);
  assert.equal(calls,1);fail=false;
  await live.savePlan('c','l',document.querySelector('button'));
  assert.equal(calls,2);assert.match(document.querySelector('[role="status"]').textContent,/자동 저장되었습니다/);
});

test('live controls order open stages as THINK and toggle admission per selected stage', async () => {
  const { document } = parseHTML('<main id="teacherAppSection"><div id="panelTeacherLive"></div></main>');
  const calls = [];
  const context = { document, window: {
    TeacherLiveResponses: { close() {}, openRankings() {} },
    ThinkWorkflow: { renderTeacherPreview() {} },
    SupabaseService: { async invokeAccountFunction(name, args) { calls.push(args); } }
  } };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(new URL('../js/modules/teacherLive.js', import.meta.url), 'utf8'), context);
  const live = context.window.TeacherLiveModule;
  Object.assign(live, {
    classId: 'class', stage: 'T',
    classroom: { grade_number: 3, class_number: 1, subject_name: '과학' },
    lesson: { id: 'lesson', plan: { planned_stages: ['T', 'H', 'I', 'N', 'K'] } },
    access: ['K', 'I', 'T', 'N', 'H'].map(stage_code => ({ lesson_plan_id: 'lesson', stage_code, access_mode: 'writable' }))
  });
  live.render();
  assert.match(document.querySelector('[role="status"]').textContent, /열린 단계: T, H, I, N, K$/);
  live.loadClass = async () => ({ lessons:[live.lesson], access: live.access.map(a => a.stage_code === live.stage
    ? { ...a, access_mode: calls.at(-1).operation === 'stage' ? 'writable' : 'hidden' } : a) });
  for (const stage of live.lesson.plan.planned_stages) {
    live.preview(stage);
    const close = document.querySelector('[onclick="TeacherLiveModule.closeStage(this)"]');
    assert.equal(close.textContent, `${stage} 단계 종료하기`);
    await live.closeStage(close);
    assert.equal(calls.at(-1).operation, 'close_stage');
    assert.equal(calls.at(-1).payload.stage, stage);
    const open = document.querySelector('[onclick="TeacherLiveModule.openStage(this)"]');
    assert.equal(open.textContent, `${stage} 단계 시작`);
    await live.openStage(open);
    assert.match(document.querySelector('[role="status"]').textContent, /열린 단계: T, H, I, N, K$/);
  }
});

test('student status replaces only the activity pane and follows the selected stage',async()=>{
  const {document}=parseHTML('<main id="teacherAppSection"><div id="panelTeacherLive"></div></main>');
  const opened=[];let closed=0;
  const context={document,window:{ThinkWorkflow:{renderTeacherPreview(){}},TeacherLiveResponses:{
    close(){closed++;},async open(context){opened.push(context);}
  }}};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(new URL('../js/modules/teacherLive.js',import.meta.url),'utf8'),context);
  const live=context.window.TeacherLiveModule;
  Object.assign(live,{classId:'c',stage:'T',access:[],classroom:{},lesson:{id:'l',core_question:'핵심 질문',plan:{planned_stages:['T','N']}}});
  live.render();
  await live.toggleResponses();
  assert.equal(document.getElementById('teacherLiveActivity').hidden,true);
  assert.equal(document.getElementById('teacherLiveResponses').hidden,false);
  assert.equal(document.querySelector('.step-main-title').textContent,'핵심 질문');
  assert.equal(document.querySelectorAll('.think-step-item').length,2);
  live.preview('N');
  assert.equal(opened.at(-1).stageCode,'N');
  live.toggleResponses();
  assert.equal(document.getElementById('teacherLiveActivity').hidden,false);
  assert.equal(document.getElementById('teacherLiveResponses').hidden,true);
  assert.equal(document.getElementById('teacherLiveResponseToggle').textContent,'학생 작성 현황');
  assert.ok(closed>=3);
  const previous=opened.length;
  context.window.TeacherLiveResponses.openRankings=async(ctx)=>opened.push(ctx);
  live.preview('H');
  assert.equal(opened.length,previous+1);
  assert.equal(document.getElementById('teacherLiveResponseToggle'),null);
  assert.equal(document.getElementById('teacherLiveResponses').hidden,false);
  assert.equal(opened.at(-1).stageCode,'H');
  live.render();
  assert.equal(opened.length,previous+1);
  live.preview('H');
  assert.equal(opened.length,previous+1);
  live.preview('T');live.preview('H');
  assert.equal(opened.length,previous+2);
});

test('live class cards sort numerically by grade and class while keeping active status',async()=>{
 const {document}=parseHTML('<main id="teacherAppSection"><div id="panelTeacherLive"></div></main>');
 const rows=[{id:'a',grade_number:3,class_number:10,subject_name:'과학'},{id:'b',grade_number:3,class_number:6,subject_name:'과학',active_lesson_plan_id:'lesson'},{id:'c',grade_number:2,class_number:9,subject_name:'<과학>'}];
 let calls=0;
 const query={select(){return this;},eq(){return this;},async order(){calls++;return {data:rows,error:null};}};
 const context={document,window:{SupabaseService:{async getUserSession(){return {user:{id:'teacher'}};},getClient(){return {from:()=>query};}}}};
 vm.createContext(context);vm.runInContext(fs.readFileSync(new URL('../js/modules/teacherLive.js',import.meta.url),'utf8'),context);
 await context.window.TeacherLiveModule.showClasses();
 const cards=[...document.querySelectorAll('.live-class-card')];
 assert.deepEqual(cards.map(c=>c.querySelector('.live-class-name').textContent),['9반','6반','10반']);
 assert.match(cards[0].textContent,/2학년/);
 assert.equal(cards[1].querySelector('.live-class-status').textContent,'진행 중');
 assert.match(cards[0].textContent,/<과학>/);assert.equal(cards[0].querySelector('과학'),null);
 assert.equal(calls,1);
});

test('K teacher can preview submissions before releasing them and stop sharing',async()=>{
  const {document}=parseHTML('<main id="panelTeacherLive"></main>');
  const calls=[];
  const context={document,window:{ThinkWorkflow:{renderTeacherPreview(){}},SupabaseService:{
    async invokeAccountFunction(name,args){calls.push(args.operation);if(args.operation==='list_final_cards')return [{studentName:'김학생',text:'제출한 글 <img src=x>',similar:2,curious:0,newView:1,stars:3}];}
  }}};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(new URL('../js/modules/teacherLive.js',import.meta.url),'utf8'),context);
  const live=context.window.TeacherLiveModule;
  Object.assign(live,{classId:'c',stage:'K',classroom:{},access:[{lesson_plan_id:'l',stage_code:'K',access_mode:'writable'}],
    lesson:{id:'l',plan:{planned_stages:['K'],final_sharing_enabled:true}}});
  live.render();
  await live.listFinals(document.querySelector('[onclick*="listFinals"]'));
  assert.match(document.querySelector('[data-final-posts]').textContent,/제출한 글/);
  assert.match(document.querySelector('[data-final-posts]').textContent,/김학생/);
  assert.match(document.querySelector('[data-final-posts]').textContent,/함께 읽고 싶어요 3명/);
  assert.equal(document.querySelector('[data-final-posts] img'),null);
  assert.deepEqual(calls,['list_final_cards']);
  const toggle=()=>document.querySelector('[onclick*="releaseFinals"]');
  assert.equal(toggle().textContent,'학생에게 공개');
  await live.releaseFinals(toggle(),true);
  assert.equal(toggle().textContent,'공개 중지');
  await live.releaseFinals(toggle(),false);
  assert.equal(toggle().textContent,'학생에게 공개');
  assert.deepEqual(calls,['list_final_cards','release_finals','hide_finals']);
});
