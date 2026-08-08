/* ==========================================================================
   Student Manager Module: Teacher Student Account Management & Batch Creation
   ========================================================================== */

window.StudentManagerModule = {
  rosterRows: [],
  previewRoster: async function () {
    const text = document.getElementById('batchRosterText').value;
    const existing = new Set((await window.SupabaseService.fetchSharedStudents()).map(student => student.student_number));
    this.rosterRows = window.RosterParser.parse(text, existing);
    const preview = document.getElementById('batchRosterPreview');
    const valid = this.rosterRows.filter(row => row.valid);
    preview.innerHTML = this.rosterRows.map(row => `<div style="color:${row.valid ? 'var(--success-text)' : 'var(--danger-text)'};">${this.escapeHtml(row.studentNumber || '오류')} · ${this.escapeHtml(row.name || '-')}${row.reason ? ` — ${row.reason}` : ''}</div>`).join('');
    document.getElementById('batchCreateButton').disabled = valid.length === 0;
  },
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

  showBatchModal: function () { window.ModalService.showCustom('batchStudentModal', 'batchRosterText'); },

  closeBatchModal: function () { window.ModalService.hideCustom('batchStudentModal'); },

  handleBatchCreate: async function (e) {
    e.preventDefault();
    const valid = this.rosterRows.filter(row => row.valid);
    if (!valid.length) return;
    const grade = valid[0].grade;
    const cls = valid[0].classNumber;
    if (valid.some(row => row.grade !== grade || row.classNumber !== cls)) { alert('한 번에 같은 학년·반 명단만 등록할 수 있습니다.'); return; }

    try {
      const students = valid.map(row => ({ number: row.number, name: row.name }));
      const result = await window.SupabaseService.batchCreateStudentAccounts({ grade, classNumber: cls, students });
      this.closeBatchModal();
      alert(`🎉 ${grade}학년 ${cls}반 학생 계정 ${result.students.length}개가 생성되었습니다.`);
      this.renderStudentManager();
    } catch (err) {
      alert(`❌ 학생 계정 일괄 생성 오류: ${err.message}`);
    }
  },

  resetPassword: async function (studentId, studentNum) {
    if (!confirm(`${studentNum} 학생의 비밀번호를 000000으로 초기화할까요?\n학생은 다음 로그인에서 새 비밀번호를 설정해야 합니다.`)) return;

    try {
      await window.SupabaseService.resetStudentPassword(studentId);
      alert(`🔑 ${studentNum} 학생의 비밀번호가 000000으로 초기화되었습니다.`);
    } catch (err) {
      alert(`❌ 비밀번호 변경 오류: ${err.message}`);
    }
  },

  exportCSV: function () {
    alert('📄 학급 학생 계정 명단 및 비밀번호 배포표(CSV)를 다운로드합니다.');
  }
};

window.StudentManagerModule.resetPassword = async function (studentId, studentNum) {
  const approved = await window.ModalService.confirm({
    title: '학생 비밀번호 재설정',
    message: `${studentNum} 학생의 비밀번호를 000000으로 초기화합니다. 다음 로그인 시 변경이 필요합니다.`,
    tone: 'danger', confirmLabel: '재설정'
  });
  if (!approved) return;
  try {
    await window.SupabaseService.resetStudentPassword(studentId);
    await window.ModalService.alert({ title: '비밀번호 재설정 완료', message: `${studentNum} 학생의 비밀번호를 초기화했습니다.`, tone: 'success' });
  } catch (err) {
    await window.ModalService.alert({ title: '비밀번호 재설정 실패', message: err.message, tone: 'danger' });
  }
};
