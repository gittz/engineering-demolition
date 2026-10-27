// 常用机械零件模板：AI 只需给出少量参数，就能得到细节丰富的零件外形。
// 约定：所有模板的回转轴/主轴沿局部 Y 轴；单位 mm。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const SEG = 48;
const num = (v, d) => (Number.isFinite(+v) && +v > 0 ? +v : d);
// 允许下限为 0 的参数（如法兰孔数、皮带轮槽数）显式写 0
const int = (v, d, min = 1, max = 64) => Math.max(min, Math.min(max, Math.round(min === 0 && v !== null && v !== '' && +v === 0 ? 0 : num(v, d))));
const V2 = (pts) => pts.map(([x, y]) => new THREE.Vector2(x, y));

// 合并多个几何体（统一为非索引、只保留 position/normal/uv）
export function merge(list) {
  const parts = list.filter(Boolean).map((g) => {
    let geo = g.index ? g.toNonIndexed() : g;
    if (!geo.attributes.normal) geo.computeVertexNormals();
    if (!geo.attributes.uv) {
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    }
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
    geo.morphAttributes = {};
    return geo;
  });
  return mergeGeometries(parts, false) || parts[0];
}

// 锐边回转体：轮廓每一段单独旋转成面再合并，转折处法线不被平均，棱角清晰（圆周方向仍平滑）
export function latheSharp(pts, seg = SEG) {
  const list = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [a, b] = [pts[i], pts[i + 1]];
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-6) continue;
    list.push(new THREE.LatheGeometry(V2([a, b]), seg));
  }
  return merge(list);
}

// 带倒角的回转体（轮廓自下而上，法线朝外）
function chamferLathe(rOuter, h, rInner = 0, c = null, seg = SEG) {
  const hh = h / 2;
  const ch = c ?? Math.min((rOuter - rInner) * 0.25, h * 0.15, 1.2 * BEVEL.k);
  const pts = rInner > 0
    ? [[rInner, -hh], [rOuter - ch, -hh], [rOuter, -hh + ch], [rOuter, hh - ch], [rOuter - ch, hh], [rInner, hh], [rInner, -hh]]
    : [[0, -hh], [rOuter - ch, -hh], [rOuter, -hh + ch], [rOuter, hh - ch], [rOuter - ch, hh], [0, hh]];
  return latheSharp(pts, seg);
}

function extrudeY(shape, t, bevel = true) {
  const bt = bevel ? Math.min(t * 0.12, 0.5 * BEVEL.k) : 0;
  const depth = Math.max(t - 2 * bt, t * 0.2);
  const g = new THREE.ExtrudeGeometry(shape, bt > 0.02
    ? { depth, bevelEnabled: true, bevelThickness: bt, bevelSize: bt, bevelOffset: -bt, bevelSegments: 2, curveSegments: 32 }
    : { depth: t, bevelEnabled: false, curveSegments: 32 });
  g.translate(0, 0, -(bt > 0.02 ? depth : t) / 2);
  g.rotateX(-Math.PI / 2); // 厚度方向 → Y 轴
  return g;
}

function circlePath(r, cx = 0, cy = 0, hole = true) {
  const p = new THREE.Path();
  p.absarc(cx, cy, r, 0, Math.PI * 2, hole);
  return p;
}

function hexShape(acrossFlats) {
  const R = acrossFlats / Math.sqrt(3); // 外接圆半径
  const s = new THREE.Shape();
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 6 + (i * Math.PI) / 3;
    if (i === 0) s.moveTo(R * Math.cos(a), R * Math.sin(a)); else s.lineTo(R * Math.cos(a), R * Math.sin(a));
  }
  s.closePath();
  return s;
}

class Helix extends THREE.Curve {
  constructor(r, turns, h, y0) { super(); Object.assign(this, { r, turns, h, y0 }); }
  getPoint(t, out = new THREE.Vector3()) {
    const a = Math.PI * 2 * this.turns * t;
    return out.set(this.r * Math.cos(a), this.y0 + this.h * t, this.r * Math.sin(a));
  }
}

// 倒角上限随模型尺寸缩放：打火机这类小件上限约 1mm，几米长的设备按比例放大，
// 否则大设备的边缘会像刀切一样锐利，没有高光过渡（buildModel 前由 setBevelScale 设置）
export const BEVEL = { k: 1 };

