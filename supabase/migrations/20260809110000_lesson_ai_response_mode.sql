alter table public.lesson_plans
  add column if not exists ai_response_mode text not null default 'THOUGHT_PROVOKING'
  check (ai_response_mode in ('THOUGHT_PROVOKING', 'GENERAL'));
