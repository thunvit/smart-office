// Kiểm thử sao lưu, khôi phục (P0-9; ADR-009): xuất từ Durable Object A rồi khôi phục vào Durable Object MỚI (B) phải trùng khớp
// từng dòng của mọi bảng và từng byte của tệp đính kèm. Kèm các ca: thiếu xác nhận, sai định dạng, vi phạm khóa ngoại thì hoàn tác
// toàn bộ, người dùng thường bị từ chối, PITR báo không hỗ trợ khi không có Cloudflare.
// Mỗi Durable Object chạy trong một tiến trình riêng (mỗi isolate chỉ phục vụ một Durable Object, CLAUDE.md 3.4).
// Chạy: node test/backup-test.js
'use strict';
const path = require('path'), os = require('os'), fs = require('fs');
const { spawnSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');
const { fakeStorage } = require('./fake-do.js');
const B = 'https://so.example.workers.dev';
const TMP = os.tmpdir(), DBA = path.join(TMP, 'so-bk-a.db'), DBB = path.join(TMP, 'so-bk-b.db'), BK = path.join(TMP, 'so-bk.json');
let pass = 0, fail = 0;
const ok = (c, n, x) => { if (c) pass++; else { fail++; console.log('  ✗ ' + n + (x !== undefined ? ' → ' + JSON.stringify(x).slice(0, 300) : '')); } };
const fresh = f => { for (const x of [f, f + '-wal', f + '-shm']) { try { fs.unlinkSync(x); } catch (e) {} } };

function client(app, ip = '203.0.113.5') {
  let cookie = '';
  const c = async (method, p, body) => {
    const h = { 'content-type': 'application/json', host: 'so.example.workers.dev', origin: B, 'cf-connecting-ip': ip };
    if (cookie) h.cookie = cookie;
    const core = require(path.join(__dirname, '..', 'worker', 'do-core.js'));
    const r = await core.handleRequest(app, new Request(B + p, { method, headers: h, body: body ? JSON.stringify(body) : undefined }));
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0].replace(/^sid=$/, '');
    const ct = r.headers.get('content-type') || '';
    return { s: r.status, b: ct.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer()) };
  };
  c.cookie = () => cookie;
  return c;
}
const done = () => { console.log(`bước: ${pass} đạt, ${fail} không đạt`); process.exit(0); };

