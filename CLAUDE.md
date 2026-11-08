# QUY TẮC LÀM VIỆC CHO TRỢ LÝ AI – DỰ ÁN SMARTOFFICE

Tệp này là quy tắc bắt buộc với mọi trợ lý AI (Claude và các công cụ khác) tham gia dự án. Đọc hết tệp này trước khi làm bất kỳ việc gì. Khi quy tắc ở đây mâu thuẫn với thói quen mặc định của công cụ, áp dụng quy tắc ở đây. Yêu cầu trực tiếp của chủ sở hữu trong phiên làm việc được ưu tiên hơn tệp này.

## 1. Đọc trước khi làm

Theo thứ tự:
0. Người mới (lập trình viên hoặc AI): `docs/00-bat-dau/HUONG-DAN-THAM-GIA-DU-AN.md`, gồm cài đặt, bản đồ mã nguồn, quy trình, danh sách tự kiểm tra.
1. `docs/README.md`: mục lục tài liệu và quy ước lưu trữ.
2. `docs/07-nhat-ky/NHAT-KY-PHIEN.md`: phiên gần nhất đã làm gì, việc còn dở, sự cố đang mở.
3. Báo cáo rà soát mới nhất trong `docs/05-ra-soat/`: các lỗi đã biết và kế hoạch P0/P1/P2.
4. `docs/06-quyet-dinh/`: các quyết định kiến trúc đã chốt (ADR). Không đi ngược một ADR khi chưa có ADR mới thay thế được chủ sở hữu đồng ý.
5. Bộ tiêu chuẩn chất lượng trong `docs/09-tieu-chuan/`: ATTT, hiệu năng, UI/UX, danh mục kiểm tra hoàn thành.
6. Tài liệu liên quan trực tiếp đến nhiệm vụ: kế hoạch, thiết kế, triển khai, hướng dẫn.

## 2. Ngôn ngữ, văn phong, trung thực

1. **Ngôn ngữ và văn phong:**
   - Trao đổi và viết tài liệu bằng tiếng Việt, văn phong hành chính: cụ thể, rõ ràng, có căn cứ (dẫn tệp:dòng, văn bản pháp luật, nguồn tra cứu).
   - Thuật ngữ kỹ thuật giữ nguyên tiếng Anh khi không có từ tương đương thông dụng.
2. **Phân biệt rõ mức độ kiểm chứng:**
   - "đã chạy thật trên Cloudflare";
   - "đã kiểm thử cục bộ/mô phỏng";
   - "chỉ có trong mã";
   - "chưa làm", "chưa kiểm chứng".

   Không mô tả một chức năng là "hoàn thành" khi chưa chạy thử.
3. **Báo đúng kết quả kiểm thử:**
   - Không báo "đạt" khi kiểm thử chưa chạy hoặc chạy sai đối tượng. Ví dụ: kiểm thử gọi sai đường dẫn, nhận 404 vẫn báo đạt.
   - Kiểm thử phải có điều kiện khẳng định (assert) rõ ràng.
4. **Khi phát hiện lỗi do mình gây ra:** nói thẳng nguyên nhân, cách sửa, phạm vi ảnh hưởng.

## 3. Kiến trúc và ràng buộc kỹ thuật

Tóm tắt; chi tiết tại `docs/06-quyet-dinh/`.

1. **Một mã nguồn, hai môi trường chạy:**
   - Node.js ≥ 22.13: `server.js`, SQLite tệp qua `node:sqlite`, dữ liệu tại `DATA_DIR`.
   - Cloudflare Workers + Durable Objects:
     - `worker/index.js`: Worker và Durable Object `SmartOffice`.
     - `worker/do-core.js`: khởi tạo ứng dụng, chuyển Request ↔ req/res.
     - `worker/sqlite-shim.js`: giao diện giống `node:sqlite` trên `ctx.storage.sql`.
