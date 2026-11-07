'use strict';
/**
 * Lõi Durable Object của SmartOffice: khởi tạo ứng dụng trên SQLite của Durable Object và
 * chuyển yêu cầu fetch (Request) thành dạng req/res mà server.js đang dùng.
 * Tách khỏi worker/index.js để kiểm thử được bằng Node.js.
 *
 * Lưu ý: mô-đun nghiệp vụ giữ kết nối CSDL ở biến toàn cục của mô-đun, vì vậy hiện mỗi
 * isolate chỉ phục vụ MỘT Durable Object ("main"). Giai đoạn đa đơn vị sẽ tách theo thiết kế riêng.
 */
const { makeSql } = require('./sqlite-shim.js');

let APP = null;
let CURRENT_STORAGE = null; // storage của Durable Object đang phục vụ; cập nhật ở mỗi yêu cầu
let CURRENT_CTX = null; // ctx của Durable Object đang phục vụ (PITR: bookmark, abort); cập nhật ở mỗi yêu cầu, không giữ cố định
function createApp(storage, env = {}, ctx = null) {
  CURRENT_STORAGE = storage; CURRENT_CTX = ctx;
  globalThis.__SO_CTX = () => CURRENT_CTX;
  if (APP) return APP;
  process.env.TRUST_PROXY = '1';
  process.env.NO_DEMO = env.SO_DEMO === '1' ? '' : '1';
  if (env.PUBLIC_ORIGINS) process.env.PUBLIC_ORIGINS = env.PUBLIC_ORIGINS;
  process.env.SO_DEBUG = env.SO_DEBUG || '';
  if (env.ADMIN_PASSWORD) process.env.ADMIN_PASSWORD = env.ADMIN_PASSWORD;
  if (env.AI_KEY_SECRET) process.env.AI_KEY_SECRET = env.AI_KEY_SECRET; // mã hóa khóa API AI cá nhân (ai-key.js)
  process.env.SO_AI_ORG_KEY = env.AI_API_KEY ? '1' : ''; // chỉ báo có khóa chung, không đưa khóa vào Durable Object
  globalThis.__SO_WORKER = true;
  globalThis.__SO_SQL = makeSql(() => CURRENT_STORAGE);
  APP = require('../server.js');
  APP.applyAdminSecret();
  return APP;
}

class ResShim {
  constructor() { this.statusCode = 200; this.headers = new Map(); this.chunks = []; this.headersSent = false; this.finished = false; }
  setHeader(k, v) { this.headers.set(k.toLowerCase(), v); }
  getHeader(k) { return this.headers.get(k.toLowerCase()); }
  removeHeader(k) { this.headers.delete(k.toLowerCase()); }
  writeHead(status, h) { this.statusCode = status; if (h) for (const [k, v] of Object.entries(h)) this.setHeader(k, v); this.headersSent = true; return this; }
  write(c) { if (c != null) this.chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(String(c))); this.headersSent = true; return true; }
  end(c) { this.write(c); this.finished = true; }
  toResponse() {
    const h = new Headers();
    for (const [k, v] of this.headers) {
      if (Array.isArray(v)) v.forEach(x => h.append(k, String(x)));
      else if (k !== 'content-length') h.set(k, String(v));
    }
    const noBody = this.statusCode === 204 || this.statusCode === 304;
    return new Response(noBody ? null : Buffer.concat(this.chunks), { status: this.statusCode, headers: h });
  }
}

async function handleRequest(app, request) {
  const url = new URL(request.url);
  const headers = {};
  request.headers.forEach((v, k) => { headers[k] = v; });
  headers['x-forwarded-proto'] = url.protocol.replace(':', '');
  if (!headers.host) headers.host = url.host; // yêu cầu nội bộ từ cổng AI (worker/index.js) có thể không mang Host
  const hasBody = !['GET', 'HEAD'].includes(request.method);
  const req = {
    method: request.method,
    url: url.pathname + url.search,
    headers,
    socket: { remoteAddress: headers['cf-connecting-ip'] || '', encrypted: url.protocol === 'https:' },
    rawBody: hasBody ? Buffer.from(await request.arrayBuffer()) : null,
    on() {}, destroy() {}
  };
  const res = new ResShim();
  await app.handle(req, res);
  return res.toResponse();
}

module.exports = { createApp, handleRequest, ResShim };
