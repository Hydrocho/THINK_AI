import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const clientPath = new URL('../js/supabase-client.js', import.meta.url);
const functionPath = new URL('../supabase/functions/get-teacher-stage-responses/index.ts', import.meta.url);
const denoConfigPath = new URL('../supabase/functions/get-teacher-stage-responses/deno.json', import.meta.url);
const teacherAdminPath = new URL('../js/modules/teacherAdmin.js', import.meta.url);
const detailPagePath = new URL('../teacher-stage-responses.html', import.meta.url);
const detailModulePath = new URL('../js/modules/teacherStageResponses.js', import.meta.url);
const analysisFunctionPath = new URL('../supabase/functions/analyze-teacher-stage-responses/index.ts', import.meta.url);
const analysisDenoConfigPath = new URL('../supabase/functions/analyze-teacher-stage-responses/deno.json', import.meta.url);

const clientSource = fs.readFileSync(clientPath, 'utf8');
const functionSource = fs.existsSync(functionPath) ? fs.readFileSync(functionPath, 'utf8') : '';
const teacherAdminSource = fs.readFileSync(teacherAdminPath, 'utf8');
const detailPageSource = fs.existsSync(detailPagePath) ? fs.readFileSync(detailPagePath, 'utf8') : '';
const detailModuleSource = fs.existsSync(detailModulePath) ? fs.readFileSync(detailModulePath, 'utf8') : '';
const analysisFunctionSource = fs.existsSync(analysisFunctionPath) ? fs.readFileSync(analysisFunctionPath, 'utf8') : '';

test('teacher response client calls the dedicated endpoint with class, lesson, and stage identifiers', async () => {
  const calls = [];
  const supabaseClient = {
    functions: {
      invoke: async (name, options) => {
        calls.push({ name, options });
        return { data: { students: [] }, error: null };
      }
    }
  };
  const window = {
    SUPABASE_KEYS: { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'test-key' },
    supabase: { createClient: () => supabaseClient }
  };
  vm.runInNewContext(clientSource, { window, console: { log() {}, warn() {}, error() {} } });

  const result = await window.SupabaseService.fetchTeacherStageResponses('class-1', 'lesson-1', 'N');

  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [{
    name: 'get-teacher-stage-responses',
    options: { body: { classId: 'class-1', lessonId: 'lesson-1', stageCode: 'N' } }
  }]);
  assert.deepEqual(result, { students: [] });
});

test('teacher stage response function has a pinned Deno dependency configuration', () => {
  assert.equal(fs.existsSync(denoConfigPath), true, 'expected a function-local deno.json');
  const config = JSON.parse(fs.readFileSync(denoConfigPath, 'utf8'));
  assert.match(config.imports?.['@supabase/supabase-js'] || '', /@supabase\/supabase-js@2/);
});

test('teacher stage response API authenticates an approved teacher and validates request identifiers', () => {
  assert.notEqual(functionSource, '', 'expected get-teacher-stage-responses Edge Function');
  assert.match(functionSource, /req\.method !== "POST"/);
  assert.match(functionSource, /profile\.approval_status !== "approved"/);
  assert.match(functionSource, /\["teacher",\s*"admin"\]\.includes\(profile\.role\)/);
  assert.match(functionSource, /const stageCodes = \["T",\s*"H",\s*"I",\s*"N",\s*"K"\]/);
  assert.match(functionSource, /stageCodes\.includes\(body\.stageCode\)/);
  assert.match(functionSource, /!body\?\.classId[\s\S]*!body\.lessonId/);
});

test('teacher stage response API limits reads to an owned class and an attached lesson version', () => {
  assert.match(functionSource, /from\("classes"\)[\s\S]*\.eq\("id",\s*body\.classId\)[\s\S]*\.eq\("teacher_id",\s*teacherId\)/);
  assert.match(functionSource, /from\("lesson_plans"\)[\s\S]*\.eq\("id",\s*body\.lessonId\)/);
  assert.match(functionSource, /from\("class_projects"\)[\s\S]*\.eq\("class_id",\s*body\.classId\)[\s\S]*\.eq\("source_version_id",\s*lesson\.project_version_id\)/);
});

