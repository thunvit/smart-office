# HƯỚNG DẪN THAM GIA DỰ ÁN SMARTOFFICE

Dành cho lập trình viên và trợ lý AI mới tham gia dự án. Tổng thời gian đọc và cài đặt khoảng 2 giờ. Hoàn thành đủ Mục VI trước khi nhận việc đầu tiên.

## I. Dự án là gì

SmartOffice là phần mềm văn phòng số (công việc, phê duyệt, nhân sự, chấm công, tiền lương, kinh doanh), gồm 19 phân hệ. Định hướng cung cấp dưới dạng dịch vụ cho nhiều đơn vị tại tên miền `smartoffice.vnptninhbinh.com.vn`.

| Mục | Thông tin |
|---|---|
| Kho mã | https://github.com/thunvit/smart-office, nhánh `main` |
| Bản đang chạy | https://smart-office.thunv-it.workers.dev (Cloudflare Workers + Durable Objects) |
| Triển khai | Tự động khi có mã mới trên `main` (Cloudflare Workers Builds) |
| Chủ sở hữu | Nguyễn Văn Thụ (thunv.it@gmail.com) |

## II. Đọc theo thứ tự

| Bước | Tài liệu | Mục đích |
|---|---|---|
| 1 | [CLAUDE.md](../../CLAUDE.md) | Quy tắc bắt buộc; áp dụng cho cả người lẫn AI |
| 2 | [Tiêu chuẩn ATTT](../09-tieu-chuan/TIEU-CHUAN-ATTT.md), [Hiệu năng](../09-tieu-chuan/TIEU-CHUAN-HIEU-NANG.md), [UI/UX](../09-tieu-chuan/TIEU-CHUAN-UI-UX.md) | Yêu cầu chất lượng có mã số, dùng khi duyệt mã |
| 3 | [Danh mục kiểm tra hoàn thành](../09-tieu-chuan/DANH-MUC-KIEM-TRA-HOAN-THANH.md) | Điều kiện để một thay đổi được hợp nhất |
| 4 | [ADR-001 đến ADR-004](../06-quyet-dinh/) | Các quyết định kiến trúc đã chốt |
| 5 | [Nhật ký phiên](../07-nhat-ky/NHAT-KY-PHIEN.md) | Tình trạng hiện tại, việc dở, sự cố đang mở |
| 6 | [Báo cáo rà soát 06/11/2026](../05-ra-soat/2026-11-06-RA-SOAT-XAC-THUC-LUU-TRU.md) | Lỗi đã biết, kế hoạch P0/P1/P2 |
| 7 | [Kế hoạch phát triển](../01-ke-hoach/KE-HOACH-PHAT-TRIEN.md), [Thiết kế đa đơn vị](../02-thiet-ke/THIET-KE-DA-DON-VI.md) | Lộ trình 22 phiên, hướng đa đơn vị |
| 8 | [Hướng dẫn sử dụng](../04-huong-dan/HUONG-DAN-SU-DUNG.md) | Hiểu nghiệp vụ từ góc nhìn người dùng |

## III. Chuẩn bị môi trường

1. Cài **Node.js 22.13 trở lên** (khuyến nghị bản LTS) và Git.
2. Lấy mã: `git clone https://github.com/thunvit/smart-office.git` rồi `cd smart-office`. Không cần `npm install`, vì ứng dụng không có phụ thuộc.
3. Chạy bản cục bộ với dữ liệu mẫu:
   - Linux/macOS: `DATA_DIR=./data-dev PORT=3000 node server.js`
   - Windows: chạy `Khoi-dong-SmartOffice.bat`
   - Mở http://localhost:3000.
4. **Tài khoản thử, chỉ dùng cục bộ:**

   | Tài khoản | Mật khẩu | Ghi chú |
   |---|---|---|
   | `admin` | `Admin@123` | Bắt buộc đổi ở lần đăng nhập đầu |
   | `trang.pt` (nhân sự) | `123456` | Tài khoản mẫu |
   | `mai.bt` | `123456` | Tài khoản mẫu |
   | `quan.lm`, `long.hd`, `huong.tt` | `123456` | Tài khoản mẫu |

   Tuyệt đối không dùng các mật khẩu này trên bản truy cập được từ Internet (ATTT-02).
5. **Cơ sở dữ liệu trống:** chạy `NO_DEMO=1 node server.js`, hoặc `Khoi-tao-du-lieu-trong.bat`.
6. **Kiểm thử lõi Cloudflare** (mô phỏng Durable Object): `node test/worker-smoke.js`.

## IV. Bản đồ mã nguồn

