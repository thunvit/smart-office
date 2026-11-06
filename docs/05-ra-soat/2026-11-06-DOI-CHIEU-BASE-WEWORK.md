# ĐỐI CHIẾU CHỨC NĂNG BASE WEWORK – SMARTOFFICE

- Ngày: 06/11/2026. Người lập: trợ lý AI (theo yêu cầu của chủ sở hữu lúc 11:15 cùng ngày).
- Căn cứ:
  - Toàn bộ 68 bài trong mục lục [Base Wework: Giới thiệu về app và Mục lục tính năng](https://help.base.vn/support/solutions/articles/63000277954), đọc toàn văn ngày 06/11/2026.
  - Hình minh họa đã xem trực tiếp của các bài:
    - 63000277998: bảng phân quyền sử dụng;
    - 63000266408: các chế độ xem và thanh thông tin bên phải;
    - 63000252616: chi tiết công việc;
    - 63000271457: báo cáo hệ thống.
- Phạm vi trừ: email thông báo (bài 63000252573), hoãn theo chỉ đạo của chủ sở hữu.
- Ký hiệu hiện trạng trước đợt này:
  - **Có**: đã có;
  - **Một phần**: có nhưng thiếu chi tiết so với tài liệu;
  - **Chưa**: chưa có.

## 1. Phân quyền, Department

| Bài | Nghiệp vụ theo tài liệu | Hiện trạng | Việc làm |
|---|---|---|---|
| 63000273353 | Quyền App Admin: tạo dự án/phòng ban, tạo Department, xem báo cáo hệ thống | Một phần | Quản trị hệ thống và Giám đốc là Owner; thêm báo cáo hệ thống |
| 63000270226 | Phân quyền tạo dự án, tạo phòng ban (cài đặt hệ thống) | Chưa | Cài đặt hệ thống: mọi người / trưởng phòng / danh sách chỉ định |
| 63000252551 | Department là cấp cha của dự án/phòng ban; quản lý Department | Chưa | Gắn dự án với phòng ban của tổ chức; trưởng phòng là quản lý Department; lọc và xuất theo Department |

## 2. Dự án, phòng ban

| Bài | Nghiệp vụ | Hiện trạng | Việc làm |
|---|---|---|---|
| 63000266408 | Phòng ban: xem Stream, Period, Board theo nhóm, Lịch. Dự án: Danh sách, Board theo nhóm, Gantt, Lịch | Một phần (Kanban theo trạng thái) | Thêm Stream, Period, Board theo nhóm công việc (kéo thả đổi nhóm) |
| 63000270224, 63000270225 | Tạo: quản trị, thành viên (thêm theo nhóm), Department, phân loại nội bộ/khách hàng, mẫu, ngày, trạng thái, mô tả, màu | Một phần | Thêm Department, phân loại, chọn mẫu, trạng thái ban đầu, thêm thành viên theo phòng ban |
| 63000272037, 63000286778 | Tạo từ mẫu; quản lý mẫu dự án (chia sẻ; gồm nhóm, trường tùy chỉnh, quyền, nhãn) | Chưa | Mẫu dự án của người dùng và mẫu dựng sẵn |
| 63000277998, 63000278602, 63000278603, 63000278640 | Bảng phân quyền: theo loại tài khoản (Quản lý / Thành viên / Khách); quyền chỉnh sửa (Người giao & thực hiện / Người theo dõi / Khác) với 8 thao tác; 3 giới hạn đặc biệt với người được giao việc | Một phần | Thay thiết lập rời rạc bằng bảng phân quyền đầy đủ; thêm vai trò Khách; công việc chưa giao |
| 63000278633, 63000252596 | Thêm quản lý/thành viên, thêm nhiều; Owner tự thêm mình làm quản lý | Một phần | Thêm theo phòng ban; Owner có nút "Thêm tôi làm quản lý" |
| 63000252597 | Owner xem toàn bộ dự án: lọc theo trạng thái hiển thị và giai đoạn (đúng tiến độ, chậm, rủi ro) | Một phần | Thêm lọc giai đoạn |
| 63000273296 | Nhân bản dự án với các tùy chọn (công việc, người giao, người nhận, người theo dõi, hạn ± giờ, trường tùy chỉnh, checklist, việc con, quản trị, thành viên, quyền, nhãn) | Chưa | Xây dựng đầy đủ các tùy chọn |
| 63000271835 | Đóng/mở kèm kết quả, tình trạng, thông báo | Có | — |
| 63000252583, 63000278278 | Xóa: cảnh báo, chờ 6 giây; Owner giới hạn quyền xóa của quản lý | Một phần | Đếm ngược 6 giây; cài đặt nâng cao cho Owner |
| 63000279048 | Chuyển loại dự án ↔ phòng ban | Có | Thêm thao tác riêng có xác nhận |
| 63000266379 | Dự án/phòng ban ưu tiên | Chưa | Đánh dấu ưu tiên theo người dùng, hiển thị trước |
| Hình 63000277998 | Thẻ dự án: Công việc, Thảo luận, Tài liệu, Hoạt động, Báo cáo, Tùy chỉnh; Tùy chỉnh hình nền; Webhook | Chưa (Thảo luận, Tài liệu, Hoạt động, hình nền, webhook) | Thêm Thảo luận, Tài liệu, Hoạt động, hình nền; webhook để sau (cần đánh giá ATTT) |
| Hình 63000266408 | Thanh thông tin bên phải: mô tả, % hoàn thành, thời gian, Department, thành viên, hoạt động gần đây, trạng thái, "Công việc của tôi", "Cần lưu ý", mục tiêu, biểu đồ | Chưa | Thêm thanh thông tin dự án |

## 3. Nhóm công việc

| Bài | Nghiệp vụ | Hiện trạng | Việc làm |
|---|---|---|---|
| 63000272034, 63000252620 | Thêm (tên, mô tả), sửa, xóa từ danh sách | Một phần | Thêm mô tả; menu nhóm ngay trong Danh sách |
| 63000278274 | Kéo thả sắp xếp nhóm | Một phần (nút lên/xuống) | Giữ nút, thêm kéo thả |
| 63000278275 | Đóng/mở nhóm | Có | — |
| 63000276270 | Người đánh giá theo nhóm công việc | Chưa | Danh sách người đánh giá riêng cho từng nhóm |
| 63000285941 | Thời lượng định mức (bật/tắt; theo nhóm; công việc lặp lại kế thừa) | Một phần | Thêm bật/tắt; lặp lại kế thừa định mức |

## 4. Công việc

| Bài | Nghiệp vụ | Hiện trạng | Việc làm |
|---|---|---|---|
| 63000270213 | Tạo công việc | Có | — |
| 63000278277 | Tạo nhanh việc con (tên, hạn, người thực hiện) hoặc dạng đầy đủ | Một phần | Thêm tạo nhanh |
| 63000258854, 63000271027 | Giao nhiều người, theo nhóm; giao người ngoài dự án | Một phần | Chọn nhanh theo phòng ban |
| 63000254750 | Ủy quyền giao việc (tối đa 10 người); chọn người giao khi tạo | Chưa | Xây dựng |
| 63000252611 | Cập nhật kết quả: nội dung, tệp, % (kéo thanh) | Một phần (chưa có tệp) | Đính kèm tệp vào kết quả |
| 63000252616, 63000252618 | Sửa tên, nhóm, ngày, người thực hiện, mô tả, tệp | Có | — |
| 63000268206 | Đổi thời hạn: trong chi tiết, ngay trên danh sách, kéo Gantt | Một phần | Đổi thời hạn ngay trên danh sách |
| 63000252605 | Checklist có tên, chứa các việc cần làm (todo) giao cho người | Một phần (đầu việc phẳng) | Checklist có tên, todo có người thực hiện |
| 63000252604 | Thêm vào Google Calendar / iCalendar | Chưa | Liên kết Google Calendar và tệp .ics |
| 63000252607, 63000252606 | Thêm nhiều người theo dõi một lần, theo nhóm; xóa | Một phần | Thêm nhiều người, theo phòng ban |
| 63000273297 | Nhân bản với 14 tùy chọn | Một phần | Bổ sung khẩn cấp, quan trọng, nhãn, ngày bắt đầu, người nhận việc con, trường tùy chỉnh |
| 63000273298 | Nhân bản sang dự án khác | Chưa | Xây dựng |
| 63000252603 | Chuyển nhóm: kéo thả ở Danh sách, Board, trong chi tiết | Một phần | Kéo thả ở Danh sách và Board theo nhóm |
| 63000252609 | Tùy chọn hiển thị việc con: một cấp / nhiều cấp / ẩn | Chưa | Thêm "Tùy chọn hiển thị" và sắp xếp |
| Hình 63000266408 | Đánh dấu hoàn thành ngay trên danh sách (vòng tròn); đánh dấu sao | Chưa | Thêm |
| 63000252575, 63000252608, 63000277992, 63000278601 | Trường tùy chỉnh: số nguyên, thập phân, văn bản ngắn, đoạn, ngày, ngày giờ, một/nhiều lựa chọn, checkbox, tệp, tiêu đề, bảng, công thức; vị trí; bắt buộc; nhập định nghĩa từ Excel; cập nhật giá trị từ Excel | Chưa | Xây dựng đầy đủ |

## 5. Nhập, xuất dữ liệu

| Bài | Nghiệp vụ | Hiện trạng | Việc làm |
|---|---|---|---|
| 63000252615 | Nhập công việc từ Excel: nhóm, việc con "#", người giao, người thực hiện, người theo dõi, khẩn cấp/quan trọng, nhãn, ngày, mục tiêu; xem trước | Chưa | Xây dựng (đọc .xlsx ngay trên trình duyệt, không thêm thư viện) |
| 63000286215 | Nhập công việc kèm phụ thuộc (Key, {Key}{Quan hệ}{Thời gian}) | Chưa | Xây dựng |
| 63000271425 | Cập nhật thời gian bắt đầu, thời hạn từ Excel theo mã công việc | Chưa | Xây dựng |
| 63000252614 | Xuất công việc 1 dự án: khoảng thời gian, việc con, theo ngày tạo / thời hạn / đang thực hiện, chọn trường tùy chỉnh | Một phần (CSV) | Xuất .xlsx có tùy chọn |
| 63000268365 | Owner xuất nhiều dự án cùng lúc (tối đa 500 dự án, 3.000 công việc) | Chưa | Xây dựng |
| 63000277994 | Xuất sơ đồ Gantt ra Excel | Chưa | Xây dựng |
| 63000277995 | Xuất công việc với dữ liệu dạng bảng | Chưa | Xây dựng cùng trường tùy chỉnh dạng bảng |

## 6. Báo cáo, quản trị

| Bài | Nghiệp vụ | Hiện trạng | Việc làm |
|---|---|---|---|
| 63000252592 | Nhân viên của tôi: dạng Danh sách và Tổng quan; chi tiết theo trạng thái, theo dự án | Một phần | Bổ sung dạng Danh sách, phân loại theo dự án |
| 63000271837 | Báo cáo cá nhân: lọc thời gian, dự án, trạng thái; thành viên tự xem báo cáo của mình | Chưa | Xây dựng |
| 63000271457 | Báo cáo hệ thống (Owner): tổng quan, trạng thái (đúng hạn, trễ hạn, đang làm, quá hạn), ma trận Eisenhower, chờ review, xu hướng theo ngày và tuần, theo thành viên, dự án, Department, mục tiêu | Chưa | Xây dựng |
| 63000286115 | Tác vụ hàng loạt (Owner): thay người nhận, người giao, thêm người theo dõi; thay vai trò, hạ quyền, xóa khỏi dự án; ghi lịch sử | Chưa | Xây dựng |

## 7. Kế hoạch thực hiện

Làm trên nhánh `tinh-nang/day-du-base-wework`, theo các giai đoạn A–H. Kết quả và mức độ kiểm chứng từng giai đoạn ghi trong nhật ký phiên.

## 8. Kết quả thực hiện (cập nhật 06/11/2026, nhánh `tinh-nang/day-du-base-wework`)

Mức độ kiểm chứng của mọi mục dưới đây là **đã kiểm thử cục bộ**, gồm `test/work-test.js`, `test/work-ext-test.js`, `test/work-plan-test.js`, `test/worker-smoke.js` (mô phỏng Durable Object), `test/work-ui.js` và `test/work-ui-full.js` (Playwright). Các mục **chưa chạy trên Cloudflare thật**.

| Nhóm | Đã làm | Chưa làm hoặc khác Base |
|---|---|---|
| 1. Phân quyền, Department | Quyền tạo dự án/phòng ban (mọi người, trưởng Department, danh sách); gắn Department; lọc và xuất theo Department; báo cáo hệ thống | — |
| 2. Dự án, phòng ban | Stream, Period, Board theo nhóm (kéo thả); tạo có Department, phân loại, mẫu, trạng thái; mẫu dựng sẵn và mẫu của người dùng (chia sẻ người/Department); bảng phân quyền đầy đủ; thêm thành viên theo Department, vai trò Khách; "Thêm tôi làm quản lý"; lọc giai đoạn; nhân bản với các tùy chọn; xóa đếm ngược 6 giây; Owner giới hạn quyền xóa; chuyển loại; ưu tiên (★); thẻ Thảo luận, Tài liệu, Hoạt động; thanh thông tin bên phải | Webhook, tùy chỉnh hình nền |
| 3. Nhóm công việc | Mô tả, sửa trong Danh sách, kéo thả sắp xếp, người đánh giá theo nhóm, bật/tắt thời lượng định mức | Công việc lặp lại kế thừa định mức: chưa kiểm chứng riêng |
| 4. Công việc | Tạo nhanh việc con; giao nhiều người theo Department; ủy quyền giao việc (10 người); kết quả kèm tệp, kéo % ; đổi thời hạn trên danh sách; checklist có tên, todo có người thực hiện; Google Calendar và `.ics`; thêm người theo dõi theo Department; nhân bản 14 tùy chọn; nhân bản sang dự án khác; tùy chọn hiển thị việc con, sắp xếp; hoàn thành nhanh, đánh dấu ★; 13 loại trường tùy chỉnh | — |
| 5. Nhập, xuất | Nhập Excel (nhóm, "#" cấp con, người, cờ, nhãn, ngày, mốc, trường tùy chỉnh; xem trước); nhập kèm phụ thuộc; cập nhật thời gian và trường tùy chỉnh theo mã; nhập định nghĩa trường; xuất .xlsx/CSV có tùy chọn; Owner xuất nhiều dự án; xuất Gantt; xuất dữ liệu bảng | Phụ thuộc tính theo ngày |
| 6. Báo cáo, quản trị | Báo cáo thành viên (lọc, biểu đồ, theo dự án, mục tiêu, mốc, in, Excel); báo cáo hệ thống (tổng quan, trạng thái, ma trận ưu tiên, xu hướng, theo thành viên/dự án/Department, mốc, thẻ, Excel); tác vụ hàng loạt trên công việc và dự án | — |
| Thông báo email | — | Hoãn theo chỉ đạo của chủ sở hữu |
