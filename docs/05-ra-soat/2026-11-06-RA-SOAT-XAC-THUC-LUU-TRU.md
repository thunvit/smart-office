# BÁO CÁO RÀ SOÁT MÃ NGUỒN SMARTOFFICE

> **Tình trạng xử lý sau báo cáo** (cập nhật 06/11/2026):
> - Lỗi "Cannot perform I/O on behalf of a different Durable Object" (mục V): **đã sửa** tại commit `5fdff58`; đã bổ sung kiểm thử khởi tạo lại Durable Object vào `test/worker-smoke.js` và CI.
> - Cập nhật 06/11/2026 (tối), ADR-008: P0-2, P0-3, P0-4, P0-5, P0-6, P0-7, P0-8 **đã sửa trong mã và kiểm thử cục bộ/mô phỏng** (`test/auth-test.js` 78 điều kiện, `test/worker-smoke.js` có khẳng định và mã thoát). Kết quả trên Cloudflare thật xem nhật ký phiên.
> - P0-9 (ADR-009): xuất, khôi phục từ tệp và PITR **đã có trong mã, kiểm thử cục bộ/mô phỏng** (`test/backup-test.js`: xuất rồi khôi phục vào Durable Object mới trùng khớp mọi bảng và tệp). Chưa làm: xuất định kỳ ra R2 (cần tạo bucket), diễn tập PITR trên Cloudflare thật.
> - **Chưa thực hiện:** P0-10 (gói Workers Paid, đo CPU), P0-11 (kiểm thử trên workerd trong CI), P0-12 (pháp lý nơi lưu dữ liệu, do pháp chế). Theo dõi tại `docs/07-nhat-ky/NHAT-KY-PHIEN.md`.
> - Kịch bản kiểm thử dùng trong báo cáo được lưu tại `docs/05-ra-soat/2026-11-06-kich-ban-kiem-thu/` (đường dẫn trong mã kịch bản là đường dẫn tạm lúc rà soát, cần chỉnh khi chạy lại).

- Đối tượng: kho `thunvit/smart-office`, nhánh `main`, commit `e79ef92` (06/11/2026 07:49 giờ Việt Nam). 
- Ngày rà soát: 06/11/2026.
- Phạm vi: đọc mã và chạy thử cục bộ (Node.js 22.23.4, esbuild 0.28.2 có sẵn trong môi trường). Không sửa, không commit kho mã. Không truy cập được Cloudflare, wrangler hay workerd.
- Quy ước mức độ kiểm chứng:
  - **[CHẠY THẬT]**: đã chạy cục bộ và quan sát được kết quả.
  - **[MÃ]**: chỉ suy ra từ đọc mã, chưa chạy.
  - **[DỮ KIỆN]**: do phiên chính hoặc người dùng cung cấp từ môi trường Cloudflare; kiểm toán viên không tự kiểm chứng được.
  - **[CHƯA KIỂM CHỨNG]**: nhận định dựa trên hiểu biết về nền tảng, chưa đối chiếu được.

---

## I. TÓM TẮT KẾT LUẬN

| # | Hạng mục | Hiện trạng | Mức độ kiểm chứng | Rủi ro |
|---|---|---|---|---|
| 1 | Băm mật khẩu | scrypt (N=16384, r=8, p=1 là mặc định của Node), muối ngẫu nhiên 16 byte, khóa 64 byte, lưu ở `users.pass_hash` | [MÃ] + [CHẠY THẬT] | Thấp |
| 2 | Phiên đăng nhập | Cookie `sid` (HttpOnly, SameSite=Lax, có Secure khi chạy HTTPS), token ngẫu nhiên 32 byte lưu **dạng rõ** ở bảng `sessions`, hạn 7 ngày | [CHẠY THẬT] | Trung bình |
| 3 | Thu hồi phiên khi đổi mật khẩu | **Không có.** Phiên cũ vẫn dùng được sau khi người dùng tự đổi mật khẩu | [CHẠY THẬT] | **Cao** |
| 4 | Khóa đăng nhập sau nhiều lần sai | **Không hoạt động** (lỗi logic, bộ đếm không bao giờ vượt quá 1). Ngoài ra dữ liệu đếm chỉ nằm trong bộ nhớ | [CHẠY THẬT] | **Cao** |
| 5 | Bắt buộc đổi mật khẩu lần đầu | Chỉ giao diện chặn. Máy chủ không chặn, vẫn gọi được các API quản trị | [CHẠY THẬT] | Trung bình |
| 6 | Mật khẩu ban đầu và mật khẩu mẫu ghi cứng | `admin/Admin@123` (Node), `123456` (dữ liệu mẫu), `ADMIN_PASSWORD_HASH` công khai trên GitHub | [MÃ] + [CHẠY THẬT] | Cao (xem mục II.6) |
| 7 | applyAdminSecret ghi đè mật khẩu | Khi tài khoản `admin` bị đặt lại mật khẩu (must_change_pw=1), lần khởi động DO sau đó sẽ khôi phục **mật khẩu ban đầu theo mã băm công khai** | [CHẠY THẬT] (mô phỏng) | **Cao** |
| 8 | SSO / 2FA | Không có | [MÃ] | Trung bình |
| 9 | CSDL bản Node | SQLite tệp (`node:sqlite`), WAL, `data/smartoffice.db` | [CHẠY THẬT] | Thấp |
| 10 | CSDL bản Cloudflare | SQLite của Durable Object qua lớp `sqlite-shim.js` | [DỮ KIỆN] chạy được; [CHẠY THẬT] trên mô phỏng | — |
| 11 | **Lỗi 500 trên Cloudflare** | **Đã xác định nguyên nhân**: `do-core.js` giữ `APP` và `globalThis.__SO_SQL` (bọc `ctx.storage` của DO đầu tiên) ở phạm vi isolate; DO được tạo lại trong cùng isolate thì mã vẫn dùng storage cũ → "Cannot perform I/O on behalf of a different Durable Object" | [DỮ KIỆN] + tái hiện được bằng [CHẠY THẬT] trên bản đóng gói | **Nghiêm trọng (chặn đưa vào sử dụng)** |
| 12 | Kiểm thử tự động | `test/worker-smoke.js` gọi sai đường dẫn đổi mật khẩu (404) nhưng vẫn báo đạt; chỉ dùng 1 thể hiện DO nên không thể phát hiện lỗi #11 | [CHẠY THẬT] | Cao |
| 13 | Sao lưu bản Node | `GET /api/admin/backup` (VACUUM INTO) trả tệp SQLite; tệp đính kèm phải chép tay | [CHẠY THẬT] | Trung bình |
| 14 | Sao lưu bản Cloudflare | Không có chức năng xuất dữ liệu. Ứng dụng không có mã gọi khôi phục theo thời điểm (PITR) | [MÃ] | **Cao** |
| 15 | Lưu tệp bản Node | Đĩa: `data/files/` | [CHẠY THẬT] | Thấp |
| 16 | Lưu tệp bản Cloudflare | Bảng `file_chunks` trong SQLite của DO, khối 1 MB. Không dùng R2/S3 | [CHẠY THẬT] (mô phỏng) | Trung bình |
| 17 | Giới hạn tệp | 20 MB (sau giải mã base64); thân JSON tối đa 30.000.000 byte | [CHẠY THẬT] | Thấp |
| 18 | Triển khai thật | Có Worker `smart-office.thunv-it.workers.dev` chạy tự động từ GitHub; chưa có dữ liệu nghiệp vụ; chưa có bản máy chủ riêng hoặc Tunnel | [DỮ KIỆN] | — |
| 19 | SO_DEBUG=1 đang bật | Phản hồi 500 trả về tối đa 600 ký tự stack trace | [MÃ] | Trung bình (phải tắt) |

