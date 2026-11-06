# Thiết kế đa đơn vị SmartOffice

> Bản sao xuất ngày 06/11/2026 từ tài liệu gốc trên Claude Docs: https://claude.ai/artifact/WG2yo2PT5VFcwg13EY2sWi (bản sửa 13). Lưu ý: thiết kế này lập trước khi chọn Cloudflare Workers + Durable Objects (xem docs/06-quyet-dinh/ADR-002); phần PostgreSQL + RLS cần đánh giá lại.

Nov 5, 2026 · @Nguyễn Văn Thụ

## I. Kết luận và mô hình đề xuất

Đề xuất mô hình lai: mặc định mọi đơn vị dùng chung một cơ sở dữ liệu PostgreSQL, mỗi bảng có cột mã đơn vị và được khóa bằng chính sách bảo mật theo dòng (Row-Level Security); đơn vị lớn hoặc có yêu cầu riêng được tách sang cơ sở dữ liệu riêng mà không phải sửa mã nguồn.

### 1. So sánh các mô hình

| Tiêu chí | A. Mỗi đơn vị một cơ sở dữ liệu | B. Mỗi đơn vị một schema | C. Bảng chung, có mã đơn vị |
| --- | --- | --- | --- |
| Mức cách ly dữ liệu | Cao nhất | Cao | Trung bình; đạt mức cao khi có bảo mật theo dòng |
| Chi phí hạ tầng cho 50 đơn vị | Cao: 50 cơ sở dữ liệu, 50 kết nối | Trung bình | Thấp: 1 cơ sở dữ liệu |
| Nâng cấp phiên bản | Chạy nâng cấp 50 lần, dễ lệch phiên bản | Chạy 50 lần | Chạy 1 lần |
| Khởi tạo đơn vị mới | Vài phút, cần quyền quản trị máy chủ | Vài giây | Tức thì: thêm một dòng dữ liệu |
| Sao lưu, khôi phục riêng một đơn vị | Dễ | Dễ | Cần công cụ xuất theo mã đơn vị |
| Báo cáo vận hành toàn hệ thống | Khó | Trung bình | Dễ |
| Phù hợp | Đơn vị yêu cầu dữ liệu tách biệt hoàn toàn | Số đơn vị ít, ổn định | Nhiều đơn vị vừa và nhỏ |

### 2. Mô hình lai được chọn

1. Mặc định dùng mô hình C cho mọi đơn vị, bảo vệ bằng 7 lớp cách ly tại Mục IV.
2. Bảng định tuyến ghi đơn vị nào nằm ở cơ sở dữ liệu nào. Khi một đơn vị vượt khoảng 1.000 người dùng, hoặc hợp đồng yêu cầu dữ liệu riêng, chuyển đơn vị đó sang cơ sở dữ liệu riêng (mô hình A) bằng công cụ chuyển, giữ nguyên mã nguồn.
3. Vẫn hỗ trợ cài đặt tại chỗ cho một đơn vị (như bản 1.3): khi đó hệ thống chỉ có một đơn vị.

Ngưỡng 1.000 người dùng là mức đề xuất, chốt lại sau kiểm thử tải.

## II. Kiến trúc tổng thể

Mọi đơn vị dùng chung một cửa vào và một bộ máy chủ ứng dụng. Đơn vị được xác định ngay từ tên miền, và mã đơn vị đi kèm yêu cầu đến tận cơ sở dữ liệu.

> Sơ đồ kiến trúc đa đơn vị (đường đi của một yêu cầu) xem tại bản gốc trên Claude Docs.

Bước 1 và bước 4 là hai chốt chặn chính. Yêu cầu không xác định được đơn vị bị từ chối tại bước 1. Câu truy vấn viết thiếu điều kiện mã đơn vị vẫn bị cơ sở dữ liệu lọc theo `tenant_id` đã gán ở bước 4. Đường nét đứt là thành phần tùy chọn hoặc dành riêng cho nhà cung cấp.

## III. Mô hình dữ liệu

Mọi bảng nghiệp vụ có cột `tenant_id`; mọi ràng buộc duy nhất, chỉ mục và số chứng từ đều tính trong phạm vi từng đơn vị.

