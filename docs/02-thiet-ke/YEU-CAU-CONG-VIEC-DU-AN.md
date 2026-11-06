# YÊU CẦU PHÂN HỆ CÔNG VIỆC – DỰ ÁN (PHIÊN BẢN 2)

- Ngày lập: 06/11/2026. Người lập: Tổng công trình sư (trợ lý AI).
- Căn cứ:
  - Bộ tài liệu hướng dẫn Base Wework tại help.base.vn (68 bài; đã nghiên cứu 48 bài chính ngày 06/11/2026; mục lục: [Giới thiệu về app và mục lục tính năng](https://help.base.vn/support/solutions/articles/63000277954));
  - Kế hoạch phát triển (Phiên 8);
  - Tiêu chuẩn ATTT, Hiệu năng, UI/UX tại `docs/09-tieu-chuan/`.
- Nguyên tắc: tham khảo **nghiệp vụ** (tính năng, luồng xử lý) của Base Wework. Không sao chép giao diện, văn bản hay mã nguồn của Base. Giao diện theo hệ thiết kế riêng của SmartOffice.

## I. Tóm tắt nghiệp vụ Base Wework

| Nhóm | Nghiệp vụ chính (theo tài liệu Base) |
|---|---|
| Không gian làm việc | Hai loại: **Phòng ban** (công việc lặp lại, không có ngày kết thúc; xem Stream/Period/Board/Calendar) và **Dự án** (có ngày bắt đầu, kết thúc; xem List/Board/Gantt/Calendar). Chuyển đổi qua lại được giữa hai loại. Thông tin khi tạo: tên, quản trị, thành viên, Department, phân loại nội bộ/khách hàng, mẫu, ngày bắt đầu, ngày kết thúc, trạng thái, mô tả, màu |
| Vai trò | Owner/Quản trị cấp cao, Quản lý dự án, Thành viên, Người theo dõi, Khách. Người giao và người nhận có quyền sửa mặc định; có "Giới hạn đặc biệt đối với người được giao việc" (sửa thời hạn, sửa thông tin). Thành viên xem được việc của người khác hay không tùy thiết lập. Người theo dõi chỉ xem việc được gắn tên |
| Nhóm công việc | Thêm, sửa, xóa, sắp xếp kéo thả, tạm đóng/mở; thời lượng định mức theo nhóm |
| Công việc | Tên (≤155 ký tự), một người nhận việc, nhóm, thời hạn (có thể theo giờ), mô tả, trường tùy chỉnh, tệp, nhãn, người theo dõi, mục tiêu. Giao cho nhiều người: tạo mỗi người một việc. Giao việc cho người ngoài dự án; ủy quyền giao việc |
| Việc con, checklist | Việc con nhiều cấp (nhân bản giữ tối đa 3 cấp); checklist và todo không có thời hạn |
| Cập nhật kết quả | Nội dung kết quả, tệp, % hoàn thành (bật theo dự án), đánh dấu hoàn thành |
| Đánh giá trước khi hoàn thành | Bật theo dự án; người đánh giá là người giao việc hoặc danh sách chỉ định; có SLA; việc của quản lý thì hoàn thành ngay; tính đúng hạn theo thời điểm người làm bấm hoàn thành |
| Thất bại | Bật theo dự án; quyền đánh dấu mặc định Quản trị và Quản lý, có thể mở cho người giao, người nhận, người theo dõi; lý do bắt buộc theo danh mục; việc đang chờ đánh giá không chuyển thẳng sang thất bại; báo cáo có chỉ tiêu thất bại |
| Phụ thuộc (chỉ Dự án) | Chặn/bị chặn; quan hệ FS, FF, SS, SF; chống vòng lặp; tùy chọn giữ nguyên khoảng cách thời gian khi dời lịch |
| Khác | Việc lặp lại (tuần, tháng, quý, năm); nhân bản việc, dự án; mẫu dự án; trường tùy chỉnh (số, văn bản, ngày, lựa chọn, checkbox, tệp, bảng, công thức); nhập, xuất Excel; xuất Gantt; tác vụ hàng loạt khi bàn giao nhân sự; email thông báo; đóng/mở dự án kèm kết quả (thành công, thất bại, hủy) và tình trạng khi mở lại; xóa dự án có cảnh báo chờ 6 giây |
| Báo cáo | Nhân viên của tôi (theo quản lý trực tiếp); báo cáo theo thành viên (cần làm, đang làm, hoàn thành, quá hạn); báo cáo hệ thống cho Owner |

## II. Đối chiếu hiện trạng SmartOffice 1.5

| Nghiệp vụ | Hiện trạng 1.5 | Đánh giá |
|---|---|---|
| Dự án | Chỉ có tên, màu, lưu trữ; không có thành viên, vai trò, loại, ngày | Thiếu |
| Phân quyền | `GET /api/tasks` trả **toàn bộ** công việc của đơn vị cho mọi người dùng; xem chi tiết và bình luận không kiểm tra quyền | **Lỗi ATTT-13**, phải sửa |
| Nhóm công việc, việc con, người theo dõi, kết quả và %, đánh giá, thất bại, nhân bản, báo cáo dự án | Chưa có | Thiếu |
| Danh sách, Kanban, Gantt | Có ở mức đơn giản | Giữ, nâng cấp |
| Checklist, bình luận | Có | Giữ, bổ sung kiểm tra quyền |
| Danh sách công việc | Tối đa 1.000 bản ghi, không phân trang | Vi phạm HN-07 |

## III. Phạm vi và phân kỳ

### Giai đoạn 1 (xây dựng ngay)

1. **Không gian Dự án và Phòng ban:**
   - Thông tin: loại, mô tả, ngày bắt đầu và kết thúc (dự án), màu.
   - Thành viên theo vai trò Quản lý / Thành viên / Người theo dõi.
   - Đóng dự án kèm kết quả (thành công, thất bại, hủy) và ghi chú; mở lại kèm tình trạng (đúng tiến độ, chậm, rủi ro cao).
   - Chuyển loại Dự án ↔ Phòng ban.
   - Xóa có xác nhận.
2. **Thiết lập theo dự án:**
   - cho phép % hoàn thành;
   - yêu cầu đánh giá (người giao việc hoặc danh sách người đánh giá, SLA);
   - cho phép thất bại (vai trò được đánh dấu, danh mục lý do);
   - thành viên xem việc của người khác; thành viên được tạo việc;
   - giới hạn người nhận việc (sửa thời hạn, sửa thông tin);
   - người tạo được xóa việc;
   - thời hạn theo giờ.
3. **Nhóm công việc:** thêm, sửa, xóa (việc chuyển về "Chưa phân loại"), sắp xếp, tạm đóng, thời lượng định mức.
4. **Công việc:**
   - Thông tin: tên ≤ 155 ký tự, nhóm, người nhận (một người; giao nhiều người thì tạo mỗi người một việc), ngày bắt đầu, thời hạn (kèm giờ nếu bật), mô tả, gắn cờ khẩn cấp/quan trọng, thời lượng dự kiến, người theo dõi.
   - Việc con tối đa 3 cấp.
   - Giao việc cho người ngoài dự án: người đó tự động được thêm vào dự án với vai trò Người theo dõi.
5. **Luồng trạng thái:** Cần làm → Đang làm → (Chờ đánh giá) → Hoàn thành; Thất bại; mở lại. Đánh giá: duyệt hoặc trả lại kèm ý kiến. Tính đúng hạn theo thời điểm người làm bấm hoàn thành.
6. **Cập nhật kết quả:** nội dung và % hoàn thành, lưu lịch sử.
7. **Thao tác khác:** checklist, bình luận, nhật ký hoạt động từng công việc, nhân bản (tùy chọn giữ người nhận, nhóm, việc con, checklist, người theo dõi, mô tả, thời hạn), chuyển nhóm.
8. **Màn hình:**
   - "Việc của tôi" (được giao, tôi giao, đang theo dõi, chờ tôi đánh giá);
   - "Nhân viên của tôi" (trưởng phòng);
   - danh sách Dự án & phòng ban;
   - chi tiết dự án gồm Danh sách theo nhóm (việc con thụt lề), Kanban theo trạng thái, Gantt (dự án), Báo cáo, Thiết lập.
9. **Báo cáo dự án:** số việc theo trạng thái, quá hạn, tỷ lệ đúng hạn, theo thành viên, theo nhóm. Xuất CSV theo dự án, có kiểm tra quyền.

### Giai đoạn 2

1. **Lập kế hoạch:** công việc phụ thuộc (FS, FF, SS, SF, chống vòng lặp, dời lịch); việc lặp lại; mục tiêu (milestone) trong dự án; lịch (Calendar); kéo thả Gantt.
2. **Mở rộng dữ liệu:** trường tùy chỉnh; mẫu dự án; nhân bản dự án; nhập công việc từ Excel.
3. **Quản trị:** tác vụ hàng loạt khi bàn giao nhân sự; ủy quyền giao việc; thông báo email; báo cáo hệ thống; Department.

## IV. Yêu cầu chất lượng áp dụng

1. **ATTT-12, ATTT-13:**
   - mọi truy vấn công việc lọc theo quyền xem;
   - người không thuộc dự án không xem được dự án và công việc, trừ việc mình được giao hoặc được gắn theo dõi;
   - mọi thao tác ghi kiểm tra quyền tại máy chủ.
2. **HN-07:** danh sách tối đa 200 bản ghi mỗi lần, có phân trang.
3. **HN, Mục II.1:** có chỉ mục cho `project_id`, `group_id`, `parent_id`, `creator_id`, `assignee_id`, người theo dõi, thành viên.
4. **UI/UX:** chỉ dùng thành phần dùng chung; thuật ngữ thống nhất.

   | Mã trạng thái | Tên hiển thị |
   |---|---|
   | `todo` | Cần làm |
   | `doing` | Đang làm |
   | `review` | Chờ đánh giá |
   | `done` | Hoàn thành |
   | `failed` | Thất bại |

5. **Kiểm thử:** kịch bản `test/work-test.js` chạy trên cả bản Node và bản mô phỏng Durable Object. Bao gồm phân quyền xem, sửa, xóa, đánh giá, thất bại, giới hạn người nhận việc, việc con, giao nhiều người.

## V. Bổ sung 06/11/2026: thông tin khi tạo công việc

Căn cứ: bài [Base Wework: Cách tạo công việc mới](https://help.base.vn/support/solutions/articles/63000270213), sửa đổi ngày 22/10/2024, đọc ngày 06/11/2026.

| Thông tin theo Base Wework | SmartOffice | Ghi chú |
|---|---|---|
| Tên công việc ≤ 155 ký tự | Có | Kiểm tra tại máy chủ (`MAX_TITLE`) |
| Một người nhận việc | Có | Giao nhiều người thì tạo mỗi người một việc |
| Phòng ban/Dự án/Nhóm công việc | Có | |
| Đến hạn vào (thời hạn) | Có | Theo giờ nếu dự án bật |
| Mô tả | Có | |
| Trường dữ liệu tùy chỉnh | Chưa | Giai đoạn 2 |
| Tệp đính kèm | **Bổ sung** | Tối đa 10 MB/tệp, 30 tệp/công việc; chặn tệp chương trình; giao nhiều người dùng chung một tệp |
| Chọn tệp từ Base Drive | **Bổ sung** | Liên kết tài liệu từ phân hệ Tài liệu; tải về qua `/api/docs/:id/file` nên giữ nguyên quyền xem của tài liệu |
| Nhãn (tags) | **Bổ sung** | Tối đa 10 nhãn × 30 ký tự; bỏ trùng không phân biệt hoa thường; lọc chính xác theo nhãn; xuất CSV có cột Nhãn |
| Người theo dõi | Có | |
| Liên kết Mục tiêu | **Bổ sung** | Liên kết với phân hệ Mục tiêu – KPI; hiển thị tiến độ mục tiêu trong chi tiết công việc |

