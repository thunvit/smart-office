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

## 3. Hệ quả

- Có thể đổi nhà cung cấp bằng cấu hình, không sửa mã.
- Nội dung câu hỏi của người dùng và kết quả công cụ (đã che) được gửi tới nhà cung cấp AI ở nước ngoài: pháp chế cần xác nhận điều kiện theo Luật Bảo vệ dữ liệu cá nhân 2025 trước khi bật trên hệ thống thật (**chưa kiểm chứng**).
- Bộ chuyển đổi OpenAI và Gemini viết theo tài liệu công khai, mới kiểm thử với phản hồi giả lập; **chưa kiểm chứng** với khóa thật.
- Chưa truyền từng chữ; giao diện hiện tiến trình theo từng bước công cụ qua SSE.