### 1. Bảng dùng chung của hệ thống (không thuộc đơn vị nào)

| Bảng | Nội dung chính |
| --- | --- |
| `tenants` | Mã đơn vị, tên, mã số thuế, tên miền phụ (`donvia.smartoffice.vn`ptninhbinh.com.vn), tên miền riêng (nếu có), gói dịch vụ, trạng thái, ngày hết hạn, cơ sở dữ liệu lưu trữ |
| `tenant_settings` | Cấu hình riêng: ngưỡng duyệt, giờ làm việc, ngày lễ, tham số lương, nhận diện thương hiệu, phân hệ bật/tắt |
| `plans` | Gói dịch vụ: số người dùng tối đa, dung lượng tệp, phân hệ được dùng |
| `operators` | Tài khoản của nhà cung cấp (vận hành, hỗ trợ), tách hẳn khỏi tài khoản người dùng đơn vị |
| `operator_audit` | Nhật ký mọi thao tác của nhà cung cấp, kể cả lần truy cập hỗ trợ vào đơn vị |
| `usage_daily` | Số liệu sử dụng hằng ngày theo đơn vị: người dùng hoạt động, dung lượng, số yêu cầu |

### 2. Quy tắc cho bảng nghiệp vụ

1. Mọi bảng (người dùng, phòng ban, công việc, đề xuất, bảng lương…) thêm cột `tenant_id NOT NULL`, tham chiếu `tenants`.
2. Ràng buộc duy nhất gắn kèm mã đơn vị: `(tenant_id, username)`, `(tenant_id, code)`. Hai đơn vị có thể cùng có tài khoản `admin` hoặc cùng số đề xuất ĐX-2026-0001.
3. Chỉ mục bắt đầu bằng `tenant_id`, ví dụ `(tenant_id, assignee_id, status)`, để truy vấn một đơn vị không phải quét dữ liệu của đơn vị khác.
4. Khóa ngoại gồm cả mã đơn vị, ví dụ công việc tham chiếu `(tenant_id, project_id)`: cơ sở dữ liệu tự chặn việc gắn công việc của đơn vị A vào dự án của đơn vị B.
5. Số chứng từ (đề xuất, phiếu thu chi, quy trình, tài sản) cấp từ bảng `tenant_counters (tenant_id, loại, năm, số cuối)`, khóa theo dòng khi cấp số để không trùng khi nhiều người gửi cùng lúc.
6. Mã định danh bản ghi dùng UUID thay cho số tăng dần, để không đoán được bản ghi của đơn vị khác và thuận tiện khi chuyển đơn vị sang cơ sở dữ liệu riêng.
7. Tệp đính kèm lưu theo đường dẫn `tenants/{tenant_id}/…`; mỗi đơn vị có hạn mức dung lượng theo gói.

### 3. Người dùng thuộc nhiều đơn vị

Mặc định mỗi tài khoản thuộc một đơn vị. Trường hợp tập đoàn có công ty con, hoặc người kiêm nhiệm nhiều nơi: dùng bảng `identities` (một danh tính đăng nhập) liên kết với nhiều tài khoản trong từng đơn vị; sau đăng nhập, người dùng chọn đơn vị làm việc. Dữ liệu giữa các đơn vị vẫn tách biệt.

## IV. Cách ly dữ liệu giữa các đơn vị

Dữ liệu của đơn vị này lọt sang đơn vị khác là rủi ro lớn nhất của mô hình dùng chung. Vì vậy thiết kế đặt 7 lớp bảo vệ độc lập; một lớp bị lỗi thì các lớp còn lại vẫn chặn được.

