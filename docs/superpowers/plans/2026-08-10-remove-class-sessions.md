# 학급 연결 활동 기반 수업 전환 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 교사용 수업 열기·닫기 세션을 완전히 제거하고, 학생이 로그인하면 학번으로 찾은 학급에 연결된 모든 차시와 단계 접근 상태를 직접 조회하도록 전환한다.

**Architecture:** `class_projects`는 교사가 학급에 연결해 둔 프로젝트의 유일한 활동 연결 정보로 유지하고, `lesson_plans`는 그 연결된 프로젝트 버전에 속할 때만 학생에게 반환한다. 학생 수업 API와 응답 저장 API는 학번에서 해석한 학급 ID, `class_projects.source_version_id`, `class_lesson_stage_access`를 함께 검증한다. `class_sessions`와 “현재 열린 수업”이라는 개념, UI, API 동작은 제거한다.

**Tech Stack:** Supabase Postgres migrations, Supabase Edge Functions (Deno, supabase-js v2), Node.js built-in test runner, vanilla JavaScript.

## Global Constraints

- 학생-학급 소속은 `student_accounts.class_id`가 아니라 5자리 학번 `GCCNN`에서 계산한다. `30101`은 3학년 1반이다.
- 학생은 자신의 학번으로 계산된 학급의 `class_projects`에 연결된 차시만 볼 수 있다.
- 세션·실시간·수업 열기·수업 닫기라는 학생·교사 UI 및 API 의미를 남기지 않는다.
- THINK 단계 공개 상태는 `class_lesson_stage_access`의 `hidden`, `read_only`, `writable`만 사용한다. 단계가 하나라도 `hidden`이 아니면 해당 차시에 입장할 수 있고, 저장은 `writable`일 때만 허용한다.
- 한 차시는 연결된 프로젝트 버전(`class_projects.source_version_id`)에 실제로 속해야 한다. 요청의 `lessonPlanId`만으로 다른 학급·프로젝트 차시에 접근할 수 없어야 한다.
- `class_sessions` 삭제는 기존 세션 행을 제거한다. 배포 직전 행 수를 조회하고 0건이 아닐 경우 백업 SQL 결과를 사용자에게 보고한 뒤 삭제 migration을 적용한다.
- 신규 migration은 `npx --yes supabase migration new <name>`으로 생성한다. 배포 후 Node 테스트, Deno 검사, 원격 DB 검증을 모두 실행한다.

---

## 파일 구조

- Modify: `supabase/functions/get-student-lessons/index.ts` — 열린 세션 하나가 아닌 학급 연결 차시 목록을 반환한다.
- Modify: `supabase/functions/save-think-stage-response/index.ts` — 세션 확인 없이 학급-프로젝트-차시 소속과 단계 쓰기 권한을 확인한다.
- Modify: `supabase/functions/manage-class-projects/index.ts` — `open_lesson`, `close_lesson` 분기와 세션 쓰기를 제거한다.
- Modify: `supabase/functions/manage-student-accounts/index.ts` — 학급 삭제 시 `class_sessions` 정리 코드를 제거한다.
- Modify: `js/supabase-client.js` — 세션 관련 서비스와 세션 삭제 fallback을 제거하고 `fetchStudentClassLessons`를 제공한다.
- Modify: `js/modules/studentLobby.js` — 단일 실시간 수업 카드 대신 학급 활동·차시 목록을 그리고, 선택한 차시로 THINK 화면에 입장시킨다.
- Modify: `views/studentLobbyView.html` — `실시간 라이브`, `지금 개방한 수업` 문구와 단일 라이브 컨테이너를 학급 활동 목록 UI로 교체한다.
- Modify: `js/modules/teacherAdmin.js` — 열린 세션 조회, 열기/닫기 버튼, 수업 대기/진행 중 상태를 제거하고 프로젝트 연결 및 단계 공개 상태만 표시한다.
- Create: `supabase/migrations/<generated>_drop_class_sessions.sql` — `class_sessions` 테이블을 삭제한다.
- Modify: `tests/student-live-lesson-lobby.test.mjs` — 세션 비의존, 차시 소속 검증, 새 UI·클라이언트 계약을 회귀 테스트한다.

## Task 1: 학급 연결 차시 조회와 저장 권한 전환

**Files:**
- Modify: `supabase/functions/get-student-lessons/index.ts`
- Modify: `supabase/functions/save-think-stage-response/index.ts`
- Modify: `tests/student-live-lesson-lobby.test.mjs`

