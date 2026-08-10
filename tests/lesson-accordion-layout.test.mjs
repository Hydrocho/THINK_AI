import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const stylesheet = fs.readFileSync(new URL('../styles/main.css', import.meta.url), 'utf8');
const lessonTemplate = fs.readFileSync(new URL('../js/modules/teacherAdmin.js', import.meta.url), 'utf8');
const projectClient = fs.readFileSync(new URL('../js/supabase-client.js', import.meta.url), 'utf8');
const projectFunction = fs.readFileSync(new URL('../supabase/functions/manage-class-projects/index.ts', import.meta.url), 'utf8');

test('lesson accordion uses compact spacing and stacks its title fields on narrow screens', () => {
  assert.match(stylesheet, /\.lesson-accordion-header\s*\{[^}]*padding:\s*12px 16px;/s);
  assert.match(stylesheet, /\.lesson-accordion-body\s*\{[^}]*padding:\s*12px 16px !important;/s);
  assert.match(stylesheet, /@media \(max-width:\s*720px\)\s*\{[\s\S]*\.lesson-meta-row\s*\{\s*grid-template-columns:\s*1fr !important;/s);
});

test('lesson editor keeps metadata, question, THINK stages, and save action in four compact rows', () => {
  assert.match(lessonTemplate, /class="lesson-compact-form"/);
  assert.match(lessonTemplate, /class="lesson-meta-row"/);
  assert.match(lessonTemplate, /class="lesson-question-row"/);
  assert.match(lessonTemplate, /class="lesson-think-row"/);
  assert.match(lessonTemplate, /class="lesson-think-options"/);
  assert.match(stylesheet, /\.lesson-think-row\s*\{[^}]*align-items:\s*center;/s);
});

test('lesson editor shows each selected stage with its full instructional label without a THINK heading', () => {
  assert.doesNotMatch(lessonTemplate, /lesson-row-label">THINK/);
  assert.match(lessonTemplate, /T - 나의 처음 생각/);
  assert.match(lessonTemplate, /H - 친구와 생각 나누기/);
  assert.match(lessonTemplate, /I - 인공지능과 생각 넓히기/);
  assert.match(lessonTemplate, /N - 비판적으로 따져보기/);
  assert.match(lessonTemplate, /K - 나의 최종 생각/);
});

test('lesson editor keeps AI response mode and question limit together below the core question', () => {
  assert.match(lessonTemplate, /class="lesson-ai-settings-row"/);
  assert.match(lessonTemplate, /id="edit-ai-mode-\$\{l\.id\}"/);
  assert.match(lessonTemplate, /THOUGHT_PROVOKING/);
  assert.match(lessonTemplate, /GENERAL/);
  assert.match(stylesheet, /\.lesson-ai-settings-row\s*\{/);
  assert.match(projectClient, /aiResponseMode: l\.aiResponseMode \|\| l\.ai_response_mode \|\| "THOUGHT_PROVOKING"/);
  assert.match(projectFunction, /ai_response_mode:x\.aiResponseMode\|\|"THOUGHT_PROVOKING"/);
});

test('new lesson form uses the same compact editor rows as an existing lesson', () => {
  assert.match(lessonTemplate, /box\.className = 'new-lesson-compact-card'/);
  assert.match(lessonTemplate, /class="lesson-compact-form"/);
  assert.match(lessonTemplate, /class="lesson-meta-row"/);
  assert.match(lessonTemplate, /class="lesson-question-row"/);
  assert.match(lessonTemplate, /class="lesson-ai-settings-row"/);
  assert.match(lessonTemplate, /class="lesson-think-row"/);
});
