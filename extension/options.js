import { PRESETS, isConfigured, testModel } from './llm.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);

const DEFAULT = { preset: 'deepseek', ...PRESETS.deepseek, apiKey: '' };

function setMsg(text, kind = '') {
  $('msg').textContent = text;
  $('msg').className = `msg ${kind}`;
}

function fill(cfg) {
  $('preset').value = cfg.preset || 'custom';
  const prov = ['openai', 'responses', 'anthropic'].includes(cfg.provider) ? cfg.provider : 'openai';
  document.querySelector(`input[name=provider][value=${prov}]`).checked = true;
  $('baseUrl').value = cfg.baseUrl || '';
  $('apiKey').value = cfg.apiKey || '';
  $('model').value = cfg.model || '';
  $('maxTokens').value = cfg.maxTokens || 16000;
  $('jsonMode').checked = Boolean(cfg.jsonMode);
}

function read() {
  const preset = $('preset').value;
  return {
    preset,
    label: PRESETS[preset]?.label || '自定义',
    provider: document.querySelector('input[name=provider]:checked').value,
    baseUrl: $('baseUrl').value.trim().replace(/\/+$/, ''),
    apiKey: $('apiKey').value.trim(),
    model: $('model').value.trim(),
    maxTokens: Math.max(1000, Number($('maxTokens').value) || 16000),
    jsonMode: $('jsonMode').checked,
  };
}

function validate(cfg) {
  try {
    const u = new URL(cfg.baseUrl);
    if (!/^https?:$/.test(u.protocol)) throw new Error();
  } catch {
    return '接口地址格式不正确，应以 https:// 开头';
  }
  if (!cfg.apiKey) return '请填写 API Key';
  if (!cfg.model) return '请填写模型名';
  return '';
}

// 预设之外的接口地址需要向浏览器申请访问权限（必须在点击事件中调用）
async function ensurePermission(baseUrl) {
  const origin = new URL(baseUrl).origin;
  const ok = await chrome.permissions.request({ origins: [`${origin}/*`] });
  if (!ok) throw new Error(`没有获得访问 ${origin} 的权限`);
}

// 生成一张 64×64 的纯红色测试图
function testImage() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#e03131';
  g.fillRect(0, 0, 64, 64);
  return c.toDataURL('image/png');
}

async function renderSites() {
  const { allowed = [] } = await chrome.storage.local.get('allowed');
  const ul = $('sites');
  ul.innerHTML = '';
  if (!allowed.length) {
    ul.innerHTML = '<li class="empty">还没有允许任何网站。打开拆解 LAB 网站上传照片时会提示你允许。</li>';
    return;
  }
  for (const o of allowed) {
    const li = document.createElement('li');
    li.textContent = o;
    const b = document.createElement('button');
    b.textContent = '移除';
    b.onclick = async () => {
      const { allowed: cur = [] } = await chrome.storage.local.get('allowed');
      await chrome.storage.local.set({ allowed: cur.filter((x) => x !== o) });
      renderSites();
    };
    li.appendChild(b);
    ul.appendChild(li);
  }
}

async function init() {
  for (const [k, p] of Object.entries(PRESETS)) {
    const opt = document.createElement('option');
    opt.value = k;
    opt.textContent = p.label;
    $('preset').appendChild(opt);
  }
  const { cfg } = await chrome.storage.local.get('cfg');
  fill(cfg || DEFAULT);
  if (!isConfigured(cfg)) setMsg('选择服务商，填入你的 API Key 后保存');

  $('preset').addEventListener('change', () => {
    const p = PRESETS[$('preset').value];
    const keep = $('apiKey').value;
    fill({ preset: $('preset').value, ...p, apiKey: keep });
    if ($('preset').value === 'doubao') setMsg('豆包请在「模型名」填写方舟控制台里的推理接入点 ID（ep-...）或模型 ID');
    else if ($('preset').value === 'responses') setMsg('填写网关地址（通常以 /v1 结尾）、密钥和模型名；Codex 配置里 wire_api = "responses" 的网关选这个');
    else setMsg('');
  });
  $('toggleKey').addEventListener('click', () => {
    const show = $('apiKey').type === 'password';
    $('apiKey').type = show ? 'text' : 'password';
    $('toggleKey').textContent = show ? '隐藏' : '显示';
  });

  $('saveBtn').addEventListener('click', async () => {
    const cfg = read();
    const err = validate(cfg);
    if (err) return setMsg(err, 'err');
    try {
      await ensurePermission(cfg.baseUrl);
      await chrome.storage.local.set({ cfg });
      setMsg('已保存。回到拆解 LAB 网站刷新页面即可使用', 'ok');
    } catch (e) { setMsg(e.message, 'err'); }
  });

  $('testBtn').addEventListener('click', async () => {
    const cfg = read();
    const err = validate(cfg);
    if (err) return setMsg(err, 'err');
    $('testBtn').disabled = true;
    setMsg('正在发送测试图片…');
    try {
      await ensurePermission(cfg.baseUrl);
      const r = await testModel(cfg, testImage());
      setMsg(`连接成功（${(r.ms / 1000).toFixed(1)}s），模型回复：${r.reply}`, 'ok');
    } catch (e) {
      setMsg(`测试失败：${e.message}`, 'err');
    } finally {
      $('testBtn').disabled = false;
    }
  });

  const ask = params.get('allow');
  if (ask) {
    let origin = '';
    try { origin = new URL(ask).origin; } catch { /* ignore */ }
    if (origin) {
      $('allowOrigin').textContent = origin;
      $('allowBanner').hidden = false;
      $('allowBtn').onclick = async () => {
        const { allowed = [] } = await chrome.storage.local.get('allowed');
        if (!allowed.includes(origin)) allowed.push(origin);
        await chrome.storage.local.set({ allowed });
        $('allowBanner').hidden = true;
        history.replaceState(null, '', location.pathname);
        renderSites();
        setMsg(`已允许 ${origin}。${isConfigured(read()) ? '回到网站重新上传即可' : '接下来请配置模型并保存'}`, 'ok');
      };
      $('denyBtn').onclick = () => { $('allowBanner').hidden = true; };
    }
  }
  renderSites();
}

init();
