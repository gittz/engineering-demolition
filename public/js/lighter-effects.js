import * as THREE from 'three';

const OFF = 1e4;
const MAX_SPARKS = 84;
const GAS_COUNT = 72;

function glowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.22, 'rgba(255,220,128,.95)');
  gradient.addColorStop(1, 'rgba(255,120,20,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function roundedRect(shape, x, y, width, height, radius, clockwise = false) {
  const r = Math.min(radius, width / 2, height / 2);
  if (!clockwise) {
    shape.moveTo(x + r, y);
    shape.lineTo(x + width - r, y);
    shape.quadraticCurveTo(x + width, y, x + width, y + r);
    shape.lineTo(x + width, y + height - r);
    shape.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    shape.lineTo(x + r, y + height);
    shape.quadraticCurveTo(x, y + height, x, y + height - r);
    shape.lineTo(x, y + r);
    shape.quadraticCurveTo(x, y, x + r, y);
  } else {
    shape.moveTo(x + r, y);
    shape.quadraticCurveTo(x, y, x, y + r);
    shape.lineTo(x, y + height - r);
    shape.quadraticCurveTo(x, y + height, x + r, y + height);
    shape.lineTo(x + width - r, y + height);
    shape.quadraticCurveTo(x + width, y + height, x + width, y + height - r);
    shape.lineTo(x + width, y + r);
    shape.quadraticCurveTo(x + width, y, x + width - r, y);
    shape.lineTo(x + r, y);
  }
  shape.closePath();
}

function sectionFaces() {
  const group = new THREE.Group();
  group.name = 'lighter-section-faces';

  // 油仓壁厚截面：外轮廓减去内腔，形成清晰的注塑壳体切口。
  const wall = new THREE.Shape();
  roundedRect(wall, -12, -30, 24, 60, 4);
  const cavity = new THREE.Path();
  roundedRect(cavity, -10.6, -28.6, 21.2, 57.2, 3.1, true);
  wall.holes.push(cavity);
  const wallMaterial = new THREE.MeshPhysicalMaterial({
    color: '#f3a0a0', metalness: 0, roughness: 0.46, clearcoat: 0.35,
    transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: true,
  });
  const wallMesh = new THREE.Mesh(new THREE.ShapeGeometry(wall, 32), wallMaterial);
  wallMesh.position.set(0, -10, 0.025);
  wallMesh.renderOrder = 3;
  group.add(wallMesh);

  // 液态丁烷的剖面保留半透明，让吸液芯仍然可读。
  const fuel = new THREE.Shape();
  roundedRect(fuel, -10.35, -23, 20.7, 46, 2.7);
  const fuelMaterial = new THREE.MeshPhysicalMaterial({
    color: '#83cfff', roughness: 0.08, clearcoat: 0.8, clearcoatRoughness: 0.06,
    transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false,
  });
  const fuelMesh = new THREE.Mesh(new THREE.ShapeGeometry(fuel, 24), fuelMaterial);
  fuelMesh.position.set(0, -16.4, 0.055);
  fuelMesh.renderOrder = 4;
  group.add(fuelMesh);

  group.userData.materials = { wall: wallMaterial, fuel: fuelMaterial };
  return group;
}

