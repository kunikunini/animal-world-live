/**
 * トロッコのコース。横から見た線路（y は上が正、単位は画面の点に近い「u」）。
 * - 線路は x が増える向きの折れ線（20u ごとの点）。本線は切れ目（ジャンプ）でいくつかに分かれる
 * - 切れ目の下には必ず「下の道」（落ちても先で本線に戻る）。失敗で止まったり戻されたりしない
 * - 分かれ道（上の道・下の道）は寄り道。どちらを選んでも先で本線に合流する
 * - 区間は 出発の駅 → 出発のワールドの坑道 → まん中の暗い坑道 → 着くワールドの坑道 → 出口 → 着く駅。
 *   ワールドの組ごとに、テーマの並びと小さな揺らぎ（乱数）が変わる
 */
import type { TrolleyEnd } from './stations'

export type Theme = TrolleyEnd | 'mid'
export type ItemKind = 'shell' | 'gem' | 'feather' | 'snow' | 'fruit' | 'star' | 'clover'
/** 土を投げる・物を置くいたずらの生き物（モグラ・ビーバー・ヤギ・マーラ） */
export type ThrowerKind = 'mole' | 'beaver' | 'goat' | 'mara'
/** 乗ってきて物を持っていく生き物 */
export type ThiefKind = 'mouse' | 'monkey'
/** うしろから転がってくるもの */
export type ChaseKind = 'rock' | 'redrock' | 'snow' | 'log' | 'hay'

export interface Rail {
  xs: number[]
  ys: number[]
  kind: 'main' | 'branch' | 'rescue'
}

export interface Item {
  x: number
  y: number
  kind: ItemKind
  taken: boolean
  /** 取った時の演出の時刻（秒、ゲームの時計） */
  at: number
}

export type CourseEvent =
  | { type: 'hint'; x: number; key: 'jump' | 'fork' | 'mouse' | 'monkey' | 'ice' | 'sloth' }
  | { type: 'mole'; x: number; kind?: ThrowerKind }
  | { type: 'mouse'; x: number; kind?: ThiefKind }
  | { type: 'bats'; x: number }
  | { type: 'vent'; x: number; w: number }
  /** 水たまり（しぶき）・雪の吹きだまり・どろんこ（少し遅くなる） */
  | { type: 'splash'; x0: number; x1: number; kind?: 'water' | 'snow' | 'mud' }
  /** 下り坂の火花・氷のツルツル（速くなる） */
  | { type: 'boost'; x0: number; x1: number; kind?: 'spark' | 'ice' }
  /** 動物とかけっこ（x0 で並んで走り出し、x1 に先に着いた方の勝ち） */
  | { type: 'race'; x0: number; x1: number; kind: 'kangaroo' | 'collie' }
  /** 天井のナマケモノ（ジャンプで手にさわるとハイタッチ） */
  | { type: 'sloth'; x: number }
  /** 切れ目の下の川（カイマンが顔を出す） */
  | { type: 'river'; x0: number; x1: number }
  | { type: 'fork'; x: number; dir: 'up' | 'down'; rail: number }
  /** うしろから大岩が転がってくる（x0 で天井から落ち、pit の切れ目に落ちて砕ける） */
  | { type: 'boulder'; x0: number; pit: number; kind: ChaseKind }

export interface Zone {
  x0: number
  x1: number
  theme: Theme
}

export interface Cavern {
  x0: number
  x1: number
  theme: Theme
}

export interface Course {
  rails: Rail[]
  items: Item[]
  events: CourseEvent[]
  zones: Zone[]
  caverns: Cavern[]
  /** 吊りランプ（暗い所の明かり） */
  lamps: Array<{ x: number; y: number }>
  /** 出発の駅のはし・坑道の入口・坑道の出口・着く駅の止まる所 */
  startX: number
  mouthX: number
  exitX: number
  endX: number
  from: TrolleyEnd
  to: TrolleyEnd
  /** 地面の高さ（STEP ごと）。いちばん低い線路の下 */
  ground: Float32Array
  /** 天井の高さ（STEP ごと） */
  ceil: Float32Array
}

export const STEP = 20
export const CART_W = 64

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

/** 線路の x での高さ。範囲の外は null */
export function railY(r: Rail, x: number): number | null {
  const xs = r.xs
  const n = xs.length
  if (n === 0 || x < xs[0] - 0.001 || x > xs[n - 1] + 0.001) return null
  let lo = 0
  let hi = n - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (xs[mid] <= x) lo = mid
    else hi = mid
  }
  const x0 = xs[lo]
  const x1 = xs[hi]
  const t = x1 > x0 ? Math.min(1, Math.max(0, (x - x0) / (x1 - x0))) : 0
  return r.ys[lo] + (r.ys[hi] - r.ys[lo]) * t
}

