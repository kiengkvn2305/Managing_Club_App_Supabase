-- Protect ownership, ledger idempotency and concurrent attendance writes.
-- This migration is additive: historical migrations remain immutable.

create or replace function public.leave_club(p_club_id bigint)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_member_id bigint;
  v_role public.club_role;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select id, role into v_member_id, v_role
  from public.club_members
  where club_id = p_club_id and user_id = auth.uid() and status = 'active'
  for update;
  if v_member_id is null then raise exception 'not_a_member'; end if;
  if v_role = 'owner' then raise exception 'owner_cannot_leave'; end if;

  delete from public.team_managers where club_id = p_club_id and membership_id = v_member_id;
  delete from public.club_members where club_id = p_club_id and id = v_member_id;
  update public.player_profiles set user_id = null
  where club_id = p_club_id and user_id = auth.uid();
  insert into public.audit_logs (club_id, actor_id, action, subject_type, subject_id)
  values (p_club_id, auth.uid(), 'member.left', 'ClubMember', v_member_id);
  return true;
end $$;

revoke all on function public.leave_club(bigint) from public, anon;
grant execute on function public.leave_club(bigint) to authenticated;

-- A replay of one dues request returns the original result instead of collecting twice.
create table if not exists public.dues_collection_requests (
  club_id bigint not null references public.clubs(id) on delete restrict,
  idempotency_key uuid not null,
  player_id bigint not null,
  month date not null,
  months integer not null check (months between 1 and 24),
  settlement_status text not null check (settlement_status in ('paid', 'exempt')),
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (club_id, idempotency_key)
);
alter table public.dues_collection_requests enable row level security;
revoke all on table public.dues_collection_requests from public, anon, authenticated;