---

## II. XÁC THỰC VÀ PHIÊN ĐĂNG NHẬP

### II.1. Băm mật khẩu
- Hàm `hashPw` (`db.js:39-43`): `crypto.scryptSync(pw, salt, 64)` với `salt = crypto.randomBytes(16)`. Định dạng lưu là `scrypt$<muối hex 32 ký tự>$<mã băm hex 128 ký tự>`. Mã không truyền tham số chi phí, nên dùng mặc định của Node: N=16384, r=8, p=1, bộ nhớ khoảng 16 MB mỗi lần băm. Tham số này không được ghi vào chuỗi lưu, nên muốn tăng chi phí về sau phải đổi định dạng.
- Hàm `verifyPw` (`db.js:44-51`) so sánh bằng `crypto.timingSafeEqual`. Mọi ngoại lệ đều trả về `false`.
- Nơi lưu: cột `users.pass_hash` (`db.js:69-75`). Bản Node lưu trong tệp SQLite, bản Cloudflare lưu trong SQLite của DO.
- Chi phí CPU đo được trên máy rà soát **[CHẠY THẬT]**: trung bình 36,4 ms CPU mỗi lần scrypt (thấp nhất 34,8 ms, cao nhất 43 ms). Đăng nhập tốn 1 lần, đổi mật khẩu tốn 2 lần (`server.js:109` và `:112`), tức khoảng 75–87 ms mỗi yêu cầu.
- Kênh rò rỉ theo thời gian **[CHẠY THẬT]**: tên đăng nhập không tồn tại trả lời trong khoảng 2 ms, còn tên tồn tại mất khoảng 40 ms vì phải chạy scrypt (`server.js:86-87`). Kẻ tấn công có thể dò tên tài khoản dựa vào chênh lệch này.

### II.2. Phiên đăng nhập
- Tạo phiên (`server.js:93-96`): token `crypto.randomBytes(32)` (64 ký tự hex) được chèn vào bảng `sessions(token, user_id, expires)` (`db.js:76-77`). Thời hạn là 23:59:59 của ngày thứ 7 tính từ hôm nay theo giờ Việt Nam (`SESSION_DAYS = 7`, `server.js:30`). Cookie có `Max-Age=604800`.
- Thuộc tính cookie (`server.js:38`): `HttpOnly; SameSite=Lax; Path=/`, thêm `Secure` khi nhận diện HTTPS. Trên Cloudflare, `TRUST_PROXY=1` được đặt tại `do-core.js:15` và `x-forwarded-proto` lấy từ URL (`do-core.js:51`). Kiểm thử khói xác nhận có `Secure` **[CHẠY THẬT]**.
- Xác minh phiên (`server.js:68-75`): tra `sessions` theo token, kiểm tra hạn, sau đó tra `users` với `active=1`. Hạn phiên cố định, không gia hạn trượt và không có thời gian chờ khi không hoạt động.
- Token lưu **dạng rõ** **[CHẠY THẬT]**: đã đọc được token 64 ký tự trực tiếp từ bảng `sessions`. Ai có bản sao CSDL (ví dụ tệp sao lưu tải về) đều có thể chiếm phiên đang hiệu lực.
- Phòng chống CSRF: các yêu cầu không phải GET phải có `Origin` khớp `PUBLIC_ORIGINS` hoặc `Host` (`server.js:742-749`, `:790`). Đã chạy thử: Origin lạ bị trả 403 **[CHẠY THẬT]**. Yêu cầu không có `Origin` vẫn được chấp nhận (`server.js:744`), kết hợp với SameSite=Lax thì rủi ro ở mức chấp nhận được.
- Dọn phiên hết hạn chỉ diễn ra khi có người đăng nhập (`server.js:94`).

### II.3. Thu hồi phiên
| Tình huống | Có thu hồi không | Căn cứ |
|---|---|---|
| Đăng xuất | Có, xóa token hiện tại | `server.js:100-105`. Dùng lại cookie sau khi đăng xuất bị trả 401 **[CHẠY THẬT]** |
| Người dùng tự đổi mật khẩu | **Không** | `server.js:107-114`. Phiên B tạo trước khi đổi mật khẩu vẫn gọi `/api/bootstrap` được, trả 200 **[CHẠY THẬT]** trên cả Node và mô phỏng DO |
| Quản trị viên đặt lại mật khẩu | Có, xóa mọi phiên của người đó | `server.js:671-672` |
| Khóa tài khoản | Có | `server.js:668` |

### II.4. Giới hạn đăng nhập sai
- Mã ở `server.js:66` và `:81-92`: dùng `Map` trong bộ nhớ, khóa theo `tên đăng nhập + IP`, dự kiến khóa 5 phút sau 5 lần sai.
- **Lỗi logic, tính năng khóa không bao giờ kích hoạt** **[CHẠY THẬT]**. Dòng 88 tính `n = (f && f.until <= Date.now() ? 0 : f.n) + 1`. Khi chưa đủ 5 lần sai thì `until = 0`, nên điều kiện `f.until <= Date.now()` luôn đúng và `n` bị đặt về 1 sau mỗi lần sai. Đã chạy thử 6–7 lần sai liên tiếp, sau đó nhập mật khẩu đúng vẫn đăng nhập được (200) trên cả bản Node (cổng 3997) và mô phỏng DO.
- Kể cả khi sửa lỗi logic:
  - Bộ đếm chỉ nằm trong bộ nhớ. Bản Node mất bộ đếm khi khởi động lại tiến trình. Bản Cloudflare mất bộ đếm mỗi khi isolate hoặc DO khởi động lại, mà việc này xảy ra thường xuyên (sau thời gian nhàn rỗi, sau mỗi lần triển khai).
  - Khóa theo cặp tên đăng nhập + IP, nên kẻ tấn công đổi IP là né được khóa.
  - `Map` không bao giờ được dọn, nên có thể phình bộ nhớ khi bị dò mật khẩu ở quy mô lớn **[MÃ]**.

### II.5. Bắt buộc đổi mật khẩu lần đầu
- Các trường hợp đặt `must_change_pw=1`: admin ban đầu (`db.js:220`, `:346-347`), tài khoản do quản trị viên tạo hoặc nhập (`server.js:635`, `:654`), tài khoản được quản trị viên đặt lại mật khẩu (`server.js:671`).
- Chỉ giao diện xử lý: `public/app.js:156` mở hộp thoại bắt buộc đổi mật khẩu. Máy chủ **không** chặn: trong khi `must_change_pw=true`, gọi `GET /api/admin/users` vẫn trả 200 **[CHẠY THẬT]**.
- Chính sách mật khẩu mới: tối thiểu 8 ký tự, có chữ và số (`server.js:111`). Mật khẩu do quản trị viên đặt chỉ yêu cầu tối thiểu 8 ký tự (`server.js:633`, `:670`).

