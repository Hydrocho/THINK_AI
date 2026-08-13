# Word Art Render Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent Word Art Cloud rendering from blocking the UI.

**Architecture:** Cache vector points during map construction, reduce map resolution to 8px, cap tier candidates, and schedule one placement tier per animation frame.

**Tech Stack:** Browser Canvas API, ES modules, Node `node:test`.

### Task 1: Bound mask-map work

**Files:** `js/modules/teacherStageResponses.js`, `tests/teacher-stage-response-detail.test.mjs`

- [ ] Add a failing test that map candidate points respect a supplied cap.
- [ ] Run `node --test tests/teacher-stage-response-detail.test.mjs` and confirm RED.
- [ ] Cache shape points, accept a point cap, and use an 8px render map.
- [ ] Re-run the focused test and confirm GREEN.

### Task 2: Yield between render tiers

**Files:** `js/modules/teacherStageResponses.js`, `tests/teacher-stage-response-detail.test.mjs`

- [ ] Add a failing source contract test for `requestAnimationFrame` and its fallback.
- [ ] Run the focused test and confirm RED.
- [ ] Extract tier placement and schedule primary, medium, and filler one frame at a time.
- [ ] Run focused and full test suites; record existing unrelated failures.
