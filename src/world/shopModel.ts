import * as THREE from 'three'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { toonMaterial } from '../render/toon'

/**
 * グッズのお店（大樹の店）のモデルを読む。
 * public/shop3d/models の GLB は、売り場（public/shop3d/store/glb.js）専用に軽くした形
 * （法線は 1 バイト、位置と UV は 0〜65535 に詰めて meshopt で圧縮。glTF の決まりから外れるので GLTFLoader では読めない）。
 * ここは、その読み込みをワールド用に書いたもの。ノードは親子なしで、名前で引ける。
 */
interface Accessor {
  bufferView: number
  byteOffset?: number
  componentType: number
  count: number
  type: 'SCALAR' | 'VEC2' | 'VEC3' | 'VEC4' | 'MAT4'
  normalized?: boolean
  extras?: { q?: { min: number[]; max: number[] } }
}
interface BufferView {
  byteOffset?: number
  byteLength: number
  byteStride?: number
  meshopt?: { mode: string; count: number; stride: number }
}
interface GltfMaterial {
  name: string
  doubleSided?: boolean
  alphaMode?: string
  alphaCutoff?: number
  emissiveFactor?: [number, number, number]
  extensions?: { KHR_materials_emissive_strength?: { emissiveStrength?: number } }
  pbrMetallicRoughness?: {
    baseColorFactor?: number[]
    roughnessFactor?: number
    metallicFactor?: number
    baseColorTexture?: { index: number }
  }
}
interface Gltf {
  accessors: Accessor[]
  bufferViews: BufferView[]
  images?: Array<{ bufferView: number; mimeType: string }>
  textures?: Array<{ source?: number; extensions?: { EXT_texture_webp?: { source: number } } }>
  materials: GltfMaterial[]
  meshes: Array<{ primitives: Array<{ attributes: Record<string, number>; indices?: number; material: number }> }>
  nodes: Array<{ name: string; mesh?: number; translation?: number[]; rotation?: number[]; scale?: number[] }>
}

type TypedArrayCtor = Int8ArrayConstructor | Uint8ArrayConstructor | Int16ArrayConstructor | Uint16ArrayConstructor | Uint32ArrayConstructor | Float32ArrayConstructor
const TYPES: Record<number, TypedArrayCtor> = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array }
const SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }
/** 頂点の色を使う材質（売り場の glb.js と同じ） */
const VERTEX_COLOR = new Set(['Bark', 'Leaves', 'Flowers', 'Moss ground', 'Moss', 'Stone', 'Leaf sprig'])

export interface ShopModel {
  nodes: Record<string, THREE.Group>
}

