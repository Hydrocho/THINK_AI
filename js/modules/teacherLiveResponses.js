/* Read-only roster and submitted work within the live teaching activity pane. */
(function () {
  let current=null;
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const reactions={similar:'내 생각과 비슷해요',newView:'새로운 관점이에요',curious:'더 궁금해요'};
  function renderDetail(ctx) {
    const target=ctx.target.querySelector('.live-response-detail');
    const student=ctx.students.find(s=>s.studentNumber===ctx.selected);
    if(!student){target.innerHTML='<p class="live-response-empty">왼쪽에서 학생 이름을 선택하면 제출 내용을 볼 수 있습니다.</p>';return;}
    const response=student.response;
    target.innerHTML=`<h3>${esc(student.studentNumber)} ${esc(student.studentName)}</h3>`;
    if(!response?.submittedAt){target.innerHTML+='<p class="live-response-empty">아직 제출하지 않았습니다.</p>';return;}
    const date=new Date(response.submittedAt);
    target.innerHTML+=`<p class="live-response-meta">제출 완료${Number.isNaN(date.getTime())?'':' · '+esc(date.toLocaleString('ko-KR'))}</p>`;
    const feedback=response.metadata?.feedback;
    const sections=ctx.stageCode==='H' && feedback
      ? Object.values(feedback).map((entry,i)=>`<section class="live-response-answer"><h4>친구 글 ${i+1}</h4><p>${esc(reactions[entry.reaction]||'반응 없음')}${entry.recommended?' · 추천':''}</p><p>${esc(entry.comment||'')}</p></section>`).join('') : '';
    target.innerHTML+=sections+(response.content?`<div class="live-response-answer">${esc(response.content)}</div>`:sections?'':'<p class="live-response-empty">제출한 글 내용이 없습니다.</p>');
  }
  function renderStudents(ctx) {
    const list=ctx.target.querySelector('.live-response-roster');
    const focused=document.activeElement?.dataset?.studentNumber;
    const submitted=ctx.students.filter(s=>s.response?.submittedAt).length;
    ctx.target.querySelector('.live-response-summary').textContent=`${ctx.stageCode}단계 · 제출 ${submitted} / 전체 ${ctx.students.length}명`;
    list.innerHTML=ctx.students.map(s=>`<button type="button" class="live-response-student" data-student-number="${esc(s.studentNumber)}" aria-pressed="${s.studentNumber===ctx.selected}"><span><strong>${esc(s.studentNumber)}</strong> ${esc(s.studentName)}</span><span class="live-response-badge ${s.response?.submittedAt?'submitted':''}">${s.response?.submittedAt?'제출 완료':'미제출'}</span></button>`).join('')||'<p class="live-response-empty">등록된 학생이 없습니다.</p>';
    list.querySelectorAll('[data-student-number]').forEach(button=>{
      button.addEventListener('click',()=>{
        ctx.selected=button.dataset.studentNumber;
        list.querySelectorAll('button').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
        renderDetail(ctx);
      });
      if(button.dataset.studentNumber===focused)button.focus();
    });
    renderDetail(ctx);
  }
  const module=window.TeacherLiveResponses={
    close() {if(current)clearTimeout(current.timer);current=null;},
    async open(context,target) {
      this.close();
      const ctx=current={...context,target,students:[],selected:null,loading:false};
      target.innerHTML=`<div class="live-response-heading"><h2>학생 작성 현황</h2><button type="button" class="btn btn-secondary" data-refresh>새로고침</button></div><p class="live-response-summary"></p><p class="live-response-meta" role="status" aria-live="polite">불러오는 중…</p><div class="live-response-layout"><nav class="live-response-roster" aria-label="학생 명렬 및 제출 현황"></nav><section class="live-response-detail" aria-label="선택한 학생의 제출 내용"></section></div>`;
      target.querySelector('[data-refresh]').addEventListener('click',()=>this.refresh());
      renderDetail(ctx);
      await this.refresh();
    },
    async refresh() {
      const ctx=current;
      if(!ctx||ctx.loading)return;
      clearTimeout(ctx.timer);
      ctx.loading=true;
      const button=ctx.target.querySelector('[data-refresh]');button.disabled=true;
      const status=ctx.target.querySelector('[role="status"]');
      try {
        const result=await window.SupabaseService.invokeAccountFunction('get-teacher-stage-responses',{
          classId:ctx.classId,lessonId:ctx.lessonId,stageCode:ctx.stageCode,view:'live'
        });
        if(current!==ctx||!ctx.target.isConnected)return;
        ctx.students=[...(result.students||[])].sort((a,b)=>String(a.studentNumber).localeCompare(String(b.studentNumber),'ko',{numeric:true}));
        renderStudents(ctx);
        status.textContent='10초마다 갱신 · 마지막 확인 '+new Date().toLocaleTimeString('ko-KR');
      } catch(error) {
        if(current===ctx)status.textContent='현황을 불러오지 못했습니다: '+error.message+' · 새로고침으로 다시 시도해 주세요.';
      } finally {
        ctx.loading=false;button.disabled=false;
        if(current===ctx&&ctx.target.isConnected)ctx.timer=setTimeout(()=>{
          if(!ctx.target.isConnected||ctx.target.hidden||document.getElementById('panelTeacherLive')?.style.display==='none'){this.close();return;}
          this.refresh();
        },10000);
      }
    }
  };
})();
