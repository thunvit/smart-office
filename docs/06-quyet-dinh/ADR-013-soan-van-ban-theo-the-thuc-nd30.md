# ADR-013. Soạn văn bản theo thể thức Nghị định 30/2020/NĐ-CP: AI viết nội dung, mã dựng thể thức, xuất .docx

- Ngày: 10/11/2026
- Trạng thái: **Đề xuất**, chờ chủ sở hữu duyệt. Mã có trong so-1.18.0 trên nhánh `claude/amazing-thompson-i86yt4`, chưa hợp nhất vào `main`, chưa triển khai lên Cloudflare.
- Căn cứ:
  - yêu cầu của chủ sở hữu ngày 10/11/2026: "nâng cấp tính năng soạn thảo văn bản theo thể thức, tham khảo nghị định 30/2020", kèm hai tệp Word `30_2020_ND-CP.doc` (toàn văn Nghị định) và `30_2020_ND-CP_Phu_luc_1.doc` (Phụ lục I đến VI);
  - Nghị định 30/2020/NĐ-CP: Điều 7 (các loại văn bản hành chính), Điều 8, 9 (thể thức, kỹ thuật trình bày), Điều 10 đến 13 (soạn thảo, duyệt, kiểm tra, ký), Điều 15 (cấp số); Phụ lục I Phần I; Phụ lục II (viết hoa); Phụ lục III (chữ viết tắt, Mẫu 1.1 đến 1.10, 2.1);
  - ADR-010 mục 2B (soạn văn bản bằng AI), ADR-011 (biên bản, thông báo kết luận theo thể thức).

## Bối cảnh

Trước so-1.18.0, chức năng Soạn văn bản bằng AI:
- để mô hình tự gõ cả Quốc hiệu, tên cơ quan, số – ký hiệu, nơi nhận, chữ ký vào một đoạn văn bản thuần; mô hình có thể sai chính tả thể thức, sai ký hiệu, thiếu thành phần;
- chỉ có 10 loại văn bản, chưa theo mẫu của Phụ lục III;
- tải về dạng `.doc` là HTML với mỗi dòng một đoạn: không có khổ giấy, lề, số trang, bố cục hai cột ở đầu văn bản, nên người dùng phải dàn trang lại bằng tay.

Chỉ phần biên bản và thông báo kết luận cuộc họp (ADR-011) có mã dựng thể thức riêng, theo hai mẫu 1.4 và 1.9, dựa trên bài trích của trang tra cứu vì chưa có bản Word gốc.

## Quyết định

1. **Tách nội dung và thể thức.**
   - Trợ lý AI chỉ trả **nội dung có cấu trúc** (một đối tượng JSON): trích yếu, kính gửi, căn cứ, thẩm quyền, nội dung, nơi nhận, các trường riêng của giấy mời, công điện, biên bản, phụ lục.
   - **Thể thức do mã dựng** (`public/nd30.js`): Quốc hiệu, Tiêu ngữ, tên cơ quan, số – ký hiệu, địa danh – ngày tháng, tên loại, quyền hạn – chức vụ – họ tên người ký, nơi nhận, độ khẩn, phạm vi lưu hành, địa chỉ cơ quan, phụ lục, số trang.
   - Lời nhắc cấm AI viết các phần thể thức vào nội dung.
2. **Phạm vi loại văn bản:** 26 loại theo Điều 7 có mẫu tại Phụ lục III:
   - Mẫu 1.1 nghị quyết cá biệt;
   - Mẫu 1.2, 1.3 quyết định;
   - Mẫu 1.4 gồm chỉ thị, quy chế, quy định, thông cáo, thông báo, hướng dẫn, chương trình, kế hoạch, phương án, đề án, dự án, báo cáo, tờ trình, giấy ủy quyền, phiếu gửi, phiếu chuyển, phiếu báo;
   - Mẫu 1.5 công văn; 1.6 công điện; 1.7 giấy mời; 1.8 giấy giới thiệu; 1.9 biên bản; 1.10 giấy nghỉ phép; 2.1 phụ lục.
   - Giấy giới thiệu và giấy nghỉ phép chỉ nhập theo biểu mẫu, không dùng AI (nội dung cố định, ít chữ tự do).
   - Thư, ghi chú và các văn bản không có mẫu giữ đường soạn văn bản tự do như trước.
3. **Một mô hình khối, nhiều đầu ra.** `compose()` dựng danh sách khối (đoạn, bảng) từ dữ liệu văn bản rồi xuất:
   - HTML xem trước (khổ A4, thu nhỏ vừa khung);
   - văn bản thuần (sao chép, lưu vào Tài liệu);
   - **tệp `.docx`** (Office Open XML tự dựng, không thư viện): A4, lề trên và dưới 20 mm, trái 30 mm, phải 15 mm, Times New Roman, số trang canh giữa lề trên từ trang 2, địa chỉ cơ quan ở chân trang đầu, mỗi phụ lục một phần riêng đánh lại số trang.
