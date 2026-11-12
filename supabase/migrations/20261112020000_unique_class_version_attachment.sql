begin;
lock table public.class_projects in share row exclusive mode;
-- Keep the most recent attachment, including its displayed title.
with ranked as (
  select id, row_number() over (
    partition by class_id, source_version_id
    order by attached_at desc, id desc
  ) as position
  from public.class_projects
)
delete from public.class_projects cp using ranked r
where cp.id = r.id and r.position > 1;

create unique index class_projects_one_attachment_per_version
  on public.class_projects (class_id, source_version_id);
commit;
