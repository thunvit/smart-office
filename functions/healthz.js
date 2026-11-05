// Kiểm tra sức khỏe: chuyển sang Worker để xác nhận cả cơ sở dữ liệu đang hoạt động.
export async function onRequest({ request, env }) {
  if (!env.SO_WORKER) return new Response('missing binding', { status: 503 });
  return env.SO_WORKER.fetch(request);
}