2. **Không thêm thư viện npm vào mã chạy.** Ứng dụng không có phụ thuộc. Muốn thêm phải có ADR.
3. **Quy tắc bắt buộc cho mã chạy được trên Workers** (vi phạm sẽ gây lỗi chỉ xuất hiện trên Cloudflare):
   - **Đường dẫn và mô-đun Node:**
     - Không dùng `__dirname`, `__filename`, `fs`, `os`, `http`, `process.exit` ở cấp mô-đun.
     - Các mô-đun này chỉ dùng trong nhánh `if (!IS_WORKER)` hoặc `!D.IS_WORKER`.
     - `node:sqlite` chỉ nạp qua tên động trong `db.js`.
   - **Kết nối lưu trữ:**
     - Không giữ cố định `ctx.storage` hoặc bất kỳ đối tượng I/O nào của Durable Object ở phạm vi isolate.
     - Luôn lấy storage hiện hành qua hàm (xem `makeSql(getStorage)`).
     - Lỗi đã xảy ra: "Cannot perform I/O on behalf of a different Durable Object".
   - **Giao dịch:** không dùng `BEGIN/COMMIT/SAVEPOINT` trực tiếp; dùng `D.tx(fn)`, trên Workers sẽ chuyển thành `storage.transactionSync`.
   - **Câu lệnh SQL:**
     - Không dùng `VACUUM`.
     - Không dùng PRAGMA cấu hình tệp.
     - Mỗi dòng dữ liệu tối đa 2 MB; tệp lớn phải chia khối (xem `FILES` trong `biz.js`).
   - **Thời gian:** luôn dùng hàm giờ Việt Nam trong `db.js` (`today`, `now`, `nowHM`, `vnMonth`), không dùng `new Date().getHours()` hay các hàm giờ địa phương.
   - **Giới hạn CPU:** hiện băm mật khẩu bằng scrypt (khoảng 36 ms CPU). Tránh gọi scrypt nhiều lần trong một yêu cầu.
4. **Hiện mỗi isolate chỉ phục vụ một Durable Object (`main`).** Muốn đa đơn vị phải thiết kế lại việc giữ trạng thái mô-đun trước; không tự thêm Durable Object thứ hai.
5. **Giao diện** là SPA JavaScript thuần trong `public/`, có PWA (`sw.js`, `pwa.js`, `manifest.webmanifest`).
   - Mỗi lần phát hành phải tăng `VERSION` trong `public/sw.js`.
   - Service worker không được lưu đệm `/api/`.

## 3A. Tiêu chuẩn chất lượng bắt buộc

Mọi thay đổi phải đáp ứng ba tiêu chuẩn và danh mục kiểm tra trong `docs/09-tieu-chuan/`. Khi báo cáo hoặc duyệt mã, dẫn đúng mã yêu cầu (ví dụ ATTT-05, HN-06).

1. **An toàn thông tin** (`TIEU-CHUAN-ATTT.md`):
   - Thiết kế theo yêu cầu cấp độ 3; căn cứ Luật An ninh mạng 2025, Nghị định 331/2026/NĐ-CP, Luật Bảo vệ dữ liệu cá nhân 2025, OWASP ASVS 4.0.3 mức 2.
   - Bắt buộc: mặc định từ chối; kiểm tra quyền trên từng đối tượng tại máy chủ; SQL tham số; `esc()` cho HTML; không bí mật trong kho; ghi nhật ký an ninh; thu hồi phiên khi đổi mật khẩu.
2. **Hiệu năng** (`TIEU-CHUAN-HIEU-NANG.md`):
   - Chỉ tiêu: API p95 ≤ 300 ms; CPU ≤ 50 ms mỗi yêu cầu; LCP ≤ 2,5 s; INP ≤ 200 ms.
   - Bắt buộc: chỉ mục cho truy vấn mới; phân trang tối đa 200 bản ghi; không truy vấn trong vòng lặp; gọi định kỳ trung bình không dày hơn 15 giây.
3. **UI/UX** (`TIEU-CHUAN-UI-UX.md`):
   - Chỉ dùng biến màu và thành phần dùng chung; đủ chế độ sáng và tối.
   - Dùng được ở chiều rộng 360 px; đạt WCAG 2.1 AA.
   - Tiếng Việt thống nhất thuật ngữ; định dạng ngày `dd/mm/yyyy` và tiền `1.234.567 ₫`.
4. **Hoàn thành** khi đạt `DANH-MUC-KIEM-TRA-HOAN-THANH.md`; yêu cầu hợp nhất dùng mẫu `.github/pull_request_template.md`.
5. **Hiện trạng chưa đạt** đã ghi trong từng tiêu chuẩn. Không được làm tình trạng xấu thêm; khắc phục theo lộ trình P0, P1, P2.

## 4. Bảo mật

