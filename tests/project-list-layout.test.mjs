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

test('class link control uses a text label and an accessible visual switch', () => {
  assert.match(teacher, /project-link-status/);
  assert.match(teacher, /project-link-switch/);
  assert.match(css, /\.project-link-switch\s*\{[\s\S]*border-radius:\s*999px/);
  assert.match(css, /\.project-link-switch\.is-enabled[\s\S]*background:\s*#00c853/);
  assert.match(css, /\.project-link-switch::after/);
});

test('class project connection action is not hidden by legacy styling', () => {
  assert.doesNotMatch(css, /button\[onclick\*="attachProjectToActiveClassPrompt"\]\s*\{\s*display:\s*none !important/);
});
