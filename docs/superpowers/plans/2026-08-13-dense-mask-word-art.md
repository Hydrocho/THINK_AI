# Dense Mask Word Art Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render every Word Art mask as a dense, recognizable silhouette without allowing word bounds to cross the selected mask.

**Architecture:** Keep geometry and canvas drawing in `teacherStageResponses.js`, but extract pure candidate, fitting, collision, and placement helpers. Build primary, repeated, and filler candidates in sequence; place each with bounded spiral searches and bounded font-size fallback. Existing `isInsideShape` remains the only shape-geometry source.

**Tech Stack:** Browser Canvas 2D API, ES modules, Node `node:test` and `assert`.

## Global Constraints

- Add no dependency or network request.
- Preserve existing 800×500 CSS display and high-DPI PNG export.
- Apply the new layout to heart, star, lightbulb, cloud, diamond, circle, and apple.
- Preserve existing token aggregation, palettes, shape selector, refresh, and export controls.
- Keep all layout attempts bounded so rendering remains responsive.

---

## File Structure

- Modify `js/modules/teacherStageResponses.js`: export pure word-art layout helpers and make `drawWordArt` use them.
- Modify `tests/teacher-stage-response-detail.test.mjs`: test shape-bound fitting, collisions, candidate tiers, and font-size fallback.

### Task 1: Define pure candidate and geometry helpers

**Files:**
- Modify: `tests/teacher-stage-response-detail.test.mjs`
- Modify: `js/modules/teacherStageResponses.js`

**Interfaces:**
- Produces: `buildWordArtCandidates(tokens, options?)`, returning `{ text, count, rank, tier, isMain, fontSize, allowVertical }[]`.
- Produces: `fitsInsideShape(box, cx, cy, radius, shape)`, returning `boolean` after testing nine points on the axis-aligned bounds.
- Produces: `boxesOverlap(first, second, gap = 2)`, returning whether padded bounds intersect.

- [ ] **Step 1: Write failing candidate-tier tests**

```js
const candidates = module.buildWordArtCandidates([
  { text: '유전자', count: 5 },
  { text: '환경', count: 2 }
], { primaryLimit: 2, repeatLimit: 4, fillerLimit: 6 });

assert.equal(candidates.filter((item) => item.tier === 'primary').length, 2);
assert.equal(candidates.filter((item) => item.tier === 'medium').length, 4);
assert.equal(candidates.filter((item) => item.tier === 'filler').length, 6);
assert.equal(candidates[0].text, '유전자');
```

- [ ] **Step 2: Run the new test to verify RED**

Run: `node --test tests/teacher-stage-response-detail.test.mjs`

Expected: FAIL because `buildWordArtCandidates` is not exported.

- [ ] **Step 3: Implement bounded candidate construction**

```js
export function buildWordArtCandidates(tokens = [], {
  primaryLimit = 60,
  repeatLimit = 72,
  fillerLimit = 120
} = {}) {
  // add one primary per token, then frequency-weighted medium and filler copies
  // until each fixed cap is reached
}
```

- [ ] **Step 4: Run candidate tests to verify GREEN**

Run: `node --test tests/teacher-stage-response-detail.test.mjs`

Expected: PASS.

- [ ] **Step 5: Write failing geometry and collision tests**

```js
assert.equal(module.fitsInsideShape(
  { x: 86, y: 86, w: 28, h: 28 }, 100, 100, 90, 'circle'
), true);
assert.equal(module.fitsInsideShape(
  { x: 8, y: 88, w: 30, h: 24 }, 100, 100, 90, 'circle'
), false);
assert.equal(module.boxesOverlap(
  { x: 10, y: 10, w: 20, h: 20 }, { x: 31, y: 10, w: 10, h: 10 }, 2
), true);
```

- [ ] **Step 6: Run geometry tests to verify RED**

Run: `node --test tests/teacher-stage-response-detail.test.mjs`

Expected: FAIL because `fitsInsideShape` and `boxesOverlap` are not exported.

- [ ] **Step 7: Implement geometry helpers using `isInsideShape`**

```js
export function fitsInsideShape(box, cx, cy, radius, shape) {
  const points = [
    [box.x, box.y], [box.x + box.w, box.y],
    [box.x, box.y + box.h], [box.x + box.w, box.y + box.h],
    [box.x + box.w / 2, box.y], [box.x + box.w / 2, box.y + box.h],
    [box.x, box.y + box.h / 2], [box.x + box.w, box.y + box.h / 2],
    [box.x + box.w / 2, box.y + box.h / 2]
  ];
  return points.every(([x, y]) => isInsideShape((x - cx) / radius, (y - cy) / radius, shape));
}
```

- [ ] **Step 8: Run the focused test file to verify GREEN**

Run: `node --test tests/teacher-stage-response-detail.test.mjs`

Expected: PASS.

- [ ] **Step 9: Commit Task 1**

```bash
git add tests/teacher-stage-response-detail.test.mjs js/modules/teacherStageResponses.js
git commit -m "feat: add dense word art layout helpers"
```

### Task 2: Add bounded placement with size fallback

