alter table public.projects add column if not exists is_published boolean not null default false;
alter table public.lesson_plans add column if not exists student_access_mode text not null default 'read_only'
  check (student_access_mode in ('hidden', 'read_only', 'writable'));

update public.projects set is_published = false where is_published is null;
update public.lesson_plans set student_access_mode = 'read_only' where student_access_mode is null;
