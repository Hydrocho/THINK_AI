const stageLabels = { T: '나의 처음 생각', H: '친구와 생각 나누기', I: '인공지능과 생각 넓히기', N: '비판적으로 따져보기', K: '나의 최종 생각' };
const accessLabels = { hidden: '🔒 작성 잠금', read_only: '🔒 작성 잠금', writable: '✍ 작성 가능' };

const stopWords = new Set(['그리고', '그러나', '하지만', '그래서', '때문에', '대한', '대해', '것이다', '있다', '없다', '하는', '하면', '해서', '저는', '나는', '우리', '생각', '생각한다', '생각합니다', '이라고', '라고']);
const state = { classId: '', lessonId: '', stageCode: '', classInfo: null, lesson: null, stageAccessMode: 'hidden', students: [], selectedStudentNumber: null, filter: 'all', sort: 'updated' };

function responseStatus(student) {
  if (!student?.response?.content?.trim()) return 'not_started';
  return student.response.submittedAt ? 'submitted' : 'writing';
}

export function summarizeStudents(students = []) {
  const result = { all: students.length, writing: 0, notStarted: 0, submitted: 0 };
  students.forEach((student) => {
    const status = responseStatus(student);
    if (status === 'writing') result.writing += 1;
    if (status === 'not_started') result.notStarted += 1;
    if (status === 'submitted') result.submitted += 1;
  });
  return result;
}

export function buildWordCloudTokens(students = [], limit = 30) {
  const frequencies = new Map();
  students.forEach((student) => {
    const tokens = (student?.response?.content || '').toLowerCase().match(/[가-힣a-z0-9]{2,}/g) || [];
    tokens.forEach((token) => {
      if (!stopWords.has(token)) frequencies.set(token, (frequencies.get(token) || 0) + 1);
    });
  });
  return [...frequencies.entries()].map(([text, count]) => ({ text, count }))
    .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text, 'ko')).slice(0, limit);
}

