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

## 06/11/2026 (chiều). Phân hệ Công việc – Dự án phiên bản 2 (Giai đoạn 1)
- **Mục tiêu:** xây dựng phân hệ Công việc – Dự án theo nghiệp vụ Base Wework (yêu cầu của chủ sở hữu).
- **Việc đã làm** (nhánh `tinh-nang/cong-viec-du-an-v2`, chưa hợp nhất vào `main`):
  - Nghiên cứu 48/68 bài hướng dẫn Base Wework; lập `docs/02-thiet-ke/YEU-CAU-CONG-VIEC-DU-AN.md` và `ADR-005`.
  - Máy chủ `work.js`: dự án/phòng ban, thành viên theo vai trò, thiết lập theo dự án, nhóm công việc, việc con 3 cấp, người theo dõi, kết quả và %, đánh giá, thất bại, nhân bản, nhật ký, báo cáo, xuất CSV; chuyển dữ liệu 1.x một lần.
  - Sửa lỗi lộ dữ liệu của 1.x: mọi người dùng xem được toàn bộ công việc (ATTT-13). Danh sách phân trang tối đa 200 bản ghi (HN-07).
  - Giao diện `public/work.js`: Việc của tôi, Dự án & phòng ban, Nhân viên của tôi; Danh sách, Kanban, Gantt, Báo cáo, Thiết lập; hộp thoại chi tiết công việc. `sw.js` lên `so-1.6.0`.
  - Sửa lỗi phát hiện khi kiểm thử giao diện: hộp thoại công việc vẽ lại làm mất tiêu điểm và cuộn về đầu sau mỗi thao tác; nay vẽ lại tại chỗ.
- **Kiểm thử, mức độ kiểm chứng:**
  - `node test/work-test.js`: 64 đạt, 0 không đạt (đã kiểm thử cục bộ: bản Node và mô phỏng Durable Object).
  - `node test/worker-smoke.js`: có `download 200 true`, `re-instantiate 200` (mô phỏng).
  - `test/work-ui.js` (Playwright, 1440 px sáng/tối, 390 px tối): 30/30 đạt, 5 lần chạy liên tiếp; không có lỗi JavaScript (bỏ qua lỗi tải phông Google do môi trường không có Internet, 401 trước đăng nhập, 403 chủ đích).
  - **Chưa chạy trên Cloudflare thật.** Chưa đo hiệu năng thật.
- **Còn dở:** Giai đoạn 2 theo Mục III tài liệu yêu cầu; chờ chủ sở hữu duyệt hợp nhất vào `main` (hợp nhất là triển khai thật).

## 06/11/2026 (09:50). Hợp nhất phân hệ Công việc – Dự án v2 vào `main` (theo yêu cầu của chủ sở hữu)
- **Việc đã làm:** hợp nhất fast-forward nhánh `tinh-nang/cong-viec-du-an-v2` vào `main` (commit `85e0c8d`), đẩy lên GitHub; Workers Builds tự triển khai.
- **Kiểm thử trước khi đẩy (cục bộ/mô phỏng):** cú pháp đạt; `work-test` 64 đạt, 0 không đạt; `worker-smoke` có `download 200 true`, `re-instantiate 200`; bản Node `/healthz` ok, `/api/login` 200.
- **Kiểm tra trên Cloudflare thật** (https://smart-office.thunv-it.workers.dev, qua trình duyệt tích hợp):
  - `/healthz` ok; `sw.js` = `so-1.6.0`; `/work.js` 200; sau khi kích hoạt service worker mới, `/` có nạp `work.js`, `app.css` có `.s-failed`.
  - Chưa đăng nhập: `/api/projects`, `/api/tasks`, `/api/work/staff`, `/api/projects/1`, `/report`, `/export.csv`, `/api/tasks/1`, `POST /api/tasks` đều trả 401.
  - Chuyển dữ liệu 1.x trên Durable Object: dự án "Triển khai Bản đồ số tỉnh Ninh Bình" có 1 quản lý, 14 khóa thiết lập, 1 công việc còn nguyên. Chỉ đọc bằng phiên quản trị có sẵn trong trình duyệt tích hợp, không ghi dữ liệu.
  - Phát hiện: trình duyệt đã cài bản 1.5.0 vẫn dùng giao diện cũ cho đến khi người dùng bấm "Cập nhật" trên thanh thông báo phiên bản mới; trong thời gian đó màn hình Công việc cũ không tương thích API mới.
- **Chưa kiểm chứng trên Cloudflare thật:** các thao tác ghi (tạo dự án, giao việc, đánh giá) – mới kiểm thử cục bộ.

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
5. **Phân hệ Công việc – Dự án v2** đã triển khai (06/11/2026). Đề xuất P1: service worker tự kích hoạt bản mới khi API thay đổi không tương thích, tránh giao diện cũ gọi API mới.
