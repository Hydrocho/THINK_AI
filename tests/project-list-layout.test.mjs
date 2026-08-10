import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const teacher = fs.readFileSync(new URL('../js/modules/teacherAdmin.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../styles/main.css', import.meta.url), 'utf8');
test('project cards use a compact single column and summarize lesson titles', () => {
  assert.match(css, /#projectDesignList \.project-card-grid\s*\{\s*grid-template-columns:\s*1fr/s);
  assert.match(teacher, /project-lesson-summary/);
  assert.match(teacher, /slice\(0, 3\)/);
  assert.match(teacher, /moveProject\(event, '\$\{p\.id\}', -1\)/);
  assert.match(teacher, /moveProject\(event, '\$\{p\.id\}', 1\)/);
});