**Interfaces:**
- Consumes: `resolveStudentClass(admin, student.student_number)` from `supabase/functions/_shared/student-class.ts`.
- Produces: `get-student-lessons` response `{ classId, lessons, history, classResolution? }`, where `lessons` is sorted by project title then `lesson_order` and each item has `id`, `number`, `title`, `coreQuestion`, `thinkStages`, `thinkStageAccess`, `projectId`, and `projectTitle`.
- Produces: `save-think-stage-response` permits a response only when the requested lesson belongs to the computed class's connected project version and its requested stage is `writable`.

- [ ] **Step 1: Write the failing regression tests**

  Replace session-oriented assertions with the following exact requirements.

  ```js
  test('student class lesson APIs do not depend on class sessions', () => {
    assert.doesNotMatch(studentLessons, /class_sessions|liveLesson|sessionId/);
    assert.doesNotMatch(responseFunction, /class_sessions/);
    assert.match(studentLessons, /class_projects/);
    assert.match(studentLessons, /lessons/);
    assert.match(responseFunction, /source_version_id/);
    assert.match(responseFunction, /access_mode !== "writable"/);
  });
  ```

- [ ] **Step 2: Run the test to verify it fails**

  Run: `node --test tests/student-live-lesson-lobby.test.mjs`

  Expected: FAIL because both functions currently query `class_sessions` and return one `liveLesson`.

- [ ] **Step 3: Implement direct class-project lesson retrieval**

  In `get-student-lessons`:

  ```ts
  const { data: classProjects, error: projectError } = await admin
    .from("class_projects")
    .select("id,source_project_id,source_version_id,title")
    .eq("class_id", classId)
    .order("attached_at", { ascending: true });

  const versionIds = (classProjects || []).map(project => project.source_version_id);
  const { data: lessonRows, error: lessonError } = versionIds.length
    ? await admin.from("lesson_plans")
      .select("id,project_version_id,lesson_order,title,core_question,think_stages,ai_question_limit,ai_response_mode")
      .in("project_version_id", versionIds)
      .order("lesson_order", { ascending: true })
    : { data: [], error: null };
  ```

  Fetch `class_lesson_stage_access` once for `classId`, build the five-stage access map with default `hidden`, associate each lesson with its matching `source_version_id`, and return `{ classId, lessons, history }`. Keep the existing history query by authenticated student number.

  In `save-think-stage-response`, replace the open-session query with a join-safe two-step ownership check:

  ```ts
  const { data: lesson } = await admin.from("lesson_plans")
    .select("id,project_version_id")
    .eq("id", body.lessonPlanId)
    .maybeSingle();
  const { data: classProject } = lesson
    ? await admin.from("class_projects")
      .select("id,source_version_id")
      .eq("class_id", classId)
      .eq("source_version_id", lesson.project_version_id)
      .maybeSingle()
    : { data: null };
  if (!classProject) return json({ error: "이 학급에 연결된 차시에서만 작성할 수 있습니다." }, 403);
  ```

  Keep the existing `class_lesson_stage_access` lookup and final-submission rule. The absence of a stage row remains `hidden`, so it cannot be saved.

- [ ] **Step 4: Run focused verification**

  Run:

  ```powershell
  node --test tests/student-live-lesson-lobby.test.mjs
  npx --yes deno check supabase/functions/get-student-lessons/index.ts
  npx --yes deno check supabase/functions/save-think-stage-response/index.ts
  ```

  Expected: all tests and both checks PASS.

- [ ] **Step 5: Commit**

  ```powershell
  git add supabase/functions/get-student-lessons/index.ts supabase/functions/save-think-stage-response/index.ts tests/student-live-lesson-lobby.test.mjs
  git commit -m "feat: load student lessons from class projects"
  ```

### Task 2: 세션 테이블·교사 세션 제어 제거

**Files:**
- Modify: `supabase/functions/manage-class-projects/index.ts`
- Modify: `supabase/functions/manage-student-accounts/index.ts`
- Modify: `js/supabase-client.js`
- Modify: `js/modules/teacherAdmin.js`
- Create: `supabase/migrations/<generated>_drop_class_sessions.sql`
- Modify: `tests/student-live-lesson-lobby.test.mjs`

**Interfaces:**
- Produces: no callable `open_lesson`, `close_lesson`, `openClassLesson`, or `closeClassLesson` API.
- Produces: teacher class detail cards that show connected project and per-stage accessibility only.
- Produces: a database with no `public.class_sessions` table after migration.

