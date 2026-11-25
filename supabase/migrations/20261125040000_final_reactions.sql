begin;
create table public.think_final_readings (
  class_id uuid not null, lesson_id uuid not null, author uuid not null,
  stage text not null default 'K' check(stage='K'),
  reader uuid not null references auth.users(id) on delete cascade,
  id uuid not null unique default gen_random_uuid(),
  reactions jsonb not null default '[]' check(public.valid_think_hearts(reactions)),
  recommended boolean not null default false,
  primary key(class_id,lesson_id,author,reader), check(author<>reader),
  foreign key(class_id,lesson_id,author,stage) references public.think_records on delete cascade
);
alter table public.think_final_readings enable row level security;
revoke all on public.think_final_readings from public,anon,authenticated;
create or replace function public.manage_live_teaching(p_actor uuid,p_class uuid,p_lesson uuid,p_action text,p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=public as $$
declare c public.classes%rowtype; l public.lesson_plans%rowtype; plan public.class_lesson_plans%rowtype; selected text[]; stage text;
begin
  select * into c from classes where id=p_class for update;
  if c.id is null or c.teacher_id<>p_actor or not exists(select 1 from profiles where id=p_actor
    and role in ('teacher','admin') and approval_status='approved') then raise exception '수업 운영 권한이 없습니다.'; end if;
  if p_action='end' then
    if c.active_lesson_plan_id is distinct from p_lesson then raise exception '진행 중인 수업이 변경되었습니다. 다시 확인해 주세요.'; end if;
    update class_lesson_plans set final_sharing_released=false where class_id=p_class and lesson_plan_id=p_lesson;
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
    insert into class_lesson_plans(class_id,lesson_plan_id,enabled,planned_stages) values(p_class,p_lesson,coalesce((p_payload->>'enabled')::boolean,false),selected)
    on conflict(class_id,lesson_plan_id) do update set enabled=excluded.enabled,planned_stages=excluded.planned_stages;
    if p_payload ? 'peerReviewEnabled' then
      update class_lesson_plans set peer_review_enabled=(p_payload->>'peerReviewEnabled')::boolean where class_id=p_class and lesson_plan_id=p_lesson;
    end if;
  elsif p_action in ('list_finals','list_final_cards','release_finals','hide_finals') then
    if c.active_lesson_plan_id is distinct from p_lesson or plan.class_id is null or not plan.enabled
      or not ('K'=any(plan.planned_stages)) then raise exception '진행 중인 K단계 수업을 선택해 주세요.'; end if;
    if p_action='list_final_cards' then
      return (select coalesce(jsonb_agg(jsonb_build_object(
        'studentName',author.student_name,'text',r.content,'similar',counts.similar,
        'newView',counts.new_view,'curious',counts.curious,'stars',counts.stars
      ) order by author.student_number),'[]'::jsonb)
        from think_records r join student_accounts author on author.auth_user_id=r.student_id
        cross join lateral (select count(*) filter(where f.reactions ? 'similar') similar,
          count(*) filter(where f.reactions ? 'newView') new_view,
          count(*) filter(where f.reactions ? 'curious') curious,
          count(*) filter(where f.recommended) stars
          from think_final_readings f where f.class_id=r.class_id and f.lesson_id=r.lesson_id
            and f.author=r.student_id) counts
        where r.class_id=p_class and r.lesson_id=p_lesson and r.stage='K'
          and author.student_number ~ ('^'||c.grade_number::text||lpad(c.class_number::text,2,'0')||'[0-9]{2}$')
          and r.submitted_at is not null and btrim(r.content)<>'');
    end if;
    if p_action='list_finals' then
      return (select coalesce(jsonb_agg(r.content order by r.submitted_at,r.student_id),'[]'::jsonb)
        from think_records r join student_accounts author on author.auth_user_id=r.student_id
        where r.class_id=p_class and r.lesson_id=p_lesson and r.stage='K'
          and author.student_number ~ ('^'||c.grade_number::text||lpad(c.class_number::text,2,'0')||'[0-9]{2}$')
          and r.submitted_at is not null and btrim(r.content)<>'');
    end if;
    if p_action='release_finals' and not exists(
      select 1 from class_lesson_stage_access where class_id=p_class and lesson_plan_id=p_lesson
        and stage_code='K' and access_mode in ('writable','read_only')) then
      raise exception 'K단계를 먼저 열어 주세요.'; end if;
    update class_lesson_plans set final_sharing_released=(p_action='release_finals')
      where class_id=p_class and lesson_plan_id=p_lesson;
  elsif p_action in ('start','stage','close_stage') then
    if plan.class_id is null or not plan.enabled or cardinality(plan.planned_stages)=0 then raise exception '학급 계획에서 주제와 단계를 먼저 저장해 주세요.'; end if;
    if p_action='start' then
      if c.active_lesson_plan_id is distinct from p_lesson then
        update class_lesson_plans set final_sharing_released=false where class_id=p_class and lesson_plan_id=p_lesson;
        update class_lesson_stage_access set access_mode='hidden',updated_at=now() where class_id=p_class and lesson_plan_id=p_lesson;
        update classes set active_lesson_plan_id=p_lesson,current_think_stage=null where id=p_class;
      end if;
    else
      if c.active_lesson_plan_id is distinct from p_lesson then raise exception '먼저 실시간 수업을 시작해 주세요.'; end if;
      stage:=p_payload->>'stage';
      if stage is null or not stage=any(plan.planned_stages) then raise exception '계획에 포함되지 않은 단계입니다.'; end if;
      if p_action='close_stage' and stage='K' then
        update class_lesson_plans set final_sharing_released=false where class_id=p_class and lesson_plan_id=p_lesson;
      end if;
      insert into class_lesson_stage_access(class_id,lesson_plan_id,stage_code,access_mode)
      values(p_class,p_lesson,stage,case when p_action='close_stage' then 'hidden' else 'writable' end) on conflict(class_id,lesson_plan_id,stage_code)
      do update set access_mode=excluded.access_mode,updated_at=now();
      update classes set current_think_stage=case
        when p_action='stage' then stage
        when current_think_stage=stage then null
        else current_think_stage end where id=p_class;
    end if;
  else raise exception '지원하지 않는 작업입니다.';
  end if;
  return jsonb_build_object('ok',true);
end $$;
revoke all on function public.manage_live_teaching(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.manage_live_teaching(uuid,uuid,uuid,text,jsonb) to service_role;

create function public.think_final_cards(p_actor uuid,p_class uuid,p_lesson uuid,p_action text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare class_prefix text; mode text;
begin
  select c.grade_number::text||lpad(c.class_number::text,2,'0')  ,a.access_mode into class_prefix,mode
  from classes c
  join lesson_plans l on l.id=c.active_lesson_plan_id
  join class_lesson_plans plan on plan.class_id=c.id and plan.lesson_plan_id=l.id
  join class_lesson_stage_access a on a.class_id=c.id and a.lesson_plan_id=l.id and a.stage_code='K'
  join student_accounts reader on reader.auth_user_id=p_actor
  where c.id=p_class and l.id=p_lesson and plan.enabled
    and 'K'=any(plan.planned_stages) and 'K'=any(l.think_stages)
    and a.access_mode in ('writable','read_only')
    and reader.student_number ~ ('^'||c.grade_number::text||lpad(c.class_number::text,2,'0')||'[0-9]{2}$')
    and exists(select 1 from class_projects cp where cp.class_id=c.id and cp.source_version_id=l.project_version_id);
  if not found then raise exception '친구의 최종 글을 열 수 없습니다.'; end if;
  if not exists(select 1 from class_lesson_plans where class_id=p_class and lesson_plan_id=p_lesson and final_sharing_released)
    then raise exception '선생님이 아직 최종 글을 공개하지 않았습니다.'; end if;
  if p_action='final_feedback' then
    if mode<>'writable' or not (p_payload ? 'reactions' and p_payload ? 'recommended')
      or not public.valid_think_hearts(p_payload->'reactions')
      or jsonb_typeof(p_payload->'recommended')<>'boolean' then raise exception '반응을 저장할 수 없습니다.'; end if;
    update think_final_readings f set reactions=p_payload->'reactions',recommended=(p_payload->>'recommended')::boolean
      from think_records r join student_accounts sa on sa.auth_user_id=r.student_id
      where f.id=(p_payload->>'id')::uuid and f.reader=p_actor and f.class_id=p_class and f.lesson_id=p_lesson
        and r.class_id=f.class_id and r.lesson_id=f.lesson_id and r.student_id=f.author and r.stage='K'
        and r.submitted_at is not null and btrim(r.content)<>'' and sa.student_number ~ ('^'||class_prefix||'[0-9]{2}$');
    if not found then raise exception '현재 공유된 글을 다시 확인해 주세요.'; end if;
    return jsonb_build_object('ok',true);
  end if;
  if p_action<>'final_cards' then raise exception '지원하지 않는 작업입니다.'; end if;
  insert into think_final_readings(class_id,lesson_id,author,reader)
    select r.class_id,r.lesson_id,r.student_id,p_actor from think_records r
    join student_accounts sa on sa.auth_user_id=r.student_id
    where r.class_id=p_class and r.lesson_id=p_lesson and r.stage='K' and r.student_id<>p_actor
      and sa.student_number ~ ('^'||class_prefix||'[0-9]{2}$') and r.submitted_at is not null and btrim(r.content)<>''
    order by r.student_id on conflict(class_id,lesson_id,author,reader) do nothing;
  return (select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'text',r.content,
    'reactions',f.reactions,'recommended',f.recommended) order by f.id),'[]'::jsonb)
    from think_final_readings f join think_records r on r.class_id=f.class_id and r.lesson_id=f.lesson_id and r.student_id=f.author and r.stage='K'
    join student_accounts sa on sa.auth_user_id=f.author
    where f.class_id=p_class and f.lesson_id=p_lesson and f.reader=p_actor
      and sa.student_number ~ ('^'||class_prefix||'[0-9]{2}$') and r.submitted_at is not null and btrim(r.content)<>'');
end $$;
revoke all on function public.think_final_cards(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.think_final_cards(uuid,uuid,uuid,text,jsonb) to service_role;
create or replace function public.think_final_reading(p_actor uuid,p_class uuid,p_lesson uuid)
returns jsonb language sql volatile security definer set search_path=public as $$
  select coalesce(jsonb_agg(card->'text' order by n),'[]'::jsonb)
  from jsonb_array_elements(think_final_cards(p_actor,p_class,p_lesson,'final_cards','{}')) with ordinality item(card,n);
$$;
commit;
