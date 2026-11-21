begin;
alter table public.lesson_plans add column if not exists background_description text not null default '';
comment on column public.lesson_plans.background_description is 'Optional lesson context shown in a student dialog and supplied to AI with the core question.';

-- Keep the six-argument RPC for older clients. It leaves background untouched.
create or replace function public.edit_teaching_lesson(
  p_id uuid, p_title text, p_question text, p_mode text, p_limit integer, p_stages text[], p_background text
) returns void language plpgsql security definer set search_path = '' as $$
begin
  -- The existing RPC validates settings and authenticated teacher ownership.
  perform public.edit_teaching_lesson(p_id,p_title,p_question,p_mode,p_limit,p_stages);
  update public.lesson_plans set background_description=coalesce(btrim(p_background),'') where id=p_id;
end;
$$;
revoke all on function public.edit_teaching_lesson(uuid,text,text,text,integer,text[],text) from public,anon;
grant execute on function public.edit_teaching_lesson(uuid,text,text,text,integer,text[],text) to authenticated;
notify pgrst, 'reload schema';
commit;
