'use strict';
/**
 * Sao lưu, khôi phục dữ liệu (P0-9 báo cáo rà soát 06/11/2026; ADR-009).
 * Chạy được trên cả Node.js và Cloudflare Durable Object:
 *  - Xuất: chia trang theo từng bảng và từng khối tệp 1 MB để mỗi yêu cầu nằm trong giới hạn CPU, bộ nhớ của Workers;
 *    trình duyệt ghép thành một tệp JSON nén gzip.
 *  - Khôi phục từ tệp: tệp đính kèm nạp trước theo khối; bảng dữ liệu thay thế trong MỘT giao dịch (hoãn kiểm tra khóa ngoại),
 *    lỗi thì hoàn tác toàn bộ. Trên Cloudflare lấy mã bookmark ngay trước khi khôi phục để có thể hoàn tác bằng PITR.
 *  - PITR (chỉ Cloudflare): lấy mã bookmark theo thời điểm trong 30 ngày, khôi phục về mã đó.
 * Căn cứ API: Cloudflare Durable Objects SQL Storage – Point-in-Time Recovery (getCurrentBookmark, getBookmarkForTime,
 * onNextSessionRestoreBookmark, ctx.abort).
 */
const D = require('./db');
const { all, get, run, tx, now } = D;
const { FILES, CHUNK } = require('./files');

const FORMAT = 'smartoffice-backup', VERSION = 1;
/* Không sao lưu: phiên đăng nhập, bộ đếm đăng nhập sai (dữ liệu tạm); file_chunks xuất qua lớp FILES (dùng chung cho Node và Workers) */
/* Bản ghi âm cuộc họp chỉ lưu 24 giờ (ADR-011): đưa vào bản sao lưu là giữ quá thời hạn */
const TRANSIENT = ['meeting_audio_parts', 'meeting_audio'];
const SKIP = new Set(['sessions', 'login_attempts', 'file_chunks', ...TRANSIENT]);
const CONFIRM = 'KHÔI PHỤC';
const PAGE_ROWS = 500, PAGE_BYTES = 1.5 * 1024 * 1024;

