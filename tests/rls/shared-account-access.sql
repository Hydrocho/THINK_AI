-- Break caught: shared students are not available to approved teachers, an
-- unapproved teacher can see them, or a master can read another teacher's lesson.
begin;

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'normal-test@example.invalid', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'master-test@example.invalid', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('33333333-3333-3333-3333-333333333333', 'authenticated', 'authenticated', 'pending-test@example.invalid', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('44444444-4444-4444-4444-444444444444', 'authenticated', 'authenticated', 'other-test@example.invalid', '{}'::jsonb, '{}'::jsonb, now(), now())
on conflict (id) do nothing;

insert into public.profiles (id, role, display_name, email, approval_status)
values
  ('11111111-1111-1111-1111-111111111111', 'teacher', '일반 교사', 'normal-test@example.invalid', 'approved'),
  ('22222222-2222-2222-2222-222222222222', 'admin', '마스터 교사', 'master-test@example.invalid', 'approved'),
  ('33333333-3333-3333-3333-333333333333', 'teacher', '대기 교사', 'pending-test@example.invalid', 'pending'),
  ('44444444-4444-4444-4444-444444444444', 'teacher', '다른 교사', 'other-test@example.invalid', 'approved')
on conflict (id) do update set role = excluded.role, approval_status = excluded.approval_status;

insert into public.classes (id, teacher_id, class_code, grade_number, class_number)
values ('77777777-7777-7777-7777-777777777777', '44444444-4444-4444-4444-444444444444', '992', 9, 92)
on conflict (id) do nothing;

insert into public.student_accounts (id, class_id, student_number, student_name)
values ('55555555-5555-5555-5555-555555555555', '77777777-7777-7777-7777-777777777777', '99201', '공용 학생')
on conflict (id) do nothing;

insert into public.activities (id, teacher_id, title, core_question)
values ('66666666-6666-6666-6666-666666666666', '44444444-4444-4444-4444-444444444444', '다른 교사의 수업', '다른 교사의 질문')
on conflict (id) do nothing;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
do $$
begin
  if (select count(*) from public.student_accounts where id = '55555555-5555-5555-5555-555555555555') <> 1 then raise exception 'approved teacher must read shared students'; end if;
  if (select count(*) from public.activities where id = '66666666-6666-6666-6666-666666666666') <> 0 then raise exception 'normal teacher must not read another teacher activity'; end if;
end $$;

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
do $$
begin
  if (select count(*) from public.student_accounts where id = '55555555-5555-5555-5555-555555555555') <> 1 then raise exception 'master must read shared students'; end if;
  if (select count(*) from public.activities where id = '66666666-6666-6666-6666-666666666666') <> 0 then raise exception 'master must not read another teacher activity'; end if;
end $$;

select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
do $$
begin
  if (select count(*) from public.student_accounts where id = '55555555-5555-5555-5555-555555555555') <> 0 then raise exception 'pending teacher must not read shared students'; end if;
end $$;

rollback;
