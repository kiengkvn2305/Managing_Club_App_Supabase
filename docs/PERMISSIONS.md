# Phân quyền

RLS là authority cuối cùng; frontend chỉ ẩn/hiện nút để hỗ trợ UX.

- `club_members`: một user nhiều CLB; một CLB nhiều managers.
- `is_active_member`: tenant visibility.
- `can_manage_club`: owner/co-owner/general manager.
- `can_manage_roster`: owner/co-owner/general manager/HR/sporting.
- `can_view_finance`: owner hoặc title finance được phép.
- `can_manage_finance`: owner hoặc Thủ quỹ.
- `can_view/manage_inventory`: role equipment phù hợp.
- `can_manage_people`: owner/co-owner/general manager/HR.
- Finance, dues, inventory, match-cost và import writes dùng RPC có kiểm tra quyền trong database.

Không có policy “mọi authenticated user được xem/sửa mọi CLB”.
