import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { webcrypto } from 'node:crypto';
import { parseHTML } from 'linkedom';

function fixture(timers={}) {
  const {document}=parseHTML('<html><body>'+fs.readFileSync(new URL('../views/studentThinkView.html',import.meta.url),'utf8').match(/<details id="thinkBackground"[\s\S]*?<\/details>/)[0]+['studentLobbySection','studentAppSection','currentLessonLabel','currentProjectTitle','stepMainTitle','stepContentContainer'].map(id=>`<div id="${id}"></div>`).join('')+'</body></html>');
  const data={records:[],peers:[],turns:[],access:{T:'writable',H:'writable',I:'writable',N:'writable',K:'writable'},remaining:12,active:true};
  const requests=[],alerts=[],polls=[];const store=new Map();let intercept=null;
  const service={async invokeAccountFunction(name,b) {
    requests.push(structuredClone(b));
    if(intercept)await intercept(b);
    if(b.action==='final_feedback')return {ok:true};
    if(b.action==='final_cards')return structuredClone(data.finalPosts||[]);
    if(b.action==='review_list')return structuredClone(data.reviewPosts||[]);
    if(b.action==='review_feedback')return {ok:true};
    if(b.action==='stage_snapshot')return structuredClone({finalSharingEnabled:data.finalSharingEnabled,peerReviewEnabled:data.peerReviewEnabled,access:data.access,...(['H','K'].includes(b.stage)?{peers:data.peers,firstCount:data.firstCount}:{}),...(b.stage==='I'?{turns:data.turns.filter(t=>!b.payload.turnId||t.id===b.payload.turnId),remaining:data.remaining}:{})});
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
      if(b.payload.changes){
        row.metadata.feedback={...row.metadata.feedback,...b.payload.changes};row.revision++;return structuredClone(row);
      }
      Object.assign(row,{content:b.payload.content,metadata:b.payload.metadata,revision:row.revision+1,last_request:b.payload.requestId,
        final_saved:data.access[b.stage]!=='writable' && !!b.payload.final,submitted_at:b.payload.submit?'submitted':null});
      return structuredClone(row);
    }
    throw new Error('unexpected '+b.action);
  }};
  const state={studentData:{studentNumber:'30101',name:'테스트'},subjectClasses:[
    {classId:'class1',activeLesson:{id:'lesson1',number:1,coreQuestion:'첫 질문',thinkStages:['T','H','I','N','K']}},
    {classId:'class2',activeLesson:{id:'lesson2',number:2,coreQuestion:'둘째 질문',thinkStages:['T','H','I','N','K']}}
  ]};
  const window={ModalService:{writingExit:async()=>'draft',confirm:async()=>true,alert:async({message})=>alerts.push(message)},AppState:state,App:{updateStepNav(){}},SupabaseService:service,StudentLobbyModule:{exitToLobby(){},renderLobby(){}},AuthModule:{logout(){}},addEventListener(){}};
  const context={window,document,URL,crypto:webcrypto,structuredClone,alert:m=>alerts.push(m),setTimeout:()=>1,clearTimeout(){},...timers,
    setInterval:f=>(polls.push(f),polls.length),clearInterval(){},sessionStorage:{setItem:(k,v)=>store.set(k,v),getItem:k=>store.get(k),removeItem:k=>store.delete(k),get length(){return store.size},key:i=>[...store.keys()][i]}};
  context.localStorage=context.sessionStorage;
  vm.runInNewContext(fs.readFileSync(new URL('../js/modules/thinkWorkflow.js',import.meta.url),'utf8'),context);
  return {window,document,state,data,requests,alerts,polls,store,intercept:f=>intercept=f};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));

test('K keeps one essay editor while switching earlier activity references',async()=>{
  const f=fixture(),flow=f.window.ThinkWorkflow;
  f.data.records.push({stage:'K',content:'기존 주장',metadata:{},revision:1,lease:'lease-K'});
  await f.window.StudentLobbyModule.enterSubjectClass(f.state,'class1');
  await flow.navigate(5);
  const editor=f.document.getElementById('thinkText');
  assert.equal(editor.value,'기존 주장');
  assert.equal(f.document.querySelector('label[for="thinkText"]').textContent,'나의 최종 글');
  editor.value='근거를 보완한 주장';flow.input(editor.value);
  const choices=[...f.document.querySelectorAll('[data-k-choice]')];
  assert.deepEqual(choices.map(button=>button.dataset.kChoice),['T','H','I','N']);
  assert.equal(choices[0].getAttribute('aria-pressed'),'true');
  flow.showKReference('N');
  assert.deepEqual(choices.map(button=>button.getAttribute('aria-pressed')),['false','false','false','true']);
  assert.equal(f.document.querySelector('[data-k-reference="N"]').hidden,false);
  assert.equal(f.document.querySelector('[data-k-reference="T"]').hidden,true);
  assert.equal(f.document.getElementById('thinkText'),editor);
  await flow.submit();
  assert.equal(f.data.records.find(r=>r.stage==='K').content,'근거를 보완한 주장');
});

