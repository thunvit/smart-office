# ADR-007. Phân hệ Công việc – Dự án đầy đủ theo tài liệu Base Wework

- Ngày: 06/11/2026
- Trạng thái: Đang áp dụng trên nhánh `tinh-nang/day-du-base-wework`; chưa hợp nhất vào `main`
- Căn cứ:
  - yêu cầu của chủ sở hữu lúc 12:44 ngày 06/11/2026: xây dựng đầy đủ tính năng căn cứ hình ảnh và mô tả trong tài liệu;
  - bảng đối chiếu `docs/05-ra-soat/2026-11-06-DOI-CHIEU-BASE-WEWORK.md` (68 bài Base Wework);
  - ADR-001 (không phụ thuộc npm), ADR-002 (Durable Object), ADR-005, ADR-006.

## Quyết định

1. **Tách mô-đun máy chủ `work-ext.js`.**
   - Đăng ký vào cùng bộ định tuyến, dùng chung hàm phân quyền của `work.js` qua đối tượng `H`. Không sao chép logic phân quyền.
   - `work.js` gọi các móc `HOOKS` (`task`, `project`, `create`, `clone`, `purge`, `projectPurge`) để bổ sung dữ liệu, sao chép và dọn dữ liệu liên quan.
   - Bảng mới: `task_fields`, `task_field_values`, `project_posts`, `project_post_comments`, `project_files`, `project_logs`, `task_marks`, `project_templates`. Bảng bình luận thảo luận đặt tên `project_post_comments` để tránh trùng `post_comments` của `biz.js`.

2. **Bảng phân quyền theo hình minh họa bài 63000277998.**
   - 7 quyền theo loại tài khoản (Thành viên, Khách), 8 quyền chỉnh sửa (Người theo dõi, Thành viên khác), 3 hạn chế của người được giao việc.
   - Hạn chế "không xóa, không chuyển giao" mặc định bật, giữ hành vi bản 1.6.
   - Thiết lập cũ (`member_create`, `member_view_all`, `assignee_edit_*`) được quy đổi tự động và đồng bộ ngược khi lưu.

3. **Trường dữ liệu tùy chỉnh: 13 loại, có Bảng và Công thức.**
   - Bộ tính công thức `public/work-formula.js` dùng chung cho máy chủ và trình duyệt. Bộ tính tự phân tích cú pháp, không dùng `eval` hoặc `new Function` (ATTT-05: chống thực thi mã).
   - Toán tử `^` tính từ trái sang phải như Excel; dấu `;` được chấp nhận làm dấu ngăn tham số.
   - Máy chủ tính lại công thức và tổng cột bảng; giá trị gửi từ trình duyệt cho cột công thức bị bỏ qua.
   - Tối đa 50 trường mỗi dự án và 20 cột mỗi bảng. Không xóa được trường đang dùng trong công thức.

4. **Đọc và ghi Excel tại trình duyệt bằng `public/xlsx-lite.js`, không thêm thư viện.**
   - Đọc: giải nén bằng `DecompressionStream('deflate-raw')`, phân tích XML bằng `DOMParser`, nhận diện ô ngày theo `styles.xml`.
   - Ghi: ZIP không nén (store) có CRC32; hỗ trợ in đậm và tô màu ô (dùng cho Gantt).
   - Máy chủ chỉ nhận các dòng đã chuẩn hóa (JSON), giới hạn: nhập 2.000 dòng; cập nhật thời gian và trường tùy chỉnh 300 công việc; xuất 3.000 công việc và 5.000 công việc con.
   - Lý do: không có tệp nhị phân lớn đi qua Worker (giới hạn CPU 50 ms, HN-02), không thêm phụ thuộc.

5. **Báo cáo tính bằng truy vấn gộp nhóm, không truy vấn trong vòng lặp (HN-05).**
   - Báo cáo thành viên lấy mốc thời gian của công việc bằng một truy vấn rồi tính chuỗi tích lũy trong bộ nhớ.
   - Báo cáo hệ thống dùng 3 truy vấn gộp theo ngày.
   - Xuất kèm trường tùy chỉnh lấy giá trị theo khối 500 mã công việc.

6. **Quyền quản trị.** Báo cáo hệ thống, quản trị quyền tạo dự án/phòng ban, tác vụ hàng loạt, xuất nhiều dự án và cài đặt nâng cao chỉ dành cho Owner (quản trị hệ thống, Giám đốc). Mọi tác vụ hàng loạt ghi nhật ký công việc, nhật ký dự án và nhật ký hệ thống.

7. **Giao diện tách tệp `public/work-report.js`.** Tệp này đăng ký vào các điểm mở rộng `SO.W` (`HOME`, `PTABS`, `SET`, `TSECT`, `THEAD`, `THAND`, `NTF`, `NTC`, `sidebar`), nên `public/work.js` không phình thêm.

8. **Tạo nhanh việc con.** Gửi cờ `quick` và được bỏ qua kiểm tra trường bắt buộc; người dùng bổ sung trường sau trong chi tiết. Tạo dạng đầy đủ và tạo việc cha vẫn kiểm tra.

## Khác với Base, chưa làm

- **Email thông báo:** hoãn theo chỉ đạo của chủ sở hữu.
- **Webhook dự án và tùy chỉnh hình nền:** chưa làm. Cột `projects.bg` đã có nhưng chưa có giao diện.
- **Phụ thuộc khi nhập Excel:** thời gian ràng buộc tính theo ngày; giờ ≥ 12 được làm tròn thành 1 ngày (xem ADR-006).
- **Google Calendar:** dùng liên kết mở trang thêm sự kiện và tệp `.ics`, không đồng bộ hai chiều.

## Hệ quả

- Thêm `test/work-ext-test.js` (91 điều kiện) vào CI.
- Thêm điều kiện `work-template`, `work-post` vào `test/worker-smoke.js`.
- `test/work-ui-full.js` (Playwright, 44 điều kiện) chỉ chạy cục bộ.
- Service worker tăng lên `so-1.8.0`, lưu đệm thêm `work-formula.js`, `xlsx-lite.js`, `work-report.js`.
