# Teacher and Master Teacher Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every approved teacher a shared student-account management area while giving master teachers, and only master teachers, a teacher-request approval area without access to other teachers’ lesson, activity, or assessment data.

**Architecture:** Keep the existing static HTML/vanilla JavaScript dashboard and divide the sidebar into `내 수업` and `계정 관리` sections. Place privileged mutations in Supabase Edge Functions that verify the caller’s JWT and role server-side; use RLS for read boundaries and never trust hidden client-side menu items as authorization.

**Tech Stack:** HTML, vanilla JavaScript, Supabase Auth, Postgres RLS, Supabase Edge Functions (Deno), SQL migration, Node built-in test runner.

## Global Constraints

- Every approved `teacher` and `admin` may list, batch-create, and reset passwords for the shared student-account pool.
- Only `admin` may list teacher requests or approve/reject a teacher request.
- A teacher, including an `admin`, may access only activities, activity-stage data, submissions, messages, AI evidence, peer-review data, and assessments belonging to activities whose `teacher_id` equals that teacher’s ID.
- Student management displays student number, name, and creation date; it has no student active/block state and no teacher-assignment feature.
- Teacher management displays name, email, and request/approval date; it supports only pending-request approval and rejection, with no later blocking or editing feature.
- Service-role credentials remain in Edge Function secrets only and are never added to browser JavaScript or committed files.
- The current workspace is not a Git repository. Do not run `git init` solely for this work; perform each listed commit only after the user supplies or selects a Git-backed workspace.

---

## File structure

- `supabase/migrations/<timestamp>_shared_student_accounts_and_permissions.sql` — schema adjustments, private authorization helpers, and RLS policies.
- `supabase/functions/manage-student-accounts/index.ts` — approved-teacher-only batch creation and password-reset actions that need Auth Admin APIs.
- `supabase/functions/manage-teacher-requests/index.ts` — master-only pending teacher listing and approval/rejection mutations.
- `js/supabase-client.js` — thin browser wrappers for the two Edge Functions and safe, role-scoped reads.
- `js/modules/teacherAdmin.js` — grouped navigation state and master-only menu rendering.
- `js/modules/studentManager.js` — shared student list rendering, name capture, batch-create and reset-password UI behavior.
- `js/modules/masterAdmin.js` — pending and approved teacher list rendering plus approve/reject actions.
- `views/teacherAdminView.html` — grouped sidebar and the two account-management panels.
- `views/teacherPendingView.html` — neutral pending/rejected access-state messages.
- `tests/dashboard-service.test.mjs` — browser-service request-shape and role-guard unit tests using mocked Supabase clients.
- `tests/rls/shared-account-access.sql` — database acceptance checks executed against the linked Supabase development project.

### Task 1: Write database acceptance tests for the access model

**Files:**
- Create: `tests/rls/shared-account-access.sql`
- Modify: `supabase/migrations/<timestamp>_shared_student_accounts_and_permissions.sql`

**Interfaces:**
- Consumes: existing `profiles`, `student_accounts`, `activities`, and `teacher_assessments` tables.
- Produces: a repeatable SQL acceptance script that expects `private.is_approved_teacher()` and `private.is_master_teacher()` policy helpers.

- [ ] **Step 1: Create the failing SQL acceptance script.**

  Include the following assertions using four fixture identities: approved normal teacher, approved master, pending teacher, and a second approved teacher. The script must assert the exact expected visibility and mutation results.

  ```sql
  -- Expected after the migration is applied:
  -- approved teacher: can select shared student_accounts; cannot select another teacher's activity
  -- master teacher: can select shared student_accounts and pending teacher profiles; cannot select another teacher's activity
  -- pending teacher: cannot select student_accounts
  -- normal teacher: cannot update another profile's approval_status
  ```

- [ ] **Step 2: Run the acceptance script before the migration.**

  Run: `supabase db query --file tests/rls/shared-account-access.sql`

  Expected: FAIL because the current schema lacks the private helpers and still permits direct profile updates by an admin.

