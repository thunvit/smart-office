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

## 06/11/2026 (10:11). Bổ sung thông tin khi tạo công việc theo Base Wework
- **Mục tiêu:** đối chiếu bài "Cách tạo công việc mới" của Base Wework do chủ sở hữu gửi, bổ sung phần còn thiếu.
- **Việc đã làm** (nhánh `tinh-nang/tao-cong-viec-day-du`):
  - Bổ sung tệp đính kèm, liên kết tài liệu từ kho Tài liệu, nhãn và lọc theo nhãn, liên kết Mục tiêu – KPI; nhân bản giữ tệp và nhãn; CSV có cột Nhãn.
  - Tách kho tệp thành `files.js`, dùng chung cho Tài liệu và Công việc (bổ sung ADR-005).
  - Giao diện: thêm các trường vào hộp thoại tạo công việc và chi tiết công việc; nút "Chọn tệp…" thay ô chọn tệp mặc định của trình duyệt (vốn hiện tiếng Anh).
  - Sửa lỗi bố cục có sẵn: ô đánh dấu trong `.field` bị kéo giãn 100% chiều rộng (`.field input` áp dụng cả checkbox), làm lệch nhãn "Giao cho nhiều người". Ảnh hưởng mọi biểu mẫu có ô đánh dấu đặt trực tiếp trong `.field`.
  - `sw.js` lên `so-1.6.1`.
- **Kiểm thử (cục bộ/mô phỏng):**
  - `work-test`: 90 đạt, 0 không đạt (thêm 26 điều kiện: nhãn, mục tiêu, tệp, tài liệu, quyền, nhân bản, CSV);
  - `worker-smoke`: đạt; bản Node: `/healthz` ok, `/api/login` 200;
  - `work-ui`: 39/39 đạt, 2 lần chạy liên tiếp; không cuộn ngang ở 390 px.
- **Chưa kiểm chứng:** tải tệp gần 10 MB trên Cloudflare thật (rủi ro vượt 50 ms CPU).

## 06/11/2026 (10:29). Triển khai bổ sung tạo công việc (so-1.6.1) theo yêu cầu của chủ sở hữu
- **Việc đã làm:** hợp nhất fast-forward `tinh-nang/tao-cong-viec-day-du` vào `main` (commit `a6e9dc7`). Kiểm thử bắt buộc chạy lại đều đạt.
- **GitHub:** Workers Builds `success`, `deploy` `success`, `kiem-tra` `success` (CI đã chạy `work-test`).
- **Kiểm tra trên Cloudflare thật** (trình duyệt tích hợp):
  - `/healthz` ok; `sw.js` = `so-1.6.1`; `work.js` và `app.css` là bản mới.
  - Khi chưa đăng nhập, các đường dẫn tệp mới (`/api/task-files/:id`, `POST /api/tasks/:id/files`, `DELETE`) trả 401.
  - Đọc bằng phiên quản trị sẵn có, không ghi: lược đồ mới đã áp dụng trên Durable Object. Dự án trả `tags`; danh sách công việc có `tags`, `file_count`, `goal_id`; chi tiết công việc có `files`, `tags`, `goal`; lọc `?tag=` trả 200.
- **Chưa kiểm chứng trên Cloudflare thật:** tải tệp lên và đo CPU, vì phải ghi dữ liệu thật; cần chủ sở hữu thử một tệp.
- **Phát hiện:** `/api/goals` chọn kỳ có ngày bắt đầu muộn nhất ("Quý I/2027", chưa có mục tiêu), không phải kỳ hiện hành. Do đó ô "Liên kết mục tiêu" sẽ trống dù kỳ hiện hành có mục tiêu. Đề xuất chọn kỳ chứa ngày hôm nay.

