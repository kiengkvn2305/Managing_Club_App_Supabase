-- Migration: 20261125000006_fix_audit_bugs_and_drop_unused_tables.sql
-- 1. Sửa SQL RLS public.can_view_inventory() kiểm tra đúng quyền 'can_view_inventory' (và 'can_manage_inventory').
-- 2. Sửa SQL RPC public.finance_ledger_page() tính đúng summary.change so với kỳ trước (tháng trước / năm trước).
-- 3. Cập nhật public.get_my_club_notifications() gỡ nhánh friendly_invitations sau khi bỏ module Giao hữu.
-- 4. Xóa các bảng và hàm RPC không còn sử dụng để giảm dung lượng DB:
--    - Biểu quyết: club_poll_votes, club_poll_electors, club_poll_options, club_polls
--    - Lời mời giao hữu: friendly_invitations
--    - Trang công khai: club_public_settings
--    - Module không gắn/đã ngừng dùng: sponsorship_receipts, sponsorships, sponsors,
--      discipline_case_history, discipline_cases, seasons, club_events, club_documents.

-- ============================================================================
-- 1. Sửa public.can_view_inventory() kiểm tra đúng quyền can_view_inventory
-- ============================================================================
create or replace function public.can_view_inventory(
  p_club_id bigint,
  p_user_id uuid default auth.uid()
) returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := coalesce(p_user_id, auth.uid());
  v_manage boolean;
  v_view boolean;
begin
  v_manage := public.has_club_permission(p_club_id, 'can_manage_inventory', v_uid);
  if v_manage is true then
    return true;
  end if;

  v_view := public.has_club_permission(p_club_id, 'can_view_inventory', v_uid);
  if v_view is not null then
    return v_view;
  end if;

  if v_manage is false then
    return false;
  end if;

  return coalesce(
    public.club_role(p_club_id, v_uid) in ('owner', 'co_owner', 'general_manager', 'equipment_manager', 'sporting_manager'),
    false
  );
end;
$$;

revoke all on function public.can_view_inventory(bigint, uuid) from public, anon;
grant execute on function public.can_view_inventory(bigint, uuid) to authenticated;

