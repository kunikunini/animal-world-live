// 世界の固定レイアウト。シードを固定して毎回同じサバンナにする。

export const WORLD_SEED = 20261102

/** 地形メッシュの一辺（m） */
export const TERRAIN_SIZE = 400
/** 地形メッシュの分割数 */
export const TERRAIN_SEGMENTS = 300
/** 歩ける範囲（原点からの半径, m） */
export const WALK_RADIUS = 120

export const SPAWN = { x: 0, z: 72 }

/**
 * コピエ（岩山）。頂上の平らな部分が観察スポット。
 * 南（+z）の登り口だけなだらかな坂で、それ以外は地層が段になった崖。
 */
export const KOPJE = {
  x: 0,
  z: -48,
  radius: 24,
  height: 10,
  plateau: 0.34,
  /** 崖の段数 */
  terraces: 4,
  /** 登り口の半角（ラジアン）。+z 方向を中心にこの角度までは坂 */
  rampHalfAngle: 0.26,
}

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

/**
 * 様式化ライオンの配置。
 * 台地の観察スポットのそばにアンジーと双子（クレア・カーラ）＝家族の場面。
 * アレックスは少し離れて台地の北東の縁に、ライリーは水場のそばの草むらに。
 * 毛色は参考写真から様式化した値（事実の記述ではない）。
 */
export interface LionPlacement {
  id: string
  x: number
  z: number
  yaw: number
  mane?: boolean
  cub?: boolean
  size?: number
  coat?: string
  maneColor?: string
  maneTopColor?: string
}

export const LIONS: ReadonlyArray<LionPlacement> = [
  // スポット（台地の中央）にいちばん近いのはアンジー。双子はその向こう側に
  { id: 'angie', x: KOPJE.x - 3.0, z: KOPJE.z - 2.6, yaw: 0.7, coat: '#d9a95f' },
  { id: 'carla', x: KOPJE.x - 5.2, z: KOPJE.z - 5.0, yaw: 1.3, cub: true, coat: '#e5bb70' },
  { id: 'claire', x: KOPJE.x - 6.6, z: KOPJE.z - 1.6, yaw: -0.2, cub: true, coat: '#e2b568' },
  { id: 'alex', x: KOPJE.x + 4.8, z: KOPJE.z - 5.2, yaw: -2.2, mane: true, size: 1.12, coat: '#cf9a52', maneColor: '#c3883c', maneTopColor: '#6e4222' },
  { id: 'riley', x: 40, z: 5, yaw: 1.7, size: 0.98, coat: '#dcb47c' },
]
