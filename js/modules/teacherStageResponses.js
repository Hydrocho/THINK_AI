const stageLabels = { T: '나의 처음 생각', H: '친구와 생각 나누기', I: '인공지능과 생각 넓히기', N: '비판적으로 따져보기', K: '나의 최종 생각' };
const accessLabels = { hidden: '🔒 작성 잠금', read_only: '🔒 작성 잠금', writable: '✍ 작성 가능' };

const EXTENDED_STOP_WORDS = new Set([
  '그리고', '하지만', '그러나', '그래서', '그러므로', '따라서', '또한', '때문에', '대한', '대해', '관한', '관해',
  '저는', '나는', '우리', '저희', '엄마', '아빠', '부모님', '생각', '생각한다', '생각합니다', '생각해요', '생각함', '생각이',
  '것입니다', '같습니다', '같아요', '입니다', '습니다', '있습니다', '없습니다', '됩니다', '되고', '된다', '되는', '하여',
  '동일한', '똑같은', '모든', '모두', '특정', '가진', '치명적인', '다양하지', '않은', '않고', '있는', '없는', '있어서', '없어서',
  '경우', '때문', '정도', '부분', '의해', '통해', '위해', '관련', '관련된', '가지', '하나', '하나의', '이유', '어떤', '어떻게',
  '것이다', '거예요', '그대로', '아주', '매우', '항상', '전혀', '거의', '다시', '계속', '살짝', '진짜', '정말',
  '수', '것', '거', '등', '및', '바', '줄', '분', '개', '명', '번', '차시', '100', '100%', '같다면'
]);

function normalizeKoreanNoun(token) {
  if (!token || token.length < 2) return null;
  if (/^[0-9]+$/.test(token)) return null;

  let clean = token;
  const endings = [
    '들에게서', '들에게는', '에서는', '으로의', '에서부터', '이라고', '이라고도',
    '들에게', '에서의', '에대해', '에대한', '에게는', '으로는', '으로써', '으로부터',
    '들은', '들이', '들의', '들과', '들을', '에서', '으로', '에게', '한테', '부터', '까지',
    '처럼', '같이', '보다', '은', '는', '이', '가', '을', '를', '의', '에', '로', '와', '과', '도', '만', '들',
    '입니다', '습니다', '하면', '해서', '하는', '하여', '되면', '되는', '된다', '이다', '이고', '이나', '이며'
  ];

  for (const ending of endings) {
    if (clean.length > ending.length + 1 && clean.endsWith(ending)) {
      clean = clean.slice(0, -ending.length);
      break;
    }
  }

  if (clean.length < 2 || EXTENDED_STOP_WORDS.has(clean)) return null;
  return clean;
}

const state = { classId: '', lessonId: '', stageCode: '', classInfo: null, lesson: null, stageAccessMode: 'hidden', students: [], selectedStudentNumber: null, filter: 'all', sort: 'updated', selectedInsightTool: 'wordcloud' };

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