- [ ] **Step 3: Create the migration through the Supabase CLI.**

  Run: `supabase migration new shared_student_accounts_and_permissions`

  Expected: a timestamped SQL file under `supabase/migrations/`; use that generated filename in all remaining steps.

- [ ] **Step 4: Implement the schema and RLS changes in the generated migration.**

  The migration must make these exact changes:

  ```sql
  alter table public.profiles
    drop constraint if exists profiles_approval_status_check;
  alter table public.profiles
    add constraint profiles_approval_status_check
    check (approval_status in ('pending', 'approved', 'rejected'));

  alter table public.student_accounts
    add column if not exists student_name text not null default '';

  alter table public.student_accounts
    drop constraint if exists unique_class_student_number;
  alter table public.student_accounts
    add constraint unique_student_account_number unique (student_number);
  ```

  Create `private.is_approved_teacher()` and `private.is_master_teacher()` as `SECURITY DEFINER` functions in a non-exposed `private` schema, with `SET search_path = ''`, no user-supplied SQL, and an internal check against `auth.uid()`. Revoke public execution and grant execution only to `authenticated`. Use them in policies as follows:

  ```sql
  create policy "approved teachers read shared students"
    on public.student_accounts for select to authenticated
    using ((select private.is_approved_teacher()));

  create policy "masters read all teacher profiles"
    on public.profiles for select to authenticated
    using (id = (select auth.uid()) or (select private.is_master_teacher()));
  ```

  Remove the broad `Allow authenticated read profiles` and `Allow authenticated update profiles` policies. Do not create a client-writable profile update policy. Add equivalent select policies for `classes` and `student_accounts` only for approved teachers. For each activity-bound table, add or replace policies whose teacher branch joins to an activity owned by `(select auth.uid())`; do not grant master bypass access.

- [ ] **Step 5: Apply and re-run the SQL acceptance script.**

  Run: `supabase db push && supabase db query --file tests/rls/shared-account-access.sql`

  Expected: every approved-teacher shared-account check succeeds; every cross-teacher activity and unauthorized profile-update check is rejected.

- [ ] **Step 6: Run database security inspection.**

  Run: `supabase db advisors`

  Expected: no unprotected public table or overly permissive policy introduced by this migration.

- [ ] **Step 7: Commit the database access-model change.**

  ```bash
  git add supabase/migrations tests/rls/shared-account-access.sql
  git commit -m "feat: secure shared student account permissions"
  ```

### Task 2: Implement the approved-teacher student-account Edge Function

**Files:**
- Create: `supabase/functions/manage-student-accounts/index.ts`
- Test: `tests/dashboard-service.test.mjs`

**Interfaces:**
- Consumes: bearer JWT, `action: 'batch_create' | 'reset_password'`, and authenticated teacher profile.
- Produces: `POST /functions/v1/manage-student-accounts` responses shaped as `{ students: Array<{ id: string; student_number: string; student_name: string; created_at: string }>, duplicates: string[] }` for batch creation, or `{ student: { id: string; student_number: string; student_name: string } }` for reset.

- [ ] **Step 1: Add failing request-shape tests.**

  ```js
  import test from 'node:test';
  import assert from 'node:assert/strict';

  test('batch creation sends grade, class number, names, and password rule', async () => {
    const calls = [];
    const client = { functions: { invoke: async (name, options) => { calls.push({ name, options }); return { data: { students: [], duplicates: [] }, error: null }; } } };
    await invokeStudentBatchCreate(client, { grade: 3, classNumber: 2, students: [{ number: '01', name: '김하늘' }], passwordRule: 'STUDENT_NUM_EXCL' });
    assert.deepEqual(calls[0], { name: 'manage-student-accounts', options: { body: { action: 'batch_create', grade: 3, classNumber: 2, students: [{ number: '01', name: '김하늘' }], passwordRule: 'STUDENT_NUM_EXCL' } } });
  });
  ```

