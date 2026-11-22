begin;
create or replace function public.teacher_n_rankings(p_actor uuid,p_class uuid,p_lesson uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb;
begin
  if not exists(select 1 from classes c join profiles p on p.id=c.teacher_id
    join class_projects cp on cp.class_id=c.id
    join lesson_plans l on l.project_version_id=cp.source_version_id
    where c.id=p_class and c.teacher_id=p_actor and l.id=p_lesson
      and p.role in ('teacher','admin') and p.approval_status='approved') then
    raise exception '학급 반응을 조회할 권한이 없습니다.';
  end if;
  with totals as (
    select r.student_id,r.content,
      count(distinct f.reader) filter(where f.recommended) stars,
      count(distinct f.reader) filter(where f.reaction is not null) likes,
      count(distinct f.reader) filter(where f.reaction='similar') similar_count,
      count(distinct f.reader) filter(where f.reaction='newView') new_view,
      count(distinct f.reader) filter(where f.reaction='curious') curious
    from think_records r
    join think_review_readings f on f.class_id=r.class_id and f.lesson_id=r.lesson_id and f.author=r.student_id
    where r.class_id=p_class and r.lesson_id=p_lesson and r.stage='N' and r.submitted_at is not null
    group by r.student_id,r.content
  )
  select coalesce(jsonb_agg(jsonb_build_object('content',content,'stars',stars,'likes',likes,'similar',similar_count,'newView',new_view,'curious',curious)
    order by stars desc,likes desc,student_id),'[]'::jsonb) into result
  from totals where stars>0 or likes>0;
  return result;
end $$;
revoke all on function public.teacher_n_rankings(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.teacher_n_rankings(uuid,uuid,uuid) to service_role;
commit;
