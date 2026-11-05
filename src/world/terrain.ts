import * as THREE from 'three'
import { Simplex2D, lerp, smoothstep } from './noise'
import { KOPJE, TERRAIN_SEGMENTS, TERRAIN_SIZE, WATERHOLE, WORLD_SEED } from './layout'
import { OUTER_REGIONS, biomeAt, emptyWeights } from './regions'
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

/**
 * 水の世界: 海に突き出た岬。西（峠の側）は砂丘と浜の草地、北・東・南は歩ける範囲の縁で浜が海へ下りる。
 * 観察スポットの北東に浅い入り江（潟）があり、細い流れが東の海へつながる。
 * 潟と流れはくるぶし〜ひざほどの浅さ（サバンナの水場と同じく、入って歩ける）
 */
const WATER = OUTER_REGIONS.find((r) => r.key === 'water') ?? { x: 300, z: 0, walk: 100 }
/** 水の世界の海面の高さ（サバンナの水場の WATER_LEVEL とは別） */
export const SEA_LEVEL = -0.6
/** スポットの北東の潟（中心はワールドの中心からのずれ、半径は楕円の 2 軸） */
export const LAGOON = { dx: 15, dz: -13, rx: 11, rz: 8 }
/** 潟から東の海へ流れる小川の折れ線（ワールドの中心からのずれ） */
export const CREEK: ReadonlyArray<[number, number]> = [
  [24, -15],
  [42, -22],
  [62, -20],
  [82, -28],
  [110, -34],
]
const shoreNoise = new Simplex2D(WORLD_SEED + 223)
/**
 * 中心からその向きの海岸までの距離。北・東・南は歩ける範囲の縁（約 97m）。
 * 北西・南西は 165m（地形のタイルの中に収める）、真西（峠の側）は遠くまで陸
 */
function shoreRadius(lx: number, lz: number): number {
  const a = Math.atan2(lz, lx)
  const c = Math.cos(a)
  const wobble = shoreNoise.noise(c * 1.6 + 3, Math.sin(a) * 1.6 - 2) * 7 + shoreNoise.noise(c * 4.5, Math.sin(a) * 4.5) * 3
  const west = lerp(165, 280, smoothstep(0.75, 0.97, -c))
  return lerp(west, 97 + wobble, smoothstep(-0.5, 0.05, c))
}
function segDist(x: number, z: number, ax: number, az: number, bx: number, bz: number): number {
  const vx = bx - ax
  const vz = bz - az
  const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz)))
  return Math.hypot(x - ax - vx * t, z - az - vz * t)
}
/** 小川の軸までの距離（ワールドの中心からのずれで測る） */
export function creekDist(lx: number, lz: number): number {
  let d = Infinity
  for (let i = 0; i < CREEK.length - 1; i++) d = Math.min(d, segDist(lx, lz, CREEK[i][0], CREEK[i][1], CREEK[i + 1][0], CREEK[i + 1][1]))
  return d
}
/** 潟の楕円の正規化した距離（1 が縁） */
export function lagoonDist(lx: number, lz: number): number {
  return Math.hypot((lx - LAGOON.dx) / LAGOON.rx, (lz - LAGOON.dz) / LAGOON.rz)
}
/** 水の世界の高さ（海面からの高さ + SEA_LEVEL） */
function waterHeight(x: number, z: number): number {
  const lx = x - WATER.x
  const lz = z - WATER.z
  const r = Math.hypot(lx, lz)
  // 砂丘のゆるい起伏。スポットのまわりは平らに
  const dunes = simplex.fbm(x * 0.014 + 3, z * 0.014, 3, 2.0, 0.5) * 1.3 + outerNoise.fbm(x * 0.05, z * 0.05, 2, 2, 0.5) * 0.18
  let h = lerp(1.1 + dunes * 0.25, 1.7 + dunes, smoothstep(12, 40, r))
  // 浜: 海岸の 30m 手前から波打ちぎわへ下がり、その先は沖へ深くなる
  const shore = shoreRadius(lx, lz)
  h = lerp(h, -0.15, smoothstep(shore - 30, shore + 2, r))
  h -= 7 * smoothstep(shore + 2, shore + 50, r)
  // 潟: 楕円のくぼみ
  const dl = lagoonDist(lx, lz)
  if (dl < 1.4) h = lerp(h, -0.5, 1 - smoothstep(0.55, 1.12, dl))
  // 小川: 潟の縁から東の海へ
  if (lx > 18) {
    const dc = creekDist(lx, lz)
    if (dc < 5) h = Math.min(h, lerp(h, -0.3, 1 - smoothstep(1.4, 3.6, dc)))
  }
  return SEA_LEVEL + h
}