async function stageA() { // Durable Object A: dữ liệu mẫu, tạo thêm dữ liệu đặc biệt, xuất bản sao lưu
  const core = require(path.join(__dirname, '..', 'worker', 'do-core.js'));
  const app = core.createApp(fakeStorage(DBA), { SO_DEMO: '1' });
  const adm = client(app), u = client(app, '203.0.113.6');
  ok((await adm('POST', '/api/login', { username: 'admin', password: 'Admin@123' })).s === 200, 'A: admin đăng nhập');
  ok((await adm('PUT', '/api/me/password', { old_password: 'Admin@123', new_password: 'Quan-tri#2026' })).s === 200, 'A: admin đổi mật khẩu');
  // tệp 2,5 MB (3 khối) và dữ liệu có ký tự đặc biệt, NULL
  const data = Buffer.alloc(2.5 * 1024 * 1024); for (let i = 0; i < data.length; i++) data[i] = (i * 31 + 7) & 255;
  let r = await adm('POST', '/api/docs', { title: 'Quy chế "đặc biệt" – ‘ngoặc’ \' ; DROP TABLE users; --', category: 'khac', file_name: 'quy-che.pdf', file_mime: 'application/pdf', file_data: data.toString('base64') });
  ok(r.s === 200 && r.b.id, 'A: tải tài liệu 2,5 MB', r.s);
  fs.writeFileSync(path.join(TMP, 'so-bk-file.bin'), data); fs.writeFileSync(path.join(TMP, 'so-bk-docid.txt'), String(r.b.id));
  r = await adm('POST', '/api/projects', { name: 'Dự án sao lưu 🔒 Ninh Bình', kind: 'project', template_id: 'b2' }); ok(r.s === 200, 'A: tạo dự án từ mẫu', r.s);
  // phân quyền
  ok((await u('POST', '/api/login', { username: 'thanh.nv', password: '123456' })).s === 200, 'A: thanh.nv đăng nhập');
  for (const p of ['/api/admin/export/manifest', '/api/admin/export/rows?table=users&max=999', '/api/admin/export/file?name=0&seq=0']) ok((await u('GET', p)).s === 403, 'A: người dùng thường bị từ chối ' + p);
  ok((await u('POST', '/api/admin/restore', { confirm: 'KHÔI PHỤC' })).s === 403, 'A: người dùng thường không khôi phục được');
  ok((await adm('GET', '/api/admin/pitr')).s === 400, 'A: PITR báo không hỗ trợ khi không chạy trên Cloudflare');
  { const before = (await adm('GET', '/api/admin/users')).b.length; r = await adm('GET', '/api/admin/restore/check');
    ok(r.s === 200 && r.b.ok === true && r.b.defer_foreign_keys === true, 'A: kiểm tra khả năng khôi phục (hoãn khóa ngoại trong giao dịch)', r.b);
    ok((await adm('GET', '/api/admin/users')).b.length === before && (await adm('GET', '/api/bootstrap')).s === 200, 'A: kiểm tra khả năng khôi phục không làm thay đổi dữ liệu'); }
  ok((await u('GET', '/api/admin/restore/check')).s === 403, 'A: người dùng thường không gọi được kiểm tra khôi phục');
  ok((await adm('GET', '/api/admin/export/rows?table=sessions&max=999')).s === 400, 'A: không xuất được bảng phiên đăng nhập');
  ok((await adm('GET', '/api/admin/export/rows?table=' + encodeURIComponent('users; DROP TABLE users') + '&max=9')).s === 400, 'A: tên bảng lạ bị từ chối');
  // xuất: danh mục → từng bảng theo trang nhỏ (limit=7 để buộc nhiều trang) → từng khối tệp
  const m = (await adm('GET', '/api/admin/export/manifest')).b;
  ok(m.format === 'smartoffice-backup' && m.tables.length > 60 && !m.tables.some(t => ['sessions', 'login_attempts', 'file_chunks'].includes(t.name)), 'A: danh mục hợp lệ, không có bảng tạm', m.tables && m.tables.length);
  ok(m.files.length === 1 && m.files[0].chunks === 3 && m.files[0].size === data.length, 'A: danh mục có 1 tệp 3 khối', m.files);
  const out = { manifest: m, tables: {}, files: {} }; let pages = 0;
  for (const t of m.tables) {
    const d = { columns: t.columns, rows: [] }; let after = 0;
    for (;;) { const p = (await adm('GET', `/api/admin/export/rows?table=${t.name}&after=${after}&max=${t.max_rowid}&limit=7`)).b; pages++; d.rows.push(...p.rows); if (p.next == null) break; after = p.next; }
    out.tables[t.name] = d;
    if (d.rows.length !== t.rows) ok(false, 'A: số dòng xuất khớp danh mục ' + t.name, [d.rows.length, t.rows]);
  }
  ok(pages > m.tables.length + 30, 'A: xuất chia nhiều trang', pages);
  for (const f of m.files) { out.files[f.name] = []; for (let s = 0; s < f.chunks; s++) out.files[f.name].push((await adm('GET', `/api/admin/export/file?name=${f.name}&seq=${s}`)).b.data); }
  // dòng thêm SAU khi lập danh mục không lọt vào bản sao lưu (giới hạn rowid)
  await adm('POST', '/api/projects', { name: 'Thêm sau danh mục', kind: 'team' });
  const p2 = (await adm('GET', `/api/admin/export/rows?table=projects&after=0&max=${m.tables.find(t => t.name === 'projects').max_rowid}`)).b;
  ok(!p2.rows.some(r => JSON.stringify(r).includes('Thêm sau danh mục')), 'A: dòng thêm sau khi lập danh mục không vào bản sao lưu');
  fs.writeFileSync(BK, JSON.stringify(out));
  done();
}

