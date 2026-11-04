import * as THREE from 'three'
import { Simplex2D, lerp, smoothstep } from './noise'
import { KOPJE, TERRAIN_SEGMENTS, TERRAIN_SIZE, WATERHOLE, WORLD_SEED } from './layout'
import { biomeAt } from './regions'
import type { BiomeWeights } from './regions'
import { toonMaterial } from '../render/toon'

const simplex = new Simplex2D(WORLD_SEED)
const detail = new Simplex2D(WORLD_SEED + 7)
const patch = new Simplex2D(WORLD_SEED + 31)
const edge = new Simplex2D(WORLD_SEED + 13)

/** 起伏のもとになるノイズ高さ（コピエと水場の加工前） */
function baseHeight(x: number, z: number): number {
  const broad = simplex.fbm(x * 0.011, z * 0.011, 4, 2.1, 0.5) * 3.6
  const fine = detail.fbm(x * 0.05, z * 0.05, 2, 2, 0.5) * 0.35
  return broad + fine
}

const kopjeBase = baseHeight(KOPJE.x, KOPJE.z)
const kopjeTop = kopjeBase + KOPJE.height
const waterBase = baseHeight(WATERHOLE.x, WATERHOLE.z) - WATERHOLE.depth

/** 水面の高さ */
export const WATER_LEVEL = waterBase + 0.75

/** 0..1 を段々にする。段の上は平ら、段の間は急 */
function terrace(w: number, steps: number): number {
  const s = w * steps
  const i = Math.floor(s)
  const f = s - i
  return Math.min(1, (i + smoothstep(0.68, 1, f)) / steps)
}

/**
 * コピエの持ち上げ量（0..1）と「崖らしさ」（0 = 坂、1 = 段々の崖）。
 * 地形と色づけの両方で使う。
 */
export function kopjeShape(x: number, z: number): { w: number; cliff: number; dk: number } {
  const dx = x - KOPJE.x
  const dz = z - KOPJE.z
  let dk = Math.hypot(dx, dz) / KOPJE.radius
  if (dk >= 1.2) return { w: 0, cliff: 0, dk }
  // 縁を少し波打たせて、真円に見せない
  dk += edge.noise(x * 0.06, z * 0.06) * 0.06
  if (dk >= 1) return { w: 0, cliff: 0, dk }
  const w = 1 - smoothstep(KOPJE.plateau, 1, dk)
  // +z（南）が登り口。そこから外れるほど崖になる
  const ang = Math.atan2(dz, dx) - Math.PI / 2
  const south = Math.abs(Math.atan2(Math.sin(ang), Math.cos(ang)))
  const cliff = smoothstep(KOPJE.rampHalfAngle, KOPJE.rampHalfAngle + 0.3, south)
  return { w: lerp(w, terrace(w, KOPJE.terraces), cliff), cliff, dk }
}

/** サバンナの高さ（いまのワールドそのまま） */
function savannaHeight(x: number, z: number): number {
  let h = baseHeight(x, z)

  // コピエ: 中心が平らな台地。南は坂、ほかは地層の崖
  const k = kopjeShape(x, z)
  if (k.w > 0) h = lerp(h, kopjeTop, k.w)

  // 水場: ゆるい窪みにする
  const dw = Math.hypot(x - WATERHOLE.x, z - WATERHOLE.z) / (WATERHOLE.radius * 1.9)
  if (dw < 1) {
    const w = 1 - smoothstep(0.3, 1, dw)
    h = lerp(h, waterBase, w)
  }

  return h
}

// ほかのワールドの起伏。サバンナと同じノイズを使い、強さと細かさだけ変える
const outerNoise = new Simplex2D(WORLD_SEED + 211)
/** 北の世界: 雪の積もったゆるい丘 */
function northHeight(x: number, z: number): number {
  return simplex.fbm(x * 0.012, z * 0.012, 4, 2.1, 0.5) * 5.2 + outerNoise.fbm(x * 0.06, z * 0.06, 2, 2, 0.5) * 0.25
}
/** ジャングル: こぶの多い森の地面 */
function jungleHeight(x: number, z: number): number {
  return simplex.fbm(x * 0.016, z * 0.016, 4, 2.0, 0.5) * 4.2 + outerNoise.fbm(x * 0.05, z * 0.05, 2, 2, 0.5) * 0.6
}
/** 南半球: 平らな赤い大地に低い砂の波 */
function southHeight(x: number, z: number): number {
  const dunes = Math.sin(x * 0.045 + outerNoise.noise(x * 0.01, z * 0.01) * 2.2) * 0.35
  return simplex.fbm(x * 0.008, z * 0.008, 3, 2.0, 0.5) * 2.4 + dunes
}

