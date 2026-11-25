begin;
create or replace function public.think_final_cards(p_actor uuid,p_class uuid,p_lesson uuid,p_action text,p_payload jsonb)
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
    then return jsonb_build_object('status','unreleased','error','선생님이 아직 최종 글을 공개하지 않았습니다.'); end if;
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
returns jsonb language plpgsql volatile security definer set search_path=public as $$
declare cards jsonb;
begin
  cards:=think_final_cards(p_actor,p_class,p_lesson,'final_cards','{}');
  if cards->>'status'='unreleased' then return cards; end if;
  return (select coalesce(jsonb_agg(card->'text' order by n),'[]'::jsonb)
    from jsonb_array_elements(cards) with ordinality item(card,n));
end $$;
commit;
