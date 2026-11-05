import { isWalkable } from '../world/regions'
import type { Collider } from '../world/props'

export interface Pt {
  x: number
  z: number
}

/** 岩や幹の円から、これだけ離れて通る（m）。小さいほど狭いすき間も通るが、縁をこすりやすい */
const MARGIN = 0.3
/** 格子の 1 マス（m） */
const CELL = 1.0
/** 区間の外側にこれだけ広げた箱の中だけを探す（回り道の余地） */
const BOX_PAD = 14
/** 格子のマス数の上限。超えたらマスを大きくする */
const MAX_CELLS = 48000
/** 歩ける場所の境目を調べる間隔（m） */
const WALK_STEP = 1.5

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

/** 円の中心から線分までの距離が rad 未満か */
function segmentHitsCircle(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, rad: number): boolean {
  const vx = bx - ax
  const vz = bz - az
  const len2 = vx * vx + vz * vz
  const t = len2 === 0 ? 0 : clamp01(((cx - ax) * vx + (cz - az) * vz) / len2)
  const dx = ax + vx * t - cx
  const dz = az + vz * t - cz
  return dx * dx + dz * dz < rad * rad
}

/** a → b をまっすぐ歩けるか（岩に当たらず、歩ける場所の中に収まる） */
function segmentFree(a: Pt, b: Pt, near: Collider[], radius: number): boolean {
  for (const c of near) {
    if (segmentHitsCircle(a.x, a.z, b.x, b.z, c.x, c.z, c.r + radius + MARGIN)) return false
  }
  const len = Math.hypot(b.x - a.x, b.z - a.z)
  const n = Math.ceil(len / WALK_STEP)
  for (let i = 1; i < n; i++) {
    const t = i / n
    if (!isWalkable(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false
  }
  return true
}

/**
 * a → b がふさがっている時、格子の上で回り道を探す（幅優先）。見つかれば経由点の列（a は含まず b で終わる）。
 * 見つからなければ null（元のとおりまっすぐ向かい、岩の手前であきらめる）
 */
function gridDetour(a: Pt, b: Pt, near: Collider[], radius: number): Pt[] | null {
  // 探す箱: 区間の両端と、区間をふさいでいる岩の全体（一枚岩のように区間より横に広い岩も回れるように）
  let minX = Math.min(a.x, b.x)
  let maxX = Math.max(a.x, b.x)
  let minZ = Math.min(a.z, b.z)
  let maxZ = Math.max(a.z, b.z)
  for (const c of near) {
    const r = c.r + radius + MARGIN
    if (!segmentHitsCircle(a.x, a.z, b.x, b.z, c.x, c.z, r)) continue
    minX = Math.min(minX, c.x - r)
    maxX = Math.max(maxX, c.x + r)
    minZ = Math.min(minZ, c.z - r)
    maxZ = Math.max(maxZ, c.z + r)
  }
  // 箱にかかる岩は、つながった塊ごと箱に入れる（一枚岩の 3 つの円のように、横に並んだ岩の端まで回れるように）
  for (let pass = 0; pass < 8; pass++) {
    let grew = false
    for (const c of near) {
      const r = c.r + radius + MARGIN
      if (c.x + r <= minX || c.x - r >= maxX || c.z + r <= minZ || c.z - r >= maxZ) continue
      if (c.x - r < minX || c.x + r > maxX || c.z - r < minZ || c.z + r > maxZ) {
        minX = Math.min(minX, c.x - r)
        maxX = Math.max(maxX, c.x + r)
        minZ = Math.min(minZ, c.z - r)
        maxZ = Math.max(maxZ, c.z + r)
        grew = true
      }
    }
    if (!grew) break
  }
  minX -= BOX_PAD
  minZ -= BOX_PAD
  const w = maxX - minX + BOX_PAD
  const h = maxZ - minZ + BOX_PAD
  let cell = CELL
  if ((w / cell) * (h / cell) > MAX_CELLS) cell = Math.sqrt((w * h) / MAX_CELLS)
  const W = Math.ceil(w / cell)
  const H = Math.ceil(h / cell)
  const state = new Uint8Array(W * H) // 0: 未調査, 1: 通れる, 2: ふさがっている
  const cx = (i: number) => minX + (i + 0.5) * cell
  const cz = (j: number) => minZ + (j + 0.5) * cell
  const free = (i: number, j: number): boolean => {
    if (i < 0 || j < 0 || i >= W || j >= H) return false
    const k = j * W + i
    if (state[k] === 0) {
      const x = cx(i)
      const z = cz(j)
      let ok = isWalkable(x, z)
      if (ok) {
        for (const c of near) {
          const r = c.r + radius + MARGIN
          const dx = x - c.x
          const dz = z - c.z
          if (dx * dx + dz * dz < r * r) {
            ok = false
            break
          }
        }
      }
      state[k] = ok ? 1 : 2
    }
    return state[k] === 1
  }
  const toCell = (p: Pt): [number, number] => [
    Math.min(W - 1, Math.max(0, Math.floor((p.x - minX) / cell))),
    Math.min(H - 1, Math.max(0, Math.floor((p.z - minZ) / cell))),
  ]
  /** 近くの通れるマス（自分がふさがっている時に使う） */
  const nearestFree = (i0: number, j0: number): [number, number] | null => {
    if (free(i0, j0)) return [i0, j0]
    for (let r = 1; r <= 4; r++) {
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue
          if (free(i0 + di, j0 + dj)) return [i0 + di, j0 + dj]
        }
      }
    }
    return null
  }
  const s = nearestFree(...toCell(a))
  const g = nearestFree(...toCell(b))
  if (!s || !g) return null
  const start = s[1] * W + s[0]
  const goal = g[1] * W + g[0]
  const parent = new Int32Array(W * H).fill(-1)
  const queue = new Int32Array(W * H)
  let head = 0
  let tail = 0
  queue[tail++] = start
  parent[start] = start
  let found = start === goal
  while (head < tail && !found) {
    const k = queue[head++]
    const i = k % W
    const j = (k - i) / W
    for (let dj = -1; dj <= 1 && !found; dj++) {
      for (let di = -1; di <= 1; di++) {
        if (di === 0 && dj === 0) continue
        const ni = i + di
        const nj = j + dj
        if (!free(ni, nj)) continue
        // 斜めは、両どなりが通れる時だけ（岩の角をかすめない）
        if (di !== 0 && dj !== 0 && !(free(i + di, j) && free(i, j + dj))) continue
        const nk = nj * W + ni
        if (parent[nk] !== -1) continue
        parent[nk] = k
        if (nk === goal) {
          found = true
          break
        }
        queue[tail++] = nk
      }
    }
  }
  if (!found) return null
  // ゴールから戻って点の列にし、まっすぐ行ける所はつなげて経由点を減らす
  const cells: Pt[] = []
  for (let k = goal; k !== start; k = parent[k]) {
    const i = k % W
    cells.push({ x: cx(i), z: cz((k - i) / W) })
  }
  cells.reverse()
  const pts: Pt[] = [a, ...cells, b]
  const out: Pt[] = []
  let i0 = 0
  while (i0 < pts.length - 1) {
    let j0 = i0 + 1
    for (let j = pts.length - 1; j > i0 + 1; j--) {
      if (segmentFree(pts[i0], pts[j], near, radius)) {
        j0 = j
        break
      }
    }
    out.push(pts[j0])
    i0 = j0
  }
  return out
}

