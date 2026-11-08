# ADR-012. Vận hành tự chủ: cập nhật tiến độ tuần, giám sát – cảnh báo – leo thang

- Ngày: 08/11/2026
- Trạng thái: **Đề xuất**, chờ chủ sở hữu duyệt. Mã có trong so-1.17.0 trên nhánh `claude/van-hanh-tu-chu-giam-sat`, chưa triển khai lên Cloudflare.
- Căn cứ:
  - yêu cầu của chủ sở hữu ngày 06/11/2026 và 08/11/2026: "Tự vận hành theo nghĩa là các nhân sự chủ động thực hiện các nhiệm vụ và có sự giám sát của hệ thống"; "Bạn triển khai luôn giúp tôi";
  - Thuyết minh kiến trúc hệ thống SmartOffice (Claude Docs, bản ngày 06/11/2026), Mục IV Nhóm E, phân hệ 26 và 30; Mục V.4; Mục VII.4;
  - Bộ luật Lao động 2019 (nội quy lao động: phạm vi giám sát công việc phải được quy định công khai) và Luật Bảo vệ dữ liệu cá nhân 2025: dòng tương ứng trong `docs/08-phap-ly/CAN-CU-PHAP-LY.md`. **Chưa kiểm chứng** điều khoản cụ thể áp dụng cho việc giám sát tiến độ công việc của người lao động.

## Bối cảnh

Hệ thống đã có Công việc – Dự án, Mục tiêu – KPI phân rã ba cấp (đơn vị, phòng, cá nhân) và liên kết công việc với mục tiêu. Còn thiếu hai mắt xích để nhân sự chủ động và hệ thống giám sát:

- nhân sự không có chỗ tự báo tiến độ định kỳ, nên quản lý phải hỏi hoặc họp báo cáo;
- việc quá hạn, mục tiêu chậm chỉ được phát hiện khi có người mở từng màn hình xem; không có cơ chế chuyển cấp.

## Quyết định

### 1. Phân hệ 26. Cập nhật tiến độ tuần

Tệp: `ops.js` (máy chủ), `public/ops.js` (giao diện, menu Công việc › Cập nhật tiến độ tuần).

- Bảng `checkins`: mỗi người một bản ghi mỗi tuần (khóa `user_id`, `week` là ngày Thứ Hai), gồm Đã làm, Sẽ làm, Vướng mắc (tối đa 3.000 ký tự mỗi phần), cờ Đề nghị hỗ trợ, ghi nhận của quản lý.
- Chỉ sửa được tuần hiện tại và tuần liền trước (cho cập nhật bù). Đề nghị hỗ trợ phải mô tả vướng mắc.
- Gợi ý từ dữ liệu có sẵn: việc đã hoàn thành trong tuần, việc đang mở đến hạn trong 2 tuần, mục tiêu cá nhân của chu kỳ hiện hành. Nhân sự bấm để chèn vào báo cáo. Không dùng trợ lý AI cho phần này, để không gửi dữ liệu ra nhà cung cấp.
- Quản lý xem cập nhật của nhóm, ghi nhận và phản hồi. Nhân sự sửa sau khi đã được ghi nhận thì ghi nhận cũ bị xóa, quản lý cần ghi nhận lại.

### 2. Phân hệ 30. Giám sát, cảnh báo, leo thang

- Cảnh báo **tính tại thời điểm xem** từ dữ liệu hiện có. Không có tác vụ định kỳ, không có bảng cảnh báo, nên không có dữ liệu cảnh báo cũ cần dọn và luôn khớp dữ liệu gốc.
- Bảy loại cảnh báo:

| Loại | Điều kiện | Mức |
| --- | --- | --- |
| Quá hạn | Việc chưa đóng, quá thời hạn; dự án đã đóng không tính | 1 dưới `lv2_days` (3) ngày; 2 từ 3 ngày; 3 từ `lv3_days` (7) ngày |
| Sắp đến hạn | Còn tối đa `due_soon_days` (2) ngày | 1, chỉ người thực hiện thấy |
| Chưa có người nhận | Việc có thời hạn trong `due_soon_days` ngày tới hoặc đã quá hạn, không có người nhận | 2 nếu đã quá hạn; báo người tạo dự án và quản lý dự án |
| Quá tải | Số việc đang mở vượt `overload_open` (15) | 1; gấp đôi ngưỡng thì 2 |
| Mục tiêu chậm | Mục tiêu không có mục tiêu con, tiến độ chậm hơn phần thời gian đã qua của chu kỳ từ `goal_lag_pct` (20) điểm % | 1; chậm gấp đôi ngưỡng thì 2 |
| Chưa cập nhật tuần | Tuần trước chưa cập nhật: 2. Tuần này chưa cập nhật từ thứ `checkin_wd` (Thứ Sáu): 1 | Không tính tài khoản quản trị hệ thống và người vào làm sau tuần đó |
| Cần hỗ trợ | Đề nghị hỗ trợ trong 2 tuần gần nhất chưa được ghi nhận | 2, chỉ ở chế độ Nhóm |

