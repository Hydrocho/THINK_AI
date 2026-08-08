/* ==========================================================================
   Student Manager Module: Teacher Student Account Management & Batch Creation
   ========================================================================== */

window.StudentManagerModule = {
  rosterRows: [],
  cachedStudents: [],
  selectedClassFilter: 'ALL',

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

  getClassLabelFromStudentNumber: function (studentNumber) {
    if (!studentNumber || studentNumber.length < 5) return '미배정';
    const grade = parseInt(studentNumber[0]);
    const classNum = parseInt(studentNumber.substring(1, 3));
    if (isNaN(grade) || isNaN(classNum)) return '미배정';
    return `${grade}학년 ${classNum}반`;
  },

  filterStudentsByClass: function (filterVal) {
    this.selectedClassFilter = filterVal;
    this.renderStudentTable();
  },

  populateClassFilterDropdown: async function () {
    const select = document.getElementById('selStudentClassFilter');
    if (!select) return;

    try {
      const client = window.SupabaseService.getClient();
      const { data: classes } = await client.from('classes').select('*').order('class_code');

      let optionsHtml = '<option value="ALL">🏫 전체 학급 보기</option>';
      if (classes && classes.length > 0) {
        optionsHtml += classes.map(c => `
          <option value="${c.grade_number}${c.class_number < 10 ? '0' + c.class_number : c.class_number}" ${this.selectedClassFilter === `${c.grade_number}${c.class_number < 10 ? '0' + c.class_number : c.class_number}` ? 'selected' : ''}>
            🏫 ${c.grade_number}학년 ${c.class_number}반
          </option>
        `).join('');
      }
      select.innerHTML = optionsHtml;
    } catch (err) {
      console.warn("Notice populating class filter:", err);
    }
  },

  renderStudentManager: async function () {
    const tableBody = document.getElementById('studentAccountTableBody');
    if (!tableBody) return;

    if (!window.SupabaseService || !window.SupabaseService.isConnected()) {
      tableBody.innerHTML = `<tr><td colspan="5" style="padding: 24px; text-align: center; color: var(--text-subtle);">Supabase 연결 상태를 확인해 주세요.</td></tr>`;
      return;
    }

    try {
      this.cachedStudents = await window.SupabaseService.fetchSharedStudents();
      await this.populateClassFilterDropdown();
      this.renderStudentTable();
    } catch (err) {
      console.error("Student manager render error:", err);
      tableBody.innerHTML = `<tr><td colspan="5" style="padding: 24px; text-align: center; color: var(--danger-text);">학생 목록을 불러오는 중 오류가 발생했습니다.</td></tr>`;
    }
  },

  renderStudentTable: function () {
    const tableBody = document.getElementById('studentAccountTableBody');
    if (!tableBody) return;

    let filtered = this.cachedStudents || [];
    if (this.selectedClassFilter && this.selectedClassFilter !== 'ALL') {
      filtered = filtered.filter(st => (st.student_number || '').startsWith(this.selectedClassFilter));
    }

    if (!filtered || filtered.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="5" style="padding: 32px; text-align: center; color: var(--text-subtle);">
            ${this.selectedClassFilter !== 'ALL' ? '선택하신 학급에 해당되는 학생 계정이 없습니다.' : '아직 일괄 생성된 학생 계정이 없습니다. 상단의 <strong>[+ 학생 계정 일괄 생성]</strong> 버튼을 눌러 생성해 주세요.'}
          </td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = filtered.map(st => {
      const classLabel = this.getClassLabelFromStudentNumber(st.student_number);
      return `
        <tr style="border-bottom: 1px solid var(--border-light);">
          <td style="padding: 12px 16px; font-weight: 700; color: var(--primary-700);">${st.student_number}</td>
          <td style="padding: 12px 16px;">${this.escapeHtml(st.student_name || '-')}</td>
          <td style="padding: 12px 16px;"><span class="role-tag" style="font-size: 0.8rem; background: var(--primary-50); color: var(--primary-800); border: 1px solid var(--primary-200);">${classLabel}</span></td>
          <td style="padding: 12px 16px; color: var(--text-subtle);">${new Date(st.created_at).toLocaleDateString()}</td>
          <td style="padding: 12px 16px; display: flex; gap: 6px; align-items: center;">
            <button class="btn btn-secondary" style="padding: 4px 10px; font-size: 0.8rem;" onclick="StudentManagerModule.resetPassword('${st.id}', '${st.student_number}')" title="비밀번호 초기화">비밀번호 재설정 🔑</button>
            <button class="btn btn-secondary" style="padding: 4px 10px; font-size: 0.8rem; color: var(--danger-text);" onclick="StudentManagerModule.deleteStudent('${st.id}', '${st.student_number}', '${this.escapeHtml(st.student_name || '')}')" title="학생 계정 및 제출 자료 영구 삭제">학생 삭제 🗑️</button>
          </td>
        </tr>
      `;
    }).join('');
  },

  deleteStudent: async function (studentId, studentNum, studentName) {
    const approved = await window.ModalService.confirm({
      title: '⚠️ 학생 계정 및 자료 영구 삭제',
      message: `${studentNum} (${studentName || '학생'})의 계정과 함께 해당 학생이 제출한 THINK 5단계 생각, AI 대화 내역, 동료 평가 등 모든 데이터가 영구히 삭제됩니다.\n\n정말로 삭제하시겠습니까?`,
      tone: 'danger',
      confirmLabel: '영구 삭제'
    });
    if (!approved) return;

    try {
      await window.SupabaseService.deleteStudentAccount(studentId);
      await window.ModalService.alert({
        title: '삭제 완료',
        message: `${studentNum} 학생 계정 및 모든 제출 자료가 영구히 삭제되었습니다.`,
        tone: 'success'
      });
      await this.renderStudentManager();
    } catch (err) {
      console.error('Delete student error:', err);
      await window.ModalService.alert({
        title: '삭제 실패',
        message: `학생 계정 삭제 중 오류가 발생했습니다: ${err.message}`,
        tone: 'danger'
      });
    }
  },

  showBatchModal: function () { window.ModalService.showCustom('batchStudentModal', 'batchRosterText'); },

  closeBatchModal: function () {
    const modal = document.getElementById('batchStudentModal');
    if (modal) {
      modal.hidden = true;
      modal.style.display = 'none';
    }
    window.ModalService.hideCustom('batchStudentModal');
  },

  handleBatchCreate: async function (e) {
    e.preventDefault();
    const valid = this.rosterRows.filter(row => row.valid);
    if (!valid.length) return;
    const grade = valid[0].grade;
    const cls = valid[0].classNumber;
    if (valid.some(row => row.grade !== grade || row.classNumber !== cls)) {
      await window.ModalService.alert({ title: '학년/반 혼합 등록 제한', message: '한 번에 같은 학년·반 명단만 등록할 수 있습니다.', tone: 'info' });
      return;
    }

    const btn = document.getElementById('batchCreateButton');
    if (btn) { btn.disabled = true; btn.innerText = '계정 생성 중...'; }

    try {
      const students = valid.map(row => ({ number: row.number, name: row.name }));
      const result = await window.SupabaseService.batchCreateStudentAccounts({ grade, classNumber: cls, students });

      const createdCount = result?.students?.length || valid.length;

      // 1. Reset batch creation input fields & preview
      const inputEl = document.getElementById('batchRosterText');
      if (inputEl) inputEl.value = '';
      const previewEl = document.getElementById('batchRosterPreview');
      if (previewEl) previewEl.innerHTML = '';
      this.rosterRows = [];

      // 2. Restore button state immediately
      if (btn) { btn.disabled = false; btn.innerText = '학생 계정 생성'; }

      // 3. Close the batch creation modal FIRST so it doesn't block the screen
      this.closeBatchModal();

      // 4. Refresh student table list immediately
      this.renderStudentManager();

      // 5. Show clean success dialog popup without modal collision
      setTimeout(async () => {
        await window.ModalService.alert({
          title: '🎉 학생 계정 일괄 생성 완료',
          message: `${grade}학년 ${cls}반 학생 계정 ${createdCount}개가 성공적으로 생성되었습니다.\n(초기 비밀번호: 000000)`,
          tone: 'success'
        });
      }, 50);

    } catch (err) {
      console.error('Failed to create batch student accounts:', err);
      if (btn) { btn.disabled = false; btn.innerText = '학생 계정 생성'; }
      this.closeBatchModal();

      setTimeout(async () => {
        await window.ModalService.alert({
          title: '생성 실패',
          message: `학생 계정 일괄 생성 중 오류가 발생했습니다: ${err.message}`,
          tone: 'danger'
        });
      }, 50);
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
