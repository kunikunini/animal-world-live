import { ACACIAS, KOPJE, SPOT, WALK_RADIUS, WATERHOLE } from '../world/layout'
import { OUTER_REGIONS, PASS_HALF_WIDTH, REGIONS, distToPassAxis, isWalkable, regionAt } from '../world/regions'
import type { RegionKey } from '../world/regions'
import { Simplex2D, smoothstep } from '../world/noise'
import { CREEK, FARM_LOOP, GOAT_ROCKS, LAGOON, SKY_RING, savannaMapColor } from '../world/terrain'
import { getWorld } from '../data/worlds'
import { getLang, t } from './i18n'

/**
 * 地図の描画。左上のミニマップと、広げた全体地図の両方で使う。北が上。
 * 海に浮かぶひとつの大陸として描く: 地面の色はワールドごとの色が境目でにじんで混ざり（3D の地面の混ざり方と同じ境目）、
 * ワールドのあいだには 3D と同じ位置に山脈、サバンナから各ワールドへは峠の道。
 * ミニマップは丸い窓で自分のまわり（setView）、広げた地図は縦長の四角で大陸の全体（box）。
 * 地形は見る範囲が変わった時だけ描き直し、自分の位置と向き、動物の位置を毎回重ねる。
 */
export interface MinimapMarker {
  id: string
  name: string
  /** 種の名前（表示用）。広げた地図では個体名ではなく、同じワールドの同じ種をまとめて種の名前を 1 つ出す */
  species?: string
  x: number
  z: number
  /** 強調（そばにいる個体など） */
  active?: boolean
  /** ともだち帳に登録済み。緑の輪で区別する */
  friend?: boolean
}

export interface MapPlayer {
  x: number
  z: number
  heading: number
}

export interface MapBox {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export interface MapRenderer {
  width: number
  height: number
  draw: (ctx: CanvasRenderingContext2D, player: MapPlayer, lions: MinimapMarker[]) => void
  /** キャンバス座標 → 世界座標。窓の外や海なら null */
  toWorld: (mx: number, my: number) => { x: number; z: number } | null
  /** 丸い窓の見る範囲。中心（世界座標）と半径（m）。box の地図では使わない */
  setView: (cx: number, cz: number, radius: number) => void
  /** 広げた地図の動物の名前（種の名前）を出すかどうか */
  setNames: (on: boolean) => void
}

/** 出会った子を「ワールド × 種」でまとめる（1 つのワールドに同じ種の名前は 1 つ）。名前はその子たちのまん中に置く */
function speciesGroups(markers: MinimapMarker[]): Array<{ name: string; x: number; z: number }> {
  const groups: Array<{ name: string; region: RegionKey; x: number; z: number; n: number }> = []
  for (const m of markers) {
    const name = m.species ?? m.name
    const region = regionAt(m.x, m.z)
    const g = groups.find((it) => it.name === name && it.region === region)
    if (g) {
      g.x = (g.x * g.n + m.x) / (g.n + 1)
      g.z = (g.z * g.n + m.z) / (g.n + 1)
      g.n += 1
    } else {
      groups.push({ name, region, x: m.x, z: m.z, n: 1 })
    }
  }
  return groups
}

/** 自分のまわりを見るミニマップの半径（いままでのサバンナ全体と同じ） */
export const MINIMAP_RADIUS = WALK_RADIUS + 8

/** 広げた地図が映す範囲（大陸の全体と、まわりの海）。縦横 3:4 */
export const CONTINENT_VIEW: MapBox = { minX: -510, maxX: 450, minZ: -640, maxZ: 640 }

const C = {
  sea: '#86c4e4',
  seaDeep: '#6eb3da',
  shallow: '#b4e0f1',
  wave: 'rgba(255, 255, 255, 0.55)',
  beach: '#f6e7bd',
  coastLine: 'rgba(70, 52, 38, 0.5)',
  water: '#8fc6ec',
  // コピエは 3D の岩肌（少し灰色）に合わせる
  rock: '#b39484',
  ramp: '#cdb49a',
  plateau: '#d9cbb8',
  // アカシアは 3D の傘の冠と同じ、鮮やかな若葉色。明るい所を左上に重ねる
  tree: '#5fa52e',
  treeLit: '#92c44a',
  road: '#fff6e6',
  roadEdge: 'rgba(110, 78, 48, 0.55)',
  spot: '#f4c242',
  rim: '#ffffff',
  ink: '#2b1d12',
  lion: '#d9a95f',
  lionActive: '#f4c242',
  lionEdge: '#6a4727',
  friend: '#6fae2e',
  you: '#f26a1b',
}

const FONT = "'Hiragino Maru Gothic ProN', 'Hiragino Sans', 'Noto Sans JP', system-ui, sans-serif"

const hex = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]

// ---------------------------------------------------------------------------
// 大陸の形: 中心 LAND_C からの向きごとの海岸までの距離。7 つのワールドを包む円と、あいだを埋める円の外形をならし、でこぼこを足す
// ---------------------------------------------------------------------------
const LAND_C = { x: -40, z: 0 }
const LAND_DISCS = [
  { x: 0, z: 0, r: 215 },
  // 水の世界は 3D と同じく、歩ける範囲の縁（中心から約 97m）が北・東・南の海岸。西の付け根は太く
  ...OUTER_REGIONS.map((r) => (r.key === 'water' ? { x: r.x - 12, z: r.z, r: r.walk + 8 } : { x: r.x, z: r.z, r: r.walk + 55 })),
  { x: 205, z: 0, r: 140 },
  // ワールドのあいだ（山脈のあるところ）も陸にして、ひとつの大きな大地にする
  { x: -200, z: -200, r: 150 },
  { x: -200, z: 200, r: 150 },
  { x: 105, z: -185, r: 112 },
  { x: 105, z: 185, r: 112 },
]
const COAST_N = 720

