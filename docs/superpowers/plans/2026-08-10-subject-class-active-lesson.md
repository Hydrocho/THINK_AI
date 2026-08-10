# 과목별 학급과 단일 활성 차시 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 학생이 로그인하면 자신의 학년·반에 해당하는 과목별 학급 카드를 보고, 각 카드의 단 하나의 활성 차시에만 입장할 수 있게 한다.

**Architecture:** `classes`에 `subject_name`과 nullable `active_lesson_plan_id`를 추가한다. 활성 차시는 학급 행에만 저장하며 Edge Function이 해당 차시의 학급 연결과 교사 소유권을 검증한다. 학생 조회 API는 학생 번호로 모든 일치 학급을 찾고 과목 카드별 활성 차시만 반환한다.

**Tech Stack:** Supabase Postgres/RLS, Supabase Edge Functions (Deno), 브라우저 JavaScript/HTML/CSS, Node.js 내장 테스트 러너.

## Global Constraints

- 같은 학년·반에 과목과 교사가 다른 학급을 여러 개 만들 수 있다.
- 교사는 자신이 만든 학급과 과목만 조회·수정할 수 있다.
- 한 학급에는 활성 차시가 0개 또는 정확히 1개만 존재한다.
- 학생에게는 활성 차시만 입장 가능하게 노출하며, 과거·비활성 차시 및 이력은 학생 화면에서 노출하지 않는다.
- 활성 차시는 해당 학급에 연결된 프로젝트 버전의 차시여야 한다.

---

### Task 1: 과목명과 단일 활성 차시를 위한 데이터 모델 및 권한

**Files:**
- Create: `supabase/migrations/<timestamp>_subject_classes_and_active_lesson.sql`
- Modify: `supabase/functions/manage-student-accounts/index.ts`
- Modify: `supabase/functions/manage-class-projects/index.ts`
- Test: `tests/rls/subject-class-active-lesson.sql`
- Test: `tests/student-live-lesson-lobby.test.mjs`

**Interfaces:**
- Consumes: `classes.id`, `class_projects.class_id`, `lesson_plans.id`, authenticated teacher identity.
- Produces: `classes.subject_name TEXT NOT NULL`, `classes.active_lesson_plan_id UUID NULL`, and `set_active_class_lesson(classId, lessonId | null)`.

- [ ] **Step 1: Write failing database/API assertions**

Add tests that require a subject on class creation, allow two teachers to create the same grade/class for different subjects, and reject assigning an active lesson that is not attached to the target class.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `node --test tests/student-live-lesson-lobby.test.mjs`

Expected: failure because subject and active-lesson contracts do not exist.

- [ ] **Step 3: Create the migration through Supabase CLI and implement the minimal server contract**

Migration requirements:

```sql
alter table public.classes add column subject_name text not null default '미지정';
alter table public.classes add column active_lesson_plan_id uuid references public.lesson_plans(id) on delete set null;
```

The default preserves existing classes; new class creation must accept and validate a trimmed `subjectName`. Add `set_active_class_lesson` to `manage-class-projects`; it must verify the calling teacher owns the class and the selected `lesson_plans.id` belongs to a `class_projects.source_version_id` attached to that class before updating `classes.active_lesson_plan_id`. Passing `null` clears the active lesson.

- [ ] **Step 4: Verify migration and focused tests**

Run the project’s available migration verification command and `node --test tests/student-live-lesson-lobby.test.mjs`.

Expected: schema applies; focused tests pass.

### Task 2: 교사 학급 생성과 수업 운영의 활성화 토글

**Files:**
- Modify: `views/teacherAdminView.html`
- Modify: `js/modules/teacherAdmin.js`
- Modify: `js/supabase-client.js`
- Modify: `styles/main.css`
- Test: `tests/class-detail-multiple-projects.test.mjs`

