import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const lobbyView = fs.readFileSync(new URL('../views/studentLobbyView.html', import.meta.url), 'utf8');
const lobby = fs.readFileSync(new URL('../js/modules/studentLobby.js', import.meta.url), 'utf8');
const thinkView = fs.readFileSync(new URL('../views/studentThinkView.html', import.meta.url), 'utf8');
const think = fs.readFileSync(new URL('../js/modules/studentThink.js', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const client = fs.readFileSync(new URL('../js/supabase-client.js', import.meta.url), 'utf8');
const studentLessons = fs.readFileSync(new URL('../supabase/functions/get-student-lessons/index.ts', import.meta.url), 'utf8');
const responseFunction = fs.readFileSync(new URL('../supabase/functions/save-think-stage-response/index.ts', import.meta.url), 'utf8');
const projectFunction = fs.readFileSync(new URL('../supabase/functions/manage-class-projects/index.ts', import.meta.url), 'utf8');
const teacherAdmin = fs.readFileSync(new URL('../js/modules/teacherAdmin.js', import.meta.url), 'utf8');
const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('student lobby contains one live lesson target and no PIN or legacy activity path', () => {
  assert.match(lobbyView, /id="lobbyActiveLessonContainer"/);
  assert.doesNotMatch(lobbyView, /inputPinCode|PIN 번호/);
  assert.match(lobby, /fetchStudentLiveLesson/);
  assert.doesNotMatch(lobby, /fetchActivities|enterByPin|APP_CONFIG\.LESSONS/);
});

test('student lesson API is based on the student account and an open class session', () => {
  assert.match(studentLessons, /student_accounts/);
  assert.match(studentLessons, /class_sessions/);
  assert.match(studentLessons, /\.eq\(["']status["'],\s*["']open["']\)/);
  assert.match(studentLessons, /liveLesson/);
});

test('student APIs use the authenticated student account and retain final submission state', () => {
  assert.match(studentLessons, /auth_user_id/);
  assert.match(studentLessons, /think_stage_responses/);
  assert.match(studentLessons, /submitted_at/);
  assert.match(responseFunction, /auth_user_id/);
  assert.match(responseFunction, /submitted_at/);
  assert.match(responseFunction, /class_sessions/);
});

test('opening a lesson scopes existing open sessions to the whole class', () => {
  assert.match(projectFunction, /class_id/);
  assert.match(projectFunction, /status:"closed"/);
});

test('teacher class detail derives the open lesson from the active session', () => {
  assert.match(teacherAdmin, /from\('class_sessions'\)/);
  assert.match(teacherAdmin, /openLessonPlanId/);
  assert.doesNotMatch(teacherAdmin, /const openLessonPlanId = null/);
});

test('client and lobby expose the live-lesson-only entry point', () => {
  assert.match(client, /fetchStudentLiveLesson:\s*async function/);
  assert.match(lobby, /enterLiveLesson:\s*function/);
  assert.match(lobby, /lobbyActiveLessonContainer/);
  assert.match(lobby, /lobbyHistoryContainer/);
  assert.doesNotMatch(lobby, /fetchStudentPublishedLessons|fetchActivities|enterByPin/);
});

test('student THINK screen uses the active live lesson instead of sample lessons', () => {
  assert.match(app, /state\.activeLessonPlans && state\.activeLessonPlans\[state\.currentLessonIndex\]/);
  assert.doesNotMatch(thinkView, /id="lessonSelect"/);
  assert.match(thinkView, /id="currentLessonLabel"/);
  assert.match(thinkView, /id="stepTagBadge"/);
  assert.match(thinkView, /id="stepMainTitle"/);
  assert.match(think, /getElementById\('stepContentContainer'\)/);
});

test('student response actions wait for saving and do not silently advance on errors', () => {
  assert.match(app, /saveInitialThought: async function/);
  assert.match(app, /savePeerRationale: async function/);
  assert.match(app, /submitFinalReflection: async function/);
  assert.match(app, /저장 중 오류가 발생했습니다/);
});

test('migration enforces at most one open session per class', () => {
  const files = fs.readdirSync(new URL('../supabase/migrations/', import.meta.url));
  const migrationName = files.find(name => name.includes('single_open_class_session'));
  assert.ok(migrationName);
  const migration = fs.readFileSync(new URL(`../supabase/migrations/${migrationName}`, import.meta.url), 'utf8');
  assert.match(migration, /add column if not exists class_id uuid/);
  assert.match(migration, /create unique index.*one_open_session_per_class.*where status = 'open'/is);
});

test('THINK renderer and view use the same content container', () => {
  assert.match(thinkView, /id="stepContentContainer"/);
  assert.match(think, /getElementById\('stepContentContainer'\)/);
});

test('student lesson API returns a lobby-safe empty state for an unassigned student', () => {
  assert.match(studentLessons, /if \(!student\.class_id\) return json\(\{ liveLesson: null, history: \[\], unassigned: true \}\)/);
});

test('THINK renderer has a safe fallback before optional sample configuration is loaded', () => {
  assert.match(think, /window\.APP_CONFIG\?\.LESSONS \|\| \[\]/);
  assert.match(index, /<script src="js\/config\.js"><\/script>/);
});
