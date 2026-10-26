// 插件后台：读取用户配置，直接调用用户自己的大模型。密钥只保存在 chrome.storage.local。
import { callModel, isConfigured } from './llm.js';

const VERSION = chrome.runtime.getManifest().version;

async function getState() {
  const { cfg = null, allowed = [] } = await chrome.storage.local.get(['cfg', 'allowed']);
  return { cfg, allowed };
}

const isLocal = (origin) => {
  try { return ['localhost', '127.0.0.1'].includes(new URL(origin).hostname); } catch { return false; }
};
// 本机开发地址默认允许；其它网站需要用户在设置页里点「允许」一次，防止陌生网站消耗你的额度
const isAllowed = (origin, allowed) => Boolean(origin) && (isLocal(origin) || allowed.includes(origin));
const originOf = (sender) => sender?.origin || (sender?.url ? new URL(sender.url).origin : '');

function openOptions(allowOrigin) {
  const url = chrome.runtime.getURL('options.html') + (allowOrigin ? `?allow=${encodeURIComponent(allowOrigin)}` : '');
  return chrome.tabs.create({ url });
}

chrome.action.onClicked.addListener(() => openOptions());

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const origin = originOf(sender);
  (async () => {
    if (msg.type === 'status') {
      const { cfg, allowed } = await getState();
      sendResponse({
        installed: true,
        version: VERSION,
        configured: isConfigured(cfg),
        allowed: isAllowed(origin, allowed),
        provider: cfg?.provider || '',
        model: cfg?.model || '',
        label: cfg?.label || '',
      });
    } else if (msg.type === 'openOptions') {
      const { allowed } = await getState();
      await openOptions(msg.allow && !isAllowed(origin, allowed) ? origin : '');
      sendResponse({ ok: true });
    } else {
      sendResponse({ error: 'unknown' });
    }
  })();
  return true;
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'teardown') return;
  const origin = originOf(port.sender);
  const ctrl = new AbortController();
  port.onDisconnect.addListener(() => ctrl.abort());
  const send = (m) => { try { port.postMessage(m); } catch { /* 页面已关闭 */ } };

  port.onMessage.addListener(async (msg) => {
    if (msg.type !== 'analyze') return;
    try {
      const { cfg, allowed } = await getState();
      if (!isAllowed(origin, allowed)) {
        const e = new Error(`插件尚未允许此网站（${origin}）使用你的模型，请在弹出的设置页中点击「允许」`);
        e.code = 'not_allowed';
        throw e;
      }
      if (!isConfigured(cfg)) {
        const e = new Error('插件还没有配置模型，请先在插件设置页填写接口地址、密钥和模型名');
        e.code = 'not_configured';
        throw e;
      }
      let last = 0;
      const data = await callModel(cfg, msg.prompt, msg.image, msg.hint, {
        signal: ctrl.signal,
        onProgress: (chars) => {
          const now = Date.now();
          if (now - last > 400) { last = now; send({ type: 'progress', chars }); }
        },
      });
      send({ type: 'result', data });
    } catch (e) {
      if (ctrl.signal.aborted) return;
      console.error('[teardown]', e);
      send({ type: 'error', code: e.code || '', message: e.message || String(e) });
    }
  });
});
