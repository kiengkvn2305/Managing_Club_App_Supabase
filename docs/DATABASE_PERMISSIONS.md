# Ma trận quyền PostgreSQL/RLS FCMS PRO

Ngày audit: 2026-11-19. Migrations hiện có trong checkout định nghĩa 54 bảng `public` (không phải 56). Cần đối chiếu lại remote sau khi có quyền database để xác định hai bảng chênh lệch nếu production thực sự có 56.

Migration sửa quyền: [20261119000003_permissions_hardening.sql](../supabase/migrations/20261119000003_permissions_hardening.sql) và [20261119000004_finance_select_grants.sql](../supabase/migrations/20261119000004_finance_select_grants.sql).

Quy ước:

- `RLS` = policy kiểm tra membership/quyền theo CLB.
- `SELECT` = đọc trực tiếp qua Data API sau khi RLS lọc dòng.
- `RPC` = không cấp DML trực tiếp; chỉ gọi function đã kiểm tra quyền và tenant.
- `—` = không cấp cho `anon`/`authenticated`.

## Hồ sơ, CLB và thành viên

| Bảng | Grant authenticated | Grant anon | RLS/policy | Ghi trực tiếp |
| --- | --- | --- | --- | --- |
| `profiles` | SELECT các cột không nhạy cảm; UPDATE `name,email,avatar_path` | — | bản thân hoặc người cùng CLB đang active | chỉ cột hồ sơ; không có `is_system_admin` |
| `clubs` | SELECT; UPDATE các cột CLB | — | thành viên active hoặc CLB discoverable; manager update | tạo qua `create_club` RPC |
| `club_members` | SELECT; UPDATE `title` | — | thành viên active; owner policy | role/status/user/club không ghi trực tiếp |
| `club_invitations` | — | — | không mở Data API | `create_club_invitation`, `accept_club_invitation` |
| `audit_logs` | SELECT cho manager CLB | — | manager CLB | chỉ RPC/server-side audit |
| `club_public_settings` | SELECT | SELECT published | member hoặc published active | update không mở Data API |

## Đội bóng và hồ sơ cầu thủ

| Bảng | Grant authenticated | Grant anon | RLS/policy | Ghi trực tiếp |
| --- | --- | --- | --- | --- |
| `teams` | SELECT, INSERT, UPDATE | — | active member đọc; roster manager ghi | chỉ cột đội; captain không vượt tenant |
| `player_profiles` | SELECT, INSERT, UPDATE, DELETE | — | active member đọc; roster manager ghi | profile CRUD theo CLB |
| `team_managers` | SELECT | — | active member đọc | thay đổi cần workflow quản lý |
| `team_players` | SELECT | — | active member đọc | `sync_team_players`, `set_team_player_attribute` |
| `team_membership_periods` | — | — | chưa mở Data API | ghi theo workflow roster |

## Tài chính, quỹ, công nợ và thanh toán

| Bảng | Grant authenticated | Grant anon | RLS/policy | Ghi trực tiếp |
| --- | --- | --- | --- | --- |
| `finance_transactions` | SELECT | — | `can_view_finance` | `record_finance_transaction`, reversal |
| `financial_periods` | SELECT | — | `can_view_finance` | `create/close_financial_period` |
| `funds` | SELECT | — | `can_view_finance` | không mở ghi trực tiếp |
| `transaction_approvals` | SELECT | — | `can_view_finance` | request/decide approval RPC |
| `payments` | SELECT | — | `can_view_finance` | `post_finance_payment` |
| `payment_allocations` | SELECT | — | `can_view_finance` | tạo trong payment RPC |
| `planned_expenses` | SELECT | — | `can_view_finance` | `save/cancel_planned_expense` |
| `team_dues_rates` | SELECT, INSERT, UPDATE | — | `can_view_finance`; manager write | cấu hình mức quỹ, chưa phải ledger |
| `team_dues_entries` | SELECT | — | `can_view_finance` | `record_player_dues`, correction, payment RPC |
| `team_dues_adjustments` | SELECT | — | `can_view_finance` | correction RPC |
| `match_cost_splits` | SELECT | — | `can_view_finance` | `create_match_cost_split` |
| `match_cost_receivables` | SELECT | — | `can_view_finance` | tạo cùng cost split RPC |

## Lịch thi đấu, tập luyện và thống kê

