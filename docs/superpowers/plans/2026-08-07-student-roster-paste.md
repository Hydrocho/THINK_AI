# Student Roster Paste Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let teachers paste Excel-copied student rows and preview valid, invalid, and duplicate accounts before creating them.

**Architecture:** A small pure parser turns textarea input into preview rows. The existing student-account Edge Function receives only preview-approved rows, preserving its server-side duplicate check.

**Tech Stack:** HTML, vanilla JavaScript, Node built-in test runner, Supabase Edge Function.

## Global Constraints

- Each pasted row is `학년, 반, 번호, 이름`; tabs, commas, and repeated spaces are valid delimiters.
- Placeholder examples are visible, but no title-row instruction is displayed.
- Invalid or duplicate rows never reach account creation.

---

### Task 1: Parse roster text and preview it

**Files:**
- Create: `js/modules/rosterParser.js`
- Create: `tests/roster-parser.test.mjs`
- Modify: `index.html`
- Modify: `js/modules/studentManager.js`
- Modify: `views/modalsView.html`

**Interfaces:**
- Produces: `window.RosterParser.parse(text, existingNumbers)` returning rows with `studentNumber`, `name`, `valid`, and `reason`.

- [ ] **Step 1: Write the failing parser tests.**

```js
assert.deepEqual(parse('3\t2\t1\t김하늘', new Set()), [{ studentNumber: '30201', name: '김하늘', valid: true, reason: '' }]);
assert.equal(parse('3 2 1', new Set())[0].reason, '이름이 없습니다.');
assert.equal(parse('3,2,1,김하늘\n3,2,1,이준호', new Set())[1].reason, '붙여넣기 안에서 학번이 중복되었습니다.');
```

- [ ] **Step 2: Run the parser tests and verify they fail.**

Run: `node --test tests/roster-parser.test.mjs`

Expected: FAIL because `rosterParser.js` does not exist.

- [ ] **Step 3: Implement the parser and preview UI.**

Implement `parse` to split nonblank lines by tabs, commas, or two-or-more spaces; validate each field; reject duplicate pasted or existing student numbers. Replace the old count inputs with a textarea whose placeholder shows the three approved examples. Render preview rows and enable the creation button only when at least one row is valid.

- [ ] **Step 4: Send only valid preview rows to the existing batch endpoint.**

Convert valid preview rows to `{ number, name }` grouped by their common grade and class. If the pasted rows contain multiple grades or classes, show `한 번에 같은 학년·반 명단만 등록할 수 있습니다.` and do not call the endpoint.

- [ ] **Step 5: Run verification.**

Run: `node --test tests/roster-parser.test.mjs && node --check js/modules/rosterParser.js && node --check js/modules/studentManager.js`

Expected: PASS with no syntax errors.
