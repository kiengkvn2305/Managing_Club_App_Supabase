-- Các hàm pgcrypto của Supabase nằm trong schema extensions. Gọi đủ tên schema
-- để các hàm SECURITY DEFINER không phụ thuộc search_path khi chạy db lint.

create or replace function public.accept_club_invitation(p_token text) returns public.clubs language plpgsql security definer set search_path = public as $$
declare i public.club_invitations; c public.clubs;
begin
  select * into i from public.club_invitations where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') for update;
  if i.id is null or i.accepted_at is not null or i.expires_at < now() or lower(i.email) <> lower((select email from public.profiles where id=auth.uid())) then raise exception 'invalid_invitation'; end if;
  select * into c from public.clubs where id=i.club_id for update;
  if c.status <> 'active' then raise exception 'inactive_club'; end if;
  if exists(select 1 from public.club_members where club_id=c.id and user_id=auth.uid()) then raise exception 'already_member'; end if;
  insert into public.club_members(club_id,user_id,role) values(c.id,auth.uid(),i.role);
  update public.club_invitations set accepted_at=now() where id=i.id;
  insert into public.audit_logs(club_id,actor_id,action,subject_type,subject_id) values(c.id,auth.uid(),'invitation.accepted','ClubInvitation',i.id);
  return c;
end $$;

create or replace function public.create_club_invitation(p_club_id bigint,p_email text,p_role public.club_role) returns jsonb language plpgsql security definer set search_path = public as $$
declare token_value text := encode(extensions.gen_random_bytes(32),'hex'); invitation public.club_invitations; actor_role public.club_role := public.club_role(p_club_id); normalized_email text := lower(trim(p_email));
begin
  if p_role='owner' or normalized_email='' or (p_role='co_owner' and actor_role <> 'owner') or (p_role='member' and actor_role not in ('owner','co_owner','general_manager','hr_manager')) or (p_role not in ('co_owner','member') and actor_role not in ('owner','co_owner')) then raise exception 'forbidden_or_invalid'; end if;
  if not exists(select 1 from public.clubs where id=p_club_id and status='active') then raise exception 'inactive_club'; end if;
  if exists(select 1 from public.club_members m join public.profiles p on p.id=m.user_id where m.club_id=p_club_id and m.status='active' and lower(p.email)=normalized_email) then raise exception 'already_member'; end if;
  insert into public.club_invitations(club_id,invited_by,email,role,token_hash,expires_at) values(p_club_id,auth.uid(),normalized_email,p_role,encode(extensions.digest(token_value,'sha256'),'hex'),now()+interval '7 days') on conflict(club_id,email) do update set invited_by=excluded.invited_by,role=excluded.role,token_hash=excluded.token_hash,expires_at=excluded.expires_at,accepted_at=null,updated_at=now() returning * into invitation;
  return jsonb_build_object('id',invitation.id,'email',invitation.email,'role',invitation.role,'token',token_value,'expires_at',invitation.expires_at);
end $$;

create or replace function public.record_team_dues(p_club_id bigint,p_team_id bigint,p_player_id bigint,p_month date,p_months integer,p_status text) returns jsonb language plpgsql security definer set search_path = public as $$
declare cursor_month date:=date_trunc('month',p_month)::date; n integer:=0; amount_value numeric(20,2);
begin
  if not public.can_manage_finance(p_club_id) or p_months < 1 or p_months > 24 or p_status not in ('paid','exempt','unpaid') then raise exception 'forbidden_or_invalid'; end if;
  perform 1 from public.teams where club_id=p_club_id and id=p_team_id for update;
  while n < p_months loop
    select amount into amount_value from public.team_dues_rates where club_id=p_club_id and team_id=p_team_id and effective_month <= cursor_month order by effective_month desc limit 1;
    if amount_value is not null then
      insert into public.team_dues_entries(club_id,team_id,player_id,month,status,amount,created_by) values(p_club_id,p_team_id,p_player_id,cursor_month,p_status,amount_value,auth.uid()) on conflict(team_id,player_id,month) do update set status=excluded.status, amount=excluded.amount, updated_at=now();
    end if;
    cursor_month := (cursor_month + interval '1 month')::date; n:=n+1;
  end loop;
  return jsonb_build_object('player_id',p_player_id,'team_id',p_team_id,'months',p_months,'status',p_status);
end $$;