- [ ] **Step 1: Write the failing regression tests**

  Add tests that require the session table and session API vocabulary to be absent.

  ```js
  test('teacher and client flows do not expose lesson sessions', () => {
    assert.doesNotMatch(projectFunction, /open_lesson|close_lesson|class_sessions/);
    assert.doesNotMatch(accountFunction, /class_sessions/);
    assert.doesNotMatch(client, /openClassLesson|closeClassLesson|class_sessions/);
    assert.doesNotMatch(teacherAdmin, /class_sessions|toggleClassLessonSession|수업 열기|수업 닫기|수업 진행 중/);
    assert.match(dropSessionsMigration, /drop table if exists public\.class_sessions/i);
  });
  ```

- [ ] **Step 2: Run the test to verify it fails**

  Run: `node --test tests/student-live-lesson-lobby.test.mjs`

  Expected: FAIL because session actions, UI controls, and no drop migration are present.

- [ ] **Step 3: Create the destructive migration only after checking data**

  Run:

  ```powershell
  npx --yes supabase db query --linked "select count(*)::int as class_session_count from public.class_sessions"
  npx --yes supabase migration new drop_class_sessions
  ```

  If the count is nonzero, export the rows with `npx --yes supabase db query --linked "select * from public.class_sessions order by opened_at"` and report the result before proceeding. If the count is zero, edit the newly generated migration to contain:

  ```sql
  DROP TABLE IF EXISTS public.class_sessions;
  ```

- [ ] **Step 4: Remove server and client session paths**

  - Delete only the `open_lesson` and `close_lesson` branches from `manage-class-projects`; retain attachment, stage-access, and lesson authoring actions.
  - Remove `class_sessions` cleanup from `manage-student-accounts` and `SupabaseService.deleteClassWithTargetData`.
  - Rename `fetchStudentLiveLesson` to `fetchStudentClassLessons`, preserving its Edge Function endpoint name `get-student-lessons` to avoid an unnecessary deployment URL change.
  - Remove `openClassLesson`, `closeClassLesson`, and `toggleClassLessonSession`.
  - In `teacherAdmin.js`, remove the `openSession` and `classSessions` queries. Replace each status label with either `🗂️ 활동 연결됨` when a project is attached or `⏸️ 미연결` otherwise. Keep stage access buttons for every attached lesson.

- [ ] **Step 5: Run focused verification**

  Run:

  ```powershell
  node --test tests/student-live-lesson-lobby.test.mjs
  npx --yes deno check supabase/functions/manage-class-projects/index.ts
  npx --yes deno check supabase/functions/manage-student-accounts/index.ts
  ```

  Expected: all tests and both checks PASS.

- [ ] **Step 6: Commit**

  ```powershell
  git add supabase/functions/manage-class-projects/index.ts supabase/functions/manage-student-accounts/index.ts js/supabase-client.js js/modules/teacherAdmin.js supabase/migrations tests/student-live-lesson-lobby.test.mjs
  git commit -m "refactor: remove class lesson sessions"
  ```

### Task 3: 학생 화면을 학급 활동 목록으로 전환

**Files:**
- Modify: `views/studentLobbyView.html`
- Modify: `js/modules/studentLobby.js`
- Modify: `js/app.js`
- Modify: `tests/student-live-lesson-lobby.test.mjs`

**Interfaces:**
- Consumes: `SupabaseService.fetchStudentClassLessons(): Promise<{ classId?: string; lessons: Lesson[]; history: HistoryItem[]; classResolution?: string }>`.
- Produces: `StudentLobbyModule.enterClassLesson(state, lessonIndex)` which sets `state.activeLessonPlans = state.classLessons` and opens the selected lesson by its index.

- [ ] **Step 1: Write the failing UI regression tests**

  Replace all live-session wording requirements with activity-list requirements.

  ```js
  test('student lobby presents class activities instead of a live session', () => {
    assert.match(lobbyView, /id="lobbyClassLessonsContainer"/);
    assert.doesNotMatch(lobbyView, /실시간 라이브|지금 개방한 수업|실시간\)/);
    assert.match(lobby, /fetchStudentClassLessons/);
    assert.match(lobby, /renderClassLessons/);
    assert.match(lobby, /enterClassLesson/);
    assert.doesNotMatch(lobby, /fetchStudentLiveLesson|renderLiveLesson|enterLiveLesson|현재 열린 수업/);
  });
  ```

- [ ] **Step 2: Run the test to verify it fails**

  Run: `node --test tests/student-live-lesson-lobby.test.mjs`

  Expected: FAIL because the lobby still contains the fixed `실시간 라이브` label and one live-lesson card.

