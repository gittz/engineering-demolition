// 内容脚本：在拆解 LAB 网页与插件后台之间传递消息。
// 网页 → window.postMessage({source:'teardown-page', ...}) → 这里 → 后台（调用用户自己的模型）
(() => {
  const VERSION = chrome.runtime.getManifest().version;
  document.documentElement.dataset.teardownExt = VERSION;

  const post = (msg) => window.postMessage({ source: 'teardown-ext', version: VERSION, ...msg }, location.origin);
  // 插件在 chrome://extensions 里被刷新/更新后，已打开页面里的旧脚本会与后台断开（chrome.runtime 变为 undefined）
  const alive = () => Boolean(globalThis.chrome?.runtime?.id);
  const STALE = '插件刚刚更新过，请刷新本页面后重试';
  const status = () => (alive() ? chrome.runtime.sendMessage({ type: 'status' }) : Promise.reject(new Error(STALE)));

  async function announce(type, id) {
    try {
      post({ type, id, ...(await status()) });
    } catch (e) {
      post({ type, id, installed: true, configured: false, error: STALE });
    }
  }

  async function analyze(m) {
    let done = false;
    const fail = (message, code) => { if (!done) { done = true; post({ type: 'error', id: m.id, message, code }); } };

    // 提示词从网站读取（与服务器端使用同一份）
    let prompt;
    try {
      const res = await fetch('/api/prompt', { cache: 'no-store' });
      prompt = await res.json();
      if (!prompt?.system || !prompt?.schema) throw new Error('bad');
    } catch {
      return fail('无法从网站读取提示词（/api/prompt），请确认网站版本已更新');
    }

    let port;
    try {
      if (!alive()) throw new Error(STALE);
      port = chrome.runtime.connect({ name: 'teardown' });
    } catch {
      return fail(STALE, 'stale');
    }
    // 定时 ping，避免插件后台在长时间等待模型时被浏览器休眠
    const ping = setInterval(() => { try { port.postMessage({ type: 'ping' }); } catch { /* ignore */ } }, 15000);
    port.onMessage.addListener((r) => {
      if (r.type === 'progress') return post({ ...r, id: m.id });
      if (r.type === 'result' || r.type === 'error') {
        done = true;
        clearInterval(ping);
        post({ ...r, id: m.id });
        port.disconnect();
      }
    });
    port.onDisconnect.addListener(() => {
      clearInterval(ping);
      fail('与插件的连接中断，请重试');
    });
    port.postMessage({ type: 'analyze', image: m.image, hint: m.hint, prompt });
  }

  window.addEventListener('message', (ev) => {
    if (ev.source !== window || ev.origin !== location.origin) return;
    const m = ev.data;
    if (!m || m.source !== 'teardown-page') return;
    if (m.type === 'status') announce('status', m.id);
    else if (m.type === 'openOptions') {
      if (alive()) chrome.runtime.sendMessage({ type: 'openOptions', allow: Boolean(m.allow) }).catch(() => {});
      else post({ type: 'error', id: m.id, message: STALE, code: 'stale' });
    } else if (m.type === 'analyze') {
      if (alive()) analyze(m);
      else post({ type: 'error', id: m.id, message: STALE, code: 'stale' });
    }
  });

  announce('ready');
})();