**Files:**
- Modify: `tests/teacher-stage-response-detail.test.mjs`
- Modify: `js/modules/teacherStageResponses.js`

**Interfaces:**
- Consumes: `fitsInsideShape(box, cx, cy, radius, shape)` and `boxesOverlap(first, second, gap)` from Task 1.
- Produces: `findWordArtPlacement(config)`, returning `{ x, y, box, fontSize, vertical } | null`.

- [ ] **Step 1: Write a failing font-size fallback test**

```js
const placement = module.findWordArtPlacement({
  shape: 'circle', cx: 100, cy: 100, radius: 60,
  sizes: [72, 20], widthForSize: (size) => size,
  heightForSize: (size) => size / 2,
  placedBoxes: [], searchPoints: [[100, 100]]
});

assert.equal(placement.fontSize, 20);
assert.equal(module.fitsInsideShape(placement.box, 100, 100, 60, 'circle'), true);
```

- [ ] **Step 2: Run the focused test to verify RED**

Run: `node --test tests/teacher-stage-response-detail.test.mjs`

Expected: FAIL because `findWordArtPlacement` is not exported.

- [ ] **Step 3: Implement deterministic bounded placement**

```js
export function findWordArtPlacement({ sizes, searchPoints, placedBoxes, gap = 2, ...config }) {
  for (const fontSize of sizes) {
    for (const point of searchPoints) {
      const box = makeMeasuredBox(point, fontSize, config);
      if (fitsInsideShape(box, config.cx, config.cy, config.radius, config.shape)
        && !placedBoxes.some((other) => boxesOverlap(box, other, gap))) {
        return { x: point[0], y: point[1], box, fontSize, vertical: Boolean(config.vertical) };
      }
    }
  }
  return null;
}
```

- [ ] **Step 4: Run the focused test file to verify GREEN**

Run: `node --test tests/teacher-stage-response-detail.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add tests/teacher-stage-response-detail.test.mjs js/modules/teacherStageResponses.js
git commit -m "feat: add bounded word art placement fallback"
```

### Task 3: Integrate the three-pass renderer

**Files:**
- Modify: `tests/teacher-stage-response-detail.test.mjs`
- Modify: `js/modules/teacherStageResponses.js`

**Interfaces:**
- Consumes: `buildWordArtCandidates`, `findWordArtPlacement`, `fitsInsideShape`, and existing `isInsideShape`.
- Produces: `drawWordArt(canvas, tokens, shape, palette)` with primary, medium, and filler placement passes.

- [ ] **Step 1: Write failing renderer-source contract tests**

```js
assert.match(detailModuleSource, /buildWordArtCandidates\(tokens\)/);
assert.match(detailModuleSource, /findWordArtPlacement\(/);
assert.match(detailModuleSource, /tier === 'primary'/);
assert.match(detailModuleSource, /tier === 'medium'/);
assert.match(detailModuleSource, /tier === 'filler'/);
```

- [ ] **Step 2: Run the focused test to verify RED**

Run: `node --test tests/teacher-stage-response-detail.test.mjs`

Expected: FAIL because `drawWordArt` still uses one `expandedWords` loop.

- [ ] **Step 3: Replace the old placement loop with three passes**

```js
const candidates = buildWordArtCandidates(tokens);
for (const tier of ['primary', 'medium', 'filler']) {
  candidates.filter((candidate) => candidate.tier === tier).forEach((candidate, index) => {
    const placement = findWordArtPlacement(/* canvas metrics, candidate, and bounded spiral points */);
    if (placement) drawPlacedWord(ctx, candidate, placement, colors[index % colors.length]);
  });
}
```

- [ ] **Step 4: Run focused regression tests to verify GREEN**

Run: `node --test tests/teacher-stage-response-detail.test.mjs`

Expected: PASS.

- [ ] **Step 5: Run the full JavaScript test suite**

Run: `node --test tests/*.test.mjs`

Expected: PASS with zero failures.

- [ ] **Step 6: Commit Task 3**

```bash
git add tests/teacher-stage-response-detail.test.mjs js/modules/teacherStageResponses.js
git commit -m "feat: densify all word art masks"
```

### Task 4: Browser verification

**Files:**
- Modify: none unless browser verification reveals a defect.

**Interfaces:**
- Consumes: completed canvas renderer and existing Word Art controls.
- Produces: manual evidence that all seven masks render without words protruding across their boundaries.

- [ ] **Step 1: Start the existing local app using its documented development command**

Run the project’s documented static-server command or `npx serve .` if no project script exists.

- [ ] **Step 2: Open Teacher Stage Responses → Class Insights → Word Art Cloud**

Use a class/stage with existing response data, select each existing mask, and refresh once.

- [ ] **Step 3: Verify all masks and export**

Confirm no word visibly crosses a mask boundary, boundary regions contain small filler words, and the download button produces a PNG matching the displayed canvas.

- [ ] **Step 4: Commit a verification-only fix if one is required**

```bash
git add js/modules/teacherStageResponses.js tests/teacher-stage-response-detail.test.mjs
git commit -m "fix: tune dense word art mask packing"
```
