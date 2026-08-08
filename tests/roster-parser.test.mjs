import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../js/modules/rosterParser.js';

test('parses a tab-separated Excel row into a student number', () => {
  const [row] = parse('3\t2\t1\t김하늘', new Set());
  assert.deepEqual({ studentNumber: row.studentNumber, name: row.name, valid: row.valid, reason: row.reason }, { studentNumber: '30201', name: '김하늘', valid: true, reason: '' });
});

test('reports a missing name', () => {
  assert.equal(parse('3  2  1', new Set())[0].reason, '이름이 없습니다.');
});

test('reports pasted and existing duplicate student numbers', () => {
  const rows = parse('3,2,1,김하늘\n3,2,1,이준호\n3,2,2,박서연', new Set(['30202']));
  assert.equal(rows[1].reason, '붙여넣기 안에서 학번이 중복되었습니다.');
  assert.equal(rows[2].reason, '이미 등록된 학번입니다.');
});
