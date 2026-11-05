'use strict';
/**
 * Lớp tương thích: cung cấp giao diện giống node:sqlite (exec, prepare().all/get/run) trên nền
 * SQLite của Cloudflare Durable Object (ctx.storage.sql), để mã nghiệp vụ dùng chung cho cả hai môi trường.
 * Khác biệt cần xử lý:
 *  - sql.exec() không chạy BEGIN/COMMIT/SAVEPOINT  -> giao dịch dùng storage.transactionSync().
 *  - Một số PRAGMA cấu hình tệp (journal_mode, busy_timeout) không áp dụng -> bỏ qua.
 *  - VACUUM INTO không áp dụng -> báo lỗi rõ ràng.
 *  - BLOB trả về dạng ArrayBuffer -> chuyển thành Uint8Array như node:sqlite.
 */
const SKIP = /^\s*PRAGMA\s+(journal_mode|busy_timeout|synchronous|foreign_keys)\b/i;
const TXN = /^\s*(BEGIN|COMMIT|END|ROLLBACK|SAVEPOINT|RELEASE)\b/i;

function normParam(v) {
  if (v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'bigint') return Number(v);
  if (v instanceof Uint8Array) return v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength);
  return v;
}
function normRow(row) {
  for (const k in row) if (row[k] instanceof ArrayBuffer) row[k] = new Uint8Array(row[k]);
  return row;
}

function makeSql(storage) {
  const sql = storage.sql;
  const execOne = (q, params) => sql.exec(q, ...params.map(normParam));
  return {
    exec(text) {
      const src = String(text).trim();
      if (/^\s*VACUUM\b/i.test(src)) throw new Error('VACUUM không được hỗ trợ trên Cloudflare Durable Objects.');
      // Bỏ các PRAGMA cấu hình tệp, giữ nguyên phần còn lại (cho phép nhiều câu lệnh).
      const parts = src.split(/;\s*(?=PRAGMA\b)/i);
      const kept = parts.filter(p => !SKIP.test(p)).join(';\n').trim();
      if (!kept) return;
      if (TXN.test(kept)) throw new Error('Dùng tx() thay cho BEGIN/COMMIT trên Cloudflare.');
      sql.exec(kept);
    },
    prepare(q) {
      return {
        all: (...p) => execOne(q, p).toArray().map(normRow),
        get: (...p) => { const rows = execOne(q, p).toArray(); return rows.length ? normRow(rows[0]) : undefined; },
        run: (...p) => {
          const c = execOne(q, p);
          c.toArray();
          const id = sql.exec('SELECT last_insert_rowid() AS id').one().id;
          return { changes: c.rowsWritten, lastInsertRowid: id };
        }
      };
    },
    transactionSync: fn => storage.transactionSync(fn)
  };
}

module.exports = { makeSql };
