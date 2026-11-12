import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildEngineAssembly } from '../engine/engine-geometry.js';

// 按“所在模块 / 转子 / 材质”合并，重复叶片保留原形，成为设备库可选择的组件。
export function createEngineParts() {
  const groups = new Map();
  let flameGeometry = null;
  const materials = new Proxy({ lpt: () => 'lpt' }, { get: (target, key) => target[key] || key });
  buildEngineAssembly((parent, geometry, material, section) => {
    if (material === 'flame') flameGeometry = geometry;
    else {
      const key = `${section}_${parent}_${material}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(geometry);
    }
    return {};
  }, materials);
  const geometries = new Map();
  for (const [key, list] of groups) {
    const normalized = list.map((source) => {
      const geometry = source.index ? source.toNonIndexed() : source.clone();
      geometry.deleteAttribute('uv');
      return geometry;
    });
    const geometry = mergeGeometries(normalized);
    for (const source of normalized) source.dispose();
    for (const source of list) source.dispose();
    if (!geometry) throw new Error(`发动机组件合并失败：${key}`);
    geometry.scale(1000, 1000, 1000); // 原场景的米 → 默认模型协议的毫米。
    geometry.computeBoundingBox();
    geometries.set(key, geometry);
  }
  return { geometries, flameGeometry };
}