- [ ] **Step 2: Run the unit test to verify it fails.**

  Run: `node --test tests/dashboard-service.test.mjs`

  Expected: FAIL because `invokeStudentBatchCreate` does not exist.

- [ ] **Step 3: Implement the Edge Function.**

  Use the request’s `Authorization` header to create a caller client and `auth.getUser()`; query the caller profile with the service client and reject unless its role is `teacher` or `admin` and status is `approved`. Use `SUPABASE_SERVICE_ROLE_KEY` only inside the function to create the student’s internal-email Auth user and to upsert the related `student_accounts` row. For each requested student, derive `student_number` as `${grade}${String(classNumber).padStart(2, '0')}${number}`, require a nonempty name, and return duplicates without replacing any existing Auth user.

  Handle password reset only after the same approval check and call `auth.admin.updateUserById(student.auth_user_id, { password: newPassword })`. Reject a missing `auth_user_id`, empty password, a nonexisting student, malformed action, and a malformed batch with HTTP 400 or 404. Return 401 for unauthenticated callers and 403 for pending or rejected callers.

- [ ] **Step 4: Implement the client helper and make the test pass.**

  Add these exact helpers to `js/supabase-client.js`:

  ```js
  async function invokeStudentBatchCreate(client, payload) {
    const { data, error } = await client.functions.invoke('manage-student-accounts', {
      body: { action: 'batch_create', ...payload }
    });
    if (error) throw error;
    return data;
  }
  ```

  Expose `SupabaseService.batchCreateStudentAccounts(payload)` and `SupabaseService.resetStudentPassword({ studentId, newPassword })` as wrappers around this function. Add `SupabaseService.fetchSharedStudents()` as the exact approved-teacher read wrapper below. Preserve the function’s server-returned error message for the UI.

  ```js
  fetchSharedStudents: async function () {
    const { data, error } = await supabaseClient
      .from('student_accounts')
      .select('id, student_number, student_name, created_at')
      .order('student_number', { ascending: true });
    if (error) throw error;
    return data;
  }
  ```

- [ ] **Step 5: Run tests and deploy the function without exposing secrets.**

  Run: `node --test tests/dashboard-service.test.mjs`

  Expected: PASS.

  Run: `supabase functions deploy manage-student-accounts`

  Expected: deployment succeeds after `SUPABASE_SERVICE_ROLE_KEY` is configured in the project’s Edge Function secrets.

- [ ] **Step 6: Commit the student-account mutation feature.**

  ```bash
  git add supabase/functions/manage-student-accounts js/supabase-client.js tests/dashboard-service.test.mjs
  git commit -m "feat: manage shared student accounts securely"
  ```

### Task 3: Implement master-only teacher request actions

**Files:**
- Create: `supabase/functions/manage-teacher-requests/index.ts`
- Modify: `js/supabase-client.js`
- Modify: `js/modules/masterAdmin.js`
- Test: `tests/dashboard-service.test.mjs`

**Interfaces:**
- Consumes: `action: 'list' | 'approve' | 'reject'` and, for mutations, `profileId`.
- Produces: `{ pending: TeacherProfile[], approved: TeacherProfile[] }` for `list` and `{ teacher: TeacherProfile }` for approval/rejection.

- [ ] **Step 1: Add failing master-request tests.**

  ```js
  test('teacher approval invokes the master-only endpoint', async () => {
    const calls = [];
    const client = { functions: { invoke: async (name, options) => { calls.push({ name, options }); return { data: { teacher: { id: 't1', approval_status: 'approved' } }, error: null }; } } };
    await invokeTeacherRequest(client, { action: 'approve', profileId: 't1' });
    assert.deepEqual(calls[0], { name: 'manage-teacher-requests', options: { body: { action: 'approve', profileId: 't1' } } });
  });
  ```