/** 線路の x での傾き（dy/dx） */
export function railSlope(r: Rail, x: number): number {
  const a = railY(r, Math.max(r.xs[0], x - 8))
  const b = railY(r, Math.min(r.xs[r.xs.length - 1], x + 8))
  if (a === null || b === null) return 0
  const dx = Math.min(r.xs[r.xs.length - 1], x + 8) - Math.max(r.xs[0], x - 8)
  return dx > 0 ? (b - a) / dx : 0
}

const ease = (t: number) => t * t * (3 - 2 * t)

class Builder {
  x = 0
  y = 0
  rails: Rail[] = []
  cur: Rail = { xs: [], ys: [], kind: 'main' }
  items: Item[] = []
  events: CourseEvent[] = []
  gaps: Array<{ x0: number; x1: number; y0: number; y1: number }> = []
  constructor(readonly rand: () => number) {
    this.cur.xs.push(0)
    this.cur.ys.push(0)
    this.rails.push(this.cur)
  }
  r(a: number, b: number): number {
    return a + (b - a) * this.rand()
  }
  private pt(x: number, y: number): void {
    const xs = this.cur.xs
    if (xs.length && x <= xs[xs.length - 1] + 0.01) return
    xs.push(x)
    this.cur.ys.push(y)
    this.x = x
    this.y = y
  }
  /** なめらかに dy だけ上り下りする（0 なら平ら） */
  slope(len: number, dy = 0): this {
    const x0 = this.x
    const y0 = this.y
    const n = Math.max(1, Math.round(len / STEP))
    for (let i = 1; i <= n; i++) {
      const t = i / n
      this.pt(x0 + len * t, y0 + dy * ease(t))
    }
    return this
  }
  flat(len: number): this {
    return this.slope(len, 0)
  }
  /** 山なり（amp > 0）・谷（amp < 0）を 1 つ */
  hill(len: number, amp: number): this {
    const x0 = this.x
    const y0 = this.y
    const n = Math.max(2, Math.round(len / STEP))
    for (let i = 1; i <= n; i++) {
      const t = i / n
      this.pt(x0 + len * t, y0 + amp * Math.sin(Math.PI * t))
    }
    return this
  }
  /** 波を続けて */
  waves(count: number, len: number, amp: number): this {
    for (let i = 0; i < count; i++) this.hill(len, i % 2 === 0 ? amp : -amp * 0.6)
    return this
  }
  /** 切れ目。w だけ空けて dy の高さから次の線路が始まる。下に「下の道」が付く */
  gap(w: number, dy = 0): this {
    const x0 = this.x
    const y0 = this.y
    this.gaps.push({ x0, x1: x0 + w, y0, y1: y0 + dy })
    this.cur = { xs: [x0 + w], ys: [y0 + dy], kind: 'main' }
    this.rails.push(this.cur)
    this.x = x0 + w
    this.y = y0 + dy
    return this
  }
  item(x: number, y: number, kind: ItemKind): void {
    this.items.push({ x, y, kind, taken: false, at: 0 })
  }
  /** 今の線路の上に、x0 から n 個（線路の上 h） */
  row(x0: number, n: number, gap: number, kind: ItemKind, h = 44): void {
    for (let i = 0; i < n; i++) {
      const x = x0 + i * gap
      const y = this.mainY(x)
      if (y !== null) this.item(x, y + h, kind)
    }
  }
  /** 切れ目を跳ぶ弧の上に並べる（跳ぶ道しるべ） */
  arc(x0: number, x1: number, y0: number, y1: number, n: number, kind: ItemKind, peak = 120): void {
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n
      this.item(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t + 40 + peak * Math.sin(Math.PI * t), kind)
    }
  }
  /** 本線（今まで作った分）の x での高さ */
  mainY(x: number): number | null {
    for (const r of this.rails) {
      if (r.kind !== 'main') continue
      const y = railY(r, x)
      if (y !== null) return y
    }
    return null
  }
  /**
   * 分かれ道。本線を body() で作り、その上（up）か下（down）に寄り道の線路を足す。
   * 寄り道は始まりと終わりで本線とつながる（始まりは本線の点から、終わりは本線の高さへ）
   */
  branch(dir: 'up' | 'down', h: number, body: () => void, fill?: (rail: Rail) => void): void {
    const xStart = this.x
    const yStart = this.y
    body()
    const xEnd = this.x - 40
    const rail: Rail = { xs: [], ys: [], kind: 'branch' }
    const ramp = 260
    const sign = dir === 'up' ? 1 : -1
    for (let x = xStart; x <= xEnd + 0.01; x += STEP) {
      const m = this.mainY(x) ?? yStart
      let k = 1
      if (x < xStart + ramp) k = ease((x - xStart) / ramp)
      else if (x > xEnd - ramp) k = ease((xEnd - x) / ramp)
      // 上の道は本線の起伏をなだらかにたどる（本線より必ず h 上）、下の道は本線より h 下の平らな水路
      rail.xs.push(x)
      rail.ys.push(m + sign * h * k)
    }
    // 終わりは本線の高さにぴったり合わせる（合流）
    const last = rail.xs.length - 1
    rail.ys[last] = this.mainY(rail.xs[last]) ?? rail.ys[last]
    const idx = this.rails.push(rail) - 1
    this.events.push({ type: 'fork', x: xStart, dir, rail: idx })
    fill?.(rail)
  }
}