const _w: BiomeWeights = { africa: 1, north: 0, jungle: 0, south: 0 }

/**
 * 地形の高さ関数。地形メッシュ、置き物の足元、プレイヤーの高さがすべてこれを使う。
 * サバンナの歩ける範囲の中はサバンナの高さそのもの。峠の途中でとなりのワールドの起伏へつながる。
 */
export function terrainHeight(x: number, z: number): number {
  const w = biomeAt(x, z, _w)
  if (w.africa >= 0.9999) return savannaHeight(x, z)
  let h = 0
  if (w.africa > 0) h += w.africa * savannaHeight(x, z)
  if (w.north > 0) h += w.north * northHeight(x, z)
  if (w.jungle > 0) h += w.jungle * jungleHeight(x, z)
  if (w.south > 0) h += w.south * southHeight(x, z)
  return h
}

/** 地形の傾き（法線の y 成分。1 が水平） */
export function terrainSlope(x: number, z: number, e = 0.75): number {
  const hx = terrainHeight(x + e, z) - terrainHeight(x - e, z)
  const hz = terrainHeight(x, z + e) - terrainHeight(x, z - e)
  const n = new THREE.Vector3(-hx, 2 * e, -hz).normalize()
  return n.y
}

// 乾季のサバンナ。明るい麦わら色を基本に、淡く枯れた帯・こがね色の帯・低い所の若草色の差を広く取る。
// 草のはげた赤土のまだらと、動物が通ってできた細い踏み分け道（白っぽい土）も入れる
const colGrass = new THREE.Color('#d9ac42')
const colGrassDry = new THREE.Color('#e8c978')
const colGrassTawny = new THREE.Color('#c8923a')
const colGrassGreen = new THREE.Color('#aec25a')
const colEarth = new THREE.Color('#c58b57')
const colBare = new THREE.Color('#cf9a68')
const colTrail = new THREE.Color('#d8b886')
const colRock = new THREE.Color('#b39176')
const trailNoise = new Simplex2D(WORLD_SEED + 57)
const bareNoise = new Simplex2D(WORLD_SEED + 63)

/**
 * 踏み分け道の濃さ（0..1）。細いノイズの尾根で、幅 2〜4m ほどの道が平原をうねる。
 * 草むらもここを避ける（props の草の濃さに使う）。コピエと水場の中、峠の先は 0
 */
export function savannaTrail(x: number, z: number): number {
  const d = Math.hypot(x, z)
  if (d > 150) return 0
  const n = Math.abs(trailNoise.noise(x * 0.016 + 4, z * 0.016 - 9))
  const n2 = Math.abs(trailNoise.noise(x * 0.011 - 30, z * 0.011 + 12))
  let t = Math.max(1 - smoothstep(0.008, 0.03, n), (1 - smoothstep(0.006, 0.024, n2)) * 0.7)
  t *= 1 - smoothstep(120, 150, d)
  const k = Math.hypot(x - KOPJE.x, z - KOPJE.z) / KOPJE.radius
  t *= smoothstep(1.0, 1.25, k)
  const dw = Math.hypot(x - WATERHOLE.x, z - WATERHOLE.z) / WATERHOLE.radius
  t *= smoothstep(1.1, 1.6, dw)
  return t
}
// 地層の帯。赤い層・黄土の層・暗い層が重なる
const colStrata = [new THREE.Color('#c46c4a'), new THREE.Color('#e2aa6e'), new THREE.Color('#8f5f48')]

