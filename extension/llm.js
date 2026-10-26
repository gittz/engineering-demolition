// 直接调用用户配置的大模型（流式输出，便于显示进度、避免长时间无响应）
// 支持三种接口格式：
//  - openai：OpenAI 兼容的 Chat Completions（/chat/completions）—— DeepSeek / 通义千问 / 智谱 / 豆包 / OpenAI 等
//  - responses：OpenAI Responses 接口（/responses）—— OpenAI 新接口及部分企业网关（如 Codex 配置里 wire_api = "responses"）
//  - anthropic：Anthropic Messages 接口（/v1/messages）

export const PRESETS = {
  deepseek: { label: 'DeepSeek 视觉', provider: 'openai', baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash-vision-exp', jsonMode: true, maxTokens: 64000 },
  qwen: { label: '通义千问 VL', provider: 'openai', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-vl-max', jsonMode: false, maxTokens: 8192 },
  glm: { label: '智谱 GLM 视觉', provider: 'openai', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4.5v', jsonMode: false, maxTokens: 16000 },
  doubao: { label: '豆包 视觉（火山方舟）', provider: 'openai', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', model: '', jsonMode: false, maxTokens: 16000 },
  openai: { label: 'OpenAI', provider: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o', jsonMode: true, maxTokens: 16000 },
  responses: { label: 'OpenAI Responses 接口 / 企业网关', provider: 'responses', baseUrl: 'https://api.openai.com/v1', model: '', jsonMode: true, maxTokens: 64000 },
  anthropic: { label: 'Anthropic Claude', provider: 'anthropic', baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-5-5', jsonMode: false, maxTokens: 16000 },
  custom: { label: '自定义', provider: 'openai', baseUrl: '', model: '', jsonMode: true, maxTokens: 16000 },
};

export const isConfigured = (cfg) => Boolean(cfg && cfg.apiKey && cfg.baseUrl && cfg.model);

const base = (cfg) => cfg.baseUrl.trim().replace(/\/+$/, '');

function fail(message, code) {
  const e = new Error(message);
  if (code) e.code = code;
  return e;
}

function extractJson(text) {
  if (!text) throw fail('模型没有返回内容');
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a < 0 || b < a) throw fail('模型返回的不是 JSON');
  return JSON.parse(t.slice(a, b + 1));
}

async function request(url, init, cfg) {
  let res;
  try {
    res = await fetch(url, init);
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw fail(`无法连接 ${base(cfg)}：请检查接口地址和网络；如果是自定义地址，请在插件设置页重新保存以授权访问`);
  }
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    const msg = j?.error?.message || j?.message || res.statusText;
    if (res.status === 401 || res.status === 403) throw fail(`密钥无效或没有权限（${res.status}）：${msg}`);
    throw fail(`模型接口错误（${res.status}，模型 ${cfg.model}）：${msg}`);
  }
  return res;
}

async function* readSSE(res) {
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).replace(/\r$/, '');
      buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return;
      try { yield JSON.parse(data); } catch { /* 忽略非 JSON 行 */ }
    }
  }
}

async function openaiStream(cfg, prompt, image, userText, jsonMode, { signal, onProgress }) {
  const body = {
    model: cfg.model,
    max_tokens: Number(cfg.maxTokens) || 16000,
    stream: true,
    messages: [
      { role: 'system', content: prompt.openaiSystem },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: image } },
          { type: 'text', text: userText },
        ],
      },
    ],
  };
  if (jsonMode) body.response_format = { type: 'json_object' };
  const res = await request(`${base(cfg)}/chat/completions`, {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify(body),
  }, cfg);

  let text = '';
  let thinking = 0;
  let finish = null;
  for await (const ev of readSSE(res)) {
    if (ev.error) throw fail(`模型接口错误：${ev.error.message || JSON.stringify(ev.error)}`);
    const ch = ev.choices?.[0];
    if (!ch) continue;
    const d = ch.delta || {};
    if (typeof d.content === 'string') text += d.content;
    if (typeof d.reasoning_content === 'string') thinking += d.reasoning_content.length;
    if (ch.finish_reason) finish = ch.finish_reason;
    onProgress?.(text.length + thinking);
  }
  return { text: text.trim(), finish };
}

