# HƯỚNG DẪN TRIỂN KHAI SMARTOFFICE LÊN CLOUDFLARE

Phiên bản tài liệu: 1.5 · Ngày lập: 05/11/2026 · Áp dụng cho SmartOffice v1.5

SmartOffice v1.5 có hai cách triển khai lên Cloudflare, dùng chung một mã nguồn:

| Phương án | Nơi chạy và lưu dữ liệu | Cập nhật phiên bản | Khi nào dùng |
|---|---|---|---|
| **A. Cloudflare Workers + Durable Objects (khuyến nghị)** | Hạ tầng Cloudflare; dữ liệu trong SQLite của Durable Object | Tự động mỗi lần đẩy mã lên nhánh `main` của GitHub | Kinh doanh dịch vụ, không muốn vận hành máy chủ |
| B. Cloudflare Tunnel | Máy chủ của đơn vị; Cloudflare chỉ trung chuyển | Cập nhật thủ công trên máy chủ | Yêu cầu dữ liệu phải nằm trên máy chủ của đơn vị |

# PHẦN A. CLOUDFLARE WORKERS, TỰ ĐỘNG TRIỂN KHAI TỪ GITHUB

## A.1. Mô hình

```
GitHub thunvit/smart-office (nhánh main)
        │  mỗi lần đẩy mã: Cloudflare Workers Builds tự chạy "npx wrangler deploy"
        ▼
Cloudflare Worker "smart-office"
   ├─ public/  → Workers Static Assets: giao diện, PWA (manifest, sw.js, biểu tượng)
   └─ /api/*, /healthz → Durable Object "SmartOffice" (SQLite: dữ liệu nghiệp vụ, tệp đính kèm)
```

- Địa chỉ hiện tại: `https://smart-office.thunv-it.workers.dev` (Cloudflare cấp địa chỉ Worker theo dạng `<tên-worker>.<tên-tài-khoản>.workers.dev`).
- Địa chỉ chính thức `https://smartoffice.vnptninhbinh.com.vn` gắn được sau khi hoàn thành một phương án tên miền tại mục IV. Khi đó bỏ dấu chú thích dòng `routes` trong `wrangler.jsonc`.
- Durable Objects tự sao lưu dữ liệu; có thể khôi phục về thời điểm bất kỳ trong 30 ngày gần nhất.

## A.2. Các bước thiết lập (thực hiện một lần)

1. **Kết nối GitHub với Cloudflare:**
   - đăng nhập Cloudflare, vào *Workers & Pages* → *Create* → *Import a repository*;
   - chọn GitHub, cấp quyền cho ứng dụng Cloudflare truy cập kho `thunvit/smart-office`.
2. **Cấu hình bản dựng:**
   - Project name: `smart-office`;
   - Production branch: `main`;
   - Build command: để trống;
   - Deploy command: `npx wrangler deploy`.

   Lưu để chạy lần triển khai đầu tiên.
3. **Khai báo mật khẩu quản trị ban đầu:**
   - vào *Workers & Pages* → `smart-office` → *Settings* → *Variables and Secrets* → *Add*;
   - chọn loại *Secret*, tên `ADMIN_PASSWORD`, nhập mật khẩu mạnh (tối thiểu 12 ký tự).

   Chưa khai báo bí mật này thì tài khoản `admin` không đăng nhập được. Mục đích là để không ai lợi dụng mật khẩu mặc định trên địa chỉ công khai.
4. **Đăng nhập lần đầu:**
   - mở địa chỉ `workers.dev`, đăng nhập `admin` bằng mật khẩu vừa khai báo;
   - hệ thống bắt buộc đổi mật khẩu ngay;
   - sau đó vào *Quản trị* để khai báo đơn vị, phòng ban và người dùng.
5. **Bản trình diễn cho khách hàng (nếu cần):** tạo thêm một Worker riêng, đặt biến `SO_DEMO=1` để nạp dữ liệu mẫu. Không bật dữ liệu mẫu trên bản dùng thật, vì tài khoản mẫu dùng mật khẩu đơn giản.

Từ đó về sau, mỗi lần mã mới được đẩy lên nhánh `main`:
- GitHub Actions tự kiểm tra cú pháp và chạy kiểm thử lõi;
- Cloudflare tự triển khai bản mới;
- người dùng PWA nhận thông báo "Đã có phiên bản SmartOffice mới".