test('writing stays local after the old autosave deadline',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const f=fixture({setTimeout,clearTimeout}),flow=f.window.ThinkWorkflow;
  await f.window.StudentLobbyModule.enterSubjectClass(f.state,'class1');
  const field=f.document.getElementById('thinkText');
  field.value='가';flow.input(field.value);
  t.mock.timers.tick(4000);
  field.value='가나';flow.input(field.value);
  assert.equal(JSON.parse([...f.store.values()][0]).content,'가나');
  t.mock.timers.tick(4999);await settle();
  assert.equal(f.requests.filter(r=>r.action==='save').length,0);
  t.mock.timers.tick(1);await settle();
  assert.equal(f.requests.filter(r=>r.action==='save').length,0);
});

test('background is available in all stages without entering the question or draft',async()=>{
  const f=fixture();
  f.state.subjectClasses[0].activeLesson.backgroundDescription='상황 설명\n<img src=x onerror=alert(1)>';
  await f.window.StudentLobbyModule.enterSubjectClass(f.state,'class1');
  assert.equal(f.document.getElementById('stepMainTitle').textContent,'첫 질문');
  assert.equal(f.document.getElementById('thinkBackground').hidden,false);
  const panel=f.document.getElementById('thinkBackground');
  assert.equal(panel.hasAttribute('open'),false);
  assert.ok(panel.querySelector('summary'));
  panel.setAttribute('open','');
  assert.equal(panel.querySelector('img'),null);
  assert.equal(panel.querySelector('p').textContent,f.state.subjectClasses[0].activeLesson.backgroundDescription);
  assert.equal(f.document.getElementById('thinkText').value,'');
  await f.window.ThinkWorkflow.navigate(5);
  assert.equal(f.document.getElementById('thinkBackground').hidden,false);
  await f.window.StudentLobbyModule.enterSubjectClass(f.state,'class2');
  assert.equal(f.document.getElementById('thinkBackground').hidden,true);
  assert.equal(panel.hasAttribute('open'),false);
  assert.equal(panel.querySelector('p').textContent,'');
});

test('four T fields preserve the retired answer through save, re-entry and K reference',async()=>{
  const f=fixture();
  f.data.records.push({stage:'T',content:'기존 글',metadata:{tAnswers:['','','이해에 도움이 된다','','']},revision:1,lease:'lease-T'});
  await f.window.StudentLobbyModule.enterSubjectClass(f.state,'class1');
  const fields=[...f.document.querySelectorAll('[data-t-answer]')];
  assert.equal(fields.length,4);
  assert.equal(f.document.querySelectorAll('details.think-t-example[open]').length,0);
  const answers=['조건부 허용','단어를 찾아봤다','이해에 도움이 된다','집중을 방해할까?','친구들에게 물어본다'];
  fields.forEach(field=>{const i=Number(field.dataset.tAnswer);field.value=answers[i];f.window.ThinkWorkflow.input(answers[i],i);});
  await f.window.ThinkWorkflow.submit();
  assert.deepEqual(f.data.records[0].metadata.tAnswers,answers);
  for(const answer of answers)assert.ok(f.data.records[0].content.includes(answer));
  await f.window.ThinkWorkflow.stop();
  f.data.access.T='read_only';
  await f.window.StudentLobbyModule.enterSubjectClass(f.state,'class1');
  const restored=[...f.document.querySelectorAll('[data-t-answer]')];
  assert.deepEqual(restored.map(field=>field.value),answers.filter((_,i)=>i!==2));
  assert.ok(restored.every(field=>field.disabled));
  await f.window.ThinkWorkflow.navigate(5);
  for(const answer of answers)assert.ok(f.document.querySelector('.think-writing-reference').textContent.includes(answer));
});

