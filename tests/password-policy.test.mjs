import assert from 'node:assert/strict';
import test from 'node:test';
import { validateStudentNewPassword } from '../js/modules/passwordPolicy.js';

test('accepts a password with six or more characters that is not the initial password', () => {
  assert.deepEqual(validateStudentNewPassword('123456'), { valid: true, message: '' });
});

test('rejects a password shorter than six characters', () => {
  assert.deepEqual(validateStudentNewPassword('12345'), {
    valid: false,
    message: '새 비밀번호는 6자 이상이어야 합니다.'
  });
});

test('rejects the initial password as a replacement password', () => {
  assert.deepEqual(validateStudentNewPassword('000000'), {
    valid: false,
    message: '초기 비밀번호와 다른 비밀번호를 입력해 주세요.'
  });
});
