-- now() is transaction-scoped in PostgreSQL. Use a real wall-clock revision so
-- optimistic locks can distinguish two writes within one transaction as well.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = clock_timestamp();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public, anon, authenticated;
