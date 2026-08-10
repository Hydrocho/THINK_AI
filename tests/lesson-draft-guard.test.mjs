import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const teacherModule = fs.readFileSync(new URL('../js/modules/teacherAdmin.js', import.meta.url), 'utf8');
const stylesheet = fs.readFileSync(new URL('../styles/main.css', import.meta.url), 'utf8');

test('lesson editor tracks dirty drafts and disables save until a change occurs', () => {
  assert.match(teacherModule, /initializeLessonDraftTracking/);
  assert.match(teacherModule, /isLessonDraftDirty/);
  assert.match(teacherModule, /class="btn btn-primary lesson-save-button" disabled/);
  assert.match(stylesheet, /\.lesson-save-button:disabled/);
});

test('lesson navigation asks before discarding unsaved edits', () => {
  assert.match(teacherModule, /confirmDiscardLessonChanges/);
  assert.match(teacherModule, /if \(!this\.confirmDiscardLessonChanges\(\)\) return;/);
  assert.match(teacherModule, /addEventListener\('beforeunload'/);
});

test('rerendering lessons clears draft records tied to superseded lesson IDs', () => {
  assert.match(teacherModule, /renderLessonAccordionList = function \(lessons\) \{\s*this\.lessonDrafts\.clear\(\);/s);
});
