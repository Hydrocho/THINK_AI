begin;
-- Per-reader handles keep student IDs and reaction ownership off the student screen.
create table public.think_review_readings (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null, lesson_id uuid not null, stage text not null default 'N' check(stage='N'),
  reader uuid not null, author uuid not null check(author<>reader), position integer not null,
  reaction text check(reaction in ('similar','newView','curious')), recommended boolean not null default false,
  unique(class_id,lesson_id,reader,author),
  foreign key(class_id,lesson_id,reader,stage) references public.think_records on delete cascade,
  foreign key(class_id,lesson_id,author,stage) references public.think_records on delete cascade
);
alter table public.think_review_readings enable row level security;
revoke all on public.think_review_readings from public,anon,authenticated;
grant select on public.think_review_readings to service_role;

create function public.think_review_reading(p_actor uuid,p_class uuid,p_lesson uuid,p_action text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare mode text; seed uuid; existing uuid[]; additions uuid[]; h_order uuid[]; combined uuid[];
  common uuid[]; newcomer uuid; ring uuid[]; start_at integer; result jsonb;
begin
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
commit;
