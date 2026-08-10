# 개인 수업 설계 전환 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 수업 설계 프로젝트를 작성 교사 전용으로 제한하고, 초안·공개 및 교사 간 공유 기능을 제거한다.

**Architecture:** UI는 공개 상태 표기와 공개 호출을 제거해 개인 프로젝트 흐름만 보여 준다. Edge Function과 RLS 정책은 프로젝트 작성자만 프로젝트·버전·차시를 조회하고, 자신의 프로젝트만 학급에 연결하도록 강제한다. 마이그레이션은 과거 공개 프로젝트를 비공개로 되돌린다.

**Tech Stack:** Vanilla JavaScript, Supabase Edge Functions (Deno), PostgreSQL RLS, Node.js test runner.

## Global Constraints

- 프로젝트는 작성 교사 본인만 조회·수정·삭제·학급 연결할 수 있다.
- 기존 `published` 프로젝트는 마이그레이션으로 모두 `private`으로 전환한다.
- 학생 수업 시작은 기존처럼 교사가 자신의 학급에 프로젝트를 연결하고 차시를 열 때만 가능하다.
- 기존의 사용자 변경 사항은 보존하며, 요청 범위 밖의 파일은 수정하지 않는다.
- 변경 후 `node --check js/modules/teacherAdmin.js`, `node --test tests/*.test.mjs`, `git diff --check`를 실행한다.

---

### Task 1: 공개/공유 제거 회귀 테스트 작성

**Files:**
- Create: `tests/private-lesson-designs.test.mjs`
- Test: `tests/private-lesson-designs.test.mjs`

**Interfaces:**
- Consumes: `js/modules/teacherAdmin.js`, `js/supabase-client.js`, `supabase/functions/manage-class-projects/index.ts`
- Produces: 공개 UI·클라이언트 호출·공개 목록 조건 및 소유권 확인에 대한 정적 회귀 검증

- [ ] **Step 1: Write the failing test**

```js
test('personal lesson designs have no publish controls or published project listing', () => {
  assert.doesNotMatch(teacherModule, /publishProject/);
  assert.doesNotMatch(teacherModule, /공개하기/);
  assert.doesNotMatch(supabaseClient, /publishProject/);
  assert.doesNotMatch(edgeFunction, /visibility\.eq\.published/);
});

test('class attachment verifies the requesting teacher owns the source project', () => {
  assert.match(edgeFunction, /select\("project_id,projects!inner\(author_id\)"\)/);
  assert.match(edgeFunction, /eq\("projects\.author_id", userId\)/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/private-lesson-designs.test.mjs`

Expected: FAIL because the existing UI and Edge Function still include publish handling and shared listing.

### Task 2: 개인 프로젝트 권한과 Edge Function 적용

**Files:**
- Create: `supabase/migrations/20260809120000_make_lesson_designs_private.sql`
- Modify: `supabase/functions/manage-class-projects/index.ts:8-12`
- Test: `tests/private-lesson-designs.test.mjs`

**Interfaces:**
- Consumes: `manage-class-projects` request body with `action`, `projectId`, `versionId`, `classId`
- Produces: `list_projects`가 요청 교사 소유 프로젝트만 반환하고, `attach`가 소유한 프로젝트 버전만 연결하는 응답

- [ ] **Step 1: Write the failing migration/Edge Function test**

```js
test('migration resets published projects and replaces shared read policies', () => {
  assert.match(migration, /update public\.projects\s+set visibility = 'private'/s);
  assert.match(migration, /drop policy if exists "teachers read own or published projects"/);
  assert.match(migration, /author_id = \(select auth\.uid\(\)\)/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/private-lesson-designs.test.mjs`

Expected: FAIL because the private-only migration does not yet exist.

- [ ] **Step 3: Write minimal implementation**

```ts
if (b.action === "list_projects") {
  const { data, error } = await admin
    .from("projects")
    .select("*,project_versions(id,version_number,lesson_plans(*))")
    .eq("author_id", userId)
    .order("updated_at", { ascending: false });
  return error ? json({ error: error.message }, 400) : json({ projects: data });
}

if (b.action === "attach") {
  const { data: version } = await admin
    .from("project_versions")
    .select("project_id,projects!inner(author_id)")
    .eq("id", b.versionId)
    .eq("projects.author_id", userId)
    .single();
  if (!version) return json({ error: "연결할 수업 프로젝트를 찾을 수 없거나 권한이 없습니다." }, 404);
  // 기존 class_projects insert를 수행한다.
}
```

```sql
update public.projects set visibility = 'private' where visibility = 'published';

drop policy if exists "teachers read own or published projects" on public.projects;
create policy "teachers read own projects" on public.projects for select to authenticated
using (author_id = (select auth.uid()));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/private-lesson-designs.test.mjs`

Expected: PASS for the authority and migration assertions.

### Task 3: 공개 상태 UI 및 클라이언트 API 제거

**Files:**
- Modify: `js/modules/teacherAdmin.js:121-173, 870-885`
- Modify: `js/supabase-client.js:286-320`
- Modify: `views/teacherAdminView.html:60-88`
- Test: `tests/private-lesson-designs.test.mjs`

**Interfaces:**
- Consumes: `SupabaseService.listProjects()` returns only the current teacher's projects
- Produces: 수업 설계 목록·상세 화면이 상태 배지나 공개 버튼 없이 프로젝트 제목과 편집·학급 연결 흐름만 표시

- [ ] **Step 1: Extend the failing test**

```js
test('lesson design UI does not describe projects as draft or shared', () => {
  assert.doesNotMatch(teacherModule, /초안|공개 중|학급 연결 가능|공개하기/);
  assert.doesNotMatch(teacherView, /작성하고 공개합니다/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/private-lesson-designs.test.mjs`

Expected: FAIL because existing project cards and detail headers render status badges and publish buttons.

- [ ] **Step 3: Write minimal implementation**

```js
// 프로젝트 카드: 상태 배지와 공개 버튼을 제거한다.
// 상세 헤더: projectDetailHeaderActions를 비우고 공개 상태에 의존하지 않는다.
// SupabaseService: publishProject 래퍼를 삭제한다.
// 안내문: "프로젝트와 차시별 활동 계획을 작성합니다."로 변경한다.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/private-lesson-designs.test.mjs`

Expected: PASS with no draft/publish copy or calls left in the relevant files.

### Task 4: 전체 검증

**Files:**
- Test: `tests/*.test.mjs`

**Interfaces:**
- Consumes: Tasks 1-3 changes
- Produces: 개인 전용 수업 설계 흐름에 대한 verified codebase

- [ ] **Step 1: Run static and test verification**

Run: `node --check js/modules/teacherAdmin.js; node --test tests/*.test.mjs; git diff --check`

Expected: JavaScript syntax check succeeds, all tests pass, and no whitespace errors are reported.

- [ ] **Step 2: Deploy instructions**

```powershell
npx supabase db push
npx supabase functions deploy manage-class-projects --use-api
```

Expected: the database migration and Edge Function are applied to the linked Supabase project.
