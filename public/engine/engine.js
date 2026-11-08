// 高涵道比涡扇发动机：程序化建模 + 四分之一剖切 + 双转子旋转 + 气流粒子 + 分段导览
// 坐标：米，发动机轴线沿 X，进气口在 -X，尾喷口在 +X；相机在 +Z、+Y 一侧，剖切掉 y>0 且 z>0 的四分之一外壳。
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// ===================== 导览内容 =====================
const STAGES = [
  {
    code: '00', key: 'overview', tab: '总览', en: 'OVERVIEW',
    sub: '高涵道比涡扇发动机', title: '什么是高涵道比涡扇？',
    body: [
      '空气从风扇进来，从尾喷口出去。其中大部分空气根本不经过燃烧，这正是现代民航发动机省油的秘密。',
      '只有中间一小股空气进入核心机：先被压缩几十倍，再和燃油一起燃烧，燃气推动涡轮，涡轮又反过来带动前面的压气机和风扇。',
    ],
    data: [['截面', '风扇、压气机、燃烧室、涡轮、喷管'], ['转子', '两根轴，各自以不同转速旋转'], ['视图', '外壳切开四分之一，可随时合上']],
    cam: { pos: [-3.2, 2.05, 7.6], target: [0.35, -0.1, 0] },
  },
  {
    code: '01', key: 'fan', tab: '风扇', en: 'FAN',
    sub: '第一级 · 低压转子', title: '风扇：推力的主要来源',
    body: [
      '最前面这一圈宽弦叶片就是风扇。它吸入的空气约 90% 走外圈的外涵道，只被稍稍加速就直接排出，却贡献了约八成的推力。',
      '风扇后面一圈细长的出口导向叶片把气流的旋转“理直”，让它沿轴向喷出，减少能量损失。',
    ],
    data: [['叶片', '18 片宽弦后掠叶片'], ['涵道比', '约 10 : 1'], ['转子', '低压轴，由低压涡轮带动']],
    cam: { pos: [-4.3, 1.5, 2.9], target: [-1.75, 0.2, 0.15] },
  },
  {
    code: '02', key: 'lpc', tab: '低压压气机', en: 'LP COMPRESSOR',
    sub: '增压级 · 低压转子', title: '低压压气机：先压一遍',
    body: [
      '进入核心机的空气先经过三级增压级。每一级是一排转动的转子叶片加一排固定的静子叶片：转子给气流加速，静子把速度变成压力。',
      '增压级和风扇装在同一根轴上，转得比较慢。',
    ],
    data: [['级数', '3 级'], ['压比', '约 1.8'], ['转子', '低压轴']],
    cam: { pos: [-2.15, 1.05, 2.15], target: [-1.3, 0.22, 0.12] },
  },
  {
    code: '03', key: 'hpc', tab: '高压压气机', en: 'HP COMPRESSOR',
    sub: '核心机 · 高压转子', title: '高压压气机：越往后越窄',
    body: [
      '八级高压压气机把空气再压缩十几倍。气体越压越密，流道就越来越窄，叶片也越来越短。',
      '它装在单独的高压轴上，转速比低压轴高得多，由紧跟在燃烧室后面的高压涡轮带动。',
    ],
    data: [['级数', '8 级'], ['总压比', '约 40'], ['转子', '高压轴（转速更高）']],
    cam: { pos: [-1.05, 0.95, 1.95], target: [-0.52, 0.18, 0.1] },
  },
  {
    code: '04', key: 'comb', tab: '燃烧室', en: 'COMBUSTOR',
    sub: '核心机', title: '燃烧室：唯一着火的地方',
    body: [
      '环形燃烧室一圈布置着燃油喷嘴，高压空气和雾化燃油在这里混合燃烧，燃气温度可达 1500 °C 以上。',
      '火焰筒壁上密布小孔，冷空气从小孔贴着壁面流过，形成一层“气膜”，把金属和火焰隔开。',
    ],
    data: [['形式', '环形燃烧室'], ['喷嘴', '20 个燃油喷嘴'], ['冷却', '气膜冷却孔']],
    cam: { pos: [-0.05, 0.9, 1.75], target: [0.22, 0.2, 0.1] },
  },
  {
    code: '05', key: 'hpt', tab: '高压涡轮', en: 'HP TURBINE',
    sub: '核心机 · 高压转子', title: '高压涡轮：在火里转动',
    body: [
      '燃气冲过两级高压涡轮，把能量交给转子，带动高压压气机。这里的燃气温度比叶片材料的熔点还高。',
      '叶片能活下来，靠的是单晶合金、隔热涂层，以及叶片内部的冷却通道。图中的热色表示温度最高的部位。',
    ],
    data: [['级数', '2 级'], ['材料', '单晶镍基合金 + 隔热涂层'], ['转子', '高压轴']],
    cam: { pos: [0.45, 0.9, 1.75], target: [0.64, 0.2, 0.1] },
  },
  {
    code: '06', key: 'lpt', tab: '低压涡轮', en: 'LP TURBINE',
    sub: '低压转子 · 尾喷管', title: '低压涡轮：带动风扇',
    body: [
      '五级低压涡轮从燃气里再取出能量，通过穿过整台发动机中心的细长低压轴，带动最前面的风扇和增压级。',
      '剩下的燃气经尾锥和喷管排出，和外涵的冷气流汇合，形成推力。',
    ],
    data: [['级数', '5 级'], ['传动', '低压轴贯穿全机，连接风扇'], ['排气', '尾锥 + 核心喷管']],
    cam: { pos: [0.75, 1.05, 2.5], target: [1.25, 0.15, 0.1] },
  },
];

