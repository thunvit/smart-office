# DANH MỤC CĂN CỨ PHÁP LÝ

Cập nhật: 06/11/2026. Mục đích là ghi các văn bản đã dùng làm căn cứ trong mã nguồn và tài liệu dự án, kèm tình trạng kiểm chứng. Văn bản ghi "chưa kiểm chứng" phải được pháp chế xác nhận trước khi dùng cho mục đích kinh doanh.

| STT | Văn bản | Dùng cho | Tình trạng kiểm chứng |
|---|---|---|---|
| 1 | Bộ luật Lao động năm 2019, Điều 98 (làm thêm giờ), 112–113 (nghỉ lễ, nghỉ hằng năm), 124 (hình thức kỷ luật) | Tính lương làm thêm 150%, ngày nghỉ, phân hệ khen thưởng – kỷ luật | Đã dùng khi xây dựng; chưa đối chiếu sửa đổi sau 2019 |
| 2 | Nghị quyết số 110/2025/UBTVQH15 (mức giảm trừ gia cảnh: 15,5 triệu đồng/tháng cho bản thân, 6,2 triệu đồng/tháng cho mỗi người phụ thuộc) | `PAY_DEFAULTS` (`db.js`) | Đã tra cứu khi xây dựng (11/2026) |
| 3 | Luật Thuế thu nhập cá nhân (sửa đổi) thông qua ngày 10/12/2025, biểu thuế lũy tiến 5 bậc | Hàm `pitProgressive` (`hr2.js`) | Đã tra cứu khi xây dựng; cần đối chiếu ngày hiệu lực và văn bản hướng dẫn |
| 4 | Nghị định số 293/2025/NĐ-CP (lương tối thiểu vùng I: 5.310.000 đồng/tháng) | `PAY_DEFAULTS.region_min` | Đã tra cứu khi xây dựng |
| 5 | Tỷ lệ đóng BHXH, BHYT, BHTN, KPCĐ: người lao động 8% – 1,5% – 1%; người sử dụng lao động 17,5% – 3% – 1% – 2%; mức trần bằng 20 lần mức tham chiếu 2.340.000 đồng | `PAY_DEFAULTS` | Đã dùng khi xây dựng; **chưa kiểm chứng** văn bản gốc quy định mức tham chiếu |
| 6 | Luật Bảo vệ dữ liệu cá nhân năm 2025 và Nghị định số 356/2025/NĐ-CP (hiệu lực từ 01/01/2026) | Yêu cầu bảo vệ dữ liệu nhân sự, tiền lương; hợp đồng xử lý dữ liệu khi kinh doanh dịch vụ | Đã tra cứu khi lập kế hoạch; **chưa kiểm chứng** các nghĩa vụ cụ thể (chuyển dữ liệu ra nước ngoài, đánh giá tác động) |
| 7 | Luật An ninh mạng số 116/2025/QH15 (hiệu lực từ 01/7/2026) | Yêu cầu về lưu trữ dữ liệu, an ninh hệ thống | **Chưa kiểm chứng** yêu cầu lưu trữ dữ liệu tại Việt Nam áp dụng cho dịch vụ này |
| 8 | Luật Giao dịch điện tử số 20/2023/QH15 | Giá trị pháp lý của phê duyệt điện tử, ký số | Đã tra cứu khi lập kế hoạch |
| 9 | Luật Lưu trữ số 33/2024/QH15 | Lưu trữ tài liệu điện tử (phân hệ Văn thư) | Đã tra cứu khi lập kế hoạch |
| 10a | Nghị định số 331/2026/NĐ-CP ngày 19/8/2026 về bảo vệ an ninh mạng đối với hệ thống thông tin | Xác định cấp độ, phương án bảo vệ (Tiêu chuẩn ATTT) | Mới biết qua tin của Bộ Công an; **chưa đọc toàn văn**, chưa rõ ngày hiệu lực và việc bãi bỏ Nghị định 85/2016/NĐ-CP |
| 10b | Nghị định số 85/2016/NĐ-CP; Thông tư số 12/2022/TT-BTTTT | Tham khảo yêu cầu kỹ thuật theo cấp độ | Có thể đã bị thay thế bởi 10a; **chưa kiểm chứng** |
| 10c | OWASP ASVS 4.0.3 (mức 2), OWASP Top 10 2021; WCAG 2.1 mức AA; Core Web Vitals | Chuẩn kỹ thuật cho Tiêu chuẩn ATTT, UI/UX, Hiệu năng | Chuẩn quốc tế công khai |
| 10d | Thông tư số 26/2020/TT-BTTTT (tiêu chuẩn hỗ trợ người khuyết tật tiếp cận sản phẩm, dịch vụ thông tin và truyền thông) | Tham khảo cho Tiêu chuẩn UI/UX | **Chưa kiểm chứng** phạm vi bắt buộc với doanh nghiệp |
| 10 | Nghị định số 30/2020/NĐ-CP về công tác văn thư | Thể thức văn bản (dự kiến Phiên 11) | **Chưa kiểm chứng** hiệu lực hiện hành |

Nguồn tra cứu chi tiết được dẫn tại `docs/01-ke-hoach/KE-HOACH-PHAT-TRIEN.md` (Mục I.1 và phần Nguồn).