### II.6. Danh sách thông tin xác thực ghi cứng hoặc công khai
| # | Vị trí | Nội dung | Phạm vi tác động | Đánh giá rủi ro |
|---|---|---|---|---|
| 1 | `db.js:220` (seedDemo), `db.js:347` (seedEmpty, bản Node), `server.js:835`, `README.md:35`, `HUONG-DAN-SU-DUNG.md:66,132`, `.github/workflows/kiem-tra.yml` | `admin` / `Admin@123` | Mọi bản Node mới khởi tạo | **Cao** nếu máy chủ mở ra Internet (qua Tunnel) mà chưa đổi mật khẩu. Kết hợp với lỗi khóa đăng nhập (II.4) và việc máy chủ không ép đổi mật khẩu (II.5), ai biết mật khẩu mặc định đều vào được với quyền quản trị |
| 2 | `db.js:211` (`hashPw('123456')`), `HUONG-DAN-SU-DUNG.md:67-73` | 8 tài khoản mẫu (`thanh.nv`, `huong.tt`, …) dùng `123456`, **không** bắt buộc đổi (`must_change_pw=0`; đã kiểm tra `thanh.nv` cho `must_change_pw=false` **[CHẠY THẬT]**) | Mọi bản chạy dữ liệu mẫu: Node mặc định khi không đặt `NO_DEMO=1`, Cloudflare khi `SO_DEMO=1` | **Cao** nếu bản trình diễn công khai, vì `thanh.nv` là Giám đốc có quyền duyệt. Bằng 0 nếu không bao giờ bật dữ liệu mẫu ở môi trường thật |
| 3 | `wrangler.jsonc:29` | `ADMIN_PASSWORD_HASH` = mã băm scrypt của mật khẩu ban đầu, công khai trên GitHub | Admin trên Cloudflare, mỗi khi `must_change_pw=1` | **Trung bình → Cao.** Có thể dò ngoại tuyến không giới hạn số lần thử. scrypt N=2^14 làm chậm nhưng không ngăn được nếu mật khẩu yếu hoặc có quy luật. Nghiêm trọng hơn, mã băm này **có hiệu lực trở lại** mỗi khi tài khoản `admin` bị đặt lại mật khẩu, xem II.7 |
| 4 | Bí mật `ADMIN_PASSWORD` (trang quản trị Cloudflare, `TRIEN-KHAI-CLOUDFLARE.md:43`; được đọc ở `do-core.js:19`, `server.js:813`, `db.js:347`) | Mật khẩu gốc | Admin Cloudflare | Thấp về lộ lọt, vì không nằm trong kho mã. Nếu bí mật này có mặt thì nó được ưu tiên hơn mã băm, và **mỗi lần khởi động DO lại chạy thêm một lần scrypt** (đo được 60,7 ms CPU khi có bí mật, so với 16,5 ms khi không có) **[CHẠY THẬT]**. Chưa biết Worker được tạo lại lúc 10:43 ngày 05/11 có khai báo bí mật này hay không **[CHƯA KIỂM CHỨNG]** |
| 5 | `db.js:347` (bản Worker, không có `ADMIN_PASSWORD`) | Mật khẩu ngẫu nhiên 24 byte, không ai biết | Admin khi DO mới tạo | Không phải lỗ hổng. Thay vào đó là rủi ro không đăng nhập được nếu thiếu cả bí mật lẫn mã băm |
| 6 | `deploy/*`, `*.bat`, workflow | Không ghi cứng token. Token Tunnel nhập lúc chạy (`install.sh:4`, `Cai-dat-Cloudflare-Tunnel.bat:31`) | — | Thấp |

### II.7. Lỗi applyAdminSecret ghi đè mật khẩu (đã chạy thử)
- Mã ở `server.js:811-819`, được gọi ở mỗi lần khởi động DO (`do-core.js:24`): nếu `admin.must_change_pw = 1` thì ghi đè `pass_hash` bằng bí mật hoặc mã băm.
- Kịch bản đã chạy trên mô phỏng DO **[CHẠY THẬT]**:
  1. Admin đổi mật khẩu.
  2. Quản trị viên thứ hai `qt2` đặt lại mật khẩu cho `admin` (thao tác này đặt `must_change_pw=1`).
  3. DO khởi động lại.
  4. Kết quả: mật khẩu `qt2` vừa đặt bị **từ chối** (401), còn **mật khẩu ban đầu theo mã băm công khai lại đăng nhập được** (200).
- Hệ quả: mật khẩu ban đầu không bao giờ thực sự hết hiệu lực. Ngoài ra, mỗi lần khởi động mà admin chưa đổi mật khẩu, nếu dùng `ADMIN_PASSWORD` thì lại tốn thêm một lần scrypt.

### II.8. Phân quyền
- Có hai vai trò lưu trong CSDL: `role IN ('admin','user')`. Các tuyến `admin: true` kiểm tra `isAdmin` (`server.js:793`).
- Các quyền suy diễn từ cấu hình và cơ cấu tổ chức:
  - `isHR`: phòng nhân sự (`server.js:52`)
  - `isDirector` (`server.js:53`)
  - `canEditTask` (`server.js:55`)
  - `isPayroll` (`hr2.js:129`)
  - `isFinance`, `canPost`, `canManageAssets`, `canUpload` (`biz.js:86-89`, `:224`)
  - `lead`, `canRecruit` (`ext.js:66-69`)
- Kiểm tra quyền nằm rải rác trong từng tuyến, không có ma trận quyền tập trung. Đợt rà soát này chưa đánh giá từng tuyến **[CHƯA KIỂM CHỨNG]**.

### II.9. SSO / 2FA
Không có. Đã tìm `SSO|OAuth|TOTP|2FA|otp|saml|oidc` trong `server.js`, `db.js`, `public/app.js` và không thấy kết quả nào **[MÃ]**.

---

## III. LƯU TRỮ CƠ SỞ DỮ LIỆU

### III.1. Bản Node
- SQLite tệp qua `node:sqlite` (`db.js:15-26`), đường dẫn `${DATA_DIR:-./data}/smartoffice.db`. Cấu hình `PRAGMA journal_mode=WAL; foreign_keys=ON; busy_timeout=5000` (`db.js:25`). Giao dịch dùng `BEGIN/COMMIT/ROLLBACK` (`db.js:31-36`).
- Sao lưu: `GET /api/admin/backup` (`server.js:698-704`) chạy `VACUUM INTO` ra tệp tạm, truyền về rồi xóa. Đã chạy thử: tải về tệp 319.488 byte, mở đầu bằng `SQLite format 3` **[CHẠY THẬT]**. Tệp sao lưu chứa token phiên dạng rõ (II.2) và **không** chứa thư mục `data/files`.
- Khôi phục: thủ công, dừng máy chủ rồi chép đè tệp (`HUONG-DAN-SU-DUNG.md:146-148`). Chưa chạy thử khôi phục.

