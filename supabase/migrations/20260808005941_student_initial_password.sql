alter table public.student_accounts
  add column if not exists must_change_password boolean not null default false;
