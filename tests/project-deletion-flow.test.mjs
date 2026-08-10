import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const client = fs.readFileSync(new URL('../js/supabase-client.js', import.meta.url), 'utf8');
const projectFunction = fs.readFileSync(new URL('../supabase/functions/manage-class-projects/index.ts', import.meta.url), 'utf8');

test('project replacement deletes the superseded project through the authorized project function', () => {
  assert.match(client, /deleteProject: async function \(projectId\) \{\s*return this\.invokeAccountFunction\("manage-class-projects", \{ action: "delete_project", projectId \}\);/s);
  assert.match(projectFunction, /if\(b\.action==="delete_project"\)\{[\s\S]*\.delete\(\)\.eq\("id",b\.projectId\)\.eq\("author_id",userId\)/);
});
