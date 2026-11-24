/* The demo uses the normal THINK renderer. Only its data source is isolated.
   No real classroom records are read or written by this adapter. */
(function () {
  const storageKey = 'think-student-demo-v1';
  const stages = ['T', 'H', 'I', 'N', 'K'];
  const lesson = {
    id: 'student-demo-lesson', number: 1, title: '배아 유전자 편집',
    projectTitle: '학생용 테스트 · 친구 활동은 샘플 데이터',
    coreQuestion: '유전 질환을 예방할 목적으로 배아의 유전자를 편집하고, 그 배아를 이식해 아이가 태어나도록 하는 것을 허용하는 데 찬성하는가, 반대하는가?',
    thinkStages: stages, aiQuestionLimit: 20, aiResponseMode: 'THOUGHT_PROVOKING',
    peerReviewEnabled: true
  };
  const opinions = [
    ['질병을 예방할 기회가 될 수 있으므로 조건부로 찬성한다.', '치료의 이익과 아이에게 생길 위험을 함께 비교해야 한다.', '안전성을 어느 정도 확인해야 허용할 수 있을까?', '서로 다른 연구 결과와 전문가의 의견을 비교하겠다.'],
    ['태어날 아이가 동의할 수 없으므로 지금은 반대한다.', '결정의 영향을 직접 받는 사람이 선택에 참여할 수 없다.', '부모가 대신 결정할 수 있는 범위는 어디까지일까?', '다른 의료 결정에서 사용하는 기준을 찾아보겠다.'],
    ['심각한 유전 질환의 예방에 한정한다면 찬성한다.', '외모나 능력을 바꾸는 목적과 질병 예방을 구분할 필요가 있다.', '질병과 특성을 나누는 기준은 누가 정할까?', '여러 사례를 분류하고 기준이 일관적인지 살펴보겠다.'],
    ['기술에 접근할 기회가 불평등해질 수 있어 반대한다.', '혜택을 일부 사람만 누린다면 사회적 격차가 커질 수 있다.', '공평한 접근을 보장하면 내 입장이 달라질까?', '비용 지원과 공공의료에 관한 여러 의견을 비교하겠다.'],
    ['다른 예방 방법이 있는지 먼저 확인해야 한다.', '같은 목적을 더 적은 위험으로 달성할 방법이 있을 수 있다.', '대안도 모든 가족에게 적용될 수 있을까?', '방법별 적용 조건과 한계를 표로 정리하겠다.'],
    ['결과를 오랫동안 확인할 책임이 마련되어야 한다.', '출생 이후에도 영향을 살피고 지원할 준비가 필요하다.', '누가 어떤 책임을 얼마나 오래 맡아야 할까?', '당사자 보호와 개인정보 보호를 함께 검토하겠다.']
  ];
  const peers = opinions.map((answers, i) => ({
    id: `demo-peer-${i + 1}`,
    text: ['① 나의 생각', '② 생각한 이유', '③ 더 궁금한 점', '④ 알아볼 방법'].map((title, n) => `${title}\n${answers[n]}`).join('\n\n')
  }));
  const reviews = opinions.map((answers, i) => ({
    id: `demo-review-${i + 1}`, target: answers[0],
    evidence: `샘플 검토: ${answers[1]} 이 주장은 사실에 관한 부분과 가치 판단에 관한 부분을 구분해서 확인해야 한다.`,
    judgment: `${answers[2]} 이 질문을 더 확인한 뒤 내 판단을 보완하고 싶다.`,
    reactions: [], recommended: false
  }));
  let data;
  try { data = JSON.parse(sessionStorage.getItem(storageKey)); } catch (_) {}
  if (!data || !Array.isArray(data.records) || !Array.isArray(data.turns)) data = null;
  const fresh = () => ({records: [], turns: [], reviewFeedback: {}});
  const persist = () => sessionStorage.setItem(storageKey, JSON.stringify(data));
  const clone = value => structuredClone(value);
  const rowFor = stage => {
    let row = data.records.find(row => row.stage === stage);
    if (!row) {
      row = {stage, content: '', metadata: {}, revision: 0, submitted_at: null, lease: `demo-${stage}`};
      data.records.push(row);
    }
    return row;
  };
  window.StudentDemo = {
    get active() { return !!data; },
    lobby() {
      return {studentName: '테스트 학생', subjectClasses: [{classId: 'student-demo-class', subjectName: '학생용 테스트', gradeNumber: 1, classNumber: 1, activeLesson: clone(lesson)}]};
    },
    async login(state) {
      data ||= fresh();
      persist();
      window.AuthModule.prepareStudent(state, '111111', '테스트 학생');
      state.subjectClasses = this.lobby().subjectClasses;
      for (const id of ['authSection', 'teacherAppSection', 'teacherPendingSection']) {
        const element = document.getElementById(id);
        if (element) element.style.display = 'none';
      }
      await window.StudentLobbyModule.enterSubjectClass(state, 'student-demo-class');
    },
    end() {
      data = null;
      sessionStorage.removeItem(storageKey);
      // Drafts use the same editor but a separate demo namespace.
      for (const storage of [localStorage, sessionStorage]) {
        for (let i = storage.length - 1; i >= 0; i--) {
          const key = storage.key(i);
          if (key?.startsWith('think-draft:111111:student-demo-class:')) storage.removeItem(key);
        }
      }
    },
    async invoke(action, stage = 'T', payload = {}) {
      if (!data) throw new Error('테스트 계정으로 다시 로그인해 주세요.');
      if (!stages.includes(stage)) throw new Error('올바르지 않은 단계입니다.');
      if (action === 'snapshot' || action === 'stage_snapshot') return clone({
        access: Object.fromEntries(stages.map(stage => [stage, 'writable'])),
        active: true, peerReviewEnabled: true, records: data.records, peers, firstCount: peers.length,
        turns: data.turns, remaining: 20 - data.turns.length
      });
      if (action === 'open') { const row = rowFor(stage); persist(); return clone(row); }
      if (action === 'save') {
        const row = rowFor(stage);
        if (row.last_request === payload.requestId) return clone(row);
        if (payload.revision !== row.revision) throw new Error('기록이 변경되었습니다. 방에 다시 입장해 주세요.');
        if (stage === 'H') row.metadata.feedback = {...row.metadata.feedback, ...clone(payload.changes || {})};
        else { row.content = payload.content; row.metadata = clone(payload.metadata); }
        row.revision++;
        row.last_request = payload.requestId;
        if (payload.submit || stage === 'H') row.submitted_at = new Date().toISOString();
        persist();
        return clone(row);
      }
      if (action === 'review_list') return clone(reviews.map(post => ({...post, ...data.reviewFeedback[post.id]})));
      if (action === 'review_feedback') {
        if (!reviews.some(post => post.id === payload.id)) throw new Error('친구 글을 찾을 수 없습니다.');
        const change = {};
        if (Array.isArray(payload.reactions)) change.reactions = payload.reactions;
        if (typeof payload.recommended === 'boolean') change.recommended = payload.recommended;
        data.reviewFeedback[payload.id] = {...data.reviewFeedback[payload.id], ...clone(change)};
        persist();
        return {ok: true};
      }
      if (action === 'chat') {
        const existing = data.turns.find(turn => turn.id === payload.requestId);
        if (existing) return clone(existing);
        if (data.turns.length >= 20) throw new Error('질문 횟수를 모두 사용했습니다.');
        const session = data;
        // Use the existing AI endpoint: only classmates, never AI answers, are samples.
        const result = await window.SupabaseService.invokeAccountFunction('gemini-chat', {
          activity_title: lesson.title, core_question: lesson.coreQuestion, student_message: payload.question,
          previous_messages: data.turns.flatMap(turn => [{role: 'user', text: turn.question}, {role: 'model', text: turn.answer}])
        });
        if (!result?.reply) throw new Error('AI 응답을 받지 못했습니다. 다시 시도해 주세요.');
        const turn = {id: payload.requestId, question: payload.question, answer: result.reply, status: 'succeeded'};
        if (data === session) { data.turns.push(turn); persist(); }
        return clone(turn);
      }
      throw new Error('지원하지 않는 테스트 작업입니다.');
    }
  };
})();
