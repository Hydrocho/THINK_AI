# Student Live Lesson Lobby Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로그인한 학생이 PIN 없이 자신의 학급에서 현재 열린 차시 하나에만 입장하고, 단계별 권한과 개인 기록을 정확히 보게 한다.

**Architecture:** 서버는 로그인한 학생의 `student_accounts.class_id`를 신뢰할 수 있는 학급 경계로 사용해 열린 `class_sessions` 하나와 개인 THINK 기록을 반환한다. 클라이언트는 그 응답을 `liveLesson`과 `history`로 분리해 렌더링하며, 선택된 liveLesson만 THINK 화면 상태로 전달한다.

**Tech Stack:** 정적 HTML/CSS, 브라우저 JavaScript, Supabase JS v2, Supabase Edge Functions (Deno), PostgreSQL migrations, Node.js built-in test runner.

## Global Constraints

- PIN 입력·PIN 진입 함수·학생 로비의 `fetchActivities()` 호출을 제거한다.
- 학생의 학급 식별은 학번 파싱이나 `classes`의 학년·반 검색이 아니라 `student_accounts.auth_user_id`로 한다.
- 학급당 `status = 'open'`인 `class_sessions`는 데이터베이스에서 최대 하나만 허용한다.
- 학생 API와 저장 API는 서비스 역할로 조회하더라도 인증된 학생 본인의 학급·기록만 반환하거나 변경한다.
- 단계 권한 행이 없으면 반드시 `hidden`으로 처리한다.
- 기존 사용자 수정 파일(`js/modules/studentManager.js`, `supabase/functions/manage-student-accounts/index.ts`, `supabase/migrations/20260810110000_preserve_students_on_class_delete.sql`)은 이 작업에서 수정하지 않는다.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `supabase/migrations/20260810*_single_open_class_session_and_response_status.sql` | 학급 단위 열린 세션 제약과 제출 시각을 저장하는 스키마 변경 |
| `supabase/functions/manage-class-projects/index.ts` | 교사가 차시를 열 때 학급의 기존 열린 세션을 닫고 유효한 차시만 연다 |
| `supabase/functions/get-student-lessons/index.ts` | 학생별 현재 열린 차시와 개인 기록을 한 응답으로 반환 |
| `supabase/functions/save-think-stage-response/index.ts` | 학생의 쓰기 권한, 차시 소속, 최종 제출 상태를 검증·저장 |
| `js/supabase-client.js` | `fetchStudentLiveLesson()` 및 제출 옵션이 있는 저장 API 제공 |
| `views/studentLobbyView.html` | PIN 없는 현재 수업·개인 기록 로비 구조 |
| `js/modules/studentLobby.js` | 로비의 로딩/오류/빈 상태와 liveLesson/history 렌더링 |
| `views/studentThinkView.html` | 동적 차시 제목과 단일 수업 진입에 맞는 THINK 화면 DOM |
| `js/app.js` | liveLesson을 선택 상태로 유지하고 단계·작성·제출을 새 API에 연결 |
| `js/modules/studentThink.js` | 실제 DOM 컨테이너와 접근 권한을 기준으로 본문을 렌더링 |
| `tests/student-live-lesson-lobby.test.mjs` | 학생 진입 경로, ID 계약, 레거시 경로 제거 회귀 검사 |

### Task 1: 학생 로비 회귀 테스트를 먼저 추가한다

**Files:**
- Create: `tests/student-live-lesson-lobby.test.mjs`
- Modify: 없음

**Interfaces:**
- Consumes: 현재 `views/studentLobbyView.html`, `views/studentThinkView.html`, `js/modules/studentLobby.js`, `js/app.js`, `js/modules/studentThink.js`
- Produces: 이후 작업의 DOM/API 계약을 고정하는 Node 테스트

- [ ] **Step 1: 실패하는 정적 계약 테스트를 작성한다.**