interface Ctx {
  b: Builder
  theme: Theme
  item: ItemKind
}

/** 出発・着くワールドの坑道（水の世界）: 水たまりのしぶき、滝の洞窟、モグラ、水路の下の道 */
function waterZone(c: Ctx, first: boolean): void {
  const { b } = c
  const it = c.item
  b.flat(260)
  if (first) {
    b.events.push({ type: 'hint', x: b.x - 120, key: 'jump' })
    b.row(b.x - 200, 4, 50, it)
    // はじめての切れ目は低く短く
    const x0 = b.x
    const y0 = b.y
    b.gap(150, 0)
    b.arc(x0, b.x, y0, b.y, 3, it, 70)
  } else {
    b.hill(360, 70)
    b.row(b.x - 300, 5, 55, it, 60)
  }
  b.flat(240)
  // 水たまり
  const s0 = b.x
  b.flat(320)
  b.events.push({ type: 'splash', x0: s0 + 20, x1: b.x - 20 })
  b.row(s0 + 40, 5, 60, it, 26)
  b.waves(2, 300, b.r(46, 70))
  // モグラ 1
  b.flat(380)
  b.events.push({ type: 'mole', x: b.x - 60 })
  b.flat(300)
  // 分かれ道（下の水路）: 水路にかいがら
  b.events.push({ type: 'hint', x: b.x - 160, key: 'fork' })
  b.branch(
    'down',
    110,
    () => {
      b.slope(260, 30).hill(500, 60).slope(300, -30).flat(240)
    },
    (rail) => {
      for (let i = 4; i < rail.xs.length - 6; i += 3) b.item(rail.xs[i], rail.ys[i] + 30, it)
      b.events.push({ type: 'splash', x0: rail.xs[6], x1: rail.xs[rail.xs.length - 8] })
    },
  )
  b.flat(200)
  // 滝の大きな洞窟
  b.slope(500, -150)
  const cv0 = b.x
  b.waves(3, 360, 50)
  b.row(cv0 + 120, 7, 70, it, 54)
  const gx = b.x
  const gy = b.y
  b.gap(b.r(190, 220), -20)
  b.arc(gx, b.x, gy, b.y, 4, it, 110)
  b.flat(300)
  b.slope(420, 120)
  ;(b as BuilderWithCaverns).caverns.push({ x0: cv0 - 260, x1: b.x, theme: c.theme })
  // 2 つ続く切れ目
  b.flat(260)
  const dx0 = b.x
  const dy0 = b.y
  b.gap(170, 10).flat(150)
  b.arc(dx0, b.x - 150, dy0, b.y, 3, it, 90)
  const dx1 = b.x
  const dy1 = b.y
  b.gap(180, -10).flat(200)
  b.arc(dx1, b.x - 200, dy1, b.y, 3, it, 90)
  // モグラ 2（少し下り坂で速い所）
  b.slope(400, -60)
  b.events.push({ type: 'mole', x: b.x + 60 })
  b.flat(380)
}

