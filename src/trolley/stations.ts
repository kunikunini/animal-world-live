/**
 * トロッコの駅（11/14、くにの案「島の配置は変えず、ワールドのあいだはトンネル。トロッコに乗って隣のワールドへ」）。
 * 1 本目は 水の世界 ⇔ 空の世界（いちばん孤立していた組）。駅はワールドの歩ける範囲の縁の、峠・動物から離れた平らな所。
 * 位置は 11/14 に、歩ける範囲（regions.ts の reachAt）の縁から内へ測って決めた定数（3D を作らないトロッコのモードでも、着く場所が分かるように）。
 * - x, z: トロッコ（3D の駅の車両）の位置。主人公はこの前で「トロッコにのる」を押す
 * - out: トンネルの奥へ向かう向き（three.js の rotation.y。向きのベクトルは (sin, cos)）
 */
export type TrolleyEnd = 'water' | 'sky'

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

/** 水の世界（中心 300, 0）は北西の縁（225°、歩ける範囲 125m）。空の世界（中心 -254.6, -254.6）は北東の縁（300°、120m） */
export const TROLLEY_ROUTES: readonly TrolleyRoute[] = [
  {
    id: 'water-sky',
    a: station('water', 300, 0, 225, 116),
    b: station('sky', -DIAG, -DIAG, 300, 111),
  },
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
