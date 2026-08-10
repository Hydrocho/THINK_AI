# 학번 기반 학급 활동 조회 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 학생 계정에 학급 소속을 저장하거나 배정하지 않고, 로그인한 학생의 5자리 학번에서 학년·반을 계산해 해당 학급의 실시간 수업과 활동 접근 권한을 결정한다.

**Architecture:** `student_accounts`는 학생 식별, 인증 연결, 이름 및 개인 응답의 주체만 유지한다. Edge Function 공통 모듈이 학번 `GCCNN`(학년 1자리·반 2자리·번호 2자리)을 검증하고 `classes.grade_number`와 `classes.class_number`으로 학급을 찾는다. 수업 조회와 응답 저장은 모두 이 계산된 학급 ID만 사용하며, `student_accounts.class_id`는 읽거나 쓰지 않는 레거시 호환 열로 남긴다.

**Tech Stack:** Supabase Postgres migrations, Supabase Edge Functions (Deno, supabase-js v2), Node.js built-in test runner, vanilla JavaScript.

## Global Constraints

- 학번은 정확히 5자리 숫자 `GCCNN`만 유효하다. 예: `30101`은 3학년 1반 1번이다.
- 계산된 학년·반에 해당하는 `classes` 행이 정확히 1개일 때만 활동 접근을 허용한다. 없거나 2개 이상이면 수업·응답을 노출하지 않는다.
- `student_accounts.class_id`는 신규 등록, 학급 생성, 로그인, 수업 조회에서 읽거나 갱신하지 않는다.
- 개인 THINK 응답은 계속 `student_number`로 저장한다. 다른 학생의 응답·학급의 수업을 볼 수 없도록 Edge Function에서 인증 계정의 학번을 기준으로만 조회한다.
- 기존 `class_sessions.class_id`, `class_lesson_stage_access.class_id`, `class_projects.class_id`는 교사가 만든 학급 활동의 소유 범위이므로 유지한다.
- 새 DB 변경은 `npx --yes supabase migration new <name>`으로 생성한 migration에만 기록하고, 배포 전후 Node 테스트와 Edge Function Deno 검사를 실행한다.

---

## 파일 구조

- Create: `supabase/functions/_shared/student-class.ts` — 학번 검증과 단일 학급 조회를 제공하는 Edge Function 공통 모듈.
- Modify: `supabase/functions/get-student-lessons/index.ts` — 저장된 `student.class_id` 대신 공통 모듈의 계산 결과로 실시간 수업·단계 접근을 조회.
- Modify: `supabase/functions/save-think-stage-response/index.ts` — 저장된 `student.class_id` 대신 공통 모듈의 계산 결과로 열린 수업·쓰기 권한을 검증.
- Modify: `supabase/functions/manage-student-accounts/index.ts` — 학급 생성·학생 일괄 생성에서 학생 `class_id` 배정 코드를 제거.
- Modify: `js/modules/teacherAdmin.js` — 학급 생성 뒤 브라우저에서 학생 계정 `class_id`를 갱신하는 중복 코드를 제거.
- Modify: `js/supabase-client.js` — 학급 생성 API 실패 시 직접 DB에 학급을 삽입하는 fallback을 제거해, Edge Function의 일관된 권한·중복 검증만 사용.
- Create: `supabase/migrations/<generated>_retire_student_class_membership.sql` — `student_accounts.class_id`의 의미를 레거시로 전환하고 기존 값을 `NULL`로 비운다.
- Modify: `tests/student-live-lesson-lobby.test.mjs` — 학번 기반 조회, `class_id` 비의존, 모호한 학급 차단을 정적 회귀 테스트로 검증.

## Task 1: 학번 기반 학급 해석 공통 모듈

**Files:**
- Create: `supabase/functions/_shared/student-class.ts`
- Test: `tests/student-live-lesson-lobby.test.mjs`

