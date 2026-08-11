# THINK 단계별 학생 글 열람 및 학급 인사이트 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 교사가 수업 운영의 각 THINK 단계에서 새 탭을 열어 학생별 초안·제출 글을 열람하고, 식별정보 없는 학급 단위 Gemini 인사이트와 워드 클라우드를 볼 수 있게 한다.

**Architecture:** 수업 운영 행의 버튼이 `classId`, `lessonId`, `stageCode`를 URL로 전달해 독립된 교사용 새 탭을 연다. 새 Edge Function은 교사 소유 학급과 차시 연결을 검증한 후 해당 단계의 응답·미작성 학생 현황을 반환한다. Gemini 분석은 같은 인증 경로를 거친 익명화된 글 묶음만 받으며, 결과는 요청 시 생성하고 저장하지 않는다.

**Tech Stack:** 브라우저 JavaScript/HTML/CSS, Supabase Edge Functions (Deno), Supabase Postgres, Gemini API via `GEMINI_API_KEY`, Node.js 내장 테스트 러너.

## Global Constraints

- 교사는 자신의 학급·연결된 차시·THINK 단계의 글만 열람할 수 있다.
- 단계 공개 상태가 `비공개`여도 교사는 기존 초안과 제출 글을 열람할 수 있다.
- 학생 이름·학번·그 밖의 식별자는 Gemini 요청 본문에 포함하지 않는다.
- AI 인사이트는 학급 집계용 보조 자료이며, 학생별 점수·등수·판정·이름을 생성하지 않는다.
- 학생 글 원문과 AI 분석 결과는 브라우저 외부에 추가 저장하지 않는다.
- 워드 클라우드는 로컬 텍스트 집계로 만들며 AI 호출을 요구하지 않는다.

---

### Task 1: 교사용 단계 응답 조회 API와 권한 검증

**Files:**
- Create: `supabase/functions/get-teacher-stage-responses/index.ts`
- Create: `supabase/functions/get-teacher-stage-responses/deno.json`
- Modify: `js/supabase-client.js`
- Test: `tests/teacher-stage-response-detail.test.mjs`

**Interfaces:**
- Consumes: `{ classId, lessonId, stageCode }` and authenticated teacher JWT.
- Produces: `{ classInfo, lesson, stageCode, stageAccessMode, students: [{ studentNumber, studentName, response: { content, updatedAt, submittedAt } | null }] }`.

- [ ] **Step 1: Write failing contract tests**

Require a dedicated teacher-stage response client method and an Edge Function that validates the stage code, confirms class ownership, confirms the lesson belongs to a project version attached to that class, and reads `think_stage_responses` for the requested stage.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/teacher-stage-response-detail.test.mjs`

Expected: fail because the teacher-stage response API is absent.

- [ ] **Step 3: Implement the minimum authenticated API**

Use the same approved-teacher pattern as `manage-class-projects`. Determine eligible students from the requested class grade/class number, merge their accounts with response rows by student number, and return all students so unsubmitted work is visible. Fetch `class_lesson_stage_access` only for display metadata; do not gate teacher reading on it.

- [ ] **Step 4: Verify GREEN**

Run: `node --test tests/teacher-stage-response-detail.test.mjs`

Expected: pass.

### Task 2: 새 탭 학생 글 열람 화면

**Files:**
- Create: `teacher-stage-responses.html`
- Create: `js/modules/teacherStageResponses.js`
- Modify: `js/modules/teacherAdmin.js`
- Modify: `styles/main.css`
- Test: `tests/teacher-stage-response-detail.test.mjs`

**Interfaces:**
- Consumes: `teacher-stage-responses.html?classId=<uuid>&lessonId=<uuid>&stageCode=<T|H|I|N|K>` and `fetchTeacherStageResponses`.
- Produces: 학생 목록·필터·정렬·원문 열람 탭.

- [ ] **Step 1: Write failing UI tests**

Require each class-detail THINK stage row to render a `학생 작성 글 보기` button after the three status controls, opening the dedicated URL in a new tab with all three identifiers. Require the page to render header metadata, overall counts, student list, response detail, and the empty-response state.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test tests/teacher-stage-response-detail.test.mjs`

Expected: fail because button, page, and renderer are absent.

- [ ] **Step 3: Implement the reading experience**