Nếu muốn triển khai bằng GitHub Actions thay cho Workers Builds, khai báo hai bí mật `CLOUDFLARE_API_TOKEN` và `CLOUDFLARE_ACCOUNT_ID` cho kho GitHub; tệp `.github/workflows/trien-khai-cloudflare.yml` sẽ tự chạy. Chỉ dùng một trong hai cách để tránh triển khai hai lần.

## A.3. Gói dịch vụ, giới hạn

1. **Chọn gói:** nên dùng gói **Workers Paid**. Ở gói Free, thời gian CPU cho mỗi yêu cầu rất thấp; thao tác băm mật khẩu khi đăng nhập (scrypt) có thể vượt giới hạn này.
2. **Mô hình dữ liệu hiện tại:** toàn bộ dữ liệu nằm trong một Durable Object `main`, tức một đơn vị khách hàng. Việc tách mỗi khách hàng một Durable Object riêng sẽ làm theo Thiết kế đa đơn vị, Phiên 2–4.
3. **Kích thước tệp:** tệp đính kèm tối đa 20 MB, lưu thành các khối 1 MB vì mỗi dòng dữ liệu của Durable Object giới hạn 2 MB.
4. **Sao lưu:** chức năng "Sao lưu" trong phần Quản trị không áp dụng trên Cloudflare; thay vào đó là cơ chế khôi phục theo thời điểm của Durable Objects.
5. **Giờ hệ thống:** ứng dụng luôn tính theo giờ Việt Nam (UTC+7) cho chấm công, hạn công việc và nhật ký, dù máy chủ Cloudflare chạy theo giờ UTC.

## A.4. Trợ lý AI (tùy chọn; ADR-010)

Trợ lý mặc định **tắt**. Chỉ cấu hình sau khi pháp chế xác nhận điều kiện gửi dữ liệu tới nhà cung cấp AI (Luật Bảo vệ dữ liệu cá nhân 2025).

Mỗi người dùng một trợ lý riêng: người dùng tự chọn nhà cung cấp, mô hình và nhập khóa API của mình tại **Tài khoản › Trợ lý AI của tôi**. Quản trị hệ thống chỉ cần khai báo bí mật mã hóa khóa; khóa chung của đơn vị là tùy chọn.

1. Trên trang Cloudflare: *Workers & Pages › smart-office › Settings › Variables and Secrets*, thêm:

   | Tên | Loại | Giá trị |
   |---|---|---|
   | `AI_KEY_SECRET` | **Secret**, bắt buộc | Chuỗi ngẫu nhiên dài (tối thiểu 32 ký tự) dùng mã hóa khóa API cá nhân trong CSDL. Thiếu bí mật này thì người dùng không lưu được khóa. **Không đổi, không xóa** sau khi đã dùng: đổi bí mật thì mọi khóa đã lưu không giải mã được, người dùng phải nhập lại |
   | `AI_API_KEY` | Secret, tùy chọn | Khóa chung của đơn vị, dùng cho người chưa nhập khóa cá nhân |
   | `AI_PROVIDER` | Text, tùy chọn | Nhà cung cấp của khóa chung: `anthropic` (mặc định), `openai`, `gemini` |
   | `AI_MODEL` | Text, tùy chọn | Mô hình của khóa chung; bắt buộc với `openai`, `gemini`. Anthropic để trống thì dùng `claude-opus-5-5` |
   | `AI_EFFORT` | Text, tùy chọn | Mức suy luận mặc định của khóa chung (Anthropic): `low`, `medium`, `high` |
   | `AI_FALLBACK` | Text, tùy chọn | Anthropic: đặt `0` để tắt cơ chế tự chuyển mô hình dự phòng khi mô hình chính từ chối |
   | `AI_BASE_URL` | Text, tùy chọn | Địa chỉ API tương thích, **chỉ áp dụng cho khóa chung**; khóa cá nhân luôn gửi tới địa chỉ chính thức của nhà cung cấp |
   | `AI_STT_MODEL` | Text, tùy chọn | Mô hình chuyển giọng nói của khóa chung OpenAI (mặc định `whisper-1`). Gemini dùng `AI_MODEL`; Anthropic không nhận âm thanh (giao diện dùng nhận dạng của trình duyệt) |

   Bản Node: đặt các biến môi trường cùng tên trước khi chạy `node server.js`. Không đặt `AI_KEY_SECRET` thì máy chủ tự sinh tệp `<DATA_DIR>/ai-key.secret`; sao lưu thư mục dữ liệu phải kèm tệp này.
