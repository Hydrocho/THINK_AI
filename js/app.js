/* ==========================================================================
   Main Application Router & Orchestrator
   ========================================================================== */

(function () {
  // Global State
  const state = {
    currentRole: 'student', // 'student' | 'teacher'
    currentLessonIndex: 0,
    currentStep: 1, // 1: T, 2: H, 3: I, 4: N, 5: K
    studentData: {
      studentNumber: '',
      remainingQuestions: 12,
      initialThought: '',
      selectedPeerOpinion: null,
      peerCriteria: 'validity',
      peerRationale: '',
      finalThought: '',
      chatMessages: []
    },
    peerOpinions: []
  };
  window.AppState = state;

  window.App = {
    init: async function () {
      this.renderCurrentStep();
      this.installThinkDraftAutosave();
      if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
      }

      // Check active Supabase auth session (e.g. after Google OAuth redirect back)
      if (window.SupabaseService && window.SupabaseService.isConnected()) {
        try {
          const session = await window.SupabaseService.getUserSession();
          if (session && session.user) {
            console.log("🔒 Active Authenticated Supabase Session Verified:", session.user.email);
            
            // 1. Check if user is a Student first
            const studentMatch = (session.user.email || '').match(/^student_(\d+)@school\.internal$/);
            if (studentMatch) {
              const studentNumber = studentMatch[1];
              let studentName = null;
              if (window.SupabaseService && window.SupabaseService.getClient()) {
                try {
                  const sb = window.SupabaseService.getClient();
                  const { data: stData } = await sb.from("student_accounts").select("student_name").eq("student_number", studentNumber).maybeSingle();
                  if (stData && stData.student_name) studentName = stData.student_name;
                } catch (e) {
                  console.warn("Student name query failed:", e.message);
                }
              }
              const { mustChangePassword } = await window.SupabaseService.getStudentPasswordChangeStatus();
              if (mustChangePassword) window.AuthModule.showStudentPasswordChange(state, studentNumber, studentName);
              else window.AuthModule.enterStudentLobby(state, studentNumber, studentName);
              return;
            }

            // 2. Otherwise handle Teacher or Admin profiles
            const profile = await window.SupabaseService.getUserProfile(session.user.id);
            const status = profile && profile.approval_status ? profile.approval_status : 'pending';

            if (status === 'rejected') {
              alert('교사 계정 요청이 거절되었습니다. 관리자에게 문의하세요.');
              await window.SupabaseService.signOut();
              return;
            }

            if (status === 'pending') {
              // Show Teacher Pending Approval Screen
              const roleTag = document.getElementById('userRoleTag');
              const userName = document.getElementById('lblUserName');
              const logoutBtn = document.getElementById('btnLogout');
              if (roleTag) roleTag.innerText = '👨‍🏫 교사 (승인 대기)';
              if (userName) userName.innerText = session.user.email || '';
              if (logoutBtn) logoutBtn.style.display = 'inline-block';
              document.getElementById('userNavArea').style.display = 'flex';

              document.getElementById('authSection').style.display = 'none';
              document.getElementById('studentLobbySection').style.display = 'none';
              document.getElementById('studentAppSection').style.display = 'none';
              document.getElementById('teacherAppSection').style.display = 'none';
              document.getElementById('teacherPendingSection').style.display = 'grid';
              return;
            }

            // Approved Teacher or Master Admin
            state.currentRole = 'teacher';
            const roleTag = document.getElementById('userRoleTag');
            const userName = document.getElementById('lblUserName');
            const logoutBtn = document.getElementById('btnLogout');
            
            const isMaster = profile && profile.role === 'admin';
            if (roleTag) roleTag.innerText = isMaster ? '🛡️ 마스터 관리자' : '👨‍🏫 교사';
            if (userName) userName.innerText = session.user.email || '인증 완료';
            if (logoutBtn) logoutBtn.style.display = 'inline-block';
            document.getElementById('userNavArea').style.display = 'flex';

            document.getElementById('authSection').style.display = 'none';
            document.getElementById('studentLobbySection').style.display = 'none';
            document.getElementById('studentAppSection').style.display = 'none';
            document.getElementById('teacherPendingSection').style.display = 'none';
            document.getElementById('teacherAppSection').style.display = 'grid';
            window.TeacherAdminModule.renderDashboard();
          } else {
            // Strict Fallback: Ensure unauthenticated users stay strictly on login screen
            document.getElementById('authSection').style.display = 'grid';
            document.getElementById('teacherAppSection').style.display = 'none';
            document.getElementById('teacherPendingSection').style.display = 'none';
            document.getElementById('studentLobbySection').style.display = 'none';
            document.getElementById('studentAppSection').style.display = 'none';
            document.getElementById('userNavArea').style.display = 'none';
          }
        } catch (e) {
          console.warn("Session check warning:", e.message);
        }
      }
    },

    // Auth Delegation
    switchAuthTab: function (role) { window.AuthModule.switchTab(role); },
    handleStudentLogin: function (e) { window.AuthModule.handleStudentLogin(e, state); },
    handleStudentPasswordChange: function (e) { window.AuthModule.handleStudentPasswordChange(e, state); },
    handleTeacherLogin: function () { window.AuthModule.handleTeacherLogin(state); },
    logout: function () { window.AuthModule.logout(); },

    // THINK Steps Navigation
    selectLesson: function (index) {
      state.currentLessonIndex = parseInt(index);
      state.currentStep = 1;
      
      const lesson = (state.activeLessonPlans && state.activeLessonPlans[state.currentLessonIndex]) || window.APP_CONFIG.LESSONS[state.currentLessonIndex];
      if (!lesson) return;

      const lblLesson = document.getElementById('currentLessonLabel');
      const projectTitle = document.getElementById('currentProjectTitle');
      const mainTitle = document.getElementById('stepMainTitle');
      if (lblLesson) lblLesson.innerText = `${lesson.number}차시 활동 진행 중`;
      if (projectTitle) projectTitle.innerText = lesson.projectTitle || '진행 중인 프로젝트';
      if (mainTitle) mainTitle.innerText = lesson.coreQuestion || lesson.core_question || lesson.question;

      this.updateStepNav();
      this.renderCurrentStep();
    },

    selectLesson: function (index) {
      state.currentLessonIndex = parseInt(index);
      state.currentStep = 1;
      
      const lesson = (state.activeLessonPlans && state.activeLessonPlans[state.currentLessonIndex]) || window.APP_CONFIG.LESSONS[state.currentLessonIndex];
      if (!lesson) return;

      const lblLesson = document.getElementById('currentLessonLabel');
      const projectTitle = document.getElementById('currentProjectTitle');
      const mainTitle = document.getElementById('stepMainTitle');
      if (lblLesson) lblLesson.innerText = `${lesson.number}차시 활동 진행 중`;
      if (projectTitle) projectTitle.innerText = lesson.projectTitle || '진행 중인 프로젝트';
      if (mainTitle) mainTitle.innerText = lesson.coreQuestion || lesson.core_question || lesson.question;

      this.updateStepNav();
      this.renderCurrentStep();
    },

    goToStep: function (stepNum) {
      state.currentStep = stepNum;
      this.updateStepNav();
      this.renderCurrentStep();
    },

    updateStepNav: function () {
      const lesson = (state.activeLessonPlans && state.activeLessonPlans[state.currentLessonIndex]) || window.APP_CONFIG.LESSONS[state.currentLessonIndex];
      const activeStages = lesson?.think_stages || lesson?.thinkStages || ['T', 'H', 'I', 'N', 'K'];

      const stageInfoMap = {
        T: { code: 'T - STEP', title: '나의 처음 생각 (Think)', name: '나의 처음 생각' },
        H: { code: 'H - STEP', title: '친구와 생각 나누기 (Human)', name: '친구와 생각 나누기' },
        I: { code: 'I - STEP', title: '인공지능과 생각 넓히기 (Interaction)', name: '인공지능과 생각 넓히기' },
        N: { code: 'N - STEP', title: '비판적으로 따져보기 (Navigation)', name: '비판적으로 따져보기' },
        K: { code: 'K - STEP', title: '나의 최종 생각 (Knowledge)', name: '나의 최종 생각' }
      };

      const listEl = document.querySelector('.think-steps-list');
      if (listEl) {
        listEl.innerHTML = activeStages.map((stageCode, idx) => {
          const stepIndex = idx + 1;
          const isActive = stepIndex === state.currentStep;
          const isCompleted = stepIndex < state.currentStep;
          const info = stageInfoMap[stageCode] || { name: stageCode, code: stageCode };
          return `
            <li class="think-step-item ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}" data-stage="${stageCode}" onclick="App.goToStep(${stepIndex})">
              <span class="step-icon-badge">${stageCode}</span>
              <span>${info.name}</span>
            </li>
          `;
        }).join('');
      }

      const currentStageCode = activeStages[state.currentStep - 1] || activeStages[0] || 'T';
      const info = stageInfoMap[currentStageCode] || { code: currentStageCode, title: currentStageCode };

      const badge = document.getElementById('stepTagBadge');
      const title = document.getElementById('stepSubTitleBadge');
      if (badge) {
        badge.innerText = `${info.code} ${state.currentStep}/${activeStages.length}`;
        badge.setAttribute('data-stage', currentStageCode);
      }
      if (title) title.innerText = info.title;
    },

    renderCurrentStep: function () {
      window.StudentThinkModule.renderStep(state);
    },

    installThinkDraftAutosave: function () {
      document.addEventListener('input', event => {
        const field = event.target;
        if (!field.matches('#txtInitialThought, #txtPeerRationale, #txtFinalThought')) return;
        const stageCode = field.id === 'txtInitialThought' ? 'T' : field.id === 'txtPeerRationale' ? 'N' : 'K';
        const key = `${state.currentLessonIndex}:${stageCode}`;
        clearTimeout(state.thinkDraftTimers.get(key));
        state.thinkDraftTimers.set(key, setTimeout(() => this.saveThinkDraft(stageCode, field.value), 3000));
        if (!state.thinkDraftMaxTimers.has(key)) {
          state.thinkDraftMaxTimers.set(key, setTimeout(async () => {
            await this.saveThinkDraft(stageCode, field.value);
            state.thinkDraftMaxTimers.delete(key);
          }, 30000));
        }
      });
      window.addEventListener('beforeunload', () => {
        ['T','N','K'].forEach(stageCode => this.saveThinkDraft(stageCode));
      });
    },
    saveThinkDraft: async function (stageCode, value) {
      const lesson = (state.activeLessonPlans && state.activeLessonPlans[state.currentLessonIndex]) || window.APP_CONFIG.LESSONS[state.currentLessonIndex];
      if (!lesson?.id || (lesson.thinkStageAccess || lesson.think_stage_access)?.[stageCode] !== 'writable') return;
      const key = `${lesson.id}:${stageCode}`;
      if (!content.trim() || state.thinkDraftLastSaved.get(key) === content) return;
      try { await window.SupabaseService.saveThinkStageResponse(lesson.id, stageCode, content); state.thinkDraftLastSaved.set(key, content); }
      catch (error) { console.warn('THINK draft autosave failed:', error.message); }
    },
    saveInitialThought: async function () {
      const el = document.getElementById('txtInitialThought');
      if (el) state.studentData.initialThought = el.value.trim();

      if (!state.studentData.initialThought) {
        alert('질문에 대한 본인의 첫 생각을 입력해 주세요.');
        return;
      }

      const lesson = (state.activeLessonPlans && state.activeLessonPlans[state.currentLessonIndex]) || window.APP_CONFIG.LESSONS[state.currentLessonIndex];
      try {
        if (window.SupabaseService && window.SupabaseService.isConnected()) await window.SupabaseService.saveThinkStageResponse(lesson.id, 'T', state.studentData.initialThought);
      } catch (error) {
        alert(`저장 중 오류가 발생했습니다: ${error.message}`);
        return;
      }
      this.goToStep(state.currentStep + 1);
    },

    selectPeerOpinion: function (id) {
      state.studentData.selectedPeerOpinion = id;
      this.renderCurrentStep();
    },

    sendChatMessage: async function () {
      const input = document.getElementById('txtChatMessage');
      if (!input) return;
      const text = input.value.trim();
      if (!text) return;

      if (state.studentData.remainingQuestions <= 0) {
        alert('선생님이 허용하신 AI 질문 횟수를 모두 사용했습니다.');
        return;
      }

      state.studentData.chatMessages.push({ role: 'user', text });
      state.studentData.remainingQuestions--;
      input.value = '';
      this.renderCurrentStep();

      const lesson = (state.activeLessonPlans && state.activeLessonPlans[state.currentLessonIndex]) || window.APP_CONFIG.LESSONS[state.currentLessonIndex];

      try {
        const reply = await window.SupabaseService.sendGeminiChat(lesson?.question || "유전자 조작", text, state.studentData.chatMessages);
        state.studentData.chatMessages.push({ role: 'ai', text: reply });
      } catch (err) {
        state.studentData.chatMessages.push({ role: 'ai', text: 'AI 응답 처리 중 오류가 발생했습니다: ' + err.message });
      }
      this.renderCurrentStep();
    },

    savePeerRationale: async function () {
      const el = document.getElementById('txtPeerRationale');
      if (el) state.studentData.peerRationale = el.value.trim();

      if (!state.studentData.peerRationale) {
        alert('해당 기준을 선택하고 판단한 이유를 작성해 주세요.');
        return;
      }

      const lesson = (state.activeLessonPlans && state.activeLessonPlans[state.currentLessonIndex]) || window.APP_CONFIG.LESSONS[state.currentLessonIndex];
      try {
        if (window.SupabaseService && window.SupabaseService.isConnected()) await window.SupabaseService.saveThinkStageResponse(lesson.id, 'N', state.studentData.peerRationale);
      } catch (error) {
        alert(`저장 중 오류가 발생했습니다: ${error.message}`);
        return;
      }
      this.goToStep(state.currentStep + 1);
    },

    submitFinalReflection: async function () {
      const el = document.getElementById('txtFinalThought');
      if (el) state.studentData.finalThought = el.value.trim();

      if (!state.studentData.finalThought) {
        alert('최종 재구성한 주장과 근거를 작성해 주세요.');
        return;
      }

      const lesson = (state.activeLessonPlans && state.activeLessonPlans[state.currentLessonIndex]) || window.APP_CONFIG.LESSONS[state.currentLessonIndex];
      try {
        if (window.SupabaseService && window.SupabaseService.isConnected()) await window.SupabaseService.saveThinkStageResponse(lesson.id, 'K', state.studentData.finalThought, { submit: true });
      } catch (error) {
        alert(`저장 중 오류가 발생했습니다: ${error.message}`);
        return;
      }
      alert('🎉 THINK 5단계 활동 제출이 완료되었습니다!\n선생님 화면에서 AI 근거 평가 및 피드백을 확인받을 수 있습니다.');
    },

    // Teacher Admin Delegation
    renderTeacherDashboard: function () { window.TeacherAdminModule.renderDashboard(); },
    showActivityModal: function () { window.ModalService.showCustom('createActivityModal', 'newProjectTitle'); },
    closeActivityModal: function () { window.ModalService.hideCustom('createActivityModal'); },
    handleCreateLesson: function (e) { window.TeacherAdminModule.handleCreateLesson(e); }
  };
})();
