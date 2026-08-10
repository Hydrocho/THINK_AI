-- Breaks caught: legacy classes lose a usable subject, two teachers cannot own
-- subject classes for the same grade/class, or deleting a lesson leaves a
-- dangling active lesson reference.
begin;

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('a1111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'korean-test@example.invalid', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('a2222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'math-test@example.invalid', '{}'::jsonb, '{}'::jsonb, now(), now())
on conflict (id) do nothing;

insert into public.profiles (id, role, display_name, email, approval_status)
values
  ('a1111111-1111-1111-1111-111111111111', 'teacher', '국어 교사', 'korean-test@example.invalid', 'approved'),
  ('a2222222-2222-2222-2222-222222222222', 'teacher', '수학 교사', 'math-test@example.invalid', 'approved')
on conflict (id) do update set role = excluded.role, approval_status = excluded.approval_status;

insert into public.classes (id, teacher_id, class_code, grade_number, class_number)
values ('c1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'class-2-3', 2, 3);

insert into public.classes (id, teacher_id, class_code, grade_number, class_number, subject_name)
values ('c2222222-2222-2222-2222-222222222222', 'a2222222-2222-2222-2222-222222222222', 'class-2-3', 2, 3, '수학');

do $$
begin
  if (select subject_name from public.classes where id = 'c1111111-1111-1111-1111-111111111111') <> '미지정' then
    raise exception 'legacy-compatible subject default must be 미지정';
  end if;
  if (select count(*) from public.classes where grade_number = 2 and class_number = 3 and id in ('c1111111-1111-1111-1111-111111111111', 'c2222222-2222-2222-2222-222222222222')) <> 2 then
    raise exception 'different teachers must be able to own subject classes for the same grade and class';
  end if;
end $$;

insert into public.projects (id, author_id, title)
values ('d1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', '국어 프로젝트');

insert into public.project_versions (id, project_id, version_number, created_by)
values ('e1111111-1111-1111-1111-111111111111', 'd1111111-1111-1111-1111-111111111111', 1, 'a1111111-1111-1111-1111-111111111111');

insert into public.lesson_plans (id, project_version_id, lesson_order, title, core_question)
values ('f1111111-1111-1111-1111-111111111111', 'e1111111-1111-1111-1111-111111111111', 1, '1차시', '핵심 질문');

update public.classes
set active_lesson_plan_id = 'f1111111-1111-1111-1111-111111111111'
where id = 'c1111111-1111-1111-1111-111111111111';

delete from public.lesson_plans where id = 'f1111111-1111-1111-1111-111111111111';

do $$
begin
  if (select active_lesson_plan_id from public.classes where id = 'c1111111-1111-1111-1111-111111111111') is not null then
    raise exception 'deleting an active lesson must clear the class reference';
  end if;
end $$;

rollback;
