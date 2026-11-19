-- Remove the default PUBLIC EXECUTE grant created for the new RPC.
revoke all on function public.sync_team_managers(bigint,bigint,bigint[]) from public, anon, authenticated;
grant execute on function public.sync_team_managers(bigint,bigint,bigint[]) to authenticated;
