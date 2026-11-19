-- Permission hardening for the complete public schema.
-- This migration never disables RLS, never grants ALL, and never deletes data.

grant usage on schema public to anon, authenticated;

-- Remove Supabase default DML grants before applying the explicit matrix below.
revoke all privileges on all tables in schema public from anon, authenticated;
revoke all privileges on all sequences in schema public from anon, authenticated;
revoke all privileges on all functions in schema public from anon, authenticated;

-- Profile rows are visible only to the current user or a user sharing an active club.
create or replace function public.can_view_profile(p_user_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_user_id=auth.uid() or exists (
    select 1
    from public.club_members viewer
    join public.club_members target on target.club_id=viewer.club_id and target.status='active'
    where viewer.user_id=auth.uid() and viewer.status='active' and target.user_id=p_user_id
  )
$$;

drop policy if exists profiles_self_select on public.profiles;
drop policy if exists profiles_visible_select on public.profiles;
create policy profiles_visible_select on public.profiles for select to authenticated using (public.can_view_profile(id));

-- Missing read policy for polls used by the frontend.
drop policy if exists club_polls_select on public.club_polls;
create policy club_polls_select on public.club_polls for select to authenticated using (public.is_active_member(club_id));

-- Sensitive records: read policies only; all writes go through RPCs.
drop policy if exists audit_logs_select on public.audit_logs;
drop policy if exists audit_logs_manager_select on public.audit_logs;
create policy audit_logs_manager_select on public.audit_logs for select to authenticated using (public.can_manage_club(club_id));

drop policy if exists finance_read_write on public.finance_transactions;
drop policy if exists finance_select on public.finance_transactions;
create policy finance_select on public.finance_transactions for select to authenticated using (public.can_view_finance(club_id));

drop policy if exists dues_read_write on public.team_dues_entries;
drop policy if exists dues_select on public.team_dues_entries;
create policy dues_select on public.team_dues_entries for select to authenticated using (public.can_view_finance(club_id));

drop policy if exists dues_adjustments_write on public.team_dues_adjustments;
drop policy if exists dues_adjustments_select on public.team_dues_adjustments;
create policy dues_adjustments_select on public.team_dues_adjustments for select to authenticated using (public.can_view_finance(club_id));

drop policy if exists planned_expenses_write on public.planned_expenses;
drop policy if exists planned_expenses_select on public.planned_expenses;
create policy planned_expenses_select on public.planned_expenses for select to authenticated using (public.can_view_finance(club_id));

drop policy if exists match_costs_write on public.match_cost_splits;
drop policy if exists match_costs_select on public.match_cost_splits;
create policy match_costs_select on public.match_cost_splits for select to authenticated using (public.can_view_finance(club_id));
drop policy if exists match_cost_receivables_write on public.match_cost_receivables;
drop policy if exists match_cost_receivables_select on public.match_cost_receivables;
create policy match_cost_receivables_select on public.match_cost_receivables for select to authenticated using (public.can_view_finance(club_id));

drop policy if exists periods_write on public.financial_periods;
drop policy if exists periods_select on public.financial_periods;
create policy periods_select on public.financial_periods for select to authenticated using (public.can_view_finance(club_id));
drop policy if exists approvals_write on public.transaction_approvals;
drop policy if exists approvals_select on public.transaction_approvals;
create policy approvals_select on public.transaction_approvals for select to authenticated using (public.can_view_finance(club_id));
drop policy if exists payments_write on public.payments;
drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments for select to authenticated using (public.can_view_finance(club_id));
drop policy if exists allocations_read on public.payment_allocations;
drop policy if exists allocations_select on public.payment_allocations;
create policy allocations_select on public.payment_allocations for select to authenticated using (public.can_view_finance(club_id));
drop policy if exists funds_write on public.funds;
drop policy if exists funds_select on public.funds;
create policy funds_select on public.funds for select to authenticated using (public.can_view_finance(club_id));

-- Team manager/player links are read-only from Data API; roster mutations use RPCs.
drop policy if exists team_managers_insert on public.team_managers;
drop policy if exists team_managers_update on public.team_managers;
drop policy if exists team_managers_delete on public.team_managers;
drop policy if exists team_players_insert on public.team_players;
drop policy if exists team_players_update on public.team_players;
drop policy if exists team_players_delete on public.team_players;

-- Poll elector/vote visibility is private to the voter, except club managers.
drop policy if exists club_poll_electors_select on public.club_poll_electors;
create policy club_poll_electors_select on public.club_poll_electors for select to authenticated using (user_id=auth.uid() or public.can_manage_roster(club_id));
drop policy if exists club_poll_votes_select on public.club_poll_votes;
create policy club_poll_votes_select on public.club_poll_votes for select to authenticated using (user_id=auth.uid() or public.can_manage_roster(club_id));

-- Explicit table grants. RLS policies above remain the row-level boundary.
grant select on public.clubs, public.club_members, public.teams, public.player_profiles,
  public.team_managers, public.team_players, public.club_board_members, public.board_membership_periods,
  public.board_dues_rates, public.shared_board_dues_rates, public.board_tasks,
  public.club_celebrations, public.team_trainings, public.club_awards,
  public.club_matches, public.match_lineups, public.match_attendances, public.player_match_stats,
  public.inventory_items, public.inventory_assignments, public.inventory_movements,
  public.club_polls, public.club_poll_options, public.club_poll_electors, public.club_poll_votes,
  public.recruitment_posts, public.recruitment_applications,
  public.sponsors, public.sponsorships, public.sponsorship_receipts,
  public.discipline_cases, public.discipline_case_history,
  public.seasons, public.club_events, public.notifications, public.club_public_settings
  to authenticated;

grant select on public.finance_transactions, public.financial_periods, public.funds,
  public.transaction_approvals, public.payments, public.payment_allocations,
  public.planned_expenses, public.team_dues_entries, public.team_dues_adjustments,
  public.match_cost_splits, public.match_cost_receivables
  to authenticated;

grant select (id,name,email,avatar_path,created_at,updated_at) on table public.profiles to authenticated;
grant update (name,email,avatar_path) on public.profiles to authenticated;

grant update (name,description,city,home_ground,format,formats,status,is_discoverable,avatar_path,background_path,deleted_at) on public.clubs to authenticated;
grant update (title) on public.club_members to authenticated;

grant insert, update on public.teams to authenticated;
grant insert, update, delete on public.player_profiles to authenticated;
grant insert, update on public.club_board_members, public.board_membership_periods, public.shared_board_dues_rates, public.board_tasks to authenticated;
grant insert, update on public.club_celebrations, public.team_trainings, public.club_awards to authenticated;
grant insert, update on public.club_matches, public.match_lineups, public.match_attendances, public.player_match_stats to authenticated;
grant insert on public.inventory_items to authenticated;
grant insert, update on public.recruitment_posts, public.recruitment_applications to authenticated;
grant insert, update on public.sponsors, public.sponsorships, public.sponsorship_receipts to authenticated;
grant update on public.notifications to authenticated;

-- Dues rates are configuration data; the policy limits writes to finance managers.
drop policy if exists team_dues_rates_select on public.team_dues_rates;
create policy team_dues_rates_select on public.team_dues_rates for select to authenticated using (public.can_view_finance(club_id));
grant select, insert, update on public.team_dues_rates to authenticated;

-- Public website settings are the only public table readable without a session.
grant select on public.club_public_settings to anon;

-- Only direct-insert tables need sequence usage. RPC-owned sequences stay private.
grant usage on sequence public.teams_id_seq, public.player_profiles_id_seq,
  public.club_board_members_id_seq, public.board_membership_periods_id_seq,
  public.shared_board_dues_rates_id_seq, public.board_tasks_id_seq,
  public.club_celebrations_id_seq, public.team_trainings_id_seq, public.club_awards_id_seq,
  public.club_matches_id_seq, public.match_lineups_id_seq, public.match_attendances_id_seq,
  public.player_match_stats_id_seq, public.inventory_items_id_seq,
  public.recruitment_posts_id_seq, public.recruitment_applications_id_seq,
  public.sponsors_id_seq, public.sponsorships_id_seq, public.sponsorship_receipts_id_seq,
  public.notifications_id_seq
  to authenticated;

-- RLS helper functions are needed by authenticated policy evaluation, never by anon.
grant execute on function public.is_active_member(bigint,uuid), public.club_role(bigint,uuid),
  public.can_manage_roster(bigint,uuid), public.can_manage_club(bigint,uuid),
  public.can_view_finance(bigint,uuid), public.can_manage_finance(bigint,uuid),
  public.can_view_inventory(bigint,uuid), public.can_manage_inventory(bigint,uuid),
  public.can_view_activities(bigint,uuid), public.can_manage_activities(bigint,uuid),
  public.can_manage_people(bigint,uuid), public.can_view_profile(uuid)
  to authenticated;
revoke all on function public.can_view_profile(uuid) from anon;

-- RPC allow-list. All other public functions remain inaccessible through Data API.
grant execute on function public.create_club(text,text,text,text,jsonb),
  public.accept_club_invitation(text),
  public.create_club_invitation(bigint,text,public.club_role),
  public.claim_player_profile(bigint), public.unlink_player_profile(bigint),
  public.record_finance_transaction(bigint,public.finance_type,numeric,date,text,text,text,text,text,uuid),
  public.record_inventory_movement(bigint,bigint,text,integer,text),
  public.record_player_dues(bigint,bigint,date,integer,text),
  public.correct_team_dues(bigint,bigint,bigint,date,text,text,text),
  public.sync_team_players(bigint,bigint,bigint[]),
  public.set_player_primary_team(bigint,bigint,bigint),
  public.set_team_player_attribute(bigint,bigint,bigint,text,text),
  public.create_match_cost_split(bigint,bigint,numeric,numeric,numeric,numeric,numeric,numeric,text,jsonb),
  public.assign_inventory(bigint,bigint,bigint,integer,text),
  public.return_inventory_assignment(bigint,bigint,bigint,integer,text),
  public.update_inventory_item(bigint,bigint,text,text,text,text,integer,text),
  public.archive_inventory_item(bigint,bigint), public.restore_inventory_item(bigint,bigint),
  public.save_planned_expense(bigint,bigint,text,numeric,text,date,date),
  public.cancel_planned_expense(bigint,bigint,date),
  public.create_club_poll(bigint,text,text,timestamptz,jsonb),
  public.cast_club_poll_vote(bigint,bigint,bigint),
  public.delete_player_match_stat(bigint,bigint,bigint),
  public.create_friendly_invitation(bigint,bigint,date,text,text,text),
  public.respond_friendly_invitation(bigint,bigint,text),
  public.commit_member_import(bigint,jsonb,jsonb),
  public.create_discipline_case(bigint,bigint,date,text,text,text,text,numeric),
  public.update_discipline_case(bigint,bigint,bigint,date,text,text,text,text,numeric,text),
  public.create_financial_period(bigint,date,date), public.close_financial_period(bigint,bigint),
  public.request_finance_approval(bigint,bigint), public.decide_finance_approval(bigint,bigint,text,text),
  public.reverse_finance_transaction(bigint,bigint,text,uuid),
  public.post_finance_payment(bigint,bigint,numeric,date,text,jsonb,uuid),
  public.finance_summary(bigint,date,date)
  to authenticated;
