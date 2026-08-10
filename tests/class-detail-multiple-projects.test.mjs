import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const teacher = fs.readFileSync(new URL('../js/modules/teacherAdmin.js', import.meta.url), 'utf8');
const view = fs.readFileSync(new URL('../views/teacherAdminView.html', import.meta.url), 'utf8');
const modals = fs.readFileSync(new URL('../views/modalsView.html', import.meta.url), 'utf8');
const client = fs.readFileSync(new URL('../js/supabase-client.js', import.meta.url), 'utf8');
const classDetail = teacher.slice(
  teacher.indexOf('openClassDetailSubView: async function'),
  teacher.indexOf('renderClassOperations: async function')
);

test('class detail renders every published project in its own lesson section', () => {
  assert.match(classDetail, /const activeProjects = \(classProjects \|\| \[\]\)\.flatMap/);
  assert.match(classDetail, /class-project-lesson-section/);
  assert.match(classDetail, /projectId: project\.classProjectId/);
  assert.doesNotMatch(classDetail, /const attachedProject = publishedProjects\[0\]/);
});

test('class detail puts the class name in the navigation bar and omits the project summary card', () => {
  assert.match(classDetail, /getElementById\('teacherBreadcrumb'\)/);
  assert.match(classDetail, /navigation\.operation\.breadcrumb} ›/);
  assert.doesNotMatch(classDetail, /학생 게시 수업 프로젝트/);
  assert.doesNotMatch(view, /id="classDetailTitle"/);
});

test('class creation requires and forwards a trimmed subject name', () => {
  assert.match(modals, /id="inpNewClassSubject"[^>]*required/);

  const submitStart = teacher.indexOf('handleCreateClassSubmit: async function');
  const submitEnd = teacher.indexOf('renderClassManagement: async function', submitStart);
  const submitSource = teacher.slice(submitStart, submitEnd);
  assert.match(submitSource, /getElementById\('inpNewClassSubject'\)\.value\.trim\(\)/);
  assert.match(submitSource, /createClass\(\{ grade, classNumber: classNum, subjectName \}\)/);

  const createStart = client.indexOf('createClass: async function');
  const createEnd = client.indexOf('deleteClassWithTargetData: async function', createStart);
  const createSource = client.slice(createStart, createEnd);
  assert.match(createSource, /createClass: async function \(\{ grade, classNumber, subjectName \}\)/);
  assert.match(createSource, /action: "create_class", grade, classNumber, subjectName/);
});

test('teacher class creation checks duplicate grade class and subject for the signed-in teacher', () => {
  const submitStart = teacher.indexOf('handleCreateClassSubmit: async function');
  const submitEnd = teacher.indexOf('renderClassManagement: async function', submitStart);
  const submitSource = teacher.slice(submitStart, submitEnd);

  assert.match(submitSource, /getUserSession\(\)/);
  assert.match(submitSource, /\.eq\('teacher_id', teacherId\)/);
  assert.match(submitSource, /\.ilike\('subject_name', subjectName\)/);
});

test('teacher class cards and details show the subject and load the active lesson id', () => {
  assert.match(teacher, /subject_name/);
  assert.match(teacher, /active_lesson_plan_id/);
  assert.match(teacher, /escapeHtml\(c\.subject_name/);
  assert.match(classDetail, /cls\.subject_name \|\| '미지정'/);
});

test('class detail has one inline active lesson toggle per lesson', () => {
  assert.match(classDetail, /data-active-class-lesson-id="\$\{l\.id\}"/);
  assert.match(classDetail, /수업 활성화/);
  assert.match(classDetail, /TeacherAdminModule\.setActiveClassLesson/);

  const setterStart = teacher.indexOf('TeacherAdminModule.setActiveClassLesson = async function');
  assert.notEqual(setterStart, -1, 'expected an inline active-class-lesson setter');
  const setterEnd = teacher.indexOf('TeacherAdminModule.', setterStart + 30);
  const setterSource = teacher.slice(setterStart, setterEnd);
  assert.match(setterSource, /SupabaseService\.setActiveClassLesson/);
  assert.match(setterSource, /querySelectorAll\('\[data-active-class-lesson-id\]'\)/);
  assert.doesNotMatch(setterSource, /openClassDetailSubView/);
});