```js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const lobbyView = fs.readFileSync(new URL('../views/studentLobbyView.html', import.meta.url), 'utf8');
const lobby = fs.readFileSync(new URL('../js/modules/studentLobby.js', import.meta.url), 'utf8');
const thinkView = fs.readFileSync(new URL('../views/studentThinkView.html', import.meta.url), 'utf8');
const think = fs.readFileSync(new URL('../js/modules/studentThink.js', import.meta.url), 'utf8');

test('student lobby contains one live lesson target and no PIN or legacy activity path', () => {
  assert.match(lobbyView, /id="lobbyActiveLessonContainer"/);
  assert.doesNotMatch(lobbyView, /inputPinCode|PIN 번호/);
  assert.match(lobby, /fetchStudentLiveLesson/);
  assert.doesNotMatch(lobby, /fetchActivities|enterByPin|APP_CONFIG\.LESSONS/);
});

test('THINK renderer and view use the same content container', () => {
  assert.match(thinkView, /id="stepContentContainer"/);
  assert.match(think, /getElementById\('stepContentContainer'\)/);
});
```

- [ ] **Step 2: 테스트가 현재 실패하는지 확인한다.**

Run: `node --test tests/student-live-lesson-lobby.test.mjs`  
Expected: FAIL because PIN 및 `fetchActivities()` 경로가 남아 있고 THINK 컨테이너 ID가 불일치한다.

- [ ] **Step 3: 서버 계약 검사도 같은 파일에 추가한다.**

```js
const studentLessons = fs.readFileSync(new URL('../supabase/functions/get-student-lessons/index.ts', import.meta.url), 'utf8');
const projectFunction = fs.readFileSync(new URL('../supabase/functions/manage-class-projects/index.ts', import.meta.url), 'utf8');

test('student lesson API is based on the student account and an open class session', () => {
  assert.match(studentLessons, /student_accounts/);
  assert.match(studentLessons, /class_sessions/);
  assert.match(studentLessons, /status["']?,?\s*[:=].*open|\.eq\(["']status["'],["']open["']\)/s);
  assert.match(studentLessons, /liveLesson/);
});

test('opening a lesson scopes existing open sessions to the whole class', () => {
  assert.match(projectFunction, /class_id/);
  assert.match(projectFunction, /status:"closed"/);
});
```

- [ ] **Step 4: 테스트를 다시 실행해 실패 상태를 기록한다.**

Run: `node --test tests/student-live-lesson-lobby.test.mjs`  
Expected: FAIL until Tasks 2–5 are complete.

- [ ] **Step 5: 커밋한다.**

```powershell
git add tests/student-live-lesson-lobby.test.mjs
git commit -m "test: cover student live lesson lobby contract"
```

### Task 2: 학급당 열린 차시 하나를 데이터베이스와 교사 API에서 보장한다

**Files:**
- Create: `supabase/migrations/20260810*_single_open_class_session_and_response_status.sql`
- Modify: `supabase/functions/manage-class-projects/index.ts`
- Modify: `js/modules/teacherAdmin.js`
- Test: `tests/student-live-lesson-lobby.test.mjs`

**Interfaces:**
- Consumes: `class_projects(id, class_id, source_version_id)`, `class_sessions`
- Produces: `class_sessions.class_id`, partial unique index `one_open_session_per_class`, `open_lesson`이 반환하는 검증된 열린 세션

- [ ] **Step 1: migration 존재와 단일 열린 세션 제약을 검사하는 실패 테스트를 추가한다.**

```js
test('migration enforces at most one open session per class', () => {
  const files = fs.readdirSync(new URL('../supabase/migrations/', import.meta.url));
  const migrationName = files.find(name => name.includes('single_open_class_session'));
  assert.ok(migrationName);
  const migration = fs.readFileSync(new URL(`../supabase/migrations/${migrationName}`, import.meta.url), 'utf8');
  assert.match(migration, /add column if not exists class_id uuid/);
  assert.match(migration, /create unique index.*one_open_session_per_class.*where status = 'open'/is);
});
```

