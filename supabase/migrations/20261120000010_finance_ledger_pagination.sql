-- Return only the requested ledger page while calculating totals and chart data in PostgreSQL.
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
  v_result jsonb;
begin
  if not public.can_view_finance(p_club_id) then raise exception 'forbidden'; end if;
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
      'change', null
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
