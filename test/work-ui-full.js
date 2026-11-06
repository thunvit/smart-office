/* Ghi chú: hộp thoại tự đặt tiêu điểm vào ô đầu tiên sau 30 ms (openModal), nên kiểm thử chờ 150 ms sau khi mở hộp thoại rồi mới nhập liệu.
 * Kiểm thử giao diện các chức năng đầy đủ theo Base Wework (so-1.8.0, ADR-007) bằng Playwright.
 * Chỉ chạy cục bộ, không thuộc mã chạy. Yêu cầu: máy chủ Node với DATA_DIR rỗng (dữ liệu mẫu, mật khẩu mẫu chỉ dùng cục bộ) tại cổng 3999, Python có openpyxl.
 *   DATA_DIR=$(mktemp -d) PORT=3999 node server.js &  ;  node test/work-ui-full.js <thư-mục-lưu-ảnh>
 * Phạm vi: tạo từ mẫu, trường tùy chỉnh (lựa chọn, công thức, bảng), phân quyền, thảo luận, tài liệu, hoạt động, thanh thông tin,
 * nhập Excel (tệp .xlsx nén deflate do openpyxl tạo), xuất Excel đọc lại được, Gantt .xlsx, nhân bản dự án, đánh dấu, nhân bản sang dự án khác,
 * báo cáo thành viên, báo cáo hệ thống, quản trị; điện thoại 390 px chế độ tối; không có lỗi JavaScript. */
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');
const SP = process.argv[2] || '.', BASE = 'http://localhost:3999';
const py = (code, ...args) => execFileSync('python3', ['-I', '-c', code, ...args]).toString();
(async () => {
  let CUR = null; const br = await chromium.launch(); const errs = []; let fails = 0, passes = 0;
  const ok = (c, m) => { console.log((c ? 'ĐẠT ' : 'LỖI ') + m); if (c) passes++; else fails++; };
  async function session(user, width, scheme) {
    const ctx = await br.newContext({ viewport: { width, height: 900 }, colorScheme: scheme, acceptDownloads: true });
    const pg = await ctx.newPage(); CUR = pg;
    pg.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL_CONNECTION_FAILED|status of 401|status of 403|status of 400/.test(m.text())) errs.push(user + ': ' + m.text()); });
    pg.on('pageerror', e => errs.push(user + ' pageerror: ' + e.message));
    await pg.goto(BASE + '/');
    const r = await pg.evaluate(async u => (await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: u, password: '123456' }) })).status, user);
    if (r !== 200) throw new Error('Đăng nhập ' + user + ' thất bại: ' + r);
    await pg.reload(); await pg.waitForSelector('#main');
    return { ctx, pg };
  }
  const nav = async (pg, h) => { await pg.evaluate(x => { location.hash = x; }, h); await pg.waitForTimeout(500); };
  const api = (pg, url, method = 'GET', body) => pg.evaluate(async ([u, m, b]) => { const r = await fetch(u, { method: m, headers: { 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }); return { s: r.status, j: await r.json().catch(() => null) }; }, [url, method, body]);
  const download = async (pg, act) => { const [d] = await Promise.all([pg.waitForEvent('download'), pg.click(act)]); const p = path.join(SP, d.suggestedFilename()); await d.saveAs(p); return p; };
  const xlsxText = p => py('import sys,zipfile;z=zipfile.ZipFile(sys.argv[1]);print("\\n".join(z.read(n).decode("utf8","ignore") for n in z.namelist() if n.startswith("xl/worksheets/")))', p);
  try {
    let { ctx, pg } = await session('quan.lm', 1440, 'light');
    // 1. Tạo dự án từ mẫu dựng sẵn "Tổ chức sự kiện"
    await nav(pg, '#cong-viec'); await pg.click('[data-act="w-from-tpl"]'); await pg.waitForTimeout(150); await pg.waitForSelector('[data-act="ft-pick"]');
    ok(await pg.locator('[data-act="ft-pick"]').count() >= 4, 'Hộp thoại Tạo từ mẫu có 4 mẫu dựng sẵn');
    await pg.click('[data-act="ft-pick"]:has-text("Tổ chức sự kiện")'); await pg.waitForTimeout(150); await pg.waitForSelector('#np-n');
    ok(await pg.locator('#np-tpl').inputValue() === 'b2', 'Mẫu được chọn sẵn trong hộp thoại tạo dự án');
    await pg.fill('#np-n', 'Hội nghị khách hàng 2027'); await pg.click('[data-act="np-save"]'); await pg.waitForSelector('.w-ph:has-text("Hội nghị khách hàng 2027")');
    const pid = Number(/p=(\d+)/.exec(pg.url())[1]);
    let P = (await api(pg, '/api/projects/' + pid)).j;
    ok(P.groups.length === 4 && P.fields.length === 3, `Dự án từ mẫu có 4 nhóm, 3 trường (${P.groups.length}, ${P.fields.length})`);
    await pg.waitForSelector('#w-side-my h3'); ok(await pg.locator('#w-side >> text=Công việc của tôi').count() === 1, 'Thanh thông tin dự án hiển thị Công việc của tôi');
    await pg.screenshot({ path: SP + '/full-1-project.png' });
    // 2. Trường tùy chỉnh: lựa chọn, công thức (kiểm tra trực tiếp), bảng có cột công thức và tổng
    await nav(pg, `#cong-viec?p=${pid}&v=settings&s=fields`); await pg.waitForSelector('[data-act="fd-new"]');
    await pg.click('[data-act="fd-new"]'); await pg.waitForTimeout(150); await pg.selectOption('#fd-type', 'select'); await pg.fill('#fd-name', 'Địa điểm'); await pg.fill('#fd-ch', 'Hà Nội, TP. Hồ Chí Minh, Đà Nẵng'); await pg.check('#fd-req');
    await pg.click('[data-act="fd-save"]'); await pg.waitForSelector('td:has-text("Địa điểm")');
    await pg.click('[data-act="fd-new"]'); await pg.waitForTimeout(150); await pg.selectOption('#fd-type', 'formula'); await pg.fill('#fd-name', 'Tỷ lệ chênh lệch'); await pg.fill('#fd-key', 'ty_le');
    await pg.fill('#fd-fx', '$chi_phi +* 2'); ok((await pg.locator('#fd-fxc').innerText()).startsWith('⚠'), 'Kiểm tra công thức sai ngay khi nhập');
    await pg.fill('#fd-fx', ''); await pg.click('[data-act="fx-ins"][data-v="$thuc_te"]'); await pg.type('#fd-fx', ' / $chi_phi * 100');
    ok((await pg.locator('#fd-fxc').innerText()).includes('hợp lệ'), 'Chèn biến và xác nhận công thức hợp lệ: ' + await pg.locator('#fd-fx').inputValue());
    await pg.click('[data-act="fd-save"]'); await pg.waitForSelector('td:has-text("Tỷ lệ chênh lệch")');
    await pg.click('[data-act="fd-new"]'); await pg.waitForTimeout(150); await pg.selectOption('#fd-type', 'table'); await pg.fill('#fd-name', 'Dự toán chi tiết'); await pg.fill('#fd-key', 'du_toan');
    const c0 = pg.locator('#fd-cols tr').nth(0); await c0.locator('[data-cc="name"]').fill('Hạng mục');
    await pg.click('[data-act="cc-add"]'); let c = pg.locator('#fd-cols tr').nth(1); await c.locator('[data-cc="name"]').fill('SL'); await c.locator('[data-cc="type"]').selectOption('int');
    await pg.click('[data-act="cc-add"]'); c = pg.locator('#fd-cols tr').nth(2); await c.locator('[data-cc="name"]').fill('Đơn giá'); await c.locator('[data-cc="type"]').selectOption('float');
    await pg.click('[data-act="cc-add"]'); c = pg.locator('#fd-cols tr').nth(3); await c.locator('[data-cc="name"]').fill('Thành tiền'); await c.locator('[data-cc="type"]').selectOption('formula'); await c.locator('[data-cc="extra"]').fill('$sl*$don_gia'); await c.locator('[data-cc="sum"]').check();
    await pg.click('[data-act="fd-save"]'); await pg.waitForSelector('td:has-text("Dự toán chi tiết")');
    ok(await pg.locator('tbody tr:has-text("Dự toán chi tiết") >> text=4 cột').count() === 1, 'Tạo trường Bảng 4 cột, có cột công thức tính tổng');
    await pg.screenshot({ path: SP + '/full-2-fields.png', fullPage: true });
    // 3. Tạo công việc có trường tùy chỉnh; thiếu trường bắt buộc bị chặn
    await pg.click('[data-act="w-new-task"]'); await pg.waitForTimeout(150); await pg.waitForSelector('#nt-t'); await pg.fill('#nt-t', 'Thuê hội trường');
    ok(await pg.locator('[data-cft="select"]').count() === 1, 'Hộp thoại tạo công việc có ô trường tùy chỉnh');
    await pg.click('[data-act="nt-save"]'); await pg.waitForTimeout(400);
    ok(/Địa điểm/.test(await pg.locator('#modal').innerText()), 'Chặn tạo khi thiếu trường bắt buộc “Địa điểm”');
    const fid = n => P.fields.find(f => f.name === n).id; P = (await api(pg, '/api/projects/' + pid)).j;
    await pg.selectOption(`#cf-n${fid('Địa điểm')}`, 'Đà Nẵng'); await pg.fill(`#cf-n${fid('Chi phí dự kiến')}`, '20000000'); await pg.fill(`#cf-n${fid('Chi phí thực tế')}`, '23000000');
    await pg.click('[data-act="nt-save"]'); await pg.waitForTimeout(800);
    const T = (await api(pg, `/api/projects/${pid}/tasks?limit=50`)).j; const tk = (T.rows || T).find(t => t.title === 'Thuê hội trường');
    ok(!!tk, 'Tạo công việc có trường tùy chỉnh');
    let tf = (await api(pg, '/api/tasks/' + tk.id)).j;
    ok(tf.field_values[fid('Chênh lệch')] === 3000000 && Math.round(tf.field_values[fid('Tỷ lệ chênh lệch')]) === 115, `Công thức tính tự động: chênh lệch ${tf.field_values[fid('Chênh lệch')]}, tỷ lệ ${tf.field_values[fid('Tỷ lệ chênh lệch')]}`);
    // 4. Chi tiết công việc: bảng dữ liệu, đánh dấu, lịch
    await pg.evaluate(id => window.SO.openTask(id), tk.id); await pg.waitForSelector('.w-tkbar');
    ok(await pg.locator('.w-tkbar a[href*="calendar.google.com"]').count() === 1 && await pg.locator('.w-tkbar a[href$="/ics"]').count() === 1, 'Chi tiết có liên kết Google Calendar và tải .ics');
    const tb = pg.locator(`[data-cftable="${fid('Dự toán chi tiết')}"]`);
    await tb.locator('[data-ck="hang_muc"]').first().fill('Hội trường'); await tb.locator('[data-ck="sl"]').first().fill('1'); await tb.locator('[data-ck="don_gia"]').first().fill('15000000');
    await pg.click('[data-act="cf-rowadd"]'); await tb.locator('[data-ck="hang_muc"]').nth(1).fill('Âm thanh'); await tb.locator('[data-ck="sl"]').nth(1).fill('2'); await tb.locator('[data-ck="don_gia"]').nth(1).fill('2500000');
    await pg.click('[data-act="cf-save"]'); await pg.waitForTimeout(800);
    tf = (await api(pg, '/api/tasks/' + tk.id)).j; const tv = tf.field_values[fid('Dự toán chi tiết')];
    ok(tv.rows.length === 2 && tv.sums.thanh_tien === 20000000, `Bảng lưu 2 dòng, tổng Thành tiền = ${tv.sums.thanh_tien}`);
    ok(/20\.000\.000/.test(await tb.locator('tfoot').innerText()), 'Dòng tổng hiển thị định dạng 20.000.000');
    await pg.fill('#tk-sq', 'Đặt cọc hội trường'); await pg.fill('#tk-sqd', '2026-11-20'); await pg.click('[data-act="tk-subq"]'); await pg.waitForTimeout(800);
    tf = (await api(pg, '/api/tasks/' + tk.id)).j; ok(tf.subtasks.some(x => x.title === 'Đặt cọc hội trường' && x.due_date === '2026-11-20'), 'Tạo nhanh việc con (tên, thời hạn, người thực hiện)');
    await pg.click('[data-act="tk-mark"]'); await pg.waitForTimeout(500); ok(await pg.locator('[data-act="tk-mark"][aria-pressed="true"]').count() === 1, 'Đánh dấu công việc (★)');
    await pg.screenshot({ path: SP + '/full-3-task.png', fullPage: true });
    // Nhân bản sang dự án khác
    await pg.click('[data-act="tk-cloneto"]'); await pg.waitForTimeout(150); await pg.waitForSelector('#ct-p'); const dst = await pg.locator('#ct-p option').first().getAttribute('value');
    await pg.click('[data-act="ct-go"]'); await pg.waitForTimeout(900);
    tf = (await api(pg, `/api/projects/${dst}/tasks?limit=200`)).j; ok((tf.rows || tf).some(t => t.title === 'Thuê hội trường'), 'Nhân bản công việc sang dự án khác #' + dst);
    await pg.keyboard.press('Escape');
    // 5. Thảo luận, tài liệu, hoạt động
    await nav(pg, `#cong-viec?p=${pid}&v=discuss`); await pg.click('[data-act="ps-new"]'); await pg.waitForTimeout(150); await pg.fill('#pn-t', 'Chốt danh sách khách mời'); await pg.fill('#pn-b', 'Các phòng gửi danh sách trước 15/12.');
    await pg.click('[data-act="pn-go"]'); await pg.waitForSelector('.w-post'); await pg.click('.w-post'); await pg.waitForTimeout(150); await pg.fill('#pc-b', 'Phòng Kinh doanh đã gửi.'); await pg.click('[data-act="pc-add"]');
    await pg.waitForSelector('.cmt:has-text("Phòng Kinh doanh đã gửi")'); ok(true, 'Thêm thảo luận và bình luận'); await pg.keyboard.press('Escape');
    await nav(pg, `#cong-viec?p=${pid}&v=docs`); await pg.setInputFiles('#pf-f', { name: 'ke-hoach.txt', mimeType: 'text/plain', buffer: Buffer.from('Kế hoạch hội nghị') });
    await pg.click('[data-act="pf-up"]'); await pg.waitForSelector('a:has-text("ke-hoach.txt")'); ok(true, 'Tải tài liệu lên thẻ Tài liệu');
    await nav(pg, `#cong-viec?p=${pid}&v=activity`); await pg.waitForSelector('.w-act');
    ok(await pg.locator('.w-act').count() >= 4, `Thẻ Hoạt động ghi nhận ${await pg.locator('.w-act').count()} sự kiện`);
    // 6. Phân quyền sử dụng
    await nav(pg, `#cong-viec?p=${pid}&v=settings&s=perm`); await pg.waitForSelector('[data-pm="account.discuss.guest"]');
    await pg.check('[data-pm="account.discuss.guest"]'); await pg.uncheck('[data-pm="restrict.no_delete"]'); await pg.click('[data-act="pm-save"]'); await pg.waitForTimeout(700);
    P = (await api(pg, '/api/projects/' + pid)).j; ok(P.perm.account.discuss.guest === true && P.perm.restrict.no_delete === false, 'Lưu ma trận phân quyền');
    await pg.screenshot({ path: SP + '/full-4-perm.png', fullPage: true });
    // 7. Nhập Excel: tệp mẫu tải về; tệp .xlsx nén deflate do openpyxl tạo (chuỗi dùng chung, ngày kiểu số)
    await nav(pg, `#cong-viec?p=${pid}&v=list`); await pg.click('[data-act="w-io"]'); await pg.waitForTimeout(150); await pg.waitForSelector('[data-act="io-tpl"]');
    const tplPath = await download(pg, '[data-act="io-tpl"]'); ok(/Tên công việc/.test(xlsxText(tplPath)), 'Tải tệp mẫu nhập có cột Tên công việc');
    const imp = path.join(SP, 'nhap-openpyxl.xlsx');
    py(`import sys,datetime,openpyxl
wb=openpyxl.Workbook();ws=wb.active;ws.title="Công việc"
ws.append(["Nhóm công việc","Tên công việc","Người thực hiện","Khẩn cấp","Ngày bắt đầu","Deadline","Địa điểm","Chi phí dự kiến"])
ws.append(["Hậu cần","In thư mời","huy.dq","Có",datetime.date(2026,12,1),datetime.date(2026,12,5),"Hà Nội",5000000])
ws.append(["Hậu cần","# Thiết kế mẫu thư mời","","", "01/12/2026","03/12/2026","Hà Nội",""])
ws.append(["Truyền thông mới","Đăng tin trên trang nội bộ","","", "02/12/2026","04/12/2026","Đà Nẵng",""])
wb.save(sys.argv[1])`, imp);
    await pg.setInputFiles('#io-f', imp); await pg.waitForSelector('#io-prev .notice');
    const pv = await pg.locator('#io-prev .notice').innerText(); ok(/3 công việc \(1 công việc con\), 2 nhóm/.test(pv), 'Xem trước tệp openpyxl: ' + pv.slice(0, 90));
    await pg.click('[data-act="io-go"]'); await pg.waitForTimeout(1200);
    P = (await api(pg, '/api/projects/' + pid)).j; let all = (await api(pg, `/api/projects/${pid}/tasks?limit=200&sub=1`)).j; all = all.rows || all;
    const inv = all.find(t => t.title === 'In thư mời');
    ok(!!inv && inv.due_date === '2026-12-05' && P.groups.some(g => g.name === 'Truyền thông mới'), 'Nhập công việc, nhóm mới và ngày dạng số Excel đúng: ' + (inv && inv.due_date));
    // 8. Xuất Excel đọc lại được; CSV; Gantt
    await pg.click('[data-act="w-io"]'); await pg.waitForTimeout(150); await pg.click('[data-act="io-tab"][data-k="export"]'); await pg.waitForTimeout(150); await pg.waitForSelector('[data-act="ex-xlsx"]');
    const ex = await download(pg, '[data-act="ex-xlsx"]');
    const rt = JSON.parse(py(`import sys,json,openpyxl
ws=openpyxl.load_workbook(sys.argv[1]).active;rows=[[c for c in r] for r in ws.iter_rows(values_only=True)]
print(json.dumps({"head":rows[0],"n":len(rows)-1,"titles":[r[2] for r in rows[1:]]},ensure_ascii=False,default=str))`, ex));
    ok(rt.head.includes('Dự toán chi tiết') && rt.titles.includes('# Thiết kế mẫu thư mời') && rt.n >= 4, `openpyxl đọc được tệp xuất: ${rt.n} dòng, có cột trường tùy chỉnh và cấp việc con (#)`);
    const rtBrowser = await pg.evaluate(async () => { const r = await fetch('/api/projects/' + new URLSearchParams(location.hash.split('?')[1]).get('p') + '/export?sub=1'); const d = await r.json(); return d.rows.length; });
    ok(rtBrowser === rt.n, 'Số dòng tệp xuất khớp API (' + rtBrowser + ')');
    const g = await download(pg, '[data-act="ex-gantt"]'); ok(/<fills count="[3-9]"/.test(py('import sys,zipfile;print(zipfile.ZipFile(sys.argv[1]).read("xl/styles.xml").decode())', g)) && / s="2"/.test(xlsxText(g)), 'Xuất Gantt .xlsx có ô tô màu theo thời gian');
    const csv = await download(pg, '[data-act="ex-csv"]'); ok(fs.readFileSync(csv, 'utf8').startsWith('﻿Mã (ID)'), 'Xuất CSV UTF-8 có BOM');
    // Đọc tệp xuất bằng bộ đọc của ứng dụng (vòng khép kín)
    const back = await pg.evaluate(async b64 => { const u8 = Uint8Array.from(atob(b64), ch => ch.charCodeAt(0)); const s = await window.XLSX_LITE.read(new File([u8], 'x.xlsx')); return s[0].rows.length; }, fs.readFileSync(ex).toString('base64'));
    ok(back === rt.n + 1, 'XLSX_LITE đọc lại tệp do chính nó ghi: ' + back + ' dòng');
    await pg.keyboard.press('Escape');
    // 9. Nhân bản dự án
    await pg.click('[data-act="w-pmenu"]'); await pg.waitForTimeout(150); await pg.click('[data-act="pm-clone"]'); await pg.waitForTimeout(150); await pg.waitForSelector('#pc-n'); await pg.fill('#pc-n', 'Hội nghị khách hàng 2028');
    await pg.selectOption('#pc-dl', 'shift'); await pg.fill('#pc-sh', '8760'); await pg.click('[data-act="pc-go"]'); await pg.waitForSelector('.w-ph:has-text("Hội nghị khách hàng 2028")');
    const pid2 = Number(/p=(\d+)/.exec(pg.url())[1]); let c2 = (await api(pg, `/api/projects/${pid2}/tasks?limit=200`)).j; c2 = c2.rows || c2;
    const inv2 = c2.find(t => t.title === 'In thư mời'); ok(!!inv2 && inv2.due_date === '2027-12-05', 'Nhân bản dự án, dời thời hạn 365 ngày: ' + (inv2 && inv2.due_date));
    // 10. Lưu mẫu
    await pg.click('[data-act="w-pmenu"]'); await pg.waitForTimeout(150); await pg.click('[data-act="pm-tpl"]'); await pg.waitForTimeout(150); await pg.fill('#tp-n', 'Mẫu hội nghị'); await pg.click('[data-act="tp-save"]'); await pg.waitForTimeout(600);
    ok((await api(pg, '/api/work/templates')).j.mine.some(t => t.name === 'Mẫu hội nghị'), 'Lưu dự án thành mẫu');
    // 11. Báo cáo thành viên
    await nav(pg, '#cong-viec?tab=members'); await pg.waitForSelector('.w-chart svg');
    ok(await pg.locator('.w-mrow').count() >= 2, 'Trưởng phòng thấy danh sách thành viên (mình và nhân viên)');
    ok(await pg.locator('#dl-u').count() === 1, 'Báo cáo của mình có mục Ủy quyền giao việc');
    const mx = await download(pg, '[data-act="mr-xlsx"]'); ok(/Tổng công việc/.test(xlsxText(mx)), 'Xuất Excel báo cáo thành viên');
    await pg.screenshot({ path: SP + '/full-5-members.png', fullPage: true });
    ok(await pg.locator('[data-wtab="system"]').count() === 0 && await pg.locator('[data-wtab="admin"]').count() === 0, 'Không phải quản trị: không thấy Báo cáo hệ thống, Quản trị');
    await ctx.close();
    // 12. Quản trị hệ thống
    ({ ctx, pg } = await session('thanh.nv', 1440, 'light'));
    await nav(pg, '#cong-viec?tab=system'); await pg.waitForSelector('.w-matrix');
    ok(await pg.locator('.w-chart svg polyline').count() === 3, 'Báo cáo hệ thống có biểu đồ xu hướng 3 đường');
    await pg.screenshot({ path: SP + '/full-6-system.png', fullPage: true });
    await nav(pg, '#cong-viec?tab=admin&s=perm'); await pg.selectOption('#cf-create_project', 'heads'); await pg.click('[data-act="ad-cfg"]'); await pg.waitForTimeout(500);
    ok((await api(pg, '/api/work/config')).j.create_project.mode === 'heads', 'Quản trị lưu quyền tạo dự án: Trưởng Department');
    await api(pg, '/api/work/config', 'PUT', { create_project: { mode: 'all', users: [] } });
    await nav(pg, '#cong-viec?tab=admin&s=bulk'); await pg.selectOption('#bk-u', { label: /Đỗ Quang Huy/ }).catch(async () => { const v = await pg.locator('#bk-u option').nth(2).getAttribute('value'); await pg.selectOption('#bk-u', v); });
    await pg.click('[data-act="bk-load"]'); await pg.waitForSelector('#bk-res p'); ok(/Tìm thấy \d+ công việc/.test(await pg.locator('#bk-res p').innerText()), 'Tác vụ hàng loạt: tìm công việc theo người dùng');
    await nav(pg, '#cong-viec?tab=admin&s=export'); await pg.waitForTimeout(600); ok(await pg.locator('#mx-p option').count() >= 3, 'Xuất nhiều dự án: danh sách dự án toàn hệ thống');
    await nav(pg, `#cong-viec?p=${pid}&v=settings&s=advanced`); await pg.waitForSelector('#adv-mcd'); ok(true, 'Quản trị thấy Cài đặt nâng cao (quyền xóa của quản lý)');
    await ctx.close();
    // 13. Điện thoại 390 px, chế độ tối
    ({ ctx, pg } = await session('quan.lm', 390, 'dark'));
    for (const [h, f] of [[`#cong-viec?p=${pid}&v=list`, 'm-1-project'], ['#cong-viec?tab=members', 'm-2-members'], [`#cong-viec?p=${pid}&v=settings&s=fields`, 'm-3-fields']]) {
      await nav(pg, h); await pg.waitForTimeout(500);
      const ov = await pg.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); ok(ov <= 1, `${f}: không cuộn ngang ở 390 px (lệch ${ov}px)`);
      await pg.screenshot({ path: SP + '/full-' + f + '.png', fullPage: true });
    }
    await ctx.close();
  } catch (e) { fails++; console.log('NGOẠI LỆ ' + e.message.split('\n').slice(0, 3).join(' | ')); if (CUR) { await CUR.screenshot({ path: SP + '/full-loi.png', fullPage: true }).catch(() => 0); console.log('HỘP THOẠI: ' + (await CUR.locator('#modal').innerText().catch(() => '')).slice(0, 300).replace(/\n/g, ' | ')); } }
  ok(!errs.length, 'Lỗi console: ' + (errs.join(' || ') || 'không có'));
  console.log(`KẾT QUẢ: ${passes} đạt, ${fails} không đạt`);
  await br.close(); process.exit(fails ? 1 : 0);
})();
