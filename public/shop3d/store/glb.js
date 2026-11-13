import * as THREE from 'three';

// 大樹の店の GLB を読む、最小の読み込み。Blender から書き出した形だけを扱う
// （面は三角形、属性は別々のバッファ、画像は WebP の埋め込み、ノードは親子なし）。
const TYPES = {5120:Int8Array, 5121:Uint8Array, 5122:Int16Array, 5123:Uint16Array, 5125:Uint32Array, 5126:Float32Array};
const SIZE = {SCALAR:1, VEC2:2, VEC3:3, VEC4:4, MAT4:16};
// 頂点の色を使う材質（ほかの材質に付いている頂点色は、Blender 側でも使っていない）
const VERTEX_COLOR = new Set(['Bark', 'Leaves', 'Flowers', 'Moss ground', 'Moss', 'Stone', 'Leaf sprig']);

export async function loadGLB(url, {anisotropy = 8} = {}){
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} を読めません（${res.status}）`);
  const buf = await res.arrayBuffer(), dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error(`${url} は GLB ではありません`);
  let off = 12, json = null, bin = null;
  while (off < buf.byteLength) {
    const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, off + 8, len)));
    else if (type === 0x004e4942) bin = buf.slice(off + 8, off + 8 + len);
    off += 8 + len;
  }
  if (!json || !bin) throw new Error(`${url} の中身が足りません`);

  const view = i => { const v = json.bufferViews[i]; return {offset:v.byteOffset || 0, length:v.byteLength, stride:v.byteStride}; };
  // 梱包で meshopt 圧縮したモデル（tools/slim-glb.mjs の compressGLB）は、ここで元に戻す。Blender から書き出したままのモデルは、そのまま読む
  const packed = json.bufferViews.some(v => v.meshopt);
  const decoder = packed ? await import('../vendor/meshopt_decoder.mjs').then(async m => { await m.MeshoptDecoder.ready; return m.MeshoptDecoder; }) : null;
  const decoded = new Map();
  const unpack = i => {
    if (decoded.has(i)) return decoded.get(i);
    const v = json.bufferViews[i], {mode, count, stride} = v.meshopt, out = new Uint8Array(count * stride);
    decoder.decodeGltfBuffer(out, count, stride, new Uint8Array(bin, v.byteOffset || 0, v.byteLength), mode, 'NONE');
    decoded.set(i, out);
    return out;
  };
  const attr = i => {
    const a = json.accessors[i], n = SIZE[a.type], T = TYPES[a.componentType];
    if (json.bufferViews[a.bufferView].meshopt) {
      const raw = unpack(a.bufferView), stride = json.bufferViews[a.bufferView].meshopt.stride, size = T.BYTES_PER_ELEMENT;
      const q = a.extras?.q, out = q ? new Float32Array(a.count * n) : new T(a.count * n);
      const src = new T(raw.buffer, 0, raw.byteLength / size), step = stride / size;
      for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) {
        const x = src[k * step + c];
        out[k * n + c] = q ? q.min[c] + x / 65535 * (q.max[c] - q.min[c]) : x;
      }
      return new THREE.BufferAttribute(out, n, !q && !!a.normalized);
    }
    const v = view(a.bufferView);
    if (v.stride && v.stride !== n * T.BYTES_PER_ELEMENT) throw new Error('入り組んだバッファには対応していません');
    return new THREE.BufferAttribute(new T(bin, v.offset + (a.byteOffset || 0), a.count * n), n, !!a.normalized);
  };

  const images = await Promise.all((json.images || []).map(async im => {
    const v = view(im.bufferView);
    return createImageBitmap(new Blob([new Uint8Array(bin, v.offset, v.length)], {type:im.mimeType}));
  }));
  const texCache = new Map();
  const texture = i => {
    if (texCache.has(i)) return texCache.get(i);
    const t = json.textures[i], src = t.extensions?.EXT_texture_webp?.source ?? t.source;
    const tex = new THREE.Texture(images[src]);
    tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = anisotropy;
    tex.needsUpdate = true;
    texCache.set(i, tex);
    return tex;
  };

  const matCache = new Map();
  const material = (i, hasColor) => {
    const m = json.materials[i], useColor = hasColor && VERTEX_COLOR.has(m.name), key = i + (useColor ? 'c' : '');
    if (matCache.has(key)) return matCache.get(key);
    const p = m.pbrMetallicRoughness || {}, f = p.baseColorFactor || [1, 1, 1, 1];
    const mat = new THREE.MeshStandardMaterial({name:m.name, color:new THREE.Color(f[0], f[1], f[2]), roughness:p.roughnessFactor ?? 1, metalness:p.metallicFactor ?? 1,
      side:m.doubleSided ? THREE.DoubleSide : THREE.FrontSide, vertexColors:useColor});
    if (p.baseColorTexture) mat.map = texture(p.baseColorTexture.index);
    if (m.emissiveFactor) { mat.emissive.setRGB(...m.emissiveFactor); mat.emissiveIntensity = m.extensions?.KHR_materials_emissive_strength?.emissiveStrength ?? 1; }
    if (m.alphaMode === 'MASK' || (m.alphaMode === 'BLEND' && mat.map)) mat.alphaTest = m.alphaCutoff ?? 0.5;   // 葉は切り抜きで描く（重なりの順が乱れない）
    else if (m.alphaMode === 'BLEND') { mat.transparent = true; mat.opacity = f[3]; mat.depthWrite = false; }
    matCache.set(key, mat);
    return mat;
  };

  const root = new THREE.Group(), nodes = {};
  root.name = url;
  for (const n of json.nodes) {
    const g = new THREE.Group();
    g.name = n.name; g.userData = n.extras || {};
    if (n.translation) g.position.fromArray(n.translation);
    if (n.rotation) g.quaternion.fromArray(n.rotation);
    if (n.scale) g.scale.fromArray(n.scale);
    if (n.mesh !== undefined) for (const pr of json.meshes[n.mesh].primitives) {
      const geo = new THREE.BufferGeometry(), a = pr.attributes;
      geo.setAttribute('position', attr(a.POSITION));
      if (a.NORMAL !== undefined) geo.setAttribute('normal', attr(a.NORMAL));
      if (a.TEXCOORD_0 !== undefined) geo.setAttribute('uv', attr(a.TEXCOORD_0));
      const mat = material(pr.material, a.COLOR_0 !== undefined);
      if (mat.vertexColors) geo.setAttribute('color', attr(a.COLOR_0));
      if (pr.indices !== undefined) geo.setIndex(attr(pr.indices));
      g.add(new THREE.Mesh(geo, mat));
    }
    nodes[n.name] = g;
    root.add(g);
  }
  return {scene:root, nodes};
}
