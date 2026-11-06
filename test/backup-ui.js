/* Kiểm thử giao diện sao lưu, khôi phục trên bản Node (tệp đính kèm lưu trên đĩa) bằng Playwright. Chỉ chạy cục bộ.
 *   A: DATA_DIR=$(mktemp -d) PORT=3999 node server.js &              (dữ liệu mẫu)
 *   B: DATA_DIR=$(mktemp -d) PORT=3996 NO_DEMO=1 ADMIN_PASSWORD='Moi-B#2026' node server.js &   (CSDL trống)
 *   node test/backup-ui.js <thư-mục-tạm>
 * Kiểm tra: xuất bằng nút "Tải bản sao lưu đầy đủ" ở A → khôi phục bằng giao diện ở B → đăng nhập bằng tài khoản của A,
 * tệp đính kèm trùng từng byte, số lượng bản ghi trùng; điện thoại 390 px không cuộn ngang; không có lỗi JavaScript. */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const SP = process.argv[2] || '.', A = 'http://localhost:3999', BB = 'http://localhost:3996';
(async () => {
  const br = await chromium.launch(); let pass = 0, fail = 0; const errs = [];
  const ok = (c, m) => { console.log((c ? 'ĐẠT ' : 'LỖI ') + m); c ? pass++ : fail++; };
  const page = async (base, w = 1280) => { const ctx = await br.newContext({ viewport: { width: w, height: 900 }, acceptDownloads: true }); const pg = await ctx.newPage();
    pg.on('pageerror', e => errs.push(e.message)); pg.on('requestfailed', r => { if (!/fonts\.(googleapis|gstatic)/.test(r.url())) errs.push('requestfailed ' + r.url().slice(0, 80) + ' ' + (r.failure() || {}).errorText); }); pg.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL|ERR_FAILED|status of 40[013]/.test(m.text())) errs.push(m.text()); }); await pg.goto(base + '/'); return pg; };
  const login = (pg, u, p) => pg.evaluate(async ([u, p]) => (await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) })).status, [u, p]);
  const api = (pg, u, m = 'GET', b) => pg.evaluate(async ([u, m, b]) => { const r = await fetch(u, { method: m, headers: { 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }); const ct = r.headers.get('content-type') || ''; return { s: r.status, j: ct.includes('json') ? await r.json() : null, len: ct.includes('json') ? 0 : (await r.arrayBuffer()).byteLength }; }, [u, m, b]);
  try {
    // A: admin mẫu đổi mật khẩu, tải tài liệu có tệp, xuất bản sao lưu bằng giao diện
    let pg = await page(A);
    ok(await login(pg, 'admin', 'Admin@123') === 200, 'A: admin đăng nhập');
    ok((await api(pg, '/api/me/password', 'PUT', { old_password: 'Admin@123', new_password: 'Quan-tri#2026' })).s === 200, 'A: đổi mật khẩu lần đầu');
    const buf = require('crypto').randomBytes(1536 * 1024); // ngẫu nhiên, không nén nhỏ được
    const doc = await api(pg, '/api/docs', 'POST', { title: 'Tài liệu sao lưu', category: 'khac', file_name: 'mau.bin.pdf', file_mime: 'application/pdf', file_data: buf.toString('base64') });
    ok(doc.s === 200, 'A: tải tài liệu 1,5 MB (2 khối)');
    const cntA = { users: (await api(pg, '/api/admin/users')).j.length, docs: (await api(pg, '/api/docs')).j.docs.length };
    ok(cntA.users === 9 && cntA.docs >= 1, 'A: đếm được tài khoản, tài liệu ' + JSON.stringify(cntA));
    await pg.reload(); await pg.waitForSelector('#main'); await pg.evaluate(() => { location.hash = '#quan-tri'; }); await pg.waitForTimeout(600);
    await pg.click('[data-atab="backup"]'); await pg.waitForSelector('[data-act="bk-export"]');
    ok(await pg.locator('[data-act="pitr-cur"]').count() === 0, 'A (Node): không hiện mục khôi phục theo thời điểm');
    const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('[data-act="bk-export"]')]);
    const file = path.join(SP, dl.suggestedFilename()); await dl.saveAs(file);
    ok(/\.json\.gz$/.test(file) && fs.statSync(file).size > 1.5 * 1048576, 'A: tải bản sao lưu .json.gz ' + (fs.statSync(file).size / 1048576).toFixed(2) + ' MB');
    await pg.waitForFunction(() => /Đã tạo bản sao lưu/.test(document.querySelector('#bk-prog').textContent));
    ok(true, 'A: ' + await pg.locator('#bk-prog').innerText());
    await pg.screenshot({ path: path.join(SP, 'backup-a.png'), fullPage: true });
    await pg.context().close();
    // B: CSDL trống, admin dùng bí mật ADMIN_PASSWORD, đổi mật khẩu, khôi phục bằng giao diện
    pg = await page(BB);
    ok(await login(pg, 'admin', 'Moi-B#2026') === 200, 'B: admin của máy chủ mới đăng nhập');
    ok((await api(pg, '/api/me/password', 'PUT', { old_password: 'Moi-B#2026', new_password: 'Moi-B#2027' })).s === 200, 'B: đổi mật khẩu lần đầu');
    await pg.reload(); await pg.waitForSelector('#main'); await pg.evaluate(() => { location.hash = '#quan-tri'; }); await pg.waitForTimeout(600);
    await pg.click('[data-atab="backup"]'); await pg.waitForSelector('#bk-file');
    await pg.setInputFiles('#bk-file', file); await pg.waitForFunction(() => /Bản sao lưu của/.test(document.querySelector('#bk-sum').textContent));
    ok(true, 'B: ' + await pg.locator('#bk-sum').innerText());
    await pg.click('[data-act="bk-restore"]'); await pg.waitForTimeout(300);
    ok(/KHÔI PHỤC/.test(await pg.locator('#bk-err').innerText()), 'B: chưa gõ xác nhận thì không khôi phục');
    await pg.fill('#bk-cf', 'KHÔI PHỤC'); await pg.click('[data-act="bk-restore"]');
    await pg.waitForSelector('#bk-res .notice.ok', { timeout: 30000 }); ok(true, 'B: ' + (await pg.locator('#bk-res').innerText()).split('\n')[0]);
    await pg.screenshot({ path: path.join(SP, 'backup-b.png'), fullPage: true });
    ok((await api(pg, '/api/bootstrap')).s === 401, 'B: sau khôi phục bị đăng xuất');
    ok(await login(pg, 'admin', 'Moi-B#2027') === 401 && await login(pg, 'admin', 'Quan-tri#2026') === 200, 'B: đăng nhập bằng mật khẩu trong bản sao lưu');
    const cntB = { users: (await api(pg, '/api/admin/users')).j.length, docs: (await api(pg, '/api/docs')).j.docs.length };
    ok(JSON.stringify(cntA) === JSON.stringify(cntB), 'B: số tài khoản, tài liệu trùng A ' + JSON.stringify(cntB));
    const got = await pg.evaluate(async id => { const r = await fetch(`/api/docs/${id}/file`); return Array.from(new Uint8Array(await r.arrayBuffer())); }, doc.j.id);
    ok(Buffer.from(got).equals(buf), 'B: tệp đính kèm 1,5 MB trùng từng byte (Node lưu trên đĩa)');
    await pg.context().close();
    // 390 px chế độ tối
    pg = await page(BB, 390); await pg.emulateMedia({ colorScheme: 'dark' }); await login(pg, 'admin', 'Quan-tri#2026'); await pg.reload(); await pg.waitForSelector('#main');
    await pg.evaluate(() => { location.hash = '#quan-tri'; }); await pg.waitForTimeout(600); await pg.click('[data-atab="backup"]'); await pg.waitForTimeout(400);
    const ov = await pg.evaluate(() => document.documentElement.scrollWidth - innerWidth); ok(ov <= 1, '390 px: không cuộn ngang (' + ov + ')');
    await pg.screenshot({ path: path.join(SP, 'backup-m.png'), fullPage: true });
  } catch (e) { fail++; console.log('NGOẠI LỆ ' + e.message.split('\n')[0]); }
  ok(!errs.length, 'Lỗi JavaScript: ' + (errs.join(' | ') || 'không có'));
  console.log(`KẾT QUẢ: ${pass} đạt, ${fail} không đạt`); await br.close(); process.exit(fail ? 1 : 0);
})();