### III.2. Bản Cloudflare
- Lưu trong SQLite của Durable Object lớp `SmartOffice`, migration `new_sqlite_classes` (`wrangler.jsonc:15-18`). Toàn bộ hệ thống dùng **một** DO tên `"main"` (`worker/index.js:24`).
- `do-core.js:22` gắn `globalThis.__SO_SQL = makeSql(storage)`. `db.js:16` lấy giá trị này **một lần** vào hằng `db` ở phạm vi mô-đun. Đây chính là gốc của lỗi 500 (mục V).
- Lớp tương thích `worker/sqlite-shim.js`:
  - **Giao dịch:** `exec` chặn BEGIN/COMMIT/SAVEPOINT (`:36-37`). `tx()` (`db.js:32`) gọi `storage.transactionSync(fn)` (`:51`).
  - **PRAGMA:** bỏ qua `journal_mode|busy_timeout|synchronous|foreign_keys` (`:10`, `:33-34`). `PRAGMA table_info` vẫn được gọi (`db.js:161`) và có try/catch.
  - **VACUUM:** báo lỗi (`:31`).
  - **BLOB:** khi ghi, chuyển Uint8Array/Buffer sang ArrayBuffer (`:17`). Khi đọc, chuyển ArrayBuffer sang Uint8Array (`:20-22`).
  - **`run()`:** trả `changes: c.rowsWritten` và lấy `lastInsertRowid` bằng một truy vấn `SELECT last_insert_rowid()` riêng (`:43-48`).
  - **Nhiều câu lệnh:** `exec` chuyển nguyên khối nhiều câu lệnh cho `sql.exec` (`:37`).

### III.3. Khác biệt giữa mô phỏng (`test/fake-do.js`) và Durable Object thật
| Điểm | Mô phỏng | DO thật | Ảnh hưởng hiện tại |
|---|---|---|---|
| **Ngữ cảnh I/O theo từng DO** | Không có khái niệm này; đối tượng storage dùng được mãi | Storage gắn với một thể hiện DO; dùng từ thể hiện khác trong cùng isolate thì ném "Cannot perform I/O on behalf of a different Durable Object" [DỮ KIỆN] | **Đây là lỗi 500 thực tế.** Kiểm thử khói chỉ tạo 1 thể hiện nên không thể phát hiện |
| `rowsWritten` và `changes` | Gán bằng `changes` của node:sqlite (`fake-do.js:17`) | Là số dòng ghi phục vụ tính cước, có thể gồm cả ghi chỉ mục [CHƯA KIỂM CHỨNG] | Hiện không mã nào đọc `.changes` (đã grep, không có kết quả), nên chưa ảnh hưởng |
| Nhiều câu lệnh | Tách theo `;` + xuống dòng, chạy các câu đầu bằng `db.exec` (`fake-do.js:13-14`) | `sql.exec` tự xử lý nhiều câu lệnh [CHƯA KIỂM CHỨNG chi tiết] | Lược đồ khởi tạo chạy được trên thật [DỮ KIỆN: đăng nhập thành công] |
| Khóa ngoại | Bật `PRAGMA foreign_keys=ON` (`fake-do.js:5`) | Theo tài liệu Cloudflare luôn bật [CHƯA KIỂM CHỨNG] | Tương đương bản Node |
| Giới hạn 2 MB mỗi dòng/chuỗi/BLOB | Không mô phỏng | Có | Khối tệp 1 MB nằm trong giới hạn. Các trường văn bản đều cắt bằng `str()`. Chưa thấy trường nào vượt |
| Giới hạn tham số và độ dài câu lệnh | Không mô phỏng | Có (khoảng 100 tham số/câu theo tài liệu [CHƯA KIỂM CHỨNG]) | Câu có nhiều tham số nhất là `payroll_lines` với 37 tham số (`hr2.js:120`). Riêng `IN (...)` động (`hr2.js:134,159`, `ext.js:70,211`) có thể vượt nếu danh sách người lớn [MÃ] |
| Giới hạn CPU và bộ nhớ (128 MB) | Không mô phỏng | Có; mức trên gói Free [CHƯA KIỂM CHỨNG] | Xem V.4 |
| Lồng `transactionSync` | Gọi thẳng `fn()` | [CHƯA KIỂM CHỨNG] | `FILES.put` có `tx` nhưng không lồng trong `tx` khác |
| Bộ nhớ đệm mô-đun esbuild | Kiểm thử chạy trực tiếp bằng `require` của Node | Wrangler đóng gói bằng esbuild | Với esbuild 0.28.2, mô-đun lỗi được đặt lại (`throw mod = 0, e`). Với ngữ nghĩa cũ (không đặt lại) thì lỗi khởi tạo sẽ "dính" vĩnh viễn trong isolate **[CHẠY THẬT]**, xem VI.5. Phiên bản esbuild của Workers Builds [CHƯA KIỂM CHỨNG] |

### III.4. Sao lưu và khôi phục trên Cloudflare
- `GET /api/admin/backup` trả 400 kèm thông báo "Durable Objects sao lưu tự động… 30 ngày… liên hệ đơn vị cung cấp dịch vụ" (`server.js:699`) **[CHẠY THẬT]**.
- Ứng dụng **không có** mã gọi API khôi phục theo thời điểm của DO. Theo hiểu biết của kiểm toán viên, khôi phục được thực hiện qua `ctx.storage.getBookmarkForTime()` / `onNextSessionRestoreBookmark()` trong mã, không có nút bấm trên trang quản trị **[CHƯA KIỂM CHỨNG]**. Vì vậy câu "liên hệ đơn vị cung cấp dịch vụ" hiện không có quy trình nào đứng sau.
- **Xóa Worker hoặc lớp DO thì mất toàn bộ dữ liệu, PITR không cứu được.** Điều này đã thực sự xảy ra lúc 10:11 ngày 05/11/2026 [DỮ KIỆN].
- Không có chức năng xuất toàn bộ dữ liệu ra ngoài Cloudflare (dạng SQL hoặc JSON). Hiện chỉ xuất được hai tệp CSV (`server.js:710-725`).

---

## IV. LƯU TRỮ TỆP ĐÍNH KÈM

- Mã ở `biz.js:10-27`, đối tượng `FILES` có các thao tác `put`, `read`, `del`.
- **Bản Node:** ghi đĩa tại `<DATA_DIR>/files/<16 byte ngẫu nhiên hex><phần mở rộng>`, gọi `fs.writeFileSync` (`biz.js:19-26`). Đã kiểm tra có tệp 2.621.440 byte trong `data-empty2/files` **[CHẠY THẬT]**.
- **Bản Cloudflare:** lưu trong bảng `file_chunks(stored_name, seq, data BLOB)` (`biz.js:12`), chia khối `CHUNK = 1 MB` (`:13`), ghi trong `tx` (`:15`). Khi đọc thì ghép lại toàn bộ vào bộ nhớ (`:16`). Mô phỏng cho 2,5 MB → 3 khối; 19,9 MB → 20 khối, khối lớn nhất 1.048.576 byte **[CHẠY THẬT]**.
- **Không dùng R2/S3.**
- **Giới hạn:** tối đa 20 MB sau khi giải mã base64 (`biz.js:260`). Thân JSON của `/api/docs` tối đa 30e6 byte, các API khác 5e6 byte (`server.js:795`). Kết quả chạy thử **[CHẠY THẬT]**:

