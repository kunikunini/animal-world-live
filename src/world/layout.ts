// 世界の固定レイアウト。シードを固定して毎回同じサバンナにする。

export const WORLD_SEED = 20261102

/** 地形メッシュの一辺（m） */
export const TERRAIN_SIZE = 400
/** 地形メッシュの分割数 */
export const TERRAIN_SEGMENTS = 240
/** 歩ける範囲（原点からの半径, m） */
export const WALK_RADIUS = 120

export const SPAWN = { x: 0, z: 72 }

/** コピエ（岩山）。頂上の平らな部分が将来の観察スポット */
export const KOPJE = { x: 0, z: -48, radius: 24, height: 10, plateau: 0.34 }

/** 観察スポット。コピエ台地の頂上。南側の斜面から歩いて登る */
export const SPOT = {
  x: KOPJE.x,
  z: KOPJE.z - 1,
  /** ここまで近づいたら「着いた」とみなす（m） */
  arriveRadius: 4.5,
  /** この観察スポットで会える個体（animals.json の id） */
  animalId: 'angie',
  /** 自動移動の経由点。南の登り口 */
  approach: { x: KOPJE.x, z: KOPJE.z + KOPJE.radius + 5 },
}

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

/** 様式化ライオンの配置（試作: アンジーだけ）。台地の上、観察スポットのそば */
export const LIONS: ReadonlyArray<{ id: string; x: number; z: number; yaw: number; mane?: boolean; cub?: boolean }> = [
  { id: 'angie', x: KOPJE.x - 3.6, z: KOPJE.z - 2.2, yaw: 0.55 },
]
