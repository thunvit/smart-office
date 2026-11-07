/**
 * SmartOffice trên Cloudflare Workers.
 *  - Giao diện (thư mục public/) do Workers Static Assets phục vụ trực tiếp, kèm PWA.
 *  - /api/* và /healthz chuyển vào Durable Object "SmartOffice" (SQLite riêng, nhất quán, sao lưu theo thời điểm 30 ngày).
 */
import { DurableObject } from 'cloudflare:workers';
import core from './do-core.js';
import ai from '../ai.js';

export class SmartOffice extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.app = null;
  }
  async fetch(request) {
    // Gọi ở MỌI yêu cầu để gắn storage của chính đối tượng này (ứng dụng chỉ khởi tạo một lần mỗi isolate).
    const app = core.createApp(this.ctx.storage, this.env, this.ctx);
    return core.handleRequest(app, request);
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/') || url.pathname === '/healthz') {
      const stub = env.SO.get(env.SO.idFromName('main'));
      // Trợ lý AI (ADR-010): chạy tại Worker không trạng thái, giữ khóa AI_API_KEY ngoài Durable Object;
      // dữ liệu lấy qua stub bằng cookie của người dùng nên đi qua đúng kiểm tra phân quyền.
      if (url.pathname === '/api/ai/chat' && request.method === 'POST') return ai.workerChat(request, env, stub, ctx);
      if (url.pathname === '/api/ai/test' && request.method === 'POST') return ai.workerTest(request, env, stub);
      return stub.fetch(request);
    }
    return env.ASSETS.fetch(request);
  }
};
