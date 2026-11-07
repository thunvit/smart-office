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

## 06/11/2026 (19:58–21:00). Sửa P0 xác thực (so-1.9.0) và chuẩn bị nhập 91 tài khoản Trung tâm Kinh doanh Giải pháp
- **Yêu cầu của chủ sở hữu:** nhập dữ liệu Trung tâm Kinh doanh Giải pháp từ tệp `KDGP_Bao_cao_hien_trang_giao_viec_phong_GP.xlsx`.
- **Nội dung tệp:** danh sách lao động, không có dữ liệu công việc. 91 người gồm Ban Giám đốc 3, Nhóm Tổng hợp 3, Giải pháp 1 là 42, Giải pháp 2 là 20, KHDN Hà Nam 6, Nam Định 10, Ninh Bình 7.
- **Chủ sở hữu chọn:** nhập toàn Trung tâm; tên đăng nhập theo dạng tên + chữ đầu họ, đệm; **sửa P0 trước rồi mới nhập**.
- **Việc đã làm (nhánh `sua-loi/p0-xac-thuc`):**
  - P0-2: `worker-smoke` sửa đường dẫn đổi mật khẩu, có khẳng định và mã thoát.
  - P0-3: tắt `SO_DEBUG`.
  - P0-4: khóa đăng nhập bền vững theo tài khoản và theo IP.
  - P0-5: thu hồi phiên khi đổi mật khẩu.
  - P0-6: máy chủ ép đổi mật khẩu lần đầu.
  - P0-7: gỡ `ADMIN_PASSWORD_HASH`; bí mật chỉ áp dụng một lần; bản Node sinh mật khẩu ngẫu nhiên.
  - P0-8: kiểm tra `SO_DEMO`.
  - Thêm nhật ký an ninh.
  - Nhập tài khoản nhận tệp .xlsx và cột Lãnh đạo phòng.
  - Lập ADR-008, thay ADR-004.
- **Lỗi phát hiện trong phiên:** `applyAdminSecret` bản đầu đọc cờ qua `getSettings()`, hàm này không trả khóa `admin_bootstrapped`, nên cờ luôn rỗng. Kiểm thử `auth-test` bước b2 đã bắt được lỗi; đã sửa sang đọc trực tiếp bảng `settings`.
- **Kiểm thử:**
  - `auth-test` 78/0. Trên mã cũ kiểm thử thất bại.
  - `worker-smoke` có `KẾT QUẢ: đạt` và `lockout persist 429`. Trên mã cũ có 4 điều kiện không đạt.
  - `work-test` 125/0, `work-ext-test` 91/0, `work-plan-test` 21/0.
  - `work-ui-full` 44/0. `work-ui`: lần đầu lỗi chờ phần tử, hai lần chạy lại đều đạt.
  - Nhập thử tệp 91 tài khoản qua giao diện trên máy chủ cục bộ có CSDL trống: 91 tài khoản, 7 phòng ban, 5 lãnh đạo phòng; đăng nhập tài khoản mới bị buộc đổi mật khẩu, API nghiệp vụ trả 403.
- **Chưa làm:** P0-9 sao lưu trên Cloudflare; P0-10 gói Paid, đo CPU; P0-11 workerd trong CI; P0-12 pháp chế.
- **Nhập 91 tài khoản trên hệ thống thật:** chủ sở hữu tự thực hiện. Trợ lý AI không tạo tài khoản và không nhập mật khẩu (CLAUDE.md 4.3).
- **Triển khai:** hợp nhất fast-forward vào `main` (`45929b5..92b1aa3`). Workers Builds, `deploy`, `kiem-tra` (có `auth-test`) đều `success`.
- **Kiểm tra trên Cloudflare thật** (chỉ đọc, phiên quản trị sẵn có):
  - Máy chủ trả `sw.js` = `so-1.9.0`; `app.js` mới có màn hình chặn khi chưa đổi mật khẩu và nhập tệp .xlsx.
  - `/api/admin/security-log` trả 200 (bảng mới đã được tạo trên Durable Object), trả 401 khi chưa đăng nhập.
  - Phiên quản trị cũ vẫn dùng được, vì admin đã đổi mật khẩu nên không bị chặn.
  - Hộp thoại "Nhập danh sách người dùng" hiển thị 7 cột, nhận .xlsx.
- **Chưa kiểm chứng trên Cloudflare thật:** khóa đăng nhập, thu hồi phiên, ép đổi mật khẩu. Không thử bằng đăng nhập sai trên hệ thống thật; các chức năng này mới kiểm thử cục bộ/mô phỏng.

## 06/11/2026 (20:19–21:40). P0-9 sao lưu, khôi phục (so-1.10.0)
- **Yêu cầu của chủ sở hữu:** làm tiếp P0-9 trước khi nhập 91 tài khoản.
- **Căn cứ:** tài liệu Cloudflare về PITR của Durable Objects (`getCurrentBookmark`, `getBookmarkForTime`, `onNextSessionRestoreBookmark`, `ctx.abort`; 30 ngày; không hỗ trợ cục bộ).
- **Việc đã làm (nhánh `tinh-nang/sao-luu-p0-9`; ADR-009):**
  - `backup.js`: xuất chia trang, khôi phục trong một giao dịch, PITR.
  - `files.js`: duyệt và ghi tệp theo khối cho cả Node và Cloudflare.
  - `worker/do-core.js` và `worker/index.js`: truyền `ctx` theo từng yêu cầu.
  - Giao diện Quản trị › Sao lưu dữ liệu.
  - Thông báo cũ trên Cloudflare (không có `.db`) chỉ sang chức năng mới.