create or replace function public.record_player_dues(
  p_club_id bigint,
  p_player_id bigint,
  p_month date,
  p_months integer,
  p_status text,
  p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_existing public.dues_collection_requests;
  v_result jsonb;
begin
  if p_idempotency_key is null then raise exception 'idempotency_key_required'; end if;
  if not public.can_manage_finance(p_club_id)
     or p_months < 1 or p_months > 24 or p_status not in ('paid', 'exempt') then
    raise exception 'forbidden_or_invalid';
  end if;
  perform 1 from public.clubs where id = p_club_id and status = 'active' for update;
  if not found then raise exception 'inactive_club'; end if;

  select * into v_existing from public.dues_collection_requests
  where club_id = p_club_id and idempotency_key = p_idempotency_key;
  if v_existing.club_id is not null then
    if v_existing.player_id <> p_player_id
       or v_existing.month <> date_trunc('month', p_month)::date
       or v_existing.months <> p_months
       or v_existing.settlement_status <> p_status then
      raise exception 'idempotency_conflict';
    end if;
    return v_existing.result;
  end if;

  -- Calls the existing six-argument implementation under the same club lock.
  v_result := public.record_player_dues(
    p_club_id, p_player_id, p_month, p_months, p_status
  );
  insert into public.dues_collection_requests(
    club_id, idempotency_key, player_id, month, months, settlement_status, result
  ) values (
    p_club_id, p_idempotency_key, p_player_id, date_trunc('month', p_month)::date,
    p_months, p_status, v_result
  );
  return v_result;
end $$;

revoke execute on function public.record_player_dues(bigint,bigint,date,integer,text) from authenticated;
revoke all on function public.record_player_dues(bigint,bigint,date,integer,text,uuid) from public, anon;
grant execute on function public.record_player_dues(bigint,bigint,date,integer,text,uuid) to authenticated;

-- Recheck request key only after acquiring the club lock. This serializes retries.
create or replace function public.record_finance_transaction(
  p_club_id bigint,
  p_type public.finance_type,
  p_amount numeric,
  p_occurred_on date,
  p_description text,
  p_receipt_path text default null,
  p_category text default null,
  p_paid_by text default null,
  p_notes text default null,
  p_idempotency_key uuid default null
) returns public.finance_transactions
language plpgsql security definer set search_path = public as $$
declare
  row_value public.finance_transactions;
  v_user_id uuid := auth.uid();
begin
  if not public.can_manage_finance(p_club_id, v_user_id) then raise exception 'forbidden'; end if;
  if p_amount is null or p_amount <= 0
     or p_amount::text in ('NaN', 'Infinity', '-Infinity')
     or p_amount <> round(p_amount, 2)
     or coalesce(trim(p_description), '') = '' then
    raise exception 'forbidden_or_invalid';
  end if;
  if p_idempotency_key is null then raise exception 'idempotency_key_required'; end if;

  perform 1 from public.clubs where id = p_club_id and status = 'active' for update;
  if not found then raise exception 'inactive_club'; end if;
  select * into row_value from public.finance_transactions
  where club_id = p_club_id and idempotency_key = p_idempotency_key;
  if row_value.id is not null then
    if row_value.type is distinct from p_type
       or row_value.amount is distinct from p_amount
       or row_value.occurred_on is distinct from p_occurred_on
       or row_value.description is distinct from trim(p_description) then
      raise exception 'idempotency_conflict';
    end if;
    return row_value;
  end if;

  perform public.assert_financial_period_open(p_club_id, p_occurred_on);
  insert into public.finance_transactions(
    club_id, created_by, type, amount, occurred_on, description, receipt_path,
    category, paid_by, notes, idempotency_key, status
  ) values (
    p_club_id, v_user_id, p_type, p_amount, p_occurred_on, trim(p_description),
    p_receipt_path, p_category, p_paid_by, p_notes, p_idempotency_key, 'posted'
  ) returning * into row_value;
  insert into public.audit_logs(club_id, actor_id, action, subject_type, subject_id)
  values (p_club_id, v_user_id, 'finance.created', 'FinanceTransaction', row_value.id);
  return row_value;
end $$;

revoke all on function public.record_finance_transaction(bigint,public.finance_type,numeric,date,text,text,text,text,text,uuid) from public, anon;
grant execute on function public.record_finance_transaction(bigint,public.finance_type,numeric,date,text,text,text,text,text,uuid) to authenticated;

-- Reversed originals are shown in the ledger, but never counted a second time.
create or replace function public.finance_summary(p_club_id bigint, p_from date, p_to date)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'income', coalesce(sum(amount) filter (where type = 'income' and status = 'posted'), 0),
    'expense', coalesce(sum(amount) filter (where type = 'expense' and status = 'posted'), 0),
    'pending', coalesce(sum(amount) filter (where status = 'pending'), 0),
    'rejected', coalesce(sum(amount) filter (where status = 'rejected'), 0),
    'count', count(*)
  ) from public.finance_transactions
  where club_id = p_club_id and occurred_on between p_from and p_to
    and public.can_view_finance(p_club_id)
$$;

revoke all on function public.finance_summary(bigint,date,date) from public, anon;
grant execute on function public.finance_summary(bigint,date,date) to authenticated;

