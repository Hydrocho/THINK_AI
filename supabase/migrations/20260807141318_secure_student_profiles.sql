create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, role, display_name, email, approval_status)
  values (
    new.id,
    case when new.email like 'student_%@school.internal' then 'student' else 'teacher' end,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', new.email),
    new.email,
    case when new.email like 'student_%@school.internal' then 'approved' else 'pending' end
  )
  on conflict (id) do update set
    display_name = coalesce(excluded.display_name, public.profiles.display_name),
    email = excluded.email;
  return new;
end;
$$;

update public.profiles
set role = 'student', approval_status = 'approved'
where email like 'student_%@school.internal';
