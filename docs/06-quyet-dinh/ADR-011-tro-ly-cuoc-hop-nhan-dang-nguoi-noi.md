# ADR-011. Trợ lý cuộc họp: nhận dạng người phát biểu, biên bản theo Nghị định 30/2020, tư vấn phân công

- Ngày: 07/11/2026
- Trạng thái: **Đề xuất, chờ chủ sở hữu duyệt** (mã có trong so-1.16.0 trên nhánh `tinh-nang/tro-ly-ai-ca-nhan`, chưa triển khai)
- Căn cứ:
  - yêu cầu của chủ sở hữu ngày 07/11/2026: "lưu được thành viên nào phát biểu, lưu nhận dạng giọng theo thành viên; kết luận theo thể thức Nghị định 30/2020; bóc tách đầu việc, tư vấn phân công nhiệm vụ cho đúng người";
  - ADR-010 (trợ lý AI đa nhiệm), mục 2E: soạn văn bản, biên bản cuộc họp;
  - Nghị định 30/2020/NĐ-CP: Điều 7, 8, 9; Phụ lục I, Phụ lục III (mức kiểm chứng xem `docs/08-phap-ly/CAN-CU-PHAP-LY.md`, dòng 10);
  - Luật Bảo vệ dữ liệu cá nhân 2025 (dòng 6 danh mục căn cứ; **chưa kiểm chứng** điều khoản cụ thể về dữ liệu sinh trắc học).

## Bối cảnh

Trợ lý cuộc họp bản so-1.15.x chép lời thành một khối chữ, không biết ai nói. Biên bản là văn bản thuần do mô hình viết, không theo thể thức. Việc cần làm chỉ gán cho người trong thành phần họp, không có căn cứ chọn người.

Ràng buộc:
- nhà cung cấp đang dùng chính là Anthropic, mà Anthropic không nhận âm thanh;
- không thêm thư viện npm (ADR-001);
- giọng nói dùng để nhận dạng người là dữ liệu sinh trắc học.

## Quyết định

### 1. Nhận dạng người nói tại trình duyệt, chỉ lưu đặc trưng

Tệp: `public/voice-id.js`.
- **Dấu giọng:** trình duyệt tính MFCC (khung 25 ms, 26 bộ lọc mel, 20 hệ số), chỉ lấy khung có tiếng nói, rồi lấy trung bình, độ lệch chuẩn và độ lệch chuẩn của delta. Kết quả là dãy 57 số, phiên bản `mfcc-v1`.
- **Âm thanh không rời máy:** âm thanh không gửi lên máy chủ SmartOffice, và mẫu giọng không gửi cho nhà cung cấp AI. Phương án dùng mẫu giọng tham chiếu của OpenAI (`known_speaker_references`) bị loại vì:
  - phải gửi giọng nói ra nước ngoài;
  - chỉ dùng được với khóa OpenAI;
  - giới hạn số người.
- **Nhận dạng:** đoạn nói được gán cho thành viên có dấu giọng gần nhất. "Chắc chắn" khi khoảng chênh so với người gần thứ hai đạt từ 12% trở lên; còn lại hiển thị "?".
- **Mô hình học trong phiên:** mỗi khi thư ký chọn lại người nói, dấu giọng của đoạn đó được gộp vào mẫu của người được chọn, nhưng không ghi lên máy chủ. Sau khi đã có từ 3 đoạn xác nhận trở lên, đoạn quá xa so với mức thường gặp (hơn 2,2 lần trung vị) bị từ chối, để "Chưa rõ".
- **Cách cắt đoạn theo bộ chép lời:**
  - Chép lời bằng trình duyệt (Anthropic): mở thêm một luồng micro chỉ để tính dấu giọng cho từng câu.
  - OpenAI `whisper-1`: dùng `verbose_json` để có mốc thời gian từng đoạn.
  - Mô hình `*-diarize`: dùng `diarized_json`, kèm nhãn người nói của nhà cung cấp. Các đoạn cùng nhãn được gộp âm thanh, và khi thư ký chọn người cho một đoạn thì áp dụng luôn cho các đoạn cùng nhãn.
  - Gemini: lời nhắc yêu cầu trả JSON các đoạn kèm mốc thời gian.
  - `gpt-4o-transcribe`: không có mốc thời gian, nên cả đoạn 60 giây là một đoạn.
