create table if not exists public.think_stage_responses (
  id uuid primary key default gen_random_uuid(),
  lesson_plan_id uuid not null references public.lesson_plans(id) on delete cascade,
  student_number text not null,
  stage_code text not null check (stage_code in ('T','H','I','N','K')),
  content text not null default '',
  updated_at timestamptz not null default now(),
  unique (lesson_plan_id, student_number, stage_code)
);

alter table public.think_stage_responses enable row level security;
