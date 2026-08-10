alter table public.classes
  add column subject_name text not null default '미지정';

alter table public.classes
  add column active_lesson_plan_id uuid
  references public.lesson_plans(id)
  on delete set null;

create unique index classes_teacher_grade_class_subject_key
  on public.classes (teacher_id, grade_number, class_number, subject_name);