| Kích thước | Bản Node (cổng 3997) | Mô phỏng DO |
|---|---|---|
| 2,5 MB | 200, tải về khớp từng byte | 200, khớp |
| 19,9 MB | — | 200, khớp (333 ms) |
| 20,5 MB | 400 "Tệp đính kèm tối đa 20 MB" | 400 |
| 23 MB | — | 413 "Dữ liệu gửi lên quá lớn" |
| 25 MB | **Ngắt kết nối (ECONNRESET), không có phản hồi JSON**; máy chủ vẫn sống (healthz 200) | — |

- Rủi ro:
  1. Tệp chiếm dung lượng SQLite của DO, làm DO phình to. Không truyền theo luồng: một yêu cầu 20 MB cần khoảng 28 MB base64 + chuỗi JSON + Buffer 20 MB nằm cùng lúc trong bộ nhớ, so với giới hạn 128 MB của isolate **[MÃ, CHƯA KIỂM CHỨNG trên thật]**.
  2. Ghi tệp và ghi bản ghi `doc_items` không nằm chung một giao dịch (`biz.js:264` so với `:270-271`), nên có thể để lại khối tệp mồ côi. Khi cập nhật, tệp cũ bị xóa **trước** khi ghi bản ghi mới (`biz.js:280`).
  3. Bản Node trả lỗi kém thân thiện (ECONNRESET) khi vượt 30e6 byte (`server.js:775`).
  4. `Content-Type` tải về lấy từ giá trị người dùng gửi lên (`biz.js:246`). Đã có `attachment` và `nosniff` giảm thiểu nên rủi ro thấp.
  5. Sao lưu bản Node không kèm thư mục tệp.

---

## V. TÌNH TRẠNG TRIỂN KHAI THẬT VÀ PHÂN TÍCH LỖI 500

### V.1. Dữ kiện được cung cấp (kiểm toán viên không tự kiểm chứng)
- Worker `smart-office` được Workers Builds triển khai tự động từ GitHub, địa chỉ `https://smart-office.thunv-it.workers.dev`.
- 10:11 ngày 05/11/2026: Worker đầu tiên bị xóa, mất CSDL (chỉ có tài khoản admin). 10:43: Worker được tạo lại.
- Sáng 06/11/2026: admin đăng nhập bằng mật khẩu ban đầu, `/api/bootstrap` và `/api/dashboard` trả 200. Sau đó `PUT /api/me/password` trả 500, `/api/bootstrap` trả 500 nhiều lần. Khoảng 07:50 trở lại 200, admin vẫn `must_change_pw=true`.
- Hai lần đẩy mã: 07:42 (`eec5000`, chuyển sang `ADMIN_PASSWORD_HASH`) và 07:49 (`e79ef92`, bật `SO_DEBUG`). Giờ commit lấy từ `git log` (00:42 và 00:49 UTC).
- **Dữ kiện mới lúc 07:57 ngày 06/11/2026** (nhờ `SO_DEBUG=1`): `POST /api/login` trả 500 với chi tiết:
  > `Error: Cannot perform I/O on behalf of a different Durable Object. I/O objects … created in the context of one Durable Object cannot be accessed from a different Durable Object in the same isolate. (I/O type: ActorCacheInterface) at execOne … at Object.get … at route.public [as handler] … at Object.handle`
- Chưa có dữ liệu nghiệp vụ thật. Chưa có bản nào chạy trên máy chủ riêng hoặc qua Cloudflare Tunnel.

**Kết luận về triển khai:** có một bản Cloudflare đang chạy công khai (thử nghiệm), nhưng **chưa ổn định và chưa đủ điều kiện dùng thật** vì lỗi V.2.

### V.2. Nguyên nhân lỗi 500: ĐÃ XÁC MINH
**Cơ chế** (đối chiếu giữa mã và stack trace ngày 07:57):
1. `worker/index.js:13-15`: mỗi thể hiện `SmartOffice` gọi `core.createApp(this.ctx.storage, this.env)`.
2. `worker/do-core.js:12-14`: `APP` là biến **phạm vi isolate**. Từ lần gọi thứ hai, hàm `return APP` ngay và bỏ qua `storage` mới.
3. `do-core.js:22` và `db.js:16`: `db` được gắn **một lần** với `makeSql(storage_của_DO_đầu_tiên)`. `sqlite-shim.js:26` giữ `storage.sql` cũ trong closure.
4. Cloudflare có thể hủy thể hiện DO (ví dụ khi nhàn rỗi bị đẩy khỏi bộ nhớ, hoặc khi DO bị đặt lại) rồi tạo thể hiện mới **trong cùng isolate**. Thể hiện mới chạy mã với storage cũ, nên mọi truy vấn ném lỗi I/O khác DO ngay từ `userFromReq` hoặc handler đăng nhập. Lỗi được `handle` bắt (`server.js:798-801`) và trả JSON 500.
5. Lỗi kéo dài cho đến khi isolate bị thay. Lần triển khai lúc 07:49 tạo isolate mới, giải thích việc trở lại 200 lúc khoảng 07:50. Lỗi tái diễn lúc 07:57 cho thấy nó **không phụ thuộc vào việc triển khai** mà xuất hiện lại theo chu kỳ hủy/tạo DO.

**Giải thích các quan sát:**
- `PUT /api/me/password` trả 500 và `must_change_pw` vẫn bằng `true`: lỗi xảy ra ngay ở bước đọc phiên hoặc đọc `pass_hash`, câu `UPDATE` ở `server.js:112` **chưa bao giờ chạy**. Đây là suy luận khớp cơ chế; chi tiết riêng của yêu cầu PUT không có stack trace.
- Có thể có thêm vài phản hồi lỗi ngay lúc triển khai (07:42 hoặc 07:49) do DO bị đặt lại khi mã đổi. Đây là yếu tố phụ, không giải thích được chuỗi 500 kéo dài.

**Tái hiện cục bộ** **[CHẠY THẬT]**, xem VI.4: chạy bản đóng gói esbuild của `worker/index.js` dưới Node, tạo DO#1 và DO#2 với hai storage khác nhau trong cùng "isolate".
- DO#2 đọc dữ liệu của DO#1: `must_change_pw=false` dù storage của DO#2 là CSDL trống.
- Khi storage cũ bị vô hiệu thì `/api/bootstrap` và `/api/login` trả 500 liên tục, stack trace `execOne → get → userFromReq → handle`, trùng với stack trace thật.

**Kịch bản này do kiểm toán viên viết sau khi đã nghi vấn mã. Bài kiểm thử sẵn có `test/worker-smoke.js` và CI `kiem-tra.yml` không phát hiện được lỗi vì:**
- Chỉ tạo **một** thể hiện storage.
- `fake-do.js` không mô phỏng ràng buộc ngữ cảnh I/O theo từng DO.
- Bước đổi mật khẩu gọi sai đường dẫn `POST /api/account/password` (`test/worker-smoke.js:18`) nên trả 404 mà vẫn bị coi là đạt. CI chỉ kiểm tra chuỗi `download 200 true`.

