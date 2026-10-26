// 本地运行（零依赖，Node 18+）：node server.js  然后打开 http://localhost:5173
// 线上部署用 Cloudflare Workers（worker/index.js），两者共用 server/ai.js。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';
import { analyze, aiInfo, checkAccess, httpError } from './server/ai.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');

// 读取 .env（也兼容 wrangler 的 .dev.vars）
for (const name of ['.env', '.dev.vars']) {
  const file = path.join(__dirname, name);
  if (!fs.existsSync(file)) continue;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 0) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (!(key in process.env)) process.env[key] = val;
  }
}

const env = process.env;
const PORT = Number(env.PORT || 5173);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function readBody(req, limit = 20 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(httpError(413, '图片太大（上限 20MB）')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.normalize(path.join(PUBLIC_DIR, urlPath === '/' ? 'index.html' : urlPath));
  if (!file.startsWith(PUBLIC_DIR)) return send(res, 403, 'Forbidden', 'text/plain');
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'Not found', 'text/plain');
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, 'http://x');
    if (pathname === '/api/config' && req.method === 'GET') return send(res, 200, aiInfo(env));
    if (pathname === '/api/analyze' && req.method === 'POST') {
      checkAccess(req.headers['x-access-code'], env);
      const body = JSON.parse((await readBody(req)) || '{}');
      const t0 = Date.now();
      console.log(`[analyze] 开始 · ${aiInfo(env).provider} · ${aiInfo(env).model}`);
      const result = await analyze(body, env);
      console.log(`[analyze] 完成 · ${result.object?.name} · ${result.parts.length} 个零件 · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
      return send(res, 200, result);
    }
    if (req.method === 'GET') return serveStatic(req, res);
    send(res, 405, { error: 'Method not allowed' });
  } catch (e) {
    console.error('[error]', e.message);
    send(res, e.status || 500, { error: e.message || '服务器错误' });
  }
});

server.requestTimeout = 0;
server.listen(PORT, () => {
  const info = aiInfo(env);
  console.log('\n  工程拆解 · Teardown Studio');
  console.log(`  打开浏览器访问  http://localhost:${PORT}`);
  console.log(info.aiEnabled
    ? `  AI：${info.provider} · ${info.model}${info.needsCode ? ' · 已启用访问码' : ''}`
    : '  AI：未配置密钥 —— 可浏览内置示例；复制 .env.example 为 .env 并填入密钥后即可上传照片拆解');
  console.log('');
  if (env.OPEN_BROWSER === '1') {
    const url = `http://localhost:${PORT}`;
    const cmd = process.platform === 'win32' ? `start "" ${url}` : process.platform === 'darwin' ? `open ${url}` : `xdg-open ${url}`;
    exec(cmd, () => {});
  }
});
