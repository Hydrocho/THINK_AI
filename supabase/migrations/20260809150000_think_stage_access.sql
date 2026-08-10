alter table public.lesson_plans add column if not exists think_stage_access jsonb not null default
  '{"T":"hidden","H":"hidden","I":"hidden","N":"hidden","K":"hidden"}'::jsonb;

update public.lesson_plans
set think_stage_access = '{"T":"hidden","H":"hidden","I":"hidden","N":"hidden","K":"hidden"}'::jsonb
where think_stage_access is null;