const coast = (() => {
  const raw = new Float32Array(COAST_N)
  for (let i = 0; i < COAST_N; i++) {
    const a = (i / COAST_N) * Math.PI * 2
    const dx = Math.cos(a)
    const dz = Math.sin(a)
    let best = 60
    for (const d of LAND_DISCS) {
      const ox = d.x - LAND_C.x
      const oz = d.z - LAND_C.z
      const along = ox * dx + oz * dz
      const perp2 = ox * ox + oz * oz - along * along
      if (perp2 < d.r * d.r) best = Math.max(best, along + Math.sqrt(d.r * d.r - perp2))
    }
    raw[i] = best
  }
  // 円どうしの継ぎ目をならす（±10° のぼかし）。ふくらみの先は残す
  const out = new Float32Array(COAST_N)
  const span = 20
  for (let i = 0; i < COAST_N; i++) {
    let s = 0
    let ws = 0
    for (let j = -span; j <= span; j++) {
      const g = Math.exp(-(j * j) / (2 * (span / 2) ** 2))
      s += raw[(i + j + COAST_N) % COAST_N] * g
      ws += g
    }
    out[i] = Math.max(raw[i] * 0.97, s / ws)
  }
  // 海岸線のでこぼこ（周期的: 角度を円周上の点にしてノイズを引く）
  const n = new Simplex2D(7717)
  for (let i = 0; i < COAST_N; i++) {
    const a = (i / COAST_N) * Math.PI * 2
    const cx = Math.cos(a)
    const sz = Math.sin(a)
    out[i] += n.noise(cx * 1.7, sz * 1.7) * 18 + n.noise(cx * 5 + 9, sz * 5 + 9) * 8 + n.noise(cx * 13 + 3, sz * 13 + 3) * 3.5
  }
  return out
})()

/** 海岸までのおおよその距離。正なら陸 */
function coastDist(x: number, z: number): number {
  const dx = x - LAND_C.x
  const dz = z - LAND_C.z
  let f = (Math.atan2(dz, dx) / (Math.PI * 2)) * COAST_N
  if (f < 0) f += COAST_N
  const i = Math.floor(f) % COAST_N
  const tt = f - Math.floor(f)
  const r = coast[i] * (1 - tt) + coast[(i + 1) % COAST_N] * tt
  return r - Math.hypot(dx, dz)
}

export function isLand(x: number, z: number): boolean {
  return coastDist(x, z) > 0
}

// ---------------------------------------------------------------------------
// 地面の色: ワールドごとの 2 色をノイズで揺らし、重みで混ぜる。荒い格子に描いて、地図では拡大してぼかす
// ---------------------------------------------------------------------------
const KEYS = REGIONS.map((r) => r.key)
// サバンナは 3D の地面と同じ色の出し方（savannaMapColor）。地図では上から広く見えて、まだらが迷彩のように細かく見えるので、
// 差を少し縮め、地図の明るい絵柄に合わせて白へ少し寄せる（素の色はもう鮮やかなので、彩度はそのまま）。この 2 色は、サバンナの重みが小さい山の向こうだけに使う（描く時間を抑える）
const GROUND: Record<RegionKey, [[number, number, number], [number, number, number]]> = {
  africa: [hex('#f4da88'), hex('#d9ad44')],
  north: [hex('#f9fbfe'), hex('#cddbea')],
  jungle: [hex('#9ad66a'), hex('#4fa43e')],
  south: [hex('#f0a66a'), hex('#c9643a')],
  water: [hex('#fbefc6'), hex('#b9dc7a')],
  partner: [hex('#b4e27a'), hex('#7cc456')],
  sky: [hex('#c4e68a'), hex('#94cc66')],
}
const SAVANNA_SAT = 1.0
const SAVANNA_SPREAD = 0.7
const SAVANNA_LIFT = 0.14
/** まだらの差を縮める中心（平原のふつうの色） */
const SAVANNA_MID = hex('#eac445')
const savannaTone = (c: [number, number, number], i: number, lum: number): number => {
  const v = lum + (c[i] - lum) * SAVANNA_SAT
  const m = SAVANNA_MID[i] + (v - SAVANNA_MID[i]) * SAVANNA_SPREAD
  return Math.min(255, Math.max(0, m + (255 - m) * SAVANNA_LIFT))
}
const _sav: [number, number, number] = [0, 0, 0]
const warpNoise = new Simplex2D(4021)
const toneNoise = new Simplex2D(5113)
const _f = new Float32Array(REGIONS.length)

/** その場所の地面の重み（合計 1） */
function groundWeights(x: number, z: number, out: Float32Array): void {
  // 3D の地面（regions.ts の biomeAt）と同じ境目: サバンナは 150〜205m、ほかは中心から 110〜175m で溶ける。
  // 地図では境目を少し波打たせて、円に見せない
  const qx = x + warpNoise.noise(x * 0.011 + 5, z * 0.011) * 22
  const qz = z + warpNoise.noise(x * 0.011, z * 0.011 + 9) * 22
  let sum = 0
  for (let i = 0; i < REGIONS.length; i++) {
    const r = REGIONS[i]
    const d = Math.hypot(qx - r.x, qz - r.z)
    out[i] = i === 0 ? 1 - smoothstep(150, 205, d) : 1 - smoothstep(110, 175, d)
    sum += out[i]
  }
  if (sum < 1) {
    // どのワールドの地面からも遠い所（山の向こう）: 地図だけ、近さでなめらかに混ぜる（まっすぐな境目を作らない）
    const wx = x + warpNoise.noise(x * 0.006, z * 0.006) * 40
    const wz = z + warpNoise.noise(x * 0.006 + 31, z * 0.006 + 17) * 40
    let fs = 0
    for (let i = 0; i < REGIONS.length; i++) {
      const r = REGIONS[i]
      const e = Math.max(8, Math.hypot(wx - r.x, wz - r.z) - r.walk)
      _f[i] = 1 / (e * e * e)
      fs += _f[i]
    }
    const rest = 1 - sum
    for (let i = 0; i < REGIONS.length; i++) out[i] += (rest * _f[i]) / fs
    sum = 1
  }
  for (let i = 0; i < REGIONS.length; i++) out[i] /= sum
}

const GROUND_STEP = 5
const GROUND_BOX: MapBox = { minX: -660, maxX: 600, minZ: -660, maxZ: 660 }
let groundCanvas: HTMLCanvasElement | null = null