- [ ] **Step 2: Run tests to verify they fail.**

  Run: `node --test tests/dashboard-service.test.mjs`

  Expected: FAIL because `invokeTeacherRequest` does not exist.

- [ ] **Step 3: Implement the master-only Edge Function.**

  Verify the caller’s user and profile before every action. Permit only a profile whose `role` is `admin` and `approval_status` is `approved`. `list` must return only profiles with role `teacher`, separated into `pending` and `approved`, with only `id`, `display_name`, `email`, and `created_at`. `approve` and `reject` must affect only a target teacher currently in `pending` status; update the status to `approved` or `rejected`, respectively. Return 404 for an unknown target and 409 when the request is no longer pending.

- [ ] **Step 4: Replace direct profile mutations in the browser.**

  Add `SupabaseService.fetchTeacherRequestLists()`, `SupabaseService.approveTeacherRequest(profileId)`, and `SupabaseService.rejectTeacherRequest(profileId)`. Remove `fetchAllTeachers`, `approveTeacherProfile`, and `blockTeacherProfile`. Update `MasterAdminModule` to render pending and approved lists only, label the negative action `거절`, and remove all blocked/reapproval UI and code paths.

- [ ] **Step 5: Run the full unit test file and deploy.**

  Run: `node --test tests/dashboard-service.test.mjs && supabase functions deploy manage-teacher-requests`

  Expected: all tests PASS and the endpoint is deployed.

- [ ] **Step 6: Commit the teacher-request feature.**

  ```bash
  git add supabase/functions/manage-teacher-requests js/supabase-client.js js/modules/masterAdmin.js tests/dashboard-service.test.mjs
  git commit -m "feat: add master-only teacher approvals"
  ```

### Task 4: Reshape the dashboard navigation and account-management views

**Files:**
- Modify: `views/teacherAdminView.html`
- Modify: `js/modules/teacherAdmin.js`
- Modify: `js/modules/studentManager.js`
- Modify: `js/modules/masterAdmin.js`
- Modify: `views/teacherPendingView.html`
- Test: `tests/dashboard-service.test.mjs`

**Interfaces:**
- Consumes: `SupabaseService.getUserProfile`, `fetchSharedStudents`, `batchCreateStudentAccounts`, `resetStudentPassword`, and master teacher-request wrappers.
- Produces: `TeacherAdminModule.switchTab('lessons' | 'students' | 'teachers')` and a dashboard that defaults to `lessons`.

- [ ] **Step 1: Add failing navigation tests.**

  ```js
  test('normal teacher never receives the teacher-management navigation item', () => {
    assert.equal(visibleTabs({ role: 'teacher', approval_status: 'approved' }), 'lessons,students');
  });

  test('master teacher receives the teacher-management navigation item', () => {
    assert.equal(visibleTabs({ role: 'admin', approval_status: 'approved' }), 'lessons,students,teachers');
  });
  ```

- [ ] **Step 2: Run the tests to verify they fail.**

  Run: `node --test tests/dashboard-service.test.mjs`

  Expected: FAIL because `visibleTabs` and the new `lessons`/`teachers` navigation state do not exist.

- [ ] **Step 3: Update the sidebar and panels.**

  In `views/teacherAdminView.html`, group menu items under visible labels `내 수업` and `계정 관리`. Rename the existing evaluation tab to `수업 현황`; keep the existing create-activity quick action. Rename the student panel to `학생 관리`, remove account-state and internal-email columns, and add columns `학번`, `이름`, `생성일`, and `비밀번호 관리`. Rename the master panel to `교사 관리` and limit its copy to approval requests.