2. Đăng nhập quản trị › **Quản trị › Trợ lý AI**: bật trợ lý cho đơn vị, đặt hạn mức token mỗi người mỗi ngày (mặc định 200.000). Chỉ đánh dấu "Cho phép gửi thông tin cá nhân" khi có văn bản đồng ý của đơn vị.
3. Mỗi người dùng: **Tài khoản › Trợ lý AI của tôi** → chọn nhà cung cấp, mô hình, dán khóa API → **Lưu cấu hình** → **Kiểm tra kết nối**.
4. Kiểm tra: nút **Trợ lý** hiện ở góc phải dưới; hỏi "Hôm nay tôi cần làm gì?".
5. Chi phí: theo token, tính vào tài khoản của khóa được dùng (cá nhân hoặc chung). Thống kê 30 ngày tại Quản trị › Trợ lý AI.

6. **Vị trí chạy:** `wrangler.jsonc` đặt `"placement": { "region": "azure:southeastasia" }` để Worker gọi nhà cung cấp AI từ Singapore. Không có cấu hình này, người dùng Việt Nam thường được phục vụ tại Hồng Kông (xem `colo=` ở `/cdn-cgi/trace`), nơi Anthropic, OpenAI, Gemini không phục vụ, và nhận lỗi `403 Request not allowed` (ADR-010 mục 2I). Không xóa khối này khi sửa `wrangler.jsonc`.

### A.4.1. Hướng dẫn quản trị Cloudflare khai báo bí mật `AI_KEY_SECRET`

**Mục đích:**
- Mã hóa khóa API trợ lý AI cá nhân (Anthropic, OpenAI, Gemini) của người dùng trước khi lưu vào cơ sở dữ liệu (AES-256-GCM, `ai-key.js`).
- Tạo mã nội bộ để Worker chứng minh với Durable Object rằng yêu cầu lấy khóa đến từ máy chủ, không phải từ trình duyệt.

Bí mật này **không** mã hóa dữ liệu nghiệp vụ, mẫu giọng, bản ghi âm hay khóa chung `AI_API_KEY`.

**Thời điểm:** làm **trước** khi hợp nhất bản có trợ lý AI vào `main`. Thiếu bí mật này thì người dùng lưu khóa cá nhân sẽ nhận lỗi "Máy chủ chưa khai báo bí mật AI_KEY_SECRET…".

**Người thực hiện:** quản trị Cloudflare của đơn vị (tài khoản có quyền sửa Worker `smart-office`). Trợ lý AI không nhập bí mật thay quản trị (CLAUDE.md mục 4.3).

**Bước 1. Tạo giá trị bí mật**

- **Tên** biến là `AI_KEY_SECRET`. **Giá trị** phải là chuỗi ngẫu nhiên, tối thiểu 32 ký tự.
- Không dùng chính chữ `AI_KEY_SECRET`, tên đơn vị, mật khẩu đang dùng ở nơi khác, hay chuỗi đã ghi trong tài liệu, tin nhắn, kho mã. Ai biết giá trị này và có tệp sao lưu dữ liệu đều giải mã được toàn bộ khóa API của người dùng.
- Tạo chuỗi trên máy của quản trị bằng **một** trong các cách sau, rồi sao chép kết quả (64 ký tự hex):
  - Windows PowerShell:
    ```powershell
    $b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); -join ($b | ForEach-Object { $_.ToString('x2') })
    ```
    Dùng bộ sinh số ngẫu nhiên mật mã của Windows; chạy được trên Windows PowerShell 5.1.
  - Node.js (máy đã cài để chạy SmartOffice):
    ```bash
    node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
    ```
  - OpenSSL (Git Bash, Linux, macOS):
    ```bash
    openssl rand -hex 32
    ```
- Lưu chuỗi vào kho mật khẩu của đơn vị (hoặc phong bì niêm phong theo quy chế), ghi chú "SmartOffice – AI_KEY_SECRET – ngày khai báo". Không gửi qua thư điện tử, Zalo, không ghi vào kho mã.

