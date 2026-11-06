# ADR-008. Xác thực: khóa đăng nhập bền vững, thu hồi phiên, ép đổi mật khẩu, mật khẩu ban đầu một lần, nhật ký an ninh

- Ngày: 06/11/2026
- Trạng thái: Đang áp dụng. Thay thế ADR-004.
- Căn cứ:
  - báo cáo rà soát `docs/05-ra-soat/2026-11-06-RA-SOAT-XAC-THUC-LUU-TRU.md`, mục VII, các việc P0-2 đến P0-8;
  - `docs/09-tieu-chuan/TIEU-CHUAN-ATTT.md`;
  - OWASP ASVS 4.0.3 mức 2, chương V2 (xác thực), V3 (quản lý phiên), V7 (ghi nhật ký);
  - chỉ đạo của chủ sở hữu ngày 06/11/2026: sửa P0 trước khi nhập 91 tài khoản thật của Trung tâm Kinh doanh Giải pháp.

## Quyết định

1. **Khóa đăng nhập sai (P0-4).**
   - Bộ đếm lưu trong bảng `login_attempts(key, n, first_at, until_at)`, không dùng biến trong bộ nhớ. Vì vậy bộ đếm không mất khi tiến trình Node hoặc Durable Object khởi động lại.
   - Khóa theo tài khoản: sai 5 lần trong 15 phút thì khóa 5 phút, áp dụng cho mọi IP.
   - Khóa theo IP: sai 20 lần trong 15 phút thì khóa 5 phút.
   - Kiểm tra khóa trước khi băm mật khẩu, để khi đang khóa không tốn CPU cho scrypt (HN-02).
   - Tài khoản không tồn tại vẫn so khớp với một mã băm giả và trả cùng thông báo, để không lộ tên đăng nhập qua nội dung hoặc thời gian phản hồi.
   - Lỗi cũ tại `server.js:88` (bản trước): bộ đếm bị đặt lại về 0 sau mỗi lần sai nên không bao giờ khóa. Lỗi này đã được sửa.
2. **Thu hồi phiên khi đổi mật khẩu (P0-5).** Xóa mọi phiên của người dùng và cấp phiên mới cho thiết bị đang dùng. Khi quản trị đặt lại mật khẩu hoặc khóa tài khoản, phiên cũng bị thu hồi ngay (đã có từ trước).
3. **Máy chủ ép đổi mật khẩu lần đầu (P0-6).** Khi `must_change_pw = 1`, máy chủ chỉ cho gọi `/api/bootstrap`, `/api/me/password`, `/api/logout`; các API khác trả 403. Giao diện không tải nội dung cho đến khi người dùng đổi mật khẩu.
4. **Mật khẩu ban đầu (P0-7).**
   - Gỡ cơ chế `ADMIN_PASSWORD_HASH` khỏi `wrangler.jsonc` và `worker/do-core.js`.
   - Bí mật `ADMIN_PASSWORD` chỉ áp dụng một lần, đánh dấu bằng cờ `admin_bootstrapped` trong bảng `settings`.
   - Khi gặp cơ sở dữ liệu có admin đã đổi mật khẩu, hệ thống chỉ ghi cờ, không đổi mật khẩu.
   - Bản Node không có dữ liệu mẫu sinh mật khẩu ngẫu nhiên và in ra màn hình một lần, thay cho `Admin@123`. Dữ liệu mẫu cục bộ vẫn dùng `Admin@123` và `123456`.
   - Mật khẩu mới phải khác mật khẩu hiện tại. Mật khẩu khởi tạo khi nhập tài khoản phải gồm cả chữ và số.
5. **Nhật ký an ninh.**
   - Bảng `security_log(at, event, user_id, username, ip, detail)` ghi các sự kiện: `login_ok`, `login_fail`, `login_locked`, `password_change`, `password_reset`, `account_disabled`, `users_import`, `admin_bootstrap`. Không ghi mật khẩu.
   - Quản trị xem qua `GET /api/admin/security-log` (tối đa 200 bản ghi mỗi trang, lọc theo `event`).
6. **Tắt `SO_DEBUG` (P0-3).** Phản hồi 500 không còn chi tiết kỹ thuật; chi tiết chỉ ghi vào nhật ký Workers.
7. **Dữ liệu mẫu (P0-8).** `SO_DEMO` để trống ở môi trường thật; `worker/do-core.js` chỉ nạp dữ liệu mẫu khi `SO_DEMO` bằng `"1"`.
8. **Nhập tài khoản.** Chức năng nhập nhận thêm tệp `.xlsx` và cột thứ 7 "Lãnh đạo phòng" để gán `departments.head_id`.

## Chưa xử lý, hạn chế

- **P0-1** đã sửa trước đó (commit `5fdff58`).
- **P0-9 (sao lưu, xuất dữ liệu trên Cloudflare)** chưa làm. Hiện chỉ dựa vào khôi phục theo thời điểm của Durable Objects; tính năng này chưa diễn tập.
- **P0-10 (gói Workers Paid, đo CPU scrypt thật), P0-11 (kiểm thử trên workerd trong CI)** chưa làm.
- **P0-12 (pháp lý về nơi lưu dữ liệu cá nhân)** cần bộ phận pháp chế xác định.
- **Lịch sử Git** vẫn còn mã băm cũ. Không viết lại lịch sử, vì mật khẩu tương ứng đã được admin đổi (`must_change_pw = 0` trên hệ thống thật, kiểm tra ngày 06/11/2026) nên mã băm không còn dùng để đăng nhập được.
- **Khóa theo tài khoản** có thể bị lợi dụng để làm gián đoạn đăng nhập của người khác trong 5 phút. Đây là đánh đổi chấp nhận theo tiêu chí của báo cáo rà soát.
