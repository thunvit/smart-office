# ADR-002. Triển khai trên Cloudflare Workers và Durable Objects, tự động từ GitHub

- Ngày: 05/11/2026
- Trạng thái: Đang áp dụng (thí điểm). Phương án dự phòng: Cloudflare Tunnel trước máy chủ của đơn vị (xem tài liệu triển khai, Phần B).

## Bối cảnh
Chủ sở hữu yêu cầu chạy trên Cloudflare và tự động triển khai khi đẩy mã lên GitHub. Tên miền `vnptninhbinh.com.vn` do VDC quản lý DNS, chưa nằm trên Cloudflare.

## Quyết định
1. **Worker `smart-office`** (`worker/index.js`):
   - giao diện và PWA phục vụ bằng Workers Static Assets từ `public/`;
   - `/api/*` và `/healthz` chuyển vào Durable Object `SmartOffice`, tên `main`.
2. **Cơ sở dữ liệu:** SQLite của Durable Object. Lớp `worker/sqlite-shim.js` cung cấp giao diện giống `node:sqlite` để dùng chung mã nghiệp vụ với bản Node.
3. **Tệp đính kèm:** lưu trong bảng `file_chunks`, mỗi khối 1 MB, mỗi tệp tối đa 20 MB.
4. **Triển khai tự động:** Cloudflare Workers Builds kết nối kho `thunvit/smart-office`, chạy `npx wrangler deploy` khi có mã mới trên nhánh `main`. Bản dựng xem trước (preview build) đã tắt.
5. **Địa chỉ hiện tại:** `smart-office.thunv-it.workers.dev`.
   - Địa chỉ dạng `smart-office.workers.dev` không cấp được.
   - Dự án Pages `smart-office-vnpt.pages.dev` đã lập rồi xóa theo yêu cầu ngày 05/11/2026.

## Hệ quả và rủi ro (chi tiết tại báo cáo rà soát 06/11/2026)
1. **Xóa Worker là mất dữ liệu.** Ngày 05/11/2026, Worker đầu tiên bị xóa trên trang quản trị và mất cơ sở dữ liệu đi kèm.
2. **Không giữ cố định `ctx.storage` ở phạm vi isolate.** Lỗi này đã xảy ra và đã được sửa tại commit `5fdff58`.
3. **Mỗi isolate hiện chỉ phục vụ một Durable Object.** Muốn đa đơn vị phải thiết kế lại.
4. **Giới hạn CPU gói Free chưa được đo trên môi trường thật.** Khuyến nghị dùng gói Workers Paid khi đưa vào sử dụng thật.
5. **Chưa có chức năng xuất hoặc sao lưu dữ liệu.**
6. **Nơi lưu dữ liệu:** Durable Objects không đặt được dữ liệu tại Việt Nam. Pháp chế cần xác định yêu cầu trước khi kinh doanh dịch vụ (xem `docs/08-phap-ly/`).
