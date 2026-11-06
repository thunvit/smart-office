# ADR-009. Sao lưu và khôi phục dữ liệu (P0-9)

- Ngày: 06/11/2026
- Trạng thái: Đang áp dụng (so-1.10.0)
- Căn cứ:
  - báo cáo rà soát `docs/05-ra-soat/2026-11-06-RA-SOAT-XAC-THUC-LUU-TRU.md`, việc P0-9;
  - sự cố mất toàn bộ dữ liệu khi xóa Worker ngày 05/11/2026 (CLAUDE.md 6.2);
  - tài liệu Cloudflare "Durable Objects – SQL Storage – Point-in-Time Recovery": `getCurrentBookmark`, `getBookmarkForTime`, `onNextSessionRestoreBookmark`, `ctx.abort`; thời hạn 30 ngày; không hỗ trợ khi chạy cục bộ.

## Quyết định

1. **Định dạng bản sao lưu dùng chung cho Node và Cloudflare.**
   - Tệp JSON nén gzip: `manifest` (định dạng, phiên bản, thời điểm, danh sách bảng kèm số dòng và rowid lớn nhất, danh sách tệp), `tables` (cột và dòng của từng bảng), `files` (tệp đính kèm theo khối 1 MB, mã base64).
   - Không sao lưu `sessions`, `login_attempts` (dữ liệu tạm). `file_chunks` xuất qua lớp `FILES`, nên đọc được cả tệp trên đĩa (Node) lẫn trong SQLite (Cloudflare).
   - Bản sao lưu từ bản Node khôi phục được lên Cloudflare và ngược lại.
2. **Xuất chia trang** (`/api/admin/export/manifest`, `/rows`, `/file`).
   - Mỗi yêu cầu tối đa 500 dòng hoặc khoảng 1,5 MB, hoặc một khối tệp, để nằm trong giới hạn CPU và bộ nhớ của Workers.
   - Trình duyệt ghép các trang và nén bằng `CompressionStream`.
   - Danh mục ghi rowid lớn nhất của từng bảng tại thời điểm lập, nên dòng thêm sau đó không lọt vào bản sao lưu.
   - Dòng bị sửa hoặc xóa giữa các trang vẫn có thể làm bản sao lưu thiếu nhất quán. Vì vậy hướng dẫn yêu cầu xuất vào lúc ít người dùng.
3. **Khôi phục từ tệp** (`/api/admin/restore/file`, `/api/admin/restore`).
   - Tệp đính kèm nạp trước theo khối. Tên tệp ngẫu nhiên nên ghi thêm không ảnh hưởng dữ liệu đang dùng.
   - Bảng dữ liệu được xóa và nạp lại trong **một giao dịch**, có `PRAGMA defer_foreign_keys = ON`. Lỗi bất kỳ (kể cả vi phạm khóa ngoại) thì hoàn tác toàn bộ.
   - Điều kiện: cụm từ xác nhận "KHÔI PHỤC"; tệp đúng định dạng; số dòng khớp danh mục; có ít nhất một quản trị viên đang hoạt động.
   - Sau khi khôi phục, mọi phiên bị xóa; người dùng đăng nhập bằng tài khoản trong bản sao lưu.
   - Trên Cloudflare, mã bookmark được lấy ngay trước khi khôi phục và trả về để hoàn tác bằng PITR.
   - Giới hạn thân yêu cầu 30 MB cho phần bảng dữ liệu (không gồm tệp đính kèm).
4. **PITR (chỉ Cloudflare)** (`/api/admin/pitr`, `/api/admin/pitr/restore`).
   - Lấy mã thời điểm hiện tại hoặc mã của một thời điểm trong 30 ngày.
   - Khôi phục bằng `onNextSessionRestoreBookmark`, sau đó gọi `ctx.abort()` 200 ms sau khi trả phản hồi.
   - Phản hồi trả mã hoàn tác.
   - `worker/do-core.js` cập nhật `ctx` ở mỗi yêu cầu qua hàm `globalThis.__SO_CTX()`, không giữ cố định (CLAUDE.md 3.3).
5. **Ghi nhật ký an ninh:** `backup_export`, `backup_restore`, `pitr_restore`.
6. **Ràng buộc Durable Object đã gặp:** không dùng câu `SELECT` ghép nhiều vế (`UNION ALL`), vì Cloudflare thật từ chối khi vượt giới hạn. `test/fake-do.js` mô phỏng giới hạn 5 vế.
7. **Kiểm tra khả năng khôi phục** (`GET /api/admin/restore/check`): bật `defer_foreign_keys` trong giao dịch, đọc lại, rồi hoàn tác; không ghi dữ liệu.
8. **Giao diện:** Quản trị › Sao lưu dữ liệu. Mục PITR chỉ hiện trên Cloudflare (`bootstrap.runtime`). Có cảnh báo xóa Worker là mất toàn bộ dữ liệu.

## Chưa làm, hạn chế

- **Xuất định kỳ tự động ra nơi lưu ngoài (R2):** cần chủ sở hữu tạo bucket R2 trên Cloudflare. Hiện quản trị viên tải thủ công.
- **Diễn tập PITR trên Cloudflare thật:** chưa làm, vì chưa có môi trường thử riêng. Kiểm thử mới dùng `ctx` giả lập; khôi phục thật chưa kiểm chứng.
- **Khôi phục từ tệp trên Cloudflare thật:** chưa kiểm chứng. Nếu Durable Object không cho `PRAGMA defer_foreign_keys` trong `transactionSync`, giao dịch sẽ hoàn tác và báo lỗi, dữ liệu giữ nguyên. Khi đó khôi phục trên bản Node, rồi cân nhắc sắp thứ tự bảng theo khóa ngoại.
- **Bản sao lưu chứa dữ liệu cá nhân và mã băm mật khẩu,** phải lưu ở nơi có kiểm soát truy cập (Luật Bảo vệ dữ liệu cá nhân 2025; ATTT).