| Lớp | Cơ chế | Chặn được |
| --- | --- | --- |
| 1. Xác định đơn vị | Phân giải đơn vị từ tên miền phụ hoặc tên miền riêng; phiên đăng nhập ghi mã đơn vị, đối chiếu lại ở mọi yêu cầu | Dùng phiên của đơn vị A để gọi vào tên miền của đơn vị B |
| 2. Bảo mật theo dòng trong PostgreSQL | Mỗi giao dịch gán `app.tenant_id`; chính sách RLS trên mọi bảng chỉ trả về dòng cùng mã đơn vị; ứng dụng kết nối bằng tài khoản không có quyền bỏ qua RLS | Câu truy vấn viết thiếu điều kiện mã đơn vị |
| 3. Lớp truy cập dữ liệu | Mọi truy vấn đi qua một lớp chung tự thêm mã đơn vị; không cho viết câu lệnh SQL trực tiếp trong phân hệ | Lập trình viên quên điều kiện lọc |
| 4. Khóa ngoại kèm mã đơn vị | Tham chiếu giữa các bảng luôn gồm `tenant_id` | Gắn nhầm bản ghi của đơn vị khác |
| 5. Tệp đính kèm | Lưu theo thư mục từng đơn vị; tải về qua đường dẫn ký số, hết hạn sau 5 phút | Đoán đường dẫn tệp của đơn vị khác |
| 6. Bộ nhớ đệm, thông báo, hàng đợi | Mọi khóa bộ nhớ đệm, kênh thông báo tức thời, tác vụ nền đều mang mã đơn vị | Thông báo, số liệu đệm hiển thị nhầm đơn vị |
| 7. Kiểm thử tự động chéo đơn vị | Biến mỗi API thành ca kiểm thử: đăng nhập đơn vị A, gọi bản ghi của đơn vị B, bắt buộc nhận lỗi 404; chạy mỗi lần cập nhật mã | Lỗi mới phát sinh khi thêm tính năng |

Trả lỗi 404 thay vì 403 khi truy cập bản ghi của đơn vị khác, để không lộ việc bản ghi đó tồn tại. Nhật ký lỗi, nhật ký truy cập đều ghi mã đơn vị để truy vết khi có sự cố.

Nhân viên của nhà cung cấp mặc định không xem được dữ liệu nghiệp vụ của đơn vị. Khi cần hỗ trợ, quản trị viên đơn vị cấp quyền truy cập có thời hạn (tối đa 24 giờ). Mọi thao tác trong thời gian đó ghi vào `operator_audit`, và đơn vị xem được nhật ký này.

## V. Cấu hình riêng từng đơn vị và gói dịch vụ

Một mã nguồn duy nhất phục vụ mọi đơn vị. Khác biệt giữa các đơn vị nằm hoàn toàn trong cấu hình, không tách nhánh mã riêng cho đơn vị nào.

### 1. Các nội dung đơn vị tự cấu hình

| Nhóm | Nội dung |
| --- | --- |
| Nhận diện | Tên đơn vị, logo, màu chủ đạo, tên miền riêng, tiêu đề mẫu in |
| Tổ chức | Phòng ban, chức danh, vai trò và quyền |
| Phê duyệt | Ngưỡng tiền, người duyệt, luồng duyệt theo loại đề xuất |
| Chấm công | Giờ làm việc, ca, ngày nghỉ lễ, làm việc thứ Bảy |
| Tiền lương | Vùng lương tối thiểu, tỷ lệ bảo hiểm, giảm trừ gia cảnh, biểu thuế. Giá trị mặc định lấy từ bảng tham số chung của hệ thống; đơn vị chỉ ghi đè khi khác |
| Phân hệ | Bật/tắt từng phân hệ trong phạm vi gói dịch vụ |
| Biểu mẫu, quy trình | Mẫu đề xuất, mẫu quy trình, tiêu chí đánh giá |

Khi Nhà nước thay đổi mức lương tối thiểu, giảm trừ gia cảnh hoặc biểu thuế, nhà cung cấp cập nhật một lần tại bảng tham số chung, có ghi ngày hiệu lực. Mọi đơn vị không ghi đè tham số đó được áp dụng tự động.

### 2. Gói dịch vụ (đề xuất)

| Gói | Người dùng tối đa | Dung lượng tệp | Phân hệ | Lưu trữ dữ liệu |
| --- | --- | --- | --- | --- |
| Cơ bản | 50 | 20 GB | Công việc, Phê duyệt, Thông tin | Cơ sở dữ liệu dùng chung |
| Tiêu chuẩn | 300 | 100 GB | Thêm Nhân sự, Chấm công, Tiền lương | Cơ sở dữ liệu dùng chung |
| Nâng cao | Không giới hạn | 500 GB | Toàn bộ, kèm API và tích hợp | Cơ sở dữ liệu riêng (tùy chọn) |