- **Kiểm thử:**
  - `backup-test` 45/0: DO A xuất (chia trang nhỏ), DO B mới khôi phục; so sánh trực tiếp 70 bảng kể cả `file_chunks` đều trùng khớp. Đã làm sai thử một dòng để xác nhận phép so sánh phát hiện được. Các ca lỗi khóa ngoại, thiếu dòng đều hoàn tác toàn bộ. PITR kiểm tra bằng `ctx` giả lập.
  - `backup-ui` 18/0 trên bản Node (tệp trên đĩa), ba lần liên tiếp. Một lần trước đó dừng giữa chừng, nhiều khả năng do cổng máy chủ chưa giải phóng.
  - Trong lúc viết kiểm thử phát hiện 2 lỗi kịch bản: dữ liệu thử nén quá nhỏ, và phép đếm tài liệu so `undefined` với `undefined` nên đạt giả. Đã sửa.
- **`work-ui` không ổn định:** trên mã mới lỗi 2/3 lần, bản `6ef65f4` đạt 3/3. Ảnh chụp lúc lỗi cho thấy số "15" bị gõ vào ô tiêu đề ("Báo cáo tuần15"), vì hộp thoại tự đặt tiêu điểm sau 30 ms trong lúc kịch bản đang gõ. Đây là lỗi thời gian của kịch bản. Đã thêm chờ 150 ms sau khi mở hộp thoại (5 vị trí) và chụp màn hình khi có ngoại lệ; sau đó đạt 4/4.
- **Lỗi chỉ xuất hiện trên Cloudflare thật (sau khi triển khai `316828f`):**
  - Hiện tượng: `/api/admin/export/manifest` trả 500.
  - Chẩn đoán: thay vì bật `SO_DEBUG` toàn hệ thống, tôi triển khai `1ef3e6d`, cho các API sao lưu (chỉ quản trị) trả nội dung lỗi dạng 400. Nội dung lỗi: "too many terms in compound SELECT". Durable Object giới hạn số vế của câu `UNION ALL`; bản đầu ghép 70 bảng trong một câu.
  - Cách sửa: mỗi bảng một truy vấn đếm. `test/fake-do.js` bổ sung giới hạn 5 vế; kiểm thử Cloudflare mô phỏng báo lỗi trên mã cũ và đạt trên mã mới.
  - Bổ sung `GET /api/admin/restore/check`: kiểm tra Durable Object có cho hoãn kiểm tra khóa ngoại trong giao dịch hay không. Kiểm tra này không ghi dữ liệu (giao dịch luôn hoàn tác).
- **Triển khai:** `316828f` (P0-9), `1ef3e6d` (chẩn đoán), `f29f620` (sửa lỗi). Mỗi lần Workers Builds, `deploy`, `kiem-tra` đều `success`.
- **Sự cố quy trình (lỗi của tôi):**
  - Commit `f29f620` được đẩy cùng chuỗi lệnh với `backup-ui` khi kiểm thử này đang báo 1 đạt, 4 không đạt, trái CLAUDE.md 6.1.
  - Nguyên nhân kiểm thử lỗi: một máy chủ Node cũ (`node ./server.js`) còn chiếm cổng 3999, vì lệnh `pkill -f "node server.js"` không khớp tên tiến trình.
  - Hệ quả: lần so sánh `work-ui` "mã mới 2/3 lỗi, bản `6ef65f4` 3/3 đạt" cũng không đáng tin. Nguyên nhân "gõ nhầm vào ô tiêu đề" xác định qua ảnh chụp thì vẫn đúng.
  - Chạy lại trong môi trường sạch (`pkill -f server.js`): `backup-ui` 18/0, `work-ui` 3/3 đạt, `work-ui-full` 44/0. Mã đã đẩy đạt toàn bộ.
  - Từ nay tách bước kiểm tra kết quả khỏi bước đẩy mã.
- **Kiểm tra trên Cloudflare thật** (phiên quản trị sẵn có; chỉ đọc, chỉ ghi thêm dòng nhật ký an ninh `backup_export`):
  - Danh mục 200 (173 ms): 69 bảng, 0 tệp.
  - Xuất đủ 32/32 dòng qua 13 trang; trang chậm nhất 167 ms; tổng 2,3 giây.
  - `restore/check`: `defer_foreign_keys` = có, tức Durable Object thật cho hoãn kiểm tra khóa ngoại trong giao dịch.
  - PITR: lấy được mã thời điểm hiện tại và mã của 1 giờ trước (`0000001d-…`, `00000014-…`).
  - Màn hình Sao lưu hiện đủ 3 mục và cảnh báo xóa Worker.
- **Chưa kiểm chứng trên Cloudflare thật:** thực hiện khôi phục từ tệp và khôi phục theo thời điểm (đều thay toàn bộ dữ liệu, không làm trên hệ thống đang dùng).
- **Chưa làm:** xuất định kỳ ra R2 (cần chủ sở hữu tạo bucket); diễn tập PITR và khôi phục từ tệp trên Cloudflare thật.

## 07/11/2026. Rà soát kiến trúc và tư vấn trợ lý AI đa nhiệm (nhánh `claude/code-architecture-ai-optimization-11be7f`)
- **Yêu cầu của chủ sở hữu:** "rà soát kiến trúc code, từ đó đưa ra tư vấn tối ưu trải nghiệm bằng cách thêm các tính năng AI, trợ lý AI đa nhiệm".
- **Việc đã làm:** báo cáo `docs/05-ra-soat/2026-11-07-RA-SOAT-KIEN-TRUC-TU-VAN-AI.md` (kết quả rà soát, kiến trúc cổng AI tại Worker không trạng thái, danh mục công cụ, 15 tính năng chia 3 đợt, ATTT và pháp lý, kiểm thử). Chưa sửa mã, chưa lập ADR.
- **Lỗi phát hiện (nghiêm trọng, có trên bản chạy thật từ `so-1.8.0`):** Bảng tin (`biz.js`) và Thảo luận dự án (`work-ext.js:322-337`) cùng đường dẫn `/api/posts/:id`; route của `work-ext.js` đăng ký trước nên thắng. Hệ quả: không mở được chi tiết bản tin; **bấm Xóa/Sửa bản tin thực tế xóa/sửa thảo luận dự án trùng số hiệu**.
  - Đã kiểm thử cục bộ (bản Node, dữ liệu mẫu, thư mục dữ liệu tạm ngoài kho mã): `GET /api/posts/1` trả 404 "Thảo luận không tồn tại."; `DELETE /api/posts/1` trả 200, xóa thảo luận dự án số 1, bản tin số 1 vẫn còn.
  - Chưa kiểm chứng trên Cloudflare thật (không ghi vào dữ liệu thật). Chưa sửa.
