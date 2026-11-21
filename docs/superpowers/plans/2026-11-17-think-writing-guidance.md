# THINK writing guidance implementation plan

**Goal:** Apply the approved layout-aligned T/N/K preview with Korean guidance and the submit label `제출하기`.

**Architecture:** Keep the existing sidebar, question header, single response field, save API and automatic next-stage navigation. Render guidance within the existing workflow module; update N guidance in place when its criterion changes.

**Tech Stack:** Plain JavaScript/CSS, Node test runner and linkedom.

**Spec:** Approved in this chat: existing layout, concrete writing guidance, no expandable writing help or self-check boxes, no decorative English labels.

- [x] Add a UI regression covering criterion changes without losing a draft, save and read-only restoration.
- [x] Add T/N/K guides and accessible field labels in `js/modules/thinkWorkflow.js`; replace submit captions with `제출하기`.
- [x] Add scoped spacing in `styles/main.css`; translate student stage headings in `js/app.js` and the initial view.
- [x] Run workflow tests, syntax checks, full test suite and review the diff.

Recovery details for unsaved drafts remain available; they are recovery controls, not the removed writing-help feature. Do not change database schemas, student text or authorization rules.

## Verification

- New regression failed before implementation and passed after it.
- `npm run test:workflow`: 9 passed.
- JavaScript syntax and `git diff --check`: passed.
- `npm test`: 94 passed, 3 failed. Failures reference unchanged teacher project sources:
  - `personal lesson designs have no draft or sharing controls` (`tests/private-lesson-designs.test.mjs`).
  - `project replacement deletes the superseded project through the authorized project function` (`tests/project-deletion-flow.test.mjs`).
  - `class project connection uses only link-enabled projects and exposes a direct empty-state action` (`tests/student-live-lesson-lobby.test.mjs`).
- Browser visual verification and deployment were not performed.
