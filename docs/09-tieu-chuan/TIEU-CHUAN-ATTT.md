# TIÊU CHUẨN AN TOÀN THÔNG TIN (ATTT)

- Ngày lập: 06/11/2026. Người lập: Tổng công trình sư (trợ lý AI), chờ chủ sở hữu phê duyệt.
- Phạm vi: toàn bộ mã nguồn, cấu hình triển khai và vận hành SmartOffice (bản Node.js và bản Cloudflare).
- Hiệu lực: mọi thay đổi mã từ ngày phê duyệt phải đáp ứng các yêu cầu **[BẮT BUỘC]**. Hiện trạng nào chưa đạt thì ghi vào lộ trình (Mục IV); không được làm tình trạng xấu thêm.

## I. Căn cứ và chuẩn tham chiếu

| STT | Căn cứ | Cách áp dụng | Tình trạng kiểm chứng |
|---|---|---|---|
| 1 | Luật An ninh mạng số 116/2025/QH15 (hiệu lực 01/7/2026) | Khung pháp lý bảo vệ an ninh mạng hệ thống thông tin | Đã tra cứu khi lập kế hoạch |
| 2 | Nghị định số 331/2026/NĐ-CP ngày 19/8/2026 về bảo vệ an ninh mạng đối với hệ thống thông tin (theo [tin của Bộ Công an](https://mps.gov.vn/chinh-sach-phap-luat/bai-viet/quy-dinh-moi-ve-bao-ve-an-ninh-mang-doi-voi-he-thong-thong-tin-1788941596)) | Xác định cấp độ hệ thống; yêu cầu tách biệt lôgic khi dùng chung hạ tầng đám mây | **Chưa đọc toàn văn**: chưa rõ ngày hiệu lực, chưa rõ điều khoản bãi bỏ Nghị định 85/2016/NĐ-CP. Chủ quản và pháp chế phải đối chiếu |
| 3 | Nghị định số 85/2016/NĐ-CP và Thông tư số 12/2022/TT-BTTTT (an toàn hệ thống thông tin theo cấp độ) | Tham khảo nhóm yêu cầu kỹ thuật theo cấp độ | Có thể đã bị thay thế bởi văn bản tại STT 2; **chưa kiểm chứng** |
| 4 | Luật Bảo vệ dữ liệu cá nhân năm 2025; Nghị định số 356/2025/NĐ-CP | Bảo vệ dữ liệu nhân sự, tiền lương, chấm công | Đã tra cứu; nghĩa vụ cụ thể **chưa kiểm chứng** |
| 5 | OWASP ASVS 4.0.3, mức 2 (Application Security Verification Standard) | Chuẩn kỹ thuật để kiểm tra mã: xác thực, phiên, kiểm soát truy cập, kiểm tra đầu vào, nhật ký | Chuẩn quốc tế công khai |
| 6 | OWASP Top 10 (2021) | Danh mục rủi ro tối thiểu phải phòng chống | Chuẩn quốc tế công khai |

**Định hướng cấp độ:** SmartOffice xử lý dữ liệu cá nhân của người lao động cho nhiều đơn vị khách hàng (dịch vụ dùng chung). Theo mô tả của Nghị định 331/2026/NĐ-CP tại STT 2, quy mô dự kiến có thể thuộc cấp độ 2 hoặc 3. **Dự án thiết kế theo yêu cầu của cấp độ 3.** Cấp độ chính thức do chủ quản xác định và cơ quan có thẩm quyền phê duyệt.

## II. Yêu cầu bắt buộc

Ký hiệu hiện trạng (căn cứ báo cáo rà soát 06/11/2026, `docs/05-ra-soat/`): ✅ đạt · ⚠️ một phần · ❌ chưa đạt.

### II.1. Xác thực và mật khẩu

| Mã | Yêu cầu | Hiện trạng |
|---|---|---|
| ATTT-01 | Mật khẩu chỉ lưu dạng băm có muối, thuật toán chậm (scrypt/argon2/PBKDF2 với tham số đủ mạnh). Không ghi mật khẩu, kể cả mật khẩu tạm, vào nhật ký hoặc phản hồi API | ✅ scrypt N=16384, muối 16 byte (`db.js:39-43`) |
| ATTT-02 | Không có tài khoản hay mật khẩu mặc định trên bất kỳ bản nào truy cập được từ Internet. Mật khẩu ban đầu chỉ có hiệu lực một lần và bắt buộc đổi | ❌ `ADMIN_PASSWORD_HASH` công khai; mật khẩu ban đầu có thể có hiệu lực trở lại (ADR-004) |
| ATTT-03 | Máy chủ bắt buộc đổi mật khẩu lần đầu: khi `must_change_pw=1` chỉ cho gọi API đổi mật khẩu và đăng xuất | ❌ chỉ chặn ở giao diện |
| ATTT-04 | Chính sách mật khẩu: tối thiểu 10 ký tự, có chữ và số; từ chối mật khẩu trùng tên đăng nhập | ⚠️ tối thiểu 8 ký tự (`server.js` route `PUT /api/me/password`) |
| ATTT-05 | Khóa tạm sau 5 lần sai trong 15 phút, theo cả tài khoản và IP. Bộ đếm lưu bền vững trong CSDL, không mất khi khởi động lại | ❌ lỗi logic khiến khóa không kích hoạt (`server.js:88`); bộ đếm chỉ nằm trong bộ nhớ |
| ATTT-06 | Phản hồi đăng nhập sai giống nhau về nội dung và thời gian, dù tài khoản có tồn tại hay không | ⚠️ cùng nội dung nhưng thời gian khác nhau (khoảng 2 ms so với 40 ms) |
| ATTT-07 | Hỗ trợ xác thực hai lớp (TOTP) cho vai trò quản trị, giám đốc, kế toán, nhân sự | ❌ chưa có (lộ trình P1) |

### II.2. Phiên đăng nhập

| Mã | Yêu cầu | Hiện trạng |
|---|---|---|
| ATTT-08 | Token phiên ngẫu nhiên tối thiểu 128 bit. Cookie có `HttpOnly`, `SameSite=Lax` trở lên, và `Secure` khi chạy HTTPS | ✅ 256 bit; cookie đạt (`server.js`) |
| ATTT-09 | Trong CSDL chỉ lưu giá trị băm SHA-256 của token phiên, không lưu token gốc | ❌ đang lưu token gốc |
| ATTT-10 | Thu hồi toàn bộ phiên của người dùng khi đổi mật khẩu, khi quản trị đặt lại mật khẩu, khi khóa tài khoản | ❌ |
| ATTT-11 | Thời hạn phiên tối đa 7 ngày; hết hạn khi không hoạt động 8 giờ đối với vai trò quản trị | ⚠️ có hạn 7 ngày; chưa có hạn theo thời gian không hoạt động |

### II.3. Kiểm soát truy cập

| Mã | Yêu cầu | Hiện trạng |
|---|---|---|
| ATTT-12 | Mặc định từ chối. Mọi route `/api/*` phải yêu cầu đăng nhập; route công khai khai báo `public: true` và được liệt kê trong tài liệu | ✅ cơ chế `route(..., { public })` |
| ATTT-13 | Kiểm tra quyền **tại máy chủ** cho từng đối tượng: chủ sở hữu, trưởng phòng, vai trò. Không dựa vào việc giao diện ẩn nút | ⚠️ đa số route có kiểm tra; chưa có kiểm thử tự động cho phân quyền |
| ATTT-14 | Đa đơn vị: mọi truy vấn phải giới hạn theo đơn vị. Có kiểm thử tự động cho thấy đơn vị A không đọc, sửa được dữ liệu của đơn vị B (yêu cầu tách biệt lôgic, Nghị định 331/2026/NĐ-CP) | Chưa áp dụng (hiện mới có một đơn vị) |

### II.4. Dữ liệu đầu vào, đầu ra

| Mã | Yêu cầu | Hiện trạng |
|---|---|---|
| ATTT-15 | Truy vấn SQL chỉ dùng tham số (`?`). Cấm ghép chuỗi dữ liệu người dùng vào câu SQL; tên cột hay tên bảng động phải lấy từ danh sách cho phép | ✅ theo rà soát; giữ nguyên |
| ATTT-16 | Mọi chuỗi đưa vào HTML phải qua `esc()`. Chuỗi HTML lưu sẵn (nhật ký hoạt động) chỉ được sinh ở máy chủ từ giá trị đã `esc()` | ✅ theo quy ước hiện tại; phải giữ nguyên |
| ATTT-17 | Có Content-Security-Policy: `default-src 'self'`; nguồn phông chữ chỉ cho phép fonts.googleapis.com và fonts.gstatic.com; không dùng mã nội tuyến mới | ❌ chưa có CSP |
| ATTT-18 | Kiểm tra kích thước, kiểu tệp tải lên ở máy chủ. Trả 413 khi quá giới hạn. Tệp tải về luôn có `Content-Disposition: attachment` và `X-Content-Type-Options: nosniff` | ⚠️ bản Node ngắt kết nối thay vì trả 413 với tệp lớn |
| ATTT-19 | Kiểm tra `Origin` với mọi yêu cầu ghi (chống CSRF), danh sách nguồn cho phép đặt qua `PUBLIC_ORIGINS` | ✅ |

### II.5. Bí mật, cấu hình, chuỗi cung ứng

| Mã | Yêu cầu | Hiện trạng |
|---|---|---|
| ATTT-20 | Không lưu bí mật trong kho mã: mật khẩu, token, khóa API, mã băm mật khẩu dùng thật. Bí mật đặt trong *Secrets* của Cloudflare hoặc biến môi trường | ❌ còn `ADMIN_PASSWORD_HASH` (ADR-004, P0) |
| ATTT-21 | Không có phụ thuộc npm trong mã chạy (ADR-001). Công cụ phát triển, kiểm thử phải cố định phiên bản | ✅ |
| ATTT-22 | Chế độ gỡ lỗi (`SO_DEBUG`) chỉ bật có thời hạn khi chẩn đoán; phản hồi lỗi mặc định không lộ ngăn xếp lời gọi (stack trace) | ⚠️ đang bật để chẩn đoán (06/11/2026), phải tắt |
| ATTT-23 | Header bảo mật: HSTS, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, `nosniff` | ✅ (`server.js`, `public/_headers`) |

### II.6. Nhật ký, giám sát, sao lưu, sự cố

| Mã | Yêu cầu | Hiện trạng |
|---|---|---|
| ATTT-24 | Ghi nhật ký an ninh: đăng nhập thành công/thất bại, khóa tài khoản, đổi hoặc đặt lại mật khẩu, thay đổi quyền, xuất dữ liệu, xóa dữ liệu. Nhật ký ghi thời điểm, người, IP; không ghi mật khẩu hay token | ⚠️ có nhật ký hoạt động nghiệp vụ; chưa có nhật ký an ninh riêng |
| ATTT-25 | Sao lưu: bản Node hằng ngày, giữ tối thiểu 30 ngày, có một bản ngoài máy chủ. Bản Cloudflare có chức năng xuất toàn bộ dữ liệu và có quy trình khôi phục đã diễn tập | ❌ bản Cloudflare chưa có chức năng xuất dữ liệu |
| ATTT-26 | Thao tác không thể hoàn tác trên hạ tầng (xóa Worker, đổi migration Durable Object) chỉ được làm theo yêu cầu bằng văn bản của chủ sở hữu, sau khi đã sao lưu | ⚠️ đã ghi trong `CLAUDE.md`; sự cố xóa Worker ngày 05/11/2026 |
| ATTT-27 | Quy trình xử lý sự cố: phát hiện → khoanh vùng → khắc phục → báo cáo trong 72 giờ khi lộ lọt dữ liệu cá nhân (theo quy định bảo vệ dữ liệu cá nhân, pháp chế xác nhận thời hạn) | ❌ chưa có tài liệu quy trình |

## III. Kiểm tra bắt buộc

1. **Mỗi thay đổi** liên quan đến xác thực, phiên, phân quyền, tải tệp phải kèm kiểm thử tự động cho cả trường hợp đúng và trường hợp bị từ chối.
2. **Trước khi mở bán dịch vụ:** kiểm thử xâm nhập độc lập theo OWASP ASVS mức 2; có hồ sơ đề xuất cấp độ và phương án bảo vệ được phê duyệt.
3. **Rà soát định kỳ hằng quý** theo bảng tại Mục II; kết quả lưu tại `docs/05-ra-soat/`.

## IV. Lộ trình khắc phục

Ưu tiên theo báo cáo rà soát 06/11/2026.

| Mức | Mã yêu cầu |
|---|---|
| P0, trước khi có dữ liệu thật | ATTT-02, 03, 05, 10, 20, 22, 25 (chức năng xuất dữ liệu) |
| P1, trước khi mở bán | ATTT-04, 06, 07, 09, 11, 13 (kiểm thử phân quyền), 17, 18, 24, 27 |
| P2, khi triển khai đa đơn vị | ATTT-14 và hồ sơ cấp độ theo Nghị định 331/2026/NĐ-CP |
