# PostgreSQL/Supabase database

Schema duy nhất cho Project 2 nằm tại [20261119000000_fcms_supabase.sql](../supabase/migrations/20261119000000_fcms_supabase.sql).

Migration hiện có 54 bảng, gồm profiles, clubs/memberships, teams/players, finance/dues/approvals/payments, inventory, matches/attendance/stats/costs, activities/events, discipline, recruitment, sponsorship, polls, seasons, notifications, import jobs và public settings.

Mọi bảng tenant đều có `club_id` hoặc policy theo `auth.uid()`. Tiền dùng `numeric(20,2)`. Ghi finance/dues/inventory/match costs/import/discipline nhiều bảng đi qua PostgreSQL RPC có permission check, tenant check và transaction boundary.

Migration dành cho một Supabase project mới hoặc database staging được kiểm soát. Migration không seed account và không xóa dữ liệu.