/** まん中の暗い坑道: ランプの明かり、コウモリ、ネズミ、下り坂の加速、水晶の洞窟、上の道 */
function midZone(c: Ctx): void {
  const { b } = c
  const it = c.item
  b.flat(300)
  b.events.push({ type: 'bats', x: b.x })
  b.waves(2, 320, 50)
  b.row(b.x - 560, 6, 70, it, 50)
  // ネズミ 1（梁の上から）
  b.flat(300)
  b.events.push({ type: 'hint', x: b.x - 260, key: 'mouse' })
  b.events.push({ type: 'mouse', x: b.x })
  b.flat(400)
  // 長い下り坂で加速（火花）
  const bx0 = b.x
  b.slope(900, -260)
  b.events.push({ type: 'boost', x0: bx0 + 100, x1: b.x })
  b.row(bx0 + 160, 8, 90, it, 40)
  b.flat(200)
  const gx = b.x
  const gy = b.y
  b.gap(230, 30)
  b.arc(gx, b.x, gy, b.y, 4, it, 130)
  b.flat(200)
  // 水晶の洞窟（引きで見せる）
  const cv0 = b.x
  b.hill(500, 130).flat(180).hill(420, -60).flat(160)
  b.row(cv0 + 80, 5, 90, it, 70)
  ;(b as BuilderWithCaverns).caverns.push({ x0: cv0 - 200, x1: b.x + 120, theme: 'mid' })
  // 上の道（高い足場にひかる石）
  b.flat(220)
  b.branch(
    'up',
    150,
    () => {
      b.flat(300).events.push({ type: 'mole', x: b.x - 80 })
      b.flat(240).hill(300, 40).flat(260)
    },
    (rail) => {
      for (let i = 14; i < rail.xs.length - 14; i += 3) b.item(rail.xs[i], rail.ys[i] + 40, it)
    },
  )
  b.flat(200)
  // ネズミ 2
  b.events.push({ type: 'mouse', x: b.x + 100 })
  b.flat(420)
  b.events.push({ type: 'bats', x: b.x })
  b.waves(2, 300, 60)
  b.slope(500, 140)
}

/** 空の世界の坑道: 光の差しこむ割れ目、上昇気流の穴（跳ぶと高く舞う）、高い所の羽根 */
function skyZone(c: Ctx, first: boolean): void {
  const { b } = c
  const it = c.item
  b.flat(240)
  if (first) {
    b.events.push({ type: 'hint', x: b.x - 120, key: 'jump' })
    b.row(b.x - 200, 4, 50, it)
    const x0 = b.x
    const y0 = b.y
    b.gap(150, 0)
    b.arc(x0, b.x, y0, b.y, 3, it, 70)
    b.flat(240)
  }
  b.hill(420, 80)
  b.row(b.x - 360, 5, 60, it, 64)
  b.flat(200)
  // 上昇気流の穴を越える切れ目: 跳ぶと風で高く舞い、上の羽根に届く
  for (let k = 0; k < 2; k++) {
    const x0 = b.x
    const y0 = b.y
    const w = k === 0 ? 240 : 280
    b.gap(w, 20)
    b.events.push({ type: 'vent', x: x0 + w * 0.5, w: w * 0.7 })
    for (let i = 0; i < 4; i++) b.item(x0 + w * (0.2 + i * 0.2), y0 + 230 + Math.sin(i) * 20, it)
    b.flat(320)
  }
  // モグラ（空の世界の土）
  b.events.push({ type: 'mole', x: b.x - 40 })
  b.flat(300)
  // 上の道（光の棚）
  b.events.push({ type: 'hint', x: b.x - 160, key: 'fork' })
  b.branch(
    'up',
    170,
    () => {
      b.flat(240).hill(400, 50).flat(300).hill(300, -40).flat(200)
    },
    (rail) => {
      for (let i = 14; i < rail.xs.length - 14; i += 2) b.item(rail.xs[i], rail.ys[i] + 46, it)
      b.events.push({ type: 'vent', x: rail.xs[Math.floor(rail.xs.length / 2)], w: 140 })
    },
  )
  b.flat(240)
  // 大きな吹き抜け（空が見える洞窟）
  const cv0 = b.x
  b.slope(420, 140).waves(2, 380, 60).flat(200)
  b.row(cv0 + 120, 6, 90, it, 60)
  const gx = b.x
  const gy = b.y
  b.gap(260, 40)
  b.events.push({ type: 'vent', x: gx + 130, w: 180 })
  b.arc(gx, b.x, gy, b.y, 4, it, 170)
  b.flat(300)
  ;(b as BuilderWithCaverns).caverns.push({ x0: cv0 - 200, x1: b.x, theme: 'sky' })
  b.events.push({ type: 'mole', x: b.x + 120 })
  b.flat(400).hill(360, 60)
}

