begin;
create function public.edit_teaching_lesson(p_id uuid, p_title text, p_question text, p_mode text, p_limit integer, p_stages text[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  if nullif(btrim(p_title),'') is null or nullif(btrim(p_question),'') is null then
    raise exception '차시 제목과 핵심 질문을 입력해 주세요.';
  end if;
  if p_mode not in ('GENERAL','THOUGHT_PROVOKING') or p_limit not between 1 and 30
    or coalesce(cardinality(p_stages),0)=0 or not p_stages <@ array['T','H','I','N','K'] then
    raise exception '차시 설정을 확인해 주세요.';
  end if;
  update public.lesson_plans l set title=btrim(p_title), core_question=btrim(p_question),
    ai_response_mode=p_mode, ai_question_limit=p_limit, think_stages=p_stages
  from public.project_versions v join public.projects p on p.id=v.project_id
    join public.profiles a on a.id=p.author_id
  where l.id=p_id and l.project_version_id=v.id and a.id=auth.uid()
    and a.approval_status='approved' and a.role in ('teacher','admin');
  if not found then raise exception '차시를 찾을 수 없거나 수정 권한이 없습니다.'; end if;
end;
$$;
revoke all on function public.edit_teaching_lesson(uuid,text,text,text,integer,text[]) from public,anon;
grant execute on function public.edit_teaching_lesson(uuid,text,text,text,integer,text[]) to authenticated;
commit;