Các mức trong bảng là đề xuất ban đầu, chốt theo chi phí hạ tầng thực tế. Hệ thống kiểm tra hạn mức khi thêm người dùng, tải tệp, bật phân hệ. Vượt 90% hạn mức thì báo cho quản trị viên đơn vị.

## VI. Vòng đời đơn vị và cổng quản trị nhà cung cấp

Mỗi đơn vị đi qua 5 trạng thái. Mọi chuyển trạng thái thực hiện trên cổng quản trị của nhà cung cấp và được ghi nhật ký.

| Trạng thái | Diễn giải | Người dùng đơn vị |
| --- | --- | --- |
| Dùng thử | Tạo tự động từ trang đăng ký hoặc do nhà cung cấp tạo; có sẵn dữ liệu mẫu; thời hạn 30 ngày | Dùng đầy đủ |
| Hoạt động | Đã ký hợp đồng; xóa dữ liệu mẫu theo yêu cầu, nhập dữ liệu thật | Dùng đầy đủ trong phạm vi gói |
| Tạm ngừng | Quá hạn thanh toán hoặc theo yêu cầu của đơn vị | Chỉ đăng nhập để xem và xuất dữ liệu |
| Chấm dứt | Hết hợp đồng; bàn giao toàn bộ dữ liệu cho đơn vị; giữ 30 ngày để đơn vị kiểm tra | Không đăng nhập được |
| Đã xóa | Xóa dữ liệu khỏi cơ sở dữ liệu, kho tệp; bản sao lưu cũ hết hạn theo chu kỳ; lập biên bản xóa dữ liệu | — |

### Khởi tạo đơn vị mới (tự động, dưới 1 phút)

1. Nhập tên, mã số thuế, tên miền phụ, gói dịch vụ, email quản trị viên.
2. Hệ thống tạo bản ghi đơn vị, cấu hình mặc định, vai trò mẫu, mẫu quy trình, mẫu đề xuất, tiêu chí đánh giá.
3. Gửi email mời quản trị viên đơn vị đặt mật khẩu và bật xác thực 2 lớp.
4. Quản trị viên đơn vị tự khai báo phòng ban, nhập nhân sự từ Excel, cấu hình theo quy chế.

### Cổng quản trị nhà cung cấp

- Địa chỉ riêng (ví dụ `admin.smartoffice.vn`ptninhbinh.com.vn), tài khoản riêng, bắt buộc xác thực 2 lớp, giới hạn địa chỉ IP truy cập.
- Chức năng: danh sách đơn vị, khởi tạo, đổi gói, gia hạn, tạm ngừng, chấm dứt; số liệu sử dụng; tham số chung (lương tối thiểu, thuế); thông báo bảo trì gửi mọi đơn vị; bật tính năng thử nghiệm cho từng đơn vị.
- Không có chức năng xem nội dung công việc, đề xuất, hồ sơ, bảng lương của đơn vị, trừ khi đơn vị cấp quyền hỗ trợ có thời hạn (Mục IV).

## VII. Sao lưu, nâng cấp phiên bản, mở rộng quy mô

Hệ thống sao lưu toàn bộ mỗi ngày và ghi nhật ký giao dịch liên tục, đồng thời có công cụ xuất hoặc khôi phục riêng từng đơn vị. Nâng cấp chạy một lần cho mọi đơn vị, tính năng mới bật dần theo từng đơn vị.

### 1. Sao lưu, khôi phục