/**
 * 後半の大岩（11/14 くに）: 着くワールドの坑道の終わりに、長い下り坂と最後の切れ目。
 * 坂の入口でうしろの天井から大岩が落ちて追いかけてくる。最後の切れ目を跳ぶと、大岩は穴に落ちて砕ける
 */
function boulderRun(c: Ctx): void {
  const { b } = c
  const it = c.item
  b.flat(200)
  const x0 = b.x
  b.flat(240)
  b.slope(900, -170)
  b.row(x0 + 340, 7, 110, it, 40)
  b.waves(2, 340, 46)
  b.flat(280)
  const pit = b.x
  const py = b.y
  b.events.push({ type: 'hint', x: pit - 240, key: 'jump' })
  b.gap(240, 0)
  b.arc(pit, b.x, py, b.y, 4, it, 120)
  b.events.push({ type: 'boulder', x0, pit, kind: CHASE_OF[c.theme] })
  b.flat(320)
}

const CHASE_OF: Record<Theme, ChaseKind> = { water: 'rock', sky: 'rock', mid: 'rock', north: 'snow', jungle: 'log', south: 'redrock', partner: 'hay' }

/** はじめの区間の最初の切れ目（低く短い）。2 つめの区間からは山なり */
function opener(c: Ctx, first: boolean, flatLen: number): void {
  const { b } = c
  const it = c.item
  b.flat(flatLen)
  if (first) {
    b.events.push({ type: 'hint', x: b.x - 120, key: 'jump' })
    b.row(b.x - 200, 4, 50, it)
    const x0 = b.x
    const y0 = b.y
    b.gap(150, 0)
    b.arc(x0, b.x, y0, b.y, 3, it, 70)
  } else {
    b.hill(360, 70)
    b.row(b.x - 300, 5, 55, it, 60)
  }
}

/**
 * 北の世界の坑道（11/14）: 氷のツルツルの下り坂（勝手に速くなる）、雪の吹きだまり、ビーバーのダム（枝の山を線路に置く）、
 * 上の氷の棚、ニホンザルの温泉の洞くつ、つららの切れ目
 */
function northZone(c: Ctx, first: boolean): void {
  const { b } = c
  const it = c.item
  opener(c, first, 260)
  b.flat(220)
  // 氷のツルツル
  b.events.push({ type: 'hint', x: b.x - 80, key: 'ice' })
  const i0 = b.x
  b.slope(760, -130)
  b.events.push({ type: 'boost', x0: i0 + 40, x1: b.x, kind: 'ice' })
  b.row(i0 + 120, 7, 90, it, 36)
  b.flat(200)
  // 雪の吹きだまり
  const s0 = b.x
  b.flat(320)
  b.events.push({ type: 'splash', x0: s0 + 20, x1: b.x - 20, kind: 'snow' })
  b.row(s0 + 40, 5, 60, it, 26)
  b.waves(2, 300, 56)
  // ビーバー 1
  b.flat(380)
  b.events.push({ type: 'mole', x: b.x - 60, kind: 'beaver' })
  b.flat(300)
  // 上の氷の棚
  b.events.push({ type: 'hint', x: b.x - 160, key: 'fork' })
  b.branch(
    'up',
    160,
    () => {
      b.flat(260).hill(420, 50).flat(280).hill(320, -40).flat(220)
    },
    (rail) => {
      for (let i = 14; i < rail.xs.length - 14; i += 2) b.item(rail.xs[i], rail.ys[i] + 44, it)
    },
  )
  b.flat(200)
  // ニホンザルの温泉の洞くつ
  b.slope(480, -140)
  const cv0 = b.x
  b.waves(3, 340, 46)
  b.row(cv0 + 120, 7, 70, it, 54)
  const gx = b.x
  const gy = b.y
  b.gap(b.r(200, 225), -10)
  b.arc(gx, b.x, gy, b.y, 4, it, 115)
  b.flat(300)
  b.slope(420, 120)
  ;(b as BuilderWithCaverns).caverns.push({ x0: cv0 - 260, x1: b.x, theme: c.theme })
  // 2 つ続く切れ目
  b.flat(260)
  const dx0 = b.x
  const dy0 = b.y
  b.gap(170, 10).flat(150)
  b.arc(dx0, b.x - 150, dy0, b.y, 3, it, 90)
  const dx1 = b.x
  const dy1 = b.y
  b.gap(180, -10).flat(200)
  b.arc(dx1, b.x - 200, dy1, b.y, 3, it, 90)
  // ビーバー 2（少し下り坂で速い所）
  b.slope(400, -60)
  b.events.push({ type: 'mole', x: b.x + 60, kind: 'beaver' })
  b.flat(380)
}