test('T captures unsignalled edits in all fields when closing',async()=>{
  const f=fixture();await f.window.StudentLobbyModule.enterSubjectClass(f.state,'class1');
  const fields=[...f.document.querySelectorAll('[data-t-answer]')];
  assert.equal(fields.length,4);
  fields[3].value='마지막 확인 방법';
  f.data.access.T='read_only';await f.window.ThinkWorkflow.navigate(1);
  assert.equal(f.polls.length,0);
  assert.equal(f.document.querySelector('[data-t-answer]').disabled,false);
  f.document.getElementById('thinkText').value='마감 후 완성한 생각';
  f.window.ThinkWorkflow.input('마감 후 완성한 생각');
  await f.window.ThinkWorkflow.submit();
  assert.equal(f.data.records[0].metadata.tAnswers[0],'마감 후 완성한 생각');
  await f.window.ThinkWorkflow.navigate(2);
  await f.window.ThinkWorkflow.navigate(1);
  assert.ok(f.document.querySelector('[data-t-answer]').disabled);
  assert.equal(f.data.records[0].metadata.tAnswers[4],'마지막 확인 방법');
  assert.ok(f.data.records[0].final_saved);
});

test('N shows both I reflections together, restores evidence and carries judgment into K',async()=>{
  const f=fixture(),flow=f.window.ThinkWorkflow;
  f.data.records.push({stage:'I',content:'내 생각',metadata:{hasReflection:true,reflectionAnswers:['질문','새로 배운 내용','내 생각']},revision:1});
  f.data.turns=[{id:'turn1',question:'내 질문',answer:'답변 원문',status:'succeeded'}];
  await f.window.StudentLobbyModule.enterSubjectClass(f.state,'class1');
  await flow.navigate(4);
  assert.equal(f.document.getElementById('reviewSource'),null);
  assert.equal(f.document.getElementById('reviewTarget'),null);
  assert.deepEqual([...f.document.querySelectorAll('.think-writing-reference dd')].map(el=>el.textContent),['새로 배운 내용','내 생각']);
  assert.equal(f.document.getElementById('reviewMethod'),null);
  assert.match(f.document.getElementById('reviewJudgmentHint').textContent,/내 생각에 연결하기/);
  assert.match(f.document.getElementById('reviewPrompt').textContent,/직접 자료를 찾아 확인/);
  f.document.getElementById('reviewEvidence').value='교과서와 비교했다';
  assert.ok(f.document.getElementById('thinkNTab1').disabled);
  f.data.reviewPosts=[{id:'peer-review',target:'친구가 확인한 내용',evidence:'확인 결과',judgment:'친구의 판단'}];
  const urlField=f.document.getElementById('reviewSourceUrl');
  const paste=text=>flow.pasteSourceUrl({clipboardData:{getData:()=>text},preventDefault(){},currentTarget:urlField});
  paste('교과서 15쪽');
  assert.equal(urlField.value,'');
  paste(' https://example.edu/reference ');
  assert.equal(urlField.value,'https://example.edu/reference');
  f.document.getElementById('reviewJudgment').value='일부만 받아들인다';
  await flow.submit();
  const review=f.data.records.find(r=>r.stage==='N').metadata.review;
  assert.equal(review.source.key,'reflectionPair');assert.match(review.target,/새로 배운 내용[\s\S]*내 생각/);assert.equal(review.method,'fact');
  assert.equal(review.evidence,'교과서와 비교했다');
  assert.equal(f.document.getElementById('thinkNTab0').getAttribute('aria-selected'),'true');
  await flow.reviewTab(true);
  assert.equal(f.document.getElementById('thinkNTab1').getAttribute('aria-selected'),'true');
  assert.match(f.document.getElementById('thinkNPanel').textContent,/친구가 확인한 내용/);
  await flow.reviewReaction(0,'newView');await flow.reviewReaction(0,'recommend');
  assert.equal(f.document.querySelector('[data-reaction="newView"]').getAttribute('aria-pressed'),'true');
  assert.equal(f.document.querySelector('.think-peer-recommend').getAttribute('aria-pressed'),'true');
  await flow.navigate(5);
  assert.match(f.document.getElementById('stepContentContainer').textContent,/일부만 받아들인다/);
  f.data.access.N='read_only';await flow.navigate(4);
  assert.ok(f.document.getElementById('reviewEvidence').disabled);
  assert.equal(f.document.getElementById('reviewSourceUrl').value,'https://example.edu/reference');
  assert.equal(f.document.getElementById('reviewJudgment').value,'일부만 받아들인다');
});

test('N reopens an old selected AI answer with the two I reflections and keeps the student review',async()=>{
  const f=fixture(),flow=f.window.ThinkWorkflow;
  const old={source:{key:'ai-1',text:'예전 AI 답변'},target:'예전 AI 답변',method:'fact',evidence:'기존 근거',judgment:'기존 판단'};
  f.data.records.push({stage:'I',content:'',metadata:{reflectionAnswers:['질문','배운 점','연결한 생각']},revision:1},
    {stage:'N',content:'기존 검토',metadata:{review:old},revision:1,lease:'lease-N'});
  await f.window.StudentLobbyModule.enterSubjectClass(f.state,'class1');
  await flow.navigate(4);
  assert.equal(f.document.getElementById('reviewTarget'),null);
  assert.equal(f.document.getElementById('reviewEvidence').value,'기존 근거');
  await flow.submit();
  const saved=f.data.records.find(r=>r.stage==='N').metadata.review;
  assert.equal(saved.source.connection,'연결한 생각');
  assert.equal(saved.previousTarget.text,'예전 AI 답변');
  assert.equal(saved.judgment,'기존 판단');
});

