-- Fix the enum assignment found by the schema linter.
create or replace function public.admin_toggle_club_status(
  p_club_id bigint,
  p_status text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_system_admin(auth.uid()) then
    raise exception 'forbidden_admin_only';
  end if;
  if p_status not in ('active', 'archived') then
    raise exception 'invalid_status';
  end if;
  update public.clubs
  set status = p_status::public.club_status,
      updated_at = now()
  where id = p_club_id;
  if not found then
    raise exception 'club_not_found';
  end if;
  return jsonb_build_object('id', p_club_id, 'status', p_status);
end;
$$;

revoke all on function public.admin_toggle_club_status(bigint,text) from public, anon;
grant execute on function public.admin_toggle_club_status(bigint,text) to authenticated;
