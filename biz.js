'use strict';
/**
 * Phân hệ nhóm Thông tin (Bảng tin, Lịch họp, Tài liệu) và nhóm Kinh doanh (Khách hàng, Thu chi, Tài sản).
 */
const D = require('./db');
const { db, all, get, run, tx, today, now, addDays } = D;

/* Kho tệp đính kèm dùng chung: xem files.js */
const { FILES, saveUpload, sendFile } = require('./files');

db.exec(`
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY, title TEXT NOT NULL, body TEXT DEFAULT '', category TEXT DEFAULT 'thongbao', pinned INTEGER DEFAULT 0,
  require_ack INTEGER DEFAULT 0, author_id INTEGER, created_at TEXT, updated_at TEXT);
CREATE TABLE IF NOT EXISTS post_reads (post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE, user_id INTEGER, read_at TEXT, ack_at TEXT, PRIMARY KEY(post_id, user_id));
CREATE TABLE IF NOT EXISTS post_comments (id INTEGER PRIMARY KEY, post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE, user_id INTEGER, body TEXT, created_at TEXT);

CREATE TABLE IF NOT EXISTS rooms (id INTEGER PRIMARY KEY, name TEXT NOT NULL, location TEXT DEFAULT '', capacity INTEGER DEFAULT 0, equipment TEXT DEFAULT '', active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS meetings (
  id INTEGER PRIMARY KEY, title TEXT NOT NULL, room_id INTEGER, place TEXT DEFAULT '', start_at TEXT NOT NULL, end_at TEXT NOT NULL,
  host_id INTEGER, agenda TEXT DEFAULT '', minutes TEXT DEFAULT '', status TEXT DEFAULT 'scheduled', created_by INTEGER, created_at TEXT);
CREATE TABLE IF NOT EXISTS meeting_members (meeting_id INTEGER REFERENCES meetings(id) ON DELETE CASCADE, user_id INTEGER, response TEXT DEFAULT 'pending', PRIMARY KEY(meeting_id, user_id));

CREATE TABLE IF NOT EXISTS doc_items (
  id INTEGER PRIMARY KEY, kind TEXT DEFAULT 'file', title TEXT NOT NULL, number TEXT DEFAULT '', issued_date TEXT, issuer TEXT DEFAULT '',
  category TEXT DEFAULT 'khac', dept_id INTEGER, description TEXT DEFAULT '', body TEXT DEFAULT '', file_name TEXT, file_size INTEGER, mime TEXT,
  stored_name TEXT, uploaded_by INTEGER, views INTEGER DEFAULT 0, created_at TEXT, updated_at TEXT);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY, code TEXT, name TEXT NOT NULL, kind TEXT DEFAULT 'doanhnghiep', tax_code TEXT DEFAULT '', contact_name TEXT DEFAULT '',
  phone TEXT DEFAULT '', email TEXT DEFAULT '', address TEXT DEFAULT '', source TEXT DEFAULT '', owner_id INTEGER, status TEXT DEFAULT 'tiemnang',
  note TEXT DEFAULT '', created_at TEXT, updated_at TEXT);
CREATE TABLE IF NOT EXISTS deals (
  id INTEGER PRIMARY KEY, customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE, title TEXT NOT NULL, value INTEGER DEFAULT 0,
  stage TEXT DEFAULT 'moi', owner_id INTEGER, expected_close TEXT, note TEXT DEFAULT '', created_at TEXT, closed_at TEXT);
CREATE TABLE IF NOT EXISTS crm_activities (
  id INTEGER PRIMARY KEY, customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE, deal_id INTEGER, user_id INTEGER,
  kind TEXT DEFAULT 'ghichu', content TEXT, due_at TEXT, done INTEGER DEFAULT 1, created_at TEXT);

CREATE TABLE IF NOT EXISTS budgets (id INTEGER PRIMARY KEY, year INTEGER, dept_id INTEGER, category TEXT, amount INTEGER DEFAULT 0, UNIQUE(year, dept_id, category));
CREATE TABLE IF NOT EXISTS fin_tx (
  id INTEGER PRIMARY KEY, code TEXT UNIQUE, kind TEXT NOT NULL, tx_date TEXT NOT NULL, amount INTEGER NOT NULL, category TEXT, dept_id INTEGER,
  partner TEXT DEFAULT '', description TEXT DEFAULT '', method TEXT DEFAULT 'chuyenkhoan', request_id INTEGER, customer_id INTEGER,
  created_by INTEGER, created_at TEXT, voided INTEGER DEFAULT 0, void_note TEXT);

CREATE TABLE IF NOT EXISTS assets (
  id INTEGER PRIMARY KEY, code TEXT UNIQUE, name TEXT NOT NULL, category TEXT DEFAULT 'thietbi', serial TEXT DEFAULT '', purchase_date TEXT,
  value INTEGER DEFAULT 0, status TEXT DEFAULT 'kho', holder_id INTEGER, dept_id INTEGER, location TEXT DEFAULT '', warranty_until TEXT,
  note TEXT DEFAULT '', created_at TEXT);
CREATE TABLE IF NOT EXISTS asset_logs (id INTEGER PRIMARY KEY, asset_id INTEGER REFERENCES assets(id) ON DELETE CASCADE, action TEXT, user_id INTEGER, holder_id INTEGER, note TEXT DEFAULT '', created_at TEXT);
`);

const DOC_CAT = { phapquy: 'Văn bản quy phạm pháp luật', quyche: 'Quy chế, quy định nội bộ', vbden: 'Văn bản đến', vbdi: 'Văn bản đi', bieumau: 'Biểu mẫu', huongdan: 'Hướng dẫn, tri thức', hopdong: 'Hợp đồng', khac: 'Khác' };
const POST_CAT = { thongbao: 'Thông báo', chinhsach: 'Chính sách', sukien: 'Sự kiện', tintuc: 'Tin nội bộ' };
const CUS_STATUS = ['tiemnang', 'chamsoc', 'khachhang', 'ngung'];
const STAGES = ['moi', 'tiepcan', 'baogia', 'damphan', 'thang', 'thua'];
const ACT_KIND = ['goidien', 'gapmat', 'email', 'baogia', 'ghichu', 'lichhen'];
const FIN_CAT = {
  thu: { banhang: 'Doanh thu bán hàng, dịch vụ', congno: 'Thu hồi công nợ', hoanung: 'Hoàn tạm ứng', khacthu: 'Thu khác' },
  chi: { luong: 'Lương, thưởng, bảo hiểm', vanphong: 'Văn phòng phẩm, vật tư', muasam: 'Mua sắm tài sản, CCDC', congtac: 'Công tác phí', tiepkhach: 'Tiếp khách, đối ngoại', marketing: 'Quảng cáo, marketing', dichvu: 'Dịch vụ thuê ngoài, điện nước', tamung: 'Tạm ứng', khacchi: 'Chi khác' }
};
const REQ_CAT = { thanhtoan: 'dichvu', mua: 'muasam', tamung: 'tamung' };
const ASSET_CAT = { maytinh: 'Máy tính, thiết bị CNTT', noithat: 'Nội thất, bàn ghế', phuongtien: 'Phương tiện vận tải', thietbi: 'Máy móc, thiết bị', khac: 'Khác' };
const ASSET_STATUS = ['dangdung', 'kho', 'suachua', 'thanhly'];

