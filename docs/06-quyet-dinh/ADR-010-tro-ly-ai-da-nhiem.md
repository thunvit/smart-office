# ADR-010. Trợ lý AI hội thoại đa nhiệm, nhiều nhà cung cấp

- Ngày: 07/11/2026. Trạng thái: **Đề xuất**, chờ chủ sở hữu phê duyệt. Mã đã viết trên nhánh `claude/code-architecture-ai-optimization-11be7f`, chưa hợp nhất vào `main`.
- Căn cứ: báo cáo `docs/05-ra-soat/2026-11-07-RA-SOAT-KIEN-TRUC-TU-VAN-AI.md` (Mục III–V); yêu cầu của chủ sở hữu ngày 07/11/2026: làm Đợt 2 "Trợ lý hội thoại đa nhiệm", dùng được Gemini, Anthropic hoặc OpenAI, trước mắt dùng Anthropic.
- Liên quan: ADR-001 (không phụ thuộc npm), ADR-002 (Cloudflare Workers + Durable Objects), ADR-008 (xác thực).

## 1. Bối cảnh

Kế hoạch phát triển có Phiên 16 "Trợ lý AI" với tiêu chí: dữ liệu cá nhân không gửi ra ngoài khi đơn vị chưa đồng ý. Chủ sở hữu yêu cầu không phụ thuộc một nhà cung cấp mô hình.

## 2. Quyết định

1. **Gọi nhà cung cấp bằng `fetch`, không dùng SDK.** Mỗi nhà cung cấp một bộ chuyển đổi trong `ai.js` (Anthropic Messages API, OpenAI Chat Completions, Google Gemini generateContent) với cùng giao diện `step()`. Giữ nguyên ADR-001 (không thêm phụ thuộc npm). Đánh đổi: tự xử lý định dạng, lỗi; chưa truyền từng chữ (token streaming).
2. **Chọn nhà cung cấp bằng biến môi trường**, không ghi trong kho mã:
   - `AI_PROVIDER` = `anthropic` (mặc định) | `openai` | `gemini`;
   - `AI_API_KEY` (bí mật: *Variables and Secrets* của Cloudflare hoặc biến môi trường bản Node);
   - `AI_MODEL`: bắt buộc với `openai`, `gemini`; Anthropic mặc định `claude-opus-5-5`;
   - `AI_BASE_URL` (tùy chọn, cho cổng tương thích OpenAI), `AI_EFFORT` (Anthropic, mặc định `medium`), `AI_FALLBACK=0` để tắt cơ chế dự phòng khi mô hình từ chối của Anthropic.
3. **Cổng AI chạy ở Worker không trạng thái** (`worker/index.js` chặn `POST /api/ai/chat`), không trong Durable Object; khóa API chỉ nằm ở Worker. Bản Node chạy cùng mô-đun trong `server.js`.
4. **Trợ lý hành động dưới danh nghĩa người dùng:** mỗi lời gọi công cụ là một yêu cầu API nội bộ mang cookie phiên của người dùng, đi qua toàn bộ kiểm tra đăng nhập, `Origin`, ép đổi mật khẩu, phân quyền hiện có.
5. **Thao tác ghi phải được người dùng xác nhận.** Công cụ ghi chỉ tạo bản ghi chờ trong bảng `ai_pending` (hạn 10 phút, dùng một lần, chỉ chủ sở hữu bản ghi xác nhận được). Phần mô tả để xác nhận do máy chủ sinh từ tham số, không lấy lời văn của mô hình. Không mở cho AI: xóa dữ liệu, tiền lương, quản trị, sao lưu, khôi phục.
6. **Mặc định tắt.** Quản trị viên bật tại Quản trị › Trợ lý AI. Mặc định che dữ liệu cá nhân (thư điện tử, số điện thoại, ngày sinh, số giấy tờ, tài khoản ngân hàng, lương) trong kết quả công cụ trước khi gửi nhà cung cấp; chỉ bật `ai_allow_pii` khi đơn vị có văn bản đồng ý.
7. **Hạn mức token theo người theo ngày** (mặc định 200.000), ghi `ai_log` (người, thời điểm, nhà cung cấp, mô hình, token, công cụ đã gọi; không lưu nội dung hội thoại). Thao tác ghi đã xác nhận ghi `security_log` sự kiện `ai_action`.
8. **Hội thoại lưu phía trình duyệt** (bộ nhớ trang), máy chủ không lưu nội dung hội thoại.

## 2A. Sửa đổi 07/11/2026: mỗi người dùng một trợ lý AI riêng (theo yêu cầu của chủ sở hữu)

