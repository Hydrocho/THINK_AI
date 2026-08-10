# 학급별 프로젝트 연결 UX 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 학급 연결 가능 프로젝트를 자동 배정하지 않고, 교사가 학급별로 연결 가능한 프로젝트만 명확하게 선택·연결하고 차시를 독립 운영하도록 만든다.

**Architecture:** `projects.is_published`는 기존 데이터 호환을 위해 유지하되 화면에서는 “학급 연결 가능” 상태만 의미한다. `class_projects`는 각 학급의 실제 활동 연결 기록으로 유지하며, 학생은 자신의 학급에 기록된 연결만 조회한다. 프로젝트 카드의 체크박스는 접근 가능한 토글 버튼으로 바꾸고, 기존 `attachProjectPrompt(classId)`를 연결 가능 프로젝트 전용 선택 흐름으로 강화한다.

**Tech Stack:** vanilla JavaScript, Supabase Edge Functions and `class_projects`, Node.js built-in test runner.

## Global Constraints

- 학급 연결 가능 토글을 켜도 어떤 학급에도 자동 연결하지 않는다.
- 하나의 연결 가능 프로젝트는 여러 학급에 연결 가능하며, 학급마다 차시와 THINK 단계 공개 상태를 독립적으로 설정한다.
- 프로젝트 연결 선택 목록에는 `is_published === true`인 프로젝트만 표시한다.
- 토글은 체크박스 입력이 아니라 `button type="button"`이며, `aria-pressed`와 상태 텍스트 `연결 가능` 또는 `연결 안 함`을 제공한다.
- 학생이 보는 활동은 `class_projects`에 실제로 연결된 프로젝트만 사용한다.
- 기존 프로젝트 연결·해제 API와 `class_lesson_stage_access` 데이터 모델은 유지한다.

---

### Task 1: 연결 가능 프로젝트 전용 연결 흐름과 미연결 진입점

**Files:**
- Modify: `js/modules/teacherAdmin.js`
- Modify: `tests/student-live-lesson-lobby.test.mjs`

**Interfaces:**
- Consumes: `SupabaseService.listProjects()` and `SupabaseService.attachProjectToClass(classId, versionId, title)`.
- Produces: `TeacherAdminModule.attachProjectPrompt(classId)` selecting only published projects.

- [ ] **Step 1: Write failing regression tests**

  ```js
  test('class project connection uses only link-enabled projects and exposes a direct empty-state action', () => {
    assert.match(teacherAdmin, /filter\(project => project\.is_published\)/);
    assert.match(teacherAdmin, /프로젝트 연결하기/);
    assert.match(teacherAdmin, /학급 연결 가능/);
    assert.match(teacherAdmin, /aria-pressed/);
    assert.doesNotMatch(teacherAdmin, /학생 게시/);
  });
  ```

- [ ] **Step 2: Run RED test**

  Run: `node --test tests/student-live-lesson-lobby.test.mjs`

  Expected: FAIL because `attachProjectPrompt` currently offers all projects and project cards still use the `학생 게시` checkbox.

- [ ] **Step 3: Implement published-project filtering and copy**

  In the project-card renderer, replace the existing `<input type="checkbox"> 학생 게시` markup with:

  ```html
  <button type="button" class="project-link-toggle ${p.is_published ? 'is-enabled' : ''}"
    aria-pressed="${p.is_published ? 'true' : 'false'}"
    onclick="event.stopPropagation(); TeacherAdminModule.setProjectPublished('${p.id}', ${!p.is_published})">
    ${p.is_published ? '학급 연결 가능' : '학급 연결 안 함'}
  </button>
  ```

  In `attachProjectPrompt`, replace `const projects = result.projects || []` with:

  ```js
  const projects = (result.projects || []).filter(project => project.is_published);
  ```

  When empty, use title `연결 가능한 프로젝트가 없습니다` and message `수업 설계에서 프로젝트의 학급 연결 가능 토글을 켠 뒤 학급에 연결해 주세요.`. Change the selection message to `이 학급에서 사용할 연결 가능 프로젝트를 선택하세요.`

  In `openClassDetailSubView`, replace the empty state title with `연결된 프로젝트가 없습니다`, explain `학급 연결 가능 프로젝트를 이 학급에 연결하면 차시와 단계 공개 상태를 학급별로 운영할 수 있습니다.`, and include:

  ```html
  <button class="btn btn-primary" onclick="TeacherAdminModule.attachProjectToActiveClassPrompt()">프로젝트 연결하기</button>
  ```

- [ ] **Step 4: Add a direct card action**

  In `renderClassOperations`, when `attachedProject` is absent, render a `프로젝트 연결하기` button. Its click handler must stop propagation, set `TeacherAdminModule.currentActiveClassId = c.id`, and call `TeacherAdminModule.attachProjectToActiveClassPrompt()` so it opens the same filtered selector. Do not render this button for already connected cards.

- [ ] **Step 5: Run GREEN verification**

  Run: `node --test tests/student-live-lesson-lobby.test.mjs`

  Expected: PASS.

- [ ] **Step 6: Commit**

  ```powershell
  git add js/modules/teacherAdmin.js tests/student-live-lesson-lobby.test.mjs
  git commit -m "feat: simplify class project connection"
  ```

### Task 2: 연결 결과와 학급별 운영 회귀 검증

**Files:**
- Modify: `tests/student-live-lesson-lobby.test.mjs`

**Interfaces:**
- Consumes: existing `class_projects` and `class_lesson_stage_access` behavior.
- Produces: tests that preserve the separation between project publication and explicit class linkage.

- [ ] **Step 1: Add failing source-contract tests**

  ```js
  test('publication remains separate from explicit class project linkage', () => {
    assert.match(projectFunction, /action==="set_project_published"/);
    assert.match(projectFunction, /action==="attach"/);
    assert.doesNotMatch(projectFunction, /set_project_published[\s\S]*class_projects\.insert/);
    assert.match(teacherAdmin, /setClassStageAccess/);
  });
  ```

- [ ] **Step 2: Run RED test**

  Run: `node --test tests/student-live-lesson-lobby.test.mjs`

  Expected: FAIL until the test is added; it must not require any new automatic connection behavior.

- [ ] **Step 3: Keep implementation minimal**

  Do not alter `manage-class-projects` or database migrations. Confirm `set_project_published` only changes `projects.is_published` and `attach` remains the only `class_projects` insertion path.

- [ ] **Step 4: Run final verification**

  ```powershell
  node --test tests/student-live-lesson-lobby.test.mjs
  git status --short
  ```

  Expected: all tests PASS; only intended files are changed before commit.

- [ ] **Step 5: Commit if Task 1 did not include the test**

  ```powershell
  git add tests/student-live-lesson-lobby.test.mjs
  git commit -m "test: preserve explicit class project linkage"
  ```

## Self-review

- 연결 가능 프로젝트가 자동 배정되지 않고 학급 연결 목록에만 나타난다: Tasks 1–2.
- 미연결 학급 카드와 상세 화면에서 바로 연결할 수 있다: Task 1.
- 게시되지 않은 프로젝트는 연결 선택 목록에 보이지 않는다: Task 1.
- 학급별 차시·단계 운영은 기존 연결 및 접근 제어 모델을 유지한다: Task 2.
