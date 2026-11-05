import { smoothstep } from './noise'
import { KOPJE, SPOT, WALK_RADIUS } from './layout'

/**
 * 地続きの 6 つのワールド（D-30 の 7 つのうち、3D にするもの）。
 * サバンナは原点のまま（コピエ・水場・ライオンは動かさない）。
 * 北の世界はコピエの奥（-z）、ジャングルは西（-x）、南半球はスタート地点の後ろ（+z）、水の世界は東（+x）、
 * ふれあいワールドは南西（ジャングルと南半球のあいだ。北東・南東は水の世界の海なので空いていた南西へ）。
 * サバンナを囲む山脈には、各ワールドへの道の幅だけ峠を切る。
 * 地図は北が上なので、名前と向きが一致する。
 */
export type RegionKey = 'africa' | 'north' | 'jungle' | 'south' | 'water' | 'partner'

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
/** ふれあいワールド（南西のななめ）の中心までの距離。地面の溶け込み（サバンナは 205m まで、ほかは中心から 175m まで）が峠の途中で途切れない長さ */
const PARTNER_DIST = 360

export const SAVANNA: Region = { key: 'africa', x: 0, z: 0, walk: WALK_RADIUS }

export const OUTER_REGIONS: readonly Region[] = [
  { key: 'north', x: 0, z: -OUTER_DIST, walk: OUTER_WALK },
  { key: 'jungle', x: -OUTER_DIST, z: 0, walk: OUTER_WALK },
  { key: 'south', x: 0, z: OUTER_DIST, walk: OUTER_WALK },
  // 後から足したワールドは最後に（雲・天気は OUTER_REGIONS[0..2] を並びで引いている）
  { key: 'water', x: OUTER_DIST, z: 0, walk: OUTER_WALK },
  // ななめの向きは、となりのワールド（ジャングル・南半球）と歩ける円が重ならないよう少し遠く（中心どうし約 259m）
  { key: 'partner', x: -PARTNER_DIST / Math.SQRT2, z: PARTNER_DIST / Math.SQRT2, walk: OUTER_WALK },
]

export const REGIONS: readonly Region[] = [SAVANNA, ...OUTER_REGIONS]

/** サバンナからほかのワールドへの道（峠）の半分の幅 */
export const PASS_HALF_WIDTH = 16

/** 地形を作る範囲（xz の矩形）。山の麓まで地面を敷く */
export const MAP_BOUNDS = { minX: -1400 / 3, maxX: 1400 / 3, minZ: -1400 / 3, maxZ: 1400 / 3 }

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

/** そのワールドへの峠の軸までの距離（xz）。山脈の切れ目は原点から中心までの全長でとる（峠の外側の山並みも割る） */
export function distToPassAxisOf(r: Region, x: number, z: number): number {
  const len = Math.hypot(r.x, r.z)
  return closestOnSegment(x, z, 0, 0, (r.x / len) * (len - r.walk * 0.5), (r.z / len) * (len - r.walk * 0.5)).d
}

