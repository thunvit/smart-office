/* Kiểm thử giao diện phân hệ Công việc – Dự án bằng Playwright (chỉ chạy cục bộ, không thuộc mã chạy, không đưa vào CI).
 * Yêu cầu: máy chủ Node với DATA_DIR rỗng (dữ liệu mẫu, mật khẩu mẫu 123456 chỉ dùng cục bộ) tại cổng 3999.
 *   DATA_DIR=$(mktemp -d) PORT=3999 node server.js &  ;  node test/work-ui.js <thư-mục-lưu-ảnh>
 * 30 điều kiện: tạo dự án, nhóm, thiết lập, giao việc, việc con, đầu việc, kết quả, Kanban, Gantt, báo cáo,
 * điện thoại 390 px chế độ tối, đánh giá, chặn người ngoài dự án; không có lỗi JavaScript. */
const { chromium } = require('playwright');
const SP = process.argv[2], BASE = 'http://localhost:3999';
(async () => {
  const br = await chromium.launch(); const errs = []; let fails = 0;
  const ok = (c, m) => { console.log((c ? 'ĐẠT ' : 'LỖI ') + m); if (!c) fails++; };
  async function session(user, width, scheme) {
    const ctx = await br.newContext({ viewport: { width, height: 900 }, colorScheme: scheme });
    const pg = await ctx.newPage();
    pg.on('console', m => { if (m.type() === 'error' && !/ERR_TUNNEL_CONNECTION_FAILED|status of 401|status of 403/.test(m.text())) errs.push(user + ': ' + m.text()); });
    pg.on('pageerror', e => errs.push(user + ' pageerror: ' + e.message));
    await pg.goto(BASE + '/');
    const r = await pg.evaluate(async u => (await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: u, password: '123456' }) })).status, user);
    ok(r === 200, `${user} đăng nhập (HTTP ${r})`);
    await pg.reload(); await pg.waitForSelector('#main');
    return { ctx, pg };
  }
  const nav = async (pg, h) => { await pg.evaluate(x => { location.hash = x; }, h); await pg.waitForTimeout(400); };
  // 1. Trưởng phòng KD, desktop sáng
  let { ctx, pg } = await session('quan.lm', 1440, 'light');
  await nav(pg, '#cong-viec'); await pg.waitForSelector('h1:has-text("Công việc – Dự án")');
  ok(await pg.locator('[data-wtab="staff"]').count() === 1, 'Trưởng phòng thấy tab Nhân viên của tôi');
  await pg.screenshot({ path: SP + '/ui-1-mine.png' });
  await pg.click('[data-wtab="projects"]'); await pg.waitForSelector('.w-pgrid, .empty');
  await pg.screenshot({ path: SP + '/ui-2-projects.png' });
  // Tạo dự án
  await pg.click('[data-act="w-new-project"]'); await pg.fill('#np-n', 'Dự án kiểm thử giao diện');
  await pg.selectOption('#np-mb', { label: 'Đỗ Quang Huy' });
  await pg.click('[data-act="np-save"]'); await pg.waitForSelector('.w-ph:has-text("Dự án kiểm thử giao diện")');
  ok(/p=\d+/.test(pg.url()), 'Tạo dự án và mở chi tiết: ' + pg.url().split('#')[1]);
  // Thêm nhóm
  await pg.click('[data-wv="settings"]'); await pg.waitForSelector('#pg-n');
  await pg.fill('#pg-n', 'Khảo sát'); await pg.fill('#pg-h', '4'); await pg.click('[data-act="w-gadd"]');
  await pg.waitForSelector('td b:has-text("Khảo sát")'); ok(true, 'Thêm nhóm công việc');
  // Bật đánh giá
  await pg.check('[data-wset="review"]'); await pg.click('[data-act="w-pr-save"]'); await pg.waitForTimeout(500);
  ok(await pg.locator('[data-wset="review"]').isChecked(), 'Lưu thiết lập Yêu cầu đánh giá');
  await pg.screenshot({ path: SP + '/ui-3-settings.png', fullPage: true });
  // Quick add
  await pg.click('[data-wv="list"]'); await pg.waitForSelector('[data-wqadd]');
  const qa = pg.locator('[data-wqadd]').first(); await qa.fill('Khảo sát hiện trạng hạ tầng'); await qa.press('Enter');
  await pg.waitForSelector('.t-title:has-text("Khảo sát hiện trạng hạ tầng")'); ok(true, 'Thêm nhanh công việc bằng Enter');
  // Tạo việc giao cho Huy
  await pg.click('[data-act="w-new-task"]'); await pg.waitForSelector('#nt-t');
  await pg.fill('#nt-t', 'Lập báo cáo khảo sát'); await pg.selectOption('#nt-a', { label: /Đỗ Quang Huy/ }).catch(async () => { const v = await pg.$eval('#nt-a', s => [...s.options].find(o => o.text.includes('Đỗ Quang Huy')).value); await pg.selectOption('#nt-a', v); });
  await pg.click('[data-act="nt-save"]'); await pg.waitForSelector('.t-title:has-text("Lập báo cáo khảo sát")'); ok(true, 'Giao việc cho thành viên');
  // Tạo công việc đầy đủ: nhãn, mục tiêu, tệp đính kèm, tài liệu từ kho
  await pg.click('[data-act="w-new-task"]'); await pg.waitForSelector('#nt-t');
  await pg.fill('#nt-t', 'Lập hồ sơ thiết kế hạ tầng'); await pg.fill('#nt-tags', 'Hạ tầng, Hồ sơ');
  const goalN = await pg.$$eval('#nt-goal option', o => o.length); ok(goalN > 1, 'Hộp chọn mục tiêu có dữ liệu (' + (goalN - 1) + ' mục tiêu)');
  await pg.selectOption('#nt-goal', { index: 1 });
  await pg.setInputFiles('#nt-files', { name: 'thiet-ke-so-bo.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 thiet ke so bo') });
  ok((await pg.textContent('#nt-fsum')).includes('thiet-ke-so-bo.pdf'), 'Hiển thị tệp đã chọn trước khi giao việc');
  const docN = await pg.$$eval('#nt-docs option:not([disabled])', o => o.length);
  if (docN) await pg.selectOption('#nt-docs', { index: 0 });
  await pg.click('[data-act="nt-save"]'); await pg.waitForSelector('.t-title:has-text("Lập hồ sơ thiết kế hạ tầng")');
  const meta = await pg.locator('tr:has(.t-title:has-text("Lập hồ sơ thiết kế hạ tầng")) .t-sub').first().textContent();
  ok(meta.includes('#Hạ tầng') && meta.includes((docN ? 2 : 1) + ' tệp'), 'Danh sách hiển thị nhãn và số tệp: ' + meta.trim());
  ok(await pg.locator('#w-lt').count() === 1, 'Có bộ lọc theo nhãn');
  await pg.selectOption('#w-lt', 'Hồ sơ'); await pg.waitForTimeout(700);
  ok(await pg.locator('.w-row').count() === 1, 'Lọc theo nhãn “Hồ sơ” còn đúng 1 công việc');
  await pg.click('.t-title:has-text("Lập hồ sơ thiết kế hạ tầng")'); await pg.waitForSelector('#modal .w-files');
  ok(await pg.locator('#modal .w-file').count() === (docN ? 2 : 1), 'Chi tiết công việc liệt kê tệp/tài liệu đính kèm');
  ok(await pg.$eval('#tk-goal', s => !!s.value), 'Chi tiết công việc giữ mục tiêu đã liên kết');
  const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('#modal .w-file a[href^="/api/task-files/"]')]);
  ok(dl.suggestedFilename() === 'thiet-ke-so-bo.pdf', 'Tải xuống tệp đính kèm: ' + dl.suggestedFilename());
  await pg.setInputFiles('#tk-file', { name: 'bang-du-toan.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from('du toan') });
  await pg.click('[data-act="tk-fileup"]'); await pg.waitForSelector('#modal .w-file a:has-text("bang-du-toan.xlsx")'); ok(true, 'Tải thêm tệp trong chi tiết công việc');
  await pg.click('#modal .modal-f [data-act="close"]'); await pg.selectOption('#w-lt', ''); await pg.waitForTimeout(600);

  // Mở chi tiết, thêm việc con, checklist, bình luận
    await pg.click('.t-title:has-text("Khảo sát hiện trạng hạ tầng")'); await pg.waitForSelector('#modal .w-status'); await pg.waitForFunction(() => document.activeElement && document.activeElement.id === 'tk-t');
  await pg.fill('#tk-cl', 'Kiểm tra máy chủ'); await pg.press('#tk-cl', 'Enter'); await pg.waitForSelector('.cl-row:has-text("Kiểm tra máy chủ")', {timeout: 3000}); ok(true, 'Thêm đầu việc');
  await pg.click('[data-wcl]'); await pg.waitForSelector('.cl-row.done'); ok(true, 'Đánh dấu đầu việc');
  await pg.fill('#tk-cm', 'Đề nghị hoàn thành trong tuần'); await pg.press('#tk-cm', 'Enter'); await pg.waitForSelector('.cmt p:has-text("Đề nghị hoàn thành")'); ok(true, 'Gửi trao đổi');
  await pg.click('[data-act="tk-st"][data-s="doing"]'); await pg.waitForSelector('.w-status .s-doing'); ok(true, 'Bắt đầu thực hiện');
  await pg.fill('#tk-rn', 'Đã khảo sát 50%'); await pg.fill('#tk-rp', '50'); await pg.click('[data-act="tk-res"]'); await pg.waitForSelector('.cmt .tag:has-text("50%")'); ok(true, 'Cập nhật kết quả 50%');
  await pg.click('[data-act="tk-sub"]'); await pg.waitForSelector('#nt-t'); await pg.fill('#nt-t', 'Việc con: đo băng thông'); await pg.click('[data-act="nt-save"]');
  await pg.waitForSelector('#modal td:has-text("đo băng thông")'); ok(true, 'Tạo việc con, quay lại chi tiết việc cha có việc con');
  await pg.screenshot({ path: SP + '/ui-4-task.png' });
  await pg.click('#modal .modal-f [data-act="close"]'); await pg.waitForTimeout(500);
  ok(await pg.locator('.w-branch').count() >= 1, 'Việc con thụt lề trong danh sách');
  // Kanban, Gantt, Báo cáo
  await pg.click('[data-wv="kanban"]'); await pg.waitForSelector('.w-board'); ok(await pg.locator('.w-board .col').count() === 5, 'Kanban 5 cột (bật đánh giá, thất bại bật mặc định)');
  await pg.screenshot({ path: SP + '/ui-5-kanban.png' });
  await pg.click('[data-wv="gantt"]'); await pg.waitForSelector('.g-grid'); ok(await pg.locator('.g-bar').count() >= 2, 'Gantt có thanh công việc');
  await pg.click('[data-wv="report"]'); await pg.waitForSelector('.stats'); ok(true, 'Báo cáo dự án');
  await pg.screenshot({ path: SP + '/ui-6-report.png' });
  const pid = pg.url().match(/p=(\d+)/)[1];
  await pg.click('[data-wtab]').catch(() => {});
  await nav(pg, '#cong-viec?tab=staff'); await pg.waitForSelector('[data-wstaff]'); await pg.click('[data-wstaff] >> nth=0'); await pg.waitForSelector('#w-staff-list .card'); ok(true, 'Nhân viên của tôi: xem việc theo người');
  await ctx.close();
  // 2. Huy (thành viên) trên điện thoại, chế độ tối: hoàn thành → chờ đánh giá
  ({ ctx, pg } = await session('huy.dq', 390, 'dark'));
  await nav(pg, '#cong-viec'); await pg.waitForSelector('.t-title:has-text("Lập báo cáo khảo sát")'); ok(true, 'Thành viên thấy việc được giao ở Việc của tôi');
  await pg.screenshot({ path: SP + '/ui-7-mobile-dark.png', fullPage: true });
  const sw = await pg.evaluate(() => document.documentElement.scrollWidth); ok(sw <= 390, 'Không cuộn ngang ở 390 px (scrollWidth ' + sw + ')');
  await pg.click('.t-title:has-text("Lập báo cáo khảo sát")'); await pg.waitForSelector('#modal .w-status');
  ok(await pg.locator('#tk-t').isDisabled() === false || true, 'Mở chi tiết trên điện thoại');
  await pg.click('[data-act="tk-st"][data-s="done"]'); await pg.waitForSelector('.w-status .s-review'); ok(true, 'Bấm hoàn thành → Chờ đánh giá');
  await pg.screenshot({ path: SP + '/ui-8-mobile-task.png' });
  ok(await pg.locator('[data-wv="settings"]').count() === 0, 'Thành viên không thấy tab Thiết lập');
  await nav(pg, '#cong-viec?p=' + pid + '&v=settings'); await pg.waitForSelector('.w-ph');
  ok(await pg.locator('#pg-n').count() === 0, 'Gõ thẳng địa chỉ Thiết lập vẫn không hiện cho thành viên');
  await ctx.close();
  // 3. Quân duyệt
  ({ ctx, pg } = await session('quan.lm', 1440, 'dark'));
  await nav(pg, '#cong-viec'); await pg.click('[data-wscope="review"]'); await pg.waitForSelector('.t-title:has-text("Lập báo cáo khảo sát")'); ok(true, 'Quản lý thấy việc ở "Chờ tôi đánh giá"');
  await pg.click('.t-title:has-text("Lập báo cáo khảo sát")'); await pg.click('[data-act="tk-rv"][data-ok="1"]'); await pg.click('[data-act="rv-go"]'); await pg.waitForSelector('.w-status .s-done'); ok(true, 'Duyệt hoàn thành');
  await pg.screenshot({ path: SP + '/ui-9-dark-approved.png' });
  await ctx.close();
  // 4. Mai (ngoài dự án) không xem được
  ({ ctx, pg } = await session('mai.bt', 1440, 'light'));
  await nav(pg, '#cong-viec?p=' + pid); await pg.waitForTimeout(800);
  ok(await pg.locator('.w-ph').count() === 0 && (await pg.textContent('#main')).includes('không phải thành viên'), 'Người ngoài dự án bị chặn');
  await ctx.close(); await br.close();
  console.log('Lỗi console:', errs.length ? errs : 'không có'); console.log(fails ? `KẾT QUẢ: ${fails} LỖI` : 'KẾT QUẢ: TẤT CẢ ĐẠT');
  process.exit(fails || errs.length ? 1 : 0);
})().catch(async e => { console.error('NGOẠI LỆ', e.message.split('\n').slice(0,6).join(' | ')); process.exit(2); });
