create table if not exists public.class_lesson_stage_access (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  lesson_plan_id uuid not null references public.lesson_plans(id) on delete cascade,
  stage_code text not null check (stage_code in ('T','H','I','N','K')),
  access_mode text not null default 'hidden' check (access_mode in ('hidden','read_only','writable')),
  updated_at timestamptz not null default now(),
  unique (class_id, lesson_plan_id, stage_code)
);

alter table public.class_lesson_stage_access enable row level security;

create policy "teachers read own class stage access" on public.class_lesson_stage_access for select to authenticated
using (exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = (select auth.uid())));
