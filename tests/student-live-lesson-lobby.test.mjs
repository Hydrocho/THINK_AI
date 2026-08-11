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
const accountFunction = fs.readFileSync(new URL('../supabase/functions/manage-student-accounts/index.ts', import.meta.url), 'utf8');
const studentClassPath = new URL('../supabase/functions/_shared/student-class.ts', import.meta.url);
const componentLoader = fs.readFileSync(new URL('../js/componentLoader.js', import.meta.url), 'utf8');

test('student lobby presents class activities instead of a live session', () => {
  assert.match(lobbyView, /id="lobbyClassLessonsContainer"/);
  assert.doesNotMatch(lobbyView, /id="lblWelcomeStudent"/);
  assert.doesNotMatch(lobbyView, /반갑습니다/);
  assert.doesNotMatch(lobbyView, /inputPinCode|PIN 번호/);
  assert.doesNotMatch(lobbyView, /실시간|라이브|지금 참여|현재 열린 수업/);
  assert.match(lobby, /fetchStudentClassLessons/);
  assert.match(lobby, /renderSubjectClasses/);
  assert.match(lobby, /enterSubjectClass/);
  assert.doesNotMatch(lobby, /fetchStudentLiveLesson|renderLiveLesson|enterLiveLesson|liveLesson|현재 열린 수업|renderClassLessons|enterClassLesson/);
  assert.doesNotMatch(app, /enterActiveLesson/);
  assert.match(app, /lesson\.thinkStageAccess \|\| lesson\.think_stage_access/);
  assert.match(app, /window\.AppState\s*=\s*state/);
});

test('student class lesson APIs do not depend on class sessions', () => {
  assert.doesNotMatch(studentLessons, /class_sessions|liveLesson|sessionId/);
  assert.doesNotMatch(responseFunction, /class_sessions/);
  assert.match(studentLessons, /class_projects/);
  assert.match(studentLessons, /lessons/);
  assert.match(responseFunction, /source_version_id/);
  assert.match(responseFunction, /access_mode !== "writable"/);
});

test('student class project authorization uses existence lookup, reports lookup errors, and defaults missing stages to hidden', () => {
  assert.match(responseFunction, /const \{ data: lesson, error: lessonError \}/);
  assert.match(responseFunction, /if \(lessonError\) return json\(\{ error: lessonError\.message \}, 400\)/);
  assert.match(responseFunction, /const \{ data: classProjects, error: classProjectError \}/);
  assert.match(responseFunction, /if \(classProjectError\) return json\(\{ error: classProjectError\.message \}, 400\)/);
  assert.match(responseFunction, /\.eq\("source_version_id", lesson\.project_version_id\)/);
  assert.doesNotMatch(responseFunction, /\.eq\("source_version_id", lesson\.project_version_id\)\s*\.maybeSingle\(\)/);
  assert.match(studentLessons, /const stageCodes = \["T", "H", "I", "N", "K"\]/);
  assert.match(studentLessons, /thinkStageAccess: stageAccessByClassLesson\.get\(`\$\{classroom\.id\}:\$\{lesson\.id\}`\)\s*\|\|\s*Object\.fromEntries\(stageCodes\.map\(stage => \[stage, "hidden"\]\)\)/);
});

test('student APIs use the authenticated student account and retain final submission state', () => {
  assert.match(studentLessons, /auth_user_id/);
  assert.doesNotMatch(studentLessons, /think_stage_responses|submitted_at/);
  assert.match(responseFunction, /auth_user_id/);
  assert.match(responseFunction, /submitted_at/);
});