1. **Cấu hình theo cá nhân, động trên giao diện** (Tài khoản › Trợ lý AI của tôi): nhà cung cấp (Anthropic, OpenAI, Gemini), mô hình, khóa API, mức suy luận (Anthropic), tên trợ lý, cách trả lời mong muốn. Bảng `ai_user_config`, khóa chính `user_id`.
2. **Thứ tự dùng khóa:** khóa cá nhân → khóa chung của máy chủ (`AI_API_KEY`, tùy chọn) → báo người dùng cấu hình (HTTP 412). Không người dùng nào dùng được khóa của người khác.
3. **Bảo vệ khóa cá nhân:**
   - Mã hóa AES-256-GCM trước khi lưu (`ai-key.js`); bản sao lưu chỉ chứa bản mã. Bí mật `AI_KEY_SECRET`: Cloudflare bắt buộc khai báo Secret; bản Node tự sinh tại `<DATA_DIR>/ai-key.secret` nếu không có biến môi trường.
   - API không bao giờ trả khóa về trình duyệt (chỉ 4 ký tự cuối). Khóa đã giải mã chỉ trả cho cổng AI: bản Node qua lời gọi nội bộ trong tiến trình; Cloudflare qua mã nội bộ `x-so-ai-internal` tính từ `AI_KEY_SECRET` (trình duyệt không tính được).
   - Khóa cá nhân chỉ gửi tới địa chỉ chính thức của nhà cung cấp; `AI_BASE_URL` chỉ áp dụng cho khóa chung (tránh gửi khóa tới địa chỉ tùy ý, tránh SSRF).
   - Nhật ký an ninh `ai_key_set`, `ai_key_clear` (không ghi khóa).
4. **Tên và cách trả lời riêng** đặt ở tin nhắn ngữ cảnh đầu lượt, ghi rõ chỉ áp dụng khi không trái quy tắc hệ thống; lời nhắc hệ thống giữ nguyên.
5. Quản trị viên vẫn quyết định bật/tắt toàn đơn vị, che dữ liệu cá nhân, hạn mức token/người/ngày.

## 2B. Bổ sung 07/11/2026: soạn văn bản, ghi âm, biên bản và kết luận cuộc họp (theo yêu cầu của chủ sở hữu)

1. **Tác vụ một lần gọi, không dùng công cụ** (`ai-compose.js` dựng lời nhắc; `ai.js` gọi nhà cung cấp): `POST /api/ai/compose` (soạn văn bản hành chính theo loại, giọng văn; soạn lại theo yêu cầu chỉnh sửa), `POST /api/ai/minutes` (biên bản, kết luận, việc cần làm dạng JSON). Thông tin cuộc họp lấy qua API của người dùng; người thực hiện chỉ nhận người trong thành phần họp.
2. **Kết quả chỉ là bản thảo:** người dùng sửa rồi tự bấm lưu biên bản, giao việc, lưu vào Tài liệu, tải tệp Word; các thao tác này đi qua API nghiệp vụ thường với đúng quyền của người dùng.
3. **Chuyển giọng nói thành chữ** (`POST /api/ai/transcribe`):
   - OpenAI (`/v1/audio/transcriptions`, mặc định `whisper-1`, đổi bằng trường "mô hình chuyển giọng nói" cá nhân hoặc `AI_STT_MODEL`) và Gemini (`inlineData`). Trình duyệt thu âm WAV 16 kHz theo đoạn 60 giây (khoảng 1,9 MB), giới hạn mỗi đoạn khoảng 10 MB.
   - Anthropic không nhận đầu vào âm thanh: giao diện dùng nhận dạng giọng nói của trình duyệt (Chrome/Edge), có thông báo rằng âm thanh do hãng trình duyệt xử lý.
   - Âm thanh không lưu trên máy chủ; chỉ giữ phần chữ do người dùng lưu.
4. **Header `Permissions-Policy`** đổi `microphone=()` thành `microphone=(self)` (`server.js`, `public/_headers`): chỉ trang của chính hệ thống được xin quyền micro; trình duyệt vẫn hỏi người dùng (ATTT-23).

## 3. Hệ quả

- Có thể đổi nhà cung cấp bằng cấu hình, không sửa mã.
- Nội dung câu hỏi của người dùng và kết quả công cụ (đã che) được gửi tới nhà cung cấp AI ở nước ngoài: pháp chế cần xác nhận điều kiện theo Luật Bảo vệ dữ liệu cá nhân 2025 trước khi bật trên hệ thống thật (**chưa kiểm chứng**).
- Bộ chuyển đổi OpenAI và Gemini viết theo tài liệu công khai, mới kiểm thử với phản hồi giả lập; **chưa kiểm chứng** với khóa thật.
- Chưa truyền từng chữ; giao diện hiện tiến trình theo từng bước công cụ qua SSE.
