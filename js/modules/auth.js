/* ==========================================================================
   Auth Module: Teacher Google Auth & Student Student Number Login
   ========================================================================== */

window.AuthModule = {
  setSessionStatus: function (status) {
    const panel = document.getElementById('authSessionStatus');
    const forms = document.getElementById('authForms');
    if (forms) forms.style.display = status ? 'none' : '';
    if (panel) panel.style.display = status ? 'block' : 'none';
    const message = document.getElementById('authSessionMessage');
    if (message) message.textContent = status === 'error'
      ? '로그인 정보를 확인하지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.'
      : '로그인 정보를 확인하고 있습니다…';
    const retry = document.getElementById('authSessionRetry');
    if (retry) retry.style.display = status === 'error' ? 'inline-block' : 'none';
  },

  switchTab: function (role) {
    const studentForm = document.getElementById('studentLoginForm');
    const teacherForm = document.getElementById('teacherLoginForm');
    const passwordChangeForm = document.getElementById('studentPasswordChangeForm');
    const tabStudent = document.getElementById('tabStudentLogin');
    const tabTeacher = document.getElementById('tabTeacherLogin');
    if (passwordChangeForm) passwordChangeForm.style.display = 'none';
    if (role === 'student') {
      if (studentForm) studentForm.style.display = 'flex';
      if (teacherForm) teacherForm.style.display = 'none';
      if (tabStudent) tabStudent.className = 'btn btn-primary';
      if (tabTeacher) tabTeacher.className = 'btn btn-secondary';
    } else {
      if (studentForm) studentForm.style.display = 'none';
      if (teacherForm) teacherForm.style.display = 'block';
      if (tabStudent) tabStudent.className = 'btn btn-secondary';
      if (tabTeacher) tabTeacher.className = 'btn btn-primary';
    }
  },

  prepareStudent: function (state, studentNumber, studentName) {
    state.currentRole = 'student';
    state.studentData.studentNumber = studentNumber;
    if (studentName) state.studentData.name = studentName;
    
    const roleTag = document.getElementById('userRoleTag');
    const userName = document.getElementById('lblUserName');
    const studentNumberLabel = document.getElementById('lblStudentNumber');
    const logoutBtn = document.getElementById('btnLogout');

    if (roleTag) {
      roleTag.innerText = '학생';
      roleTag.style.display = 'none';
    }
    if (studentNumberLabel) {
      studentNumberLabel.innerText = studentNumber || '';
      studentNumberLabel.style.display = studentNumber ? 'inline' : 'none';
    }
    if (userName) userName.innerText = state.studentData.name || studentName || '';
    if (logoutBtn) logoutBtn.style.display = 'inline-block';
    document.getElementById('userNavArea').style.display = 'flex';
  },

  enterStudentLobby: function (state, studentNumber, studentName) {
    this.prepareStudent(state, studentNumber, studentName);
    document.getElementById('authSection').style.display = 'none';
    document.getElementById('teacherAppSection').style.display = 'none';
    document.getElementById('studentAppSection').style.display = 'none';
    document.getElementById('studentLobbySection').style.display = 'grid';
    window.StudentLobbyModule.renderLobby(state);
  },

  showStudentPasswordChange: function (state, studentNumber, studentName) {
    this.prepareStudent(state, studentNumber, studentName);
    const studentForm = document.getElementById('studentLoginForm');
    const teacherForm = document.getElementById('teacherLoginForm');
    const passwordChangeForm = document.getElementById('studentPasswordChangeForm');
    if (studentForm) studentForm.style.display = 'none';
    if (teacherForm) teacherForm.style.display = 'none';
    if (passwordChangeForm) passwordChangeForm.style.display = 'flex';
    document.getElementById('authSection').style.display = 'grid';
    document.getElementById('studentLobbySection').style.display = 'none';
    document.getElementById('studentAppSection').style.display = 'none';
    document.getElementById('teacherAppSection').style.display = 'none';
    document.getElementById('inputNewStudentPw')?.focus();
  },

  handleStudentLogin: async function (e, state) {
    e.preventDefault();
    const num = document.getElementById('inputStudentNum')?.value.trim() || '';
    const pw = document.getElementById('inputStudentPw')?.value || '';
    if (!num || !pw) { alert('학번과 비밀번호를 모두 입력해 주세요.'); return; }
    if (num === '111111' && window.StudentDemo) {
      if (pw !== '111111') { alert('학생 로그인 실패: 비밀번호를 확인해 주세요.'); return; }
      await window.StudentDemo.login(state);
      return;
    }
    if (!window.SupabaseService?.isConnected()) { alert('Supabase 서버 연결 상태를 확인해 주세요.'); return; }
    try {
      const res = await window.SupabaseService.signInStudent(num, pw);
      const studentName = res?.studentName || null;
      const { mustChangePassword } = await window.SupabaseService.getStudentPasswordChangeStatus();
      if (mustChangePassword) this.showStudentPasswordChange(state, num, studentName);
      else this.enterStudentLobby(state, num, studentName);
    } catch (err) {
      alert(`학생 로그인 실패: ${err.message}`);
    }
  },

  handleStudentPasswordChange: async function (e, state) {
    e.preventDefault();
    const password = document.getElementById('inputNewStudentPw')?.value || '';
    const confirmation = document.getElementById('inputConfirmStudentPw')?.value || '';
    const message = document.getElementById('studentPasswordChangeMessage');
    const result = window.PasswordPolicy.validateStudentNewPassword(password);
    const error = !result.valid ? result.message : password !== confirmation ? '새 비밀번호가 서로 일치하지 않습니다.' : '';
    if (error) {
      message.innerText = error;
      message.style.display = 'block';
      return;
    }
    if (this.changingPassword) return;
    this.changingPassword = true;
    let passwordChanged = false;
    try {
      await window.SupabaseService.changeStudentPassword(password);
      passwordChanged = true;
      // The admin password update can invalidate the old refresh token.
      await window.SupabaseService.signInStudent(state.studentData.studentNumber, password);
      const { mustChangePassword } = await window.SupabaseService.getStudentPasswordChangeStatus();
      if (mustChangePassword) throw new Error('비밀번호 변경 상태를 다시 확인해 주세요.');
      message.style.display = 'none';
      this.enterStudentLobby(state, state.studentData.studentNumber);
    } catch (err) {
      if (passwordChanged) {
        this.switchTab('student');
        const loginPassword = document.getElementById('inputStudentPw');
        if (loginPassword) loginPassword.value = '';
        alert('비밀번호는 변경되었습니다. 변경한 새 비밀번호로 다시 로그인해 주세요.');
        return;
      }
      message.innerText = err.message;
      message.style.display = 'block';
    } finally {
      this.changingPassword = false;
      document.getElementById('inputNewStudentPw').value = '';
      document.getElementById('inputConfirmStudentPw').value = '';
    }
  },

  handleTeacherLogin: async function () {
    if (!window.SupabaseService?.isConnected()) { alert('Supabase 서버 연결 상태를 확인해 주세요.'); return; }
    try { await window.SupabaseService.signInTeacherGoogle(); }
    catch (err) { alert(`교사 Google 로그인 실패: ${err.message}`); }
  },

  logout: async function () {
    if (window.StudentDemo?.active) window.StudentDemo.end();
    else if (window.SupabaseService?.isConnected()) await window.SupabaseService.signOut();
    const userNav = document.getElementById('userNavArea');
    document.querySelector('.navbar')?.appendChild(userNav);
    userNav.style.display = 'none';
    document.querySelector('.app-container')?.classList.remove('teacher-dashboard-container');
    document.getElementById('authSection').style.display = 'grid';
    document.getElementById('studentLobbySection').style.display = 'none';
    document.getElementById('studentAppSection').style.display = 'none';
    document.getElementById('teacherAppSection').style.display = 'none';
    document.getElementById('teacherPendingSection').style.display = 'none';
    this.switchTab('student');
  }
};