**Bước 2. Khai báo trên trang quản trị Cloudflare**

1. Đăng nhập https://dash.cloudflare.com bằng tài khoản quản trị của đơn vị.
2. Vào *Workers & Pages* → chọn Worker `smart-office` → thẻ *Settings* → mục *Variables and Secrets* → bấm *Add*.
3. Nhập:
   - *Type*: **Secret** (không chọn *Text*: giá trị kiểu Text hiện công khai trên trang quản trị và có thể bị cấu hình `vars` trong `wrangler.jsonc` ghi đè khi triển khai);
   - *Variable name*: `AI_KEY_SECRET` (đúng chữ hoa, dấu gạch dưới);
   - *Value*: dán chuỗi đã tạo ở Bước 1.
4. Bấm *Deploy* (hoặc *Save and deploy*). Cloudflare tạo một phiên bản Worker mới mang bí mật này; dữ liệu Durable Object giữ nguyên.
5. Kiểm tra lại danh sách: dòng `AI_KEY_SECRET`, loại *Secret*, giá trị hiển thị dạng ẩn. Sau khi lưu, Cloudflare không cho xem lại giá trị; đây là lý do phải lưu chuỗi ở Bước 1.

Cách khác bằng dòng lệnh (máy đã đăng nhập `wrangler`):
```bash
npx wrangler secret put AI_KEY_SECRET
```
Lệnh hỏi giá trị; dán chuỗi đã tạo rồi Enter.

**Bước 3. Kiểm tra sau khi bản có trợ lý AI đã triển khai**

1. Đăng nhập SmartOffice bằng một tài khoản thử → **Tài khoản › Trợ lý AI của tôi** → chọn nhà cung cấp, dán khóa API → **Lưu cấu hình**.
2. Đạt khi lưu được, không hiện lỗi "chưa khai báo bí mật AI_KEY_SECRET", và **Kiểm tra kết nối** trả kết quả thành công.
3. Ghi kết quả vào `docs/07-nhat-ky/NHAT-KY-PHIEN.md` (ngày, người khai báo, kết quả kiểm tra; **không** ghi giá trị bí mật).

**Lưu ý vận hành:**
- **Không đổi, không xóa** `AI_KEY_SECRET` sau khi đã có người lưu khóa. Đổi bí mật thì mọi khóa đã lưu không giải mã được, hệ thống coi như người dùng chưa có khóa và họ phải nhập lại.
- **Khi lộ bí mật** (nghi ngờ người khác biết giá trị):
  1. tạo chuỗi mới, khai báo đè lên `AI_KEY_SECRET`;
  2. thông báo người dùng nhập lại khóa API;
  3. khuyến nghị người dùng thu hồi khóa cũ tại trang của nhà cung cấp.
- **Khôi phục dữ liệu vào Worker mới** (ADR-009): phải khai báo đúng `AI_KEY_SECRET` cũ thì khóa trong bản sao lưu mới dùng được.

# PHẦN B. CLOUDFLARE TUNNEL (MÁY CHỦ CỦA ĐƠN VỊ)

## I. MỤC ĐÍCH, PHẠM VI

1. Phần B áp dụng khi chọn Phương án B. Đưa SmartOffice ra Internet tại địa chỉ `https://smartoffice.vnptninhbinh.com.vn`, người dùng truy cập được từ máy tính và điện thoại, cài được như ứng dụng (PWA).
2. Không mở cổng vào (inbound) trên tường lửa của đơn vị; toàn bộ kết nối từ Internet đi qua Cloudflare.
3. Dữ liệu nghiệp vụ (cơ sở dữ liệu, tệp đính kèm) lưu tại máy chủ của đơn vị; Cloudflare chỉ làm nhiệm vụ trung chuyển có mã hóa, chống tấn công và lưu đệm tệp giao diện tĩnh.

## II. MÔ HÌNH KẾT NỐI

```
Người dùng (trình duyệt / ứng dụng PWA)
        │  HTTPS, chứng chỉ do Cloudflare cấp
        ▼
Cloudflare (tên miền, WAF, chống DDoS, giới hạn tần suất)
        │  Cloudflare Tunnel – kết nối mã hóa do máy chủ chủ động mở ra ngoài
        ▼
Máy chủ SmartOffice (Node.js, cổng 3000 nội bộ) ── data/smartoffice.db, data/files
```

