import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { parseHTML } from 'linkedom';

test('live controls order open stages as THINK and toggle admission per selected stage', async () => {
  const { document } = parseHTML('<main id="teacherAppSection"><div id="panelTeacherLive"></div></main>');
  const calls = [];
  const context = { document, window: {
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
  live.loadClass = async () => ({ access: live.access.map(a => a.stage_code === live.stage
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
  Object.assign(live,{classId:'c',stage:'T',access:[],classroom:{},lesson:{id:'l',core_question:'핵심 질문',plan:{planned_stages:['T','H']}}});
  live.render();
  await live.toggleResponses();
  assert.equal(document.getElementById('teacherLiveActivity').hidden,true);
  assert.equal(document.getElementById('teacherLiveResponses').hidden,false);
  assert.equal(document.querySelector('.step-main-title').textContent,'핵심 질문');
  assert.equal(document.querySelectorAll('.think-step-item').length,2);
  live.preview('H');
  assert.equal(opened.at(-1).stageCode,'H');
  live.toggleResponses();
  assert.equal(document.getElementById('teacherLiveActivity').hidden,false);
  assert.equal(document.getElementById('teacherLiveResponses').hidden,true);
  assert.equal(document.getElementById('teacherLiveResponseToggle').textContent,'학생 작성 현황');
  assert.ok(closed>=3);
});