-- Match rows are serialised by match and protected from direct data API writes.
create or replace function public.save_match_attendance(
  p_club_id bigint,
  p_match_id bigint,
  p_entries jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_match public.club_matches;
  v_entry jsonb;
  v_player_id bigint;
  v_rsvp text;
  v_attendance text;
  v_count integer := 0;
begin
  if not public.can_manage_roster(p_club_id)
     or jsonb_typeof(p_entries) <> 'array' then raise exception 'forbidden_or_invalid'; end if;
  select * into v_match from public.club_matches
  where club_id = p_club_id and id = p_match_id for update;
  if v_match.id is null or v_match.status = 'cancelled' then raise exception 'match_not_available'; end if;
  for v_entry in select value from jsonb_array_elements(p_entries) loop
    v_player_id := nullif(v_entry->>'player_id', '')::bigint;
    v_rsvp := coalesce(v_entry->>'rsvp', 'pending');
    v_attendance := coalesce(v_entry->>'attendance', 'unmarked');
    if v_player_id is null
       or v_rsvp not in ('pending', 'yes', 'no', 'maybe')
       or v_attendance not in ('unmarked', 'present', 'absent', 'late', 'excused')
       or not exists (select 1 from public.player_profiles p where p.club_id = p_club_id and p.id = v_player_id) then
      raise exception 'invalid_attendance_entry';
    end if;
    insert into public.match_attendances(club_id, match_id, player_id, rsvp, attendance)
    values (p_club_id, p_match_id, v_player_id, v_rsvp, v_attendance)
    on conflict (match_id, player_id) do update
      set rsvp = excluded.rsvp, attendance = excluded.attendance, updated_at = now();
    v_count := v_count + 1;
  end loop;
  insert into public.audit_logs(club_id, actor_id, action, subject_type, subject_id)
  values (p_club_id, auth.uid(), 'match.attendance_saved', 'ClubMatch', p_match_id);
  return jsonb_build_object('saved', v_count, 'match_id', p_match_id);
end $$;

revoke insert, update, delete on public.match_attendances from authenticated;
revoke all on function public.save_match_attendance(bigint,bigint,jsonb) from public, anon;
grant execute on function public.save_match_attendance(bigint,bigint,jsonb) to authenticated;

-- Legacy training attendance is JSON. Use optimistic locking and block direct edits.
create or replace function public.guard_training_attendance_write()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.attendance is distinct from old.attendance
     and coalesce(current_setting('app.fcms_training_attendance_write', true), '') <> 'on' then
    raise exception 'attendance_must_use_rpc';
  end if;
  return new;
end $$;

drop trigger if exists guard_training_attendance_write on public.team_trainings;
create trigger guard_training_attendance_write
before update of attendance on public.team_trainings
for each row execute function public.guard_training_attendance_write();

create or replace function public.save_training_attendance(
  p_club_id bigint,
  p_training_id bigint,
  p_attendance jsonb,
  p_expected_updated_at timestamptz default null
) returns public.team_trainings
language plpgsql security definer set search_path = public as $$
declare
  row_value public.team_trainings;
  v_entry jsonb;
  v_player_id bigint;
begin
  if not public.can_manage_activities(p_club_id)
     or jsonb_typeof(p_attendance) <> 'array' then raise exception 'forbidden_or_invalid'; end if;
  select * into row_value from public.team_trainings
  where club_id = p_club_id and id = p_training_id for update;
  if row_value.id is null or row_value.training_status <> 'scheduled' then raise exception 'training_not_available'; end if;
  if p_expected_updated_at is not null and row_value.updated_at <> p_expected_updated_at then
    raise exception 'attendance_stale_reload';
  end if;
  for v_entry in select value from jsonb_array_elements(p_attendance) loop
    v_player_id := nullif(v_entry->>'player_id', '')::bigint;
    if v_player_id is null
       or coalesce(v_entry->>'status', '') not in ('present', 'absent', 'excused')
       or not exists (select 1 from public.player_profiles p where p.club_id = p_club_id and p.id = v_player_id) then
      raise exception 'invalid_attendance_entry';
    end if;
  end loop;
  perform set_config('app.fcms_training_attendance_write', 'on', true);
  update public.team_trainings set attendance = p_attendance
  where id = row_value.id returning * into row_value;
  insert into public.audit_logs(club_id, actor_id, action, subject_type, subject_id)
  values (p_club_id, auth.uid(), 'training.attendance_saved', 'TeamTraining', p_training_id);
  return row_value;
end $$;

revoke all on function public.guard_training_attendance_write() from public, anon, authenticated;
revoke all on function public.save_training_attendance(bigint,bigint,jsonb,timestamptz) from public, anon;
grant execute on function public.save_training_attendance(bigint,bigint,jsonb,timestamptz) to authenticated;