/**
 * ふれあいワールド: なだらかな牧草地。観察スポットのまわりは平らな広場で、そこから牧場の小道が輪になって回り、
 * 峠（北東）へもつながる。小道の位置は置き物（柵・納屋）と地図でも使う
 */
const PARTNER = OUTER_REGIONS.find((r) => r.key === 'partner') ?? { x: -254.6, z: 254.6, walk: 100 }
/** 広場のまわりを回る小道の半径（m） */
export const FARM_LOOP = 34
/** 中心から峠への向き（原点の方向） */
const PARTNER_TO_ORIGIN = Math.atan2(-PARTNER.z, -PARTNER.x)
/** 牧場の小道までの距離（中心からのずれで測る）。広場の輪と、輪から峠への道 */
export function farmPathDist(lx: number, lz: number): number {
  const ring = Math.abs(Math.hypot(lx, lz) - FARM_LOOP)
  // 峠への道: 中心から原点の向きへ（輪の内側は広場なので輪から外だけ）
  const ux = Math.cos(PARTNER_TO_ORIGIN)
  const uz = Math.sin(PARTNER_TO_ORIGIN)
  const t = lx * ux + lz * uz
  const toPass = t > FARM_LOOP - 2 ? Math.abs(lx * uz - lz * ux) : Infinity
  return Math.min(ring, toPass)
}
/** ふれあいワールドの高さ: ゆるい丘の牧草地。中心の広場は平ら */
function partnerHeight(x: number, z: number): number {
  const r = Math.hypot(x - PARTNER.x, z - PARTNER.z)
  const hills = simplex.fbm(x * 0.009 - 5, z * 0.009 + 2, 3, 2.0, 0.5) * 3.2 + outerNoise.fbm(x * 0.04, z * 0.04, 2, 2, 0.5) * 0.2
  return lerp(hills * 0.15 + 0.4, hills, smoothstep(14, 45, r))
}

const _w: BiomeWeights = emptyWeights()

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
  if (w.water > 0) h += w.water * waterHeight(x, z)
  if (w.partner > 0) h += w.partner * partnerHeight(x, z)
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
// トップの絵に寄せて、草は鮮やかな黄金色と若草色に（スマホは色補正のパスが無いので、素の色で鮮やかにする）。
// 岩は少し灰色に寄せて、上にいる金色の動物が沈まないようにする
const colGrass = new THREE.Color('#e8ae14')
const colGrassDry = new THREE.Color('#f3cc2a')
const colGrassTawny = new THREE.Color('#d8921a')
const colGrassGreen = new THREE.Color('#a6ca1e')
const colEarth = new THREE.Color('#c98a50')
const colBare = new THREE.Color('#df9833')
const colTrail = new THREE.Color('#e3ba60')
const colRock = new THREE.Color('#9c8c86')
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

