/* ==========================================================================
   Student Lobby Module: Current live lesson and personal learning history
   ========================================================================== */

window.StudentLobbyModule = {
  escapeHtml: function (value) {
    return String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
  },

  renderLobby: async function (state) {
    const active = document.getElementById('lobbyActiveLessonContainer');
    const history = document.getElementById('lobbyHistoryContainer');
    if (!active || !history) return;
    active.innerHTML = '<div style="text-align:center; color:var(--text-subtle); padding:20px;">현재 수업을 확인하는 중입니다…</div>';
    history.innerHTML = '';
    try {
      const result = await window.SupabaseService.fetchStudentLiveLesson();
      state.liveLesson = result.liveLesson || null;
      if (result.unassigned) {
        active.innerHTML = '<div style="text-align:center; color:var(--text-subtle); padding:20px;">현재 학급에 연결되지 않았습니다. 선생님께 학급 연결을 요청해 주세요.</div>';
      } else {
        this.renderLiveLesson(active, state.liveLesson);
      }
      this.renderHistory(history, result.history || []);
    } catch (error) {
      active.innerHTML = `<div style="text-align:center; color:var(--danger-text); padding:20px;">수업 정보를 불러오지 못했습니다. ${this.escapeHtml(error.message)}</div>`;
      history.innerHTML = '<div style="text-align:center; color:var(--text-subtle); padding:20px;">기록을 불러올 수 없습니다.</div>';
    }
  },

  renderLiveLesson: function (container, liveLesson) {
    if (!liveLesson?.lesson) {
      container.innerHTML = '<div style="text-align:center; color:var(--text-subtle); padding:20px;">현재 열린 수업이 없습니다. 선생님이 수업을 열면 자동으로 표시됩니다.</div>';
      return;
    }
    const lesson = liveLesson.lesson;
    const openStages = Object.entries(lesson.thinkStageAccess || {}).filter(([, mode]) => mode !== 'hidden').map(([stage]) => stage).join(' · ') || '아직 열린 단계 없음';
    container.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; gap:16px; flex-wrap:wrap; padding:14px 18px; background:var(--primary-50); border:1px solid var(--primary-200); border-radius:var(--radius-md);">
        <div>
          <div style="font-size:.8rem; color:var(--primary-700); font-weight:700;">${this.escapeHtml(liveLesson.projectTitle)}</div>
          <div style="font-weight:800; color:var(--text-main); margin-top:4px;">${lesson.number}차시 · ${this.escapeHtml(lesson.title)}</div>
          <div style="font-size:.88rem; color:var(--text-subtle); margin-top:5px;">${this.escapeHtml(lesson.coreQuestion)}</div>
          <div style="font-size:.78rem; color:var(--primary-700); margin-top:8px;">열린 단계: ${openStages}</div>
        </div>
        <button class="btn btn-primary" onclick="App.enterActiveLesson()">수업 입장하기 →</button>
      </div>`;
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

  enterLiveLesson: function (state) {
    if (!state.liveLesson?.lesson) return;
    state.activeLessonPlans = [state.liveLesson.lesson];
    state.currentLessonIndex = 0;
    state.currentStep = 1;
    document.getElementById('studentLobbySection').style.display = 'none';
    document.getElementById('studentAppSection').style.display = 'grid';
    window.App.selectLesson(0);
  }
};