/** 目的地が岩の中なら、岩の外のいちばん近い所へ出す（岩をタップしたら、その岩のふもとまで歩く）。
 * 中心から外へ向けて輪の上の点を順に試し、岩にかからず歩ける最初の点にする（押し出しだと、並んだ岩のくぼみで行き詰まる） */
function outOfRocks(p: Pt, colliders: Collider[], radius: number): Pt {
  // 目的地は岩のすぐ際でよい（回り道の余裕 MARGIN は要らない。修正前と同じく岩に触れる所まで寄れる）
  const clear = (x: number, z: number): boolean => {
    if (!isWalkable(x, z)) return false
    for (const c of colliders) {
      const r = c.r + radius + 0.05
      const dx = x - c.x
      const dz = z - c.z
      if (dx * dx + dz * dz < r * r) return false
    }
    return true
  }
  if (clear(p.x, p.z)) return p
  for (let ring = 0.5; ring <= 40; ring += 0.5) {
    const n = 8 + Math.ceil(ring * 4)
    for (let k = 0; k < n; k++) {
      const ang = (k / n) * Math.PI * 2
      const x = p.x + Math.cos(ang) * ring
      const z = p.z + Math.sin(ang) * ring
      if (clear(x, z)) return { x, z }
    }
  }
  return p
}

/**
 * 経由点の列を、岩に正面からぶつからない道に直す。
 * 区間ごとに、まっすぐ歩けるならそのまま。岩でふさがっていれば格子の上で回り道を探して差し込む。
 * 岩の縁を滑る動き（controller.ts）はそのまま残し、動くものや見つからなかった時の保険にする
 */
export function refineRoute(from: Pt, points: Pt[], colliders: Collider[], radius: number): Pt[] {
  const out: Pt[] = []
  let prev: Pt = { x: from.x, z: from.z }
  points = points.map((p, i) => (i === points.length - 1 ? outOfRocks(p, colliders, radius) : p))
  for (const p of points) {
    const pad = BOX_PAD + 40
    const minX = Math.min(prev.x, p.x) - pad
    const maxX = Math.max(prev.x, p.x) + pad
    const minZ = Math.min(prev.z, p.z) - pad
    const maxZ = Math.max(prev.z, p.z) + pad
    const near = colliders.filter((c) => c.x + c.r > minX && c.x - c.r < maxX && c.z + c.r > minZ && c.z - c.r < maxZ)
    let blocked = false
    for (const c of near) {
      if (segmentHitsCircle(prev.x, prev.z, p.x, p.z, c.x, c.z, c.r + radius + MARGIN)) {
        blocked = true
        break
      }
    }
    const detour = blocked ? gridDetour(prev, p, near, radius) : null
    if (detour) out.push(...detour)
    else out.push(p)
    prev = p
  }
  return out
}
