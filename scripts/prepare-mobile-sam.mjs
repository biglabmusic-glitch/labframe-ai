// Public model assets only. Run from the repo root after npm ci in app.
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(root, 'app/public/models/mobilesam');
const encoderRevision = '9effc01a9e135621d710d49159f1ffb0b6f724dc';
const decoderRevision = '0d3b403339b4674a82493d5e97964dd78089ddc8';
const encoderBase = `https://huggingface.co/vietanhdev/segment-anything-onnx-models/resolve/${encoderRevision}/`;
const decoderBase = `https://huggingface.co/Acly/MobileSAM/resolve/${decoderRevision}/`;
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
function verify(bytes, hash, size, name) {
  if (bytes.length !== size || sha(bytes) !== hash) throw new Error(`Integrity mismatch: ${name}`);
}
async function download(url, hash, size, name) {
  const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`Download failed: ${name} (${response.status})`);
  const bytes = Buffer.from(await response.arrayBuffer()); verify(bytes, hash, size, name); return bytes;
}
// Extract one pinned member, not arbitrary archive paths. No scripts or pickle files.
function encoderFromZip(zip) {
  let end = zip.length - 22;
  const earliest = Math.max(0, zip.length - 65557);
  while (end >= earliest && zip.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < earliest) throw new Error('Invalid ZIP footer');
  let offset = zip.readUInt32LE(end + 16);
  while (offset + 46 <= zip.length && zip.readUInt32LE(offset) === 0x02014b50) {
    const method = zip.readUInt16LE(offset + 10), size = zip.readUInt32LE(offset + 20);
    const nameLen = zip.readUInt16LE(offset + 28), extraLen = zip.readUInt16LE(offset + 30), commentLen = zip.readUInt16LE(offset + 32);
    const name = zip.subarray(offset + 46, offset + 46 + nameLen).toString('utf8');
    if (name === 'mobile_sam.encoder.quant.onnx') {
      const local = zip.readUInt32LE(offset + 42);
      if (zip.readUInt32LE(local) !== 0x04034b50) throw new Error('Invalid ZIP member');
      const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      if (start + size > zip.length || ![0, 8].includes(method)) throw new Error('Invalid ZIP data');
      const compressed = zip.subarray(start, start + size);
      return method === 0 ? compressed : inflateRawSync(compressed, { maxOutputLength: 11018056 });
    }
    offset += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error('Encoder not found in pinned ZIP');
}
await mkdir(resolve(target, 'onnx'), { recursive: true });
const manifest = { model: 'MobileSAM', encoderRevision, decoderRevision, onnxruntime: '1.31.1', files: {} };
const assets = [
  ['onnx/encoder.onnx', 'e4220ae166e841ebc6159a69b5b762b635af95ed758c86663a978bef80bcea62', 11018056, encoderBase + 'mobile_sam_20230629_quant.zip#mobile_sam.encoder.quant.onnx'],
  ['onnx/decoder.onnx', '8976b90a87ba50a6a72217a5ff994f7d25ce16f2229fcc1ed259e1294c622ffe', 16496559, decoderBase + 'sam_mask_decoder_multi.onnx'],
  ['ENCODER_CARD.md', 'e613251715752d02f284d77b3f0803b94919bec6d1a4fee839aa2eab0b25e39e', 3677, encoderBase + 'README.md'],
  ['DECODER_CARD.md', '9f65cf87488ad1a3c8b191ac9fd5a8ce04b999810bfc7d1a2625750edb969c56', 712, decoderBase + 'README.md'],
  ['LICENSE-MOBILESAM.txt', 'c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4', 11357, 'https://raw.githubusercontent.com/ChaoningZhang/MobileSAM/f706ad9c4eb7f219c00d9050e46328518ffb65d2/LICENSE'],
  ['LICENSE-ONNXRUNTIME.txt', '2f07c72751aed99790b8a4869cf2311df85a860b22ded05fa22803587a48922c', 1073, 'https://raw.githubusercontent.com/microsoft/onnxruntime/v1.31.1/LICENSE'],
];
for (const [name, hash, size, url] of assets) {
  const output = resolve(target, name); let bytes;
  try { bytes = await readFile(output); verify(bytes, hash, size, name); }
  catch {
    if (name === 'onnx/encoder.onnx') {
      const zip = await download(encoderBase + 'mobile_sam_20230629_quant.zip', '8a8ee531538541a55fa6fa7efebae121ef33e5c323b3998b48ea9383b37d90aa', 10971233, 'encoder ZIP');
      bytes = encoderFromZip(zip); verify(bytes, hash, size, name);
    } else bytes = await download(url, hash, size, name);
    await writeFile(output, bytes);
  }
  manifest.files[name] = { sha256: hash, bytes: size, source: url };
  console.log(`${name}: verified`);
}
const runtimeRoot = resolve(root, 'app/node_modules/onnxruntime-web');
if (JSON.parse(await readFile(resolve(runtimeRoot, 'package.json'), 'utf8')).version !== '1.31.1') throw new Error('Unexpected ONNX Runtime version');
for (const [name, hash, size] of [
  ['ort-wasm-simd-threaded.mjs', '30ed0b5cd1182ede931fea448afb567d4dc705ec957af09f108a2be5f770dac3', 24738],
  ['ort-wasm-simd-threaded.wasm', '4b884c203b0fa48d057be3332c65513ff85aa3c5bddd6946acc0fab7ecda001d', 14848852],
]) {
  const bytes = await readFile(resolve(runtimeRoot, 'dist', name)); verify(bytes, hash, size, name);
  await mkdir(resolve(target, 'wasm'), { recursive: true }); await writeFile(resolve(target, 'wasm', name), bytes);
  manifest.files[`wasm/${name}`] = { sha256: hash, bytes: size, source: `npm:onnxruntime-web@1.31.1/dist/${name}` };
  console.log(`${name}: verified`);
}
await writeFile(resolve(target, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
