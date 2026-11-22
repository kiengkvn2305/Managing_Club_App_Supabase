-- Migration: 20261122000001_fix_correct_team_dues_and_drop_unused_tables.sql
-- 1. Sửa check constraint trên bảng finance_transactions (cho phép amount >= 0)
-- 2. Cập nhật RPC correct_team_dues: Khi số tiền giao dịch giảm về 0 thì đổi trạng thái sang 'reversed'
--    thay vì trừ về 0 dẫn tới lỗi "violates check constraint finance_transactions_amount_check"
-- 3. DROP các bảng không sử dụng và không cần thiết trong hệ thống

-- 1. Cập nhật check constraint trên finance_transactions
alter table public.finance_transactions
  drop constraint if exists finance_transactions_amount_check,
  add constraint finance_transactions_amount_check check (amount >= 0);

-- 2. Cập nhật RPC correct_team_dues
create or replace function public.correct_team_dues(
  p_club_id bigint,
  p_team_id bigint,
  p_player_id bigint,
  p_month date,
  p_expected_status text,
  p_status text,
  p_reason text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  entry public.team_dues_entries;
  old_status text;
  amount_value numeric;
  old_tx bigint;
  new_tx bigint;
  old_tx_row public.finance_transactions;
begin
  if not public.can_manage_finance(p_club_id)
     or p_expected_status not in ('unpaid', 'paid', 'exempt')
     or p_status not in ('unpaid', 'paid', 'exempt')
     or p_expected_status = p_status then
    raise exception 'invalid_correction';
  end if;

  perform 1 from public.clubs where id = p_club_id and status = 'active' for update;

  select * into entry
  from public.team_dues_entries
  where club_id = p_club_id
    and team_id = p_team_id
    and player_id = p_player_id
    and month = date_trunc('month', p_month)::date
  for update;

  old_status := coalesce(entry.status, 'unpaid');
  if old_status <> p_expected_status then
    raise exception 'stale_dues_status';
  end if;

  amount_value := coalesce(entry.amount, public.get_player_team_dues_rate(p_club_id, p_team_id, p_player_id, p_month));
  if amount_value is null then
    amount_value := 0;
  end if;

  old_tx := entry.finance_transaction_id;
  if old_status = 'paid' and old_tx is not null and amount_value > 0 then
    select * into old_tx_row
    from public.finance_transactions
    where club_id = p_club_id and id = old_tx
    for update;

    if old_tx_row.id is not null then
      if old_tx_row.amount > amount_value then
        update public.finance_transactions
        set amount = amount - amount_value,
            notes = coalesce(notes || ' | ', '') || 'Giảm ' || amount_value || 'đ do sửa trạng thái quỹ (' || trim(p_reason) || ')'
        where club_id = p_club_id and id = old_tx and type = 'income';
      else
        -- Khi số tiền cũ bằng hoặc nhỏ hơn amount_value (toàn bộ giao dịch là cho khoản thu này):
        -- Chuyển trạng thái sang 'reversed' (đã hủy/đảo) để không còn tính vào thu quỹ,
        -- giữ nguyên amount để bảo toàn chứng từ kế toán, không gán về 0.
        update public.finance_transactions
        set status = 'reversed',
            notes = coalesce(notes || ' | ', '') || 'Đã hủy do sửa trạng thái quỹ sang ' || p_status || ' (' || trim(p_reason) || ')'
        where club_id = p_club_id and id = old_tx;
      end if;
    end if;
  end if;

  if p_status = 'paid' and amount_value > 0 then
    insert into public.finance_transactions(club_id, created_by, type, amount, occurred_on, description, status)
    values(p_club_id, auth.uid(), 'income', amount_value, current_date, 'Điều chỉnh thu quỹ thành viên #' || p_player_id, 'posted')
    returning id into new_tx;
  end if;

  delete from public.team_dues_entries where id = entry.id;
  if p_status <> 'unpaid' then
    insert into public.team_dues_entries(club_id, team_id, player_id, month, status, amount, finance_transaction_id, created_by)
    values(p_club_id, p_team_id, p_player_id, date_trunc('month', p_month)::date, p_status, amount_value, new_tx, auth.uid());
  end if;

  insert into public.team_dues_adjustments(club_id, team_id, player_id, month, old_status, new_status, amount, old_transaction_id, new_transaction_id, reason, created_by)
  values(p_club_id, p_team_id, p_player_id, date_trunc('month', p_month)::date, old_status, p_status, amount_value, old_tx, new_tx, trim(p_reason), auth.uid());

  return jsonb_build_object('old_status', old_status, 'new_status', p_status, 'amount', amount_value);
end $$;

revoke all on function public.correct_team_dues(bigint, bigint, bigint, date, text, text, text) from public, anon;
grant execute on function public.correct_team_dues(bigint, bigint, bigint, date, text, text, text) to authenticated;

-- 3. Xóa các bảng không sử dụng trong hệ thống
drop table if exists public.seasons cascade;
drop table if exists public.club_events cascade;
drop table if exists public.notifications cascade;
drop table if exists public.funds cascade;
drop table if exists public.import_jobs cascade;
