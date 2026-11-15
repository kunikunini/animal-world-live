/**
 * トロッコの駅（11/14、くにの案「島の配置は変えず、ワールドのあいだはトンネル。トロッコに乗って隣のワールドへ」）。
 * 駅は 11/15 からワールドに 1 つ（下の TROLLEY_STATIONS）。行き先は駅で 2 つから選ぶ。
 * 位置は 11/14 に、歩ける範囲（regions.ts の reachAt）の縁から内へ測って決めた定数（3D を作らないトロッコのモードでも、着く場所が分かるように）。
 * - x, z: トロッコ（3D の駅の車両）の位置。主人公はこの前で「トロッコにのる」を押す
 * - out: トンネルの奥へ向かう向き（three.js の rotation.y。向きのベクトルは (sin, cos)）
 */
export type TrolleyEnd = 'water' | 'sky' | 'north' | 'jungle' | 'south' | 'partner'

/** ワールドの名前（トロッコの画面・駅の看板・ボタン） */
export const TROLLEY_WORLD_NAME: Record<TrolleyEnd, { ja: string; en: string }> = {
  water: { ja: '水の世界', en: 'Water World' },
  sky: { ja: '空の世界', en: 'Sky World' },
  north: { ja: '北の世界', en: 'The North' },
  jungle: { ja: 'ジャングル', en: 'Jungle' },
  south: { ja: '南半球', en: 'Southern Lands' },
  partner: { ja: 'ふれあいワールド', en: 'Petting World' },
}

export interface TrolleyStation {
  region: TrolleyEnd
  x: number
  z: number
  out: number
}

export interface TrolleyRoute {
  id: string
  a: TrolleyStation
  b: TrolleyStation
}

const station = (region: TrolleyEnd, cx: number, cz: number, angleDeg: number, d: number): TrolleyStation => {
  const a = (angleDeg * Math.PI) / 180
  const dx = Math.cos(a)
  const dz = Math.sin(a)
  return { region, x: cx + dx * d, z: cz + dz * d, out: Math.atan2(dx, dz) }
}

const DIAG = 360 / Math.SQRT2

const C: Record<TrolleyEnd, [number, number]> = {
  water: [300, 0],
  sky: [-DIAG, -DIAG],
  north: [0, -300],
  jungle: [-300, 0],
  south: [0, 300],
  partner: [-DIAG, DIAG],
}
const at = (region: TrolleyEnd, angleDeg: number, d: number) => station(region, C[region][0], C[region][1], angleDeg, d)

/**
 * 駅はワールドに 1 つ（11/15 くに: 入口が 2 つあると、となりの世界の駅が見えて迷う。同じ所を出入り口にして 1 つに）。
 * 置き場所は、サバンナと反対の外側の縁（となりのワールドとの境目から離れ、となりの駅が見えない所）。
 * 11/15 に動いているワールドで、歩ける範囲の縁から 9m 内側・線路の下の地面の高さの差が 1m 未満・動物から 50m 以上・サバンナへの峠の道から 40m 以上の所を選んだ。
 * 水の世界の外側は海なので、歩ける範囲が短い（91m）
 */
export const TROLLEY_STATIONS: Readonly<Record<TrolleyEnd, TrolleyStation>> = {
  north: at('north', -110, 129),
  sky: at('sky', -130, 129),
  jungle: at('jungle', 187.5, 129),
  partner: at('partner', 140, 129),
  south: at('south', 95, 129),
  water: at('water', 0, 91),
}
const S = TROLLEY_STATIONS

/**
 * となりあうワールドを輪のようにつなぐ 6 本（北⇔空⇔ジャングル⇔ふれあい⇔南半球⇔水⇔北）。
 * 水⇔空は 11/15 にやめた（くに: 地図で北の世界を通りすぎて不自然。北⇔空があるので無くても輪はつながる）
 */
export const TROLLEY_ROUTES: readonly TrolleyRoute[] = [
  { id: 'north-sky', a: S.north, b: S.sky },
  { id: 'sky-jungle', a: S.sky, b: S.jungle },
  { id: 'jungle-partner', a: S.jungle, b: S.partner },
  { id: 'partner-south', a: S.partner, b: S.south },
  { id: 'south-water', a: S.south, b: S.water },
  { id: 'water-north', a: S.water, b: S.north },
]

/** その駅から行ける所（線と行き先） */
export function routesFrom(region: TrolleyEnd): Array<{ route: string; to: TrolleyStation }> {
  const out: Array<{ route: string; to: TrolleyStation }> = []
  for (const r of TROLLEY_ROUTES) {
    if (r.a.region === region) out.push({ route: r.id, to: r.b })
    else if (r.b.region === region) out.push({ route: r.id, to: r.a })
  }
  return out
}

/** 主人公が駅に立って「トロッコにのる」が出る距離（m） */
export const TROLLEY_REACH = 6

/** 着いた時に主人公が立つ所: トロッコの 9m 手前（ワールドの内側。「トロッコで ○○へ」が出ない所）で、ワールドの方を向く */
export function arrivalSpot(s: TrolleyStation): { x: number; z: number; heading: number } {
  return { x: s.x - Math.sin(s.out) * 9, z: s.z - Math.cos(s.out) * 9, heading: s.out + Math.PI }
}

export function routeFrom(id: string, from: string): { route: TrolleyRoute; from: TrolleyStation; to: TrolleyStation } | null {
  const route = TROLLEY_ROUTES.find((r) => r.id === id)
  if (!route) return null
  if (route.a.region === from) return { route, from: route.a, to: route.b }
  if (route.b.region === from) return { route, from: route.b, to: route.a }
  return null
}