### V.3. Các giả thuyết đã nêu trước: đánh giá lại
| Giả thuyết | Đánh giá |
|---|---|
| H1. Biến toàn cục `APP` / `__SO_SQL` dùng storage của DO cũ | **Đã xác minh** bằng [DỮ KIỆN] 07:57 và tái hiện [CHẠY THẬT] |
| H2. Vượt giới hạn CPU gói Free (đổi mật khẩu tốn 2 lần scrypt, khoảng 75–87 ms CPU trên máy rà soát) | Không phải nguyên nhân của lỗi đã ghi nhận (lỗi I/O, không phải `exceededCpu`). **Vẫn là rủi ro tiềm ẩn**: chưa biết mức CPU áp dụng cho DO ở gói Free và tốc độ scrypt trên workerd [CHƯA KIỂM CHỨNG]. Tài liệu của chính dự án đã khuyến nghị gói Paid (`TRIEN-KHAI-CLOUDFLARE.md:61`) |
| H3. Triển khai lại giữa chừng làm DO khởi động lại | Chỉ có thể gây lỗi đơn lẻ tại thời điểm triển khai; không giải thích được lỗi lúc 07:57 |
| H4. Khác biệt shim và DO thật trong các câu lệnh SQL | Đường đi đổi mật khẩu chạy qua bản đóng gói và shim trả 200 [CHẠY THẬT trên mô phỏng]. Không có bằng chứng lỗi SQL |
| H5. Bộ nhớ đệm mô-đun esbuild giữ mô-đun khởi tạo dở | Không phải nguyên nhân lần này. Là rủi ro thật nếu phiên bản esbuild của wrangler không đặt lại mô-đun lỗi: khi đó mọi yêu cầu sau ném `APP.applyAdminSecret is not a function`, rồi `app.handle is not a function` [CHẠY THẬT với biến thể ngữ nghĩa cũ]. Ngoài ra `do-core.js:23-24` gán `APP` trước khi `applyAdminSecret` chạy xong, nên nếu bước đó ném lỗi thì `APP` vẫn bị giữ |

### V.4. Lưu ý cho bản sửa đang làm ở phiên chính (chỉ nhận xét, không sửa kho)
- Cập nhật storage hiện hành mỗi lần `fetch` là đúng hướng. Phải bảo đảm **mọi** đường truy cập CSDL đều lấy storage qua hàm: `db` trong `db.js:16`, `transactionSync` trong shim (`:51`), và `D.db.exec` gọi trực tiếp ở `biz.js:12,29`, `ext.js:8` (các lệnh này chạy lúc nạp mô-đun).
- Nên đặt `APP = null` nếu `createApp` ném lỗi, và chỉ gán `APP` sau khi `applyAdminSecret` thành công.
- Lược đồ chỉ tạo khi nạp mô-đun. Isolate mới với DO mới vẫn ổn, vì mô-đun được nạp lại.
- Thêm kiểm thử hồi quy: mô phỏng storage gắn "chủ sở hữu" (ném lỗi nếu dùng sau khi thể hiện khác được tạo), tạo hai thể hiện DO liên tiếp, gọi login/bootstrap/PUT password. Kiểm thử phải **thất bại** trên commit `e79ef92`.

### V.5. Cách xác minh trên Cloudflare sau khi sửa
1. Xem Workers Logs (`observability.enabled = true`, `wrangler.jsonc:39`) quanh các mốc 07:43–07:50 và 07:57 ngày 06/11: tìm dòng `console.error` từ `server.js:800` và trường outcome (`exception`, `exceededCpu`).
2. Sau khi triển khai bản sửa: đăng nhập, chờ hơn 2–3 phút không thao tác (để DO bị đẩy khỏi bộ nhớ), rồi gọi lại `/api/bootstrap`. Lặp vài lần trong ngày. Tiêu chí: không có lỗi 500.
3. Đổi mật khẩu admin, xác nhận `must_change_pw=false`, sau đó tắt `SO_DEBUG`.
4. Theo dõi chỉ số CPU time ở trang Metrics của Worker cho các yêu cầu `/api/login` và `/api/me/password`.

---

## VI. KẾT QUẢ CHẠY THỬ CỤC BỘ

Mã nguồn được sao sang thư mục tạm `.../scratchpad/audit/src`, mỗi lần chạy dùng `DATA_DIR` riêng. Các kịch bản tự viết được lưu tại `docs/05-ra-soat/2026-11-06-kich-ban-kiem-thu/`.

### VI.1. `node test/worker-smoke.js`: chạy được, thoát với mã 0
```
healthz ok
login 200 true Quản trị hệ thống
bootstrap 200 admin users 1 ...
change pw 404 {"error":"Không tìm thấy chức năng."}     <- sai đường dẫn, vẫn bị coi là đạt
upload 200 {"id":1}
download 200 true attachment; filename="quy-che.pdf" ...
backup 400 {"error":"Trên Cloudflare, dữ liệu được Durable Objects sao lưu tự động ..."}
evil origin 403
csv 200 text/csv; charset=utf-8 127
check-in 200
```

### VI.2. `node test/worker-smoke.js demo`: chạy được
- `trang.pt/123456` đăng nhập 200, có 9 người dùng.
- Tải lên và tải về 2,5 MB khớp.
- `backup` trả 403 (không phải admin), origin lạ trả 403.

### VI.3. Bản Node qua HTTP thật (cổng 3997 với CSDL trống, cổng 3996 với dữ liệu mẫu)
| Kiểm thử | Kết quả |
|---|---|
| `admin/Admin@123` | 200; cookie `HttpOnly; SameSite=Lax; Path=/; Max-Age=604800` (HTTP nên không có Secure) |
| Gọi `/api/admin/users` khi chưa đổi mật khẩu | **200** (máy chủ không chặn) |
| `PUT /api/me/password` | 200 (86,6 ms) |
| Phiên B tạo trước khi đổi mật khẩu | **vẫn 200** (không thu hồi) |
| Đăng nhập mật khẩu cũ / mới | 401 / 200 |
| Dùng lại cookie sau đăng xuất | 401 |
| POST với Origin lạ | 403 |
| 7 lần sai, sau đó nhập mật khẩu đúng | 7 × 401, rồi **200** (khóa không hoạt động) |
| Thời gian: tên không tồn tại / tồn tại | khoảng 2 ms / khoảng 40 ms |
| Tệp 2,5 / 20,5 / 25 MB | 200 khớp / 400 / ECONNRESET (máy chủ vẫn sống) |
| Sao lưu | 200, tệp SQLite 319.488 byte |
| Bảng `sessions` | token 64 ký tự dạng rõ |
| Dữ liệu mẫu `thanh.nv`, `huong.tt`, `trang.pt`, `mai.bt` / `123456` | 200; `must_change_pw=false` |

