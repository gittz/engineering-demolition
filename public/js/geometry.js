// 把 AI 输出的 shape 描述转换成 Three.js 几何体与材质
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/RoundedBoxGeometry.js';
import { TEMPLATES, BEVEL, latheSharp } from './templates.js';

const SEG = 48;
const num = (v, d) => (Number.isFinite(+v) && +v > 0 ? +v : d);

// ---------- 倒角：真实零件的边缘都有倒角/圆角，能在边上形成高光，质感差别很大 ----------
// 倒角尺寸取最小边的 6%，上限 1.2mm × 模型尺寸系数
const bevelOf = (...dims) => Math.min(Math.min(...dims) * 0.06, 1.2 * BEVEL.k);

// 按模型整体尺寸设置倒角系数：约 120mm 以内为 1，更大的设备按比例放大（最多 40 倍）
export function setBevelScale(sizeMM) {
  BEVEL.k = Math.max(1, Math.min(40, (+sizeMM || 0) / 120));
}
const V2 = (pts) => pts.map(([x, y]) => new THREE.Vector2(x, y));

// 带倒角的圆柱/圆台（回转体轮廓，自下而上，法线朝外）
function chamferedCylinder(rt, rb, h, seg = SEG) {
  const hh = h / 2;
  const c = Math.min(bevelOf(rt * 2, rb * 2, h), Math.min(rt, rb) * 0.3);
  if (c < 0.02 || Math.min(rt, rb) < 0.15) return new THREE.CylinderGeometry(rt, rb, h, seg);
  const e = c * 0.12; // 额外的过渡点，让平面与倒角面的法线分界更清晰
  return new THREE.LatheGeometry(V2([
    [0, -hh], [rb - c - e, -hh], [rb - c, -hh], [rb, -hh + c], [rb, -hh + c + e],
    [rt, hh - c - e], [rt, hh - c], [rt - c, hh], [rt - c - e, hh], [0, hh],
  ]), seg);
}

// 带外圆倒角的空心管
function chamferedTube(ro, ri, h, seg = SEG) {
  const hh = h / 2;
  const c = Math.min(bevelOf(ro - ri, h), (ro - ri) * 0.35);
  if (c < 0.02) {
    return new THREE.LatheGeometry(V2([[ri, -hh], [ro, -hh], [ro, hh], [ri, hh], [ri, -hh]]), seg);
  }
  const e = c * 0.12;
  return new THREE.LatheGeometry(V2([
    [ri, -hh], [ro - c - e, -hh], [ro - c, -hh], [ro, -hh + c], [ro, -hh + c + e],
    [ro, hh - c - e], [ro, hh - c], [ro - c, hh], [ro - c - e, hh], [ri, hh], [ri, -hh],
  ]), seg);
}

// 拉伸体统一加小倒角（bevelOffset 为负，保证外轮廓尺寸不变）
function bevelExtrude(shape, t, sizeHint) {
  const bt = Math.min(t * 0.12, 0.6 * BEVEL.k, sizeHint * 0.15);
  if (bt < 0.02) {
    const g = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments: 24 });
    g.translate(0, 0, -t / 2);
    return g;
  }
  const depth = Math.max(t - 2 * bt, t * 0.2);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelThickness: bt, bevelSize: bt, bevelOffset: -bt, bevelSegments: 2, curveSegments: 24,
  });
  g.translate(0, 0, -depth / 2);
  return g;
}

class HelixCurve extends THREE.Curve {
  constructor(radius, turns, height) {
    super();
    this.r = radius; this.turns = turns; this.h = height;
  }
  getPoint(t, target = new THREE.Vector3()) {
    const a = Math.PI * 2 * this.turns * t;
    return target.set(this.r * Math.cos(a), -this.h / 2 + this.h * t, this.r * Math.sin(a));
  }
}

