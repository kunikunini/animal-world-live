import { ANIMALS } from '../data/animals'
import { LIONS, SAVANNA_HYENA, SAVANNA_MEERKAT, SAVANNA_ZEBRA, SPAWN, SPOT, WALK_RADIUS } from './layout'
import { OUTER_REGIONS, biomeAt, clampToWalkable, emptyWeights, isWalkable } from './regions'
import type { RegionKey } from './regions'
import { TROLLEY_ROUTES, arrivalSpot } from '../trolley/stations'

/**
 * 地図の「拠点」と「道」（スーパーマリオブラザーズ 3 のワールドマップのパネルと道の考え方を借りる。11/6 のくにの要望）。
 * 拠点をタップすると、地図の中で小さな主人公が道をたどってそこまで歩き、着いたら本編のその場所に立っている。
 * - entry: ワールドの入口（サバンナはスタート地点、ほかのワールドはサバンナから来る峠の口）
 * - spot: 観察スポット
 * - pass: 峠（となりのワールドへの出口）。着く先は、となりのワールドの入口
 * - trolley: トロッコの駅（11/14〜）。押すとその駅の前へ（となりのワールドの駅なら、地図の中でトンネルを通って行く）。トンネルは地面の下なので点線で描く
 * - animal: 代表的な動物のいる場所。動物は歩き回るので、場所は開いた時・着いた時の個体の位置（animalId）で決める
 * 道は、拠点どうしをまっすぐ結ぶ。ワールドの中は入口とスポットから放射状（動物の拠点は近い方から）、サバンナの峠と各ワールドの入口は峠の道でつながる
 */
export type BaseKind = 'entry' | 'spot' | 'pass' | 'trolley' | 'animal'

export interface MapBase {
  id: string
  world: RegionKey
  kind: BaseKind
  /** 拠点の場所（動物の拠点は既定の場所。実際は個体の位置を使う） */
  x: number
  z: number
  /** 動物の拠点: この子のいる所 */
  animalId?: string
  /** 動物の拠点: 札に出す種の名前（ja） */
  species?: string
  /** 峠・トロッコの駅: 行き先のワールド */
  to?: RegionKey
}

export interface MapRoad {
  a: string
  b: string
  /** トロッコのトンネル（地面の下） */
  tunnel?: boolean
}

/** 代表的な動物の拠点（ワールドごとに、種と、無ければ使う場所）。種のいちばん初めの子の位置を使う */
const ANIMAL_BASES: Array<{ world: RegionKey; species: string; id?: string }> = [
  { world: 'africa', species: 'ライオン', id: 'riley' },
  { world: 'africa', species: 'ミーアキャット' },
  { world: 'africa', species: 'ブチハイエナ' },
  { world: 'africa', species: 'グラントシマウマ' },
  { world: 'jungle', species: 'ベンガルトラ' },
  { world: 'jungle', species: 'ワオキツネザル' },
  { world: 'jungle', species: 'アメリカバク' },
  { world: 'north', species: 'ホッキョクオオカミ' },
  { world: 'north', species: 'シベリアンハスキー' },
  { world: 'north', species: 'ツキノワグマ' },
  { world: 'south', species: 'オオカンガルー' },
  { world: 'south', species: 'カピバラ' },
  { world: 'south', species: 'マーラ' },
  { world: 'water', species: 'ケープペンギン' },
  { world: 'water', species: 'コツメカワウソ' },
  { world: 'partner', species: 'ヤギ' },
  { world: 'partner', species: 'ポニー' },
  { world: 'sky', species: 'ハリスホーク' },
  { world: 'sky', species: 'メンフクロウ' },
]

/** 峠の軸の上、原点から t m の点 */
function onAxis(r: { x: number; z: number }, t: number): { x: number; z: number } {
  const len = Math.hypot(r.x, r.z)
  return { x: (r.x / len) * t, z: (r.z / len) * t }
}

/** サバンナ側の峠の口（円の 15m 内側）と、ワールド側の入口（円の 5m 内側）。routeTo と同じ所 */
export function savannaMouth(key: RegionKey): { x: number; z: number } {
  const r = OUTER_REGIONS.find((g) => g.key === key)!
  return onAxis(r, WALK_RADIUS - 15)
}
export function outerMouth(key: RegionKey): { x: number; z: number } {
  const r = OUTER_REGIONS.find((g) => g.key === key)!
  return onAxis(r, Math.hypot(r.x, r.z) - r.walk + 5)
}

