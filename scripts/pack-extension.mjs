// 把 extension/ 打包成 public/downloads/teardown-extension.zip，供网站提供下载。
// 用法：node scripts/pack-extension.mjs   （零依赖，Node 22+ 自带 zlib.crc32）
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'extension');
const out = path.join(root, 'public', 'downloads', 'teardown-extension.zip');
const FOLDER = 'teardown-extension/';

function walk(dir, base = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? walk(path.join(dir, d.name), `${base}${d.name}/`) : [`${base}${d.name}`]);
}

const crc32 = zlib.crc32 || ((buf) => {
  let c, crc = 0xffffffff;
  for (const b of buf) { c = (crc ^ b) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; }
  return (crc ^ 0xffffffff) >>> 0;
});

const locals = [];
const centrals = [];
let offset = 0;
const files = walk(src).filter((f) => !f.endsWith('.DS_Store')).sort();
for (const rel of files) {
  const data = fs.readFileSync(path.join(src, rel));
  const comp = zlib.deflateRawSync(data, { level: 9 });
  const name = Buffer.from(FOLDER + rel, 'utf8');
  const crc = crc32(data) >>> 0;
  const h = Buffer.alloc(30);
  h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(8, 8);
  h.writeUInt32LE(0, 10); h.writeUInt32LE(crc, 14); h.writeUInt32LE(comp.length, 18); h.writeUInt32LE(data.length, 22);
  h.writeUInt16LE(name.length, 26); h.writeUInt16LE(0, 28);
  locals.push(h, name, comp);
  const c = Buffer.alloc(46);
  c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(8, 10);
  c.writeUInt32LE(0, 12); c.writeUInt32LE(crc, 16); c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(data.length, 24);
  c.writeUInt16LE(name.length, 28); c.writeUInt32LE(offset, 42);
  centrals.push(c, name);
  offset += h.length + name.length + comp.length;
}
const cd = Buffer.concat(centrals);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.concat([...locals, cd, end]));
console.log(`已打包 ${files.length} 个文件 → ${path.relative(root, out)}`);
