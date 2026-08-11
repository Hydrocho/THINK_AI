/* ==========================================================================
   Student Lobby Module: Subject cards and the single active lesson per class
   ========================================================================== */

window.StudentLobbyModule = {
  escapeHtml: function (value) {
    return String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
  },

  getSubjectIcon: function (name) {
    if (!name) return '📘';
    if (name.includes('과학')) return '🧪';
    if (name.includes('수학')) return '📐';
    if (name.includes('국어')) return '📚';
    if (name.includes('영어')) return '🇬🇧';
    if (name.includes('사회') || name.includes('역사')) return '🌏';
    if (name.includes('미술')) return '🎨';
    if (name.includes('음악')) return '🎵';
    if (name.includes('체육')) return '⚽';
    if (name.includes('정보') || name.includes('코딩')) return '💻';
    if (name.includes('도덕') || name.includes('윤리')) return '🌱';
    return '📘';
  },

  renderLobby: async function (state) {
    const container = document.getElementById('lobbyClassLessonsContainer');
    if (!container) return;
    container.innerHTML = '<div style="text-align:center; color:var(--text-subtle); padding:20px;">과목별 수업을 불러오는 중입니다…</div>';

    try {
      const result = await window.SupabaseService.fetchStudentClassLessons();
      if (result?.studentName) {
        state.studentData.name = result.studentName;
        const userName = document.getElementById('lblUserName');
        if (userName) userName.innerText = result.studentName;
      }
      state.subjectClasses = result.subjectClasses || [];
      this.renderSubjectClasses(container, state.subjectClasses, result.classResolution);
    } catch (error) {
      container.innerHTML = `<div style="text-align:center; color:var(--danger-text); padding:20px;">과목별 수업을 불러오지 못했습니다. ${this.escapeHtml(error.message)}</div>`;
    }
  },

  renderSubjectClasses: function (container, subjectClasses, classResolution) {
    if (!subjectClasses.length) {
      const message = classResolution
        ? '학급 정보를 확인할 수 없습니다. 선생님께 문의해 주세요.'
        : '등록된 과목 수업이 없습니다.';
      container.innerHTML = `<div style="text-align:center; color:var(--text-subtle); padding:20px;">${message}</div>`;
      return;
    }

    container.innerHTML = `<div class="student-subject-card-grid">${subjectClasses.map(subjectClass => {
      const lesson = subjectClass.activeLesson;
      const subjectName = subjectClass.subjectName || '미지정';
      const subjectIcon = this.getSubjectIcon(subjectName);

      const statusBadge = lesson
        ? `<span class="student-status-badge is-active"><span class="pulse-dot"></span> 수업 진행 중</span>`
        : `<span class="student-status-badge is-waiting">수업 준비 중</span>`;

      const statusContent = lesson ? `
        <div class="student-subject-lesson-box">
          <div class="student-subject-lesson-title">📖 ${this.escapeHtml(lesson.number)}차시 · ${this.escapeHtml(lesson.title)}</div>
          ${lesson.coreQuestion ? `<div class="student-subject-lesson-question">💡 핵심 질문: "${this.escapeHtml(lesson.coreQuestion)}"</div>` : ''}
        </div>
      ` : `
        <div class="student-subject-waiting-box">
          <span class="waiting-icon">⏳</span>
          <span>선생님이 아직 수업을 시작하지 않았습니다.</span>
        </div>
      `;

      const entryAction = lesson
        ? `<button type="button" class="btn btn-primary student-enter-btn" onclick="StudentLobbyModule.enterSubjectClass(window.AppState, '${this.escapeHtml(subjectClass.classId)}')">
            <span>입장하기</span>
            <span class="btn-arrow">→</span>
           </button>`
        : `<button type="button" class="btn btn-disabled student-enter-btn" disabled>입장 대기 중</button>`;

      return `
        <article class="student-subject-card ${lesson ? 'is-live' : ''}" data-subject-class-id="${this.escapeHtml(subjectClass.classId)}">
          <div class="student-subject-card-header">
            <div class="student-subject-info">
              <span class="student-subject-badge">${subjectIcon} ${this.escapeHtml(subjectName)}</span>
              <span class="student-subject-class-label">${this.escapeHtml(subjectClass.gradeNumber)}학년 ${this.escapeHtml(subjectClass.classNumber)}반</span>
            </div>
            ${statusBadge}
          </div>
          <div class="student-subject-card-body">
            ${statusContent}
          </div>
          <div class="student-subject-card-footer">
            ${entryAction}
          </div>
        </article>`;
    }).join('')}</div>`;
  },

  enterSubjectClass: function (state, classId) {
    const subjectClass = state.subjectClasses?.find(item => item.classId === classId);
    if (!subjectClass?.activeLesson) return;
    state.activeClassId = subjectClass.classId;
    state.activeLessonPlans = [subjectClass.activeLesson];
    state.currentLessonIndex = 0;
    state.currentStep = 1;
    document.getElementById('studentLobbySection').style.display = 'none';
    document.getElementById('studentAppSection').style.display = 'grid';
    window.App.selectLesson(0);
  },

  exitToLobby: function () {
    const appSec = document.getElementById('studentAppSection');
    const lobbySec = document.getElementById('studentLobbySection');
    if (appSec) appSec.style.display = 'none';
    if (lobbySec) lobbySec.style.display = 'grid';
  }
};
