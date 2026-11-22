create function public.think_stage_snapshot(p_actor uuid,p_class uuid,p_lesson uuid,p_stage text,p_turn uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  c public.classes%rowtype; l public.lesson_plans%rowtype;
  sn text; active boolean; result jsonb;
begin
  select * into c from public.classes where id=p_class;
  select * into l from public.lesson_plans where id=p_lesson;
  if c.id is null or l.id is null or not exists(
    select 1 from public.class_projects where class_id=p_class and source_version_id=l.project_version_id
  ) then raise exception '학급에 연결된 주제가 아닙니다.'; end if;
  select student_number into sn from public.student_accounts where auth_user_id=p_actor;
  if sn is null or sn !~ '^[0-9]{5}$' or left(sn,3)<>c.grade_number::text||lpad(c.class_number::text,2,'0')
  then raise exception '이 학급의 학생만 이용할 수 있습니다.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_class::text||p_lesson::text||p_actor::text,0));
  active := c.active_lesson_plan_id=p_lesson;
  select jsonb_build_object('access',coalesce(jsonb_object_agg(stage_code,case when active then access_mode else 'hidden' end),'{}'))
    into result from class_lesson_stage_access where class_id=p_class and lesson_plan_id=p_lesson;
  if p_stage in ('H','K') and result->'access'->>'H' in ('writable','read_only') then
    if not exists(select 1 from think_peer_sets where class_id=p_class and lesson_id=p_lesson and student_id=p_actor) then
      perform public.refresh_think_reading(p_class,p_lesson);
    end if;
    result:=result || coalesce((select jsonb_build_object('peers',opinions,'firstCount',first_count)
      from think_peer_sets where class_id=p_class and lesson_id=p_lesson and student_id=p_actor),'{"peers":[],"firstCount":0}'::jsonb);
  end if;
  if p_stage='I' then
    update think_chat_turns set status='failed',error='응답 시간이 초과되었습니다.',updated_at=now()
      where class_id=p_class and lesson_id=p_lesson and student_id=p_actor and status='pending' and updated_at<now()-interval '120 seconds';
    select result || jsonb_build_object('remaining',greatest(0,l.ai_question_limit-count(*) filter(where status in ('pending','succeeded'))))
      into result from think_chat_turns where class_id=p_class and lesson_id=p_lesson and student_id=p_actor;
    select result || jsonb_build_object('turns',coalesce(jsonb_agg(jsonb_build_object('id',id,'question',question,'answer',answer,'status',status,'error',error) order by created_at),'[]'))
      into result from think_chat_turns where class_id=p_class and lesson_id=p_lesson and student_id=p_actor and (p_turn is null or id=p_turn);
  end if;
  return result;
end;
$$;
revoke all on function public.think_stage_snapshot(uuid,uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.think_stage_snapshot(uuid,uuid,uuid,text,uuid) to service_role;
notify pgrst,'reload schema';
