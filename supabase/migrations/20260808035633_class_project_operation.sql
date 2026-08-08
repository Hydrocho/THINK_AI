create table public.projects (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  subject text,
  grade_number integer,
  description text not null default '',
  visibility text not null default 'private' check (visibility in ('private', 'published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  version_number integer not null,
  created_by uuid not null references public.profiles(id),
  assessment_criteria text not null default '',
  created_at timestamptz not null default now(),
  unique (project_id, version_number)
);

create table public.lesson_plans (
  id uuid primary key default gen_random_uuid(),
  project_version_id uuid not null references public.project_versions(id) on delete cascade,
  lesson_order integer not null check (lesson_order > 0),
  title text not null,
  core_question text not null,
  student_guidance text not null default '',
  think_stages text[] not null default array['T','H','I','N','K'],
  ai_question_limit integer not null default 3 check (ai_question_limit between 0 and 30),
  unique (project_version_id, lesson_order)
);

create table public.class_projects (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  source_project_id uuid not null references public.projects(id),
  source_version_id uuid not null references public.project_versions(id),
  attached_by uuid not null references public.profiles(id),
  title text not null,
  is_active boolean not null default false,
  attached_at timestamptz not null default now()
);

create table public.class_sessions (
  id uuid primary key default gen_random_uuid(),
  class_project_id uuid not null references public.class_projects(id) on delete cascade,
  lesson_plan_id uuid not null references public.lesson_plans(id),
  teacher_id uuid not null references public.profiles(id),
  status text not null default 'closed' check (status in ('open', 'closed')),
  opened_at timestamptz,
  closed_at timestamptz
);

alter table public.projects enable row level security;
alter table public.project_versions enable row level security;
alter table public.lesson_plans enable row level security;
alter table public.class_projects enable row level security;
alter table public.class_sessions enable row level security;

create policy "teachers read own or published projects" on public.projects for select to authenticated using (
  author_id = (select auth.uid()) or (visibility = 'published' and (select private.is_approved_teacher()))
);
create policy "teachers read visible project versions" on public.project_versions for select to authenticated using (
  exists (select 1 from public.projects p where p.id = project_id and (p.author_id = (select auth.uid()) or (p.visibility = 'published' and (select private.is_approved_teacher()))))
);
create policy "teachers read visible lesson plans" on public.lesson_plans for select to authenticated using (
  exists (select 1 from public.project_versions v join public.projects p on p.id = v.project_id where v.id = project_version_id and (p.author_id = (select auth.uid()) or (p.visibility = 'published' and (select private.is_approved_teacher()))))
);
create policy "teachers read class project links" on public.class_projects for select to authenticated using ((select private.is_approved_teacher()));
create policy "teachers read own class sessions" on public.class_sessions for select to authenticated using (teacher_id = (select auth.uid()));
