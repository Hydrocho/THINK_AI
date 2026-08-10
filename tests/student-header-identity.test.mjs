import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const authSource = await readFile(new URL('../js/modules/auth.js', import.meta.url), 'utf8');

function createElement() {
  return { className: '', innerText: '', style: {} };
}

function loadAuthModule() {
  const elements = new Map([
    ['userRoleTag', createElement()],
    ['lblUserName', createElement()],
    ['lblStudentNumber', createElement()],
    ['btnLogout', createElement()],
    ['userNavArea', createElement()]
  ]);
  const context = {
    window: {},
    document: { getElementById: id => elements.get(id) || createElement() }
  };
  context.window = context;
  vm.runInNewContext(authSource, context);
  return { elements, auth: context.AuthModule };
}

test('student header shows the raw number immediately before the student name', () => {
  const { elements, auth } = loadAuthModule();
  const state = { studentData: {} };

  auth.prepareStudent(state, '30101', '홍길동');

  assert.equal(elements.get('userRoleTag').style.display, 'none');
  assert.equal(elements.get('lblStudentNumber').innerText, '30101');
  assert.equal(elements.get('lblStudentNumber').style.display, 'inline');
  assert.equal(elements.get('lblUserName').innerText, '홍길동');
});
