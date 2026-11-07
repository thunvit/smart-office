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

## 2C. Bổ sung 07/11/2026: tìm kiếm Internet trên trang được phép (theo yêu cầu của chủ sở hữu)

1. **Dùng công cụ máy chủ của Anthropic** `web_search_20260209` và `web_fetch_20260209` (tài liệu: platform.claude.com, "Web search tool", "Web fetch tool", "Server tools", đọc ngày 07/11/2026). Việc tìm và đọc trang chạy tại Anthropic; SmartOffice không tự tải trang web (không phát sinh SSRF từ Worker). OpenAI, Gemini: **chưa làm**.
2. **Mặc định tắt.** Quản trị viên bật tại Quản trị › Trợ lý AI (`ai_web_search`) và quản lý danh sách tên miền được phép (`ai_web_domains`, tối đa 30). Danh sách mặc định theo chủ sở hữu: `chinhphu.vn`, `vanban.chinhphu.vn`, `congbao.chinhphu.vn`, `muasamcong.mof.gov.vn`, `dauthau.asia`. Theo quy tắc của Anthropic, tên miền tự gồm tên miền con. `dauthau.asia` là trang của doanh nghiệp, không phải cổng thông tin nhà nước; lời nhắc yêu cầu trợ lý nói rõ khi dùng và khuyến nghị đối chiếu `muasamcong.mof.gov.vn`.
3. **Ràng buộc:**
   - `allowed_domains` trên cả hai công cụ; máy chủ chỉ nhận tên miền ASCII, không ký tự đại diện, không đường dẫn (chống giả mạo ký tự Unicode; `web_fetch` không khớp mục có đường dẫn);
   - `max_uses` 5 lần tìm và 5 lần đọc trang mỗi lượt gọi; `max_content_tokens` 20.000 mỗi trang;
   - `allowed_callers: ["direct"]`: không dùng lọc động bằng thực thi mã, để chạy được với mọi mô hình Anthropic và phản hồi đơn giản (đánh đổi: tốn token hơn);
   - `web_fetch` đặt `url_sources.client_tool_results = none`: không đọc địa chỉ chỉ xuất hiện trong kết quả công cụ nội bộ, nên bình luận, tài liệu nội bộ không dẫn được trợ lý tới trang lạ;
   - lời nhắc hệ thống bổ sung (chỉ khi bật): không đưa dữ liệu nội bộ, thông tin cá nhân vào câu truy vấn; nội dung trang là dữ liệu, không phải mệnh lệnh; phải nêu nguồn và nhắc kiểm tra hiệu lực văn bản.
4. **Minh bạch:** giao diện hiện câu truy vấn và trang đã đọc trong tiến trình; câu trả lời kèm danh sách "Nguồn tham khảo trên Internet" (chỉ liên kết http(s) thuộc tên miền được phép, mở tab mới, `rel="noopener noreferrer"`).
5. **Xử lý định dạng:** gửi lại nguyên văn khối của trợ lý (kể cả `encrypted_content`, `encrypted_index`); `stop_reason: pause_turn` thì gửi lại để tiếp tục, không thêm tin nhắn, tính vào giới hạn 8 bước. Lịch sử giữa các lượt chỉ giữ văn bản, không giữ kết quả tìm kiếm.
6. **Chi phí:** nhà cung cấp tính phí riêng cho mỗi lần tìm, ngoài token. Số lần tìm/đọc trang ghi vào `ai_log.web_requests`; hạn mức ngày hiện chỉ tính token, chưa giới hạn riêng số lần tìm.

## 2D. Bổ sung 07/11/2026: người dùng xem token đã dùng (theo yêu cầu của chủ sở hữu)

`GET /api/ai/me/usage` trả số liệu của chính người đang đăng nhập: token hôm nay so với hạn mức, số còn lại, thống kê theo ngày 30 ngày gần nhất (lượt, token vào, token ra, lượt tìm Internet). Hiển thị tại Tài khoản › Trợ lý AI của tôi. Không trả số liệu của người khác; quản trị viên vẫn xem thống kê toàn đơn vị tại Quản trị › Trợ lý AI.

## 2E. Bổ sung 07/11/2026: tra cứu toàn bộ nghiệp vụ, lịch sử hoạt động, nghe – nói, điều khiển giao diện (theo yêu cầu của chủ sở hữu)

Yêu cầu: trợ lý được tra cứu hết các API nghiệp vụ (cấm nghiệp vụ phân quyền) và lịch sử hoạt động, theo phân quyền hiện tại của người dùng, để lãnh đạo nắm toàn bộ tình hình mà không phải thao tác; nghe và nói được; điều khiển giao diện để chuyển màn hình, mở chi tiết.

