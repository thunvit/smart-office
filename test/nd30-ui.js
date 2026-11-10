/* Kiểm thử giao diện "Soạn văn bản theo thể thức Nghị định 30/2020/NĐ-CP" bằng Playwright (chỉ chạy cục bộ, không thuộc mã chạy, không đưa vào CI).
 * Tự dựng máy chủ Node với DATA_DIR tạm (dữ liệu mẫu, mật khẩu mẫu chỉ dùng cục bộ) và máy chủ Anthropic giả lập; không gọi mô hình thật.
 *   node test/nd30-ui.js <thư-mục-lưu-ảnh-và-tệp-tải-về>
 * Phạm vi: chọn loại văn bản, nhập thể thức, nhờ AI soạn nội dung (JSON), xem trước, kiểm tra thể thức, phụ lục, tải .docx, lưu vào Tài liệu,
 * chuyển sang văn bản tự do; 1440 px sáng và 360 px tối không cuộn ngang; không có lỗi JavaScript. */
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
const { spawn } = require('child_process');
const OUT = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'nd30-ui-'));
fs.mkdirSync(OUT, { recursive: true });
let fails = 0;
const ok = (c, m, d) => { console.log((c ? 'ĐẠT ' : 'LỖI ') + m + (!c && d !== undefined ? ' ' + JSON.stringify(d).slice(0, 300) : '')); if (!c) fails++; };
const AI_JSON = { trich_yeu: 'Đề nghị hỗ trợ đào tạo chuyển đổi số', kinh_gui: ['Sở Thông tin và Truyền thông'], noi_dung: 'Thực hiện Kế hoạch số 12/KH-UBND, Sở Nội vụ đề nghị hỗ trợ đào tạo cho 20 cán bộ.\nKinh phí do đơn vị tự đảm bảo [cần bổ sung: mức kinh phí].', noi_nhan: ['Văn phòng UBND tỉnh'] };
(async () => {
  const seen = [];
  const mock = http.createServer((req, res) => { let b = ''; req.on('data', c => b += c); req.on('end', () => {
    const body = JSON.parse(b); seen.push(body);
    const structured = /Hệ thống tự dựng thể thức/.test(JSON.stringify(body.system));
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ content: [{ type: 'text', text: structured ? '```json\n' + JSON.stringify(AI_JSON) + '\n```' : 'Thư thử' }], stop_reason: 'end_turn', usage: { input_tokens: 100, output_tokens: 50 } }));
  }); }).listen(0, '127.0.0.1');
  await new Promise(r => mock.on('listening', r));
  const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'so-nd30-ui-')), PORT = 3980 + Math.floor(Math.random() * 9), BASE = `http://localhost:${PORT}`;
  const cenv = { ...process.env }; delete cenv.AI_KEY_SECRET; delete cenv.SO_AI_ORG_KEY;
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: { ...cenv, DATA_DIR: DIR, PORT: String(PORT), AI_PROVIDER: 'anthropic', AI_API_KEY: 'mock-key', AI_BASE_URL: `http://127.0.0.1:${mock.address().port}` }, stdio: 'ignore' });
  const br = await chromium.launch(), errs = [];
  try {
    for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE + '/healthz')).ok) break; } catch (e) {} await new Promise(r => setTimeout(r, 200)); }
    // Bật trợ lý (quản trị): đổi mật khẩu lần đầu bằng mật khẩu ngẫu nhiên rồi gọi API cấu hình
    const ck = {}, req = async (who, method, p, body) => { const r = await fetch(BASE + p, { method, headers: { 'content-type': 'application/json', origin: BASE, cookie: ck[who] || '' }, body: body ? JSON.stringify(body) : undefined }); const sc = r.headers.get('set-cookie'); if (sc) ck[who] = sc.split(';')[0]; return r; };
    await req('a', 'POST', '/api/login', { username: 'admin', password: 'Admin@123' });
    await req('a', 'PUT', '/api/me/password', { old_password: 'Admin@123', new_password: 'Ui' + crypto.randomBytes(5).toString('hex') + '7' });
    ok((await req('a', 'PUT', '/api/admin/ai-settings', { enabled: true, daily_tokens: 500000 })).status === 200, 'bật trợ lý AI (quản trị)');

    async function session(width, scheme) {
      const ctx = await br.newContext({ viewport: { width, height: 900 }, colorScheme: scheme, acceptDownloads: true }), pg = await ctx.newPage();
      pg.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL_CONNECTION_FAILED|status of 40[13]|Failed to load resource/.test(m.text())) errs.push(width + ': ' + m.text()); });
      pg.on('pageerror', e => errs.push(width + ' pageerror: ' + e.message));
      await pg.goto(BASE + '/');
      const st = await pg.evaluate(async () => (await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'mai.bt', password: '123456' }) })).status);
      ok(st === 200, `mai.bt đăng nhập (HTTP ${st})`);
      await pg.reload(); await pg.waitForSelector('#main'); await pg.waitForFunction(() => window.SO_AI && window.SO_AI.status && window.SO_AI.status().enabled, null, { timeout: 8000 }).catch(() => {});
      return { ctx, pg };
    }
    const noHScroll = async pg => pg.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1 && document.querySelector('.modal').scrollWidth <= document.querySelector('.modal').clientWidth + 1);

    // ===== 1440 px, sáng =====
    let { ctx, pg } = await session(1440, 'light');
    await pg.evaluate(() => { location.hash = '#tai-lieu'; }); await pg.waitForSelector('[data-act="ai-draft"]');
    await pg.click('[data-act="ai-draft"]'); await pg.waitForSelector('#nd-root'); await pg.waitForTimeout(200);
    const sheet = async () => (await pg.textContent('#nd-sheet')).replace(/\s+/g, ' ');
    ok(await pg.inputValue('#nd-type') === 'congvan' && /CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM.*Độc lập - Tự do - Hạnh phúc/.test(await sheet()), 'mở hộp thoại: mặc định công văn, xem trước có Quốc hiệu, Tiêu ngữ');
    ok((await pg.locator('#nd-type optgroup').count()) === 4 && (await pg.locator('#nd-type option').count()) === 27, 'danh sách loại: 3 nhóm theo Điều 7 + văn bản tự do, 26 loại có mẫu', await pg.locator('#nd-type option').count());
    await pg.fill('[data-k="org_parent"]', 'UBND tỉnh Ninh Bình'); await pg.fill('[data-k="org_name"]', 'Sở Nội vụ'); await pg.fill('[data-k="abbr"]', 'snv'); await pg.fill('[data-k="dv"]', 'vp'); await pg.fill('[data-k="place"]', 'Ninh Bình');
    await pg.fill('[data-k="date"]', '2026-01-05'); await pg.fill('[data-k="so"]', '5'); await pg.waitForTimeout(450);
    let t = await sheet();
    ok(t.includes('UBND TỈNH NINH BÌNH') && t.includes('SỞ NỘI VỤ') && t.includes('Số: 05/SNV-VP') && t.includes('Ninh Bình, ngày 05 tháng 01 năm 2026'), 'nhập thể thức: tên cơ quan in hoa, số 05/SNV-VP, ngày 05 tháng 01 năm 2026 (xem trước cập nhật ngay)', t.slice(0, 200));
    ok((await pg.evaluate(() => JSON.parse(localStorage.getItem('so-nd30-header') || '{}').abbr)) === 'snv', 'thông tin thể thức được nhớ tại trình duyệt');
    // AI soạn nội dung
    await pg.fill('#nd-brief', 'Đề nghị Sở TTTT hỗ trợ đào tạo chuyển đổi số cho 20 cán bộ'); await pg.click('[data-act="nd-ai"]');
    await pg.waitForFunction(() => /Đã soạn bằng/.test(document.querySelector('#nd-st').textContent), null, { timeout: 15000 });
    ok(await pg.inputValue('[data-k="trich_yeu"]') === 'Đề nghị hỗ trợ đào tạo chuyển đổi số' && (await pg.inputValue('[data-k="kinh_gui"]')) === 'Sở Thông tin và Truyền thông' && (await pg.inputValue('[data-k="noi_dung"]')).includes('Kế hoạch số 12/KH-UBND'), 'AI trả JSON: trích yếu, kính gửi, nội dung điền vào đúng ô');
    ok(await pg.inputValue('#nd-brief') === 'Đề nghị Sở TTTT hỗ trợ đào tạo chuyển đổi số cho 20 cán bộ' && await pg.inputValue('[data-k="org_name"]') === 'Sở Nội vụ', 'sau khi AI trả lời: giữ nguyên ô yêu cầu và thể thức đã nhập');
    t = await sheet();
    ok(t.includes('V/v Đề nghị hỗ trợ đào tạo chuyển đổi số') && t.includes('Kính gửi: Sở Thông tin và Truyền thông') && t.includes('Nơi nhận:') && t.includes('- Như trên;') && t.includes('Văn phòng UBND tỉnh') && t.includes('Lưu: VT, VP'), 'xem trước: V/v, Kính gửi, nơi nhận (Như trên, Lưu: VT, VP)', t.slice(0, 400));
    ok((await pg.locator('#nd-sheet span[style*="fff2a8"]').count()) === 1, 'chỗ [cần bổ sung: …] được tô vàng');
    const body0 = seen.find(b => /Hệ thống tự dựng thể thức/.test(JSON.stringify(b.system)));
    ok(body0 && !body0.tools && /Cơ quan ban hành: Sở Nội vụ, trực thuộc UBND tỉnh Ninh Bình/.test(body0.messages[0].content), 'yêu cầu gửi AI: lời nhắc thể thức, không công cụ, kèm tên cơ quan nhập trên form');
    // Kiểm tra thể thức
    const cb = await pg.textContent('#nd-chk-b');
    ok(/\d+ lỗi/.test(cb), 'tab kiểm tra thể thức hiện số lỗi: ' + cb);
    await pg.click('#nd-chk-b'); await pg.waitForSelector('.nd-ck li');
    const ck1 = (await pg.textContent('#nd-chk')).replace(/\s+/g, ' ');
    ok(/Chưa nhập chức vụ người ký|cần bổ sung/.test(ck1) && /Điều 8|Phụ lục I/.test(ck1), 'danh sách lỗi kèm căn cứ (Điều, Phụ lục)', ck1.slice(0, 200));
    await pg.screenshot({ path: OUT + '/nd-1-kiem-tra.png' });
    await pg.fill('[data-k="ky.chuc_vu"]', 'Phó Giám đốc'); await pg.fill('[data-k="ky.name"]', 'Nguyễn Văn A'); await pg.selectOption('[data-k="_qk"]', 'KT.'); await pg.fill('[data-k="_qd"]', 'Giám đốc');
    await pg.fill('[data-k="noi_dung"]', (await pg.inputValue('[data-k="noi_dung"]')).replace(/\[cần bổ sung[^\]]*\]/, '5 triệu đồng')); await pg.waitForTimeout(450);
    await pg.click('[data-act="nd-tab"][data-t="prev"]');
    t = await sheet();
    ok(t.includes('KT. GIÁM ĐỐC') && t.includes('PHÓ GIÁM ĐỐC') && t.includes('Nguyễn Văn A'), 'ký thay: KT. GIÁM ĐỐC / PHÓ GIÁM ĐỐC / họ tên');
    ok(/\(0 lỗi,/.test(await pg.textContent('#nd-chk-b')), 'đủ thành phần: tab kiểm tra không còn lỗi: ' + (await pg.textContent('#nd-chk-b')));
    await pg.screenshot({ path: OUT + '/nd-2-cong-van.png' });
    // Đổi sang quyết định: có căn cứ, thẩm quyền; giữ dữ liệu đã nhập
    await pg.selectOption('#nd-type', 'quyetdinh'); await pg.waitForTimeout(450);
    ok((await pg.locator('[data-k="can_cu"]').count()) === 1 && (await pg.locator('[data-k="tham_quyen"]').count()) === 1 && (await pg.locator('[data-k="kinh_gui"]').count()) === 0, 'đổi sang quyết định: hiện ô căn cứ, thẩm quyền; ẩn Kính gửi');
    await pg.fill('[data-k="can_cu"]', 'Căn cứ Luật Tổ chức chính quyền địa phương ngày 19 tháng 6 năm 2015;\nTheo đề nghị của Chánh Văn phòng'); await pg.fill('[data-k="tham_quyen"]', 'Giám đốc Sở Nội vụ');
    await pg.fill('[data-k="noi_dung"]', 'Điều 1. Thành lập Ban Chỉ đạo\nThành lập Ban gồm các thành viên trong Phụ lục.\nĐiều 2. Hiệu lực thi hành\nQuyết định này có hiệu lực kể từ ngày ký.');
    await pg.click('[data-act="nd-padd"]'); await pg.fill('[data-k="phu_luc.0.ten"]', 'Danh sách thành viên'); await pg.fill('[data-k="phu_luc.0.noi_dung"]', '1. Nguyễn Văn A\n2. Trần Thị B'); await pg.waitForTimeout(450);
    t = await sheet();
    ok(t.includes('QUYẾT ĐỊNH') && t.includes('Về việc đề nghị hỗ trợ') && t.includes('GIÁM ĐỐC SỞ NỘI VỤ') && /Căn cứ Luật Tổ chức chính quyền địa phương ngày 19 tháng 6 năm 2015;/.test(t) && t.includes('Theo đề nghị của Chánh Văn phòng.') && t.includes('QUYẾT ĐỊNH:') && t.includes('Điều 1. Thành lập Ban Chỉ đạo'), 'quyết định: Về việc, thẩm quyền in hoa, căn cứ (; và .), QUYẾT ĐỊNH:, Điều có tiêu đề', t.slice(0, 500));
    ok(t.includes('Phụ lục') && t.includes('DANH SÁCH THÀNH VIÊN') && t.includes('(Kèm theo Quyết định số 05/QĐ-SNV ngày 05 tháng 01 năm 2026 của Sở Nội vụ)'), 'phụ lục: tiêu đề, tên in hoa, chỉ dẫn “Kèm theo Quyết định số … của …”', t.slice(-300));
    ok((await pg.locator('#nd-sheet strong, #nd-sheet p[style*="font-weight:bold"]').count()) > 5, 'tiêu đề, Điều in đậm trong bản xem trước');
    await pg.screenshot({ path: OUT + '/nd-3-quyet-dinh.png' });
    // Tải .docx
    const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('[data-act="nd-docx"]')]);
    const fp = OUT + '/' + dl.suggestedFilename(); await dl.saveAs(fp);
    const bytes = fs.readFileSync(fp), s = bytes.toString('utf8');
    ok(/^quyet-dinh.*\.docx$/.test(dl.suggestedFilename()) && bytes.slice(0, 2).toString() === 'PK' && s.includes('word/document.xml') && s.includes('GIÁM ĐỐC SỞ NỘI VỤ') && s.includes('w:pgMar w:top="1134" w:right="851" w:bottom="1134" w:left="1701"') && s.includes('Danh sách thành viên'.toUpperCase()), 'tải tệp .docx: ZIP hợp lệ, khổ A4, lề 20/15/20/30 mm, đủ nội dung và phụ lục', { name: dl.suggestedFilename(), size: bytes.length });
    const z = require('child_process').spawnSync('unzip', ['-t', fp], { encoding: 'utf8' });
    ok(z.status === 0 && /No errors detected/.test(z.stdout), 'unzip -t: tệp .docx không lỗi');
    // Lưu vào Tài liệu
    await pg.click('[data-act="nd-save"]'); await pg.waitForFunction(() => /Đã lưu vào Tài liệu/.test(document.querySelector('#toast').textContent) || !document.querySelector('#nd-err').hidden, null, { timeout: 8000 });
    const msg = await pg.textContent('#toast'), err = await pg.textContent('#nd-err');
    ok(/Đã lưu vào Tài liệu|mã/.test(msg) || /403|quyền/.test(err), 'lưu bản thảo vào Tài liệu (hoặc báo đúng lỗi quyền): ' + (msg || err));
    // Giấy nghỉ phép: biểu mẫu nhập tay, không có ô AI
    await pg.selectOption('#nd-type', 'giaynghiphep'); await pg.waitForTimeout(300);
    ok((await pg.locator('#nd-brief').count()) === 0 && (await pg.locator('[data-k="gnp.ho_ten"]').count()) === 1, 'giấy nghỉ phép: biểu mẫu nhập trực tiếp, không có ô nhờ AI');
    await pg.fill('[data-k="gnp.ho_ten"]', 'Trần Thị B'); await pg.fill('[data-k="gnp.tu_ngay"]', '2026-11-16'); await pg.fill('[data-k="gnp.den_ngay"]', '2026-11-20'); await pg.waitForTimeout(400);
    t = await sheet(); ok(t.includes('GIẤY NGHỈ PHÉP') && t.includes('kể từ ngày 16/11/2026 đến hết ngày 20/11/2026') && t.includes('Xác nhận của cơ quan'), 'giấy nghỉ phép: ngày dd/mm/yyyy, khung xác nhận');
    ok(await noHScroll(pg), 'hộp thoại không cuộn ngang ở 1440 px');
    // Chuyển sang văn bản tự do
    await pg.selectOption('#nd-type', '__free'); await pg.waitForSelector('#aid-root');
    ok((await pg.locator('#aid-t option').allTextContents()).join('|') === 'Thư điện tử / thư công tác|Văn bản khác', 'chọn “văn bản tự do”: mở hộp thoại cũ, chỉ còn thư và văn bản khác');
    await pg.click('[data-act="aid-nd"]'); await pg.waitForSelector('#nd-root'); ok(true, 'từ văn bản tự do quay lại soạn theo thể thức');
    await ctx.close();

    // ===== 360 px, tối =====
    ({ ctx, pg } = await session(360, 'dark'));
    await pg.evaluate(() => { location.hash = '#tai-lieu'; }); await pg.waitForSelector('[data-act="ai-draft"]');
    await pg.click('[data-act="ai-draft"]'); await pg.waitForSelector('#nd-root'); await pg.waitForTimeout(300);
    await pg.fill('[data-k="org_name"]', 'Trung tâm Kinh doanh Giải pháp'); await pg.fill('[data-k="trich_yeu"]', 'Đề nghị phối hợp thực hiện nhiệm vụ rất dài để kiểm tra xuống dòng ở màn hình nhỏ'); await pg.waitForTimeout(400);
    ok(await noHScroll(pg), 'điện thoại 360 px, chế độ tối: không cuộn ngang');
    const dim = await pg.evaluate(() => { const f = document.querySelector('#nd-fit').getBoundingClientRect(), s = document.querySelector('#nd-sheet').getBoundingClientRect(); return { fit: f.width, sheet: s.width, zoom: document.querySelector('#nd-sheet').style.zoom }; });
    ok(dim.sheet <= dim.fit && Number(dim.zoom) < 0.5, 'bản xem trước thu nhỏ vừa khung ở 360 px', dim);
    const bg = await pg.evaluate(() => getComputedStyle(document.querySelector('#nd-sheet')).backgroundColor + '|' + getComputedStyle(document.querySelector('#nd-sheet')).color);
    ok(bg === 'rgb(255, 255, 255)|rgb(0, 0, 0)', 'tờ giấy xem trước luôn nền trắng, chữ đen (cả chế độ tối): ' + bg);
    await pg.screenshot({ path: OUT + '/nd-4-dien-thoai-toi.png' });
    await ctx.close();
    ok(errs.length === 0, 'không có lỗi JavaScript', errs.slice(0, 5));
  } catch (e) { ok(false, 'ngoại lệ: ' + String(e.message).split('\n').slice(0, 4).join(' | ')); } finally { await br.close(); child.kill(); mock.close(); }
  console.log(fails ? `${fails} KHÔNG ĐẠT` : 'TẤT CẢ ĐẠT'); console.log('Ảnh, tệp tải về: ' + OUT);
  process.exit(fails ? 1 : 0);
})();
