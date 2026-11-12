import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const source = stripTypeScriptTypes(readFileSync(new URL('../supabase/functions/manage-student-accounts/index.ts', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, ''));

function setup(options = {}) {
  const calls = [];
  let handler;
  const student = options.student === undefined ? { id: 'student-id', auth_user_id: 'auth-id' } : options.student;
  const admin = {
    from(table) {
      let update;
      const query = {
        select() { return query; },
        eq(column, value) { calls.push({ table, column, value }); return query; },
        update(value) { update = value; calls.push({ update: value }); return query; },
        async single() { return query.maybeSingle(); },
        async maybeSingle() {
          if (table === 'profiles') return { data: options.profile || { role: 'teacher', approval_status: 'approved' } };
          return update
            ? { data: options.flagError ? null : student, error: options.flagError }
            : { data: student, error: options.lookupError };
        },
      };
      return query;
    },
    auth: { admin: { async updateUserById(id, attributes) {
      calls.push({ authId: id, attributes });
      return { error: options.authError };
    } } },
  };
  vm.runInNewContext(source, {
    Response,
    Deno: { env: { get: key => key } },
    createClient: (_url, key) => key === 'SUPABASE_SERVICE_ROLE_KEY' ? admin : {
      auth: { getUser: async () => ({ data: { user: options.loggedOut ? null : { id: 'teacher-id' } } }) },
    },
    serve: callback => { handler = callback; },
  });
  return {
    calls,
    async reset(body = { action: 'reset_password', studentId: 'student-id' }) {
      const response = await handler(new Request('https://example.test', {
        method: 'POST', headers: { Authorization: 'Bearer test' }, body: JSON.stringify(body),
      }));
      return { status: response.status, body: await response.json() };
    },
  };
}

test('reset uses the linked Auth ID, forces 000000, and requires a password change', async () => {
  const app = setup();
  assert.deepEqual(await app.reset({ action: 'reset_password', studentId: 'student-id', password: 'ignored' }), {
    status: 200, body: { success: true },
  });
  const mutations = JSON.parse(JSON.stringify(app.calls.filter(call => call.authId || call.update)));
  assert.deepEqual(mutations, [
    { authId: 'auth-id', attributes: { password: '000000' } },
    { update: { must_change_password: true } },
  ]);
  assert.ok(app.calls.some(call => call.table === 'student_accounts' && call.column === 'id' && call.value === 'student-id'));
});

for (const [name, options, status] of [
  ['signed-out caller', { loggedOut: true }, 401],
  ['student caller', { profile: { role: 'student', approval_status: 'approved' } }, 403],
  ['unapproved teacher', { profile: { role: 'teacher', approval_status: 'pending' } }, 403],
  ['missing student', { student: null }, 404],
  ['missing Auth link', { student: { id: 'student-id', auth_user_id: null } }, 409],
  ['lookup failure', { lookupError: { message: 'lookup failed' } }, 400],
]) {
  test(`reset rejects ${name} without mutations`, async () => {
    const app = setup(options);
    assert.equal((await app.reset()).status, status);
    assert.equal(app.calls.some(call => call.authId || call.update), false);
  });
}

test('reset rejects a missing student ID', async () => {
  const app = setup();
  assert.equal((await app.reset({ action: 'reset_password' })).status, 400);
  assert.equal(app.calls.some(call => call.table === 'student_accounts'), false);
});

test('Auth failure does not set the password-change flag', async () => {
  const app = setup({ authError: { message: 'Auth failed' } });
  assert.deepEqual(await app.reset(), { status: 400, body: { error: 'Auth failed' } });
  assert.equal(app.calls.some(call => call.update), false);
});

test('flag persistence failure is reported instead of success', async () => {
  const app = setup({ flagError: { message: 'flag failed' } });
  const result = await app.reset();
  assert.equal(result.status, 500);
  assert.match(result.body.error, /다시.*초기화/);
});
