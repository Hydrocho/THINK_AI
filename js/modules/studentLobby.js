/* ==========================================================================
   Student Lobby Module: Class activity list and personal learning history
   ========================================================================== */

window.StudentLobbyModule = {
  escapeHtml: function (value) {
    return String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
  },

  renderLobby: async function (state) {
    const classLessons = document.getElementById('lobbyClassLessonsContainer');
    const history = document.getElementById('lobbyHistoryContainer');
    if (!classLessons || !history) return;
    classLessons.innerHTML = '<div style="text-align:center; color:var(--text-subtle); padding:20px;">학급 활동을 불러오는 중입니다…</div>';
    history.innerHTML = '';
    try {
      const result = await window.SupabaseService.fetchStudentClassLessons();
      state.classLessons = result.lessons || [];
      this.renderClassLessons(classLessons, state.classLessons, result.classResolution);
      this.renderHistory(history, result.history || []);
    } catch (error) {
      classLessons.innerHTML = `<div style="text-align:center; color:var(--danger-text); padding:20px;">학급 활동을 불러오지 못했습니다. ${this.escapeHtml(error.message)}</div>`;
      history.innerHTML = '<div style="text-align:center; color:var(--text-subtle); padding:20px;">기록을 불러올 수 없습니다.</div>';
    }
  },

  renderClassLessons: function (container, lessons, classResolution) {
    if (!lessons.length) {
      const message = classResolution
        ? '학급 정보를 확인할 수 없습니다. 선생님께 문의해 주세요.'
        : '우리 학급에 등록된 수업 및 활동이 없습니다.';
      container.innerHTML = `<div style="text-align:center; color:var(--text-subtle); padding:20px;">${message}</div>`;
      return;
    }
    container.innerHTML = lessons.map((lesson, index) => {
      const visibleStages = Object.entries(lesson.thinkStageAccess || {})
        .filter(([, mode]) => mode !== 'hidden')
        .map(([stage]) => this.escapeHtml(stage))
        .join(' · ');
      const accessible = Object.values(lesson.thinkStageAccess || {}).some(mode => mode !== 'hidden');
      const entry = accessible
        ? `<button class="btn btn-primary" onclick="StudentLobbyModule.enterClassLesson(window.AppState, ${index})">활동 참여하기 →</button>`
        : '<span class="role-tag">공개된 단계가 없습니다</span>';
      return `
        <div style="display:flex; justify-content:space-between; align-items:center; gap:16px; flex-wrap:wrap; padding:14px 18px; background:var(--primary-50); border:1px solid var(--primary-200); border-radius:var(--radius-md);">
          <div>
            <div style="font-size:.8rem; color:var(--primary-700); font-weight:700;">${this.escapeHtml(lesson.projectTitle)}</div>
            <div style="font-weight:800; color:var(--text-main); margin-top:4px;">${this.escapeHtml(lesson.number)}차시 · ${this.escapeHtml(lesson.title)}</div>
            <div style="font-size:.88rem; color:var(--text-subtle); margin-top:5px;">${this.escapeHtml(lesson.coreQuestion)}</div>
            <div style="font-size:.78rem; color:var(--primary-700); margin-top:8px;">공개 단계: ${visibleStages || '없음'}</div>
          </div>
          ${entry}
        </div>`;
    }).join('');
  },

  renderHistory: function (container, history) {
    if (!history.length) {
      container.innerHTML = '<div style="text-align:center; color:var(--text-subtle); padding:20px;">아직 작성한 생각 기록이 없습니다.</div>';
      return;
    }
    container.innerHTML = history.map(item => `
      <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; padding:14px 18px; background:#ffffff; border:1px solid var(--border-light); border-radius:var(--radius-md);">
        <div><div style="font-size:.8rem; color:var(--text-subtle);">${this.escapeHtml(item.projectTitle)}</div><div style="font-weight:700; color:var(--text-main);">${this.escapeHtml(item.lessonTitle)}</div></div>
        <span class="role-tag" style="background:${item.status === 'submitted' ? 'var(--success-bg)' : 'var(--primary-50)'}; color:${item.status === 'submitted' ? 'var(--success-text)' : 'var(--primary-700)'};">${item.status === 'submitted' ? '제출 완료' : '작성 중'}</span>
      </div>`).join('');
  },

  enterClassLesson: function (state, lessonIndex) {
    const lesson = state.classLessons?.[lessonIndex];
    const accessible = Object.values(lesson?.thinkStageAccess || {}).some(mode => mode !== 'hidden');
    if (!accessible) return;
    state.activeLessonPlans = state.classLessons;
    state.currentLessonIndex = lessonIndex;
    state.currentStep = 1;
    document.getElementById('studentLobbySection').style.display = 'none';
    document.getElementById('studentAppSection').style.display = 'grid';
    window.App.selectLesson(lessonIndex);
  }
};
