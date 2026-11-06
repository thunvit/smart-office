# TIÊU CHUẨN HIỆU NĂNG

- Ngày lập: 06/11/2026. Người lập: Tổng công trình sư (trợ lý AI), chờ chủ sở hữu phê duyệt.
- Căn cứ:
  - mục tiêu hiệu năng tại Kế hoạch phát triển, Mục I.2: 50 đơn vị, mỗi đơn vị tối đa 300 người dùng đồng thời, 95% thao tác phản hồi dưới 1 giây;
  - Core Web Vitals của Google: LCP ≤ 2,5 s, INP ≤ 200 ms, CLS ≤ 0,1 ở phân vị 75;
  - giới hạn nền tảng Cloudflare Workers và Durable Objects đã ghi tại ADR-002.

## I. Chỉ tiêu bắt buộc

| Mã | Chỉ tiêu | Mức yêu cầu | Cách đo |
|---|---|---|---|
| HN-01 | Thời gian phản hồi API (đo tại máy chủ) | p95 ≤ 300 ms, p99 ≤ 1 s với dữ liệu một đơn vị 300 người, 1 năm hoạt động | Kịch bản tải; nhật ký Cloudflare Observability |
| HN-02 | Thời gian CPU cho mỗi yêu cầu trên Workers | ≤ 50 ms với mọi API trừ đăng nhập và đổi mật khẩu; không vượt giới hạn CPU của gói dịch vụ đang dùng | Cloudflare Observability (CPU time) |
| HN-03 | Tải trang lần đầu trên mạng 4G | LCP ≤ 2,5 s; tổng tài nguyên tải lần đầu (đã nén) ≤ 300 KB, không tính phông chữ | Lighthouse, chế độ di động |
| HN-04 | Phản hồi thao tác trên giao diện | INP ≤ 200 ms; mọi thao tác quá 300 ms phải có trạng thái đang xử lý (nút `busy`) | Lighthouse, kiểm tra thủ công |
| HN-05 | Ổn định bố cục | CLS ≤ 0,1 | Lighthouse |
| HN-06 | Tần suất gọi nền của mỗi phiên đang mở | Trung bình ≤ 1 yêu cầu mỗi 15 giây; dừng khi tab ẩn | Đọc mã, đo mạng |
| HN-07 | Kích thước phản hồi danh sách | ≤ 200 bản ghi mỗi lần; có phân trang (`limit`, `offset` hoặc con trỏ) | Đọc mã, kiểm thử |

## II. Quy tắc lập trình bắt buộc

1. **Truy vấn có chỉ mục:**
   - Mọi cột dùng trong `WHERE`, `JOIN`, `ORDER BY` của truy vấn chạy thường xuyên phải có chỉ mục.
   - Khi thêm truy vấn mới, chạy `EXPLAIN QUERY PLAN`; không chấp nhận `SCAN` toàn bảng trên bảng nghiệp vụ lớn.
   - Hiện trạng: mới có khoảng 5 chỉ mục cho toàn bộ lược đồ, cần bổ sung theo lộ trình.
2. **Không truy vấn trong vòng lặp (N+1):** dùng `JOIN` hoặc `IN (...)` theo lô.
3. **Phân trang mọi danh sách có thể tăng theo thời gian:** công việc, đề xuất, tài liệu, nhật ký, tin nhắn, chấm công.
4. **Giao dịch ngắn, không chờ I/O bên ngoài trong giao dịch.** Durable Object xử lý tuần tự, nên một yêu cầu chậm sẽ chặn mọi yêu cầu khác của cùng đơn vị.
5. **Băm mật khẩu (scrypt khoảng 36 ms CPU) chỉ ở đăng nhập và đổi mật khẩu.** Không băm khi khởi động; không băm nhiều lần trong một yêu cầu.
6. **Dữ liệu dùng chung tải một lần rồi cập nhật phần thay đổi**, không tải lại toàn bộ định kỳ.
   - `/api/bootstrap` hiện trả toàn bộ danh sách người dùng và được gọi lại mỗi 30 giây. Cần tách thành "dữ liệu tĩnh" (tải khi đăng nhập) và "bộ đếm thông báo" (nhẹ, gọi định kỳ).
7. **Gọi định kỳ:**
   - Nhắn tin đang gọi lại mỗi 4 giây. Với 300 người dùng, mức này có thể lên tới 75 yêu cầu/giây cho một Durable Object.
   - Chuyển sang WebSocket với Hibernation API của Durable Objects, hoặc giãn nhịp có điều kiện (theo HN-06).
8. **Giao diện:**
   - Không thêm framework hay thư viện (ADR-001).
   - Vẽ lại phần thay đổi thay vì vẽ lại cả trang khi dữ liệu lớn.
   - Danh sách trên 200 dòng phải phân trang hoặc cuộn ảo.
9. **Tài nguyên tĩnh:** bật nén (Cloudflare tự nén); biểu tượng lưu đệm 7 ngày; mã JS/CSS lưu đệm qua service worker và đổi `VERSION` mỗi lần phát hành.
10. **Tệp đính kèm** tối đa 20 MB, chia khối 1 MB. Không đọc toàn bộ bảng `file_chunks` khi chỉ cần siêu dữ liệu.

## III. Kiểm tra bắt buộc

1. **Mỗi API mới hoặc truy vấn mới:** ghi kết quả `EXPLAIN QUERY PLAN` vào mô tả commit hoặc yêu cầu hợp nhất (pull request).
2. **Trước mỗi mốc phát hành:**
   - chạy kịch bản tải với dữ liệu mẫu 300 người, 1 năm;
   - ghi p50/p95/p99 và CPU vào `docs/05-ra-soat/YYYY-MM-DD-KIEM-THU-HIEU-NANG.md`.
3. **Lighthouse chế độ di động** cho trang Tổng quan, Công việc, Phê duyệt. Điểm Performance ≥ 85, Accessibility ≥ 90.

## IV. Hiện trạng và lộ trình

Hiện chưa đo chỉ tiêu nào ở Mục I trên môi trường thật, nên toàn bộ ở trạng thái **chưa kiểm chứng**.

| Mức | Việc |
|---|---|
| P0 | Đo CPU thật của đăng nhập và các API chính trên Cloudflare; quyết định nâng gói Workers Paid (HN-02) |
| P1 | Tách `/api/bootstrap` và giảm nhịp gọi định kỳ (HN-06); bổ sung chỉ mục và phân trang (HN-07, Mục II.1–3); kịch bản tải tự động |
| P2 | Nhắn tin qua WebSocket với Hibernation; đo Lighthouse trong CI |