function flameMaterial(inner = false) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uStrength: { value: 0 },
      uInner: { value: inner ? 1 : 0 },
    },
    vertexShader: `
      uniform float uTime;
      uniform float uStrength;
      varying float vHeight;
      varying float vEdge;
      void main() {
        vec3 p = position;
        vHeight = clamp(p.y / 13.5, 0.0, 1.0);
        float sway = sin(uTime * 15.0 + p.y * 0.72) * (0.08 + vHeight * 0.48);
        sway += sin(uTime * 8.7 + p.y * 1.31) * vHeight * 0.18;
        p.x += sway * uStrength;
        p.z += cos(uTime * 11.0 + p.y * 0.84) * vHeight * 0.22 * uStrength;
        vEdge = abs(normal.y);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uStrength;
      uniform float uInner;
      varying float vHeight;
      varying float vEdge;
      void main() {
        vec3 blue = vec3(0.16, 0.52, 1.0);
        vec3 gold = vec3(1.0, 0.48, 0.06);
        vec3 pale = vec3(1.0, 0.94, 0.62);
        vec3 color = mix(blue, gold, smoothstep(0.08, 0.36, vHeight));
        color = mix(color, pale, smoothstep(0.34, 0.74, vHeight) * (1.0 - vHeight));
        if (uInner > 0.5) color = mix(vec3(0.32, 0.68, 1.0), vec3(0.9, 0.98, 1.0), vHeight);
        float flicker = 0.86 + 0.14 * sin(uTime * 31.0) * sin(uTime * 13.7);
        float alpha = uStrength * flicker * (1.0 - smoothstep(0.76, 1.0, vHeight));
        alpha *= mix(0.62, 1.0, vEdge);
        gl_FragColor = vec4(color, alpha * (uInner > 0.5 ? 0.72 : 0.58));
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
}

export function createLighterEffects(parent) {
  const root = new THREE.Group();
  root.name = 'lighter-presentation';
  parent.add(root);

  const section = sectionFaces();
  root.add(section);

  const outerFlameMat = flameMaterial(false);
  const innerFlameMat = flameMaterial(true);
  const outerFlame = new THREE.Mesh(new THREE.ConeGeometry(2.55, 13.5, 36, 18, true), outerFlameMat);
  outerFlame.geometry.translate(0, 6.75, 0);
  outerFlame.position.set(0, 31.4, -3.5);
  outerFlame.renderOrder = 8;
  const innerFlame = new THREE.Mesh(new THREE.ConeGeometry(1.15, 6.4, 28, 10, true), innerFlameMat);
  innerFlame.geometry.translate(0, 3.2, 0);
  innerFlame.position.set(0, 31.35, -3.5);
  innerFlame.renderOrder = 9;
  root.add(outerFlame, innerFlame);

  const flameLight = new THREE.PointLight(0xff8a32, 0, 6, 2);
  flameLight.position.set(0, 37, -3.5);
  root.add(flameLight);

  const sprite = glowTexture();
  const sparkPositions = new Float32Array(MAX_SPARKS * 3);
  const sparkColors = new Float32Array(MAX_SPARKS * 3);
  sparkPositions.fill(OFF);
  const sparks = Array.from({ length: MAX_SPARKS }, (_, i) => {
    const hot = 0.55 + Math.random() * 0.45;
    sparkColors[i * 3] = 1;
    sparkColors[i * 3 + 1] = hot;
    sparkColors[i * 3 + 2] = 0.08;
    return { life: 0, ttl: 0, p: new THREE.Vector3(), v: new THREE.Vector3() };
  });
  const sparkGeometry = new THREE.BufferGeometry();
  sparkGeometry.setAttribute('position', new THREE.BufferAttribute(sparkPositions, 3));
  sparkGeometry.setAttribute('color', new THREE.BufferAttribute(sparkColors, 3));
  const sparkMaterial = new THREE.PointsMaterial({
    size: 0.11, map: sprite, vertexColors: true, transparent: true,
    opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const sparkPoints = new THREE.Points(sparkGeometry, sparkMaterial);
  sparkPoints.frustumCulled = false;
  sparkPoints.renderOrder = 10;
  root.add(sparkPoints);

  const gasPositions = new Float32Array(GAS_COUNT * 3);
  const gasPhase = Array.from({ length: GAS_COUNT }, () => Math.random());
  const gasGeometry = new THREE.BufferGeometry();
  gasGeometry.setAttribute('position', new THREE.BufferAttribute(gasPositions, 3));
  const gasMaterial = new THREE.PointsMaterial({
    color: '#8bdcff', size: 0.055, map: sprite, transparent: true,
    opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const gasPoints = new THREE.Points(gasGeometry, gasMaterial);
  gasPoints.frustumCulled = false;
  gasPoints.renderOrder = 7;
  root.add(gasPoints);

  let sparkBudget = 0;
  const spawnSpark = () => {
    const s = sparks.find((p) => p.life <= 0);
    if (!s) return;
    s.ttl = s.life = 0.18 + Math.random() * 0.24;
    s.p.set((Math.random() - 0.5) * 1.2, 30.8 + Math.random() * 1.2, 2.3 + Math.random() * 1.2);
    s.v.set((Math.random() - 0.5) * 12, 5 + Math.random() * 13, -18 - Math.random() * 22);
  };

  function updateSparks(dt, strength) {
    sparkBudget += dt * strength * 430;
    while (sparkBudget >= 1) { spawnSpark(); sparkBudget -= 1; }
    sparks.forEach((s, i) => {
      if (s.life > 0) {
        s.life -= dt;
        s.v.y -= 30 * dt;
        s.p.addScaledVector(s.v, dt);
        sparkPositions[i * 3] = s.p.x;
        sparkPositions[i * 3 + 1] = s.p.y;
        sparkPositions[i * 3 + 2] = s.p.z;
      } else {
        sparkPositions[i * 3] = sparkPositions[i * 3 + 1] = sparkPositions[i * 3 + 2] = OFF;
      }
    });
    sparkGeometry.attributes.position.needsUpdate = true;
  }

  function updateGas(time, strength) {
    for (let i = 0; i < GAS_COUNT; i++) {
      const t = (gasPhase[i] + time * 0.62) % 1;
      const lower = t < 0.78;
      const k = lower ? t / 0.78 : (t - 0.78) / 0.22;
      const y = lower ? -35 + k * 64.5 : 29.5 + k * 5;
      const spread = lower ? 0.32 : 0.32 + k * 0.75;
      gasPositions[i * 3] = Math.sin(i * 4.17 + time * 3.1) * spread;
      gasPositions[i * 3 + 1] = y;
      gasPositions[i * 3 + 2] = -3.5 + Math.cos(i * 2.63 + time * 2.4) * spread;
    }
    gasGeometry.attributes.position.needsUpdate = true;
    gasMaterial.opacity = strength * 0.72;
    gasPoints.visible = strength > 0.015;
  }

  function update({ dt = 0, time = 0, active = false, sectionAmount = 0, sparks: sparkStrength = 0, valve = 0, flame = 0 }) {
    const cut = THREE.MathUtils.smoothstep(sectionAmount, 0.1, 0.92);
    section.visible = cut > 0.001;
    section.userData.materials.wall.opacity = cut * 0.98;
    section.userData.materials.fuel.opacity = cut * 0.34;
    section.position.z = 0.02 + (1 - cut) * 0.08;

    const fire = active ? flame : 0;
    outerFlame.visible = innerFlame.visible = fire > 0.01;
    outerFlameMat.uniforms.uTime.value = innerFlameMat.uniforms.uTime.value = time;
    outerFlameMat.uniforms.uStrength.value = fire;
    innerFlameMat.uniforms.uStrength.value = fire;
    const pulse = 1 + Math.sin(time * 24.7) * 0.035 + Math.sin(time * 11.3) * 0.025;
    outerFlame.scale.set(pulse, 0.92 + fire * 0.08, pulse);
    innerFlame.scale.set(0.96 + pulse * 0.04, 0.96 + fire * 0.04, 0.96 + pulse * 0.04);
    flameLight.intensity = fire * (2.2 + Math.sin(time * 21) * 0.32);

    updateGas(time, active ? valve : 0);
    updateSparks(active ? dt : 0, active ? sparkStrength : 0);
    sparkPoints.visible = active && (sparkStrength > 0.01 || sparks.some((s) => s.life > 0));
  }

  function dispose() {
    root.traverse((o) => {
      o.geometry?.dispose();
      if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
      else o.material?.dispose();
    });
    sprite.dispose();
    root.removeFromParent();
  }

  update({});
  return { root, update, dispose };
}
