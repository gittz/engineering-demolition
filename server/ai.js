// AI 拆解核心逻辑：Node 本地服务器（server.js）与 Cloudflare Worker（worker/index.js）共用。
// 只依赖标准 fetch，env 为环境变量对象（Node 传 process.env，Worker 传 env）。
import { SYSTEM_PROMPT, TEARDOWN_SCHEMA, buildUserText } from './prompt.js';

export function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

function config(env) {
  const provider = (env.AI_PROVIDER || (env.OPENAI_API_KEY && !env.ANTHROPIC_API_KEY ? 'openai' : 'anthropic')).toLowerCase();
  return {
    provider,
    maxTokens: Number(env.MAX_OUTPUT_TOKENS || 16000),
    anthropic: {
      key: env.ANTHROPIC_API_KEY || '',
      base: (env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/$/, ''),
      model: env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
    },
    openai: {
      key: env.OPENAI_API_KEY || '',
      base: (env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''),
      model: env.OPENAI_MODEL || 'gpt-4o',
      jsonMode: String(env.OPENAI_JSON_MODE || 'true') !== 'false',
    },
  };
}

export function aiInfo(env) {
  const c = config(env);
  const p = c[c.provider] || c.anthropic;
  return { aiEnabled: Boolean(p.key), provider: c.provider, model: p.model, needsCode: Boolean(env.ACCESS_CODE) };
}

// 设置了 ACCESS_CODE 时，必须携带正确的访问码才能调用 AI（防止公开站点被刷光额度）
export function checkAccess(code, env) {
  if (!env.ACCESS_CODE) return;
  if (String(code || '') !== String(env.ACCESS_CODE)) throw httpError(401, '访问码不正确');
}

function parseDataUrl(dataUrl) {
  const m = /^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,(.+)$/i.exec(dataUrl || '');
  if (!m) throw httpError(400, '图片格式不支持，请上传 JPG / PNG / WebP');
  return { mediaType: m[1].toLowerCase().replace('jpg', 'jpeg'), data: m[2] };
}

function extractJson(text) {
  if (!text) throw new Error('AI 没有返回内容');
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('AI 返回的不是 JSON');
  return JSON.parse(t.slice(a, b + 1));
}

async function callAnthropic(c, img, hint) {
  const a = c.anthropic;
  const res = await fetch(`${a.base}/v1/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': a.key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: a.model,
      max_tokens: c.maxTokens,
      system: SYSTEM_PROMPT,
      tools: [{ name: 'submit_teardown', description: '提交物体识别结果与完整的 3D 拆解零件清单', input_schema: TEARDOWN_SCHEMA }],
      tool_choice: { type: 'tool', name: 'submit_teardown' },
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.data } },
          { type: 'text', text: buildUserText(hint) },
        ],
      }],
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw httpError(502, `AI 接口错误 (${res.status})：${json?.error?.message || res.statusText}`);
  const block = (json.content || []).find((b) => b.type === 'tool_use');
  if (block?.input) return block.input;
  return extractJson((json.content || []).filter((b) => b.type === 'text').map((b) => b.text).join(''));
}

async function callOpenAI(c, hint, dataUrl) {
  const o = c.openai;
  const body = {
    model: o.model,
    max_tokens: c.maxTokens,
    messages: [
      {
        role: 'system',
        content: `${SYSTEM_PROMPT.replace('只通过 submit_teardown 输出结果，不要输出其它内容。', '')}\n\n只输出一个 JSON 对象，不要任何解释或代码块标记。JSON 必须符合以下 JSON Schema：\n${JSON.stringify(TEARDOWN_SCHEMA)}`,
      },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: dataUrl } },
          { type: 'text', text: buildUserText(hint) },
        ],
      },
    ],
  };
  if (o.jsonMode) body.response_format = { type: 'json_object' };
  const res = await fetch(`${o.base}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${o.key}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw httpError(502, `AI 接口错误 (${res.status})：${json?.error?.message || res.statusText}`);
  return extractJson(json.choices?.[0]?.message?.content);
}

export async function analyze(body, env) {
  const c = config(env);
  const info = aiInfo(env);
  if (!info.aiEnabled) throw httpError(400, '服务器未配置 AI 接口密钥（见 README）');
  const image = body?.image;
  const img = parseDataUrl(image);
  if (img.data.length > 14 * 1024 * 1024) throw httpError(413, '图片太大');
  const started = Date.now();
  const result = c.provider === 'openai' ? await callOpenAI(c, body.hint, image) : await callAnthropic(c, img, body.hint);
  if (!result || !Array.isArray(result.parts) || !result.parts.length) {
    throw httpError(502, 'AI 没有给出零件清单，请换一张更清晰的照片重试');
  }
  result.meta = { provider: c.provider, model: info.model, ms: Date.now() - started, createdAt: new Date().toISOString() };
  return result;
}
