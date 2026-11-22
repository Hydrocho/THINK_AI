/* ==========================================================================
   Student THINK Workflow Module: Dynamic T, H, I, N, K Steps Controller
   ========================================================================== */

/* ------------------------------------------------------------------
   헬퍼: 단계 배너 HTML
   code  - 'T' | 'H' | 'I' | 'N' | 'K'
   icon  - 이모지
   title - 단계 제목
   desc  - 한 줄 안내 문구
------------------------------------------------------------------ */
function _stageBanner(code, icon, title, desc) {
  return `
    <div class="stage-banner stage-banner--${code}">
      <div class="stage-banner__icon">${icon}</div>
      <div class="stage-banner__body">
        <div class="stage-banner__label">${code} 단계</div>
        <div class="stage-banner__title">${title}</div>
        <div class="stage-banner__desc">${desc}</div>
      </div>
      <span class="stage-badge">${code}</span>
    </div>`;
}

/* ------------------------------------------------------------------
   헬퍼: 하단 이전/다음 버튼 행 HTML
   prevIdx    - 이전 단계 번호 (isFirst=true면 미노출)
   nextLabel  - 오른쪽 버튼 텍스트
   nextAction - 오른쪽 버튼 onclick 값 (빈 문자열이면 disabled)
   stageCode  - 단계 코드 → btn-stage-X 클래스 적용
   isFirst    - true면 이전 버튼 없이 오른쪽 정렬
------------------------------------------------------------------ */
function _navRow(prevIdx, nextLabel, nextAction, stageCode, isFirst) {
  const prevBtn = !isFirst
    ? `<button class="btn btn-secondary" onclick="App.goToStep(${prevIdx})">← 이전 단계</button>`
    : '';
  const disabled = !nextAction ? 'disabled' : '';
  const onclick = nextAction ? `onclick="${nextAction}"` : '';
  const nextBtn = `<button class="btn btn-stage-${stageCode}" ${onclick} ${disabled}>${nextLabel}</button>`;
  return `<div style="display:flex; justify-content:${isFirst ? 'flex-end' : 'space-between'}; margin-top:8px;">${prevBtn}${nextBtn}</div>`;
}

