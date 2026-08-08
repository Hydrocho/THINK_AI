import test from 'node:test';
import assert from 'node:assert/strict';

global.window = {};
await import('../js/modules/modalService.js');

test('required prompt input is trimmed and rejects blank values', () => {
  assert.equal(window.ModalService.normalizeInput('  프로젝트 A  ', true), '프로젝트 A');
  assert.equal(window.ModalService.normalizeInput('   ', true), null);
  assert.equal(window.ModalService.normalizeInput('   ', false), '');
});

test('selection only accepts a listed identifier', () => {
  const options = [{ value: 'project-1', label: '기후 위기' }];
  assert.deepEqual(window.ModalService.findOption(options, 'project-1'), options[0]);
  assert.equal(window.ModalService.findOption(options, 'unknown'), null);
});
