-- Financial workflow hardening: open/closed periods, approvals, reversals,
-- payment allocations and a server-side summary. All mutations are atomic RPCs.

alter table public.finance_transactions
  add column if not exists status varchar(16) not null default 'posted';
alter table public.finance_transactions
  add column if not exists reversal_of_id bigint;
alter table public.team_dues_entries
  add column if not exists paid_amount numeric(20,2) not null default 0;
alter table public.payments
  add column if not exists idempotency_key uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'finance_transactions_status_check') then
    alter table public.finance_transactions add constraint finance_transactions_status_check check (status in ('pending','approved','rejected','posted','voided','reversed'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'finance_transactions_reversal_fk') then
    alter table public.finance_transactions add constraint finance_transactions_reversal_fk foreign key (reversal_of_id) references public.finance_transactions(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'team_dues_entries_paid_amount_check') then
    alter table public.team_dues_entries add constraint team_dues_entries_paid_amount_check check (paid_amount >= 0 and paid_amount <= amount);
  end if;
end $$;

create unique index if not exists payments_club_idempotency_idx on public.payments(club_id, idempotency_key) where idempotency_key is not null;
create index if not exists finance_transactions_club_status_date_idx on public.finance_transactions(club_id, status, occurred_on);
create index if not exists payment_allocations_dues_idx on public.payment_allocations(club_id, dues_entry_id);

create or replace function public.assert_financial_period_open(p_club_id bigint, p_on date) returns void
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.financial_periods where club_id=p_club_id and p_on between starts_on and ends_on and closed_at is not null) then
    raise exception 'financial_period_closed';
  end if;
end $$;

create or replace function public.create_financial_period(p_club_id bigint, p_starts_on date, p_ends_on date) returns public.financial_periods
language plpgsql security definer set search_path = public as $$
declare row_value public.financial_periods;
begin
  if not public.can_manage_finance(p_club_id) or p_ends_on < p_starts_on then raise exception 'forbidden_or_invalid'; end if;
  perform 1 from public.clubs where id=p_club_id and status='active' for update;
  if not found then raise exception 'inactive_club'; end if;
  insert into public.financial_periods(club_id,starts_on,ends_on)
  values(p_club_id,p_starts_on,p_ends_on)
  on conflict(club_id,starts_on,ends_on) do update set updated_at=now()
  returning * into row_value;
  return row_value;
end $$;

create or replace function public.close_financial_period(p_club_id bigint, p_period_id bigint) returns public.financial_periods
language plpgsql security definer set search_path = public as $$
declare row_value public.financial_periods;
begin
  if not public.can_manage_finance(p_club_id) then raise exception 'forbidden'; end if;
  select * into row_value from public.financial_periods where club_id=p_club_id and id=p_period_id for update;
  if row_value.id is null then raise exception 'financial_period_not_found'; end if;
  if row_value.closed_at is not null then return row_value; end if;
  update public.financial_periods set closed_at=now(),closed_by=auth.uid() where club_id=p_club_id and id=p_period_id returning * into row_value;
  insert into public.audit_logs(club_id,actor_id,action,subject_type,subject_id) values(p_club_id,auth.uid(),'finance.period_closed','FinancialPeriod',p_period_id);
  return row_value;
end $$;

create or replace function public.record_finance_transaction(p_club_id bigint, p_type public.finance_type, p_amount numeric, p_occurred_on date, p_description text, p_receipt_path text default null, p_category text default null, p_paid_by text default null, p_notes text default null, p_idempotency_key uuid default null) returns public.finance_transactions
language plpgsql security definer set search_path = public as $$
declare row_value public.finance_transactions;
begin
  if not public.can_manage_finance(p_club_id) or p_amount <= 0 or coalesce(trim(p_description),'')='' then raise exception 'forbidden_or_invalid'; end if;
  if p_idempotency_key is not null then
    select * into row_value from public.finance_transactions where club_id=p_club_id and idempotency_key=p_idempotency_key;
    if row_value.id is not null then return row_value; end if;
  end if;
  perform 1 from public.clubs where id=p_club_id and status='active' for update;
  if not found then raise exception 'inactive_club'; end if;
  perform public.assert_financial_period_open(p_club_id,p_occurred_on);
  insert into public.finance_transactions(club_id,created_by,type,amount,occurred_on,description,receipt_path,category,paid_by,notes,idempotency_key,status)
  values(p_club_id,auth.uid(),p_type,p_amount,p_occurred_on,trim(p_description),p_receipt_path,p_category,p_paid_by,p_notes,p_idempotency_key,'posted') returning * into row_value;
  insert into public.audit_logs(club_id,actor_id,action,subject_type,subject_id) values(p_club_id,auth.uid(),'finance.created','FinanceTransaction',row_value.id);
  return row_value;
end $$;