window.StudentThinkModule = {
  renderStep: function (state) {
    const container = document.getElementById('stepContentContainer');
    if (!container) return;

    const sampleLessons = window.APP_CONFIG?.LESSONS || [];
    const lesson = (state.activeLessonPlans && state.activeLessonPlans[state.currentLessonIndex])
      || sampleLessons[state.currentLessonIndex]
      || { number: 1, title: '1주제', question: '질문 데이터를 불러오는 중입니다.' };

    const questionText = lesson.coreQuestion || lesson.core_question || lesson.question || '질문 내용이 등록되지 않았습니다.';
    const activeStages = lesson.thinkStages || lesson.think_stages || ['T', 'H', 'I', 'N', 'K'];
    const currentStageCode = activeStages[state.currentStep - 1] || activeStages[0] || 'T';
    const accessMode = lesson.thinkStageAccess?.[currentStageCode] || lesson.think_stage_access?.[currentStageCode] || 'hidden';

    if (accessMode === 'hidden') {
      container.innerHTML = `
        <div class="question-card" style="text-align:center; padding:48px 24px;">
          <div style="font-size:2rem;">🔒</div>
          <strong>아직 열리지 않은 활동입니다.</strong>
          <p style="color:var(--text-subtle); margin-top:8px;">교사가 이 THINK 단계를 열면 참여할 수 있습니다.</p>
        </div>`;
      return;
    }

    const isFirstStep = state.currentStep === 1;
    const isLastStep = state.currentStep === activeStages.length;
    const prevStepIndex = state.currentStep - 1;
    const nextStepIndex = state.currentStep + 1;

    switch (currentStageCode) {

      /* ------------------------------------------------------------------ */
      case 'T': // T: 나의 처음 생각
        container.innerHTML = `
          <div style="display:flex; flex-direction:column; gap:20px;">
            ${_stageBanner('T', '✏️', '나의 처음 생각', '아직 아무것도 조사하지 않은 솔직한 첫 생각을 작성하세요. 틀려도 괜찮습니다.')}
            <div class="form-group">
              <label class="form-label">나의 초기 생각 작성</label>
              <textarea id="txtInitialThought" class="form-textarea"
                placeholder="질문에 대한 본인의 첫 번째 생각을 솔직하게 작성해 보세요.">${state.studentData.initialThought}</textarea>
            </div>
            ${_navRow(prevStepIndex, '저장하고 다음으로 →', 'App.saveInitialThought()', 'T', isFirstStep)}
          </div>`;
        break;

      /* ------------------------------------------------------------------ */
      case 'H': // H: 친구와 생각 나누기
        {
          const peerOpinions = state.peerOpinions || [];
          const selectedId = state.studentData.selectedPeerOpinion;

          if (peerOpinions.length === 0) {
            /* 대기 화면 */
            container.innerHTML = `
              <div style="display:flex; flex-direction:column; gap:20px;">
                ${_stageBanner('H', '🤝', '친구와 생각 나누기', '선생님이 친구들의 초기 의견을 수집하고 배정할 때까지 잠시 기다려 주세요.')}
                <div class="h-waiting-state">
                  <div class="h-waiting-spinner"></div>
                  <div class="h-waiting-title">의견 수집 중...</div>
                  <div class="h-waiting-sub">
                    선생님이 학급 의견 수집을 완료하면 무작위로 배정됩니다.<br>
                    잠시 후 새로고침해 보세요.
                  </div>
                  <button class="btn btn-secondary" onclick="location.reload()" style="margin-top:12px;">🔄 새로고침</button>
                </div>
                ${_navRow(prevStepIndex, '다음으로 →', `App.goToStep(${nextStepIndex})`, 'H', isFirstStep)}
              </div>`;
          } else {
            /* 의견 선택 화면 */
            const selectedIdx = peerOpinions.findIndex(o => o.id === selectedId);
            const selectedLabel = selectedIdx >= 0
              ? '의견 ' + String.fromCharCode(65 + selectedIdx)
              : null;

            container.innerHTML = `
              <div style="display:flex; flex-direction:column; gap:20px;">
                ${_stageBanner('H', '🤝', '친구와 생각 나누기', '아래 4가지 익명 의견을 차분히 읽고, 가장 설득력 있는 것을 하나 선택하세요.')}

                <div class="card-grid-2">
                  ${peerOpinions.map((opt, i) => `
                    <div class="option-card ${selectedId === opt.id ? 'selected' : ''}"
                         onclick="App.selectPeerOpinion('${opt.id}')">
                      <div class="option-header">
                        <span class="option-letter">의견 ${String.fromCharCode(65 + i)}</span>
                        <span class="option-anon-badge">🔒 익명</span>
                        <span class="option-check-mark">✓ 선택됨</span>
                      </div>
                      <div class="option-body">${opt.text}</div>
                    </div>
                  `).join('')}
                </div>

                ${selectedLabel
                ? `<div class="h-selection-summary">✅ <strong>${selectedLabel}</strong>을(를) 선택했습니다.</div>`
                : `<div class="h-selection-summary h-selection-summary--empty">👆 위의 카드 중 하나를 선택하면 다음 단계로 이동할 수 있습니다.</div>`
              }

                ${_navRow(prevStepIndex,
                '다음으로 →',
                selectedId ? `App.goToStep(${nextStepIndex})` : '',
                'H',
                isFirstStep)}
              </div>`;
          }
        }
        break;

      /* ------------------------------------------------------------------ */
      case 'I': // I: 인공지능과 생각 넓히기
        container.innerHTML = `
          <div style="display:flex; flex-direction:column; gap:16px;">
            ${_stageBanner('I', '🤖', '인공지능과 생각 넓히기', 'AI에게 근거나 반론을 물어보며 생각의 폭을 넓혀 보세요. (이름·전화번호 등 개인정보 입력 금지)')}

            <div style="display:flex; justify-content:flex-end; align-items:center; gap:6px; font-size:0.88rem; color:var(--text-subtle);">
              남은 질문 횟수:
              <strong id="lblQuestionsLeft" style="color:var(--primary-700); font-size:1rem;">${state.studentData.remainingQuestions}</strong>회
            </div>

            <!-- Chat Window -->
            <div class="chat-container">
              <div class="chat-messages" id="chatMessagesBox">
                <div class="chat-bubble ai">
                  안녕하세요! 선생님께서 설정하신 <strong>인공지능과 생각 넓히기 AI</strong>입니다.<br>
                  질문: "${questionText}"<br><br>
                  선생님과 학생 본인 외에는 이 대화를 볼 수 없어요. 어떤 근거나 관점에서 생각을 발전시키고 싶나요?
                </div>
                ${state.studentData.chatMessages.map(msg => `
                  <div class="chat-bubble ${msg.role}">${msg.text}</div>
                `).join('')}
              </div>
              <div class="chat-composer">
                <input type="text" id="txtChatMessage" class="chat-input"
                  placeholder="생각을 정교화하거나 AI에게 질문할 내용을 입력하세요..."
                  onkeypress="if(event.key==='Enter') App.sendChatMessage()">
                <button class="btn btn-stage-I" onclick="App.sendChatMessage()">전송</button>
              </div>
            </div>

            ${_navRow(prevStepIndex, '다음으로 →', `App.goToStep(${nextStepIndex})`, 'I', isFirstStep)}
          </div>`;

        // 채팅창 최하단으로 스크롤
        requestAnimationFrame(() => {
          const box = document.getElementById('chatMessagesBox');
          if (box) box.scrollTop = box.scrollHeight;
        });
        break;

      /* ------------------------------------------------------------------ */
      case 'N': // N: 비판적으로 따져보기
        container.innerHTML = `
          <div style="display:flex; flex-direction:column; gap:20px;">
            ${_stageBanner('N', '🔍', '비판적으로 따져보기', '비교한 의견 중 가장 설득력 있는 기준을 선택하고, 이유를 한 문장 이상 작성하세요.')}

            <div class="form-group">
              <label class="form-label">가장 설득력 있는 판단 기준 선택</label>
              <select id="selCriteria" class="form-select"
                onchange="AppState.studentData.peerCriteria = this.value">
                <option value="validity"    ${state.studentData.peerCriteria === 'validity' ? 'selected' : ''}>근거의 타당성 (논리적 근거가 주장에 적절함)</option>
                <option value="fairness"    ${state.studentData.peerCriteria === 'fairness' ? 'selected' : ''}>공정성 (편견이나 불평등 요소가 없음)</option>
                <option value="feasibility" ${state.studentData.peerCriteria === 'feasibility' ? 'selected' : ''}>실현 가능성 (실제 학교/사회에서 적용 가능함)</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">해당 기준을 선택하고 판단한 구체적 이유 (한 문장 이상)</label>
              <textarea id="txtPeerRationale" class="form-textarea"
                placeholder="단순히 좋아요가 아니라 근거의 타당성, 공정성, 실현 가능성 중 어떤 측면에서 설득력이 높은지 설명해 주세요.">${state.studentData.peerRationale}</textarea>
            </div>

            ${_navRow(prevStepIndex, '저장하고 다음으로 →', 'App.savePeerRationale()', 'N', isFirstStep)}
          </div>`;
        break;

      /* ------------------------------------------------------------------ */
      case 'K': // K: 나의 최종 생각
      default:
        container.innerHTML = `
          <div style="display:flex; flex-direction:column; gap:20px;">
            ${_stageBanner('K', '🌟', '나의 최종 생각', 'AI 대화와 동료 의견을 거친 후, 최종적으로 정리된 나의 주장과 근거를 작성하세요.')}

            <div class="k-initial-ref">
              <div class="k-initial-ref__label">📌 나의 처음 생각 (T단계)</div>
              <div class="k-initial-ref__text">"${state.studentData.initialThought || '작성된 초기 생각이 없습니다.'}"</div>
            </div>

            <div class="form-group">
              <label class="form-label">최종 재구성한 나의 주장과 근거</label>
              <textarea id="txtFinalThought" class="form-textarea" style="min-height:140px;"
                placeholder="AI 대화와 동료 의견 비교 후 무엇이 달라졌나요? 최종 주장과 근거를 작성해 주세요.">${state.studentData.finalThought}</textarea>
            </div>

            ${_navRow(prevStepIndex, '🎉 최종 제출하기', 'App.submitFinalReflection()', 'K', isFirstStep)}
          </div>`;
        break;
    }

    if (accessMode === 'read_only') {
      container.querySelectorAll('textarea, input, select, button.btn-primary:not([onclick*="goToStep"])').forEach(el => el.disabled = true);
      const notice = document.createElement('div');
      notice.textContent = '🔒 읽기 전용 단계입니다. 현재 내용은 볼 수 있지만 수정할 수 없습니다.';
      notice.style.cssText = 'margin:0 0 12px;padding:10px 12px;border-radius:8px;background:var(--bg-subtle);color:var(--text-subtle);font-size:.85rem;';
      container.prepend(notice);
    }
  }
};