- **Kiểm thử bắt buộc mục 5 CLAUDE.md:** không chạy, vì phiên này không sửa mã chạy (chỉ thêm tài liệu).
- **Ghi chú vận hành:** trong lúc tái hiện, một máy chủ Node thử nghiệm (PID 83064, cổng 3988, dữ liệu tạm) có thể vẫn chạy trên máy của chủ sở hữu; các máy chủ cổng 3986, 3987 đã dừng.

## 07/11/2026. Sửa lỗi trùng đường dẫn Bảng tin – Thảo luận dự án (so-1.10.1), theo yêu cầu của chủ sở hữu
- **Cách sửa:**
  - Thảo luận dự án chuyển sang `/api/project-posts/:id` (`work-ext.js`, `public/work-report.js`); Bảng tin giữ `/api/posts/:id`.
  - `route()` trong `server.js` dừng khởi động khi có hai route trùng phương thức và mẫu đường dẫn ("Trùng định tuyến: …").
  - Bảo vệ giai đoạn chuyển tiếp: trình duyệt còn giao diện cũ sẽ gọi `/api/posts/:id` cho thảo luận dự án, nay rơi vào Bảng tin. Các lệnh sửa, xóa, bình luận bản tin bắt buộc có `?kind=bulletin` (giao diện mới gửi kèm); thiếu thì trả 409 "Giao diện đang dùng phiên bản cũ…". Có thể gỡ sau khi mọi trình duyệt đã cập nhật.
  - `sw.js` lên `so-1.10.1`.
- **Kiểm thử (cục bộ/mô phỏng):**
  - `work-ext-test`: thêm mục C1 (bản tin và thảo luận trùng số hiệu). Trên mã cũ 7 không đạt (mở bản tin trả thảo luận "Thảo luận trùng số 2"; bình luận bản tin ghi vào thảo luận); trên mã mới 98 đạt, 0 không đạt.
  - `work-test` 125/0, `work-plan-test` 21/0, `auth-test` 78/0, `backup-test` 48/0; `node --check` toàn bộ đạt.
  - `worker-smoke`: `KẾT QUẢ: đạt`, có `download 200 true`, `re-instantiate 200`, `lockout persist 429`, `backup-manifest 200`, `work-template 200 3`, `work-post 200`.
  - Kiểm tra chặn trùng route: bản sao có route trùng thì dừng với "Trùng định tuyến: GET /api/posts/:id"; bản sạch khởi động bình thường. Lần chạy đầu không hợp lệ (dừng vì thiếu thư mục `public/` trong bản sao), đã chạy lại.
  - Bản Node (`DATA_DIR` tạm, cổng 3999): `/healthz` ok, `/api/login` 200, `sw.js` = `so-1.10.1`.
  - Giao diện, trình duyệt tích hợp: mở bản tin hiện đúng nội dung, bình luận bản tin lên 2; mở, bình luận, ghim, xóa thảo luận dự án qua đường dẫn mới; sau khi xóa thảo luận số 1, Bảng tin vẫn đủ bản tin 1, 2, 3. Bảng điều khiển trình duyệt có lỗi "An unknown error occurred when fetching the script" (đăng ký service worker trong khung trình duyệt tích hợp), chưa xác định có liên quan bản sửa hay không.
  - **Chưa chạy** `work-ui.js`, `work-ui-full.js`: máy chưa cài Playwright.
- **Chưa kiểm chứng trên Cloudflare thật**; chưa hợp nhất vào `main`.

## 07/11/2026. Trợ lý AI hội thoại đa nhiệm, nhiều nhà cung cấp (so-1.11.0; ADR-010), theo yêu cầu của chủ sở hữu
- **Yêu cầu:** làm Đợt 2 "Trợ lý hội thoại đa nhiệm"; dùng được Gemini, Anthropic hoặc OpenAI, trước mắt Anthropic (chủ sở hữu có khóa).
- **Việc đã làm:**
  - `ai.js`: cổng AI, ba bộ chuyển đổi gọi bằng `fetch` (Anthropic `anthropic-version: 2026-10-21`, mặc định `claude-opus-5-5`, bộ đệm lời nhắc, `fallbacks: "default"`; OpenAI Chat Completions; Gemini generateContent), vòng lặp công cụ tối đa 8 bước, gọi song song công cụ chỉ đọc, SSE theo bước.
  - `ai-tools.js`: 17 công cụ (11 chỉ đọc, 6 ghi) ánh xạ sang API sẵn có; che dữ liệu cá nhân; rút gọn kết quả.
  - `ai-core.js`: bảng `ai_pending`, `ai_log`; mở lượt, hạn mức, đề nghị chờ xác nhận (10 phút, một lần, chỉ chủ đề nghị), xác nhận thực hiện qua API thường của người dùng; cấu hình quản trị; nhật ký an ninh `ai_action`, `ai_settings`.
  - `worker/index.js`: `POST /api/ai/chat` xử lý tại Worker không trạng thái (khóa chỉ ở Worker). `worker/do-core.js`: bổ sung `Host` cho yêu cầu nội bộ. `server.js`: `internalCall`, nhánh SSE bản Node.
  - Giao diện `public/ai.js` (nút Trợ lý, `Ctrl + /`, thẻ xác nhận), Quản trị › Trợ lý AI; CSS dùng biến màu chung; `sw.js` lên `so-1.11.0`.
  - Tài liệu: ADR-010, `TRIEN-KHAI-CLOUDFLARE.md` mục A.4, `HUONG-DAN-SU-DUNG.md` mục XII, CLAUDE.md mục 3g; CI chạy `ai-test`.