async function stageB() { // Durable Object B MỚI, trống: các ca lỗi, rồi khôi phục
  const core = require(path.join(__dirname, '..', 'worker', 'do-core.js'));
  const app = core.createApp(fakeStorage(DBB), { ADMIN_PASSWORD: 'Moi-tinh#2026' });
  const adm = client(app), bk = JSON.parse(fs.readFileSync(BK, 'utf8'));
  ok((await adm('POST', '/api/login', { username: 'admin', password: 'Moi-tinh#2026' })).s === 200, 'B: admin của DO mới đăng nhập');
  ok((await adm('PUT', '/api/me/password', { old_password: 'Moi-tinh#2026', new_password: 'Moi-tinh#2027' })).s === 200, 'B: đổi mật khẩu lần đầu');
  const body = { manifest: bk.manifest, tables: bk.tables };
  let r = await adm('POST', '/api/admin/restore', body); ok(r.s === 400 && /xác nhận/.test(r.b.error), 'B: thiếu cụm từ xác nhận → 400', r.b);
  r = await adm('POST', '/api/admin/restore', { ...body, confirm: 'KHÔI PHỤC', manifest: { ...bk.manifest, format: 'khac' } }); ok(r.s === 400, 'B: sai định dạng → 400', r.s);
  { const t2 = JSON.parse(JSON.stringify(bk.tables)); t2.users.rows.pop(); r = await adm('POST', '/api/admin/restore', { manifest: bk.manifest, tables: t2, confirm: 'KHÔI PHỤC' }); ok(r.s === 400 && /không đủ dữ liệu/.test(r.b.error), 'B: thiếu dòng so với danh mục → 400', r.b); }
  { // vi phạm khóa ngoại: công việc trỏ tới dự án không tồn tại → hoàn tác toàn bộ
    const t2 = JSON.parse(JSON.stringify(bk.tables)), tk = t2.tasks, pi = tk.columns.indexOf('project_id'); tk.rows[0][pi] = 999999;
    r = await adm('POST', '/api/admin/restore', { manifest: bk.manifest, tables: t2, confirm: 'KHÔI PHỤC' });
    ok(r.s === 400 && /giữ nguyên/.test(r.b.error), 'B: vi phạm khóa ngoại → 400, báo dữ liệu giữ nguyên', r.b);
    r = await adm('GET', '/api/admin/users'); ok(r.s === 200 && r.b.length === 1 && r.b[0].username === 'admin', 'B: sau lần khôi phục lỗi, dữ liệu và phiên vẫn như cũ', r.s);
  }
  // nạp tệp trước, rồi bảng
  for (const [name, chunks] of Object.entries(bk.files)) for (let s = 0; s < chunks.length; s++) { r = await adm('POST', '/api/admin/restore/file', { name, seq: s, data: chunks[s] }); if (r.s !== 200) ok(false, 'B: nạp khối tệp', r); }
  ok((await adm('POST', '/api/admin/restore/file', { name: '../../etc/passwd', seq: 0, data: 'AA==' })).s === 400, 'B: tên tệp lạ bị từ chối');
  r = await adm('POST', '/api/admin/restore', { ...body, confirm: 'KHÔI PHỤC' });
  ok(r.s === 200 && r.b.rows > 300 && r.b.undo_bookmark === null, 'B: khôi phục thành công (không có Cloudflare nên không có mã hoàn tác)', r.b);
  ok((await adm('GET', '/api/bootstrap')).s === 401, 'B: sau khôi phục mọi phiên bị đăng xuất');
  ok((await adm('POST', '/api/login', { username: 'admin', password: 'Moi-tinh#2027' })).s === 401, 'B: mật khẩu của DO mới không còn (dữ liệu là của bản sao lưu)');
  r = await adm('POST', '/api/login', { username: 'admin', password: 'Quan-tri#2026' }); ok(r.s === 200, 'B: đăng nhập bằng mật khẩu trong bản sao lưu', r.s);
  const docId = fs.readFileSync(path.join(TMP, 'so-bk-docid.txt'), 'utf8');
  const f = await adm('GET', `/api/docs/${docId}/file`);
  ok(f.s === 200 && Buffer.isBuffer(f.b) && f.b.equals(fs.readFileSync(path.join(TMP, 'so-bk-file.bin'))), 'B: tệp 2,5 MB tải về trùng từng byte', f.s);
  r = await adm('GET', '/api/admin/security-log?event=backup_restore'); ok(r.s === 200 && r.b.length === 1, 'B: nhật ký an ninh ghi sự kiện khôi phục', r.b);
  done();
}