test('UI restores first writing, saves submission, and renders actual anonymous opinions safely',async()=>{
  const f=fixture();f.data.records.push({stage:'T',content:'저장된 첫 생각',metadata:{},revision:2,lease:'lease-T'});
  f.data.peers=[{id:'peer1',text:'<img src=x onerror=alert(1)> 친구 의견'}];
  await f.window.StudentLobbyModule.enterSubjectClass(f.state,'class1');
  assert.equal(f.document.getElementById('thinkText').value,'저장된 첫 생각');
  f.document.getElementById('thinkText').value='내 최종 첫 생각';f.window.ThinkWorkflow.input('내 최종 첫 생각');
  await f.window.ThinkWorkflow.submit();
  assert.equal(f.data.records.find(r=>r.stage==='T').content,'내 최종 첫 생각');
  assert.equal(f.data.records.find(r=>r.stage==='T').submitted_at,'submitted');
  assert.equal(f.state.currentStep,1);
  await f.window.ThinkWorkflow.navigate(2);
  assert.equal(f.document.querySelectorAll('#stepContentContainer img').length,0);
  await f.window.ThinkWorkflow.peerAction(0,'recommend');
  await f.window.ThinkWorkflow.peerAction(0,'newView');
  const h=f.data.records.find(r=>r.stage==='H');
  assert.deepEqual(h.metadata.feedback.peer1,{recommended:true,reaction:'newView'});
  await f.window.ThinkWorkflow.navigate(4);
  assert.equal(f.document.getElementById('thinkNPeer'),null);
  await f.window.ThinkWorkflow.navigate(2);
  assert.equal(f.document.querySelector('[data-reaction="newView"]').getAttribute('aria-pressed'),'true');
  await f.window.ThinkWorkflow.peerAction(0,'recommend');
  assert.equal(h.metadata.feedback.peer1.recommended,false);
});

test('leaving a draft waits for the student choice and a confirmed submission',async()=>{
  const f=fixture(),flow=f.window.ThinkWorkflow;
  await f.window.StudentLobbyModule.enterSubjectClass(f.state,'class1');
  f.document.getElementById('thinkText').value='작성 중인 글';
  f.window.ModalService.writingExit=async()=>'stay';
  await flow.navigate(2);
  assert.equal(f.state.currentStep,1);
  assert.equal(f.requests.filter(r=>r.action==='save').length,0);
  f.window.ModalService.writingExit=async()=>'submit';
  f.intercept(b=>{if(b.action==='save')throw Error('offline');});
  await flow.navigate(2);
  assert.equal(f.state.currentStep,1);
  f.intercept(null);
  await flow.navigate(2);
  assert.equal(f.state.currentStep,2);
  assert.equal(f.data.records[0].content,'작성 중인 글');
});

test('UI retries the same request after unknown result and then persists latest buffer',async()=>{
  const f=fixture();await f.window.StudentLobbyModule.enterSubjectClass(f.state,'class1');
  assert.doesNotMatch(f.document.getElementById('stepContentContainer').textContent,/다시 저장/);
  f.document.getElementById('thinkText').value='글';f.window.ThinkWorkflow.input('글');
  let fail=true;f.intercept(b=>{if(b.action==='save'&&fail){fail=false;throw new Error('network');}});
  await f.window.ThinkWorkflow.submit();
  assert.deepEqual(f.alerts,[]);
  assert.match(f.document.getElementById('thinkSaveStatus').textContent,/저장을 확인하지 못했습니다/);
  assert.equal(f.document.getElementById('thinkText').value,'글');
  await f.window.ThinkWorkflow.submit();
  assert.doesNotMatch(f.document.getElementById('stepContentContainer').textContent,/다시 저장/);
  const saves=f.requests.filter(r=>r.action==='save');
  assert.deepEqual(f.alerts,['작성한 내용을 저장했습니다.']);
  assert.equal(f.document.getElementById('thinkSaveStatus').textContent,'');
  assert.equal(f.state.currentStep,1);
  assert.equal(saves[0].payload.requestId,saves[1].payload.requestId);
  assert.equal(f.data.records[0].content,'글');
});

