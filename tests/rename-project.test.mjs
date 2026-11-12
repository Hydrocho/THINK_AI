import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('owner renames project and linked class title atomically', async () => {
  const db=new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create function auth.uid() returns uuid language sql as $$select current_setting('test.actor')::uuid$$;
      create table projects(id uuid primary key, author_id uuid, title text, updated_at timestamptz);
      create table profiles(id uuid, role text, approval_status text);
      create table class_projects(source_project_id uuid, title text);
      set test.actor='00000000-0000-0000-0000-000000000001';
      insert into profiles values(auth.uid(),'teacher','approved');
      insert into projects values(auth.uid(),auth.uid(),'Original',now());
      insert into class_projects values(auth.uid(),'Original');`);
    await db.exec(await readFile(new URL('../supabase/migrations/20261112000000_rename_project.sql',import.meta.url),'utf8'));
    const rename=(old,title)=>db.query("select public.rename_teaching_project('00000000-0000-0000-0000-000000000001',$1,$2)",[old,title]);
    await assert.rejects(rename('Original',' '));
    await rename('Original',"  Tom's lesson  ");
    await assert.rejects(rename('Original','Stale'));
    await db.exec("set test.actor='00000000-0000-0000-0000-000000000002'; insert into profiles values(auth.uid(),'teacher','approved')");
    await assert.rejects(rename("Tom's lesson",'Other'));
    assert.equal((await db.query('select title from projects')).rows[0].title,"Tom's lesson");
    assert.equal((await db.query('select title from class_projects')).rows[0].title,"Tom's lesson");
  } finally { await db.close(); }
});
