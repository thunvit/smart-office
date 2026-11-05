# SmartOffice – Văn phòng số

SmartOffice là phần mềm quản trị văn phòng số chạy trên trình duyệt và cài được như ứng dụng (PWA) trên điện thoại và máy tính. Phần mềm được thiết kế để cung cấp dưới hình thức dịch vụ tại `https://smartoffice.vnptninhbinh.com.vn`.

## Phân hệ

| Nhóm | Phân hệ |
|---|---|
| Tổng quan | Bảng điều hành cá nhân, hoạt động gần đây |
| Công việc | Công việc – Dự án, Quy trình, Mục tiêu – KPI |
| Phê duyệt | Đề xuất: nghỉ phép, tăng ca, công tác, giải trình, thanh toán… |
| Thông tin | Bảng tin, Nhắn tin, Lịch họp, Tài liệu, Đăng ký khách đến |
| Nhân sự | Hồ sơ nhân sự, Chấm công – Bảng công, Tiền lương, Tuyển dụng, Đào tạo, Đánh giá năng lực, Khen thưởng – Kỷ luật |
| Kinh doanh | Khách hàng (CRM), Thu chi – Ngân sách, Tài sản |
| Quản trị | Người dùng, phòng ban, tham số chấm công – tiền lương |

Các tham số tiền lương năm 2026 được cấu hình sẵn và chỉnh sửa được trong phần Quản trị:
- giảm trừ gia cảnh theo Nghị quyết 110/2025/UBTVQH15;
- biểu thuế TNCN 5 bậc;
- lương tối thiểu vùng theo Nghị định 293/2025/NĐ-CP;
- tỷ lệ đóng BHXH, BHYT, BHTN.

## Yêu cầu kỹ thuật

- Node.js 22.13 trở lên (dùng mô-đun `node:sqlite` có sẵn).
- Không cần cài thêm thư viện nào (`npm install` không bắt buộc).

## Chạy thử

```bash
node server.js            # dữ liệu mẫu, cổng 3000
NO_DEMO=1 node server.js  # cơ sở dữ liệu trống
```

Trên Windows: chạy `Khoi-dong-SmartOffice.bat`. Tài khoản quản trị mặc định là `admin` / `Admin@123`; hệ thống bắt buộc đổi mật khẩu ở lần đăng nhập đầu.

## Biến môi trường

| Biến | Ý nghĩa | Mặc định |
|---|---|---|
| `PORT` | Cổng HTTP | `3000` |
| `DATA_DIR` | Thư mục dữ liệu (CSDL, tệp đính kèm) | `./data` |
| `NO_DEMO` | `1` = khởi tạo dữ liệu trống | — |
| `TRUST_PROXY` | `1` = chạy sau Cloudflare/proxy: lấy IP thật, cookie `Secure`, HSTS | — |
| `PUBLIC_ORIGINS` | Địa chỉ công khai được phép gửi yêu cầu ghi, cách nhau bởi dấu phẩy | — |

## Triển khai

Xem [TRIEN-KHAI-CLOUDFLARE.md](TRIEN-KHAI-CLOUDFLARE.md) để triển khai qua Cloudflare Tunnel; tài liệu gồm các phần:
- tên miền;
- các bước trên Windows và Linux;
- cấu hình an toàn;
- cài PWA cho người dùng.

Hướng dẫn nghiệp vụ cho người dùng nằm tại [HUONG-DAN-SU-DUNG.md](HUONG-DAN-SU-DUNG.md).

## Cấu trúc mã nguồn

```
server.js        Máy chủ HTTP, xác thực, API lõi
db.js            Lược đồ CSDL, dữ liệu mẫu
hr2.js           Chấm công, tiền lương
biz.js           Bảng tin, lịch họp, tài liệu, CRM, thu chi, tài sản
ext.js           Tuyển dụng, nhắn tin, khách đến, khen thưởng – kỷ luật, đào tạo, đánh giá
public/          Giao diện (SPA thuần JavaScript), PWA: manifest, sw.js, pwa.js, icons
deploy/          Kịch bản triển khai Cloudflare Tunnel (Windows, Linux)
```

## Lưu ý bảo mật

Thư mục `data/` chứa dữ liệu thật và đã được loại khỏi kho mã (`.gitignore`). Không đưa cơ sở dữ liệu, tệp `.env` hoặc tệp chứng thực Cloudflare Tunnel lên kho mã.
