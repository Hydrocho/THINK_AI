import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const context = { window: {} };
vm.runInNewContext(read('../js/config.js'), context);
const config = context.window.APP_CONFIG;

test('three agreed questions use all THINK stages and thought-provoking AI', () => {
  assert.equal(config.LESSONS.length, 3);
  assert.match(config.LESSONS[0].question, /질투 나는 거지/);
  assert.match(config.LESSONS[1].question, /만남 이후에도/);
  assert.match(config.LESSONS[2].question, /가정해 보자/);
  for (const lesson of config.LESSONS) {
    assert.equal(lesson.thinkStages.join(''), 'THINK');
    assert.equal(lesson.aiResponseMode, 'THOUGHT_PROVOKING');
  }
});

test('first lesson H renders actual peer opinions instead of legacy sample words', () => {
  const container = { innerHTML: '' };
  const ctx = { window: { APP_CONFIG: config }, document: { getElementById: () => container } };
  vm.runInNewContext(read('../js/modules/studentThink.js'), ctx);
  ctx.window.StudentThinkModule.renderStep({
    currentLessonIndex: 0, currentStep: 2,
    activeLessonPlans: [{ ...config.LESSONS[0], thinkStageAccess: { H: 'writable' } }],
    peerOpinions: [{ id: 'peer-1', text: '친구와 함께 진실을 확인하겠다.' }], studentData: {}
  });
  assert.match(container.innerHTML, /친구와 함께 진실을 확인하겠다/);
  assert.doesNotMatch(container.innerHTML, /쌍꺼풀|보조개/);
});

test('project editor selects newest version even when API returns oldest first', async () => {
  const ctx = { window: {}, console: { log() {} } };
  vm.runInNewContext(read('../js/supabase-client.js'), ctx);
  ctx.window.SupabaseService.invokeAccountFunction = async () => ({ projects: [{
    id: 'p1', title: '수업', project_versions: [
      { version_number: 1, lesson_plans: Array(5).fill({}) },
      { version_number: 2, lesson_plans: Array(3).fill({}) }
    ]
  }] });
  const result = await ctx.window.SupabaseService.listProjects();
  assert.equal(result.projects[0].project_versions[0].version_number, 2);
  assert.equal(result.projects[0].project_versions[0].lesson_plans.length, 3);
});

// Optional PostgreSQL-compatible integration test:
// THINK_PGLITE_MODULE points to an installed @electric-sql/pglite/dist/index.js.
test('curriculum migration preserves answers, switches links, and is repeatable', {
  skip: !process.env.THINK_PGLITE_MODULE
}, async () => {
  const { PGlite } = await import(pathToFileURL(process.env.THINK_PGLITE_MODULE).href);
  const db = new PGlite();
  try {
    await db.exec(`
      create table projects(id uuid primary key, author_id uuid, title text, updated_at timestamptz);
      create table project_versions(id uuid primary key default gen_random_uuid(), project_id uuid references projects,
        version_number int, created_by uuid, assessment_criteria text, unique(project_id,version_number));
      create table lesson_plans(id uuid primary key default gen_random_uuid(), project_version_id uuid references project_versions,
        lesson_order int, title text, core_question text, think_stages text[], ai_question_limit int, ai_response_mode text,
        student_access_mode text, think_stage_access jsonb default '{"T":"hidden","H":"hidden","I":"hidden","N":"hidden","K":"hidden"}',
        unique(project_version_id,lesson_order));
      create table classes(id uuid primary key, active_lesson_plan_id uuid references lesson_plans);
      create table class_projects(source_project_id uuid references projects, source_version_id uuid references project_versions, title text);
      create table class_lesson_stage_access(lesson_plan_id uuid references lesson_plans, access_mode text, updated_at timestamptz);
      create table think_stage_responses(lesson_plan_id uuid references lesson_plans, content text);
      insert into projects values ('00000000-0000-0000-0000-000000000001', gen_random_uuid(), '유전자 조작 기술, 인간에게 축복일까? 재앙일까?', now());
      insert into project_versions(project_id,version_number) select id,1 from projects;
      insert into lesson_plans(project_version_id,lesson_order,title,core_question,student_access_mode)
      select v.id,n,case when n=5 then '사람의 유전' else n||'차시' end,
        case when n=1 then '사람에게 나타나는 다양한 특징 중 부모에게서 물려받는 것은 어떤 것이 있을까?' when n=5 then '우리 주변에서 색깔만으로 정보를 구분하는 사례는 무엇인가? 특정 색을 구분하기 힘든 사람을 위한 해결 방안을 제시해보자.' else '기존 질문' end,'writable'
      from project_versions v cross join generate_series(1,5) n;
      insert into class_projects select project_id,id,'기존 수업' from project_versions;
      insert into classes select gen_random_uuid(),id from lesson_plans where lesson_order=1;
      insert into think_stage_responses select id,'보존할 기존 답변' from lesson_plans where lesson_order=1;
      insert into class_lesson_stage_access select id,'writable',now() from lesson_plans;
      insert into projects values ('00000000-0000-0000-0000-000000000002', gen_random_uuid(), '다른 수업', now());
      insert into project_versions(project_id,version_number) values ('00000000-0000-0000-0000-000000000002',1);
    `);
    const sql = read('../supabase/migrations/20261108000000_island_three_lessons.sql');
    await db.exec(sql);
    await db.exec(sql);
    const { rows } = await db.query(`select l.* from class_projects cp join lesson_plans l on l.project_version_id=cp.source_version_id order by l.lesson_order`);
    assert.equal(rows.length, 3);
    rows.forEach((row,i) => {
      assert.equal(row.core_question, config.LESSONS[i].question);
      assert.equal(row.think_stages.join(''), 'THINK');
      assert.equal(row.ai_response_mode, 'THOUGHT_PROVOKING');
      assert.equal(row.student_access_mode, 'hidden');
    });
    assert.equal((await db.query('select * from think_stage_responses')).rows[0].content, '보존할 기존 답변');
    assert.equal((await db.query('select * from project_versions')).rows.length, 3);
    assert.equal((await db.query('select * from lesson_plans')).rows.length, 8);
    assert.equal((await db.query('select * from classes')).rows[0].active_lesson_plan_id, null);
    assert.equal((await db.query("select * from class_lesson_stage_access where access_mode <> 'hidden'")).rows.length, 0);
  } finally { await db.close(); }
});