/**
 * ジャングルの坑道（11/14）: 木の根とつる、リスザルの群れ（乗ってきて くだものを持っていく）、天井のナマケモノ（ジャンプでハイタッチ）、
 * カイマンのいる川を跳ぶ切れ目、下の根っこの道、光るキノコの大きな洞くつ
 */
function jungleZone(c: Ctx, first: boolean): void {
  const { b } = c
  const it = c.item
  opener(c, first, 240)
  b.flat(240)
  // ナマケモノ 1
  b.events.push({ type: 'hint', x: b.x - 200, key: 'sloth' })
  b.events.push({ type: 'sloth', x: b.x + 60 })
  b.flat(320)
  b.waves(2, 300, 52)
  // リスザル
  b.flat(260)
  b.events.push({ type: 'hint', x: b.x - 260, key: 'monkey' })
  b.events.push({ type: 'mouse', x: b.x, kind: 'monkey' })
  b.flat(420)
  // カイマンの川（長めの切れ目、下は川）
  b.slope(300, -40)
  const rx = b.x
  const ry = b.y
  b.gap(250, 0)
  b.events.push({ type: 'river', x0: rx - 140, x1: b.x + 140 })
  b.arc(rx, b.x, ry, b.y, 4, it, 130)
  b.flat(260)
  // 下の根っこの道
  b.events.push({ type: 'hint', x: b.x - 160, key: 'fork' })
  b.branch(
    'down',
    110,
    () => {
      b.slope(260, 30).hill(520, 60).slope(300, -30).flat(240)
    },
    (rail) => {
      for (let i = 4; i < rail.xs.length - 6; i += 3) b.item(rail.xs[i], rail.ys[i] + 30, it)
    },
  )
  b.flat(200)
  // 光るキノコの大きな洞くつ
  b.slope(460, -140)
  const cv0 = b.x
  b.hill(460, 110).flat(160).hill(380, -50)
  b.row(cv0 + 100, 6, 90, it, 64)
  b.events.push({ type: 'sloth', x: cv0 + 760 })
  b.flat(200)
  b.slope(420, 120)
  ;(b as BuilderWithCaverns).caverns.push({ x0: cv0 - 200, x1: b.x, theme: c.theme })
  // リスザル 2
  b.flat(240)
  b.events.push({ type: 'mouse', x: b.x + 80, kind: 'monkey' })
  b.flat(400)
  const gx = b.x
  const gy = b.y
  b.gap(200, 10)
  b.arc(gx, b.x, gy, b.y, 3, it, 100)
  b.flat(300).hill(340, 50)
}

/**
 * 南半球の坑道（11/14）: 夕方の赤い岩、カンガルーとかけっこ（レバーで勝てる）、マーラの巣穴（土をけり出す）、
 * 夕日の下り坂の加速、カピバラの温泉の洞くつ、上の岩だなの道
 */
function southZone(c: Ctx, first: boolean): void {
  const { b } = c
  const it = c.item
  opener(c, first, 240)
  b.flat(220)
  // マーラ 1
  b.flat(300)
  b.events.push({ type: 'mole', x: b.x - 60, kind: 'mara' })
  b.flat(300)
  // カンガルーとかけっこ（平らに近い長い道。切れ目なし）
  const r0 = b.x
  b.flat(200).waves(3, 380, 30).flat(400)
  b.events.push({ type: 'race', x0: r0 + 60, x1: b.x - 60, kind: 'kangaroo' })
  b.row(r0 + 200, 9, 140, it, 40)
  b.flat(200)
  // 夕日の下り坂
  const bx0 = b.x
  b.slope(800, -220)
  b.events.push({ type: 'boost', x0: bx0 + 100, x1: b.x })
  b.row(bx0 + 160, 7, 90, it, 40)
  b.flat(200)
  const gx = b.x
  const gy = b.y
  b.gap(220, 20)
  b.arc(gx, b.x, gy, b.y, 4, it, 125)
  b.flat(220)
  // カピバラの温泉の洞くつ
  const cv0 = b.x
  b.waves(3, 340, 44)
  b.row(cv0 + 100, 6, 80, it, 56)
  b.flat(200)
  ;(b as BuilderWithCaverns).caverns.push({ x0: cv0 - 220, x1: b.x + 120, theme: c.theme })
  // 上の岩だな
  b.events.push({ type: 'hint', x: b.x - 160, key: 'fork' })
  b.branch(
    'up',
    150,
    () => {
      b.flat(300).events.push({ type: 'mole', x: b.x - 80, kind: 'mara' })
      b.flat(240).hill(300, 40).flat(260)
    },
    (rail) => {
      for (let i = 14; i < rail.xs.length - 14; i += 3) b.item(rail.xs[i], rail.ys[i] + 40, it)
    },
  )
  b.flat(260)
  b.slope(400, 100).flat(300)
}

