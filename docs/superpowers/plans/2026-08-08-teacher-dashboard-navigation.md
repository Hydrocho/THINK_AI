# Teacher Dashboard Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the teacher dashboard full-width, class-operation-focused, and navigable through an expandable icon sidebar with a dynamic breadcrumb.

**Architecture:** Keep the existing panels and data modules. Replace the teacher view shell with semantic navigation elements and let `TeacherAdminModule` own the selected tab, breadcrumb, title, and collapsed state. Add teacher-only layout CSS rather than changing the student and login layouts.

**Tech Stack:** Vanilla HTML, CSS, JavaScript ES modules, Node syntax checks.

## Global Constraints

- Sidebar is open by default and collapses to an icon rail.
- New activity creation belongs under `내 수업`; no separate quick-actions section exists.
- Teacher management remains visible only to master teachers.
- Existing student management, activity creation, and lesson data behavior is preserved.

---

### Task 1: Define dashboard navigation state

**Files:**
- Modify: `js/modules/teacherAdmin.js`
- Test: `node --check js/modules/teacherAdmin.js`

**Interfaces:**
- Produces: `TeacherAdminModule.toggleSidebar()` and `TeacherAdminModule.switchTab(tabName)` which updates `#teacherBreadcrumb`, `#teacherPageTitle`, and `#teacherPageDescription`.

- [ ] **Step 1: Add navigation metadata**

```js
const navigation = {
  eval: { breadcrumb: ['내 수업', '수업 현황'], title: '수업 현황' },
  students: { breadcrumb: ['계정 관리', '학생 관리'], title: '학생 관리' },
  master: { breadcrumb: ['계정 관리', '교사 관리'], title: '교사 관리' }
};
```

- [ ] **Step 2: Render selected state**

```js
document.getElementById('teacherBreadcrumb').innerText = navigation[tabName].breadcrumb.join(' › ');
document.getElementById('teacherPageTitle').innerText = navigation[tabName].title;
```

- [ ] **Step 3: Toggle collapsed class**

```js
document.getElementById('teacherAppSection').classList.toggle('sidebar-collapsed');
```

- [ ] **Step 4: Verify syntax**

Run: `node --check js/modules/teacherAdmin.js`

Expected: exit code 0.

### Task 2: Replace teacher dashboard shell and menu hierarchy

**Files:**
- Modify: `views/teacherAdminView.html`

**Interfaces:**
- Consumes: `TeacherAdminModule.switchTab`, `TeacherAdminModule.toggleSidebar`, `App.showActivityModal`.
- Produces: sidebar element `#teacherSidebar`, breadcrumb `#teacherBreadcrumb`, page title `#teacherPageTitle`, and description `#teacherPageDescription`.

- [ ] **Step 1: Add sidebar groups**

```html
<div class="teacher-menu-group">내 수업</div>
<button onclick="TeacherAdminModule.switchTab('eval')">…수업 현황…</button>
<button onclick="App.showActivityModal()">…새 활동 생성…</button>
```

- [ ] **Step 2: Add account-management group**

```html
<div class="teacher-menu-group">계정 관리</div>
<button onclick="TeacherAdminModule.switchTab('students')">…학생 관리…</button>
<button id="tabTeacherMaster" style="display:none" onclick="TeacherAdminModule.switchTab('master')">…교사 관리…</button>
```

- [ ] **Step 3: Add top breadcrumb bar**

```html
<button onclick="TeacherAdminModule.toggleSidebar()" aria-label="메뉴 접기 또는 펼치기">☰</button>
<nav id="teacherBreadcrumb" aria-label="현재 위치">내 수업 › 수업 현황</nav>
```

### Task 3: Add full-width and collapsed-sidebar styling

**Files:**
- Modify: `styles/main.css`

**Interfaces:**
- Consumes: `#teacherAppSection.sidebar-collapsed` class.
- Produces: full-width teacher layout with 215px expanded and 64px collapsed sidebar widths.

- [ ] **Step 1: Scope full-width rule to teacher dashboard**

```css
#teacherAppSection.teacher-dashboard { width: 100%; max-width: none; margin: 0; }
```

- [ ] **Step 2: Add collapsed icon-rail rules**

```css
#teacherAppSection.sidebar-collapsed { grid-template-columns: 64px minmax(0, 1fr); }
#teacherAppSection.sidebar-collapsed .teacher-menu-label { display: none; }
```

- [ ] **Step 3: Preserve readable small-screen behavior**

```css
@media (max-width: 760px) { #teacherAppSection.teacher-dashboard { grid-template-columns: 1fr; } }
```

### Task 4: Verify dashboard behavior

**Files:**
- Test: `tests/teacher-dashboard-navigation-check.mjs`

**Interfaces:**
- Consumes: HTML/CSS/JS file content.
- Produces: a Node check that verifies required navigation identifiers and the absence of `빠른 작업` in the teacher view.

- [ ] **Step 1: Write verification script**

```js
assert.match(view, /id="teacherBreadcrumb"/);
assert.match(module, /toggleSidebar/);
assert.doesNotMatch(view, /빠른 작업/);
```

- [ ] **Step 2: Run verification and syntax checks**

Run: `node --test tests/teacher-dashboard-navigation-check.mjs && node --check js/modules/teacherAdmin.js`

Expected: all tests pass and both JavaScript files parse.

- [ ] **Step 3: Manually verify in browser**

Open the teacher dashboard, toggle the menu twice, select each visible menu item, and confirm its breadcrumb and content match.
