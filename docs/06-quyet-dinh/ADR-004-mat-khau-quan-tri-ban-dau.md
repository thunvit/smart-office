# ADR-004. Mật khẩu quản trị ban đầu trên Cloudflare

- Ngày: 06/11/2026
- Trạng thái: **Tạm thời, phải thay thế** (thuộc danh sách P0 của báo cáo rà soát 06/11/2026).

## Bối cảnh
Bản công khai trên Cloudflare không được dùng mật khẩu mặc định. Phương án đầu tiên là bí mật `ADMIN_PASSWORD`, nhưng chủ sở hữu chưa thao tác được trên Cloudflare.

## Quyết định tạm thời
1. **Thứ tự áp dụng:**
   - ưu tiên bí mật `ADMIN_PASSWORD` nếu có;
   - nếu không có, dùng mã băm scrypt `ADMIN_PASSWORD_HASH` trong `wrangler.jsonc`.
2. **Bàn giao mật khẩu gốc:** gửi riêng cho chủ sở hữu qua phiên làm việc, không lưu trong kho mã.
3. **Phạm vi áp dụng:** `applyAdminSecret()` (`server.js`) đặt mật khẩu này khi khởi động nếu tài khoản `admin` còn `must_change_pw=1`.

## Rủi ro đã biết (báo cáo rà soát 06/11/2026)
1. Mã băm công khai trên GitHub.
2. Mật khẩu ban đầu có thể có hiệu lực trở lại: nếu một quản trị viên khác đặt lại mật khẩu cho `admin` mà `must_change_pw` vẫn bằng 1, lần khởi động sau sẽ ghi đè bằng mật khẩu ban đầu.

## Hướng thay thế (P0)
1. Chỉ áp dụng mật khẩu ban đầu một lần, ghi dấu đã áp dụng trong CSDL.
2. Gỡ `ADMIN_PASSWORD_HASH` khỏi kho mã sau khi chủ sở hữu đã đổi mật khẩu.
3. Máy chủ bắt buộc đổi mật khẩu lần đầu và thu hồi mọi phiên khi đổi mật khẩu.