- [ ] **Step 2: 실패를 확인한다.**

Run: `node --test tests/student-live-lesson-lobby.test.mjs`  
Expected: FAIL because migration is absent.

- [ ] **Step 3: 새 migration을 만든다.**

```sql
alter table public.class_sessions add column if not exists class_id uuid references public.classes(id) on delete cascade;

update public.class_sessions s
set class_id = cp.class_id
from public.class_projects cp
where cp.id = s.class_project_id and s.class_id is null;

alter table public.class_sessions alter column class_id set not null;

create unique index if not exists one_open_session_per_class
  on public.class_sessions (class_id)
  where status = 'open';

alter table public.think_stage_responses
  add column if not exists submitted_at timestamptz;
```

- [ ] **Step 4: `open_lesson`을 학급 범위로 검증·교체한다.**

`manage-class-projects`의 `open_lesson` 분기를 아래 순서로 바꾼다.

```ts
const { data: classProject } = await admin
  .from('class_projects')
  .select('id,class_id,source_version_id,attached_by')
  .eq('id', b.classProjectId)
  .eq('attached_by', userId)
  .single();
if (!classProject) return json({ error: '학급 프로젝트를 찾을 수 없거나 권한이 없습니다.' }, 404);

const { data: lesson } = await admin
  .from('lesson_plans')
  .select('id')
  .eq('id', b.lessonPlanId)
  .eq('project_version_id', classProject.source_version_id)
  .single();
if (!lesson) return json({ error: '연결된 프로젝트에 속한 차시만 열 수 있습니다.' }, 400);

await admin.from('class_sessions')
  .update({ status: 'closed', closed_at: new Date().toISOString() })
  .eq('class_id', classProject.class_id)
  .eq('status', 'open');

const { data: session, error } = await admin.from('class_sessions').insert({
  class_project_id: classProject.id,
  class_id: classProject.class_id,
  lesson_plan_id: lesson.id,
  teacher_id: userId,
  status: 'open',
  opened_at: new Date().toISOString()
}).select().single();
```

`toggleClassLessonSession()`의 닫기 경로도 직접 테이블을 업데이트하지 말고, 같은 Edge Function에 `close_lesson` action을 추가해 `class_id`, `teacher_id`, `status='open'`으로 닫도록 변경한다.

- [ ] **Step 5: migration을 로컬 Supabase에 적용하고 테스트를 실행한다.**

Run: `supabase db reset --local`  
Expected: migration succeeds and the partial unique index exists.

Run: `node --test tests/student-live-lesson-lobby.test.mjs`  
Expected: Task 2 assertions PASS; Task 3–5 assertions may still FAIL.

- [ ] **Step 6: 커밋한다.**

```powershell
git add supabase/migrations/*single_open_class_session_and_response_status.sql supabase/functions/manage-class-projects/index.ts js/modules/teacherAdmin.js tests/student-live-lesson-lobby.test.mjs
git commit -m "fix: enforce one open lesson per class"
```

### Task 3: 학생별 현재 수업·개인 기록 API와 저장 권한을 구현한다

**Files:**
- Modify: `supabase/functions/get-student-lessons/index.ts`
- Modify: `supabase/functions/save-think-stage-response/index.ts`
- Test: `tests/student-live-lesson-lobby.test.mjs`

**Interfaces:**
- Consumes: authenticated `auth.users.id`, `student_accounts`, `class_sessions`, `class_lesson_stage_access`, `think_stage_responses`
- Produces: `StudentLiveLessonResponse`와 `save-think-stage-response({ lessonPlanId, stageCode, content, submit? })`

- [ ] **Step 1: API 소스 계약 테스트를 확장한다.**