const QUIZ = [
  { q: '高涵道比涡扇发动机的大部分推力来自哪里？', a: ['外涵道里被风扇加速的空气', '燃烧室里的火焰', '高压涡轮', '尾锥'], ok: 0, why: '约 90% 的空气走外涵道，虽然只被加速一点，但流量大，贡献了约八成推力。' },
  { q: '是谁带动最前面的风扇？', a: ['高压涡轮', '低压涡轮', '燃烧室', '起动电机'], ok: 1, why: '低压涡轮通过贯穿全机的低压轴带动风扇和增压级。' },
  { q: '两根转子轴中，哪一根转得更快？', a: ['低压轴', '两根一样快', '高压轴'], ok: 2, why: '高压轴更短更轻，直径小，转速比低压轴高得多。' },
  { q: '压气机的“一级”由什么组成？', a: ['两排转子叶片', '一排转子叶片加一排静子叶片', '只有一排静子叶片', '一个燃油喷嘴'], ok: 1, why: '转子给气流加速，紧随其后的静子把速度转换成压力。' },
  { q: '燃气温度比涡轮叶片材料的熔点还高，叶片靠什么撑住？', a: ['内部冷却通道和气膜冷却', '叶片做得很厚', '转得足够快', '往燃气里喷水'], ok: 0, why: '冷空气从叶片内部通道流过并从小孔喷出，在表面形成隔热气膜，再加上隔热涂层。' },
  { q: '风扇后面那一圈出口导向叶片有什么作用？', a: ['点燃燃油', '提高风扇转速', '把旋转的气流理直，减少损失', '支撑尾锥'], ok: 2, why: '风扇出来的气流带有旋转，导向叶片把它转为轴向，回收能量。' },
];

// ===================== DOM =====================
const $ = (s) => document.querySelector(s);
const tabsEl = $('#tabs');
const trackerEl = $('#tracker');
const stepsEl = $('#steps');

