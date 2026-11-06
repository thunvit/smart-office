# DANH MỤC KIỂM TRA HOÀN THÀNH (DEFINITION OF DONE)

Một thay đổi chỉ được coi là **hoàn thành** và được hợp nhất vào nhánh `main` khi đạt mọi mục liên quan dưới đây. Người thực hiện, dù là người hay AI, tự đánh dấu. Người duyệt kiểm tra lại. Mục không áp dụng ghi "K/A" kèm lý do.

## A. Chung
- [ ] Đã đọc `CLAUDE.md`, nhật ký phiên gần nhất và các ADR liên quan; thay đổi không đi ngược ADR nào.
- [ ] Phạm vi thay đổi đúng một mục tiêu; không kèm sửa đổi ngoài phạm vi.
- [ ] Commit tiếng Việt, nêu rõ việc làm, nguyên nhân và kiểm thử đã chạy.

## B. Kiểm thử
- [ ] `node --check` đạt cho mọi tệp JS.
- [ ] `node test/worker-smoke.js` đạt: có `download 200 true`, `re-instantiate 200` và các điều kiện mới bổ sung.
- [ ] Bản Node khởi động được với `DATA_DIR` tạm; `/healthz` trả `ok`.
- [ ] Sửa lỗi: có kiểm thử tái hiện, kiểm thử báo lỗi trên mã cũ và đạt trên mã mới.
- [ ] Chức năng mới: có kiểm thử cho cả trường hợp hợp lệ và trường hợp bị từ chối.

## C. An toàn thông tin (`TIEU-CHUAN-ATTT.md`)
- [ ] Route mới đã khai báo đúng chế độ công khai hay cần đăng nhập; đã kiểm tra quyền trên từng đối tượng tại máy chủ (ATTT-12, 13).
- [ ] SQL chỉ dùng tham số; HTML chỉ qua `esc()` (ATTT-15, 16).
- [ ] Không có bí mật, mật khẩu, dữ liệu thật trong thay đổi (ATTT-20).
- [ ] Thao tác nhạy cảm có ghi nhật ký (ATTT-24).

## D. Hiệu năng (`TIEU-CHUAN-HIEU-NANG.md`)
- [ ] Truy vấn mới có chỉ mục phù hợp; đã xem `EXPLAIN QUERY PLAN` (HN, Mục II.1).
- [ ] Danh sách có phân trang, tối đa 200 bản ghi mỗi lần (HN-07); không có truy vấn trong vòng lặp.
- [ ] Không thêm gọi định kỳ mới; nếu bắt buộc phải thêm thì tuân thủ HN-06.
- [ ] Mã chạy trên Workers tuân thủ ràng buộc tại `CLAUDE.md`, Mục 3.3.

## E. Giao diện (`TIEU-CHUAN-UI-UX.md`)
- [ ] Chỉ dùng biến màu và thành phần dùng chung; không có mã màu cứng.
- [ ] Đã kiểm tra ở chiều rộng 1440 px và 390 px, chế độ sáng và tối; không tràn ngang; console không lỗi.
- [ ] Nhãn, thông báo bằng tiếng Việt, đúng thuật ngữ; định dạng ngày, tiền đúng quy ước.
- [ ] Dùng được bằng bàn phím; nút chỉ có biểu tượng có `aria-label`.

## F. Tài liệu và phát hành
- [ ] Cập nhật tài liệu liên quan: hướng dẫn sử dụng, triển khai, ADR nếu có quyết định mới.
- [ ] Thay đổi giao diện hoặc tài nguyên tĩnh: đã tăng `VERSION` trong `public/sw.js`.
- [ ] Ghi nhật ký phiên (`docs/07-nhat-ky/NHAT-KY-PHIEN.md`).
- [ ] Sau khi tự triển khai: đã kiểm tra trên địa chỉ thật và ghi mức độ kiểm chứng.
