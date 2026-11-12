import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ===================== 几何工具 =====================
const SEG = 160;
const D2R = Math.PI / 180;
const interp = (pts, x) => {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i][0]) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0); }
  }
  return pts[pts.length - 1][1];
};
const clean = (g) => {
  const o = g.index ? g.toNonIndexed() : g;
  if (o.attributes.uv) o.deleteAttribute('uv');
  if (!o.attributes.normal) o.computeVertexNormals();
  return o;
};
const merge = (list) => mergeGeometries(list.map(clean));
// 回转体：points 为 [半径, x]，绕 X 轴旋转
function lathe(points, seg = SEG) {
  const g = new THREE.LatheGeometry(points.map(([r, x]) => new THREE.Vector2(r, x)), seg);
  g.rotateZ(-Math.PI / 2);
  return g;
}
// 直角截面的回转体（法兰、凸台）：每段单独成面，棱角清楚
function latheSharp(points, seg = SEG) {
  const parts = [];
  for (let i = 0; i < points.length - 1; i++) parts.push(lathe([points[i], points[i + 1]], seg));
  return merge(parts);
}
// 薄壁壳：给定外轮廓 [[r,x]...]（x 递增），向内偏移 t 形成封闭截面
function shell(outer, t, seg = SEG) {
  const inner = outer.map(([r, x]) => [r - t, x]).reverse();
  return lathe([...outer, ...inner, outer[0]], seg);
}
// 内轮廓给定、向外加厚
function shellOut(inner, t, seg = SEG) {
  const outer = inner.map(([r, x]) => [r + t, x]);
  return lathe([...outer, ...inner.slice().reverse(), outer[0]], seg);
}
// 法兰环：矩形截面
const flange = (x, r0, r1, w) => latheSharp([[r0, x - w / 2], [r1, x - w / 2], [r1, x + w / 2], [r0, x + w / 2], [r0, x - w / 2]]);
// 绕 X 轴的圆环（管路、联动环）
function torusX(x, R, tube, seg = 120) {
  const g = new THREE.TorusGeometry(R, tube, 10, seg);
  g.rotateY(Math.PI / 2).translate(x, 0, 0);
  return g;
}
function cylX(r, x0, x1, seg = 48) {
  const g = new THREE.CylinderGeometry(r, r, x1 - x0, seg);
  g.rotateZ(-Math.PI / 2);
  g.translate((x0 + x1) / 2, 0, 0);
  return g;
}
// 在角度 phi（从 +Y 转向 +Z）、半径 R 处放一个件
const place = (g, x, R, phi) => g.translate(0, R, 0).rotateX(phi * D2R).translate(x, 0, 0);
const boxAt = (x, R, phi, sx, sr, st) => place(new THREE.BoxGeometry(sx, sr, st), x, R, phi);
// 沿 X 方向的管子（在某个角度、半径上）
const pipeX = (x0, x1, R, phi, r) => cylX(r, x0, x1, 14).translate(0, R * Math.cos(phi * D2R), R * Math.sin(phi * D2R));
// 法兰端面上的一圈螺母（轴向）
function nutRing(x, R, count, s = 0.012, dir = 1) {
  const list = [];
  for (let k = 0; k < count; k++) {
    const g = new THREE.CylinderGeometry(s, s, s * 0.9, 6);
    g.rotateZ(-Math.PI / 2).translate(x + (dir * s * 0.45), R, 0).rotateX(((k + 0.5) / count) * Math.PI * 2);
    list.push(g);
  }
  return merge(list);
}
// 叶片：沿径向 r0→r1，弦长、安装角、弯度、厚度沿展向线性变化；生成在 +Y 方向，切向为 +Z
function bladeGeo(o) {
  const { r0, r1, x, c0, c1 = c0, st0, st1 = st0, sweep = 0, lean = 0, th0 = 0.02, th1 = th0, camber = 0.05, ns = 8, nc = 14 } = o;
  const rings = [];
  for (let j = 0; j <= ns; j++) {
    const s = j / ns;
    const r = r0 + (r1 - r0) * s;
    const c = c0 + (c1 - c0) * s;
    const b = (st0 + (st1 - st0) * s) * D2R;
    const th = th0 + (th1 - th0) * s;
    const xs = x + sweep * s * s;
    const ring = [];
    for (let i = 0; i < nc; i++) {
      const a = (i / nc) * Math.PI * 2;
      const u = 0.5 * Math.cos(a);
      // 前缘圆钝、尾缘尖：厚度分布偏向前缘
      const uu = u + 0.5;
      const tdist = Math.min(1, 2.6 * Math.sqrt(Math.max(0, 1 - uu)) * Math.pow(Math.max(0, uu), 0.5));
      const half = th * 0.5 * tdist * (Math.sin(a) >= 0 ? 1 : -1);
      const v = camber * c * (1 - 4 * u * u) + half + lean * s * s;
      const px = xs + u * c * Math.cos(b) - v * Math.sin(b);
      const pt = u * c * Math.sin(b) + v * Math.cos(b);
      const ang = pt / r;
      ring.push([px, r * Math.cos(ang), r * Math.sin(ang)]);
    }
    rings.push(ring);
  }
  const pos = [];
  const tri = (p, q, w) => pos.push(...p, ...q, ...w);
  for (let j = 0; j < ns; j++) {
    for (let i = 0; i < nc; i++) {
      const a = rings[j][i], b = rings[j][(i + 1) % nc], c = rings[j + 1][i], d = rings[j + 1][(i + 1) % nc];
      tri(a, c, b); tri(b, c, d);
    }
  }
  for (const [ring, flip] of [[rings[0], true], [rings[ns], false]]) {
    const cx = ring.reduce((s, v) => s + v[0], 0) / nc, cy = ring.reduce((s, v) => s + v[1], 0) / nc, cz = ring.reduce((s, v) => s + v[2], 0) / nc;
    for (let i = 0; i < nc; i++) {
      const a = ring[i], b = ring[(i + 1) % nc];
      flip ? tri([cx, cy, cz], b, a) : tri([cx, cy, cz], a, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
// 圆周阵列（绕 X 轴）
function bladeRing(o, count, phase = 0) {
  const one = bladeGeo(o);
  const list = [];
  for (let k = 0; k < count; k++) list.push(one.clone().rotateX(((k + phase) / count) * Math.PI * 2));
  return mergeGeometries(list);
}
// 转子盘：轮缘 + 薄辐板 + 轮毂孔（实心截面）
function disc(x, rRim, w, bore = 0.09, web = 0.012) {
  const hw = w / 2, bw = Math.max(web * 1.8, w * 0.6);
  return latheSharp([
    [bore, x - bw / 2], [bore + 0.035, x - bw / 2], [bore + 0.05, x - web / 2], [rRim - 0.03, x - web / 2], [rRim - 0.02, x - hw], [rRim, x - hw],
    [rRim, x + hw], [rRim - 0.02, x + hw], [rRim - 0.03, x + web / 2], [bore + 0.05, x + web / 2], [bore + 0.035, x + bw / 2], [bore, x + bw / 2], [bore, x - bw / 2],
  ], 96);
}


// 两个入口共用同一套叶片、机匣与附件几何。回调由调用方绑定到场景或可拆零件。
export function buildEngineAssembly(add, MAT) {
const statics = 'static', lpSpool = 'lp', hpSpool = 'hp';
// 流道：内涵外壁（机匣内表面）与内壁（轮毂）半径随 x 变化
const CORE_OUT = [[-1.56, 0.555], [-1.45, 0.52], [-1.15, 0.5], [-0.95, 0.44], [-0.2, 0.36], [-0.12, 0.38], [0.0, 0.44], [0.45, 0.43], [0.55, 0.43], [1.0, 0.5], [1.45, 0.52], [1.62, 0.47]];
const HUB = [[-1.6, 0.33], [-1.15, 0.3], [-0.95, 0.245], [-0.15, 0.29], [0.0, 0.28], [0.5, 0.28], [1.45, 0.3], [1.6, 0.28]];
const coreOut = (x) => interp(CORE_OUT, x);
const hubR = (x) => interp(HUB, x);
const COWL = [[0.56, -1.56], [0.6, -1.52], [0.64, -1.4], [0.67, -1.2], [0.68, -0.6], [0.67, 0.2], [0.64, 0.8], [0.57, 1.3], [0.49, 1.62]];
const cowlR = (x) => interp(COWL.map(([r, xx]) => [xx, r]), x);

// ---------- 短舱：进气唇口 + 外罩蒙皮 + 风扇机匣（带加强筋）+ 外涵道外壁 ----------
add(statics, lathe([
  [1.035, -2.36], [1.05, -2.41], [1.08, -2.43], [1.12, -2.41], [1.15, -2.36], [1.17, -2.28], [1.18, -2.2],
  [1.15, -2.2], [1.1, -2.22], [1.065, -2.25], [1.04, -2.29], [1.035, -2.36],
]), MAT.cowl, 'housing');
add(statics, shell([[1.18, -2.2], [1.195, -2.0], [1.2, -1.6], [1.19, -1.2], [1.16, -0.7], [1.11, -0.2], [1.05, 0.25]], 0.018), MAT.cowl, 'housing');
// 风扇机匣：内壁贴着叶尖，外侧一排加强筋和前后安装边
const FANCASE = [[1.035, -2.32], [1.03, -2.1], [1.028, -1.9], [1.028, -1.6], [1.025, -1.35], [1.02, -1.1]];
add(statics, shellOut(FANCASE, 0.03), MAT.fanCase, 'housing');
add(statics, merge([
  flange(-2.28, 1.05, 1.11, 0.03), flange(-1.13, 1.04, 1.1, 0.03),
  ...[-2.05, -1.9, -1.75, -1.6, -1.45, -1.3].map((x) => flange(x, 1.05, 1.085, 0.012)),
  latheSharp([[1.03, -1.86], [1.032, -1.66]], 160), // 叶尖耐磨涂层带
]), MAT.casingDark, 'housing');
add(statics, merge([nutRing(-2.265, 1.08, 56, 0.009), nutRing(-1.115, 1.072, 56, 0.009)]), MAT.nut, 'housing');
// 外涵道外壁（反推内壁）
add(statics, shellOut([[1.02, -1.1], [1.0, -0.6], [0.97, -0.1], [0.94, 0.25]], 0.02), MAT.fanCase, 'housing');
// 外罩与机匣之间：附件齿轮箱、滑油箱、电子控制器、线束和管路
add(statics, merge([
  boxAt(-1.48, 1.105, 180, 0.42, 0.08, 0.32), // 附件齿轮箱（底部）
  boxAt(-1.55, 1.11, 200, 0.22, 0.06, 0.16), boxAt(-1.42, 1.11, 230, 0.12, 0.07, 0.12), // 电子控制器、泵
  boxAt(-1.8, 1.11, -40, 0.18, 0.05, 0.12), boxAt(-1.45, 1.11, -70, 0.26, 0.06, 0.18), // 滑油箱、阀
  boxAt(-1.0, 1.06, 300, 0.2, 0.04, 0.1),
]), MAT.unit, 'housing');
add(statics, merge([
  torusX(-1.98, 1.09, 0.008), torusX(-1.68, 1.095, 0.007), torusX(-1.38, 1.09, 0.008),
  pipeX(-2.1, -1.2, 1.1, -25, 0.009), pipeX(-2.0, -1.0, 1.1, 160, 0.01), pipeX(-1.9, -1.15, 1.105, 250, 0.008),
]), MAT.pipe, 'housing');
add(statics, merge([torusX(-1.84, 1.1, 0.006), torusX(-1.52, 1.1, 0.006), pipeX(-2.05, -1.1, 1.09, 120, 0.007)]), MAT.harness, 'housing');

// ---------- 核心机：薄外罩 + 机匣（模块间法兰、螺栓）+ 中间的管路与作动筒 ----------
// 分流环（实心唇口）+ 核心机外罩（薄壁）
add(statics, lathe([[0.55, -1.565], [0.575, -1.55], [0.61, -1.5], [0.64, -1.4], [0.665, -1.25], [0.645, -1.25], [0.6, -1.35], [0.565, -1.45], [0.548, -1.53], [0.55, -1.565]]), MAT.cowl, 'housing');
add(statics, shell(COWL.filter(([, x]) => x >= -1.25), 0.016), MAT.cowl, 'housing');
// 核心机机匣：贴着流道外壁的薄壁，外加各模块的安装边
const CASE_IN = CORE_OUT.filter(([x]) => x >= -1.5 && x <= 1.5).map(([x, r]) => [r + 0.002, x]);
add(statics, shellOut(CASE_IN, 0.02), MAT.casing, 'housing');
const JOINTS = [-1.12, -0.97, -0.55, -0.1, 0.48, 0.78, 1.1, 1.47];
add(statics, merge(JOINTS.map((x) => flange(x, coreOut(x) + 0.015, coreOut(x) + 0.055, 0.022))), MAT.casingDark, 'housing');
add(statics, merge(JOINTS.map((x) => nutRing(x + 0.011, coreOut(x) + 0.042, 40, 0.0075))), MAT.nut, 'housing');
// 机匣与外罩之间的东西
{
  // 高压压气机可调静子：每排一圈联动环 + 一圈小摇臂
  const vsvRows = [-0.868, -0.763, -0.658, -0.553];
  add(statics, merge(vsvRows.map((x) => torusX(x + 0.02, coreOut(x) + 0.075, 0.0065))), MAT.pipeSteel, 'housing');
  const levers = [];
  vsvRows.forEach((x) => { for (let k = 0; k < 32; k++) levers.push(boxAt(x + 0.01, coreOut(x) + 0.045, (k / 32) * 360, 0.03, 0.05, 0.008)); });
  add(statics, merge(levers), MAT.nut, 'housing');
  // 作动筒（驱动联动环）
  add(statics, merge([boxAt(-0.72, 0.56, 200, 0.32, 0.05, 0.06), boxAt(-0.72, 0.56, -20, 0.32, 0.05, 0.06), pipeX(-0.9, -0.5, 0.53, 200, 0.012)]), MAT.unitLight, 'housing');
  // 燃油总管 + 喷嘴（喷嘴杆穿过机匣伸进燃烧室）
  add(statics, merge([torusX(0.04, 0.53, 0.012), torusX(0.08, 0.55, 0.009)]), MAT.pipe, 'comb');
  const noz = [];
  for (let k = 0; k < 20; k++) {
    const phi = ((k + 0.5) / 20) * 360;
    noz.push(place(new THREE.CylinderGeometry(0.011, 0.011, 0.19, 10), 0.03, 0.44, phi));
    noz.push(place(new THREE.CylinderGeometry(0.02, 0.02, 0.03, 12), 0.03, 0.53, phi));
    noz.push(place(new THREE.CylinderGeometry(0.019, 0.015, 0.045, 12).rotateZ(-Math.PI / 2).translate(0.025, 0, 0), 0.03, 0.352, phi));
  }
  add(statics, merge(noz), MAT.copper, 'comb');
  // 涡轮间隙主动控制：一组冷却空气环管 + 分配管
  add(statics, merge([0.56, 0.66, 0.86, 1.0, 1.14].map((x) => torusX(x, coreOut(x) + 0.05, 0.01))), MAT.pipeSteel, 'housing');
  add(statics, merge([pipeX(0.5, 1.2, 0.6, -15, 0.018), pipeX(0.5, 1.2, 0.6, 165, 0.018), pipeX(-1.0, 0.5, 0.6, 140, 0.012), pipeX(-1.0, 0.5, 0.61, -70, 0.012)]), MAT.pipe, 'housing');
  // 引气阀、传感器盒、线束
  add(statics, merge([
    boxAt(-0.3, 0.56, -15, 0.16, 0.08, 0.1), boxAt(-0.15, 0.55, 120, 0.12, 0.07, 0.09), boxAt(0.3, 0.57, 250, 0.18, 0.08, 0.12),
    boxAt(0.95, 0.6, 95, 0.14, 0.05, 0.08), boxAt(-0.45, 0.55, 300, 0.1, 0.06, 0.08),
  ]), MAT.unit, 'housing');
  add(statics, merge([torusX(-0.35, 0.6, 0.006), torusX(0.25, 0.6, 0.006), torusX(0.72, 0.6, 0.006), pipeX(-0.95, 1.2, 0.62, 60, 0.007)]), MAT.harness, 'housing');
  // 核心机外罩内侧的支撑框
  add(statics, merge([-0.8, -0.1, 0.6].map((x) => flange(x, cowlR(x) - 0.04, cowlR(x) - 0.016, 0.012))), MAT.casingDark, 'housing');
}

// ---------- 风扇 ----------
add(lpSpool, lathe([[0, -2.28], [0.08, -2.25], [0.17, -2.17], [0.25, -2.05], [0.31, -1.93], [0.335, -1.82], [0.34, -1.6], [0.33, -1.56], [0.2, -1.56]]), MAT.spinner, 'fan', { spool: 'lp' });
add(lpSpool, nutRing(-2.0, 0.27, 12, 0.009, -1), MAT.nut, 'fan', { spool: 'lp' });
const FAN = { r0: 0.33, r1: 1.0, x: -1.76, c0: 0.3, c1: 0.42, st0: 28, st1: 63, sweep: 0.05, lean: 0.02, th0: 0.032, th1: 0.008, camber: 0.07, ns: 22, nc: 24 };
add(lpSpool, bladeRing(FAN, 20), MAT.fan, 'fan', { spool: 'lp' });
// 叶片前缘钛合金包边（略细一圈的亮色前缘）
add(lpSpool, bladeRing({ ...FAN, c0: 0.05, c1: 0.06, x: FAN.x - 0.12, th0: 0.036, th1: 0.01, camber: 0.0 }, 20), MAT.fanEdge, 'fan', { spool: 'lp' });
// 叶根平台
add(lpSpool, latheSharp([[0.322, -1.94], [0.338, -1.92], [0.342, -1.6], [0.322, -1.58]], 160), MAT.disc, 'fan', { spool: 'lp' });
// 出口导向叶片 + 风扇框架支板
add(statics, bladeRing({ r0: 0.66, r1: 1.02, x: -1.2, c0: 0.16, st0: -12, st1: -6, th0: 0.012, camber: 0.08, ns: 8, nc: 12 }, 44), MAT.stator, 'fan');
add(statics, bladeRing({ r0: 0.33, r1: 0.555, x: -1.52, c0: 0.09, st0: 0, th0: 0.022, camber: 0, ns: 3, nc: 12 }, 12), MAT.stator, 'fan');
add(statics, merge([flange(-1.5, 0.31, 0.335, 0.08), flange(-1.2, 0.64, 0.672, 0.2)]), MAT.casingDark, 'fan');

// ---------- 低压压气机（增压级） ----------
add(lpSpool, lathe([[0.28, -1.56], [0.305, -1.5], [0.3, -1.14], [0.26, -1.1], [0.2, -1.1]], 96), MAT.drum, 'lpc', { spool: 'lp' });
[-1.46, -1.33, -1.2].forEach((x, i) => {
  add(lpSpool, bladeRing({ r0: hubR(x) + 0.004, r1: coreOut(x) - 0.01, x, c0: 0.075, c1: 0.065, st0: 35, st1: 52, th0: 0.008, camber: 0.06, ns: 6, nc: 12 }, 32, i * 0.3), MAT.blade, 'lpc', { spool: 'lp' });
  add(lpSpool, disc(x, hubR(x) - 0.005, 0.06, 0.07), MAT.disc, 'lpc', { spool: 'lp' });
  const xs = x + 0.065;
  add(statics, bladeRing({ r0: hubR(xs) + 0.012, r1: coreOut(xs) - 0.004, x: xs, c0: 0.055, st0: -32, th0: 0.007, camber: 0.07, ns: 5, nc: 10 }, 38), MAT.stator, 'lpc');
  add(statics, flange(xs, hubR(xs) + 0.002, hubR(xs) + 0.013, 0.05), MAT.stator, 'lpc');
});

// ---------- 高压压气机 ----------
add(hpSpool, lathe([[0.2, -0.98], [0.243, -0.96], [0.29, -0.16], [0.285, -0.1], [0.2, -0.1]], 96), MAT.drum, 'hpc', { spool: 'hp' });
for (let i = 0; i < 8; i++) {
  const x = -0.92 + i * 0.105;
  add(hpSpool, bladeRing({ r0: hubR(x) + 0.003, r1: coreOut(x) - 0.008, x, c0: 0.05, c1: 0.042, st0: 40, st1: 55, th0: 0.006, camber: 0.05, ns: 5, nc: 12 }, 40, i * 0.37), MAT.blade, 'hpc', { spool: 'hp' });
  add(hpSpool, disc(x, hubR(x) - 0.004, 0.05, 0.125, 0.01), MAT.disc, 'hpc', { spool: 'hp' });
  const xs = x + 0.052;
  add(statics, bladeRing({ r0: hubR(xs) + 0.01, r1: coreOut(xs) - 0.003, x: xs, c0: 0.038, st0: -35, th0: 0.005, camber: 0.06, ns: 4, nc: 10 }, 48), MAT.stator, 'hpc');
  add(statics, flange(xs, hubR(xs) + 0.002, hubR(xs) + 0.011, 0.036), MAT.stator, 'hpc');
}

// ---------- 燃烧室 ----------
// 火焰筒（内外两层壁，带冷却气膜台阶）
add(statics, lathe([[0.31, 0.44], [0.3, 0.16], [0.302, 0.13], [0.306, 0.1], [0.315, 0.06], [0.35, 0.015], [0.395, 0.06], [0.405, 0.1], [0.41, 0.13], [0.415, 0.16], [0.41, 0.44]], 160), MAT.liner, 'comb', { cast: false });
add(statics, merge([0.12, 0.2, 0.28, 0.36].flatMap((x) => [flange(x, 0.296, 0.304, 0.008), flange(x, 0.414, 0.422, 0.008)])), MAT.liner, 'comb');
// 头部旋流器
const swirl = [];
for (let k = 0; k < 20; k++) swirl.push(place(new THREE.CylinderGeometry(0.024, 0.024, 0.02, 14).rotateZ(-Math.PI / 2), 0.035, 0.355, ((k + 0.5) / 20) * 360));
add(statics, merge(swirl), MAT.casingDark, 'comb');
// 燃烧室内外机匣（扩压器）
add(statics, merge([latheSharp([[0.27, -0.08], [0.275, 0.5]], 128), latheSharp([[0.44, -0.08], [0.445, 0.5]], 128)]), MAT.casingDark, 'comb');
const flameMat = MAT.flame;
const flame = add(statics, lathe([[0.322, 0.42], [0.318, 0.18], [0.33, 0.08], [0.355, 0.05], [0.385, 0.08], [0.4, 0.18], [0.398, 0.42]], 96), flameMat, 'comb', { cast: false });
flame.receiveShadow = false;
flame.customDepthMaterial = undefined;

// ---------- 高压涡轮 ----------
add(hpSpool, lathe([[0.12, 0.52], [0.27, 0.52], [0.28, 0.6], [0.27, 0.66], [0.28, 0.74], [0.12, 0.74]], 96), MAT.drum, 'hpt', { spool: 'hp' });
[0.565, 0.705].forEach((x, i) => {
  add(hpSpool, bladeRing({ r0: hubR(x), r1: coreOut(x) - 0.008, x, c0: 0.06, st0: -52, st1: -58, th0: 0.018, camber: 0.13, ns: 6, nc: 14 }, 48), i ? MAT.hpt2 : MAT.hpt1, 'hpt', { spool: 'hp' });
  add(hpSpool, disc(x, hubR(x) - 0.004, 0.07, 0.13, 0.02), MAT.disc, 'hpt', { spool: 'hp' });
  const xs = x - 0.07;
  add(statics, bladeRing({ r0: hubR(xs) + 0.006, r1: coreOut(xs) - 0.002, x: xs, c0: 0.055, st0: 48, th0: 0.018, camber: 0.12, ns: 4, nc: 12 }, 34), MAT.ngv, 'hpt');
  add(statics, flange(xs, hubR(xs) - 0.004, hubR(xs) + 0.007, 0.05), MAT.ngv, 'hpt');
});

// ---------- 低压涡轮 ----------
add(lpSpool, lathe([[0.1, 0.8], [0.27, 0.8], [0.3, 0.9], [0.31, 1.4], [0.27, 1.46], [0.1, 1.46]], 96), MAT.drum, 'lpt', { spool: 'lp' });
for (let i = 0; i < 5; i++) {
  const x = 0.86 + i * 0.12;
  const tip = coreOut(x) - 0.012;
  add(lpSpool, merge([
    bladeRing({ r0: hubR(x) + 0.004, r1: tip, x, c0: 0.055, st0: -48, st1: -55, th0: 0.01, camber: 0.11, ns: 7, nc: 12 }, 56, i * 0.4),
    latheSharp([[tip - 0.002, x - 0.026], [tip + 0.006, x - 0.026], [tip + 0.006, x + 0.026], [tip - 0.002, x + 0.026], [tip - 0.002, x - 0.026]], 128), // 叶冠
  ]), MAT.lpt(i / 4), 'lpt', { spool: 'lp' });
  add(lpSpool, disc(x, hubR(x) - 0.004, 0.05, 0.1), MAT.disc, 'lpt', { spool: 'lp' });
  const xs = x - 0.06;
  add(statics, bladeRing({ r0: hubR(xs) + 0.01, r1: coreOut(xs) - 0.003, x: xs, c0: 0.045, st0: 45, th0: 0.009, camber: 0.1, ns: 4, nc: 10 }, 48), MAT.lpt(i / 4 + 0.15), 'lpt');
  add(statics, flange(xs, hubR(xs) + 0.002, hubR(xs) + 0.012, 0.04), MAT.lpt(i / 4 + 0.15), 'lpt');
}
// 涡轮后机匣支板 + 尾锥 + 核心喷口唇
add(statics, bladeRing({ r0: 0.29, r1: 0.51, x: 1.53, c0: 0.1, st0: 0, th0: 0.026, camber: 0, ns: 3, nc: 12 }, 12), MAT.stator, 'lpt');
add(statics, lathe([[0.1, 1.46], [0.29, 1.47], [0.285, 1.7], [0.24, 1.92], [0.16, 2.12], [0.07, 2.27], [0, 2.32]]), MAT.plug, 'lpt');
add(statics, merge([flange(1.62, 0.468, 0.5, 0.012), flange(1.75, 0.272, 0.29, 0.01), flange(1.95, 0.225, 0.242, 0.01)]), MAT.casingDark, 'lpt');

// ---------- 轴与轴承腔 ----------
add(lpSpool, cylX(0.055, -1.7, 1.5, 32), MAT.shaft, 'shaft', { spool: 'lp' });
const hpShaft = new THREE.CylinderGeometry(0.12, 0.12, 1.7, 48, 1, true);
hpShaft.rotateZ(-Math.PI / 2).translate(-0.15, 0, 0);
add(hpSpool, hpShaft, MAT.shaft, 'shaft', { spool: 'hp' });
add(statics, merge([
  latheSharp([[0.07, -1.62], [0.15, -1.62], [0.15, -1.5], [0.07, -1.5], [0.07, -1.62]], 64),
  latheSharp([[0.13, -1.05], [0.2, -1.05], [0.2, -0.98], [0.13, -0.98], [0.13, -1.05]], 64),
  latheSharp([[0.13, 0.76], [0.19, 0.76], [0.19, 0.8], [0.13, 0.8], [0.13, 0.76]], 64),
  latheSharp([[0.07, 1.47], [0.16, 1.47], [0.16, 1.56], [0.07, 1.56], [0.07, 1.47]], 64),
]), MAT.casingDark, 'shaft');


}