- **Lấy mẫu tại chỗ:** thư ký bấm "Lấy mẫu" khi một thành viên đang nói (6 giây). Mẫu này chỉ dùng trong phiên, không lưu.

### 2. Mẫu giọng của từng người: tự đăng ký, có đồng ý, xóa được

Bảng `voice_profiles` lưu: `user_id`, `vec` (57 số), `version`, `seconds`, `consent_at`, `updated_at`. Không có cột nào chứa âm thanh.

- **Đăng ký:** chỉ chính người dùng đăng ký, tại Tài khoản › Mẫu giọng nói của tôi.
  - Phải tích đồng ý; máy chủ từ chối nếu `consent !== true`.
  - Phải đọc liên tục ít nhất 10 giây.
  - Quản trị viên không đăng ký thay được.
- **Đọc mẫu giọng** (`GET /api/meetings/:id/voices`):
  - chỉ người chủ trì, người tạo cuộc họp, quản trị viên hoặc thành phần cuộc họp được gọi;
  - chỉ trả mẫu của người trong thành phần cuộc họp đó.
- **Nhật ký an ninh:** đăng ký (`voice_enroll`), xóa (`voice_delete`) và mỗi lần đọc (`voice_read`) đều được ghi.
- **Trợ lý hội thoại:** các đường dẫn mẫu giọng và bản ghi phát biểu không có trong danh mục API mà trợ lý được đọc (`ai-tools.js`), nên mô hình không đọc được dấu giọng.
- **Sao lưu:** bảng nằm trong bản sao lưu (ADR-009) như mọi bảng khác. Tệp sao lưu vì vậy chứa dữ liệu sinh trắc học và phải được quản lý tương ứng.

### 3. Bản ghi phát biểu của cuộc họp

Bảng `meeting_transcripts` lưu các đoạn `{t, uid, name, text}` và thống kê `speakers` (số lượt, thời lượng ước tính, số chữ theo người).

- Người chủ trì, người tạo cuộc họp hoặc quản trị viên lưu được; thành phần cuộc họp xem được.
- Mã người ngoài thành phần họp bị bỏ, đoạn đó thành "Chưa rõ người nói".
- Tối đa 3.000 đoạn, mỗi đoạn tối đa 2.000 ký tự.

### 4. Văn bản theo thể thức: mã dựng khung, AI viết nội dung

Tệp: `public/nd30.js`.
- **Mô hình chỉ trả nội dung** dạng JSON: tóm tắt, diễn biến (ý kiến từng người), kết luận, đầu việc.
- **Mã tự dựng thể thức** (cố định):
  - **Biên bản (Mẫu 1.9):**
    - tên cơ quan chủ quản và cơ quan ban hành in hoa; Quốc hiệu, Tiêu ngữ;
    - `Số: …/BB-<viết tắt>`;
    - các mục thời gian bắt đầu, địa điểm, thành phần, vắng mặt, chủ trì (chủ tọa), thư ký;
    - diễn biến, kết luận, phân công;
    - dòng "Cuộc họp kết thúc vào … giờ …, ngày … tháng … năm …./.";
    - chữ ký THƯ KÝ, CHỦ TỌA; nơi nhận.
  - **Thông báo kết luận (Mẫu 1.4):**
    - `Số: …/TB-…`; địa danh, ngày tháng (ngày nhỏ hơn 10 và tháng 1, 2 có số 0);
    - tên loại, trích yếu "Kết luận của … tại cuộc họp …";
    - mở đầu, các kết luận, mục "Tổ chức thực hiện";
    - câu kết "… thông báo để … biết, thực hiện./.";
    - nơi nhận; quyền hạn (TL., KT.…) và chức vụ người ký in hoa.
  - **Tệp Word:** khổ A4, lề trên/dưới 20 mm, trái 30 mm, phải 15 mm, Times New Roman.