```js
const responseFunction = fs.readFileSync(new URL('../supabase/functions/save-think-stage-response/index.ts', import.meta.url), 'utf8');

test('student APIs use the authenticated student account and retain final submission state', () => {
  assert.match(studentLessons, /auth_user_id/);
  assert.match(studentLessons, /think_stage_responses/);
  assert.match(studentLessons, /submitted_at/);
  assert.match(responseFunction, /auth_user_id/);
  assert.match(responseFunction, /submitted_at/);
  assert.match(responseFunction, /class_sessions/);
});
```

- [ ] **Step 2: 실패를 확인한다.**

Run: `node --test tests/student-live-lesson-lobby.test.mjs`  
Expected: FAIL because both functions currently derive a class from the student number and do not return submission history.

- [ ] **Step 3: `get-student-lessons`를 `StudentLiveLessonResponse`로 교체한다.**

구현은 다음 쿼리 순서를 사용한다.

```ts
const { data: student } = await admin.from('student_accounts')
  .select('id,student_number,class_id')
  .eq('auth_user_id', user.id)
  .single();
if (!student) return json({ error: '학생 계정을 찾을 수 없습니다.' }, 403);

const { data: session } = await admin.from('class_sessions')
  .select('id,class_id,class_project_id,lesson_plan_id,opened_at,class_projects!inner(source_project_id,source_version_id,title),lesson_plans!inner(id,lesson_order,title,core_question,think_stages,ai_question_limit,ai_response_mode)')
  .eq('class_id', student.class_id)
  .eq('status', 'open')
  .order('opened_at', { ascending: false })
  .maybeSingle();
```

세션이 있으면 해당 `lesson_plan_id`의 `class_lesson_stage_access`를 읽어 T/H/I/N/K 전체를 `hidden` 기본값과 병합한다. 이후 `think_stage_responses`에서 `student_number = student.student_number`인 행을 읽어 lesson별 최신 `updated_at`과 K 단계의 `submitted_at`으로 history를 만든다. 응답 필드는 설계 문서의 camelCase 계약을 사용한다.

- [ ] **Step 4: 저장 API의 학급·세션·제출 검증을 추가한다.**

```ts
const { data: student } = await admin.from('student_accounts')
  .select('student_number,class_id')
  .eq('auth_user_id', user.id)
  .single();
if (!student) return json({ error: '학생 계정을 찾을 수 없습니다.' }, 403);

const { data: liveSession } = await admin.from('class_sessions')
  .select('lesson_plan_id')
  .eq('class_id', student.class_id)
  .eq('lesson_plan_id', b.lessonPlanId)
  .eq('status', 'open')
  .maybeSingle();
if (!liveSession) return json({ error: '현재 열린 수업의 차시만 작성할 수 있습니다.' }, 403);

if (b.submit && b.stageCode !== 'K') return json({ error: '최종 제출은 K 단계에서만 가능합니다.' }, 400);
const submittedAt = b.submit ? new Date().toISOString() : null;
```

upsert 시 K 단계의 기존 `submitted_at`을 초안 저장으로 지우지 않도록 `submit`인 경우에만 제출 시각을 갱신한다. 쓰기 권한 검사는 기존처럼 `class_lesson_stage_access`를 사용하되 행이 없으면 거절한다.

- [ ] **Step 5: 로컬 DB와 정적 테스트를 실행한다.**

Run: `supabase db reset --local`  
Expected: Edge Function이 참조하는 새 `class_id`와 `submitted_at` 컬럼이 존재한다.

Run: `node --test tests/student-live-lesson-lobby.test.mjs`  
Expected: Task 3 API 계약 assertions PASS.

- [ ] **Step 6: 커밋한다.**

```powershell
git add supabase/functions/get-student-lessons/index.ts supabase/functions/save-think-stage-response/index.ts tests/student-live-lesson-lobby.test.mjs
git commit -m "feat: return student live lesson and history"
```

### Task 4: PIN 없는 학생 로비와 클라이언트 데이터 어댑터를 구현한다