test('teacher stage response API returns every roster student and merges the requested stage response', () => {
  assert.match(functionSource, /String\(classroom\.class_number\)\.padStart\(2,\s*"0"\)/);
  assert.match(functionSource, /from\("student_accounts"\)[\s\S]*\.like\("student_number",\s*`\$\{studentPrefix\}%`\)/);
  assert.match(functionSource, /from\("think_stage_responses"\)[\s\S]*\.eq\("lesson_plan_id",\s*body\.lessonId\)[\s\S]*\.eq\("stage_code",\s*body\.stageCode\)/);
  assert.match(functionSource, /responseByStudentNumber\.get\(student\.student_number\)\s*\|\|\s*null/);
  assert.match(functionSource, /studentNumber:\s*student\.student_number/);
  assert.match(functionSource, /studentName:\s*student\.student_name/);
});

test('teacher stage response API reports access for display without blocking hidden drafts', () => {
  assert.match(functionSource, /from\("class_lesson_stage_access"\)[\s\S]*\.eq\("class_id",\s*body\.classId\)[\s\S]*\.eq\("lesson_plan_id",\s*body\.lessonId\)[\s\S]*\.eq\("stage_code",\s*body\.stageCode\)/);
  assert.match(functionSource, /stageAccessMode:\s*stageAccess\?\.access_mode\s*\|\|\s*"hidden"/);
  assert.doesNotMatch(functionSource, /stageAccess\?\.access_mode\s*!==/);
});