## 06/11/2026 (10:44). Giai đoạn 2, đợt 1: lập kế hoạch (theo tài liệu Base Wework)
- **Mục tiêu:** đưa các chức năng còn lại trong tài liệu Base Wework vào ứng dụng, chia 3 đợt. Đợt 1 gồm phụ thuộc, lặp lại, mốc dự án, Lịch, kéo thả Gantt.
- **Căn cứ:** đọc lại 17 bài hướng dẫn Base Wework, trong đó có 63000283721, 63000283724, 63000268543, 63000267947, 63000286115, 63000252575, 63000273296, 63000286778, 63000252615, 63000254750, 63000271457.
- **Việc đã làm** (nhánh `tinh-nang/lap-ke-hoach`):
  - Sửa lỗi kỳ mục tiêu mặc định (`server.js` `currentCycleId`). Kiểm thử tái hiện báo lỗi trên mã cũ, đạt trên mã mới.
  - `work-plan.js` (hàm thuần) và các bảng `task_deps`, `project_milestones`, `task_recurrences`; các API phụ thuộc, mốc, lặp lại; lọc theo khoảng ngày và theo mốc (ADR-006).
  - Giao diện: thẻ Lịch, Lặp lại; dải mốc dự án; bộ lọc mốc; mục phụ thuộc trong chi tiết công việc; Gantt kéo thả, mũi tên phụ thuộc, mốc; tiêu đề ngày Gantt gọn hơn. `sw.js` lên `so-1.7.0`.
  - Lỗi phân quyền phát hiện khi kiểm thử và đã sửa trước khi đẩy: người theo dõi dự án xem được danh sách công việc lặp lại.
- **Kiểm thử (cục bộ/mô phỏng):**
  - `work-test`: 123 đạt, 0 không đạt (thêm 33 điều kiện);
  - `work-plan-test`: 14 đạt, 0 không đạt (ví dụ a–d của Base);
  - `worker-smoke`: đạt; bản Node: `/healthz` ok, `/api/login` 200;
  - `work-ui`: 50/50 đạt, 3 lần chạy; không cuộn ngang ở 390 px.
- **Chưa kiểm chứng:** CPU trên Cloudflare thật với chuỗi phụ thuộc dài; việc sinh công việc lặp lại trên Durable Object thật.
- **Còn lại:** đợt 2 (trường tùy chỉnh, nhân bản và mẫu dự án, nhân bản sang dự án khác, nhập CSV, xuất Gantt); đợt 3 (tác vụ hàng loạt, ủy quyền, báo cáo hệ thống, dự án ưu tiên, đánh giá theo nhóm, email).

## 06/11/2026 (11:04). Triển khai đợt 1 lập kế hoạch (so-1.7.0) theo yêu cầu của chủ sở hữu
- **Việc đã làm:** hợp nhất fast-forward `tinh-nang/lap-ke-hoach` vào `main` (commit `5f4cbbb`). Kiểm thử bắt buộc chạy lại đều đạt.
- **GitHub:** Workers Builds `success`, `deploy` `success`, `kiem-tra` `success` (có `work-test`, `work-plan-test`).
- **Kiểm tra trên Cloudflare thật** (trình duyệt tích hợp):
  - `/healthz` ok; `sw.js` = `so-1.7.0`; `work.js` là bản mới.
  - Khi chưa đăng nhập, `recurrences`, `preview`, `deps`, `milestones` đều trả 401.
  - Đọc bằng phiên quản trị sẵn có, không ghi: dự án có `milestones` và thiết lập `deps` = false (mặc định); chi tiết công việc có `deps`, `milestones`, `recurrence`.
  - Thời gian phản hồi đo phía trình duyệt: lọc Lịch 60 ms; danh sách kèm `deps` 61 ms.
- **Ghi nhận dữ liệu thật:** chỉ có một kỳ mục tiêu "Quý I/2027" (01/01–31/03/2027), không có kỳ chứa ngày hiện tại. Hệ thống chọn kỳ này theo quy tắc dự phòng, đúng thiết kế. Đề nghị quản trị tạo kỳ "Quý IV/2026" nếu cần liên kết mục tiêu ngay.
- **Chưa kiểm chứng trên Cloudflare thật:** các thao tác ghi (tạo phụ thuộc, lặp lại, mốc, kéo thả Gantt); việc sinh công việc lặp lại trên Durable Object.
- **Theo chỉ đạo của chủ sở hữu:** email thông báo để sau.

