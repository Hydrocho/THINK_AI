create table public.think_chat_usage (
  turn_id uuid not null references public.think_chat_turns(id) on delete cascade,
  attempt uuid not null,
  model text not null,
  finish_reason text,
  usage_metadata jsonb,
  created_at timestamptz not null default now(),
  primary key(turn_id,attempt)
);
alter table public.think_chat_usage enable row level security;
revoke all on public.think_chat_usage from public,anon,authenticated;

create function public.finish_think_chat(p_actor uuid,p_class uuid,p_lesson uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  result jsonb;
begin
  result:=public.think_workflow(p_actor,p_class,p_lesson,'chat_finish','I',p_payload);
  if result->>'id' is not null then
    insert into public.think_chat_usage(turn_id,attempt,model,finish_reason,usage_metadata)
    values((result->>'id')::uuid,(result->>'attempt')::uuid,p_payload->>'model',
      p_payload->>'finishReason',nullif(p_payload->'usageMetadata','null'::jsonb))
    on conflict(turn_id,attempt) do nothing;
  end if;
  return result;
end;
$$;
revoke all on function public.finish_think_chat(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.finish_think_chat(uuid,uuid,uuid,jsonb) to service_role;
notify pgrst, 'reload schema';