Máy chủ chỉ cần kết nối Internet chiều đi; không cần IP tĩnh, không cần mở cổng 80/443.

## III. ĐIỀU KIỆN TIÊN QUYẾT

| STT | Nội dung | Đầu mối |
|---|---|---|
| 1 | Máy chủ chạy liên tục 24/7 (Windows 10/11, Windows Server hoặc Ubuntu 22.04 trở lên), tối thiểu 4 vCPU, 8 GB RAM, ổ SSD | Kỹ thuật |
| 2 | Node.js phiên bản 22.13 trở lên | Kỹ thuật |
| 3 | Tài khoản Cloudflare của đơn vị (gói Free đủ cho giai đoạn thí điểm) | Kỹ thuật |
| 4 | Quyền quản lý DNS của tên miền `vnptninhbinh.com.vn` (xem mục IV) | Lãnh đạo đơn vị, bộ phận quản lý tên miền |

## IV. TÊN MIỀN – HIỆN TRẠNG VÀ PHƯƠNG ÁN (áp dụng cho cả Phần A và Phần B)

### IV.1. Hiện trạng

Kết quả tra cứu ngày 05/11/2026: tên miền `vnptninhbinh.com.vn` đang dùng máy chủ tên miền `ns1.vdconline.vn`, `ns2.vdconline.vn` (VDC), **chưa đặt trên Cloudflare**. Muốn gắn `smartoffice.vnptninhbinh.com.vn` vào Cloudflare Tunnel, phải chọn một trong các phương án dưới đây.

### IV.2. Các phương án

| Phương án | Cách làm | Gói Cloudflare | Ưu điểm | Hạn chế |
|---|---|---|---|---|
| **A. Chuyển DNS toàn bộ tên miền sang Cloudflare (khuyến nghị)** | Thêm `vnptninhbinh.com.vn` vào Cloudflare, kiểm tra đủ các bản ghi hiện có (website, MX thư điện tử, SPF, DKIM…), sau đó đổi máy chủ tên miền tại nhà đăng ký sang 2 máy chủ Cloudflare cấp | Free | Miễn phí; quản lý tập trung; thuận lợi cho giai đoạn đa đơn vị | Ảnh hưởng toàn bộ tên miền của đơn vị, cần lãnh đạo phê duyệt và rà soát kỹ bản ghi thư điện tử trước khi đổi |
| B. Giữ DNS tại VDC, dùng Cloudflare for SaaS | Đặt một tên miền khác của đơn vị trên Cloudflare; tại VDC tạo bản ghi CNAME `smartoffice` trỏ về tên miền đó; khai báo `smartoffice.vnptninhbinh.com.vn` là tên miền tùy chỉnh | Free (100 tên miền tùy chỉnh đầu tiên miễn phí, sau đó 0,10 USD/tên miền) | Không động đến DNS hiện tại | Phải có thêm một tên miền trên Cloudflare; không hỗ trợ tên miền tùy chỉnh dạng `*` (trừ gói Enterprise) nên mỗi khách hàng một bản ghi |
| C. Thiết lập CNAME (partial) cho `vnptninhbinh.com.vn` | Giữ DNS tại VDC, chỉ ủy quyền từng tên miền con qua CNAME | Business trở lên | Không đổi máy chủ tên miền | Chi phí gói Business |

Ghi chú: ủy quyền riêng tên miền con `smartoffice.vnptninhbinh.com.vn` thành một vùng (zone) độc lập trên Cloudflare chỉ áp dụng cho gói Enterprise.

### IV.3. Lưu ý cho giai đoạn đa đơn vị

Chứng chỉ miễn phí (Universal SSL) của Cloudflare chỉ bảo vệ tên miền gốc và tên miền con cấp 1, tức là bảo vệ `smartoffice.vnptninhbinh.com.vn` nhưng **không** bảo vệ `<mã-đơn-vị>.smartoffice.vnptninhbinh.com.vn` (cấp 2). Khi triển khai đa đơn vị theo tên miền con, cần một trong các cách sau:

