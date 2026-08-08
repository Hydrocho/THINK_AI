-- Migration: Allow approved teachers to insert, update, and delete their own classes
create policy "approved teachers insert classes"
  on public.classes for insert to authenticated
  with check ((select private.is_approved_teacher()));

create policy "approved teachers update classes"
  on public.classes for update to authenticated
  using ((select private.is_approved_teacher()));

create policy "approved teachers delete classes"
  on public.classes for delete to authenticated
  using ((select private.is_approved_teacher()));
