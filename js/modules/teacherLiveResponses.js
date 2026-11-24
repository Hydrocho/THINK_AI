/* Read-only roster and submitted work within the live teaching activity pane. */
(function () {
  let current=null;
  const statusLabels={not_started:'미작성',writing:'작성 중',submitted:'제출 완료'};
  const studentStatus=student=>Object.hasOwn(statusLabels,student.status)?student.status:'unknown';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const reactions={similar:'내 생각과 비슷해요',newView:'새로운 관점이에요',curious:'더 궁금해요'};
  function rankingContent(row,stage) {
    const review=row.review;
    if(stage!=='N'||!review||typeof review!=='object')return `<div class="live-response-answer">${esc(row.content)}</div>`;
    const section=(question,answer)=>`<section class="live-response-answer"><h4>${esc(question)}</h4><div>${esc(answer||'작성한 내용이 없습니다.')}</div></section>`;
    const source=review.source;
    const first=source?.key==='reflectionPair'
      ? `<section class="live-response-answer"><h4>① AI와 대화 후 내 생각 다시 보기</h4><strong>새로 알게 된 점</strong><div>${esc(source.learned||'작성한 내용이 없습니다.')}</div><strong>내 생각에 연결하기</strong><div>${esc(source.connection||'작성한 내용이 없습니다.')}</div></section>`
      : section('① 다시 살펴보고 싶은 내 생각',review.target);
    return first+section('② 다른 자료와 비교해 보니 어땠나요?',review.evidence)
      +(review.sourceUrl?section('자료 출처 링크 주소',review.sourceUrl):'')
      +section('③ 확인한 뒤에도 내 생각은 같은가요?',review.judgment);
  }
  function renderDetail(ctx) {
    const target=ctx.target.querySelector('.live-response-detail');
    const student=ctx.students.find(s=>s.studentNumber===ctx.selected);
    if(!student){target.innerHTML='<p class="live-response-empty">왼쪽에서 학생 이름을 선택하면 제출 내용을 볼 수 있습니다.</p>';return;}
    const response=ctx.response;
    target.innerHTML=`<h3>${esc(student.studentNumber)} ${esc(student.studentName)}</h3>`;
    target.onclick=null;
    if(ctx.stageCode==='I') {
      target.innerHTML+=`<div class="live-detail-tabs" role="group" aria-label="학생 활동 내용 선택"><button type="button" class="btn btn-secondary" data-detail="submission" aria-pressed="${ctx.detailView!=='chat'}">최종 제출 내용</button><button type="button" class="btn btn-secondary" data-detail="chat" aria-pressed="${ctx.detailView==='chat'}">AI 대화 내역</button></div>`;
      target.onclick=event=>{
        const action=event.target.closest('[data-detail]')?.dataset.detail;
        if(action==='submission')module.showSubmission();
        else if(action==='chat')module.showChat();
        else if(action==='refresh-chat')module.showChat(true);
      };
      if(ctx.detailView==='chat') {
        target.innerHTML+='<button type="button" class="btn btn-secondary" data-detail="refresh-chat">대화 새로고침</button>';
        if(ctx.chatLoading.has(ctx.selected)) {target.innerHTML+='<p class="live-response-empty">AI 대화 내역을 불러오는 중…</p>';return;}
        if(ctx.chatErrors.has(ctx.selected)) {target.innerHTML+=`<p class="live-response-empty">대화를 불러오지 못했습니다: ${esc(ctx.chatErrors.get(ctx.selected))} · 대화 새로고침으로 다시 시도해 주세요.</p>`;return;}
        const turns=ctx.chatCache.get(ctx.selected)||[];
        target.innerHTML+=turns.map((turn,index)=>`<article class="live-chat-turn"><h4>${index+1}번째 대화</h4><div class="live-chat-question"><strong>학생 질문</strong><p>${esc(turn.question)}</p></div><div class="live-chat-answer"><strong>AI 답변</strong><p>${esc(turn.answer||(turn.status==='pending'?'응답을 기다리는 중입니다. 대화 새로고침으로 확인해 주세요.':turn.status==='failed'?'답변을 받지 못한 질문입니다.':'저장된 답변이 없습니다.'))}</p></div></article>`).join('')||'<p class="live-response-empty">아직 AI와 나눈 대화가 없습니다.</p>';
        return;
      }
    }
    if(!response?.submittedAt){target.innerHTML+='<p class="live-response-empty">아직 제출하지 않았습니다.</p>';return;}
    const date=new Date(response.submittedAt);
    target.innerHTML+=`<p class="live-response-meta">제출 완료${Number.isNaN(date.getTime())?'':' · '+esc(date.toLocaleString('ko-KR'))}</p>`;
    const feedback=response.metadata?.feedback;
    const sections=ctx.stageCode==='H' && feedback
      ? Object.values(feedback).map((entry,i)=>`<section class="live-response-answer"><h4>친구 글 ${i+1}</h4><p>${esc((entry.reactions ?? [entry.reaction]).map(key=>reactions[key]).filter(Boolean).join(' · ') || '반응 없음')}${entry.recommended?' · 추천':''}</p><p>${esc(entry.comment||'')}</p></section>`).join('') : '';
    target.innerHTML+=sections+(response.content?`<div class="live-response-answer">${esc(response.content)}</div>`:sections?'':'<p class="live-response-empty">제출한 글 내용이 없습니다.</p>');
  }
  function renderStudents(ctx) {
    const list=ctx.target.querySelector('.live-response-roster');
    const focused=document.activeElement?.dataset?.studentNumber;
    const counts={not_started:0,writing:0,submitted:0,unknown:0};
    ctx.students.forEach(s=>counts[studentStatus(s)]++);
    ctx.target.querySelector('.live-response-summary').innerHTML=`<span>${esc(ctx.stageCode)}단계 · 전체 ${ctx.students.length}명</span>`+['writing','not_started','submitted',...(counts.unknown?['unknown']:[])].map(status=>`<span class="live-response-status" data-status="${status}">${statusLabels[status]||'상태 확인 필요'} ${counts[status]}명</span>`).join('');
    list.innerHTML=ctx.students.map(s=>`<button type="button" class="live-response-student" data-student-number="${esc(s.studentNumber)}" aria-pressed="${s.studentNumber===ctx.selected}"><span><strong>${esc(s.studentNumber)}</strong> ${esc(s.studentName)}</span><span class="live-response-status" data-status="${studentStatus(s)}">${statusLabels[studentStatus(s)]||'상태 확인 필요'}</span></button>`).join('')||'<p class="live-response-empty">등록된 학생이 없습니다.</p>';
    list.querySelectorAll('[data-student-number]').forEach(button=>{
      button.addEventListener('click',()=>module.selectStudent(button.dataset.studentNumber));
      if(button.dataset.studentNumber===focused)button.focus();
    });
  }
  const module=window.TeacherLiveResponses={
    close() {current=null;},
    async openRankings(context,target) {
      this.close();
      const ctx=current={...context,target,rankings:[],sort:'stars'};
      const categories={similar:'♡ 내 생각과 비슷해요',newView:'♡ 새로운 관점이에요',curious:'♡ 더 궁금해요',stars:'★ 우리 반 함께 읽고 싶어요'};
      target.innerHTML=`<div class="live-response-heading"><h2>${ctx.stageCode}단계 ${ctx.stageCode==='N'?'친구의 검토':'친구 글'} 반응</h2><button type="button" class="btn btn-secondary" data-query>다시 조회하기</button></div><p class="live-response-meta">선택한 반응이 많은 순으로 표시합니다. 항목 전환은 추가 조회 없이 정렬하며, 최신 반응은 ‘다시 조회하기’를 눌러 확인하세요.</p><div class="live-ranking-sort" role="group" aria-label="반응 순위 정렬">${Object.entries(categories).map(([key,label])=>`<button type="button" class="btn btn-secondary" data-sort="${key}" aria-pressed="${key===ctx.sort}">${label}</button>`).join('')}</div><p role="status" aria-live="polite"></p><div class="live-ranking-results"></div>`;
      const render=()=>{
        const other=ctx.sort==='stars'?'likes':'stars';
        const rows=ctx.rankings.map((r,index)=>({...r,index})).filter(row=>Number(row[ctx.sort])>0).sort((a,b)=>b[ctx.sort]-a[ctx.sort]||b[other]-a[other]||a.index-b.index);
        target.querySelector('.live-ranking-results').innerHTML=rows.map((row,index)=>`<article class="live-response-detail"><h3>${index+1}위 · ${categories[ctx.sort]} ${esc(row[ctx.sort])}명</h3><p class="live-response-meta">작성 학생: ${esc(row.studentName||'이름 확인 불가')}</p><div class="live-ranking-counts">${Object.entries(categories).map(([key,label])=>`<span data-reaction-count="${key}">${label} <strong>${esc(row[key]??0)}명</strong></span>`).join('')}</div>${rankingContent(row,ctx.stageCode)}</article>`).join('')||`<p class="live-response-empty">아직 ‘${categories[ctx.sort]}’ 반응을 받은 글이 없습니다.</p>`;
      };
      target.querySelectorAll('[data-sort]').forEach(button=>button.addEventListener('click',()=>{
        ctx.sort=button.dataset.sort;
        target.querySelectorAll('[data-sort]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
        if(ctx.loaded)render();
      }));
      const query=async()=>{
        if(ctx.loading)return;ctx.loading=true;
        const button=target.querySelector('[data-query]');button.disabled=true;
        const status=target.querySelector('[role="status"]');status.textContent='반응을 집계하는 중…';
        try {
          const result=await window.SupabaseService.invokeAccountFunction('get-teacher-stage-responses',{
            classId:ctx.classId,lessonId:ctx.lessonId,stageCode:ctx.stageCode,view:ctx.stageCode==='N'?'n_rankings':'h_rankings'
          });
          if(current!==ctx||!target.isConnected)return;
          ctx.rankings=result.rankings||[];ctx.loaded=true;render();
          status.textContent='조회 시각: '+new Date().toLocaleTimeString('ko-KR')+' · 같은 수이면 다른 반응 수가 많은 글을 먼저 표시합니다.';
        } catch(error) {if(current===ctx)status.textContent='반응을 불러오지 못했습니다: '+error.message+' · 다시 조회하기를 눌러 주세요.';}
        finally {ctx.loading=false;button.disabled=false;}
      };
      target.querySelector('[data-query]').addEventListener('click',()=>{current=ctx;return query();});
      await query();
    },
    async open(context,target) {
      this.close();
      const ctx=current={...context,target,students:[],selected:null,response:null,loading:false,detailRequest:0,detailView:'submission',chatCache:new Map(),chatLoading:new Set(),chatErrors:new Map()};
      target.innerHTML='<div class="live-response-heading"><h2>학생 작성 현황</h2><button type="button" class="btn btn-secondary" data-refresh>현황 새로고침</button></div><p class="live-response-summary"></p><p class="live-response-meta" role="status" aria-live="polite"></p><div class="live-response-layout"><nav class="live-response-roster" aria-label="학생 명렬"></nav><section class="live-response-detail" aria-label="선택한 학생의 제출 내용" aria-live="polite"></section></div>';
      target.querySelector('[data-refresh]').addEventListener('click',()=>this.refresh());
      renderDetail(ctx);
      await this.refresh();
    },
    async refresh() {
      const ctx=current;if(!ctx||ctx.loading)return;
      ctx.loading=true;
      const button=ctx.target.querySelector('[data-refresh]');button.disabled=true;
      const status=ctx.target.querySelector('[role="status"]');status.textContent='작성 현황을 불러오는 중…';
      try {
        const result=await window.SupabaseService.invokeAccountFunction('get-teacher-stage-responses',{
          classId:ctx.classId,lessonId:ctx.lessonId,stageCode:ctx.stageCode,view:'live'
        });
        if(current!==ctx||!ctx.target.isConnected)return;
        ctx.students=[...(result.students||[])].sort((a,b)=>String(a.studentNumber).localeCompare(String(b.studentNumber),'ko',{numeric:true}));
        renderStudents(ctx);
        status.textContent='조회 시각: '+new Date().toLocaleTimeString('ko-KR')+' · 최신 상태는 현황 새로고침으로 확인하세요. 작성 중은 단계에 입장한 뒤 아직 제출하지 않은 상태입니다.';
        if(ctx.selected)await this.selectStudent(ctx.selected);
      } catch(error) {
        if(current===ctx)status.textContent='작성 현황을 불러오지 못했습니다: '+error.message+' · 현황 새로고침으로 다시 시도해 주세요.';
      } finally {ctx.loading=false;button.disabled=false;}
    },
    async selectStudent(studentNumber) {
      const ctx=current;
      if(!ctx||!ctx.students.some(s=>s.studentNumber===studentNumber)||ctx.loadingStudent===studentNumber)return;
      const request=++ctx.detailRequest;
      ctx.selected=studentNumber;ctx.loadingStudent=studentNumber;ctx.detailView='submission';
      ctx.target.querySelectorAll('[data-student-number]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.studentNumber===studentNumber)));
      const detail=ctx.target.querySelector('.live-response-detail');detail.textContent='제출 내용을 확인하는 중…';
      try {
        const result=await window.SupabaseService.invokeAccountFunction('get-teacher-stage-responses',{
          classId:ctx.classId,lessonId:ctx.lessonId,stageCode:ctx.stageCode,view:'live',studentNumber
        });
        if(current!==ctx||request!==ctx.detailRequest||!ctx.target.isConnected)return;
        ctx.response=result.response;renderDetail(ctx);
      } catch(error) {
        if(current===ctx&&request===ctx.detailRequest)detail.textContent='제출 내용을 불러오지 못했습니다: '+error.message+' · 학생 이름을 다시 눌러 주세요.';
      } finally {if(request===ctx.detailRequest)ctx.loadingStudent=null;}
    },
    showSubmission() {if(current){current.detailView='submission';renderDetail(current);}},
    async showChat(force=false) {
      const ctx=current;
      if(!ctx||ctx.stageCode!=='I'||!ctx.selected)return;
      const studentNumber=ctx.selected;ctx.detailView='chat';
      if(ctx.chatLoading.has(studentNumber)){renderDetail(ctx);return;}
      if(!force&&ctx.chatCache.has(studentNumber)){renderDetail(ctx);return;}
      ctx.chatErrors.delete(studentNumber);ctx.chatLoading.add(studentNumber);renderDetail(ctx);
      try {
        const result=await window.SupabaseService.invokeAccountFunction('get-teacher-stage-responses',{
          classId:ctx.classId,lessonId:ctx.lessonId,stageCode:'I',view:'live',studentNumber,detail:'chat'
        });
        if(current!==ctx)return;
        ctx.chatCache.set(studentNumber,result.turns||[]);
      } catch(error) {if(current===ctx)ctx.chatErrors.set(studentNumber,error.message);}
      finally {
        ctx.chatLoading.delete(studentNumber);
        if(current===ctx&&ctx.selected===studentNumber&&ctx.detailView==='chat'&&ctx.target.isConnected)renderDetail(ctx);
      }
    }
  };
})();