## 06/11/2026 (12:44–13:35). Đầy đủ chức năng theo tài liệu Base Wework (so-1.8.0, nhánh `tinh-nang/day-du-base-wework`)
- **Mục tiêu:** theo yêu cầu của chủ sở hữu lúc 12:44: "căn cứ hình ảnh và mô tả trong tài liệu bạn xây dựng đầy đủ tính năng". Email thông báo để sau.
- **Việc đã làm:**
  - Máy chủ `work-ext.js` (commit `a583b4c`).
  - Giao diện `public/work-report.js`; thư viện tự viết `public/xlsx-lite.js` và `public/work-formula.js`.
  - Sửa `public/work.js`: tạo nhanh việc con, các điểm mở rộng.
  - ADR-007; mục 8 bảng đối chiếu; bổ sung YEU-CAU mục VII, HUONG-DAN mục XI.6.
- **Sửa trong phiên:** xuất kèm trường tùy chỉnh trước đây truy vấn theo từng công việc; nay lấy theo khối 500 mã (HN-05).
- **Kiểm thử:**
  - `work-test` 124/0; `work-ext-test` 91/0 (thêm điều kiện tạo nhanh việc con); `work-plan-test` 21/0.
  - `worker-smoke`: `download 200 true`, `work-template 200 3`, `work-post 200`, `re-instantiate 200`.
  - `work-ui` tất cả đạt (đã sửa kịch bản theo màn hình Tùy chỉnh mới).
  - `work-ui-full` 44/0, chạy ổn định 3 lần liên tiếp; gồm nhập tệp .xlsx nén deflate do openpyxl tạo, xuất tệp đọc lại được bằng openpyxl và XLSX_LITE, kiểm tra 390 px chế độ tối không cuộn ngang.
- **Mức độ kiểm chứng:** đã kiểm thử cục bộ và mô phỏng. **Chưa chạy trên Cloudflare thật**, chưa hợp nhất vào `main`.
- **Chưa làm:** webhook dự án, tùy chỉnh hình nền, email thông báo (hoãn).

## 06/11/2026 (14:58–15:15). Triển khai so-1.8.0 (đầy đủ Base Wework) theo yêu cầu của chủ sở hữu
- **Việc đã làm:** hợp nhất fast-forward `tinh-nang/day-du-base-wework` vào `main` (`56cc5b9..6ef65f4`).
- **Kiểm thử chạy lại trước khi đẩy:**
  - `node --check` toàn bộ;
  - `worker-smoke`: `download 200 true`, `work-template 200 3`, `work-post 200`, `re-instantiate 200`;
  - `/healthz` ok, `/api/login` 200;
  - `work-test` 124/0, `work-ext-test` 91/0, `work-plan-test` 21/0;
  - `work-ui` tất cả đạt, `work-ui-full` 44/0.
- **GitHub:** Workers Builds `success`, `deploy` `success`, `kiem-tra` `success`.
- **Kiểm tra trên Cloudflare thật** (trình duyệt tích hợp, phiên quản trị sẵn có, chỉ đọc):
  - Máy chủ trả `sw.js` = `so-1.8.0`; `index.html` nạp `work-formula.js`, `xlsx-lite.js`, `work-report.js`.
  - Khi chưa đăng nhập, `templates`, `config`, `system-report`, `fields`, `posts`, `members` đều trả 401.
  - Các API mới trả 200 trong 76–97 ms (đo phía trình duyệt): `config`, `templates` (4 mẫu dựng sẵn), `members`, `members/:id/report`, `system-report`, `fields`, `posts`, `files`, `activity`, `sidebar`, `export?fields=all`. Điều này cho thấy các bảng mới đã được tạo trên Durable Object thật.
  - Đã mở các màn hình Thành viên, Báo cáo hệ thống (có biểu đồ), Quản trị → Quản lý mẫu, Thảo luận, Tài liệu, Hoạt động, Phân quyền sử dụng (đủ 33 ô), Trường dữ liệu tùy chỉnh, Danh sách có thanh thông tin. Không có lỗi JavaScript.
  - Trình duyệt kiểm tra phải kích hoạt service worker mới bằng SKIP_WAITING. Người dùng thật sẽ thấy thanh "Cập nhật" và bấm để dùng bản mới.
- **Chưa kiểm chứng trên Cloudflare thật:** mọi thao tác ghi (tạo trường, thảo luận, tải tài liệu, nhập Excel, nhân bản, mẫu, tác vụ hàng loạt), vì không ghi vào dữ liệu thật; CPU của nhập 2.000 dòng và xuất 3.000 công việc.

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