function savannaColor(x: number, z: number, h: number, out: THREE.Color): void {
  const n = detail.noise(x * 0.03 + 11, z * 0.03 - 5) * 0.5 + 0.5
  out.copy(colGrass).lerp(colGrassDry, n * 0.7)
  // 細かいむら（数 m）。一面ののっぺりした色に見せない
  const fine = detail.noise(x * 0.11 - 2, z * 0.11 + 6)
  out.lerp(fine > 0 ? colGrassDry : colGrassTawny, Math.abs(fine) * 0.35)

  // 大きなまだら。草むらと同じノイズで、淡く枯れた帯・こがね色の帯・若草色の帯を作る
  const big = patch.noise(x * 0.02 + 3, z * 0.02 - 7) * 0.5 + 0.5
  out.lerp(colGrassDry, Math.max(0, big - 0.58) * 1.2)
  out.lerp(colGrassTawny, Math.max(0, 0.5 - Math.abs(big - 0.46) * 6) * 0.45)
  out.lerp(colGrassGreen, Math.max(0, 0.4 - big) * 1.7)

  // 低い場所は若草色、乾いた高い場所は淡い麦わら色
  const rel = (h - 0) / 4
  if (rel < 0) out.lerp(colGrassGreen, Math.min(1, -rel * 0.6))
  else out.lerp(colGrassDry, Math.min(1, rel * 0.35))

  // 草のはげた赤土のまだら（ところどころ）
  const bare = bareNoise.noise(x * 0.045 + 7, z * 0.045 - 3)
  out.lerp(colBare, smoothstep(0.52, 0.72, bare) * 0.7)

  // 踏み分け道
  const trail = savannaTrail(x, z)
  if (trail > 0) out.lerp(colTrail, trail * 0.6)

  // 水場のまわりは土と緑
  const dw = Math.hypot(x - WATERHOLE.x, z - WATERHOLE.z) / (WATERHOLE.radius * 1.9)
  if (dw < 1) {
    const w = 1 - smoothstep(0.35, 1, dw)
    out.lerp(colGrassGreen, w * 0.6)
    const mud = 1 - smoothstep(0.45, 0.7, dw)
    out.lerp(colEarth, mud * 0.9)
  }

  const slope = terrainSlope(x, z, 0.6)

  // コピエ: 内側はほぼ岩肌。段の上には乾いた草が少し、崖の面は地層の帯、南の坂は土の道
  const k = kopjeShape(x, z)
  if (k.dk < 1.15) {
    const rockW = 1 - smoothstep(0.92, 1.12, k.dk)
    out.lerp(colRock, rockW * 0.9)
    if (slope > 0.96) out.lerp(colGrassDry, 0.3 * rockW)
    if (k.cliff < 1 && k.dk > KOPJE.plateau) {
      out.lerp(colEarth, (1 - k.cliff) * 0.55 * rockW)
      // 坂の下のほうには草が入り込む
      const low = smoothstep(0.6, 1.0, k.dk) * (1 - k.cliff)
      out.lerp(colGrassDry, low * 0.7)
    }
    if (k.cliff > 0.2 && slope < 0.85) {
      const band = Math.floor((h - kopjeBase + 0.4) / 0.8)
      const strata = colStrata[((band % 3) + 3) % 3]
      out.lerp(strata, Math.min(1, (0.85 - slope) * 3) * k.cliff)
    }
    return
  }

  // 急斜面は土が見える
  if (slope < 0.92) out.lerp(colEarth, Math.min(1, (0.92 - slope) * 4))
}

// 北の世界: 雪と、風で雪の飛んだ岩・枯れ草
const colSnow = new THREE.Color('#ccd9e5')
const colSnowShade = new THREE.Color('#a3b8cc')
const colTundra = new THREE.Color('#a9a582')
const colNorthRock = new THREE.Color('#7d8796')
function northColor(x: number, z: number, h: number, slope: number, out: THREE.Color): void {
  const n = detail.noise(x * 0.03 + 5, z * 0.03 + 9) * 0.5 + 0.5
  out.copy(colSnow).lerp(colSnowShade, n * 0.8)
  const big = patch.noise(x * 0.018 - 4, z * 0.018 + 2) * 0.5 + 0.5
  // 低いところに雪の薄い草地
  out.lerp(colTundra, Math.max(0, 0.38 - big) * 1.4 * smoothstep(1.5, -2.5, h))
  if (slope < 0.93) out.lerp(colNorthRock, Math.min(1, (0.93 - slope) * 5))
}

