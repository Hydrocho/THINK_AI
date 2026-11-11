/* Persisted THINK workflow. All mutations are scoped to an immutable lesson
   context; a navigation cannot redirect an in-flight save to another lesson. */
(function () {
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const stages = ['T','H','I','N','K'];
  const names = {T:'나의 처음 생각',H:'친구와 생각 나누기',I:'인공지능과 생각 넓히기',N:'비판적으로 따져보기',K:'나의 최종 생각'};
  let current = null, entering = false;
  const api = (ctx, action, stage='T', payload={}) => window.SupabaseService.invokeAccountFunction('think-workflow', {
    action, classId:ctx.classId, lessonId:ctx.lesson.id, stage, payload
  });
  const key = (ctx,stage) => `think-draft:${ctx.student}:${ctx.classId}:${ctx.lesson.id}:${stage}`;
  const blank = stage => ({stage,content:'',metadata:stage==='N'?{criteria:'validity'}:{},revision:0,submitted_at:null});
  const record = (ctx,stage) => ctx.records[stage] ||= blank(stage);
  const payloadText = r => JSON.stringify([r.content,r.metadata]);
  function cache(ctx,stage) {
    try { sessionStorage.setItem(key(ctx,stage),JSON.stringify({content:record(ctx,stage).content,metadata:record(ctx,stage).metadata,revision:record(ctx,stage).revision})); } catch (_) {}
  }
  function status(ctx,stage,message) {
    ctx.status[stage]=message;
    if(current===ctx && ctx.stage===stage) { const el=document.getElementById('thinkSaveStatus'); if(el) el.textContent=message; }
  }
  function capture(ctx=current) {
    if(!ctx || current!==ctx) return;
    const field=document.getElementById('thinkText');
    if(field && !field.disabled) record(ctx,ctx.stage).content=field.value;
  }
  async function open(ctx,stage) {
    if(ctx.access[stage]!=='writable' || ctx.leases[stage]) return;
    const row=await api(ctx,'open',stage);
    // A server-issued lease means this student was admitted while writing was open.
    const local=record(ctx,stage);
    if(ctx.dirty[stage] && local.revision!==row.revision) throw new Error('다른 창의 기록이 변경되었습니다. 작성한 글을 복사한 뒤 다시 입장해 주세요.');
    if(!ctx.dirty[stage]) ctx.records[stage]=row;
    else local.revision=row.revision;
    if(stage==='N') record(ctx,stage).metadata.criteria ||= 'validity';
    ctx.leases[stage]=row.lease;
    ctx.saved[stage]=payloadText(row);
  }
  function save(ctx,stage,{submit=false,final=false}={}) {
    const work=async()=>{
      const row=record(ctx,stage);
      if(!ctx.leases[stage]) {
        if(ctx.dirty[stage]||submit) throw new Error('작성 권한을 확인하지 못했습니다. 글을 복사한 뒤 다시 입장해 주세요.');
        return;
      }
      if(!submit&&!final&&!ctx.retry[stage]&&ctx.saved[stage]===payloadText(row)) return;
      const request=ctx.retry[stage]||{requestId:crypto.randomUUID(),lease:ctx.leases[stage],revision:row.revision,
        content:row.content,metadata:structuredClone(row.metadata),submit,final};
      ctx.retry[stage]=request;
      status(ctx,stage,'저장 중…');
      let result;
      try { result=await api(ctx,'save',stage,request); }
      catch(error) { cache(ctx,stage); status(ctx,stage,`저장 실패: ${error.message} · 아래 다시 저장을 눌러 주세요.`); throw error; }
      ctx.retry[stage]=null;
      row.revision=result.revision; row.submitted_at=result.submitted_at;
      ctx.saved[stage]=JSON.stringify([request.content,request.metadata]);
      ctx.dirty[stage]=ctx.saved[stage]!==payloadText(row);
      if(ctx.dirty[stage]) cache(ctx,stage); else { try {sessionStorage.removeItem(key(ctx,stage));} catch(_){} }
      status(ctx,stage,result.final_saved?'마감되어 마지막 내용을 저장했습니다.':result.submitted_at?'제출 완료':'저장 완료');
      if(result.final_saved) { delete ctx.leases[stage]; delete ctx.closing[stage]; }
      // A retry may have acknowledged an earlier request. Save the latest buffer too.
      if(ctx.dirty[stage] || (submit&&!request.submit) || (final&&!request.final)) return work();
    };
    const queued=(ctx.queues[stage]||Promise.resolve()).catch(()=>{}).then(work);
    ctx.queues[stage]=queued;
    return queued;
  }
  async function flush(ctx) {
    if(!ctx) return;
    capture(ctx);
    await Promise.all(stages.filter(s=>ctx.leases[s]).map(s=>save(ctx,s,{final:ctx.closing[s]||false})));
  }
  async function refresh(ctx,initial=false) {
    if(ctx.refreshing) return;
    ctx.refreshing=true;
    try {
      const snapshot=await api(ctx,'snapshot');
      if(current!==ctx) return;
      capture(ctx);
      const previous=ctx.access;
      const next=Object.fromEntries(stages.map(s=>[s,snapshot.access[s]||'hidden']));
      const changed=JSON.stringify(previous)!==JSON.stringify(next);
      ctx.access=next;
      const peerChanged=JSON.stringify(ctx.peers)!==JSON.stringify(snapshot.peers);
      const chatChanged=JSON.stringify(ctx.turns)!==JSON.stringify(snapshot.turns);
      ctx.peers=snapshot.peers;ctx.turns=snapshot.turns;ctx.remaining=snapshot.remaining;
      if(initial) {
        for(const row of snapshot.records) {ctx.records[row.stage]=row;ctx.saved[row.stage]=payloadText(row);}
        for(const stage of stages) {
          let draft=null;try {draft=JSON.parse(sessionStorage.getItem(key(ctx,stage))||'null');}catch(_){}
          if(draft && draft.revision===record(ctx,stage).revision && JSON.stringify([draft.content,draft.metadata])!==payloadText(record(ctx,stage))) {
            record(ctx,stage).content=draft.content;record(ctx,stage).metadata=draft.metadata;ctx.dirty[stage]=true;
            status(ctx,stage,'이 창의 미저장 글을 복원했습니다. 다시 저장을 눌러 주세요.');
          } else if(draft && draft.revision!==record(ctx,stage).revision) ctx.recovery[stage]=draft.content;
        }
      }
      for(const stage of stages) {
        if(previous[stage]==='writable'&&next[stage]!=='writable'&&ctx.leases[stage]) {
          ctx.closing[stage]=true;
          save(ctx,stage,{final:true}).then(()=>{if(current===ctx)render();}).catch(()=>{if(current===ctx)render();});
        }
      }
      if(next[ctx.stage]==='writable'&&!ctx.leases[ctx.stage]&&!ctx.closing[ctx.stage]) await open(ctx,ctx.stage);
      if(initial||changed||peerChanged||(chatChanged&&ctx.stage==='I')) render();
      if(Date.now()-(ctx.autosaveAt||0)>15000) {
        ctx.autosaveAt=Date.now();
        for(const stage of stages) if(ctx.dirty[stage]&&ctx.leases[stage]&&next[stage]==='writable') save(ctx,stage).catch(()=>{});
      }
    } finally {ctx.refreshing=false;}
  }
  function render() {
    const ctx=current, box=document.getElementById('stepContentContainer');
    if(!ctx||!box) return;
    const s=ctx.stage,r=record(ctx,s),mode=ctx.access[s]||'hidden';
    const writable=mode==='writable'&&!!ctx.leases[s]&&!ctx.closing[s];
    const disabled=writable?'':'disabled';
    const state=window.AppState;
    state.currentStep=(ctx.lesson.thinkStages||stages).indexOf(s)+1;
    window.App.updateStepNav();
    document.querySelectorAll('.think-step-item[data-stage]').forEach(item => {
      item.classList.toggle('completed', !!ctx.records[item.dataset.stage]?.submitted_at);
    });
    let body='';
    const statusHtml=`<div role="status" id="thinkSaveStatus" style="margin:12px 0;white-space:pre-wrap">${escape(ctx.status[s]|| (r.submitted_at?'제출 완료':''))}</div>`;
    const retry=ctx.leases[s]?'<button class="btn btn-secondary" onclick="ThinkWorkflow.retrySave()">다시 저장</button>':'';
    if(mode==='hidden') body='<p>선생님이 아직 열지 않았거나 마감한 단계입니다.</p>';
    else if(['T','N','K'].includes(s)) {
      if(s==='N') {
        const selected=ctx.peers.find(p=>p.id===r.metadata.selectedPeerOpinion||p.id===record(ctx,'H').metadata.selectedPeerOpinion);
        body+=`<p>선택한 친구 의견: ${escape(selected?.text||'H 단계에서 의견을 선택해 주세요.')}</p><label>판단 기준 <select id="thinkCriteria" class="form-select" ${disabled} onchange="ThinkWorkflow.criteria(this.value)">${[['validity','근거의 타당성'],['fairness','공정성'],['feasibility','실현 가능성']].map(([v,n])=>`<option value="${v}" ${r.metadata.criteria===v?'selected':''}>${n}</option>`).join('')}</select></label><p>이 기준으로 판단한 이유를 작성하세요.</p>`;
      }
      if(s==='K') body+=`<div class="question-card"><strong>나의 처음 생각</strong><p style="white-space:pre-wrap">${escape(record(ctx,'T').content||'아직 작성한 첫 생각이 없습니다.')}</p></div><p>최종 주장과 근거, 처음 생각을 바꾸거나 유지한 이유를 작성하세요.</p>`;
      body+=`<textarea id="thinkText" class="form-textarea" rows="8" ${disabled} aria-label="${names[s]}" oninput="ThinkWorkflow.input(this.value)">${escape(r.content)}</textarea>`;
    } else if(s==='H') {
      body=`<p>같은 학급 친구의 제출 글을 익명으로 비교합니다. 현재 ${ctx.peers.length}개 의견이 배정되었습니다.</p>`;
      if(!ctx.peers.length) body+='<p>아직 배정된 의견이 없습니다. 선생님의 배정을 기다려 주세요.</p>';
      body+=ctx.peers.map((p,i)=>`<button class="option-card ${r.metadata.selectedPeerOpinion===p.id?'selected':''}" style="display:block;width:100%;text-align:left;margin:12px 0;white-space:pre-wrap" ${disabled} onclick="ThinkWorkflow.choose('${p.id}')"><strong>의견 ${i+1}</strong><br>${escape(p.text)}</button>`).join('');
    } else if(s==='I') {
      body=`<p>남은 질문: ${ctx.remaining}회 · 이름·전화번호 등 개인정보는 입력하지 마세요.</p><div class="chat-messages">${ctx.turns.map(t=>`<div class="chat-bubble user">${escape(t.question)}</div><div class="chat-bubble ai" style="white-space:pre-wrap">${escape(t.answer||t.error||'응답을 기다리는 중…')}</div>`).join('')}</div><div class="chat-composer"><textarea id="thinkChatInput" class="form-input" aria-label="AI에게 질문" ${disabled} ${ctx.chatBusy?'disabled':''}>${escape(ctx.chatDraft||'')}</textarea><button class="btn btn-primary" onclick="ThinkWorkflow.chat()" ${disabled} ${ctx.chatBusy||ctx.remaining<=0?'disabled':''}>${ctx.chatBusy?'응답 중…':'전송'}</button></div>`;
    }
    const recovery=ctx.recovery[s]?`<details><summary>다른 저장본과 겹친 미저장 글 보기</summary><pre style="white-space:pre-wrap">${escape(ctx.recovery[s])}</pre></details>`:'';
    box.innerHTML=`<div class="question-card"><strong>[${s}] ${names[s]}</strong><p style="white-space:pre-wrap">${escape(ctx.lesson.coreQuestion||ctx.lesson.core_question||ctx.lesson.question)}</p></div>${mode==='read_only'?'<p>읽기 전용 단계입니다.</p>':''}${body}${statusHtml}${recovery}<div style="display:flex;gap:12px;margin-top:16px">${retry}${mode!=='hidden'?`<button class="btn btn-primary" onclick="ThinkWorkflow.submit()" ${disabled} ${ctx.chatBusy?'disabled':''}>${s==='K'?'최종 제출':'제출하고 다음 단계'}</button>`:''}</div>`;
    if(s==='I') document.getElementById('thinkChatInput')?.addEventListener('input',e=>{ctx.chatDraft=e.target.value;});
  }
  async function enter(state,classId) {
    if(entering) return;entering=true;
    try {
      await flush(current);
      const old=current;
      const subject=state.subjectClasses?.find(c=>c.classId===classId);
      if(!subject?.activeLesson) return;
      if(old) {clearInterval(old.poll);clearTimeout(old.timer);}
      const ctx={classId,lesson:subject.activeLesson,student:state.studentData.studentNumber,stage:(subject.activeLesson.thinkStages||stages)[0],
        access:{},records:{},leases:{},saved:{},dirty:{},retry:{},queues:{},status:{},closing:{},recovery:{},peers:[],turns:[],remaining:0};
      current=ctx;
      state.activeClassId=classId;state.activeLessonPlans=[ctx.lesson];state.currentLessonIndex=0;state.currentStep=1;
      state.peerOpinions=[];
      state.studentData={studentNumber:ctx.student,name:state.studentData.name,initialThought:'',finalThought:'',peerRationale:'',peerCriteria:'validity',chatMessages:[],remainingQuestions:0};
      document.getElementById('studentLobbySection').style.display='none';document.getElementById('studentAppSection').style.display='grid';
      document.getElementById('currentLessonLabel').textContent=`${ctx.lesson.number}차시 활동 진행 중`;
      document.getElementById('currentProjectTitle').textContent=ctx.lesson.projectTitle||'';
      document.getElementById('stepMainTitle').textContent=ctx.lesson.coreQuestion||'';
      document.getElementById('stepContentContainer').textContent='수업 기록을 불러오는 중…';
      await refresh(ctx,true);
      ctx.poll=setInterval(()=>refresh(ctx).catch(e=>status(ctx,ctx.stage,`연결 확인 실패: ${e.message}`)),4000);
    } catch(error) {alert(error.message);}
    finally {entering=false;}
  }
  const flow=window.ThinkWorkflow={
    input(value) {if(!current)return;const ctx=current,s=ctx.stage;record(ctx,s).content=value;ctx.dirty[s]=true;cache(ctx,s);status(ctx,s,'저장 대기 중…');clearTimeout(ctx.timer);ctx.timer=setTimeout(()=>save(ctx,s).catch(()=>{}),1200);},
    criteria(value) {const ctx=current;record(ctx,'N').metadata={...record(ctx,'N').metadata,criteria:value,selectedPeerOpinion:record(ctx,'H').metadata.selectedPeerOpinion||null};ctx.dirty.N=true;cache(ctx,'N');save(ctx,'N').catch(()=>{});},
    async choose(id) {const ctx=current;record(ctx,'H').metadata={selectedPeerOpinion:id};record(ctx,'H').content=ctx.peers.find(p=>p.id===id)?.text||'';ctx.dirty.H=true;cache(ctx,'H');render();await save(ctx,'H').catch(()=>{});},
    async retrySave() {const ctx=current;capture(ctx);await save(ctx,ctx.stage,{final:!!ctx.closing[ctx.stage]}).then(render).catch(()=>{});},
    async submit() {
      const ctx=current,s=ctx.stage;capture(ctx);
      if(['T','N','K'].includes(s)&&!record(ctx,s).content.trim()) {alert('생각과 이유를 작성해 주세요.');return;}
      if(s==='H'&&!record(ctx,s).metadata.selectedPeerOpinion){alert('친구 의견을 선택해 주세요.');return;}
      if(s==='N')record(ctx,s).metadata={...record(ctx,s).metadata,selectedPeerOpinion:record(ctx,'H').metadata.selectedPeerOpinion||null};
      if(s==='I')record(ctx,s).content=`AI 대화 ${ctx.turns.filter(t=>t.status==='succeeded').length}회`;
      if(ctx.submitting)return;ctx.submitting=true;
      try {await save(ctx,s,{submit:true});if(current!==ctx)return;if(s==='K')render();else await flow.navigate(window.AppState.currentStep+1);}catch(_){} finally {ctx.submitting=false;}
    },
    async navigate(step) {const ctx=current;if(!ctx)return;try {await flush(ctx);const next=(ctx.lesson.thinkStages||stages)[step-1];if(!next)return;ctx.stage=next;await refresh(ctx);await open(ctx,next);render();}catch(e){status(ctx,ctx.stage,e.message);render();}},
    async chat() {
      const ctx=current;if(!ctx||ctx.chatBusy)return;
      const question=document.getElementById('thinkChatInput')?.value.trim();if(!question)return;
      ctx.chatBusy=true;ctx.chatDraft=question;render();
      const requestId=ctx.chatRequest?.question===question?ctx.chatRequest.id:crypto.randomUUID();ctx.chatRequest={id:requestId,question};
      try {const turn=await api(ctx,'chat','I',{requestId,question});if(turn.status==='succeeded'){ctx.chatDraft='';ctx.chatRequest=null;}else status(ctx,'I',turn.error||'응답을 확인하고 있습니다…');}
      catch(e){status(ctx,'I',`전송 결과를 확인하지 못했습니다: ${e.message}. 같은 질문을 다시 전송하면 결과를 확인합니다.`);}
      finally{ctx.chatBusy=false;if(current===ctx){await refresh(ctx).catch(()=>{});render();}}
    },
    async assign(classId,lessonId) {try {await api({classId,lesson:{id:lessonId}},'assign');alert('제출된 첫 생각으로 의견을 배정했습니다. 기존 배정은 유지됩니다.');}catch(e){alert(e.message);}},
    async stop() {await flush(current);if(current){clearInterval(current.poll);clearTimeout(current.timer);}current=null;}
  };
  // Replace legacy nonpersistent handlers before ComponentLoader initializes App.
  window.App.installThinkDraftAutosave=function(){
    document.addEventListener('visibilitychange',()=>{if(document.hidden)flush(current).catch(()=>{});});
    window.addEventListener('beforeunload',e=>{capture();if(current&&Object.keys(current.dirty).some(s=>current.dirty[s])){e.preventDefault();e.returnValue='';}});
  };
  window.App.renderCurrentStep=render;
  window.App.goToStep=step=>flow.navigate(step);
  window.StudentLobbyModule.enterSubjectClass=enter;
  const exit=window.StudentLobbyModule.exitToLobby;
  window.StudentLobbyModule.exitToLobby=async()=>{try{await flow.stop();exit();await window.StudentLobbyModule.renderLobby(window.AppState);}catch(e){alert('저장하지 못했습니다. 먼저 다시 저장해 주세요.');}};
  const logout=window.AuthModule.logout;
  window.AuthModule.logout=async()=>{try{await flow.stop();for(let i=sessionStorage.length-1;i>=0;i--){const k=sessionStorage.key(i);if(k?.startsWith('think-draft:'))sessionStorage.removeItem(k);}await logout.call(window.AuthModule);}catch(e){alert('저장을 마치지 못했습니다. 다시 저장 후 로그아웃해 주세요.');}};
  window.SupabaseService.fetchTeacherStageResponses=(classId,lessonId,stageCode)=>api({classId,lesson:{id:lessonId}},'teacher',stageCode);
})();
