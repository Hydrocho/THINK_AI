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

  window.App = {
    init: async function () {
      this.renderCurrentStep();
      if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
      }

      // Check active Supabase auth session (e.g. after Google OAuth redirect back)
      if (window.SupabaseService && window.SupabaseService.isConnected()) {
        try {
          const session = await window.SupabaseService.getUserSession();
          if (session && session.user) {
            console.log("🔒 Active Authenticated Supabase Session Verified:", session.user.email);
            
            const profile = await window.SupabaseService.getUserProfile(session.user.id);
            // Default to 'pending' if profile is not explicitly approved
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
    handleTeacherLogin: function () { window.AuthModule.handleTeacherLogin(state); },
    logout: function () { window.AuthModule.logout(); },

    // Student Lobby Delegation
    enterLessonByPin: function () { window.StudentLobbyModule.enterByPin(state); },
    enterActiveLesson: function () { window.StudentLobbyModule.enterActiveLesson(state); },

    // THINK Steps Navigation
    selectLesson: function (index) {
      state.currentLessonIndex = parseInt(index);
      state.currentStep = 1;
      
      const lesson = window.APP_CONFIG.LESSONS[state.currentLessonIndex];
      if (!lesson) return;

      const lblLesson = document.getElementById('currentLessonLabel');
      const lblTitle = document.getElementById('lessonTitleDisplay');
      if (lblLesson) lblLesson.innerText = `${lesson.number}차시 활동 진행 중`;
      if (lblTitle) lblTitle.innerText = lesson.question;

      this.updateStepNav();
      this.renderCurrentStep();
    },

    goToStep: function (stepNum) {
      state.currentStep = stepNum;
      this.updateStepNav();
      this.renderCurrentStep();
    },

    updateStepNav: function () {
      for (let i = 1; i <= 5; i++) {
        const item = document.getElementById(`stepNavItem-${i}`);
        if (item) {
          if (i === state.currentStep) item.className = 'think-step-item active';
          else if (i < state.currentStep) item.className = 'think-step-item completed';
          else item.className = 'think-step-item';
        }
      }

      const stepCodes = ['T - STEP 1', 'H - STEP 2', 'I - STEP 3', 'N - STEP 4', 'K - STEP 5'];
      const stepTitles = [
        '1단계 · 개인 사고 형성 (Think)',
        '2단계 · 인간 협력 - 동료 의견 비교 (Human Collaboration)',
        '3단계 · AI 협업 - Gemini 대화 (AI Interaction)',
        '4단계 · 인간 중심 검증과 종합 (Navigation & Synthesis)',
        '5단계 · 개인 재구성과 내면화 (Knowledge Restructuring)'
      ];

      const badge = document.getElementById('stepCodeBadge');
      const title = document.getElementById('stepTitleText');
      if (badge) badge.innerText = stepCodes[state.currentStep - 1];
      if (title) title.innerText = stepTitles[state.currentStep - 1];
    },

    renderCurrentStep: function () {
      window.StudentThinkModule.renderStep(state);
    },

    // Student Actions
    saveInitialThought: function () {
      const el = document.getElementById('txtInitialThought');
      if (el) state.studentData.initialThought = el.value.trim();

      if (!state.studentData.initialThought) {
        alert('질문에 대한 본인의 첫 생각을 입력해 주세요.');
        return;
      }

      const lesson = window.APP_CONFIG.LESSONS[state.currentLessonIndex];
      if (window.SupabaseService && window.SupabaseService.isConnected()) {
        window.SupabaseService.saveSubmission(lesson.id || "activity-1", state.studentData.studentNumber, "initial_thought", state.studentData.initialThought);
      }
      this.goToStep(2);
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
        alert('설정된 질문 횟수 제한에 도달했습니다.');
        return;
      }

      state.studentData.chatMessages.push({ role: 'user', text: text });
      state.studentData.remainingQuestions--;
      input.value = '';

      this.renderCurrentStep();

      const lesson = window.APP_CONFIG.LESSONS[state.currentLessonIndex];
      
      // Real Gemini API Call via Supabase Service
      if (window.SupabaseService) {
        const res = await window.SupabaseService.sendGeminiChat(
          window.APP_CONFIG.PROJECT_TITLE,
          lesson.question,
          text,
          state.studentData.chatMessages
        );

        if (res && res.reply) {
          state.studentData.chatMessages.push({ role: 'ai', text: res.reply });
          this.renderCurrentStep();
          const box = document.getElementById('chatMessagesBox');
          if (box) box.scrollTop = box.scrollHeight;
        }
      }
    },

    savePeerRationale: function () {
      const el = document.getElementById('txtPeerRationale');
      if (el) state.studentData.peerRationale = el.value.trim();

      if (!state.studentData.peerRationale) {
        alert('해당 기준을 선택하고 판단한 이유를 작성해 주세요.');
        return;
      }

      const lesson = window.APP_CONFIG.LESSONS[state.currentLessonIndex];
      if (window.SupabaseService && window.SupabaseService.isConnected()) {
        window.SupabaseService.savePeerReview(lesson.id || "activity-1", state.studentData.studentNumber, state.studentData.peerCriteria, state.studentData.peerRationale);
      }
      this.goToStep(5);
    },

    submitFinalReflection: function () {
      const el = document.getElementById('txtFinalThought');
      if (el) state.studentData.finalThought = el.value.trim();

      if (!state.studentData.finalThought) {
        alert('최종 재구성한 주장과 근거를 작성해 주세요.');
        return;
      }

      const lesson = window.APP_CONFIG.LESSONS[state.currentLessonIndex];
      if (window.SupabaseService && window.SupabaseService.isConnected()) {
        window.SupabaseService.saveSubmission(lesson.id || "activity-1", state.studentData.studentNumber, "final_reflection", state.studentData.finalThought);
      }
      alert('🎉 THINK 5단계 활동 제출이 완료되었습니다!\n선생님 화면에서 AI 근거 평가 및 피드백을 확인받을 수 있습니다.');
    },

    // Teacher Admin Delegation
    renderTeacherDashboard: function () { window.TeacherAdminModule.renderDashboard(); },
    showActivityModal: function () { document.getElementById('createActivityModal').style.display = 'flex'; },
    closeActivityModal: function () { document.getElementById('createActivityModal').style.display = 'none'; },
    handleCreateLesson: function (e) { window.TeacherAdminModule.handleCreateLesson(e); }
  };
})();
