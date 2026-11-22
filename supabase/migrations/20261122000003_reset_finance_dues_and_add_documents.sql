-- Migration: 20261122000003_reset_finance_dues_and_add_documents.sql
-- 1. Làm sạch toàn bộ dữ liệu giao dịch thu chi và điều chỉnh quỹ bị lệch
-- 2. Đưa toàn bộ thành viên về trạng thái Chưa đóng quỹ (unpaid)
-- 3. Tạo bảng quản lý Tài liệu CLB (club_documents) có chia theo từng thư mục (biên bản họp, kế hoạch, excel...)

-- ==============================================================================
-- PHẦN 1: DỌN DẸP DỮ LIỆU THU CHI & ĐƯA ĐÓNG QUỸ VỀ CHƯA AI ĐÓNG
-- ==============================================================================

-- 1.1 Xóa sạch các bảng liên kết thu chi và điều chỉnh quỹ
delete from public.team_dues_adjustments;
delete from public.dues_collection_requests;
delete from public.payment_allocations;
delete from public.payments;
delete from public.transaction_approvals;

-- 1.2 Làm sạch toàn bộ bảng giao dịch thu chi
delete from public.finance_transactions;

-- 1.3 Đưa toàn bộ đóng quỹ về "Chưa ai đóng" (unpaid)
-- Xóa toàn bộ các bản ghi trong team_dues_entries để hệ thống tính toán tự động lại toàn bộ thành Chưa đóng
delete from public.team_dues_entries;

-- 1.4 Cập nhật hàm correct_team_dues để an toàn tuyệt đối khi không tìm thấy transaction cũ
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

  -- Xóa bản ghi cũ nếu có để tránh trùng khóa (team_id, player_id, month)
  delete from public.team_dues_entries
  where club_id = p_club_id
    and team_id = p_team_id
    and player_id = p_player_id
    and month = date_trunc('month', p_month)::date;

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

-- ==============================================================================
-- PHẦN 2: BẢNG QUẢN LÝ TÀI LIỆU CLB (CLUB_DOCUMENTS) PHÂN THEO THƯ MỤC
-- ==============================================================================

create table if not exists public.club_documents (
  id bigint generated by default as identity primary key,
  club_id bigint not null references public.clubs(id) on delete cascade,
  folder_name varchar(100) not null default 'Biên bản họp',
  name varchar(255) not null,
  file_name varchar(255) not null,
  file_path text not null,
  file_size bigint not null default 0,
  file_type varchar(100),
  notes text,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists club_documents_club_folder_idx on public.club_documents(club_id, folder_name);
create index if not exists club_documents_club_created_idx on public.club_documents(club_id, created_at desc);

-- Thiết lập Trigger cập nhật updated_at
drop trigger if exists set_updated_at on public.club_documents;
create trigger set_updated_at before update on public.club_documents
  for each row execute function public.set_updated_at();

-- Phân quyền Row Level Security (RLS)
alter table public.club_documents enable row level security;

drop policy if exists club_documents_select on public.club_documents;
create policy club_documents_select on public.club_documents
  for select to authenticated
  using (public.is_active_member(club_id));

drop policy if exists club_documents_insert on public.club_documents;
create policy club_documents_insert on public.club_documents
  for insert to authenticated
  with check (public.is_active_member(club_id));

drop policy if exists club_documents_update on public.club_documents;
create policy club_documents_update on public.club_documents
  for update to authenticated
  using (public.can_manage_club(club_id) or created_by = auth.uid())
  with check (public.can_manage_club(club_id) or created_by = auth.uid());

drop policy if exists club_documents_delete on public.club_documents;
create policy club_documents_delete on public.club_documents
  for delete to authenticated
  using (public.can_manage_club(club_id) or created_by = auth.uid());

grant select, insert, update, delete on public.club_documents to authenticated;