- **Kiểm thử (cục bộ/mô phỏng, nhà cung cấp giả lập, không gọi mô hình thật):**
  - `ai-test` 56 đạt, 0 không đạt: mặc định tắt; chỉ quản trị bật; chưa đăng nhập 401; Origin lạ 403; thiếu khóa 503; định dạng yêu cầu Anthropic/OpenAI/Gemini; kết quả công cụ bọc `<du_lieu>`; gửi lại nguyên khối thinking/chữ ký suy luận; người ngoài dự án nhận 403 qua công cụ; che email, số điện thoại, số giấy tờ; thao tác ghi chỉ thành đề nghị, người khác không xác nhận được, không xác nhận lần hai, hủy, hết hạn 410; xác nhận thao tác vượt quyền vẫn bị API từ chối; dữ liệu chứa mệnh lệnh không tự thực hiện; tối đa 8 bước; khóa sai không lộ khóa; hạn mức 429; `ai_log` không có cột nội dung; bản Node thật qua SSE với máy chủ Anthropic giả lập.
  - `worker-smoke`: `KẾT QUẢ: đạt`, có thêm `ai 403 200 200`, `backup-manifest 200 71 1` (thêm 2 bảng).
  - `work-test` 125/0, `work-plan-test` 21/0, `work-ext-test` 98/0, `auth-test` 78/0, `backup-test` 48/0; `node --check` toàn bộ.
  - Giao diện (trình duyệt tích hợp, bản Node cổng 3999, máy chủ Anthropic giả lập): mặc định không có nút Trợ lý; quản trị bật thì nút hiện ngay, nhật ký an ninh ghi "bật: false→true"; hỏi chỉ đọc hiện câu trả lời, `#12` thành liên kết; đề nghị tạo công việc hiện thẻ do máy chủ lập, bấm Xác nhận thì tạo công việc #15 đúng tên, hạn, ưu tiên, Tổng quan cập nhật; 360 px chế độ tối: khung toàn màn hình, không cuộn ngang.
  - **Chưa chạy** `work-ui.js`, `work-ui-full.js` (chưa cài Playwright).
- **Chưa kiểm chứng:** gọi Anthropic thật bằng khóa của chủ sở hữu (trợ lý AI không tự nhập khóa, CLAUDE.md 4.3); OpenAI, Gemini với khóa thật; chạy trên Cloudflare thật (Worker → Durable Object qua stub, SSE qua TransformStream); chất lượng trả lời tiếng Việt; chi phí thực tế.
- **Còn dở:** truyền từng chữ (token streaming); pháp chế xác nhận điều kiện gửi dữ liệu ra nước ngoài trước khi bật trên hệ thống thật.

## 07/11/2026. Tách nhánh; trợ lý AI cấu hình theo từng người (so-1.11.1), theo yêu cầu của chủ sở hữu
- **Yêu cầu:** "tách nhánh riêng chứ, chạy local cho tôi test đã, việc cấu hình AI cần cấu hình động ở màn hình người dùng, theo cá nhân, mỗi người 1 con AI".
- **Nhánh (cục bộ, chưa đẩy):**
  - `sua-loi/trung-duong-dan-bang-tin` (`260a75a`): báo cáo rà soát và sửa lỗi Bảng tin;
  - `tinh-nang/tro-ly-ai-ca-nhan`: trợ lý AI, gồm cả bản sửa lỗi trên.
- **Việc đã làm:**
  - `ai-key.js`: mã hóa AES-256-GCM khóa API cá nhân; bí mật `AI_KEY_SECRET` (Node tự sinh tại `DATA_DIR`); mã nội bộ để cổng AI tại Worker nhận khóa đã giải mã.
  - `ai-core.js`: bảng `ai_user_config`; `GET/PUT /api/ai/me` (không trả khóa); `/api/ai/turn` trả khóa chỉ cho lời gọi nội bộ; `/api/ai/status` báo đã cấu hình hay chưa; nhật ký `ai_key_set`, `ai_key_clear`.
  - `ai.js`: thứ tự khóa cá nhân → khóa chung → 412; khóa cá nhân chỉ gửi địa chỉ chính thức; tên và cách trả lời riêng; `POST /api/ai/test` (kiểm tra kết nối) cho Worker và Node.
  - Giao diện: Tài khoản › Trợ lý AI của tôi; nút ⚙ và lời nhắc cấu hình trong khung trợ lý; tiêu đề khung theo tên trợ lý; `sw.js` lên `so-1.11.1`.
  - ADR-010 mục 2A; `TRIEN-KHAI-CLOUDFLARE.md` A.4 (thêm `AI_KEY_SECRET`); `HUONG-DAN-SU-DUNG.md` XII.0.
