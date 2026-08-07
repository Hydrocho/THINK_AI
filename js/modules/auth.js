/* ==========================================================================
   Auth Module: Teacher Google Auth & Student Student Number Login
   ========================================================================== */

window.AuthModule = {
  switchTab: function (role) {
    const studentForm = document.getElementById('studentLoginForm');
    const teacherForm = document.getElementById('teacherLoginForm');
    const tabStudent = document.getElementById('tabStudentLogin');
    const tabTeacher = document.getElementById('tabTeacherLogin');

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

  handleStudentLogin: async function (e, state) {
    e.preventDefault();
    const numInput = document.getElementById('inputStudentNum');
    const pwInput = document.getElementById('inputStudentPw');
    const num = numInput ? numInput.value.trim() : '';
    const pw = pwInput ? pwInput.value.trim() : '';

    if (!num || !pw) {
      alert('학번과 비밀번호를 모두 입력해 주세요.');
      return;
    }

    // Call Supabase Auth
    if (window.SupabaseService && window.SupabaseService.isConnected()) {
      try {
        await window.SupabaseService.signInStudent(num, pw);
      } catch (err) {
        alert(`❌ 학생 로그인 실패: ${err.message}`);
        return; // Halt execution: do NOT bypass auth!
      }
    } else {
      alert('⚠️ Supabase 서버에 연결되어 있지 않습니다. js/supabase-keys.js 설정을 확인해 주세요.');
      return;
    }

    state.currentRole = 'student';
    state.studentData.studentNumber = num;

    const roleTag = document.getElementById('userRoleTag');
    const userName = document.getElementById('lblUserName');
    const logoutBtn = document.getElementById('btnLogout');
    if (roleTag) roleTag.innerText = '👨‍🎓 학생';
    if (userName) userName.innerText = `${num}번`;
    if (logoutBtn) logoutBtn.style.display = 'inline-block';
    document.getElementById('userNavArea').style.display = 'flex';

    document.getElementById('authSection').style.display = 'none';
    document.getElementById('teacherAppSection').style.display = 'none';
    document.getElementById('studentAppSection').style.display = 'none';
    document.getElementById('studentLobbySection').style.display = 'grid';

    const grade = num.length >= 5 ? num.charAt(0) : '3';
    const cls = num.length >= 5 ? parseInt(num.substring(1, 3)) : '2';
    const sNo = num.length >= 5 ? parseInt(num.substring(3, 5)) : num;

    document.getElementById('lblWelcomeStudent').innerText = `👋 안녕하세요, ${grade}학년 ${cls}반 ${sNo}번 (${num}) 학생!`;
    window.StudentLobbyModule.renderLobby(state);
  },

  handleTeacherLogin: async function (state) {
    if (!window.SupabaseService || !window.SupabaseService.isConnected()) {
      alert('⚠️ Supabase 서버에 연결되어 있지 않습니다. js/supabase-keys.js 설정을 확인해 주세요.');
      return;
    }

    try {
      // Trigger Google OAuth redirection strictly without showing dashboard first
      await window.SupabaseService.signInTeacherGoogle();
    } catch (err) {
      alert(`❌ 교사 Google 로그인 실패: ${err.message}\n\nGoogle Cloud Console 및 Supabase Authentication Providers 연동을 확인해 주세요.`);
    }
  },

  logout: async function () {
    if (window.SupabaseService && window.SupabaseService.isConnected()) {
      await window.SupabaseService.signOut();
    }

    document.getElementById('userNavArea').style.display = 'none';
    document.getElementById('authSection').style.display = 'grid';
    document.getElementById('studentLobbySection').style.display = 'none';
    document.getElementById('studentAppSection').style.display = 'none';
    document.getElementById('teacherAppSection').style.display = 'none';
    document.getElementById('teacherPendingSection').style.display = 'none';
  }
};