### VI.4. Mô phỏng DO bằng `do-core.js` và `fake-do.js` (kịch bản `tests/do-auth.js`, `tests/do-override.js`)
- Đăng nhập bằng mã băm ban đầu: 200. `PUT /api/me/password`: sai mật khẩu cũ → 400; mật khẩu yếu → 400; hợp lệ → 200 (75,6 ms). Sau đó `must_change_pw=false`.
- Phiên B cũ vẫn 200. Đăng xuất thì cookie mất hiệu lực. 6 lần sai rồi nhập đúng vẫn 200.
- Tiến trình mới trên cùng CSDL (mô phỏng DO khởi động lại): 5 lần sai rồi nhập đúng vẫn 200.
- Tệp 2,5 / 19,9 / 20,5 / 23 MB: 200 / 200 / 400 / 413; số khối lần lượt 3 và 20, khối lớn nhất 1 MiB.
- Ghi đè bởi applyAdminSecret: xem II.7, mật khẩu ban đầu đăng nhập lại được.
- CPU (`tests/cpu.js`, máy 2 nhân):

| Thao tác | CPU |
|---|---|
| scrypt, trung bình | 36,4 ms |
| `createApp` lần đầu (CSDL trống) | 75,9 ms |
| Khởi động lại, không có `ADMIN_PASSWORD` | 16,5 ms |
| Khởi động lại, có `ADMIN_PASSWORD` | 60,7 ms |

### VI.5. Bản đóng gói esbuild 0.28.2 của `worker/index.js` chạy dưới Node (thư mục `bundle/`)
- Đóng gói với `--format=esm --platform=neutral`, để ngoài `cloudflare:workers` và các mô-đun Node. Cách này **gần đúng, không phải đúng y cấu hình của wrangler**, vì wrangler có plugin nodejs_compat riêng.
- **Hai thể hiện DO trong cùng isolate** (`run-bundle.mjs`):
  - DO#1: đăng nhập, đổi mật khẩu, bootstrap đều 200.
  - DO#2 với storage mới: bootstrap 200 nhưng đọc dữ liệu của DO#1 (`must_change_pw=false`).
  - Vô hiệu storage cũ: bootstrap và login của DO#2 trả **500 liên tục**, stack trace `execOne → get → userFromReq → handle`. Tái hiện đúng lỗi thật.
- **Lỗi tạm thời khi khởi tạo** (`run-initfail.mjs`):
  - esbuild 0.28.2: lần 1 ném lỗi, lần 2 và 3 hồi phục (401 bình thường).
  - Biến thể không đặt lại mô-đun: lần 2 ném `APP.applyAdminSecret is not a function`, lần 3 ném `app.handle is not a function`, tức hỏng vĩnh viễn trong isolate.

### VI.6. Chưa kiểm chứng được
- Chạy trên workerd thật (`wrangler dev`) và trên Cloudflare.
- Mức CPU thực tế cho DO ở gói Free; tốc độ scrypt trên workerd.
- PITR thực tế.
- Giới hạn 2 MB/dòng và giới hạn tham số trên DO thật.
- Phiên bản esbuild mà Workers Builds dùng.
- Bí mật `ADMIN_PASSWORD` hiện có được khai báo hay không.
- Khôi phục từ tệp sao lưu của bản Node.

---

## VII. KẾ HOẠCH HOÀN THIỆN

Ước lượng công tính theo ngày-người (ngày công) của một lập trình viên đã quen mã nguồn.

### P0: bắt buộc trước khi dùng dữ liệu thật
| # | Nội dung | Tệp cần sửa | Tiêu chí nghiệm thu | Công |
|---|---|---|---|---|
| P0-1 | **Sửa lỗi storage của DO cũ**: storage hiện hành lấy qua hàm và cập nhật mỗi lần `fetch` hoặc mỗi khi tạo thể hiện; `APP` đặt về null khi khởi tạo lỗi | `worker/do-core.js`, `worker/sqlite-shim.js`, `worker/index.js`, có thể cả `db.js` | Kiểm thử hai thể hiện DO liên tiếp đạt; trên Cloudflare không còn lỗi 500 sau nhiều chu kỳ nhàn rỗi trong 48 giờ | 0,5–1 |
| P0-2 | **Sửa kiểm thử**: đổi sang `PUT /api/me/password`; kiểm thử trả mã thoát khác 0 khi có bước sai mã trạng thái; thêm ca hai thể hiện DO; `fake-do.js` mô phỏng ràng buộc ngữ cảnh I/O | `test/worker-smoke.js`, `test/fake-do.js`, `.github/workflows/kiem-tra.yml` | CI thất bại trên `e79ef92` và đạt sau P0-1 | 0,5 |
| P0-3 | **Tắt `SO_DEBUG`** ngay sau khi chẩn đoán xong; chi tiết lỗi chỉ ghi vào nhật ký, không trả về trình duyệt | `wrangler.jsonc:25` | Phản hồi 500 không chứa `detail` | 0,1 |
| P0-4 | **Sửa khóa đăng nhập sai** và lưu bền vững trong bảng `login_attempts` (tên, IP, số lần, thời điểm khóa); khóa theo tài khoản và theo IP riêng; có dọn dẹp định kỳ | `server.js:66-92`, `db.js` (lược đồ) | 5 lần sai thì trả 429 trong 5 phút, kể cả sau khi DO hoặc tiến trình khởi động lại; đổi IP không né được khóa theo tài khoản | 0,5–1 |
| P0-5 | **Thu hồi phiên khi đổi mật khẩu**: xóa mọi phiên khác của người dùng, cấp lại phiên hiện tại | `server.js:107-114` | Phiên cũ trả 401 sau khi đổi mật khẩu | 0,2 |
| P0-6 | **Máy chủ ép đổi mật khẩu**: khi `must_change_pw=1` chỉ cho phép `/api/bootstrap`, `/api/me/password`, `/api/logout` | `server.js:791-793` | Các API khác trả 403 khi chưa đổi mật khẩu | 0,3 |
| P0-7 | **Mật khẩu ban đầu an toàn hơn**: (a) chỉ áp dụng `ADMIN_PASSWORD(_HASH)` **một lần**, có cờ trong `settings` (ví dụ `admin_bootstrapped=1`), không ghi đè lại khi `must_change_pw=1`; (b) bỏ `ADMIN_PASSWORD_HASH` khỏi `wrangler.jsonc` và khỏi lịch sử công khai, dùng bí mật hoặc mã dùng một lần có hạn; (c) bản Node sinh mật khẩu ngẫu nhiên in ra màn hình thay cho `Admin@123` | `server.js:811-819`, `db.js:347`, `wrangler.jsonc:29`, `README.md`, `HUONG-DAN-SU-DUNG.md`, CI | Kịch bản II.7 cho kết quả "mật khẩu ban đầu bị từ chối"; trong kho không còn mã băm hoặc mật khẩu admin | 0,5–1 |
| P0-8 | **Dữ liệu mẫu**: bảo đảm `SO_DEMO` trống ở môi trường thật; nếu bản trình diễn công khai thì tài khoản mẫu phải đổi mật khẩu hoặc dùng mật khẩu ngẫu nhiên | `db.js:211`, `wrangler.jsonc:21` | Không đăng nhập được bằng `123456` trên môi trường thật | 0,2 |
| P0-9 | **Sao lưu / xuất dữ liệu trên Cloudflare**: API quản trị xuất toàn bộ bảng (JSON hoặc SQL, kèm tệp) và lịch xuất định kỳ ra nơi lưu ngoài (R2 hoặc tải về); viết và diễn tập quy trình khôi phục PITR có mã hỗ trợ (bookmark); ghi rõ cảnh báo "xóa Worker là mất dữ liệu" | `server.js:698-704`, `worker/index.js`, tài liệu | Xuất rồi nhập lại vào DO mới cho kết quả trùng khớp; diễn tập PITR thành công trên môi trường thử | 2–3 |
| P0-10 | **Gói Cloudflare / CPU**: hoặc nâng **Workers Paid** (khuyến nghị, khớp `TRIEN-KHAI-CLOUDFLARE.md:61`), hoặc đo CPU thực của scrypt trên workerd và cân nhắc giảm chi phí băm. Nếu giảm thì phải ghi tham số vào chuỗi băm và nâng cấp dần khi người dùng đăng nhập; không giảm dưới mức khuyến nghị OWASP | `db.js:39-51`, `wrangler.jsonc` (`limits.cpu_ms` nếu có gói Paid) | Đăng nhập và đổi mật khẩu không bị lỗi CPU trong 100 lần thử liên tiếp | 0,5 + chi phí gói |
| P0-11 | **Kiểm thử trên workerd thật** (`wrangler dev` / Miniflare) trong CI cho luồng đăng nhập, đổi mật khẩu, tải tệp 2,5 MB và tình huống DO bị đẩy khỏi bộ nhớ | `.github/workflows/kiem-tra.yml`, `package.json` | CI chạy `wrangler dev` và kịch bản HTTP đạt | 1–1,5 |
| P0-12 | **Pháp lý về nơi lưu dữ liệu**: dữ liệu nhân sự, lương, CCCD là dữ liệu cá nhân (có phần nhạy cảm). Cần **bộ phận pháp chế xác định** nghĩa vụ theo Luật Bảo vệ dữ liệu cá nhân 2025, Nghị định 356/2025/NĐ-CP và Luật An ninh mạng 116/2025/QH15: lưu trữ trong nước, chuyển dữ liệu ra nước ngoài, đánh giá tác động, thông báo. Báo cáo này **không khẳng định** nội dung cụ thể của các điều luật. Durable Object có thể được ghim vùng (jurisdiction/location hint), nhưng không có vùng Việt Nam [CHƯA KIỂM CHỨNG] | Tài liệu; có thể ảnh hưởng chọn phương án Cloudflare hay máy chủ trong nước | Có văn bản kết luận của pháp chế trước khi nhập dữ liệu thật | ngoài phạm vi kỹ thuật |

