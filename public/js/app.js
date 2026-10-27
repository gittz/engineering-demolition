import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildShapeGeometry, makeMaterial, MATERIAL_LABEL, PALETTE } from './geometry.js';
import { normalizeModel } from './normalize.js';
import { SAMPLES } from './samples.js';
import { prepareImage, formatBytes } from './compress.js';

const $ = (id) => document.getElementById(id);
const DEG = Math.PI / 180;
const TARGET_SIZE = 10; // 模型统一缩放到约 10 个场景单位
const ACCENT = 0x3fc1a6;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');

// ---------------- 本地存储（失败时静默降级） ----------------
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
};
const HISTORY_KEY = 'teardown.history.v1';
const LAST_KEY = 'teardown.last.v1';
const CODE_KEY = 'teardown.code.v1';
const THEME_KEY = 'teardown.theme.v1';
let history = store.get(HISTORY_KEY, []);

function saveHistory() {
  history = history.slice(0, 12);
  while (!store.set(HISTORY_KEY, history)) {
    const withPhoto = [...history].reverse().find((h) => h.photo);
    if (withPhoto) { withPhoto.photo = null; continue; }
    if (history.length > 1) { history.pop(); continue; }
    break;
  }
}

const state = {
  item: null,
  model: null,
  entries: [],
  ordered: [],
  selected: null,
  hovered: null,
  mode: 'overview',
  xray: 'transparent',
  explodeAmount: 1,
  colorMode: 'material',
  solo: false,
  step: 0,
  playTimer: null,
  view: 'iso',
  aiEnabled: false,
  motionTime: 0,
  motionPlaying: true,
  motionSpeed: 1,
};

let dirty = true; // 按需渲染标记（见 tick）
function invalidate() { dirty = true; }

// ---------------- Three.js 场景 ----------------
const viewport = $('viewport');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
// Neutral 色调映射：保留材质本色和纯白背景（ACES 会让白色发灰、颜色变淡）
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.localClippingEnabled = true;
viewport.appendChild(renderer.domElement);

const scene = new THREE.Scene();
// 摄影棚环境光：渐变穹顶 + 几块柔光箱（顶光、左右条形灯、背光）。
// 金属件会映出干净的光带，透明件只有柔和的高光，不会映出杂物。
function studioEnvironment() {
  const env = new THREE.Scene();
  const dome = new THREE.SphereGeometry(60, 48, 24);
  const pos = dome.attributes.position;
  const cols = [];
  const top = new THREE.Color(0.62, 0.66, 0.72);
  const mid = new THREE.Color(0.32, 0.35, 0.39);
  const bot = new THREE.Color(0.06, 0.07, 0.08);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 60;
    const c = y > 0 ? mid.clone().lerp(top, y) : mid.clone().lerp(bot, Math.min(1, -y * 1.6));
    cols.push(c.r, c.g, c.b);
  }
  dome.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  env.add(new THREE.Mesh(dome, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const softbox = (w, h, power, x, y, z) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(power, power, power), side: THREE.DoubleSide }),
    );
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    env.add(m);
  };
  softbox(36, 14, 5, 0, 40, 6);     // 顶部大柔光箱
  softbox(8, 34, 3.2, -38, 8, 14);  // 左侧条形灯
  softbox(8, 34, 2.4, 38, 8, 10);   // 右侧条形灯
  softbox(30, 10, 1.6, 0, 12, -40); // 背光
  const tex = pmrem.fromScene(env, 0.02).texture;
  env.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
  return tex;
}
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = studioEnvironment();

const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 500);
camera.position.set(16, 11, 18);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 1.5;
controls.maxDistance = 90;

const hemi = new THREE.HemisphereLight(0xffffff, 0xb9c3cb, 0.55);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(8, 18, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 70 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
scene.add(sun);
const fill = new THREE.DirectionalLight(0xdfe9ff, 0.45);
fill.position.set(-12, 6, -8);
scene.add(fill);
// 轮廓光（深色背景时从背后勾出零件边缘）
const rim = new THREE.DirectionalLight(0xa8dcff, 0);
rim.position.set(-6, 9, -16);
scene.add(rim);

const grid = new THREE.GridHelper(60, 120, 0xc0c8ce, 0xd8dee2);
grid.material.transparent = true;
grid.material.opacity = 0.75;
scene.add(grid);
const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.ShadowMaterial({ opacity: 0.13 }));
shadowPlane.rotation.x = -Math.PI / 2;
shadowPlane.receiveShadow = true;
scene.add(shadowPlane);

const modelRoot = new THREE.Group();
scene.add(modelRoot);
const sectionPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0); // 剖掉 z>0 的前半部分

// ---------------- 后期处理：环境光遮蔽（GTAO）----------------
// 让零件之间的缝隙、贴合处自然变暗，立体感明显提升。手机等触屏设备关闭以保证流畅。
class SolidGTAOPass extends GTAOPass {
  overrideVisibility() {
    super.overrideVisibility();
    // 透明/半透明件不参与遮蔽计算，否则透明外壳会在内部零件上投下"脏"的阴影
    this.scene.traverse((o) => {
      if (o.isMesh && o.visible && (o.material?.transparent || o.material?.isShadowMaterial)) o.visible = false;
    });
  }
  // 计算法线/深度时不能画背景图，否则背景会被当成"表面"参与遮蔽计算，产生灰雾和色块
  renderOverride(renderer, overrideMaterial, renderTarget, clearColor, clearAlpha) {
    const bg = this.scene.background;
    this.scene.background = null;
    super.renderOverride(renderer, overrideMaterial, renderTarget, clearColor, clearAlpha);
    this.scene.background = bg;
  }
}
// 地址栏加 ?ao=0 可强制关闭（显卡较弱时），?ao=1 可在触屏设备上强制开启
const AO_PARAM = new URLSearchParams(location.search).get('ao');
const AO_SUPPORTED = AO_PARAM ? AO_PARAM !== '0' : !window.matchMedia('(pointer: coarse)').matches;
let composer = null;
let gtao = null;
if (AO_SUPPORTED) {
  try {
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(scene, camera));
    gtao = new SolidGTAOPass(scene, camera, 1, 1);
    gtao.blendIntensity = 0.85;
    gtao.updateGtaoMaterial({ radius: 0.7, distanceExponent: 2, thickness: 2, scale: 1.2, samples: 16 });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
    composer.addPass(gtao);
    composer.addPass(new OutputPass());
  } catch (err) {
    console.warn('AO 不可用，已回退普通渲染', err);
    composer = null;
    gtao = null;
  }
}
function renderFrame() {
  if (composer && gtao?.enabled) composer.render();
  else renderer.render(scene, camera);
}