/** いちばん近い峠の軸までの距離（xz）。山脈を削る・木を避けるのに使う */
export function distToPassAxis(x: number, z: number): number {
  let best = Infinity
  for (const r of OUTER_REGIONS) best = Math.min(best, distToPassAxisOf(r, x, z))
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

/**
 * 歩ける場所のどの枝にいるか。サバンナの円の中は africa、峠とその先のワールドの円はそのワールド。
 * 円の中なら inCircle。峠どうし・ワールドどうしはサバンナでしかつながらない
 */
function branchOf(x: number, z: number): { key: RegionKey; inCircle: boolean } {
  const tol = 0.5
  if (Math.hypot(x - SAVANNA.x, z - SAVANNA.z) <= SAVANNA.walk + tol) return { key: 'africa', inCircle: true }
  let best: Region = OUTER_REGIONS[0]
  let bd = Infinity
  for (const r of OUTER_REGIONS) {
    if (Math.hypot(x - r.x, z - r.z) <= r.walk + tol) return { key: r.key, inCircle: true }
    const s = passSegment(r)
    const d = closestOnSegment(x, z, s.ax, s.az, s.bx, s.bz).d
    if (d < bd) {
      bd = d
      best = r
    }
  }
  return { key: best.key, inCircle: false }
}

/** 峠の軸の上の点。t = 原点からの距離 */
function onPassAxis(r: Region, t: number): { x: number; z: number } {
  const len = Math.hypot(r.x, r.z)
  return { x: (r.x / len) * t, z: (r.z / len) * t }
}

/**
 * from から to へ歩く経由点の列（最後が目的地）。目的地が歩けない場所なら、いちばん近い縁へ寄せる。
 * ワールドをまたぐときは峠を通る: 今のワールドの峠 → サバンナ → 目的地の峠 → 目的地。
 * 円と峠の道はそれぞれ凸なので、円の中から峠へ入る時は峠の口（円の内側の軸上）を経由する
 */
export function routeTo(from: { x: number; z: number }, to: { x: number; z: number }): Array<{ x: number; z: number }> {
  const dest = { x: to.x, z: to.z }
  clampToWalkable(dest)
  const a = branchOf(from.x, from.z)
  const b = branchOf(dest.x, dest.z)
  const route: Array<{ x: number; z: number }> = []
  // 峠の口: サバンナ側は円の 15m 内側、ワールド側は円の 5m 内側（どちらも峠の道の中）
  const savannaMouth = (r: Region) => onPassAxis(r, SAVANNA.walk - 15)
  const outerMouth = (r: Region) => onPassAxis(r, Math.hypot(r.x, r.z) - r.walk + 5)
  const outer = (k: RegionKey) => OUTER_REGIONS.find((r) => r.key === k) as Region
  if (a.key === b.key) {
    // 同じ枝: 円の中どうし・峠の中どうしはまっすぐ。円と峠のあいだは峠の口を通る
    if (a.key !== 'africa' && a.inCircle !== b.inCircle) route.push(outerMouth(outer(a.key)))
  } else {
    if (a.key !== 'africa') {
      const r = outer(a.key)
      if (a.inCircle) route.push(outerMouth(r))
      route.push(savannaMouth(r))
    }
    if (b.key !== 'africa') {
      const r = outer(b.key)
      route.push(savannaMouth(r))
      if (b.inCircle) route.push(outerMouth(r))
    }
  }
  route.push(dest)
  // コピエの上へ行く・上から出る時は、南の登り口の坂（ふもと ↔ 頂上）を通る。崖の段の岩に挟まらない
  const top = { x: SPOT.x, z: SPOT.z }
  const startOn = onKopje(from)
  const endOn = onKopje(dest)
  if (endOn && !startOn) route.splice(route.length - 1, 0, ...(onRamp(dest) ? [SPOT.approach] : [SPOT.approach, top]))
  if (startOn && !endOn) route.unshift(...(onRamp(from) ? [SPOT.approach] : [top, SPOT.approach]))
  // コピエを横切る区間は、脇を回る経由点を足す（崖の岩に引っかからない）
  const out: Array<{ x: number; z: number }> = []
  let prev = { x: from.x, z: from.z }
  for (const p of route) {
    aroundKopje(prev, p, out, 0)
    prev = p
  }
  return out
}

/** コピエからこれより近くを通る区間は回り道にする（崖の岩は中心から 30m 以内）。回る経由点はこの距離に置く */
const KOPJE_CLEAR = KOPJE.radius + 8
const KOPJE_AROUND = KOPJE.radius + 12
/** ここより内側はコピエの上（崖の段と台地） */
const KOPJE_ON = KOPJE.radius + 2

function onKopje(p: { x: number; z: number }): boolean {
  return Math.hypot(p.x - KOPJE.x, p.z - KOPJE.z) < KOPJE_ON
}

/** 南の登り口の坂の上か（+z を中心にした扇形） */
function onRamp(p: { x: number; z: number }): boolean {
  return Math.abs(Math.atan2(p.x - KOPJE.x, p.z - KOPJE.z)) < KOPJE.rampHalfAngle + 0.25
}

/** a → b を out に足す（a は足さない）。コピエを横切るなら、いちばん近づく所の外側に経由点を置いて分ける */
function aroundKopje(a: { x: number; z: number }, b: { x: number; z: number }, out: Array<{ x: number; z: number }>, depth: number): void {
  const c = closestOnSegment(KOPJE.x, KOPJE.z, a.x, a.z, b.x, b.z)
  const da = Math.hypot(a.x - KOPJE.x, a.z - KOPJE.z)
  const db = Math.hypot(b.x - KOPJE.x, b.z - KOPJE.z)
  // コピエの上の区間（坂を登る・台地の上）はまっすぐ。いちばん近い所が端なら、コピエの前を横切っていない
  if (depth >= 3 || c.d >= KOPJE_CLEAR || c.d > Math.min(da, db) - 0.5 || da < KOPJE_ON || db < KOPJE_ON) {
    out.push(b)
    return
  }
  let ux = c.x - KOPJE.x
  let uz = c.z - KOPJE.z
  let len = Math.hypot(ux, uz)
  if (len < 1e-3) {
    // 真ん中を通る: 進む向きの左を回る
    ux = -(b.z - a.z)
    uz = b.x - a.x
    len = Math.hypot(ux, uz) || 1
  }
  const d = { x: KOPJE.x + (ux / len) * KOPJE_AROUND, z: KOPJE.z + (uz / len) * KOPJE_AROUND }
  aroundKopje(a, d, out, depth + 1)
  aroundKopje(d, b, out, depth + 1)
}

export interface BiomeWeights {
  africa: number
  north: number
  jungle: number
  south: number
  water: number
  partner: number
}

/** 重みを入れる空の入れ物 */
export function emptyWeights(): BiomeWeights {
  return { africa: 1, north: 0, jungle: 0, south: 0, water: 0, partner: 0 }
}

/**
 * その場所が「どのワールドの地面か」の重み（合計 1）。
 * サバンナの歩ける範囲（半径 120m）の中は常に africa = 1 なので、いまのサバンナの見た目は変わらない。
 * 峠の途中（原点から 150〜205m あたり）でとなりのワールドの地面へ溶け込む。
 */
export function biomeAt(x: number, z: number, out: BiomeWeights): BiomeWeights {
  const a = 1 - smoothstep(150, 205, Math.hypot(x, z))
  let sum = a
  out.africa = a
  for (const r of OUTER_REGIONS) {
    const w = 1 - smoothstep(110, 175, Math.hypot(x - r.x, z - r.z))
    out[r.key as OuterKey] = w
    sum += w
  }
  if (sum < 1e-4) {
    // どのワールドからも遠い隅（山の外）: いちばん近いワールドの地面にする
    let best: OuterKey = 'north'
    let bd = Infinity
    for (const r of OUTER_REGIONS) {
      const d = Math.hypot(x - r.x, z - r.z)
      if (d < bd) {
        bd = d
        best = r.key as OuterKey
      }
    }
    for (const k of OUTER_KEYS) out[k] = k === best ? 1 : 0
    out.africa = 0
    return out
  }
  out.africa = a / sum
  for (const k of OUTER_KEYS) out[k] /= sum
  return out
}

type OuterKey = Exclude<RegionKey, 'africa'>
/** サバンナ以外のワールドの名前（重みの欄の並び） */
export const OUTER_KEYS: readonly OuterKey[] = ['north', 'jungle', 'south', 'water', 'partner']
/** すべてのワールドの名前（重みの欄の並び） */
export const REGION_KEYS: readonly RegionKey[] = ['africa', ...OUTER_KEYS]

const _rw = emptyWeights()
/** いちばん重みの大きいワールド（プレイヤーがいる場所の判定用） */
export function regionAt(x: number, z: number): RegionKey {
  const w = biomeAt(x, z, _rw)
  let best: RegionKey = 'africa'
  let bw = w.africa
  for (const k of OUTER_KEYS) {
    if (w[k] > bw) {
      bw = w[k]
      best = k
    }
  }
  return best
}
