# RÀ SOÁT TỔNG THỂ TRỢ LÝ AI – TƯƠNG THÍCH API NHÀ CUNG CẤP

- Ngày: 07/11/2026. Phạm vi: `ai.js`, `ai-core.js`, `ai-tools.js`, `public/ai.js`, `test/ai-test.js` trên nhánh `tinh-nang/tro-ly-ai-ca-nhan` (bản so-1.15.0).
- Lý do: chủ sở hữu thử với Anthropic thật và gặp liên tiếp hai lỗi 400. Lỗi đầu là "Country code VN is not supported". Lỗi sau là "Invalid `signature` in `thinking` block…", gặp với câu hỏi "có gói thầu nào tên mạng đang gặp vấn đề lớn". Chủ sở hữu yêu cầu: "cần rà soát tổng thể, đừng có fix theo từng case".
- Căn cứ: tài liệu Anthropic (Messages API, Web search tool, Web fetch tool, Server tools, Preserved thinking, Message threads), đối chiếu ngày 07/11/2026.

## I. Nguyên nhân gốc

Kiểm thử trước đây dùng nhà cung cấp giả lập **chấp nhận mọi yêu cầu**. Vì vậy mọi vi phạm quy tắc của API thật chỉ lộ ra khi người dùng gặp. Hai lỗi chủ sở hữu gặp đều thuộc loại này:

| Lỗi | Nguyên nhân | Cách khắc phục |
|---|---|---|
| `Country code VN is not supported` | Gửi `user_location.country = "VN"` cho `web_search` | Bỏ `user_location` (so-1.14.3) |
| `Invalid signature in thinking block` | Để ưu tiên tra nội bộ, danh sách `tools` bị **đổi giữa các bước** của một lượt (bước đầu không có công cụ web, bước sau có). Anthropic gắn thinking block với tiền tố hội thoại (`system`, `tools`, các tin trước), nên đổi `tools` làm mọi thinking block trước đó mất hiệu lực. Bản dự phòng so-1.14.3 (bỏ công cụ web khi bị từ chối) cũng đổi `tools`, cùng lỗi. | Xem II.1 |

## II. Các vấn đề phát hiện khi rà soát và cách xử lý

1. **Danh sách công cụ và lời nhắc phải cố định trong một lượt** (nghiêm trọng, đã gây lỗi thật).
   - Hội thoại chính nay luôn gửi cùng một `system` và cùng một `tools`, chỉ nối thêm `messages`.
   - Tìm Internet chuyển thành công cụ nội bộ `tim_internet`. Công cụ này gọi `webAsk`, một cuộc trò chuyện Anthropic **riêng biệt**, chỉ chứa câu hỏi tìm kiếm, có `web_search`/`web_fetch`.
   - Ưu tiên nội bộ do mã bắt buộc: `tim_internet` bị từ chối nếu chưa gọi công cụ đọc nội bộ nào ở bước trước.
   - Lợi ích thêm: cuộc gọi tìm kiếm không mang dữ liệu nội bộ, cũng không mang ngữ cảnh người dùng.
2. **Lịch sử có hai tin liền nhau cùng vai.**
   - Sau khi xác nhận hoặc bỏ qua đề nghị, giao diện thêm ghi chú "[Hệ thống] …" vai trợ lý ngay sau câu trả lời. Lịch sử bị cắt 20 tin cũng có thể bắt đầu bằng tin trợ lý.
   - Gemini bắt buộc xen kẽ user/model; Anthropic gộp ngầm.
   - Khắc phục: `normHistory` gộp các tin cùng vai liền nhau và bỏ tin đầu không phải người dùng, áp cho cả ba nhà cung cấp.
3. **Câu trả lời bị cắt do giới hạn độ dài (`stop_reason: max_tokens`) khi đang gọi công cụ.**
   - Mã cũ vẫn chạy công cụ với tham số có thể dở dang. Với công cụ ghi, điều này lập đề nghị sai.
   - Khắc phục: dừng lại, báo người dùng hỏi hẹp hơn.
