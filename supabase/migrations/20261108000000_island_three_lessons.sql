-- Replace only the known five-lesson genetics curriculum. Keep old lesson IDs
-- and responses intact in their historical version; never relabel old answers.
-- Customized/partial projects are intentionally left untouched for review.
begin;
do $migration$
declare
  candidate record;
  new_version uuid;
begin
  for candidate in
    select p.id, p.author_id, v.id old_version, v.version_number
    from public.projects p
    join lateral (
      select pv.* from public.project_versions pv
      where pv.project_id = p.id order by pv.version_number desc limit 1
    ) v on true
    where p.title in (
      '유전자 조작 기술, 인간에게 축복일까? 재앙일까?',
      '유전자 조작 기술, 축복일까? 재앙일까?',
      '유전자 조작 기술 (친구 및 AI와 생각을 넓히고 나의 생각을 세우기)'
    )
    and (select count(*) from public.lesson_plans l where l.project_version_id = v.id) = 5
    and exists (select 1 from public.lesson_plans l where l.project_version_id = v.id and l.lesson_order = 1 and l.core_question = '사람에게 나타나는 다양한 특징 중 부모에게서 물려받는 것은 어떤 것이 있을까?')
    and exists (select 1 from public.lesson_plans l where l.project_version_id = v.id and l.lesson_order = 5 and (l.title like '%색각%' or l.core_question = '우리 주변에서 색깔만으로 정보를 구분하는 사례는 무엇인가? 특정 색을 구분하기 힘든 사람을 위한 해결 방안을 제시해보자.'))
  loop
    perform 1 from public.projects where id = candidate.id for update;
    insert into public.project_versions(project_id, version_number, created_by, assessment_criteria)
    values(candidate.id, candidate.version_number + 1, candidate.author_id, '')
    returning id into new_version;

    insert into public.lesson_plans(project_version_id, lesson_order, title, core_question, think_stages, ai_question_limit, ai_response_mode, student_access_mode)
    values
      (new_version, 1, '진실을 알게 된 나라면?', '영화 속 사람들은 ‘아일랜드’에 가는 것을 행운이라고 믿는다. 나만 그곳의 진실을 알게 되었는데, 가장 친한 친구가 당첨되어 기뻐하고 있다면 나는 어떻게 할까? 친구가 “너는 내가 당첨된 게 질투 나는 거지?”라며 믿지 않는다면, 그다음에는 어떻게 할까?', array['T','H','I','N','K'], 12, 'THOUGHT_PROVOKING', 'hidden'),
      (new_version, 2, '내 가족을 살릴 수 있다면?', '내 가족이 위독하다. 영화 속 회사는 복제인간에게서 장기를 받으면 살릴 수 있다고 말한다. 그런데 수술을 앞두고 그 복제인간이 나를 만나고 싶다고 한다. 나는 그 사람과 어떤 이야기를 나누게 될까? 만남 이후에도 내 선택은 같을까?', array['T','H','I','N','K'], 12, 'THOUGHT_PROVOKING', 'hidden'),
      (new_version, 3, '내 유전자를 바꿀 수 있다면?', '유전자를 바꿔 질병을 치료하거나 원하는 특징을 가질 수 있는 시대가 왔다고 가정해 보자. 친구가 말했다. “나는 바꿀 거야. 너는?” 나는 무엇을 바꾸고 무엇을 그대로 두고 싶을까? 이런 선택이 흔해진 학교에서 우리는 어떻게 살아가게 될까?', array['T','H','I','N','K'], 12, 'THOUGHT_PROVOKING', 'hidden');

    -- Stop displaying a retired lesson. Teachers explicitly open a new lesson.
    update public.classes c set active_lesson_plan_id = null
    where c.active_lesson_plan_id in (
      select id from public.lesson_plans where project_version_id = candidate.old_version
    );
    update public.lesson_plans set student_access_mode = 'hidden',
      think_stage_access = '{"T":"hidden","H":"hidden","I":"hidden","N":"hidden","K":"hidden"}'::jsonb
    where project_version_id = candidate.old_version;
    update public.class_lesson_stage_access set access_mode = 'hidden', updated_at = now()
    where lesson_plan_id in (select id from public.lesson_plans where project_version_id = candidate.old_version);
    update public.class_projects set source_version_id = new_version, title = '유전자 조작 기술 (친구 및 AI와 생각을 넓히고 나의 생각을 세우기)'
    where source_project_id = candidate.id and source_version_id = candidate.old_version;
    update public.projects set title = '유전자 조작 기술 (친구 및 AI와 생각을 넓히고 나의 생각을 세우기)', updated_at = now()
    where id = candidate.id;
  end loop;
end
$migration$;
commit;