### P1: nên làm trong giai đoạn thí điểm
| # | Nội dung | Tệp | Tiêu chí | Công |
|---|---|---|---|---|
| P1-1 | Lưu **mã băm SHA-256 của token** trong `sessions` thay cho token rõ | `server.js:68-75,93-96,100-103` | CSDL không chứa token dùng được | 0,3 |
| P1-2 | Chống dò tên tài khoản: chạy scrypt giả khi không có người dùng | `server.js:86-87` | Chênh lệch thời gian dưới 5 ms | 0,1 |
| P1-3 | Thời gian chờ khi không hoạt động, gia hạn phiên trượt; trang "các phiên đang mở" để tự thu hồi | `server.js`, `public/app.js` | — | 1 |
| P1-4 | **Chuyển tệp sang R2** cho bản Cloudflare (ký URL hoặc truyền theo luồng); DO chỉ giữ siêu dữ liệu; đưa ghi tệp và bản ghi vào cùng luồng xử lý; dọn khối tệp mồ côi | `biz.js:10-27,255-290`, `wrangler.jsonc` (binding R2), `worker/` | Tệp 20 MB tải lên và tải về được, bộ nhớ DO không tăng tương ứng | 2 |
| P1-5 | Bản Node: trả 413 dạng JSON thay cho ngắt kết nối; tải lên theo multipart hoặc luồng | `server.js:766-779`, `public/` | Tệp 25 MB trả 413 rõ ràng | 0,5 |
| P1-6 | Bản Node: sao lưu kèm thư mục `files` (tệp nén) và tài liệu khôi phục có diễn tập | `server.js:698-704`, `HUONG-DAN-SU-DUNG.md` | Khôi phục thành công trên máy khác | 1 |
| P1-7 | Chính sách mật khẩu thống nhất (tối thiểu 10–12 ký tự, chặn mật khẩu phổ biến) cho cả mật khẩu do quản trị viên đặt | `server.js:111,633,643,670` | — | 0,3 |
| P1-8 | Nhật ký an ninh: đăng nhập thành công/thất bại, đổi mật khẩu, thao tác quản trị (hiện `activity` chỉ ghi nghiệp vụ) | `server.js`, `db.js` | Truy vết được ai đăng nhập lúc nào, từ IP nào | 0,5 |
| P1-9 | Chặn `IN (...)` vượt giới hạn tham số của DO (chia lô) | `hr2.js:134,159`, `ext.js:70,211` | Kiểm thử với 200 người dùng đạt trên workerd | 0,3 |
| P1-10 | Chỉ giữ một cơ chế triển khai (Workers Builds **hoặc** GitHub Actions) | `.github/workflows/trien-khai-cloudflare.yml` | — | 0,1 |

### P2: phát triển tiếp
| # | Nội dung | Tệp | Công |
|---|---|---|---|
| P2-1 | **2FA (TOTP)** cho quản trị viên và tài khoản tài chính/nhân sự; tùy chọn SSO (OIDC/SAML) hoặc Cloudflare Access trước trang quản trị | `server.js`, `db.js`, `public/app.js` | 2–4 |
| P2-2 | **Tách Durable Object theo đơn vị** (`idFromName(<mã đơn vị>)`) cho đa đơn vị; bỏ trạng thái mô-đun toàn cục, mỗi thể hiện DO có ngữ cảnh ứng dụng riêng (điều kiện tiên quyết là P0-1 làm triệt để) | `worker/*`, `db.js`, `server.js` và toàn bộ mô-đun dùng `D.db` | 5–10 |
| P2-3 | Ma trận phân quyền tập trung và kiểm thử phân quyền từng tuyến | `server.js`, `hr2.js`, `biz.js`, `ext.js` | 3 |
| P2-4 | Lưu tham số scrypt trong chuỗi băm, hỗ trợ nâng cấp thuật toán (ví dụ Argon2id khi nền tảng hỗ trợ) | `db.js` | 0,5 |
| P2-5 | Theo dõi vận hành: cảnh báo khi tỷ lệ 5xx tăng, xuất nhật ký (Logpush) | cấu hình Cloudflare | 1 |

**Thứ tự đề xuất:** P0-1 → P0-2 → P0-3 (ngay trong ngày) → P0-5, P0-6, P0-4, P0-7, P0-8 (khoảng 2–3 ngày công) → P0-10, P0-11 → P0-9 → P0-12 (song song, do pháp chế). Chỉ nhập dữ liệu thật sau khi hoàn thành toàn bộ P0.
