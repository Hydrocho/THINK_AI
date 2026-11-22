alter table public.lesson_plans add column review_resource text not null default '';
create function public.edit_teaching_lesson(
  p_id uuid,p_title text,p_question text,p_mode text,p_limit integer,p_stages text[],
  p_background text,p_ai_reference text,p_review_resource text
) returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.edit_teaching_lesson(p_id,p_title,p_question,p_mode,p_limit,p_stages,p_background,p_ai_reference);
  update public.lesson_plans set review_resource=coalesce(btrim(p_review_resource),'') where id=p_id;
end;
$$;
revoke all on function public.edit_teaching_lesson(uuid,text,text,text,integer,text[],text,text,text) from public,anon;
grant execute on function public.edit_teaching_lesson(uuid,text,text,text,integer,text[],text,text,text) to authenticated;
notify pgrst,'reload schema';