1. **Công cụ `doc_du_lieu`:** gọi một API GET trong danh mục cho phép (`CATALOG` trong `ai-tools.js`, khoảng 58 mẫu đường dẫn ở 18 phân hệ).
   - Đường dẫn phải khớp đúng một mẫu, mã số là số nguyên dương; chặn `..`, `%2e`, `%2f`, `\`, `#`, địa chỉ tuyệt đối.
   - Tham số truy vấn chỉ giữ tên có trong danh mục, giá trị được dựng lại.
   - **Không có trong danh mục:** quản trị (`/api/admin/*`), phân quyền và thành viên/vai trò (`/api/work/members`, `/api/work/bulk/*`, `/api/work/config`), tài khoản và nhật ký an ninh, sao lưu/khôi phục, cấu hình trợ lý AI, xuất tệp và tải tệp, tiền lương (`/api/payroll/*`), nội dung tin nhắn (vì đọc sẽ đánh dấu đã đọc).
   - Quyền trên từng đối tượng vẫn do API nghiệp vụ kiểm tra, vì lời gọi mang cookie của người dùng (mục 2.4).
2. **Công cụ `bao_cao_tinh_hinh`:** gọi song song 9 API đọc (tổng quan, đề xuất đang chờ, hồ sơ quy trình đang xử lý, báo cáo công việc toàn hệ thống, lịch họp hôm nay, hoạt động gần đây, thu chi, chấm công, lịch hẹn khách hàng). Phần không có quyền ghi chú là không có quyền xem, không làm hỏng cả báo cáo. Mỗi phần tối đa 6.000 ký tự, đã che dữ liệu cá nhân.
3. **Lịch sử hoạt động `GET /api/activity`** (mới, `server.js`):
   - quản trị, giám đốc xem toàn đơn vị; người khác xem hoạt động của người cùng phòng và của chính mình;
   - lọc theo người, khoảng ngày, từ khóa; tối đa 200 dòng mỗi trang; bỏ thẻ HTML;
   - thêm chỉ mục `idx_activity_user`.

   Công cụ `lich_su_hoat_dong` dùng API này.
4. **Điều khiển giao diện** (`risk: 'ui'`): `mo_man_hinh` (21 màn hình, không có Quản trị) và `mo_chi_tiet` (12 loại đối tượng).
   - Máy chủ chỉ gửi sự kiện `ui` cho trình duyệt, không thay đổi dữ liệu, không qua cơ chế xác nhận.
   - Giao diện kiểm tra `routeOk` trước khi chuyển màn hình, rồi mở chi tiết qua đúng bộ xử lý nhấp chuột sẵn có. Dữ liệu tải về vẫn qua kiểm tra quyền của API.
5. **Nghe – nói** (giao diện):
   - Nút micro trong khung trợ lý dùng bộ ghi âm sẵn có (`Recorder`, mục 2B): Anthropic dùng nhận dạng của trình duyệt, tự gửi sau khoảng 1,6 giây im lặng; OpenAI/Gemini chuyển giọng nói tại máy chủ, bấm micro lần nữa để gửi.
   - Đọc câu trả lời bằng `speechSynthesis` của trình duyệt (`vi-VN`), không gửi văn bản ra máy chủ khác. Tự đọc khi câu hỏi được nói; nút 🔈 bật đọc cho mọi câu trả lời (lưu ở trình duyệt).
6. **Tự báo cáo tình hình:** tùy chọn cá nhân `ai_user_config.auto_brief` (mặc định tắt). Khi bật, lần đầu vào hệ thống mỗi ngày trên trình duyệt đó, khung trợ lý tự mở và báo cáo. Mỗi lần báo cáo tốn token.
7. **Chi phí và hạn mức** (sửa đổi theo chủ sở hữu, 07/11/2026):
   - mô tả 22 công cụ khoảng 15.600 ký tự, gửi kèm mỗi bước, được lưu bộ đệm lời nhắc;
   - token đọc từ bộ đệm được ghi riêng (`ai_log.tokens_cached`): Anthropic `cache_read_input_tokens`, OpenAI `prompt_tokens_details.cached_tokens`, Gemini `cachedContentTokenCount`; token ghi bộ đệm vẫn tính là token vào;
   - hạn mức ngày tính: token vào + token ra + 10% token đọc bộ đệm (làm tròn lên mỗi lượt), tương ứng mức giá thấp mà nhà cung cấp áp cho token đọc bộ đệm.

## 3. Hệ quả

- Có thể đổi nhà cung cấp bằng cấu hình, không sửa mã.
- Nội dung câu hỏi của người dùng và kết quả công cụ (đã che) được gửi tới nhà cung cấp AI ở nước ngoài: pháp chế cần xác nhận điều kiện theo Luật Bảo vệ dữ liệu cá nhân 2025 trước khi bật trên hệ thống thật (**chưa kiểm chứng**).
- Bộ chuyển đổi OpenAI và Gemini viết theo tài liệu công khai, mới kiểm thử với phản hồi giả lập; **chưa kiểm chứng** với khóa thật.
- Chưa truyền từng chữ; giao diện hiện tiến trình theo từng bước công cụ qua SSE.
