/* ==========================================================================
   Auth Module: Teacher Google Auth & Student Student Number Login
   ========================================================================== */

window.AuthModule = {
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

  prepareStudent: function (state, studentNumber) {
    state.currentRole = 'student';
    state.studentData.studentNumber = studentNumber;
    const roleTag = document.getElementById('userRoleTag');
    const userName = document.getElementById('lblUserName');
    const logoutBtn = document.getElementById('btnLogout');

    const grade = studentNumber.length >= 5 ? studentNumber.charAt(0) : '3';
    const cls = studentNumber.length >= 5 ? parseInt(studentNumber.substring(1, 3)) : '1';
    const sNo = studentNumber.length >= 5 ? parseInt(studentNumber.substring(3, 5)) : studentNumber;

    if (roleTag) roleTag.innerText = '학생';
    if (userName) userName.innerText = `${grade}학년 ${cls}반 ${sNo}번 (${studentNumber})`;
    if (logoutBtn) logoutBtn.style.display = 'inline-block';
    document.getElementById('userNavArea').style.display = 'flex';
  },

  enterStudentLobby: function (state, studentNumber) {
    this.prepareStudent(state, studentNumber);
    document.getElementById('authSection').style.display = 'none';
    document.getElementById('teacherAppSection').style.display = 'none';
    document.getElementById('studentAppSection').style.display = 'none';
    document.getElementById('studentLobbySection').style.display = 'grid';
    document.getElementById('lblWelcomeStudent').innerText = `👋 반갑습니다!`;
    window.StudentLobbyModule.renderLobby(state);
  },

  showStudentPasswordChange: function (state, studentNumber) {
    this.prepareStudent(state, studentNumber);
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
    if (!window.SupabaseService?.isConnected()) { alert('Supabase 서버 연결 상태를 확인해 주세요.'); return; }
    try {
      await window.SupabaseService.signInStudent(num, pw);
      const { mustChangePassword } = await window.SupabaseService.getStudentPasswordChangeStatus();
      if (mustChangePassword) this.showStudentPasswordChange(state, num);
      else this.enterStudentLobby(state, num);
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
    try {
      await window.SupabaseService.changeStudentPassword(password);
      message.style.display = 'none';
      this.enterStudentLobby(state, state.studentData.studentNumber);
    } catch (err) {
      message.innerText = err.message;
      message.style.display = 'block';
    }
  },

  handleTeacherLogin: async function () {
    if (!window.SupabaseService?.isConnected()) { alert('Supabase 서버 연결 상태를 확인해 주세요.'); return; }
    try { await window.SupabaseService.signInTeacherGoogle(); }
    catch (err) { alert(`교사 Google 로그인 실패: ${err.message}`); }
  },

  logout: async function () {
    if (window.SupabaseService?.isConnected()) await window.SupabaseService.signOut();
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