4. **Tham số tùy chọn không được mô hình hỗ trợ.**
   - Người dùng tự chọn mô hình. `fallbacks` (dự phòng khi mô hình từ chối) và `output_config.effort` có thể bị từ chối với lỗi 400.
   - Khắc phục: khi lỗi 400 nêu đúng tham số đó, cổng AI tự bỏ tham số và gửi lại. Các tham số này nằm ngoài `system`/`tools`/`messages` nên không làm hỏng thinking block.
5. **Không có cách kiểm chứng với khóa thật trước khi dùng.**
   - Khắc phục: thêm **Kiểm tra toàn diện** (Tài khoản › Trợ lý AI của tôi), chạy qua đúng mã xử lý thật bốn bước:
     - hội thoại;
     - gọi công cụ nhiều bước;
     - tìm Internet sau khi tra nội bộ (nếu bật);
     - soạn văn bản.
   - Mỗi bước báo đạt hoặc lỗi kèm nguyên văn thông báo của nhà cung cấp. Không lưu vào lịch sử trò chuyện.

**Đã kiểm, không có vấn đề:**
- không gửi `tool_choice` (Opus 5.5 trả 400 khi ép chọn công cụ), `temperature`, `top_p`, `budget_tokens`;
- tên 23 công cụ đúng định dạng `^[a-zA-Z0-9_-]{1,64}$`;
- mỗi `tool_use` có `tool_result` cùng mã trong tin kế tiếp;
- các công cụ chạy song song trả kết quả trong một tin;
- `pause_turn` gửi lại nguyên văn, không thêm tin (cuộc gọi tìm kiếm);
- Gemini giữ `thoughtSignature`, số `functionResponse` bằng số `functionCall`;
- OpenAI có tin `role: tool` cho mọi `tool_call_id`;
- giữa các lượt, lịch sử chỉ có văn bản, nên không mang thinking block sang lượt sau.

## III. Kiểm thử theo hợp đồng API (thay cho giả lập "chấp nhận mọi yêu cầu")

`test/ai-test.js` nay kiểm tra **mọi** yêu cầu gửi nhà cung cấp theo các quy tắc đã biết. Vi phạm sẽ nhận 400 giống API thật và được ghi lại. Cuối bộ kiểm thử có điều kiện bắt buộc **"HỢP ĐỒNG API: 0 vi phạm"**.
- **Anthropic:**
  - trong một hội thoại có thinking block: `system`, `tools` giữ nguyên, `messages` chỉ nối thêm;
  - vai xen kẽ, bắt đầu bằng `user`;
  - `tool_use` và `tool_result` khớp nhau;
  - không có tham số bị cấm;
  - `web_search` không có `user_location` VN;
  - `allowed_domains` không có `http://` hay ký tự `*`.
- **OpenAI:** `tool_calls` và tin `role: tool` khớp nhau.
- **Gemini:** user/model xen kẽ; `functionCall` và `functionResponse` khớp nhau.

**Đối chứng:** chạy bộ kiểm thử mới trên mã so-1.14.3, máy chủ giả lập kiểm tra luật tái hiện **đúng** lỗi chủ sở hữu gặp: `messages.1.content.0: Invalid signature in thinking block … (tools đổi)`, 4 vi phạm, 10 kiểm thử không đạt. Trên mã mới: 0 vi phạm.

## IV. Kết quả kiểm thử (cục bộ/mô phỏng)

- `ai-test`: 233 đạt, 0 không đạt. Trong đó:
  - "HỢP ĐỒNG API" 0 vi phạm;
  - phần R: rà soát;
  - phần K: kiểm tra toàn diện, có thử qua đường Worker;
  - phần T: lịch sử trò chuyện.
- `worker-smoke` đạt (`backup-manifest 200 74 1`: thêm 2 bảng lịch sử trò chuyện); `work-test` 125/0; `work-plan-test` 21/0; `work-ext-test` 98/0; `auth-test` 78/0; `backup-test` 48/0; `node --check` toàn bộ.

## V. Giới hạn còn lại

- Máy chủ giả lập kiểm tra luật chỉ bắt **các quy tắc đã biết**. Quy tắc chưa được ghi trong tài liệu hoặc mới phát sinh vẫn chỉ lộ ra với API thật. Vì vậy cần chạy **Kiểm tra toàn diện** với khóa thật sau mỗi lần cập nhật trợ lý hoặc đổi mô hình.
- OpenAI và Gemini chưa kiểm chứng với khóa thật.