function register({ route, bad, forbid, notFound, isAdmin, isHR, isDirector, log, esc, str, int, isDate, HttpError }) {
  const st = () => D.getSettings();
  const isHead = u => !!get('SELECT 1 FROM departments WHERE head_id=?', u.id);
  const isFinance = u => isAdmin(u) || isDirector(u) || (st().accountant_id && get('SELECT dept_id d FROM users WHERE id=?', st().accountant_id)?.d === u.dept_id);
  const canPost = u => isAdmin(u) || isDirector(u) || isHR(u) || isHead(u);
  const canManageAssets = u => isAdmin(u) || isHR(u) || isFinance(u);
  const isDT = s => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(String(s || ''));
  const money = v => Math.max(0, int(String(v ?? 0).replace(/\D/g, '')));
  const nextCode = (table, prefix) => {
    const y = today().slice(0, 4), p = `${prefix}-${y}-`;
    const n = get(`SELECT COALESCE(MAX(CAST(substr(code, ${p.length + 1}) AS INTEGER)),0) n FROM ${table} WHERE code LIKE ?`, p + '%').n + 1;
    return p + String(n).padStart(4, '0');
  };

  /* ================= BẢNG TIN ================= */
  route('GET', '/api/posts', ({ user, query }) => {
    const w = [], p = [user.id];
    if (query.category) { w.push('p.category=?'); p.push(query.category); }
    if (query.q) { w.push('(p.title LIKE ? OR p.body LIKE ?)'); p.push('%' + str(query.q, 80) + '%', '%' + str(query.q, 80) + '%'); }
    const active = get('SELECT COUNT(*) n FROM users WHERE active=1').n;
    return { can_post: canPost(user), active_users: active, posts: all(`SELECT p.*, u.full_name author_name, r.read_at, r.ack_at,
      (SELECT COUNT(*) FROM post_reads x WHERE x.post_id=p.id) reads, (SELECT COUNT(*) FROM post_reads x WHERE x.post_id=p.id AND x.ack_at IS NOT NULL) acks,
      (SELECT COUNT(*) FROM post_comments c WHERE c.post_id=p.id) comments
      FROM posts p LEFT JOIN users u ON u.id=p.author_id LEFT JOIN post_reads r ON r.post_id=p.id AND r.user_id=?
      ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY p.pinned DESC, p.id DESC LIMIT 200`, ...p) };
  });
  route('GET', '/api/posts/:id', ({ user, params }) => {
    const p = get('SELECT p.*, u.full_name author_name FROM posts p LEFT JOIN users u ON u.id=p.author_id WHERE p.id=?', int(params.id)) || notFound('Bản tin không tồn tại.');
    run(`INSERT INTO post_reads(post_id,user_id,read_at) VALUES(?,?,?) ON CONFLICT(post_id,user_id) DO NOTHING`, p.id, user.id, now());
    p.me = get('SELECT * FROM post_reads WHERE post_id=? AND user_id=?', p.id, user.id);
    p.comments = all('SELECT c.*, u.full_name FROM post_comments c LEFT JOIN users u ON u.id=c.user_id WHERE post_id=? ORDER BY c.id', p.id);
    p.can_edit = isAdmin(user) || p.author_id === user.id;
    if (p.can_edit) {
      p.not_read = all(`SELECT id, full_name FROM users WHERE active=1 AND id NOT IN (SELECT user_id FROM post_reads WHERE post_id=?) ORDER BY full_name`, p.id);
      p.not_ack = p.require_ack ? all(`SELECT id, full_name FROM users WHERE active=1 AND id NOT IN (SELECT user_id FROM post_reads WHERE post_id=? AND ack_at IS NOT NULL) ORDER BY full_name`, p.id) : [];
    }
    return p;
  });
  const postInput = b => { const t = str(b.title, 300); if (!t) bad('Vui lòng nhập tiêu đề.'); const body = str(b.body, 20000); if (!body) bad('Vui lòng nhập nội dung.'); return { t, body, cat: POST_CAT[b.category] ? b.category : 'thongbao', pin: b.pinned ? 1 : 0, ack: b.require_ack ? 1 : 0 }; };
  route('POST', '/api/posts', ({ user, body }) => {
    if (!canPost(user)) forbid('Chỉ lãnh đạo, Phòng HC–NS và quản trị viên được đăng bản tin.');
    const x = postInput(body);
    const id = Number(run('INSERT INTO posts(title,body,category,pinned,require_ack,author_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)', x.t, x.body, x.cat, x.pin, x.ack, user.id, now(), now()).lastInsertRowid);
    log(user.id, `đăng bản tin <b>${esc(x.t)}</b>`);
    return { id };
  });
  /* Trước bản so-1.10.1, Thảo luận dự án dùng chung /api/posts/:id với Bảng tin. Trình duyệt còn giao diện cũ trong bộ đệm sẽ gọi
   * PUT/DELETE/bình luận /api/posts/:id cho THẢO LUẬN DỰ ÁN; nay các yêu cầu đó vào Bảng tin và có thể sửa, xóa nhầm bản tin trùng số hiệu.
   * Giao diện mới gửi kèm ?kind=bulletin; thiếu tham số này thì từ chối (409) và yêu cầu cập nhật giao diện. */
  const needBulletinClient = q => { if (q.kind !== 'bulletin') throw new HttpError(409, 'Giao diện đang dùng phiên bản cũ. Vui lòng bấm "Cập nhật" hoặc tải lại trang rồi thao tác lại.'); };
  route('PUT', '/api/posts/:id', ({ user, params, body, query }) => {
    needBulletinClient(query);
    const p = get('SELECT * FROM posts WHERE id=?', int(params.id)) || notFound();
    if (!(isAdmin(user) || p.author_id === user.id)) forbid();
    const x = postInput(body);
    run('UPDATE posts SET title=?, body=?, category=?, pinned=?, require_ack=?, updated_at=? WHERE id=?', x.t, x.body, x.cat, x.pin, x.ack, now(), p.id);
    return { ok: true };
  });
  route('DELETE', '/api/posts/:id', ({ user, params, query }) => {
    needBulletinClient(query);
    const p = get('SELECT * FROM posts WHERE id=?', int(params.id)) || notFound();
    if (!(isAdmin(user) || p.author_id === user.id)) forbid();
    run('DELETE FROM posts WHERE id=?', p.id); return { ok: true };
  });
  route('POST', '/api/posts/:id/ack', ({ user, params }) => {
    const p = get('SELECT * FROM posts WHERE id=?', int(params.id)) || notFound();
    run(`INSERT INTO post_reads(post_id,user_id,read_at,ack_at) VALUES(?,?,?,?) ON CONFLICT(post_id,user_id) DO UPDATE SET ack_at=excluded.ack_at`, p.id, user.id, now(), now());
    return { ok: true };
  });
  route('POST', '/api/posts/:id/comments', ({ user, params, body, query }) => {
    needBulletinClient(query);
    const p = get('SELECT * FROM posts WHERE id=?', int(params.id)) || notFound();
    const b = str(body.body, 3000); if (!b) bad('Vui lòng nhập nội dung bình luận.');
    run('INSERT INTO post_comments(post_id,user_id,body,created_at) VALUES(?,?,?,?)', p.id, user.id, b, now());
    return { ok: true };
  });

  /* ================= LỊCH HỌP ================= */
  route('GET', '/api/rooms', () => all('SELECT * FROM rooms ORDER BY active DESC, id'));
  route('POST', '/api/rooms', ({ body }) => {
    const n = str(body.name, 120); if (!n) bad('Vui lòng nhập tên phòng.');
    return { id: Number(run('INSERT INTO rooms(name,location,capacity,equipment) VALUES(?,?,?,?)', n, str(body.location, 200), int(body.capacity), str(body.equipment, 300)).lastInsertRowid) };
  }, { admin: true });
  route('PUT', '/api/rooms/:id', ({ params, body }) => {
    const r = get('SELECT * FROM rooms WHERE id=?', int(params.id)) || notFound();
    run('UPDATE rooms SET name=?, location=?, capacity=?, equipment=?, active=? WHERE id=?', str(body.name, 120) || r.name, str(body.location, 200), int(body.capacity), str(body.equipment, 300), body.active === false ? 0 : 1, r.id);
    return { ok: true };
  }, { admin: true });
  const meetingFull = (id, user) => {
    const m = get('SELECT m.*, r.name room_name, u.full_name host_name FROM meetings m LEFT JOIN rooms r ON r.id=m.room_id LEFT JOIN users u ON u.id=m.host_id WHERE m.id=?', id) || notFound('Cuộc họp không tồn tại.');
    m.members = all('SELECT mm.*, u.full_name FROM meeting_members mm JOIN users u ON u.id=mm.user_id WHERE meeting_id=? ORDER BY u.full_name', id);
    m.can_edit = isAdmin(user) || m.host_id === user.id || m.created_by === user.id;
    m.my_response = (m.members.find(x => x.user_id === user.id) || {}).response || null;
    return m;
  };
  route('GET', '/api/meetings', ({ user, query }) => {
    const from = isDate(query.from) ? query.from : today(), to = isDate(query.to) ? query.to : addDays(from, 6);
    const mineOnly = query.mine === '1';
    return all(`SELECT m.*, r.name room_name, u.full_name host_name, (SELECT COUNT(*) FROM meeting_members x WHERE x.meeting_id=m.id) n_members,
      (SELECT response FROM meeting_members x WHERE x.meeting_id=m.id AND x.user_id=?) my_response
      FROM meetings m LEFT JOIN rooms r ON r.id=m.room_id LEFT JOIN users u ON u.id=m.host_id
      WHERE substr(m.start_at,1,10) BETWEEN ? AND ? ${mineOnly ? 'AND (m.host_id=? OR EXISTS (SELECT 1 FROM meeting_members x WHERE x.meeting_id=m.id AND x.user_id=?))' : ''}
      ORDER BY m.start_at`, user.id, from, to, ...(mineOnly ? [user.id, user.id] : []));
  });
  route('GET', '/api/meetings/:id', ({ user, params }) => meetingFull(int(params.id), user));
  function saveMeeting(user, body, id) {
    const title = str(body.title, 300); if (!title) bad('Vui lòng nhập nội dung cuộc họp.');
    if (!isDT(body.start_at) || !isDT(body.end_at) || body.end_at <= body.start_at) bad('Thời gian họp không hợp lệ (kết thúc phải sau bắt đầu).');
    if (body.start_at.slice(0, 10) !== body.end_at.slice(0, 10)) bad('Cuộc họp phải bắt đầu và kết thúc trong cùng một ngày.');
    const room = int(body.room_id) || null;
    if (room) {
      if (!get('SELECT 1 FROM rooms WHERE id=? AND active=1', room)) bad('Phòng họp không hợp lệ.');
      const c = get(`SELECT m.title, m.start_at, m.end_at FROM meetings m WHERE m.room_id=? AND m.status<>'cancelled' AND m.id<>? AND m.start_at < ? AND m.end_at > ?`, room, id || 0, body.end_at, body.start_at);
      if (c) bad(`Phòng đã được đặt cho cuộc họp “${c.title}” (${c.start_at.slice(11)}–${c.end_at.slice(11)}). Vui lòng chọn phòng hoặc khung giờ khác.`);
    }
    const host = int(body.host_id) || user.id;
    const members = [...new Set((Array.isArray(body.members) ? body.members : []).map(int).filter(Boolean).concat([host]))];
    return tx(() => {
      if (id) run('UPDATE meetings SET title=?, room_id=?, place=?, start_at=?, end_at=?, host_id=?, agenda=? WHERE id=?', title, room, str(body.place, 200), body.start_at, body.end_at, host, str(body.agenda, 5000), id);
      else id = Number(run(`INSERT INTO meetings(title,room_id,place,start_at,end_at,host_id,agenda,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)`, title, room, str(body.place, 200), body.start_at, body.end_at, host, str(body.agenda, 5000), user.id, now()).lastInsertRowid);
      const old = new Map(all('SELECT user_id, response FROM meeting_members WHERE meeting_id=?', id).map(r => [r.user_id, r.response]));
      run('DELETE FROM meeting_members WHERE meeting_id=?', id);
      for (const u of members) if (get('SELECT 1 FROM users WHERE id=? AND active=1', u)) run('INSERT INTO meeting_members(meeting_id,user_id,response) VALUES(?,?,?)', id, u, u === host ? 'yes' : (old.get(u) || 'pending'));
      return id;
    });
  }
  route('POST', '/api/meetings', ({ user, body }) => { const id = saveMeeting(user, body); log(user.id, `lên lịch họp <b>${esc(str(body.title, 300))}</b>`); return meetingFull(id, user); });
  route('PUT', '/api/meetings/:id', ({ user, params, body }) => { const m = meetingFull(int(params.id), user); if (!m.can_edit) forbid(); saveMeeting(user, body, m.id); return meetingFull(m.id, user); });
  route('POST', '/api/meetings/:id/:action', ({ user, params, body }) => {
    const m = meetingFull(int(params.id), user), a = params.action;
    if (a === 'respond') {
      if (!m.members.some(x => x.user_id === user.id)) forbid('Bạn không có trong danh sách mời.');
      run('UPDATE meeting_members SET response=? WHERE meeting_id=? AND user_id=?', body.response === 'no' ? 'no' : 'yes', m.id, user.id);
    } else if (a === 'minutes') {
      if (!m.can_edit) forbid('Chỉ người chủ trì hoặc người tạo được cập nhật biên bản.');
      run(`UPDATE meetings SET minutes=?, status='done' WHERE id=?`, str(body.minutes, 20000), m.id);
      log(user.id, `cập nhật biên bản họp <b>${esc(m.title)}</b>`);
    } else if (a === 'cancel') {
      if (!m.can_edit) forbid();
      run(`UPDATE meetings SET status='cancelled' WHERE id=?`, m.id);
      log(user.id, `hủy cuộc họp <b>${esc(m.title)}</b>`);
    } else notFound();
    return meetingFull(m.id, user);
  });

  /* ================= TÀI LIỆU ================= */
  const docVisible = (u, d) => !d.dept_id || isAdmin(u) || isDirector(u) || u.dept_id === d.dept_id;
  const canUpload = u => isAdmin(u) || isDirector(u) || isHR(u) || isHead(u);
  route('GET', '/api/docs', ({ user, query }) => {
    const w = ['(d.dept_id IS NULL OR d.dept_id=? OR ?)'], p = [user.dept_id, isAdmin(user) || isDirector(user) ? 1 : 0];
    if (query.category) { w.push('d.category=?'); p.push(query.category); }
    if (query.q) { const q = '%' + str(query.q, 100) + '%'; w.push('(d.title LIKE ? OR d.number LIKE ? OR d.issuer LIKE ? OR d.description LIKE ? OR d.body LIKE ?)'); p.push(q, q, q, q, q); }
    return { can_upload: canUpload(user), docs: all(`SELECT d.id, d.kind, d.title, d.number, d.issued_date, d.issuer, d.category, d.dept_id, d.description, d.file_name, d.file_size, d.uploaded_by, d.views, d.created_at, u.full_name uploader
      FROM doc_items d LEFT JOIN users u ON u.id=d.uploaded_by WHERE ${w.join(' AND ')} ORDER BY COALESCE(d.issued_date, substr(d.created_at,1,10)) DESC, d.id DESC LIMIT 500`, ...p) };
  });
  route('GET', '/api/docs/:id', ({ user, params }) => {
    const d = get('SELECT d.*, u.full_name uploader FROM doc_items d LEFT JOIN users u ON u.id=d.uploaded_by WHERE d.id=?', int(params.id)) || notFound('Tài liệu không tồn tại.');
    if (!docVisible(user, d)) forbid('Tài liệu chỉ dành cho đơn vị được phân quyền.');
    run('UPDATE doc_items SET views=views+1 WHERE id=?', d.id);
    d.can_edit = isAdmin(user) || d.uploaded_by === user.id;
    delete d.stored_name;
    return d;
  });
  route('GET', '/api/docs/:id/file', ({ user, params, res }) => {
    const d = get('SELECT * FROM doc_items WHERE id=?', int(params.id)) || notFound();
    if (!docVisible(user, d)) forbid();
    const buf = d.stored_name && FILES.read(d.stored_name);
    if (!buf) notFound('Không tìm thấy tệp đính kèm.');
    sendFile(res, buf, d.file_name, d.mime);
  }, { raw: true });
  function docInput(b) {
    const title = str(b.title, 300); if (!title) bad('Vui lòng nhập trích yếu / tên tài liệu.');
    if (b.issued_date && !isDate(b.issued_date)) bad('Ngày ban hành không hợp lệ.');
    const dept = int(b.dept_id) || null; if (dept && !get('SELECT 1 FROM departments WHERE id=?', dept)) bad('Phòng ban không hợp lệ.');
    return { title, number: str(b.number, 80), issued: b.issued_date || null, issuer: str(b.issuer, 200), cat: DOC_CAT[b.category] ? b.category : 'khac', dept, desc: str(b.description, 2000), body: str(b.body, 100000) };
  }
  const saveFile = b => saveUpload(b, bad);
  route('POST', '/api/docs', ({ user, body }) => {
    if (!canUpload(user)) forbid('Chỉ lãnh đạo, Phòng HC–NS và quản trị viên được cập nhật kho tài liệu.');
    const x = docInput(body), f = saveFile(body);
    if (!f && !x.body) bad('Vui lòng đính kèm tệp hoặc nhập nội dung bài viết.');
    const id = Number(run(`INSERT INTO doc_items(kind,title,number,issued_date,issuer,category,dept_id,description,body,file_name,file_size,mime,stored_name,uploaded_by,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, f ? 'file' : 'article', x.title, x.number, x.issued, x.issuer, x.cat, x.dept, x.desc, x.body, f && f.name, f && f.size, f && f.mime, f && f.stored, user.id, now(), now()).lastInsertRowid);
    log(user.id, `cập nhật tài liệu <b>${esc(x.title)}</b>`);
    return { id };
  });
  route('PUT', '/api/docs/:id', ({ user, params, body }) => {
    const d = get('SELECT * FROM doc_items WHERE id=?', int(params.id)) || notFound();
    if (!(isAdmin(user) || d.uploaded_by === user.id)) forbid();
    const x = docInput(body), f = saveFile(body);
    if (f && d.stored_name) FILES.del(d.stored_name);
    run(`UPDATE doc_items SET title=?, number=?, issued_date=?, issuer=?, category=?, dept_id=?, description=?, body=?, updated_at=? WHERE id=?`, x.title, x.number, x.issued, x.issuer, x.cat, x.dept, x.desc, x.body, now(), d.id);
    if (f) run(`UPDATE doc_items SET kind='file', file_name=?, file_size=?, mime=?, stored_name=? WHERE id=?`, f.name, f.size, f.mime, f.stored, d.id);
    return { ok: true };
  });
  route('DELETE', '/api/docs/:id', ({ user, params }) => {
    const d = get('SELECT * FROM doc_items WHERE id=?', int(params.id)) || notFound();
    if (!(isAdmin(user) || d.uploaded_by === user.id)) forbid();
    run('DELETE FROM doc_items WHERE id=?', d.id);
    if (d.stored_name) FILES.del(d.stored_name);
    log(user.id, `xóa tài liệu <b>${esc(d.title)}</b>`);
    return { ok: true };
  });

  /* ================= KHÁCH HÀNG (CRM) ================= */
  const crmAll = u => isAdmin(u) || isDirector(u) || isHead(u);
  const crmScope = (u, alias = 'c') => crmAll(u) ? ['1=1', []] : [`(${alias}.owner_id=? OR ${alias}.owner_id IN (SELECT id FROM users WHERE dept_id=?))`, [u.id, u.dept_id]];
  const cusOr = (u, id) => { const [w, p] = crmScope(u); return get(`SELECT c.*, u.full_name owner_name FROM customers c LEFT JOIN users u ON u.id=c.owner_id WHERE c.id=? AND ${w}`, int(id), ...p) || notFound('Khách hàng không tồn tại hoặc bạn không có quyền xem.'); };
  route('GET', '/api/crm/customers', ({ user, query }) => {
    const [w0, p] = crmScope(user), w = [w0];
    if (query.status) { w.push('c.status=?'); p.push(query.status); }
    if (query.q) { const q = '%' + str(query.q, 80) + '%'; w.push('(c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ? OR c.tax_code LIKE ? OR c.contact_name LIKE ?)'); p.push(q, q, q, q, q); }
    return all(`SELECT c.*, u.full_name owner_name,
      (SELECT COUNT(*) FROM deals d WHERE d.customer_id=c.id AND d.stage NOT IN ('thang','thua')) open_deals,
      (SELECT COALESCE(SUM(value),0) FROM deals d WHERE d.customer_id=c.id AND d.stage='thang') won_value,
      (SELECT MAX(created_at) FROM crm_activities a WHERE a.customer_id=c.id) last_activity
      FROM customers c LEFT JOIN users u ON u.id=c.owner_id WHERE ${w.join(' AND ')} ORDER BY c.updated_at DESC LIMIT 1000`, ...p);
  });
  route('GET', '/api/crm/customers/:id', ({ user, params }) => {
    const c = cusOr(user, params.id);
    c.deals = all('SELECT d.*, u.full_name owner_name FROM deals d LEFT JOIN users u ON u.id=d.owner_id WHERE customer_id=? ORDER BY d.id DESC', c.id);
    c.activities = all('SELECT a.*, u.full_name FROM crm_activities a LEFT JOIN users u ON u.id=a.user_id WHERE customer_id=? ORDER BY COALESCE(a.due_at, a.created_at) DESC, a.id DESC', c.id);
    return c;
  });
  function cusInput(b) {
    const name = str(b.name, 200); if (!name) bad('Vui lòng nhập tên khách hàng.');
    return { name, kind: b.kind === 'canhan' ? 'canhan' : 'doanhnghiep', tax: str(b.tax_code, 20), contact: str(b.contact_name, 120), phone: str(b.phone, 30), email: str(b.email, 120), address: str(b.address, 300), source: str(b.source, 80), status: CUS_STATUS.includes(b.status) ? b.status : 'tiemnang', note: str(b.note, 3000) };
  }
  route('POST', '/api/crm/customers', ({ user, body }) => {
    const x = cusInput(body), owner = int(body.owner_id) || user.id;
    if (x.tax && get('SELECT 1 FROM customers WHERE tax_code=?', x.tax)) bad('Mã số thuế đã tồn tại trong danh sách khách hàng.');
    const id = Number(run(`INSERT INTO customers(code,name,kind,tax_code,contact_name,phone,email,address,source,owner_id,status,note,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      nextCode('customers', 'KH'), x.name, x.kind, x.tax, x.contact, x.phone, x.email, x.address, x.source, owner, x.status, x.note, now(), now()).lastInsertRowid);
    log(user.id, `thêm khách hàng <b>${esc(x.name)}</b>`);
    return { id };
  });
  route('PUT', '/api/crm/customers/:id', ({ user, params, body }) => {
    const c = cusOr(user, params.id), x = cusInput(body);
    run(`UPDATE customers SET name=?,kind=?,tax_code=?,contact_name=?,phone=?,email=?,address=?,source=?,owner_id=?,status=?,note=?,updated_at=? WHERE id=?`,
      x.name, x.kind, x.tax, x.contact, x.phone, x.email, x.address, x.source, int(body.owner_id) || c.owner_id, x.status, x.note, now(), c.id);
    return { ok: true };
  });
  route('DELETE', '/api/crm/customers/:id', ({ user, params }) => {
    const c = cusOr(user, params.id); if (!(isAdmin(user) || c.owner_id === user.id)) forbid();
    run('DELETE FROM customers WHERE id=?', c.id); return { ok: true };
  });
  route('GET', '/api/crm/deals', ({ user }) => {
    const [w, p] = crmScope(user, 'd');
    return all(`SELECT d.*, c.name customer_name, u.full_name owner_name FROM deals d JOIN customers c ON c.id=d.customer_id LEFT JOIN users u ON u.id=d.owner_id
      WHERE ${w} AND (d.stage NOT IN ('thang','thua') OR d.closed_at >= ?) ORDER BY d.expected_close`, ...p, addDays(today(), -90));
  });
  route('POST', '/api/crm/deals', ({ user, body }) => {
    const c = cusOr(user, body.customer_id), title = str(body.title, 300); if (!title) bad('Vui lòng nhập tên cơ hội.');
    if (body.expected_close && !isDate(body.expected_close)) bad('Ngày dự kiến chốt không hợp lệ.');
    const stage = STAGES.includes(body.stage) ? body.stage : 'moi';
    const id = Number(run('INSERT INTO deals(customer_id,title,value,stage,owner_id,expected_close,note,created_at,closed_at) VALUES(?,?,?,?,?,?,?,?,?)', c.id, title, money(body.value), stage, int(body.owner_id) || user.id, body.expected_close || null, str(body.note, 2000), now(), ['thang', 'thua'].includes(stage) ? now() : null).lastInsertRowid);
    run(`UPDATE customers SET status=CASE WHEN status='tiemnang' THEN 'chamsoc' ELSE status END, updated_at=? WHERE id=?`, now(), c.id);
    return { id };
  });
  route('PUT', '/api/crm/deals/:id', ({ user, params, body }) => {
    const d = get('SELECT * FROM deals WHERE id=?', int(params.id)) || notFound(); cusOr(user, d.customer_id);
    const stage = STAGES.includes(body.stage) ? body.stage : d.stage;
    if (body.expected_close && !isDate(body.expected_close)) bad('Ngày dự kiến chốt không hợp lệ.');
    const closed = ['thang', 'thua'].includes(stage) ? (d.closed_at || now()) : null;
    run('UPDATE deals SET title=?, value=?, stage=?, owner_id=?, expected_close=?, note=?, closed_at=? WHERE id=?', str(body.title ?? d.title, 300) || d.title, body.value !== undefined ? money(body.value) : d.value, stage, int(body.owner_id) || d.owner_id, body.expected_close ?? d.expected_close, str(body.note ?? d.note, 2000), closed, d.id);
    if (stage === 'thang' && d.stage !== 'thang') { run(`UPDATE customers SET status='khachhang', updated_at=? WHERE id=?`, now(), d.customer_id); log(user.id, `chốt thành công cơ hội <b>${esc(d.title)}</b>`); }
    return { ok: true };
  });
  route('DELETE', '/api/crm/deals/:id', ({ user, params }) => { const d = get('SELECT * FROM deals WHERE id=?', int(params.id)) || notFound(); cusOr(user, d.customer_id); run('DELETE FROM deals WHERE id=?', d.id); return { ok: true }; });
  route('POST', '/api/crm/activities', ({ user, body }) => {
    const c = cusOr(user, body.customer_id), content = str(body.content, 3000); if (!content) bad('Vui lòng nhập nội dung.');
    const kind = ACT_KIND.includes(body.kind) ? body.kind : 'ghichu';
    if (kind === 'lichhen' && !isDT(body.due_at)) bad('Vui lòng chọn thời gian hẹn.');
    run('INSERT INTO crm_activities(customer_id,deal_id,user_id,kind,content,due_at,done,created_at) VALUES(?,?,?,?,?,?,?,?)', c.id, int(body.deal_id) || null, user.id, kind, content, kind === 'lichhen' ? body.due_at : null, kind === 'lichhen' ? 0 : 1, now());
    run('UPDATE customers SET updated_at=? WHERE id=?', now(), c.id);
    return { ok: true };
  });
  route('PUT', '/api/crm/activities/:id', ({ user, params, body }) => {
    const a = get('SELECT * FROM crm_activities WHERE id=?', int(params.id)) || notFound(); cusOr(user, a.customer_id);
    run('UPDATE crm_activities SET done=? WHERE id=?', body.done ? 1 : 0, a.id); return { ok: true };
  });
  route('GET', '/api/crm/agenda', ({ user }) => all(`SELECT a.*, c.name customer_name FROM crm_activities a JOIN customers c ON c.id=a.customer_id
    WHERE a.kind='lichhen' AND a.done=0 AND a.user_id=? ORDER BY a.due_at LIMIT 50`, user.id));

  /* ================= THU CHI – NGÂN SÁCH ================= */
  const finOnly = u => { if (!isFinance(u)) forbid('Phân hệ Thu chi dành cho Ban Giám đốc và Phòng Tài chính – Kế toán.'); };
  route('GET', '/api/fin/summary', ({ user, query }) => {
    finOnly(user);
    const y = int(query.year) || int(today().slice(0, 4)), ys = String(y);
    const sum = (kind, w = '', ...p) => get(`SELECT COALESCE(SUM(amount),0) n FROM fin_tx WHERE voided=0 AND kind=? ${w}`, kind, ...p).n;
    const months = Array.from({ length: 12 }, (_, i) => { const m = `${ys}-${String(i + 1).padStart(2, '0')}`; return { month: m, thu: sum('thu', 'AND substr(tx_date,1,7)=?', m), chi: sum('chi', 'AND substr(tx_date,1,7)=?', m) }; });
    const byCat = all(`SELECT kind, category, SUM(amount) total FROM fin_tx WHERE voided=0 AND substr(tx_date,1,4)=? GROUP BY kind, category ORDER BY total DESC`, ys);
    const budgets = all(`SELECT b.*, d.name dept_name, (SELECT COALESCE(SUM(amount),0) FROM fin_tx t WHERE t.voided=0 AND t.kind='chi' AND t.dept_id=b.dept_id AND t.category=b.category AND substr(t.tx_date,1,4)=?) spent
      FROM budgets b LEFT JOIN departments d ON d.id=b.dept_id WHERE b.year=? ORDER BY d.id, b.category`, ys, y);
    const pending = all(`SELECT r.id, r.code, r.type, r.title, r.amount, r.creator_id, r.closed_at, u.full_name creator_name, u.dept_id FROM requests r JOIN users u ON u.id=r.creator_id
      WHERE r.status='approved' AND r.type IN ('thanhtoan','mua','tamung') AND NOT EXISTS (SELECT 1 FROM fin_tx t WHERE t.request_id=r.id AND t.voided=0) ORDER BY r.closed_at`);
    return { year: y, opening: Number(st().pay && 0) || Number(get(`SELECT value v FROM settings WHERE key='fin_opening'`)?.v || 0), balance_total: sum('thu') - sum('chi'),
      thu_year: sum('thu', 'AND substr(tx_date,1,4)=?', ys), chi_year: sum('chi', 'AND substr(tx_date,1,4)=?', ys), months, by_category: byCat, budgets, pending, categories: FIN_CAT };
  });
  route('GET', '/api/fin/tx', ({ user, query }) => {
    finOnly(user);
    const w = ['1=1'], p = [];
    if (/^\d{4}-\d{2}$/.test(query.month || '')) { w.push('substr(t.tx_date,1,7)=?'); p.push(query.month); }
    if (query.kind) { w.push('t.kind=?'); p.push(query.kind); }
    if (query.q) { const q = '%' + str(query.q, 80) + '%'; w.push('(t.description LIKE ? OR t.partner LIKE ? OR t.code LIKE ?)'); p.push(q, q, q); }
    return all(`SELECT t.*, d.name dept_name, u.full_name creator_name, r.code request_code FROM fin_tx t LEFT JOIN departments d ON d.id=t.dept_id
      LEFT JOIN users u ON u.id=t.created_by LEFT JOIN requests r ON r.id=t.request_id WHERE ${w.join(' AND ')} ORDER BY t.tx_date DESC, t.id DESC LIMIT 2000`, ...p);
  });
  route('POST', '/api/fin/tx', ({ user, body }) => {
    finOnly(user);
    const kind = body.kind === 'thu' ? 'thu' : 'chi';
    if (!isDate(body.tx_date)) bad('Ngày chứng từ không hợp lệ.');
    const amount = money(body.amount); if (!amount) bad('Vui lòng nhập số tiền.');
    if (!FIN_CAT[kind][body.category]) bad('Vui lòng chọn khoản mục.');
    const desc = str(body.description, 500); if (!desc) bad('Vui lòng nhập nội dung (diễn giải).');
    let req = null;
    if (body.request_id) {
      req = get(`SELECT * FROM requests WHERE id=? AND status='approved'`, int(body.request_id)); if (!req) bad('Đề xuất không hợp lệ hoặc chưa được duyệt.');
      if (get('SELECT 1 FROM fin_tx WHERE request_id=? AND voided=0', req.id)) bad('Đề xuất này đã được lập phiếu chi.');
    }
    const id = tx(() => Number(run(`INSERT INTO fin_tx(code,kind,tx_date,amount,category,dept_id,partner,description,method,request_id,customer_id,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      nextCode('fin_tx', kind === 'thu' ? 'PT' : 'PC').replace(/^(P[TC])-(\d{4})-/, '$1-$2-'), kind, body.tx_date, amount, body.category, int(body.dept_id) || null, str(body.partner, 200), desc,
      body.method === 'tienmat' ? 'tienmat' : 'chuyenkhoan', req ? req.id : null, int(body.customer_id) || null, user.id, now()).lastInsertRowid));
    log(user.id, `lập ${kind === 'thu' ? 'phiếu thu' : 'phiếu chi'} <b>${esc(desc)}</b>`);
    return { id };
  });
  route('POST', '/api/fin/tx/:id/void', ({ user, params, body }) => {
    finOnly(user);
    const t = get('SELECT * FROM fin_tx WHERE id=?', int(params.id)) || notFound(); if (t.voided) bad('Chứng từ đã hủy.');
    const note = str(body.note, 300); if (!note) bad('Vui lòng ghi lý do hủy chứng từ.');
    run('UPDATE fin_tx SET voided=1, void_note=? WHERE id=?', note, t.id);
    log(user.id, `hủy chứng từ ${esc(t.code)}`);
    return { ok: true };
  });
  route('PUT', '/api/fin/budgets', ({ user, body }) => {
    finOnly(user);
    const y = int(body.year), rows = Array.isArray(body.rows) ? body.rows : [];
    if (y < 2000) bad('Năm không hợp lệ.');
    tx(() => { for (const r of rows) {
      if (!FIN_CAT.chi[r.category] || !get('SELECT 1 FROM departments WHERE id=?', int(r.dept_id))) continue;
      run(`INSERT INTO budgets(year,dept_id,category,amount) VALUES(?,?,?,?) ON CONFLICT(year,dept_id,category) DO UPDATE SET amount=excluded.amount`, y, int(r.dept_id), r.category, money(r.amount));
    } });
    return { ok: true };
  });
  route('GET', '/api/export/fin.csv', ({ user, query, res }) => {
    finOnly(user);
    const m = /^\d{4}-\d{2}$/.test(query.month || '') ? query.month : today().slice(0, 7);
    const rows = all(`SELECT t.*, d.name dn FROM fin_tx t LEFT JOIN departments d ON d.id=t.dept_id WHERE substr(tx_date,1,7)=? ORDER BY tx_date, id`, m);
    const head = ['STT', 'Số chứng từ', 'Ngày', 'Loại', 'Khoản mục', 'Phòng ban', 'Đối tượng', 'Diễn giải', 'Hình thức', 'Số tiền thu', 'Số tiền chi', 'Tình trạng'];
    const out = rows.map((t, i) => [i + 1, t.code, t.tx_date.split('-').reverse().join('/'), t.kind === 'thu' ? 'Thu' : 'Chi', FIN_CAT[t.kind][t.category] || t.category, t.dn || '', t.partner, t.description, t.method === 'tienmat' ? 'Tiền mặt' : 'Chuyển khoản', t.kind === 'thu' ? t.amount : '', t.kind === 'chi' ? t.amount : '', t.voided ? 'Đã hủy: ' + t.void_note : '']);
    const csv = '\uFEFF' + [[`SỔ THU CHI THÁNG ${m.slice(5)}/${m.slice(0, 4)}`], head, ...out].map(r => r.map(v => { const x = String(v ?? ''); return /[",\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; }).join(',')).join('\r\n');
    res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="so-thu-chi-${m}.csv"` });
    res.end(csv);
  }, { raw: true });

  /* ================= TÀI SẢN ================= */
  route('GET', '/api/assets', ({ user, query }) => {
    const mgr = canManageAssets(user), w = [], p = [];
    if (!mgr || query.mine === '1') { w.push('a.holder_id=?'); p.push(user.id); }
    if (query.status) { w.push('a.status=?'); p.push(query.status); }
    if (query.category) { w.push('a.category=?'); p.push(query.category); }
    if (query.q) { const q = '%' + str(query.q, 80) + '%'; w.push('(a.name LIKE ? OR a.code LIKE ? OR a.serial LIKE ?)'); p.push(q, q, q); }
    const rows = all(`SELECT a.*, u.full_name holder_name, d.name dept_name FROM assets a LEFT JOIN users u ON u.id=a.holder_id LEFT JOIN departments d ON d.id=a.dept_id
      ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY a.code`, ...p);
    return { can_manage: mgr, assets: rows };
  });
  route('GET', '/api/assets/:id', ({ user, params }) => {
    const a = get('SELECT a.*, u.full_name holder_name FROM assets a LEFT JOIN users u ON u.id=a.holder_id WHERE a.id=?', int(params.id)) || notFound();
    if (!canManageAssets(user) && a.holder_id !== user.id) forbid();
    a.logs = all('SELECT l.*, u.full_name, h.full_name holder_name FROM asset_logs l LEFT JOIN users u ON u.id=l.user_id LEFT JOIN users h ON h.id=l.holder_id WHERE asset_id=? ORDER BY l.id DESC', a.id);
    a.can_manage = canManageAssets(user);
    return a;
  });
  function assetInput(b) {
    const name = str(b.name, 200); if (!name) bad('Vui lòng nhập tên tài sản.');
    for (const k of ['purchase_date', 'warranty_until']) if (b[k] && !isDate(b[k])) bad('Ngày tháng không hợp lệ.');
    return { name, cat: ASSET_CAT[b.category] ? b.category : 'khac', serial: str(b.serial, 80), pd: b.purchase_date || null, value: money(b.value), loc: str(b.location, 200), wu: b.warranty_until || null, note: str(b.note, 1000), dept: int(b.dept_id) || null };
  }
  route('POST', '/api/assets', ({ user, body }) => {
    if (!canManageAssets(user)) forbid();
    const x = assetInput(body);
    let code = str(body.code, 40) || nextCode('assets', 'TS');
    if (get('SELECT 1 FROM assets WHERE code=?', code)) bad('Mã tài sản đã tồn tại.');
    const id = Number(run(`INSERT INTO assets(code,name,category,serial,purchase_date,value,status,dept_id,location,warranty_until,note,created_at) VALUES(?,?,?,?,?,?,'kho',?,?,?,?,?)`,
      code, x.name, x.cat, x.serial, x.pd, x.value, x.dept, x.loc, x.wu, x.note, now()).lastInsertRowid);
    run(`INSERT INTO asset_logs(asset_id,action,user_id,note,created_at) VALUES(?, 'nhap', ?, 'Ghi tăng tài sản', ?)`, id, user.id, now());
    return { id };
  });
  route('PUT', '/api/assets/:id', ({ user, params, body }) => {
    if (!canManageAssets(user)) forbid();
    const a = get('SELECT * FROM assets WHERE id=?', int(params.id)) || notFound(), x = assetInput(body);
    run('UPDATE assets SET name=?, category=?, serial=?, purchase_date=?, value=?, dept_id=?, location=?, warranty_until=?, note=? WHERE id=?', x.name, x.cat, x.serial, x.pd, x.value, x.dept, x.loc, x.wu, x.note, a.id);
    return { ok: true };
  });
  route('POST', '/api/assets/:id/:action', ({ user, params, body }) => {
    if (!canManageAssets(user)) forbid();
    const a = get('SELECT * FROM assets WHERE id=?', int(params.id)) || notFound(), act = params.action, note = str(body.note, 500);
    if (a.status === 'thanhly') bad('Tài sản đã thanh lý.');
    if (act === 'capphat') {
      const h = int(body.holder_id); const hu = get('SELECT id, dept_id FROM users WHERE id=? AND active=1', h); if (!hu) bad('Vui lòng chọn người nhận.');
      run(`UPDATE assets SET status='dangdung', holder_id=?, dept_id=? WHERE id=?`, h, hu.dept_id, a.id);
      run(`INSERT INTO asset_logs(asset_id,action,user_id,holder_id,note,created_at) VALUES(?, 'capphat', ?, ?, ?, ?)`, a.id, user.id, h, note, now());
    } else if (act === 'thuhoi') {
      run(`UPDATE assets SET status='kho', holder_id=NULL WHERE id=?`, a.id);
      run(`INSERT INTO asset_logs(asset_id,action,user_id,holder_id,note,created_at) VALUES(?, 'thuhoi', ?, ?, ?, ?)`, a.id, user.id, a.holder_id, note, now());
    } else if (act === 'suachua') {
      run(`UPDATE assets SET status='suachua' WHERE id=?`, a.id);
      run(`INSERT INTO asset_logs(asset_id,action,user_id,holder_id,note,created_at) VALUES(?, 'suachua', ?, ?, ?, ?)`, a.id, user.id, a.holder_id, note, now());
    } else if (act === 'thanhly') {
      if (!note) bad('Vui lòng ghi căn cứ thanh lý (quyết định, biên bản).');
      run(`UPDATE assets SET status='thanhly', holder_id=NULL WHERE id=?`, a.id);
      run(`INSERT INTO asset_logs(asset_id,action,user_id,note,created_at) VALUES(?, 'thanhly', ?, ?, ?)`, a.id, user.id, note, now());
    } else notFound();
    log(user.id, `cập nhật tài sản <b>${esc(a.code + ' – ' + a.name)}</b>`);
    return { ok: true };
  });

  /* Số liệu cho thanh menu */
  const badges = u => ({
    posts: get(`SELECT COUNT(*) n FROM posts p WHERE NOT EXISTS (SELECT 1 FROM post_reads r WHERE r.post_id=p.id AND r.user_id=?) AND p.created_at >= ?`, u.id, addDays(today(), -30) + ' 00:00').n,
    meetings: get(`SELECT COUNT(*) n FROM meetings m JOIN meeting_members mm ON mm.meeting_id=m.id AND mm.user_id=? WHERE m.status='scheduled' AND substr(m.start_at,1,10)=?`, u.id, today()).n
  });
  return { isFinance, canPost, canManageAssets, badges, DOC_CAT, POST_CAT, FIN_CAT, ASSET_CAT };
}

/* ================= Dữ liệu mẫu ================= */
function seedBiz() {
  if (get(`SELECT value v FROM settings WHERE key='extras_v3'`)) return;
  const U = n => get('SELECT id, dept_id FROM users WHERE username=?', n);
  if (!U('thanh.nv')) { D.setSetting('extras_v3', '1'); return; }
  const T = today(), d = n => addDays(T, n), ts = (n, h) => `${addDays(T, n)} ${h}`;
  const id = { thanh: U('thanh.nv').id, huong: U('huong.tt').id, quan: U('quan.lm').id, trang: U('trang.pt').id, huy: U('huy.dq').id, anh: U('anh.vn').id, long: U('long.hd').id, mai: U('mai.bt').id };
  const REP = { kd: 'quan.lm', hcns: 'trang.pt', kt: 'long.hd', tckt: 'huong.tt' };
  const dep = k => U(REP[k] || k).dept_id;
  const y = T.slice(0, 4);
  tx(() => {
    /* Bảng tin */
    const post = (t, body, cat, pin, ack, a, at) => Number(run('INSERT INTO posts(title,body,category,pinned,require_ack,author_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)', t, body, cat, pin, ack, a, at, at).lastInsertRowid);
    const p1 = post('Thông báo triển khai phần mềm văn phòng số SmartOffice', 'Thực hiện kế hoạch chuyển đổi số năm 2026, từ ngày 15/11/2026 toàn bộ đề xuất, tờ trình và giao việc nội bộ được thực hiện trên phần mềm SmartOffice.\n\nĐề nghị Trưởng các phòng:\n1. Rà soát danh sách nhân sự, gửi Phòng HC–NS trước ngày 10/11/2026;\n2. Cử nhân sự tham gia buổi hướng dẫn sử dụng theo lịch của Phòng HC–NS;\n3. Từ ngày áp dụng, không tiếp nhận đề xuất bản giấy, trừ trường hợp phần mềm gặp sự cố.\n\nNhân sự đọc và bấm “Xác nhận đã đọc” ở cuối thông báo.', 'thongbao', 1, 1, id.thanh, ts(-3, '08:30'));
    post('Điều chỉnh giờ làm việc mùa đông', 'Từ ngày 01/12/2026 đến hết ngày 28/02/2027, giờ làm việc buổi sáng bắt đầu lúc 08:00, buổi chiều kết thúc lúc 17:00. Thời gian nghỉ trưa từ 12:00 đến 13:00. Các phòng phổ biến tới toàn thể nhân sự.', 'chinhsach', 0, 0, id.trang, ts(-2, '10:00'));
    post('Hội thao chào mừng ngày thành lập Công ty', 'Công đoàn Công ty tổ chức Hội thao với các nội dung: bóng đá, cầu lông, kéo co. Thời gian dự kiến: sáng thứ Bảy cuối tháng 11. Các phòng đăng ký vận động viên với Phòng HC–NS trước ngày 20/11.', 'sukien', 0, 0, id.trang, ts(-1, '15:20'));
    for (const u of [id.trang, id.mai, id.quan]) run('INSERT INTO post_reads(post_id,user_id,read_at,ack_at) VALUES(?,?,?,?)', p1, u, ts(-3, '09:00'), ts(-3, '09:05'));
    run('INSERT INTO post_comments(post_id,user_id,body,created_at) VALUES(?,?,?,?)', p1, id.quan, 'Phòng Kinh doanh đã gửi danh sách, đề nghị bố trí buổi hướng dẫn vào cuối giờ chiều.', ts(-2, '08:10'));

    /* Phòng họp, cuộc họp */
    const room = (n, l, c, e) => Number(run('INSERT INTO rooms(name,location,capacity,equipment) VALUES(?,?,?,?)', n, l, c, e).lastInsertRowid);
    const R1 = room('Phòng họp lớn', 'Tầng 3', 30, 'Máy chiếu, âm thanh, họp trực tuyến'), R2 = room('Phòng họp nhỏ A', 'Tầng 2', 8, 'Màn hình 55 inch'), R3 = room('Phòng tiếp khách', 'Tầng 1', 6, 'Bàn trà');
    const mt = (t, r, day, s, e, host, members, agenda, status = 'scheduled', minutes = '') => {
      const m = Number(run('INSERT INTO meetings(title,room_id,start_at,end_at,host_id,agenda,minutes,status,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)', t, r, `${d(day)} ${s}`, `${d(day)} ${e}`, host, agenda, minutes, status, host, now()).lastInsertRowid);
      for (const u of new Set([host, ...members])) run('INSERT INTO meeting_members(meeting_id,user_id,response) VALUES(?,?,?)', m, u, u === host ? 'yes' : (day < 0 ? 'yes' : 'pending'));
    };
    mt('Giao ban tuần', R1, -2, '08:30', '09:30', id.thanh, [id.huong, id.quan, id.trang, id.long], '1. Kết quả công việc tuần trước\n2. Kế hoạch tuần này\n3. Các vấn đề phát sinh', 'done', 'Kết luận:\n- Phòng Kinh doanh hoàn thiện hồ sơ chào giá dự án Ninh Bình trước thứ Sáu.\n- Phòng Kỹ thuật hoàn tất cấu hình phần mềm, Phòng HC–NS lên lịch đào tạo.');
    mt('Rà soát kế hoạch doanh số tháng 12', R2, 0, '14:00', '15:30', id.quan, [id.huy, id.anh, id.huong], 'Rà soát doanh số dự kiến theo khu vực, công nợ phải thu.');
    mt('Làm việc với đối tác cung cấp thiết bị', R3, 1, '09:00', '10:00', id.trang, [id.mai, id.long], 'Đàm phán giá, điều khoản bảo hành máy tính xách tay.');
    mt('Hướng dẫn sử dụng phần mềm SmartOffice – đợt 1', R1, 3, '15:00', '17:00', id.trang, [id.huy, id.anh, id.mai, id.long, id.huong, id.quan], 'Hướng dẫn giao việc, gửi đề xuất, chấm công trên phần mềm.');

    /* Tài liệu (nội dung tóm tắt do đơn vị tự soạn) */
    const doc = (cat, title, number, issued, issuer, desc, body, deptN) => run(`INSERT INTO doc_items(kind,title,number,issued_date,issuer,category,dept_id,description,body,uploaded_by,created_at,updated_at) VALUES('article',?,?,?,?,?,?,?,?,?,?,?)`,
      title, number, issued, issuer, cat, deptN ? dep(deptN) : null, desc, body, id.trang, now(), now());
    doc('quyche', 'Quy chế chi tiêu nội bộ năm 2026', '01/2026/QC-SO', `${y}-01-05`, 'Công ty Cổ phần SmartOffice', 'Quy định thẩm quyền phê duyệt và định mức chi tiêu áp dụng trong Công ty.',
      'Điều 1. Thẩm quyền phê duyệt\n- Khoản chi đến 5.000.000 đồng: Trưởng phòng phê duyệt.\n- Khoản chi trên 5.000.000 đồng đến 50.000.000 đồng: Trưởng phòng và Kế toán trưởng phê duyệt.\n- Khoản chi trên 50.000.000 đồng: trình Giám đốc phê duyệt.\n\nĐiều 2. Hồ sơ thanh toán\nĐề nghị thanh toán phải kèm hóa đơn, chứng từ hợp lệ theo quy định; đề xuất mua sắm từ 20.000.000 đồng phải có tối thiểu 03 báo giá.\n\n(Nội dung mẫu phục vụ chạy thử phần mềm.)');
    doc('quyche', 'Nội quy lao động', '02/2026/NQ-SO', `${y}-01-05`, 'Công ty Cổ phần SmartOffice', 'Thời giờ làm việc, kỷ luật lao động, an toàn vệ sinh lao động.',
      'Thời giờ làm việc: từ thứ Hai đến thứ Sáu, sáng 08:00–12:00, chiều 13:00–17:00.\nNhân sự chấm công vào, ra ca hằng ngày trên phần mềm SmartOffice; trường hợp quên chấm công gửi giải trình trong vòng 03 ngày làm việc.\n\n(Nội dung mẫu phục vụ chạy thử phần mềm.)');
    doc('huongdan', 'Hướng dẫn gửi đề xuất trên SmartOffice', '', null, 'Phòng Hành chính – Nhân sự', 'Các bước tạo, theo dõi và thu hồi đề xuất.',
      'Bước 1. Vào mục Phê duyệt, bấm “+ Tạo đề xuất”.\nBước 2. Chọn loại đề xuất, nhập trích yếu, số tiền hoặc thời gian, lý do và căn cứ.\nBước 3. Kiểm tra luồng duyệt dự kiến hiển thị phía dưới, bấm “Gửi đề xuất”.\nBước 4. Theo dõi tiến độ tại thẻ “Tôi đã gửi”. Đề xuất chưa được duyệt bước nào có thể thu hồi để sửa lại.');
    doc('bieumau', 'Mẫu biên bản bàn giao tài sản', 'BM-HC-05', null, 'Phòng Hành chính – Nhân sự', 'Dùng khi cấp phát, thu hồi tài sản, thiết bị làm việc.', 'Biên bản gồm: thông tin bên giao, bên nhận; danh mục tài sản (mã, tên, số sê-ri, tình trạng); chữ ký các bên.');
    doc('vbden', 'Công văn đề nghị báo cáo tình hình kinh doanh năm', '1520/SCT-QLTM', d(-3), 'Sở Công Thương', 'Đề nghị doanh nghiệp báo cáo tình hình sản xuất, kinh doanh năm trước ngày 20 của tháng.', 'Văn bản đến đã vào sổ, đang xử lý theo quy trình QT-xử lý văn bản đến.', 'kd');

    /* Khách hàng */
    const cus = (code, name, kind, tax, contact, phone, email, addr, source, owner, status) => Number(run(`INSERT INTO customers(code,name,kind,tax_code,contact_name,phone,email,address,source,owner_id,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      code, name, kind, tax, contact, phone, email, addr, source, owner, status, ts(-40, '09:00'), ts(-1, '09:00')).lastInsertRowid);
    const C1 = cus(`KH-${y}-0001`, 'Công ty TNHH Xây dựng Tràng An', 'doanhnghiep', '2700123456', 'Anh Hoàng Văn Nam', '0229 3888 111', 'lienhe@xdtrangan.vn', 'TP. Ninh Bình', 'Giới thiệu', id.anh, 'chamsoc');
    const C2 = cus(`KH-${y}-0002`, 'Công ty CP Du lịch Hoa Lư', 'doanhnghiep', '2700234567', 'Chị Đinh Thị Lan', '0229 3777 222', 'info@dulichhoalu.vn', 'Hoa Lư, Ninh Bình', 'Website', id.huy, 'khachhang');
    const C3 = cus(`KH-${y}-0003`, 'Trường THPT Lương Văn Tụy', 'doanhnghiep', '', 'Thầy Phạm Minh Đức', '0229 3666 333', '', 'TP. Ninh Bình', 'Hội chợ', id.anh, 'tiemnang');
    const C4 = cus(`KH-${y}-0004`, 'Công ty TNHH Thương mại Bình Minh', 'doanhnghiep', '0109876543', 'Anh Trần Quốc Bảo', '024 3555 444', 'mua@binhminh.com.vn', 'Hà Nội', 'Gọi điện', id.huy, 'chamsoc');
    const C5 = cus(`KH-${y}-0005`, 'Ông Nguyễn Hữu Tài', 'canhan', '', '', '0988 123 456', '', 'Tam Điệp, Ninh Bình', 'Giới thiệu', id.quan, 'khachhang');
    const deal = (c, t, v, s, o, ec, closed) => run('INSERT INTO deals(customer_id,title,value,stage,owner_id,expected_close,created_at,closed_at) VALUES(?,?,?,?,?,?,?,?)', c, t, v, s, o, ec, ts(-30, '09:00'), closed || null);
    deal(C1, 'Cung cấp phần mềm quản lý công trình', 480000000, 'baogia', id.anh, d(20));
    deal(C1, 'Bảo trì hệ thống năm 2027', 96000000, 'tiepcan', id.anh, d(45));
    deal(C2, 'Trang bị hệ thống đặt phòng trực tuyến', 350000000, 'thang', id.huy, d(-10), ts(-10, '16:00'));
    deal(C2, 'Mở rộng chi nhánh Tam Cốc', 180000000, 'damphan', id.huy, d(12));
    deal(C3, 'Phòng máy tính thực hành 40 máy', 620000000, 'moi', id.anh, d(60));
    deal(C4, 'Cung cấp thiết bị mạng', 145000000, 'thua', id.huy, d(-15), ts(-15, '11:00'));
    deal(C5, 'Lắp đặt camera an ninh', 38000000, 'thang', id.quan, d(-5), ts(-5, '10:00'));
    const act = (c, u, k, content, at, due) => run('INSERT INTO crm_activities(customer_id,user_id,kind,content,due_at,done,created_at) VALUES(?,?,?,?,?,?,?)', c, u, k, content, due || null, due ? 0 : 1, at);
    act(C1, id.anh, 'gapmat', 'Khảo sát hiện trạng, khách hàng quan tâm phân hệ quản lý vật tư.', ts(-12, '10:00'));
    act(C1, id.anh, 'baogia', 'Gửi báo giá lần 1, giá trị 480 triệu đồng, hiệu lực 30 ngày.', ts(-4, '15:00'));
    act(C1, id.anh, 'lichhen', 'Trình bày giải pháp với Ban Giám đốc khách hàng.', ts(-1, '09:00'), `${d(2)} 09:30`);
    act(C2, id.huy, 'goidien', 'Khách hàng đề nghị bổ sung điều khoản bảo hành 24 tháng.', ts(-3, '14:00'));
    act(C4, id.huy, 'lichhen', 'Gọi lại tìm hiểu nhu cầu năm 2027.', ts(-1, '11:00'), `${d(5)} 14:00`);

    /* Thu chi, ngân sách */
    const bud = (deptN, cat, amt) => run('INSERT OR IGNORE INTO budgets(year,dept_id,category,amount) VALUES(?,?,?,?)', Number(y), dep(deptN), cat, amt);
    bud('kd', 'tiepkhach', 120000000); bud('kd', 'congtac', 150000000); bud('kd', 'marketing', 300000000);
    bud('hcns', 'vanphong', 60000000); bud('hcns', 'muasam', 250000000); bud('hcns', 'dichvu', 180000000); bud('kt', 'muasam', 200000000);
    let pt = 0, pc = 0;
    const fin = (kind, day, amt, cat, deptN, partner, desc, method = 'chuyenkhoan', reqId = null, cusId = null) =>
      run(`INSERT INTO fin_tx(code,kind,tx_date,amount,category,dept_id,partner,description,method,request_id,customer_id,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        `${kind === 'thu' ? 'PT' : 'PC'}-${y}-${String(kind === 'thu' ? ++pt : ++pc).padStart(4, '0')}`, kind, d(day), amt, cat, deptN ? dep(deptN) : null, partner, desc, method, reqId, cusId, id.huong, now());
    fin('thu', -40, 1200000000, 'banhang', 'kd', 'Công ty CP Du lịch Hoa Lư', 'Thu đợt 1 hợp đồng hệ thống đặt phòng', 'chuyenkhoan', null, C2);
    fin('thu', -25, 850000000, 'congno', 'kd', 'Công ty TNHH Thương mại Bình Minh', 'Thu hồi công nợ hợp đồng năm trước', 'chuyenkhoan', null, C4);
    fin('thu', -9, 175000000, 'banhang', 'kd', 'Công ty CP Du lịch Hoa Lư', 'Thu đợt 2 hợp đồng hệ thống đặt phòng', 'chuyenkhoan', null, C2);
    fin('thu', -4, 38000000, 'banhang', 'kd', 'Ông Nguyễn Hữu Tài', 'Thu tiền lắp đặt camera an ninh', 'tienmat', null, C5);
    fin('chi', -35, 184786022, 'luong', null, 'Cán bộ, nhân viên', 'Chi lương tháng trước');
    fin('chi', -28, 12500000, 'vanphong', 'hcns', 'Cửa hàng VPP Minh Châu', 'Mua văn phòng phẩm quý IV', 'tienmat');
    fin('chi', -20, 8600000, 'dichvu', 'hcns', 'Điện lực Ninh Bình', 'Tiền điện tháng 10');
    fin('chi', -15, 45000000, 'marketing', 'kd', 'Công ty Quảng cáo Sao Việt', 'Quảng cáo trực tuyến tháng 10');
    const r4 = get(`SELECT id FROM requests WHERE code=?`, `ĐX-${y}-0138`);
    if (r4) fin('chi', -4, 8000000, 'tamung', 'kd', 'Lê Minh Quân', 'Tạm ứng công tác phí Hà Nội', 'chuyenkhoan', r4.id);
    D.setSetting('fin_opening', '0');
    D.setSetting('extras_v3', '1');

    /* Tài sản */
    const asset = (code, name, cat, serial, pdDay, value, holderN, loc, wuDays) => {
      const h = holderN ? U(holderN) : null;
      const a = Number(run(`INSERT INTO assets(code,name,category,serial,purchase_date,value,status,holder_id,dept_id,location,warranty_until,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
        code, name, cat, serial, d(pdDay), value, h ? 'dangdung' : 'kho', h ? h.id : null, h ? h.dept_id : null, loc, wuDays != null ? d(wuDays) : null, now()).lastInsertRowid);
      run(`INSERT INTO asset_logs(asset_id,action,user_id,note,created_at) VALUES(?, 'nhap', ?, 'Ghi tăng tài sản', ?)`, a, id.trang, ts(pdDay, '08:00'));
      if (h) run(`INSERT INTO asset_logs(asset_id,action,user_id,holder_id,note,created_at) VALUES(?, 'capphat', ?, ?, 'Cấp phát phục vụ công việc', ?)`, a, id.trang, h.id, ts(pdDay + 1, '09:00'));
    };
    asset('TS-0001', 'Máy tính xách tay Dell Latitude 5440', 'maytinh', 'DL5440-8812', -400, 24500000, 'quan.lm', 'Phòng Kinh doanh', 330);
    asset('TS-0002', 'Máy tính xách tay Dell Latitude 5440', 'maytinh', 'DL5440-8813', -400, 24500000, 'huy.dq', 'Phòng Kinh doanh', 330);
    asset('TS-0003', 'Máy tính để bàn HP ProDesk 400', 'maytinh', 'HP400-2231', -700, 16800000, 'mai.bt', 'Phòng HC–NS', 30);
    asset('TS-0004', 'Máy tính xách tay ThinkPad T14', 'maytinh', 'T14-55102', -200, 29900000, 'long.hd', 'Phòng Kỹ thuật', 530);
    asset('TS-0005', 'Máy in đa năng Canon MF445dw', 'thietbi', 'CN445-7781', -900, 11200000, null, 'Kho tầng 1', -170);
    asset('TS-0006', 'Máy chiếu Epson EB-X51', 'thietbi', 'EPX51-0091', -500, 13500000, null, 'Phòng họp lớn', 230);
    asset('TS-0007', 'Bộ bàn ghế phòng họp 20 chỗ', 'noithat', '', -1500, 42000000, null, 'Phòng họp lớn', null);
    asset('TS-0008', 'Xe ô tô Toyota Innova 8 chỗ', 'phuongtien', '35A-123.45', -1100, 820000000, 'thanh.nv', 'Nhà xe', 0);
  });
}

module.exports = { register, seedBiz };
