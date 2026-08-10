/* ==========================================================================
   Student THINK Workflow Module: Dynamic T, H, I, N, K Steps Controller
   ========================================================================== */

window.StudentThinkModule = {
  renderStep: function (state) {
    const container = document.getElementById('stepContentContainer');
    if (!container) return;

    const sampleLessons = window.APP_CONFIG?.LESSONS || [];
    const lesson = (state.activeLessonPlans && state.activeLessonPlans[state.currentLessonIndex]) || sampleLessons[state.currentLessonIndex] || {
      number: 1,
      title: "1차시",
      question: "질문 데이터를 불러오는 중입니다."
    };

    const questionText = lesson.coreQuestion || lesson.core_question || lesson.question || "질문 내용이 등록되지 않았습니다.";
    const activeStages = lesson.thinkStages || lesson.think_stages || ['T', 'H', 'I', 'N', 'K'];
    const currentStageCode = activeStages[state.currentStep - 1] || activeStages[0] || 'T';
    const accessMode = lesson.thinkStageAccess?.[currentStageCode] || lesson.think_stage_access?.[currentStageCode] || 'hidden';

    if (accessMode === 'hidden') {
      container.innerHTML = `<div class="question-card" style="text-align:center; padding:48px 24px;"><div style="font-size:2rem;">🔒</div><strong>아직 열리지 않은 활동입니다.</strong><p style="color:var(--text-subtle); margin-top:8px;">교사가 이 THINK 단계를 열면 참여할 수 있습니다.</p></div>`;
      return;
    }

    const isFirstStep = state.currentStep === 1;
    const isLastStep = state.currentStep === activeStages.length;
    const prevStepIndex = state.currentStep - 1;
    const nextStepIndex = state.currentStep + 1;

    switch (currentStageCode) {
      case 'T': // T: Individual Thought
        container.innerHTML = `
          <div style="display: flex; flex-direction: column; gap: 20px;">
            <div class="question-card">
              <strong>[T] 나의 처음 생각</strong><br>
              ${questionText}
            </div>
            <div class="form-group">
              <label class="form-label">나의 초기 생각 작성</label>
              <textarea id="txtInitialThought" class="form-textarea" placeholder="질문에 대한 본인의 첫 번째 생각을 솔직하게 작성해 보세요.">${state.studentData.initialThought}</textarea>
            </div>
            <div style="display: flex; justify-content: ${isFirstStep ? 'flex-end' : 'space-between'};">
              ${!isFirstStep ? `<button class="btn btn-secondary" onclick="App.goToStep(${prevStepIndex})">← 이전 단계</button>` : ''}
              <button class="btn btn-primary" onclick="App.saveInitialThought()">${isLastStep ? '다음 이동 →' : '다음 단계 이동 →'}</button>
            </div>
          </div>
        `;
        break;

      case 'H': // H: Human Collaboration / Peer Comparison
        if (state.currentLessonIndex === 0) {
          // Lesson 1 Wordcloud
          container.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 20px;">
              <div class="question-card">
                <strong>[H] 친구와 생각 나누기 (학급 워드 클라우드)</strong><br>
                우리 학급 친구들이 가장 많이 작성한 키워드입니다.
              </div>
              <div style="background: #ffffff; border: 1px solid var(--border-light); border-radius: var(--radius-lg); padding: 40px; text-align: center;">
                <div style="display: flex; flex-wrap: wrap; gap: 16px; justify-content: center; align-items: center;">
                  <span style="font-size: 2rem; font-weight: 800; color: var(--primary-700);">쌍꺼풀</span>
                  <span style="font-size: 1.7rem; font-weight: 700; color: var(--accent-teal);">보조개</span>
                  <span style="font-size: 1.4rem; font-weight: 700; color: #7c3aed;">귓볼 모양</span>
                  <span style="font-size: 1.2rem; font-weight: 600; color: #ea580c;">혀 말기</span>
                  <span style="font-size: 1rem; font-weight: 600; color: var(--text-subtle);">머리카락 모양</span>
                </div>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <button class="btn btn-secondary" onclick="App.goToStep(${prevStepIndex})">← 이전 단계</button>
                <button class="btn btn-primary" onclick="App.goToStep(${nextStepIndex})">다음 단계 이동 →</button>
              </div>
            </div>
          `;
        } else {
          // Anonymous Peer Review
          const peerOpinions = state.peerOpinions || [];

          if (peerOpinions.length === 0) {
            container.innerHTML = `
              <div style="display: flex; flex-direction: column; gap: 20px;">
                <div class="question-card">
                  <strong>[H] 친구와 생각 나누기 (익명 의견 비교)</strong><br>
                  친구들의 의견이 수집 및 배정 중입니다.
                </div>
                <div style="background: var(--bg-card); border: 1px dashed var(--border-medium); border-radius: var(--radius-lg); padding: 36px; text-align: center; color: var(--text-subtle);">
                  선생님께서 학급 친구들의 초기 생각을 수집한 후 무작위 익명 4개 의견을 배정해 주십니다.<br>
                  잠시 후 다음 단계로 이동하거나 새로고침을 진행해 보세요.
                </div>
                <div style="display: flex; justify-content: space-between; margin-top: 10px;">
                  <button class="btn btn-secondary" onclick="App.goToStep(${prevStepIndex})">← 이전 단계</button>
                  <button class="btn btn-primary" onclick="App.goToStep(${nextStepIndex})">다음 단계 이동 →</button>
                </div>
              </div>
            `;
          } else {
            container.innerHTML = `
              <div style="display: flex; flex-direction: column; gap: 20px;">
                <div class="question-card">
                  <strong>[H] 친구와 생각 나누기 (무작위 익명 의견)</strong><br>
                  친구들의 작성자 학번은 비공개로 안전하게 보호됩니다. 네 가지 의견을 차분히 읽어보세요.
                </div>

                <div class="card-grid-2">
                  ${peerOpinions.map((opt, i) => `
                    <div class="option-card ${state.studentData.selectedPeerOpinion === opt.id ? 'selected' : ''}" onclick="App.selectPeerOpinion('${opt.id}')">
                      <div class="option-header">
                        <span class="option-letter">의견 ${String.fromCharCode(65 + i)}</span>
                        <span style="font-size: 0.8rem; color: var(--primary-600); font-weight: 700;">익명</span>
                      </div>
                      <div class="option-body">${opt.text}</div>
                    </div>
                  `).join('')}
                </div>

                <div style="display: flex; justify-content: space-between; margin-top: 10px;">
                  <button class="btn btn-secondary" onclick="App.goToStep(${prevStepIndex})">← 이전 단계</button>
                  <button class="btn btn-primary" onclick="App.goToStep(${nextStepIndex})">다음 단계 이동 →</button>
                </div>
              </div>
            `;
          }
        }
        break;

      case 'I': // I: AI Interaction (Gemini Chat)
        container.innerHTML = `
          <div style="display: flex; flex-direction: column; gap: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center; background: var(--primary-50); border: 1px solid var(--primary-200); padding: 12px 18px; border-radius: var(--radius-md);">
              <div style="font-size: 0.85rem; color: var(--primary-800); font-weight: 600;">
                🔒 <strong>개인정보 보호 안내</strong>: 이름, 전화번호 등 개인 식별 정보는 절대로 입력하지 마세요.
              </div>
              <div style="font-size: 0.9rem; font-weight: 800; color: var(--primary-700);">
                남은 질문 횟수: <span id="lblQuestionsLeft" style="color: var(--primary-800); font-size: 1.1rem;">${state.studentData.remainingQuestions}</span>회
              </div>
            </div>

            <!-- Chat Window -->
            <div class="chat-container">
              <div class="chat-messages" id="chatMessagesBox">
                <div class="chat-bubble ai">
                  안녕하세요! 선생님께서 설정하신 **인공지능과 생각 넓히기 AI**입니다.<br>
                  질문: "${questionText}"<br><br>
                  선생님과 학생 본인 외에는 이 대화를 볼 수 없어요. 어떤 근거나 관점에서 생각을 발전시키고 싶나요?
                </div>
                ${state.studentData.chatMessages.map(msg => `
                  <div class="chat-bubble ${msg.role}">${msg.text}</div>
                `).join('')}
              </div>
              <div class="chat-composer">
                <input type="text" id="txtChatMessage" class="chat-input" placeholder="생각을 정교화하거나 AI에게 질문할 내용을 입력하세요..." onkeypress="if(event.key==='Enter') App.sendChatMessage()">
                <button class="btn btn-primary" onclick="App.sendChatMessage()">전송</button>
              </div>
            </div>

            <div style="display: flex; justify-content: space-between;">
              <button class="btn btn-secondary" onclick="App.goToStep(${prevStepIndex})">← 이전 단계</button>
              <button class="btn btn-primary" onclick="App.goToStep(${nextStepIndex})">다음 단계 이동 →</button>
            </div>
          </div>
        `;
        break;

      case 'N': // N: Navigation & Criteria Synthesis
        container.innerHTML = `
          <div style="display: flex; flex-direction: column; gap: 20px;">
            <div class="question-card">
              <strong>[N] 비판적으로 따져보기 (판단 기준 및 이유 작성)</strong><br>
              비교해 본 동료의 익명 의견 중 가장 설득력 있다고 판단한 기준을 선택하고 이유를 작성해 주세요.
            </div>

            <div class="form-group">
              <label class="form-label">가장 설득력 있는 판단 기준 선택</label>
              <select id="selCriteria" class="form-select" onchange="state.studentData.peerCriteria = this.value">
                <option value="validity" ${state.studentData.peerCriteria === 'validity' ? 'selected' : ''}>근거의 타당성 (논리적 근거가 주장에 적절함)</option>
                <option value="fairness" ${state.studentData.peerCriteria === 'fairness' ? 'selected' : ''}>공정성 (편견이나 불평등 요소가 없음)</option>
                <option value="feasibility" ${state.studentData.peerCriteria === 'feasibility' ? 'selected' : ''}>실현 가능성 (실제 학교/사회에서 적용 가능함)</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">해당 기준을 선택하고 판단한 구체적 이유 (한 문장 이상)</label>
              <textarea id="txtPeerRationale" class="form-textarea" placeholder="단순히 좋아요가 아니라 근거의 타당성, 공정성, 실현 가능성 중 어떤 측면에서 설득력이 높은지 설명해 주세요.">${state.studentData.peerRationale}</textarea>
            </div>

            <div style="display: flex; justify-content: space-between;">
              <button class="btn btn-secondary" onclick="App.goToStep(${prevStepIndex})">← 이전 단계</button>
              <button class="btn btn-primary" onclick="App.savePeerRationale()">다음 단계 이동 →</button>
            </div>
          </div>
        `;
        break;

      case 'K': // K: Knowledge Restructuring & Internalization
      default:
        container.innerHTML = `
          <div style="display: flex; flex-direction: column; gap: 20px;">
            <div class="question-card">
              <strong>[K] 나의 최종 생각 (최종 제출)</strong><br>
              AI와의 대화 및 동료 의견 비교를 통해 변화하고 깊어진 본인의 최종 생각을 정리하여 제출하세요.
            </div>

            <div style="background: var(--bg-sidebar); border: 1px solid var(--border-light); padding: 16px; border-radius: var(--radius-md); font-size: 0.9rem;">
              <div style="font-weight: 700; color: var(--text-subtle); margin-bottom: 6px;">나의 초기 생각 요약:</div>
              <div style="color: var(--text-main); font-style: italic;">"${state.studentData.initialThought || '작성된 초기 생각이 없습니다.'}"</div>
            </div>

            <div class="form-group">
              <label class="form-label">최종 재구성한 나의 주장과 근거</label>
              <textarea id="txtFinalThought" class="form-textarea" style="min-height: 140px;" placeholder="AI 대화와 동료 의견 비교 후 무엇이 달라졌나요? 최종 주장과 근거를 작성해 주세요.">${state.studentData.finalThought}</textarea>
            </div>

            <div style="display: flex; justify-content: ${isFirstStep ? 'flex-end' : 'space-between'};">
              ${!isFirstStep ? `<button class="btn btn-secondary" onclick="App.goToStep(${prevStepIndex})">← 이전 단계</button>` : ''}
              <button class="btn btn-primary" style="background: var(--success-text);" onclick="App.submitFinalReflection()">최종 생각 교사에게 제출 완료 ✓</button>
            </div>
          </div>
        `;
        break;
    }
    if (accessMode === 'read_only') {
      container.querySelectorAll('textarea, input, select, button.btn-primary:not([onclick*="goToStep"])').forEach(field => field.disabled = true);
      const notice = document.createElement('div');
      notice.textContent = '🔒 읽기 전용 단계입니다. 현재 내용은 볼 수 있지만 수정할 수 없습니다.';
      notice.style.cssText = 'margin:0 0 12px;padding:10px 12px;border-radius:8px;background:var(--bg-subtle);color:var(--text-subtle);font-size:.85rem;';
      container.prepend(notice);
    }
  }
};