test('teacher and client flows do not expose lesson sessions', () => {
  const migrations = fs.readdirSync(new URL('../supabase/migrations/', import.meta.url));
  const migrationName = migrations.find(name => name.includes('drop_class_sessions'));

  assert.doesNotMatch(projectFunction, /open_lesson|close_lesson|class_sessions/);
  assert.doesNotMatch(accountFunction, /class_sessions/);
  assert.doesNotMatch(client, /openClassLesson|closeClassLesson|class_sessions/);
  assert.doesNotMatch(teacherAdmin, /class_sessions|toggleClassLessonSession/);
  assert.match(client, /fetchStudentClassLessons:\s*async function/);
  assert.ok(migrationName, 'expected a drop_class_sessions migration');
  const dropSessionsMigration = fs.readFileSync(new URL(`../supabase/migrations/${migrationName}`, import.meta.url), 'utf8');
  assert.match(dropSessionsMigration, /^DROP TABLE IF EXISTS public\.class_sessions;\s*$/i);
});

test('teacher class details render every attached project and retain stage controls', () => {
  assert.doesNotMatch(teacherAdmin, /const attachedCP = classProjects\?\.\[0\]/);
  assert.match(teacherAdmin, /const activeProjects = \(classProjects \|\| \[\]\)\.flatMap\(classProject => classProject\.projects \? \[/);
  assert.match(teacherAdmin, /classProjectId: classProject\.id/);
  assert.match(teacherAdmin, /project\.project_versions\?\.find\(version => version\.id === project\.sourceVersionId\)/);
  assert.match(teacherAdmin, /class_lesson_stage_access/);
  assert.match(teacherAdmin, /TeacherAdminModule\.setClassStageAccess/);
  assert.match(teacherAdmin, /TeacherAdminModule\.toggleClassLessonThinkStage/);
  assert.match(teacherAdmin, /display:\s*\${isExpanded\s*\?\s*'block'\s*:\s*'none'}/);
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

test('active application sources do not reference class sessions', () => {
  const activeSources = [projectFunction, accountFunction, client, teacherAdmin, studentLessons, responseFunction].join('\n');

  assert.doesNotMatch(activeSources, /class_sessions/);
});

test('THINK renderer and view use the same content container', () => {
  assert.match(thinkView, /id="stepContentContainer"/);
  assert.match(think, /getElementById\('stepContentContainer'\)/);
});

test('student lesson and response APIs use the class derived from the student number', () => {
  assert.match(studentLessons, /parseStudentClass/);
  assert.doesNotMatch(studentLessons, /resolveStudentClass/);
  assert.match(responseFunction, /parseStudentClass/);
  assert.doesNotMatch(responseFunction, /resolveStudentClass/);
  assert.doesNotMatch(studentLessons, /student\.class_id/);
  assert.doesNotMatch(responseFunction, /student\.class_id/);
  assert.match(studentLessons, /parsedClass/);
});

test('student response authorization resolves the active attached subject class from the lesson', () => {
  assert.match(responseFunction, /from\("class_projects"\)/);
  assert.match(responseFunction, /classes!inner\(id,grade_number,class_number,active_lesson_plan_id\)/);
  assert.match(responseFunction, /\.eq\("source_version_id", lesson\.project_version_id\)/);
  assert.match(responseFunction, /\.eq\("classes\.grade_number", parsedClass\.grade\)/);
  assert.match(responseFunction, /\.eq\("classes\.class_number", parsedClass\.classNumber\)/);
  assert.match(responseFunction, /\.eq\("classes\.active_lesson_plan_id", body\.lessonPlanId\)/);
  assert.match(responseFunction, /classProjects\?\.length !== 1/);
  assert.match(responseFunction, /const classId = classProject\.class_id/);
  assert.match(responseFunction, /from\("class_lesson_stage_access"\)[\s\S]*\.eq\("class_id", classId\)[\s\S]*access\?\.access_mode !== "writable"/);
});

test('THINK renderer has a safe fallback before optional sample configuration is loaded', () => {
  assert.match(think, /window\.APP_CONFIG\?\.LESSONS \|\| \[\]/);
  assert.match(index, /<script src="js\/config\.js"><\/script>/);
});

test('student class is derived from a five-digit student number', () => {
  const studentClass = fs.readFileSync(studentClassPath, 'utf8');
  assert.match(studentClass, /export function parseStudentClass/);
  assert.match(studentClass, /\/\^\\d\{5\}\$\//);
  assert.match(studentClass, /grade_number/);
  assert.match(studentClass, /class_number/);
  assert.match(studentClass, /ambiguous_class/);
});

test('class and student creation do not persist student class membership', () => {
  const migrations = fs.readdirSync(new URL('../supabase/migrations/', import.meta.url));
  const migrationName = migrations.find(name => name.includes('retire_student_class_membership'));
  assert.ok(migrationName);
  const membershipMigration = fs.readFileSync(new URL(`../supabase/migrations/${migrationName}`, import.meta.url), 'utf8');

  assert.doesNotMatch(accountFunction, /insert\(\{ class_id: classId/);
  assert.doesNotMatch(accountFunction, /update\(\{ class_id: newClass\.id \}\)/);
  assert.doesNotMatch(teacherAdmin, /update\(\{ class_id: newClass\.id \}\)/);
  const createClassSource = client.slice(client.indexOf('createClass: async function'), client.indexOf('deleteClassWithTargetData: async function'));
  assert.doesNotMatch(createClassSource, /Direct DB fallback/);
  assert.match(membershipMigration, /update public\.student_accounts\s+set class_id = null/i);
});

test('class project connection uses only link-enabled projects and exposes a direct empty-state action', () => {
  assert.match(teacherAdmin, /filter\(project => project\.is_published\)/);
  assert.match(teacherAdmin, /프로젝트 연결하기/);
  assert.match(teacherAdmin, /학급 연결 가능/);
  assert.match(teacherAdmin, /aria-pressed/);
  assert.doesNotMatch(teacherAdmin, /학생 게시/);
});

test('project link toggle updates its card without rerendering the full project list', () => {
  const toggleStart = teacherAdmin.indexOf('setProjectPublished: async function');
  const toggleEnd = teacherAdmin.indexOf('moveProject:', toggleStart);
  const toggleSource = teacherAdmin.slice(toggleStart, toggleEnd);
  assert.doesNotMatch(toggleSource, /renderProjects\(/);
  assert.match(teacherAdmin, /data-project-id="\$\{p\.id\}"/);
  assert.equal((teacherAdmin.match(/attachProjectPrompt\s*[:=]/g) || []).length, 1);
});

test('class THINK stage access saves inline without recreating the class detail view', () => {
  const setterStart = teacherAdmin.indexOf('TeacherAdminModule.setClassStageAccess = async function');
  const setterEnd = teacherAdmin.indexOf('TeacherAdminModule.expandedClassLessonIds', setterStart);
  const setterSource = teacherAdmin.slice(setterStart, setterEnd);

  assert.doesNotMatch(setterSource, /openClassDetailSubView\(classId\)/);
  assert.match(setterSource, /data-stage-access-lesson-id/);
  assert.match(setterSource, /data-stage-access-stage-code/);
  assert.match(setterSource, /data-stage-access-summary/);
});

test('class creation requires a trimmed subject and scopes duplicate subjects to the owning teacher', () => {
  const createClassStart = accountFunction.indexOf('if (body.action === "create_class")');
  const createClassEnd = accountFunction.indexOf('if (body.action === "delete_class")', createClassStart);
  const createClassSource = accountFunction.slice(createClassStart, createClassEnd);

  assert.match(createClassSource, /String\(body\.subjectName \|\| ""\)\.trim\(\)/);
  assert.match(createClassSource, /if \(!subjectName\)/);
  assert.match(createClassSource, /subject_name: subjectName/);
  assert.match(createClassSource, /from\("classes"\).*eq\("teacher_id", teacherId\).*eq\("grade_number", grade\).*eq\("class_number", classNum\).*eq\("subject_name", subjectName\)/s);
  assert.match(createClassSource, /이미 등록되어 있는 과목 학급/);
});

test('component loader waits for legacy service workers to unregister before reloading views', () => {
  assert.match(componentLoader, /await Promise\.all\(registrations\.map\(registration => registration\.unregister\(\)\)\)/);
  assert.match(componentLoader, /sessionStorage\.getItem\('legacy-service-worker-cleared'\)/);
  assert.match(componentLoader, /window\.location\.reload\(\)/);
});

test('active class lesson action verifies teacher ownership and the lesson connection before updating', () => {
  const actionStart = projectFunction.indexOf('if(b.action==="set_active_class_lesson")');
  const actionEnd = projectFunction.indexOf('if(b.action==="', actionStart + 1);
  const actionSource = projectFunction.slice(actionStart, actionEnd);

  assert.notEqual(actionStart, -1, 'expected set_active_class_lesson action');
  assert.match(actionSource, /from\("classes"\).*eq\("id",b\.classId\).*eq\("teacher_id",userId\)/s);
  assert.match(actionSource, /from\("lesson_plans"\).*eq\("id",b\.lessonId\)/s);
  assert.match(actionSource, /from\("class_projects"\).*eq\("class_id",b\.classId\).*eq\("source_version_id",lesson\.project_version_id\)/s);
  assert.match(actionSource, /active_lesson_plan_id:b\.lessonId\|\|null/);
});

test('subject classes migration preserves existing rows and references active lesson plans', () => {
  const migrations = fs.readdirSync(new URL('../supabase/migrations/', import.meta.url));
  const migrationName = migrations.find(name => name.includes('subject_classes_and_active_lesson'));

  assert.ok(migrationName, 'expected subject_classes_and_active_lesson migration');
  const migration = fs.readFileSync(new URL(`../supabase/migrations/${migrationName}`, import.meta.url), 'utf8');
  assert.match(migration, /subject_name\s+text\s+not null\s+default\s+'미지정'/i);
  assert.match(migration, /active_lesson_plan_id\s+uuid\s+references\s+public\.lesson_plans\s*\(id\)\s+on delete set null/i);
  assert.match(migration, /unique index[^;]+\(\s*teacher_id\s*,\s*grade_number\s*,\s*class_number\s*,\s*subject_name\s*\)/i);
});

test('student lesson API returns every matching subject class and only active lessons', () => {
  assert.match(studentLessons, /parseStudentClass/);
  assert.doesNotMatch(studentLessons, /resolveStudentClass/);
  assert.match(studentLessons, /from\("classes"\)/);
  assert.match(studentLessons, /subject_name/);
  assert.match(studentLessons, /active_lesson_plan_id/);
  assert.match(studentLessons, /subjectClasses/);
  assert.match(studentLessons, /\.in\("id", activeLessonIds\)/);
  assert.doesNotMatch(studentLessons, /think_stage_responses/);
  assert.doesNotMatch(studentLessons, /historyByLesson|history:/);
});

test('student lobby renders one subject card with entry only for its active lesson', () => {
  assert.match(lobby, /result\.subjectClasses \|\| \[\]/);
  assert.match(lobby, /renderSubjectClasses/);
  assert.match(lobby, /subjectClass\.subjectName/);
  assert.match(lobby, /subjectClass\.activeLesson/);
  assert.match(lobby, /수업 준비 중/);
  assert.match(lobby, />입장하기</);
  assert.doesNotMatch(lobby, /renderHistory|classLessons/);
});

test('entering a subject class exposes its active lesson as the sole lesson plan', () => {
  const enterStart = lobby.indexOf('enterSubjectClass: function');
  const enterEnd = lobby.indexOf('exitToLobby: function', enterStart);
  const enterSource = lobby.slice(enterStart, enterEnd);

  assert.notEqual(enterStart, -1, 'expected an active subject-class entry method');
  assert.match(enterSource, /if \(!subjectClass\?\.activeLesson\) return/);
  assert.match(enterSource, /state\.activeClassId = subjectClass\.classId/);
  assert.match(enterSource, /state\.activeLessonPlans = \[subjectClass\.activeLesson\]/);
  assert.match(enterSource, /window\.App\.selectLesson\(0\)/);
});

test('student lobby hides previous lesson history', () => {
  assert.doesNotMatch(lobbyView, /lobbyHistoryCard|lobbyHistoryContainer|내 생각 기록|내가 참여한 활동/);
  assert.doesNotMatch(lobby, /renderHistory|result\.history/);
});