// ジャングル: 濃い緑の下草と、湿った土の道
const colJungle = new THREE.Color('#7f9a55')
const colJungleDeep = new THREE.Color('#5f8049')
const colMoss = new THREE.Color('#aab45c')
const colJungleEarth = new THREE.Color('#8f6a42')
function jungleColor(x: number, z: number, _h: number, slope: number, out: THREE.Color): void {
  const n = detail.noise(x * 0.04 - 3, z * 0.04 + 7) * 0.5 + 0.5
  out.copy(colJungle).lerp(colJungleDeep, n)
  const big = patch.noise(x * 0.022 + 8, z * 0.022 - 1) * 0.5 + 0.5
  out.lerp(colMoss, Math.max(0, big - 0.62) * 1.6)
  // けもの道のような土の筋
  const trail = Math.abs(outerNoise.noise(x * 0.012 + 20, z * 0.012 - 20))
  out.lerp(colJungleEarth, (1 - smoothstep(0.02, 0.07, trail)) * 0.75)
  if (slope < 0.9) out.lerp(colJungleEarth, Math.min(1, (0.9 - slope) * 4))
}

// 南半球: 赤い土、乾いた草のまだら、白っぽい砂
const colRed = new THREE.Color('#bf8a62')
const colRedDeep = new THREE.Color('#a46a4c')
const colSpinifex = new THREE.Color('#c4a356')
const colSand = new THREE.Color('#ddb27e')
function southColor(x: number, z: number, _h: number, slope: number, out: THREE.Color): void {
  const n = detail.noise(x * 0.035 + 1, z * 0.035 - 4) * 0.5 + 0.5
  out.copy(colRed).lerp(colRedDeep, n * 0.8)
  const big = patch.noise(x * 0.02 - 6, z * 0.02 + 5) * 0.5 + 0.5
  out.lerp(colSpinifex, Math.max(0, big - 0.55) * 1.5)
  out.lerp(colSand, Math.max(0, 0.32 - big) * 1.6)
  if (slope < 0.9) out.lerp(colRedDeep, Math.min(1, (0.9 - slope) * 4))
}

const _cTmp = new THREE.Color()
function vertexColor(x: number, z: number, h: number, out: THREE.Color): void {
  const w = biomeAt(x, z, _w)
  if (w.africa >= 0.9999) {
    savannaColor(x, z, h, out)
    return
  }
  const slope = terrainSlope(x, z, 0.6)
  out.setRGB(0, 0, 0)
  if (w.africa > 0) {
    savannaColor(x, z, h, _cTmp)
    out.add(_cTmp.multiplyScalar(w.africa))
  }
  if (w.north > 0) {
    northColor(x, z, h, slope, _cTmp)
    out.add(_cTmp.multiplyScalar(w.north))
  }
  if (w.jungle > 0) {
    jungleColor(x, z, h, slope, _cTmp)
    out.add(_cTmp.multiplyScalar(w.jungle))
  }
  if (w.south > 0) {
    southColor(x, z, h, slope, _cTmp)
    out.add(_cTmp.multiplyScalar(w.south))
  }
}

/** 地形の 1 枚。cx, cz は中心、w, d は幅と奥行き、segX, segZ は分割数 */
function createTile(cx: number, cz: number, w: number, d: number, segX: number, segZ: number, mat: THREE.Material): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(w, d, segX, segZ)
  geo.rotateX(-Math.PI / 2)
  geo.translate(cx, 0, cz)

  const pos = geo.attributes.position as THREE.BufferAttribute
  const colors = new Float32Array(pos.count * 3)
  const c = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const z = pos.getZ(i)
    const h = terrainHeight(x, z)
    pos.setY(i, h)
    vertexColor(x, z, h, c)
    colors[i * 3] = c.r
    colors[i * 3 + 1] = c.g
    colors[i * 3 + 2] = c.b
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geo.computeVertexNormals()
  addSkirt(geo, segX, segZ)

  const mesh = new THREE.Mesh(geo, mat)
  mesh.receiveShadow = true
  return mesh
}