1. **Không ghi bí mật vào kho mã:** mật khẩu, token, khóa API, mật khẩu gốc, dữ liệu thật (`data/`, `*.db`).
   - Bí mật đặt trong *Variables and Secrets* của Cloudflare, hoặc biến môi trường của máy chủ.
2. **Không tạo mật khẩu mặc định cho bản công khai.**
   - Mật khẩu `Admin@123` và `123456` chỉ dành cho bản chạy cục bộ có dữ liệu mẫu.
   - Cơ chế mã băm `ADMIN_PASSWORD_HASH` trong `wrangler.jsonc` đã gỡ (ADR-008). Bí mật `ADMIN_PASSWORD` chỉ áp dụng một lần khi khởi tạo. Không thêm cơ chế tương tự.
3. **Trợ lý AI không tự nhập mật khẩu, token hay thông tin thanh toán** vào bất kỳ trang nào, và không tự đăng nhập tài khoản của chủ sở hữu.
4. **Mọi chức năng xác thực mới phải có kiểm thử tự động.** Phạm vi tối thiểu: đăng nhập đúng/sai, khóa khi sai nhiều lần, đổi mật khẩu, thu hồi phiên, phân quyền.
5. **Chế độ hiển thị lỗi chi tiết:** `SO_DEBUG=1` chỉ bật khi chẩn đoán và phải tắt ngay sau đó. Ghi việc bật và tắt vào nhật ký phiên.

## 5. Kiểm thử bắt buộc trước khi đẩy mã

Chạy và xác nhận đạt toàn bộ:
1. `for f in *.js public/*.js worker/*.js test/*.js; do node --check "$f"; done`
2. `node test/worker-smoke.js`: phải có `KẾT QUẢ: đạt`, `download 200 true`, `re-instantiate 200`, `lockout persist 429`, `backup-manifest 200`. Kịch bản trả mã thoát 1 khi có bước sai. Thêm điều kiện cho chức năng mới.
3. Khởi động bản Node với `DATA_DIR` tạm và gọi `/healthz`, `/api/login`.
3a. `node test/work-test.js`: phải in `0 không đạt` (phân quyền và luồng trạng thái phân hệ Công việc – Dự án).
3b. `node test/work-plan-test.js`: phải in `0 không đạt` (quy tắc công việc lặp lại theo các ví dụ của Base Wework).
3c. `node test/work-ext-test.js`: phải in `0 không đạt` (trường tùy chỉnh, mẫu, nhân bản, nhập/xuất, báo cáo, tác vụ hàng loạt; ADR-007). `node test/worker-smoke.js` phải có thêm `work-template 200 3` và `work-post 200`.
3d. Thay đổi giao diện phân hệ Công việc: chạy cục bộ `node test/work-ui.js` và `node test/work-ui-full.js` (Playwright, cần máy chủ Node cổng 3999 với `DATA_DIR` tạm).
3e. `node test/auth-test.js`: phải in `0 không đạt` (xác thực theo mục 4.4: đăng nhập, khóa khi sai nhiều lần, đổi mật khẩu, thu hồi phiên, ép đổi mật khẩu lần đầu, phân quyền, nhật ký an ninh, mật khẩu ban đầu một lần; ADR-008).
3f. `node test/backup-test.js`: phải in `0 không đạt` (xuất rồi khôi phục vào Durable Object mới trùng khớp từng dòng, từng byte; PITR với ctx giả lập; ADR-009). Thay đổi giao diện sao lưu: chạy cục bộ `node test/backup-ui.js` (hai máy chủ Node cổng 3999 và 3996).
3g. `node test/ai-test.js`: phải in `0 không đạt` (trợ lý AI với nhà cung cấp giả lập: phân quyền, xác nhận thao tác ghi, che dữ liệu cá nhân, hạn mức, định dạng Anthropic/OpenAI/Gemini, bản Node qua SSE; ADR-010). Phải có `HỢP ĐỒNG API: … (0)`: mọi yêu cầu gửi nhà cung cấp qua máy chủ giả lập kiểm tra quy tắc API (Anthropic: không đổi `system`/`tools` giữa các bước một lượt, lịch sử chỉ nối thêm, vai xen kẽ, `tool_use`↔`tool_result`). `node test/worker-smoke.js` phải có thêm `ai 403 200 200`. Kiểm thử không gọi mô hình thật; trợ lý AI không tự nhập khóa API (mục 4.3). Sau khi thay đổi trợ lý AI, chủ sở hữu chạy **Kiểm tra toàn diện** (Tài khoản › Trợ lý AI của tôi) với khóa thật.
3h. `node test/ops-test.js`: phải in `0 không đạt` (vận hành tự chủ: cập nhật tiến độ tuần, phạm vi xem của nhân viên/trưởng phòng/giám đốc, ghi nhận, mức leo thang, huy hiệu, tham số; ADR-012). `node test/worker-smoke.js` phải có thêm `ops 200 200 number`.
4. **Sửa lỗi:** mỗi lỗi phải kèm kiểm thử tái hiện. Kiểm thử đó phải báo lỗi trên mã cũ và đạt trên mã mới.
5. **Giới hạn của bản mô phỏng:** `test/fake-do.js` chỉ mô phỏng Durable Object, không thay được Cloudflare thật. Sau khi triển khai, kiểm tra lại trên địa chỉ thật và ghi rõ kết quả.

