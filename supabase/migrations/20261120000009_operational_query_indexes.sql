-- Indexes for the club-scoped ordered feeds used most often by the web app.
create index if not exists team_trainings_club_date_idx
  on public.team_trainings(club_id, training_date desc);
create index if not exists club_celebrations_club_date_idx
  on public.club_celebrations(club_id, event_date desc);
create index if not exists club_awards_club_year_idx
  on public.club_awards(club_id, award_year desc);
create index if not exists match_attendances_club_match_idx
  on public.match_attendances(club_id, match_id, player_id);
create index if not exists player_match_stats_club_match_idx
  on public.player_match_stats(club_id, match_id, player_id);
create index if not exists team_dues_entries_club_month_idx
  on public.team_dues_entries(club_id, month, player_id, team_id);
create index if not exists team_dues_rates_club_team_month_idx
  on public.team_dues_rates(club_id, team_id, effective_month desc);
create index if not exists inventory_movements_club_item_idx
  on public.inventory_movements(club_id, inventory_item_id, id desc);
