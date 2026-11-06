# ADR-005. Mô hình phân hệ Công việc – Dự án phiên bản 2

- Ngày: 06/11/2026
- Trạng thái: Đang áp dụng (Giai đoạn 1)
- Căn cứ: `docs/02-thiet-ke/YEU-CAU-CONG-VIEC-DU-AN.md`

## Quyết định
1. **Mô-đun máy chủ:** tách thành `work.js`, đăng ký theo mẫu `register({ route, ... })`. Gỡ các route dự án, công việc cũ khỏi `server.js`; giữ nguyên đường dẫn `/api/projects`, `/api/tasks` và mở rộng.
2. **Lược đồ:** mở rộng bảng `projects`, `tasks` bằng `addCol`, không xóa cột cũ, để giữ dữ liệu bản 1.x. Thêm các bảng `project_members`, `task_groups`, `task_followers`, `task_results`, `task_logs`.
3. **Chuyển dữ liệu:** dữ liệu cũ được chuyển một lần.
   - Người tạo dự án thành Quản lý.
   - Người giao và người nhận các công việc trong dự án thành Thành viên.
4. **Phân quyền:**
   - **Toàn quyền:** quản trị hệ thống và giám đốc (tương đương Owner).
   - **Theo dự án:** vai trò `manager`, `member`, `follower`.
   - **Theo công việc:** người giao, người nhận, người theo dõi.
   - Thiết lập lưu ở cột `projects.settings` (JSON). Giá trị mặc định khai báo tại `work.js`.
5. **Trạng thái công việc:** `todo`, `doing`, `review`, `done`, `failed`.
   - `completed_at` là lúc người làm bấm hoàn thành, dùng để tính đúng hạn.
   - `done_at` là lúc công việc được ghi nhận hoàn thành.
6. **Giao diện:** tách thành `public/work.js`, thay màn hình `cong-viec` cũ. Địa chỉ màn hình dạng `#cong-viec?p=<mã dự án>&v=<chế độ xem>`.

## Hệ quả
- Sửa lỗi lộ dữ liệu: phiên bản 1.x cho mọi người dùng xem toàn bộ công việc.
- Bảng tổng quan và bộ đếm trên menu vẫn đọc bảng `tasks` như cũ. Các giá trị `done` và `failed` được tính là đã kết thúc.
- Giai đoạn 2 (phụ thuộc, lặp lại, trường tùy chỉnh, mẫu) sẽ bổ sung bảng mới, không phá vỡ lược đồ này.
