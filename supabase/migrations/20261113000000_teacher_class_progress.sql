begin;
create function public.teacher_class_progress()
returns table(class_id uuid, subject text, grade int, room int, roster bigint,
  project_title text, lesson_id uuid, lesson_order int, lesson_title text,
  active boolean, stages text[], writable text[], submissions jsonb)
language sql stable security definer set search_path='' as $$
 select c.id,c.subject_name,c.grade_number,c.class_number,
   (select count(*) from public.student_accounts s where left(s.student_number,3)=c.grade_number::text||lpad(c.class_number::text,2,'0')),
   cp.title,l.id,l.lesson_order,l.title,coalesce(c.active_lesson_plan_id=l.id,false),l.think_stages,
   array(select a.stage_code from public.class_lesson_stage_access a where a.class_id=c.id
     and a.lesson_plan_id=l.id and a.access_mode='writable' order by strpos('THINK',a.stage_code)),
   coalesce((select jsonb_object_agg(g.stage,g.n) from (
     select r.stage,count(*) n from public.think_records r
     join public.student_accounts s on s.auth_user_id=r.student_id
     where r.class_id=c.id and r.lesson_id=l.id and r.submitted_at is not null
       and left(s.student_number,3)=c.grade_number::text||lpad(c.class_number::text,2,'0')
     group by r.stage) g),'{}'::jsonb)
 from public.classes c join public.profiles p on p.id=c.teacher_id
 left join public.class_projects cp on cp.class_id=c.id
 left join public.lesson_plans l on l.project_version_id=cp.source_version_id
 where c.teacher_id=auth.uid() and p.approval_status='approved' and p.role in ('teacher','admin')
 order by c.subject_name,c.grade_number,c.class_number,cp.title,l.lesson_order;
$$;
revoke all on function public.teacher_class_progress() from public,anon;
grant execute on function public.teacher_class_progress() to authenticated;
commit;
