const stageLabels = { T: '나의 처음 생각', H: '친구와 생각 나누기', I: '인공지능과 생각 넓히기', N: '비판적으로 따져보기', K: '나의 최종 생각' };
const accessLabels = { hidden: '🔒 비공개', read_only: '👁 읽기 전용', writable: '✍ 작성 가능' };
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
  setText('stageResponseContext', `${classroom.subjectName} · ${classroom.gradeNumber}학년 ${classroom.classNumber}반 · ${classroom.projectTitle} · ${lesson.number}차시`);
  setText('stageResponseTitle', `THINK ${state.stageCode} — ${stageLabels[state.stageCode] || state.stageCode}`);
  setText('stageResponseQuestion', `핵심 질문: “${lesson.coreQuestion || ''}”`);
  setText('stageResponseAccess', `학생 공개 상태: ${accessLabels[state.stageAccessMode] || accessLabels.hidden} · 비공개여도 교사는 저장된 초안을 열람할 수 있습니다.`);
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
  if (!student) { const empty = document.createElement('p'); empty.className = 'stage-response-empty'; empty.textContent = '학생을 선택해 주세요.'; target.appendChild(empty); return; }
  const heading = document.createElement('h2');
  const number = document.createElement('span'); number.textContent = student.studentNumber;
  const name = document.createElement('span'); name.textContent = student.studentName;
  heading.append(number, document.createTextNode(' '), name); target.appendChild(heading);
  const status = responseStatus(student);
  const meta = document.createElement('p'); meta.className = 'stage-response-detail-meta';
  meta.textContent = status === 'not_started' ? '미작성' : `${status === 'submitted' ? '제출 완료' : '작성 중'} · 마지막 저장 ${formatDate(student.response.updatedAt)}`;
  target.appendChild(meta);
  if (status === 'not_started') { const empty = document.createElement('p'); empty.className = 'stage-response-empty'; empty.textContent = '아직 작성한 내용이 없습니다.'; target.appendChild(empty); return; }
  const content = document.createElement('div'); content.className = 'stage-response-content'; content.textContent = student.response.content; target.appendChild(content);
}

function renderStudentList() {
  const target = element('studentResponseList');
  if (!target) return;
  target.replaceChildren();
  const students = visibleStudents();
  if (!students.length) { const empty = document.createElement('p'); empty.className = 'stage-response-empty'; empty.textContent = '조건에 맞는 학생이 없습니다.'; target.appendChild(empty); state.selectedStudentNumber = null; renderSelectedStudent(); return; }
  if (!students.some((student) => student.studentNumber === state.selectedStudentNumber)) state.selectedStudentNumber = students[0].studentNumber;
  students.forEach((student) => {
    const status = responseStatus(student);
    const button = document.createElement('button'); button.type = 'button'; button.className = `stage-response-student ${student.studentNumber === state.selectedStudentNumber ? 'is-selected' : ''}`;
    const identity = document.createElement('strong');
    const studentNumber = document.createElement('span'); studentNumber.textContent = student.studentNumber;
    const studentName = document.createElement('span'); studentName.textContent = student.studentName;
    identity.append(studentNumber, document.createTextNode(' '), studentName);
    const meta = document.createElement('span'); meta.textContent = status === 'not_started' ? '미작성' : status === 'submitted' ? '제출 완료' : '작성 중';
    button.append(identity, meta); button.addEventListener('click', () => { state.selectedStudentNumber = student.studentNumber; renderStudentList(); }); target.appendChild(button);
  });
  renderSelectedStudent();
}

function renderWordCloud() {
  const target = element('wordCloud');
  if (!target) return;
  target.replaceChildren();
  const tokens = buildWordCloudTokens(state.students, 30);
  if (!tokens.length) { const empty = document.createElement('p'); empty.className = 'stage-response-empty'; empty.textContent = '워드 클라우드를 만들 작성 글이 없습니다.'; target.appendChild(empty); return; }
  const max = tokens[0].count;
  tokens.forEach((token) => { const word = document.createElement('span'); word.textContent = token.text; word.title = `${token.count}회`; word.style.fontSize = `${0.9 + (token.count / max) * 1.6}rem`; target.appendChild(word); });
}