- [ ] **Step 3: Implement the class activity UI**

  In `studentLobbyView.html`, replace the live card header with `📚 우리 학급 수업 및 활동` and use `id="lobbyClassLessonsContainer"`. Remove the live indicator entirely.

  In `studentLobby.js`, call `fetchStudentClassLessons`, store `result.lessons || []` as `state.classLessons`, and render each lesson with project title, lesson number, title, core question, and visible stages. Use this entry rule:

  ```js
  const accessible = Object.values(lesson.thinkStageAccess || {}).some(mode => mode !== 'hidden');
  const button = accessible
    ? `<button class="btn btn-primary" onclick="StudentLobbyModule.enterClassLesson(window.AppState, ${index})">활동 참여하기 →</button>`
    : '<span class="role-tag">아직 공개된 단계 없음</span>';
  ```

  `enterClassLesson` must set `state.activeLessonPlans = state.classLessons`, set `state.currentLessonIndex = lessonIndex`, reset `state.currentStep = 1`, switch views, then call `window.App.selectLesson(lessonIndex)`. This preserves the existing THINK renderer without a session ID.

- [ ] **Step 4: Run focused verification**

  Run: `node --test tests/student-live-lesson-lobby.test.mjs`

  Expected: PASS with no session vocabulary in the student lobby source.

- [ ] **Step 5: Commit**

  ```powershell
  git add views/studentLobbyView.html js/modules/studentLobby.js js/app.js tests/student-live-lesson-lobby.test.mjs
  git commit -m "feat: show class activities in student lobby"
  ```

### Task 4: 원격 배포와 세션 제거 검증

**Files:**
- Modify: none unless one of the preceding verifications identifies a defect.

**Interfaces:**
- Consumes: Tasks 1–3 commits and the drop-table migration.
- Produces: deployed session-free student lesson flow for 30101.

- [ ] **Step 1: Apply the migration and deploy functions**

  Run:

  ```powershell
  npx --yes supabase db push --linked
  npx --yes supabase functions deploy get-student-lessons save-think-stage-response manage-class-projects manage-student-accounts --use-api
  ```

  Expected: one drop-table migration and all four function deployments succeed.

- [ ] **Step 2: Verify the database no longer has session storage**

  Run:

  ```powershell
  npx --yes supabase db query --linked "select to_regclass('public.class_sessions') as class_sessions_table"
  ```

  Expected: `class_sessions_table` is `null`.

- [ ] **Step 3: Verify the 30101 mapping and browser behavior**

  Run:

  ```powershell
  npx --yes supabase db query --linked "select sa.student_number, count(c.id)::int as matching_class_count from public.student_accounts sa left join public.classes c on c.grade_number = substring(sa.student_number from 1 for 1)::int and c.class_number = substring(sa.student_number from 2 for 2)::int where sa.student_number = '30101' group by sa.student_number"
  ```

  Expected: `matching_class_count = 1`. Then sign in as 30101 and confirm the lobby says `우리 학급 수업 및 활동`, never displays `실시간 라이브`, and lists only projects attached to 3학년 1반. Confirm a `writable` stage saves, a `read_only` stage cannot save, and a lesson not attached to 3학년 1반 receives HTTP 403.

- [ ] **Step 4: Final verification and commit check**

  Run:

  ```powershell
  node --test tests/student-live-lesson-lobby.test.mjs
  npx --yes deno check supabase/functions/get-student-lessons/index.ts
  npx --yes deno check supabase/functions/save-think-stage-response/index.ts
  npx --yes deno check supabase/functions/manage-class-projects/index.ts
  npx --yes deno check supabase/functions/manage-student-accounts/index.ts
  git status --short
  ```

  Expected: all tests and checks PASS; the worktree is clean.

## Self-review

- 세션 테이블·세션 API·세션 UI·세션 권한 검증을 모두 없앤다: Tasks 1–3.
- 학번 기반으로 계산한 학급에서 연결된 프로젝트의 차시만 학생에게 보여 준다: Task 1.
- 단계 공개 상태만으로 입장·작성 가능 여부를 정한다: Tasks 1 and 3.
- 타 학급 또는 미연결 프로젝트 차시에 대한 저장을 HTTP 403으로 차단한다: Task 1 and Task 4.
- 세션 테이블 삭제 전 데이터 수를 확인하고, 남은 데이터가 있으면 보존 정보를 먼저 보고한다: Task 2.
- 원격 migration·function 배포, DB 삭제 확인, 학생 화면 확인까지 포함한다: Task 4.