create or replace function public.request_finance_approval(p_club_id bigint, p_transaction_id bigint) returns public.transaction_approvals
language plpgsql security definer set search_path = public as $$
declare tx public.finance_transactions; row_value public.transaction_approvals;
begin
  if not public.can_manage_finance(p_club_id) then raise exception 'forbidden'; end if;
  select * into tx from public.finance_transactions where club_id=p_club_id and id=p_transaction_id for update;
  if tx.id is null or tx.status in ('voided','reversed','rejected') then raise exception 'invalid_transaction_state'; end if;
  update public.finance_transactions set status='pending' where club_id=p_club_id and id=p_transaction_id;
  insert into public.transaction_approvals(club_id,finance_transaction_id,status,requested_by)
  values(p_club_id,p_transaction_id,'pending',auth.uid())
  on conflict(club_id,finance_transaction_id) do update set status='pending',requested_by=auth.uid(),decided_by=null,decision_reason=null,updated_at=now()
  returning * into row_value;
  insert into public.audit_logs(club_id,actor_id,action,subject_type,subject_id) values(p_club_id,auth.uid(),'finance.approval_requested','FinanceTransaction',p_transaction_id);
  return row_value;
end $$;

create or replace function public.decide_finance_approval(p_club_id bigint, p_transaction_id bigint, p_status text, p_reason text default null) returns public.transaction_approvals
language plpgsql security definer set search_path = public as $$
declare row_value public.transaction_approvals; tx public.finance_transactions;
begin
  if not public.can_manage_finance(p_club_id) or p_status not in ('approved','rejected') then raise exception 'forbidden_or_invalid'; end if;
  select * into row_value from public.transaction_approvals where club_id=p_club_id and finance_transaction_id=p_transaction_id for update;
  if row_value.id is null or row_value.status <> 'pending' then raise exception 'approval_not_pending'; end if;
  select * into tx from public.finance_transactions where club_id=p_club_id and id=p_transaction_id for update;
  if tx.id is null then raise exception 'transaction_not_found'; end if;
  update public.transaction_approvals set status=p_status,decided_by=auth.uid(),decision_reason=trim(p_reason) where id=row_value.id returning * into row_value;
  update public.finance_transactions set status=case when p_status='approved' then 'posted' else 'rejected' end where club_id=p_club_id and id=p_transaction_id;
  insert into public.audit_logs(club_id,actor_id,action,subject_type,subject_id) values(p_club_id,auth.uid(),'finance.approval_'||p_status,'FinanceTransaction',p_transaction_id);
  return row_value;
end $$;

