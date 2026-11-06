'use strict';
/**
 * Kho tệp đính kèm dùng chung (Tài liệu, Công việc).
 * - Node.js: lưu trên đĩa tại <DATA_DIR>/files.
 * - Cloudflare: lưu trong SQLite của Durable Object, chia khối 1 MB (giới hạn 2 MB/dòng, CLAUDE.md mục 3.3).
 */
const path = require('path');
const crypto = require('crypto');
const D = require('./db');
const { db, all, run, tx } = D;

db.exec('CREATE TABLE IF NOT EXISTS file_chunks (stored_name TEXT NOT NULL, seq INTEGER NOT NULL, data BLOB NOT NULL, PRIMARY KEY(stored_name, seq))');
const CHUNK = 1024 * 1024;
const FILES = D.IS_WORKER ? {
  put(name, buf) { tx(() => { for (let i = 0, k = 0; i < buf.length; i += CHUNK, k++) run('INSERT INTO file_chunks(stored_name,seq,data) VALUES(?,?,?)', name, k, buf.subarray(i, i + CHUNK)); }); },
  read(name) { const rows = all('SELECT data FROM file_chunks WHERE stored_name=? ORDER BY seq', name); return rows.length ? Buffer.concat(rows.map(r => Buffer.from(r.data))) : null; },
  del(name) { run('DELETE FROM file_chunks WHERE stored_name=?', name); }
} : (() => {
  const fs = require('fs');
  const FILE_DIR = path.join(path.dirname(D.DB_FILE), 'files');
  fs.mkdirSync(FILE_DIR, { recursive: true });
  return {
    put(name, buf) { fs.writeFileSync(path.join(FILE_DIR, name), buf); },
    read(name) { const f = path.join(FILE_DIR, name); return fs.existsSync(f) ? fs.readFileSync(f) : null; },
    del(name) { fs.unlink(path.join(FILE_DIR, name), () => {}); }
  };
})();

/* Loại tệp chương trình bị chặn (ATTT: không cho tải lên tệp thực thi). */
const BLOCKED = /\.(exe|bat|cmd|com|msi|scr|ps1|vbs|js|jar|sh|dll|hta|lnk)$/i;

/**
 * Kiểm tra và lưu tệp gửi lên dạng base64 trong JSON { file_name, file_data, file_mime }.
 * Trả về null nếu không có tệp. `bad` là hàm báo lỗi 400 của máy chủ.
 */
function saveUpload(b, bad, maxBytes = 20 * 1024 * 1024) {
  if (!b || !b.file_data) return null;
  const buf = Buffer.from(String(b.file_data), 'base64');
  if (!buf.length) bad('Tệp đính kèm rỗng.');
  if (buf.length > maxBytes) bad(`Tệp đính kèm tối đa ${Math.round(maxBytes / 1048576)} MB.`);
  const name = String(b.file_name || '').trim().slice(0, 200) || 'tep-dinh-kem';
  if (BLOCKED.test(name)) bad('Không cho phép tải lên tệp chương trình (.exe, .bat, …).');
  const stored = crypto.randomBytes(16).toString('hex') + path.extname(name).toLowerCase().replace(/[^.\w]/g, '');
  FILES.put(stored, buf);
  return { name, stored, size: buf.length, mime: String(b.file_mime || '').slice(0, 120) || 'application/octet-stream' };
}

/* Gửi tệp về trình duyệt dưới dạng tải xuống (không hiển thị trực tiếp, chống XSS qua tệp). */
function sendFile(res, buf, fileName, mime) {
  const ascii = fileName.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^\w.\- ]/g, '_');
  res.writeHead(200, { 'Content-Type': mime || 'application/octet-stream', 'Content-Length': buf.length, 'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}` });
  res.end(buf);
}

module.exports = { FILES, saveUpload, sendFile, BLOCKED };