| Tệp, thư mục | Vai trò |
|---|---|
| `server.js` | Router (`route(method, pattern, handler, { public })`), xác thực, phiên, API lõi (công việc, dự án, đề xuất, quy trình, quản trị). Xuất `handle(req, res)` để dùng chung cho Workers |
| `db.js` | Lược đồ CSDL, hàm `all/get/run/tx`, băm mật khẩu, hàm giờ Việt Nam, tham số tiền lương `PAY_DEFAULTS`, dữ liệu mẫu |
| `hr2.js` | Chấm công, bảng công, tiền lương |
| `biz.js` | Bảng tin, lịch họp, tài liệu và kho tệp `FILES`, CRM, thu chi, tài sản |
| `ext.js` | Tuyển dụng, nhắn tin, khách đến, khen thưởng – kỷ luật, đào tạo, đánh giá |
| `worker/` | Bản Cloudflare: `index.js` (Worker, Durable Object), `do-core.js` (chuyển Request ↔ req/res), `sqlite-shim.js` (giao diện `node:sqlite` trên SQLite của Durable Object) |
| `public/` | Giao diện SPA: `app.js` (khung, menu `NAV`, `VIEWS`, `ACTIONS`, hàm dùng chung `window.SO`), `hr.js`, `biz.js`, `ext.js` (màn hình theo nhóm), `app.css` (biến màu, thành phần), PWA (`sw.js`, `pwa.js`, `manifest.webmanifest`) |
| `test/` | `worker-smoke.js` và `fake-do.js` (mô phỏng Durable Object) |
| `deploy/` | Kịch bản Cloudflare Tunnel cho máy chủ riêng (phương án dự phòng) |
| `wrangler.jsonc` | Cấu hình Worker, Durable Object, biến môi trường |

### Thêm một API mới
1. **Vị trí:** trong `register({ route, bad, forbid, ... })` của mô-đun phù hợp (`biz.js`, `ext.js`, `hr2.js`) hoặc trong `server.js`. Khai báo `route('GET', '/api/...', ({ user, body, query, params }) => { ... })`.
2. **Bảo mật:**
   - Kiểm tra quyền trên đối tượng: dùng `forbid()` khi không có quyền, `notFound()` khi không tồn tại.
   - Kiểm tra đầu vào bằng `str()`, `int()`, `isDate()`; SQL chỉ dùng tham số.
3. **Lược đồ:** bảng mới tạo bằng `CREATE TABLE IF NOT EXISTS`; cột mới dùng `addCol()` trong `db.js`. Chỉ mục đi kèm.
4. **Kiểm thử:** bổ sung vào `test/` cho cả trường hợp hợp lệ và trường hợp bị từ chối.

### Thêm một màn hình mới
1. **Đăng ký:** khai báo màn hình trong `VIEWS`, thao tác trong `ACTIONS` (`data-act`), mục menu trong nhóm phù hợp của `NAV`.
2. **Giao diện:** chỉ dùng thành phần dùng chung (TIÊU CHUẨN UI/UX, Mục II); mọi chuỗi đưa vào HTML qua `esc()`.
3. **Kiểm tra:** chạy ở 1440 px và 390 px, chế độ sáng và tối; tăng `VERSION` trong `public/sw.js`.

## V. Quy trình làm việc

1. **Nhận việc:** từ kế hoạch P0/P1/P2 hoặc yêu cầu của chủ sở hữu. Mỗi phiên hoặc mỗi nhánh làm một mục tiêu.
2. **Tạo nhánh:** `git checkout -b <loai>/<mo-ta-ngan>`, ví dụ `sua-loi/khoa-dang-nhap`, `tinh-nang/xuat-du-lieu`.
3. **Thực hiện kèm kiểm thử**, theo [Danh mục kiểm tra hoàn thành](../09-tieu-chuan/DANH-MUC-KIEM-TRA-HOAN-THANH.md).
4. **Mở yêu cầu hợp nhất (pull request) vào `main`** theo mẫu có sẵn. GitHub Actions tự kiểm tra cú pháp, khởi động thử và chạy kiểm thử lõi Cloudflare.
5. **Hợp nhất:** sau khi được duyệt thì hợp nhất. Cloudflare tự triển khai trong khoảng 1–2 phút.
6. **Sau triển khai:** kiểm tra trên địa chỉ thật, sau đó ghi nhật ký phiên.

Thay đổi rất nhỏ (sửa tài liệu, sửa chữ) được đẩy thẳng lên `main` nếu chủ sở hữu cho phép. Vẫn phải chạy kiểm thử.

## VI. Danh sách tự kiểm tra trước buổi làm việc đầu tiên

- [ ] Đã đọc các tài liệu tại Mục II, bước 1–6.
- [ ] Chạy được bản cục bộ, đăng nhập được bằng tài khoản mẫu, xem được các phân hệ.
- [ ] Chạy `node test/worker-smoke.js` đạt.
- [ ] Nắm được 5 điều cấm:
  1. ghi bí mật vào kho mã;
  2. đẩy lên `main` khi kiểm thử chưa đạt;
  3. xóa Worker hoặc sửa migration Durable Object;
  4. thêm thư viện npm khi chưa có ADR;
  5. viết mã giữ cố định `ctx.storage` hoặc dùng `__dirname` ở mã chạy trên Workers.
- [ ] Biết các việc P0 đang mở (nhật ký phiên) và ai là đầu mối cấp quyền GitHub, Cloudflare (chủ sở hữu).

## VII. Quyền truy cập

| Hệ thống | Quyền cần có | Đầu mối cấp |
|---|---|---|
| GitHub `thunvit/smart-office` | Đọc và đẩy nhánh; hợp nhất vào `main` do chủ sở hữu quyết định | Chủ sở hữu |
| Cloudflare (Worker `smart-office`) | Chỉ xem nhật ký (Observability) đối với lập trình viên; quyền sửa cấu hình và bí mật chỉ cấp khi cần | Chủ sở hữu |
| Claude (Project "SmartOffice") | Trợ lý AI làm việc trong Project, có đồng bộ kho GitHub | Chủ sở hữu |
