/* Class planning and live teaching share lesson content, never student identity. */
(function () {
  const names={T:'나의 처음 생각',H:'친구와 생각 나누기',I:'인공지능과 생각 넓히기',N:'비판적으로 따져보기',K:'나의 최종 생각'};
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const checked=result=>{if(result.error)throw result.error;return result.data;};
  const api=(classId,lessonId,operation,payload={})=>window.SupabaseService.invokeAccountFunction('manage-class-projects',
    {action:'manage_live_teaching',classId,lessonId,operation,payload});
  const panel=()=>document.getElementById('panelTeacherLive');
  let revision=0;
  const planSaves=new Map();
  const module=window.TeacherLiveModule={
    planCard(classId,lesson,plan,active) {
      return `<article data-plan-lesson="${lesson.id}" onchange="TeacherLiveModule.savePlan('${classId}','${lesson.id}',event.target)" style="padding:16px 0;border-top:1px solid var(--border-light)">
        <label><input type="checkbox" data-plan-enabled ${plan?.enabled?'checked':''} ${active?'disabled':''}> <strong>${esc(lesson.title)}</strong></label>
        <p>${esc(lesson.core_question)}</p><div style="display:flex;flex-wrap:wrap;gap:16px">
        ${(lesson.think_stages||Object.keys(names)).filter(s=>s!=='H').map(s=>`<label><input type="checkbox" data-plan-stage="${s}" ${(plan?.planned_stages||lesson.think_stages||[]).includes(s)?'checked':''} ${active?'disabled':''}> ${s} · ${names[s]}</label>`).join('')}</div>
        <div style="display:flex;flex-wrap:wrap;gap:16px;margin-top:12px">
        ${(lesson.think_stages||Object.keys(names)).includes('H')?`<label><input type="checkbox" data-plan-stage="H" ${(plan?.planned_stages||lesson.think_stages||[]).includes('H')?'checked':''} ${active?'disabled':''}> H · ${names.H}</label>`:''}
        ${(lesson.think_stages||Object.keys(names)).includes('N')?`<label><input type="checkbox" data-plan-peer-review ${plan?.peer_review_enabled!==false?'checked':''} ${active?'disabled':''}> N단계 ‘친구의 검토 읽기’ 허용</label>`:''}
        </div>
        ${(lesson.think_stages||Object.keys(names)).includes('N')?'<p class="teacher-live-hint">N단계 친구 읽기 허용을 해제하면 학생은 자신의 검토만 작성합니다. 이 학급의 현재 주제에만 적용됩니다.</p>':''}
        <span role="status">${active?'진행 중인 수업입니다. 종료 후 계획을 수정할 수 있습니다.':''}</span></article>`;
    },
    async savePlan(classId,lessonId,input) {
      const card=input.closest('[data-plan-lesson]'),status=card.querySelector('[role="status"]');
      if(input.disabled)return;
      const payload={enabled:!!card.querySelector('[data-plan-enabled]').checked,
        peerReviewEnabled:card.querySelector('[data-plan-peer-review]')?.checked??true,
        stages:[...card.querySelectorAll('[data-plan-stage]')].filter(el=>el.checked).map(el=>el.dataset.planStage)};
      if(payload.enabled&&!payload.stages.length) {
        input.checked=!input.checked;
        status.textContent='사용할 주제에는 한 개 이상의 단계가 필요합니다. 주제 전체를 끄려면 주제명 옆 체크를 해제해 주세요.';
        return;
      }
      const key=classId+':'+lessonId;
      let state=planSaves.get(key);
      if(!state){state={pending:null,running:null};planSaves.set(key,state);}
      state.pending={payload,card};
      status.textContent='자동 저장 중…';
      if(state.running)return state.running;
      state.running=(async()=>{
        while(state.pending) {
          const job=state.pending;state.pending=null;
          const message=job.card.querySelector('[role="status"]');
          try {
            await api(classId,lessonId,'plan',job.payload);
            if(!state.pending)message.textContent='자동 저장되었습니다.';
          } catch(error) {
            if(!state.pending) {
              message.textContent='저장하지 못했습니다: '+error.message+' ';
              const retry=document.createElement('button');retry.type='button';retry.className='btn btn-secondary';retry.textContent='다시 시도';
              retry.addEventListener('click',()=>this.savePlan(classId,lessonId,retry));message.appendChild(retry);
            }
          }
        }
      })();
      try {await state.running;} finally {state.running=null;planSaves.delete(key);}
    },
    async showClasses() {
      window.TeacherLiveResponses?.close();this.responsesVisible=false;
      document.getElementById('teacherAppSection')?.classList.remove('teacher-live-focused');
      const request=++revision;this.classId=null;panel().textContent='학급을 불러오는 중…';
      try {
        const session=await window.SupabaseService.getUserSession();
        const classes=checked(await window.SupabaseService.getClient().from('classes').select('*').eq('teacher_id',session.user.id).order('class_code'));
        if(request!==revision)return;
        panel().innerHTML=`<h3>▶ 실시간 수업</h3><p>학급을 선택한 뒤 계획된 주제로 수업을 시작하세요.</p><div class="project-card-grid">${classes.map(c=>
          `<button class="btn btn-secondary" style="padding:24px" onclick="TeacherLiveModule.selectClass('${c.id}')">${c.grade_number}학년 ${c.class_number}반 · ${esc(c.subject_name)}${c.active_lesson_plan_id?' · 진행 중':''}</button>`).join('')||'<p>학급 계획에서 학급을 먼저 만들어 주세요.</p>'}</div>`;
      } catch(error){panel().textContent='학급을 불러오지 못했습니다: '+error.message;}
    },
    async loadClass(classId) {
      const db=window.SupabaseService.getClient();
      const results=await Promise.all([
        db.from('classes').select('*').eq('id',classId).single(),
        db.from('class_projects').select('title,source_version_id,projects(project_versions(id,lesson_plans(*)))').eq('class_id',classId),
        db.from('class_lesson_plans').select('*').eq('class_id',classId),
        db.from('class_lesson_stage_access').select('*').eq('class_id',classId)
      ]);
      const [classroom,projects,plans,access]=results.map(checked);
      const lessons=projects.flatMap(p=>(p.projects?.project_versions?.find(v=>v.id===p.source_version_id)?.lesson_plans||[])
        .map(l=>({...l,projectTitle:p.title,plan:plans.find(x=>x.lesson_plan_id===l.id)})))
        .filter(l=>l.plan?.enabled).sort((a,b)=>a.lesson_order-b.lesson_order);
      return {classroom,lessons,access};
    },
    async selectClass(classId) {
      window.TeacherLiveResponses?.close();this.responsesVisible=false;
      document.getElementById('teacherAppSection')?.classList.remove('teacher-live-focused');
      const request=++revision;panel().textContent='수업 주제를 불러오는 중…';
      try {
        const data=await this.loadClass(classId);if(request!==revision)return;
        Object.assign(this,data,{classId});
        const c=data.classroom;
        panel().innerHTML=`<button class="btn btn-secondary" onclick="TeacherLiveModule.showClasses()">← 학급 목록</button>
          <h3>${c.grade_number}학년 ${c.class_number}반 · ${esc(c.subject_name)}</h3>
          ${data.lessons.map(l=>`<article class="question-card" style="margin-top:16px"><strong>${esc(l.projectTitle)} · ${esc(l.title)}</strong><p>${esc(l.core_question)}</p>
            <p>함께 진행할 단계: ${l.plan.planned_stages.join(' · ')}</p><button class="btn btn-primary" onclick="TeacherLiveModule.start('${l.id}',this)">${c.active_lesson_plan_id===l.id?'진행 중인 수업으로 돌아가기':'실시간 수업 하기'}</button></article>`).join('')||'<p>학급 계획에서 사용할 주제와 단계를 저장해 주세요.</p>'}`;
      } catch(error){panel().textContent='주제를 불러오지 못했습니다: '+error.message;}
    },
    async start(lessonId,button) {
      if(this.classroom.active_lesson_plan_id && this.classroom.active_lesson_plan_id!==lessonId) {
        if(!await window.ModalService.confirm({title:'수업 주제 변경',message:'진행 중인 주제를 종료하고 선택한 주제로 이동합니다. 학생들이 작성 중인 글은 제출할 수 있습니다.'}))return;
      }
      button.disabled=true;
      try {
        await api(this.classId,lessonId,'start');
        Object.assign(this,await this.loadClass(this.classId));
        this.lesson=this.lessons.find(l=>l.id===lessonId);
        this.stage=this.lesson.plan.planned_stages.includes(this.classroom.current_think_stage)?this.classroom.current_think_stage:this.lesson.plan.planned_stages[0];
        this.render();
      } catch(error){alert(error.message);button.disabled=false;}
    },
    preview(stage) {this.stage=stage;this.render();},
    render() {
      const rankingsKey=this.classId+':'+this.lesson.id;
      const previousRankings=document.getElementById('teacherLiveResponses');
      const keepRankings=this.stage==='H'&&previousRankings?.dataset.rankingsContext===rankingsKey;
      if(!keepRankings)window.TeacherLiveResponses?.close();
      if(this.stage==='H')this.responsesVisible=false;
      document.getElementById('teacherAppSection')?.classList.add('teacher-live-focused');
      const l=this.lesson,c=this.classroom;
      const opened=Object.keys(names).filter(stage=>this.access.some(a=>a.lesson_plan_id===l.id&&a.access_mode==='writable'&&a.stage_code===stage));
      panel().innerHTML=`<header class="teacher-live-toolbar">
        <button type="button" class="btn btn-secondary" onclick="TeacherAdminModule.switchTab('live')" title="교사용 홈으로 돌아가기">⌂ 홈</button>
        <strong>${c.grade_number}학년 ${c.class_number}반 · ${esc(c.subject_name)}</strong>
        <span role="status">현재 진행: ${c.current_think_stage||'진행 단계 없음'} · 열린 단계: ${opened.join(', ')||'없음'}</span>
        <button class="btn ${opened.includes(this.stage)?'btn-secondary':'btn-primary'}" onclick="TeacherLiveModule.${opened.includes(this.stage)?'closeStage':'openStage'}(this)">${this.stage} 단계 ${opened.includes(this.stage)?'종료하기':'시작'}</button>
        <button class="btn btn-secondary" onclick="TeacherLiveModule.end(this)">수업 종료</button></header>
        <div class="main-shell teacher-live-layout">
        <aside class="sidebar">
        <div class="teacher-live-back"><button type="button" class="btn btn-secondary" onclick="TeacherLiveModule.selectClass('${this.classId}')">← 주제 목록으로</button></div>
        <div><div class="sidebar-title">진행 중인 프로젝트</div>
        <div class="activity-badge-box" style="margin-top:10px"><div class="activity-topic-title">${esc(l.projectTitle)}</div><div class="activity-lesson-num">${esc(l.lesson_order??1)}주제 활동 진행 중</div></div></div>
        <div style="margin-top:20px"><div class="sidebar-title" style="margin-bottom:12px">THINK 5단계 프로세스</div>
        <ul class="think-steps-list">${l.plan.planned_stages.map(s=>`<li><button type="button" class="think-step-item ${s===this.stage?'active':''}" data-stage="${s}" aria-pressed="${s===this.stage}" onclick="TeacherLiveModule.preview('${s}')"><span class="step-icon-badge">${s}</span><span>${names[s]}</span></button></li>`).join('')}</ul></div>
        <p class="teacher-live-hint">‘단계 시작’을 누르면 학생들이 입장할 수 있습니다. ‘단계 종료하기’를 누르면 새 입장이 닫히며, 이미 작성 중인 학생은 마무리하여 제출할 수 있습니다.</p></aside>
        <section class="content-area"><div class="step-header"><h1 class="step-main-title">${esc(l.core_question)}</h1>${l.background_description?`<details class="think-t-example think-background"><summary>배경 설명 보기</summary><p>${esc(l.background_description)}</p></details>`:''}</div>
        ${this.stage==='H'?'':'<div><button type="button" class="btn btn-secondary" id="teacherLiveResponseToggle" aria-expanded="false" aria-controls="teacherLiveResponses" onclick="TeacherLiveModule.toggleResponses()">학생 작성 현황</button></div>'}
        <div id="teacherLiveActivity">
        <div id="teacherLivePreview"></div></div><div id="teacherLiveResponses" hidden></div></section></div>`;
      this.renderPreview(false);
      if(this.stage==='H') {
        document.getElementById('teacherLiveActivity').hidden=true;
        const target=document.getElementById('teacherLiveResponses');
        if(keepRankings)target.replaceWith(previousRankings);
        else {
          target.hidden=false;target.dataset.rankingsContext=rankingsKey;
          window.TeacherLiveResponses.openRankings({classId:this.classId,lessonId:this.lesson.id,stageCode:'H'},target);
        }
      } else if(this.responsesVisible)this.showResponses();
    },
    toggleResponses() {
      if(!this.responsesVisible)return this.showResponses();
      this.responsesVisible=false;
      window.TeacherLiveResponses.close();
      document.getElementById('teacherLiveActivity').hidden=false;
      document.getElementById('teacherLiveResponses').hidden=true;
      const button=document.getElementById('teacherLiveResponseToggle');
      button.textContent=this.stage==='H'?'조회하기':'학생 작성 현황';button.setAttribute('aria-expanded','false');
    },
    showResponses() {
      this.responsesVisible=true;
      document.getElementById('teacherLiveActivity').hidden=true;
      const target=document.getElementById('teacherLiveResponses');target.hidden=false;
      const button=document.getElementById('teacherLiveResponseToggle');
      button.textContent='← 활동 화면으로 돌아가기';button.setAttribute('aria-expanded','true');
      const context={classId:this.classId,lessonId:this.lesson.id,stageCode:this.stage};
      return this.stage==='H'?window.TeacherLiveResponses.openRankings(context,target):window.TeacherLiveResponses.open(context,target);
    },
    renderPreview(reflection) {
      const l=this.lesson;
      window.ThinkWorkflow.renderTeacherPreview({...l,peerReviewEnabled:l.plan.peer_review_enabled,thinkStages:l.plan.planned_stages,reviewResource:l.review_resource,aiQuestionLimit:l.ai_question_limit},this.stage,document.getElementById('teacherLivePreview'),reflection,target=>window.TeacherLiveResponses.openRankings({classId:this.classId,lessonId:l.id,stageCode:'N'},target));
    },
    async openStage(button) {
      return this.setStageAccess(button,'stage');
    },
    async closeStage(button) {
      return this.setStageAccess(button,'close_stage');
    },
    async setStageAccess(button,operation) {
      button.disabled=true;
      try {
        await api(this.classId,this.lesson.id,operation,{stage:this.stage});
        Object.assign(this,await this.loadClass(this.classId));this.render();
      } catch(error){alert(error.message);button.disabled=false;}
    },
    async end(button) {
      if(!await window.ModalService.confirm({title:'수업 종료',message:'새로운 활동 진입을 종료합니다. 작성 중인 학생은 글을 마무리하여 제출할 수 있습니다.'}))return;
      button.disabled=true;
      try {await api(this.classId,this.lesson.id,'end');await this.selectClass(this.classId);}
      catch(error){alert(error.message);button.disabled=false;}
    }
  };
})();
