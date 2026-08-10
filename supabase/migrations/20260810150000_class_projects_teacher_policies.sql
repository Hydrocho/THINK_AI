drop policy if exists "teachers insert own class project links" on public.class_projects;
create policy "teachers insert own class project links" on public.class_projects for insert to authenticated
with check (
  exists (
    select 1 from public.classes c
    where c.id = class_id
      and c.teacher_id = (select auth.uid())
  )
);

drop policy if exists "teachers delete own class project links" on public.class_projects;
create policy "teachers delete own class project links" on public.class_projects for delete to authenticated
using (
  exists (
    select 1 from public.classes c
    where c.id = class_id
      and c.teacher_id = (select auth.uid())
  )
);