**Interfaces:**
- Produces: `parseStudentClass(studentNumber: string): { grade: number; classNumber: number } | null`.
- Produces: `resolveStudentClass(admin: SupabaseClient, studentNumber: string): Promise<{ classroom: { id: string } | null; reason: "invalid_student_number" | "class_not_found" | "ambiguous_class" | null; error: string | null }>`.
- Consumes: service-role Supabase client; callers must handle a `null` classroom as no-access, never as a database error.

- [ ] **Step 1: Write the failing static regression tests**

  Add imports for `student-class.ts` source text and assertions that require the exported parser and resolver, the `^\\d{5}$` validation, and a query filtered by both `grade_number` and `class_number`.

  ```js
  const studentClass = fs.readFileSync(new URL('../supabase/functions/_shared/student-class.ts', import.meta.url), 'utf8');

  test('student class is derived from a five-digit student number', () => {
    assert.match(studentClass, /export function parseStudentClass/);
    assert.match(studentClass, /\/\^\\d\{5\}\$\//);
    assert.match(studentClass, /grade_number/);
    assert.match(studentClass, /class_number/);
    assert.match(studentClass, /ambiguous_class/);
  });
  ```

- [ ] **Step 2: Run the test to verify it fails**

  Run: `node --test tests/student-live-lesson-lobby.test.mjs`

  Expected: FAIL because `_shared/student-class.ts` does not exist.

- [ ] **Step 3: Implement the parser and resolver**

  Create the module with this contract:

  ```ts
  export function parseStudentClass(studentNumber: string) {
    if (!/^\d{5}$/.test(studentNumber)) return null;
    return { grade: Number(studentNumber.slice(0, 1)), classNumber: Number(studentNumber.slice(1, 3)) };
  }

  export async function resolveStudentClass(admin: SupabaseClient, studentNumber: string) {
    const parsed = parseStudentClass(studentNumber);
    if (!parsed) return { classroom: null, reason: 'invalid_student_number', error: null };
    const { data, error } = await admin.from('classes').select('id')
      .eq('grade_number', parsed.grade).eq('class_number', parsed.classNumber);
    if (error) return { classroom: null, reason: null, error: error.message };
    if (data.length === 0) return { classroom: null, reason: 'class_not_found', error: null };
    if (data.length > 1) return { classroom: null, reason: 'ambiguous_class', error: null };
    return { classroom: data[0], reason: null, error: null };
  }
  ```

- [ ] **Step 4: Run the test to verify it passes**

  Run: `node --test tests/student-live-lesson-lobby.test.mjs`

  Expected: PASS.

- [ ] **Step 5: Commit**

  ```powershell
  git add supabase/functions/_shared/student-class.ts tests/student-live-lesson-lobby.test.mjs
  git commit -m "feat: derive student class from student number"
  ```

### Task 2: 수업 조회와 THINK 응답 권한을 계산된 학급으로 전환

**Files:**
- Modify: `supabase/functions/get-student-lessons/index.ts`
- Modify: `supabase/functions/save-think-stage-response/index.ts`
- Modify: `tests/student-live-lesson-lobby.test.mjs`

**Interfaces:**
- Consumes: `resolveStudentClass(admin, student.student_number)` from Task 1.
- Produces: `get-student-lessons` returns `{ liveLesson: null, history: [], classResolution: "invalid_student_number" | "class_not_found" | "ambiguous_class" }` when no unique class can be resolved.
- Produces: `save-think-stage-response` returns HTTP 403 when no unique class can be resolved; it never treats a missing legacy `class_id` as an access decision.

- [ ] **Step 1: Write the failing regression tests**

  Replace the current `unassigned` assertion with requirements for the resolver import and the absence of `student.class_id` in both student-facing Edge Functions.

  ```js
  test('student lesson and response APIs use the class derived from the student number', () => {
    assert.match(studentLessons, /resolveStudentClass/);
    assert.match(responseFunction, /resolveStudentClass/);
    assert.doesNotMatch(studentLessons, /student\.class_id/);
    assert.doesNotMatch(responseFunction, /student\.class_id/);
    assert.match(studentLessons, /classResolution/);
  });
  ```