/** その場所がどのワールドか（地面の重みのいちばん大きいワールド） */
const _w = emptyWeights()
export function worldAt(x: number, z: number): RegionKey {
  biomeAt(x, z, _w)
  let best: RegionKey = 'africa'
  let bw = -1
  for (const [k, v] of Object.entries(_w) as Array<[RegionKey, number]>) {
    if (v > bw) {
      bw = v
      best = k
    }
  }
  return best
}

/** ワールドの中心（サバンナは原点、観察スポットはコピエの上） */
export function worldCenter(key: RegionKey): { x: number; z: number } {
  if (key === 'africa') return { x: 0, z: 0 }
  const r = OUTER_REGIONS.find((g) => g.key === key)!
  return { x: r.x, z: r.z }
}

let cache: { bases: MapBase[]; roads: MapRoad[] } | null = null

export function mapBases(): { bases: MapBase[]; roads: MapRoad[] } {
  if (cache) return cache
  const bases: MapBase[] = []
  const roads: MapRoad[] = []
  // サバンナ
  bases.push({ id: 'africa:entry', world: 'africa', kind: 'entry', x: SPAWN.x, z: SPAWN.z })
  bases.push({ id: 'africa:spot', world: 'africa', kind: 'spot', x: SPOT.x, z: SPOT.z })
  roads.push({ a: 'africa:entry', b: 'africa:spot' })
  for (const r of OUTER_REGIONS) {
    const m = savannaMouth(r.key)
    bases.push({ id: `africa:pass:${r.key}`, world: 'africa', kind: 'pass', x: m.x, z: m.z, to: r.key })
    roads.push({ a: 'africa:entry', b: `africa:pass:${r.key}` })
    // ほかのワールド: 入口（サバンナへ戻る峠を兼ねる）とスポット
    const e = outerMouth(r.key)
    bases.push({ id: `${r.key}:entry`, world: r.key, kind: 'pass', x: e.x, z: e.z, to: 'africa' })
    bases.push({ id: `${r.key}:spot`, world: r.key, kind: 'spot', x: r.x, z: r.z })
    roads.push({ a: `${r.key}:entry`, b: `${r.key}:spot` })
    // 峠の道（サバンナの峠の口 ↔ ワールドの入口）
    roads.push({ a: `africa:pass:${r.key}`, b: `${r.key}:entry` })
  }
  // トロッコの駅（駅の前、主人公が着く所）。駅とスポットを道で、2 つの駅をトンネルでつなぐ
  for (const r of TROLLEY_ROUTES) {
    for (const [from, to] of [
      [r.a, r.b],
      [r.b, r.a],
    ] as const) {
      const p = arrivalSpot(from)
      bases.push({ id: `${from.region}:trolley`, world: from.region, kind: 'trolley', x: p.x, z: p.z, to: to.region })
      roads.push({ a: `${from.region}:spot`, b: `${from.region}:trolley` })
    }
    roads.push({ a: `${r.a.region}:trolley`, b: `${r.b.region}:trolley`, tunnel: true })
  }
  const fixed: Record<string, { x: number; z: number }> = {
    ミーアキャット: SAVANNA_MEERKAT,
    ブチハイエナ: SAVANNA_HYENA,
    グラントシマウマ: SAVANNA_ZEBRA,
  }
  for (const a of ANIMAL_BASES) {
    const animal = a.id ? ANIMALS.find((x) => x.id === a.id) : ANIMALS.find((x) => x.world === a.world && x.species === a.species)
    if (!animal) continue
    const lion = LIONS.find((l) => l.id === animal.id)
    const c = worldCenter(a.world)
    const at = lion ?? fixed[a.species] ?? { x: c.x + 10, z: c.z + 10 }
    const id = `${a.world}:animal:${animal.id}`
    bases.push({ id, world: a.world, kind: 'animal', x: at.x, z: at.z, animalId: animal.id, species: a.species })
    // 入口とスポットのうち近い方とつなぐ（スタートのそばの群れへ行くのに、コピエの上まで回り道しない）
    const hub = [bases.find((b) => b.id === `${a.world}:entry`), bases.find((b) => b.id === `${a.world}:spot`)]
      .filter((b): b is MapBase => !!b)
      .reduce((best, b) => (Math.hypot(b.x - at.x, b.z - at.z) < Math.hypot(best.x - at.x, best.z - at.z) ? b : best))
    roads.push({ a: hub.id, b: id })
  }
  cache = { bases, roads }
  return cache
}

