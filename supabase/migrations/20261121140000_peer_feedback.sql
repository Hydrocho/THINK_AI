begin;
create or replace function public.think_workflow(
  p_actor uuid, p_class uuid, p_lesson uuid, p_action text,
  p_stage text default 'T', p_payload jsonb default '{}'
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  c public.classes%rowtype; l public.lesson_plans%rowtype;
  r public.think_records%rowtype; t public.think_chat_turns%rowtype;
  sn text; mode text; active boolean; request_id uuid; result jsonb;
  peers jsonb; student record; assignment_seed bigint; total integer; new_content text;
begin
  select * into c from public.classes where id=p_class;
  select * into l from public.lesson_plans where id=p_lesson;
  if c.id is null or l.id is null or not exists(
    select 1 from public.class_projects where class_id=p_class and source_version_id=l.project_version_id
  ) then raise exception '학급에 연결된 차시가 아닙니다.'; end if;
  if p_action='assign' then
    if c.teacher_id<>p_actor or not exists(select 1 from public.profiles where id=p_actor
      and role in ('teacher','admin') and approval_status='approved') then raise exception '배정 권한이 없습니다.'; end if;
    perform pg_advisory_xact_lock(hashtextextended(p_class::text||p_lesson::text,0));
    assignment_seed:=hashtextextended(gen_random_uuid()::text,0);
    for student in select auth_user_id,hashtextextended(auth_user_id::text,assignment_seed) as position from public.student_accounts where student_number ~ '^[0-9]{5}$'
      and left(student_number,3)=c.grade_number::text||lpad(c.class_number::text,2,'0') and auth_user_id is not null
    loop
      select coalesce(jsonb_agg(jsonb_build_object('id',gen_random_uuid(),'text',content)),'[]') into peers
      from (select tr.content from public.think_records tr join public.student_accounts sa on sa.auth_user_id=tr.student_id
        where tr.class_id=p_class and tr.lesson_id=p_lesson and tr.stage='T' and tr.submitted_at is not null
        and tr.student_id<>student.auth_user_id and btrim(tr.content)<>''
        and left(sa.student_number,3)=c.grade_number::text||lpad(c.class_number::text,2,'0')
        order by (hashtextextended(tr.student_id::text,assignment_seed) <= student.position),
          hashtextextended(tr.student_id::text,assignment_seed) limit 6) choices;
      -- Keep existing nonempty assignments stable. Empty sets can be filled later.
      insert into public.think_peer_sets values(p_class,p_lesson,student.auth_user_id,peers,now())
      on conflict(class_id,lesson_id,student_id) do update set opinions=excluded.opinions,created_at=now()
      where jsonb_array_length(think_peer_sets.opinions)=0;
    end loop;
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
    -- Expired pending requests do not consume a question indefinitely.
    update public.think_chat_turns set status='failed',error='응답 시간이 초과되었습니다. 다시 질문해 주세요.',updated_at=now()
    where class_id=p_class and lesson_id=p_lesson and student_id=p_actor and status='pending' and updated_at<now()-interval '120 seconds';
    select jsonb_build_object(
      'records',coalesce((select jsonb_agg(to_jsonb(x)-'lease'-'last_request') from public.think_records x
        where class_id=p_class and lesson_id=p_lesson and student_id=p_actor),'[]'),
      'peers',coalesce((select opinions from public.think_peer_sets where class_id=p_class and lesson_id=p_lesson and student_id=p_actor),'[]'),
      'turns',coalesce((select jsonb_agg(to_jsonb(x)-'attempt' order by created_at) from public.think_chat_turns x
        where class_id=p_class and lesson_id=p_lesson and student_id=p_actor),'[]'),
      'access',coalesce((select jsonb_object_agg(stage_code,case when coalesce(active,false) then access_mode else 'hidden' end)
        from public.class_lesson_stage_access where class_id=p_class and lesson_plan_id=p_lesson),'{}'),
      'remaining',greatest(0,l.ai_question_limit-(select count(*) from public.think_chat_turns
        where class_id=p_class and lesson_id=p_lesson and student_id=p_actor and status in ('pending','succeeded'))),
      'active',coalesce(active,false)) into result;
    return result;
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
    if p_stage in ('H','N') and coalesce(p_payload->'metadata'->>'selectedPeerOpinion','')<>'' and not exists(
      select 1 from public.think_peer_sets ps,jsonb_array_elements(ps.opinions) op
      where ps.class_id=p_class and ps.lesson_id=p_lesson and ps.student_id=p_actor and op->>'id'=p_payload->'metadata'->>'selectedPeerOpinion'
    ) then raise exception '배정된 의견만 선택할 수 있습니다.'; end if;
    -- Check each reaction against this student's immutable anonymous assignment.
    if p_stage='H' and p_payload->'metadata' ? 'feedback' then
      select opinions into peers from public.think_peer_sets
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
      p_payload:=p_payload || jsonb_build_object('submit',jsonb_array_length(peers)>0 and not exists(
        select 1 from jsonb_array_elements(peers) op
        where (p_payload->'metadata'->'feedback'->(op->>'id')->>'reaction') is null));
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
commit;
