alter table public.classes add column school_level text
  check (school_level in ('초등학교', '중학교', '고등학교'));

update public.classes set school_level='중학교'
where id='fbb8cef3-3e83-4258-9b49-a04e6e19a7f6' and grade_number=3 and class_number=1;