- mua Advanced Certificate Manager để cấp chứng chỉ cho `*.smartoffice.vnptninhbinh.com.vn`;
- hoặc tải lên chứng chỉ riêng;
- hoặc đổi quy ước địa chỉ sang tên miền con cấp 1 (ví dụ `<mã-đơn-vị>-so.vnptninhbinh.com.vn`).

Nội dung này cần được chốt trước Phiên 2 của kế hoạch phát triển.

## V. CÁC BƯỚC TRIỂN KHAI TRÊN WINDOWS

**Bước 1. Cài đặt phần mềm.** Cài Node.js 22 LTS. Chép thư mục SmartOffice vào ổ đĩa máy chủ, ví dụ `C:\SmartOffice`.

**Bước 2. Cho SmartOffice tự chạy cùng máy chủ.** Chuột phải tệp `deploy\cloudflare\Cai-SmartOffice-tu-khoi-dong.bat` → *Run as administrator*. Tệp tạo tác vụ "SmartOffice" trong Task Scheduler, chạy với `TRUST_PROXY=1` và `PUBLIC_ORIGINS=https://smartoffice.vnptninhbinh.com.vn`. Nhật ký ghi tại `data\server.log`.

**Bước 3. Tạo tunnel trên Cloudflare.** Đăng nhập Cloudflare → *Zero Trust* → *Networks* → *Tunnels* → *Create a tunnel* → chọn *Cloudflared* → đặt tên `smartoffice` → sao chép mã token ở bước *Install and run a connector*.

**Bước 4. Cài connector.** Chuột phải `deploy\cloudflare\Cai-dat-Cloudflare-Tunnel.bat` → *Run as administrator* → dán mã token. Tệp cài `cloudflared` thành dịch vụ Windows, tự khởi động cùng máy.

**Bước 5. Gắn tên miền.** Trên trang tunnel, mục *Public Hostname* → *Add a public hostname*:
- Subdomain: `smartoffice`
- Domain: `vnptninhbinh.com.vn`
- Service: `HTTP` · URL: `localhost:3000`

Bước này chỉ thực hiện được sau khi đã hoàn thành một phương án tại mục IV.

**Bước 6. Kiểm tra.**
- Mở `https://smartoffice.vnptninhbinh.com.vn/healthz`, kết quả phải là `ok`.
- Đăng nhập bằng tài khoản quản trị; đổi mật khẩu mặc định.
- Trên điện thoại, cài ứng dụng theo mục VII.

### Triển khai trên Ubuntu/Debian

Chạy lệnh `sudo bash deploy/linux/install.sh <MÃ_TOKEN_TUNNEL>`. Kịch bản thực hiện các việc sau:
- cài Node.js 22;
- tạo tài khoản hệ thống `smartoffice`;
- chép mã nguồn vào `/opt/smartoffice` và đặt dữ liệu tại `/var/lib/smartoffice`;
- tạo dịch vụ systemd `smartoffice`;
- cài `cloudflared` từ kho chính thức của Cloudflare.

## VI. CẤU HÌNH AN TOÀN KHUYẾN NGHỊ TRÊN CLOUDFLARE

| STT | Mục cấu hình | Giá trị |
|---|---|---|
| 1 | SSL/TLS → Edge Certificates → Always Use HTTPS | Bật |
| 2 | SSL/TLS → Edge Certificates → Minimum TLS Version | TLS 1.2 |
| 3 | Security → WAF → Managed rules | Bật bộ quy tắc miễn phí |
| 4 | Security → WAF → Rate limiting rules | Giới hạn đường dẫn `/api/login` (ví dụ 10 yêu cầu/phút/IP), hành động *Block* |
| 5 | Caching → Cache Rules | Bỏ qua lưu đệm (*Bypass cache*) cho đường dẫn bắt đầu bằng `/api/` |
| 6 | Speed → Optimization | Không bật Rocket Loader (có thể làm sai thứ tự nạp mã giao diện) |

Phía máy chủ, SmartOffice v1.4 đã có các cơ chế sau:
- **Định danh người dùng thật:** nhận diện IP thật qua header `CF-Connecting-IP`, áp dụng cho giới hạn đăng nhập sai và chấm công theo IP.
- **Cookie phiên an toàn:** cookie phiên được gắn cờ `Secure` khi truy cập qua HTTPS.
- **HSTS:** gửi header `Strict-Transport-Security`.
- **Chặn nhúng trang:** gửi header `X-Frame-Options: DENY`.
- **Kiểm tra nguồn gửi:** yêu cầu ghi dữ liệu chỉ được chấp nhận từ địa chỉ khai báo trong `PUBLIC_ORIGINS`.