test('lesson navigation flushes old context and starts without old text',async()=>{
  const f=fixture();await f.window.StudentLobbyModule.enterSubjectClass(f.state,'class1');
  f.document.getElementById('thinkText').value='첫 차시 글';f.window.ThinkWorkflow.input('첫 차시 글');
  f.intercept(b=>{if(b.action==='snapshot'&&b.lessonId==='lesson2')f.data.records=[];});
  await f.window.StudentLobbyModule.enterSubjectClass(f.state,'class2');
  assert.equal(f.requests.filter(r=>r.action==='save').length,0);
  assert.equal(JSON.parse([...f.store.values()][0]).content,'첫 차시 글');
  assert.equal(f.document.getElementById('thinkText').value,'');
  assert.equal(f.state.activeClassId,'class2');
});

test('six peer responses autosave independently and allow every recommendation',async()=>{
  const f=fixture();
  f.data.peers=Array.from({length:6},(_,i)=>({id:'peer'+i,text:'친구 글 '+i}));
  await f.window.StudentLobbyModule.enterSubjectClass(f.state,'class1');
  const flow=f.window.ThinkWorkflow;
  await flow.navigate(2);
  await Promise.all(f.data.peers.map((_,i)=>flow.peerAction(i,'recommend')));
  assert.equal(f.document.getElementById('thinkPeerProgress'),null);
  assert.equal(f.document.querySelector('#stepContentContainer p strong').textContent,'친구 글마다 해당하는 하트를 모두 고르세요. 다시 누르면 선택이 해제됩니다. 그리고 우리 반과 함께 읽고 싶은 글에는 ☆를 눌러 주세요.');
  await Promise.all(f.data.peers.map((_,i)=>flow.peerAction(i,'curious')));
  await flow.peerAction(0,'similar');
  const feedback=f.data.records.find(r=>r.stage==='H').metadata.feedback;
  assert.equal(Object.values(feedback).filter(x=>x.recommended).length,6);
  assert.deepEqual(feedback.peer0.reactions,['curious','similar']);
  await flow.peerAction(0,'newView');
  assert.equal(f.document.querySelectorAll('#thinkPeer0 [data-reaction][aria-pressed="true"]').length,3);
  await flow.peerAction(0,'newView');
  assert.equal(f.document.querySelectorAll('[data-reaction][aria-pressed="true"]').length,7);
  await flow.peerAction(0,'similar');
  assert.deepEqual(f.data.records.find(r=>r.stage==='H').metadata.feedback.peer0,{recommended:true,reaction:'curious'});
  assert.equal(f.document.querySelectorAll('[data-reaction][aria-pressed="true"]').length,6);
  assert.doesNotMatch(f.document.getElementById('stepContentContainer').textContent,/제출하기|다시 저장/);
  await flow.stop();
  f.data.access.H='read_only';
  await f.window.StudentLobbyModule.enterSubjectClass(f.state,'class1');
  await flow.navigate(2);
  assert.equal(f.document.querySelectorAll('.think-peer-recommend[aria-pressed="true"][disabled]').length,6);
  assert.equal(f.document.querySelectorAll('#thinkPeer0 [data-reaction][aria-pressed="true"]').length,1);
});

test('H shows every peer in the assigned order without collapsing extra posts',async()=>{
  const f=fixture();
  f.data.firstCount=2;
  f.data.peers=['a','b','c'].map(id=>({id,text:'글 '+id}));
  await f.window.StudentLobbyModule.enterSubjectClass(f.state,'class1');
  const flow=f.window.ThinkWorkflow;
  await flow.navigate(2);
  const cards=[...f.document.querySelectorAll('#stepContentContainer article')];
  assert.equal(cards.length,3);
  assert.deepEqual(cards.map(card=>card.id),['thinkPeer0','thinkPeer1','thinkPeer2']);
  cards.forEach((card,i)=>{assert.match(card.textContent,new RegExp('글 '+['a','b','c'][i]));assert.equal(card.closest('details'),null);});
  const extra=cards[2];
  await flow.peerAction(2,'newView');
  assert.equal(f.data.records.find(r=>r.stage==='H').metadata.feedback.c.reaction,'newView');
  assert.equal(extra.querySelector('[data-reaction="newView"]').getAttribute('aria-pressed'),'true');
  await flow.peerAction(0,'similar');await flow.peerAction(1,'curious');
  assert.equal(f.document.querySelectorAll('[data-reaction][aria-pressed="true"]').length,3);
});