async function responsesStream(cfg, prompt, image, userText, jsonMode, { signal, onProgress }) {
  const body = {
    model: cfg.model,
    instructions: prompt.openaiSystem,
    input: [{
      role: 'user',
      content: [
        { type: 'input_image', image_url: image },
        { type: 'input_text', text: userText },
      ],
    }],
    max_output_tokens: Number(cfg.maxTokens) || 16000,
    stream: true,
  };
  if (jsonMode) body.text = { format: { type: 'json_object' } };
  const res = await request(`${base(cfg)}/responses`, {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify(body),
  }, cfg);

  let text = '';
  let thinking = 0;
  let finish = null;
  let final = null;
  for await (const ev of readSSE(res)) {
    switch (ev.type) {
      case 'response.output_text.delta':
        text += ev.delta || '';
        break;
      case 'response.reasoning_text.delta':
      case 'response.reasoning_summary_text.delta':
        thinking += (ev.delta || '').length;
        break;
      case 'response.completed':
        finish = 'stop';
        final = ev.response;
        break;
      case 'response.incomplete':
        finish = ev.response?.incomplete_details?.reason === 'max_output_tokens' ? 'length' : (ev.response?.incomplete_details?.reason || 'incomplete');
        final = ev.response;
        break;
      case 'response.failed':
        throw fail(`模型接口错误：${ev.response?.error?.message || '请求失败'}`);
      case 'error':
        throw fail(`模型接口错误：${ev.message || ev.error?.message || JSON.stringify(ev).slice(0, 200)}`);
      default:
        break;
    }
    onProgress?.(text.length + thinking);
  }
  // 少数网关不推送 delta，只在 completed 里给完整结果
  if (!text && final?.output) {
    text = final.output.flatMap((o) => o.content || []).filter((c) => c.type === 'output_text').map((c) => c.text).join('');
  }
  return { text: text.trim(), finish };
}

async function anthropicStream(cfg, prompt, image, userText, { signal, onProgress }) {
  const m = /^data:(image\/[\w.+-]+);base64,(.+)$/i.exec(image);
  const res = await request(`${base(cfg)}/v1/messages`, {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      'x-api-key': cfg.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: Number(cfg.maxTokens) || 16000,
      stream: true,
      system: prompt.system,
      tools: [{ name: prompt.toolName || 'submit_teardown', description: '提交物体识别结果与完整的 3D 拆解零件清单', input_schema: prompt.schema }],
      tool_choice: { type: 'tool', name: prompt.toolName || 'submit_teardown' },
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: m[1].toLowerCase(), data: m[2] } },
          { type: 'text', text: userText },
        ],
      }],
    }),
  }, cfg);

  let json = '';
  let text = '';
  let stop = null;
  for await (const ev of readSSE(res)) {
    if (ev.type === 'error') throw fail(`模型接口错误：${ev.error?.message || 'unknown'}`);
    if (ev.type === 'content_block_delta') {
      if (ev.delta?.type === 'input_json_delta') json += ev.delta.partial_json || '';
      if (ev.delta?.type === 'text_delta') text += ev.delta.text || '';
      onProgress?.(json.length + text.length);
    }
    if (ev.type === 'message_delta' && ev.delta?.stop_reason) stop = ev.delta.stop_reason;
  }
  return { text: (json || text).trim(), finish: stop === 'max_tokens' ? 'length' : stop };
}

export async function callModel(cfg, prompt, image, hint, opts = {}) {
  if (!/^data:image\/[\w.+-]+;base64,/i.test(image || '')) throw fail('图片格式不正确');
  let userText = prompt.userText;
  if (hint && hint.trim()) userText += `\n${prompt.hintPrefix}${hint.trim().slice(0, 500)}`;
  const t0 = Date.now();

  let r;
  if (cfg.provider === 'anthropic') {
    r = await anthropicStream(cfg, prompt, image, userText, opts);
  } else {
    const run = cfg.provider === 'responses' ? responsesStream : openaiStream;
    r = await run(cfg, prompt, image, userText, cfg.jsonMode, opts);
    // 部分服务的 JSON 模式偶尔返回空内容：关闭 JSON 模式重试一次
    if (!r.text && cfg.jsonMode && r.finish !== 'length') r = await run(cfg, prompt, image, userText, false, opts);
  }
  if (r.finish === 'length') throw fail(`模型输出达到长度上限被截断（当前 ${cfg.maxTokens}），请在插件设置里调大「最大输出」`);
  if (!r.text) throw fail(`模型没有返回内容（模型 ${cfg.model}）。请确认模型名正确，且该模型支持图片输入`);

  const data = extractJson(r.text);
  if (!data || !Array.isArray(data.parts) || !data.parts.length) throw fail('模型没有给出零件清单，请换一张更清晰的照片重试');
  data.meta = { provider: cfg.provider, model: cfg.model, via: 'extension', ms: Date.now() - t0, createdAt: new Date().toISOString() };
  return data;
}

// 设置页「测试连接」：发一张小图，确认密钥可用、模型能看图
export async function testModel(cfg, image) {
  const prompt = {
    system: '你是一个图像助手。',
    openaiSystem: '你是一个图像助手。只输出 JSON。',
    schema: { type: 'object', properties: { color: { type: 'string' } }, required: ['color'] },
    toolName: 'answer',
  };
  const userText = '这张图片主要是什么颜色？用 JSON 回答：{"color":"颜色"}';
  const opts = { signal: AbortSignal.timeout(60000) };
  const t0 = Date.now();
  const r = cfg.provider === 'anthropic'
    ? await anthropicStream({ ...cfg, maxTokens: 300 }, prompt, image, userText, opts)
    : cfg.provider === 'responses'
      ? await responsesStream({ ...cfg, maxTokens: 2000 }, prompt, image, userText, false, opts)
      : await openaiStream({ ...cfg, maxTokens: 1500 }, prompt, image, userText, false, opts);
  if (!r.text) throw fail('模型没有返回内容，请确认模型名正确且支持图片输入');
  return { reply: r.text.slice(0, 200), ms: Date.now() - t0 };
}