// ---------------- 展示背景：浅色工作室 / 深色展厅 ----------------
function gradientTexture(inner, outer) {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(256, 190, 20, 256, 256, 420);
  grd.addColorStop(0, inner);
  grd.addColorStop(1, outer);
  g.fillStyle = grd;
  g.fillRect(0, 0, 512, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const THEMES = {
  light: {
    bg: gradientTexture('#fbfcfd', '#dfe5e9'), grid: [0xc0c8ce, 0xd8dee2], gridOpacity: 0.75, shadow: 0.13,
    hemi: [0xffffff, 0xb9c3cb, 0.5], sun: 1.4, fill: 0.4, rim: 0, env: 0.9, exposure: 1.0,
  },
  dark: {
    bg: gradientTexture('#24313d', '#090e13'), grid: [0x34434f, 0x1c2630], gridOpacity: 0.9, shadow: 0.42,
    hemi: [0xcfe3ff, 0x111820, 0.3], sun: 1.6, fill: 0.3, rim: 1.4, env: 0.8, exposure: 1.0,
  },
};
function applyTheme(name) {
  const t = THEMES[name] || THEMES.light;
  state.theme = THEMES[name] ? name : 'light';
  scene.background = t.bg;
  // GridHelper 每条刻度 4 个顶点（两条线），中心那组用主色
  const colors = grid.geometry.attributes.color;
  const c1 = new THREE.Color(t.grid[0]);
  const c2 = new THREE.Color(t.grid[1]);
  const centerIdx = colors.count / 8;
  for (let k = 0; k < colors.count; k++) {
    const c = Math.floor(k / 4) === Math.floor(centerIdx) ? c1 : c2;
    colors.setXYZ(k, c.r, c.g, c.b);
  }
  colors.needsUpdate = true;
  grid.material.opacity = t.gridOpacity;
  shadowPlane.material.opacity = t.shadow;
  hemi.color.setHex(t.hemi[0]);
  hemi.groundColor.setHex(t.hemi[1]);
  hemi.intensity = t.hemi[2];
  sun.intensity = t.sun;
  fill.intensity = t.fill;
  rim.intensity = t.rim;
  scene.environmentIntensity = t.env;
  renderer.toneMappingExposure = t.exposure;
  $('stage').dataset.theme = state.theme;
  store.set(THEME_KEY, state.theme);
  dirty = true;
}

function resize() {
  const w = viewport.clientWidth, h = viewport.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  if (composer) {
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(w, h);
  }
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  invalidate();
}
new ResizeObserver(resize).observe(viewport);
resize();

// ---------------- 构建模型 ----------------
function disposeModel() {
  modelRoot.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  for (const e of state.entries) { e.mat.dispose(); e.wireMat.dispose(); e.lineMat.dispose(); }
  modelRoot.clear();
  state.entries = [];
}

function buildModel(model) {
  disposeModel();
  const inner = new THREE.Group();
  modelRoot.add(inner);
  const groups = [...new Set(model.parts.map((p) => p.group))];

  model.parts.forEach((p, idx) => {
    const g = new THREE.Group();
    g.position.fromArray(p.position);
    g.rotation.set(p.rotation[0] * DEG, p.rotation[1] * DEG, p.rotation[2] * DEG);
    const mat = makeMaterial(p.material, p.color);
    const groupColor = new THREE.Color(PALETTE[groups.indexOf(p.group) % PALETTE.length]);
    const entry = {
      part: p, idx, obj: g, meshes: [], edges: [], mat, groupColor,
      matColor: mat.color.clone(),
      baseOpacity: mat.userData.baseOpacity,
      basePos: g.position.clone(),
      baseQuat: g.quaternion.clone(),
      motion: p.motion || null,
      explodeVec: new THREE.Vector3(),
      t: 0, tTarget: 0, hidden: false,
      wireMat: new THREE.MeshBasicMaterial({ color: mat.color.clone(), transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide }),
      lineMat: new THREE.LineBasicMaterial({ color: 0x22313c, transparent: true, opacity: 0.9 }),
    };
    for (const s of p.shapes) {
      let geo;
      try { geo = buildShapeGeometry(s); } catch { geo = new THREE.BoxGeometry(2, 2, 2); }
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.fromArray(s.position);
      mesh.rotation.set(s.rotation[0] * DEG, s.rotation[1] * DEG, s.rotation[2] * DEG);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.entry = entry;
      g.add(mesh);
      entry.meshes.push(mesh);
    }
    inner.add(g);
    state.entries.push(entry);
  });

  // 以 mm 计算包围盒
  inner.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(inner);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const hasExplode = model.parts.some((p) => p.explode && (p.explode[0] || p.explode[1] || p.explode[2]));
  for (const e of state.entries) {
    const b = new THREE.Box3().setFromObject(e.obj);
    e.sizeMM = b.getSize(new THREE.Vector3());
    e.boxMM = b;
    if (hasExplode && e.part.explode) {
      e.explodeVec.fromArray(e.part.explode);
    } else {
      // AI 没给爆炸位移时的兜底：按离中心的偏移放大，再沿径向推出一段
      const off = b.getCenter(new THREE.Vector3()).sub(center);
      const dir = off.lengthSq() < 1e-6 ? new THREE.Vector3(0, 1, 0) : off.clone().normalize();
      e.explodeVec.copy(off.multiplyScalar(1.3).addScaledVector(dir, maxDim * 0.22));
    }
  }
  const s = TARGET_SIZE / maxDim;
  inner.scale.setScalar(s);
  inner.position.copy(center).multiplyScalar(-s);
  modelRoot.updateMatrixWorld(true);
  state.scale = s;
  state.centerY = center.y;
  updateFloor(true);

  state.ordered = [...state.entries].sort((a, b) =>
    groups.indexOf(a.part.group) - groups.indexOf(b.part.group) || a.part.order - b.part.order);
  state.ordered.forEach((e, i) => { e.listNo = i + 1; });
  state.groups = groups;
  state.sizeMM = size;
}

// 地面跟随：始终位于当前（含爆炸位移）最低点下方
let floorY = 0;
function updateFloor(instant = false) {
  if (!state.entries.length) return;
  let min = Infinity;
  for (const e of state.entries) min = Math.min(min, e.boxMM.min.y + e.explodeVec.y * e.tTarget * state.explodeAmount);
  const target = (min - state.centerY) * state.scale - 0.08;
  const prev = floorY;
  floorY = instant || Math.abs(target - floorY) < 1e-4 ? target : floorY + (target - floorY) * 0.12;
  grid.position.y = floorY;
  shadowPlane.position.y = floorY - 0.001;
  return floorY !== prev;
}

function ensureEdges(e) {
  if (e.edges.length) return;
  for (const m of e.meshes) {
    const line = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 20), e.lineMat);
    line.raycast = () => {};
    m.add(line);
    e.edges.push(line);
  }
}

// ---------------- 视觉状态 ----------------
function stepEntry() {
  if (state.mode !== 'step' || state.step < 1) return null;
  return state.entries.find((e) => e.part.order === state.step) || null;
}