export const TEMPLATES = {
  // 六角头螺栓：原点在螺栓头下表面中心，螺杆沿 -Y 方向伸出
  bolt(p) {
    const d = num(p.diameter, 8);
    const L = num(p.length, d * 4);
    const hH = num(p.headHeight, d * 0.65);
    const af = num(p.headSize, d * 1.6);
    const head = extrudeY(hexShape(af), hH);
    head.translate(0, hH / 2, 0);
    const shank = chamferLathe(d / 2, L, 0, d * 0.08);
    shank.translate(0, -L / 2, 0);
    const threadLen = Math.min(L * 0.7, L - d * 0.3);
    const thread = new THREE.TubeGeometry(
      new Helix(d / 2, threadLen / (d * 0.15), threadLen, -L + d * 0.1), Math.ceil(threadLen / (d * 0.15)) * 12, d * 0.045, 4, false,
    );
    return merge([head, shank, thread]);
  },

  // 六角螺母：原点在中心
  nut(p) {
    const d = num(p.diameter, 8);
    const af = num(p.size ?? p.headSize, d * 1.6);
    const t = num(p.thickness, d * 0.8);
    const s = hexShape(af);
    s.holes.push(circlePath(num(p.innerRadius, d / 2)));
    return extrudeY(s, t);
  },

  // 滚动轴承：外圈 + 内圈 + 一圈滚珠
  bearing(p) {
    const R = num(p.outerRadius ?? p.radius, 20);
    let r = num(p.innerRadius, R * 0.5);
    if (r >= R * 0.9) r = R * 0.5;
    const w = num(p.width ?? p.height, (R - r) * 0.8);
    const ringT = (R - r) * 0.28;
    const outer = chamferLathe(R, w, R - ringT);
    const inner = chamferLathe(r + ringT, w, r);
    const mid = (R + r) / 2;
    const ballR = Math.min((R - r) * 0.24, w * 0.42);
    const n = Math.max(6, Math.floor((Math.PI * 2 * mid) / (ballR * 2.6)));
    const balls = [];
    for (let i = 0; i < n; i++) {
      const b = new THREE.SphereGeometry(ballR, 14, 10);
      const a = (i / n) * Math.PI * 2;
      b.translate(mid * Math.cos(a), 0, mid * Math.sin(a));
      balls.push(b);
    }
    const cage = new THREE.TorusGeometry(mid, ballR * 0.35, 6, 64);
    cage.rotateX(Math.PI / 2);
    return merge([outer, inner, cage, ...balls]);
  },

  // 环状阀片（压缩机气阀）：同心弧形通气槽 + 中心孔
  valvePlate(p) {
    const R = num(p.radius, 40);
    const t = num(p.thickness, Math.max(1.5, R * 0.06));
    const ri = num(p.innerRadius, R * 0.14);
    const rings = int(p.rings, 3, 1, 8);
    const s = new THREE.Shape();
    s.absarc(0, 0, R, 0, Math.PI * 2, false);
    s.holes.push(circlePath(ri));
    const r0 = ri + R * 0.1;
    const r1 = R * 0.88;
    const band = (r1 - r0) / rings;
    const slotW = band * 0.5;
    const slots = 4;
    for (let k = 0; k < rings; k++) {
      const ro = r0 + band * k + band * 0.75;
      const rin = ro - slotW;
      const rib = Math.min(0.35, (R * 0.08) / ro); // 筋宽（弧度）
      for (let j = 0; j < slots; j++) {
        const a0 = (j / slots) * Math.PI * 2 + rib / 2 + k * 0.4;
        const a1 = ((j + 1) / slots) * Math.PI * 2 - rib / 2 + k * 0.4;
        const h = new THREE.Path();
        h.absarc(0, 0, ro, a0, a1, false);
        h.absarc(0, 0, rin, a1, a0, true);
        h.closePath();
        s.holes.push(h);
      }
    }
    return extrudeY(s, t);
  },

  // 法兰/端盖：圆盘 + 中心孔 + 一圈螺栓孔
  flange(p) {
    const R = num(p.radius, 40);
    const t = num(p.thickness, R * 0.15);
    const ri = +p.innerRadius > 0 ? +p.innerRadius : 0;
    const n = int(p.holes ?? p.count, 6, 0, 36);
    const hr = num(p.holeRadius, R * 0.07);
    const hc = num(p.holeCircle, (R + Math.max(ri, R * 0.4)) / 2 + R * 0.1);
    const s = new THREE.Shape();
    s.absarc(0, 0, R, 0, Math.PI * 2, false);
    if (ri > 0) s.holes.push(circlePath(ri));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.PI / n;
      s.holes.push(circlePath(hr, hc * Math.cos(a), hc * Math.sin(a)));
    }
    return extrudeY(s, t);
  },

  // 皮带轮/飞轮：V 形槽 + 轮毂
  pulley(p) {
    const R = num(p.radius, 50);
    const w = num(p.width ?? p.height, R * 0.4);
    const g = int(p.grooves, 2, 0, 8);
    const rb = num(p.innerRadius, R * 0.12);
    const hub = R * 0.32;
    const rimIn = R * 0.72;
    const hw = w / 2;
    const web = w * 0.3;
    const pts = [[rb, -hw], [hub, -hw], [hub, -web / 2], [rimIn, -web / 2], [rimIn, -hw], [R, -hw]];
    if (g > 0) {
      const pitch = w / g;
      const depth = Math.min(R * 0.08, pitch * 0.45);
      for (let i = 0; i < g; i++) {
        const y0 = -hw + i * pitch;
        pts.push([R, y0 + pitch * 0.15], [R - depth, y0 + pitch * 0.45], [R - depth, y0 + pitch * 0.55], [R, y0 + pitch * 0.85]);
      }
    }
    pts.push([R, hw], [rimIn, hw], [rimIn, web / 2], [hub, web / 2], [hub, hw], [rb, hw], [rb, -hw]);
    return latheSharp(pts, 64);
  },

  // 带散热片的缸体/电机壳：芯筒 + 若干环形散热片
  finnedCylinder(p) {
    const r = num(p.radius, 30);
    const L = num(p.length ?? p.height, r * 2.5);
    const n = int(p.fins, 8, 1, 40);
    const fr = num(p.finRadius, r * 1.35);
    const ri = +p.innerRadius > 0 && +p.innerRadius < r ? +p.innerRadius : 0;
    const ft = num(p.finThickness, Math.min(L / (n * 2.2), r * 0.15));
    const list = [chamferLathe(r, L, ri)];
    const margin = L * 0.06;
    for (let i = 0; i < n; i++) {
      const y = -L / 2 + margin + ft / 2 + ((L - 2 * margin - ft) * i) / Math.max(1, n - 1);
      const fin = chamferLathe(fr, ft, ri > 0 ? ri : r * 0.9, ft * 0.3);
      fin.translate(0, y, 0);
      list.push(fin);
    }
    return merge(list);
  },

  // 曲轴：主轴颈 + 曲柄臂（带配重）+ 曲柄销。主轴沿 Y；第 1 个曲柄销在 +X 方向，多拐时按 360°/拐数 依次错开
  crankshaft(p) {
    const Lt = num(p.length, 200);
    const rj = num(p.journalRadius, 10);
    const rp = num(p.pinRadius, rj * 0.9);
    const thr = num(p.throw, rj * 2);
    const n = int(p.throws, 1, 1, 8);
    const tw = num(p.webThickness, rj * 0.9);
    const ww = num(p.webWidth, rj * 2.8);
    const pinLen = num(p.pinLength, rj * 2.4);
    const blockLen = pinLen + 2 * tw;
    const gap = Math.max(rj * 1.2, (Lt * 0.5 - n * blockLen) / Math.max(1, n - 1));
    const total = n * blockLen + (n - 1) * gap;
    const start = -total / 2;
    const list = [];
    const journal = (y0, y1) => {
      if (y1 - y0 < 0.1) return;
      const j = chamferLathe(rj, y1 - y0, 0, rj * 0.12);
      j.translate(0, (y0 + y1) / 2, 0);
      list.push(j);
    };
    journal(-Lt / 2, start);
    for (let i = 0; i < n; i++) {
      const b0 = start + i * (blockLen + gap);
      const yc = b0 + blockLen / 2;
      const a = (i / n) * Math.PI * 2;
      const pin = chamferLathe(rp, pinLen + 0.2, 0, rp * 0.1);
      pin.translate(thr * Math.cos(a), yc, thr * Math.sin(a));
      list.push(pin);
      for (const s of [-1, 1]) {
        // 曲柄臂：从配重端（-0.9 倍曲柄半径）延伸到销端
        const len = thr * 1.9 + ww * 0.5;
        const web = new THREE.BoxGeometry(len, tw, ww);
        web.translate(thr - len / 2 + ww * 0.25, 0, 0);
        const cw = new THREE.CylinderGeometry(ww * 0.62, ww * 0.62, tw, 32, 1, false, Math.PI, Math.PI); // 半圆配重，位于 -X 侧
        cw.translate(-thr * 0.9 + ww * 0.25, 0, 0);
        const w = merge([web, cw]);
        w.rotateY(-a);
        w.translate(0, yc + s * (pinLen / 2 + tw / 2), 0);
        list.push(w);
      }
      if (i < n - 1) journal(b0 + blockLen, b0 + blockLen + gap);
    }
    journal(start + total, Lt / 2);
    return merge(list);
  },

  // 活塞：裙部 + 顶部若干活塞环槽。原点在活塞高度中心，顶面朝 +Y
  piston(p) {
    const R = num(p.radius, 30);
    const H = num(p.height, R * 1.3);
    const n = int(p.rings, 3, 0, 6);
    const hh = H / 2;
    const gd = R * 0.05;
    const gw = H * 0.045;
    const pts = [[0, -hh], [R * 0.86, -hh], [R * 0.98, -hh + H * 0.05], [R * 0.98, hh - H * 0.08 - n * gw * 2.4]];
    for (let i = n - 1; i >= 0; i--) {
      const y = hh - H * 0.08 - i * gw * 2.4;
      pts.push([R, y - gw * 1.4], [R, y - gw], [R - gd, y - gw], [R - gd, y], [R, y]);
    }
    pts.push([R, hh - R * 0.04], [R - R * 0.04, hh], [0, hh]);
    const body = latheSharp(pts, SEG);
    const boss = new THREE.CylinderGeometry(R * 0.22, R * 0.22, R * 1.9, 24);
    boss.rotateZ(Math.PI / 2);
    boss.translate(0, -H * 0.05, 0);
    return merge([body, boss]);
  },

  // 连杆：原点在小头孔中心，大头孔在 -Y 方向 length 处；两端孔的轴线沿局部 Z
  conrod(p) {
    const L = num(p.length, 100);
    const rb = num(p.bigRadius, L * 0.16);
    const rs = num(p.smallRadius, rb * 0.6);
    const t = num(p.thickness, rb * 0.9);
    const eye = (R, ri) => {
      const g = chamferLathe(R, t, ri);
      g.rotateX(Math.PI / 2);
      return g;
    };
    const small = eye(rs, rs * 0.55);
    const big = eye(rb, rb * 0.62);
    big.translate(0, -L, 0);
    const beamLen = L - rs * 0.8 - rb * 0.8;
    const beam = new THREE.CylinderGeometry(rs * 0.55, rb * 0.6, beamLen, 4, 1);
    beam.rotateY(Math.PI / 4);
    beam.scale(1, 1, (t * 0.7) / (rb * 0.6 * 1.414));
    beam.translate(0, -rs * 0.8 - beamLen / 2, 0);
    const cap = new THREE.BoxGeometry(rb * 2.6, rb * 0.35, t * 1.02);
    cap.translate(0, -L, 0);
    return merge([small, big, beam, cap]);
  },

  // 外螺纹杆/丝杠：原点在中心
  threadedRod(p) {
    const d = num(p.diameter, 10);
    const L = num(p.length, d * 6);
    const pitch = num(p.pitch, d * 0.15);
    const core = chamferLathe(d / 2 - d * 0.04, L, 0, d * 0.06);
    const thread = new THREE.TubeGeometry(new Helix(d / 2 - d * 0.03, L / pitch, L * 0.96, -L * 0.48), Math.ceil(L / pitch) * 12, d * 0.06, 4, false);
    return merge([core, thread]);
  },
};

export const TEMPLATE_TYPES = Object.keys(TEMPLATES);
