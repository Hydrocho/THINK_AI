-- Shared student accounts and master-only teacher approval.

create schema if not exists private;
revoke all on schema private from public;

update public.profiles
set approval_status = 'rejected'
where approval_status = 'blocked';

alter table public.profiles
  drop constraint if exists profiles_approval_status_check;
alter table public.profiles
  add constraint profiles_approval_status_check
  check (approval_status in ('pending', 'approved', 'rejected'));

alter table public.student_accounts
  add column if not exists student_name text not null default '';

alter table public.student_accounts
  drop constraint if exists unique_class_student_number;
alter table public.student_accounts
  add constraint unique_student_account_number unique (student_number);

create or replace function private.is_approved_teacher()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role in ('teacher', 'admin')
      and approval_status = 'approved'
  );
$$;

create or replace function private.is_master_teacher()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'admin'
      and approval_status = 'approved'
  );
$$;

revoke all on function private.is_approved_teacher() from public;
revoke all on function private.is_master_teacher() from public;
grant usage on schema private to authenticated;
grant execute on function private.is_approved_teacher() to authenticated;
grant execute on function private.is_master_teacher() to authenticated;

drop policy if exists "Allow authenticated read profiles" on public.profiles;
drop policy if exists "Allow authenticated update profiles" on public.profiles;
create policy "teachers read own profile and masters read teacher profiles"
  on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or ((select private.is_master_teacher()) and role = 'teacher')
  );

create policy "approved teachers read shared classes"
  on public.classes for select to authenticated
  using ((select private.is_approved_teacher()));

create policy "approved teachers read shared students"
  on public.student_accounts for select to authenticated
  using ((select private.is_approved_teacher()));

drop policy if exists "Teacher read class messages" on public.messages;
create policy "teachers read messages for their own activities"
  on public.messages for select to authenticated
  using (
    exists (
      select 1 from public.activities
      where activities.id = messages.activity_id
        and activities.teacher_id = (select auth.uid())
    )
  );

create policy "teachers read submissions for their own activities"
  on public.submissions for select to authenticated
  using (
    exists (
      select 1 from public.activities
      where activities.id = submissions.activity_id
        and activities.teacher_id = (select auth.uid())
    )
  );

create policy "teachers read stage state for their own activities"
  on public.activity_stage_states for select to authenticated
  using (
    exists (
      select 1 from public.activities
      where activities.id = activity_stage_states.activity_id
        and activities.teacher_id = (select auth.uid())
    )
  );

create policy "teachers read evidence for their own activities"
  on public.ai_evidence for select to authenticated
  using (
    exists (
      select 1 from public.activities
      where activities.id = ai_evidence.activity_id
        and activities.teacher_id = (select auth.uid())
    )
  );

create policy "teachers read assessments for their own activities"
  on public.teacher_assessments for select to authenticated
  using (
    teacher_id = (select auth.uid())
    and exists (
      select 1 from public.activities
      where activities.id = teacher_assessments.activity_id
        and activities.teacher_id = (select auth.uid())
    )
  );
