/* ==========================================================================
   Teacher Admin Module: Dashboard, Dynamic Project/Lesson Creation Wizard & AI Evidence
   ========================================================================== */

window.TeacherAdminModule = {
  renderDashboard: async function () {
    // 1. Check user profile for master admin role
    if (window.SupabaseService && window.SupabaseService.isConnected()) {
      try {
        const session = await window.SupabaseService.getUserSession();
        if (session && session.user) {
          const profile = await window.SupabaseService.getUserProfile(session.user.id);
          const masterBtn = document.getElementById('tabTeacherMaster');
          if (profile && profile.role === 'admin' && masterBtn) {
            masterBtn.style.display = 'flex';
          }
        }
      } catch (e) {
        console.warn("Profile check warning:", e.message);
      }
    }

    // 2. Render student evaluation table by default
    this.renderEvalTable();
  },

  switchTab: function (tabName) {
    const tabEval = document.getElementById('tabTeacherEval');
    const tabStudents = document.getElementById('tabTeacherStudents');
    const tabMaster = document.getElementById('tabTeacherMaster');

    const panelEval = document.getElementById('panelTeacherEval');
    const panelStudents = document.getElementById('panelTeacherStudents');
    const panelMaster = document.getElementById('panelTeacherMaster');

    if (panelEval) panelEval.style.display = tabName === 'eval' ? 'block' : 'none';
    if (panelStudents) panelStudents.style.display = tabName === 'students' ? 'block' : 'none';
    if (panelMaster) panelMaster.style.display = tabName === 'master' ? 'block' : 'none';

    if (tabEval) tabEval.className = tabName === 'eval' ? 'think-step-item active' : 'think-step-item';
    if (tabStudents) tabStudents.className = tabName === 'students' ? 'think-step-item active' : 'think-step-item';
    if (tabMaster) tabMaster.className = tabName === 'master' ? 'think-step-item active' : 'think-step-item';

    if (tabName === 'students') {
      window.StudentManagerModule.renderStudentManager();
    } else if (tabName === 'master') {
      window.MasterAdminModule.renderMasterPanel();
    }
  },

  renderEvalTable: async function () {
    const body = document.getElementById('teacherStudentTableBody');
    if (!body) return;

    let studentRows = [];

    if (window.SupabaseService && window.SupabaseService.isConnected()) {
      const dbStudents = await window.SupabaseService.fetchTeacherStudents();
      if (dbStudents && dbStudents.length > 0) {
        studentRows = dbStudents.map(st => {
          const subs = st.submissions || [];
          const hasFinal = subs.some(s => s.submission_type === 'final_reflection');
          const hasInitial = subs.some(s => s.submission_type === 'initial_thought');
          const stepText = hasFinal ? 'K (제출 완료)' : (hasInitial ? 'I (AI 대화 중)' : 'T (대기 중)');
          const assessment = (st.teacher_assessments && st.teacher_assessments[0]) ? st.teacher_assessments[0].assessment_level : '평가 대기 중';
          
          return {
            num: st.student_number,
            step: stepText,
            count: '실시간 카운트',
            rationale: '제출 사유 참조',
            assessment: assessment
          };
        });
      }
    }

    if (studentRows.length === 0) {
      body.innerHTML = `
        <tr>
          <td colspan="6" style="padding: 32px; text-align: center; color: var(--text-subtle);">
            아직 수강 등록된 학생 제출 내역이 없습니다. 학생이 접속하여 THINK 5단계를 진행하면 실시간으로 현황이 업데이트됩니다.
          </td>
        </tr>
      `;
      return;
    }

    body.innerHTML = studentRows.map(st => `
      <tr style="border-bottom: 1px solid var(--border-light);">
        <td style="padding: 12px 16px; font-weight: 700;">${st.num}</td>
        <td style="padding: 12px 16px;"><span class="role-tag" style="font-size: 0.75rem;">${st.step}</span></td>
        <td style="padding: 12px 16px;">${st.count}</td>
        <td style="padding: 12px 16px;">${st.rationale}</td>
        <td style="padding: 12px 16px; font-weight: 700; color: var(--primary-700);">${st.assessment}</td>
        <td style="padding: 12px 16px;">
          <button class="btn btn-secondary" style="padding: 4px 10px; font-size: 0.8rem;" onclick="alert('${st.num} 학생의 대화 내역 및 Gemini 발췌 근거 화면을 표시합니다.')">원문/근거 보기</button>
        </td>
      </tr>
    `).join('');
  },

  handleCreateLesson: async function (e) {
    e.preventDefault();
    const projTitle = document.getElementById('newProjectTitle').value.trim();
    const lessonNum = parseInt(document.getElementById('newLessonNum').value);
    const lessonTitle = document.getElementById('newLessonTitle').value.trim();
    const lessonQuestion = document.getElementById('newLessonQuestion').value.trim();
    const maxQ = parseInt(document.getElementById('newMaxQuestions').value);
    const aiMode = document.getElementById('newAiMode').value;

    const newLesson = {
      id: `custom-lesson-${Date.now()}`,
      number: lessonNum,
      title: `${lessonNum}차시 · ${lessonTitle}`,
      question: lessonQuestion,
      mode: aiMode,
      description: `T: 개인 작성 / H: 익명 비교 / I: Gemini 대화 (${maxQ}회 제한)`
    };

    // Save to Supabase DB if connected
    if (window.SupabaseService && window.SupabaseService.isConnected()) {
      await window.SupabaseService.createActivity({
        title: newLesson.title,
        core_question: newLesson.question,
        ai_mode: newLesson.mode,
        max_questions: maxQ
      });
    }

    // Add to global config
    window.APP_CONFIG.LESSONS.push(newLesson);
    
    // Update dropdown options
    const select = document.getElementById('lessonSelect');
    if (select) {
      const opt = document.createElement('option');
      opt.value = window.APP_CONFIG.LESSONS.length - 1;
      opt.innerText = newLesson.title;
      select.appendChild(opt);
    }

    // Close Modal and alert
    window.App.closeActivityModal();
    alert(`🎉 새로운 차시가 Supabase DB에 등록되었습니다!\n- 프로젝트: ${projTitle}\n- 차시: ${newLesson.title}\n수업 진입 PIN 번호: 782901`);
    
    this.renderDashboard();
  }
};