- **Số văn bản** để trống (…) cho Văn thư cấp khi đăng ký (Điều 15).
- **Thông tin thể thức** (cơ quan chủ quản, chữ viết tắt, địa danh) nhớ tại trình duyệt của người lập (localStorage).

### 5. Bóc tách đầu việc và tư vấn phân công

`GET /api/meetings/:id/assign-context` trả danh sách ứng viên: thành phần họp và trưởng các phòng (kể cả người không dự họp), kèm chức vụ và phòng ban.

- **Tải công việc:** số việc đang làm, số việc quá hạn, số việc đến hạn trong 7 ngày. Chỉ trả cho người chủ trì, người tạo cuộc họp hoặc quản trị viên; thành viên thường không thấy, và dữ liệu này cũng không gửi cho mô hình.
- **Mỗi đầu việc gồm:** người chủ trì, người phối hợp, hạn, nguồn và lý do.
  - Nguồn "giao_ro": cuộc họp đã giao cho người đó.
  - Nguồn "de_xuat": trợ lý chọn theo thứ tự chức trách, người đã phát biểu và nhận trách nhiệm, rồi tải công việc.
  - Máy chủ chỉ nhận mã người có trong thành phần họp hoặc danh sách ứng viên. Lý do hiển thị cho người giao việc.
- **Giao việc:** người chủ trì nhận việc qua `assignee_id`, người phối hợp qua `followers` của phân hệ Công việc. Quyền tạo việc do API Công việc kiểm tra như thường.

## Hệ quả

- **Độ chính xác chưa được đo với giọng thật.** Kiểm thử tự động chỉ dùng giọng tổng hợp (12/12 đoạn đúng), tức là kiểm tra cơ chế. Độ chính xác thực tế phụ thuộc micro, phòng họp, số người nói và việc mẫu giọng ghi bằng micro khác với micro phòng họp. Vì vậy giao diện luôn coi kết quả là gợi ý, thư ký xác nhận.
- **Chép lời bằng trình duyệt cần mở micro hai lần.** Nếu trình duyệt không cho mở luồng thứ hai, vẫn chép lời được nhưng không gợi ý người nói.
- **Giới hạn dữ liệu sinh trắc học.** Đặc trưng giọng là dữ liệu sinh trắc học. Trước khi dùng thật, đơn vị cần:
  - pháp chế xác nhận căn cứ xử lý dữ liệu theo Luật Bảo vệ dữ liệu cá nhân 2025 (**chưa kiểm chứng**);
  - quy định thời hạn lưu (hiện chưa có hạn tự xóa).
- **Mẫu cũ khi đổi thuật toán.** Đổi thuật toán đặc trưng phải tăng `VOICE_VERSION`; mẫu cũ bị bỏ qua và người dùng ghi lại.
- **Nhà cung cấp chưa kiểm chứng với khóa thật:** OpenAI `diarized_json`/`verbose_json` và JSON đoạn của Gemini mới kiểm thử với máy chủ giả lập.

## Phương án đã cân nhắc

| Phương án | Lý do không chọn |
|---|---|
| Gửi mẫu giọng tham chiếu cho OpenAI (`known_speaker_references`) | Gửi dữ liệu sinh trắc học ra nước ngoài; chỉ dùng được với OpenAI; giới hạn số người |
| Mô hình nhúng giọng học sâu (x-vector, ECAPA) chạy tại trình duyệt | Cần thư viện và tệp mô hình hàng chục MB (vi phạm ADR-001 nếu không có ADR riêng) |
| Lưu âm thanh mẫu trên máy chủ | Tăng rủi ro dữ liệu; không cần cho cách so khớp đã chọn |
| Để mô hình tự viết cả thể thức | Không ổn định, khó kiểm thử; thể thức là quy định cố định nên mã dựng chính xác hơn |