async function stageC() { // PITR với ctx giả lập API Cloudflare (chỉ kiểm chứng mã điều khiển, KHÔNG thay được Cloudflare thật)
  const core = require(path.join(__dirname, '..', 'worker', 'do-core.js'));
  const DBC = path.join(TMP, 'so-bk-c.db'); fresh(DBC);
  const st = fakeStorage(DBC), calls = { restore: [], abort: 0 };
  st.getCurrentBookmark = async () => '0000007b-0000b26e-00001538-hientai';
  st.getBookmarkForTime = async t => '0000007a-' + new Date(t).getTime().toString(16) + '-thoidiem';
  st.onNextSessionRestoreBookmark = async b => { calls.restore.push(b); return '0000007b-0000b26f-00001539-hoantac'; };
  const ctx = { storage: st, abort: () => { calls.abort++; } };
  const app = core.createApp(st, { ADMIN_PASSWORD: 'Pitr#2026a' }, ctx);
  const adm = client(app);
  await adm('POST', '/api/login', { username: 'admin', password: 'Pitr#2026a' }); await adm('PUT', '/api/me/password', { old_password: 'Pitr#2026a', new_password: 'Pitr#2026b' });
  let r = await adm('GET', '/api/admin/pitr'); ok(r.s === 200 && r.b.current.endsWith('hientai'), 'C: lấy mã thời điểm hiện tại', r.b);
  const t = new Date(Date.now() - 2 * 86400e3).toISOString();
  r = await adm('GET', '/api/admin/pitr?at=' + encodeURIComponent(t)); ok(r.s === 200 && /thoidiem$/.test(r.b.bookmark), 'C: lấy mã của thời điểm 2 ngày trước', r.b);
  r = await adm('GET', '/api/admin/pitr?at=' + encodeURIComponent(new Date(Date.now() - 31 * 86400e3).toISOString())); ok(r.s === 400, 'C: quá 30 ngày → 400', r.s);
  r = await adm('GET', '/api/admin/pitr?at=' + encodeURIComponent(new Date(Date.now() + 3600e3).toISOString())); ok(r.s === 400, 'C: thời điểm tương lai → 400', r.s);
  r = await adm('POST', '/api/admin/pitr/restore', { bookmark: '0000007a-abc-thoidiem' }); ok(r.s === 400 && !calls.restore.length, 'C: thiếu xác nhận → 400, không gọi khôi phục', r.s);
  r = await adm('POST', '/api/admin/pitr/restore', { bookmark: "x'; DROP", confirm: 'KHÔI PHỤC' }); ok(r.s === 400 && !calls.restore.length, 'C: mã bookmark sai định dạng → 400', r.s);
  r = await adm('POST', '/api/admin/pitr/restore', { bookmark: '0000007a-abc-thoidiem', confirm: 'KHÔI PHỤC' });
  ok(r.s === 200 && r.b.undo_bookmark.endsWith('hoantac') && calls.restore[0] === '0000007a-abc-thoidiem', 'C: khôi phục gọi onNextSessionRestoreBookmark, trả mã hoàn tác', r.b);
  await new Promise(res => setTimeout(res, 400)); ok(calls.abort === 1, 'C: khởi động lại Durable Object (ctx.abort) sau khi trả phản hồi', calls.abort);
  r = await adm('GET', '/api/admin/security-log?event=pitr_restore'); ok(r.s === 200 && r.b.length === 1, 'C: nhật ký an ninh ghi PITR', r.b && r.b.length);
  // khôi phục từ tệp trên Cloudflare: trả mã hoàn tác lấy ngay trước khi khôi phục
  const bk = JSON.parse(fs.readFileSync(BK, 'utf8'));
  r = await adm('POST', '/api/admin/restore', { manifest: bk.manifest, tables: bk.tables, confirm: 'KHÔI PHỤC' });
  ok(r.s === 200 && r.b.undo_bookmark && r.b.undo_bookmark.endsWith('hientai'), 'C: khôi phục từ tệp trên Cloudflare trả mã hoàn tác', r.b);
  done();
}

function compare() { // so sánh trực tiếp hai tệp cơ sở dữ liệu
  const a = new DatabaseSync(DBA), b = new DatabaseSync(DBB), bk = JSON.parse(fs.readFileSync(BK, 'utf8'));
  const ts = a.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r => r.name).filter(n => !['sessions', 'login_attempts'].includes(n));
  let bad = [];
  for (const t of ts) {
    const mx = (bk.manifest.tables.find(x => x.name === t) || {}).max_rowid;
    const q = `SELECT * FROM "${t}" ${mx !== undefined ? 'WHERE rowid <= ' + mx : ''} ORDER BY rowid`;
    const ra = JSON.stringify(a.prepare(q).all().map(r => Object.values(r).map(v => v instanceof Uint8Array ? Buffer.from(v).toString('base64') : v)));
    const rb = JSON.stringify(b.prepare(q).all().map(r => Object.values(r).map(v => v instanceof Uint8Array ? Buffer.from(v).toString('base64') : v)));
    if (ra !== rb) bad.push(t);
  }
  ok(!bad.length, `so sánh trực tiếp ${ts.length} bảng (kể cả file_chunks) giữa DO gốc và DO khôi phục: trùng khớp`, bad);
  const extra = b.prepare("SELECT COUNT(*) n FROM projects WHERE name='Thêm sau danh mục'").get().n; ok(extra === 0, 'DO khôi phục không có dòng thêm sau danh mục');
  a.close(); b.close();
}

(async () => {
  const st = process.argv[2];
  if (st === 'a') return stageA();
  if (st === 'b') return stageB();
  if (st === 'c') return stageC();
  for (const f of [DBA, DBB]) fresh(f);
  for (const s of ['a', 'b', 'c']) {
    const sub = spawnSync(process.execPath, [__filename, s], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const m = /bước: (\d+) đạt, (\d+) không đạt/.exec(sub.stdout || '');
    process.stdout.write((sub.stdout || '').split('\n').filter(l => l.startsWith('  ✗')).map(l => l + '\n').join(''));
    ok(!!m, 'bước ' + s + ' chạy xong', (sub.stderr || '').split('\n').filter(l => !/Experimental|trace-warnings/.test(l)).join('\n').slice(-600));
    if (m) { pass += Number(m[1]); fail += Number(m[2]); }
    if (!m) break;
  }
  if (!fail) compare();
  console.log(`backup-test: ${pass} đạt, ${fail} không đạt`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('LỖI', e); process.exit(1); });