function savannaColor(x: number, z: number, h: number, out: THREE.Color, forMap = false): void {
  const n = detail.noise(x * 0.03 + 11, z * 0.03 - 5) * 0.5 + 0.5
  out.copy(colGrass).lerp(colGrassDry, n * 0.7)
  // 細かいむら（数 m）。一面ののっぺりした色に見せない（地図の荒い格子では粒になるので入れない）
  if (!forMap) {
    const fine = detail.noise(x * 0.11 - 2, z * 0.11 + 6)
    out.lerp(fine > 0 ? colGrassDry : colGrassTawny, Math.abs(fine) * 0.35)
  }

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

  // 踏み分け道（幅が地図の格子より細いので、地図には入れない）
  if (!forMap) {
    const trail = savannaTrail(x, z)
    if (trail > 0) out.lerp(colTrail, trail * 0.6)
  }

  // 水場のまわりは土と緑
  const dw = Math.hypot(x - WATERHOLE.x, z - WATERHOLE.z) / (WATERHOLE.radius * 1.9)
  if (dw < 1) {
    const w = 1 - smoothstep(0.35, 1, dw)
    out.lerp(colGrassGreen, w * 0.6)
    const mud = 1 - smoothstep(0.45, 0.7, dw)
    out.lerp(colEarth, mud * 0.9)
  }

  // 地図はここまで（コピエは地図の上に別に描く。斜面の土は平原にはほとんどない）
  if (forMap) return

  const slope = terrainSlope(x, z, 0.6)

  // コピエ: 内側はほぼ岩肌。段の上には乾いた草が少し、崖の面は地層の帯、南の坂は土の道
  const k = kopjeShape(x, z)
  if (k.dk < 1.15) {
    const rockW = 1 - smoothstep(0.92, 1.12, k.dk)
    out.lerp(colRock, rockW * 0.9)
    // 段の上の草はうすく（草を鮮やかにしたので、多いと台地が黄色くなり、上にいるライオンが沈む）
    if (slope > 0.96) out.lerp(colGrassDry, 0.14 * rockW)
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

const _mapCol = new THREE.Color()
const _mapRgb = { r: 0, g: 0, b: 0 }
/**
 * 地図に描くサバンナの地面の色（sRGB 0..255）。3D の地面と同じまだら・赤土・低い所の若草色・水場のまわりの土。
 * 数 m の細かいむらと踏み分け道は、地図の格子（5m）より細かいので入れない
 */
export function savannaMapColor(x: number, z: number, out: [number, number, number]): void {
  savannaColor(x, z, terrainHeight(x, z), _mapCol, true)
  _mapCol.getRGB(_mapRgb, THREE.SRGBColorSpace)
  out[0] = _mapRgb.r * 255
  out[1] = _mapRgb.g * 255
  out[2] = _mapRgb.b * 255
}

// 北の世界: 雪と、風で雪の飛んだ岩・枯れ草。トップの絵に寄せて、雪は白く、影はうすい水色に
const colSnow = new THREE.Color('#eef4fb')
const colSnowShade = new THREE.Color('#c3d6ea')
const colTundra = new THREE.Color('#c2bd9a')
const colNorthRock = new THREE.Color('#8d98a8')
function northColor(x: number, z: number, h: number, slope: number, out: THREE.Color): void {
  const n = detail.noise(x * 0.03 + 5, z * 0.03 + 9) * 0.5 + 0.5
  out.copy(colSnow).lerp(colSnowShade, n * 0.8)
  const big = patch.noise(x * 0.018 - 4, z * 0.018 + 2) * 0.5 + 0.5
  // 低いところに雪の薄い草地
  out.lerp(colTundra, Math.max(0, 0.38 - big) * 1.4 * smoothstep(1.5, -2.5, h))
  if (slope < 0.93) out.lerp(colNorthRock, Math.min(1, (0.93 - slope) * 5))
}

// ジャングル: 鮮やかな若草色の下草と、湿った土の道（トップの絵の明るい黄緑に寄せる）
const colJungle = new THREE.Color('#8cc63f')
const colJungleDeep = new THREE.Color('#5aa33a')
const colMoss = new THREE.Color('#bfd84a')
const colJungleEarth = new THREE.Color('#9c6f44')
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

// 南半球: 赤い土、乾いた草のまだら、白っぽい砂（トップの絵のオレンジの土と黄金色の草に寄せる）
const colRed = new THREE.Color('#d8773f')
const colRedDeep = new THREE.Color('#b8562c')
const colSpinifex = new THREE.Color('#e3b64a')
const colSand = new THREE.Color('#ebc58c')
function southColor(x: number, z: number, _h: number, slope: number, out: THREE.Color): void {
  const n = detail.noise(x * 0.035 + 1, z * 0.035 - 4) * 0.5 + 0.5
  out.copy(colRed).lerp(colRedDeep, n * 0.8)
  const big = patch.noise(x * 0.02 - 6, z * 0.02 + 5) * 0.5 + 0.5
  out.lerp(colSpinifex, Math.max(0, big - 0.55) * 1.5)
  out.lerp(colSand, Math.max(0, 0.32 - big) * 1.6)
  if (slope < 0.9) out.lerp(colRedDeep, Math.min(1, (0.9 - slope) * 4))
}

// 水の世界: 白い砂浜、ぬれた砂、砂丘の浜の草（明るい黄緑）、潟と小川のふちの湿った草、岩
const colSandDry = new THREE.Color('#f3da9c')
const colSandWarm = new THREE.Color('#e9c47e')
const colSandWet = new THREE.Color('#d6b77a')
const colSandUnder = new THREE.Color('#e6cf96')
const colDuneGrass = new THREE.Color('#a8d25a')
const colDuneGrassDeep = new THREE.Color('#7fbb48')
const colMarsh = new THREE.Color('#6fb85a')
const colShoreRock = new THREE.Color('#98a2a8')
function waterColor(x: number, z: number, h: number, slope: number, out: THREE.Color): void {
  const rel = h - SEA_LEVEL
  const n = detail.noise(x * 0.04 + 2, z * 0.04 - 6) * 0.5 + 0.5
  out.copy(colSandDry).lerp(colSandWarm, n * 0.7)
  // 砂丘の上の浜の草（まだら）。波打ちぎわには生えない
  const big = patch.noise(x * 0.021 - 3, z * 0.021 + 8) * 0.5 + 0.5
  const grass = smoothstep(0.42, 0.62, big) * smoothstep(0.9, 1.6, rel)
  out.lerp(colDuneGrass, grass * 0.85)
  out.lerp(colDuneGrassDeep, grass * Math.max(0, big - 0.7) * 2)
  // 潟と小川のふちは湿った草
  const lx = x - WATER.x
  const lz = z - WATER.z
  const dl = lagoonDist(lx, lz)
  const dc = lx > 18 ? creekDist(lx, lz) : 99
  const marsh = Math.max(1 - smoothstep(1.05, 1.5, dl), 1 - smoothstep(3.4, 6.5, dc)) * smoothstep(0.1, 0.4, rel)
  out.lerp(colMarsh, marsh * 0.7)
  // 波打ちぎわはぬれた砂、水の下は明るい砂（海が透けて見える）
  out.lerp(colSandWet, 1 - smoothstep(0.1, 0.5, rel))
  if (rel < 0.05) out.copy(colSandUnder).lerp(colSandWet, n * 0.5)
  if (slope < 0.9) out.lerp(colShoreRock, Math.min(1, (0.9 - slope) * 4))
}

// ふれあいワールド: 刈りそろえた牧草の明るい緑、クローバーの淡いまだら、小道と広場の土、斜面の濃い緑
const colPasture = new THREE.Color('#8fd052')
const colPastureDeep = new THREE.Color('#6cba42')
const colClover = new THREE.Color('#b8e070')
const colFarmPath = new THREE.Color('#d6b47c')
const colFarmYard = new THREE.Color('#cfb07a')
function partnerColor(x: number, z: number, _h: number, slope: number, out: THREE.Color): void {
  const n = detail.noise(x * 0.045 + 8, z * 0.045 - 2) * 0.5 + 0.5
  out.copy(colPasture).lerp(colPastureDeep, n * 0.7)
  const big = patch.noise(x * 0.024 + 4, z * 0.024 + 9) * 0.5 + 0.5
  out.lerp(colClover, Math.max(0, big - 0.6) * 1.6)
  const lx = x - PARTNER.x
  const lz = z - PARTNER.z
  // 中心の広場（土をならした所）と、牧場の小道
  out.lerp(colFarmYard, (1 - smoothstep(7, 12, Math.hypot(lx, lz))) * 0.85)
  out.lerp(colFarmPath, (1 - smoothstep(1.6, 3.2, farmPathDist(lx, lz))) * 0.9)
  if (slope < 0.9) out.lerp(colPastureDeep, Math.min(1, (0.9 - slope) * 4))
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
  if (w.water > 0) {
    waterColor(x, z, h, slope, _cTmp)
    out.add(_cTmp.multiplyScalar(w.water))
  }
  if (w.partner > 0) {
    partnerColor(x, z, h, slope, _cTmp)
    out.add(_cTmp.multiplyScalar(w.partner))
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
 * 地形。サバンナ（中央 400m 四方）はいままでの細かさ、まわりの 5 枚（北・南・西・東・南西の角）は 2 倍の粗さ。
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
  // 東（+x）: 水の世界
  group.add(createTile(half + outerDepth / 2, 0, outerDepth, TERRAIN_SIZE, outerSegs, fullSegs, mat))
  // 南西の角（-x, +z）: ふれあいワールド
  group.add(createTile(-half - outerDepth / 2, half + outerDepth / 2, outerDepth, outerDepth, outerSegs, outerSegs, mat))
  return group
}