/** want(name) が true のノードだけ形を作る（使わない部品の展開と GPU への転送を省く） */
export async function loadShopModel(url: string, want: (name: string) => boolean): Promise<ShopModel> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: ${res.status}`)
  const buf = await res.arrayBuffer()
  const dv = new DataView(buf)
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error(`${url}: not a GLB`)
  let off = 12
  let json: Gltf | null = null
  let bin: ArrayBuffer | null = null
  while (off < buf.byteLength) {
    const len = dv.getUint32(off, true)
    const type = dv.getUint32(off + 4, true)
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, off + 8, len))) as Gltf
    else if (type === 0x004e4942) bin = buf.slice(off + 8, off + 8 + len)
    off += 8 + len
  }
  if (!json || !bin) throw new Error(`${url}: incomplete`)
  const gltf = json
  const data = bin
  await MeshoptDecoder.ready

  const decoded = new Map<number, Uint8Array>()
  const unpack = (i: number): Uint8Array => {
    const hit = decoded.get(i)
    if (hit) return hit
    const v = gltf.bufferViews[i]
    const m = v.meshopt as NonNullable<BufferView['meshopt']>
    const out = new Uint8Array(m.count * m.stride)
    MeshoptDecoder.decodeGltfBuffer(out, m.count, m.stride, new Uint8Array(data, v.byteOffset ?? 0, v.byteLength), m.mode, 'NONE')
    decoded.set(i, out)
    return out
  }
  const attr = (i: number): THREE.BufferAttribute => {
    const a = gltf.accessors[i]
    const n = SIZE[a.type]
    const T = TYPES[a.componentType]
    const view = gltf.bufferViews[a.bufferView]
    if (view.meshopt) {
      const raw = unpack(a.bufferView)
      const size = T.BYTES_PER_ELEMENT
      const q = a.extras?.q
      const src = new T(raw.buffer as ArrayBuffer, 0, raw.byteLength / size)
      const step = view.meshopt.stride / size
      const out = q ? new Float32Array(a.count * n) : new T(a.count * n)
      for (let k = 0; k < a.count; k++) {
        for (let c = 0; c < n; c++) {
          const x = src[k * step + c]
          out[k * n + c] = q ? q.min[c] + (x / 65535) * (q.max[c] - q.min[c]) : x
        }
      }
      return new THREE.BufferAttribute(out, n, !q && !!a.normalized)
    }
    return new THREE.BufferAttribute(new T(data, (view.byteOffset ?? 0) + (a.byteOffset ?? 0), a.count * n), n, !!a.normalized)
  }

  const textures = new Map<number, Promise<THREE.Texture>>()
  const texture = (i: number): Promise<THREE.Texture> => {
    let p = textures.get(i)
    if (!p) {
      const t = (gltf.textures ?? [])[i]
      const im = (gltf.images ?? [])[t.extensions?.EXT_texture_webp?.source ?? t.source ?? 0]
      const v = gltf.bufferViews[im.bufferView]
      p = createImageBitmap(new Blob([new Uint8Array(data, v.byteOffset ?? 0, v.byteLength)], { type: im.mimeType })).then((bitmap) => {
        const tex = new THREE.Texture(bitmap)
        tex.flipY = false
        tex.colorSpace = THREE.SRGBColorSpace
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping
        tex.anisotropy = 4
        tex.needsUpdate = true
        return tex
      })
      textures.set(i, p)
    }
    return p
  }

  const materials = new Map<string, Promise<THREE.MeshToonMaterial>>()
  const material = (i: number, hasColor: boolean): Promise<THREE.MeshToonMaterial> => {
    const m = gltf.materials[i]
    const useColor = hasColor && VERTEX_COLOR.has(m.name)
    const key = `${i}${useColor ? 'c' : ''}`
    let p = materials.get(key)
    if (!p) {
      p = (async () => {
        const pbr = m.pbrMetallicRoughness ?? {}
        const f = pbr.baseColorFactor ?? [1, 1, 1, 1]
        // ワールドのほかの物と同じトゥーンの材質にする（売り場の PBR の材質は、映り込みの絵が無いワールドでは日かげが黒くつぶれる）
        const mat = toonMaterial({
          color: new THREE.Color(f[0], f[1], f[2]),
          side: m.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
          vertexColors: useColor,
        })
        mat.name = m.name
        if (pbr.baseColorTexture) mat.map = await texture(pbr.baseColorTexture.index)
        if (m.emissiveFactor) {
          mat.emissive.setRGB(...m.emissiveFactor)
          mat.emissiveIntensity = m.extensions?.KHR_materials_emissive_strength?.emissiveStrength ?? 1
        }
        if (m.alphaMode === 'MASK' || (m.alphaMode === 'BLEND' && mat.map)) mat.alphaTest = m.alphaCutoff ?? 0.5
        else if (m.alphaMode === 'BLEND') {
          mat.transparent = true
          mat.opacity = f[3]
          mat.depthWrite = false
        }
        return mat
      })()
      materials.set(key, p)
    }
    return p
  }

  const nodes: Record<string, THREE.Group> = {}
  for (const n of gltf.nodes) {
    if (n.mesh === undefined || !want(n.name)) continue
    const g = new THREE.Group()
    g.name = n.name
    if (n.translation) g.position.fromArray(n.translation)
    if (n.rotation) g.quaternion.fromArray(n.rotation)
    if (n.scale) g.scale.fromArray(n.scale)
    for (const pr of gltf.meshes[n.mesh].primitives) {
      const geo = new THREE.BufferGeometry()
      const a = pr.attributes
      geo.setAttribute('position', attr(a.POSITION))
      if (a.NORMAL !== undefined) geo.setAttribute('normal', attr(a.NORMAL))
      if (a.TEXCOORD_0 !== undefined) geo.setAttribute('uv', attr(a.TEXCOORD_0))
      const mat = await material(pr.material, a.COLOR_0 !== undefined)
      if (mat.vertexColors) geo.setAttribute('color', attr(a.COLOR_0))
      if (pr.indices !== undefined) geo.setIndex(attr(pr.indices))
      g.add(new THREE.Mesh(geo, mat))
    }
    nodes[n.name] = g
  }
  return { nodes }
}