function groundTexture(): HTMLCanvasElement {
  if (groundCanvas) return groundCanvas
  const w = Math.round((GROUND_BOX.maxX - GROUND_BOX.minX) / GROUND_STEP) + 1
  const h = Math.round((GROUND_BOX.maxZ - GROUND_BOX.minZ) / GROUND_STEP) + 1
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  const g = cv.getContext('2d') as CanvasRenderingContext2D
  const img = g.createImageData(w, h)
  const wts = new Float32Array(REGIONS.length)
  for (let j = 0; j < h; j++) {
    const z = GROUND_BOX.minZ + j * GROUND_STEP
    for (let i = 0; i < w; i++) {
      const x = GROUND_BOX.minX + i * GROUND_STEP
      groundWeights(x, z, wts)
      const tone = Math.min(1, Math.max(0, toneNoise.fbm(x * 0.01, z * 0.01, 3, 2, 0.5) * 0.7 + 0.5))
      const shade = 1 + toneNoise.noise(x * 0.035 + 50, z * 0.035) * 0.05
      let r = 0
      let gg = 0
      let b = 0
      for (let k = 0; k < KEYS.length; k++) {
        const wk = wts[k]
        if (wk <= 0) continue
        if (k === 0 && wk > 0.15) {
          savannaMapColor(x, z, _sav)
          const lum = _sav[0] * 0.2126 + _sav[1] * 0.7152 + _sav[2] * 0.0722
          r += wk * savannaTone(_sav, 0, lum)
          gg += wk * savannaTone(_sav, 1, lum)
          b += wk * savannaTone(_sav, 2, lum)
          continue
        }
        const [lo, hi] = GROUND[KEYS[k]]
        r += wk * (lo[0] + (hi[0] - lo[0]) * tone)
        gg += wk * (lo[1] + (hi[1] - lo[1]) * tone)
        b += wk * (lo[2] + (hi[2] - lo[2]) * tone)
      }
      const o = (j * w + i) * 4
      img.data[o] = r * shade
      img.data[o + 1] = gg * shade
      img.data[o + 2] = b * shade
      img.data[o + 3] = 255
    }
  }
  g.putImageData(img, 0, 0)
  groundCanvas = cv
  return cv
}

// ---------------------------------------------------------------------------
// 山脈: props.ts の createMountains と同じ輪（半径・色）。サバンナの輪は峠のところ、ほかのワールドの輪はサバンナに面した側が開いている
// ---------------------------------------------------------------------------
type PeakStyle = 'peak' | 'hill' | 'mesa' | 'island'
interface Peak {
  x: number
  z: number
  h: number
  lit: string
  shade: string
  style: PeakStyle
  snow: boolean
}

const RANGES: Array<{ cx: number; cz: number; pass: boolean; style: PeakStyle; snow: boolean; layers: Array<[number, string, string]> }> = [
  {
    cx: 0,
    cz: 0,
    pass: true,
    style: 'peak',
    snow: false,
    layers: [
      [172, '#7a72b4', '#b2a9de'],
      [212, '#8086c4', '#bcc1ea'],
      [258, '#98a3d6', '#d3d9f4'],
    ],
  },
  ...OUTER_REGIONS.map((r) => {
    const looks: Record<string, { style: PeakStyle; snow: boolean; layers: Array<[number, string, string]> }> = {
      // 3D の山脈（props.ts の OUTER_LOOKS）と同じ色
      north: { style: 'peak', snow: true, layers: [[150, '#9bb4d8', '#ffffff'], [188, '#aac0dc', '#ffffff'], [230, '#bccde6', '#ffffff']] },
      jungle: { style: 'hill', snow: false, layers: [[150, '#2a8a4a', '#62c05e'], [188, '#3a9a58', '#7fcc72'], [230, '#6aae84', '#aadcaa']] },
      south: { style: 'mesa', snow: false, layers: [[150, '#b5452a', '#e8804a'], [188, '#c45f3a', '#f09c66'], [230, '#d08a6e', '#f3c3a4']] },
      // 水の世界: 沖の島々（海の上に置く）
      water: { style: 'island', snow: false, layers: [[150, '#7f8e86', '#6cc06a'], [188, '#8aa29a', '#86cc7e'], [230, '#a2bcc2', '#b4dcb0']] },
      // ふれあいワールド: 牧場を囲むなだらかな丘
      partner: { style: 'hill', snow: false, layers: [[150, '#5fae4a', '#9ad86a'], [188, '#72b85e', '#b2e282'], [230, '#94c890', '#cdeab4']] },
      // 空の世界: 高原を囲むとがった岩の峰（3D と同じうす紫とクリーム色）
      sky: { style: 'peak', snow: false, layers: [[150, '#a4a2d4', '#f6ead2'], [188, '#b2b2dc', '#faf0de'], [230, '#c4c6e8', '#fdf8ee']] },
    }
    return { cx: r.x, cz: r.z, pass: false, ...looks[r.key] }
  }),
]

const PEAKS: Peak[] = (() => {
  const list: Peak[] = []
  const jit = new Simplex2D(9311)
  for (const R of RANGES) {
    const gapAngle = Math.atan2(-R.cz, -R.cx)
    R.layers.forEach(([radius, foot, peak], li) => {
      const step = (14 + li * 3) / radius
      for (let a0 = 0; a0 < Math.PI * 2; a0 += step) {
        // 等間隔に並べない: 少しずらし、ところどころ抜く
        const a = a0 + jit.noise(a0 * 9 + li * 3, R.cz * 0.01 + 2) * step * 0.45
        if (jit.noise(a * 11 + li, R.cx * 0.01 + 5) > 0.62) continue
        let keep = 1
        if (R.pass) {
          keep = smoothstep(PASS_HALF_WIDTH + 14, PASS_HALF_WIDTH + 44, distToPassAxis(R.cx + Math.cos(a) * radius, R.cz + Math.sin(a) * radius))
        } else {
          const da = Math.abs(Math.atan2(Math.sin(a - gapAngle), Math.cos(a - gapAngle)))
          keep = smoothstep(0.95, 1.3, da)
        }
        if (keep < 0.5) continue
        const rr = radius + 6 + jit.noise(a * 3 + li, R.cx * 0.01) * 10
        const x = R.cx + Math.cos(a) * rr
        const z = R.cz + Math.sin(a) * rr
        // 島は海の上、ほかの山は陸の上だけ
        if (R.style === 'island' ? coastDist(x, z) > -14 || jit.noise(x * 0.02, z * 0.02) < -0.1 : coastDist(x, z) < 10) continue
        if (isWalkable(x, z)) continue
        const h = (17 + li * 6) * (1 + jit.noise(x * 0.04, z * 0.04) * 0.3) * (0.6 + 0.4 * keep)
        list.push({ x, z, h, lit: peak, shade: foot, style: R.style, snow: R.snow })
      }
    })
  }
  // 北（奥）から順に描き、手前の山が重なるように
  return list.sort((p, q) => p.z - q.z)
})()

