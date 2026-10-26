// 图片压缩（类似微信发图）：在浏览器本地完成，原图不上传。
// 1. 解码时按 EXIF 方向自动转正；
// 2. 分步缩小（每次缩一半），避免一次缩太多产生锯齿、丢细节；
// 3. 按目标体积自动调整 JPEG 质量，体积达标为止；
// 4. 透明背景（PNG）铺白底，避免变黑。
// AI 用的图：长边 1568px —— Claude、GPT、通义、DeepSeek 等视觉模型都能清楚识别细节，再大只会被服务商再次缩小，白白增加上传时间。

const MAX_DECODE_EDGE = 4096; // 先降到这个尺寸以内，避免手机上超大画布导致崩溃

export const AI_IMAGE = { maxEdge: 1568, maxBytes: 900 * 1024, quality: 0.86, minQuality: 0.62 };

const dataUrlBytes = (u) => Math.round((u.length - u.indexOf(',') - 1) * 0.75);

export function formatBytes(n) {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

function isHeic(file) {
  return /hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name || '');
}

async function decode(file) {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch { /* 部分格式/浏览器不支持，回退到 <img> */ }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(isHeic(file)
        ? '当前浏览器无法读取 HEIC 格式照片：请在手机相册里以 JPG 格式分享/导出后再上传（iPhone 可在「设置 → 相机 → 格式」选择「兼容性最佳」）'
        : '无法读取这张图片，请换一张 JPG / PNG 照片'));
    };
    img.src = url;
  });
}

const sizeOf = (src) => ({ w: src.naturalWidth || src.width, h: src.naturalHeight || src.height });

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  return [c, ctx];
}

// 分步缩小到目标尺寸，返回白底画布
function downscale(src, maxEdge) {
  let { w, h } = sizeOf(src);
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  const tw = Math.round(w * scale);
  const th = Math.round(h * scale);
  let cur = src;
  // 第一步：超大图先直接降到 MAX_DECODE_EDGE 以内（控制内存）
  if (Math.max(w, h) > MAX_DECODE_EDGE && Math.max(w, h) / 2 > maxEdge) {
    const s = MAX_DECODE_EDGE / Math.max(w, h);
    const [c, ctx] = canvas(w * s, h * s);
    ctx.drawImage(cur, 0, 0, c.width, c.height);
    cur = c; w = c.width; h = c.height;
  }
  // 逐次减半，直到距离目标不到 2 倍
  while (w / 2 >= tw && h / 2 >= th) {
    const [c, ctx] = canvas(w / 2, h / 2);
    ctx.drawImage(cur, 0, 0, c.width, c.height);
    cur = c; w = c.width; h = c.height;
  }
  const [out, ctx] = canvas(tw, th);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(cur, 0, 0, out.width, out.height);
  return out;
}

// 按体积预算编码：质量逐步下调；仍超标则再缩小尺寸
function encode(c, { maxBytes, quality, minQuality }) {
  let cur = c;
  for (let round = 0; round < 4; round++) {
    for (let q = quality; q >= minQuality - 1e-6; q -= 0.06) {
      const url = cur.toDataURL('image/jpeg', q);
      if (dataUrlBytes(url) <= maxBytes || (q - 0.06 < minQuality && round === 3)) {
        return { dataUrl: url, width: cur.width, height: cur.height, bytes: dataUrlBytes(url), quality: Math.round(q * 100) };
      }
    }
    cur = downscale(cur, Math.max(cur.width, cur.height) * 0.85);
  }
  const url = cur.toDataURL('image/jpeg', minQuality);
  return { dataUrl: url, width: cur.width, height: cur.height, bytes: dataUrlBytes(url), quality: Math.round(minQuality * 100) };
}

/**
 * 处理用户选择的照片，生成三份：
 *  - image：发给 AI（长边 ≤1568px，≤900KB）
 *  - photo：保存到历史、供「实机照片」查看（长边 ≤900px，≤200KB）
 *  - thumb：顶部标签缩略图（长边 120px）
 */
export async function prepareImage(file) {
  if (!file) throw new Error('请选择图片文件');
  if (!file.type.startsWith('image/') && !isHeic(file)) throw new Error('请选择图片文件（JPG / PNG / WebP）');
  if (file.size > 60 * 1024 * 1024) throw new Error('图片超过 60MB，请换一张');

  const src = await decode(file);
  try {
    const { w, h } = sizeOf(src);
    if (!w || !h) throw new Error('无法读取这张图片');
    const base = downscale(src, AI_IMAGE.maxEdge);
    const ai = encode(base, AI_IMAGE);
    const photo = encode(downscale(base, 900), { maxBytes: 200 * 1024, quality: 0.82, minQuality: 0.6 });
    const thumb = encode(downscale(base, 120), { maxBytes: 20 * 1024, quality: 0.7, minQuality: 0.5 });
    return {
      image: ai.dataUrl,
      photo: photo.dataUrl,
      thumb: thumb.dataUrl,
      info: { origBytes: file.size, origW: w, origH: h, bytes: ai.bytes, w: ai.width, h: ai.height, quality: ai.quality },
    };
  } finally {
    src.close?.();
  }
}