STAGES.forEach((s, i) => {
  const tab = document.createElement('button');
  tab.innerHTML = `<i>${s.code}</i>${s.tab}`;
  tab.setAttribute('role', 'tab');
  tab.onclick = () => goStep(i, true);
  tabsEl.appendChild(tab);

  const li = document.createElement('li');
  li.innerHTML = `<button><i>${s.code}</i>${s.en}<em>● 你在这里</em></button>`;
  li.querySelector('button').onclick = () => goStep(i, true);
  trackerEl.appendChild(li);

  const art = document.createElement('article');
  art.className = 'step';
  art.dataset.step = i;
  art.innerHTML = `
    <p class="kicker">${s.code} / ${s.en}</p>
    <p class="sub">${s.sub}</p>
    <h2>${s.title}</h2>
    ${s.body.map((p) => `<p>${p}</p>`).join('')}
    <dl>${s.data.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
  stepsEl.appendChild(art);
});

// ---------- 测验 ----------
const quizForm = $('#quizForm');
QUIZ.forEach((item, qi) => {
  const box = document.createElement('div');
  box.className = 'q';
  box.innerHTML = `<h3><i>0${qi + 1}</i>${item.q}</h3>${item.a.map((t, ai) => `<label><input type="radio" name="q${qi}" value="${ai}" /><span>${t}</span></label>`).join('')}<p class="why">${item.why}</p>`;
  quizForm.appendChild(box);
});
$('#quizSubmit').onclick = () => {
  let score = 0;
  QUIZ.forEach((item, qi) => {
    const box = quizForm.children[qi];
    const picked = quizForm.querySelector(`input[name="q${qi}"]:checked`);
    box.classList.add('done');
    box.querySelectorAll('label').forEach((lb, ai) => {
      lb.classList.toggle('right', ai === item.ok);
      lb.classList.toggle('wrong', picked && +picked.value === ai && ai !== item.ok);
    });
    if (picked && +picked.value === item.ok) score++;
  });
  $('#score').textContent = `${score} / ${QUIZ.length}`;
  $('#quizSubmit').hidden = true;
  $('#quizRetry').hidden = false;
};
$('#quizRetry').onclick = () => {
  quizForm.reset();
  [...quizForm.children].forEach((b) => { b.classList.remove('done'); b.querySelectorAll('label').forEach((l) => l.classList.remove('right', 'wrong')); });
  $('#score').textContent = `0 / ${QUIZ.length}`;
  $('#quizSubmit').hidden = false;
  $('#quizRetry').hidden = true;
};

// ===================== 三维场景 =====================
const canvas = $('#engineCanvas');
const viewer = $('#viewer');
const isTouch = matchMedia('(pointer: coarse)').matches;
$('#hint').innerHTML = isTouch ? '<b>双指</b> 旋转视角' : '<b>拖动</b> 旋转视角 · <b>滚动</b> 浏览各级';

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  $('#loading').hidden = true;
  $('#nogl').hidden = false;
  throw e;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.localClippingEnabled = true;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = gradientTexture('#122033', '#070b12');

function gradientTexture(top, bottom) {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, top); grd.addColorStop(1, bottom);
  g.fillStyle = grd; g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 摄影棚反射环境：深色背景 + 几条亮灯带，让金属件出现清晰的高光
function studioEnv() {
  const env = new THREE.Scene();
  const dome = new THREE.SphereGeometry(50, 32, 16);
  const cols = [];
  const p = dome.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / 50;
    const v = y > 0 ? 0.16 + 0.22 * y : 0.16 * (1 + y);
    cols.push(v * 0.85, v * 0.92, v * 1.05);
  }
  dome.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  env.add(new THREE.Mesh(dome, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const box = (w, h, power, x, y, z, tint = [1, 1, 1]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(power * tint[0], power * tint[1], power * tint[2]), side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m);
  };
  box(30, 8, 5, 0, 34, 8);
  box(5, 30, 7, -30, 6, 22);
  box(5, 30, 4, 32, 4, 16, [0.85, 0.92, 1.1]);
  box(22, 6, 3, 0, 8, -36, [0.8, 0.9, 1.1]);
  box(14, 10, 2.5, -8, 12, 34);
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(env, 0.03).texture;
  pm.dispose();
  return tex;
}
scene.environment = studioEnv();

const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 100);
camera.position.set(...STAGES[0].cam.pos);
const controls = new OrbitControls(camera, canvas);
controls.target.set(...STAGES[0].cam.target);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.enableZoom = isTouch;          // 电脑上滚轮用来滚动页面浏览各级
controls.minDistance = 1.2;
controls.maxDistance = 12;
controls.touches = { ONE: null, TWO: THREE.TOUCH.DOLLY_ROTATE }; // 单指留给页面滚动，双指旋转/缩放

scene.add(new THREE.HemisphereLight(0xa9c2e0, 0x0b1018, 0.55));
const key = new THREE.DirectionalLight(0xfff3e6, 2.2);
key.position.set(-3, 5, 6);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -3.5, right: 3.5, top: 3, bottom: -3, near: 1, far: 20 });
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.01;
scene.add(key);
const rim = new THREE.DirectionalLight(0x9cc4ff, 1.1);
rim.position.set(4, 2, -5);
scene.add(rim);

// ===================== 剖切 =====================
// 两个平面取交集：切掉 y>c 且 z>c 的四分之一。c 从 3 动画到 0，外壳像盖子一样打开。
const cutY = new THREE.Plane(new THREE.Vector3(0, -1, 0), 3);
const cutZ = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
const CUT = [cutY, cutZ];

// 剖切材质：被切到的封闭薄壁件，从切口看进去是它的“背面”，统一画成平涂的截面色，
// 读起来就像实心的剖面（CAD 剖视图的效果）；正面照常走 PBR 光照。
const CAP = new THREE.Color('#d9dee4');
function cutMaterial(opts, cap = CAP) {
  const m = new THREE.MeshPhysicalMaterial({ side: THREE.DoubleSide, clippingPlanes: CUT, clipIntersection: true, ...opts });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uCap = { value: cap };
    sh.fragmentShader = sh.fragmentShader
      .replace('void main() {', 'uniform vec3 uCap;\nvoid main() {')
      .replace('#include <opaque_fragment>', '#include <opaque_fragment>\n if (!gl_FrontFacing) gl_FragColor = vec4(uCap, 1.0);');
  };
  return m;
}
const pbr = (o) => new THREE.MeshPhysicalMaterial({ side: THREE.DoubleSide, ...o });

const MAT = {
  // 外壳类（剖切）
  cowl: cutMaterial({ color: '#e4e8ec', metalness: 0.35, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.2 }, new THREE.Color('#eef1f4')),
  fanCase: cutMaterial({ color: '#b8c0c8', metalness: 0.85, roughness: 0.34 }, new THREE.Color('#c9d0d7')),
  casing: cutMaterial({ color: '#a9b2bb', metalness: 0.9, roughness: 0.3 }, new THREE.Color('#c4cbd2')),
  casingDark: cutMaterial({ color: '#6f7880', metalness: 0.9, roughness: 0.38 }, new THREE.Color('#9aa3ab')),
  liner: cutMaterial({ color: '#d8d2c8', metalness: 0.9, roughness: 0.36 }, new THREE.Color('#e8dccb')),
  // 机匣与外罩之间的管路附件（也剖切，像剖视图里一样被切开）
  pipe: cutMaterial({ color: '#b87a4a', metalness: 1, roughness: 0.28 }, new THREE.Color('#d39a6a')),
  pipeSteel: cutMaterial({ color: '#c3c9cf', metalness: 1, roughness: 0.22 }, new THREE.Color('#d7dce0')),
  unit: cutMaterial({ color: '#4a535c', metalness: 0.6, roughness: 0.45 }, new THREE.Color('#7d868e')),
  unitLight: cutMaterial({ color: '#8d969f', metalness: 0.8, roughness: 0.35 }, new THREE.Color('#aab2ba')),
  harness: cutMaterial({ color: '#2b2f33', metalness: 0.1, roughness: 0.6 }, new THREE.Color('#4a4f55')),
  nut: cutMaterial({ color: '#cdd3d9', metalness: 1, roughness: 0.25 }, new THREE.Color('#dfe3e7')),
  // 转动件与静子（不剖切）
  fan: pbr({ color: '#b3bbc4', metalness: 1, roughness: 0.2 }),
  fanEdge: pbr({ color: '#dfe4e9', metalness: 1, roughness: 0.14 }),
  spinner: pbr({ color: '#e9ecef', metalness: 0.4, roughness: 0.22, clearcoat: 0.8 }),
  blade: pbr({ color: '#cfd5dc', metalness: 1, roughness: 0.24 }),
  stator: pbr({ color: '#99a3ad', metalness: 1, roughness: 0.3 }),
  disc: pbr({ color: '#8f99a3', metalness: 1, roughness: 0.28 }),
  drum: pbr({ color: '#a5aeb7', metalness: 1, roughness: 0.26 }),
  shaft: pbr({ color: '#8d969f', metalness: 1, roughness: 0.22 }),
  hpt1: pbr({ color: '#d99a62', metalness: 1, roughness: 0.3, emissive: '#ff5a14', emissiveIntensity: 0.22 }),
  hpt2: pbr({ color: '#c99468', metalness: 1, roughness: 0.3, emissive: '#ff4a10', emissiveIntensity: 0.1 }),
  ngv: pbr({ color: '#cf8e58', metalness: 1, roughness: 0.34, emissive: '#ff4a10', emissiveIntensity: 0.18 }),
  lpt: (k) => pbr({ color: new THREE.Color('#c9a07a').lerp(new THREE.Color('#b8bec6'), k), metalness: 1, roughness: 0.28 }),
  plug: pbr({ color: '#8f8a84', metalness: 1, roughness: 0.4 }),
  copper: pbr({ color: '#c07a46', metalness: 1, roughness: 0.3 }),
};
const GHOST = new THREE.MeshBasicMaterial({ color: '#6f8fac', wireframe: true, transparent: true, opacity: 0.025, depthWrite: false });

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

// ===================== 发动机建模 =====================
const engine = new THREE.Group();
scene.add(engine);
const lpSpool = new THREE.Group();
const hpSpool = new THREE.Group();
const statics = new THREE.Group();
engine.add(lpSpool, hpSpool, statics);
const meshes = [];
const cutDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, clippingPlanes: CUT, clipIntersection: true, side: THREE.DoubleSide });
function add(parent, geo, mat, section, opts = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.userData = { section, spool: opts.spool || null, mat };
  m.castShadow = opts.cast !== false;
  m.receiveShadow = true;
  // 剖切件投影时也按剖切后的形状算，切掉的部分不再挡住内部的光
  if (mat.clippingPlanes) m.customDepthMaterial = cutDepth;
  parent.add(m);
  meshes.push(m);
  return m;
}

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
const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 1.3, 0.45), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, clippingPlanes: CUT, clipIntersection: true });
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

// ===================== 气流 =====================
// 每个粒子：流（0 外涵 / 1 内涵）、x 位置、在流道内的径向比例、角度
const BYPASS = [[-3.8, 0.45, 1.6], [-2.45, 0.5, 1.0], [-1.9, 0.62, 1.0], [-1.55, 0.61, 1.0], [-1.2, 0.69, 0.99], [0.25, 0.69, 0.93], [1.6, 0.52, 1.08], [3.6, 0.5, 1.3]];
const CORE = [[-3.8, 0.0, 0.42], [-2.45, 0.12, 0.45], [-1.9, 0.34, 0.55], [-1.56, 0.34, 0.54], ...CORE_OUT.slice(1).map(([x, r]) => [x, hubR(x) + 0.01, r - 0.012]), [2.3, 0.0, 0.42], [4.2, 0.0, 0.85]];
const band = (tab, x) => {
  let i = 1;
  while (i < tab.length - 1 && x > tab[i][0]) i++;
  const [x0, a0, b0] = tab[i - 1], [x1, a1, b1] = tab[i];
  const t = Math.min(1, Math.max(0, (x - x0) / (x1 - x0)));
  return [a0 + (a1 - a0) * t, b0 + (b1 - b0) * t];
};
const N_BY = isTouch ? 3200 : 5200;
const N_CORE = isTouch ? 1600 : 2600;
const N = N_BY + N_CORE;
const pPos = new Float32Array(N * 3);
const pCol = new Float32Array(N * 3);
const P = Array.from({ length: N }, (_, i) => ({ core: i >= N_BY, x: -3.8 + Math.random() * 7.6, f: Math.random(), a: Math.random() * Math.PI * 2, v: 0.8 + Math.random() * 0.5 }));
function sprite() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const flowGeo = new THREE.BufferGeometry();
flowGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
flowGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
const flowMat = new THREE.PointsMaterial({ size: 0.036, map: sprite(), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true, opacity: 0.85 });
const flow = new THREE.Points(flowGeo, flowMat);
flow.frustumCulled = false;
engine.add(flow);
const tmpC = new THREE.Color();
function coreColor(x, out) {
  // 冷空气蓝 → 压缩后发白 → 燃烧室白热 → 涡轮后橙红
  const stops = [[-3.8, [0.25, 0.55, 1.0]], [-0.9, [0.45, 0.7, 1.0]], [-0.15, [0.9, 0.9, 1.0]], [0.1, [1.6, 1.3, 0.85]], [0.5, [1.5, 0.8, 0.28]], [1.5, [1.2, 0.5, 0.16]], [3.0, [1.2, 0.35, 0.08]], [4.2, [0.3, 0.06, 0.02]]];
  let i = 1;
  while (i < stops.length - 1 && x > stops[i][0]) i++;
  const [x0, c0] = stops[i - 1], [x1, c1] = stops[i];
  const t = Math.min(1, Math.max(0, (x - x0) / (x1 - x0)));
  out.setRGB(c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t);
}
function updateFlow(dt) {
  for (let i = 0; i < N; i++) {
    const p = P[i];
    const tab = p.core ? CORE : BYPASS;
    // 内涵在压气机里减速、在涡轮后加速；外涵基本匀速
    const speed = p.core ? (p.x < -0.1 ? 1.25 : p.x < 1.6 ? 1.6 : 2.6) : 1.7;
    p.x += speed * p.v * dt;
    const xmax = p.core ? 4.2 : 3.6;
    if (p.x > xmax) { p.x = -3.8 + Math.random() * 0.4; p.f = Math.random(); p.a = Math.random() * Math.PI * 2; }
    // 风扇后带一点旋流，经过导向叶片后消失
    if (p.x > -1.85 && p.x < -1.25) p.a += dt * 1.2;
    const [r0, r1] = band(tab, p.x);
    const r = r0 + (r1 - r0) * p.f;
    pPos[i * 3] = p.x;
    pPos[i * 3 + 1] = r * Math.cos(p.a);
    pPos[i * 3 + 2] = r * Math.sin(p.a);
    if (p.core) coreColor(p.x, tmpC);
    else {
      const fade = p.x > 1.2 ? Math.max(0, 1 - (p.x - 1.2) / 2.4) : p.x < -3.0 ? Math.max(0, (p.x + 3.8) / 0.8) : 1;
      tmpC.setRGB(0.22 * fade, 0.5 * fade, 1.0 * fade);
    }
    if (p.core && p.x < -3.0) tmpC.multiplyScalar(Math.max(0, (p.x + 3.8) / 0.8));
    pCol[i * 3] = tmpC.r; pCol[i * 3 + 1] = tmpC.g; pCol[i * 3 + 2] = tmpC.b;
  }
  flowGeo.attributes.position.needsUpdate = true;
  flowGeo.attributes.color.needsUpdate = true;
}

// 尾焰：沿 +X 的锥形外壳，着色器做中心亮、边缘淡、向后衰减并闪烁
function plume(r0, r1, len, x0, power) {
  const g = new THREE.CylinderGeometry(r1, r0, len, 64, 24, true);
  g.rotateZ(-Math.PI / 2).translate(x0 + len / 2, 0, 0);
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uOn: { value: 1 }, uPow: { value: power } },
    vertexShader: `
      varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uTime; uniform float uOn; uniform float uPow;
      varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main() {
        float t = vUv.y;                             // 0 = 喷口，1 = 尾端
        float face = pow(abs(dot(normalize(vN), normalize(vV))), 2.2);
        float n = 0.5 + 0.5 * sin(vUv.x * 37.0 + uTime * 9.0 - t * 30.0) * sin(vUv.x * 13.0 - uTime * 5.0 + t * 11.0);
        float fall = pow(1.0 - t, 1.7) * smoothstep(0.0, 0.04, t);
        float a = face * fall * (0.7 + 0.3 * n) * uOn * uPow;
        vec3 hot = vec3(1.0, 0.95, 0.78) * 3.2;
        vec3 mid = vec3(1.0, 0.55, 0.12) * 2.2;
        vec3 cool = vec3(0.7, 0.16, 0.04);
        vec3 c = mix(hot, mid, smoothstep(0.0, 0.3, t));
        c = mix(c, cool, smoothstep(0.3, 0.85, t));
        gl_FragColor = vec4(c * a, a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.renderOrder = 2;
  engine.add(mesh);
  return mesh;
}
const plumes = [plume(0.42, 0.85, 3.4, 1.62, 1.0), plume(0.3, 0.12, 1.5, 1.62, 1.4)];

// ===================== 渲染管线 =====================
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.4, 0.95);
composer.addPass(bloom);
composer.addPass(new OutputPass());

function resize() {
  const w = viewer.clientWidth, h = viewer.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  camera.aspect = w / h;
  // 竖屏时拉远一点，保证整台发动机放得下
  camera.fov = w / h < 1.2 ? 44 : 32;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(viewer);
resize();

// ===================== 交互状态 =====================
const state = { stage: 0, cut: false, cutManual: null, iso: false, spin: true, flow: true, cutT: 0 };
const btn = (k) => document.querySelector(`[data-toggle="${k}"]`);
function syncButtons() {
  btn('cut').setAttribute('aria-pressed', String(cutOn()));
  btn('iso').setAttribute('aria-pressed', String(state.iso));
  btn('spin').setAttribute('aria-pressed', String(state.spin));
  btn('flow').setAttribute('aria-pressed', String(state.flow));
}
// 默认剖切；用户手动切换后以手动为准，直到换到下一步
const cutOn = () => (state.cutManual ?? true);
btn('cut').onclick = () => { state.cutManual = !cutOn(); syncButtons(); };
btn('iso').onclick = () => { state.iso = !state.iso; applyIsolate(); syncButtons(); };
btn('spin').onclick = () => { state.spin = !state.spin; syncButtons(); };
btn('flow').onclick = () => { state.flow = !state.flow; flow.visible = state.flow; syncButtons(); };

function applyIsolate() {
  const key = STAGES[state.stage].key;
  for (const m of meshes) {
    let keep = true;
    if (state.iso) keep = key === 'overview' ? !!m.userData.spool : m.userData.section === key;
    m.material = keep ? m.userData.mat : GHOST;
    m.castShadow = keep && m.userData.section !== 'housing';
  }
}

// 相机过渡
let tween = null;
function flyTo(cam) {
  tween = { t: 0, p0: camera.position.clone(), t0: controls.target.clone(), p1: new THREE.Vector3(...cam.pos), t1: new THREE.Vector3(...cam.target) };
  if (viewer.clientWidth / viewer.clientHeight < 1.2) {
    // 竖屏：沿视线方向再退远一些
    const d = tween.p1.clone().sub(tween.t1);
    tween.p1 = tween.t1.clone().add(d.multiplyScalar(1.5));
  }
}
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function setStage(i) {
  if (i === state.stage && tabsEl.children[i].classList.contains('on')) return;
  state.stage = i;
  state.cutManual = null;
  [...tabsEl.children].forEach((b, k) => b.classList.toggle('on', k === i));
  [...trackerEl.children].forEach((li, k) => li.classList.toggle('on', k === i));
  tabsEl.children[i].scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  flyTo(STAGES[i].cam);
  applyIsolate();
  syncButtons();
}
function goStep(i, scroll) {
  setStage(i);
  if (scroll) {
    const art = stepsEl.children[i];
    const y = art.getBoundingClientRect().top + scrollY - (innerWidth <= 900 ? viewer.parentElement.offsetHeight + 60 : 90);
    lockObserver = performance.now() + 900;
    scrollTo({ top: y, behavior: 'smooth' });
  }
}
// 滚动到哪一段文字，就切到哪一级
let lockObserver = 0;
const io = new IntersectionObserver((entries) => {
  if (performance.now() < lockObserver) return;
  const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
  if (vis) setStage(+vis.target.dataset.step);
}, { rootMargin: innerWidth <= 900 ? '-62% 0px -30% 0px' : '-40% 0px -45% 0px', threshold: [0, 0.01] });
[...stepsEl.children].forEach((a) => io.observe(a));

// 拖动过就淡出操作提示
controls.addEventListener('start', () => { $('#hint').style.opacity = '0'; tween = null; });

// 不在视口内时暂停渲染
let onScreen = true;
new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; }).observe(viewer);

// ===================== 主循环 =====================
const clock = new THREE.Clock();
let time = 0;
let frozen = false;
let frames = 0;
const freezeAt = +(new URLSearchParams(location.search).get('frames') || 0);
function frame() {
  if (frozen) return;
  if (freezeAt && ++frames > freezeAt) { frozen = true; return; }
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (!onScreen) return;
  time += dt;

  if (tween) {
    tween.t = Math.min(1, tween.t + dt / 1.3);
    const k = ease(tween.t);
    camera.position.lerpVectors(tween.p0, tween.p1, k);
    controls.target.lerpVectors(tween.t0, tween.t1, k);
    if (tween.t >= 1) tween = null;
  }
  controls.update();

  // 剖切开合
  const goal = cutOn() ? 1 : 0;
  state.cutT += (goal - state.cutT) * Math.min(1, dt * 3.2);
  cutY.constant = 3 * (1 - ease(Math.min(1, state.cutT * 1.02)));

  if (state.spin) {
    lpSpool.rotation.x += dt * 2.4;
    hpSpool.rotation.x += dt * 4.1;
  }
  if (state.flow) {
    updateFlow(state.spin ? dt : dt * 0.15);
    plumes.forEach((m) => { m.visible = true; m.material.uniforms.uTime.value = time; });
    flameMat.opacity = 0.56 + 0.08 * Math.sin(time * 23) * Math.sin(time * 7.3);
  } else {
    plumes.forEach((m) => { m.visible = false; });
    flameMat.opacity = 0.25;
  }

  composer.render();
}

$('#loading').hidden = true;
setStage(0);
syncButtons();
updateFlow(0);
frame();

// 调试：?shot=stageIndex 直接跳到某一级（用于截图检查）
const shot = new URLSearchParams(location.search).get('shot');
if (shot !== null) {
  lockObserver = Infinity;
  state.cutT = 1;
  setStage(+shot);
  tween && (tween.t = 0.999);
}