/** ほかのワールドの森（飾り。ワールドの色に合わせた木の印を、歩ける範囲の中にまばらに） */
const TREES: Array<{ x: number; z: number; key: RegionKey; s: number }> = (() => {
  const list: Array<{ x: number; z: number; key: RegionKey; s: number }> = []
  const n = new Simplex2D(6427)
  const density: Partial<Record<RegionKey, number>> = { jungle: -0.25, north: 0.15, south: 0.42, partner: 0.35, sky: 0.45 }
  for (const r of OUTER_REGIONS) {
    const th = density[r.key] ?? 1
    for (let gx = -r.walk; gx <= r.walk; gx += 13) {
      for (let gz = -r.walk; gz <= r.walk; gz += 13) {
        const x = r.x + gx + n.noise(gx * 0.3 + r.x, gz * 0.3) * 4
        const z = r.z + gz + n.noise(gx * 0.3, gz * 0.3 + r.z) * 4
        const d = Math.hypot(x - r.x, z - r.z)
        if (d > r.walk - 6 || d < 18) continue
        if (n.noise(x * 0.025, z * 0.025) < th) continue
        list.push({ x, z, key: r.key, s: 0.85 + 0.3 * (n.noise(x * 0.2, z * 0.2) * 0.5 + 0.5) })
      }
    }
  }
  return list.sort((p, q) => p.z - q.z)
})()

/** 海の波の印 */
const WAVES: Array<{ x: number; z: number; s: number }> = (() => {
  const list: Array<{ x: number; z: number; s: number }> = []
  const n = new Simplex2D(2203)
  for (let x = GROUND_BOX.minX; x <= GROUND_BOX.maxX; x += 46) {
    for (let z = GROUND_BOX.minZ; z <= GROUND_BOX.maxZ; z += 46) {
      const wx = x + n.noise(x * 0.1, z * 0.1) * 16
      const wz = z + n.noise(x * 0.1 + 7, z * 0.1) * 16
      if (coastDist(wx, wz) > -18) continue
      list.push({ x: wx, z: wz, s: 0.8 + 0.4 * (n.noise(wx, wz) * 0.5 + 0.5) })
    }
  }
  return list
})()

/** 名前の大きな文字を置く場所（ワールドの中の、観察スポットの印を避けた所） */
const REGION_LABEL_AT: Record<RegionKey, [number, number]> = {
  africa: [-80, 30],
  north: [0, -366],
  jungle: [-300, -64],
  south: [0, 366],
  water: [300, -98],
  partner: [-258, 204],
  sky: [-256, -318],
}

// ---------------------------------------------------------------------------

interface Box {
  l: number
  t: number
  r: number
  b: number
}

function overlaps(a: Box, b: Box): boolean {
  return a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** 白いピルの文字。left/top はピルの左上 */
function drawPill(ctx: CanvasRenderingContext2D, text: string, left: number, top: number, u: number): void {
  const font = `800 ${Math.round(11 * u)}px ${FONT}`
  ctx.font = font
  const padX = 6 * u
  const h = 16 * u
  const w = ctx.measureText(text).width + padX * 2
  ctx.fillStyle = 'rgba(255, 255, 255, 0.94)'
  roundRect(ctx, left, top, w, h, h / 2)
  ctx.fill()
  ctx.fillStyle = C.ink
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, left + padX, top + h / 2 + 0.5 * u)
}

function pillWidth(ctx: CanvasRenderingContext2D, text: string, u: number): number {
  ctx.font = `800 ${Math.round(11 * u)}px ${FONT}`
  return ctx.measureText(text).width + 12 * u
}

