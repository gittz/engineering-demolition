// Cloudflare Worker 入口：/api/* 由这里处理，其它请求交给静态资源（public/）。
import { analyze, aiInfo, checkAccess, promptPayload } from '../server/ai.js';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

async function handleAnalyze(request, env, ctx) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    checkAccess(request.headers.get('x-access-code'), env);
  } catch (e) {
    return json({ error: e.message }, e.status || 401);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: '请求格式错误' }, 400);
  }

  // AI 生成通常要 30–120 秒。先立即返回一个流式响应，每 10 秒写一个空格保活，
  // 避免 Cloudflare 因长时间无数据而断开（524）；结果出来后写入完整 JSON。
  // 前导空格不影响 JSON.parse。出错时以 {"error": "..."} 返回。
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const enc = new TextEncoder();
  writer.write(enc.encode(' '));
  const keepAlive = setInterval(() => { writer.write(enc.encode(' ')).catch(() => {}); }, 10000);

  ctx.waitUntil((async () => {
    let out;
    try {
      out = await analyze(body, env);
    } catch (e) {
      console.error('[analyze]', e.message);
      out = { error: e.message || '服务器错误', status: e.status || 500 };
    } finally {
      clearInterval(keepAlive);
    }
    try {
      await writer.write(enc.encode(JSON.stringify(out)));
      await writer.close();
    } catch { /* 客户端已断开 */ }
  })());

  return new Response(readable, {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/config') return json(aiInfo(env));
    if (pathname === '/api/prompt') return json(promptPayload());
    if (pathname === '/api/analyze') return handleAnalyze(request, env, ctx);
    if (pathname.startsWith('/api/')) return json({ error: 'Not found' }, 404);
    return env.ASSETS.fetch(request);
  },
};
