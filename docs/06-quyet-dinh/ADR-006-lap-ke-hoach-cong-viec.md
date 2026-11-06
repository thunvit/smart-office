# ADR-006. Lập kế hoạch công việc: phụ thuộc, lặp lại, mốc dự án

- Ngày: 06/11/2026
- Trạng thái: Đang áp dụng
- Căn cứ: Base Wework, các bài 63000283721 và 63000283724 (công việc phụ thuộc), 63000268543 (công việc lặp lại), 63000267947 (mục tiêu/milestone trong dự án); `docs/02-thiet-ke/YEU-CAU-CONG-VIEC-DU-AN.md` Mục VI.

## Quyết định

1. **Hàm thuần `work-plan.js`.**
   - Chứa quy tắc lặp, tính lần lặp và quy đổi thời hạn theo giờ.
   - Không truy cập cơ sở dữ liệu, được kiểm thử độc lập bằng `test/work-plan-test.js`.
   - Kiểm thử dùng đúng các ví dụ trong bài hướng dẫn của Base.

2. **Công việc phụ thuộc.**
   - Lưu trong bảng `task_deps(pred_id, succ_id, type, lag_days)`, trong đó `pred` chặn `succ`.
   - Điều kiện tạo:
     - chỉ áp dụng cho Dự án, và quản lý đã bật tại Thiết lập;
     - hai công việc cùng dự án;
     - người thao tác có quyền sửa thời gian của cả hai công việc;
     - không trùng quan hệ đã có;
     - không tạo vòng lặp (kiểm tra bằng duyệt đồ thị).
   - Chế độ `keep` (giữ nguyên thời gian phụ thuộc):
     - Khi tạo phụ thuộc, công việc bị phụ thuộc được xếp lịch theo ràng buộc. FS: ngày bắt đầu = ngày sau thời hạn của `pred` + số ngày ràng buộc. SS, FF, SF tính tương tự với điểm neo tương ứng.
     - Khi `pred` đổi ngày, các công việc bị phụ thuộc được dời cùng độ lệch và giữ nguyên thời lượng; việc dời lan truyền tiếp theo chuỗi phụ thuộc.
     - Không dời công việc đã hoàn thành hoặc thất bại.
   - Chế độ `none`: chỉ ghi nhận quan hệ, không tự dời lịch.
   - Trạng thái không bị chặn cứng. Hệ thống chỉ cảnh báo trong chi tiết công việc, vì Base mô tả phụ thuộc là ràng buộc theo thời gian.
   - **Khác Base:** SmartOffice lập lịch theo ngày nên chỉ nhận số ngày ràng buộc; Base cho nhập cả ngày và giờ.

3. **Công việc lặp lại.**
   - Lưu thiết lập trong bảng `task_recurrences`. Công việc sinh ra có cột `recurrence_id`.
   - Thời điểm sinh theo Base:
     - sinh ngay lần gần nhất khi thiết lập;
     - lần thứ n+1 được sinh lúc 7:00 ngày của lần thứ n.
   - Việc sinh chạy khi có yêu cầu đọc danh sách (`recTick`), tối đa 10 phút một lần cho mỗi isolate. Mỗi thiết lập lưu `last_gen` nên không sinh trùng.
   - Cách làm này không cần tiến trình nền hay Cron, chạy được cả trên Node và Durable Object.
   - Hệ quả: nếu không ai truy cập, các lần lặp sẽ được sinh bù ở lần truy cập kế tiếp, tối đa 31 lần mỗi thiết lập trong một lần chạy.
   - Có thể bổ sung Durable Object Alarm sau.

4. **Mốc dự án (milestone).**
   - Lưu trong bảng `project_milestones`. Mỗi công việc gắn tối đa một mốc (`tasks.milestone_id`).
   - Tiến độ mốc = số công việc gắn mốc đã hoàn thành / tổng số công việc gắn mốc.
   - Giao diện gọi là "Mốc dự án" để phân biệt với "Mục tiêu" của phân hệ Mục tiêu – KPI.

5. **Chế độ xem Lịch.** Lọc `from`/`to` theo khoảng ngày; giới hạn 200 bản ghi (HN-07).

## Hệ quả

- Bảng mới đều có chỉ mục theo khóa truy vấn (HN, Mục II.1).
- Lan truyền dời lịch bị giới hạn 500 công việc mỗi lần, để giữ CPU trong giới hạn.
- Cần đo CPU trên Cloudflare thật với dự án có chuỗi phụ thuộc dài.