/** a から b へ、道をたどる拠点の列（a と b を含む）。つながっていなければ [a, b] */
export function roadPath(fromId: string, toId: string): string[] {
  const { roads } = mapBases()
  const next = new Map<string, string[]>()
  for (const r of roads) {
    next.set(r.a, [...(next.get(r.a) ?? []), r.b])
    next.set(r.b, [...(next.get(r.b) ?? []), r.a])
  }
  const prev = new Map<string, string>()
  const queue = [fromId]
  const seen = new Set([fromId])
  while (queue.length) {
    const cur = queue.shift()!
    if (cur === toId) break
    for (const n of next.get(cur) ?? []) {
      if (seen.has(n)) continue
      seen.add(n)
      prev.set(n, cur)
      queue.push(n)
    }
  }
  if (!seen.has(toId)) return [fromId, toId]
  const out = [toId]
  while (out[0] !== fromId) out.unshift(prev.get(out[0])!)
  return out
}

/** 主人公のいる所にいちばん近い、同じワールドの拠点（地図の中で歩き出す所） */
export function nearestBase(x: number, z: number, pos: (b: MapBase) => { x: number; z: number }): MapBase {
  const w = worldAt(x, z)
  const { bases } = mapBases()
  let best = bases[0]
  let bd = Infinity
  for (const b of bases) {
    if (b.world !== w) continue
    const p = pos(b)
    const d = Math.hypot(p.x - x, p.z - z)
    if (d < bd) {
      bd = d
      best = b
    }
  }
  return best
}

/**
 * 着いた時に本編で立つ場所と向き。
 * - 動物: 個体の今の位置から、ワールドの中心の側へ 4m（名前のピンが出る距離）。顔は動物へ
 * - 峠: となりのワールドの入口。顔はそのワールドの中心へ
 * - スポット: スポットの手前 2.5m（着いた扱いになる距離）
 */
export function arrivalOf(base: MapBase, animalAt: (id: string) => { x: number; z: number } | null): { x: number; z: number; heading: number } {
  const face = (from: { x: number; z: number }, to: { x: number; z: number }) => Math.atan2(to.x - from.x, to.z - from.z)
  if (base.kind === 'animal' && base.animalId) {
    const a = animalAt(base.animalId) ?? { x: base.x, z: base.z }
    const c = base.world === 'africa' && base.animalId !== 'riley' ? { x: 0, z: 30 } : worldCenter(base.world)
    for (const d of [4, 5, 6, 3.5]) {
      for (const turn of [0, 0.6, -0.6, 1.2, -1.2, Math.PI]) {
        const ang = Math.atan2(c.x - a.x, c.z - a.z) + turn
        const p = { x: a.x + Math.sin(ang) * d, z: a.z + Math.cos(ang) * d }
        if (isWalkable(p.x, p.z)) return { ...p, heading: face(p, a) }
      }
    }
    const p = { x: a.x + 4, z: a.z }
    clampToWalkable(p)
    return { ...p, heading: face(p, a) }
  }
  if (base.kind === 'pass' && base.to) {
    const p = base.to === 'africa' ? savannaMouth(base.world) : outerMouth(base.to)
    return { ...p, heading: face(p, worldCenter(base.to)) }
  }
  if (base.kind === 'trolley') {
    const st = TROLLEY_ROUTES.flatMap((r) => [r.a, r.b]).find((s) => s.region === base.world)
    if (st) return arrivalSpot(st)
  }
  if (base.kind === 'spot') {
    if (base.world === 'africa') return { x: SPOT.x, z: SPOT.z + 2.5, heading: Math.PI }
    const c = worldCenter(base.world)
    const p = onAxis({ x: c.x, z: c.z }, Math.hypot(c.x, c.z) - 3)
    return { ...p, heading: face(p, c) }
  }
  return { x: base.x, z: base.z, heading: base.world === 'africa' ? Math.PI : face(base, worldCenter(base.world)) }
}