export function createMapRenderer(options: { width: number; height?: number; labels: boolean; baseAlpha?: number; box?: MapBox }): MapRenderer {
  const width = options.width
  const height = options.height ?? options.width
  const box = options.box ?? null
  const round = !box
  const c = width / 2
  // 世界座標 → キャンバス: px = (x - ox) * k
  let k = 1
  let ox = 0
  let oz = 0
  let vx = 0
  let vz = 0
  let viewR = MINIMAP_RADIUS
  const fit = () => {
    if (box) {
      k = width / (box.maxX - box.minX)
      ox = box.minX
      oz = box.minZ
    } else {
      k = (width / 2 - width * 0.02) / viewR
      ox = vx - c / k
      oz = vz - c / k
    }
  }
  fit()
  const px = (x: number) => (x - ox) * k
  const py = (z: number) => (z - oz) * k
  const u = width / 280 // 280px を基準にした線や点の倍率

  // --- 動かない部分（見る範囲が変わった時だけ描き直す。初めて描く時まで作らない） ---
  const base = document.createElement('canvas')
  base.width = width
  base.height = height
  const b = base.getContext('2d') as CanvasRenderingContext2D
  let dirty = true

  /** 見えている範囲（世界座標）。少し広めにとり、範囲外の印は描かない */
  const visible = (x: number, z: number, margin: number) => {
    const sx = px(x)
    const sy = py(z)
    return sx > -margin && sx < width + margin && sy > -margin && sy < height + margin
  }

  const coastPath = () => {
    b.beginPath()
    for (let i = 0; i <= COAST_N; i++) {
      const a = (i / COAST_N) * Math.PI * 2
      const r = coast[i % COAST_N]
      const x = px(LAND_C.x + Math.cos(a) * r)
      const y = py(LAND_C.z + Math.sin(a) * r)
      if (i === 0) b.moveTo(x, y)
      else b.lineTo(x, y)
    }
    b.closePath()
  }

  const drawPeak = (p: Peak) => {
    const x = px(p.x)
    const y = py(p.z)
    const h = p.h * k
    const w = h * 0.92
    b.lineJoin = 'round'
    b.strokeStyle = 'rgba(60, 40, 28, 0.32)'
    b.lineWidth = Math.max(0.6, 0.7 * u)
    if (p.style === 'hill') {
      // ジャングル: 丸い山
      b.fillStyle = p.shade
      b.beginPath()
      b.ellipse(x, y, w, h * 0.8, 0, Math.PI, 0)
      b.closePath()
      b.fill()
      b.stroke()
      b.fillStyle = p.lit
      b.beginPath()
      b.ellipse(x - w * 0.22, y - h * 0.05, w * 0.6, h * 0.62, 0, Math.PI, 0)
      b.closePath()
      b.fill()
      return
    }
    if (p.style === 'island') {
      // 水の世界: 海に浮かぶ丸い島（砂の縁に緑の丘）
      b.fillStyle = C.beach
      b.beginPath()
      b.ellipse(x, y, w * 1.12, h * 0.3, 0, 0, Math.PI * 2)
      b.fill()
      b.fillStyle = p.shade
      b.beginPath()
      b.ellipse(x, y, w * 0.9, h * 0.7, 0, Math.PI, 0)
      b.closePath()
      b.fill()
      b.stroke()
      b.fillStyle = p.lit
      b.beginPath()
      b.ellipse(x - w * 0.18, y - h * 0.08, w * 0.55, h * 0.52, 0, Math.PI, 0)
      b.closePath()
      b.fill()
      return
    }
    if (p.style === 'mesa') {
      // 南半球: 平らな頂の赤い台地
      const top = w * 0.45
      b.fillStyle = p.shade
      b.beginPath()
      b.moveTo(x - w, y)
      b.lineTo(x - top, y - h * 0.7)
      b.lineTo(x + top, y - h * 0.7)
      b.lineTo(x + w, y)
      b.closePath()
      b.fill()
      b.stroke()
      b.fillStyle = p.lit
      b.beginPath()
      b.moveTo(x - w, y)
      b.lineTo(x - top, y - h * 0.7)
      b.lineTo(x + top * 0.2, y - h * 0.7)
      b.lineTo(x - w * 0.1, y)
      b.closePath()
      b.fill()
      return
    }
    // とがった山: 左が日なた、右が影。北は雪の頂
    b.fillStyle = p.shade
    b.beginPath()
    b.moveTo(x - w, y)
    b.lineTo(x, y - h)
    b.lineTo(x + w, y)
    b.closePath()
    b.fill()
    b.stroke()
    b.fillStyle = p.lit
    b.beginPath()
    b.moveTo(x - w, y)
    b.lineTo(x, y - h)
    b.lineTo(x + w * 0.12, y)
    b.closePath()
    b.fill()
    if (p.snow) {
      b.fillStyle = '#ffffff'
      b.beginPath()
      b.moveTo(x - w * 0.36, y - h * 0.64)
      b.lineTo(x, y - h)
      b.lineTo(x + w * 0.36, y - h * 0.64)
      b.lineTo(x + w * 0.1, y - h * 0.7)
      b.lineTo(x - w * 0.08, y - h * 0.6)
      b.closePath()
      b.fill()
    }
  }

  const drawTree = (tr: { x: number; z: number; key: RegionKey; s: number }) => {
    const x = px(tr.x)
    const y = py(tr.z)
    const s = Math.max(2 * u, 4.6 * k) * tr.s
    if (tr.key === 'north') {
      // トウヒ: 細い三角
      b.fillStyle = '#2f7a48'
      b.beginPath()
      b.moveTo(x, y - s * 2)
      b.lineTo(x + s * 0.8, y)
      b.lineTo(x - s * 0.8, y)
      b.closePath()
      b.fill()
      b.fillStyle = 'rgba(255, 255, 255, 0.8)'
      b.beginPath()
      b.moveTo(x, y - s * 2)
      b.lineTo(x + s * 0.32, y - s * 1.2)
      b.lineTo(x - s * 0.32, y - s * 1.2)
      b.closePath()
      b.fill()
      return
    }
    b.fillStyle = tr.key === 'jungle' ? '#2f8a3e' : '#7a9a52'
    b.beginPath()
    b.arc(x, y - s * 0.6, s, 0, Math.PI * 2)
    b.fill()
    b.fillStyle = tr.key === 'jungle' ? '#62bb5a' : '#a9c07a'
    b.beginPath()
    b.arc(x - s * 0.3, y - s * 0.9, s * 0.5, 0, Math.PI * 2)
    b.fill()
  }

  const spotRing = (x: number, z: number) => {
    b.strokeStyle = C.rim
    b.lineWidth = 4 * u
    b.beginPath()
    b.arc(px(x), py(z), 5 * u, 0, Math.PI * 2)
    b.stroke()
    b.strokeStyle = C.spot
    b.lineWidth = 2.4 * u
    b.beginPath()
    b.arc(px(x), py(z), 5 * u, 0, Math.PI * 2)
    b.stroke()
  }

  const drawCompass = () => {
    const cx = width - 30 * u
    const cy = 30 * u
    const r = 15 * u
    b.fillStyle = 'rgba(255, 250, 240, 0.9)'
    b.beginPath()
    b.arc(cx, cy, r, 0, Math.PI * 2)
    b.fill()
    b.strokeStyle = 'rgba(70, 52, 38, 0.45)'
    b.lineWidth = 1.2 * u
    b.stroke()
    b.fillStyle = '#e0533a'
    b.beginPath()
    b.moveTo(cx, cy - r * 0.78)
    b.lineTo(cx + r * 0.32, cy)
    b.lineTo(cx - r * 0.32, cy)
    b.closePath()
    b.fill()
    b.fillStyle = '#9b8a78'
    b.beginPath()
    b.moveTo(cx, cy + r * 0.78)
    b.lineTo(cx + r * 0.32, cy)
    b.lineTo(cx - r * 0.32, cy)
    b.closePath()
    b.fill()
    b.fillStyle = C.ink
    b.font = `900 ${Math.round(10 * u)}px ${FONT}`
    b.textAlign = 'center'
    b.textBaseline = 'bottom'
    b.fillText('N', cx, cy - r - 1 * u)
  }

  const drawBase = () => {
    dirty = false
    b.clearRect(0, 0, width, height)
    b.save()
    if (round) {
      b.beginPath()
      b.arc(c, c, c - 3 * u, 0, Math.PI * 2)
      b.clip()
    }

    // 海: 沖は少し濃く。波の印
    const sea = b.createLinearGradient(0, 0, 0, height)
    sea.addColorStop(0, C.seaDeep)
    sea.addColorStop(0.5, C.sea)
    sea.addColorStop(1, C.seaDeep)
    b.fillStyle = sea
    b.fillRect(0, 0, width, height)
    b.strokeStyle = C.wave
    b.lineWidth = Math.max(1, 1.2 * u)
    b.lineCap = 'round'
    for (const w of WAVES) {
      if (!visible(w.x, w.z, 20 * u)) continue
      const x = px(w.x)
      const y = py(w.z)
      const s = 5 * u * w.s
      b.beginPath()
      b.moveTo(x - s * 1.6, y)
      b.quadraticCurveTo(x - s * 0.8, y - s * 0.7, x, y)
      b.quadraticCurveTo(x + s * 0.8, y - s * 0.7, x + s * 1.6, y)
      b.stroke()
    }

    // 浅瀬: 海岸のまわりの明るい帯
    coastPath()
    b.strokeStyle = 'rgba(180, 224, 241, 0.55)'
    b.lineWidth = 34 * k
    b.lineJoin = 'round'
    b.stroke()
    b.strokeStyle = C.shallow
    b.lineWidth = 14 * k
    b.stroke()

    // 陸: 地面の色（荒い格子を拡大してぼかす）を海岸線で切り抜く
    b.save()
    coastPath()
    b.clip()
    const tex = groundTexture()
    b.imageSmoothingEnabled = true
    b.imageSmoothingQuality = 'high'
    b.drawImage(
      tex,
      px(GROUND_BOX.minX - GROUND_STEP / 2),
      py(GROUND_BOX.minZ - GROUND_STEP / 2),
      tex.width * GROUND_STEP * k,
      tex.height * GROUND_STEP * k,
    )

    // 峠の道: サバンナからとなりのワールドへ（3D の峠と同じ線）
    for (const r of OUTER_REGIONS) {
      const len = Math.hypot(r.x, r.z)
      const ux = r.x / len
      const uz = r.z / len
      const a = WALK_RADIUS - 14
      const e = len - r.walk + 8
      b.lineCap = 'round'
      b.strokeStyle = C.roadEdge
      b.lineWidth = 3.4 * u
      b.setLineDash([])
      b.beginPath()
      b.moveTo(px(ux * a), py(uz * a))
      b.lineTo(px(ux * e), py(uz * e))
      b.stroke()
      b.strokeStyle = C.road
      b.lineWidth = 1.8 * u
      b.setLineDash([4 * u, 3 * u])
      b.stroke()
      b.setLineDash([])
    }

    // 山脈: 麓の影の帯 → 山の印
    for (const p of PEAKS) {
      if (!visible(p.x, p.z, p.h * k * 2)) continue
      b.fillStyle = 'rgba(90, 60, 40, 0.12)'
      b.beginPath()
      b.ellipse(px(p.x), py(p.z), p.h * k * 1.05, p.h * k * 0.32, 0, 0, Math.PI * 2)
      b.fill()
    }
    for (const p of PEAKS) if (visible(p.x, p.z, p.h * k * 2)) drawPeak(p)

    // ほかのワールドの森
    for (const tr of TREES) if (visible(tr.x, tr.z, 10 * u)) drawTree(tr)

    // 水場
    b.fillStyle = C.water
    b.beginPath()
    b.arc(px(WATERHOLE.x), py(WATERHOLE.z), WATERHOLE.radius * k, 0, Math.PI * 2)
    b.fill()

    // 水の世界の潟と、東の海へ流れる小川（3D と同じ形）
    const water = OUTER_REGIONS.find((r) => r.key === 'water')
    if (water) {
      b.fillStyle = C.water
      b.beginPath()
      b.ellipse(px(water.x + LAGOON.dx), py(water.z + LAGOON.dz), LAGOON.rx * k, LAGOON.rz * k, 0, 0, Math.PI * 2)
      b.fill()
      b.strokeStyle = C.water
      b.lineWidth = Math.max(1.5 * u, 5 * k)
      b.lineCap = 'round'
      b.lineJoin = 'round'
      b.beginPath()
      CREEK.forEach(([cx, cz], i) => (i === 0 ? b.moveTo(px(water.x + cx), py(water.z + cz)) : b.lineTo(px(water.x + cx), py(water.z + cz))))
      b.stroke()
    }

    // ふれあいワールドの牧場の小道（広場を回る輪。峠への道は上の峠の道と重なる）
    const farm = OUTER_REGIONS.find((r) => r.key === 'partner')
    if (farm) {
      b.strokeStyle = C.roadEdge
      b.lineWidth = 3.4 * u
      b.setLineDash([])
      b.beginPath()
      b.arc(px(farm.x), py(farm.z), FARM_LOOP * k, 0, Math.PI * 2)
      b.stroke()
      b.strokeStyle = C.road
      b.lineWidth = 1.8 * u
      b.setLineDash([4 * u, 3 * u])
      b.stroke()
      b.setLineDash([])
      // ヤギの岩場: 岩肌の円と、頂上の明るい岩
      b.fillStyle = C.rock
      b.beginPath()
      b.arc(px(farm.x + GOAT_ROCKS.dx), py(farm.z + GOAT_ROCKS.dz), GOAT_ROCKS.radius * k, 0, Math.PI * 2)
      b.fill()
      b.fillStyle = C.plateau
      b.beginPath()
      b.arc(px(farm.x + GOAT_ROCKS.dx), py(farm.z + GOAT_ROCKS.dz), GOAT_ROCKS.radius * 0.4 * k, 0, Math.PI * 2)
      b.fill()
    }

    // 空の世界のフライトの輪（広場を回る小道。峠への道は上の峠の道と重なる）
    const skyWorld = OUTER_REGIONS.find((r) => r.key === 'sky')
    if (skyWorld) {
      b.strokeStyle = C.roadEdge
      b.lineWidth = 3.4 * u
      b.setLineDash([])
      b.beginPath()
      b.arc(px(skyWorld.x), py(skyWorld.z), SKY_RING * k, 0, Math.PI * 2)
      b.stroke()
      b.strokeStyle = C.road
      b.lineWidth = 1.8 * u
      b.setLineDash([4 * u, 3 * u])
      b.stroke()
      b.setLineDash([])
    }

    // コピエ: 岩肌の円、南の坂、頂上の台地
    b.fillStyle = C.rock
    b.beginPath()
    b.arc(px(KOPJE.x), py(KOPJE.z), KOPJE.radius * k, 0, Math.PI * 2)
    b.fill()
    b.fillStyle = C.ramp
    b.beginPath()
    b.moveTo(px(KOPJE.x), py(KOPJE.z))
    b.arc(px(KOPJE.x), py(KOPJE.z), KOPJE.radius * k, Math.PI / 2 - KOPJE.rampHalfAngle, Math.PI / 2 + KOPJE.rampHalfAngle)
    b.closePath()
    b.fill()
    b.fillStyle = C.plateau
    b.beginPath()
    b.arc(px(KOPJE.x), py(KOPJE.z), KOPJE.radius * KOPJE.plateau * k, 0, Math.PI * 2)
    b.fill()

    // サバンナのアカシア: 平たい傘の冠
    for (const tr of ACACIAS) {
      const rr = 3 * u * tr.scale * Math.min(1, k / ((width / 2) / MINIMAP_RADIUS)) ** 0.5
      b.fillStyle = C.tree
      b.beginPath()
      b.arc(px(tr.x), py(tr.z), rr, 0, Math.PI * 2)
      b.fill()
      b.fillStyle = C.treeLit
      b.beginPath()
      b.arc(px(tr.x) - rr * 0.28, py(tr.z) - rr * 0.28, rr * 0.5, 0, Math.PI * 2)
      b.fill()
    }

    // 観察スポット: 金の輪に白い縁（7 つのワールドそれぞれ）
    spotRing(SPOT.x, SPOT.z)
    for (const r of OUTER_REGIONS) spotRing(r.x, r.z)
    b.restore()

    // 海岸線: 砂浜の縁と細い線
    coastPath()
    b.strokeStyle = C.beach
    b.lineWidth = Math.max(1.5, 2.4 * u)
    b.stroke()
    b.strokeStyle = C.coastLine
    b.lineWidth = Math.max(0.8, 1 * u)
    b.stroke()
    b.restore()

    if (round) {
      // 縁と「N」
      b.strokeStyle = 'rgba(255, 255, 255, 0.7)'
      b.lineWidth = 2 * u
      b.beginPath()
      b.arc(c, c, c - 3 * u, 0, Math.PI * 2)
      b.stroke()
      b.fillStyle = C.ink
      b.font = `800 ${Math.round(16 * u)}px ${FONT}`
      b.textAlign = 'center'
      b.textBaseline = 'top'
      b.fillText('N', c, 8 * u)
    } else {
      drawCompass()
    }
  }

  const setView = (cx: number, cz: number, radius: number) => {
    if (box) return
    if (Math.abs(cx - vx) < 0.5 && Math.abs(cz - vz) < 0.5 && radius === viewR) return
    vx = cx
    vz = cz
    viewR = radius
    fit()
    dirty = true
  }

  // 広げた地図だけ、ワールドの名前（大きな文字）と場所の名前を入れる。個体の名前はこれらを避けて置く。
  // 言語を切り替えられるので、地形と違って毎回描く（数が少ないので軽い）
  const drawPlaceLabels = (ctx: CanvasRenderingContext2D): Box[] => {
    const boxes: Box[] = []
    if (!options.labels) return boxes
    ctx.font = `900 ${Math.round(14 * u)}px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineJoin = 'round'
    for (const r of REGIONS) {
      const name = r.key === 'africa' ? t('catSavanna') : (getWorld(r.key)?.name[getLang()] ?? r.key)
      const [lx, lz] = REGION_LABEL_AT[r.key]
      const x = px(lx)
      const y = py(lz)
      ctx.strokeStyle = 'rgba(255, 252, 244, 0.92)'
      ctx.lineWidth = 4.5 * u
      ctx.strokeText(name, x, y)
      ctx.fillStyle = '#3a2818'
      ctx.fillText(name, x, y)
      const w = ctx.measureText(name).width
      boxes.push({ l: x - w / 2 - 3 * u, t: y - 10 * u, r: x + w / 2 + 3 * u, b: y + 10 * u })
    }
    const pill = (text: string, left: number, top: number) => {
      drawPill(ctx, text, left, top, u)
      boxes.push({ l: left, t: top, r: left + pillWidth(ctx, text, u), b: top + 16 * u })
    }
    pill(t('waterhole'), px(WATERHOLE.x) + (WATERHOLE.radius + 3) * k, py(WATERHOLE.z) - 8 * u)
    const kopje = t('kopje')
    pill(kopje, px(KOPJE.x) - pillWidth(ctx, kopje, u) / 2, py(KOPJE.z) - (KOPJE.radius + 6) * k - 8 * u)
    pill(t('spot'), px(SPOT.x) + 8 * u, py(SPOT.z) - 8 * u)
    const farm = OUTER_REGIONS.find((r) => r.key === 'partner')
    if (farm) {
      const goat = t('goatRocks')
      pill(goat, px(farm.x + GOAT_ROCKS.dx) - pillWidth(ctx, goat, u) / 2, py(farm.z + GOAT_ROCKS.dz) + (GOAT_ROCKS.radius + 3) * k)
    }
    return boxes
  }

  let showNames = true
  const draw = (ctx: CanvasRenderingContext2D, player: MapPlayer, lions: MinimapMarker[]) => {
    if (dirty) drawBase()
    ctx.clearRect(0, 0, width, height)
    // 地形（動かない部分）だけ透かす。自分と動物の印は不透明のまま
    ctx.globalAlpha = options.baseAlpha ?? 1
    ctx.drawImage(base, 0, 0)
    ctx.globalAlpha = 1
    const placeBoxes = drawPlaceLabels(ctx)

    // 出会った個体: 黄褐色の点に暗い縁。そばにいる個体は少し大きく。ともだちは緑の輪を足す
    for (const l of lions) {
      const r = (l.active ? 6 : 4.5) * u
      ctx.fillStyle = l.active ? C.lionActive : C.lion
      ctx.strokeStyle = C.lionEdge
      ctx.lineWidth = 1.5 * u
      ctx.beginPath()
      ctx.arc(px(l.x), py(l.z), r, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      if (l.friend) {
        ctx.strokeStyle = C.rim
        ctx.lineWidth = 3.5 * u
        ctx.beginPath()
        ctx.arc(px(l.x), py(l.z), r + 3 * u, 0, Math.PI * 2)
        ctx.stroke()
        ctx.strokeStyle = C.friend
        ctx.lineWidth = 2 * u
        ctx.beginPath()
        ctx.arc(px(l.x), py(l.z), r + 3 * u, 0, Math.PI * 2)
        ctx.stroke()
      }
    }

    // 自分: 向きのある三角。heading 0 で +z（画面の下）を向く
    ctx.save()
    ctx.translate(px(player.x), py(player.z))
    ctx.rotate(-player.heading)
    ctx.fillStyle = C.you
    ctx.strokeStyle = C.rim
    ctx.lineWidth = 2 * u
    ctx.beginPath()
    ctx.moveTo(0, 9 * u)
    ctx.lineTo(-6 * u, -6 * u)
    ctx.lineTo(0, -2 * u)
    ctx.lineTo(6 * u, -6 * u)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.restore()

    if (options.labels) {
      // 名前のピル。点の右 → 左 → 下 → 上の順に、置けるところへ。重なる時は下へずらす
      const placed: Box[] = [...placeBoxes]
      const h = 16 * u
      const put = (text: string, x: number, y: number) => {
        const w = pillWidth(ctx, text, u)
        const candidates: Box[] = [
          { l: x + 8 * u, t: y - h / 2, r: x + 8 * u + w, b: y + h / 2 },
          { l: x - 8 * u - w, t: y - h / 2, r: x - 8 * u, b: y + h / 2 },
          { l: x - w / 2, t: y + 8 * u, r: x + w / 2, b: y + 8 * u + h },
          { l: x - w / 2, t: y - 8 * u - h, r: x + w / 2, b: y - 8 * u },
        ]
        // 4 方向が埋まっていたら、少し離れた 8 方向も試す（ワールドが 5 つになり、地図の縮尺が小さくなったので）
        for (const d of [20, 34]) {
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2
            const cx = x + Math.cos(a) * d * u
            const cy = y + Math.sin(a) * d * u * 0.7
            candidates.push({ l: cx - w / 2, t: cy - h / 2, r: cx + w / 2, b: cy + h / 2 })
          }
        }
        let found = candidates.find((cand) => !placed.some((p) => overlaps(cand, p)) && cand.l > 2 * u && cand.r < width - 2 * u)
        if (!found) {
          // どこも重なる時は、重なりがいちばん小さい候補に置く（下へ何段もずらすと、印から遠く離れて別のワールドに出てしまう）
          const area = (a: Box) =>
            placed.reduce((sum, p) => sum + Math.max(0, Math.min(a.r, p.r) - Math.max(a.l, p.l)) * Math.max(0, Math.min(a.b, p.b) - Math.max(a.t, p.t)), 0)
          const inside = candidates.filter((cand) => cand.l > 2 * u && cand.r < width - 2 * u)
          found = { ...(inside.length ? inside.reduce((best, cand) => (area(cand) < area(best) ? cand : best)) : candidates[0]) }
          if (found.r > width - 2 * u) {
            found.l -= found.r - (width - 2 * u)
            found.r = width - 2 * u
          }
        }
        placed.push(found)
        drawPill(ctx, text, found.l, found.t, u)
      }
      // 動物は個体名ではなく種の名前（同じワールドの同じ種は 1 つにまとめる）。増えても名前だらけにならない
      if (showNames) for (const g of speciesGroups(lions)) put(g.name, px(g.x), py(g.z))
      put(t('you'), px(player.x), py(player.z))
    }
  }

  const toWorld = (mx: number, my: number) => {
    if (round && Math.hypot(mx - c, my - c) > c - 3 * u) return null
    const x = ox + mx / k
    const z = oz + my / k
    // 海をタップしても歩かない
    if (!isLand(x, z)) return null
    return { x, z }
  }

  return {
    width,
    height,
    draw,
    toWorld,
    setView,
    setNames: (on) => {
      showNames = on
    },
  }
}

/** キャンバス上のタップ位置を世界座標に変換して通知する */
export function bindMapPick(canvas: HTMLCanvasElement, renderer: MapRenderer, onPick: (x: number, z: number) => void): void {
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    e.stopPropagation()
  })
  canvas.addEventListener('pointerup', (e) => {
    e.preventDefault()
    e.stopPropagation()
    const rect = canvas.getBoundingClientRect()
    const mx = ((e.clientX - rect.left) / rect.width) * renderer.width
    const my = ((e.clientY - rect.top) / rect.height) * renderer.height
    const w = renderer.toWorld(mx, my)
    if (w) onPick(w.x, w.z)
  })
}

export interface Minimap {
  show: () => void
  update: (player: MapPlayer, lions: MinimapMarker[]) => void
  /** 地図のタップ。世界座標（x, z）を返す */
  onPick: (fn: (x: number, z: number) => void) => void
  /** 「地図を広げる」 */
  onExpand: (fn: () => void) => void
}

/** 左上のミニマップ */
export function createMinimap(): Minimap {
  const canvas = document.getElementById('minimap') as HTMLCanvasElement
  const expandBtn = document.getElementById('minimap-expand') as HTMLButtonElement
  // ワールドが透けて見えるよう、地形は半透明に
  const renderer = createMapRenderer({ width: 280, labels: false, baseAlpha: 0.55 })
  canvas.width = renderer.width
  canvas.height = renderer.height
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D

  const pickListeners: Array<(x: number, z: number) => void> = []
  const expandListeners: Array<() => void> = []
  bindMapPick(canvas, renderer, (x, z) => pickListeners.forEach((fn) => fn(x, z)))
  expandBtn.addEventListener('click', () => expandListeners.forEach((fn) => fn()))

  return {
    show: () => {
      canvas.hidden = false
      expandBtn.hidden = false
    },
    update: (player, lions) => {
      // 自分のまわりを見る。サバンナの中ではいままでどおりサバンナ全体が入る
      const inSavanna = Math.hypot(player.x, player.z) < WALK_RADIUS - 20
      if (inSavanna) renderer.setView(0, 0, MINIMAP_RADIUS)
      else renderer.setView(Math.round(player.x / 4) * 4, Math.round(player.z / 4) * 4, MINIMAP_RADIUS)
      renderer.draw(ctx, player, lions)
    },
    onPick: (fn) => {
      pickListeners.push(fn)
    },
    onExpand: (fn) => {
      expandListeners.push(fn)
    },
  }
}