**Files:**
- Modify: `js/supabase-client.js`
- Modify: `views/studentLobbyView.html`
- Modify: `js/modules/studentLobby.js`
- Test: `tests/student-live-lesson-lobby.test.mjs`

**Interfaces:**
- Consumes: `SupabaseService.fetchStudentLiveLesson(): Promise<StudentLiveLessonResponse>`
- Produces: `StudentLobbyModule.renderLobby(state)` 및 `StudentLobbyModule.enterLiveLesson(state, liveLesson)`

- [ ] **Step 1: 서비스와 로비 렌더링의 실패 테스트를 추가한다.**

```js
const client = fs.readFileSync(new URL('../js/supabase-client.js', import.meta.url), 'utf8');

test('client and lobby expose the live-lesson-only entry point', () => {
  assert.match(client, /fetchStudentLiveLesson:\s*async function/);
  assert.match(lobby, /enterLiveLesson:\s*function/);
  assert.match(lobby, /lobbyActiveLessonContainer/);
  assert.match(lobby, /lobbyHistoryContainer/);
  assert.doesNotMatch(lobby, /fetchStudentPublishedLessons|fetchActivities|enterByPin/);
});
```

- [ ] **Step 2: 실패를 확인한다.**

Run: `node --test tests/student-live-lesson-lobby.test.mjs`  
Expected: FAIL because the old service and PIN entry functions remain.

- [ ] **Step 3: Supabase 클라이언트 API를 교체한다.**

```js
fetchStudentLiveLesson: async function () {
  return this.invokeAccountFunction('get-student-lessons', {});
},
saveThinkStageResponse: async function (lessonPlanId, stageCode, content, { submit = false } = {}) {
  return this.invokeAccountFunction('save-think-stage-response', { lessonPlanId, stageCode, content, submit });
},
```

`fetchStudentPublishedLessons`는 학생 로비에서 더 이상 사용하지 않으므로 제거한다. `fetchActivities`는 교사용 레거시 기능이 아직 참조한다면 남길 수 있지만 학생 로비에서는 호출하지 않는다.

- [ ] **Step 4: 로비 HTML을 PIN 없는 구조로 변경한다.**

환영 문구를 `현재 열린 수업에 바로 참여할 수 있습니다.`로 바꾸고 PIN 카드 전체를 삭제한다. `#lobbyActiveLessonContainer`와 `#lobbyHistoryContainer`는 유지한다.

- [ ] **Step 5: `StudentLobbyModule`을 liveLesson/history 전용으로 재작성한다.**

```js
renderLobby: async function (state) {
  const active = document.getElementById('lobbyActiveLessonContainer');
  const history = document.getElementById('lobbyHistoryContainer');
  active.innerHTML = '<p class="lobby-loading">현재 수업을 확인하는 중입니다…</p>';
  history.innerHTML = '';
  try {
    const result = await window.SupabaseService.fetchStudentLiveLesson();
    state.liveLesson = result.liveLesson || null;
    this.renderLiveLesson(active, state.liveLesson);
    this.renderHistory(history, result.history || []);
  } catch (error) {
    active.innerHTML = `<p class="lobby-error">수업 정보를 불러오지 못했습니다. ${this.escapeHtml(error.message)}</p>`;
  }
},
enterLiveLesson: function (state) {
  if (!state.liveLesson?.lesson) return;
  state.activeLessonPlans = [state.liveLesson.lesson];
  state.currentLessonIndex = 0;
  state.currentStep = 1;
  document.getElementById('studentLobbySection').style.display = 'none';
  document.getElementById('studentAppSection').style.display = 'grid';
  window.App.selectLesson(0);
}
```

`renderLiveLesson`은 프로젝트명, 차시명, 핵심 질문, `writable` 단계 라벨과 버튼을 표시한다. `liveLesson === null`이면 대기 안내만 표시하고 버튼을 만들지 않는다. history는 `submitted`를 `제출 완료`, 나머지를 `작성 중`으로 표기한다. 사용자/교사 입력을 HTML에 넣기 전에 `escapeHtml`로 이스케이프한다.