function refreshVisuals() {
  const { mode, xray, selected, colorMode } = state;
  const focus = mode === 'step' ? stepEntry() : selected;
  const wire = mode === 'wire';
  for (const e of state.entries) {
    const shell = e.part.is_shell;
    let visible = !e.hidden;
    if (mode === 'xray' && xray === 'hidden' && shell) visible = false;
    if (state.solo && selected && e !== selected) visible = false;
    e.obj.visible = visible;

    const color = colorMode === 'group' ? e.groupColor : e.matColor;
    let opacity = e.baseOpacity;
    let clip = null;
    // 运动演示时外壳自动变透明，方便看清内部零件的运动
    if (mode === 'motion' && shell) opacity = Math.min(opacity, 0.13);
    if (mode === 'xray' && shell) {
      if (xray === 'transparent') opacity = Math.min(opacity, 0.13);
      if (xray === 'section') clip = [sectionPlane];
    }
    let glow = 0;
    if (focus) {
      if (e === focus) glow = 0.22;
      else if (mode === 'step') { if (e.part.order < state.step) opacity = Math.min(opacity, 0.35); }
      else opacity = Math.min(opacity, 0.12);
    }
    if (e === state.hovered && e !== focus) glow = Math.max(glow, 0.12);

    const m = e.mat;
    m.color.copy(color);
    m.emissive.setHex(ACCENT);
    m.emissiveIntensity = glow;
    m.opacity = opacity;
    m.transparent = opacity < 0.999;
    m.depthWrite = opacity >= 0.5;
    m.side = opacity < 0.999 ? THREE.FrontSide : THREE.DoubleSide;
    m.clippingPlanes = clip;
    m.needsUpdate = true;

    // 线框
    // 选中件：保留真实材质，只加一点青色辉光（其余零件半透明淡出）
    const showEdges = wire || ((mode === 'xray' && xray !== 'solid') || mode === 'motion') && shell;
    if (showEdges) ensureEdges(e);
    e.wireMat.color.copy(e === focus ? new THREE.Color(ACCENT) : color);
    e.wireMat.opacity = e === focus ? 0.3 : (focus ? 0.02 : 0.045);
    const dark = state.theme === 'dark';
    e.lineMat.color.setHex(e === focus ? ACCENT : (wire ? (dark ? 0x9fb3c2 : 0x22313c) : 0x7d8b95));
    e.lineMat.opacity = wire ? (focus && e !== focus ? 0.12 : 0.9) : 0.35;
    e.lineMat.clippingPlanes = clip;
    for (const l of e.edges) l.visible = showEdges;
    for (const mesh of e.meshes) {
      mesh.material = wire ? e.wireMat : m;
      mesh.castShadow = !wire && opacity > 0.5;
    }
  }
  // 线框、剖视模式下关闭环境光遮蔽（这两种模式里遮蔽会产生错误的暗斑）
  if (gtao) gtao.enabled = !wire && !(mode === 'xray' && xray === 'section');
  invalidate();
}

// ---------------- 相机 ----------------
const VIEWS = { iso: [1, 0.62, 1.15], front: [0, 0.02, 1], top: [0, 1, 0.02], side: [1, 0.02, 0] };
let camAnim = null;
controls.addEventListener('start', () => { camAnim = null; });

function flyTo(pos, target, dur = 0.8, instant = false) {
  if (instant) {
    camera.position.copy(pos);
    controls.target.copy(target);
    camAnim = null;
    return;
  }
  camAnim = { fromP: camera.position.clone(), toP: pos.clone(), fromT: controls.target.clone(), toT: target.clone(), t: 0, dur };
}

function targetBox(list) {
  const box = new THREE.Box3();
  for (const e of list) {
    if (!e.obj.visible) continue;
    const saved = e.obj.position.clone();
    e.obj.position.copy(e.basePos).addScaledVector(e.explodeVec, e.tTarget * state.explodeAmount);
    e.obj.updateWorldMatrix(true, true);
    for (const m of e.meshes) box.expandByObject(m);
    e.obj.position.copy(saved);
    e.obj.updateWorldMatrix(true, true);
  }
  return box;
}

function distanceFor(radius, pad = 1.2) {
  const vf = camera.fov * DEG;
  const hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
  return (radius / Math.sin(Math.min(vf, hf) / 2)) * pad;
}

function fitView(view = state.view, instant = false) {
  state.view = view;
  const box = targetBox(state.entries);
  if (box.isEmpty()) return;
  const dir = new THREE.Vector3(...VIEWS[view]).normalize();
  const center = box.getCenter(new THREE.Vector3());
  flyTo(center.clone().addScaledVector(dir, fitDistance(box, center, dir, 0.72)), center, 0.9, instant);
}

// 精确适配：让包围盒 8 个角点都落在视野内（margin 为可用画面比例，留出浮层空间）
function fitDistance(box, center, dir, margin) {
  const up = Math.abs(dir.y) > 0.95 ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(up, dir).normalize();
  const camUp = new THREE.Vector3().crossVectors(dir, right).normalize();
  const tanV = Math.tan((camera.fov * DEG) / 2) * margin;
  const tanH = tanV * camera.aspect;
  let d = 0;
  const c = new THREE.Vector3();
  for (let i = 0; i < 8; i++) {
    c.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(center);
    const z = c.dot(dir);
    d = Math.max(d, z + Math.abs(c.dot(right)) / tanH, z + Math.abs(c.dot(camUp)) / tanV);
  }
  return Math.max(d, 2);
}

function focusEntry(e) {
  const box = targetBox([e]);
  if (box.isEmpty()) return;
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const dir = camera.position.clone().sub(controls.target).normalize();
  const dist = Math.max(distanceFor(sphere.radius, 3.4), 7);
  flyTo(sphere.center.clone().addScaledVector(dir, dist), sphere.center, 0.8);
}

// ---------------- 渲染循环 ----------------
const clock = new THREE.Clock();
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
// ---------------- 运动演示 ----------------
// 所有运动共用一个"主轴转角" θ（模拟曲轴/电机转动），各零件按自己的运动类型跟随：
//  rotate   绕 axis 连续转动（转角 = θ·speed + phase）
//  swing    绕 axis 往复摆动（幅度 amplitude 度）
//  oscillate 沿 axis 往复平移（幅度 amplitude mm，正弦）
//  slider   曲柄滑块（活塞）：沿 axis 按真实曲柄连杆规律往复，需 crankRadius / rodLength
//  conrod   连杆：小头随活塞平移，同时绕 crankAxis 按 −asin(r·sinθ/L) 摆动
// pivot 为转动中心相对零件原点的偏移（mm，装配坐标系）。所有轴向量都在装配坐标系中。
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _pivot = new THREE.Vector3();
const hasMotion = () => state.entries.some((e) => e.motion);

function sliderOffset(m, th) {
  const r = m.crankRadius;
  const L = Math.max(m.rodLength, r * 1.05);
  const s = r * Math.sin(th);
  return r * Math.cos(th) + Math.sqrt(L * L - s * s) - (r + L);
}

function applyMotion() {
  const active = state.mode === 'motion';
  const theta = state.motionTime * Math.PI * 2 * 0.5; // 0.5 转/秒 × 转速倍率（已计入 motionTime）
  for (const e of state.entries) {
    if (!e.motion) continue;
    if (!active) { e.obj.quaternion.copy(e.baseQuat); continue; }
    const m = e.motion;
    const th = theta * m.speed + (m.phase * Math.PI) / 180;
    let ang = 0;
    let trans = 0;
    let rotAxis = m.axis;
    if (m.type === 'rotate') ang = th;
    else if (m.type === 'swing') ang = ((m.amplitude * Math.PI) / 180) * Math.sin(th);
    else if (m.type === 'oscillate') trans = m.amplitude * Math.sin(th);
    else if (m.type === 'slider') trans = sliderOffset(m, th);
    else if (m.type === 'conrod') {
      trans = sliderOffset(m, th);
      const k = Math.max(-1, Math.min(1, (m.crankRadius * Math.sin(th)) / Math.max(m.rodLength, m.crankRadius * 1.05)));
      ang = -Math.asin(k);
      rotAxis = m.crankAxis;
    }
    _axis.fromArray(rotAxis);
    _q.setFromAxisAngle(_axis, ang);
    e.obj.quaternion.copy(_q).multiply(e.baseQuat);
    if (trans) e.obj.position.addScaledVector(_v.fromArray(m.axis), trans);
    if (ang && (m.pivot[0] || m.pivot[1] || m.pivot[2])) {
      _pivot.fromArray(m.pivot);
      e.obj.position.add(_pivot).sub(_v.copy(_pivot).applyQuaternion(_q));
    }
  }
}

