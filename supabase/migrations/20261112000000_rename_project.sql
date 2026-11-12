begin;
create function public.rename_teaching_project(p_id uuid, p_previous text, p_title text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  new_title text := btrim(p_title);
  actor uuid := auth.uid();
begin
  if new_title is null or new_title = '' then raise exception '프로젝트명을 입력해 주세요.'; end if;
  if not exists (select 1 from public.profiles where id = actor and approval_status = 'approved' and role in ('teacher','admin')) then
    raise exception '승인된 교사만 프로젝트명을 변경할 수 있습니다.';
  end if;
  if exists (select 1 from public.projects where author_id = actor and title = new_title and id <> p_id) then
    raise exception '같은 이름의 프로젝트가 있습니다. 다른 이름을 입력해 주세요.';
  end if;
  update public.projects set title = new_title, updated_at = now()
    where id = p_id and author_id = actor and title = p_previous;
  if not found then raise exception '프로젝트가 변경되었거나 수정 권한이 없습니다. 목록에서 다시 열어 주세요.'; end if;
  update public.class_projects set title = new_title where source_project_id = p_id;
  return new_title;
end;
$$;
revoke all on function public.rename_teaching_project(uuid,text,text) from public, anon;
grant execute on function public.rename_teaching_project(uuid,text,text) to authenticated;
commit;