-- ============================================================================
-- 2. Sửa public.finance_ledger_page() tính đúng summary.change so với kỳ trước
-- ============================================================================
create or replace function public.finance_ledger_page(
  p_club_id bigint,
  p_from date default null,
  p_to date default null,
  p_page integer default 1,
  p_page_size integer default 20,
  p_group text default 'day'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_size integer := least(greatest(coalesce(p_page_size, 20), 1), 100);
  v_group text := case when p_group = 'month' then 'month' else 'day' end;
  v_prev_from date := null;
  v_prev_to date := null;
  v_curr_balance numeric := 0;
  v_curr_count integer := 0;
  v_prev_balance numeric := 0;
  v_prev_count integer := 0;
  v_change numeric := null;
  v_result jsonb;
begin
  if not public.can_view_finance(p_club_id) then
    raise exception 'forbidden';
  end if;

  if p_from is not null and p_to is not null and p_to >= p_from then
    if v_group = 'month' then
      v_prev_from := (p_from - interval '1 year')::date;
      v_prev_to := (p_to - interval '1 year')::date;
    elsif p_from = date_trunc('month', p_from)::date
      and p_to = (date_trunc('month', p_from) + interval '1 month - 1 day')::date then
      v_prev_from := (p_from - interval '1 month')::date;
      v_prev_to := (p_from - interval '1 day')::date;
    else
      v_prev_to := (p_from - 1);
      v_prev_from := v_prev_to - (p_to - p_from);
    end if;

    select
      count(*)::integer,
      coalesce(sum(case when type = 'income' then amount else -amount end), 0)
    into v_curr_count, v_curr_balance
    from public.finance_transactions
    where club_id = p_club_id
      and status = 'posted'
      and occurred_on >= p_from
      and occurred_on <= p_to;

    select
      count(*)::integer,
      coalesce(sum(case when type = 'income' then amount else -amount end), 0)
    into v_prev_count, v_prev_balance
    from public.finance_transactions
    where club_id = p_club_id
      and status = 'posted'
      and occurred_on >= v_prev_from
      and occurred_on <= v_prev_to;

    if v_curr_count > 0 or v_prev_count > 0 then
      v_change := v_curr_balance - v_prev_balance;
    end if;
  end if;

  with visible as materialized (
    select * from public.finance_transactions
    where club_id = p_club_id
      and status in ('posted', 'reversed')
      and (p_from is null or occurred_on >= p_from)
      and (p_to is null or occurred_on <= p_to)
  ), accounting_period as materialized (
    select * from visible where status = 'posted'
  ), accounted_until as materialized (
    select * from public.finance_transactions
    where club_id = p_club_id
      and status = 'posted'
      and (p_to is null or occurred_on <= p_to)
  )
  select jsonb_build_object(
    'data', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.occurred_on desc, p.id desc)
      from (
        select * from visible
        order by occurred_on desc, id desc
        limit v_size offset ((v_page - 1) * v_size)
      ) p
    ), '[]'::jsonb),
    'meta', jsonb_build_object(
      'current_page', v_page,
      'last_page', greatest(1, ceil((select count(*) from visible)::numeric / v_size)::integer),
      'total', (select count(*) from visible)
    ),
    'summary', jsonb_build_object(
      'income', coalesce((select sum(amount) from accounting_period where type = 'income'), 0),
      'expense', coalesce((select sum(amount) from accounting_period where type = 'expense'), 0),
      'balance', coalesce((select sum(case when type = 'income' then amount else -amount end) from accounting_period), 0),
      'remaining', coalesce((select sum(case when type = 'income' then amount else -amount end) from accounted_until), 0),
      'change', v_change
    ),
    'chart', coalesce((
      select jsonb_agg(jsonb_build_object('period', period, 'type', type, 'total', total) order by period, type)
      from (
        select case when v_group = 'month' then to_char(occurred_on, 'YYYY-MM') else to_char(occurred_on, 'YYYY-MM-DD') end as period,
               type::text as type,
               sum(amount) as total
        from accounting_period
        group by 1, 2
      ) chart_rows
    ), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.finance_ledger_page(bigint,date,date,integer,integer,text) from public, anon;
grant execute on function public.finance_ledger_page(bigint,date,date,integer,integer,text) to authenticated;

-- ============================================================================
-- 3. Cập nhật public.get_my_club_notifications() gỡ nhánh friendly_invitations
-- ============================================================================
create or replace function public.get_my_club_notifications(p_club_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_month_start date := date_trunc('month', (now() at time zone 'Asia/Ho_Chi_Minh')::date)::date;
  v_read_keys jsonb := '[]'::jsonb;
  v_items jsonb := '[]'::jsonb;
  v_user_email text;
  v_can_fin boolean;
  v_can_inv boolean;
  v_can_roster boolean;
  v_can_act boolean;
  v_rec record;
  v_count integer;
  v_max_id bigint;
  v_unread integer := 0;
begin
  if v_uid is null then
    return jsonb_build_object('items', '[]'::jsonb, 'unread_count', 0);
  end if;

  if not public.is_active_member(p_club_id, v_uid) and not public.is_system_admin(v_uid) then
    return jsonb_build_object('items', '[]'::jsonb, 'unread_count', 0);
  end if;

  select coalesce(notification_read_keys, '[]'::jsonb)
  into v_read_keys
  from public.club_members
  where club_id = p_club_id and user_id = v_uid and status = 'active';

  v_read_keys := coalesce(v_read_keys, '[]'::jsonb);

  select email into v_user_email from public.profiles where id = v_uid;

  v_can_fin := public.can_view_finance(p_club_id, v_uid);
  v_can_inv := public.can_view_inventory(p_club_id, v_uid);
  v_can_roster := public.can_manage_roster(p_club_id, v_uid);
  v_can_act := public.can_view_activities(p_club_id, v_uid);

  -- 1. Lịch tập sắp diễn ra (hôm nay -> 3 ngày tới)
  for v_rec in
    select id, team_name, training_date, training_time, location
    from public.team_trainings
    where club_id = p_club_id
      and training_status = 'scheduled'
      and training_date between v_today and (v_today + 3)
    order by training_date asc, training_time asc
    limit 5
  loop
    v_items := v_items || jsonb_build_array(
      jsonb_build_object(
        'key', 'training:' || v_rec.id || ':' || to_char(v_rec.training_date, 'YYYY-MM-DD'),
        'tone', case when v_rec.training_date = v_today then 'warning' else 'info' end,
        'title', case when v_rec.training_date = v_today then 'Lịch tập hôm nay · ' else 'Lịch tập sắp tới · ' end || v_rec.team_name,
        'body', to_char(v_rec.training_date, 'DD/MM/YYYY') || ' lúc ' || v_rec.training_time || ' tại ' || v_rec.location,
        'href', '#attendance',
        'date', to_char(v_rec.training_date, 'YYYY-MM-DD')
      )
    );
  end loop;

  -- 2. Sinh nhật thành viên trong tháng trùng hôm nay hoặc 3 ngày tới
  for v_rec in
    select id, full_name, date_of_birth
    from public.player_profiles
    where club_id = p_club_id
      and status = 'active'
      and date_of_birth is not null
      and to_char(date_of_birth, 'MM-DD') in (
        to_char(v_today, 'MM-DD'),
        to_char(v_today + 1, 'MM-DD'),
        to_char(v_today + 2, 'MM-DD'),
        to_char(v_today + 3, 'MM-DD')
      )
    order by to_char(date_of_birth, 'MM-DD') asc, full_name asc
    limit 5
  loop
    v_items := v_items || jsonb_build_array(
      jsonb_build_object(
        'key', 'birthday:' || v_rec.id || ':' || extract(year from v_today)::int,
        'tone', 'gold',
        'title', case
          when to_char(v_rec.date_of_birth, 'MM-DD') = to_char(v_today, 'MM-DD')
            then 'Chúc mừng sinh nhật hôm nay · ' || v_rec.full_name
          else 'Sinh nhật sắp tới · ' || v_rec.full_name
        end,
        'body', 'Ngày sinh: ' || to_char(v_rec.date_of_birth, 'DD/MM/YYYY'),
        'href', case when v_can_act then '#activities' else '#members' end,
        'date', to_char(v_today, 'YYYY-MM-DD')
      )
    );
  end loop;

  -- 3. Dịp kỷ niệm CLB sắp tới (7 ngày) cho người có quyền xem hoạt động
  if v_can_act then
    for v_rec in
      select id, title, event_date
      from public.club_celebrations
      where club_id = p_club_id
        and approval_status = 'approved'
        and event_date between v_today and (v_today + 7)
      order by event_date asc
      limit 3
    loop
      v_items := v_items || jsonb_build_array(
        jsonb_build_object(
          'key', 'celebration:' || v_rec.id || ':' || to_char(v_rec.event_date, 'YYYY-MM-DD'),
          'tone', 'gold',
          'title', 'Sự kiện CLB · ' || v_rec.title,
          'body', 'Diễn ra ngày ' || to_char(v_rec.event_date, 'DD/MM/YYYY'),
          'href', '#activities',
          'date', to_char(v_rec.event_date, 'YYYY-MM-DD')
        )
      );
    end loop;
  end if;

  -- 4. Nhắc đóng quỹ cá nhân tháng hiện tại
  if exists (
    select 1
    from public.player_profiles p
    join public.team_players tp on tp.club_id = p.club_id and tp.player_id = p.id
    where p.club_id = p_club_id
      and p.status in ('active', 'injured')
      and (p.user_id = v_uid or (v_user_email is not null and lower(coalesce(p.email, '')) = lower(v_user_email)))
      and coalesce(public.get_player_team_dues_rate(p_club_id, tp.team_id, p.id, v_month_start), 0) > 0
      and not exists (
        select 1
        from public.team_dues_entries e
        where e.club_id = p_club_id
          and e.team_id = tp.team_id
          and e.player_id = p.id
          and e.month = v_month_start
          and e.status in ('paid', 'exempt')
      )
  ) then
    v_items := v_items || jsonb_build_array(
      jsonb_build_object(
        'key', 'my_dues:' || to_char(v_month_start, 'YYYY-MM'),
        'tone', 'warning',
        'title', 'Nhắc đóng quỹ tháng ' || to_char(v_month_start, 'MM/YYYY'),
        'body', 'Hồ sơ thành viên của bạn chưa ghi nhận hoàn tất quỹ tháng này.',
        'href', case when v_can_fin then '#dues' else '#profile' end,
        'date', to_char(v_today, 'YYYY-MM-DD')
      )
    );
  end if;

  -- 5. Thông báo tài chính chờ phê duyệt
  if v_can_fin then
    select count(*), max(id)
    into v_count, v_max_id
    from public.transaction_approvals
    where club_id = p_club_id and status = 'pending';

    if coalesce(v_count, 0) > 0 then
      v_items := v_items || jsonb_build_array(
        jsonb_build_object(
          'key', 'fin_approval:' || v_max_id || ':' || v_count,
          'tone', 'warning',
          'title', 'Có ' || v_count || ' khoản thu/chi chờ phê duyệt',
          'body', 'Kiểm tra và phê duyệt trên Sổ thu chi CLB.',
          'href', '#finance',
          'date', to_char(v_today, 'YYYY-MM-DD')
        )
      );
    end if;
  end if;

  -- 6. Cảnh báo Kho trang bị tồn thấp & sự cố hỏng/mất mới
  if v_can_inv then
    select count(*)
    into v_count
    from public.inventory_items
    where club_id = p_club_id
      and archived = false
      and quantity <= low_stock_threshold;

    if coalesce(v_count, 0) > 0 then
      v_items := v_items || jsonb_build_array(
        jsonb_build_object(
          'key', 'low_stock:' || v_count || ':' || to_char(v_today, 'YYYY-MM'),
          'tone', 'warning',
          'title', 'Cảnh báo kho sắp hết (' || v_count || ' vật tư)',
          'body', 'Một số trang bị chạm hoặc dưới mức tồn tối thiểu.',
          'href', '#inventory',
          'date', to_char(v_today, 'YYYY-MM-DD')
        )
      );
    end if;

    select count(*), max(id)
    into v_count, v_max_id
    from public.inventory_movements
    where club_id = p_club_id
      and type in ('damaged', 'lost')
      and created_at >= (now() - interval '7 days');

    if coalesce(v_count, 0) > 0 then
      v_items := v_items || jsonb_build_array(
        jsonb_build_object(
          'key', 'inv_incident:' || v_max_id,
          'tone', 'danger',
          'title', 'Phát sinh ' || v_count || ' sự cố hỏng/mất thiết bị (7 ngày qua)',
          'body', 'Xem chi tiết trong Báo cáo hỏng/mất tại Kho trang bị.',
          'href', '#inventory',
          'date', to_char(v_today, 'YYYY-MM-DD')
        )
      );
    end if;
  end if;

  -- 7. Hồ sơ ứng tuyển mới
  if v_can_roster then
    select count(*), max(id)
    into v_count, v_max_id
    from public.recruitment_applications
    where club_id = p_club_id
      and status = 'new';

    if coalesce(v_count, 0) > 0 then
      v_items := v_items || jsonb_build_array(
        jsonb_build_object(
          'key', 'recruitment:' || v_max_id || ':' || v_count,
          'tone', 'info',
          'title', 'Có ' || v_count || ' hồ sơ ứng viên mới đăng ký',
          'body', 'Xem và xét duyệt hồ sơ trong mục Tuyển dụng CLB.',
          'href', '#recruitment',
          'date', to_char(v_today, 'YYYY-MM-DD')
        )
      );
    end if;
  end if;

  select
    coalesce(
      jsonb_agg(
        elem || jsonb_build_object('read', (v_read_keys ? (elem->>'key')))
      ),
      '[]'::jsonb
    ),
    coalesce(
      count(*) filter (where not (v_read_keys ? (elem->>'key'))),
      0
    )
  into v_items, v_unread
  from jsonb_array_elements(v_items) as elem;

  return jsonb_build_object(
    'items', v_items,
    'unread_count', v_unread
  );
end $$;

revoke all on function public.get_my_club_notifications(bigint) from public, anon;
grant execute on function public.get_my_club_notifications(bigint) to authenticated;

-- ============================================================================
-- 4. Xóa các hàm RPC & bảng không còn sử dụng để giảm dung lượng DB
-- ============================================================================
-- 4.1. Biểu quyết (Polls)
drop function if exists public.create_club_poll(bigint, text, text, timestamptz, jsonb);
drop function if exists public.cast_club_poll_vote(bigint, bigint, bigint);
drop table if exists public.club_poll_votes cascade;
drop table if exists public.club_poll_electors cascade;
drop table if exists public.club_poll_options cascade;
drop table if exists public.club_polls cascade;

-- 4.2. Lời mời giao hữu (Friendly Invitations)
drop function if exists public.create_friendly_invitation(bigint, bigint, date, text, text, text);
drop function if exists public.respond_friendly_invitation(bigint, bigint, text);
drop table if exists public.friendly_invitations cascade;

-- 4.3. Trang công khai (Public Club Page)
drop function if exists public.get_public_club_page(text, bigint);
drop function if exists public.submit_public_recruitment_application(bigint, bigint, text, text, text, date, text);
drop table if exists public.club_public_settings cascade;

-- 4.4. Các bảng chưa dùng / đã loại khỏi hệ thống (Tài trợ, Kỷ luật, Mùa giải, Sự kiện, Tài liệu)
drop function if exists public.create_discipline_case(bigint, bigint, date, text, text, text, text, numeric);
drop function if exists public.update_discipline_case(bigint, bigint, bigint, date, text, text, text, text, numeric, text);
drop table if exists public.sponsorship_receipts cascade;
drop table if exists public.sponsorships cascade;
drop table if exists public.sponsors cascade;
drop table if exists public.discipline_case_history cascade;
drop table if exists public.discipline_cases cascade;
drop table if exists public.seasons cascade;
drop table if exists public.club_events cascade;
drop table if exists public.club_documents cascade;
