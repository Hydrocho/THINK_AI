# Student Header Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display a signed-in student's number without a suffix and their name immediately to its right in the shared top header.

**Architecture:** Keep `AuthModule.prepareStudent` as the only student-header rendering point. Add a dedicated header element for the student number, while `lblUserName` continues to hold the student name. Non-student flows explicitly hide the new number element.

**Tech Stack:** Static HTML, browser JavaScript, Node.js built-in test runner.

## Global Constraints

- Student number display is the raw stored five-digit value, for example `30101`.
- Student name appears immediately to the right of the student number.
- Existing teacher and administrator header behavior remains unchanged.

---

### Task 1: Test and implement the student header identity display

**Files:**
- Modify: `index.html`
- Modify: `js/modules/auth.js`
- Create: `tests/student-header-identity.test.mjs`

**Interfaces:**
- Consumes: `AuthModule.prepareStudent(state, studentNumber, studentName)`.
- Produces: `#lblStudentNumber` containing the raw student number and `#lblUserName` containing the student name.

- [ ] **Step 1: Write the failing test**

```js
test('student header renders number and name in separate elements without a suffix', () => {
  assert.match(indexHtml, /id="lblStudentNumber"/);
  assert.match(authModule, /studentNumberLabel\.innerText = studentNumber/);
  assert.match(authModule, /userName\.innerText = studentName/);
  assert.doesNotMatch(authModule, /\$\{studentNumber\}번/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/student-header-identity.test.mjs`

Expected: FAIL because the header does not contain `lblStudentNumber` and `prepareStudent` still adds `번` to a number-only fallback.

- [ ] **Step 3: Write minimal implementation**

```html
<span class="user-name" id="lblStudentNumber" style="display:none;"></span>
<span class="user-name" id="lblUserName"></span>
```

```js
if (studentNumberLabel) {
  studentNumberLabel.innerText = studentNumber || '';
  studentNumberLabel.style.display = studentNumber ? 'inline' : 'none';
}
if (userName) userName.innerText = studentName || state.studentData.name || '';
```

Hide `lblStudentNumber` in teacher and administrator header setup paths.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/student-header-identity.test.mjs`

Expected: PASS.

- [ ] **Step 5: Run the full test suite**

Run: `node --test tests/*.test.mjs`

Expected: PASS with no failures.

- [ ] **Step 6: Commit**

```powershell
git add index.html js/modules/auth.js tests/student-header-identity.test.mjs
git commit -m "fix: show student number and name in header"
```
