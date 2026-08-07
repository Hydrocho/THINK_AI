window.MasterAdminModule = {
  escapeHtml: function (value) { const el = document.createElement('div'); el.textContent = value || ''; return el.innerHTML; },
  teacherRow: function (teacher, pending) {
    const action = pending ? `<button class="btn btn-primary" onclick="MasterAdminModule.approve('${teacher.id}')">승인</button><button class="btn btn-secondary" onclick="MasterAdminModule.reject('${teacher.id}')">거절</button>` : '';
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:14px;border-bottom:1px solid var(--border-light);"><div><strong>${this.escapeHtml(teacher.display_name || '교사')}</strong><div style="font-size:.85rem;color:var(--text-subtle);">${this.escapeHtml(teacher.email || '')} · ${new Date(teacher.created_at).toLocaleDateString()}</div></div><div style="display:flex;gap:8px;">${action}</div></div>`;
  },
  renderMasterPanel: async function () {
    const container = document.getElementById('masterPendingListContainer');
    if (!container) return;
    try {
      const lists = await window.SupabaseService.fetchTeacherRequestLists();
      container.innerHTML = `<h4>승인 대기 교사 (${lists.pending.length})</h4>${lists.pending.length ? lists.pending.map(t => this.teacherRow(t, true)).join('') : '<p>승인 대기 중인 요청이 없습니다.</p>'}<h4 style="margin-top:24px;">승인된 교사 (${lists.approved.length})</h4>${lists.approved.length ? lists.approved.map(t => this.teacherRow(t, false)).join('') : '<p>승인된 교사가 없습니다.</p>'}`;
    } catch (error) { container.innerHTML = `<p style="color:var(--danger-text);">교사 목록을 불러오지 못했습니다: ${error.message}</p>`; }
  },
  approve: async function (profileId) {
    if (!confirm('이 교사 요청을 승인하시겠습니까?')) return;
    try { await window.SupabaseService.approveTeacherRequest(profileId); this.renderMasterPanel(); } catch (error) { alert(`승인 처리 오류: ${error.message}`); }
  },
  reject: async function (profileId) {
    if (!confirm('이 교사 요청을 거절하시겠습니까?')) return;
    try { await window.SupabaseService.rejectTeacherRequest(profileId); this.renderMasterPanel(); } catch (error) { alert(`거절 처리 오류: ${error.message}`); }
  }
};
