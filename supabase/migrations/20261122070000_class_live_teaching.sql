begin;
create table public.class_lesson_plans (
  class_id uuid not null references public.classes(id) on delete cascade,
  lesson_plan_id uuid not null references public.lesson_plans(id) on delete cascade,
  enabled boolean not null default true,
  planned_stages text[] not null default array['T','H','I','N','K'],
  primary key(class_id,lesson_plan_id),
  check (planned_stages <@ array['T','H','I','N','K']::text[])
);
alter table public.classes add column current_think_stage text check (current_think_stage in ('T','H','I','N','K'));
alter table public.class_lesson_plans enable row level security;
revoke all on public.class_lesson_plans from anon,authenticated;
grant select on public.class_lesson_plans to authenticated,service_role;
grant all on public.class_lesson_plans to service_role;
create policy "teachers read own lesson plans" on public.class_lesson_plans for select to authenticated
using (exists(select 1 from public.classes c where c.id=class_id and c.teacher_id=(select auth.uid())));
-- Preserve attached topics and existing access; saving plans never opens activities.
insert into public.class_lesson_plans(class_id,lesson_plan_id,planned_stages)
select distinct cp.class_id,l.id,l.think_stages from public.class_projects cp
join public.lesson_plans l on l.project_version_id=cp.source_version_id
on conflict do nothing;

create function public.manage_live_teaching(p_actor uuid,p_class uuid,p_lesson uuid,p_action text,p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=public as $$
declare c public.classes%rowtype; l public.lesson_plans%rowtype; plan public.class_lesson_plans%rowtype; selected text[]; stage text;
begin
  select * into c from classes where id=p_class for update;
  if c.id is null or c.teacher_id<>p_actor or not exists(select 1 from profiles where id=p_actor
    and role in ('teacher','admin') and approval_status='approved') then raise exception '수업 운영 권한이 없습니다.'; end if;
  if p_action='end' then
    if c.active_lesson_plan_id is distinct from p_lesson then raise exception '진행 중인 수업이 변경되었습니다. 다시 확인해 주세요.'; end if;
    update classes set active_lesson_plan_id=null,current_think_stage=null where id=p_class;
    return jsonb_build_object('ok',true);
  end if;
  select * into l from lesson_plans where id=p_lesson;
  if l.id is null or not exists(select 1 from class_projects where class_id=p_class and source_version_id=l.project_version_id)
    then raise exception '학급에 연결된 주제가 아닙니다.'; end if;
  select * into plan from class_lesson_plans where class_id=p_class and lesson_plan_id=p_lesson;
  if p_action='plan' then
    select coalesce(array_agg(s order by n),'{}') into selected from unnest(array['T','H','I','N','K']) with ordinality x(s,n)
      where p_payload->'stages' ? s;
    if not selected <@ l.think_stages then raise exception '수업 설계에 포함된 단계만 선택해 주세요.'; end if;
    if coalesce((p_payload->>'enabled')::boolean,false) and cardinality(selected)=0 then raise exception '함께 진행할 단계를 선택해 주세요.'; end if;
    if c.active_lesson_plan_id=p_lesson then raise exception '진행 중인 주제의 계획은 수업 종료 후 수정해 주세요.'; end if;
    insert into class_lesson_plans values(p_class,p_lesson,coalesce((p_payload->>'enabled')::boolean,false),selected)
    on conflict(class_id,lesson_plan_id) do update set enabled=excluded.enabled,planned_stages=excluded.planned_stages;
  elsif p_action in ('start','stage') then
    if plan.class_id is null or not plan.enabled or cardinality(plan.planned_stages)=0 then raise exception '학급 계획에서 주제와 단계를 먼저 저장해 주세요.'; end if;
    if p_action='start' then
      if c.active_lesson_plan_id is distinct from p_lesson then
        update class_lesson_stage_access set access_mode='hidden',updated_at=now() where class_id=p_class and lesson_plan_id=p_lesson;
        update classes set active_lesson_plan_id=p_lesson,current_think_stage=null where id=p_class;
      end if;
    else
      if c.active_lesson_plan_id is distinct from p_lesson then raise exception '먼저 실시간 수업을 시작해 주세요.'; end if;
      stage:=p_payload->>'stage';
      if stage is null or not stage=any(plan.planned_stages) then raise exception '계획에 포함되지 않은 단계입니다.'; end if;
      insert into class_lesson_stage_access(class_id,lesson_plan_id,stage_code,access_mode)
      values(p_class,p_lesson,stage,'writable') on conflict(class_id,lesson_plan_id,stage_code)
      do update set access_mode='writable',updated_at=now();
      update classes set current_think_stage=stage where id=p_class;
    end if;
  else raise exception '지원하지 않는 작업입니다.';
  end if;
  return jsonb_build_object('ok',true);
end $$;
revoke all on function public.manage_live_teaching(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.manage_live_teaching(uuid,uuid,uuid,text,jsonb) to service_role;
commit;