| Bảng | Grant authenticated | Grant anon | RLS/policy | Ghi trực tiếp |
| --- | --- | --- | --- | --- |
| `friendly_invitations` | SELECT | — | manager CLB nguồn/đích | create/respond RPC |
| `club_matches` | SELECT, INSERT, UPDATE | — | active member đọc; roster manager ghi | không mở DELETE |
| `match_lineups` | SELECT, INSERT, UPDATE | — | active member đọc; roster manager ghi | lineup CRUD giới hạn |
| `match_attendances` | SELECT, INSERT, UPDATE | — | active member đọc; roster manager ghi | không mở DELETE |
| `player_match_stats` | SELECT, INSERT, UPDATE | — | active member đọc; roster manager ghi | delete qua RPC |
| `club_celebrations` | SELECT, INSERT, UPDATE | — | activity permission | approval vẫn theo policy |
| `team_trainings` | SELECT, INSERT, UPDATE | — | activity permission | attendance update theo activity permission |
| `club_awards` | SELECT, INSERT, UPDATE | — | activity permission | không mở DELETE |
| `seasons` | SELECT | — | active member đọc; manager policy | workflow mùa giải chưa mở UI ghi |
| `club_events` | SELECT | — | active member đọc; manager policy | workflow sự kiện chưa mở UI ghi |
| `notifications` | SELECT, UPDATE | — | chỉ `user_id=auth.uid()` | tạo notification server-side |

## Kho và tài sản

| Bảng | Grant authenticated | Grant anon | RLS/policy | Ghi trực tiếp |
| --- | --- | --- | --- | --- |
| `inventory_items` | SELECT, INSERT | — | inventory view/manage | update/archive/restore qua RPC |
| `inventory_movements` | SELECT | — | inventory view | `record_inventory_movement` |
| `inventory_assignments` | SELECT | — | inventory view | `assign_inventory`, `return_inventory_assignment` |

## Biểu quyết, tuyển quân, kỷ luật và tài trợ

| Bảng | Grant authenticated | Grant anon | RLS/policy | Ghi trực tiếp |
| --- | --- | --- | --- | --- |
| `club_polls` | SELECT | — | active member | create/vote RPC |
| `club_poll_options` | SELECT | — | active member | create poll RPC |
| `club_poll_electors` | SELECT | — | người bỏ phiếu hoặc manager | create poll RPC |
| `club_poll_votes` | SELECT | — | người bỏ phiếu hoặc manager | cast vote RPC |
| `recruitment_posts` | SELECT, INSERT, UPDATE | — | active member đọc; roster manager ghi | không mở DELETE |
| `recruitment_applications` | SELECT, INSERT, UPDATE | — | active member đọc; roster manager ghi | public application workflow còn mở |
| `discipline_cases` | SELECT | — | people manager | create/update discipline RPC |
| `discipline_case_history` | SELECT | — | people manager | append-only RPC |
| `sponsors` | SELECT, INSERT, UPDATE | — | finance view/manage | không mở DELETE |
| `sponsorships` | SELECT, INSERT, UPDATE | — | finance view/manage | không mở DELETE |
| `sponsorship_receipts` | SELECT, INSERT, UPDATE | — | finance view/manage | không mở DELETE |

## Ban chủ nhiệm, import và quản trị

| Bảng | Grant authenticated | Grant anon | RLS/policy | Ghi trực tiếp |
| --- | --- | --- | --- | --- |
| `club_board_members` | SELECT, INSERT, UPDATE | — | active member đọc; roster manager ghi | không mở DELETE |
| `board_membership_periods` | SELECT, INSERT, UPDATE | — | active member đọc; roster manager ghi | không mở DELETE |
| `board_dues_rates` | SELECT | — | active member đọc; roster manager policy | chưa mở ghi frontend |
| `shared_board_dues_rates` | SELECT, INSERT, UPDATE | — | active member đọc; roster manager ghi | không mở DELETE |
| `board_tasks` | SELECT, INSERT, UPDATE | — | active member đọc; roster manager ghi | không mở DELETE |
| `import_jobs` | — | — | policy giữ cho server workflow | commit import qua `commit_member_import` |

## Quyền function/schema/sequence

- `public` schema có `USAGE` cho `anon` và `authenticated`.
- `anon` không có EXECUTE function public sau hardening.
- `authenticated` chỉ EXECUTE helper RLS và RPC allow-list trong migration; các function còn lại bị revoke.
- Chỉ sequence của bảng frontend insert trực tiếp được cấp `USAGE`; sequence của bảng tài chính/audit/RPC giữ riêng.
- Không dùng `GRANT ALL ON ALL TABLES` và không tắt RLS.

## Giới hạn kiểm chứng

Local và production đã kiểm kê 54 bảng, chạy RLS/permission catalog và database tests. Production anonymous vẫn không đọc bảng private; authenticated role đã có SELECT CLB/tài chính/công nợ và không có INSERT trực tiếp vào finance. Cần đăng nhập một tài khoản production để hoàn tất browser smoke theo session thật.
