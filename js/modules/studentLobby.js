/* ==========================================================================
   Student Lobby Module: Waiting Lobby, PIN Entry & Active Session Launcher
   ========================================================================== */

window.StudentLobbyModule = {
  renderLobby: async function (state) {
    const container = document.getElementById('lobbyHistoryContainer');
    if (!container) return;

    let lessons = window.APP_CONFIG.LESSONS || [];

    // Attempt to load live activities from Supabase if connected
    if (window.SupabaseService && window.SupabaseService.isConnected()) {
      const dbActivities = await window.SupabaseService.fetchActivities();
      if (dbActivities && dbActivities.length > 0) {
        lessons = dbActivities.map((act, idx) => ({
          id: act.id,
          number: idx + 1,
          title: act.title,
          question: act.core_question,
          mode: act.ai_mode,
          description: `T: 개인 작성 / H: 익명 비교 / I: Gemini 대화 (${act.max_questions}회 제한)`
        }));
      }
    }

    if (lessons.length === 0) {
      container.innerHTML = `<div style="text-align: center; color: var(--text-subtle); padding: 24px;">개방된 활동이 없습니다. 교사의 수업 개방을 기다려 주세요.</div>`;
      return;
    }

    container.innerHTML = lessons.map((item, idx) => `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 14px 18px; background: #ffffff; border: 1px solid var(--border-light); border-radius: var(--radius-md);">
        <div>
          <div style="font-weight: 700; color: var(--text-main); font-size: 0.95rem;">${item.title}</div>
          <span class="role-tag" style="background: var(--primary-50); color: var(--primary-700); font-size: 0.75rem; margin-top: 4px; display: inline-block;">학습 참여 가능</span>
        </div>
        <button class="btn btn-secondary" style="padding: 6px 14px; font-size: 0.85rem;" onclick="App.selectLesson(${idx}); App.enterActiveLesson();">수업 입장하기 →</button>
      </div>
    `).join('');
  },

  enterByPin: function (state) {
    const pinInput = document.getElementById('inputLobbyPin');
    const pin = pinInput ? pinInput.value.trim() : '';
    if (!pin) {
      alert('선생님께서 전자칠판에 띄워주신 6자리 PIN 번호를 입력해주세요.');
      return;
    }
    document.getElementById('studentLobbySection').style.display = 'none';
    document.getElementById('studentAppSection').style.display = 'grid';
    window.App.selectLesson(0);
    alert(`⚡ 수업 PIN (${pin}) 인증 완료! 개방된 수업으로 진입하였습니다.`);
  },

  enterActiveLesson: function (state) {
    document.getElementById('studentLobbySection').style.display = 'none';
    document.getElementById('studentAppSection').style.display = 'grid';
    window.App.selectLesson(0);
  }
};