- [ ] **Step 4: Implement navigation and rendering.**

  Add a pure helper `visibleTabs(profile)` that returns `['lessons', 'students', 'teachers']` only for `{ role: 'admin', approval_status: 'approved' }` and `['lessons', 'students']` for any other approved teacher; export it in a testable browser module or attach it to `TeacherAdminModule`. `TeacherAdminModule.renderDashboard()` must set `lessons` as the active tab, render the lesson table, and show `teachers` only after an approved-admin profile check. `switchTab()` must hide all nonselected panels, apply the active class to the selected tab, render shared students only for `students`, and call the teacher-request renderer only for `teachers`.

  `StudentManagerModule` must render `student_name` from `fetchSharedStudents()` and must submit each batch row as `{ number, name }`; do not show any activate/block controls. `MasterAdminModule` must render only the pending and approved lists and refresh both after a successful approve or reject action.

- [ ] **Step 5: Update pending and rejected access-state copy.**

  Keep the existing pending view for `pending`. Add a rejected state with the exact message `교사 계정 요청이 거절되었습니다. 관리자에게 문의하세요.` and a logout button. In `js/app.js`, route `approval_status === 'rejected'` to this state; remove the old `blocked` branch.

- [ ] **Step 6: Run unit tests and manual browser smoke checks.**

  Run: `node --test tests/dashboard-service.test.mjs`

  Expected: PASS.

  Manually confirm: a normal teacher sees `내 수업` and `학생 관리`; a master sees the additional `교사 관리`; selecting tabs updates only the corresponding panel.

- [ ] **Step 7: Commit the dashboard UI change.**

  ```bash
  git add views/teacherAdminView.html views/teacherPendingView.html js/modules/teacherAdmin.js js/modules/studentManager.js js/modules/masterAdmin.js js/app.js tests/dashboard-service.test.mjs
  git commit -m "feat: organize master dashboard account menus"
  ```

### Task 5: Verify the complete role matrix against Supabase

**Files:**
- Modify: `tests/rls/shared-account-access.sql`
- Modify: `docs/superpowers/specs/2026-08-07-teacher-master-dashboard-design.md`

**Interfaces:**
- Consumes: deployed migrations and both deployed Edge Functions.
- Produces: evidence that all four account states match the approved design.

- [ ] **Step 1: Extend the SQL acceptance script with final status cases.**

  Add assertions that a rejected teacher cannot read `student_accounts`, that only a master can list pending teachers, and that no master query returns another teacher’s activity, submission, message, or assessment rows.

- [ ] **Step 2: Run all database and JavaScript checks.**

  Run: `node --test tests/dashboard-service.test.mjs && supabase db query --file tests/rls/shared-account-access.sql && supabase db advisors`

  Expected: all unit tests and SQL checks PASS; advisors report no new RLS security defect.

- [ ] **Step 3: Execute the manual end-to-end role matrix.**

  For each account type, sign in and record the result:

  1. Approved normal teacher: can use shared student management; cannot see teacher management; cannot load another teacher’s lesson data.
  2. Approved master teacher: can use shared student management and teacher-request approval; cannot load another teacher’s lesson data.
  3. Pending teacher: sees only the pending message.
  4. Rejected teacher: sees only the rejected message.

- [ ] **Step 4: Record verified behavior in the design document.**

  Append a `## 구현 검증` section containing the date, the exact commands from Step 2, and the four successful role-matrix results from Step 3.

- [ ] **Step 5: Commit verification evidence.**

  ```bash
  git add tests/rls/shared-account-access.sql docs/superpowers/specs/2026-08-07-teacher-master-dashboard-design.md
  git commit -m "test: verify teacher dashboard permissions"
  ```

## Self-review

- Spec coverage: Tasks 1–3 enforce shared student access and master-only teacher approval server-side; Task 4 implements the approved menu and information architecture; Task 5 verifies all four account states and the cross-teacher data boundary.
- Placeholder scan: no deferred requirements or unscoped error-handling steps remain.
- Consistency: the sole terminal negative teacher state is `rejected`; all browser calls use the two named Edge Functions; the dashboard tabs are consistently `lessons`, `students`, and `teachers`.
