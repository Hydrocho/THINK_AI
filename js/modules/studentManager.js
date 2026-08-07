/* ==========================================================================
   Student Manager Module: Teacher Student Account Management & Batch Creation
   ========================================================================== */

window.StudentManagerModule = {
  escapeHtml: function (value) { const el = document.createElement('div'); el.textContent = value || ''; return el.innerHTML; },
  renderStudentManager: async function () {
    const tableBody = document.getElementById('studentAccountTableBody');
    if (!tableBody) return;

    if (!window.SupabaseService || !window.SupabaseService.isConnected()) {
      tableBody.innerHTML = `<tr><td colspan="5" style="padding: 24px; text-align: center; color: var(--text-subtle);">Supabase 연결 상태를 확인해 주세요.</td></tr>`;
      return;
    }

    try {
      const students = await window.SupabaseService.fetchSharedStudents();

      if (!students || students.length === 0) {
        tableBody.innerHTML = `
          <tr>
            <td colspan="5" style="padding: 32px; text-align: center; color: var(--text-subtle);">
              아직 일괄 생성된 학생 계정이 없습니다. 상단의 <strong>[+ 학생 계정 일괄 생성]</strong> 버튼을 눌러 생성해 주세요.
            </td>
          </tr>
        `;
        return;
      }

      tableBody.innerHTML = students.map(st => `
        <tr style="border-bottom: 1px solid var(--border-light);">
          <td style="padding: 12px 16px; font-weight: 700; color: var(--primary-700);">${st.student_number}</td>
          <td style="padding: 12px 16px;">${this.escapeHtml(st.student_name || '-')}</td>
          <td style="padding: 12px 16px; color: var(--text-subtle);">${new Date(st.created_at).toLocaleDateString()}</td>
          <td style="padding: 12px 16px;">
            <button class="btn btn-secondary" style="padding: 4px 10px; font-size: 0.8rem;" onclick="StudentManagerModule.resetPassword('${st.id}', '${st.student_number}')">비밀번호 재설정 🔑</button>
          </td>
        </tr>
      `).join('');
    } catch (err) {
      console.error("Student manager render error:", err);
      tableBody.innerHTML = `<tr><td colspan="5" style="padding: 24px; text-align: center; color: var(--danger-text);">학생 목록을 불러오는 중 오류가 발생했습니다.</td></tr>`;
    }
  },

  showBatchModal: function () {
    const modal = document.getElementById('batchStudentModal');
    if (modal) modal.style.display = 'flex';
  },

  closeBatchModal: function () {
    const modal = document.getElementById('batchStudentModal');
    if (modal) modal.style.display = 'none';
  },

  handleBatchCreate: async function (e) {
    e.preventDefault();
    const grade = document.getElementById('batchGradeNum').value;
    const cls = document.getElementById('batchClassNum').value.padStart(2, '0');
    const count = parseInt(document.getElementById('batchStudentCount').value);
    const pwPattern = document.getElementById('batchPwPattern').value; // 'STUDENT_NUM_EXCL' (e.g. 30201!)

    if (count < 1 || count > 50) {
      alert('학생 수는 1명 ~ 50명 사이로 설정해 주세요.');
      return;
    }

    try {
      const students = Array.from({ length: count }, (_, index) => ({ number: String(index + 1).padStart(2, '0'), name: prompt(`${grade}학년 ${cls}반 ${index + 1}번 학생 이름`, '') || '' }));
      if (students.some(student => !student.name.trim())) throw new Error('모든 학생의 이름을 입력해 주세요.');
      const result = await window.SupabaseService.batchCreateStudentAccounts({ grade: parseInt(grade), classNumber: parseInt(cls), students, passwordRule: pwPattern });
      this.closeBatchModal();
      alert(`🎉 ${grade}학년 ${cls}반 학생 계정 ${count}개가 성공적으로 생성되었습니다!\n초기 비밀번호 규칙: ${pwPattern === 'STUDENT_NUM_EXCL' ? '학번 + ! (예: 30201!)' : '123456'}`);
      this.renderStudentManager();
    } catch (err) {
      alert(`❌ 학생 계정 일괄 생성 오류: ${err.message}`);
    }
  },

  resetPassword: async function (studentId, studentNum) {
    const newPw = prompt(`${studentNum} 학생의 새 비밀번호를 입력하세요:`, `${studentNum}!`);
    if (!newPw) return;

    try {
      await window.SupabaseService.resetStudentPassword(studentId, newPw);
      alert(`🔑 ${studentNum} 학생의 비밀번호가 성공적으로 변경되었습니다.`);
    } catch (err) {
      alert(`❌ 비밀번호 변경 오류: ${err.message}`);
    }
  },

  exportCSV: function () {
    alert('📄 학급 학생 계정 명단 및 비밀번호 배포표(CSV)를 다운로드합니다.');
  }
};
