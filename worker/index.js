/**
 * SmartOffice trên Cloudflare Workers.
 *  - Giao diện (thư mục public/) do Workers Static Assets phục vụ trực tiếp, kèm PWA.
 *  - /api/* và /healthz chuyển vào Durable Object "SmartOffice" (SQLite riêng, nhất quán, sao lưu theo thời điểm 30 ngày).
 */
import { DurableObject } from 'cloudflare:workers';
import core from './do-core.js';

export class SmartOffice extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.app = null;
  }
  async fetch(request) {
    if (!this.app) this.app = core.createApp(this.ctx.storage, this.env);
    return core.handleRequest(this.app, request);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/') || url.pathname === '/healthz') {
      const stub = env.SO.get(env.SO.idFromName('main'));
      return stub.fetch(request);
    }
    return env.ASSETS.fetch(request);
  }
};