const tables = () => all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name").map(r => r.name).filter(n => !SKIP.has(n));
const qi = n => '"' + String(n).replace(/"/g, '""') + '"';
const colsOf = t => all(`PRAGMA table_info(${qi(t)})`).map(c => c.name);
/* Giá trị nhị phân mã hóa {"$b": base64} để đi qua JSON */
const enc = v => (v instanceof Uint8Array || v instanceof ArrayBuffer || Buffer.isBuffer(v)) ? { $b: Buffer.from(v instanceof ArrayBuffer ? new Uint8Array(v) : v).toString('base64') } : v;
const dec = v => (v && typeof v === 'object' && typeof v.$b === 'string') ? Buffer.from(v.$b, 'base64') : v;
const ctx = () => (typeof globalThis.__SO_CTX === 'function' ? globalThis.__SO_CTX() : null);

function register({ route: route0, bad, str, int, secLog, clientIp, cookieAttrs }) {
  /* API sao lưu chỉ dành cho quản trị: lỗi kỹ thuật trả về dạng thông báo 400 có nội dung để quản trị chẩn đoán (không bật SO_DEBUG toàn hệ thống) */
  const route = (m, p, h, o) => route0(m, p, async a => { try { return await h(a); } catch (e) { if (e && e.status) throw e; console.error('backup', p, e && e.stack); bad('Lỗi khi thực hiện sao lưu/khôi phục: ' + String((e && e.message) || e).slice(0, 300)); } }, o);
  const known = () => new Set(tables());

  /* 1. Danh mục bản sao lưu: bảng, số dòng, rowid lớn nhất tại thời điểm lập (chặn dòng thêm sau khi bắt đầu xuất), danh sách tệp */
  route('GET', '/api/admin/export/manifest', ({ user, req }) => {
    const ts = tables();
    // Mỗi bảng một truy vấn: Durable Object giới hạn số vế của câu SELECT ghép (UNION ALL 70 bảng bị từ chối trên Cloudflare thật)
    const m = new Map(ts.map(t => [t, get(`SELECT COUNT(*) n, COALESCE(MAX(rowid),0) mx FROM ${qi(t)}`)]));
    const files = FILES.list();
    secLog('backup_export', { user_id: user.id, username: user.username, ip: clientIp(req), detail: `${ts.length} bảng, ${files.length} tệp` });
    return {
      format: FORMAT, version: VERSION, created_at: now(), runtime: D.IS_WORKER ? 'cloudflare' : 'node', org_name: D.getSettings().org_name,
      tables: ts.map(t => ({ name: t, columns: colsOf(t), rows: m.get(t).n, max_rowid: m.get(t).mx })),
      files: files.map(f => ({ name: f.name, size: Number(f.size), chunks: Number(f.chunks) })), chunk_size: CHUNK
    };
  }, { admin: true });

  /* 2. Dữ liệu một bảng theo trang (rowid tăng dần, tối đa 500 dòng hoặc khoảng 1,5 MB) */
  route('GET', '/api/admin/export/rows', ({ query }) => {
    const t = str(query.table, 80); if (!known().has(t)) bad('Bảng không hợp lệ.');
    const after = Math.max(0, Number(query.after) || 0), max = Number(query.max); if (!Number.isFinite(max)) bad('Thiếu giới hạn rowid.');
    const lim = Math.min(PAGE_ROWS, Math.max(1, int(query.limit) || PAGE_ROWS));
    const cols = colsOf(t), out = []; let bytes = 0, last = null;
    const rows = all(`SELECT rowid AS __r, ${cols.map(qi).join(',')} FROM ${qi(t)} WHERE rowid > ? AND rowid <= ? ORDER BY rowid LIMIT ?`, after, max, lim);
    for (const r of rows) {
      const arr = cols.map(c => enc(r[c])); const sz = JSON.stringify(arr).length;
      if (out.length && bytes + sz > PAGE_BYTES) break;
      out.push(arr); bytes += sz; last = r.__r;
    }
    return { table: t, columns: cols, rows: out, next: out.length === rows.length && rows.length < lim ? null : last };
  }, { admin: true });

  /* 3. Một khối tệp đính kèm (1 MB) */
  route('GET', '/api/admin/export/file', ({ query }) => {
    const name = str(query.name, 120); if (!/^[0-9a-f]{32}[.\w]*$/.test(name)) bad('Tên tệp không hợp lệ.');
    const b = FILES.chunk(name, Math.max(0, int(query.seq) || 0)); if (!b) bad('Không có khối tệp.');
    return { name, seq: int(query.seq) || 0, data: b.toString('base64') };
  }, { admin: true });

  /* 4. Khôi phục khối tệp (nạp TRƯỚC bảng dữ liệu; tên tệp ngẫu nhiên nên ghi thêm không ảnh hưởng dữ liệu đang dùng) */
  route('POST', '/api/admin/restore/file', ({ body }) => {
    const name = str(body.name, 120); if (!/^[0-9a-f]{32}[.\w]*$/.test(name)) bad('Tên tệp không hợp lệ.');
    const seq = int(body.seq); if (!(seq >= 0) || seq > 100) bad('Số thứ tự khối không hợp lệ.');
    const buf = Buffer.from(String(body.data || ''), 'base64'); if (!buf.length || buf.length > CHUNK) bad('Khối tệp không hợp lệ.');
    FILES.writeChunk(name, seq, buf);
    return { ok: true };
  }, { admin: true });

  /* 5. Khôi phục bảng dữ liệu: thay thế toàn bộ trong một giao dịch */
  route('POST', '/api/admin/restore', async ({ user, body, req, res }) => {
    if (body.confirm !== CONFIRM) bad(`Vui lòng nhập đúng cụm từ xác nhận “${CONFIRM}”.`);
    const m = body.manifest || {};
    if (m.format !== FORMAT || m.version !== VERSION) bad('Tệp không phải bản sao lưu SmartOffice hợp lệ.');
    const data = body.tables && typeof body.tables === 'object' ? body.tables : null; if (!data) bad('Bản sao lưu không có dữ liệu bảng.');
    const cur = tables(), curSet = new Set(cur);
    for (const t of m.tables || []) { const d = data[t.name]; if (!d || !Array.isArray(d.rows) || d.rows.length !== t.rows) bad(`Bảng “${t.name}” không đủ dữ liệu so với danh mục (${d && d.rows ? d.rows.length : 0}/${t.rows}).`); }
    const users = data.users; if (!users || !users.rows.length) bad('Bản sao lưu không có tài khoản người dùng.');
    { const ci = users.columns.indexOf('role'), ai = users.columns.indexOf('active'); if (!users.rows.some(r => r[ci] === 'admin' && r[ai] === 1)) bad('Bản sao lưu không có tài khoản quản trị đang hoạt động.'); }
    let undo = null; const c = ctx();
    if (c && c.storage && typeof c.storage.getCurrentBookmark === 'function') undo = await c.storage.getCurrentBookmark();
    let total = 0, skipped = [];
    try {
      tx(() => {
        run('PRAGMA defer_foreign_keys = ON');
        for (const t of cur) run(`DELETE FROM ${qi(t)}`);
        run('DELETE FROM sessions'); run('DELETE FROM login_attempts');
        for (const t of TRANSIENT) if (get("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", t)) run(`DELETE FROM ${qi(t)}`); // bản ghi âm gắn với mã cuộc họp trước khi khôi phục
        for (const [t, d] of Object.entries(data)) {
          if (!curSet.has(t)) { skipped.push(t); continue; }
          const have = new Set(colsOf(t)), idx = d.columns.map((c2, i) => have.has(c2) ? i : -1).filter(i => i >= 0);
          if (!idx.length) continue;
          const sql = `INSERT INTO ${qi(t)}(${idx.map(i => qi(d.columns[i])).join(',')}) VALUES(${idx.map(() => '?').join(',')})`;
          for (const r of d.rows) { run(sql, ...idx.map(i => dec(r[i]))); total++; }
        }
      });
    } catch (e) { bad('Khôi phục thất bại, dữ liệu giữ nguyên như trước khi khôi phục: ' + (e.message || e)); }
    secLog('backup_restore', { user_id: user.id, username: user.username, ip: clientIp(req), detail: `từ bản ${str(m.created_at, 30)}: ${total} dòng${undo ? ', có mã hoàn tác' : ''}` });
    res.setHeader('Set-Cookie', `sid=; ${cookieAttrs(req)}; Max-Age=0`);
    return { ok: true, rows: total, tables: Object.keys(data).length - skipped.length, skipped, undo_bookmark: undo };
  }, { admin: true });

  /* 5b. Kiểm tra khả năng khôi phục mà KHÔNG ghi dữ liệu: bật hoãn kiểm tra khóa ngoại trong giao dịch, đọc lại, rồi hoàn tác */
  route('GET', '/api/admin/restore/check', () => {
    const ROLL = new Error('__rollback__'); let v = null;
    try { tx(() => { run('PRAGMA defer_foreign_keys = ON'); const r = get('PRAGMA defer_foreign_keys'); v = r ? Number(Object.values(r)[0]) : null; throw ROLL; }); }
    catch (e) { if (e !== ROLL) return { ok: false, defer_foreign_keys: false, error: String(e.message || e).slice(0, 200) }; }
    return { ok: v === 1, defer_foreign_keys: v === 1, runtime: D.IS_WORKER ? 'cloudflare' : 'node' };
  }, { admin: true });

  /* 6. PITR – chỉ Cloudflare */
  const needCtx = () => { const c = ctx(); if (!c || !c.storage || typeof c.storage.getBookmarkForTime !== 'function') bad('Khôi phục theo thời điểm chỉ có trên Cloudflare Durable Objects.'); return c; };
  route('GET', '/api/admin/pitr', async ({ query }) => {
    const c = needCtx(), cur = await c.storage.getCurrentBookmark();
    if (!query.at) return { current: cur };
    const t = new Date(str(query.at, 40)); if (isNaN(t)) bad('Thời điểm không hợp lệ.');
    const age = Date.now() - t.getTime(); if (age < 0 || age > 30 * 86400e3) bad('Thời điểm phải nằm trong 30 ngày gần nhất.');
    return { current: cur, at: t.toISOString(), bookmark: await c.storage.getBookmarkForTime(t) };
  }, { admin: true });
  route('POST', '/api/admin/pitr/restore', async ({ user, body, req }) => {
    const c = needCtx();
    if (body.confirm !== CONFIRM) bad(`Vui lòng nhập đúng cụm từ xác nhận “${CONFIRM}”.`);
    const bm = str(body.bookmark, 200); if (!/^[\w-]{8,200}$/.test(bm)) bad('Mã bookmark không hợp lệ.');
    secLog('pitr_restore', { user_id: user.id, username: user.username, ip: clientIp(req), detail: 'khôi phục về ' + bm.slice(0, 60) });
    const undo = await c.storage.onNextSessionRestoreBookmark(bm);
    // Khởi động lại Durable Object sau khi trả phản hồi để việc khôi phục có hiệu lực
    setTimeout(() => { try { c.abort('Khôi phục theo thời điểm (PITR)'); } catch (e) {} }, 200);
    return { ok: true, undo_bookmark: undo };
  }, { admin: true });

  return { FORMAT, VERSION, CONFIRM };
}

module.exports = { register, FORMAT, VERSION, CONFIRM };