| Loại | Cách làm | Phục vụ |
| --- | --- | --- |
| Toàn hệ thống | Sao lưu đầy đủ hằng ngày và lưu nhật ký giao dịch liên tục; giữ 30 ngày; lưu ở vị trí khác máy chủ chính | Khôi phục khi hỏng máy chủ, về đúng thời điểm bất kỳ trong 30 ngày |
| Riêng một đơn vị | Công cụ xuất toàn bộ dữ liệu và tệp của một mã đơn vị thành một gói có mã hóa | Bàn giao dữ liệu khi chấm dứt hợp đồng; khôi phục một đơn vị bị xóa nhầm mà không ảnh hưởng đơn vị khác; chuyển sang cơ sở dữ liệu riêng |
| Theo yêu cầu của đơn vị | Quản trị viên đơn vị tự tải bản xuất dữ liệu (Excel, JSON, tệp đính kèm) | Đơn vị tự lưu trữ, đáp ứng quyền kiểm soát dữ liệu của mình |

### 2. Nâng cấp phiên bản

1. Nâng cấp cơ sở dữ liệu chỉ được thêm cột, thêm bảng (tương thích ngược). Thay đổi phá vỡ chia làm 2 lần phát hành, để mỗi lần cập nhật không phải dừng hệ thống.
2. Chạy thử trên bản sao dữ liệu thật (đã ẩn thông tin cá nhân) trước khi áp dụng.
3. Triển khai cuốn chiếu: máy chủ ứng dụng cập nhật lần lượt, người dùng không bị ngắt.
4. Tính năng mới bật trước cho đơn vị thử nghiệm, sau đó mới bật cho toàn bộ.

### 3. Mở rộng quy mô

- Máy chủ ứng dụng không lưu trạng thái (phiên đăng nhập, thông báo đặt tại Redis), nên thêm máy chủ khi tăng tải.
- PostgreSQL có bản sao chỉ đọc phục vụ báo cáo; bảng lớn (nhật ký, chấm công, tin nhắn) chia phân vùng theo tháng.
- Giới hạn tần suất yêu cầu theo từng đơn vị, để một đơn vị chạy tác vụ nặng (xuất dữ liệu lớn, nhập hàng nghìn dòng) không làm chậm các đơn vị khác.
- Tác vụ nặng (tính lương, xuất báo cáo, gửi email hàng loạt) chạy qua hàng đợi nền, chia lượt công bằng giữa các đơn vị.
- Đơn vị vượt ngưỡng tại Mục I.2 chuyển sang cơ sở dữ liệu riêng qua bảng định tuyến.

## VIII. Bảo vệ dữ liệu cá nhân và trách nhiệm pháp lý

