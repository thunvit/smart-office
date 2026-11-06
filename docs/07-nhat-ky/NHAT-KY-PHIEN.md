# NHẬT KÝ PHIÊN LÀM VIỆC

Ghi theo thứ tự thời gian, mới nhất ở cuối. Mỗi mục gồm: thời gian, mục tiêu, kết quả (kèm commit), mức độ kiểm chứng, việc còn dở và sự cố đang mở.

## 04–05/11/2026. Xây dựng bản 1.0–1.3
- **Mục tiêu:** phần mềm văn phòng số tương tự Base.vn, giao diện riêng (không sao chép giao diện Base), menu ngang, 19 phân hệ.
- **Kết quả:**
  - Bản 1.3 chạy bằng Node.js + SQLite trên máy Windows.
  - Có thêm phân hệ chấm công và tiền lương theo tham số năm 2026.
  - Hướng dẫn sử dụng: `docs/04-huong-dan/HUONG-DAN-SU-DUNG.md`.
  - Lập *Kế hoạch phát triển* (22 phiên) và *Thiết kế đa đơn vị* trên Claude Docs.
- **Kiểm chứng:** kiểm thử bằng trình duyệt tự động (Playwright) trên máy cục bộ.

## 05/11/2026. Bản 1.4–1.5: PWA, Cloudflare, GitHub
- **Kết quả:**
  - PWA (ADR-003).
  - Máy chủ chạy được sau Cloudflare: IP thật, cookie Secure, HSTS, `PUBLIC_ORIGINS`.
  - Bản chạy trên Cloudflare Workers + Durable Objects (ADR-002); đưa mã lên GitHub `thunvit/smart-office`; Cloudflare Workers Builds tự triển khai.
- **Sự cố:**
  - Lỗi `__dirname` khi chạy trên Worker: đã sửa (commit `1b02139`).
  - 10:11: Worker đầu tiên bị xóa trên trang quản trị, mất CSDL thí điểm (chỉ có tài khoản admin). Worker được tạo lại lúc 10:43.
  - Dự án Pages `smart-office-vnpt` đã lập rồi xóa theo yêu cầu.

## 06/11/2026 (sáng). Mật khẩu quản trị, lỗi 500, rà soát độc lập
- **Kết quả:**
  - Thêm `ADMIN_PASSWORD_HASH` (ADR-004, tạm thời); mật khẩu gốc bàn giao riêng cho chủ sở hữu. Đăng nhập thật thành công.
  - Lỗi 500 khi đổi mật khẩu, chẩn đoán nhờ `SO_DEBUG=1`: "Cannot perform I/O on behalf of a different Durable Object".
    - Đã sửa tại commit `5fdff58`.
    - Đã thêm kiểm thử tái hiện; kiểm thử báo lỗi trên mã cũ và đạt trên mã mới.
  - Rà soát độc lập về xác thực và lưu trữ: `docs/05-ra-soat/2026-11-06-RA-SOAT-XAC-THUC-LUU-TRU.md`.
  - Quy hoạch thư mục tài liệu `docs/`; thêm quy tắc cho trợ lý AI (`CLAUDE.md`, `AGENTS.md`).
- **Kiểm chứng:**
  - Bản sửa lỗi Durable Object đã kiểm thử trên mô phỏng.
  - Trên Cloudflare thật, các yêu cầu sau khi triển khai trả kết quả đúng. Chưa xác nhận được trường hợp Durable Object khởi tạo lại trên Cloudflare thật.
  - Chưa xác nhận chủ sở hữu đã đổi mật khẩu thành công.

## 06/11/2026 (sáng, tiếp). Bộ tiêu chuẩn chất lượng và hướng dẫn tham gia dự án
- **Kết quả:**
  - Bộ tiêu chuẩn `docs/09-tieu-chuan/`: ATTT (27 yêu cầu), Hiệu năng (7 chỉ tiêu, 10 quy tắc), UI/UX, Danh mục kiểm tra hoàn thành.
  - Mẫu yêu cầu hợp nhất `.github/pull_request_template.md`.
  - Hướng dẫn người mới `docs/00-bat-dau/HUONG-DAN-THAM-GIA-DU-AN.md`.
  - `CLAUDE.md` bổ sung Mục 3A.
- **Căn cứ mới phát hiện:** Nghị định 331/2026/NĐ-CP về bảo vệ an ninh mạng đối với hệ thống thông tin (chưa đọc toàn văn).
- **Kiểm chứng:** các tiêu chuẩn mới ở mức tài liệu, chờ chủ sở hữu phê duyệt. Hiện trạng ghi trong từng tiêu chuẩn căn cứ báo cáo rà soát; các chỉ tiêu hiệu năng chưa đo trên môi trường thật.

## Việc còn dở và sự cố đang mở (cập nhật 06/11/2026)
1. **`SO_DEBUG=1` đang bật** trong `wrangler.jsonc`, phải tắt sau khi xác nhận đổi mật khẩu thành công.
2. **Các việc P0 theo báo cáo rà soát:**
   - sửa khóa đăng nhập sai (`server.js:88`) và lưu bộ đếm bền vững;
   - thu hồi phiên khi đổi mật khẩu;
   - máy chủ ép đổi mật khẩu lần đầu;
   - mật khẩu ban đầu chỉ áp dụng một lần, gỡ `ADMIN_PASSWORD_HASH`;
   - sửa kiểm thử đổi mật khẩu (`test/worker-smoke.js` đang gọi sai đường dẫn);
   - kiểm soát dữ liệu mẫu;
   - đo CPU thật hoặc nâng gói Workers Paid;
   - kiểm thử trên workerd trong CI;
   - xuất và sao lưu dữ liệu trên Cloudflare.
3. **Pháp chế** xác định nơi lưu dữ liệu và hồ sơ pháp lý khi kinh doanh dịch vụ.
4. **Tên miền** `smartoffice.vnptninhbinh.com.vn` chưa gắn; chờ chọn phương án DNS.