test('H pairs each structured response with its original T prompt and preserves free writing',async()=>{
  const f=fixture();
  f.data.peers=[{id:'a',text:'① 나의 생각\r\n찬성해요.\r\n\r\n⑤ 알아볼 방법\r\n친구에게 물어요.\n<질문>'},{id:'b',text:'첫 문단\n\n둘째 문단'}];
  await f.window.StudentLobbyModule.enterSubjectClass(f.state,'class1');
  await f.window.ThinkWorkflow.navigate(2);
  const prompts=[...f.document.querySelectorAll('#thinkPeer0 dt')].map(el=>el.textContent);
  assert.deepEqual(prompts,['질문이 문제에 대해 지금 어떻게 생각하나요?','질문그것을 알아내려면 무엇을 해 보면 좋을까요?']);
  assert.equal(f.document.querySelector('#thinkPeer0 dd:last-of-type').textContent,'찬성해요.');
  assert.equal([...f.document.querySelectorAll('#thinkPeer0 dd')][1].textContent,'친구에게 물어요.\n<질문>');
  assert.equal(f.document.querySelector('#thinkPeer1 p').textContent,'첫 문단\n\n둘째 문단');
});

test('I chat guide starts collapsed above the conversation and stays open when sending',async()=>{
  const f=fixture();
  await f.window.StudentLobbyModule.enterSubjectClass(f.state,'class1');
  await f.window.ThinkWorkflow.navigate(3);
  const guide=f.document.querySelector('details#thinkChatGuide');
  assert.equal(guide.hasAttribute('open'),false);
  assert.ok(guide.nextElementSibling.classList.contains('chat-messages'));
  assert.equal(guide.querySelectorAll('ol li').length,3);
  guide.open=true;
  guide.dispatchEvent(new f.document.defaultView.Event('toggle'));
  f.document.getElementById('thinkChatInput').value='다른 선택도 있을까?';
  await f.window.ThinkWorkflow.chat();
  assert.ok(f.document.getElementById('thinkChatGuide').hasAttribute('open'));
});

test('I chat sends on Enter but preserves Shift+Enter and IME composition',async()=>{
  const f=fixture();
  await f.window.StudentLobbyModule.enterSubjectClass(f.state,'class1');
  await f.window.ThinkWorkflow.navigate(3);
  const input=f.document.getElementById('thinkChatInput');
  input.value='첫 줄\n다음 줄';
  function enter(options){
    const e=new f.document.defaultView.Event('keydown',{cancelable:true});
    Object.assign(e,{key:'Enter'},options);
    input.dispatchEvent(e);
    return e.defaultPrevented;
  }
  for(const options of [{shiftKey:true},{isComposing:true},{keyCode:229}]) assert.ok(!enter(options));
  assert.equal(f.requests.filter(r=>r.action==='chat').length,0);
  assert.ok(enter({}));
  await settle();
  assert.deepEqual(f.requests.filter(r=>r.action==='chat').map(r=>r.payload.question),['첫 줄\n다음 줄']);
});

test('I imports the fourth T answer as an editable first question, then suggests following up',async()=>{
  const f=fixture();
  f.data.records.push({stage:'T',content:'첫 생각',metadata:{tAnswers:['첫 생각','','','추천을 거절할 수 있나요?','']},revision:1});
  await f.window.StudentLobbyModule.enterSubjectClass(f.state,'class1');
  await f.window.ThinkWorkflow.navigate(3);
  const input=f.document.getElementById('thinkChatInput');
  const button=f.document.getElementById('thinkImportQuestion');
  button.click();
  assert.equal(input.value,'추천을 거절할 수 있나요?');
  assert.equal(f.requests.filter(r=>r.action==='chat').length,0);
  input.value='다른 분야도 선택할 수 있나요?';
  input.dispatchEvent(new f.document.defaultView.Event('input'));
  assert.ok(button.disabled);
  f.data.turns=[{status:'succeeded',question:'질문',answer:'답변'}];
  await f.window.ThinkWorkflow.navigate(3);
  assert.equal(f.document.getElementById('thinkImportQuestion'),null);
  assert.match(f.document.getElementById('thinkChatInput').getAttribute('placeholder'),/내 생각과 다른 점/);
  assert.equal(f.document.getElementById('thinkChatInput').value,input.value);
});

