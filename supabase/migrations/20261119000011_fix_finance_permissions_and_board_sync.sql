-- 20261119000011_fix_finance_permissions_and_board_sync.sql
-- Fixes finance management and view permissions for all authorized roles,
-- titles, and active board members (BCN), resolving forbidden errors when recording finance.

-- 1. Helper function: check if a title represents finance / executive authority
create or replace function public.is_finance_title(p_title text) returns boolean
language sql immutable set search_path = public as $$
  select coalesce(
    lower(trim(p_title)) in (
      'chủ nhiệm', 'chủ nhiệm clb', 'phó chủ nhiệm', 'phó chủ nhiệm clb',
      'thủ quỹ', 'thủ quỹ clb', 'kế toán', 'quản lý tài chính', 'hlv',
      'huấn luyện viên', 'ban chủ nhiệm', 'bcn', 'cán sự', 'trưởng ban tài chính',
      'quản lý quỹ', 'uỷ viên', 'ủy viên'
    )
    or lower(p_title) ilike '%thủ quỹ%'
    or lower(p_title) ilike '%tài chính%'
    or lower(p_title) ilike '%chủ nhiệm%'
    or lower(p_title) ilike '%kế toán%'
    or lower(p_title) ilike '%quản lý%'
    or lower(p_title) ilike '%bcn%'
    or lower(p_title) ilike '%ban chủ nhiệm%',
    false
  );
$$;

revoke all on function public.is_finance_title(text) from public, anon;
grant execute on function public.is_finance_title(text) to authenticated;

-- 2. Broaden can_view_finance to include managers, finance titles, and all active board members
create or replace function public.can_view_finance(
  p_club_id bigint,
  p_user_id uuid default auth.uid()
) returns boolean language sql stable security definer set search_path = public as $$
  select public.is_active_member(p_club_id, coalesce(p_user_id, auth.uid())) and (
    -- 1. Direct management roles or finance titles in club_members
    exists (
      select 1 from public.club_members m
      where m.club_id = p_club_id
        and m.user_id = coalesce(p_user_id, auth.uid())
        and m.status = 'active'
        and (
          m.role in ('owner', 'co_owner', 'general_manager', 'treasurer', 'sporting_manager', 'equipment_manager', 'hr_manager')
          or public.is_finance_title(m.title)
        )
    )
    -- 2. Active board members in club_board_members (linked via player_profiles)
    or exists (
      select 1 from public.club_board_members bm
      join public.player_profiles pp on pp.id = bm.player_id
      where bm.club_id = p_club_id
        and bm.archived_at is null
        and (
          pp.user_id = coalesce(p_user_id, auth.uid())
          or (
            pp.email is not null
            and lower(pp.email) = lower((select email from public.profiles where id = coalesce(p_user_id, auth.uid())))
          )
        )
    )
  );
$$;

-- 3. Broaden can_manage_finance to include club managers, finance titles, and active board members
create or replace function public.can_manage_finance(
  p_club_id bigint,
  p_user_id uuid default auth.uid()
) returns boolean language sql stable security definer set search_path = public as $$
  select public.is_active_member(p_club_id, coalesce(p_user_id, auth.uid())) and (
    -- 1. Direct management roles or finance titles in club_members
    exists (
      select 1 from public.club_members m
      where m.club_id = p_club_id
        and m.user_id = coalesce(p_user_id, auth.uid())
        and m.status = 'active'
        and (
          m.role in ('owner', 'co_owner', 'general_manager', 'treasurer')
          or public.is_finance_title(m.title)
        )
    )
    -- 2. Active board members in club_board_members (linked via player_profiles)
    or exists (
      select 1 from public.club_board_members bm
      join public.player_profiles pp on pp.id = bm.player_id
      where bm.club_id = p_club_id
        and bm.archived_at is null
        and (
          pp.user_id = coalesce(p_user_id, auth.uid())
          or (
            pp.email is not null
            and lower(pp.email) = lower((select email from public.profiles where id = coalesce(p_user_id, auth.uid())))
          )
        )
        and (
          public.is_finance_title(bm.title)
          or exists (
            select 1 from public.club_members cm
            where cm.club_id = p_club_id
              and cm.user_id = coalesce(p_user_id, auth.uid())
              and cm.role in ('owner', 'co_owner', 'general_manager', 'treasurer')
          )
        )
    )
  );
$$;

revoke all on function public.can_view_finance(bigint,uuid) from public, anon;
grant execute on function public.can_view_finance(bigint,uuid) to authenticated;

revoke all on function public.can_manage_finance(bigint,uuid) from public, anon;
grant execute on function public.can_manage_finance(bigint,uuid) to authenticated;

-- 4. Overhaul record_finance_transaction with explicit error codes and safe fallback actor
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
  v_actor_id uuid;
begin
  if not public.can_manage_finance(p_club_id, v_user_id) then
    raise exception 'forbidden';
  end if;

  if p_amount is null or p_amount <= 0 or p_amount::text in ('NaN', 'Infinity', '-Infinity') or p_amount <> round(p_amount, 2) then
    raise exception 'invalid_amount';
  end if;

  if coalesce(trim(p_description), '') = '' then
    raise exception 'invalid_description';
  end if;

  perform 1 from public.clubs where id = p_club_id and status = 'active' for update;
  if not found then
    raise exception 'inactive_club';
  end if;

  if p_idempotency_key is not null then
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
  end if;

  perform public.assert_financial_period_open(p_club_id, p_occurred_on);

  select coalesce(
    v_user_id,
    (select user_id from public.club_members where club_id = p_club_id and role = 'owner' limit 1)
  ) into v_actor_id;

  insert into public.finance_transactions(
    club_id, created_by, type, amount, occurred_on,
    description, receipt_path, category, paid_by, notes,
    idempotency_key, status
  )
  values(
    p_club_id, v_actor_id, p_type, p_amount, p_occurred_on,
    trim(p_description), p_receipt_path, p_category, p_paid_by, p_notes,
    p_idempotency_key, 'posted'
  ) returning * into row_value;

  insert into public.audit_logs(
    club_id, actor_id, action, subject_type, subject_id
  )
  values(
    p_club_id, v_actor_id, 'finance.created', 'FinanceTransaction', row_value.id
  );

  return row_value;
end $$;

revoke all on function public.record_finance_transaction(bigint,public.finance_type,numeric,date,text,text,text,text,text,uuid) from public, anon;
grant execute on function public.record_finance_transaction(bigint,public.finance_type,numeric,date,text,text,text,text,text,uuid) to authenticated;