- **Kiểm thử (cục bộ/mô phỏng):**
  - `ai-test` 87 đạt, 0 không đạt. Thêm phần P chạy qua đúng mã Worker (`workerChat`, `workerTest` với stub mô phỏng):
    - phản hồi không chứa khóa; CSDL và bản sao lưu chỉ có bản mã; sai bí mật không giải được;
    - mã nội bộ sai không nhận khóa; khóa, mô hình, mức suy luận, tên, cách trả lời đúng của từng người;
    - người khác không dùng khóa của nhau; dùng khóa chung khi có; khóa cá nhân không theo `AI_BASE_URL`;
    - kiểm tra kết nối; đổi sang Gemini phải nhập khóa mới; xóa khóa.
    - Bản Node: tự sinh `ai-key.secret`; tệp CSDL và WAL không chứa khóa dạng rõ; `/api/ai/turn` qua HTTP không trả khóa.
  - Lần chạy đầu của kiểm tra bản Node báo "không đạt" vì tiến trình con thừa hưởng `AI_KEY_SECRET` từ tiến trình kiểm thử, không phải lỗi mã. Đã tách điều kiện và bỏ biến này khỏi môi trường tiến trình con.
  - `worker-smoke` đạt (`ai 403 200 200`, `backup-manifest 200 72 1`); `work-test` 125/0, `work-plan-test` 21/0, `work-ext-test` 98/0, `auth-test` 78/0, `backup-test` 48/0; `node --check` toàn bộ.
  - Giao diện, trình duyệt tích hợp, cổng 3100: khung trợ lý báo chưa cấu hình và dẫn sang Tài khoản; đổi nhà cung cấp đổi gợi ý mô hình, ẩn/hiện mức suy luận; lưu khóa giả chỉ hiện `••••0000`, phản hồi không chứa khóa, tiêu đề khung đổi theo tên trợ lý; xóa khóa. Đã xóa khóa giả, trả dữ liệu thử về trạng thái chưa cấu hình.
- **Bản chạy thử cho chủ sở hữu:** Node cổng 3100, dữ liệu mẫu trong thư mục tạm của phiên, trợ lý đã bật sẵn (ghi trực tiếp `ai_enabled=1` vào CSDL thử), không có khóa chung.
- **Chưa kiểm chứng:** gọi nhà cung cấp thật (chờ chủ sở hữu tự nhập khóa trên bản chạy thử); Cloudflare thật.
- **Đẩy lên GitHub (theo yêu cầu của chủ sở hữu, 07/11/2026):** `sua-loi/trung-duong-dan-bang-tin` (`260a75a`) và `tinh-nang/tro-ly-ai-ca-nhan`. `main` giữ nguyên `2c05e18`; không có workflow nào chạy (CI chỉ chạy khi đẩy `main` hoặc mở PR), chưa triển khai.

## 07/11/2026. PR sửa lỗi; trợ lý AI soạn văn bản, ghi âm, biên bản và kết luận cuộc họp (so-1.12.1)
- **PR sửa lỗi Bảng tin:** https://github.com/thunvit/smart-office/pull/1 (`sua-loi/trung-duong-dan-bang-tin` → `main`), theo yêu cầu của chủ sở hữu. CI "Kiểm tra mã nguồn" đạt. Chưa hợp nhất.
- **Yêu cầu mới:** "cho con AI có tính năng soạn văn bản, ghi âm và đưa ra kết luận cuộc họp".
- **Việc đã làm (nhánh `tinh-nang/tro-ly-ai-ca-nhan`; ADR-010 mục 2B):**
  - `ai-compose.js`: lời nhắc soạn văn bản (10 loại văn bản, 3 giọng văn, soạn lại theo yêu cầu) và biên bản họp (JSON: tóm tắt, biên bản, kết luận, việc cần làm); nội dung người dùng bọc `<du_lieu>`, không tự đóng thẻ được; chuẩn hóa người thực hiện theo thành phần họp.
  - `ai.js`: `POST /api/ai/compose`, `/api/ai/minutes`, `/api/ai/transcribe` cho cả Worker và Node; bộ chuyển đổi nhận lời nhắc riêng và chế độ không gửi công cụ; chuyển giọng nói OpenAI (multipart `/audio/transcriptions`) và Gemini (`inlineData`); Anthropic trả 415 kèm hướng dẫn.
  - `ai-core.js`: cột `stt_model` (mô hình chuyển giọng nói cá nhân); `/api/ai/status` báo `audio_server`.
  - Giao diện `public/ai-office.js`: Soạn văn bản (Tài liệu và khung trợ lý; sao chép, tải .doc, lưu vào Tài liệu); Trợ lý cuộc họp (ghi âm WAV 16 kHz theo đoạn 60 giây hoặc nhận dạng của trình duyệt; lập biên bản; lưu biên bản; giao việc). `public/ai.js` vẽ lại trang khi trạng thái AI thay đổi.
  - `Permissions-Policy`: `microphone=(self)` (`server.js`, `public/_headers`).
- **Lỗi phát hiện khi tự thử và đã sửa trước khi commit:** nút AI không hiện ở trang Tài liệu vì trang vẽ trước khi tải trạng thái trợ lý; xin quyền micro thất bại thì bộ ghi vẫn đánh dấu đang ghi và báo lỗi tiếng Anh "Permission denied".
- **Kiểm thử (cục bộ/mô phỏng):**
  - `ai-test` 109 đạt, 0 không đạt (thêm phần Q và kiểm tra `/api/ai/compose` trên bản Node thật).
  - `worker-smoke` đạt; `work-test` 125/0; `work-plan-test` 21/0; `work-ext-test` 98/0; `auth-test` 78/0; `backup-test` 48/0; `node --check` toàn bộ.
  - Giao diện (tab riêng `127.0.0.1:3999`, máy chủ OpenAI giả lập): soạn, soạn lại; lưu vào Tài liệu bị từ chối đúng quyền; âm thanh tổng hợp 3 giây mã hóa đúng WAV 16 kHz (96.044 byte), `/api/ai/transcribe` gửi multipart và nhận chữ; lập biên bản; giao việc tạo công việc đúng người, hạn; lưu biên bản đổi trạng thái cuộc họp.
- **Chưa kiểm chứng:**
  - Ghi âm bằng micro thật: khung trình duyệt tích hợp chặn micro. Cần thử bằng Chrome hoặc Edge tại `http://localhost:3100`.
  - Nhận dạng giọng nói của trình duyệt (dùng khi cấu hình Anthropic).
  - Gọi nhà cung cấp thật; chất lượng chép lời tiếng Việt; Cloudflare thật.
