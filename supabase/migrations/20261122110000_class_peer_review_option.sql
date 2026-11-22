begin;
alter table public.class_lesson_plans add column peer_review_enabled boolean not null default true;
create or replace function public.manage_live_teaching(p_actor uuid,p_class uuid,p_lesson uuid,p_action text,p_payload jsonb default '{}')
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
    insert into class_lesson_plans(class_id,lesson_plan_id,enabled,planned_stages) values(p_class,p_lesson,coalesce((p_payload->>'enabled')::boolean,false),selected)
    on conflict(class_id,lesson_plan_id) do update set enabled=excluded.enabled,planned_stages=excluded.planned_stages;
    if p_payload ? 'peerReviewEnabled' then
      update class_lesson_plans set peer_review_enabled=(p_payload->>'peerReviewEnabled')::boolean where class_id=p_class and lesson_plan_id=p_lesson;
    end if;
  elsif p_action in ('start','stage','close_stage') then
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
create or replace function public.think_review_reading(p_actor uuid,p_class uuid,p_lesson uuid,p_action text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare mode text; seed uuid; existing uuid[]; additions uuid[]; h_order uuid[]; combined uuid[];
  common uuid[]; newcomer uuid; ring uuid[]; start_at integer; result jsonb;
begin
  if exists(select 1 from class_lesson_plans where class_id=p_class and lesson_plan_id=p_lesson and not peer_review_enabled) then
    raise exception '이 학급에서는 친구의 검토 읽기를 사용하지 않습니다.';
  end if;
  select a.access_mode,l.peer_draw_seed into mode,seed from classes c
    join lesson_plans l on l.id=c.active_lesson_plan_id
    join class_lesson_stage_access a on a.class_id=c.id and a.lesson_plan_id=l.id and a.stage_code='N'
    join student_accounts sa on sa.auth_user_id=p_actor
    where c.id=p_class and l.id=p_lesson and 'N'=any(l.think_stages)
      and sa.student_number ~ ('^'||c.grade_number::text||lpad(c.class_number::text,2,'0')||'[0-9]{2}$')
      and exists(select 1 from class_projects where class_id=c.id and source_version_id=l.project_version_id);
  if coalesce(mode,'hidden') not in ('writable','read_only') then raise exception '친구 검토를 열 수 없습니다.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_class::text||p_lesson::text||p_actor::text,0));
  if not exists(select 1 from think_records where class_id=p_class and lesson_id=p_lesson and student_id=p_actor and stage='N' and submitted_at is not null)
    then raise exception '내 검토를 먼저 제출해 주세요.'; end if;
  if p_action='review_feedback' then
    if mode<>'writable' then raise exception '마감된 단계입니다.'; end if;
    if p_payload ? 'recommended' and jsonb_typeof(p_payload->'recommended')='boolean' then
      update think_review_readings set recommended=(p_payload->>'recommended')::boolean
       where id=(p_payload->>'id')::uuid and reader=p_actor and class_id=p_class and lesson_id=p_lesson
         and exists(select 1 from think_records where class_id=p_class and lesson_id=p_lesson and stage='N' and student_id=author and submitted_at is not null);
    elsif p_payload ? 'reaction' then
      update think_review_readings set reaction=p_payload->>'reaction'
       where id=(p_payload->>'id')::uuid and reader=p_actor and class_id=p_class and lesson_id=p_lesson
         and exists(select 1 from think_records where class_id=p_class and lesson_id=p_lesson and stage='N' and student_id=author and submitted_at is not null);
    else raise exception '반응을 확인해 주세요.'; end if;
    if not found then raise exception '읽을 수 없는 글입니다.'; end if;
    return jsonb_build_object('ok',true);
  end if;
  if p_action<>'review_list' then raise exception '잘못된 요청입니다.'; end if;
  select coalesce(array_agg(author order by position),'{}') into existing from think_review_readings
    where reader=p_actor and class_id=p_class and lesson_id=p_lesson;
  -- A lesson-specific circle staggers first reads evenly across a submitted cohort.
  select array_agg(student_id order by md5(seed::text||'N'||student_id::text),student_id) into ring
    from think_records where class_id=p_class and lesson_id=p_lesson and stage='N' and submitted_at is not null;
  start_at:=array_position(ring,p_actor);
  select array(select x from unnest(ring) with ordinality a(x,i)
    where x<>p_actor and not(x=any(existing))
    order by mod(i-start_at+cardinality(ring),cardinality(ring))) into additions;
  if cardinality(additions)>0 then
    combined:=existing||additions;
    select source_ids into h_order from think_peer_sets where class_id=p_class and lesson_id=p_lesson and student_id=p_actor;
    select array_agg(x order by ord) into common from unnest(h_order) with ordinality h(x,ord)
      where x=any(combined) and exists(select 1 from think_records where class_id=p_class and lesson_id=p_lesson and stage='N' and student_id=x and submitted_at is not null);
    if cardinality(common)>1 and common=array(select x from unnest(combined) with ordinality n(x,i) where x=any(common) order by i) then
      -- Move only a new common author, preserving the relative order of all previously seen posts.
      select x into newcomer from unnest(additions) with ordinality n(x,i) where x=any(common) order by i desc limit 1;
      if newcomer is not null then combined:=array_prepend(newcomer,array_remove(combined,newcomer)); end if;
    end if;
    insert into think_review_readings(class_id,lesson_id,reader,author,position)
      select p_class,p_lesson,p_actor,x,i from unnest(combined) with ordinality n(x,i)
      on conflict(class_id,lesson_id,reader,author) do update set position=excluded.position;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',n.id,'target',coalesce(nullif(r.metadata#>>'{review,source,learned}',''),r.metadata#>>'{review,target}',''),
    'evidence',coalesce(r.metadata#>>'{review,evidence}',r.content),'judgment',r.metadata#>>'{review,judgment}',
    'sourceUrl',r.metadata#>>'{review,sourceUrl}','reaction',n.reaction,'recommended',n.recommended) order by n.position),'[]') into result
    from think_review_readings n join think_records r on r.class_id=n.class_id and r.lesson_id=n.lesson_id and r.student_id=n.author and r.stage='N'
    where n.class_id=p_class and n.lesson_id=p_lesson and n.reader=p_actor and r.submitted_at is not null;
  return result;
end;
$$;
revoke all on function public.think_review_reading(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.think_review_reading(uuid,uuid,uuid,text,jsonb) to service_role;
create or replace function public.think_workflow(
  p_actor uuid, p_class uuid, p_lesson uuid, p_action text,
  p_stage text default 'T', p_payload jsonb default '{}'
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  c public.classes%rowtype; l public.lesson_plans%rowtype;
  r public.think_records%rowtype; t public.think_chat_turns%rowtype;
  sn text; mode text; active boolean; request_id uuid; result jsonb;
  peers jsonb; required_count integer; total integer; new_content text;
begin
  select * into c from public.classes where id=p_class;
  select * into l from public.lesson_plans where id=p_lesson;
  if c.id is null or l.id is null or not exists(
    select 1 from public.class_projects where class_id=p_class and source_version_id=l.project_version_id
  ) then raise exception '학급에 연결된 차시가 아닙니다.'; end if;
  if p_action='assign' then
    if c.teacher_id<>p_actor or not exists(select 1 from public.profiles where id=p_actor
      and role in ('teacher','admin') and approval_status='approved') then raise exception '배정 권한이 없습니다.'; end if;
    perform public.refresh_think_reading(p_class,p_lesson);
    return jsonb_build_object('ok',true);
  end if;
  select student_number into sn from public.student_accounts where auth_user_id=p_actor;
  if sn is null or sn !~ '^[0-9]{5}$' or left(sn,3)<>c.grade_number::text||lpad(c.class_number::text,2,'0')
  then raise exception '이 학급의 학생만 이용할 수 있습니다.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_class::text||p_lesson::text||p_actor::text,0));
  active := c.active_lesson_plan_id=p_lesson;
  select access_mode into mode from public.class_lesson_stage_access
    where class_id=p_class and lesson_plan_id=p_lesson and stage_code=p_stage;
  if not coalesce(active,false) then mode:='hidden'; end if;
  if p_action in ('open','save','chat_start') and not (p_stage=any(l.think_stages)) then
    raise exception '사용하지 않는 단계입니다.'; end if;
  if p_action='snapshot' then
    if active and exists(select 1 from class_lesson_stage_access where class_id=p_class and lesson_plan_id=p_lesson and stage_code='H' and access_mode in ('writable','read_only'))
      and not exists(select 1 from think_peer_sets where class_id=p_class and lesson_id=p_lesson and student_id=p_actor) then
      perform public.refresh_think_reading(p_class,p_lesson);
    end if;
    -- Expired pending requests do not consume a question indefinitely.
    update public.think_chat_turns set status='failed',error='응답 시간이 초과되었습니다. 다시 질문해 주세요.',updated_at=now()
    where class_id=p_class and lesson_id=p_lesson and student_id=p_actor and status='pending' and updated_at<now()-interval '120 seconds';
    select jsonb_build_object(
      'records',coalesce((select jsonb_agg(to_jsonb(x)-'lease'-'last_request') from public.think_records x
        where class_id=p_class and lesson_id=p_lesson and student_id=p_actor),'[]'),
      'firstCount',coalesce((select first_count from think_peer_sets where class_id=p_class and lesson_id=p_lesson and student_id=p_actor),0),
      'peers',coalesce((select opinions from public.think_peer_display where class_id=p_class and lesson_id=p_lesson and student_id=p_actor),'[]'),
      'turns',coalesce((select jsonb_agg(to_jsonb(x)-'attempt' order by created_at) from public.think_chat_turns x
        where class_id=p_class and lesson_id=p_lesson and student_id=p_actor),'[]'),
      'access',coalesce((select jsonb_object_agg(stage_code,case when coalesce(active,false) then access_mode else 'hidden' end)
        from public.class_lesson_stage_access where class_id=p_class and lesson_plan_id=p_lesson),'{}'),
      'remaining',greatest(0,l.ai_question_limit-(select count(*) from public.think_chat_turns
        where class_id=p_class and lesson_id=p_lesson and student_id=p_actor and status in ('pending','succeeded'))),
      'active',coalesce(active,false)) into result;
    return result || jsonb_build_object('peerReviewEnabled',coalesce((select peer_review_enabled from class_lesson_plans where class_id=p_class and lesson_plan_id=p_lesson),true));
  elsif p_action='open' then
    if mode is distinct from 'writable' then raise exception '현재 작성할 수 없는 단계입니다.'; end if;
    insert into public.think_records(class_id,lesson_id,student_id,stage,lease)
    values(p_class,p_lesson,p_actor,p_stage,gen_random_uuid())
    on conflict(class_id,lesson_id,student_id,stage) do update set lease=gen_random_uuid(),final_saved=false
    returning * into r;
    return to_jsonb(r);
  elsif p_action='save' then
    select * into r from public.think_records where class_id=p_class and lesson_id=p_lesson and student_id=p_actor and stage=p_stage for update;
    request_id := (p_payload->>'requestId')::uuid;
    if r.student_id is null or r.lease is distinct from (p_payload->>'lease')::uuid or request_id is null then
      raise exception '작성 권한이 만료되었습니다. 글을 복사한 뒤 다시 입장해 주세요.'; end if;
    if r.last_request=request_id then return to_jsonb(r); end if;
    if r.revision is distinct from (p_payload->>'revision')::integer then raise exception '다른 창에서 저장된 글이 있습니다. 글을 복사한 뒤 다시 입장해 주세요.'; end if;
    if mode is distinct from 'writable' and r.final_saved then raise exception '마감 후 마지막 저장을 이미 완료했습니다.'; end if;
    new_content:=coalesce(p_payload->>'content','');
    if length(new_content)>30000 then raise exception '글은 30000자 이내로 입력해 주세요.'; end if;
    if p_stage='H' and p_payload ? 'changes' then
      new_content:=r.content;
      p_payload:=p_payload || jsonb_build_object('metadata',r.metadata || jsonb_build_object('feedback',
        coalesce(r.metadata->'feedback','{}') || (p_payload->'changes')));
    end if;
    if p_stage in ('H','N') and coalesce(p_payload->'metadata'->>'selectedPeerOpinion','')<>'' and not exists(
      select 1 from public.think_peer_sets ps,jsonb_array_elements(ps.opinions) op
      where ps.class_id=p_class and ps.lesson_id=p_lesson and ps.student_id=p_actor and op->>'id'=p_payload->'metadata'->>'selectedPeerOpinion'
    ) then raise exception '배정된 의견만 선택할 수 있습니다.'; end if;
    -- Check each reaction against this student's immutable anonymous assignment.
    if p_stage='H' and p_payload->'metadata' ? 'feedback' then
      select opinions, first_count into peers, required_count from public.think_peer_sets
        where class_id=p_class and lesson_id=p_lesson and student_id=p_actor;
      peers:=coalesce(peers,'[]'::jsonb);
      if jsonb_typeof(p_payload->'metadata'->'feedback') <> 'object' then
        raise exception '친구 글 반응 형식을 확인해 주세요.';
      end if;
      if exists(select 1 from jsonb_each(p_payload->'metadata'->'feedback') f
        where not exists(select 1 from jsonb_array_elements(peers) op where op->>'id'=f.key)
        or jsonb_typeof(f.value)<>'object'
        or (f.value ? 'reaction' and coalesce(f.value->>'reaction','') not in ('similar','newView','curious'))
        or (f.value ? 'recommended' and jsonb_typeof(f.value->'recommended')<>'boolean')) then
        raise exception '배정된 글의 반응과 추천을 확인해 주세요.';
      end if;
      p_payload:=p_payload || jsonb_build_object('submit',coalesce(required_count,0)>0 and not exists(
        select 1 from jsonb_array_elements(peers) with ordinality as item(op,num)
        where num<=required_count and (p_payload->'metadata'->'feedback'->(op->>'id')->>'reaction') is null));
    end if;
    if p_stage='N' and coalesce(p_payload->'metadata'->>'criteria','') not in ('validity','fairness','feasibility') then raise exception '판단 기준을 선택해 주세요.'; end if;
    update public.think_records set content=new_content,metadata=coalesce(p_payload->'metadata','{}'),revision=revision+1,
      submitted_at=case when coalesce((p_payload->>'submit')::boolean,false) then now()
        when content is distinct from new_content or metadata is distinct from coalesce(p_payload->'metadata','{}') then null else submitted_at end,
      updated_at=now(),final_saved=(mode is distinct from 'writable' and coalesce((p_payload->>'final')::boolean,false)),last_request=request_id
    where class_id=p_class and lesson_id=p_lesson and student_id=p_actor and stage=p_stage returning * into r;
    return to_jsonb(r);
  elsif p_action='chat_start' then
    if p_stage<>'I' or mode is distinct from 'writable' then raise exception 'AI 대화가 열려 있지 않습니다.'; end if;
    request_id:=(p_payload->>'requestId')::uuid;
    select * into t from public.think_chat_turns where id=request_id;
    if t.id is not null then
      if t.student_id<>p_actor or t.class_id<>p_class or t.lesson_id<>p_lesson then raise exception '잘못된 요청입니다.'; end if;
      if t.status in ('pending','succeeded') then return to_jsonb(t); end if;
    end if;
    update public.think_chat_turns set status='failed',error='응답 시간 초과',updated_at=now()
    where class_id=p_class and lesson_id=p_lesson and student_id=p_actor and status='pending' and updated_at<now()-interval '120 seconds';
    select count(*) into total from public.think_chat_turns where class_id=p_class and lesson_id=p_lesson and student_id=p_actor and status in ('pending','succeeded');
    if total>=l.ai_question_limit then raise exception 'AI 질문 횟수를 모두 사용했습니다.'; end if;
    if btrim(coalesce(p_payload->>'question',''))='' or length(p_payload->>'question')>6000 then raise exception '질문은 1~6000자로 입력해 주세요.'; end if;
    insert into public.think_chat_turns(id,class_id,lesson_id,student_id,question,status)
    values(request_id,p_class,p_lesson,p_actor,p_payload->>'question','pending')
    on conflict(id) do update set status='pending',answer=null,error=null,attempt=gen_random_uuid(),updated_at=now()
    returning * into t;
    return to_jsonb(t)||jsonb_build_object('claimed',true,'coreQuestion',l.core_question,'mode',l.ai_response_mode);
  elsif p_action='chat_finish' then
    -- Internal Edge Function action, never accepted from browser requests.
    update public.think_chat_turns set answer=p_payload->>'answer',error=p_payload->>'error',
      status=case when p_payload->>'error' is null then 'succeeded' else 'failed' end,updated_at=now()
    where id=(p_payload->>'requestId')::uuid and attempt=(p_payload->>'attempt')::uuid
      and class_id=p_class and lesson_id=p_lesson and student_id=p_actor and status='pending' returning * into t;
    return coalesce(to_jsonb(t),'{}');
  end if;
  raise exception '지원하지 않는 요청입니다.';
end;
$$;
create or replace function public.think_stage_snapshot(p_actor uuid,p_class uuid,p_lesson uuid,p_stage text,p_turn uuid default null)
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
      from think_peer_display where class_id=p_class and lesson_id=p_lesson and student_id=p_actor),'{"peers":[],"firstCount":0}'::jsonb);
  end if;
  if p_stage='I' then
    update think_chat_turns set status='failed',error='응답 시간이 초과되었습니다.',updated_at=now()
      where class_id=p_class and lesson_id=p_lesson and student_id=p_actor and status='pending' and updated_at<now()-interval '120 seconds';
    select result || jsonb_build_object('remaining',greatest(0,l.ai_question_limit-count(*) filter(where status in ('pending','succeeded'))))
      into result from think_chat_turns where class_id=p_class and lesson_id=p_lesson and student_id=p_actor;
    select result || jsonb_build_object('turns',coalesce(jsonb_agg(jsonb_build_object('id',id,'question',question,'answer',answer,'status',status,'error',error) order by created_at),'[]'))
      into result from think_chat_turns where class_id=p_class and lesson_id=p_lesson and student_id=p_actor and (p_turn is null or id=p_turn);
  end if;
  return result || jsonb_build_object('peerReviewEnabled',coalesce((select peer_review_enabled from class_lesson_plans where class_id=p_class and lesson_plan_id=p_lesson),true));
end;
$$;
revoke all on function public.think_stage_snapshot(uuid,uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.think_stage_snapshot(uuid,uuid,uuid,text,uuid) to service_role;
notify pgrst,'reload schema';


commit;
