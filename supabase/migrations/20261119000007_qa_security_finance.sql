-- QA fixes, local first. Never reset or delete application data.
revoke create on schema public from public, anon, authenticated;
revoke execute on all functions in schema public from public, anon;

create or replace function public.is_active_member(p_club_id bigint, p_user_id uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
 select exists(select 1 from public.club_members m join public.profiles p on p.id=m.user_id join public.clubs c on c.id=m.club_id
 where m.club_id=p_club_id and m.user_id=p_user_id and m.status='active' and p.is_active and c.status='active' and c.deleted_at is null)
$$;
create or replace function public.club_role(p_club_id bigint, p_user_id uuid default auth.uid()) returns public.club_role
language sql stable security definer set search_path = public as $$
 select m.role from public.club_members m where m.club_id=p_club_id and m.user_id=p_user_id and public.is_active_member(p_club_id,p_user_id) limit 1
$$;
create or replace function public.can_manage_roster(p_club_id bigint, p_user_id uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$ select coalesce(public.club_role(p_club_id,p_user_id) in ('owner','co_owner','general_manager','hr_manager','sporting_manager'),false) $$;
create or replace function public.can_manage_club(p_club_id bigint, p_user_id uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$ select coalesce(public.club_role(p_club_id,p_user_id) in ('owner','co_owner','general_manager'),false) $$;
create or replace function public.can_view_inventory(p_club_id bigint, p_user_id uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$ select coalesce(public.club_role(p_club_id,p_user_id) in ('owner','co_owner','general_manager','equipment_manager'),false) $$;
create or replace function public.can_view_finance(p_club_id bigint, p_user_id uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$ select public.is_active_member(p_club_id,p_user_id) and exists(select 1 from public.club_members m where m.club_id=p_club_id and m.user_id=p_user_id and (m.role='owner' or m.title in ('Chủ nhiệm CLB','Phó chủ nhiệm CLB','Thủ quỹ','HLV'))) $$;
create or replace function public.can_manage_finance(p_club_id bigint, p_user_id uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$ select public.is_active_member(p_club_id,p_user_id) and exists(select 1 from public.club_members m where m.club_id=p_club_id and m.user_id=p_user_id and (m.role='owner' or m.title='Thủ quỹ')) $$;

-- Identity emails must come from confirmed Auth, not a freely edited profile.
revoke update(email) on public.profiles from authenticated;
create or replace function public.sync_auth_profile() returns trigger language plpgsql security definer set search_path = public as $$
begin
 update public.profiles set email=lower(new.email),name=coalesce(new.raw_user_meta_data->>'name',name) where id=new.id;
 return new;
end $$;
create trigger qa_sync_auth_profile after update of email, raw_user_meta_data on auth.users for each row execute function public.sync_auth_profile();
revoke all on function public.sync_auth_profile() from public,anon,authenticated;

-- Linking an account must not be possible via generic roster writes.
revoke insert,update on public.player_profiles from authenticated;
grant insert(club_id,full_name,email,phone,date_of_birth,jersey_number,position,preferred_foot,status,notes,team_id,avatar_path) on public.player_profiles to authenticated;
grant update(full_name,email,phone,date_of_birth,jersey_number,position,preferred_foot,status,notes,avatar_path) on public.player_profiles to authenticated;

-- Audit and friendly pages were advertised but SELECT grants were absent.
grant select on public.audit_logs,public.friendly_invitations to authenticated;

-- Inactive electors lose access even to their old votes.
drop policy club_poll_electors_select on public.club_poll_electors;
create policy club_poll_electors_select on public.club_poll_electors for select to authenticated using (public.is_active_member(club_id) and (user_id=auth.uid() or public.can_manage_roster(club_id)));
drop policy club_poll_votes_select on public.club_poll_votes;
create policy club_poll_votes_select on public.club_poll_votes for select to authenticated using (public.is_active_member(club_id) and (user_id=auth.uid() or public.can_manage_roster(club_id)));

-- Notifications can only be marked read, not forged or moved to another club.
revoke update on public.notifications from authenticated;
grant update(read_at) on public.notifications to authenticated;

-- Users never execute internal trigger functions through the API.
revoke execute on function public.handle_new_user(), public.set_updated_at(), public.record_team_dues(bigint,bigint,bigint,date,integer,text), public.assert_financial_period_open(bigint,date) from authenticated;
create or replace function public.close_financial_period(p_club_id bigint, p_period_id bigint) returns public.financial_periods
language plpgsql security definer set search_path = public as $$
declare row_value public.financial_periods;
begin
  if not public.can_manage_finance(p_club_id) then raise exception 'forbidden'; end if;
  perform 1 from public.clubs where id=p_club_id for update;
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
  if not public.can_manage_finance(p_club_id) or p_amount is null or p_amount <= 0 or p_amount::text in ('NaN','Infinity','-Infinity') or p_amount <> round(p_amount,2) or coalesce(trim(p_description),'')='' then raise exception 'forbidden_or_invalid'; end if;
  perform 1 from public.clubs where id=p_club_id and status='active' for update;
  if not found then raise exception 'inactive_club'; end if;
  if p_idempotency_key is not null then
    select * into row_value from public.finance_transactions where club_id=p_club_id and idempotency_key=p_idempotency_key;
    if row_value.id is not null then
      if row_value.type is distinct from p_type or row_value.amount is distinct from p_amount or row_value.occurred_on is distinct from p_occurred_on or row_value.description is distinct from trim(p_description) then raise exception 'idempotency_conflict'; end if;
      return row_value; end if;
  end if;
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
  perform 1 from public.clubs where id=p_club_id for update;
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
  perform 1 from public.clubs where id=p_club_id for update;
  select * into row_value from public.transaction_approvals where club_id=p_club_id and finance_transaction_id=p_transaction_id for update;
  if row_value.id is null or row_value.status <> 'pending' then raise exception 'approval_not_pending'; end if;
  select * into tx from public.finance_transactions where club_id=p_club_id and id=p_transaction_id for update;
  if tx.id is null or tx.status <> 'pending' then raise exception 'transaction_not_found'; end if;
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
  perform 1 from public.clubs where id=p_club_id for update;
  select * into original from public.finance_transactions where club_id=p_club_id and id=p_transaction_id for update;
  perform public.assert_financial_period_open(p_club_id,current_date);
  if p_idempotency_key is not null then
    select * into reversal from public.finance_transactions where club_id=p_club_id and idempotency_key=p_idempotency_key;
    if reversal.id is not null then
      if reversal.reversal_of_id is distinct from p_transaction_id then raise exception 'idempotency_conflict'; end if;
      return jsonb_build_object('original',to_jsonb(original),'reversal',to_jsonb(reversal)); end if;
  end if;
  if original.id is null or original.status <> 'posted' or original.reversal_of_id is not null then raise exception 'invalid_reversal_state'; end if;
  if exists(select 1 from public.team_dues_entries where club_id=p_club_id and finance_transaction_id=p_transaction_id)
     or exists(select 1 from public.payments where club_id=p_club_id and idempotency_key=original.idempotency_key)
     then raise exception 'linked_payment_requires_dedicated_reversal'; end if;
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
  if not public.can_manage_finance(p_club_id) or p_amount is null or p_amount <= 0 or p_amount::text in ('NaN','Infinity','-Infinity') or p_amount <> round(p_amount,2) or p_allocations is null or jsonb_typeof(p_allocations) <> 'array' then raise exception 'forbidden_or_invalid'; end if;
  perform 1 from public.clubs where id=p_club_id and status='active' for update;
  if not found then raise exception 'inactive_club'; end if;
  if p_idempotency_key is not null then
    select * into payment_row from public.payments where club_id=p_club_id and idempotency_key=p_idempotency_key;
    if payment_row.id is not null then
      if payment_row.amount is distinct from p_amount or payment_row.player_id is distinct from p_player_id or payment_row.paid_on is distinct from p_paid_on then raise exception 'idempotency_conflict'; end if;
      return jsonb_build_object('payment',to_jsonb(payment_row),'replayed',true); end if;
  end if;
  perform public.assert_financial_period_open(p_club_id,p_paid_on);
  if p_player_id is not null and not exists(select 1 from public.player_profiles where club_id=p_club_id and id=p_player_id) then raise exception 'player_not_found'; end if;
  insert into public.finance_transactions(club_id,created_by,type,amount,occurred_on,description,paid_by,idempotency_key,status)
  values(p_club_id,auth.uid(),'income',p_amount,p_paid_on,'Thanh toán công nợ',p_external_ref,coalesce(p_idempotency_key,gen_random_uuid()),'posted') returning id into tx_id;
  insert into public.payments(club_id,player_id,amount,paid_on,status,external_ref,created_by,idempotency_key)
  values(p_club_id,p_player_id,p_amount,p_paid_on,'posted',nullif(trim(p_external_ref),''),auth.uid(),p_idempotency_key) returning * into payment_row;
  for item in select value from jsonb_array_elements(p_allocations) loop
    allocation_amount := (item->>'amount')::numeric;
    if allocation_amount is null or allocation_amount <= 0 or allocation_amount::text in ('NaN','Infinity','-Infinity') or allocation_amount <> round(allocation_amount,2) then raise exception 'invalid_allocation'; end if;
    select * into dues_row from public.team_dues_entries where club_id=p_club_id and id=(item->>'dues_entry_id')::bigint for update;
    if dues_row.id is null or dues_row.status in ('exempt','paid') then raise exception 'dues_entry_not_found'; end if;
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
    'income', coalesce(sum(amount) filter (where type='income' and status in ('posted','reversed')),0),
    'expense', coalesce(sum(amount) filter (where type='expense' and status in ('posted','reversed')),0),
    'pending', coalesce(sum(amount) filter (where status='pending'),0),
    'rejected', coalesce(sum(amount) filter (where status='rejected'),0),
    'count', count(*)
  ) from public.finance_transactions
  where club_id=p_club_id and occurred_on between p_from and p_to and public.can_view_finance(p_club_id)
$$;
-- Serialize all ledger writes, including dues RPCs, with period closure.
create or replace function public.guard_ledger_period() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if TG_OP='DELETE' then
    perform 1 from public.clubs where id=old.club_id for update;
    perform public.assert_financial_period_open(old.club_id,old.occurred_on);
    return old;
  end if;
  perform 1 from public.clubs where id=new.club_id for update;
  perform public.assert_financial_period_open(new.club_id,new.occurred_on);
  if TG_OP='UPDATE' then perform public.assert_financial_period_open(old.club_id,old.occurred_on); end if;
  return new;
end $$;
create trigger qa_ledger_period before insert or update or delete on public.finance_transactions for each row execute function public.guard_ledger_period();
revoke all on function public.guard_ledger_period() from public,anon,authenticated;
revoke execute on all functions in schema public from public,anon;

