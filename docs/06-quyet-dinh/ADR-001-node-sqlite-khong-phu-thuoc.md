# ADR-001. Node.js, SQLite tích hợp, không phụ thuộc thư viện ngoài

- Ngày: 04/11/2026 (ghi lại ngày 06/11/2026)
- Trạng thái: Đang áp dụng

## Bối cảnh
Bản đầu tiên cần chạy được ngay trên máy tính Windows của đơn vị, cài đặt đơn giản (nhấp đúp tệp `.bat`), phục vụ trên 200 người dùng nội bộ.

## Quyết định
1. **Máy chủ:** Node.js ≥ 22.13, dùng `node:http`. Cơ sở dữ liệu SQLite qua mô-đun có sẵn `node:sqlite`.
2. **Không dùng thư viện npm** trong mã chạy.
3. **Giao diện:** SPA JavaScript thuần (`public/`), menu ngang, không framework.
4. **Băm mật khẩu:** `crypto.scryptSync`. Phiên đăng nhập dùng cookie `sid` lưu ở bảng `sessions`.

## Hệ quả
- **Ưu điểm:** cài đặt và sao lưu đơn giản (một tệp `data/smartoffice.db` cùng thư mục `data/files`); không có rủi ro chuỗi cung ứng npm.
- **Nhược điểm:** tự viết router và xác thực nên phải tự kiểm thử kỹ (xem báo cáo rà soát 06/11/2026); SQLite tệp không phù hợp chạy nhiều máy chủ.
- **Thay đổi cách làm:** muốn thêm thư viện phải lập ADR mới.
