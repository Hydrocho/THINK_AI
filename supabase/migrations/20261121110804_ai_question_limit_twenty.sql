begin;
alter table public.lesson_plans alter column ai_question_limit set default 20;
update public.lesson_plans set ai_question_limit=20 where ai_question_limit is distinct from 20;
commit;
