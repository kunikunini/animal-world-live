/**
 * トロッコの駅（11/14、くにの案「島の配置は変えず、ワールドのあいだはトンネル。トロッコに乗って隣のワールドへ」）。
 * 1 本目は 水の世界 ⇔ 空の世界（いちばん孤立していた組）。駅はワールドの歩ける範囲の縁の、峠・動物から離れた平らな所。
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
 * 1 本目: 水の世界は北西の縁（225°、歩ける範囲 125m）、空の世界は北東の縁（300°、120m）。
 * 2〜7 本目（11/14 くに「のこりのワールド同士もつなぐ」）: となりあうワールドを輪のようにつなぐ（北⇔空⇔ジャングル⇔ふれあい⇔南半球⇔水⇔北）。
 * 駅はとなりのワールドの向き（±30°）で、サバンナへの峠から 45° 以上離れ、線路の下の地面の高さの差が 1m 未満の所。
 * 歩ける範囲の縁から 9m 内側（動物とは 50m 以上離れている。11/14 に動いているワールドで測った）
 */
export const TROLLEY_ROUTES: readonly TrolleyRoute[] = [
  // 水⇔空は 11/15 にやめた（くに: 地図で北の世界を通りすぎて不自然。北⇔空があるので無くても輪はつながる）
  { id: 'north-sky', a: at('north', 150, 129), b: at('sky', 350, 129) },
  { id: 'sky-jungle', a: at('sky', 130, 117.5), b: at('jungle', 290, 129) },
  { id: 'jungle-partner', a: at('jungle', 80, 129), b: at('partner', 250, 128.5) },
  { id: 'partner-south', a: at('partner', 20, 129), b: at('south', 160, 117.5) },
  { id: 'south-water', a: at('south', 335, 117), b: at('water', 125, 117) },
  { id: 'water-north', a: at('water', 245, 117), b: at('north', 25, 117) },
]

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