4. **Kiểm tra thể thức** (`check()`): danh sách mục cần sửa, lưu ý, mỗi mục kèm căn cứ (Điều, khoản, mục Phụ lục), theo Điều 12 khoản 2. Chỗ thiếu thông tin tô vàng và tính là lỗi cho đến khi bổ sung.
5. **Bảo mật dữ liệu AI trả về.** Máy chủ (`parseDraft`) chỉ giữ các khóa nội dung đã biết, cắt độ dài, bỏ Markdown; AI không đặt được người ký, tên cơ quan, số, ngày. Giao diện thoát HTML bằng `esc()`; tệp `.docx` thoát XML.
6. **Không thêm thư viện.** Bộ ghi ZIP (không nén) và CRC32 viết trong `nd30.js`.
7. **API tương thích.** `POST /api/ai/compose` giữ nguyên khi không có `format`. Với `format: "nd30"` trả `{ structured: true, doc }`, hoặc `{ structured: false, text }` khi mô hình không trả đúng JSON. `ND.bienBan`, `ND.thongBao` (trợ lý cuộc họp) dựng trên cùng bộ máy, nay cũng tải `.docx`.

## Phương án đã xem xét

| Phương án | Lý do không chọn |
|---|---|
| Giữ nguyên: AI tự gõ cả thể thức | Không bảo đảm đúng thể thức; mỗi lần soạn lại một kiểu |
| Tải `.doc` dạng HTML (Word mở được) | Không bảo đảm khổ giấy, số trang, bảng hai cột ở đầu văn bản; Word mở HTML thành bố cục web |
| Thư viện `docx` (npm) | CLAUDE.md mục 3.2: không thêm thư viện vào mã chạy khi chưa có ADR; `.docx` đơn giản đủ tự dựng |
| Dựng `.docx` trên máy chủ | Tốn CPU Worker (giới hạn 50 ms); trình duyệt dựng được và không gửi nội dung văn bản đi đâu thêm |
| Soạn trực tiếp bằng trình soạn thảo trên trang (WYSIWYG) | Phức tạp, chưa cần; sửa bằng các ô có nhãn và xem trước ngay là đủ cho bản thảo |

## Hệ quả

- Tích cực: văn bản ra đúng thể thức ở mức kiểm thử được; ít phải dàn trang lại; kiểm tra thể thức nhắc người soạn trước khi trình ký; AI ít việc hơn nên ít token hơn (không sinh phần thể thức).
- Chi phí: tăng mã trình duyệt (`nd30.js` khoảng 490 dòng); lời nhắc theo loại văn bản cần giữ đồng bộ với danh mục (đã có kiểm thử đối chiếu).
- Rủi ro còn lại:
  - mô hình có thể không trả đúng JSON (xử lý bằng cách đưa chữ thô vào ô Nội dung);
  - đường kẻ dưới tên cơ quan, trích yếu trong `.docx` dài theo **ước lượng** độ rộng chữ, không đo chính xác như Word;
  - người dùng vẫn phải kiểm tra nội dung, căn cứ pháp lý (AI không tra cứu căn cứ).

## Mức độ kiểm chứng (10/11/2026)

- Đã kiểm thử cục bộ, tự động: `test/nd30-test.js` (đối chiếu từng quy định Phụ lục I, III; cấu trúc `.docx`), `test/ai-test.js` (hợp đồng AI, lọc kết quả JSON, quyền), `test/nd30-ui.js` (Playwright, 1440 px sáng và 360 px tối).
- Đã mở thử bằng LibreOffice 7 và so bằng mắt với các trang Mẫu 1.2, 1.4, 1.5, 1.7, 1.9, 2.1 trong tệp Word do chủ sở hữu cung cấp: bố cục khớp (đầu văn bản hai cột, căn cứ nghiêng, nơi nhận – ký, phụ lục sang trang mới, chân trang đầu).
- **Chưa kiểm chứng:** mở `.docx` bằng Microsoft Word; gọi mô hình thật với lời nhắc mới (chất lượng nội dung, tỷ lệ trả đúng JSON); chạy trên Cloudflare thật; in thử ra giấy.
- **Chưa làm:** Mẫu 3.1, 3.2 (bản sao); văn bản điện tử có chữ ký số (Mẫu 2.2 và thông tin ký số); mẫu "văn bản kèm theo quyết định" của Mẫu 1.3 (hiện đưa vào phụ lục); kiểm tra viết hoa theo Phụ lục II (mới nhắc trong lời nhắc AI); Phụ lục IV đến VI (sổ đăng ký, hồ sơ, hệ thống quản lý văn bản).

## Đề nghị chủ sở hữu quyết định

1. Duyệt ADR (phạm vi 26 loại, AI chỉ viết nội dung).
2. Có cho phép Nghị định sửa đổi, bổ sung sau năm 2020 (nếu có) được đối chiếu trước khi áp dụng chính thức không? Hiện chỉ đối chiếu bản gốc do chủ sở hữu cung cấp; tình trạng sửa đổi **chưa kiểm chứng**.
3. Tên cơ quan, chữ viết tắt, địa danh, địa chỉ: hiện nhớ tại trình duyệt từng người. Có muốn đưa thành cấu hình chung của đơn vị (Quản trị) để mọi người dùng chung không?
