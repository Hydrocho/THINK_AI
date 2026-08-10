import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const teacher = fs.readFileSync(new URL('../js/modules/teacherAdmin.js', import.meta.url), 'utf8');
const view = fs.readFileSync(new URL('../views/teacherAdminView.html', import.meta.url), 'utf8');
const classDetail = teacher.slice(
  teacher.indexOf('openClassDetailSubView: async function'),
  teacher.indexOf('renderClassOperations: async function')
);

test('class detail renders every published project in its own lesson section', () => {
  assert.match(classDetail, /const activeProjects = publishedProjects\.length/);
  assert.match(classDetail, /class-project-lesson-section/);
  assert.match(classDetail, /projectId: project\.id/);
  assert.doesNotMatch(classDetail, /const attachedProject = publishedProjects\[0\]/);
});

test('class detail puts the class name in the navigation bar and omits the project summary card', () => {
  assert.match(classDetail, /getElementById\('teacherBreadcrumb'\)/);
  assert.match(classDetail, /navigation\.operation\.breadcrumb} ›/);
  assert.doesNotMatch(classDetail, /학생 게시 수업 프로젝트/);
  assert.doesNotMatch(view, /id="classDetailTitle"/);
});
