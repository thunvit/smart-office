# Kế hoạch phát triển SmartOffice

> Bản sao xuất ngày 06/11/2026 từ tài liệu gốc trên Claude Docs: https://claude.ai/artifact/Ah3gR8tLERUxZ5ZQBcFkCw (bản sửa 23). Khi có thay đổi, cập nhật bản gốc rồi xuất lại vào tệp này.

Nov 5, 2026 · @Nguyễn Văn Thụ

## I. Căn cứ, mục tiêu và phạm vi

Kế hoạch đưa SmartOffice từ bản chạy thử 1.3 lên bản 2.0 vận hành chính thức và kinh doanh dịch vụ cho nhiều đơn vị khách hàng theo mô hình đa đơn vị, tại tên miền smartoffice.vnptninhbinh.com.vn, thực hiện trong 22 phiên làm việc, dự kiến khoảng 13 tuần.

### 1. Căn cứ

| Văn bản | Nội dung áp dụng cho phần mềm |
| --- | --- |
| [Luật Bảo vệ dữ liệu cá nhân năm 2025](https://luatvietnam.vn/dan-su/luat-bao-ve-du-lieu-ca-nhan-2025-co-hieu-luc-khi-nao-568-103652-article.html) (hiệu lực 01/01/2026) và [Nghị định 356/2025/NĐ-CP](https://luatvietan.vn/diem-moi-cua-nghi-dinh-356-2025-so-voi-nghi-dinh-13-2023-ve-huong-dan-bao-ve-du-lieu-ca-nhan.html) (hiệu lực 01/01/2026, thay thế Nghị định 13/2023/NĐ-CP) | Phân quyền xem hồ sơ nhân sự, tiền lương; nhật ký truy cập dữ liệu nhạy cảm; báo cáo sự cố vi phạm trong 72 giờ; xử lý yêu cầu xem, sửa, xóa dữ liệu của người lao động đúng thời hạn; hồ sơ đánh giá tác động |
| [Luật An ninh mạng năm 2025, số 116/2025/QH15](https://apolatlegal.com/vi/laws/luat-an-ninh-mang-2025-so-116-2025-qh15/) (hiệu lực 01/7/2026, thay thế Luật An ninh mạng 2018 và Luật An toàn thông tin mạng 2015) | Biện pháp bảo đảm an ninh mạng cho hệ thống thông tin nội bộ; xác định cấp độ hệ thống theo văn bản hướng dẫn hiện hành |
| [Luật Giao dịch điện tử số 20/2023/QH15](https://pbgdpl.cantho.gov.vn/mot-so-noi-dung-moi-co-ban-cua-luat-giao-dich-dien-tu-nam-2023) (hiệu lực 01/7/2024) | Giá trị pháp lý của thông điệp dữ liệu, chữ ký điện tử, chữ ký số: căn cứ cho phê duyệt điện tử và tích hợp ký số |
| [Luật Lưu trữ số 33/2024/QH15](https://luatvietnam.vn/hanh-chinh/luat-luu-tru-2024-360813-d1.html) (hiệu lực 01/7/2025) | Tài liệu lưu trữ số có đầy đủ giá trị pháp lý; lập hồ sơ, nộp lưu tài liệu điện tử; nghiêm cấm làm sai lệch, truy cập trái phép tài liệu lưu trữ |
| Bộ luật Lao động năm 2019 (Điều 98, 112, 113, 124) | Tiền lương làm thêm giờ, nghỉ lễ, nghỉ hằng năm, hình thức xử lý kỷ luật lao động |
| Nghị định 30/2020/NĐ-CP về công tác văn thư | Thể thức, số và ký hiệu văn bản; đăng ký văn bản đến, văn bản đi. Đơn vị rà soát văn bản sửa đổi, thay thế (nếu có) trước Phiên 11 |

### 2. Mục tiêu

Các chỉ tiêu dưới đây là đề xuất, đơn vị xem xét điều chỉnh trước khi bắt đầu Phiên 1.

1. Hiệu năng: phục vụ tối thiểu 50 đơn vị khách hàng, mỗi đơn vị đến 300 người dùng đồng thời; 95% thao tác phản hồi dưới 1 giây.
2. Sẵn sàng: hoạt động liên tục trong giờ làm việc; sao lưu hằng ngày, khôi phục trong tối đa 4 giờ khi có sự cố.
3. Nghiệp vụ: hoàn thiện 19 phân hệ hiện có và bổ sung phân hệ Văn thư; quy trình, luồng duyệt, công thức lương cấu hình được, không phải sửa mã nguồn.
4. Tuân thủ: đáp ứng yêu cầu bảo vệ dữ liệu cá nhân, an ninh mạng, giao dịch điện tử nêu tại Mục I.1.
5. Tiện dụng: dùng được trên điện thoại, có thông báo tức thời.
6. Kinh doanh: khởi tạo đơn vị khách hàng mới dưới 1 phút; dữ liệu các đơn vị tách biệt; vận hành theo cam kết chất lượng dịch vụ (đề xuất 99,5%/tháng).

### 3. Phạm vi

- Thuộc phạm vi: phần mềm SmartOffice đa đơn vị (máy chủ, cơ sở dữ liệu, giao diện web, ứng dụng di động dạng PWA), cổng quản trị nhà cung cấp, trang đăng ký dùng thử, tài liệu, đào tạo, hỗ trợ khách hàng.
- Không thuộc phạm vi: phần mềm kế toán theo chế độ kế toán, hóa đơn điện tử, dịch vụ chứng thư số. SmartOffice chỉ kết nối, xuất dữ liệu sang các hệ thống này.

## II. Hiện trạng phiên bản 1.3

Bản 1.3 đã có đủ 19 phân hệ chạy được, nhưng chưa đủ điều kiện vận hành chính thức vì còn 16 tồn tại thuộc 6 nhóm: dữ liệu, mã nguồn, bảo mật, hạ tầng dùng chung, nghiệp vụ, vận hành.

### 1. Phân hệ đã có

| Nhóm | Phân hệ |
| --- | --- |
| Công việc | Công việc – Dự án; Quy trình; Mục tiêu – KPI |
| Phê duyệt | Phê duyệt đề xuất (8 loại) |
| Thông tin | Bảng tin; Nhắn tin; Lịch họp; Tài liệu; Đăng ký khách đến |
| Nhân sự | Hồ sơ nhân sự; Chấm công – Bảng công; Tiền lương; Tuyển dụng; Đào tạo; Đánh giá năng lực; Khen thưởng – Kỷ luật |
| Kinh doanh | Khách hàng; Thu chi – Ngân sách; Tài sản |

### 2. Kiến trúc hiện tại

- Máy chủ Node.js, không dùng thư viện ngoài; cơ sở dữ liệu SQLite trong một tệp.
- Giao diện web một trang, viết bằng JavaScript thuần, menu ngang.
- Mã nguồn khoảng 4.800 dòng trong 10 tệp chính; chạy trên một máy tính bằng tệp khởi động .bat.

### 3. Tồn tại cần khắc phục

| Nhóm | Tồn tại | Ảnh hưởng | Xử lý tại |
| --- | --- | --- | --- |
| Dữ liệu | SQLite một tệp, ghi tuần tự | Chậm khi nhiều người cùng ghi; khó sao lưu khi đang chạy | Phiên 2 |
| Dữ liệu | Nâng cấp cơ sở dữ liệu bằng lệnh rời, chưa đánh số phiên bản | Rủi ro hỏng dữ liệu khi cập nhật | Phiên 1 |
| Mã nguồn | Tệp lớn, tiện ích lặp lại; chưa có kiểm thử tự động | Sửa chỗ này dễ hỏng chỗ khác | Phiên 1 |
| Bảo mật | Vai trò gắn cứng (Quản trị, HC–NS, Giám đốc, Kế toán) | Không khớp cơ cấu tổ chức thực tế | Phiên 3 |
| Bảo mật | Chưa ghi nhật ký truy cập dữ liệu nhạy cảm | Chưa đáp ứng yêu cầu bảo vệ dữ liệu cá nhân | Phiên 3 |
| Bảo mật | Chạy HTTP; chưa xác thực 2 lớp; dữ liệu lương chưa mã hóa; chưa sao lưu tự động | Dễ lộ lọt, mất dữ liệu | Phiên 4 |
| Hạ tầng dùng chung | Chưa có trung tâm thông báo, email; nhắn tin hỏi máy chủ 4 giây một lần | Thông tin đến chậm, tốn tài nguyên | Phiên 5 |
| Hạ tầng dùng chung | Tệp đính kèm chỉ có ở phân hệ Tài liệu | Đề xuất, công việc thiếu chứng từ kèm theo | Phiên 6 |
| Hạ tầng dùng chung | Chỉ xuất CSV; chưa in mẫu biểu; chưa tìm kiếm toàn hệ thống | Phải chỉnh lại trên Excel trước khi trình ký | Phiên 7 |
| Nghiệp vụ | Quy trình tuần tự, chưa rẽ nhánh; chưa có biểu mẫu tùy biến | Không mô tả được quy trình phức tạp | Phiên 8 |
| Nghiệp vụ | Luồng duyệt cố định theo ngưỡng tiền; chưa ký số | Không khớp mọi quy chế chi tiêu | Phiên 9 |
| Nghiệp vụ | Chưa có ca làm việc; làm thêm giờ chỉ mức 150% | Chưa tính đúng làm thêm ngày nghỉ, ngày lễ, ban đêm | Phiên 10 |
| Nghiệp vụ | Chưa có sổ văn bản đến, đi theo thể thức văn thư | Văn thư vẫn quản lý trên giấy | Phiên 11 |
| Nghiệp vụ | Chưa có báo cáo điều hành tổng hợp | Lãnh đạo phải mở từng phân hệ | Phiên 13 |
| Vận hành | Chưa có ứng dụng di động, chưa tích hợp email, Zalo | Bất tiện khi làm việc ngoài văn phòng | Phiên 14–15 |
| Vận hành | Chưa kiểm thử tải, bảo mật; khởi động thủ công | Chưa biết giới hạn chịu tải; ngừng khi tắt máy | Phiên 17–18 |

## III. Nguyên tắc tổ chức phiên làm việc

Mỗi phiên giải quyết một mục tiêu, bắt đầu từ mã nguồn đã nghiệm thu của phiên trước và kết thúc bằng một bản chạy được, đã kiểm thử. Phiên sau chỉ bắt đầu khi phiên trước được đơn vị nghiệm thu.

1. Một phiên là một cuộc trò chuyện mới với Claude, thời lượng 2–4 giờ, chỉ một mục tiêu. Không gộp nhiều mục tiêu vào một phiên, vì cuộc trò chuyện quá dài sẽ vượt dung lượng ngữ cảnh và khó kiểm soát chất lượng.
2. Đầu vào của phiên:
   - Mã nguồn mới nhất: kho mã GitHub riêng tư (khuyến nghị), thư mục đã liên kết với máy tính, hoặc tệp zip đính kèm;
   - Tệp NHAT-KY-PHIEN.md ghi kiến trúc, quyết định đã chốt, việc còn tồn;
   - Yêu cầu nghiệp vụ, mẫu biểu, góp ý của đơn vị (theo Mẫu giao việc tại Phụ lục).
3. Đầu ra bắt buộc của phiên:
   - Mã nguồn đã cập nhật, gắn số phiên bản (1.4, 1.5 … 2.0);
   - Kiểm thử tự động bổ sung cho phần vừa làm, toàn bộ bộ kiểm thử đạt;
   - Cập nhật CHANGELOG, hướng dẫn sử dụng, NHAT-KY-PHIEN.md;
   - Kịch bản nghiệm thu để đơn vị tự chạy thử.
4. Quản lý phiên bản: dùng Git, mỗi phiên một nhánh, gộp vào nhánh chính khi nghiệm thu. Bản cũ luôn khôi phục được nếu bản mới phát sinh lỗi.
5. Nghiệm thu: đơn vị chạy kịch bản trong 1–2 ngày, ghi góp ý. Lỗi nghiêm trọng được sửa đầu phiên sau; yêu cầu mới đưa vào danh sách chờ, không chèn vào phiên đang làm.
6. Dữ liệu: từ Phiên 1 đến Phiên 18 chỉ dùng dữ liệu mẫu. Dữ liệu thật của người lao động chỉ nhập tại Phiên 19, sau khi hoàn thành phân quyền, mã hóa, sao lưu.
7. Tần suất đề xuất: 2 phiên/tuần, xen kẽ ngày nghiệm thu.

## IV. Lộ trình tổng thể

22 phiên chia thành 5 giai đoạn nối tiếp, với nhịp 2 phiên/tuần thì bản 2.0 sẵn sàng kinh doanh vào khoảng tuần thứ 13.

> Sơ đồ lộ trình (5 giai đoạn, 22 phiên, 5 cổng nghiệm thu) xem tại bản gốc trên Claude Docs.

Mỗi giai đoạn chỉ bắt đầu khi cổng trước đó đạt. Giảm nhịp xuống 1 phiên/tuần thì thời gian kéo dài khoảng 24 tuần.

## V. Chi tiết từng phiên

Thứ tự phiên được xếp để phần nền (dữ liệu, phân quyền, bảo mật) xong trước, các phân hệ nghiệp vụ dùng lại phần nền đó. Phiên 16 là tùy chọn, đơn vị quyết định có thực hiện hay không.

Ngày 05/11/2026 đã chốt: triển khai theo mô hình đa đơn vị để kinh doanh dịch vụ, tên miền smartoffice.vnptninhbinh.com.vn. Kế hoạch thêm Phiên 2B (cổng quản trị nhà cung cấp, thuê bao) và Phiên 19B (sẵn sàng kinh doanh), tổng 22 phiên. Thiết kế chi tiết và các điều chỉnh nhỏ tại Phiên 3–6 xem tài liệu Thiết kế đa đơn vị SmartOffice.

### Giai đoạn 1. Nền tảng kỹ thuật (tuần 1–3)

| Phiên | Nội dung chính | Sản phẩm bàn giao | Tiêu chí nghiệm thu |
| --- | --- | --- | --- |
| 1. Tái cấu trúc, kiểm thử tự động | Tách mã theo phân hệ; bộ định tuyến, kiểm tra dữ liệu đầu vào dùng chung; lớp truy cập dữ liệu có sẵn tham số mã đơn vị; mã bản ghi chuyển sang UUID; nâng cấp cơ sở dữ liệu có đánh số phiên bản; ghi nhật ký lỗi ra tệp; bộ kiểm thử API cho 19 phân hệ | Bản 1.4, bộ kiểm thử, NHAT-KY-PHIEN.md, kho Git | Mọi chức năng bản 1.3 chạy như cũ; bộ kiểm thử đạt 100% |
| 2. PostgreSQL và lõi đa đơn vị | Lược đồ PostgreSQL, chỉ mục, phân trang; bảng `tenants`, cột `tenant_id` trên mọi bảng, bảo mật theo dòng; phân giải đơn vị theo tên miền; đánh số chứng từ theo đơn vị; công cụ chuyển dữ liệu từ SQLite (dữ liệu bản 1.3 thành đơn vị đầu tiên); bộ kiểm thử chéo đơn vị | Bản 1.5, công cụ chuyển dữ liệu, hướng dẫn cài PostgreSQL | Số bản ghi trước và sau khi chuyển khớp 100%; hai đơn vị thử nghiệm không xem được dữ liệu của nhau ở mọi API; danh sách 10.000 bản ghi mở dưới 1 giây |
| 2B. Cổng quản trị nhà cung cấp, thuê bao | Cổng tại admin.smartoffice.vnptninhbinh.com.vn: khởi tạo, đổi gói, tạm ngừng, chấm dứt đơn vị; hạn mức theo gói; kỳ thanh toán, nhắc gia hạn; tham số chung (lương tối thiểu, thuế); quyền hỗ trợ có thời hạn; xuất, khôi phục riêng từng đơn vị | Bản 1.5.1, cổng quản trị | Khởi tạo đơn vị mới dưới 1 phút; nhân viên nhà cung cấp không xem được dữ liệu nghiệp vụ khi chưa được cấp quyền |
| 3. Phân quyền chi tiết, nhật ký | Vai trò và quyền cấu hình được theo phân hệ, thao tác, phạm vi dữ liệu; vai trò mẫu sinh khi khởi tạo đơn vị; tách quyền quản trị đơn vị với quyền nhà cung cấp; ủy quyền khi vắng mặt; nhật ký thao tác và truy cập dữ liệu nhạy cảm | Màn hình Quản trị › Vai trò; báo cáo nhật ký | Đổi quyền không phải sửa mã; mọi lần xem bảng lương, hồ sơ cá nhân đều có nhật ký |
| 4. Bảo mật, sao lưu | HTTPS; chống giả mạo yêu cầu (CSRF); xác thực 2 lớp, bắt buộc với nhân viên nhà cung cấp; khóa phiên khi không hoạt động; mã hóa lương, số tài khoản bằng khóa riêng từng đơn vị; sao lưu tự động hằng ngày giữ 30 bản; quy trình xử lý sự cố lộ lọt dữ liệu | Bản 1.6, chính sách bảo mật, mẫu báo cáo sự cố | Không còn lỗi mức cao khi quét bảo mật; khôi phục thử từ bản sao lưu thành công |

### Giai đoạn 2. Hạ tầng dùng chung (tuần 4–5)

| Phiên | Nội dung chính | Sản phẩm bàn giao | Tiêu chí nghiệm thu |
| --- | --- | --- | --- |
| 5. Thông báo | Trung tâm thông báo; đẩy tin tức thời thay cho hỏi máy chủ định kỳ; gửi email qua máy chủ thư của đơn vị; mỗi người tự chọn loại thông báo | Bản 1.7, biểu tượng chuông thông báo, cấu hình email | Thông báo đến trong 3 giây; nhắn tin không còn hỏi máy chủ 4 giây một lần |
| 6. Tệp đính kèm dùng chung | Kho tệp chung cho đề xuất, công việc, quy trình, hồ sơ nhân sự, hợp đồng, khách hàng; xem trước PDF, ảnh; giới hạn dung lượng; phân quyền theo bản ghi gốc | Bản 1.8 | Đính kèm, xem, tải được tại các phân hệ trên; người không có quyền không tải được |
| 7. Tìm kiếm, Excel, mẫu in | Tìm kiếm toàn hệ thống; xuất tệp .xlsx; in PDF theo mẫu: phiếu thu, phiếu chi, phiếu lương, biên bản bàn giao tài sản, quyết định khen thưởng | Bản 1.9, bộ mẫu in | Mẫu in đúng mẫu đơn vị duyệt; tìm thấy bản ghi theo từ khóa ở mọi phân hệ |

### Giai đoạn 3. Hoàn thiện nghiệp vụ (tuần 6–8)

| Phiên | Nội dung chính | Sản phẩm bàn giao | Tiêu chí nghiệm thu |
| --- | --- | --- | --- |
| 8. Công việc, quy trình động | Công việc lặp lại, phụ thuộc, mẫu dự án; quy trình rẽ nhánh theo điều kiện; trình tạo biểu mẫu; cảnh báo trước hạn, quá hạn | Trình thiết kế quy trình và biểu mẫu | Đơn vị tự tạo một quy trình có rẽ nhánh, không cần lập trình |
| 9. Phê duyệt nâng cao, ký số | Biểu mẫu đề xuất tùy biến; thiết kế luồng duyệt tuần tự, song song, theo điều kiện; duyệt hàng loạt; chuẩn bị tích hợp chữ ký số theo Luật Giao dịch điện tử 2023 | Trình thiết kế luồng duyệt | Luồng duyệt cấu hình đúng quy chế chi tiêu nội bộ của đơn vị |
| 10. Chấm công, tiền lương đầy đủ | Ca làm việc, xếp ca; làm thêm ngày nghỉ, ngày lễ, ban đêm theo Điều 98 Bộ luật Lao động; nhập dữ liệu máy chấm công; giới hạn chấm công theo mạng văn phòng; gửi phiếu lương qua email; bảng kê phục vụ kê khai thuế TNCN, BHXH | Bộ quy tắc ca, công thức lương cấu hình được | Bảng lương mẫu khớp 100% bảng tính của kế toán đơn vị |
| 11. Văn thư – Lưu trữ | Sổ văn bản đến, đi; cấp số, ký hiệu tự động; chuyển văn bản đến sang quy trình xử lý; lập hồ sơ, nộp lưu tài liệu điện tử theo Luật Lưu trữ 2024 | Phân hệ Văn thư | Sổ văn bản in đúng mẫu; tra cứu được theo số, ngày, trích yếu |
| 12. Kinh doanh, tài chính | Báo giá, hợp đồng bán hàng, công nợ phải thu; đối chiếu thu chi với ngân sách; khấu hao tài sản; xuất dữ liệu sang phần mềm kế toán | Mẫu báo giá, hợp đồng; báo cáo công nợ | Công nợ khớp sổ kế toán; khấu hao tính đúng phương pháp đơn vị áp dụng |
| 13. Báo cáo điều hành | Bảng điều hành cho lãnh đạo: tiến độ, việc quá hạn, đề xuất tồn, nhân sự, chi phí, doanh số; báo cáo tuần, tháng tự gửi email | Bản 1.10, bảng điều hành | Lãnh đạo xem toàn cảnh trên một màn hình; số liệu khớp phân hệ gốc |

### Giai đoạn 4. Di động và tích hợp (tuần 9–10)

| Phiên | Nội dung chính | Sản phẩm bàn giao | Tiêu chí nghiệm thu |
| --- | --- | --- | --- |
| 14. Ứng dụng di động (PWA) | Cài lên màn hình điện thoại; thông báo đẩy; tối ưu thao tác chấm công, duyệt, nhắn tin trên điện thoại | Ứng dụng PWA | Chạy trên Android và iOS; duyệt một đề xuất trong 3 thao tác |
| 15. Tích hợp | Thông báo qua Zalo OA; đồng bộ lịch Google, Microsoft; đăng nhập một lần (SSO); API mở có khóa truy cập | Bản 1.11, tài liệu API | Nhận được thông báo Zalo; hệ thống khác đọc dữ liệu qua API có phân quyền |
| 16. Trợ lý AI (tùy chọn) | Tóm tắt văn bản; gợi ý soạn đề xuất, biên bản họp; hỏi đáp quy chế nội bộ từ kho Tài liệu | Trợ lý trong phần mềm | Dữ liệu cá nhân không gửi ra ngoài khi chưa có sự đồng ý của đơn vị |

### Giai đoạn 5. Kiểm thử, triển khai, vận hành thử (tuần 11–13)

| Phiên | Nội dung chính | Sản phẩm bàn giao | Tiêu chí nghiệm thu |
| --- | --- | --- | --- |
| 17. Kiểm thử toàn diện | Kiểm thử đầu cuối tự động; kiểm thử tải với 50 đơn vị giả lập chạy đồng thời; kiểm thử bảo mật theo danh mục OWASP Top 10; kiểm thử xâm nhập chéo đơn vị do bên độc lập thực hiện; sửa lỗi | Báo cáo kiểm thử | Đạt chỉ tiêu tại Mục I.2; không còn lỗi mức cao |
| 18. Triển khai máy chủ | Đóng gói Docker; máy chủ Linux, Nginx; tên miền `*.smartoffice.vnptninhbinh.com.vn` và chứng chỉ HTTPS wildcard; Redis; máy chủ ứng dụng chạy từ 2 bản; giám sát, cảnh báo, trang trạng thái dịch vụ; sao lưu ra ngoài máy chủ; quy trình cập nhật phiên bản | Tài liệu vận hành | Chạy liên tục 7 ngày không gián đoạn; cập nhật phiên bản không mất dữ liệu, không ngắt người dùng |
| 19. Đơn vị thí điểm, đào tạo | Khởi tạo 1–2 đơn vị khách hàng thí điểm; nhập nhân sự, phòng ban, hợp đồng, số ngày phép; cấu hình theo quy chế của từng đơn vị; tài liệu hướng dẫn theo vai trò; đào tạo người dùng chủ chốt | Bộ tài liệu hướng dẫn | 100% nhân sự đơn vị thí điểm đăng nhập được; người dùng chủ chốt tự thực hiện nghiệp vụ chính |
| 19B. Sẵn sàng kinh doanh | Trang giới thiệu, đăng ký dùng thử tự phục vụ; điều khoản sử dụng, chính sách quyền riêng tư; kênh hỗ trợ khách hàng trong phần mềm; hướng dẫn khởi đầu cho quản trị viên đơn vị; dự thảo hợp đồng dịch vụ, hợp đồng xử lý dữ liệu để pháp chế rà soát | Trang giới thiệu, bộ hồ sơ kinh doanh | Khách hàng tự đăng ký dùng thử và bắt đầu sử dụng trong 10 phút, không cần nhân viên hỗ trợ |
| 20. Vận hành thử, nghiệm thu, mở bán | Vận hành thử với đơn vị thí điểm trong 2 tuần; tiếp nhận, xử lý góp ý; nghiệm thu; mở bán dịch vụ | Bản 2.0, biên bản nghiệm thu | Đạt tiêu chí tại Mục VIII |

## VI. Phân công trách nhiệm

Đơn vị cử 01 đầu mối nghiệp vụ (chốt yêu cầu, nghiệm thu) và 01 cán bộ CNTT (máy chủ, vận hành) tham gia xuyên suốt 20 phiên.

| Nội dung | Đơn vị (đầu mối nghiệp vụ) | Claude | Cán bộ CNTT hoặc nhà cung cấp hạ tầng |
| --- | --- | --- | --- |
| Quy chế, quy trình nghiệp vụ, mẫu biểu | Cung cấp, chốt trước mỗi phiên | Đề xuất cách số hóa | — |
| Thiết kế, lập trình, kiểm thử tự động | Góp ý giao diện | Thực hiện | Rà soát mã (nếu có nhân lực) |
| Nghiệm thu từng phiên | Chạy kịch bản, xác nhận | Soạn kịch bản, sửa lỗi | Hỗ trợ cài đặt bản thử |
| Kho mã nguồn (GitHub riêng tư) | Sở hữu tài khoản | Cập nhật mã mỗi phiên | Quản trị quyền truy cập |
| Máy chủ, tên miền, chứng chỉ HTTPS, máy chủ thư | Phê duyệt chi phí | Hướng dẫn cấu hình, viết kịch bản triển khai | Chuẩn bị, vận hành |
| Bảo vệ dữ liệu cá nhân | Chỉ định người phụ trách; lập hồ sơ đánh giá tác động | Xây dựng tính năng kỹ thuật, dự thảo hồ sơ | Thực hiện biện pháp kỹ thuật tại máy chủ |
| Dữ liệu thật | Chuẩn bị danh sách nhân sự, hợp đồng, số dư phép | Viết công cụ nhập, kiểm tra | Nhập trên máy chủ chính thức |
| Đào tạo, ban hành quy định sử dụng | Tổ chức, ban hành văn bản | Soạn tài liệu, dự thảo quy chế sử dụng | Hỗ trợ người dùng |

Cấu hình máy chủ đề xuất cho 300 người dùng: 4 nhân xử lý, 8 GB bộ nhớ, 200 GB ổ SSD, hệ điều hành Linux; đặt tại đơn vị hoặc thuê máy chủ đám mây trong nước. Cấu hình chính thức chốt sau kiểm thử tải tại Phiên 17.

Khi kinh doanh dịch vụ, đơn vị chủ quản trở thành nhà cung cấp và cần bổ sung 3 đầu mối: (1) kinh doanh, chăm sóc khách hàng: gói dịch vụ, giá, hỗ trợ đơn vị khách hàng; (2) pháp chế: hợp đồng dịch vụ, hợp đồng xử lý dữ liệu, điều khoản sử dụng, nhãn hiệu; (3) vận hành: trực giám sát, xử lý sự cố theo cam kết chất lượng dịch vụ. Cấu hình máy chủ nêu trên dành cho giai đoạn thí điểm; khi số đơn vị khách hàng tăng, bổ sung máy chủ ứng dụng và bản sao cơ sở dữ liệu theo Thiết kế đa đơn vị.

## VII. Rủi ro và biện pháp

Hai rủi ro mức cao là phạm vi phình to và lộ lọt dữ liệu cá nhân; cả hai được xử lý bằng cách chốt phạm vi từng phiên và hoàn thành Phiên 3–4 trước khi có dữ liệu thật.

| Rủi ro | Mức | Biện pháp |
| --- | --- | --- |
| Dữ liệu lọt sang đơn vị khách hàng khác | Cao | 7 lớp cách ly theo Thiết kế đa đơn vị; kiểm thử chéo đơn vị tự động mỗi lần cập nhật; kiểm thử xâm nhập độc lập trước khi mở bán |
| Phạm vi phình to, yêu cầu mới chèn giữa phiên | Cao | Chốt phạm vi đầu phiên; yêu cầu mới đưa vào danh sách chờ, xếp vào phiên phù hợp |
| Lộ lọt, mất dữ liệu cá nhân | Cao | Phân quyền, nhật ký, mã hóa, sao lưu xong trước Phiên 19; chỉ dùng dữ liệu mẫu trong quá trình phát triển |
| Thiếu căn cứ pháp lý khi kinh doanh (hợp đồng, xử lý dữ liệu, nhãn hiệu) | Cao | Pháp chế soạn, rà soát hồ sơ từ Giai đoạn 0; chỉ mở bán sau khi hoàn tất Phiên 19B |
| Lỗi nâng cấp ảnh hưởng cùng lúc mọi khách hàng | Trung bình | Chạy thử trên bản sao; triển khai cuốn chiếu; bật tính năng dần theo đơn vị; sao lưu trước khi nâng cấp |
| Quy định về thuế, BHXH, lương tối thiểu thay đổi | Trung bình | Mọi mức, tỷ lệ là tham số chung cấu hình một lần cho mọi đơn vị; rà soát hằng quý và khi có văn bản mới |
| Hiệu năng giảm khi tăng số đơn vị | Trung bình | Giới hạn tần suất theo đơn vị; kiểm thử tải 50 đơn vị tại Phiên 17; chuyển đơn vị lớn sang cơ sở dữ liệu riêng |
| Khách hàng ngại thay đổi thói quen | Trung bình | Thí điểm 1–2 đơn vị; hướng dẫn khởi đầu trong phần mềm; đào tạo người dùng chủ chốt |
| Phụ thuộc vào một người nắm hệ thống | Trung bình | Mã nguồn trên kho Git của đơn vị; tài liệu kỹ thuật, vận hành; cán bộ CNTT tham gia từ Phiên 1 |
| Phiên làm việc bị gián đoạn (mất kết nối, hết dung lượng ngữ cảnh) | Thấp | Mỗi phiên một mục tiêu; ghi NHAT-KY-PHIEN.md; đẩy mã lên Git sau mỗi bước lớn |

## VIII. Tiêu chí nghiệm thu bản 2.0 và việc cần làm ngay

Bản 2.0 được nghiệm thu khi đạt đủ 6 tiêu chí sau, xác nhận bằng biên bản tại Phiên 20.

1. Nghiệp vụ: 19 phân hệ và phân hệ Văn thư chạy đúng quy chế; đầu mối nghiệp vụ xác nhận từng phân hệ.
2. Hiệu năng: 300 người dùng đồng thời, 95% thao tác dưới 1 giây (theo báo cáo kiểm thử tải).
3. Bảo mật: HTTPS; xác thực 2 lớp bắt buộc với tài khoản quản trị, tài chính, nhân sự; không còn lỗi bảo mật mức cao.
4. Sao lưu: tự động hằng ngày, lưu ngoài máy chủ; khôi phục thử thành công trong tối đa 4 giờ.
5. Dữ liệu cá nhân: phân quyền theo vai trò; nhật ký truy cập; quy trình xử lý yêu cầu của chủ thể dữ liệu và báo cáo sự cố trong 72 giờ; hồ sơ đánh giá tác động đã lập.
6. Tài liệu: hướng dẫn sử dụng theo vai trò, tài liệu vận hành, tài liệu kỹ thuật, mã nguồn trên kho Git của đơn vị.

Tiêu chí bổ sung do kinh doanh dịch vụ: hai đơn vị thí điểm vận hành ổn định 2 tuần, không phát sinh sự cố lọt dữ liệu giữa đơn vị; có báo cáo kiểm thử xâm nhập độc lập; bộ hồ sơ pháp lý (hợp đồng, điều khoản, chính sách quyền riêng tư) đã được pháp chế phê duyệt.

Việc đơn vị cần làm trước Phiên 1:

- [ ] Cử đầu mối nghiệp vụ và cán bộ CNTT phụ trách
- [ ] Xem xét, điều chỉnh các chỉ tiêu tại Mục I.2
- [ ] Tạo kho mã GitHub riêng tư và cấp quyền để Claude cập nhật mã mỗi phiên
- [ ] Gửi quy chế chi tiêu nội bộ, quy chế lương thưởng, nội quy lao động (dùng từ Phiên 3)
- [ ] Chọn phương án máy chủ: đặt tại đơn vị hoặc thuê máy chủ đám mây trong nước
- [ ] Đặt lịch 2 phiên/tuần và mở Phiên 1 theo Mẫu giao việc tại Phụ lục

Việc bổ sung do kinh doanh dịch vụ (Giai đoạn 0):

- [ ] Đăng ký bản ghi DNS wildcard và chứng chỉ HTTPS cho `*.smartoffice.vnptninhbinh.com.vn`
- [ ] Tra cứu, đăng ký nhãn hiệu tên sản phẩm; cân nhắc tên riêng nếu “SmartOffice” trùng
- [ ] Giao pháp chế soạn hợp đồng dịch vụ, hợp đồng xử lý dữ liệu cá nhân, điều khoản sử dụng
- [ ] Chốt gói dịch vụ, giá, cam kết chất lượng dịch vụ
- [ ] Chọn 1–2 đơn vị khách hàng thí điểm cho Phiên 19–20

## Phụ lục. Mẫu giao việc đầu mỗi phiên

Sao chép mẫu dưới đây vào tin nhắn đầu tiên của mỗi cuộc trò chuyện mới, điền các mục trong ngoặc vuông.

```markdown
PHIÊN [số]: [tên phiên theo Mục V] — phần mềm SmartOffice

1. Mã nguồn: [kho GitHub / thư mục đã liên kết / tệp zip đính kèm], phiên bản hiện tại [1.x]
2. Nhật ký phiên trước: đọc tệp NHAT-KY-PHIEN.md trong mã nguồn
3. Mục tiêu phiên này: [sao chép dòng tương ứng tại Mục V của Kế hoạch]
4. Yêu cầu riêng của đơn vị: [quy chế, mẫu biểu, số liệu, góp ý]
5. Lỗi tồn từ phiên trước cần sửa trước: [danh sách, hoặc "không có"]
6. Bàn giao cuối phiên: mã nguồn đã đẩy lên Git, kiểm thử tự động đạt 100%,
   CHANGELOG, hướng dẫn sử dụng, NHAT-KY-PHIEN.md, kịch bản nghiệm thu
```

## Nguồn

- [Luật Bảo vệ dữ liệu cá nhân 2025 có hiệu lực khi nào? – LuatVietnam](https://luatvietnam.vn/dan-su/luat-bao-ve-du-lieu-ca-nhan-2025-co-hieu-luc-khi-nao-568-103652-article.html)
- [Điểm mới của Nghị định 356/2025 so với Nghị định 13/2023 – Luật Việt An](https://luatvietan.vn/diem-moi-cua-nghi-dinh-356-2025-so-voi-nghi-dinh-13-2023-ve-huong-dan-bao-ve-du-lieu-ca-nhan.html)
- [Luật An ninh mạng 2025 số 116/2025/QH15 – Apolat Legal](https://apolatlegal.com/vi/laws/luat-an-ninh-mang-2025-so-116-2025-qh15/)
- [Một số nội dung mới cơ bản của Luật Giao dịch điện tử năm 2023 – Cổng PBGDPL Cần Thơ](https://pbgdpl.cantho.gov.vn/mot-so-noi-dung-moi-co-ban-cua-luat-giao-dich-dien-tu-nam-2023)
- [Luật Lưu trữ 2024 số 33/2024/QH15 – LuatVietnam](https://luatvietnam.vn/hanh-chinh/luat-luu-tru-2024-360813-d1.html)
