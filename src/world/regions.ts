import { smoothstep } from './noise'
import { WALK_RADIUS } from './layout'

/**
 * 地続きの 4 つのワールド（D-30 の 7 つのうち、3D にするもの）。
 * サバンナは原点のまま（コピエ・水場・ライオンは動かさない）。
 * 北の世界はコピエの奥（-z）、ジャングルは西（-x）、南半球はスタート地点の後ろ（+z）。
 * サバンナを囲む山脈には、各ワールドへの道の幅だけ峠を切る。東は閉じたまま。
 * 地図は北が上なので、名前と向きが一致する。
 */
export type RegionKey = 'africa' | 'north' | 'jungle' | 'south'

export interface Region {
  key: RegionKey
  x: number
  z: number
  /** 歩ける範囲の半径（m） */
  walk: number
}

/** 原点からほかのワールドの中心までの距離 */
const OUTER_DIST = 300
const OUTER_WALK = 100

export const SAVANNA: Region = { key: 'africa', x: 0, z: 0, walk: WALK_RADIUS }

export const OUTER_REGIONS: readonly Region[] = [
  { key: 'north', x: 0, z: -OUTER_DIST, walk: OUTER_WALK },
  { key: 'jungle', x: -OUTER_DIST, z: 0, walk: OUTER_WALK },
  { key: 'south', x: 0, z: OUTER_DIST, walk: OUTER_WALK },
]

export const REGIONS: readonly Region[] = [SAVANNA, ...OUTER_REGIONS]

/** サバンナからほかのワールドへの道（峠）の半分の幅 */
export const PASS_HALF_WIDTH = 16

/** 地形を作る範囲（xz の矩形）。山の麓まで地面を敷く */
export const MAP_BOUNDS = { minX: -1400 / 3, maxX: 200, minZ: -1400 / 3, maxZ: 1400 / 3 }

/** 点と線分の距離と、線分上のいちばん近い点（xz） */
function closestOnSegment(x: number, z: number, ax: number, az: number, bx: number, bz: number): { d: number; x: number; z: number } {
  const vx = bx - ax
  const vz = bz - az
  const len2 = vx * vx + vz * vz
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / len2))
  const cx = ax + vx * t
  const cz = az + vz * t
  return { d: Math.hypot(x - cx, z - cz), x: cx, z: cz }
}

/** 道の線分: サバンナの縁の少し内側から、そのワールドの縁の少し内側まで */
function passSegment(r: Region): { ax: number; az: number; bx: number; bz: number } {
  const len = Math.hypot(r.x, r.z)
  const ux = r.x / len
  const uz = r.z / len
  const a = SAVANNA.walk - 10
  const b = len - r.walk + 10
  return { ax: ux * a, az: uz * a, bx: ux * b, bz: uz * b }
}

/** いちばん近い峠の軸までの距離（xz）。山脈を削る・木を避けるのに使う */
export function distToPassAxis(x: number, z: number): number {
  let best = Infinity
  for (const r of OUTER_REGIONS) {
    const len = Math.hypot(r.x, r.z)
    // 山脈の切れ目は原点から中心までの全長でとる（峠の外側の山並みも割る）
    const s = closestOnSegment(x, z, 0, 0, (r.x / len) * (len - r.walk * 0.5), (r.z / len) * (len - r.walk * 0.5))
    best = Math.min(best, s.d)
  }
  return best
}

/** 歩ける場所か */
export function isWalkable(x: number, z: number): boolean {
  for (const r of REGIONS) if (Math.hypot(x - r.x, z - r.z) <= r.walk) return true
  for (const r of OUTER_REGIONS) {
    const s = passSegment(r)
    if (closestOnSegment(x, z, s.ax, s.az, s.bx, s.bz).d <= PASS_HALF_WIDTH) return true
  }
  return false
}

/** 歩ける範囲の外に出た点を、いちばん近い縁へ戻す */
export function clampToWalkable(p: { x: number; z: number }): void {
  if (isWalkable(p.x, p.z)) return
  let bx = p.x
  let bz = p.z
  let bd = Infinity
  for (const r of REGIONS) {
    const dx = p.x - r.x
    const dz = p.z - r.z
    const d = Math.hypot(dx, dz) || 1
    const cx = r.x + (dx / d) * r.walk
    const cz = r.z + (dz / d) * r.walk
    const dist = Math.hypot(p.x - cx, p.z - cz)
    if (dist < bd) {
      bd = dist
      bx = cx
      bz = cz
    }
  }
  for (const r of OUTER_REGIONS) {
    const s = passSegment(r)
    const c = closestOnSegment(p.x, p.z, s.ax, s.az, s.bx, s.bz)
    const d = c.d || 1
    const cx = c.x + ((p.x - c.x) / d) * PASS_HALF_WIDTH
    const cz = c.z + ((p.z - c.z) / d) * PASS_HALF_WIDTH
    const dist = Math.hypot(p.x - cx, p.z - cz)
    if (dist < bd) {
      bd = dist
      bx = cx
      bz = cz
    }
  }
  p.x = bx
  p.z = bz
}

export interface BiomeWeights {
  africa: number
  north: number
  jungle: number
  south: number
}

/**
 * その場所が「どのワールドの地面か」の重み（合計 1）。
 * サバンナの歩ける範囲（半径 120m）の中は常に africa = 1 なので、いまのサバンナの見た目は変わらない。
 * 峠の途中（原点から 150〜205m あたり）でとなりのワールドの地面へ溶け込む。
 */
export function biomeAt(x: number, z: number, out: BiomeWeights): BiomeWeights {
  const a = 1 - smoothstep(150, 205, Math.hypot(x, z))
  let n = 1 - smoothstep(110, 175, Math.hypot(x - OUTER_REGIONS[0].x, z - OUTER_REGIONS[0].z))
  let j = 1 - smoothstep(110, 175, Math.hypot(x - OUTER_REGIONS[1].x, z - OUTER_REGIONS[1].z))
  let s = 1 - smoothstep(110, 175, Math.hypot(x - OUTER_REGIONS[2].x, z - OUTER_REGIONS[2].z))
  let sum = a + n + j + s
  if (sum < 1e-4) {
    // どのワールドからも遠い隅（山の外）: いちばん近いワールドの地面にする
    const dn = Math.hypot(x - OUTER_REGIONS[0].x, z - OUTER_REGIONS[0].z)
    const dj = Math.hypot(x - OUTER_REGIONS[1].x, z - OUTER_REGIONS[1].z)
    const ds = Math.hypot(x - OUTER_REGIONS[2].x, z - OUTER_REGIONS[2].z)
    n = dn <= dj && dn <= ds ? 1 : 0
    j = !n && dj <= ds ? 1 : 0
    s = !n && !j ? 1 : 0
    sum = 1
  }
  out.africa = a / sum
  out.north = n / sum
  out.jungle = j / sum
  out.south = s / sum
  return out
}

/** いちばん重みの大きいワールド（プレイヤーがいる場所の判定用） */
export function regionAt(x: number, z: number): RegionKey {
  const w = biomeAt(x, z, { africa: 0, north: 0, jungle: 0, south: 0 })
  let best: RegionKey = 'africa'
  let bw = w.africa
  for (const k of ['north', 'jungle', 'south'] as const) {
    if (w[k] > bw) {
      bw = w[k]
      best = k
    }
  }
  return best
}