function gearShape(R, teeth, depth, inner) {
  const shape = new THREE.Shape();
  const r0 = Math.max(R - depth, R * 0.3);
  const n = Math.max(3, Math.round(teeth));
  const step = (Math.PI * 2) / n;
  for (let i = 0; i < n; i++) {
    const a = i * step;
    const pts = [
      [r0, a], [R, a + step * 0.18], [R, a + step * 0.5], [r0, a + step * 0.68],
    ];
    pts.forEach(([r, ang], j) => {
      const x = r * Math.cos(ang), y = r * Math.sin(ang);
      if (i === 0 && j === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
    });
  }
  shape.closePath();
  if (inner > 0 && inner < r0 * 0.95) {
    const hole = new THREE.Path();
    hole.absarc(0, 0, inner, 0, Math.PI * 2, true);
    shape.holes.push(hole);
  }
  return shape;
}

export function buildShapeGeometry(s) {
  const p = s.params || {};
  // 零件模板（螺栓、轴承、曲轴等），已自带法线，直接返回
  if (TEMPLATES[s.type]) return TEMPLATES[s.type](p);
  let g;
  switch (s.type) {
    case 'roundedBox': {
      const w = num(p.width, 10), h = num(p.height, 10), d = num(p.depth, 10);
      const r = Math.min(num(p.radius, 1), Math.min(w, h, d) / 2 * 0.98);
      g = new RoundedBoxGeometry(w, h, d, 4, r);
      break;
    }
    case 'cylinder': {
      const r = num(p.radius, 5);
      g = chamferedCylinder(num(p.radiusTop, r), num(p.radiusBottom, r), num(p.height, 10));
      break;
    }
    case 'tube': {
      const ro = num(p.outerRadius ?? p.radius, 5);
      let ri = num(p.innerRadius, ro * 0.7);
      if (ri >= ro) ri = ro * 0.85;
      g = chamferedTube(ro, ri, num(p.height, 5));
      break;
    }
    case 'cone':
      g = new THREE.ConeGeometry(num(p.radius ?? p.radiusBottom, 5), num(p.height, 10), SEG);
      break;
    case 'sphere':
      g = new THREE.SphereGeometry(num(p.radius, 5), SEG, SEG / 2);
      break;
    case 'torus':
      g = new THREE.TorusGeometry(num(p.radius, 5), num(p.tube, 1), 16, SEG);
      g.rotateX(Math.PI / 2);
      break;
    case 'capsule':
      g = new THREE.CapsuleGeometry(num(p.radius, 3), num(p.length ?? p.height, 10), 8, 24);
      break;
    case 'spring': {
      const turns = Math.min(num(p.turns, 6), 80);
      const curve = new HelixCurve(num(p.radius, 3), turns, num(p.height, 10));
      g = new THREE.TubeGeometry(curve, Math.ceil(turns * 28), num(p.wireRadius, 0.3), 8, false);
      break;
    }
    case 'gear': {
      const t = num(p.thickness ?? p.height, 3);
      const R = num(p.radius, 5);
      const td = num(p.toothDepth, R * 0.12);
      g = bevelExtrude(gearShape(R, num(p.teeth, 16), td, +p.innerRadius || 0), t, td);
      g.rotateX(-Math.PI / 2);
      break;
    }
    case 'lathe': {
      const pts = (Array.isArray(p.points) ? p.points : [])
        .filter((q) => Array.isArray(q) && q.length >= 2 && Number.isFinite(+q[0]) && Number.isFinite(+q[1]))
        .map(([r, y]) => new THREE.Vector2(Math.max(0, +r), +y));
      // sharp: 每段单独计算法线，台阶、法兰这类直角轮廓不会出现发灰的过渡；曲面轮廓（封头、球面）用默认的平滑法线
      g = pts.length < 2 ? new THREE.CylinderGeometry(3, 3, 6, SEG)
        : p.sharp ? latheSharp(pts.map((v) => [v.x, v.y])) : new THREE.LatheGeometry(pts, SEG);
      break;
    }
    case 'extrude': {
      const pts = (Array.isArray(p.points) ? p.points : [])
        .filter((q) => Array.isArray(q) && q.length >= 2 && Number.isFinite(+q[0]) && Number.isFinite(+q[1]));
      const t = num(p.thickness ?? p.depth, 2);
      if (pts.length >= 3) {
        const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(+x, +y)));
        const xs = pts.map((q) => +q[0]);
        const ys = pts.map((q) => +q[1]);
        g = bevelExtrude(shape, t, Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)));
      } else {
        g = new THREE.BoxGeometry(10, 10, t);
      }
      break;
    }
    case 'box':
    default: {
      const w = num(p.width, 10), h = num(p.height, 10), d = num(p.depth, 10);
      const r = bevelOf(w, h, d);
      g = r >= 0.02 ? new RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d);
    }
  }
  g.computeVertexNormals();
  return g;
}

