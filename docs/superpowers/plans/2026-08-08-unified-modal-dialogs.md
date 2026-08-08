# Unified Modal Dialogs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Replace every browser-native \`alert()\`, \`confirm()\`, and \`prompt()\` flow with accessible, consistently styled application modals.

**Architecture:** Add one global \`ModalService\` that owns a reusable modal shell and exposes promise-based alert, confirm, prompt, and selection APIs. Feature modules await that service; the existing activity and roster forms stay feature-specific but use the same modal shell and CSS tokens.

**Tech Stack:** Vanilla JavaScript, HTML partials loaded by \`js/componentLoader.js\`, CSS custom properties, Node built-in test runner.

## Global Constraints

- Do not add a UI framework or external modal dependency.
- No runtime use of browser-native \`alert\`, \`confirm\`, or \`prompt\` may remain in \`js/\`.
- Keep current Korean wording and feature behavior; only move the interaction surface into modals.
- \`alert\` closes with its primary button; \`confirm\` resolves \`false\` for cancel/close/backdrop/Escape; input/select dialogs resolve \`null\` for cancel/close/backdrop/Escape.
- Destructive actions use a danger-styled primary button and require explicit confirmation.
- Every modal traps keyboard focus, returns focus to its trigger, supports Escape, and uses \`aria-modal="true"\` with an accessible name and description.

---

## File Structure

- Create \`js/modules/modalService.js\`: global promise-based modal API, focus lifecycle, keyboard/backdrop handlers, and XSS-safe text rendering.
- Create \`tests/modal-service.test.mjs\`: Node tests for dialog-result contracts and selection validation helpers.
- Modify \`index.html\`: load the service before feature modules.
- Modify \`views/modalsView.html\`: add reusable dialog shell and move activity/roster modals to shared classes.
- Modify \`styles/main.css\`: modal layout, variants, animation, responsive layout, focus, reduced-motion rules.
- Modify \`js/app.js\`, \`js/modules/auth.js\`, \`js/modules/studentLobby.js\`, \`js/modules/studentManager.js\`, \`js/modules/masterAdmin.js\`, and \`js/modules/teacherAdmin.js\`: replace native dialogs and make waiting handlers async.

## Modal Contract

\`\`\`js
window.ModalService = {
  alert({ title, message, tone = 'info', confirmLabel = '확인' }), // Promise<void>
  confirm({ title, message, tone = 'warning', confirmLabel = '확인', cancelLabel = '취소' }), // Promise<boolean>
  prompt({ title, message, label, placeholder = '', initialValue = '', required = true, confirmLabel = '저장' }), // Promise<string | null>
  select({ title, message, label, options, placeholder = '선택하세요', confirmLabel = '선택' }) // Promise<string | null>
};
\`\`\`

\`options\` uses \`{ value, label, description? }\`. Dynamic text is rendered through \`textContent\`, not interpolated \`innerHTML\`.

### Task 1: Specify and test the modal-result primitives

**Files:**
- Create: \`tests/modal-service.test.mjs\`
- Create: \`js/modules/modalService.js\`

**Interfaces:**
- Produces: \`ModalService.normalizeInput(value, required)\`, \`ModalService.findOption(options, value)\`, and the public API.
- Consumes: no app module; tests use a lightweight fake \`window\`.

- [ ] **Step 1: Write failing contract tests.**

\`\`\`js
import test from 'node:test';
import assert from 'node:assert/strict';

global.window = {};
await import('../js/modules/modalService.js');

test('required prompt input is trimmed and rejects blank values', () => {
  assert.equal(window.ModalService.normalizeInput('  프로젝트 A  ', true), '프로젝트 A');
  assert.equal(window.ModalService.normalizeInput('   ', true), null);
});
test('selection only accepts a listed project identifier', () => {
  const options = [{ value: 'project-1', label: '기후 위기' }];
  assert.deepEqual(window.ModalService.findOption(options, 'project-1'), options[0]);
  assert.equal(window.ModalService.findOption(options, 'unknown'), null);
});
\`\`\`

- [ ] **Step 2: Run the test to verify it fails.**

Run: \`node --test tests/modal-service.test.mjs\`

Expected: FAIL because \`js/modules/modalService.js\` does not exist.

- [ ] **Step 3: Implement the minimum testable helpers and service skeleton.**

\`\`\`js
const normalizeInput = (value, required) => {
  const normalized = String(value ?? '').trim();
  return required && !normalized ? null : normalized;
};
const findOption = (options, value) => options.find(option => option.value === value) ?? null;

window.ModalService = { normalizeInput, findOption, alert, confirm, prompt, select };
\`\`\`

Each public method opens the common shell and settles exactly once even if the user presses Escape while an action handler is running.

- [ ] **Step 4: Run the test to verify it passes.**

Run: \`node --test tests/modal-service.test.mjs\`

Expected: PASS with two passing subtests.

- [ ] **Step 5: Commit.**

\`\`\`powershell
git add js/modules/modalService.js tests/modal-service.test.mjs
git commit -m "feat: add modal service foundation"
\`\`\`

### Task 2: Build the reusable modal shell and visual system

**Files:**
- Modify: \`views/modalsView.html\`
- Modify: \`styles/main.css\`
- Modify: \`index.html\`
- Modify: \`js/modules/modalService.js\`

**Interfaces:**
- Consumes: \`ModalService\` looks up \`#appDialogModal\` after component loading.
- Produces: \`.modal-backdrop\`, \`.modal-dialog\`, \`.modal-dialog__header\`, \`.modal-dialog__body\`, \`.modal-dialog__actions\`, four tone variants, and \`.modal-open\`.

- [ ] **Step 1: Add generic dialog markup to \`views/modalsView.html\`.**

\`\`\`html
<div id="appDialogModal" class="modal-backdrop" hidden>
  <section class="modal-dialog" role="dialog" aria-modal="true"
    aria-labelledby="appDialogTitle" aria-describedby="appDialogMessage" tabindex="-1">
    <header class="modal-dialog__header">
      <h2 id="appDialogTitle" class="modal-dialog__title"></h2>
      <button type="button" class="modal-dialog__close" aria-label="모달 닫기" data-modal-close>&times;</button>
    </header>
    <div id="appDialogMessage" class="modal-dialog__body"></div>
    <div id="appDialogControl"></div>
    <footer id="appDialogActions" class="modal-dialog__actions"></footer>
  </section>
</div>
\`\`\`

Convert \`#createActivityModal\` and \`#batchStudentModal\` to this class structure. Remove their inline backdrop, panel, close-button, and action-row styling without changing form IDs or event handlers.

- [ ] **Step 2: Add shared CSS with fixed visual decisions.**

\`\`\`css
.modal-backdrop { position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; padding: 20px; background: rgba(15, 23, 42, .48); backdrop-filter: blur(5px); }
.modal-dialog { width: min(100%, 520px); max-height: min(90vh, 720px); overflow: auto; background: var(--bg-card); border: 1px solid var(--border-light); border-radius: var(--radius-xl); box-shadow: 0 20px 48px rgba(15, 23, 42, .22); }
.modal-dialog--danger .modal-dialog__title { color: var(--danger-text); }
body.modal-open { overflow: hidden; }
\`\`\`

Use 24px header/body padding, 16px action gap, right-aligned actions, 44px minimum targets, and 12px input radius. Add \`:focus-visible\`, a 360px-safe mobile width, reduced-motion handling, and opacity/translate entrance animation.

- [ ] **Step 3: Load and wire the service.**

Add \`<script src="js/modules/modalService.js"></script>\` after \`js/supabase-client.js\` and before all feature modules. The service stores the active trigger, removes \`hidden\`, adds \`.modal-open\`, focuses the first control/primary action, and restores focus if that trigger remains connected. It closes only on direct backdrop clicks; Tab/Shift+Tab cycle in the dialog; Escape produces cancellation.

- [ ] **Step 4: Verify static integration.**

Run: \`rg -n "appDialogModal|modal-dialog|modalService.js" index.html views/modalsView.html styles/main.css\`

Expected: service script, dialog markup, and shared CSS classes are present.

- [ ] **Step 5: Commit.**

\`\`\`powershell
git add index.html views/modalsView.html styles/main.css js/modules/modalService.js
git commit -m "feat: add unified modal shell and styles"
\`\`\`

### Task 3: Migrate input and selection workflows

**Files:**
- Modify: \`js/modules/teacherAdmin.js\`

**Interfaces:**
- Consumes: \`await ModalService.prompt(...)\` and \`await ModalService.select(...)\`.
- Produces: unchanged global \`TeacherAdminModule.createProjectPrompt()\` and \`TeacherAdminModule.attachProjectPrompt(classId)\` handlers.

- [ ] **Step 1: Replace sequential project prompts with typed modal inputs.**

\`\`\`js
const title = await window.ModalService.prompt({
  title: '새 프로젝트', message: '수업 설계에 사용할 프로젝트 정보를 입력하세요.',
  label: '프로젝트명', placeholder: '예: 기후 위기와 미래 사회', confirmLabel: '다음'
});
if (title === null) return;
const question = await window.ModalService.prompt({
  title: '첫 차시 핵심 질문', message: '학생 사고를 여는 질문을 작성하세요.',
  label: '핵심 질문', confirmLabel: '프로젝트 만들기'
});
if (question === null) return;
\`\`\`

Then preserve the existing \`SupabaseService.createProject({ title, lessons: [...] })\` payload and list refresh.

- [ ] **Step 2: Replace numeric project selection with an accessible select modal.**

Map projects to \`{ value: project.id, label: project.title }\`; show an info modal if the list is empty. Call \`select\`, find the returned project ID, preserve its version lookup, then call \`attachProjectToClass\`.

- [ ] **Step 3: Replace success alert with a success modal and manually check cancel paths.**

\`\`\`js
await window.ModalService.alert({
  title: '프로젝트 연결 완료', message: '학급에 프로젝트를 연결했습니다.', tone: 'success'
});
\`\`\`

Test blank required input, Escape, close icon, backdrop, a valid project, and an empty project list. Confirm canceled flows make no Supabase write.

- [ ] **Step 4: Commit.**

\`\`\`powershell
git add js/modules/teacherAdmin.js
git commit -m "feat: move project dialogs into shared modals"
\`\`\`

### Task 4: Migrate information and destructive confirmations

**Files:**
- Modify: \`js/app.js\`
- Modify: \`js/modules/auth.js\`
- Modify: \`js/modules/studentLobby.js\`
- Modify: \`js/modules/studentManager.js\`
- Modify: \`js/modules/masterAdmin.js\`
- Modify: \`js/modules/teacherAdmin.js\`

**Interfaces:**
- Consumes: \`await ModalService.alert(...)\` and \`await ModalService.confirm(...)\`.
- Produces: no native browser-dialog calls in \`js/\`; handlers that await a modal are \`async\`.

- [ ] **Step 1: Convert informational dialogs to semantic tones.**

Use warning for validation and PIN guidance, danger for authentication/operation errors, success for account creation, PIN verification, final submission, project attachment, and lesson creation, and info for CSV and placeholder evidence notices. Split multi-line text into a short title and a readable paragraph.

- [ ] **Step 2: Convert destructive actions before their backend call.**

Apply this pattern to student-password reset, teacher approval, and teacher rejection:

\`\`\`js
const approved = await window.ModalService.confirm({
  title: '학생 비밀번호 재설정',
  message: \`\${studentNum} 학생의 비밀번호를 000000으로 초기화합니다. 다음 로그인 시 변경이 필요합니다.\`,
  tone: 'danger', confirmLabel: '재설정'
});
if (!approved) return;
\`\`\`

Teacher approval uses warning; rejection and password reset use danger, with their specific action labels.

- [ ] **Step 3: Preserve ordering at callback boundaries.**

In \`App.init\`, await the rejected-account alert before signing out. In student validation functions, await the warning before returning and do not advance a THINK step until valid data is stored. Keep inline handler names stable while changing implementations to \`async\`.

- [ ] **Step 4: Remove all native dialog calls.**

Run: \`rg -n --glob '!supabase/functions/gemini-chat/index.ts' "\\b(alert|confirm|prompt)\\s*\\(" js\`

Expected: no output. The excluded Gemini system-prompt comment is not a browser dialog.

- [ ] **Step 5: Commit.**

\`\`\`powershell
git add js/app.js js/modules/auth.js js/modules/studentLobby.js js/modules/studentManager.js js/modules/masterAdmin.js js/modules/teacherAdmin.js
git commit -m "feat: replace browser dialogs with app modals"
\`\`\`

### Task 5: Verify UX, accessibility, and regressions

**Files:**
- Modify: \`tests/modal-service.test.mjs\` only if focus/keyboard helpers are extracted as pure functions.

**Interfaces:**
- Consumes: final modal APIs and migrated call sites.
- Produces: automated contract coverage and documented manual acceptance results.

- [ ] **Step 1: Run automated tests.**

Run: \`node --test tests/modal-service.test.mjs tests/password-policy.test.mjs tests/roster-parser.test.mjs\`

Expected: all tests pass.

- [ ] **Step 2: Run the native-dialog guard.**

Run: \`rg -n --glob '!supabase/functions/gemini-chat/index.ts' "\\b(alert|confirm|prompt)\\s*\\(" js\`

Expected: no output and exit code 1 (the expected \`rg\` no-match status).

- [ ] **Step 3: Perform browser acceptance checks.**

Verify student-login validation/error; PIN empty/valid; THINK blank input/final submit; batch roster validation/success/error; password reset cancel/confirm; teacher approval/rejection cancel/confirm/error; project create cancel/submit; project attach cancel/select/empty; custom lesson success; CSV notice; and evaluation evidence notice. For an alert, confirm, prompt, select, and existing form modal, verify autofocus, Tab/Shift+Tab loop, Escape, close button, backdrop cancellation, focus restoration, and a 360px viewport.

- [ ] **Step 4: Commit final test updates, if any.**

\`\`\`powershell
git add tests/modal-service.test.mjs
git commit -m "test: cover unified modal behavior"
\`\`\`