create or replace function public.create_match_cost_split(p_club_id bigint,p_match_id bigint,p_stadium numeric,p_referee numeric,p_water numeric,p_equipment numeric,p_other numeric,p_sponsorship numeric,p_method text,p_players jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare split_row public.match_cost_splits; match_team_id bigint; total_amount numeric := coalesce(p_stadium,0)+coalesce(p_referee,0)+coalesce(p_water,0)+coalesce(p_equipment,0)+coalesce(p_other,0)-coalesce(p_sponsorship,0); player_row jsonb;
begin
  if not public.can_manage_roster(p_club_id) then raise exception 'forbidden'; end if;
  if total_amount < 0 or p_method not in ('equal','weighted','custom') then raise exception 'invalid_cost_split'; end if;
  select team_id into match_team_id from public.club_matches where club_id=p_club_id and id=p_match_id for update;
  if not found then raise exception 'match_not_found'; end if;
  if exists(select 1 from public.match_cost_splits where club_id=p_club_id and match_id=p_match_id) then raise exception 'cost_split_exists'; end if;
  insert into public.match_cost_splits(club_id,match_id,stadium,referee,water,equipment,other,sponsorship,total,method,payload_hash,created_by) values(p_club_id,p_match_id,coalesce(p_stadium,0),coalesce(p_referee,0),coalesce(p_water,0),coalesce(p_equipment,0),coalesce(p_other,0),coalesce(p_sponsorship,0),total_amount,p_method,encode(extensions.digest(coalesce(p_players,'[]'::jsonb)::text,'sha256'),'hex'),auth.uid()) returning * into split_row;
  for player_row in select value from jsonb_array_elements(coalesce(p_players,'[]'::jsonb)) loop
    if not exists(select 1 from public.player_profiles p where p.club_id=p_club_id and p.id=(player_row->>'player_id')::bigint and (exists(select 1 from public.team_players tp where tp.club_id=p_club_id and tp.team_id=match_team_id and tp.player_id=p.id) or exists(select 1 from public.match_attendances ma where ma.club_id=p_club_id and ma.match_id=p_match_id and ma.player_id=p.id))) then raise exception 'invalid_receivable_player'; end if;
    insert into public.match_cost_receivables(club_id,split_id,player_id,amount,exempt,weight) values(p_club_id,split_row.id,(player_row->>'player_id')::bigint,coalesce((player_row->>'amount')::numeric,0),coalesce((player_row->>'exempt')::boolean,false),coalesce((player_row->>'weight')::integer,1));
  end loop;
  return jsonb_build_object('split',to_jsonb(split_row));
end $$;

create or replace function public.commit_member_import(p_club_id bigint,p_rows jsonb,p_decisions jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare row_value jsonb; decision jsonb; action text; target_id bigint; created_count integer:=0; overwritten_count integer:=0; skipped_count integer:=0;
begin
  if not public.can_manage_roster(p_club_id) or jsonb_array_length(p_rows) <> jsonb_array_length(p_decisions) or jsonb_array_length(p_rows)>500 then raise exception 'forbidden_or_invalid'; end if;
  for row_index in 0..jsonb_array_length(p_rows)-1 loop
    row_value:=p_rows->row_index; decision:=p_decisions->row_index; action:=decision->>'action'; target_id:=nullif(decision->>'target_id','')::bigint;
    if action='skip' then skipped_count:=skipped_count+1;
    elsif action='overwrite' then
      if target_id is null or not exists(select 1 from public.player_profiles where club_id=p_club_id and id=target_id) then raise exception 'invalid_import_target'; end if;
      update public.player_profiles set full_name=coalesce(row_value->>'full_name',full_name),email=nullif(lower(row_value->>'email'),''),phone=nullif(row_value->>'phone',''),date_of_birth=nullif(row_value->>'date_of_birth','')::date,position=nullif(row_value->>'position',''),preferred_foot=nullif(row_value->>'preferred_foot',''),status=coalesce(nullif(row_value->>'status',''),status::text)::public.player_status,notes=nullif(row_value->>'notes','') where club_id=p_club_id and id=target_id; overwritten_count:=overwritten_count+1;
    elsif action='create' then
      insert into public.player_profiles(club_id,full_name,email,phone,date_of_birth,position,preferred_foot,status,notes) values(p_club_id,row_value->>'full_name',nullif(lower(row_value->>'email'),''),nullif(row_value->>'phone',''),nullif(row_value->>'date_of_birth','')::date,nullif(row_value->>'position',''),nullif(row_value->>'preferred_foot',''),coalesce(nullif(row_value->>'status',''),'active')::public.player_status,nullif(row_value->>'notes','')); created_count:=created_count+1;
    else raise exception 'invalid_import_decision'; end if;
  end loop;
  return jsonb_build_object('created',created_count,'overwritten',overwritten_count,'skipped',skipped_count);
end $$;