## VII. CÀI ỨNG DỤNG (PWA) CHO NGƯỜI DÙNG

| Thiết bị | Cách cài |
|---|---|
| Android (Chrome) | Mở địa chỉ SmartOffice → chạm thông báo "Cài đặt" ở cuối màn hình, hoặc menu tài khoản → *Cài ứng dụng lên thiết bị* |
| iPhone, iPad (Safari) | Mở bằng Safari → nút *Chia sẻ* → *Thêm vào MH chính* → *Thêm* |
| Máy tính Windows, macOS (Chrome, Edge) | Biểu tượng cài đặt ở thanh địa chỉ, hoặc menu tài khoản → *Cài ứng dụng lên thiết bị* |

Đặc điểm của bản PWA:
- **Mở như ứng dụng:** chạy toàn màn hình, không hiện thanh địa chỉ.
- **Lối tắt:** có lối tắt nhanh tới Phê duyệt, Công việc, Chấm công, Nhắn tin.
- **Khi mất mạng:** khung giao diện vẫn mở được, có thanh báo trạng thái và tự tải lại dữ liệu khi có mạng.
- **Dữ liệu không lưu trên thiết bị:** dữ liệu nghiệp vụ không được lưu đệm trên thiết bị, nhằm bảo vệ thông tin khi nhiều người dùng chung máy.

PWA chỉ hoạt động khi truy cập qua HTTPS (hoặc `localhost`). Vì vậy truy cập trực tiếp bằng địa chỉ IP nội bộ dạng `http://192.168.x.x:3000` sẽ không cài được ứng dụng.

## VIII. VẬN HÀNH

1. **Sao lưu:** sao lưu hằng ngày thư mục `data` (gồm `smartoffice.db` và `files`), lưu ít nhất một bản ở vị trí khác máy chủ.
2. **Cập nhật phiên bản:** cập nhật mã nguồn, tăng giá trị `VERSION` trong `public/sw.js`, rồi khởi động lại tác vụ "SmartOffice". Người dùng sẽ nhận thông báo "Đã có phiên bản SmartOffice mới".
3. **Giám sát:** theo dõi địa chỉ `/healthz` (có thể dùng Cloudflare Health Checks hoặc công cụ giám sát của đơn vị) và trạng thái tunnel trên trang Zero Trust.

## IX. CĂN CỨ, LƯU Ý PHÁP LÝ

1. Luật Bảo vệ dữ liệu cá nhân năm 2025 và Nghị định số 356/2025/NĐ-CP (hiệu lực từ 01/01/2026):
   - Cloudflare giải mã lưu lượng HTTPS tại điểm biên, nên là bên tham gia xử lý dữ liệu.
   - Khi kinh doanh dịch vụ, pháp chế cần nêu rõ nội dung này trong hợp đồng xử lý dữ liệu với khách hàng.
   - Pháp chế cần đánh giá nghĩa vụ liên quan đến chuyển dữ liệu ra nước ngoài, nếu có.
2. Luật An ninh mạng số 116/2025/QH15 (hiệu lực từ 01/7/2026) và các văn bản hướng dẫn về lưu trữ dữ liệu: mô hình Tunnel giữ cơ sở dữ liệu tại máy chủ đặt ở Việt Nam. Pháp chế cần đối chiếu yêu cầu cụ thể của văn bản hướng dẫn hiện hành.
3. Các mức giá, gói dịch vụ Cloudflare nêu tại mục IV được tra cứu từ tài liệu chính thức của Cloudflare ngày 05/11/2026 và có thể thay đổi:
   - [Subdomain setup](https://developers.cloudflare.com/dns/zone-setups/subdomain-setup/)
   - [Partial (CNAME) setup](https://developers.cloudflare.com/dns/zone-setups/partial-setup/setup/)
   - [Cloudflare for SaaS – Plans](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/plans/)
   - [Universal SSL – Limitations](https://developers.cloudflare.com/ssl/edge-certificates/universal-ssl/limitations)