create or replace function public.reverse_finance_transaction(p_club_id bigint, p_transaction_id bigint, p_reason text, p_idempotency_key uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare original public.finance_transactions; reversal public.finance_transactions; reverse_type public.finance_type;
begin
  if not public.can_manage_finance(p_club_id) or coalesce(trim(p_reason),'')='' then raise exception 'forbidden_or_invalid'; end if;
  select * into original from public.finance_transactions where club_id=p_club_id and id=p_transaction_id for update;
  if original.id is null or original.status in ('voided','reversed') or original.reversal_of_id is not null then raise exception 'invalid_reversal_state'; end if;
  perform public.assert_financial_period_open(p_club_id,current_date);
  if p_idempotency_key is not null then
    select * into reversal from public.finance_transactions where club_id=p_club_id and idempotency_key=p_idempotency_key;
    if reversal.id is not null then return jsonb_build_object('original',to_jsonb(original),'reversal',to_jsonb(reversal)); end if;
  end if;
  reverse_type := case when original.type='income' then 'expense'::public.finance_type else 'income'::public.finance_type end;
  insert into public.finance_transactions(club_id,created_by,type,amount,occurred_on,description,category,paid_by,notes,idempotency_key,reversal_of_id,status)
  values(p_club_id,auth.uid(),reverse_type,original.amount,current_date,'Đảo giao dịch #'||original.id,original.category,original.paid_by,trim(p_reason),p_idempotency_key,original.id,'posted') returning * into reversal;
  update public.finance_transactions set status='reversed' where club_id=p_club_id and id=p_transaction_id;
  insert into public.audit_logs(club_id,actor_id,action,subject_type,subject_id) values(p_club_id,auth.uid(),'finance.reversed','FinanceTransaction',p_transaction_id);
  return jsonb_build_object('original',to_jsonb(original),'reversal',to_jsonb(reversal));
end $$;

create or replace function public.post_finance_payment(p_club_id bigint, p_player_id bigint, p_amount numeric, p_paid_on date, p_external_ref text, p_allocations jsonb default '[]'::jsonb, p_idempotency_key uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare payment_row public.payments; tx_id bigint; item jsonb; dues_row public.team_dues_entries; allocation_amount numeric; allocated numeric := 0; next_paid numeric;
begin
  if not public.can_manage_finance(p_club_id) or p_amount <= 0 or jsonb_typeof(p_allocations) <> 'array' then raise exception 'forbidden_or_invalid'; end if;
  if p_idempotency_key is not null then
    select * into payment_row from public.payments where club_id=p_club_id and idempotency_key=p_idempotency_key;
    if payment_row.id is not null then return jsonb_build_object('payment',to_jsonb(payment_row),'replayed',true); end if;
  end if;
  perform 1 from public.clubs where id=p_club_id and status='active' for update;
  if not found then raise exception 'inactive_club'; end if;
  perform public.assert_financial_period_open(p_club_id,p_paid_on);
  if p_player_id is not null and not exists(select 1 from public.player_profiles where club_id=p_club_id and id=p_player_id) then raise exception 'player_not_found'; end if;
  insert into public.finance_transactions(club_id,created_by,type,amount,occurred_on,description,paid_by,idempotency_key,status)
  values(p_club_id,auth.uid(),'income',p_amount,p_paid_on,'Thanh toán công nợ',p_external_ref,coalesce(p_idempotency_key,gen_random_uuid()),'posted') returning id into tx_id;
  insert into public.payments(club_id,player_id,amount,paid_on,status,external_ref,created_by,idempotency_key)
  values(p_club_id,p_player_id,p_amount,p_paid_on,'posted',nullif(trim(p_external_ref),''),auth.uid(),p_idempotency_key) returning * into payment_row;
  for item in select value from jsonb_array_elements(p_allocations) loop
    allocation_amount := (item->>'amount')::numeric;
    if allocation_amount <= 0 then raise exception 'invalid_allocation'; end if;
    select * into dues_row from public.team_dues_entries where club_id=p_club_id and id=(item->>'dues_entry_id')::bigint for update;
    if dues_row.id is null or dues_row.status='exempt' then raise exception 'dues_entry_not_found'; end if;
    if p_player_id is not null and dues_row.player_id <> p_player_id then raise exception 'allocation_player_mismatch'; end if;
    if coalesce(dues_row.paid_amount,0) + allocation_amount > dues_row.amount then raise exception 'allocation_exceeds_due'; end if;
    allocated := allocated + allocation_amount;
    if allocated > p_amount then raise exception 'allocation_exceeds_payment'; end if;
    insert into public.payment_allocations(club_id,payment_id,dues_entry_id,amount) values(p_club_id,payment_row.id,dues_row.id,allocation_amount);
    next_paid := coalesce(dues_row.paid_amount,0) + allocation_amount;
    update public.team_dues_entries set paid_amount=next_paid,status=case when next_paid >= amount then 'paid' else 'unpaid' end,finance_transaction_id=tx_id where id=dues_row.id;
  end loop;
  insert into public.audit_logs(club_id,actor_id,action,subject_type,subject_id) values(p_club_id,auth.uid(),'finance.payment_posted','Payment',payment_row.id);
  return jsonb_build_object('payment',to_jsonb(payment_row),'allocated',allocated,'transaction_id',tx_id);
end $$;

create or replace function public.finance_summary(p_club_id bigint, p_from date, p_to date) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'income', coalesce(sum(amount) filter (where type='income' and status='posted'),0),
    'expense', coalesce(sum(amount) filter (where type='expense' and status='posted'),0),
    'pending', coalesce(sum(amount) filter (where status='pending'),0),
    'rejected', coalesce(sum(amount) filter (where status='rejected'),0),
    'count', count(*)
  ) from public.finance_transactions
  where club_id=p_club_id and occurred_on between p_from and p_to and public.can_view_finance(p_club_id)
$$;

revoke all on function public.assert_financial_period_open(bigint,date) from public;
revoke all on function public.create_financial_period(bigint,date,date) from public;
revoke all on function public.close_financial_period(bigint,bigint) from public;
revoke all on function public.request_finance_approval(bigint,bigint) from public;
revoke all on function public.decide_finance_approval(bigint,bigint,text,text) from public;
revoke all on function public.reverse_finance_transaction(bigint,bigint,text,uuid) from public;
revoke all on function public.post_finance_payment(bigint,bigint,numeric,date,text,jsonb,uuid) from public;
revoke all on function public.finance_summary(bigint,date,date) from public;
grant execute on function public.create_financial_period(bigint,date,date) to authenticated;
grant execute on function public.close_financial_period(bigint,bigint) to authenticated;
grant execute on function public.request_finance_approval(bigint,bigint) to authenticated;
grant execute on function public.decide_finance_approval(bigint,bigint,text,text) to authenticated;
grant execute on function public.reverse_finance_transaction(bigint,bigint,text,uuid) to authenticated;
grant execute on function public.post_finance_payment(bigint,bigint,numeric,date,text,jsonb,uuid) to authenticated;
grant execute on function public.finance_summary(bigint,date,date) to authenticated;
