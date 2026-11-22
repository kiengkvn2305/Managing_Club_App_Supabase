-- Automatically close unmarked training attendance 10 minutes after the
-- scheduled Vietnam time. The scheduler runs in PostgreSQL, not in a browser.
create extension if not exists pg_cron;

create index if not exists team_trainings_auto_absence_idx
  on public.team_trainings(training_date, training_time)
  where training_status = 'scheduled' and approval_status = 'approved';

create or replace function public.auto_mark_overdue_training_absences(
  p_now timestamptz default clock_timestamp()
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_training public.team_trainings;
  v_attendance jsonb;
  v_changed integer := 0;
begin
  for v_training in
    select *
    from public.team_trainings
    where training_status = 'scheduled'
      and approval_status = 'approved'
      and (
        (training_date::timestamp + training_time::time + interval '10 minutes')
        at time zone 'Asia/Ho_Chi_Minh'
      ) <= p_now
    for update skip locked
  loop
    with roster_from_periods as (
      select distinct p.id as player_id
      from public.team_membership_periods mp
      join public.player_profiles p
        on p.club_id = mp.club_id and p.id = mp.player_id
      where mp.club_id = v_training.club_id
        and mp.team_id = v_training.team_id
        and mp.joined_on <= v_training.training_date
        and (mp.left_on is null or mp.left_on > v_training.training_date)
        and p.status = 'active'
    ), legacy_roster as (
      select distinct p.id as player_id
      from public.team_players tp
      join public.player_profiles p
        on p.club_id = tp.club_id and p.id = tp.player_id
      where tp.club_id = v_training.club_id
        and tp.team_id = v_training.team_id
        and p.status = 'active'
        and not exists (
          select 1 from public.team_membership_periods mp
          where mp.club_id = tp.club_id
            and mp.team_id = tp.team_id
            and mp.player_id = tp.player_id
        )
    ), roster as (
      select player_id from roster_from_periods
      union
      select player_id from legacy_roster
    ), existing as (
      select (entry.value->>'player_id')::bigint as player_id,
             entry.value->>'status' as status
      from jsonb_array_elements(coalesce(v_training.attendance, '[]'::jsonb)) entry
      where coalesce(entry.value->>'player_id', '') ~ '^[0-9]+$'
    ), everyone as (
      select player_id from roster
      union
      select player_id from existing
    )
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'player_id', everyone.player_id,
          'status', case
            when existing.status in ('present', 'excused', 'absent') then existing.status
            else 'absent'
          end
        ) order by everyone.player_id
      ),
      '[]'::jsonb
    ) into v_attendance
    from everyone
    left join existing using (player_id);

    if v_attendance is distinct from v_training.attendance then
      perform set_config('app.fcms_training_attendance_write', 'on', true);
      update public.team_trainings
      set attendance = v_attendance
      where id = v_training.id;
      insert into public.audit_logs(club_id, actor_id, action, subject_type, subject_id)
      values (
        v_training.club_id,
        null,
        'training.attendance_auto_absent',
        'TeamTraining',
        v_training.id
      );
      v_changed := v_changed + 1;
    end if;
  end loop;
  return v_changed;
end;
$$;

revoke all on function public.auto_mark_overdue_training_absences(timestamptz) from public, anon, authenticated;

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'fcms-auto-mark-training-absences';
  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
  perform cron.schedule(
    'fcms-auto-mark-training-absences',
    '* * * * *',
    'select public.auto_mark_overdue_training_absences();'
  );
end;
$$;
