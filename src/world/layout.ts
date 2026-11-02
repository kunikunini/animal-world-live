// 世界の固定レイアウト。シードを固定して毎回同じサバンナにする。

export const WORLD_SEED = 20261102

/** 地形メッシュの一辺（m） */
export const TERRAIN_SIZE = 400
/** 地形メッシュの分割数 */
export const TERRAIN_SEGMENTS = 200
/** 歩ける範囲（原点からの半径, m） */
export const WALK_RADIUS = 120

export const SPAWN = { x: 0, z: 72 }

/** コピエ（岩山）。頂上の平らな部分が将来の観察スポット */
export const KOPJE = { x: 0, z: -48, radius: 20, height: 10 }

/** 水場 */
export const WATERHOLE = { x: 50, z: -4, radius: 11, depth: 1.6 }

/** 主要なアカシアの位置。スポーン〜コピエの視線上に並べる */
export const ACACIAS: ReadonlyArray<{ x: number; z: number; scale: number }> = [
  { x: -18, z: 36, scale: 1.1 },
  { x: 24, z: 22, scale: 0.95 },
  { x: -34, z: -8, scale: 1.25 },
  { x: 32, z: -44, scale: 1.0 },
  { x: -48, z: -56, scale: 1.15 },
  { x: 66, z: 36, scale: 0.9 },
  { x: -64, z: 18, scale: 1.05 },
  { x: 18, z: -84, scale: 1.2 },
  { x: -26, z: -98, scale: 1.0 },
  { x: 74, z: -72, scale: 1.1 },
  { x: -80, z: -26, scale: 0.95 },
  { x: 44, z: 78, scale: 1.0 },
  { x: -52, z: 70, scale: 0.9 },
  { x: 88, z: 2, scale: 1.05 },
  { x: -96, z: -70, scale: 1.0 },
  { x: 6, z: -118, scale: 1.1 },
]