/**
 * ふれあいワールドの坑道（11/14）: 木の柱と干し草の牧場の坑道、ヤギ（岩だなから干し草をけり落とす）、ブタのどろんこ（画面に泥がはねる）、
 * ボーダーコリーとかけっこ、納屋のような大きな洞くつ、下の水路
 */
function partnerZone(c: Ctx, first: boolean): void {
  const { b } = c
  const it = c.item
  opener(c, first, 260)
  b.flat(240)
  // ヤギ 1
  b.flat(300)
  b.events.push({ type: 'mole', x: b.x - 60, kind: 'goat' })
  b.flat(300)
  // ブタのどろんこ
  const s0 = b.x
  b.flat(340)
  b.events.push({ type: 'splash', x0: s0 + 20, x1: b.x - 20, kind: 'mud' })
  b.row(s0 + 40, 5, 64, it, 26)
  b.waves(2, 300, 50)
  // ボーダーコリーとかけっこ
  b.flat(200)
  const r0 = b.x
  b.flat(200).waves(2, 420, 26).flat(500)
  b.events.push({ type: 'race', x0: r0 + 60, x1: b.x - 60, kind: 'collie' })
  b.row(r0 + 220, 8, 140, it, 40)
  b.flat(200)
  // 納屋の大きな洞くつ
  b.slope(460, -140)
  const cv0 = b.x
  b.waves(2, 360, 50)
  b.row(cv0 + 120, 6, 80, it, 54)
  const gx = b.x
  const gy = b.y
  b.gap(b.r(195, 220), -10)
  b.arc(gx, b.x, gy, b.y, 4, it, 110)
  b.flat(260)
  b.slope(420, 120)
  ;(b as BuilderWithCaverns).caverns.push({ x0: cv0 - 240, x1: b.x, theme: c.theme })
  // 下の水路
  b.flat(220)
  b.events.push({ type: 'hint', x: b.x - 160, key: 'fork' })
  b.branch(
    'down',
    110,
    () => {
      b.slope(260, 30).hill(480, 60).slope(300, -30).flat(240)
    },
    (rail) => {
      for (let i = 4; i < rail.xs.length - 6; i += 3) b.item(rail.xs[i], rail.ys[i] + 30, it)
    },
  )
  b.flat(200)
  // ヤギ 2
  b.slope(400, -60)
  b.events.push({ type: 'mole', x: b.x + 60, kind: 'goat' })
  b.flat(380)
}

type BuilderWithCaverns = Builder & { caverns: Cavern[] }

const ITEM_OF: Record<Theme, ItemKind> = { water: 'shell', sky: 'feather', mid: 'gem', north: 'snow', jungle: 'fruit', south: 'star', partner: 'clover' }