**Interfaces:**
- Consumes: `subjectName` when creating a class; `set_active_class_lesson(classId, lessonId | null)`.
- Produces: 과목명 입력, 과목 표시, 그리고 차시별 초록색 `수업 활성화` 토글.

- [ ] **Step 1: Write failing UI regression tests**

Add tests requiring the class-create form to include a required subject field and the class detail renderer to include a per-lesson activation control wired to a dedicated teacher module method.

- [ ] **Step 2: Run the focused UI tests and verify RED**

Run: `node --test tests/class-detail-multiple-projects.test.mjs`

Expected: failure because the subject input and activation controls are absent.

- [ ] **Step 3: Implement the minimal UI flow**

Add `subjectName` to class creation. Show the subject beside the grade/class label. Add a green `수업 활성화` toggle in each lesson card at the designated header action location. On enable, call the active-lesson API and update all lesson toggles in the current class so exactly one is on. On disable, clear the active lesson. Keep the rest of the class detail DOM in place on successful updates.

- [ ] **Step 4: Verify UI tests**

Run: `node --test tests/class-detail-multiple-projects.test.mjs`

Expected: pass.

### Task 3: 학생 로그인 후 과목 카드와 활성 차시 전용 입장

**Files:**
- Modify: `supabase/functions/_shared/student-class.ts`
- Modify: `supabase/functions/get-student-lessons/index.ts`
- Modify: `js/supabase-client.js`
- Modify: `js/modules/studentLobby.js`
- Modify: `views/studentLobbyView.html`
- Modify: `js/app.js`
- Test: `tests/student-live-lesson-lobby.test.mjs`

**Interfaces:**
- Consumes: student number, all matching `classes` rows, each row’s `subject_name` and `active_lesson_plan_id`.
- Produces: `subjectClasses[]`, where each item has class identity, subject, optional active lesson, and a student card view model.

- [ ] **Step 1: Write failing student-flow tests**

Add tests that require the API to return all matching subject classes, the lobby to render a card for each subject, show `수업 준비 중` with no entry action for null active lessons, and permit entry only to the returned active lesson.

- [ ] **Step 2: Run focused student-flow tests and verify RED**

Run: `node --test tests/student-live-lesson-lobby.test.mjs`

Expected: failure because the existing API resolves a single class and exposes all lessons/history.

- [ ] **Step 3: Implement the minimal student flow**

Replace single-class resolution for the lobby with a lookup of all classes matching the student number’s grade/class. For every subject class, return only its active lesson if present. Do not return lesson history to the lobby. Render subject cards with the subject title, active lesson title and `입장하기`, or `수업 준비 중` without an entry button. When entering, set the active class and lesson in application state and render only that lesson.

- [ ] **Step 4: Verify focused student-flow tests**

Run: `node --test tests/student-live-lesson-lobby.test.mjs`

Expected: pass.

### Task 4: End-to-end regression and authorization verification

**Files:**
- Modify: `tests/student-live-lesson-lobby.test.mjs`
- Modify: `tests/rls/subject-class-active-lesson.sql`

**Interfaces:**
- Consumes: Tasks 1–3 public contracts.
- Produces: regression coverage for one-active-lesson invariant and multi-subject student visibility.

- [ ] **Step 1: Add acceptance tests**

Cover: no active lesson; activation replacement; activation clear; student sees multiple subject cards; student cannot receive a non-active or different-class lesson; teacher cannot set a different teacher’s class active lesson.

- [ ] **Step 2: Run full automated verification**

Run: `node --test tests/*.test.mjs` and the project’s Supabase migration/RLS verification command.

Expected: all relevant tests pass with no newly introduced failures.

- [ ] **Step 3: Manually verify core teacher/student paths**

1. Create two subject classes for the same grade/class.
2. Attach lessons and activate one lesson in one subject only.
3. Sign in as a matching student and confirm both cards display.
4. Confirm only the active card enters a lesson and the inactive card says `수업 준비 중`.
5. Clear the active lesson and confirm its card becomes unavailable.
