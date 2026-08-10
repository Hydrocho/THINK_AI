/* ==========================================================================
   Student Lobby Module: Subject cards and the single active lesson per class
   ========================================================================== */

window.StudentLobbyModule = {
  escapeHtml: function (value) {
    return String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
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
      const statusContent = lesson ? `
        <div class="student-subject-lesson-title">${this.escapeHtml(lesson.number)}차시 · ${this.escapeHtml(lesson.title)}</div>
        <div class="student-subject-lesson-question">${this.escapeHtml(lesson.coreQuestion || '')}</div>
      ` : '<div class="student-subject-waiting">수업 준비 중</div>';
      const entryAction = lesson
        ? `<button type="button" class="btn btn-primary" onclick="StudentLobbyModule.enterSubjectClass(window.AppState, '${this.escapeHtml(subjectClass.classId)}')">입장하기</button>`
        : '<span class="student-subject-waiting-hint">활성화된 차시가 없습니다</span>';

      return `
        <article class="student-subject-card" data-subject-class-id="${this.escapeHtml(subjectClass.classId)}">
          <div>
            <div class="student-subject-name">${this.escapeHtml(subjectClass.subjectName || '미지정')}</div>
            <div class="student-subject-class-label">${this.escapeHtml(subjectClass.gradeNumber)}학년 ${this.escapeHtml(subjectClass.classNumber)}반</div>
            ${statusContent}
          </div>
          <div class="student-subject-card-action">${entryAction}</div>
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
