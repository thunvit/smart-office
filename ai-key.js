'use strict';
/**
 * Bảo vệ khóa API AI cá nhân (ADR-010, sửa đổi 07/11/2026).
 *  - Khóa lưu trong CSDL dưới dạng mã hóa AES-256-GCM; bản sao lưu dữ liệu chỉ chứa bản mã.
 *  - Bí mật mã hóa AI_KEY_SECRET:
 *      Cloudflare: bắt buộc khai báo là Secret của Worker (không ghi trong kho mã);
 *      Node: lấy từ biến môi trường, nếu không có thì tự sinh và lưu tại <DATA_DIR>/ai-key.secret (ngoài CSDL, ngoài thư mục tệp).
 *  - Mã nội bộ (internalToken) để cổng AI tại Worker chứng minh với Durable Object rằng yêu cầu lấy khóa đến từ máy chủ,
 *    không phải từ trình duyệt. Trình duyệt không bao giờ nhận lại khóa.
 */
const crypto = require('crypto');
let CACHED = null;
function getSecret() {
  if (process.env.AI_KEY_SECRET) return process.env.AI_KEY_SECRET;
  if (globalThis.__SO_WORKER) return ''; // Cloudflare: phải khai báo Secret AI_KEY_SECRET
  if (CACHED) return CACHED;
  const fs = require('fs'), path = require('path'), D = require('./db');
  const f = path.join(path.dirname(D.DB_FILE), 'ai-key.secret');
  if (!fs.existsSync(f)) fs.writeFileSync(f, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
  return (CACHED = fs.readFileSync(f, 'utf8').trim());
}
const keyFrom = secret => crypto.createHash('sha256').update('so-ai-key:' + secret).digest();
function encrypt(plain, secret = getSecret()) {
  if (!secret) throw new Error('NO_SECRET');
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', keyFrom(secret), iv);
  const enc = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return 'v1:' + iv.toString('base64') + ':' + c.getAuthTag().toString('base64') + ':' + enc.toString('base64');
}
function decrypt(blob, secret = getSecret()) {
  if (!blob || !secret) return '';
  try {
    const [v, iv, tag, enc] = String(blob).split(':'); if (v !== 'v1') return '';
    const d = crypto.createDecipheriv('aes-256-gcm', keyFrom(secret), Buffer.from(iv, 'base64'));
    d.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([d.update(Buffer.from(enc, 'base64')), d.final()]).toString('utf8');
  } catch (e) { return ''; } // sai bí mật hoặc dữ liệu hỏng: coi như chưa có khóa
}
const internalToken = (secret = getSecret()) => secret ? crypto.createHash('sha256').update('so-ai-internal:' + secret).digest('hex') : '';
function safeEqual(a, b) { const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || '')); return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y); }
const hint = k => { const s = String(k || ''); return s.length > 8 ? '••••' + s.slice(-4) : '••••'; };

module.exports = { getSecret, encrypt, decrypt, internalToken, safeEqual, hint };
