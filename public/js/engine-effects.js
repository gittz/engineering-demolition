import * as THREE from 'three';

export function createEngineEffects(parent, flameGeometry) {
const engine = new THREE.Group();
engine.scale.setScalar(1000);
parent.add(engine);
const isTouch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
const CORE_OUT = [[-1.56, 0.555], [-1.45, 0.52], [-1.15, 0.5], [-0.95, 0.44], [-0.2, 0.36], [-0.12, 0.38], [0.0, 0.44], [0.45, 0.43], [0.55, 0.43], [1.0, 0.5], [1.45, 0.52], [1.62, 0.47]];
const HUB = [[-1.6, 0.33], [-1.15, 0.3], [-0.95, 0.245], [-0.15, 0.29], [0.0, 0.28], [0.5, 0.28], [1.45, 0.3], [1.6, 0.28]];
const hubR = (x) => {
  let i = 1; while (i < HUB.length - 1 && x > HUB[i][0]) i++;
  const [x0, r0] = HUB[i - 1], [x1, r1] = HUB[i];
  return THREE.MathUtils.lerp(r0, r1, THREE.MathUtils.clamp((x - x0) / (x1 - x0), 0, 1));
};

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

const combustionMaterial = new THREE.MeshBasicMaterial({
 color: new THREE.Color(2.6, 1.3, 0.45), transparent: true, opacity: 0.55,
 blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
});
const combustion = new THREE.Mesh(flameGeometry, combustionMaterial);
engine.add(combustion);
let lastTime = 0;
return {
 update({ time, active, visible, clip, focused }) {
  engine.visible = visible;
  if (!visible) { lastTime = time; return; }
  const dt = active ? Math.max(0, Math.min(0.1, time - lastTime)) : 0;
  lastTime = time;
  updateFlow(dt);
  flowMat.opacity = focused ? 0.12 : 0.7;
  plumes.forEach((mesh) => {
   mesh.material.uniforms.uTime.value = time;
   mesh.material.uniforms.uOn.value = focused ? 0.1 : 1;
  });
  combustionMaterial.opacity = (focused ? 0.1 : 0.55) + Math.sin(time * 23) * Math.sin(time * 7.3) * 0.05;
  combustionMaterial.clippingPlanes = clip;
  combustionMaterial.clipIntersection = true;
 },
 dispose() {
  flowMat.map?.dispose();
  engine.traverse((object) => { object.geometry?.dispose(); object.material?.dispose(); });
  engine.removeFromParent();
 },
};
}
