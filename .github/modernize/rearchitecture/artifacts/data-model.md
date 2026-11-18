# Existing data model

This is an inventory of the Laravel/MySQL model as-is. It records the source schema; it is not a redesign.

## Accounts and tenancy

`users` stores account identity, activation, verification and avatar metadata. `clubs` is the tenant root with status, format(s), discovery and image metadata. `club_members` is the many-to-many user/club membership with one role and optional title per club. `club_invitations` is an expiring, hashed invitation. `audit_logs` records a club-scoped actor and subject.

## Roster and teams

`teams` belongs to a club; `team_managers` maps teams to club memberships; `player_profiles` belongs to a club and can be linked to a user; `team_players` is the many-to-many player/team assignment with per-team jersey and position. The legacy `player_profiles.team_id` remains a primary-team convenience field. `match_lineups` stores a JSON player layout and can link to `club_matches`.

## Finance and dues

`finance_transactions` is a club-scoped income/expense ledger. `team_dues_rates`, `team_membership_periods` and `team_dues_entries` calculate monthly team dues. `team_dues_adjustments` is correction history. Board-specific dues use `club_board_members`, `board_membership_periods`, `board_dues_rates`, `shared_board_dues_rates`; `planned_expenses` is explicitly planned data and does not create ledger rows.

## Operations and advanced modules

Activities: `club_celebrations`, `team_trainings`, `club_awards`. Matches: `friendly_invitations`, `club_matches`, `match_attendances`, `player_match_stats`, `match_cost_splits`, `match_cost_receivables`. Inventory: `inventory_items`, `inventory_movements`, `inventory_assignments`. Governance: `club_polls`, `club_poll_options`, `club_poll_electors`, `club_poll_votes`. Other modules: `recruitment_posts`, `recruitment_applications`, `sponsors`, `sponsorships`, `sponsorship_receipts`, `discipline_cases`, `discipline_case_history`, `board_tasks`.

## Key relationships

- One user can have many active `club_members` rows; one club can have many users and many titled managers.
- Every club-owned row carries `club_id`; important cross-tenant references use composite `(club_id, id)` foreign keys.
- A player may belong to multiple teams through `team_players`; jersey and position are team-specific there.
- Financial rows are append/correction records linked to the club and actor; due entries may reference a ledger transaction.
- Poll votes require a matching elector and option inside the same club/poll.