function appendList(target, title, items) {
  const heading = document.createElement('h3'); heading.textContent = title; target.appendChild(heading);
  const list = document.createElement('ul'); items.forEach((item) => { const row = document.createElement('li'); row.textContent = item; list.appendChild(row); }); target.appendChild(list);
}

function renderInsight(insight) {
  const target = element('classInsightResult');
  target.replaceChildren();
  const overview = document.createElement('p'); overview.className = 'class-insight-overview'; overview.textContent = insight.overview; target.appendChild(overview);
  appendList(target, '관점 분포', insight.perspectives.map((item) => `${item.label} · ${item.count}명`));
  appendList(target, '빠져 있는 관점', insight.missingPerspectives);
  const question = document.createElement('p'); question.className = 'class-insight-question'; question.textContent = `다음 토론 질문: ${insight.nextQuestion}`; target.appendChild(question);
  const note = document.createElement('p'); note.className = 'class-insight-note'; note.textContent = `생성 시각 ${formatDate(insight.generatedAt)} · 수업 운영 참고 자료이며 학생 평가가 아닙니다.`; target.appendChild(note);
}

async function generateClassInsight() {
  const button = document.querySelector("[id='generateClassInsightButton']");
  if (!button) return;
  button.disabled = true; button.textContent = '분석 중…'; showError('');
  try { renderInsight(await window.SupabaseService.analyzeTeacherStageResponses(state.classId, state.lessonId, state.stageCode)); }
  catch (error) { showError(`학급 인사이트를 생성하지 못했습니다: ${error.message}`); }
  finally { button.disabled = false; button.textContent = 'AI 학급 요약 생성'; }
}

function selectTab(tab) {
  const writing = tab === 'writing';
  element('studentWritingPanel').hidden = !writing; element('classInsightsPanel').hidden = writing;
  element('studentWritingTab').classList.toggle('is-active', writing); element('classInsightsTab').classList.toggle('is-active', !writing);
  element('studentWritingTab').setAttribute('aria-selected', String(writing)); element('classInsightsTab').setAttribute('aria-selected', String(!writing));
  if (!writing) renderWordCloud();
}

async function initialize() {
  const params = new URLSearchParams(window.location.search);
  state.classId = params.get('classId') || ''; state.lessonId = params.get('lessonId') || ''; state.stageCode = params.get('stageCode') || '';
  if (!state.classId || !state.lessonId || !['T', 'H', 'I', 'N', 'K'].includes(state.stageCode)) { showError('학급, 차시, THINK 단계 주소가 올바르지 않습니다.'); return; }
  try {
    const session = await window.SupabaseService.getUserSession();
    if (!session?.user) { window.location.assign('index.html'); return; }
    const profile = await window.SupabaseService.getUserProfile(session.user.id);
    if (!profile || !['teacher', 'admin'].includes(profile.role) || profile.approval_status !== 'approved') throw new Error('승인된 교사만 학생 글을 열람할 수 있습니다.');
    const result = await window.SupabaseService.fetchTeacherStageResponses(state.classId, state.lessonId, state.stageCode);
    Object.assign(state, { classInfo: result.classInfo, lesson: result.lesson, stageAccessMode: result.stageAccessMode, students: result.students || [], selectedStudentNumber: result.students?.[0]?.studentNumber || null });
    renderHeader(); renderSummary('responseSummary'); renderSummary('insightSummary'); renderStudentList(); renderWordCloud();
  } catch (error) { showError(error.message || '학생 글을 불러오지 못했습니다.'); }
}

function bindEvents() {
  element('studentWritingTab')?.addEventListener('click', () => selectTab('writing')); element('classInsightsTab')?.addEventListener('click', () => selectTab('insights'));
  element('responseFilter')?.addEventListener('change', (event) => { state.filter = event.target.value; renderStudentList(); });
  element('responseSort')?.addEventListener('change', (event) => { state.sort = event.target.value; renderStudentList(); });
  document.querySelector("[id='generateClassInsightButton']")?.addEventListener('click', generateClassInsight);
}

if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', () => { bindEvents(); initialize(); });