/**
 * タイルの縁に下向きの「すそ」を足す。分割の細かさが違うタイルどうしの継ぎ目にできる、
 * 髪の毛ほどの隙間から空が見えないように。すそは縁の頂点をそのまま 2m 下へ伸ばした帯
 */
function addSkirt(geo: THREE.BufferGeometry, segX: number, segZ: number): void {
  const pos = geo.attributes.position as THREE.BufferAttribute
  const col = geo.attributes.color as THREE.BufferAttribute
  const nor = geo.attributes.normal as THREE.BufferAttribute
  const cols = segX + 1
  const idx = (ix: number, iz: number) => iz * cols + ix
  const edges: number[][] = [
    Array.from({ length: cols }, (_, i) => idx(i, 0)),
    Array.from({ length: segZ + 1 }, (_, i) => idx(segX, i)),
    Array.from({ length: cols }, (_, i) => idx(segX - i, segZ)),
    Array.from({ length: segZ + 1 }, (_, i) => idx(0, segZ - i)),
  ]
  const base = pos.count
  const extra = edges.reduce((n, e) => n + e.length, 0)
  const p2 = new Float32Array((base + extra) * 3)
  const c2 = new Float32Array((base + extra) * 3)
  const n2 = new Float32Array((base + extra) * 3)
  p2.set(pos.array as Float32Array)
  c2.set(col.array as Float32Array)
  n2.set(nor.array as Float32Array)
  const index = Array.from(geo.index?.array ?? [])
  let k = base
  for (const edge of edges) {
    const start = k
    for (const v of edge) {
      p2[k * 3] = pos.getX(v)
      p2[k * 3 + 1] = pos.getY(v) - 2
      p2[k * 3 + 2] = pos.getZ(v)
      c2[k * 3] = col.getX(v)
      c2[k * 3 + 1] = col.getY(v)
      c2[k * 3 + 2] = col.getZ(v)
      n2[k * 3 + 1] = 1
      k++
    }
    for (let i = 0; i < edge.length - 1; i++) {
      const a = edge[i]
      const b = edge[i + 1]
      const a2 = start + i
      const b2 = start + i + 1
      // 両面から見えるように表裏 2 組
      index.push(a, a2, b, b, a2, b2, a, b, a2, b, b2, a2)
    }
  }
  geo.setAttribute('position', new THREE.BufferAttribute(p2, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(c2, 3))
  geo.setAttribute('normal', new THREE.BufferAttribute(n2, 3))
  geo.setIndex(index)
}

/**
 * 地形。サバンナ（中央 400m 四方）はいままでの細かさ、まわりの 3 枚（北・南・西）は 2 倍の粗さ。
 * タイルごとに画面の外なら描かない。継ぎ目の頂点はサバンナの 1 つおきに重なる
 */
export function createTerrain(): THREE.Group {
  const group = new THREE.Group()
  group.name = 'terrain'
  // 面の割れ目を見せない滑らかな陰影に、段差のあるトゥーンを乗せる
  const mat = toonMaterial({ vertexColors: true })
  const half = TERRAIN_SIZE / 2
  const step = (TERRAIN_SIZE / TERRAIN_SEGMENTS) * 2
  const outerSegs = 100
  const outerDepth = step * outerSegs
  const fullSegs = TERRAIN_SEGMENTS / 2
  group.add(createTile(0, 0, TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS, mat))
  // 北（-z）と南（+z）
  group.add(createTile(0, -half - outerDepth / 2, TERRAIN_SIZE, outerDepth, fullSegs, outerSegs, mat))
  group.add(createTile(0, half + outerDepth / 2, TERRAIN_SIZE, outerDepth, fullSegs, outerSegs, mat))
  // 西（-x）
  group.add(createTile(-half - outerDepth / 2, 0, outerDepth, TERRAIN_SIZE, outerSegs, fullSegs, mat))
  return group
}
