alter table public.class_sessions
  add column if not exists class_id uuid references public.classes(id) on delete cascade;

update public.class_sessions session
set class_id = project.class_id
from public.class_projects project
where project.id = session.class_project_id
  and session.class_id is null;

alter table public.class_sessions
  alter column class_id set not null;

with ranked_open_sessions as (
  select id, row_number() over (partition by class_id order by opened_at desc nulls last, id desc) as position
  from public.class_sessions
  where status = 'open'
)
update public.class_sessions session
set status = 'closed', closed_at = now()
from ranked_open_sessions ranked
where ranked.id = session.id and ranked.position > 1;

create unique index if not exists one_open_session_per_class
  on public.class_sessions (class_id)
  where status = 'open';

alter table public.think_stage_responses
  add column if not exists submitted_at timestamptz;