// ---------- 材质（物理材质：金属反射环境、塑料/陶瓷带清漆层、透明件带高光） ----------
const MAT = {
  steel: { color: '#9aa3ab', metalness: 1, roughness: 0.22 },
  stainless: { color: '#c3c9ce', metalness: 1, roughness: 0.14 },
  aluminum: { color: '#cdd2d7', metalness: 1, roughness: 0.24 },
  brass: { color: '#c9a24a', metalness: 1, roughness: 0.18 },
  copper: { color: '#c06a3d', metalness: 1, roughness: 0.2 },
  chrome: { color: '#e6eaed', metalness: 1, roughness: 0.06 },
  iron: { color: '#5c6166', metalness: 0.9, roughness: 0.42 },
  paint: { color: '#3f7d93', metalness: 0.15, roughness: 0.4, clearcoat: 0.6, clearcoatRoughness: 0.28 },
  plastic: { color: '#3a4047', metalness: 0, roughness: 0.42, clearcoat: 0.3, clearcoatRoughness: 0.35 },
  transparent_plastic: { color: '#9fd4ff', metalness: 0, roughness: 0.06, opacity: 0.52, clearcoat: 1, clearcoatRoughness: 0.05 },
  rubber: { color: '#26292c', metalness: 0, roughness: 0.88 },
  glass: { color: '#d6ecf5', metalness: 0, roughness: 0.02, opacity: 0.25, clearcoat: 1, clearcoatRoughness: 0.02 },
  liquid: { color: '#bfe3ff', metalness: 0, roughness: 0.05, opacity: 0.5, clearcoat: 0.8, clearcoatRoughness: 0.05 },
  fiber: { color: '#e5dcc5', metalness: 0, roughness: 0.95 },
  ceramic: { color: '#eeeae2', metalness: 0, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.2 },
  wood: { color: '#a77b4f', metalness: 0, roughness: 0.75, clearcoat: 0.15 },
  pcb: { color: '#1f6b3a', metalness: 0.1, roughness: 0.5, clearcoat: 0.5, clearcoatRoughness: 0.3 },
  magnet: { color: '#4b5056', metalness: 0.7, roughness: 0.42 },
  fabric: { color: '#7a7f86', metalness: 0, roughness: 1, sheen: 0.6, sheenRoughness: 0.8 },
  paper: { color: '#f2efe6', metalness: 0, roughness: 0.9 },
  foam: { color: '#d9d2c3', metalness: 0, roughness: 1 },
};

export const MATERIAL_LABEL = {
  steel: '钢', stainless: '不锈钢', aluminum: '铝合金', brass: '黄铜', copper: '铜', chrome: '镀铬金属',
  iron: '铸铁', paint: '涂装金属', plastic: '塑料', transparent_plastic: '透明塑料', rubber: '橡胶', glass: '玻璃',
  liquid: '液体', fiber: '纤维', ceramic: '陶瓷/合金', wood: '木材', pcb: '电路板', magnet: '磁体',
  fabric: '织物', paper: '纸', foam: '泡沫',
};

export function materialSpec(kind) {
  return MAT[kind] || MAT.plastic;
}

export function makeMaterial(kind, color) {
  const spec = materialSpec(kind);
  const base = new THREE.Color(color || spec.color);
  // 金属的颜色就是它的反射率：真实钢、铝的反射率在 55%–90%，AI 常给的 #8x–#9x 灰偏暗，
  // 直接用会让金属件发黑、没有光泽，所以把灰色金属在线性空间里往白色提亮 30%
  if (spec.metalness >= 0.9) {
    const hsl = base.getHSL({});
    base.lerp(new THREE.Color(1, 1, 1), hsl.s < 0.25 ? 0.3 : 0.08); // 黄铜、紫铜这类有色金属只轻微提亮，保住颜色
  }
  const m = new THREE.MeshPhysicalMaterial({
    color: base,
    metalness: spec.metalness,
    roughness: spec.roughness,
    clearcoat: spec.clearcoat || 0,
    clearcoatRoughness: spec.clearcoatRoughness ?? 0.3,
    sheen: spec.sheen || 0,
    sheenRoughness: spec.sheenRoughness ?? 1,
    specularIntensity: 1,
    envMapIntensity: 1.0,
  });
  m.userData.baseOpacity = spec.opacity ?? 1;
  return m;
}

// 部件分色调色板（分组配色）
export const PALETTE = ['#2f9e8f', '#e0884a', '#4a7fd6', '#c9506a', '#8b6bd6', '#d6b84a', '#4fb3d9', '#6fae4f', '#d66fb0', '#8a8f96'];
