# Vector Mask Word Art Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every Word Art template a dense, accurate vector silhouette.

**Architecture:** Define each template as a canvas `Path2D`, rasterize the path into a small occupancy map, and have the existing three candidate tiers consume available map cells. The path controls both the faint guide background and word placement, so all masks share one authoritative silhouette.

**Tech Stack:** Browser Canvas 2D API, `Path2D`, ES modules, Node `node:test`.

## Global Constraints

- No dependency, image asset, or network request.
- Keep the seven existing template controls and 800×500 high-DPI canvas export.
- Use finite candidate, map-cell, and size-fallback limits.
- Preserve local token aggregation, palette selection, refresh, and export.

---

### Task 1: Add testable vector-mask geometry

**Files:**
- Modify: `tests/teacher-stage-response-detail.test.mjs`
- Modify: `js/modules/teacherStageResponses.js`

**Interfaces:**
- Produces: `getWordArtShapePoints(shape, cx, cy, radius)` returning sampled polygon points for all seven shapes.
- Produces: `isPointInWordArtShape(x, y, shape, cx, cy, radius)` returning a pure inclusion result.

- [ ] Write a failing test that each supported shape returns at least three points and accepts its centre while rejecting a distant point.
- [ ] Run `node --test tests/teacher-stage-response-detail.test.mjs` and confirm RED because the geometry helpers are absent.
- [ ] Implement sampled Bézier/polygon outlines for heart, star, lightbulb, cloud, DNA, circle, and apple, plus a point-in-polygon predicate.
- [ ] Run the focused test file and confirm GREEN.
- [ ] Commit: `git add tests/teacher-stage-response-detail.test.mjs js/modules/teacherStageResponses.js && git commit -m "feat: add vector word art masks"`

### Task 2: Add a bounded occupancy map

**Files:**
- Modify: `tests/teacher-stage-response-detail.test.mjs`
- Modify: `js/modules/teacherStageResponses.js`

**Interfaces:**
- Consumes: `isPointInWordArtShape` from Task 1.
- Produces: `createWordArtMaskMap({ shape, width, height, cx, cy, radius, cellSize })` with `canPlace`, `occupy`, and `getCandidatePoints`.

- [ ] Write a failing test that a circle map accepts an interior box, rejects an exterior box, and rejects the same box after occupation.
- [ ] Run the focused test file and confirm RED because the map helper is absent.
- [ ] Implement the map with sampled box coverage, configurable padded occupation, and edge-first point order for filler terms.
- [ ] Run the focused test file and confirm GREEN.
- [ ] Commit: `git add tests/teacher-stage-response-detail.test.mjs js/modules/teacherStageResponses.js && git commit -m "feat: add word art occupancy map"`

### Task 3: Replace spiral placement with mask-map placement

**Files:**
- Modify: `tests/teacher-stage-response-detail.test.mjs`
- Modify: `js/modules/teacherStageResponses.js`

**Interfaces:**
- Consumes: candidate tiers, `getWordArtShapePoints`, and `createWordArtMaskMap`.
- Produces: `drawWordArt(canvas, tokens, shape, palette)` that draws its guide and places words through the occupancy map.

- [ ] Write a failing source contract test asserting that `drawWordArt` creates a mask map and requests points by each of `primary`, `medium`, and `filler` tiers.
- [ ] Run the focused test file and confirm RED because the renderer still uses spiral points.
- [ ] Render the vector guide from the same sampled outline and replace spiral point lookup with map point lookup and bounded font-size fallback.
- [ ] Run `node --test tests/teacher-stage-response-detail.test.mjs` and confirm GREEN.
- [ ] Run `node --test tests/*.test.mjs`; record unrelated pre-existing failures separately if they remain.
- [ ] Commit: `git add tests/teacher-stage-response-detail.test.mjs js/modules/teacherStageResponses.js && git commit -m "feat: pack word art with vector masks"`

### Task 4: Visual verification

**Files:** none unless a defect is found.

- [ ] Run the static app from this worktree and open Class Insights → Word Art Cloud.
- [ ] Refresh heart, star, lightbulb, cloud, DNA, circle, and apple with the same response data.
- [ ] Confirm narrow features remain recognizable, filler text reaches the outline without crossing it, and PNG export matches the displayed canvas.