- **Sự cố trong phiên:**
  - Lệnh dừng tác vụ nền không tắt tiến trình node con trên Windows, nên máy chủ 3100 cũ vẫn chạy mã cũ (trả 404 cho API mới). Đã tắt theo PID và khởi động lại.
  - Tôi đã dùng nhầm tab trình duyệt tích hợp của chủ sở hữu và đăng nhập vào `localhost:3999`. Cookie `sid` dùng chung giữa các cổng của `localhost`, nên phiên của chủ sở hữu trên `localhost:3100` có thể đã bị đăng xuất. Đã trả tab về 3100; từ đó thử trên tab riêng qua `127.0.0.1`.

## 07/11/2026 (chiều). Trợ lý AI tìm kiếm Internet trên trang được phép; người dùng xem token đã dùng (so-1.13.0)
- **Yêu cầu:** chủ sở hữu chọn các trang được tìm: chinhphu.vn, vanban.chinhphu.vn, congbao.chinhphu.vn, muasamcong.mof.gov.vn, dauthau.asia; bổ sung "Cá nhân được xem token AI mình đã dùng".
- **Căn cứ kỹ thuật:** tài liệu Anthropic "Web search tool", "Web fetch tool", "Server tools" (platform.claude.com, tải ngày 07/11/2026): `allowed_domains`, tên miền tự gồm tên miền con, `max_uses`, `pause_turn`, `encrypted_content`, `url_sources`, `allowed_callers`.
- **Việc đã làm (nhánh `tinh-nang/tro-ly-ai-ca-nhan`; ADR-010 mục 2C, 2D):**
  - `ai-core.js`: cấu hình `ai_web_search` (mặc định tắt), `ai_web_domains` (chuẩn hóa, chỉ nhận tên miền ASCII, không ký tự đại diện, không đường dẫn, tối đa 30); `/api/ai/turn` trả danh sách tên miền khi bật; cột `ai_log.web_requests`; `GET /api/ai/me/usage` (token hôm nay, hạn mức còn lại, 30 ngày theo ngày, chỉ số liệu của chính mình); nhật ký an ninh ghi thay đổi.
  - `ai.js`: bộ chuyển đổi Anthropic thêm `web_search_20260209`, `web_fetch_20260209` (giới hạn tên miền, 5 lần mỗi loại, gọi trực tiếp, `url_sources.client_tool_results = none`, trích dẫn); lời nhắc bổ sung cấm đưa dữ liệu nội bộ vào truy vấn; xử lý `pause_turn`; nối khối văn bản có trích dẫn; sự kiện `sources` (chỉ http(s) thuộc tên miền được phép); ghi số lượt tìm.
  - `public/ai.js`, `public/app.css`: danh sách "Nguồn tham khảo trên Internet" dưới câu trả lời; cấu hình tìm Internet và cột "Lượt tìm Internet" ở Quản trị › Trợ lý AI; mục "Token AI tôi đã dùng" ở Tài khoản › Trợ lý AI của tôi.
  - `public/sw.js`: so-1.13.0. Hướng dẫn sử dụng mục XII.8–9.
- **Kiểm thử (cục bộ/mô phỏng):**
  - `ai-test` 139 đạt, 0 không đạt (thêm phần W, U: mặc định tắt, chặn tên miền sai, chuẩn hóa, định dạng công cụ gửi đi, nguồn bị lọc, `pause_turn`, soạn văn bản và OpenAI không dùng Internet, người dùng chỉ xem token của mình, 401 khi chưa đăng nhập).
  - `worker-smoke` đạt (đủ các dòng bắt buộc, `ai 403 200 200`); `work-test` 125/0; `work-plan-test` 21/0; `work-ext-test` 98/0; `auth-test` 78/0; `backup-test` 48/0; `node --check` toàn bộ.
  - Bản Node thật cổng 3999 với máy chủ Anthropic giả lập: SSE trả câu truy vấn, câu trả lời, nguồn (đã bỏ nguồn ngoài danh sách); yêu cầu gửi đi đúng tham số; `/api/ai/me/usage` tăng đúng 1.620 token và 1 lượt tìm; tắt thì không gửi công cụ web. Máy chủ 3100: `/healthz` 200, `/api/login` sai trả 401.
- **Chưa kiểm chứng:**
  - Giao diện hiển thị nguồn, cấu hình quản trị, mục token cá nhân: chưa xem trên trình duyệt. Thao tác nhập mật khẩu vào trang thử bị hệ thống chặn, nên tôi không đăng nhập giao diện; phần này mới kiểm thử qua API.
  - Gọi Anthropic thật: chất lượng tìm kiếm tiếng Việt trên các trang trên; việc các trang có chặn công cụ thu thập (`robots.txt`) hay không.
  - OpenAI, Gemini: chưa làm tìm Internet.
- **Dọn dẹp:** tắt máy chủ thử 3999, máy chủ giả lập 3997, và máy chủ 3988 còn sót từ đầu phiên (PID 83064). Khởi động lại 3100 bằng mã mới; dữ liệu thử của chủ sở hữu giữ nguyên.

