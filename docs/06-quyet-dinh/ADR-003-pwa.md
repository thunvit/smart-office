# ADR-003. Ứng dụng web cài đặt được (PWA)

- Ngày: 05/11/2026
- Trạng thái: Đang áp dụng

## Quyết định
1. **Thành phần:**
   - `public/manifest.webmanifest`: tên, biểu tượng, lối tắt Phê duyệt, Công việc, Chấm công, Nhắn tin;
   - `public/sw.js`: service worker;
   - `public/pwa.js`: đăng ký service worker, nút cài đặt, thanh báo mất kết nối, thông báo bản mới.
2. **Lưu đệm:**
   - vỏ ứng dụng (HTML, CSS, JS, biểu tượng) được lưu đệm;
   - dữ liệu `/api/` **không** lưu đệm, để tránh lộ dữ liệu khi nhiều người dùng chung thiết bị.
3. **Phát hành:** mỗi lần phát hành tăng `VERSION` trong `public/sw.js`; người dùng nhận thông báo "Đã có phiên bản SmartOffice mới".

## Hệ quả
- PWA chỉ hoạt động qua HTTPS hoặc `localhost`.
- Khi mất mạng chỉ xem được khung giao diện, không thao tác dữ liệu được.
