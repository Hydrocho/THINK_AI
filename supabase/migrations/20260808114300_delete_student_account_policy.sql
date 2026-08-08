-- Migration: Allow approved teachers to delete student accounts and student activity history
create policy "approved teachers delete student accounts"
  on public.student_accounts for delete to authenticated
  using ((select private.is_approved_teacher()));

create policy "approved teachers delete student messages"
  on public.messages for delete to authenticated
  using ((select private.is_approved_teacher()));

create policy "approved teachers delete student submissions"
  on public.submissions for delete to authenticated
  using ((select private.is_approved_teacher()));

create policy "approved teachers delete student peer reviews"
  on public.peer_reviews for delete to authenticated
  using ((select private.is_approved_teacher()));

create policy "approved teachers delete student peer assignments"
  on public.peer_assignments for delete to authenticated
  using ((select private.is_approved_teacher()));

create policy "approved teachers delete student ai evidence"
  on public.ai_evidence for delete to authenticated
  using ((select private.is_approved_teacher()));

create policy "approved teachers delete student teacher assessments"
  on public.teacher_assessments for delete to authenticated
  using ((select private.is_approved_teacher()));
