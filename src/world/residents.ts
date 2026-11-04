import { ANIMALS } from '../data/animals'
import { createLion } from './lions'
import type { Lion, LionOptions } from './lions'
import { createKangaroo } from './kangaroo'
import type { UprightVariant } from './kangaroo'
import { OUTER_REGIONS } from './regions'

/**
 * サバンナ以外のワールドで 3D で会える子（D-32 ②: 代表の種から）。
 * 観察スポット（ワールドの中心）の奥に、サバンナから来た人の方を向けて伏せさせる。
 * 個体は種と名前で roster から引く（施設にいない子は置かない）。形は様式化した目印で、毛並みの再現ではない。
 */
interface Resident {
  species: string
  /** 個体名。省略時は、その種のうち pick 番目（データの並び）の子 */
  name?: string
  pick?: number
  kind: NonNullable<LionOptions['species']> | UprightVariant
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
  // 北の世界の西側にキタキツネ 2 頭、東の岩陰にツキノワグマ、手前にプレーリードッグ
  { species: 'キタキツネ', pick: 0, kind: 'fox', region: 'north', dx: -11, dz: 1, yaw: 1.1, size: 0.55 },
  { species: 'キタキツネ', pick: 1, kind: 'fox', region: 'north', dx: -13, dz: -3, yaw: 0.8, size: 0.52 },
  { species: 'ツキノワグマ', pick: 0, kind: 'bear', region: 'north', dx: 12, dz: -2, yaw: -0.9, size: 1.0 },
  { species: 'プレーリードッグ', pick: 0, kind: 'prairie', region: 'north', dx: 6, dz: 9, yaw: 0.2, size: 0.34 },
  { species: 'プレーリードッグ', pick: 1, kind: 'prairie', region: 'north', dx: 7.2, dz: 9.6, yaw: -0.3, size: 0.32 },
  // 南半球: 東にパルマワラビー 2 頭、西にカピバラ 2 頭
  { species: 'パルマワラビー', pick: 0, kind: 'wallaby', region: 'south', dx: 11, dz: 3, yaw: Math.PI - 0.8, size: 0.62 },
  { species: 'パルマワラビー', pick: 1, kind: 'wallaby', region: 'south', dx: 13, dz: 6, yaw: Math.PI - 0.5, size: 0.58 },
  { species: 'カピバラ', pick: 0, kind: 'capybara', region: 'south', dx: -11, dz: 2, yaw: Math.PI - 2.2, size: 0.8 },
  { species: 'カピバラ', pick: 1, kind: 'capybara', region: 'south', dx: -12.5, dz: 4.5, yaw: Math.PI - 2.6, size: 0.74 },
  // ジャングル: スポットの南西にワオキツネザル 3 頭
  { species: 'ワオキツネザル', pick: 0, kind: 'lemur', region: 'jungle', dx: -5, dz: 10, yaw: 1.2, size: 0.42 },
  { species: 'ワオキツネザル', pick: 1, kind: 'lemur', region: 'jungle', dx: -7, dz: 8, yaw: 1.6, size: 0.4 },
  { species: 'ワオキツネザル', pick: 2, kind: 'lemur', region: 'jungle', dx: -4, dz: 13, yaw: 0.9, size: 0.38 },
]

/** ほかのワールドの子を作る。返す形はライオンと同じなので、出会い・ピン・地図にそのまま乗る */
export function createResidents(): Lion[] {
  const out: Lion[] = []
  for (const r of RESIDENTS) {
    const animal = r.name
      ? ANIMALS.find((a) => a.species === r.species && a.name === r.name)
      : ANIMALS.filter((a) => a.species === r.species)[r.pick ?? 0]
    const region = OUTER_REGIONS.find((g) => g.key === r.region)
    if (!animal || !region) continue
    const at = { id: animal.id, x: region.x + r.dx, z: region.z + r.dz, yaw: r.yaw, size: r.size }
    const upright: string[] = ['kangaroo', 'wallaby', 'prairie', 'lemur']
    out.push(
      upright.includes(r.kind)
        ? createKangaroo({ ...at, variant: r.kind as UprightVariant })
        : createLion({ ...at, species: r.kind as NonNullable<LionOptions['species']> }),
    )
  }
  return out
}