- **Leo thang:** mức 1 người thực hiện xử lý; mức 2 chuyển trưởng phòng; mức 3 chuyển giám đốc. Huy hiệu trên menu Giám sát – Cảnh báo được tính như sau:
  - mọi người: cảnh báo của chính mình, trừ việc sắp đến hạn;
  - trưởng phòng: cộng thêm cảnh báo từ mức 2 của nhân sự trong phòng;
  - giám đốc, quản trị viên: cộng thêm cảnh báo mức 3 toàn đơn vị.
- Tham số lưu tại `settings.ops_params`; chỉ quản trị viên sửa, có kiểm tra khoảng giá trị và mức 3 phải lớn hơn mức 2. Lần chạy đầu ghi ngày áp dụng (`since`) là ngày triển khai, để không cảnh báo các tuần trước khi có chức năng.

### 3. Phạm vi xem (ATTT-12/13: kiểm tra tại máy chủ)

| Người xem | Cập nhật tuần của người khác | Cảnh báo của người khác |
| --- | --- | --- |
| Nhân viên | Không | Không (chỉ của mình; người quản lý dự án thấy thêm việc chưa có người nhận trong dự án mình quản lý) |
| Trưởng phòng (`departments.head_id`) | Nhân sự các phòng mình phụ trách | Nhân sự các phòng mình phụ trách, mọi mức |
| Giám đốc (`settings.director_id`), quản trị viên | Toàn đơn vị | Toàn đơn vị, mọi mức |

- Ở chế độ Nhóm, cảnh báo quá hạn hiển thị **tên công việc** của nhân sự kể cả khi trưởng phòng không là thành viên dự án. Đây là chủ ý: leo thang chỉ có ý nghĩa khi người nhận biết việc gì đang trễ. Mở chi tiết công việc vẫn theo quyền của phân hệ Công việc – Dự án. Cách làm này nhất quán với Tổng quan hiện có: trưởng phòng đã xem được tải công việc, số việc trễ của nhân sự trong phòng.
- Không ai tự ghi nhận cập nhật của chính mình.

### 4. Giới hạn đã chọn

- Không gửi thư điện tử, thông báo đẩy khi có cảnh báo: hệ thống chưa có trung tâm thông báo (kế hoạch Phiên 5). Nhân sự thấy cảnh báo qua huy hiệu trên menu.
- Không giao cho AI chấm điểm, xếp loại hay đề xuất kỷ luật dựa trên cảnh báo (Thuyết minh, Mục V.4).
- Hệ thống chỉ giám sát dữ liệu công việc có sẵn; không thu thập dữ liệu mới về người lao động (vị trí, thời gian sử dụng máy…).
- Tối đa 1.000 cảnh báo tính cho mỗi lần xem, trả về tối đa 200 (HN-07).

## Hệ quả

- Thêm 1 bảng (`checkins`), 1 chỉ mục `tasks(status, due_date)`. Sao lưu tự động có bảng mới (danh mục sao lưu tăng từ 76 lên 77 bảng).
- Huy hiệu tính trên mỗi lần gọi `/api/bootstrap`, `/api/dashboard`. Đo cục bộ trên Node với 3.000 việc quá hạn: tối đa 13 ms mỗi yêu cầu. **Chưa đo trên Cloudflare.**
- Đơn vị cần bổ sung vào nội quy lao động hoặc quy chế nội bộ: nghĩa vụ cập nhật tiến độ tuần, phạm vi giám sát, cách sử dụng dữ liệu cảnh báo trong đánh giá. Kết luận đánh giá, khen thưởng, kỷ luật do người có thẩm quyền quyết định (Thuyết minh, Mục VII.4).

## Việc chưa làm (đề xuất các đợt sau của Nhóm E)

- Phân hệ 24 (Chức danh và trách nhiệm, RACI); 27 (Yêu cầu phối hợp liên phòng ban); 28 (Sáng kiến); 29 (Cổng tự phục vụ).
- Gửi cảnh báo qua thư điện tử, Zalo khi có trung tâm thông báo.
- Công cụ để trợ lý AI đọc cảnh báo và cập nhật tuần (theo cùng phạm vi), phục vụ báo cáo tổng hợp cho lãnh đạo.

## Câu hỏi cần chủ sở hữu cho ý kiến khi duyệt

1. Các ngưỡng mặc định: quá hạn 3 ngày chuyển trưởng phòng, 7 ngày chuyển giám đốc, cập nhật tuần trước Thứ Sáu, quá tải 15 việc. Có phù hợp không?
2. Trưởng phòng thấy tên công việc quá hạn của nhân viên trong dự án mà mình không tham gia (mục 3). Có chấp nhận không?
3. Nhân viên có được xem cập nhật tuần của đồng nghiệp cùng phòng không? Hiện tại là không.
