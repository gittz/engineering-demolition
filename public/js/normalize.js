// 清洗 AI 返回的数据：补默认值、去掉非法数字、保证 id 唯一、展开阵列、规范运动数据
const BASIC_SHAPES = ['box', 'roundedBox', 'cylinder', 'tube', 'cone', 'sphere', 'torus', 'capsule', 'spring', 'gear', 'lathe', 'extrude'];
const TEMPLATE_SHAPES = ['bolt', 'nut', 'bearing', 'valvePlate', 'flange', 'pulley', 'finnedCylinder', 'crankshaft', 'piston', 'conrod', 'threadedRod'];
const SHAPES = new Set([...BASIC_SHAPES, ...TEMPLATE_SHAPES]);
const MATS = new Set(['steel', 'stainless', 'aluminum', 'brass', 'copper', 'chrome', 'iron', 'paint', 'plastic', 'transparent_plastic', 'rubber', 'glass', 'liquid', 'fiber', 'ceramic', 'wood', 'pcb', 'magnet', 'fabric', 'paper', 'foam']);
const MOTIONS = new Set(['rotate', 'oscillate', 'swing', 'slider', 'conrod']);

const v3 = (a, d = [0, 0, 0]) => (Array.isArray(a) && a.length >= 3 ? a.slice(0, 3).map((x, i) => (Number.isFinite(+x) ? +x : d[i])) : d.slice());
const str = (s, d = '') => (typeof s === 'string' && s.trim() ? s.trim() : d);
const hex = (c) => (typeof c === 'string' && /^#?[0-9a-f]{6}$/i.test(c.trim()) ? `#${c.trim().replace('#', '')}` : null);
const fin = (v, d) => (Number.isFinite(+v) ? +v : d);
const pos = (v, d) => (Number.isFinite(+v) && +v > 0 ? +v : d);
const AXES = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };

function unitAxis(a, d) {
  if (typeof a === 'string' && AXES[a.toLowerCase().replace(/^[+-]/, '')]) {
    const v = AXES[a.toLowerCase().replace(/^[+-]/, '')];
    return a.startsWith('-') ? v.map((x) => -x) : v;
  }
  const v = v3(a, d);
  const len = Math.hypot(...v);
  return len > 1e-6 ? v.map((x) => x / len) : d;
}

// 阵列：把一个 shape 复制成一圈（circular）或一排（linear）
function expandArray(s) {
  const a = s.array;
  if (!a || typeof a !== 'object') return [s];
  const count = Math.max(1, Math.min(48, Math.round(fin(a.count, 1))));
  if (count === 1) return [s];
  const base = { ...s };
  delete base.array;
  const out = [];
  if (Number.isFinite(+a.radius) && +a.radius > 0) {
    const axis = typeof a.axis === 'string' ? a.axis.toLowerCase() : 'y';
    const r = +a.radius;
    const start = fin(a.startAngle, 0);
    const span = fin(a.angle, 360);
    const step = Math.abs(span - 360) < 1e-6 ? span / count : span / Math.max(1, count - 1);
    const ai = { x: 0, y: 1, z: 2 }[axis] ?? 1;
    for (let i = 0; i < count; i++) {
      const ang = ((start + step * i) * Math.PI) / 180;
      const c = Math.cos(ang) * r;
      const sn = Math.sin(ang) * r;
      const off = axis === 'x' ? [0, c, sn] : axis === 'z' ? [c, sn, 0] : [c, 0, -sn];
      const rot = base.rotation.slice();
      if (a.rotate !== false) rot[ai] += start + step * i;
      out.push({ ...base, position: base.position.map((v, k) => v + off[k]), rotation: rot });
    }
  } else {
    const sp = v3(a.spacing, [10, 0, 0]);
    for (let i = 0; i < count; i++) out.push({ ...base, position: base.position.map((v, k) => v + sp[k] * i) });
  }
  return out;
}

function normMotion(m) {
  if (!m || typeof m !== 'object' || !MOTIONS.has(m.type)) return null;
  return {
    type: m.type,
    axis: unitAxis(m.axis, [0, 1, 0]),
    crankAxis: unitAxis(m.crankAxis, [1, 0, 0]),
    speed: fin(m.speed, 1),
    amplitude: pos(m.amplitude, m.type === 'swing' ? 15 : 5),
    phase: fin(m.phase, 0),
    pivot: v3(m.pivot, [0, 0, 0]),
    crankRadius: pos(m.crankRadius, 10),
    rodLength: pos(m.rodLength, 40),
  };
}

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
    const shapes = (Array.isArray(p.shapes) ? p.shapes : []).slice(0, 16).flatMap((s) => expandArray({
      type: SHAPES.has(s?.type) ? s.type : 'box',
      params: s?.params && typeof s.params === 'object' ? s.params : {},
      position: v3(s?.position),
      rotation: v3(s?.rotation),
      array: s?.array,
    })).slice(0, 64);
    shapes.forEach((s) => { delete s.array; });
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
      motion: normMotion(p.motion),
      shapes,
    };
  });
  if (!parts.length) throw new Error('没有零件数据');
  // 拆卸顺序重新编号为 1..n
  [...parts].sort((a, b) => a.order - b.order).forEach((p, i) => { p.order = i + 1; });
  return { object, parts, meta: raw.meta || null };
}