function element(id) { return document.getElementById(id); }
function setText(id, value) { const target = element(id); if (target) target.textContent = value ?? ''; }
function showError(message) { const target = element('stageResponseError'); if (target) { target.textContent = message; target.hidden = !message; } }
function formatDate(value) { const date = new Date(value || 0); return value && !Number.isNaN(date.getTime()) ? date.toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' }) : ''; }

function renderSummary(id) {
  const target = element(id);
  if (!target) return;
  const summary = summarizeStudents(state.students);
  target.replaceChildren();
  [['전체', summary.all], ['작성 중', summary.writing], ['미작성', summary.notStarted], ['제출 완료', summary.submitted]].forEach(([label, count]) => {
    const badge = document.createElement('span');
    badge.textContent = `${label} ${count}명`;
    target.appendChild(badge);
  });
}

function renderHeader() {
  const classroom = state.classInfo;
  const lesson = state.lesson;
  if (!classroom || !lesson) return;

  const headerEl = element('stageResponseHeader');
  if (headerEl && headerEl.classList.contains('compact-header')) {
    const stages = ['T', 'H', 'I', 'N', 'K'];
    const stagePillsHtml = stages.map((code) => {
      const isActive = code === state.stageCode;
      const label = stageLabels[code] || code;
      return `
        <button type="button" 
                class="think-stage-pill think-pill-${code.toLowerCase()} ${isActive ? 'is-active' : ''}" 
                onclick="TeacherStageResponsesModule.switchStage('${code}')"
                title="${code}단계: ${label}">
          <span class="think-pill-badge">${code}</span>
          <span class="think-pill-name">${label}</span>
        </button>
      `;
    }).join('');

    const isWritable = state.stageAccessMode === 'writable';
    const accessToggleHtml = `
      <button type="button" 
              id="stageAccessToggleBtn" 
              class="stage-access-toggle-btn ${isWritable ? 'is-writable' : 'is-locked'}"
              onclick="TeacherStageResponsesModule.toggleCurrentStageAccess()"
              title="클릭하여 학생 작성 상태를 '작성 가능' / '작성 잠금'으로 바로 전환합니다">
        <span class="access-toggle-icon">${isWritable ? '✍️' : '🔒'}</span>
        <span class="access-toggle-label">상태: ${isWritable ? '작성 가능' : '작성 잠금'}</span>
        <span class="access-toggle-badge">${isWritable ? 'ON' : 'OFF'}</span>
      </button>
    `;

    headerEl.innerHTML = `
      <div class="stage-response-header-row-1">
        <button class="btn btn-secondary" onclick="TeacherAdminModule.showClassDetailSubView()" style="padding: 5px 12px; font-size: 0.82rem; font-weight: 600; display: inline-flex; align-items: center; gap: 4px; border-radius: 8px;">
          ← 수업 운영으로 돌아가기
        </button>
        <div class="stage-response-meta-group" style="display: flex; align-items: center; gap: 8px;">
          <span class="stage-response-eyebrow" style="font-weight: 600; font-size: 0.85rem; color: #475569; background: #f1f5f9; padding: 4px 10px; border-radius: 12px;">
            ${classroom.subjectName} ${classroom.gradeNumber}-${classroom.classNumber} · ${classroom.projectTitle} · ${lesson.number}차시
          </span>
          ${accessToggleHtml}
        </div>
      </div>
      <div class="stage-response-header-row-2">
        <nav class="think-stage-pills-nav" aria-label="THINK 5단계 선택">
          ${stagePillsHtml}
        </nav>
        <div class="stage-response-question-compact" style="font-size: 0.88rem; color: #334155; max-width: 50%; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          💡 <strong>핵심 질문:</strong> “${lesson.coreQuestion || ''}”
        </div>
      </div>
    `;
    return;
  }

  setText('stageResponseContext', `${classroom.subjectName} · ${classroom.gradeNumber}학년 ${classroom.classNumber}반 · ${classroom.projectTitle} · ${lesson.number}차시`);
  setText('stageResponseTitle', `THINK ${state.stageCode} — ${stageLabels[state.stageCode] || state.stageCode}`);
  setText('stageResponseQuestion', `핵심 질문: “${lesson.coreQuestion || ''}”`);
  setText('stageResponseAccess', `학생 공개 상태: ${accessLabels[state.stageAccessMode] || accessLabels.hidden} · 비공개여도 교사는 저장된 초안을 열람할 수 있습니다.`);
}

export async function toggleCurrentStageAccess() {
  const isWritable = state.stageAccessMode === 'writable';
  const newMode = isWritable ? 'read_only' : 'writable';

  const btn = element('stageAccessToggleBtn');
  if (btn) btn.disabled = true;

  try {
    await window.SupabaseService.invokeAccountFunction('manage-class-projects', {
      action: 'set_class_stage_access',
      classId: state.classId,
      lessonId: state.lessonId,
      stageCode: state.stageCode,
      accessMode: newMode
    });

    state.stageAccessMode = newMode;
    renderHeader();

    // Synchronize button states in teacher admin operation panel if open
    const selector = `[data-stage-access-lesson-id="${state.lessonId}"][data-stage-access-stage-code="${state.stageCode}"]`;
    const buttons = [...document.querySelectorAll(`${selector}.pill-btn`)];
    const activeClassByMode = { hidden: 'active-readonly', read_only: 'active-readonly', writable: 'active-writable' };
    buttons.forEach(button => {
      const btnMode = button.dataset.stageAccessMode;
      const isTarget = btnMode === newMode || (newMode === 'read_only' && btnMode === 'hidden');
      button.classList.toggle(activeClassByMode[btnMode], isTarget);
    });
  } catch (error) {
    alert(`작성 상태 변경 실패: ${error.message}`);
  } finally {
    if (btn) btn.disabled = false;
  }
}

export async function switchStage(newStageCode) {
  if (!newStageCode || state.stageCode === newStageCode) return;
  state.stageCode = newStageCode;
  showError('');
  try {
    const result = await window.SupabaseService.fetchTeacherStageResponses(state.classId, state.lessonId, state.stageCode);
    Object.assign(state, {
      classInfo: result.classInfo,
      lesson: result.lesson,
      stageAccessMode: result.stageAccessMode,
      students: result.students || [],
      selectedStudentNumber: result.students?.[0]?.studentNumber || null
    });
    renderHeader();
    renderSummary('responseSummary');
    renderSummary('insightSummary');
    renderStudentList();
    renderWordCloud();
    const insightResult = element('classInsightResult');
    if (insightResult) {
      insightResult.innerHTML = '<p class="stage-response-empty">버튼을 누르면 현재 단계의 학급 경향을 분석합니다.</p>';
    }
  } catch (error) {
    showError(error.message || '학생 글을 불러오지 못했습니다.');
  }
}


function visibleStudents() {
  return state.students.filter((student) => state.filter === 'all' || responseStatus(student) === state.filter).sort((a, b) => {
    if (state.sort === 'student_number') return a.studentNumber.localeCompare(b.studentNumber);
    return new Date(b.response?.updatedAt || 0) - new Date(a.response?.updatedAt || 0) || a.studentNumber.localeCompare(b.studentNumber);
  });
}

function renderSelectedStudent() {
  const target = element('selectedStudentResponse');
  if (!target) return;
  target.replaceChildren();
  const student = state.students.find((item) => item.studentNumber === state.selectedStudentNumber);
  if (!student) {
    const empty = document.createElement('p');
    empty.className = 'stage-response-empty';
    empty.textContent = '학생을 선택해 주세요.';
    target.appendChild(empty);
    return;
  }

  const status = responseStatus(student);

  const headerDiv = document.createElement('div');
  headerDiv.className = 'stage-response-detail-header';

  const heading = document.createElement('h2');
  const number = document.createElement('span');
  number.style.color = '#2563eb';
  number.style.marginRight = '6px';
  number.textContent = `${student.studentNumber}번`;
  const name = document.createElement('span');
  name.textContent = student.studentName;
  heading.append(number, name);
  headerDiv.appendChild(heading);

  const badgeGroup = document.createElement('div');
  badgeGroup.className = 'stage-response-badge-group';

  const statusBadge = document.createElement('span');
  statusBadge.className = `stage-response-badge ${status}`;
  statusBadge.textContent = status === 'submitted' ? '제출 완료 🟢' : status === 'writing' ? '작성 중 🟡' : '미작성 ⚪';
  badgeGroup.appendChild(statusBadge);

  if (student.response?.content) {
    const charCountBadge = document.createElement('span');
    charCountBadge.className = 'stage-response-badge';
    charCountBadge.style.background = '#e2e8f0';
    charCountBadge.style.color = '#334155';
    charCountBadge.textContent = `${student.response.content.trim().length}자`;
    badgeGroup.appendChild(charCountBadge);
  }

  headerDiv.appendChild(badgeGroup);
  target.appendChild(headerDiv);

  const meta = document.createElement('p');
  meta.className = 'stage-response-detail-meta';
  meta.style.fontSize = '0.85rem';
  meta.style.marginBottom = '14px';
  meta.textContent = status === 'not_started'
    ? '아직 작성을 시작하지 않은 학생입니다.'
    : `최종 저장 시각: ${formatDate(student.response.updatedAt)}`;
  target.appendChild(meta);

  if (status === 'not_started') {
    const emptyCard = document.createElement('div');
    emptyCard.className = 'stage-response-record-card';
    emptyCard.style.textAlign = 'center';
    emptyCard.style.padding = '36px 20px';
    emptyCard.style.color = '#94a3b8';
    emptyCard.textContent = '학생이 해당 단계에 작성한 기록이 없습니다.';
    target.appendChild(emptyCard);
    return;
  }

  const recordCard = document.createElement('div');
  recordCard.className = 'stage-response-record-card';

  const recordTitle = document.createElement('div');
  recordTitle.className = 'stage-response-record-title';
  recordTitle.innerHTML = `📝 <strong>THINK ${state.stageCode}단계 작성 내용</strong>`;
  recordCard.appendChild(recordTitle);

  const content = document.createElement('div');
  content.className = 'stage-response-content';
  content.textContent = student.response.content;
  recordCard.appendChild(content);

  target.appendChild(recordCard);
}

function renderStudentList() {
  const target = element('studentResponseList');
  if (!target) return;
  target.replaceChildren();
  const students = visibleStudents();
  if (!students.length) {
    const empty = document.createElement('p');
    empty.className = 'stage-response-empty';
    empty.textContent = '조건에 맞는 학생이 없습니다.';
    target.appendChild(empty);
    state.selectedStudentNumber = null;
    renderSelectedStudent();
    return;
  }

  if (!students.some((student) => student.studentNumber === state.selectedStudentNumber)) {
    state.selectedStudentNumber = students[0].studentNumber;
  }

  students.forEach((student) => {
    const status = responseStatus(student);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `stage-response-student ${student.studentNumber === state.selectedStudentNumber ? 'is-selected' : ''}`;
    
    const identity = document.createElement('strong');
    const studentNumber = document.createElement('span');
    studentNumber.textContent = student.studentNumber;
    const studentName = document.createElement('span');
    studentName.textContent = student.studentName;
    identity.append(studentNumber, document.createTextNode(' '), studentName);
    
    const meta = document.createElement('span');
    meta.textContent = status === 'not_started' ? '미작성' : status === 'submitted' ? '제출 완료' : '작성 중';
    
    button.append(identity, meta);
    button.addEventListener('click', () => {
      state.selectedStudentNumber = student.studentNumber;
      renderStudentList();
    });
    target.appendChild(button);
  });
  renderSelectedStudent();
}

function renderWordCloud() {
  const target = element('wordCloud');
  if (!target) return;
  target.replaceChildren();
  const tokens = buildWordCloudTokens(state.students, 30);
  if (!tokens.length) {
    const empty = document.createElement('p');
    empty.className = 'stage-response-empty';
    empty.textContent = '워드 클라우드를 만들 작성 글이 없습니다.';
    target.appendChild(empty);
    return;
  }
  const max = tokens[0].count;
  tokens.forEach((token) => {
    const word = document.createElement('span');
    word.textContent = token.text;
    word.title = `${token.count}회`;
    word.style.fontSize = `${0.9 + (token.count / max) * 1.6}rem`;
    target.appendChild(word);
  });
}

function appendList(target, title, items) {
  const heading = document.createElement('h3');
  heading.textContent = title;
  target.appendChild(heading);
  const list = document.createElement('ul');
  items.forEach((item) => {
    const row = document.createElement('li');
    row.textContent = item;
    list.appendChild(row);
  });
  target.appendChild(list);
}

function renderInsight(insight) {
  const target = element('classInsightResult');
  if (!target) return;
  target.replaceChildren();
  const overview = document.createElement('p');
  overview.className = 'class-insight-overview';
  overview.textContent = insight.overview;
  target.appendChild(overview);
  appendList(target, '관점 분포', insight.perspectives.map((item) => `${item.label} · ${item.count}명`));
  appendList(target, '빠져 있는 관점', insight.missingPerspectives);
  const question = document.createElement('p');
  question.className = 'class-insight-question';
  question.textContent = `다음 토론 질문: ${insight.nextQuestion}`;
  target.appendChild(question);
  const note = document.createElement('p');
  note.className = 'class-insight-note';
  note.textContent = `생성 시각 ${formatDate(insight.generatedAt)} · 수업 운영 참고 자료이며 학생 평가가 아닙니다.`;
  target.appendChild(note);
}

async function generateClassInsight() {
  const button = document.querySelector("[id='generateClassInsightButton']");
  if (!button) return;
  button.disabled = true;
  button.textContent = '분석 중…';
  showError('');
  try {
    renderInsight(await window.SupabaseService.analyzeTeacherStageResponses(state.classId, state.lessonId, state.stageCode));
  } catch (error) {
    showError(`학급 인사이트를 생성하지 못했습니다: ${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = 'AI 학급 요약 생성';
  }
}

function selectTab(tab) {
  const writing = tab === 'writing';
  if (element('studentWritingPanel')) element('studentWritingPanel').hidden = !writing;
  if (element('classInsightsPanel')) element('classInsightsPanel').hidden = writing;
  element('studentWritingTab')?.classList.toggle('is-active', writing);
  element('classInsightsTab')?.classList.toggle('is-active', !writing);
  element('studentWritingTab')?.setAttribute('aria-selected', String(writing));
  element('classInsightsTab')?.setAttribute('aria-selected', String(!writing));
  if (!writing) renderWordCloud();
}

function bindEvents() {
  element('studentWritingTab')?.addEventListener('click', () => selectTab('writing'));
  element('classInsightsTab')?.addEventListener('click', () => selectTab('insights'));
  element('responseFilter')?.addEventListener('change', (event) => { state.filter = event.target.value; renderStudentList(); });
  element('responseSort')?.addEventListener('change', (event) => { state.sort = event.target.value; renderStudentList(); });
  document.querySelector("[id='generateClassInsightButton']")?.addEventListener('click', generateClassInsight);
}

export async function renderInPageContainer(container, classId, lessonId, stageCode) {
  if (!container) return;
  state.classId = classId;
  state.lessonId = lessonId;
  state.stageCode = stageCode;

  container.innerHTML = `
    <div class="stage-response-inpage-wrapper">
      <header id="stageResponseHeader" class="stage-response-header compact-header" aria-live="polite">
        <h1 id="stageResponseTitle">학생 작성 글 보기</h1>
        <div id="stageResponseQuestion"></div>
      </header>
      <div id="stageResponseError" class="stage-response-error" role="alert" hidden></div>
      <nav class="stage-response-tabs" aria-label="학생 글과 학급 인사이트" style="margin: 8px 0 14px 0;">
        <button type="button" id="studentWritingTab" class="stage-response-tab is-active" aria-selected="true">학생별 글 보기 (좌우 분할)</button>
        <button type="button" id="classInsightsTab" class="stage-response-tab" aria-selected="false">학급 인사이트 ✨</button>
      </nav>


      <section id="studentWritingPanel" class="student-writing-panel">
        <div class="stage-response-toolbar">
          <div id="responseSummary" class="stage-response-summary"></div>
          <div class="stage-response-controls">
            <label>필터 
              <select id="responseFilter">
                <option value="all">전체</option>
                <option value="writing">작성 중</option>
                <option value="not_started">미작성</option>
                <option value="submitted">제출 완료</option>
              </select>
            </label>
            <label>정렬 
              <select id="responseSort">
                <option value="updated">마지막 저장순</option>
                <option value="student_number">학생 번호순</option>
              </select>
            </label>
          </div>
        </div>
        <div class="stage-response-grid">
          <aside class="stage-response-roster" aria-label="학생 작성 현황">
            <h2>학생 목록</h2>
            <div id="studentResponseList"></div>
          </aside>
          <article id="selectedStudentResponse" class="stage-response-detail" aria-live="polite">
            <p class="stage-response-empty">학생을 선택해 주세요.</p>
          </article>
        </div>
      </section>

      <section id="classInsightsPanel" class="class-insights-panel" hidden>
        <div class="class-insight-card"><h2>작성 현황</h2><div id="insightSummary" class="stage-response-summary"></div></div>
        <div class="class-insight-card"><h2>핵심 표현 워드 클라우드</h2><p class="class-insight-help">학생 글에서 자주 나온 표현을 이 브라우저에서만 집계합니다.</p><div id="wordCloud" class="teacher-word-cloud"></div></div>
        <div class="class-insight-card">
          <div class="class-insight-heading">
            <div><h2>AI 학급 인사이트</h2><p class="class-insight-help">학생 신원 없이 학급 전체 경향만 Gemini로 분석합니다.</p></div>
            <button type="button" id="generateClassInsightButton" class="btn btn-primary">AI 학급 요약 생성</button>
          </div>
          <div id="classInsightResult" aria-live="polite"><p class="stage-response-empty">버튼을 누르면 현재 단계의 학급 경향을 분석합니다.</p></div>
        </div>
      </section>
    </div>
  `;

  bindEvents();
  showError('');

  try {
    const result = await window.SupabaseService.fetchTeacherStageResponses(classId, lessonId, stageCode);
    Object.assign(state, {
      classInfo: result.classInfo,
      lesson: result.lesson,
      stageAccessMode: result.stageAccessMode,
      students: result.students || [],
      selectedStudentNumber: result.students?.[0]?.studentNumber || null
    });
    renderHeader();
    renderSummary('responseSummary');
    renderSummary('insightSummary');
    renderStudentList();
    renderWordCloud();
  } catch (error) {
    showError(error.message || '학생 글을 불러오지 못했습니다.');
  }
}

const TeacherStageResponsesModule = {
  summarizeStudents,
  buildWordCloudTokens,
  renderInPageContainer,
  switchStage,
  toggleCurrentStageAccess
};

if (typeof window !== 'undefined') {
  window.TeacherStageResponsesModule = TeacherStageResponsesModule;
}

