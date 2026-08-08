# Student Initial Password Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require newly created or reset student accounts to replace `000000` before entering the student workspace.

**Architecture:** Store a `must_change_password` flag per student account. The existing teacher-only Edge Function creates or resets accounts with `000000` and sets the flag. A student-only Edge Function validates and changes the password, then clears the flag; the client routes flagged students to a dedicated form.

**Tech Stack:** Vanilla JavaScript ES modules, Supabase Auth, Postgres migration, Supabase Edge Functions, Node test runner.

## Global Constraints

- Apply only to accounts created or reset after deployment; do not alter existing students.
- Initial and reset password is exactly `000000`.
- New password must have at least 6 characters and cannot equal `000000`.
- Service-role credentials remain only in Edge Functions.
- Edge Functions authenticate the caller and validate all password rules server-side.

---

### Task 1: Password validation helper

**Files:**
- Create: `js/modules/passwordPolicy.js`
- Create: `tests/password-policy.test.mjs`

**Interfaces:**
- Produces: `validateStudentNewPassword(password)`, returning `{ valid: boolean, message: string }`.

- [ ] **Step 1: Write the failing test**

```js
assert.deepEqual(validateStudentNewPassword('123456'), { valid: true, message: '' });
assert.deepEqual(validateStudentNewPassword('12345'), { valid: false, message: '새 비밀번호는 6자 이상이어야 합니다.' });
assert.deepEqual(validateStudentNewPassword('000000'), { valid: false, message: '초기 비밀번호와 다른 비밀번호를 입력해 주세요.' });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/password-policy.test.mjs`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Write minimal implementation**

```js
export function validateStudentNewPassword(password) {
  if (String(password ?? '').length < 6) return { valid: false, message: '새 비밀번호는 6자 이상이어야 합니다.' };
  if (password === '000000') return { valid: false, message: '초기 비밀번호와 다른 비밀번호를 입력해 주세요.' };
  return { valid: true, message: '' };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/password-policy.test.mjs`

Expected: PASS.

### Task 2: Persist password-change requirement and secure server operations

**Files:**
- Create: `supabase/migrations/20260808005941_student_initial_password.sql`
- Modify: `supabase/functions/manage-student-accounts/index.ts`
- Create: `supabase/functions/change-student-password/index.ts`

**Interfaces:**
- Consumes: `validateStudentNewPassword` rules duplicated server-side for trust boundaries.
- Produces: `change-student-password` POST endpoint accepting `{ password }` from an authenticated student.

- [ ] **Step 1: Create migration**

```sql
alter table public.student_accounts
  add column if not exists must_change_password boolean not null default false;
```

- [ ] **Step 2: Update teacher account function**

Set generated Auth passwords to `000000`, insert `must_change_password: true`, and make reset ignore caller-supplied passwords while setting Auth password to `000000` and the row flag to `true`.

- [ ] **Step 3: Add student change function**

Authenticate the JWT, require a matching `profiles.role = 'student'` and `student_accounts.auth_user_id`, reject fewer than six characters and `000000`, update Auth with the service-role client, then clear only that row's flag.

- [ ] **Step 4: Deploy and verify**

Run the migration with `npx --yes supabase@2.111.0 db push` and deploy both functions. Confirm their ACTIVE status with `npx --yes supabase@2.111.0 functions list`.

### Task 3: Force client-side password-change flow

**Files:**
- Modify: `views/authView.html`
- Modify: `js/supabase-client.js`
- Modify: `js/modules/auth.js`
- Modify: `js/modules/studentManager.js`
- Modify: `index.html`

**Interfaces:**
- Consumes: `validateStudentNewPassword(password)` and `SupabaseClient.changeStudentPassword(password)`.
- Produces: a password-change form shown to flagged students and no teacher-entered reset password prompt.

- [ ] **Step 1: Add a hidden student password-change form**

Include password and confirmation fields, a validation message area, and a submit action. The form is the only available student view while change is required.

- [ ] **Step 2: Add client API methods**

Fetch the signed-in student's `must_change_password` state after login and invoke `change-student-password` with the new password.

- [ ] **Step 3: Gate student login**

After successful student authentication, show the password-change form if the flag is true; otherwise preserve the existing student lobby transition. On success, go to the student lobby.

- [ ] **Step 4: Simplify teacher reset UI**

Replace the password prompt with an explicit confirmation that explains the account will be reset to `000000` and the student must change it on login.

- [ ] **Step 5: Verify browser behavior**

Sign in with a newly created or reset student account; confirm direct lobby access is blocked, invalid passwords are rejected, a valid password succeeds, and a later login reaches the lobby.
