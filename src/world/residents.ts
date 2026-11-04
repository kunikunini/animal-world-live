import { ANIMALS } from '../data/animals'
import { createLion } from './lions'
import type { Lion, LionOptions } from './lions'
import { createKangaroo } from './kangaroo'
import { OUTER_REGIONS } from './regions'

/**
 * サバンナ以外のワールドで 3D で会える子（D-32 ②: 代表の種から）。
 * 観察スポット（ワールドの中心）の奥に、サバンナから来た人の方を向けて伏せさせる。
 * 個体は種と名前で roster から引く（施設にいない子は置かない）。形は様式化した目印で、毛並みの再現ではない。
 */
interface Resident {
  species: string
  name: string
  kind: NonNullable<LionOptions['species']> | 'kangaroo'
  region: 'north' | 'jungle' | 'south'
  /** ワールドの中心からのずれ（m） */
  dx: number
  dz: number
  yaw: number
  size: number
}

const RESIDENTS: Resident[] = [
  // ジャングル: スポットの南東。日の当たる南東を向き、東から来た人には首を向ける
  { species: 'ベンガルトラ', name: 'ティガー', kind: 'tiger', region: 'jungle', dx: 3, dz: 8, yaw: 0.9, size: 1.08 },
  // 北の世界: 中心の北に 3 頭。南（サバンナ側）を向く
  { species: 'ホッキョクオオカミ', name: 'フェン', kind: 'wolf', region: 'north', dx: 5, dz: -7, yaw: -0.35, size: 0.86 },
  { species: 'ホッキョクオオカミ', name: 'ネガ', kind: 'wolf', region: 'north', dx: -5, dz: -9, yaw: 0.45, size: 0.82 },
  { species: 'ホッキョクオオカミ', name: 'マリ', kind: 'wolf', region: 'north', dx: 1, dz: -14, yaw: 0.05, size: 0.8 },
  // 南半球: 中心の南に 3 頭。北（サバンナ側）を向く（yaw π が -z）
  { species: 'オオカンガルー', name: 'ユウト', kind: 'kangaroo', region: 'south', dx: -5, dz: 7, yaw: Math.PI + 0.3, size: 1.05 },
  { species: 'オオカンガルー', name: 'シゲコ', kind: 'kangaroo', region: 'south', dx: 4, dz: 9, yaw: Math.PI - 0.4, size: 0.95 },
  { species: 'オオカンガルー', name: '順子', kind: 'kangaroo', region: 'south', dx: 0, dz: 14, yaw: Math.PI, size: 0.92 },
]

/** ほかのワールドの子を作る。返す形はライオンと同じなので、出会い・ピン・地図にそのまま乗る */
export function createResidents(): Lion[] {
  const out: Lion[] = []
  for (const r of RESIDENTS) {
    const animal = ANIMALS.find((a) => a.species === r.species && a.name === r.name)
    const region = OUTER_REGIONS.find((g) => g.key === r.region)
    if (!animal || !region) continue
    const at = { id: animal.id, x: region.x + r.dx, z: region.z + r.dz, yaw: r.yaw, size: r.size }
    out.push(r.kind === 'kangaroo' ? createKangaroo(at) : createLion({ ...at, species: r.kind }))
  }
  return out
}