test('I reflection survives returning to chat, submission, K reference and reopening',async()=>{
  const f=fixture(),flow=f.window.ThinkWorkflow;
  f.data.records.push({stage:'I',metadata:{},content:'AI 대화 1회',revision:1,lease:'lease-I'});
  f.data.turns=[{status:'succeeded',question:'내 질문',answer:'AI의 설명'}];
  await f.window.StudentLobbyModule.enterSubjectClass(f.state,'class1');
  await flow.navigate(3);
  assert.equal(f.document.getElementById('thinkITab0').getAttribute('aria-selected'),'true');
  const chat=f.document.getElementById('thinkChatInput');
  chat.value='추가 질문';chat.dispatchEvent(new f.document.defaultView.Event('input'));
  flow.reflectionView(true);
  assert.equal(f.document.getElementById('thinkITab1').getAttribute('aria-selected'),'true');
  assert.equal(f.document.getElementById('thinkChatInput'),null);
  const field=f.document.getElementById('thinkText');
  assert.equal(field.value,'');
  assert.match(f.document.querySelector('#thinkIPanel details').textContent,/AI의 설명/);
  assert.equal(f.document.querySelectorAll('[data-i-answer]').length,3);
  flow.importReflectionQuestion({value:'0'});
  assert.equal(field.value,'내 질문');
  const second=f.document.getElementById('thinkReflection1');
  second.value='내가 정리한 생각';flow.input(second.value,1);
  f.document.getElementById('thinkReflection2').value='이제 구분할 수 있다';
  flow.reflectionView(false);await settle();
  assert.equal(f.document.getElementById('thinkChatInput').value,'추가 질문');
  assert.deepEqual(JSON.parse([...f.store.values()].at(-1)).metadata.reflectionAnswers,['내 질문','내가 정리한 생각','이제 구분할 수 있다']);
  flow.reflectionView(true);
  await flow.submit();
  assert.ok(f.data.records.find(r=>r.stage==='I').submitted_at);
  await flow.navigate(5);
  assert.match(f.document.querySelector('#stepContentContainer details').textContent,/내가 정리한 생각/);
  await flow.stop();f.data.access.I='read_only';
  await f.window.StudentLobbyModule.enterSubjectClass(f.state,'class1');
  await flow.navigate(3);
  assert.equal(f.document.getElementById('thinkReflection1').value,'내가 정리한 생각');
  assert.ok(f.document.getElementById('thinkText').disabled);
});


test('writing stays local through navigation and reload until explicit submission',async()=>{
  const f=fixture(),flow=f.window.ThinkWorkflow;
  await f.window.StudentLobbyModule.enterSubjectClass(f.state,'class1');
  f.document.getElementById('thinkText').value='기기에 보관한 글';
  flow.input('기기에 보관한 글');
  await flow.navigate(3);
  assert.equal(f.requests.filter(r=>r.action==='save').length,0);
  await flow.stop();
  let prompted=0;
  f.window.ModalService.confirm=async()=>{prompted++;return true;};
  await f.window.StudentLobbyModule.enterSubjectClass(f.state,'class1');
  assert.equal(prompted,1);
  assert.equal(f.document.getElementById('thinkText').value,'기기에 보관한 글');
  assert.equal(f.requests.filter(r=>r.action==='save').length,0);
  await flow.submit();
  assert.equal(f.data.records.find(r=>r.stage==='T').content,'기기에 보관한 글');
  assert.equal(f.store.size,0);
});


test('teacher preview reuses all activity forms without requests or student state changes',()=>{
  const f=fixture(),before=structuredClone(f.state);
  for(const stage of ['T','H','I','N','K']) {
    const box=f.document.createElement('div');
    f.window.ThinkWorkflow.renderTeacherPreview({thinkStages:['T','H','I','N','K']},stage,box);
    assert.ok(box.textContent.length>10);
    for(const el of box.querySelectorAll('textarea,input,button,select')) {
      if(['I','N','K'].includes(stage) && el.hasAttribute('data-preview-view'))assert.equal(el.disabled,false);
      else assert.ok(el.disabled);
    }
    for(const el of box.querySelectorAll('*'))assert.ok([...el.attributes].every(a=>!a.name.startsWith('on')));
    if(stage==='T')assert.equal(box.querySelectorAll('textarea').length,4);
    if(stage==='N')assert.ok(box.querySelectorAll('textarea').length>=2);
  }
  assert.deepEqual(f.state,before);
  assert.equal(f.requests.length,0);
});

test('teacher I preview uses the shared tabs without saving or changing student state',()=>{
  const f=fixture(),before=structuredClone(f.state),box=f.document.createElement('div');
  f.document.body.appendChild(box);
  f.window.ThinkWorkflow.renderTeacherPreview({thinkStages:['T','H','I','N','K']},'I',box);
  assert.equal(box.querySelectorAll('[role="tablist"]').length,1);
  box.querySelectorAll('[role="tab"]')[1].click();
  assert.equal(box.querySelectorAll('[data-i-answer]').length,3);
  assert.equal(box.querySelectorAll('[role="tab"]')[1].getAttribute('aria-selected'),'true');
  const panel=box.querySelector('[role="tabpanel"]');
  assert.equal(box.querySelector('[aria-selected="true"]').getAttribute('aria-controls'),panel.id);
  for(const label of box.querySelectorAll('label[for]'))assert.ok(f.document.getElementById(label.getAttribute('for')));
  box.querySelectorAll('[role="tab"]')[0].click();
  assert.ok(box.querySelector('.chat-composer'));
  assert.equal(box.querySelector('.chat-composer button').disabled,true);
  assert.deepEqual(f.state,before);assert.equal(f.requests.length,0);
});