- [ ] **Step 2: Run the test to verify it fails**

  Run: `node --test tests/student-live-lesson-lobby.test.mjs`

  Expected: FAIL because both Edge Functions still select and use `class_id`.

- [ ] **Step 3: Implement the minimal Edge Function changes**

  In both functions, select only `student_number` (and `id` where it is otherwise needed), call the resolver immediately after verifying the student account, return a 400 only for resolver database errors, and return the specified safe no-access response when `classroom` is null. Assign `const classId = resolved.classroom.id` and use `classId` for all `class_sessions` and `class_lesson_stage_access` filters and for `liveLesson.classId`.

  For `save-think-stage-response`, use the Korean HTTP 403 error message `학번으로 연결되는 학급이 없어 현재 수업 답변을 저장할 수 없습니다.` for all non-error no-access cases; do not reveal whether a duplicate class exists to the student.

- [ ] **Step 4: Run focused verification**

  Run:

  ```powershell
  node --test tests/student-live-lesson-lobby.test.mjs
  npx --yes deno check supabase/functions/get-student-lessons/index.ts
  npx --yes deno check supabase/functions/save-think-stage-response/index.ts
  ```

  Expected: all tests and both type checks PASS.

- [ ] **Step 5: Commit**

  ```powershell
  git add supabase/functions/get-student-lessons/index.ts supabase/functions/save-think-stage-response/index.ts tests/student-live-lesson-lobby.test.mjs
  git commit -m "feat: resolve student lesson access from student number"
  ```

### Task 3: 학생-학급 배정 쓰기 경로와 레거시 데이터 제거

**Files:**
- Modify: `supabase/functions/manage-student-accounts/index.ts`
- Modify: `js/modules/teacherAdmin.js`
- Modify: `js/supabase-client.js`
- Create: `supabase/migrations/<generated>_retire_student_class_membership.sql`
- Modify: `tests/student-live-lesson-lobby.test.mjs`

**Interfaces:**
- Consumes: `student_accounts.student_number` as the sole 학년·반 판별값.
- Produces: class and student creation operations that never set `student_accounts.class_id`.
- Produces: a nullable, empty legacy `student_accounts.class_id` column that is retained only to avoid a destructive schema break in this release.

- [ ] **Step 1: Write the failing regression tests**

  Add source assertions that prohibit the student-account assignment patterns and require a migration that clears legacy values.

  ```js
  test('class and student creation do not persist student class membership', () => {
    assert.doesNotMatch(accountFunction, /insert\(\{ class_id: classId/);
    assert.doesNotMatch(accountFunction, /update\(\{ class_id: newClass\.id \}\)/);
    assert.doesNotMatch(teacherAdmin, /update\(\{ class_id: newClass\.id \}\)/);
    assert.doesNotMatch(client, /Direct DB fallback/);
    assert.match(membershipMigration, /update public\.student_accounts set class_id = null/i);
  });
  ```

- [ ] **Step 2: Run the test to verify it fails**

  Run: `node --test tests/student-live-lesson-lobby.test.mjs`

  Expected: FAIL because creation code still assigns `class_id` and no retirement migration exists.

- [ ] **Step 3: Create and implement the migration**

  Run `npx --yes supabase migration new retire_student_class_membership`, then edit the generated file to:

  ```sql
  -- Class membership is derived from student_number (GCCNN), not persisted.
  update public.student_accounts
  set class_id = null
  where class_id is not null;
  ```

  Do not drop the column in this release: keeping it nullable prevents a destructive change to legacy tables, test fixtures, and rollback paths while the runtime no longer depends on it.

