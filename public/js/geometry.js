// 把 AI 输出的 shape 描述转换成 Three.js 几何体与材质
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/RoundedBoxGeometry.js';

const SEG = 48;
const num = (v, d) => (Number.isFinite(+v) && +v > 0 ? +v : d);

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
      g = new THREE.CylinderGeometry(num(p.radiusTop, r), num(p.radiusBottom, r), num(p.height, 10), SEG);
      break;
    }
    case 'tube': {
      const ro = num(p.outerRadius ?? p.radius, 5);
      let ri = num(p.innerRadius, ro * 0.7);
      if (ri >= ro) ri = ro * 0.85;
      const h = num(p.height, 5) / 2;
      const pts = [[ri, -h], [ro, -h], [ro, h], [ri, h], [ri, -h]].map(([x, y]) => new THREE.Vector2(x, y));
      g = new THREE.LatheGeometry(pts, SEG);
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
      g = new THREE.ExtrudeGeometry(
        gearShape(num(p.radius, 5), num(p.teeth, 16), num(p.toothDepth, num(p.radius, 5) * 0.12), +p.innerRadius || 0),
        { depth: t, bevelEnabled: false, curveSegments: 24 },
      );
      g.translate(0, 0, -t / 2);
      g.rotateX(-Math.PI / 2);
      break;
    }
    case 'lathe': {
      const pts = (Array.isArray(p.points) ? p.points : [])
        .filter((q) => Array.isArray(q) && q.length >= 2 && Number.isFinite(+q[0]) && Number.isFinite(+q[1]))
        .map(([r, y]) => new THREE.Vector2(Math.max(0, +r), +y));
      g = pts.length >= 2 ? new THREE.LatheGeometry(pts, SEG) : new THREE.CylinderGeometry(3, 3, 6, SEG);
      break;
    }
    case 'extrude': {
      const pts = (Array.isArray(p.points) ? p.points : [])
        .filter((q) => Array.isArray(q) && q.length >= 2 && Number.isFinite(+q[0]) && Number.isFinite(+q[1]));
      const t = num(p.thickness ?? p.depth, 2);
      if (pts.length >= 3) {
        const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(+x, +y)));
        g = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false });
        g.translate(0, 0, -t / 2);
      } else {
        g = new THREE.BoxGeometry(10, 10, t);
      }
      break;
    }
    case 'box':
    default:
      g = new THREE.BoxGeometry(num(p.width, 10), num(p.height, 10), num(p.depth, 10));
  }
  g.computeVertexNormals();
  return g;
}

// ---------- 材质 ----------
const MAT = {
  steel: { color: '#9aa3ab', metalness: 0.85, roughness: 0.32 },
  stainless: { color: '#c3c9ce', metalness: 0.9, roughness: 0.22 },
  aluminum: { color: '#c8cdd2', metalness: 0.75, roughness: 0.35 },
  brass: { color: '#c9a24a', metalness: 0.9, roughness: 0.28 },
  copper: { color: '#c06a3d', metalness: 0.9, roughness: 0.3 },
  chrome: { color: '#e2e6e9', metalness: 1.0, roughness: 0.08 },
  iron: { color: '#5c6166', metalness: 0.7, roughness: 0.6 },
  plastic: { color: '#3a4047', metalness: 0.0, roughness: 0.45 },
  transparent_plastic: { color: '#9fd4ff', metalness: 0.0, roughness: 0.12, opacity: 0.45 },
  rubber: { color: '#26292c', metalness: 0.0, roughness: 0.92 },
  glass: { color: '#d6ecf5', metalness: 0.0, roughness: 0.05, opacity: 0.28 },
  liquid: { color: '#bfe3ff', metalness: 0.0, roughness: 0.1, opacity: 0.55 },
  fiber: { color: '#e5dcc5', metalness: 0.0, roughness: 0.95 },
  ceramic: { color: '#eeeae2', metalness: 0.0, roughness: 0.35 },
  wood: { color: '#a77b4f', metalness: 0.0, roughness: 0.8 },
  pcb: { color: '#1f6b3a', metalness: 0.15, roughness: 0.55 },
  magnet: { color: '#4b5056', metalness: 0.6, roughness: 0.45 },
  fabric: { color: '#7a7f86', metalness: 0.0, roughness: 1.0 },
  paper: { color: '#f2efe6', metalness: 0.0, roughness: 0.9 },
  foam: { color: '#d9d2c3', metalness: 0.0, roughness: 1.0 },
};

export const MATERIAL_LABEL = {
  steel: '钢', stainless: '不锈钢', aluminum: '铝合金', brass: '黄铜', copper: '铜', chrome: '镀铬金属',
  iron: '铸铁', plastic: '塑料', transparent_plastic: '透明塑料', rubber: '橡胶', glass: '玻璃',
  liquid: '液体', fiber: '纤维', ceramic: '陶瓷/合金', wood: '木材', pcb: '电路板', magnet: '磁体',
  fabric: '织物', paper: '纸', foam: '泡沫',
};

export function materialSpec(kind) {
  return MAT[kind] || MAT.plastic;
}

export function makeMaterial(kind, color) {
  const spec = materialSpec(kind);
  const m = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color || spec.color),
    metalness: spec.metalness,
    roughness: spec.roughness,
    envMapIntensity: 1.0,
  });
  m.userData.baseOpacity = spec.opacity ?? 1;
  return m;
}

// 部件分色调色板（分组配色）
export const PALETTE = ['#2f9e8f', '#e0884a', '#4a7fd6', '#c9506a', '#8b6bd6', '#d6b84a', '#4fb3d9', '#6fae4f', '#d66fb0', '#8a8f96'];