Khi cung cấp cho nhiều đơn vị, mỗi đơn vị quyết định mục đích xử lý dữ liệu người lao động của mình, còn nhà cung cấp xử lý dữ liệu theo yêu cầu của đơn vị. Trách nhiệm hai bên cần ghi rõ trong hợp đồng, căn cứ [Luật Bảo vệ dữ liệu cá nhân năm 2025](https://luatvietnam.vn/dan-su/luat-bao-ve-du-lieu-ca-nhan-2025-co-hieu-luc-khi-nao-568-103652-article.html) và [Nghị định 356/2025/NĐ-CP](https://luatvietan.vn/diem-moi-cua-nghi-dinh-356-2025-so-voi-nghi-dinh-13-2023-ve-huong-dan-bao-ve-du-lieu-ca-nhan.html) (cùng hiệu lực từ 01/01/2026).

| Nội dung | Đơn vị sử dụng | Nhà cung cấp SmartOffice |
| --- | --- | --- |
| Vai trò | Bên kiểm soát dữ liệu cá nhân của người lao động | Bên xử lý dữ liệu cá nhân theo hợp đồng |
| Thông báo, đồng ý của người lao động | Thực hiện; phần mềm cung cấp mẫu thông báo và ghi nhận đồng ý khi đăng nhập lần đầu | Cung cấp công cụ |
| Yêu cầu xem, sửa, xóa dữ liệu | Tiếp nhận, xử lý đúng thời hạn | Cung cấp chức năng xuất, sửa, xóa dữ liệu của một người |
| Hồ sơ đánh giá tác động | Lập cho hoạt động xử lý của đơn vị | Lập cho hoạt động xử lý của nhà cung cấp; cung cấp tài liệu kỹ thuật cho đơn vị |
| Sự cố lộ lọt dữ liệu | Báo cáo cơ quan có thẩm quyền theo quy định | Thông báo ngay cho đơn vị bị ảnh hưởng, kèm nhật ký để đơn vị kịp báo cáo trong 72 giờ |
| Chấm dứt hợp đồng | Nhận lại dữ liệu | Bàn giao, xóa dữ liệu, lập biên bản xóa |

Yêu cầu kỹ thuật bổ sung:

1. Chức năng “Dữ liệu của tôi”: người lao động xem và tải về dữ liệu cá nhân của mình; đề nghị sửa, xóa được chuyển thành đề xuất gửi Phòng HC–NS của đơn vị.
2. Mã hóa trường nhạy cảm (lương, số tài khoản, số định danh, địa chỉ) bằng khóa riêng của từng đơn vị. Nếu một khóa bị lộ, dữ liệu của đơn vị khác vẫn an toàn.
3. Máy chủ và bản sao lưu đặt tại Việt Nam. Trước khi cung cấp dịch vụ cho đơn vị bên ngoài, rà soát yêu cầu về lưu trữ dữ liệu và cấp độ an toàn hệ thống theo [Luật An ninh mạng năm 2025](https://apolatlegal.com/vi/laws/luat-an-ninh-mang-2025-so-116-2025-qh15/) (hiệu lực 01/7/2026) và các văn bản hướng dẫn.

Phần phân định trách nhiệm trên là đề xuất về mặt kỹ thuật. Hợp đồng cung cấp dịch vụ và hợp đồng xử lý dữ liệu cần do luật sư soạn thảo, rà soát.

## IX. Điều chỉnh Kế hoạch phát triển và rủi ro

Phần đa đơn vị cần làm ngay trong Giai đoạn 1, cùng lúc chuyển sang PostgreSQL. Nếu để đến sau khi hoàn thiện nghiệp vụ, sẽ phải sửa lại toàn bộ các bảng và truy vấn. Kế hoạch tăng từ 20 lên 21 phiên, thời gian thêm khoảng nửa tuần.

### 1. Các phiên thay đổi

| Phiên | Thay đổi so với Kế hoạch hiện hành |
| --- | --- |
| 1. Tái cấu trúc | Lớp truy cập dữ liệu thiết kế sẵn tham số mã đơn vị; chuyển mã bản ghi sang UUID |
| 2. PostgreSQL và lõi đa đơn vị | Thêm: bảng `tenants`, cột `tenant_id` trên mọi bảng, bảo mật theo dòng, phân giải đơn vị theo tên miền, đánh số chứng từ theo đơn vị, bộ kiểm thử chéo đơn vị. Dữ liệu bản 1.3 chuyển thành đơn vị đầu tiên |
| 2B. Cổng quản trị nhà cung cấp (mới) | Khởi tạo, đổi gói, tạm ngừng, chấm dứt đơn vị; hạn mức theo gói; tham số chung; quyền hỗ trợ có thời hạn; xuất và khôi phục riêng từng đơn vị |
| 3. Phân quyền | Vai trò mẫu sinh tự động khi khởi tạo đơn vị; tách quyền quản trị đơn vị với quyền nhà cung cấp |
| 4. Bảo mật | Mã hóa trường nhạy cảm bằng khóa riêng từng đơn vị; xác thực 2 lớp bắt buộc với nhân viên nhà cung cấp |
| 5. Thông báo | Kênh thông báo, hàng đợi gắn mã đơn vị; cấu hình máy chủ thư riêng cho từng đơn vị |
| 6. Tệp đính kèm | Lưu theo thư mục đơn vị; đường dẫn tải có ký số; hạn mức dung lượng |
| 17. Kiểm thử | Kiểm thử tải với 50 đơn vị giả lập chạy đồng thời; kiểm thử xâm nhập chéo đơn vị |
| 18. Triển khai | Tên miền dạng `*.smartoffice.vn`ptninhbinh.com.vn và chứng chỉ HTTPS tương ứng; Redis; máy chủ ứng dụng chạy nhiều bản |

### 2. Rủi ro riêng của mô hình đa đơn vị

| Rủi ro | Mức | Biện pháp |
| --- | --- | --- |
| Dữ liệu lọt sang đơn vị khác | Cao | 7 lớp cách ly tại Mục IV; kiểm thử chéo đơn vị tự động mỗi lần cập nhật |
| Lỗi nâng cấp ảnh hưởng cùng lúc mọi đơn vị | Cao | Chạy thử trên bản sao; triển khai cuốn chiếu; bật tính năng dần theo đơn vị; sao lưu ngay trước khi nâng cấp |
| Một đơn vị chiếm hết tài nguyên | Trung bình | Giới hạn tần suất theo đơn vị; tác vụ nặng qua hàng đợi; chuyển đơn vị lớn sang cơ sở dữ liệu riêng |
| Đơn vị yêu cầu tùy biến riêng, dẫn đến tách nhánh mã | Trung bình | Chỉ đáp ứng qua cấu hình; yêu cầu có ích cho nhiều đơn vị đưa vào sản phẩm chung |
| Sự cố máy chủ làm ngừng mọi đơn vị cùng lúc | Trung bình | Máy chủ ứng dụng chạy từ 2 bản trở lên; cơ sở dữ liệu có bản sao dự phòng; giám sát, cảnh báo 24/7 |

### 3. Quyết định đã chốt ngày 05/11/2026

1. Điều chỉnh Kế hoạch phát triển theo mô hình đa đơn vị tại Mục IX.1.
2. Tên miền chính: `smartoffice.vnptninhbinh.com.vn`. Mỗi đơn vị khách hàng có tên miền `<mã đơn vị>.smartoffice.vnptninhbinh.com.vn`; cổng nhà cung cấp tại `admin.smartoffice.vnptninhbinh.com.vn`. Cần một chứng chỉ HTTPS dạng wildcard `*.smartoffice.vnptninhbinh.com.vn` và bản ghi DNS wildcard trỏ về máy chủ.
3. Phần mềm được kinh doanh dịch vụ cho tổ chức bên ngoài. Do đó phần trách nhiệm pháp lý tại Mục VIII là bắt buộc, và bổ sung các yêu cầu tại Mục IX.4.

### 4. Yêu cầu bổ sung do kinh doanh dịch vụ

| Nội dung | Yêu cầu | Thực hiện tại |
| --- | --- | --- |
| Pháp lý | Điều khoản sử dụng, chính sách quyền riêng tư công khai trên trang đăng ký; hợp đồng dịch vụ và hợp đồng xử lý dữ liệu mẫu (bộ phận pháp chế soạn, rà soát) | Giai đoạn 0, Phiên 19B |
| Nhãn hiệu | Tra cứu, đăng ký nhãn hiệu tên sản phẩm trước khi quảng bá. Tên “SmartOffice” đang được dùng phổ biến, có khả năng trùng; cân nhắc tên riêng | Giai đoạn 0 |
| Cam kết chất lượng | Cam kết thời gian hoạt động (đề xuất 99,5%/tháng), thời gian phản hồi hỗ trợ, thời gian khôi phục khi sự cố; trang trạng thái dịch vụ | Phiên 18 |
| Thuê bao | Theo dõi gói, kỳ thanh toán, nhắc gia hạn, tự tạm ngừng khi quá hạn; xuất dữ liệu sang hệ thống hóa đơn điện tử của doanh nghiệp | Phiên 2B |
| Khách hàng mới | Trang giới thiệu, đăng ký dùng thử tự phục vụ, hướng dẫn khởi đầu cho quản trị viên đơn vị | Phiên 19B |
| Hỗ trợ khách hàng | Kênh tiếp nhận yêu cầu hỗ trợ ngay trong phần mềm, theo dõi xử lý theo cam kết | Phiên 19B |
| An toàn thông tin | Kiểm thử xâm nhập độc lập trước khi mở bán; hồ sơ đánh giá tác động xử lý dữ liệu của nhà cung cấp; xác định cấp độ hệ thống theo văn bản hướng dẫn Luật An ninh mạng 2025 | Phiên 17 |

Với Phiên 19B, Kế hoạch phát triển gồm 22 phiên, khoảng 13 tuần.