// 按需渲染：只有画面有变化（动画、拖动、切换状态）时才重绘，静止时不占用显卡
controls.addEventListener('change', invalidate);

function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  let moving = false;
  for (const e of state.entries) {
    const d = e.tTarget - e.t;
    if (d !== 0) moving = true;
    e.t = Math.abs(d) < 1e-4 ? e.tTarget : e.t + d * Math.min(1, dt * 5);
    e.obj.position.copy(e.basePos).addScaledVector(e.explodeVec, e.t * state.explodeAmount);
  }
  if (updateFloor()) moving = true;
  if (state.mode === 'motion') {
    if (state.motionPlaying) { state.motionTime += dt * state.motionSpeed; moving = true; }
    applyMotion();
  } else if (state.motionApplied) {
    applyMotion(); // 离开运动模式：零件转回原始姿态
    state.motionApplied = false;
    moving = true;
  }
  if (state.mode === 'motion') state.motionApplied = true;
  if (camAnim) {
    moving = true;
    camAnim.t += dt / camAnim.dur;
    const k = ease(Math.min(camAnim.t, 1));
    camera.position.lerpVectors(camAnim.fromP, camAnim.toP, k);
    controls.target.lerpVectors(camAnim.fromT, camAnim.toT, k);
    if (camAnim.t >= 1) camAnim = null;
  }
  controls.update();
  if (moving || dirty) {
    dirty = false;
    renderFrame();
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// ---------------- 拾取与悬停 ----------------
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const tooltip = $('tooltip');

function pick(ev) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const skipShell = state.mode === 'motion' || (state.mode === 'xray' && (state.xray === 'transparent' || state.xray === 'hidden'));
  const objs = [];
  for (const e of state.entries) {
    if (!e.obj.visible || (skipShell && e.part.is_shell)) continue;
    objs.push(...e.meshes);
  }
  for (const h of raycaster.intersectObjects(objs, false)) {
    const e = h.object.userData.entry;
    if (state.mode === 'xray' && state.xray === 'section' && e.part.is_shell && sectionPlane.distanceToPoint(h.point) < 0) continue;
    return e;
  }
  return null;
}

let down = null;
let hoverQueued = null;
renderer.domElement.addEventListener('pointerdown', (ev) => { down = { x: ev.clientX, y: ev.clientY }; });
renderer.domElement.addEventListener('pointerup', (ev) => {
  if (!down || Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 5 || ev.button !== 0) return;
  down = null;
  const e = pick(ev);
  if (state.mode === 'step') return;
  select(e && e === state.selected ? null : e);
});
renderer.domElement.addEventListener('pointermove', (ev) => {
  if (hoverQueued) { hoverQueued = ev; return; }
  hoverQueued = ev;
  requestAnimationFrame(() => {
    const evt = hoverQueued;
    hoverQueued = null;
    const e = evt.buttons ? null : pick(evt);
    if (e !== state.hovered) { state.hovered = e; refreshVisuals(); }
    renderer.domElement.style.cursor = e ? 'pointer' : '';
    if (e) {
      const r = $('stage').getBoundingClientRect();
      tooltip.innerHTML = `${esc(e.part.name)}<small>${esc(MATERIAL_LABEL[e.part.material] || '')}</small>`;
      tooltip.style.left = `${evt.clientX - r.left}px`;
      tooltip.style.top = `${evt.clientY - r.top}px`;
      tooltip.classList.add('show');
    } else tooltip.classList.remove('show');
  });
});
renderer.domElement.addEventListener('pointerleave', () => {
  tooltip.classList.remove('show');
  if (state.hovered) { state.hovered = null; refreshVisuals(); }
});

// ---------------- 手机端：底部详情面板 ----------------
// 手机上整页不滚动：3D 视图在上，零件横条在下；选中零件时从底部弹出详情面板，3D 视图随之变矮并重新对焦。
const isNarrow = () => window.matchMedia('(max-width: 900px)').matches;
const ui = { overview: false, sheetHidden: false };
const currentFocus = () => (state.mode === 'step' ? stepEntry() : state.selected);

function syncSheet() {
  const open = Boolean((currentFocus() && !ui.sheetHidden) || ui.overview);
  const ws = $('workspace');
  const want = open ? 'open' : 'closed';
  if (ws.dataset.sheet === want) return;
  ws.dataset.sheet = want;
  if (!isNarrow()) return;
  // 面板展开/收起会改变 3D 视图高度：等布局完成后重新适配相机
  requestAnimationFrame(() => requestAnimationFrame(() => {
    resize();
    const f = currentFocus();
    if (f) focusEntry(f); else fitView(state.view);
  }));
}