## 6. Triển khai và vận hành

1. **Đẩy mã lên nhánh `main` của `thunvit/smart-office` là triển khai thật**: Cloudflare Workers Builds tự triển khai Worker `smart-office` tại https://smart-office.thunv-it.workers.dev.
   - Không đẩy khi kiểm thử chưa đạt.
   - Thay đổi lớn làm trên nhánh riêng.
2. **Không xóa Worker `smart-office`:** xóa Worker là mất toàn bộ cơ sở dữ liệu Durable Object, khôi phục theo thời điểm không cứu được. Đã xảy ra ngày 05/11/2026. Trước thay đổi lớn hoặc nhập dữ liệu hàng loạt, tải bản sao lưu đầy đủ (Quản trị › Sao lưu dữ liệu; ADR-009).
3. **Không đổi tên lớp Durable Object hay sửa `migrations` trong `wrangler.jsonc`** khi chưa có kế hoạch chuyển dữ liệu được duyệt.
4. **Thao tác trên trang quản trị Cloudflare hoặc GitHub làm thay đổi tài nguyên** (tạo, xóa, đổi cấu hình, cấp quyền): chỉ làm khi chủ sở hữu yêu cầu rõ. Thao tác xóa phải được xác nhận lại trước khi làm.
5. **Commit:**
   - Thông điệp bằng tiếng Việt: dòng đầu nêu việc làm; thân nêu nguyên nhân, cách khắc phục, kiểm thử đã chạy.
   - Ghi tác giả theo cấu hình của phiên làm việc.

## 7. Tài liệu dự án

Mỗi phiên làm việc phải:
1. **Đặt tài liệu đúng thư mục** theo `docs/README.md`.
   - Không tạo tài liệu rời ở thư mục gốc. Thư mục gốc chỉ có `README.md`, `CLAUDE.md`, `AGENTS.md`.
2. **Cuối phiên, ghi `docs/07-nhat-ky/NHAT-KY-PHIEN.md`:**
   - ngày giờ, mục tiêu, việc đã làm (kèm commit);
   - kết quả kiểm thử, mức độ kiểm chứng;
   - việc còn dở, sự cố đang mở.
3. **Lập ADR mới** trong `docs/06-quyet-dinh/` khi có quyết định kiến trúc, công nghệ hoặc bảo mật.
4. **Lưu báo cáo rà soát hoặc kiểm thử** trong `docs/05-ra-soat/`, tên tệp `YYYY-MM-DD-TEN-NGAN.md`.
5. **Kế hoạch và thiết kế có bản gốc trên Claude Docs:**
   - sửa ở bản gốc, rồi xuất lại vào `docs/01-ke-hoach/` và `docs/02-thiet-ke/`;
   - ghi số bản sửa ở đầu tệp.

## 8. Căn cứ pháp lý

1. **Chỉ dẫn văn bản pháp luật đã kiểm tra hiệu lực**; danh mục tại `docs/08-phap-ly/CAN-CU-PHAP-LY.md`.
2. **Văn bản chưa kiểm tra được hiệu lực phải ghi "chưa kiểm chứng"**. Không khẳng định nội dung một điều luật khi chưa đọc văn bản gốc.
3. **Tham số tiền lương, thuế, bảo hiểm** cập nhật theo văn bản mới tại `PAY_DEFAULTS` (`db.js`), đồng thời cập nhật danh mục căn cứ.
