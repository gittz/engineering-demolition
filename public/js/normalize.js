// 清洗 AI 返回的数据：补默认值、去掉非法数字、保证 id 唯一
const SHAPES = new Set(['box', 'roundedBox', 'cylinder', 'tube', 'cone', 'sphere', 'torus', 'capsule', 'spring', 'gear', 'lathe', 'extrude']);
const MATS = new Set(['steel', 'stainless', 'aluminum', 'brass', 'copper', 'chrome', 'iron', 'plastic', 'transparent_plastic', 'rubber', 'glass', 'liquid', 'fiber', 'ceramic', 'wood', 'pcb', 'magnet', 'fabric', 'paper', 'foam']);

const v3 = (a, d = [0, 0, 0]) => (Array.isArray(a) && a.length >= 3 ? a.slice(0, 3).map((x, i) => (Number.isFinite(+x) ? +x : d[i])) : d.slice());
const str = (s, d = '') => (typeof s === 'string' && s.trim() ? s.trim() : d);
const hex = (c) => (typeof c === 'string' && /^#?[0-9a-f]{6}$/i.test(c.trim()) ? `#${c.trim().replace('#', '')}` : null);

export function normalizeModel(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('数据为空');
  const o = raw.object || {};
  const object = {
    name: str(o.name, '未命名物体'),
    name_en: str(o.name_en, 'UNKNOWN OBJECT'),
    category: str(o.category, '—'),
    summary: str(o.summary, ''),
    principle: str(o.principle, ''),
    overall_size_mm: v3(o.overall_size_mm, [0, 0, 0]),
    confidence: Number.isFinite(+o.confidence) ? Math.max(0, Math.min(1, +o.confidence)) : null,
    assumptions: Array.isArray(o.assumptions) ? o.assumptions.filter((x) => typeof x === 'string').slice(0, 12) : [],
  };
  const seen = new Set();
  const parts = (Array.isArray(raw.parts) ? raw.parts : []).slice(0, 80).map((p, i) => {
    let id = str(p.id, `part_${i + 1}`).replace(/[^\w-]/g, '_');
    while (seen.has(id)) id += '_';
    seen.add(id);
    const shapes = (Array.isArray(p.shapes) ? p.shapes : []).slice(0, 16).map((s) => ({
      type: SHAPES.has(s?.type) ? s.type : 'box',
      params: s?.params && typeof s.params === 'object' ? s.params : {},
      position: v3(s?.position),
      rotation: v3(s?.rotation),
    }));
    if (!shapes.length) shapes.push({ type: 'box', params: { width: 5, height: 5, depth: 5 }, position: [0, 0, 0], rotation: [0, 0, 0] });
    return {
      id,
      name: str(p.name, `零件 ${i + 1}`),
      name_en: str(p.name_en, ''),
      group: str(p.group, '其他'),
      material: MATS.has(p.material) ? p.material : 'plastic',
      color: hex(p.color),
      is_shell: Boolean(p.is_shell),
      order: Number.isFinite(+p.order) ? +p.order : i + 1,
      function: str(p.function, ''),
      description: str(p.description, ''),
      position: v3(p.position),
      rotation: v3(p.rotation),
      explode: Array.isArray(p.explode) ? v3(p.explode) : null,
      shapes,
    };
  });
  if (!parts.length) throw new Error('没有零件数据');
  // 拆卸顺序重新编号为 1..n
  [...parts].sort((a, b) => a.order - b.order).forEach((p, i) => { p.order = i + 1; });
  return { object, parts, meta: raw.meta || null };
}