Build the page as a teacher-authenticated standalone page. Render:

```text
Back to lesson operations
Subject · grade/class · project · lesson · THINK stage · core question
Current student visibility state (teacher can read drafts regardless)
[Student writing] [Class insights]
Counts: all / writing / not started / submitted; filter and sort controls
Left: student number, name, status, last save time
Right: selected response content or not-started empty state
```

Use text insertion/escaping for every student-provided value. Do not add editing or teacher memo controls.

- [ ] **Step 4: Verify GREEN**

Run: `node --test tests/teacher-stage-response-detail.test.mjs`

Expected: pass.

### Task 3: 워드 클라우드와 익명 Gemini 학급 인사이트

**Files:**
- Create: `supabase/functions/analyze-teacher-stage-responses/index.ts`
- Create: `supabase/functions/analyze-teacher-stage-responses/deno.json`
- Modify: `js/supabase-client.js`
- Modify: `js/modules/teacherStageResponses.js`
- Modify: `styles/main.css`
- Test: `tests/teacher-stage-response-detail.test.mjs`

**Interfaces:**
- Consumes: `{ classId, lessonId, stageCode }`; server reuses teacher authorization and fetches the source text itself.
- Produces: `{ overview, perspectives: [{ label, count }], missingPerspectives: string[], nextQuestion: string, generatedAt }`.

- [ ] **Step 1: Write failing AI-contract tests**

Require the analysis function to load responses server-side rather than accepting raw client text, omit `student_name` and `student_number` from the Gemini payload construction, and return structured aggregate-only output. Require the browser to compute/render a word cloud from loaded response text without a Gemini call.

- [ ] **Step 2: Run focused test and verify RED**

Run: `node --test tests/teacher-stage-response-detail.test.mjs`

Expected: fail because the analysis endpoint and insight UI are absent.

- [ ] **Step 3: Implement privacy-preserving insights**

On the `학급 인사이트` tab, display writing counts, a local Korean token-frequency word cloud, and a `AI 학급 요약 생성` button. The button calls the analysis endpoint, which:

1. Authenticates the teacher and validates class/lesson/stage ownership exactly as Task 1.
2. Loads only non-empty response contents from the database.
3. Removes direct student identifiers by constructing the Gemini payload from numbered anonymous excerpts only.
4. Limits total text to a documented safe input cap and reports when some responses were excluded.
5. Requests JSON containing aggregate perspective labels/counts, a concise summary, missing perspectives, and one next-stage discussion question.
6. Rejects student-level evaluation, ranking, scoring, or attribution in the prompt and validates the returned JSON shape before responding.

Show the AI result only in the current browser session, with a timestamp and a note that it is an instructional aid rather than an assessment.

- [ ] **Step 4: Verify GREEN**

Run: `node --test tests/teacher-stage-response-detail.test.mjs`

Expected: pass.

### Task 4: Deployment and end-to-end verification

**Files:**
- Modify: `tests/teacher-stage-response-detail.test.mjs`

**Interfaces:**
- Consumes: Tasks 1–3 contracts.
- Produces: regression coverage for teacher-only reading and anonymized analysis.

- [ ] **Step 1: Add acceptance coverage**

Cover: teacher can read drafts while stage is hidden; another teacher cannot read or analyze the class; unsubmitted students appear; analysis request contains no student identifiers; no Gemini request occurs for word-cloud rendering; analysis error is shown without removing the original response list.

- [ ] **Step 2: Run automated verification**

Run: `node --test tests/*.test.mjs` and `npx --yes supabase db advisors --linked`.

Expected: no newly introduced test failures; review any pre-existing failures separately.

- [ ] **Step 3: Deploy only required functions**

Run:

```powershell
npx --yes supabase functions deploy get-teacher-stage-responses analyze-teacher-stage-responses --use-api
```

Ensure the existing `GEMINI_API_KEY` secret is present; do not print or alter its value.

- [ ] **Step 4: Manually verify the core path**

1. Keep a THINK stage hidden and create at least one student draft.
2. Open `학생 작성 글 보기` as the owning teacher and confirm draft visibility.
3. Confirm unsubmitted students appear in the left list.
4. Switch to `학급 인사이트`, inspect local word cloud, and generate Gemini insight.
5. Confirm only aggregate analysis is shown and no student identity appears in it.
