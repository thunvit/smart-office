# TÀI LIỆU DỰ ÁN SMARTOFFICE

Mục lục và quy ước lưu trữ tài liệu. Quy tắc dành cho trợ lý AI: [../CLAUDE.md](../CLAUDE.md).

## 1. Cấu trúc thư mục

| Thư mục | Nội dung | Tài liệu hiện có |
|---|---|---|
| `00-bat-dau/` | Hướng dẫn cho người mới tham gia (lập trình viên, AI) | [HUONG-DAN-THAM-GIA-DU-AN.md](00-bat-dau/HUONG-DAN-THAM-GIA-DU-AN.md) |
| `01-ke-hoach/` | Kế hoạch phát triển, lộ trình, phân chia phiên làm việc | [KE-HOACH-PHAT-TRIEN.md](01-ke-hoach/KE-HOACH-PHAT-TRIEN.md) (bản sao từ Claude Docs) |
| `02-thiet-ke/` | Thiết kế kiến trúc, dữ liệu, đa đơn vị | [THIET-KE-DA-DON-VI.md](02-thiet-ke/THIET-KE-DA-DON-VI.md) (bản sao từ Claude Docs) |
| `03-trien-khai/` | Hướng dẫn triển khai, vận hành, cấu hình hạ tầng | [TRIEN-KHAI-CLOUDFLARE.md](03-trien-khai/TRIEN-KHAI-CLOUDFLARE.md) |
| `04-huong-dan/` | Hướng dẫn sử dụng cho người dùng cuối, quản trị viên | [HUONG-DAN-SU-DUNG.md](04-huong-dan/HUONG-DAN-SU-DUNG.md) |
| `05-ra-soat/` | Báo cáo rà soát mã nguồn, kiểm thử, kiểm tra bảo mật; kèm kịch bản kiểm thử | [2026-11-06-RA-SOAT-XAC-THUC-LUU-TRU.md](05-ra-soat/2026-11-06-RA-SOAT-XAC-THUC-LUU-TRU.md), [kịch bản](05-ra-soat/2026-11-06-kich-ban-kiem-thu/) |
| `06-quyet-dinh/` | Hồ sơ quyết định kiến trúc (ADR) | [ADR-001](06-quyet-dinh/ADR-001-node-sqlite-khong-phu-thuoc.md), [ADR-002](06-quyet-dinh/ADR-002-cloudflare-workers-durable-objects.md), [ADR-003](06-quyet-dinh/ADR-003-pwa.md), [ADR-004](06-quyet-dinh/ADR-004-mat-khau-quan-tri-ban-dau.md) |
| `07-nhat-ky/` | Nhật ký các phiên làm việc | [NHAT-KY-PHIEN.md](07-nhat-ky/NHAT-KY-PHIEN.md) |
| `08-phap-ly/` | Danh mục căn cứ pháp lý và tình trạng kiểm chứng | [CAN-CU-PHAP-LY.md](08-phap-ly/CAN-CU-PHAP-LY.md) |
| `09-tieu-chuan/` | Tiêu chuẩn chất lượng bắt buộc và danh mục kiểm tra hoàn thành | [ATTT](09-tieu-chuan/TIEU-CHUAN-ATTT.md), [Hiệu năng](09-tieu-chuan/TIEU-CHUAN-HIEU-NANG.md), [UI/UX](09-tieu-chuan/TIEU-CHUAN-UI-UX.md), [Danh mục kiểm tra](09-tieu-chuan/DANH-MUC-KIEM-TRA-HOAN-THANH.md) |

## 2. Quy ước

1. **Tên tệp:** chữ in hoa, không dấu, nối bằng gạch ngang. Báo cáo theo ngày có tiền tố `YYYY-MM-DD-`. ADR đánh số tăng dần `ADR-NNN-ten-ngan.md` và không xóa ADR cũ; khi một ADR bị thay thế, ghi "Thay thế bởi ADR-NNN".
2. **Định dạng:** Markdown, tiếng Việt, văn phong hành chính. Đầu tệp ghi ngày lập hoặc ngày cập nhật, và căn cứ nếu có.
3. **Tài liệu có bản gốc trên Claude Docs** (kế hoạch, thiết kế): sửa ở bản gốc rồi xuất lại; đầu tệp ghi đường dẫn bản gốc và số bản sửa.
   - Kế hoạch phát triển: https://claude.ai/artifact/Ah3gR8tLERUxZ5ZQBcFkCw
   - Thiết kế đa đơn vị: https://claude.ai/artifact/WG2yo2PT5VFcwg13EY2sWi
4. **Không lưu trong `docs/`:** mật khẩu, token, dữ liệu cá nhân thật, bản sao cơ sở dữ liệu.
5. **Thư mục gốc kho mã** chỉ giữ `README.md`, `CLAUDE.md`, `AGENTS.md` cùng mã nguồn và tệp cấu hình.

## 3. Thông tin nhanh

| Mục | Giá trị |
|---|---|
| Kho mã | https://github.com/thunvit/smart-office, nhánh `main` (đẩy lên `main` = triển khai thật) |
| Bản chạy trên Cloudflare | https://smart-office.thunv-it.workers.dev (Worker `smart-office`, Durable Object `SmartOffice`) |
| Tên miền dự kiến | `smartoffice.vnptninhbinh.com.vn` (chưa gắn; DNS do VDC quản lý, xem tài liệu triển khai mục IV) |
| Phiên bản mã | xem `package.json` và `VERSION` trong `public/sw.js` |
