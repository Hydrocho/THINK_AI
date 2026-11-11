import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { webcrypto } from 'node:crypto';
import { parseHTML } from 'linkedom';

function fixture() {
  const {document}=parseHTML('<html><body>'+['studentLobbySection','studentAppSection','currentLessonLabel','currentProjectTitle','stepMainTitle','stepContentContainer'].map(id=>`<div id="${id}"></div>`).join('')+'</body></html>');
  const data={records:[],peers:[],turns:[],access:{T:'writable',H:'writable',I:'writable',N:'writable',K:'writable'},remaining:12,active:true};
  const requests=[],alerts=[],polls=[];const store=new Map();let intercept=null;
  const service={async invokeAccountFunction(name,b) {
    requests.push(structuredClone(b));
    if(intercept)await intercept(b);
    if(b.action==='snapshot')return structuredClone(data);
    if(b.action==='open'){
      let row=data.records.find(r=>r.stage===b.stage);
      if(!row){row={stage:b.stage,content:'',metadata:{},revision:0,lease:'lease-'+b.stage};data.records.push(row);}
      return structuredClone(row);
    }
    if(b.action==='save'){
      const row=data.records.find(r=>r.stage===b.stage);
      if(row.last_request===b.payload.requestId)return structuredClone(row);
      if(b.payload.revision!==row.revision)throw new Error('revision mismatch');
      Object.assign(row,{content:b.payload.content,metadata:b.payload.metadata,revision:row.revision+1,last_request:b.payload.requestId,
        final_saved:!!b.payload.final,submitted_at:b.payload.submit?'submitted':null});
      return structuredClone(row);
    }
    throw new Error('unexpected '+b.action);
  }};
  const state={studentData:{studentNumber:'30101',name:'테스트'},subjectClasses:[
    {classId:'class1',activeLesson:{id:'lesson1',number:1,coreQuestion:'첫 질문',thinkStages:['T','H','I','N','K']}},
    {classId:'class2',activeLesson:{id:'lesson2',number:2,coreQuestion:'둘째 질문',thinkStages:['T','H','I','N','K']}}
  ]};
  const window={AppState:state,App:{updateStepNav(){}},SupabaseService:service,StudentLobbyModule:{exitToLobby(){},renderLobby(){}},AuthModule:{logout(){}},addEventListener(){}};
  const context={window,document,crypto:webcrypto,structuredClone,alert:m=>alerts.push(m),setTimeout:()=>1,clearTimeout(){},
    setInterval:f=>(polls.push(f),polls.length),clearInterval(){},sessionStorage:{setItem:(k,v)=>store.set(k,v),getItem:k=>store.get(k),removeItem:k=>store.delete(k),get length(){return store.size},key:i=>[...store.keys()][i]}};
  vm.runInNewContext(fs.readFileSync(new URL('../js/modules/thinkWorkflow.js',import.meta.url),'utf8'),context);
  return {window,document,state,data,requests,alerts,polls,intercept:f=>intercept=f};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));

test('UI restores first writing, saves submission, and renders actual anonymous opinions safely',async()=>{
  const f=fixture();f.data.records.push({stage:'T',content:'저장된 첫 생각',metadata:{},revision:2,lease:'lease-T'});
  f.data.peers=[{id:'peer1',text:'<img src=x onerror=alert(1)> 친구 의견'}];
  await f.window.StudentLobbyModule.enterSubjectClass(f.state,'class1');
  assert.equal(f.document.getElementById('thinkText').value,'저장된 첫 생각');
  f.document.getElementById('thinkText').value='내 최종 첫 생각';f.window.ThinkWorkflow.input('내 최종 첫 생각');
  await f.window.ThinkWorkflow.submit();
  assert.equal(f.data.records.find(r=>r.stage==='T').content,'내 최종 첫 생각');
  assert.equal(f.data.records.find(r=>r.stage==='T').submitted_at,'submitted');
  assert.equal(f.state.currentStep,2);
  assert.equal(f.document.querySelectorAll('#stepContentContainer img').length,0);
  await f.window.ThinkWorkflow.choose('peer1');
  assert.equal(f.data.records.find(r=>r.stage==='H').metadata.selectedPeerOpinion,'peer1');
});

test('UI final flush contains last keystrokes even when earlier save crosses closure',async()=>{
  const f=fixture();await f.window.StudentLobbyModule.enterSubjectClass(f.state,'class1');
  f.document.getElementById('thinkText').value='먼저 쓴 글';f.window.ThinkWorkflow.input('먼저 쓴 글');
  let release;let blocked=false;f.intercept(b=>{if(b.action==='save'&&!blocked){blocked=true;return new Promise(r=>release=r);}});
  const saving=f.window.ThinkWorkflow.retrySave();await settle();
  f.document.getElementById('thinkText').value='마지막으로 쓴 글';f.window.ThinkWorkflow.input('마지막으로 쓴 글');
  f.data.access.T='read_only';await f.polls[0]();
  release();await saving;await settle();await settle();
  const saves=f.requests.filter(r=>r.action==='save');
  assert.equal(saves.at(-1).payload.content,'마지막으로 쓴 글');
  assert.equal(saves.at(-1).payload.final,true);
  assert.equal(f.data.records[0].content,'마지막으로 쓴 글');
});

test('UI retries the same request after unknown result and then persists latest buffer',async()=>{
  const f=fixture();await f.window.StudentLobbyModule.enterSubjectClass(f.state,'class1');
  f.document.getElementById('thinkText').value='글';f.window.ThinkWorkflow.input('글');
  let fail=true;f.intercept(b=>{if(b.action==='save'&&fail){fail=false;throw new Error('network');}});
  await f.window.ThinkWorkflow.retrySave();
  assert.match(f.document.getElementById('thinkSaveStatus').textContent,/저장 실패/);
  await f.window.ThinkWorkflow.retrySave();
  const saves=f.requests.filter(r=>r.action==='save');
  assert.equal(saves[0].payload.requestId,saves[1].payload.requestId);
  assert.equal(f.data.records[0].content,'글');
});

test('lesson navigation flushes old context and starts without old text',async()=>{
  const f=fixture();await f.window.StudentLobbyModule.enterSubjectClass(f.state,'class1');
  f.document.getElementById('thinkText').value='첫 차시 글';f.window.ThinkWorkflow.input('첫 차시 글');
  f.intercept(b=>{if(b.action==='snapshot'&&b.lessonId==='lesson2')f.data.records=[];});
  await f.window.StudentLobbyModule.enterSubjectClass(f.state,'class2');
  assert.equal(f.requests.find(r=>r.action==='save').lessonId,'lesson1');
  assert.equal(f.document.getElementById('thinkText').value,'');
  assert.equal(f.state.activeClassId,'class2');
});
