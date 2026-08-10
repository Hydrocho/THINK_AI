-- Class membership is derived from the student number (GCCNN), not persisted.
UPDATE public.student_accounts
SET class_id = NULL
WHERE class_id IS NOT NULL;
