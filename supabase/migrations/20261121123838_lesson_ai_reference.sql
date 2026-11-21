begin;
alter table public.lesson_plans add column ai_reference text not null default '';

create function public.edit_teaching_lesson(
  p_id uuid, p_title text, p_question text, p_mode text, p_limit integer,
  p_stages text[], p_background text, p_ai_reference text
) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.edit_teaching_lesson(p_id,p_title,p_question,p_mode,p_limit,p_stages,p_background);
  update public.lesson_plans set ai_reference=coalesce(btrim(p_ai_reference),'') where id=p_id;
end;
$$;
revoke all on function public.edit_teaching_lesson(uuid,text,text,text,integer,text[],text,text) from public,anon;
grant execute on function public.edit_teaching_lesson(uuid,text,text,text,integer,text[],text,text) to authenticated;

update public.lesson_plans as lesson set ai_reference=notes.note
from (values
  ('f59c1755-7c64-4820-bdc1-81cfd02f3da9'::uuid,'유전자 검사 결과와 학생이 실제로 좋아하거나 잘하는 일을 구분해 주세요. 학생의 생각에 따라 한 분야를 일찍 꾸준히 배울 기회, 관심이 바뀌었을 때 다른 분야를 선택할 기회를 함께 살펴볼 수 있습니다.'),
  ('64bb5405-b27e-49dc-a341-9084fbc4b364'::uuid,'유전적으로 비슷한 동물도 기억과 경험까지 공유하는 것은 아니라는 점을 짚어 주세요. 학생이 말한 이유에 따라 반려동물을 잃은 보호자의 마음과 선택, 새로 태어날 동물과 복제 과정에 참여하는 동물의 삶을 살펴볼 수 있습니다.'),
  ('b9271979-e929-4367-a809-6f1466d44238'::uuid,'질환과 관련된 유전적 특성을 물려받는 것과 실제로 질환이 나타나는 것을 구분하고, 사례에 제시된 조건을 확인해 주세요. 학생의 질문에 따라 질환 예방을 바라는 가족의 선택, 태어날 아이와 다음 세대에 미칠 영향의 불확실성, 이용 기회의 공정성을 살펴볼 수 있습니다.')
) as notes(id,note) where lesson.id=notes.id;
notify pgrst, 'reload schema';
commit;