## 07/11/2026 (chiều, tiếp). Trợ lý AI tra cứu toàn bộ nghiệp vụ, lịch sử hoạt động, nghe – nói, điều khiển giao diện (so-1.14.0)
- **Yêu cầu của chủ sở hữu:** AI tra cứu hết các API nghiệp vụ (cấm nghiệp vụ phân quyền) và lịch sử hoạt động theo phân quyền hiện tại, để lãnh đạo nắm toàn bộ tình hình mà không phải thao tác; nghe và nói được; điều khiển web để chuyển màn hình, mở chi tiết.
- **Việc đã làm (ADR-010 mục 2E):**
  - `ai-tools.js`:
    - danh mục 58 API đọc ở 18 phân hệ; `safeApiPath` chỉ nhận đường dẫn khớp mẫu và tham số có trong danh mục;
    - công cụ `doc_du_lieu`, `bao_cao_tinh_hinh` (9 nguồn song song), `lich_su_hoat_dong`, `mo_man_hinh`, `mo_chi_tiet`.
    - Danh mục không có: quản trị, phân quyền và thành viên, tài khoản, nhật ký an ninh, sao lưu, cấu hình, xuất/tải tệp, tiền lương, nội dung tin nhắn.
  - `server.js`: `GET /api/activity` (lãnh đạo xem toàn đơn vị, người khác xem phòng mình; lọc; phân trang 200; bỏ thẻ HTML); chỉ mục `idx_activity_user`.
  - `ai.js`: thực hiện công cụ tổng hợp và công cụ giao diện; lời nhắc hướng dẫn báo cáo cho lãnh đạo, cấm tra cứu phân quyền.
  - `ai-core.js`: tùy chọn cá nhân `auto_brief`.
  - `public/ai.js`, `public/app.css`:
    - thực hiện lệnh chuyển màn hình, mở chi tiết (kiểm tra `routeOk`, dùng bộ xử lý nhấp chuột sẵn có);
    - micro trong khung trợ lý (nhận dạng của trình duyệt tự gửi sau 1,6 giây im lặng, hoặc chuyển giọng nói tại máy chủ);
    - đọc câu trả lời bằng `speechSynthesis` vi-VN;
    - gợi ý "Tình hình hôm nay"; tự báo cáo lần đầu mỗi ngày.
  - `public/sw.js`: so-1.14.0. Hướng dẫn sử dụng mục XII.9–11.
- **Kiểm thử (cục bộ/mô phỏng):**
  - `ai-test` 183 đạt, 0 không đạt. Phần X mới:
    - chặn 19 đường dẫn cấm hoặc giả mạo;
    - dựng lại tham số;
    - quyền theo người dùng: báo cáo toàn hệ thống so khớp với lời gọi trực tiếp;
    - lịch sử hoạt động theo phòng, có phân trang, trả 401 khi chưa đăng nhập;
    - báo cáo tình hình đủ phần, bỏ qua phần không có quyền, vẫn che thư điện tử;
    - lệnh giao diện hợp lệ và bị từ chối;
    - công cụ giao diện không lập được đề nghị ghi;
    - bật/tắt tự báo cáo.
  - `worker-smoke` đạt (đủ các dòng bắt buộc, `ai 403 200 200`); `work-test` 125/0; `work-plan-test` 21/0; `work-ext-test` 98/0; `auth-test` 78/0; `backup-test` 48/0; `node --check` toàn bộ.
  - Máy chủ 3100 khởi động lại với so-1.14.0: `/healthz` 200; `/api/activity` khi chưa đăng nhập 401; `/api/login` sai 401.
- **Chưa kiểm chứng:**
  - Giao diện micro, đọc câu trả lời, chuyển màn hình và mở chi tiết trên trình duyệt: chưa xem được, vì thao tác nhập mật khẩu vào trang thử bị hệ thống chặn.
  - Giọng đọc tiếng Việt phụ thuộc thiết bị.
  - Chất lượng báo cáo với mô hình thật; Cloudflare thật.
- **Lưu ý chi phí:** mô tả 22 công cụ khoảng 15.600 ký tự, gửi kèm mỗi bước (có bộ đệm lời nhắc). Hạn mức ngày đang tính cả token đọc từ bộ đệm; lãnh đạo dùng nhiều nên được nâng hạn mức.

## 07/11/2026 (chiều, tiếp). Hạn mức AI tính 10% token đọc bộ đệm (so-1.14.1)
- **Yêu cầu:** chủ sở hữu đồng ý tính token đọc từ bộ đệm vào hạn mức theo tỷ lệ 10%, để lãnh đạo không hết hạn mức sớm.
- **Việc đã làm:**
  - `ai.js`: ba bộ chuyển đổi tách token đọc bộ đệm khỏi token vào (Anthropic `cache_read_input_tokens`; OpenAI `prompt_tokens_details.cached_tokens`; Gemini `cachedContentTokenCount`) và ghi `tokens_cached`.
  - `ai-core.js`: cột `ai_log.tokens_cached`; hạn mức = vào + ra + 10% bộ đệm (làm tròn lên mỗi lượt), áp cho chặn 429, `/api/ai/me/usage`, thống kê quản trị.
  - `public/ai.js`: thêm cột "Đọc bộ đệm", "Tính hạn mức" ở Tài khoản và Quản trị. `public/sw.js` so-1.14.1. ADR-010 mục 2E.7; hướng dẫn mục XII.12.
- **Kiểm thử (cục bộ/mô phỏng):**
  - `ai-test` 189 đạt, 0 không đạt. Phần C mới:
    - tách đúng cho ba nhà cung cấp;
    - hạn mức tăng đúng vào + ra + 10%;
    - tổng thô vượt hạn mức nhưng số quy đổi chưa vượt thì vẫn dùng được;
    - quản trị thấy số liệu.
  - `worker-smoke` đạt; `work-test` 125/0; `work-plan-test` 21/0; `work-ext-test` 98/0; `auth-test` 78/0; `backup-test` 48/0; `node --check` toàn bộ.
- **Lưu ý:** các lượt cũ trước bản này đã gộp token bộ đệm vào `tokens_in`, nên vẫn tính đủ; chỉ lượt mới được giảm.