- [ ] **Step 6: 테스트를 실행한다.**

Run: `node --test tests/student-live-lesson-lobby.test.mjs`  
Expected: Task 4 assertions PASS.

- [ ] **Step 7: 커밋한다.**

```powershell
git add js/supabase-client.js views/studentLobbyView.html js/modules/studentLobby.js tests/student-live-lesson-lobby.test.mjs
git commit -m "feat: show students their current live lesson"
```

### Task 5: 학생 THINK 화면을 실제 liveLesson과 권한에 연결한다

**Files:**
- Modify: `views/studentThinkView.html`
- Modify: `js/app.js`
- Modify: `js/modules/studentThink.js`
- Test: `tests/student-live-lesson-lobby.test.mjs`

**Interfaces:**
- Consumes: `state.activeLessonPlans[0]`의 `title`, `coreQuestion`, `thinkStages`, `thinkStageAccess`
- Produces: 실제 열린 차시의 제목·단계·본문을 렌더링하고 T/N/K 응답을 신규 저장 API로 저장

- [ ] **Step 1: 동적 차시 및 ID 계약을 검사하는 실패 테스트를 추가한다.**

```js
const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');

test('student THINK screen uses the active live lesson instead of sample lessons', () => {
  assert.match(app, /state\.activeLessonPlans && state\.activeLessonPlans\[state\.currentLessonIndex\]/);
  assert.doesNotMatch(thinkView, /id="lessonSelect"/);
  assert.match(thinkView, /id="currentLessonLabel"/);
  assert.match(thinkView, /id="stepTagBadge"/);
  assert.match(thinkView, /id="stepMainTitle"/);
  assert.match(think, /getElementById\('stepContentContainer'\)/);
});
```

- [ ] **Step 2: 실패를 확인한다.**

Run: `node --test tests/student-live-lesson-lobby.test.mjs`  
Expected: FAIL because the screen has a hard-coded selector and mismatched IDs.

- [ ] **Step 3: THINK view에서 예시 콘텐츠와 차시 선택 드롭다운을 제거한다.**

사이드바 프로젝트 제목에 `id="currentProjectTitle"`을 추가하고, 차시 선택 `<select id="lessonSelect">` 블록을 삭제한다. 본문 컨테이너는 `id="stepContentContainer"`로 유지한다.

- [ ] **Step 4: `App.selectLesson`과 헤더 업데이트를 활성 차시 우선으로 정정한다.**

```js
const lesson = (state.activeLessonPlans && state.activeLessonPlans[state.currentLessonIndex])
  || window.APP_CONFIG.LESSONS[state.currentLessonIndex];
if (!lesson) return;

document.getElementById('currentLessonLabel').innerText = `${lesson.number}차시 활동 진행 중`;
document.getElementById('currentProjectTitle').innerText = lesson.projectTitle || '진행 중인 프로젝트';
document.getElementById('stepMainTitle').innerText = lesson.coreQuestion || lesson.question;
```

`updateStepNav`는 `stepTagBadge`, `stepSubTitleBadge`, `stepMainTitle`의 실제 ID를 사용한다. `submitFinalReflection()`은 `APP_CONFIG.LESSONS`를 직접 읽지 말고 동일한 활성 차시를 읽어 `saveThinkStageResponse(lesson.id, 'K', content, { submit: true })`를 await한다. `saveInitialThought()`과 `savePeerRationale()`도 각각 T/N 단계 저장 API를 await한다.

- [ ] **Step 5: `StudentThinkModule`의 렌더 대상과 읽기 전용 동작을 정정한다.**

