# TIÊU CHUẨN GIAO DIỆN VÀ TRẢI NGHIỆM NGƯỜI DÙNG (UI/UX)

- Ngày lập: 06/11/2026. Người lập: Tổng công trình sư (trợ lý AI), chờ chủ sở hữu phê duyệt.
- Căn cứ:
  - hệ thống giao diện hiện có trong `public/app.css` (biến màu, thành phần dùng chung);
  - WCAG 2.1 mức AA (W3C) về khả năng tiếp cận;
  - Thông tư số 26/2020/TT-BTTTT về áp dụng tiêu chuẩn hỗ trợ người khuyết tật tiếp cận sản phẩm, dịch vụ thông tin và truyền thông, dùng để tham khảo (phạm vi bắt buộc với doanh nghiệp **chưa kiểm chứng**).
- Nguyên tắc chung: **một ứng dụng, một ngôn ngữ thiết kế.** Phân hệ mới dùng lại thành phần sẵn có. Muốn có thành phần mới thì bổ sung vào bộ dùng chung và ghi vào tài liệu này, không viết kiểu riêng trong từng phân hệ.

## I. Nền tảng thiết kế (design tokens)

1. **Màu chỉ dùng qua biến CSS** khai báo tại `:root` trong `public/app.css`:
   - `--bg`, `--surface`, `--sunken`, `--line`, `--line-strong`;
   - `--fg`, `--muted`, `--faint`;
   - `--accent`, `--accent-fg`, `--accent-weak`;
   - `--ok`, `--warn`, `--bad`, `--info` và các biến `-weak` tương ứng.

   Cấm mã màu cứng (`#...`, `rgb(...)`) trong mã phân hệ, trừ trang ngoại tuyến độc lập.
2. **Chế độ sáng và tối:** mọi giao diện mới phải hiển thị đúng ở cả hai chế độ (`prefers-color-scheme` và `data-theme`). Kiểm tra cả hai trước khi hợp nhất mã.
3. **Ý nghĩa màu cố định:**

   | Biến | Ý nghĩa |
   |---|---|
   | `--ok` | hoàn thành, đã duyệt |
   | `--warn` | sắp hạn, chờ xử lý |
   | `--bad` | quá hạn, từ chối, lỗi |
   | `--info` | thông tin |
   | `--accent` | hành động chính, thương hiệu |

   Không dùng màu cho mục đích khác; không dùng màu làm tín hiệu duy nhất (phải kèm chữ hoặc biểu tượng).
4. **Chữ:**
   - Phông Be Vietnam Pro (`--font-ui`), cỡ chữ nền 14 px.
   - Số liệu, tiền dùng `.num`/`.mono` (chữ số đều độ rộng).
   - Tiêu đề trang dùng `page-head`/`t-title`.
5. **Bo góc** dùng `--r` (8 px); khoảng cách theo bước 4/8/12/16/24 px.

## II. Thành phần dùng chung (bắt buộc dùng lại)

| Nhu cầu | Thành phần, hàm | Ghi chú |
|---|---|---|
| Khung trang | `.page-head` (tiêu đề và nút chính), `.toolbar` (bộ lọc) | Mỗi trang tối đa **một** nút chính (`btn primary`) |
| Nút | `.btn`, `.btn primary`, `.btn ghost`, `.btn ok`, `.btn danger`, `.btn sm`, `.btn block` | Nhãn nút là động từ: "Lưu", "Gửi duyệt", "Xóa công việc" |
| Thẻ nội dung | `.card`, `.card-h`, `.card-b` | |
| Bảng | `.tbl-wrap` > `table.tbl`; cột số căn phải `.num` | Bảng rộng phải cuộn ngang trong `.tbl-wrap`, không làm tràn trang |
| Biểu mẫu | `.form`, `.field` (nhãn và ô nhập), `.hint`, `.err` | Mỗi ô nhập có `<label>`; lỗi hiện ngay dưới ô |
| Hộp thoại | `openModal(html)` với `.modal-h`/`.modal-b`/`.modal-f`; `closeModal()` | Nút đóng × có `aria-label="Đóng"`; phím Esc đóng hộp thoại |
| Thông báo ngắn | `toast(msg, isError)` | Không dùng `alert()`, `confirm()` của trình duyệt |
| Xác nhận thao tác nguy hiểm | `armed(btn, 'Nội dung hậu quả?')`: bấm lần hai mới thực hiện; với thao tác ảnh hưởng nhiều dữ liệu, dùng hộp thoại xác nhận nêu rõ hậu quả | Xóa, từ chối, hủy luôn phải xác nhận |
| Trạng thái rỗng | `.empty` | Nêu điều tiếp theo nên làm ("Chưa có công việc. Tạo công việc đầu tiên") |
| Nhãn trạng thái | `.pill`, `.tag` theo bảng màu tại I.3 | |
| Đang xử lý | `busy(btn, fn)` | Khóa nút trong lúc chờ, chặn bấm lặp |
| Thao tác | `data-act="..."` đăng ký trong `ACTIONS`; màn hình đăng ký trong `VIEWS` | Không gắn `onclick` nội tuyến |

