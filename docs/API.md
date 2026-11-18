# Hợp đồng dữ liệu FCMS PRO

Frontend gọi Supabase trực tiếp bằng `@supabase/supabase-js`. Mọi truy vấn thuộc CLB đều phải chứa `club_id` và được PostgreSQL RLS kiểm tra theo membership đang hoạt động.

## Authentication

- `supabase.auth.signUp()` đăng ký tài khoản.
- `supabase.auth.signInWithPassword()` đăng nhập.
- `supabase.auth.signOut()` đăng xuất.
- `supabase.auth.resetPasswordForEmail()` gửi liên kết đặt lại mật khẩu.
- `supabase.auth.updateUser()` cập nhật hồ sơ hoặc mật khẩu.

Session được lưu và tự refresh bởi Supabase Auth; frontend không lưu secret hoặc service key.

## RPC quan trọng

| Nghiệp vụ | RPC |
| --- | --- |
| Tạo CLB | `create_club` |
| Gửi lời mời | `create_club_invitation` |
| Nhận lời mời | `accept_club_invitation` |
| Ghi thu/chi | `record_finance_transaction` |
| Ghi đóng quỹ | `record_player_dues` |
| Điều chỉnh đóng quỹ | `correct_team_dues` |
| Nhập/xuất kho | `record_inventory_movement` |
| Cấp phát/thu hồi tài sản | `assign_inventory`, `return_inventory_assignment` |
| Chia chi phí trận đấu | `create_match_cost_split` |
| Tạo biểu quyết | `create_club_poll` |
| Bỏ phiếu | `cast_club_poll_vote` |
| Commit import thành viên | `commit_member_import` |
| Tạo/khóa kỳ tài chính | `create_financial_period`, `close_financial_period` |
| Yêu cầu/phê duyệt giao dịch | `request_finance_approval`, `decide_finance_approval` |
| Đảo giao dịch | `reverse_finance_transaction` |
| Ghi thanh toán và phân bổ công nợ | `post_finance_payment` |
| Tổng hợp tài chính | `finance_summary` |

Các RPC tài chính và tồn kho kiểm tra quyền, khóa dòng cần thiết, chống replay bằng idempotency/audit khi nghiệp vụ yêu cầu và thực hiện thay đổi trong cùng transaction PostgreSQL.

## Response và lỗi

Adapter tại `frontend/src/supabase-api.js` chuyển kết quả về envelope `{ data, meta }` mà giao diện đang sử dụng. Lỗi Supabase được chuyển thành `SupabaseApiError` để UI hiển thị trạng thái lỗi, validation hoặc hết phiên.

Không có HTTP API riêng cần proxy qua frontend. Edge Functions chỉ được thêm cho nghiệp vụ cần secret hoặc webhook phía máy chủ.