- [ ] **Step 4: Remove all membership writes and unsafe fallback**

  - Remove prefix-based `student_accounts.update({ class_id: ... })` blocks from both `create_class` implementations.
  - In `batch_create`, remove `class_id: classId` from the student account insert. Keep the existing prerequisite that the target class exists, because it validates teacher workflow, but do not use its ID as student membership.
  - Make `SupabaseService.createClass` propagate the Edge Function error instead of attempting a direct browser-side insert. This prevents an error response from triggering a second, differently authorized write.

- [ ] **Step 5: Run migration and regression verification locally or against the linked project**

  Run:

  ```powershell
  node --test tests/student-live-lesson-lobby.test.mjs
  npx --yes supabase db push --linked
  npx --yes supabase db query --linked "select student_number, class_id from public.student_accounts where student_number = '30101'"
  ```

  Expected: tests PASS; migration is applied; `30101` has `class_id = null`, which is now normal and does not affect lesson access.

- [ ] **Step 6: Commit**

  ```powershell
  git add supabase/functions/manage-student-accounts/index.ts js/modules/teacherAdmin.js js/supabase-client.js supabase/migrations tests/student-live-lesson-lobby.test.mjs
  git commit -m "refactor: stop persisting student class membership"
  ```

### Task 4: 원격 배포 및 실제 학생 흐름 검증

**Files:**
- Modify: none, unless verification exposes a defect covered by the preceding tasks.

**Interfaces:**
- Consumes: deployed migration and the two student Edge Functions from Tasks 1–3.
- Produces: verified behavior for 30101: `class_id`가 `NULL`이어도 3학년 1반의 열린 수업을 조회하고, 쓰기 허용 단계에서 응답을 저장할 수 있다.

- [ ] **Step 1: Deploy changed Edge Functions**

  Run:

  ```powershell
  npx --yes supabase functions deploy get-student-lessons save-think-stage-response manage-student-accounts --use-api
  ```

  Expected: all three functions deploy successfully.

- [ ] **Step 2: Verify the class mapping is unique**

  Run:

  ```powershell
  npx --yes supabase db query --linked "select grade_number, class_number, count(*)::int as class_count from public.classes where grade_number = 3 and class_number = 1 group by grade_number, class_number"
  ```

  Expected: one row with `class_count = 1`. If it is greater than one, do not expose a lesson to 30101; resolve the duplicated class data first.

- [ ] **Step 3: Verify student access through the browser**

  Sign in as 30101, refresh the lobby, and confirm the previous `현재 학급에 연결되지 않았습니다` message is absent. If the teacher has opened a lesson for 3학년 1반, confirm its title and stage access are displayed; if none is open, confirm the normal empty live-lesson state is shown without a console 400.

- [ ] **Step 4: Verify response authorization**

  Open a teacher-writable THINK stage as 30101, save a draft, then submit in K stage. Confirm the `think_stage_responses` row remains keyed by `student_number = '30101'` and has `submitted_at` populated only after submission.

- [ ] **Step 5: Commit any verification-only test correction, then record the deployment**

  ```powershell
  git status --short
  git log -1 --oneline
  ```

  Expected: clean worktree and the latest commit documents the final code change. Do not create an additional empty commit for deployment.

## Self-review

- 학번으로 학급을 계산하고, 별도 학생-학급 배정 없이 활동을 조회한다: Tasks 1–2.
- 현재 `30101`처럼 `class_id`가 비어 있는 학생도 정상 동작한다: Tasks 2–4.
- 개인 응답은 학생 계정/학번 기준으로 계속 분리된다: Task 2와 Task 4.
- 같은 학년·반 학급이 중복된 경우 오배정하지 않는다: Tasks 1과 4.
- 기존 저장된 `class_id`와 앞으로의 배정 쓰기를 제거하되, 물리 열 삭제로 인한 불필요한 파급은 피한다: Task 3.
- 테스트, 타입 검사, 원격 migration·function 배포, 브라우저 확인까지 포함한다: Tasks 1–4.