// ---------------- 选择 ----------------
function select(e, { fly = true } = {}) {
  state.selected = e || null;
  if (e) { ui.overview = false; ui.sheetHidden = false; }
  if (!e) state.solo = false;
  refreshVisuals();
  renderPartList();
  renderRight();
  if (e && fly) focusEntry(e);
  if (e) document.querySelector(`.part[data-id="${CSS.escape(e.part.id)}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

// ---------------- 模式 ----------------
function setMode(mode) {
  if (mode === 'motion' && !hasMotion()) {
    toast('这个模型没有运动数据：AI 生成时没有标注会动的零件（可重新拆解，或在补充说明里写"标注运动部件"）');
    return;
  }
  stopPlay();
  const prev = state.mode;
  state.mode = mode;
  if (mode === 'step') {
    state.selected = null;
    state.solo = false;
    applyStep(false);
  } else {
    for (const e of state.entries) e.tTarget = mode === 'explode' ? 1 : 0;
  }
  document.querySelectorAll('#modebar button').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
  $('xrayCtl').hidden = mode !== 'xray';
  $('explodeCtl').hidden = !(mode === 'explode' || mode === 'step');
  $('stepCtl').hidden = mode !== 'step';
  $('motionCtl').hidden = mode !== 'motion';
  if (mode === 'motion') { state.motionPlaying = true; syncMotionCtl(); }
  document.querySelectorAll('#xrayCtl button').forEach((b) => b.classList.toggle('on', b.dataset.xray === state.xray));
  refreshVisuals();
  renderPartList();
  renderRight();
  const wasOpen = prev === 'explode' || prev === 'step';
  const isOpen = mode === 'explode' || mode === 'step';
  if (wasOpen !== isOpen) fitView(state.view);
}

function applyStep(fly = true) {
  const n = state.entries.length;
  state.step = Math.max(0, Math.min(n, state.step));
  for (const e of state.entries) e.tTarget = e.part.order <= state.step ? 1 : 0;
  const cur = stepEntry();
  ui.sheetHidden = false;
  ui.overview = false;
  $('stepNum').textContent = `STEP ${pad(state.step)} / ${pad(n)}`;
  $('stepName').textContent = cur ? `拆下 · ${cur.part.name}` : '完整装配 · 按 › 开始拆解';
  $('stepPrev').disabled = state.step === 0;
  $('stepNext').disabled = state.step === n;
  refreshVisuals();
  renderPartList();
  renderRight();
  if (fly && state.step === 1) fitView(state.view);
  if (cur) document.querySelector(`.part[data-id="${CSS.escape(cur.part.id)}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function stopPlay() {
  clearInterval(state.playTimer);
  state.playTimer = null;
  $('stepPlay').classList.remove('on');
  $('stepPlay').textContent = '▶';
}

function togglePlay() {
  if (state.playTimer) return stopPlay();
  if (state.step >= state.entries.length) state.step = 0;
  $('stepPlay').classList.add('on');
  $('stepPlay').textContent = '❚❚';
  const adv = () => {
    if (state.step >= state.entries.length) return stopPlay();
    state.step += 1;
    applyStep();
  };
  adv();
  state.playTimer = setInterval(adv, 1600);
}

// ---------------- 左侧零件列表 ----------------
const EYE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 3l18 18M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6C3.9 8.3 2 12 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';

function renderPartList() {
  const list = $('partList');
  const focus = state.mode === 'step' ? stepEntry() : state.selected;
  let html = '';
  let lastGroup = null;
  for (const e of state.ordered) {
    if (e.part.group !== lastGroup) {
      lastGroup = e.part.group;
      html += `<div class="group-title"><i style="background:#${e.groupColor.getHexString()}"></i>${esc(lastGroup)}</div>`;
    }
    const cls = ['part', e === focus ? 'active' : '', e.hidden ? 'hidden-part' : ''].join(' ');
    html += `<div class="${cls}" role="button" tabindex="0" data-id="${esc(e.part.id)}">
      <span class="pn">${pad(e.listNo)}</span>
      <span class="pname">${esc(e.part.name)}${e.part.is_shell ? '<small>外壳</small>' : ''}</span>
      <button class="eye" data-eye="${esc(e.part.id)}" title="${e.hidden ? '显示' : '隐藏'}">${e.hidden ? EYE_OFF : EYE}</button>
    </div>`;
  }
  list.innerHTML = html;
  $('partCount').textContent = state.entries.length;
  $('partsBtnN').textContent = state.entries.length;
  $('modelCard').classList.toggle('dim', Boolean(focus));
}

$('partList').addEventListener('click', (ev) => {
  const eye = ev.target.closest('[data-eye]');
  const byId = (id) => state.entries.find((x) => x.part.id === id);
  if (eye) {
    ev.stopPropagation();
    const e = byId(eye.dataset.eye);
    e.hidden = !e.hidden;
    if (e.hidden && state.selected === e) state.selected = null;
    refreshVisuals();
    renderPartList();
    renderRight();
    return;
  }
  const row = ev.target.closest('.part');
  if (!row) return;
  const e = byId(row.dataset.id);
  closeDrawer();
  if (state.mode === 'step') {
    state.step = e.part.order;
    applyStep();
    return;
  }
  if (e.hidden) { e.hidden = false; }
  // 手机上点击即查看（再次点击同一零件不取消选择）；桌面端点击已选零件则取消
  select(e === state.selected && !isNarrow() ? null : e);
});
$('partList').addEventListener('dblclick', (ev) => {
  const row = ev.target.closest('.part');
  if (!row || state.mode === 'step') return;
  const e = state.entries.find((x) => x.part.id === row.dataset.id);
  state.solo = true;
  select(e);
});
$('showAllBtn').addEventListener('click', () => {
  state.entries.forEach((e) => { e.hidden = false; });
  state.solo = false;
  refreshVisuals();
  renderPartList();
  renderRight();
});
$('modelCard').addEventListener('click', () => {
  if (state.mode === 'step') { state.step = 0; applyStep(); }
  select(null);
  closeDrawer();
  ui.overview = isNarrow();
  renderRight();
  fitView(state.view);
});

// 手机端左侧零件抽屉
function openDrawer() {
  $('workspace').dataset.drawer = 'open';
  document.querySelector('.part.active')?.scrollIntoView({ block: 'center' });
}
function closeDrawer() { $('workspace').dataset.drawer = 'closed'; }
$('partsBtn').addEventListener('click', openDrawer);
$('drawerClose').addEventListener('click', closeDrawer);
$('drawerMask').addEventListener('click', closeDrawer);

// ---------------- 右侧面板 ----------------
const CUBE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 2 3 7v10l9 5 9-5V7z"/><path d="M3 7l9 5 9-5M12 12v10"/></svg>';
const fmt = (v) => (v >= 100 ? Math.round(v) : Math.round(v * 10) / 10);

const SHEET_CLOSE = '<button class="sheet-close" id="sheetClose" aria-label="关闭">✕</button>';

function renderRight() {
  const rp = $('rightPanel');
  const focus = state.mode === 'step' ? stepEntry() : state.selected;
  syncSheet();
  if (!state.model) { rp.innerHTML = ''; return; }
  if (focus) return renderPartDetail(rp, focus);
  const o = state.model.object;
  const n = state.entries.length;
  const sz = o.overall_size_mm.some((x) => x > 0) ? o.overall_size_mm : [state.sizeMM.x, state.sizeMM.y, state.sizeMM.z];
  const meta = state.model.meta;
  const source = state.item?.sample ? '内置示例' : state.item?.imported ? '导入文件' : `AI 推断${meta?.model ? ` · ${esc(meta.model)}` : ''}${meta?.via === 'extension' ? '（我的模型）' : ''}`;
  rp.innerHTML = `${SHEET_CLOSE}
    <div class="rp-head"><span>模型概览</span></div>
    <div class="rp-icon">${CUBE}</div>
    <div class="rp-eyebrow">Object overview</div>
    <div class="rp-title">${esc(o.name)}</div>
    <div class="rp-en">${esc(o.name_en)}</div>
    ${o.summary ? `<p class="rp-text">${esc(o.summary)}</p>` : ''}
    <div class="rp-rows">
      <div class="rp-row"><span>类别</span><b>${esc(o.category)}</b></div>
      <div class="rp-row"><span>外形尺寸</span><b>${sz.map(fmt).join(' × ')} mm</b></div>
      <div class="rp-row"><span>零件数量</span><b>${n} 件 · ${state.groups.length} 组</b></div>
      <div class="rp-row"><span>数据来源</span><b>${source}</b></div>
      ${o.confidence != null ? `<div class="rp-row"><span>推断把握</span><b><span class="conf"><i style="width:${Math.round(o.confidence * 100)}%"></i></span>${Math.round(o.confidence * 100)}%</b></div>` : ''}
    </div>
    ${o.principle ? `<div class="rp-sec">工作原理</div><p class="rp-text">${esc(o.principle)}</p>` : ''}
    ${o.assumptions?.length ? `<div class="rp-sec">推断说明</div><ul class="rp-list">${o.assumptions.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}
    <div class="rp-sec">配色方式</div>
    <div class="seg" id="colorSeg">
      <button data-color="material" class="${state.colorMode === 'material' ? 'on' : ''}">材质展示</button>
      <button data-color="group" class="${state.colorMode === 'group' ? 'on' : ''}">部件分色</button>
    </div>
    <div class="rp-sec">展示背景</div>
    <div class="seg" id="themeSeg">
      <button data-theme="light" class="${state.theme !== 'dark' ? 'on' : ''}">浅色工作室</button>
      <button data-theme="dark" class="${state.theme === 'dark' ? 'on' : ''}">深色展厅</button>
    </div>
    <div class="rp-actions"><button class="btn" id="exportBtn">导出 JSON</button></div>`;
}

const MOTION_NAMES = { rotate: '连续转动', swing: '往复摆动', oscillate: '往复移动', slider: '曲柄滑块往复', conrod: '连杆（平移 + 摆动）' };
function axisName(a) {
  const i = a.map(Math.abs).indexOf(Math.max(...a.map(Math.abs)));
  return ['X', 'Y', 'Z'][i];
}
function motionLabel(m) {
  return `${MOTION_NAMES[m.type] || m.type} · ${m.type === 'conrod' ? '沿' : (m.type === 'oscillate' || m.type === 'slider' ? '沿' : '绕')} ${axisName(m.axis)} 轴`;
}

function renderPartDetail(rp, e) {
  const p = e.part;
  const n = state.entries.length;
  const sz = e.sizeMM;
  const step = state.mode === 'step';
  rp.innerHTML = `${SHEET_CLOSE}
    <div class="rp-head"><button class="back" id="backBtn">← 返回概览</button><span class="badge">${step ? `STEP ${pad(p.order)}` : pad(e.listNo)} / ${pad(n)}</span></div>
    <div class="rp-icon num">${pad(step ? p.order : e.listNo)}</div>
    <div class="rp-eyebrow">Part detail · ${esc(p.group)}</div>
    <div class="rp-title">${esc(p.name)}</div>
    ${p.name_en ? `<div class="rp-en">${esc(p.name_en)}</div>` : ''}
    ${p.function ? `<p class="rp-text">${esc(p.function)}</p>` : ''}
    <div class="rp-rows">
      <div class="rp-row"><span>所属组件</span><b class="chip"><i style="background:#${e.groupColor.getHexString()}"></i>${esc(p.group)}</b></div>
      <div class="rp-row"><span>材质</span><b class="chip"><i style="background:#${e.matColor.getHexString()}"></i>${esc(MATERIAL_LABEL[p.material] || p.material)}</b></div>
      <div class="rp-row"><span>拆卸顺序</span><b>第 ${p.order} 步</b></div>
      <div class="rp-row"><span>外形尺寸</span><b>${fmt(sz.x)} × ${fmt(sz.y)} × ${fmt(sz.z)} mm</b></div>
      <div class="rp-row"><span>外壳件</span><b>${p.is_shell ? '是' : '否'}</b></div>
      ${p.motion ? `<div class="rp-row"><span>运动方式</span><b>${motionLabel(p.motion)}</b></div>` : ''}
    </div>
    ${p.description ? `<div class="rp-sec">结构说明</div><p class="rp-text">${esc(p.description)}</p>` : ''}
    <div class="rp-actions">
      ${step ? '' : `<button class="btn" id="soloBtn">${state.solo ? '显示全部' : '单独查看'}</button>`}
      <button class="btn" id="prevPart">上一个</button>
      <button class="btn" id="nextPart">下一个</button>
    </div>`;
}

$('rightPanel').addEventListener('click', (ev) => {
  const t = ev.target.closest('button');
  if (!t) return;
  if (t.id === 'sheetClose') {
    ui.overview = false;
    if (state.mode === 'step') ui.sheetHidden = true;
    else if (state.selected) select(null, { fly: false });
    renderPartList();
    renderRight();
  } else if (t.id === 'backBtn') {
    if (state.mode === 'step') { state.step = 0; applyStep(); } else select(null);
    ui.overview = isNarrow();
    renderPartList();
    renderRight();
    if (!isNarrow()) fitView(state.view);
  } else if (t.id === 'soloBtn') {
    state.solo = !state.solo;
    refreshVisuals();
    renderRight();
    if (state.selected) focusEntry(state.selected);
  } else if (t.id === 'prevPart' || t.id === 'nextPart') {
    const d = t.id === 'nextPart' ? 1 : -1;
    if (state.mode === 'step') {
      state.step = Math.max(1, Math.min(state.entries.length, state.step + d));
      applyStep();
      return;
    }
    const list = state.ordered.filter((x) => !x.hidden);
    const i = list.indexOf(state.selected);
    select(list[(i + d + list.length) % list.length]);
  } else if (t.dataset.theme) {
    applyTheme(t.dataset.theme);
    refreshVisuals();
    renderRight();
  } else if (t.dataset.color) {
    state.colorMode = t.dataset.color;
    refreshVisuals();
    renderRight();
  } else if (t.id === 'exportBtn') {
    exportJson();
  }
});

// ---------------- 顶部：库与面包屑 ----------------
function allItems() { return [...SAMPLES, ...history]; }

function renderTabs() {
  const items = allItems();
  $('libTabs').innerHTML = items.map((it, i) => {
    const o = it.data.object;
    const active = state.item && state.item.id === it.id ? 'active' : '';
    const thumb = it.thumb ? `<img class="thumb" src="${it.thumb}" alt="" />` : '';
    return `<button class="lib-tab ${active}" data-item="${esc(it.id)}">
      <span class="no">${pad(i + 1)}</span>${thumb}
      <span><b>${esc(o.name)}</b><small>${esc(it.code)} · ${esc(it.sample ? '示例' : o.category)}</small></span>
      ${it.sample ? '' : `<span class="del" data-del="${esc(it.id)}" title="删除">✕</span>`}
    </button>`;
  }).join('');
}

$('libTabs').addEventListener('click', (ev) => {
  const del = ev.target.closest('[data-del]');
  if (del) {
    ev.stopPropagation();
    history = history.filter((h) => h.id !== del.dataset.del);
    saveHistory();
    if (state.item?.id === del.dataset.del) loadItem(SAMPLES[0]);
    renderTabs();
    return;
  }
  const tab = ev.target.closest('[data-item]');
  if (!tab) return;
  const it = allItems().find((x) => x.id === tab.dataset.item);
  if (it && it !== state.item) loadItem(it);
});

function loadItem(item) {
  let model;
  try { model = normalizeModel(item.data); } catch (err) { toast(`模型数据有误：${err.message}`); return; }
  stopPlay();
  state.item = item;
  state.model = model;
  state.selected = null;
  state.hovered = null;
  state.solo = false;
  state.step = 0;
  ui.overview = false;
  ui.sheetHidden = false;
  state.motionTime = 0;
  state.motionApplied = false;
  buildModel(model);
  store.set(LAST_KEY, item.id);
  const o = model.object;
  $('eyebrow').textContent = o.name_en;
  $('title').textContent = o.name;
  $('code').textContent = item.code;
  $('subtitle').textContent = `${model.parts.length} 个零件 · ${state.groups.length} 个组件   /   ${item.sample ? '示例模型' : '结构推断示意'}`;
  $('mcName').textContent = o.name;
  $('mcSub').textContent = `${item.code} / ${o.category}`;
  $('crumbs').innerHTML = `<span>零件库</span><i>›</i><span>${esc(o.category.split('·')[0].trim())}</span><i>›</i><b>${esc(item.code)}</b>`;
  $('photoBtn').disabled = !item.photo;
  $('photoBtn').title = item.photo ? '查看上传的照片' : '示例模型没有实机照片';
  document.title = `${o.name} · 拆解 LAB`;
  setMode(state.mode === 'step' || (state.mode === 'motion' && !hasMotion()) ? 'overview' : state.mode);
  fitView('iso', true);
  renderTabs();
  $('libTabs').querySelector('.active')?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
}

// ---------------- 上传与 AI 分析 ----------------
const uploadDlg = $('uploadDlg');
let pending = null;

async function takeFile(file) {
  $('uploadError').hidden = true;
  $('compressInfo').hidden = false;
  $('compressInfo').textContent = '正在压缩照片…';
  try {
    pending = await prepareImage(file);
    const f = pending.info;
    $('compressInfo').textContent = f.origBytes > f.bytes * 1.05 || f.origW !== f.w
      ? `已压缩：${f.origW}×${f.origH} · ${formatBytes(f.origBytes)} → ${f.w}×${f.h} · ${formatBytes(f.bytes)}（在本机完成，原图不上传）`
      : `照片：${f.w}×${f.h} · ${formatBytes(f.bytes)}`;
    $('previewImg').src = pending.photo;
    $('previewImg').hidden = false;
    $('dropEmpty').hidden = true;
    refreshUploadUI();
  } catch (err) {
    pending = null;
    $('compressInfo').hidden = true;
    showUploadError(err.message);
    refreshUploadUI();
  }
}
function showUploadError(msg) { $('uploadError').textContent = msg; $('uploadError').hidden = false; }

// ---------------- 模型来源：浏览器插件（用户自己的模型）或网站服务器 ----------------
const ext = { installed: false, configured: false, allowed: false, model: '', label: '' };
const extPending = new Map();
let extSeq = 0;
const SRC_KEY = 'teardown.source.v1';

function extSend(msg) { window.postMessage({ source: 'teardown-page', ...msg }, location.origin); }
window.addEventListener('message', (ev) => {
  if (ev.source !== window || ev.origin !== location.origin) return;
  const m = ev.data;
  if (!m || m.source !== 'teardown-ext') return;
  if (m.type === 'ready' || m.type === 'status') {
    Object.assign(ext, { installed: true, configured: Boolean(m.configured), allowed: Boolean(m.allowed), model: m.model || '', label: m.label || '' });
    updateStatus();
    refreshUploadUI();
    return;
  }
  extPending.get(m.id)?.(m);
});
const pingExt = () => extSend({ type: 'status', id: 0 });
if (window.matchMedia('(pointer: coarse)').matches) {
  document.querySelector('#dropEmpty b').textContent = '点击拍照或从相册选择一张照片';
}
window.addEventListener('focus', pingExt);

function analyzeViaExt(job, hint, onProgress) {
  return new Promise((resolve, reject) => {
    const id = ++extSeq;
    extPending.set(id, (m) => {
      if (m.type === 'progress') return onProgress(m.chars);
      extPending.delete(id);
      if (m.type === 'result') resolve(m.data);
      else {
        const e = new Error(m.message || '插件出错');
        e.code = m.code;
        reject(e);
      }
    });
    extSend({ type: 'analyze', id, image: job.image, hint });
  });
}

const NET_HINT = '网络连接中断。可能原因：① 网络不稳定（workers.dev 域名在国内访问常被中断，建议绑定自己的域名）；② 等待期间手机锁屏或切到了其它应用；③ 服务器出错（可在 Cloudflare 控制台查看 Worker 日志）。请保持页面在前台后重试。';

async function analyzeViaServer(job, hint, code) {
  let res;
  let text;
  try {
    res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-access-code': code },
      body: JSON.stringify({ image: job.image, hint }),
    });
    // 线上（Cloudflare Worker）会先返回若干保活空格，再返回 JSON；出错时为 {"error": "..."}
    text = await res.text();
  } catch (e) {
    if (e instanceof TypeError) throw new Error(NET_HINT);
    throw e;
  }
  if (!text.trim()) throw new Error(NET_HINT);
  let json;
  try { json = JSON.parse(text); } catch { throw new Error(`服务器返回异常 (${res.status})`); }
  if (!res.ok || json.error) {
    if (res.status === 401 || json.status === 401) store.set(CODE_KEY, '');
    throw new Error(json.error || res.statusText);
  }
  return json;
}

function currentSource() {
  const picked = document.querySelector('input[name=aiSource]:checked')?.value;
  if (picked === 'ext' && ext.configured) return 'ext';
  if (picked === 'server' && state.aiEnabled) return 'server';
  if (ext.configured) return 'ext';
  if (state.aiEnabled) return 'server';
  return null;
}

function refreshUploadUI() {
  const pref = store.get(SRC_KEY, null);
  const extOk = ext.configured;
  const srvOk = state.aiEnabled;
  const rExt = document.querySelector('input[name=aiSource][value=ext]');
  const rSrv = document.querySelector('input[name=aiSource][value=server]');
  rExt.disabled = !extOk;
  rSrv.disabled = !srvOk;
  $('srcExt').classList.toggle('disabled', !extOk);
  $('srcSrv').classList.toggle('disabled', !srvOk);
  if (!rExt.checked && !rSrv.checked) {
    if (pref === 'server' && srvOk) rSrv.checked = true;
    else if (extOk) rExt.checked = true;
    else if (srvOk) rSrv.checked = true;
  }
  if (rExt.checked && !extOk && srvOk) rSrv.checked = true;
  if (rSrv.checked && !srvOk && extOk) rExt.checked = true;

  $('srcExtInfo').textContent = !ext.installed ? '未安装插件' : !extOk ? '插件已安装，但还没有配置模型'
    : `${ext.label ? `${ext.label} · ` : ''}${ext.model}${ext.allowed ? '' : ' · 首次使用需在插件中允许本网站'}`;
  $('srcSrvInfo').textContent = srvOk ? `${state.serverModel}${state.needsCode ? ' · 需要访问码' : ''}` : '网站未配置模型';
  // 手机/平板浏览器不支持扩展插件：没装插件时隐藏「我的模型」相关入口
  const noExtDevice = !ext.installed && window.matchMedia('(pointer: coarse)').matches;
  $('srcExt').hidden = noExtDevice;
  $('extBtn').hidden = noExtDevice;
  $('extBtn').textContent = !ext.installed ? '安装插件，用自己的模型' : '打开插件设置';
  $('srcHint').textContent = !ext.installed ? '' : '密钥只保存在你的浏览器里';

  const src = currentSource();
  $('codeField').hidden = !(src === 'server' && state.needsCode);
  if (src === 'server' && state.needsCode && !$('codeInput').value) $('codeInput').value = store.get(CODE_KEY, '');
  $('analyzeBtn').disabled = !pending || !src;
}

document.querySelectorAll('input[name=aiSource]').forEach((r) => r.addEventListener('change', () => {
  store.set(SRC_KEY, r.value);
  refreshUploadUI();
}));
$('extBtn').addEventListener('click', () => {
  if (ext.installed) extSend({ type: 'openOptions' });
  else $('extDlg').showModal();
});

$('openUpload').addEventListener('click', () => {
  $('uploadError').hidden = true;
  pingExt();
  refreshUploadUI();
  if (!ext.configured && !state.aiEnabled) {
    showUploadError(window.matchMedia('(pointer: coarse)').matches
      ? '网站暂未配置模型，请稍后再试，或在电脑上安装浏览器插件使用自己的模型。'
      : '当前没有可用的模型：安装浏览器插件并配置你自己的模型，或由站点管理员在服务器配置密钥。');
  }
  uploadDlg.showModal();
});
$('fileInput').addEventListener('change', (ev) => takeFile(ev.target.files[0]));
const drop = $('drop');
['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (ev) => { ev.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (ev) => { ev.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', (ev) => takeFile(ev.dataTransfer.files[0]));
window.addEventListener('paste', (ev) => {
  if (!uploadDlg.open) return;
  const f = [...(ev.clipboardData?.files || [])].find((x) => x.type.startsWith('image/'));
  if (f) takeFile(f);
});

$('analyzeBtn').addEventListener('click', async () => {
  if (!pending) return;
  const job = pending;
  const hint = $('hintInput').value;
  const code = $('codeInput').value.trim();
  const src = currentSource();
  if (!src) { showUploadError('没有可用的模型'); return; }
  if (src === 'server' && state.needsCode && !code) { showUploadError('请输入访问码'); return; }
  if (src === 'server' && state.needsCode) store.set(CODE_KEY, code);
  if (src === 'ext' && !ext.allowed) {
    extSend({ type: 'openOptions', allow: true });
    showUploadError('已打开插件设置页：请点击「允许」本网站使用你的模型，然后回到这里再点一次「开始 AI 拆解」。');
    return;
  }
  uploadDlg.close();
  $('loadingImg').src = job.photo;
  $('loading').hidden = false;
  const t0 = Date.now();
  let chars = 0;
  const who = src === 'ext' ? `我的模型 · ${ext.model}` : '网站模型';
  const tickText = () => {
    $('loadingText').textContent = `${who} · 已用时 ${Math.round((Date.now() - t0) / 1000)} 秒${chars ? ` · 已生成 ${chars.toLocaleString()} 字` : ' · 通常需要 30–120 秒'}`;
  };
  const timer = setInterval(tickText, 1000);
  tickText();
  try {
    const json = src === 'ext'
      ? await analyzeViaExt(job, hint, (n) => { chars = n; tickText(); })
      : await analyzeViaServer(job, hint, code);
    const model = normalizeModel(json);
    const seq = store.get('teardown.seq', 0) + 1;
    store.set('teardown.seq', seq);
    const item = { id: `ai-${Date.now()}`, code: `AI-${pad(seq)}`, data: model, photo: job.photo, thumb: job.thumb, createdAt: Date.now() };
    history.unshift(item);
    saveHistory();
    pending = null;
    resetUploadForm();
    loadItem(item);
    toast(`拆解完成：${model.object.name}，共 ${model.parts.length} 个零件`);
  } catch (err) {
    if (err.code === 'not_allowed' || err.code === 'not_configured') {
      extSend({ type: 'openOptions', allow: err.code === 'not_allowed' });
      pingExt();
    }
    showUploadError(`拆解失败：${err.message}`);
    refreshUploadUI();
    uploadDlg.showModal();
  } finally {
    clearInterval(timer);
    $('loading').hidden = true;
  }
});

function resetUploadForm() {
  $('previewImg').hidden = true;
  $('previewImg').removeAttribute('src');
  $('dropEmpty').hidden = false;
  $('hintInput').value = '';
  $('fileInput').value = '';
  $('compressInfo').hidden = true;
  refreshUploadUI();
}

// ---------------- 导入 / 导出 / 截图 ----------------
function download(name, href) {
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
function exportJson() {
  const blob = new Blob([JSON.stringify(state.model, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  download(`${state.model.object.name}-拆解.json`, url);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
$('importBtn').addEventListener('click', () => $('importInput').click());
$('importInput').addEventListener('change', async (ev) => {
  const f = ev.target.files[0];
  ev.target.value = '';
  if (!f) return;
  try {
    const model = normalizeModel(JSON.parse(await f.text()));
    const item = { id: `imp-${Date.now()}`, code: 'IMP', data: model, imported: true, createdAt: Date.now() };
    history.unshift(item);
    saveHistory();
    loadItem(item);
    toast(`已导入：${model.object.name}`);
  } catch (err) { toast(`导入失败：${err.message}`); }
});
$('shotBtn').addEventListener('click', () => {
  renderFrame();
  download(`${state.model?.object.name || 'model'}-${Date.now()}.png`, renderer.domElement.toDataURL('image/png'));
});
$('resetBtn').addEventListener('click', () => {
  state.entries.forEach((e) => { e.hidden = false; });
  state.solo = false;
  state.explodeAmount = 1;
  $('explodeRange').value = 1;
  $('explodeVal').textContent = '100%';
  select(null, { fly: false });
  setMode('overview');
  fitView('iso');
});
$('themeBtn').addEventListener('click', () => {
  applyTheme(state.theme === 'dark' ? 'light' : 'dark');
  refreshVisuals();
  renderRight();
});
$('fullBtn').addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else $('stage').requestFullscreen?.();
});
$('photoBtn').addEventListener('click', () => {
  if (!state.item?.photo) return;
  $('photoFull').src = state.item.photo;
  $('photoDlg').showModal();
});

// ---------------- 控件绑定 ----------------
$('modebar').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-mode]');
  if (b) setMode(b.dataset.mode);
});
$('xrayCtl').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-xray]');
  if (!b) return;
  state.xray = b.dataset.xray;
  document.querySelectorAll('#xrayCtl button').forEach((x) => x.classList.toggle('on', x === b));
  refreshVisuals();
});
$('viewbar').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-view]');
  if (b) fitView(b.dataset.view);
});
$('explodeRange').addEventListener('input', (ev) => {
  invalidate();
  state.explodeAmount = +ev.target.value;
  $('explodeVal').textContent = `${Math.round(state.explodeAmount * 100)}%`;
});
$('explodeRange').addEventListener('change', () => fitView(state.view));
function syncMotionCtl() {
  $('motionPlay').textContent = state.motionPlaying ? '❚❚' : '▶';
  $('motionPlay').classList.toggle('on', state.motionPlaying);
  $('motionSpeedVal').textContent = `${state.motionSpeed.toFixed(1)}×`;
}
$('motionPlay').addEventListener('click', () => { state.motionPlaying = !state.motionPlaying; syncMotionCtl(); invalidate(); });
$('motionSpeed').addEventListener('input', (ev) => { state.motionSpeed = +ev.target.value; syncMotionCtl(); });
$('stepPrev').addEventListener('click', () => { stopPlay(); state.step -= 1; applyStep(); });
$('stepNext').addEventListener('click', () => { stopPlay(); state.step += 1; applyStep(); });
$('stepPlay').addEventListener('click', togglePlay);
window.addEventListener('keydown', (ev) => {
  if (ev.target.closest('input, textarea, dialog')) return;
  if (ev.key === 'Escape' && $('workspace').dataset.drawer === 'open') { closeDrawer(); return; }
  if (ev.key === 'Escape') { if (state.mode === 'step') { state.step = 0; applyStep(); } else select(null); }
  if (state.mode === 'step' && (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft')) {
    stopPlay();
    state.step += ev.key === 'ArrowRight' ? 1 : -1;
    applyStep();
  }
});

let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}

// ---------------- 启动 ----------------
function updateStatus() {
  if (ext.configured) {
    $('aiDot').className = 'dot on';
    $('aiStatus').textContent = `我的模型 · ${ext.model}`;
  } else if (state.aiEnabled) {
    $('aiDot').className = 'dot on';
    $('aiStatus').textContent = `AI 已连接 · ${state.serverModel}`;
  } else {
    $('aiDot').className = 'dot off';
    $('aiStatus').textContent = ext.installed ? '插件未配置模型 · 可浏览示例' : (state.serverChecked ? '未配置 AI · 可浏览示例' : '未连接服务器 · 仅示例');
  }
}

async function checkAi() {
  try {
    const cfg = await (await fetch('/api/config')).json();
    state.aiEnabled = cfg.aiEnabled;
    state.needsCode = Boolean(cfg.needsCode);
    state.serverModel = cfg.model;
    state.serverChecked = true;
  } catch {
    state.aiEnabled = false;
  }
  updateStatus();
  refreshUploadUI();
}

applyTheme(store.get(THEME_KEY, 'light'));
const lastId = store.get(LAST_KEY, null);
loadItem(allItems().find((x) => x.id === lastId) || SAMPLES[0]);
checkAi();
pingExt();
