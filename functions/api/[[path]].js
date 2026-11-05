/**
 * Cloudflare Pages Functions: chuyển mọi yêu cầu /api/* sang Worker "smart-office"
 * qua service binding SO_WORKER (khai báo trong Pages > Settings > Bindings).
 * Giao diện và PWA (thư mục public/) do Pages phục vụ trực tiếp.
 */
export async function onRequest({ request, env }) {
  if (!env.SO_WORKER) {
    return new Response(JSON.stringify({ error: 'Chưa cấu hình liên kết SO_WORKER tới Worker smart-office.' }), {
      status: 503, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
    });
  }
  return env.SO_WORKER.fetch(request);
}