export function buildWordCloudTokens(students = [], limit = 35) {
  const tokenMap = new Map();

  students.forEach((student) => {
    const content = student?.response?.content;
    if (!content || !content.trim()) return;

    const rawTokens = content.toLowerCase().match(/[가-힣a-z0-9]+/g) || [];
    const studentSeen = new Set();

    rawTokens.forEach((raw) => {
      const noun = normalizeKoreanNoun(raw);
      if (!noun) return;

      if (!tokenMap.has(noun)) {
        tokenMap.set(noun, { text: noun, totalMentions: 0, studentMap: new Map() });
      }

      const item = tokenMap.get(noun);
      item.totalMentions += 1;

      if (!studentSeen.has(noun)) {
        studentSeen.add(noun);
        item.studentMap.set(student.studentNumber, {
          studentNumber: student.studentNumber,
          studentName: student.studentName,
          content: content.trim()
        });
      }
    });
  });

  const submittedCount = students.filter(s => s?.response?.content?.trim()).length || 1;

  const result = [];
  tokenMap.forEach((item, text) => {
    const studentList = Array.from(item.studentMap.values());
    const count = studentList.length;
    if (count > 0) {
      result.push({
        text,
        count,
        totalMentions: item.totalMentions,
        percentage: ((count / submittedCount) * 100).toFixed(1),
        students: studentList
      });
    }
  });

  return result
    .sort((a, b) => b.count - a.count || b.totalMentions - a.totalMentions || a.text.localeCompare(b.text, 'ko'))
    .slice(0, limit);
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
    const accessToggleHtml = classroom ? `
      <button type="button" 
              id="stageAccessToggleBtn" 
              class="stage-access-toggle-btn ${isWritable ? 'is-writable' : 'is-locked'}"
              onclick="TeacherStageResponsesModule.toggleCurrentStageAccess()"
              title="클릭하여 학생 작성 상태를 '작성 가능' / '작성 잠금'으로 바로 전환합니다">
        <span class="access-toggle-icon">${isWritable ? '✍️' : '🔒'}</span>
        <span class="access-toggle-label">상태: ${isWritable ? '작성 가능' : '작성 잠금'}</span>
        <span class="access-toggle-badge">${isWritable ? 'ON' : 'OFF'}</span>
      </button>
    ` : '';

    const metaText = classroom && lesson
      ? `${classroom.subjectName} ${classroom.gradeNumber}-${classroom.classNumber} · ${classroom.projectTitle} · ${lesson.number}차시`
      : `수업 정보를 불러오는 중입니다...`;

    const questionText = lesson
      ? `“${lesson.coreQuestion || '질문 미입력'}”`
      : `질문을 불러오는 중입니다...`;

    headerEl.innerHTML = `
      <div class="stage-response-header-row-1">
        <button class="btn btn-secondary" onclick="TeacherAdminModule.showClassDetailSubView()" style="padding: 5px 12px; font-size: 0.82rem; font-weight: 600; display: inline-flex; align-items: center; gap: 4px; border-radius: 8px;">
          ← 수업 운영으로 돌아가기
        </button>
        <div class="stage-response-meta-group" style="display: flex; align-items: center; gap: 8px;">
          <span class="stage-response-eyebrow" style="font-weight: 600; font-size: 0.85rem; color: #475569; background: #f1f5f9; padding: 4px 10px; border-radius: 12px;">
            ${metaText}
          </span>
          ${accessToggleHtml}
        </div>
      </div>
      <div class="stage-response-header-row-question" style="padding: 4px 2px; font-size: 0.95rem; display: flex; align-items: center; gap: 6px;">
        <span style="font-size: 1rem;">💡</span>
        <strong style="color: #0284c7; font-weight: 800; white-space: nowrap;">핵심 질문:</strong>
        <span style="font-weight: 800; color: #0f172a;">${questionText}</span>
      </div>
      <div class="stage-response-header-row-2" style="padding-top: 0; border-top: none;">
        <nav class="think-stage-pills-nav" aria-label="THINK 5단계 선택">
          ${stagePillsHtml}
        </nav>
      </div>
    `;
    return;
  }

  if (classroom && lesson) {
    setText('stageResponseContext', `${classroom.subjectName} · ${classroom.gradeNumber}학년 ${classroom.classNumber}반 · ${classroom.projectTitle} · ${lesson.number}차시`);
    setText('stageResponseTitle', `THINK ${state.stageCode} — ${stageLabels[state.stageCode] || state.stageCode}`);
    setText('stageResponseQuestion', `핵심 질문: “${lesson.coreQuestion || ''}”`);
    setText('stageResponseAccess', `학생 공개 상태: ${accessLabels[state.stageAccessMode] || accessLabels.hidden} · 비공개여도 교사는 저장된 초안을 열람할 수 있습니다.`);
  }
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
  renderHeader();
  try {
    const result = await window.SupabaseService.fetchTeacherStageResponses(state.classId, state.lessonId, state.stageCode);
    Object.assign(state, {
      classInfo: result.classInfo,
      lesson: result.lesson,
      stageAccessMode: result.stageAccessMode,
      students: result.students || [],
      selectedStudentNumber: null
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
    const emptyContainer = document.createElement('div');
    emptyContainer.style.display = 'flex';
    emptyContainer.style.flexDirection = 'column';
    emptyContainer.style.alignItems = 'center';
    emptyContainer.style.justifyContent = 'center';
    emptyContainer.style.height = '100%';
    emptyContainer.style.minHeight = '360px';
    emptyContainer.style.color = '#64748b';
    emptyContainer.style.textAlign = 'center';
    emptyContainer.style.padding = '40px 20px';

    const icon = document.createElement('div');
    icon.style.fontSize = '2.5rem';
    icon.style.marginBottom = '12px';
    icon.textContent = '👈';

    const text = document.createElement('p');
    text.style.fontSize = '1.05rem';
    text.style.fontWeight = '700';
    text.style.color = '#334155';
    text.style.margin = '0 0 6px 0';
    text.textContent = '학생을 선택해 주세요';

    const subText = document.createElement('p');
    subText.style.fontSize = '0.88rem';
    subText.style.color = '#94a3b8';
    subText.style.margin = '0';
    subText.textContent = '왼쪽 목록에서 학생을 클릭하면 작성한 글을 확인할 수 있습니다.';

    emptyContainer.append(icon, text, subText);
    target.appendChild(emptyContainer);
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

  if (state.selectedStudentNumber && !students.some((student) => student.studentNumber === state.selectedStudentNumber)) {
    state.selectedStudentNumber = null;
  }

  students.forEach((student) => {
    const status = responseStatus(student);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `stage-response-student ${student.studentNumber === state.selectedStudentNumber ? 'is-selected' : ''}`;
    
    const identity = document.createElement('strong');
    const studentNumber = document.createElement('span');
    studentNumber.className = 'stage-response-student-num';
    studentNumber.textContent = student.studentNumber;
    const studentName = document.createElement('span');
    studentName.className = 'stage-response-student-name';
    studentName.textContent = student.studentName;
    identity.append(studentNumber, document.createTextNode(' '), studentName);
    
    const meta = document.createElement('span');
    meta.className = 'stage-response-student-meta';
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

let selectedTokenText = null;

export function selectToken(text) {
  selectedTokenText = (selectedTokenText === text) ? null : text;
  renderWordCloud();
}

export function selectStudentFromCloud(studentNumber) {
  state.selectedStudentNumber = studentNumber;
  selectTab('writing');
}

function renderWordCloud() {
  const target = element('wordCloud');
  if (!target) return;

  let detailTarget = element('wordCloudDetailPanel');
  if (!detailTarget && target.parentElement) {
    detailTarget = document.createElement('div');
    detailTarget.id = 'wordCloudDetailPanel';
    detailTarget.className = 'word-cloud-detail-panel';
    target.parentElement.appendChild(detailTarget);
  }

  target.replaceChildren();
  if (detailTarget) detailTarget.replaceChildren();

  const tokens = buildWordCloudTokens(state.students, 35);

  if (!tokens.length) {
    const empty = document.createElement('p');
    empty.className = 'stage-response-empty';
    empty.textContent = '작성된 학생 글이 없어 워드 클라우드를 집계할 수 없습니다.';
    target.appendChild(empty);
    if (detailTarget) detailTarget.style.display = 'none';
    return;
  }

  const maxCount = tokens[0].count;
  const minCount = tokens[tokens.length - 1].count;

  const cloudHeader = document.createElement('div');
  cloudHeader.className = 'word-cloud-header-meta';
  cloudHeader.innerHTML = `
    <span class="wc-header-badge">총 ${tokens.length}개 핵심 키워드</span>
    <span class="wc-header-sub">단어를 클릭하면 사용한 학생 명단과 답변 원문이 나타납니다.</span>
  `;
  target.appendChild(cloudHeader);

  const tagCloudWrapper = document.createElement('div');
  tagCloudWrapper.className = 'word-cloud-tags-container';

  tokens.forEach((token, index) => {
    const tag = document.createElement('button');
    tag.type = 'button';
    tag.className = `wc-tag wc-rank-${Math.min(index + 1, 5)} ${selectedTokenText === token.text ? 'is-selected' : ''}`;

    const normalized = maxCount === minCount ? 1 : (token.count - minCount) / (maxCount - minCount);
    const fontSize = 0.95 + normalized * 1.15;
    tag.style.fontSize = `${fontSize}rem`;

    const labelSpan = document.createElement('span');
    labelSpan.className = 'wc-tag-text';
    labelSpan.textContent = token.text;

    const countBadge = document.createElement('span');
    countBadge.className = 'wc-tag-count';
    countBadge.textContent = `${token.count}명`;

    tag.append(labelSpan, countBadge);
    tag.title = `'${token.text}' - ${token.count}명 사용 (${token.percentage}%)`;

    tag.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      selectToken(token.text);
    });

    tagCloudWrapper.appendChild(tag);
  });

  target.appendChild(tagCloudWrapper);
  renderWordCloudDetail(tokens);
}

function renderWordCloudDetail(tokens) {
  const detailTarget = element('wordCloudDetailPanel');
  if (!detailTarget) return;

  detailTarget.style.display = 'block';
  detailTarget.replaceChildren();

  if (!selectedTokenText) {
    detailTarget.innerHTML = `
      <div class="wc-detail-empty">
        <span class="wc-detail-icon">👆</span>
        <p>상단의 단어 구름에서 키워드를 클릭해보세요.<br>해당 단어를 언급한 학생 목록과 답변 내용을 바로 확인할 수 있습니다.</p>
      </div>
    `;
    return;
  }

  const selectedToken = tokens.find(t => t.text === selectedTokenText);
  if (!selectedToken) {
    selectedTokenText = null;
    renderWordCloudDetail(tokens);
    return;
  }

  const totalStudents = state.students.length || 30;

  const header = document.createElement('div');
  header.className = 'wc-detail-header';
  
  const titleGroup = document.createElement('div');
  titleGroup.className = 'wc-detail-title-group';
  titleGroup.innerHTML = `
    <span class="wc-detail-keyword-badge">'${selectedToken.text}'</span>
    <span class="wc-detail-stats">
      <strong>${selectedToken.count}명</strong> 사용 
      <span class="wc-stat-sub">(전체 ${totalStudents}명 중 ${selectedToken.percentage}%)</span>
    </span>
  `;

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'wc-detail-close-btn';
  closeBtn.title = '선택 해제';
  closeBtn.textContent = '✕ 선택 닫기';
  closeBtn.addEventListener('click', () => {
    selectedTokenText = null;
    renderWordCloud();
  });

  header.append(titleGroup, closeBtn);
  detailTarget.appendChild(header);

  const chipContainer = document.createElement('div');
  chipContainer.className = 'wc-student-chips-wrapper';

  const chipTitle = document.createElement('div');
  chipTitle.className = 'wc-chips-title';
  chipTitle.textContent = `작성한 학생 명단 (${selectedToken.students.length}명):`;
  chipContainer.appendChild(chipTitle);

  const chipsFlex = document.createElement('div');
  chipsFlex.className = 'wc-chips-flex';

  selectedToken.students.forEach(st => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'wc-student-chip';
    chip.innerHTML = `<span class="wc-chip-num">${st.studentNumber}</span> <span class="wc-chip-name">${st.studentName}</span>`;
    chip.title = `클릭하면 ${st.studentName} 학생의 답변으로 이동합니다`;
    chip.addEventListener('click', () => {
      selectStudentFromCloud(st.studentNumber);
    });
    chipsFlex.appendChild(chip);
  });
  chipContainer.appendChild(chipsFlex);
  detailTarget.appendChild(chipContainer);

  const cardList = document.createElement('div');
  cardList.className = 'wc-response-card-list';

  const kwRegex = new RegExp(`(${selectedToken.text})`, 'gi');

  selectedToken.students.forEach(st => {
    const card = document.createElement('div');
    card.className = 'wc-response-card';

    const cardHead = document.createElement('div');
    cardHead.className = 'wc-card-head';
    
    const studentSpan = document.createElement('span');
    studentSpan.className = 'wc-card-student';
    studentSpan.innerHTML = `<strong>${st.studentNumber}</strong> ${st.studentName}`;

    const linkBtn = document.createElement('button');
    linkBtn.type = 'button';
    linkBtn.className = 'btn btn-sm btn-secondary wc-card-link-btn';
    linkBtn.textContent = '전체 글 보기 →';
    linkBtn.addEventListener('click', () => {
      selectStudentFromCloud(st.studentNumber);
    });

    cardHead.append(studentSpan, linkBtn);

    const cardBody = document.createElement('div');
    cardBody.className = 'wc-card-body';

    const safeContent = st.content.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const highlighted = safeContent.replace(kwRegex, '<mark class="wc-kw-highlight">$1</mark>');
    cardBody.innerHTML = highlighted;

    card.append(cardHead, cardBody);
    cardList.appendChild(card);
  });

  detailTarget.appendChild(cardList);
}

function isInsideShape(nx, ny, shape) {
  const r2 = nx * nx + ny * ny;

  switch (shape) {
    case 'circle':
      return r2 <= 0.95;

    case 'heart': {
      const x = nx * 1.15;
      const y = -ny * 1.15 + 0.2;
      const a = x * x + y * y - 1;
      return (a * a * a - x * x * y * y * y) <= 0;
    }

    case 'star': {
      const r = Math.sqrt(r2);
      if (r > 1.0) return false;
      let angle = Math.atan2(ny, nx);
      if (angle < 0) angle += Math.PI * 2;
      const p = Math.PI / 5;
      const step = Math.floor(angle / p);
      const limitR = (step % 2 === 0) ? 0.98 : 0.42;
      return r <= limitR;
    }

    case 'diamond':
      return (Math.abs(nx) + Math.abs(ny)) <= 1.0;

    case 'cloud': {
      const c1 = (nx + 0.35) ** 2 + (ny + 0.05) ** 2 <= 0.42;
      const c2 = (nx - 0.3) ** 2 + (ny + 0.1) ** 2 <= 0.38;
      const c3 = nx ** 2 + (ny - 0.15) ** 2 <= 0.55;
      const base = ny >= 0 && ny <= 0.4 && Math.abs(nx) <= 0.75;
      return c1 || c2 || c3 || base;
    }

    case 'lightbulb': {
      const bulb = nx ** 2 + (ny + 0.2) ** 2 <= 0.55;
      const base = Math.abs(nx) <= 0.32 && ny >= 0.15 && ny <= 0.85;
      return bulb || base;
    }

    case 'apple': {
      const mainBody = (nx * 1.1) ** 2 + (ny * 1.1 - 0.05) ** 2 <= 0.85;
      const stem = Math.abs(nx + 0.05) <= 0.09 && ny >= -0.95 && ny <= -0.65;
      return mainBody || stem;
    }

    default:
      return r2 <= 0.95;
  }
}

function sampleEllipse(cx, cy, rx, ry, start, end, steps = 18) {
  return Array.from({ length: steps + 1 }, (_, index) => {
    const angle = start + ((end - start) * index) / steps;
    return [cx + Math.cos(angle) * rx, cy + Math.sin(angle) * ry];
  });
}

export function getWordArtShapePoints(shape, cx, cy, radius) {
  if (shape === 'circle') return sampleEllipse(cx, cy, radius, radius, 0, Math.PI * 2, 48);
  if (shape === 'star') return Array.from({ length: 10 }, (_, index) => {
    const angle = -Math.PI / 2 + index * Math.PI / 5;
    const r = index % 2 === 0 ? radius : radius * 0.46;
    return [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r];
  });
  if (shape === 'heart') return Array.from({ length: 72 }, (_, index) => {
    const t = (index / 71) * Math.PI * 2;
    return [
      cx + (16 * Math.sin(t) ** 3) * (radius / 17),
      cy - (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * (radius / 17)
    ];
  });
  if (shape === 'lightbulb') {
    return [
      ...sampleEllipse(cx, cy - radius * 0.28, radius * 0.68, radius * 0.68, Math.PI * 1.15, Math.PI * 1.85, 24),
      [cx + radius * 0.34, cy + radius * 0.36], [cx + radius * 0.24, cy + radius * 0.57],
      [cx + radius * 0.38, cy + radius * 0.66], [cx + radius * 0.38, cy + radius * 0.84],
      [cx - radius * 0.38, cy + radius * 0.84], [cx - radius * 0.38, cy + radius * 0.66],
      [cx - radius * 0.24, cy + radius * 0.57], [cx - radius * 0.34, cy + radius * 0.36]
    ];
  }
  if (shape === 'cloud') {
    return [
      [-0.76, 0.34], [-0.84, 0.08], [-0.72, -0.15], [-0.5, -0.16],
      [-0.46, -0.49], [-0.22, -0.69], [0.06, -0.6], [0.2, -0.34],
      [0.47, -0.46], [0.74, -0.22], [0.72, 0.1], [0.58, 0.34]
    ].map(([x, y]) => [cx + x * radius, cy + y * radius]);
  }
  if (shape === 'diamond') {
    const left = [];
    const right = [];
    for (let index = 0; index <= 36; index += 1) {
      const t = index / 36;
      const y = cy - radius + t * radius * 2;
      const width = radius * (0.22 + 0.32 * Math.sin(Math.PI * t) ** 0.8);
      const offset = Math.sin(t * Math.PI * 2) * radius * 0.2;
      left.push([cx + offset - width, y]);
      right.push([cx + offset + width, y]);
    }
    return [...left, ...right.reverse()];
  }
  // Apple includes a joined leaf and stem so it remains one fillable silhouette.
  return [
    [cx - radius * 0.08, cy - radius * 0.74], [cx - radius * 0.33, cy - radius * 1.02],
    [cx + radius * 0.12, cy - radius * 0.98], [cx + radius * 0.36, cy - radius * 0.76],
    [cx + radius * 0.08, cy - radius * 0.7], [cx + radius * 0.1, cy - radius * 0.48],
    ...sampleEllipse(cx + radius * 0.28, cy + radius * 0.05, radius * 0.58, radius * 0.73, Math.PI * 1.3, Math.PI * 2.85, 28),
    ...sampleEllipse(cx - radius * 0.28, cy + radius * 0.05, radius * 0.58, radius * 0.73, Math.PI * 0.15, Math.PI * 1.7, 28),
    [cx - radius * 0.1, cy - radius * 0.48]
  ];
}

function isPointInPolygon(x, y, points) {
  let inside = false;
  for (let current = 0, previous = points.length - 1; current < points.length; previous = current++) {
    const [x1, y1] = points[current];
    const [x2, y2] = points[previous];
    if ((y1 > y) !== (y2 > y) && x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1) inside = !inside;
  }
  return inside;
}

export function isPointInWordArtShape(x, y, shape, cx, cy, radius) {
  return isPointInPolygon(x, y, getWordArtShapePoints(shape, cx, cy, radius));
}

export function createWordArtMaskMap({ shape, width, height, cx, cy, radius, cellSize = 4 }) {
  const occupied = new Set();
  const cells = [];
  const keyFor = (col, row) => `${col}:${row}`;
  const shapePoints = getWordArtShapePoints(shape, cx, cy, radius);
  const isInside = (x, y) => x >= 0 && y >= 0 && x <= width && y <= height
    && isPointInPolygon(x, y, shapePoints);

  for (let row = 0; row < Math.ceil(height / cellSize); row += 1) {
    for (let col = 0; col < Math.ceil(width / cellSize); col += 1) {
      const x = col * cellSize + cellSize / 2;
      const y = row * cellSize + cellSize / 2;
      if (!isInside(x, y)) continue;
      const edge = [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([dx, dy]) => !isInside(x + dx * cellSize, y + dy * cellSize));
      cells.push({ col, row, x, y, edge, distance: Math.hypot(x - cx, y - cy) });
    }
  }

  const cellsForBox = (box) => {
    const startCol = Math.floor(box.x / cellSize);
    const endCol = Math.floor((box.x + box.w) / cellSize);
    const startRow = Math.floor(box.y / cellSize);
    const endRow = Math.floor((box.y + box.h) / cellSize);
    const result = [];
    for (let row = startRow; row <= endRow; row += 1) for (let col = startCol; col <= endCol; col += 1) result.push([col, row]);
    return result;
  };
  const sampleBox = (box) => [
    [box.x, box.y], [box.x + box.w, box.y], [box.x, box.y + box.h], [box.x + box.w, box.y + box.h],
    [box.x + box.w / 2, box.y + box.h / 2]
  ];

  return {
    canPlace(box) {
      return sampleBox(box).every(([x, y]) => isInside(x, y))
        && cellsForBox(box).every(([col, row]) => !occupied.has(keyFor(col, row)));
    },
    occupy(box, gap = 2) {
      cellsForBox({ x: box.x - gap, y: box.y - gap, w: box.w + gap * 2, h: box.h + gap * 2 })
        .forEach(([col, row]) => occupied.add(keyFor(col, row)));
    },
    getCandidatePoints(tier, limit = Infinity) {
      return cells.filter((cell) => !occupied.has(keyFor(cell.col, cell.row))).sort((a, b) => {
        if (tier === 'filler' && a.edge !== b.edge) return a.edge ? -1 : 1;
        return tier === 'primary' ? a.distance - b.distance : b.distance - a.distance;
      }).slice(0, limit).map((cell) => [cell.x, cell.y]);
    }
  };
}

export function fitsInsideShape(box, cx, cy, radius, shape) {
  const points = [
    [box.x, box.y], [box.x + box.w, box.y],
    [box.x, box.y + box.h], [box.x + box.w, box.y + box.h],
    [box.x + box.w / 2, box.y], [box.x + box.w / 2, box.y + box.h],
    [box.x, box.y + box.h / 2], [box.x + box.w, box.y + box.h / 2],
    [box.x + box.w / 2, box.y + box.h / 2]
  ];

  return points.every(([x, y]) => isInsideShape((x - cx) / radius, (y - cy) / radius, shape));
}

export function boxesOverlap(first, second, gap = 2) {
  return first.x - gap < second.x + second.w + gap
    && first.x + first.w + gap > second.x - gap
    && first.y - gap < second.y + second.h + gap
    && first.y + first.h + gap > second.y - gap;
}

export function buildWordArtCandidates(tokens = [], {
  primaryLimit = 60,
  repeatLimit = 72,
  fillerLimit = 120
} = {}) {
  const rankedTokens = tokens.filter((token) => token?.text).slice(0, primaryLimit);
  if (!rankedTokens.length) return [];

  const maxCount = rankedTokens[0].count || 1;
  const weightedTokens = rankedTokens.flatMap((token) => Array.from(
    { length: Math.max(1, Math.round(((token.count || 1) / maxCount) * 4)) },
    () => token
  ));
  const candidates = rankedTokens.map((token, rank) => ({
    text: token.text,
    count: token.count,
    rank,
    tier: 'primary',
    isMain: true,
    allowVertical: false
  }));

  [['medium', repeatLimit], ['filler', fillerLimit]].forEach(([tier, limit]) => {
    for (let index = 0; index < limit; index += 1) {
      const token = weightedTokens[index % weightedTokens.length];
      candidates.push({
        text: token.text,
        count: token.count,
        rank: rankedTokens.indexOf(token),
        tier,
        isMain: false,
        allowVertical: tier === 'medium'
      });
    }
  });

  return candidates;
}

export function findWordArtPlacement({
  shape,
  cx,
  cy,
  radius,
  sizes,
  widthForSize,
  heightForSize,
  placedBoxes,
  searchPoints,
  vertical = false,
  gap = 2,
  maskMap = null
}) {
  for (const fontSize of sizes) {
    const naturalWidth = widthForSize(fontSize);
    const naturalHeight = heightForSize(fontSize);
    const width = vertical ? naturalHeight : naturalWidth;
    const height = vertical ? naturalWidth : naturalHeight;

    for (const [x, y] of searchPoints) {
      const box = { x: x - width / 2, y: y - height / 2, w: width, h: height };
      if ((maskMap ? maskMap.canPlace(box) : fitsInsideShape(box, cx, cy, radius, shape))
        && !placedBoxes.some((other) => boxesOverlap(box, other, gap))) {
        return { x, y, box, fontSize, vertical };
      }
    }
  }

  return null;
}

function drawWordArtShapeGuide(ctx, shape, cx, cy, radius) {
  const points = getWordArtShapePoints(shape, cx, cy, radius);
  ctx.beginPath();
  points.forEach(([x, y], index) => {
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fill();
}

function buildSpiralSearchPoints(cx, cy, tier) {
  const config = {
    primary: { maxAngle: Math.PI * 48, step: 0.16, growth: 4.1 },
    medium: { maxAngle: Math.PI * 64, step: 0.13, growth: 3.4 },
    filler: { maxAngle: Math.PI * 82, step: 0.1, growth: 2.8 }
  }[tier] || { maxAngle: Math.PI * 64, step: 0.13, growth: 3.4 };
  const points = [];

  for (let angle = 0; angle <= config.maxAngle; angle += config.step) {
    const distance = config.growth * angle;
    points.push([cx + distance * Math.cos(angle), cy + distance * Math.sin(angle)]);
  }

  return points;
}

function renderWordArt() {
  const canvas = element('wordArtCanvas');
  if (!canvas) return;

  const tokens = buildWordCloudTokens(state.students, 60);
  drawWordArt(canvas, tokens, state.wordArtShape || 'heart', state.wordArtPalette || 'rainbow');
}

function drawWordArt(canvas, tokens, shape = 'heart', palette = 'rainbow') {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const displayW = 800;
  const displayH = 500;

  canvas.width = displayW * dpr;
  canvas.height = displayH * dpr;
  canvas.style.width = `${displayW}px`;
  canvas.style.height = `${displayH}px`;

  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, displayW, displayH);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, displayW, displayH);

  if (!tokens || tokens.length === 0) {
    ctx.fillStyle = '#94a3b8';
    ctx.font = '700 16px "Outfit", "Inter", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('작성된 학생 글이 없어 워드 아트를 생성할 수 없습니다.', displayW / 2, displayH / 2);
    return;
  }

  const cx = displayW / 2;
  const cy = displayH / 2;
  const R = Math.min(displayW, displayH) * 0.43;

  const maskMap = createWordArtMaskMap({
    shape, width: displayW, height: displayH, cx, cy, radius: R, cellSize: 8
  });

  // The guide and packing map share the same vector outline.
  ctx.save();
  ctx.fillStyle = 'rgba(241, 245, 249, 0.65)';
  drawWordArtShapeGuide(ctx, shape, cx, cy, R);
  ctx.restore();

  const colorPalettes = {
    rainbow: ['#2563eb', '#dc2626', '#d97706', '#059669', '#7c3aed', '#0284c7', '#db2777', '#4f46e5'],
    ocean: ['#1e40af', '#1d4ed8', '#2563eb', '#3b82f6', '#0284c7', '#06b6d4', '#0f766e', '#0369a1'],
    sunset: ['#991b1b', '#c2410c', '#ea580c', '#d97706', '#ca8a04', '#be123c', '#9d174d', '#b45309'],
    forest: ['#064e3b', '#047857', '#059669', '#10b981', '#34d399', '#15803d', '#3f6212', '#166534'],
    pastel: ['#7c3aed', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#4f46e5']
  };

  const colors = colorPalettes[palette] || colorPalettes.rainbow;

  const maxCount = tokens[0].count;
  const minCount = tokens[tokens.length - 1].count;
  const placedBoxes = [];
  const candidates = buildWordArtCandidates(tokens);
  let colorIndex = 0;
  const tiers = ['primary', 'medium', 'filler'];
  const tierPointLimits = { primary: 1200, medium: 1600, filler: 2000 };
  const schedule = typeof window.requestAnimationFrame === 'function'
    ? window.requestAnimationFrame.bind(window)
    : (callback) => setTimeout(callback, 0);
  let tierIndex = 0;

  const renderNextTier = () => {
    const tier = tiers[tierIndex];
    const searchPoints = maskMap.getCandidatePoints(tier, tierPointLimits[tier]);
    candidates.filter((candidate) => candidate.tier === tier).forEach((candidate, index) => {
      const norm = maxCount === minCount ? 1 : (candidate.count - minCount) / (maxCount - minCount);
      const preferredSize = tier === 'primary'
        ? Math.round(20 + norm * 34)
        : tier === 'medium'
          ? Math.round(11 + norm * 14)
          : Math.round(7 + norm * 8);
      const minimumSize = tier === 'primary' ? 15 : tier === 'medium' ? 8 : 5;
      const sizes = [...new Set([preferredSize, Math.round(preferredSize * 0.84), Math.round(preferredSize * 0.7), minimumSize])]
        .filter((size) => size >= minimumSize);
      const vertical = candidate.allowVertical && ((index + candidate.rank) % 4 === 0);
      const fontForSize = (size) => `${candidate.isMain ? '800' : '600'} ${size}px "Outfit", "Inter", "Apple SD Gothic Neo", sans-serif`;
      const placement = findWordArtPlacement({
        shape,
        cx,
        cy,
        radius: R,
        sizes,
        widthForSize: (size) => {
          ctx.font = fontForSize(size);
          return ctx.measureText(candidate.text).width + 4;
        },
        heightForSize: (size) => size * 1.08,
        placedBoxes,
        searchPoints,
        vertical,
        gap: tier === 'filler' ? 1 : 2,
        maskMap
      });

      if (!placement) return;
      placedBoxes.push(placement.box);
      maskMap.occupy(placement.box, tier === 'filler' ? 1 : 2);

      ctx.save();
      ctx.translate(placement.x, placement.y);
      if (placement.vertical) ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = colors[colorIndex % colors.length];
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = fontForSize(placement.fontSize);
      if (candidate.isMain) {
        ctx.shadowColor = 'rgba(0, 0, 0, 0.12)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetY = 2;
      }
      ctx.fillText(candidate.text, 0, 0);
      ctx.restore();
      colorIndex += 1;
    });
    tierIndex += 1;
    if (tierIndex < tiers.length) schedule(renderNextTier);
  };
  schedule(renderNextTier);
}

function downloadWordArtImage() {
  const canvas = element('wordArtCanvas');
  if (!canvas) return;
  const link = document.createElement('a');
  link.download = `THINK_WordArt_${state.stageCode}단계.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
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

function selectInsightTool(tool) {
  state.selectedInsightTool = tool;
  const isWordCloud = tool === 'wordcloud';
  const isWordArt = tool === 'wordart';
  const isAi = tool === 'ai';

  const wordCloudPanel = element('insightWordCloudPanel');
  const wordArtPanel = element('insightWordArtPanel');
  const aiPanel = element('insightAiPanel');

  if (wordCloudPanel) {
    wordCloudPanel.hidden = !isWordCloud;
    wordCloudPanel.style.display = isWordCloud ? 'flex' : 'none';
  }
  if (wordArtPanel) {
    wordArtPanel.hidden = !isWordArt;
    wordArtPanel.style.display = isWordArt ? 'flex' : 'none';
  }
  if (aiPanel) {
    aiPanel.hidden = !isAi;
    aiPanel.style.display = isAi ? 'flex' : 'none';
  }

  element('insightToolWordCloudBtn')?.classList.toggle('is-active', isWordCloud);
  element('insightToolWordArtBtn')?.classList.toggle('is-active', isWordArt);
  element('insightToolAiBtn')?.classList.toggle('is-active', isAi);

  element('insightToolWordCloudBtn')?.setAttribute('aria-selected', String(isWordCloud));
  element('insightToolWordArtBtn')?.setAttribute('aria-selected', String(isWordArt));
  element('insightToolAiBtn')?.setAttribute('aria-selected', String(isAi));

  if (isWordCloud) {
    renderWordCloud();
  } else if (isWordArt) {
    renderWordArt();
  }
}

function selectTab(tab) {
  const writing = tab === 'writing';
  const writingPanel = element('studentWritingPanel');
  const insightsPanel = element('classInsightsPanel');

  if (writingPanel) {
    writingPanel.hidden = !writing;
    writingPanel.style.display = writing ? 'block' : 'none';
  }
  if (insightsPanel) {
    insightsPanel.hidden = writing;
    insightsPanel.style.display = writing ? 'none' : 'grid';
  }
  if (element('stageResponseHeader')) element('stageResponseHeader').style.display = 'block';
  element('studentWritingTab')?.classList.toggle('is-active', writing);
  element('classInsightsTab')?.classList.toggle('is-active', !writing);
  element('studentWritingTab')?.setAttribute('aria-selected', String(writing));
  element('classInsightsTab')?.setAttribute('aria-selected', String(!writing));
  
  if (!writing) {
    selectInsightTool(state.selectedInsightTool || 'wordcloud');
  }
}

function bindEvents() {
  element('studentWritingTab')?.addEventListener('click', () => selectTab('writing'));
  element('classInsightsTab')?.addEventListener('click', () => selectTab('insights'));
  element('insightToolWordCloudBtn')?.addEventListener('click', () => selectInsightTool('wordcloud'));
  element('insightToolWordArtBtn')?.addEventListener('click', () => selectInsightTool('wordart'));
  element('insightToolAiBtn')?.addEventListener('click', () => selectInsightTool('ai'));
  element('refreshWordArtBtn')?.addEventListener('click', () => renderWordArt());
  element('downloadWordArtBtn')?.addEventListener('click', () => downloadWordArtImage());
  
  element('wordArtPaletteSelect')?.addEventListener('change', (e) => {
    state.wordArtPalette = e.target.value;
    renderWordArt();
  });

  const shapeBtns = document.querySelectorAll('.wa-shape-btn');
  shapeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      shapeBtns.forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      state.wordArtShape = btn.dataset.shape || 'heart';
      renderWordArt();
    });
  });

  element('responseFilter')?.addEventListener('change', (event) => { state.filter = event.target.value; renderStudentList(); });
  element('responseSort')?.addEventListener('change', (event) => { state.sort = event.target.value; renderStudentList(); });
  document.querySelector("[id='generateClassInsightButton']")?.addEventListener('click', generateClassInsight);
}

export async function renderInPageContainer(container, classId, lessonId, stageCode, initialTab = 'writing') {
  if (!container) return;
  state.classId = classId;
  state.lessonId = lessonId;
  state.stageCode = stageCode;
  state.classInfo = null;
  state.lesson = null;
  state.students = [];
  state.selectedStudentNumber = null;

  container.innerHTML = `
    <div class="stage-response-inpage-wrapper">
      <header id="stageResponseHeader" class="stage-response-header compact-header" aria-live="polite"></header>
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
            <div id="studentResponseList"><p class="stage-response-empty">불러오는 중...</p></div>
          </aside>
          <article id="selectedStudentResponse" class="stage-response-detail" aria-live="polite">
            <p class="stage-response-empty">학생을 선택해 주세요.</p>
          </article>
        </div>
      </section>

      <section id="classInsightsPanel" class="class-insights-panel" hidden>
        <div class="class-insight-card class-insight-summary-card"><h2>작성 현황</h2><div id="insightSummary" class="stage-response-summary"></div></div>
        
        <div class="insight-tool-tabs-wrapper">
          <div class="insight-tool-tabs" role="tablist" aria-label="학급 인사이트 기능 선택">
            <button type="button" id="insightToolWordCloudBtn" class="insight-tool-btn is-active" role="tab" aria-selected="true">핵심 표현 워드 클라우드</button>
            <button type="button" id="insightToolWordArtBtn" class="insight-tool-btn" role="tab" aria-selected="false">워드 아트 클라우드 🎨</button>
            <button type="button" id="insightToolAiBtn" class="insight-tool-btn" role="tab" aria-selected="false">AI 학급 인사이트 ✨</button>
          </div>
        </div>

        <div id="insightWordCloudPanel" class="class-insight-card">
          <h2>핵심 표현 워드 클라우드</h2>
          <p class="class-insight-help">학생 글에서 조사 및 불용어를 정제하여 주요 핵심 키워드와 사용 빈도를 집계합니다.</p>
          <div id="wordCloud" class="teacher-word-cloud"></div>
          <div id="wordCloudDetailPanel" class="word-cloud-detail-panel"></div>
        </div>

        <div id="insightWordArtPanel" class="class-insight-card" hidden style="display: none;">
          <div class="word-art-top-header">
            <div class="word-art-title-group">
              <h2>워드 아트 클라우드 🎨</h2>
              <p class="class-insight-help">선택한 마스크 모양과 색상 팔레트에 따라 핵심 단어들을 예술적 형상으로 시각화합니다.</p>
            </div>
            <div class="word-art-actions-group">
              <button type="button" id="refreshWordArtBtn" class="btn btn-secondary">🎨 새로 그리기</button>
              <button type="button" id="downloadWordArtBtn" class="btn btn-primary">📷 이미지로 저장</button>
            </div>
          </div>

          <div class="word-art-controls-bar">
            <div class="word-art-control-group">
              <span class="word-art-label">마스크 모양:</span>
              <div class="word-art-shape-picker" role="radiogroup">
                <button type="button" class="wa-shape-btn is-active" data-shape="heart" title="하트">❤️ 하트</button>
                <button type="button" class="wa-shape-btn" data-shape="star" title="별">⭐️ 별</button>
                <button type="button" class="wa-shape-btn" data-shape="lightbulb" title="전구">💡 전구</button>
                <button type="button" class="wa-shape-btn" data-shape="cloud" title="구름">☁️ 구름</button>
                <button type="button" class="wa-shape-btn" data-shape="diamond" title="유전자/다이아몬드">🧬 유전자</button>
                <button type="button" class="wa-shape-btn" data-shape="circle" title="동그라미">● 원형</button>
                <button type="button" class="wa-shape-btn" data-shape="apple" title="사과">🍎 사과</button>
              </div>
            </div>
            <div class="word-art-control-group">
              <span class="word-art-label">색상 팔레트:</span>
              <select id="wordArtPaletteSelect" class="word-art-select">
                <option value="rainbow">🌈 레인보우 (비비드)</option>
                <option value="ocean">🌊 오션 (시원한 파랑)</option>
                <option value="sunset">🌅 썬셋 (따뜻한 노을)</option>
                <option value="forest">🌲 포레스트 (네이처 그린)</option>
                <option value="pastel">🔮 파스텔 (몽환 바이올렛)</option>
              </select>
            </div>
          </div>

          <div id="wordArtCanvasWrapper" class="word-art-canvas-wrapper">
            <canvas id="wordArtCanvas" width="800" height="500"></canvas>
          </div>
        </div>

        <div id="insightAiPanel" class="class-insight-card" hidden style="display: none;">
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
  renderHeader();
  selectTab(initialTab || 'writing');

  try {
    const result = await window.SupabaseService.fetchTeacherStageResponses(classId, lessonId, stageCode);
    Object.assign(state, {
      classInfo: result.classInfo,
      lesson: result.lesson,
      stageAccessMode: result.stageAccessMode,
      students: result.students || [],
      selectedStudentNumber: null
    });
    renderHeader();
    renderSummary('responseSummary');
    renderSummary('insightSummary');
    renderStudentList();
    renderWordCloud();

    selectTab(initialTab || 'writing');
  } catch (error) {
    showError(error.message || '학생 글을 불러오지 못했습니다.');
  }
}

const TeacherStageResponsesModule = {
  summarizeStudents,
  buildWordCloudTokens,
  renderInPageContainer,
  switchStage,
  toggleCurrentStageAccess,
  selectToken,
  selectStudentFromCloud
};

if (typeof window !== 'undefined') {
  window.TeacherStageResponsesModule = TeacherStageResponsesModule;
}

