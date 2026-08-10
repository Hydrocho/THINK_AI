-- Preserve student accounts when a class is deleted (set class_id to NULL instead of cascading delete).

ALTER TABLE public.student_accounts
  DROP CONSTRAINT IF EXISTS student_accounts_class_id_fkey;

ALTER TABLE public.student_accounts
  ALTER COLUMN class_id DROP NOT NULL;

ALTER TABLE public.student_accounts
  ADD CONSTRAINT student_accounts_class_id_fkey
  FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE SET NULL;