test('attempting an unopened stage keeps current writing and checks again on the next click',async()=>{
  const f=fixture();await f.window.StudentLobbyModule.enterSubjectClass(f.state,'class1');
  f.data.access.H='hidden';
  const input=f.document.getElementById('thinkText');input.value='작성 중인 답안';f.window.ThinkWorkflow.input(input.value);
  await f.window.ThinkWorkflow.navigate(2);
  assert.equal(f.document.getElementById('thinkText').value,'작성 중인 답안');
  assert.equal(f.state.currentStep,1);
  f.data.access.H='writable';await f.window.ThinkWorkflow.navigate(2);
  assert.equal(f.state.currentStep,2);
  assert.equal(f.polls.length,0);
});

test('disabled N peer reading hides tab and makes no peer request',async()=>{
 const f=fixture();f.data.peerReviewEnabled=false;
 await f.window.StudentLobbyModule.enterSubjectClass(f.state,'class1');
 await f.window.ThinkWorkflow.navigate(4);
 assert.equal(f.document.querySelector('#thinkNTab1'),null);
 assert.ok(f.document.querySelector('textarea'));
 await f.window.ThinkWorkflow.reviewTab(true);
 assert.equal(f.requests.some(r=>r.action==='review_list'),false);
});

test('teacher N review tab loads rankings on demand without student submission or writes',()=>{
 const f=fixture(),before=structuredClone(f.state),box=f.document.createElement('div');
 f.document.body.appendChild(box);let loads=0;
 f.window.ThinkWorkflow.renderTeacherPreview({thinkStages:['N']},'N',box,false,target=>{loads++;target.textContent='반응 통계';});
 assert.equal(loads,0);
 box.querySelectorAll('[role="tab"]')[1].click();
 assert.equal(loads,1);assert.match(box.textContent,/반응 통계/);
 assert.equal(box.querySelectorAll('[role="tab"]')[1].getAttribute('aria-selected'),'true');
 box.querySelectorAll('[role="tab"]')[1].click();assert.equal(loads,1);
 box.querySelectorAll('[role="tab"]')[0].click();assert.ok(box.querySelector('textarea'));
 assert.deepEqual(f.state,before);assert.equal(f.requests.length,0);
 f.window.ThinkWorkflow.renderTeacherPreview({thinkStages:['N'],peerReviewEnabled:false},'N',box,false,()=>{loads++;});
 assert.equal(box.querySelector('[role="tab"]'),null);assert.equal(loads,1);
});

test('K reading tab checks teacher release on every entry and preserves writing',async()=>{
  const f=fixture(),flow=f.window.ThinkWorkflow;
  await f.window.StudentLobbyModule.enterSubjectClass(f.state,'class1');
  await flow.navigate(5);
  assert.equal(f.document.querySelector('#thinkKTab1').textContent,'친구들의 최종 글 읽기');
  const editor=f.document.querySelector('#thinkText');editor.value='작성 중';
  f.intercept(b=>{if(b.action==='final_cards')throw Error('아직 공개 전');});
  await flow.finalTab(true);
  assert.equal(f.document.querySelector('#thinkKTab0').getAttribute('aria-selected'),'true');
  assert.match(f.document.querySelector('#thinkKReadStatus').textContent,/공개 전/);
  f.intercept(null);
  f.data.finalPosts=[{id:'peer-token',text:'친구의 최종 글 <img src=x>',reactions:[],recommended:false}];
  await flow.finalTab(true);
  const panel=f.document.querySelector('#thinkKPanel');
  assert.match(panel.textContent,/친구의 최종 글 <img src=x>/);
  assert.equal(panel.querySelector('img'),null);
  assert.equal(f.document.querySelector('#thinkText'),null);
  await flow.finalReaction(0,'similar');await flow.finalReaction(0,'curious');await flow.finalReaction(0,'recommend');
  assert.deepEqual(f.requests.at(-1).payload,{id:'peer-token',reactions:['similar','curious'],recommended:true});
  await flow.finalTab(false);
  assert.equal(f.document.querySelector('#thinkText').value,'작성 중');
});