```js
const container = document.getElementById('stepContentContainer');
const questionText = lesson.coreQuestion || lesson.core_question || lesson.question;
const activeStages = lesson.thinkStages || lesson.think_stages || ['T','H','I','N','K'];
const accessMode = lesson.thinkStageAccess?.[currentStageCode]
  || lesson.think_stage_access?.[currentStageCode]
  || 'hidden';
```

`read_only`일 때는 입력·저장 버튼만 disabled 처리하고 이전/다음 단계 이동 버튼은 활성 상태로 유지한다. 이로써 학생이 읽기 전용 단계에서 다음 공개 단계를 볼 수 있다.

- [ ] **Step 6: 테스트를 실행한다.**

Run: `node --test tests/student-live-lesson-lobby.test.mjs`  
Expected: Task 5 assertions PASS.

- [ ] **Step 7: 커밋한다.**

```powershell
git add views/studentThinkView.html js/app.js js/modules/studentThink.js tests/student-live-lesson-lobby.test.mjs
git commit -m "fix: bind student THINK screen to live lesson"
```

### Task 6: 전체 회귀 검사와 수동 수업 흐름을 검증한다

**Files:**
- Modify: 필요 시 `tests/student-live-lesson-lobby.test.mjs`만 보완
- Test: `tests/*.test.mjs`, 로컬 Supabase

**Interfaces:**
- Consumes: Tasks 1–5의 DB·Edge Function·브라우저 계약
- Produces: 배포 전 검증 기록

- [ ] **Step 1: 전체 정적 테스트를 실행한다.**

Run: `node --test tests/*.test.mjs`  
Expected: 모든 테스트 PASS.

- [ ] **Step 2: 로컬 DB migration을 새 환경에서 검증한다.**

Run: `supabase db reset --local`  
Expected: 새 migration을 포함한 모든 migration이 오류 없이 적용된다.

- [ ] **Step 3: 브라우저에서 아래 수동 시나리오를 확인한다.**

1. 학생 로그인 후 열린 차시가 없으면 대기 안내만 보이고 수업 입장 버튼이 없다.
2. 교사가 1차시를 열면 새로고침한 학생 로비에 해당 차시 하나만 표시된다.
3. 교사가 2차시를 열면 1차시는 닫히고 학생 로비에는 2차시만 보인다.
4. 학생이 입장하면 프로젝트명·차시명·핵심 질문이 열린 차시 데이터와 일치한다.
5. T/H/I/N/K를 각각 hidden/read_only/writable로 설정해 잠금·읽기 전용·작성 가능 상태를 확인한다.
6. T 또는 N을 작성한 뒤 로비로 돌아가면 기록에 `작성 중`이 표시되고, K를 제출하면 `제출 완료`으로 바뀐다.
7. 다른 학생 계정으로 로그인해도 첫 학생의 기록이나 다른 학급 세션이 노출되지 않는다.

- [ ] **Step 4: Edge Functions를 배포한다.**

Run: `supabase functions deploy get-student-lessons`  
Expected: deployment succeeds.

Run: `supabase functions deploy save-think-stage-response`  
Expected: deployment succeeds.

Run: `supabase functions deploy manage-class-projects`  
Expected: deployment succeeds.

- [ ] **Step 5: 최종 커밋을 만들고 작업 트리를 확인한다.**

```powershell
git add tests/student-live-lesson-lobby.test.mjs
git commit -m "test: verify student live lesson flow"
git status --short
```

Expected: 이 계획의 파일 외에는 기존 사용자 수정 파일만 남아 있다.

## Plan Self-Review

- 설계 문서의 PIN 제거, 학급당 열린 차시 하나, 단계 권한, 개인 기록, 로비 오류·빈 상태, DOM ID 일치 요구 사항은 각각 Tasks 2–5에 대응한다.
- 모든 새 API 이름은 Task 3 또는 Task 4에서 정의하고 이후 작업에서 같은 이름으로 사용한다.
- 미완성 표식이나 모호한 후속 구현 지시가 없는지 확인했다.
