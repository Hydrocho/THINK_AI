import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;

test('background migration preserves old lessons and old clients, enforces ownership and permits clearing',async()=>{
  const db=new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create schema auth;
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.actor',true),'')::uuid $$;
      create table profiles(id uuid,role text,approval_status text);
      create table projects(id uuid,author_id uuid);
      create table project_versions(id uuid,project_id uuid);
      create table lesson_plans(id uuid,project_version_id uuid,title text,core_question text,ai_response_mode text,ai_question_limit int,think_stages text[]);
      insert into profiles values('${id(1)}','teacher','approved');
      insert into projects values('${id(2)}','${id(1)}');
      insert into project_versions values('${id(3)}','${id(2)}');
      insert into lesson_plans values('${id(4)}','${id(3)}','차시','기존 긴 질문. 그대로 남는가?','GENERAL',3,array['T']);`);
    await db.exec(read('supabase/migrations/20261112010000_edit_teaching_lesson.sql'));
    await db.exec(read('supabase/migrations/20261121104406_lesson_background.sql'));
    assert.deepEqual((await db.query('select core_question,background_description from lesson_plans')).rows[0],{core_question:'기존 긴 질문. 그대로 남는가?',background_description:''});
    const params=[id(4),'차시','짧은 질문?','GENERAL',3,['T'],'배경 설명'];
    const edit=()=>db.query('select edit_teaching_lesson($1,$2,$3,$4,$5,$6,$7)',params);
    await db.exec(`set test.actor='${id(9)}'`);
    await assert.rejects(edit(),/권한/);
    await db.exec(`set test.actor='${id(1)}'`);
    await edit();
    await db.query('select edit_teaching_lesson($1,$2,$3,$4,$5,$6)',params.slice(0,6));
    assert.equal((await db.query('select background_description from lesson_plans')).rows[0].background_description,'배경 설명');
    params[6]='';await edit();
    assert.equal((await db.query('select background_description from lesson_plans')).rows[0].background_description,'');
    const permissions=await db.query(`select has_function_privilege('anon','public.edit_teaching_lesson(uuid,text,text,text,integer,text[],text)','execute') as anon, has_function_privilege('authenticated','public.edit_teaching_lesson(uuid,text,text,text,integer,text[],text)','execute') as teacher`);
    assert.deepEqual(permissions.rows[0],{anon:false,teacher:true});
  } finally {await db.close();}
});

test('background flows through editor, project copies, student API and AI context',()=>{
  const editor=read('js/modules/teacherAdmin.js');
  assert.ok(editor.includes('edit-background-${l.id}'));
  assert.ok(editor.includes('detailBackgroundDescription'));
  assert.match(editor,/p_background: backgroundDescription/);
  assert.equal((editor.match(/backgroundDescription: l.background_description/g)||[]).length,2);
  assert.match(editor,/backgroundDescription: found/);
  assert.match(read('js/supabase-client.js'),/backgroundDescription: l.backgroundDescription/);
  assert.match(read('supabase/functions/manage-class-projects/index.ts'),/background_description:x.backgroundDescription/);
  assert.match(read('supabase/functions/get-student-lessons/index.ts'),/backgroundDescription: lesson.background_description/);
  assert.match(read('supabase/functions/think-workflow/index.ts'),/배경 설명: \$\{contextLesson.background_description/);
  assert.match(read('supabase/functions/analyze-teacher-stage-responses/index.ts'),/배경 설명: \$\{lesson.background_description/);
});
