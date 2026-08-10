# 학급 THINK 단계 접근 상태 인라인 갱신 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 단계 접근 권한을 바꾼 뒤 수업 운영 상세 화면을 다시 만들지 않고 선택한 행과 요약 배지만 갱신한다.

**Architecture:** 기존 `set_class_stage_access` Edge Function 호출은 그대로 둔다. 성공 응답 뒤 `TeacherAdminModule.setClassStageAccess`가 lesson/stage 식별자가 포함된 DOM 요소를 찾아 활성 버튼과 요약 배지의 표현을 갱신한다.

**Tech Stack:** 브라우저 JavaScript, Supabase Edge Function, Node.js 내장 테스트 러너.

## Global Constraints

- 서버 권한 확인 및 `class_lesson_stage_access` upsert 계약을 변경하지 않는다.
- 전체 화면 재렌더링 호출을 추가하지 않는다.
- 저장 실패 시 저장 전 UI 선택 상태를 유지한다.

---

### Task 1: 인라인 갱신 동작의 회귀 테스트 작성

**Files:**
- Modify: `tests/student-live-lesson-lobby.test.mjs`

**Interfaces:**
- Consumes: `TeacherAdminModule.setClassStageAccess(classId, lessonId, stageCode, accessMode)`
- Produces: 전체 상세 재호출 없이 단계 버튼과 요약 배지를 갱신해야 한다는 회귀 보호.

- [ ] **Step 1: Write the failing test**

```js
test('class THINK stage access saves inline without recreating the class detail view', () => {
  const setterStart = teacherAdmin.indexOf('TeacherAdminModule.setClassStageAccess = async function');
  const setterEnd = teacherAdmin.indexOf('TeacherAdminModule.expandedClassLessonIds', setterStart);
  const setterSource = teacherAdmin.slice(setterStart, setterEnd);

  assert.doesNotMatch(setterSource, /openClassDetailSubView\(classId\)/);
  assert.match(setterSource, /data-stage-access-lesson-id/);
  assert.match(setterSource, /data-stage-access-stage-code/);
  assert.match(setterSource, /data-stage-access-summary/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/student-live-lesson-lobby.test.mjs`

Expected: FAIL because the current setter rerenders the class detail view and the controls have no inline-update identifiers.

### Task 2: 저장 성공 후 선택 행과 요약 배지 갱신

**Files:**
- Modify: `js/modules/teacherAdmin.js:306-313`
- Modify: `js/modules/teacherAdmin.js:381-389`
- Modify: `js/modules/teacherAdmin.js:1091-1094`
- Test: `tests/student-live-lesson-lobby.test.mjs`

**Interfaces:**
- Consumes: `setClassStageAccess(classId, lessonId, stageCode, accessMode)` and the existing Edge Function response.
- Produces: same function updates the selected stage's `.pill-btn` classes and summary badge content in the current DOM.

- [ ] **Step 1: Write minimal implementation**

```js
const selector = `[data-stage-access-lesson-id="${lessonId}"][data-stage-access-stage-code="${stageCode}"]`;
document.querySelectorAll(`${selector}.pill-btn`).forEach(button => {
  button.classList.toggle(`active-${button.dataset.stageAccessMode}`, button.dataset.stageAccessMode === accessMode);
});
const summary = document.querySelector(`${selector}[data-stage-access-summary]`);
if (summary) summary.replaceChildren(document.createTextNode(`${stageCode} ${modeMeta.icon}`));
```

Add matching `data-*` attributes during the existing card markup creation. Disable all buttons in the selected group while the request is in flight and always restore them in `finally`.

- [ ] **Step 2: Run focused test to verify it passes**

Run: `node --test tests/student-live-lesson-lobby.test.mjs`

Expected: PASS.

- [ ] **Step 3: Run full available test suite**

Run: `node --test tests/*.test.mjs`

Expected: PASS with no test failures.
