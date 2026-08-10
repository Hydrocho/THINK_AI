-- 수업 설계는 작성 교사 개인 자료로만 사용한다.
update public.projects
set visibility = 'private'
where visibility = 'published';

drop policy if exists "teachers read own or published projects" on public.projects;
create policy "teachers read own projects" on public.projects for select to authenticated
using (author_id = (select auth.uid()));

drop policy if exists "teachers read visible project versions" on public.project_versions;
create policy "teachers read own project versions" on public.project_versions for select to authenticated
using (
  exists (
    select 1 from public.projects p
    where p.id = project_id
      and p.author_id = (select auth.uid())
  )
);

drop policy if exists "teachers read visible lesson plans" on public.lesson_plans;
create policy "teachers read own lesson plans" on public.lesson_plans for select to authenticated
using (
  exists (
    select 1
    from public.project_versions v
    join public.projects p on p.id = v.project_id
    where v.id = project_version_id
      and p.author_id = (select auth.uid())
  )
);

drop policy if exists "teachers read class project links" on public.class_projects;
create policy "teachers read own class project links" on public.class_projects for select to authenticated
using (
  exists (
    select 1 from public.classes c
    where c.id = class_id
      and c.teacher_id = (select auth.uid())
  )
);
