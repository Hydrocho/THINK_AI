import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const teacherModule = fs.readFileSync(new URL('../js/modules/teacherAdmin.js', import.meta.url), 'utf8');
const supabaseClient = fs.readFileSync(new URL('../js/supabase-client.js', import.meta.url), 'utf8');
const edgeFunction = fs.readFileSync(new URL('../supabase/functions/manage-class-projects/index.ts', import.meta.url), 'utf8');
const migrationPath = new URL('../supabase/migrations/20260809120000_make_lesson_designs_private.sql', import.meta.url);

test('personal lesson designs have no draft or sharing controls', () => {
  assert.doesNotMatch(teacherModule, /publishProject/);
  assert.doesNotMatch(teacherModule, /공개하기|공개 중|학급 연결 가능|🔒 초안/);
  assert.doesNotMatch(supabaseClient, /publishProject/);
  assert.doesNotMatch(edgeFunction, /b\.action==="publish"/);
  assert.doesNotMatch(edgeFunction, /visibility\.eq\.published/);
});

test('class attachment only accepts the teacher-owned project and class', () => {
  assert.match(edgeFunction, /select\("project_id,projects!inner\(author_id\)"\)\.eq\("id",b\.versionId\)\.eq\("projects\.author_id",userId\)/);
  assert.match(edgeFunction, /from\("classes"\)\.select\("id"\)\.eq\("id",b\.classId\)\.eq\("teacher_id",userId\)/);
});

test('migration makes existing projects private and restricts reads to their authors', () => {
  assert.ok(fs.existsSync(migrationPath));
  const migration = fs.readFileSync(migrationPath, 'utf8');
  assert.match(migration, /update public\.projects\s+set visibility = 'private'\s+where visibility = 'published'/s);
  assert.match(migration, /drop policy if exists "teachers read own or published projects" on public\.projects/);
  assert.match(migration, /create policy "teachers read own projects" on public\.projects for select to authenticated\s+using \(author_id = \(select auth\.uid\(\)\)\)/s);
});