export function buildCourse(from: TrolleyEnd, to: TrolleyEnd): Course {
  const rand = mulberry32(hashString(`${from}>${to}`))
  const b = new Builder(rand) as BuilderWithCaverns
  b.caverns = []
  const zones: Zone[] = []
  const zone = (theme: Theme, fn: () => void) => {
    const x0 = b.x
    fn()
    zones.push({ x0, x1: b.x, theme })
  }
  const run = (theme: Theme, first: boolean) => {
    const c: Ctx = { b, theme, item: ITEM_OF[theme] }
    if (theme === 'water') waterZone(c, first)
    else if (theme === 'sky') skyZone(c, first)
    else if (theme === 'north') northZone(c, first)
    else if (theme === 'jungle') jungleZone(c, first)
    else if (theme === 'south') southZone(c, first)
    else if (theme === 'partner') partnerZone(c, first)
    else midZone(c)
  }
  // 出発の駅（明るい）
  const startX = 140
  b.flat(620)
  const mouthX = 560
  zone(from, () => run(from, true))
  zone('mid', () => run('mid', false))
  zone(to, () => {
    run(to, false)
    boulderRun({ b, theme: to, item: ITEM_OF[to] })
  })
  // 出口へ向かう上り → 出口 → 着く駅
  b.slope(600, 80)
  b.flat(500)
  const exitX = b.x
  b.flat(700)
  const endX = b.x - 260
  b.flat(400)
  // ゾーンの境目: 出発の駅は from、出口から先は to
  zones[0].x0 = 0
  zones[zones.length - 1].x1 = b.x

  // 切れ目の下の「下の道」: 近い切れ目はまとめて 1 本。底を走り、上り坂で本線へ戻る
  const groups: Array<{ x0: number; x1: number; low: number }> = []
  for (const g of b.gaps) {
    const low = Math.min(g.y0, g.y1) - 190
    const last = groups[groups.length - 1]
    // 下の道が本線へ戻る所（切れ目の 720u 先）より手前で次の切れ目が始まるなら、まとめて 1 本にする
    if (last && g.x0 - last.x1 < 780) {
      last.x1 = g.x1
      last.low = Math.min(last.low, low)
    } else groups.push({ x0: g.x0, x1: g.x1, low })
  }
  for (const g of groups) {
    const rail: Rail = { xs: [], ys: [], kind: 'rescue' }
    const flatEnd = g.x1 + 200
    const mergeX = flatEnd + 520
    const yTop = b.mainY(mergeX) ?? g.low + 190
    for (let x = g.x0 - 30; x <= mergeX + 0.01; x += STEP) {
      let y = g.low
      if (x > flatEnd) y = g.low + (yTop - g.low) * ease((x - flatEnd) / (mergeX - flatEnd))
      rail.xs.push(x)
      rail.ys.push(y)
    }
    rail.ys[rail.ys.length - 1] = yTop
    b.rails.push(rail)
  }

  // 地面（いちばん低い線路の下）と天井
  const n = Math.ceil(b.x / STEP) + 2
  const ground = new Float32Array(n)
  const ceil = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const x = i * STEP
    let lo = Infinity
    let hi = -Infinity
    for (const r of b.rails) {
      const y = railY(r, x)
      if (y === null) continue
      // 上の道は柱で支える（地面にしない）
      if (r.kind !== 'branch' || y < (b.mainY(x) ?? y)) lo = Math.min(lo, y)
      hi = Math.max(hi, y)
    }
    if (!Number.isFinite(lo)) lo = ground[i - 1] + 6 || 0
    ground[i] = lo - 6
    // ふつうのジャンプ（長押し）で天井に頭が当たらない高さ（てっぺんは線路の上 約 190、頭は 70 上）より広く
    let room = 340 + 40 * Math.sin(x * 0.0021) + 30 * Math.sin(x * 0.0067 + 1)
    for (const cv of b.caverns) {
      if (x > cv.x0 && x < cv.x1) {
        const t = Math.min((x - cv.x0) / 260, (cv.x1 - x) / 260, 1)
        room += 420 * ease(Math.max(0, t))
      }
    }
    ceil[i] = (Number.isFinite(hi) ? hi : lo) + room
  }
  // 天井はなめらかに（でこぼこは描く時に足す）
  const sm = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    let s = 0
    let k = 0
    for (let j = -6; j <= 6; j++) {
      const v = ceil[Math.min(n - 1, Math.max(0, i + j))]
      s += v
      k++
    }
    sm[i] = Math.max(s / k, ceil[i] - 20)
  }

  // 吊りランプ: まん中の坑道は 360u ごと、ワールドの坑道は 700u ごと
  const lamps: Array<{ x: number; y: number }> = []
  for (const z of zones) {
    const every = z.theme === 'mid' ? 360 : 700
    for (let x = Math.max(mouthX + 300, z.x0 + 150); x < Math.min(exitX - 200, z.x1); x += every) {
      const i = Math.round(x / STEP)
      lamps.push({ x, y: sm[i] - 30 })
    }
  }

  return {
    rails: b.rails,
    items: b.items,
    events: b.events.sort((p, q) => ('x' in p ? p.x : p.x0) - ('x' in q ? q.x : q.x0)),
    zones,
    caverns: b.caverns,
    lamps,
    startX,
    mouthX,
    exitX,
    endX,
    from,
    to,
    ground,
    ceil: sm,
  }
}

export function sampleAt(arr: Float32Array, x: number): number {
  const f = x / STEP
  const i = Math.max(0, Math.min(arr.length - 2, Math.floor(f)))
  const t = Math.min(1, Math.max(0, f - i))
  return arr[i] + (arr[i + 1] - arr[i]) * t
}

export function themeAt(c: Course, x: number): Theme {
  for (const z of c.zones) if (x >= z.x0 && x < z.x1) return z.theme
  return x < c.zones[0].x0 ? c.from : c.to
}