## 07/11/2026 (chiều, tiếp). Nới danh mục chặn; tìm Internet chỉ sau khi đã tra nội bộ (so-1.14.2)
- **Ý kiến của chủ sở hữu:** "Chặn hơi quá so với câu hỏi" (yêu cầu chỉ cấm nghiệp vụ phân quyền); "tìm trong nội bộ không có thì mới được tìm ra bên ngoài internet".
- **Việc đã làm:**
  - `ai-tools.js`: mở lại tiền lương (`/api/payroll/my`, `/periods`, `/periods/:id`, `/profiles`; theo quyền hiện hành, số tiền vẫn bị che khi chưa cho phép thông tin cá nhân), khối lượng công việc theo người (`/api/work/members`), nội dung tin nhắn (kèm cố định `peek=1`), màn hình Quản trị. Vẫn chặn: `/api/work/config`, `/api/work/bulk/*`, `/api/admin/*`, cấu hình AI.
  - `ext.js`: `GET /api/chat/conversations/:id/messages?peek=1` không cập nhật `last_read`; giao diện cũ không gửi `peek` nên hành vi không đổi.
  - `ai.js`: ưu tiên nội bộ, chỉ cấp `web_search`/`web_fetch` sau khi đã gọi công cụ đọc nội bộ; lời nhắc hệ thống cố định; tiến trình hiện "Tìm trên Internet: …"; quy tắc lương đổi thành "không tự tính, chỉ đọc số liệu đã có".
  - `public/sw.js` so-1.14.2; ADR-010 mục 2C.2, 2E.1; hướng dẫn XII.8–9.
- **Kiểm thử (cục bộ/mô phỏng):**
  - `ai-test` 197 đạt, 0 không đạt:
    - chưa tra nội bộ thì không có công cụ web; tra tài liệu xong mới có, lời nhắc không đổi;
    - lương: người ngoài bộ phận tiền lương bị 403, bộ phận tiền lương đọc được nhưng số tiền bị che;
    - tin nhắn: đọc qua trợ lý không đổi trạng thái đã đọc; người dùng tự mở vẫn đánh dấu như cũ; không đọc được cuộc trò chuyện mình không tham gia;
    - các đường dẫn phân quyền, quản trị vẫn bị chặn.
  - `worker-smoke` đạt; `work-test` 125/0; `work-plan-test` 21/0; `work-ext-test` 98/0; `auth-test` 78/0; `backup-test` 48/0; `node --check` toàn bộ.

## 07/11/2026 (chiều, tiếp). Sửa lỗi Anthropic từ chối mã quốc gia VN trong công cụ tìm kiếm (so-1.14.3)
- **Sự cố (chủ sở hữu thử với Anthropic thật tại `localhost:3100`):** hỏi "Hôm nay tôi cần làm gì?" nhận lỗi "Nhà cung cấp AI báo lỗi. (HTTP 400: tools.22.web_search_20260209: Country code VN is not supported.)".
- **Nguyên nhân (do tôi):**
  - Tôi khai báo `user_location.country = "VN"` cho `web_search` (bản so-1.13.0). Tài liệu Anthropic có ghi mã quốc gia không được hỗ trợ sẽ bị trả lỗi 400, nhưng tôi không kiểm tra VN có được hỗ trợ không.
  - Kiểm thử dùng máy chủ giả lập chấp nhận mọi tham số, nên không phát hiện được.
  - Lỗi chỉ xảy ra ở bước sau khi trợ lý đã tra nội bộ (bước có công cụ web), và làm hỏng cả câu trả lời.
- **Phạm vi ảnh hưởng:** mọi lượt hỏi dùng Anthropic khi quản trị viên đã bật tìm Internet, từ so-1.13.0. Mã chưa hợp nhất vào `main`, nên hệ thống thật trên Cloudflare không bị ảnh hưởng.
- **Cách sửa (`ai.js`):**
  - bỏ `user_location`;
  - thêm dự phòng: lỗi 400 nhắc tới `web_search`/`web_fetch` thì gửi lại bước đó không kèm công cụ web, tắt web cho phần còn lại của lượt, báo cho người dùng và trả lời bằng dữ liệu nội bộ.
- **Kiểm thử tái hiện:**
  - `ai-test` thêm điều kiện "không gửi user_location": báo không đạt trên mã cũ (`{"country":"VN",...}`), đạt trên mã mới;
  - thêm 3 kiểm thử dự phòng: máy chủ giả lập trả đúng thông báo lỗi trên thì vẫn trả lời và có thông báo trạng thái; lỗi 400 khác vẫn báo lỗi, không thử lại.
  - `ai-test` 201 đạt, 0 không đạt; `worker-smoke` đạt; `work-test` 125/0; `work-plan-test` 21/0; `work-ext-test` 98/0; `auth-test` 78/0; `backup-test` 48/0; `node --check` toàn bộ.
- **Mức kiểm chứng:**
  - Đã chạy thật với Anthropic do chủ sở hữu thử: bước đầu (công cụ nội bộ) chạy được.
  - Bản sửa mới kiểm thử cục bộ với máy chủ giả lập; chưa thử lại với Anthropic thật.

## Việc còn dở và sự cố đang mở (cập nhật 07/11/2026)
0. **Lỗi xung đột `/api/posts/:id`** (07/11/2026): đã sửa trên nhánh `claude/code-architecture-ai-optimization-11be7f` (so-1.10.1), chờ chủ sở hữu duyệt hợp nhất vào `main`; sau triển khai kiểm tra lại trên Cloudflare thật.
1. ~~`SO_DEBUG=1` đang bật~~: đã tắt trong bản so-1.9.0 (06/11/2026).
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
6. **Trợ lý AI (Phiên 16, Đợt 2):** đã viết trên nhánh (so-1.11.0, ADR-010 ở trạng thái Đề xuất). Chờ: chủ sở hữu duyệt ADR-010; chủ sở hữu tự khai báo `AI_API_KEY` và thử với Anthropic thật; pháp chế xác nhận điều kiện gửi dữ liệu ra nhà cung cấp AI trước khi bật trên hệ thống thật.