## III. Quy tắc trải nghiệm

1. **Ngôn ngữ:** tiếng Việt có dấu, văn phong lịch sự, ngắn gọn, nhất quán thuật ngữ.

   | Dùng | Không dùng |
   |---|---|
   | Đề xuất | Yêu cầu |
   | Phê duyệt | Duyệt |
   | Công việc | Task |

   Thông báo lỗi nói rõ nguyên nhân và cách xử lý.
2. **Định dạng:**
   - Ngày `dd/mm/yyyy`; giờ 24 giờ `HH:mm`.
   - Tiền: `1.234.567 ₫`, dùng hàm `vnd()`.
   - Số: dấu chấm phân cách hàng nghìn.
   - Luôn hiển thị theo giờ Việt Nam.
3. **Điều hướng:**
   - Menu ngang theo nhóm (Tổng quan, Công việc, Phê duyệt, Thông tin, Nhân sự, Kinh doanh, Quản trị).
   - Phân hệ mới phải xếp vào một nhóm sẵn có; không tạo nhóm mới khi chưa có ADR.
   - Mỗi màn hình có địa chỉ `#...` riêng để chia sẻ và quay lại được.
4. **Quyền:** ẩn chức năng người dùng không có quyền. Máy chủ vẫn phải kiểm tra quyền (ATTT-13).
5. **Phản hồi thao tác:**
   - Mọi thao tác lưu có thông báo thành công hoặc lỗi.
   - Thao tác quá 300 ms có trạng thái đang xử lý (HN-04).
   - Lỗi mạng hiển thị thông báo mất kết nối của PWA.
6. **Thiết bị di động:**
   - Phải dùng được ở chiều rộng 360 px, không có cuộn ngang ở cấp trang (`scrollWidth` bằng chiều rộng màn hình).
   - Vùng chạm tối thiểu 40×40 px.
   - Bảng rộng cuộn trong khung riêng.

## IV. Khả năng tiếp cận (WCAG 2.1 AA)

1. Độ tương phản chữ ≥ 4,5:1 (chữ lớn ≥ 3:1), áp dụng cả chế độ tối.
2. Dùng được hoàn toàn bằng bàn phím. Không gỡ bỏ `:focus-visible`; thứ tự Tab hợp lý; hộp thoại giữ tiêu điểm bên trong.
3. Mọi nút chỉ có biểu tượng phải có `aria-label`; ảnh có `alt`; ô nhập có nhãn.
4. Vùng thông báo động (`toast`) có `role="status"`; hộp thoại có `role="dialog" aria-modal="true"`.
5. Không truyền đạt thông tin chỉ bằng màu sắc.

## V. Kiểm tra bắt buộc trước khi hợp nhất mã có thay đổi giao diện

1. Chụp màn hình ở chiều rộng 1440 px và 390 px, ở cả chế độ sáng và tối. Kiểm tra không tràn ngang, không vỡ bố cục.
2. Bảng điều khiển trình duyệt (console) không có lỗi; không có `pageerror` khi chạy kịch bản Playwright.
3. Chạy được toàn bộ luồng chính chỉ bằng bàn phím.
4. Lighthouse Accessibility ≥ 90 (HN, Mục III.3).

## VI. Hiện trạng

1. **Đã có:** hệ biến màu cho chế độ sáng và tối, thành phần dùng chung, `:focus-visible`, `role` cho hộp thoại và thông báo, kiểm thử trình duyệt tự động trên máy cục bộ ở các bản 1.x.
2. **Chưa kiểm chứng:** độ tương phản AA ở chế độ tối, giữ tiêu điểm trong hộp thoại, điểm Lighthouse. Cần một đợt rà soát giao diện (P1), kết quả lưu tại `docs/05-ra-soat/`.