test('teacher stage response API returns class, project, lesson, access, and response metadata', () => {
  assert.match(functionSource, /classInfo:\s*\{/);
  assert.match(functionSource, /subjectName:\s*classroom\.subject_name/);
  assert.match(functionSource, /gradeNumber:\s*classroom\.grade_number/);
  assert.match(functionSource, /classNumber:\s*classroom\.class_number/);
  assert.match(functionSource, /projectTitle:\s*classProject\.title/);
  assert.match(functionSource, /lesson:\s*\{/);
  assert.match(functionSource, /coreQuestion:\s*lesson\.core_question/);
  assert.match(functionSource, /content:\s*response\.content/);
  assert.match(functionSource, /updatedAt:\s*response\.updated_at/);
  assert.match(functionSource, /submittedAt:\s*response\.submitted_at/);
});

test('each THINK access row opens its class, lesson, and stage response page in a new tab', () => {
  assert.match(teacherAdminSource, /학생 작성 글 보기/);
  assert.match(teacherAdminSource, /openTeacherStageResponses\('\$\{classId\}',\s*'\$\{l\.id\}',\s*'\$\{st\}'\)/);
  assert.match(teacherAdminSource, /new URLSearchParams\(\{\s*classId,\s*lessonId,\s*stageCode\s*\}\)/);
  assert.match(teacherAdminSource, /window\.open\([^,]+,\s*['_"]_blank['_"],\s*['_"]noopener['_"]\)/);
});

test('standalone response page exposes writing and class-insight regions', () => {
  assert.notEqual(detailPageSource, '', 'expected standalone teacher response page');
  assert.match(detailPageSource, /id="stageResponseHeader"/);
  assert.match(detailPageSource, /id="studentWritingTab"/);
  assert.match(detailPageSource, /id="classInsightsTab"/);
  assert.match(detailPageSource, /id="responseSummary"/);
  assert.match(detailPageSource, /id="studentResponseList"/);
  assert.match(detailPageSource, /id="selectedStudentResponse"/);
  assert.match(detailPageSource, /js\/modules\/teacherStageResponses\.js/);
});

test('response detail utilities derive writing counts and local word frequencies', async () => {
  assert.notEqual(detailModuleSource, '', 'expected teacher response page module');
  const module = await import(`${detailModulePath.href}?contract=${Date.now()}`);
  const students = [
    { studentNumber: '30101', response: null },
    { studentNumber: '30102', response: { content: '공정 책임 공정', submittedAt: null } },
    { studentNumber: '30103', response: { content: '공정 선택 책임', submittedAt: '2026-08-11T01:00:00Z' } }
  ];

  assert.deepEqual(module.summarizeStudents(students), {
    all: 3,
    writing: 1,
    notStarted: 1,
    submitted: 1
  });
  assert.deepEqual(module.buildWordCloudTokens(students, 10), [
    { text: '공정', count: 3 },
    { text: '책임', count: 2 },
    { text: '선택', count: 1 }
  ]);
});

test('student-provided values are inserted as text and hidden stages remain readable to teachers', () => {
  assert.match(detailModuleSource, /textContent\s*=\s*student\.studentName/);
  assert.match(detailModuleSource, /textContent\s*=\s*student\.studentNumber/);
  assert.match(detailModuleSource, /textContent\s*=\s*student\.response\.content/);
  assert.match(detailModuleSource, /stageAccessMode/);
  assert.match(detailModuleSource, /비공개여도 교사는 저장된 초안을 열람할 수 있습니다/);
});

test('analysis client calls only the dedicated endpoint identifiers', async () => {
  const calls = [];
  const supabaseClient = {
    functions: {
      invoke: async (name, options) => {
        calls.push({ name, options });
        return { data: { overview: '요약' }, error: null };
      }
    }
  };
  const window = {
    SUPABASE_KEYS: { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'test-key' },
    supabase: { createClient: () => supabaseClient }
  };
  vm.runInNewContext(clientSource, { window, console: { log() {}, warn() {}, error() {} } });

  const result = await window.SupabaseService.analyzeTeacherStageResponses('class-1', 'lesson-1', 'H');

  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [{
    name: 'analyze-teacher-stage-responses',
    options: { body: { classId: 'class-1', lessonId: 'lesson-1', stageCode: 'H' } }
  }]);
  assert.deepEqual(result, { overview: '요약' });
});

test('analysis endpoint authenticates ownership and loads response text server-side', () => {
  assert.notEqual(analysisFunctionSource, '', 'expected teacher analysis Edge Function');
  assert.equal(fs.existsSync(analysisDenoConfigPath), true, 'expected analysis function deno.json');
  assert.match(analysisFunctionSource, /profile\.approval_status !== "approved"/);
  assert.match(analysisFunctionSource, /from\("classes"\)[\s\S]*\.eq\("id",\s*body\.classId\)[\s\S]*\.eq\("teacher_id",\s*teacherId\)/);
  assert.match(analysisFunctionSource, /from\("class_projects"\)[\s\S]*\.eq\("class_id",\s*body\.classId\)[\s\S]*\.eq\("source_version_id",\s*lesson\.project_version_id\)/);
  assert.match(analysisFunctionSource, /from\("think_stage_responses"\)[\s\S]*\.select\("content"\)[\s\S]*\.eq\("lesson_plan_id",\s*body\.lessonId\)[\s\S]*\.eq\("stage_code",\s*body\.stageCode\)/);
  assert.doesNotMatch(analysisFunctionSource, /body\.(responses|contents|studentTexts|texts)/);
});

test('Gemini analysis uses capped anonymous excerpts and validates aggregate-only JSON', () => {
  assert.match(analysisFunctionSource, /MAX_INPUT_CHARS\s*=\s*30_000/);
  assert.match(analysisFunctionSource, /MAX_RESPONSES\s*=\s*80/);
  assert.match(analysisFunctionSource, /총 \$\{includedCount\}개의 익명 학생 글/);
  assert.match(analysisFunctionSource, /excludedResponseCount/);
  assert.match(analysisFunctionSource, /학생별 평가|서열|점수|작성자를 추정|인용하지 마세요/);
  assert.match(analysisFunctionSource, /function validateInsight/);
  assert.match(analysisFunctionSource, /perspectives[\s\S]*missingPerspectives[\s\S]*nextQuestion/);

  const payloadStart = analysisFunctionSource.indexOf('const geminiPayload');
  const requestStart = analysisFunctionSource.indexOf('const geminiResponse', payloadStart);
  const payloadSource = analysisFunctionSource.slice(payloadStart, requestStart);
  assert.notEqual(payloadStart, -1, 'expected Gemini payload construction');
  assert.doesNotMatch(payloadSource, /student_name|student_number|studentName|studentNumber/);
});

test('class insights compute the word cloud locally and call AI only from the explicit action', () => {
  assert.match(detailModuleSource, /buildWordCloudTokens\(state\.students/);
  assert.match(detailModuleSource, /id=['"]generateClassInsightButton['"]/);
  assert.match(detailModuleSource, /addEventListener\(['"]click['"],\s*generateClassInsight\)/);
  assert.match(detailModuleSource, /analyzeTeacherStageResponses\(state\.classId,\s*state\.lessonId,\s*state\.stageCode\)/);
  assert.doesNotMatch(detailModuleSource, /buildWordCloudTokens[\s\S]{0,500}analyzeTeacherStageResponses/);
});
