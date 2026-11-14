import type * as THREE from 'three'
import { ANIMALS } from '../data/animals'
import { createLion } from './lions'
import type { Lion, LionOptions } from './lions'
import { createKangaroo } from './kangaroo'
import type { UprightVariant } from './kangaroo'
import { createSloth } from './sloth'
import { createWaterfolk } from './waterfolk'
import { createFarmfolk } from './farmfolk'
import type { FarmKind } from './farmfolk'
import { GOAT_ROCKS, farmPens, terrainHeight } from './terrain'
import type { WaterfolkKind } from './waterfolk'
import { JUNGLE_PERCH, goatRockSupport, skyPerches } from './biomes'
import { createSkyfolk, mergeStatic } from './skyfolk'
import { createWildfolk } from './wildfolk'
import type { WildKind } from './wildfolk'
import type { Collider } from './props'
import { KOPJE, LIONS, SAVANNA_ZEBRA, WATERHOLE } from './layout'
import { isWalkable } from './regions'
import type { SkyKind, SkyLook } from './skyfolk'
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
  kind: NonNullable<LionOptions['species']> | UprightVariant | 'sloth' | WaterfolkKind
  /** ジャングルの止まり木の横枝の上（dx は幹からの距離。dz は使わない） */
  perch?: boolean
  region: 'north' | 'jungle' | 'south' | 'water'
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
  { species: 'マーラ', pick: 0, kind: 'mara', region: 'south', dx: -6, dz: 15, yaw: Math.PI - 0.3, size: 0.5 },
  { species: 'マーラ', pick: 1, kind: 'mara', region: 'south', dx: -8, dz: 13.5, yaw: Math.PI - 0.8, size: 0.48 },
  // ジャングル: スポットの南西にワオキツネザル 3 頭
  { species: 'ワオキツネザル', pick: 0, kind: 'lemur', region: 'jungle', dx: -5, dz: 10, yaw: 1.2, size: 0.42 },
  { species: 'ワオキツネザル', pick: 1, kind: 'lemur', region: 'jungle', dx: -7, dz: 8, yaw: 1.6, size: 0.4 },
  { species: 'ワオキツネザル', pick: 2, kind: 'lemur', region: 'jungle', dx: -4, dz: 13, yaw: 0.9, size: 0.38 },
  // ジャングルの止まり木: 枝の上にキンカジューとビントロング、枝の先にナマケモノがぶら下がる
  { species: 'キンカジュー', pick: 0, kind: 'kinkajou', region: 'jungle', perch: true, dx: 1.4, dz: 0, yaw: Math.PI / 2, size: 0.36 },
  { species: 'ビントロング', pick: 0, kind: 'binturong', region: 'jungle', perch: true, dx: 3.2, dz: 0, yaw: -Math.PI / 2, size: 0.48 },
  { species: 'フタユビナマケモノ', pick: 0, kind: 'sloth', region: 'jungle', perch: true, dx: 5.2, dz: 0, yaw: Math.PI / 2, size: 0.85 },
  // 水の世界: スポットの南東の浜の岩のそばにケープペンギン 6 羽。西（サバンナから来た人の側）を向く（yaw -π/2 が -x）
  { species: 'ケープペンギン', pick: 0, kind: 'penguin', region: 'water', dx: 6, dz: 7.5, yaw: -Math.PI / 2 - 0.3, size: 1.47 },
  { species: 'ケープペンギン', pick: 1, kind: 'penguin', region: 'water', dx: 7.6, dz: 9.4, yaw: -Math.PI / 2 + 0.2, size: 1.4 },
  { species: 'ケープペンギン', pick: 2, kind: 'penguin', region: 'water', dx: 5.2, dz: 10.6, yaw: -Math.PI / 2 - 0.6, size: 1.37 },
  { species: 'ケープペンギン', pick: 3, kind: 'penguin', region: 'water', dx: 9.2, dz: 7.2, yaw: -Math.PI / 2 + 0.5, size: 1.43 },
  { species: 'ケープペンギン', pick: 4, kind: 'penguin', region: 'water', dx: 8.4, dz: 11.8, yaw: -Math.PI + 0.4, size: 1.33 },
  { species: 'ケープペンギン', pick: 5, kind: 'penguin', region: 'water', dx: 10.6, dz: 10.0, yaw: -Math.PI / 2, size: 1.36 },
  // 潟の南西のふちにモモイロペリカン 3 羽（1 羽はくるぶしほどの浅瀬に立つ）
  { species: 'モモイロペリカン', pick: 0, kind: 'pelican', region: 'water', dx: 6.2, dz: -4.2, yaw: -Math.PI / 2 + 0.4, size: 1.15 },
  { species: 'モモイロペリカン', pick: 1, kind: 'pelican', region: 'water', dx: 11.2, dz: -4.6, yaw: -Math.PI / 2 - 0.2, size: 1.1 },
  { species: 'モモイロペリカン', pick: 2, kind: 'pelican', region: 'water', dx: 9.4, dz: -8.6, yaw: -2.4, size: 1.08 },
  // 潟の北西の岸にコツメカワウソ 3 頭が寄り添って伏せる
  { species: 'コツメカワウソ', name: 'ハルト', kind: 'otter', region: 'water', dx: -1.2, dz: -11.4, yaw: -Math.PI / 2 + 0.7, size: 1.56 },
  { species: 'コツメカワウソ', name: 'ケント', kind: 'otter', region: 'water', dx: 0.4, dz: -13.2, yaw: -Math.PI / 2 + 0.2, size: 1.49 },
  { species: 'コツメカワウソ', name: 'ミナト', kind: 'otter', region: 'water', dx: -2.6, dz: -13.6, yaw: -Math.PI / 2 + 1.1, size: 1.46 },
]

/**
 * ふれあいワールドの子（D-32 ②のあと、デモ用に追加）。中心からの向きは、峠（原点）の向きを 0 として測る。
 * ヤギはヤギの岩場の段（rocks: 入り口の向きからの角度・岩場の半径に対する割合）と入り口の前の草地、
 * ポニーとヒツジは左右の放牧場の中（pen: 放牧場の番号・中心からのずれ m）、犬とブタは広場のまわり（plaza: 角度・距離）。
 * 向きは、岩場と放牧場の子は入り口（広場）の方、広場の子は峠から来た人の方。ギープはヒツジの放牧場にヒツジの形で置く（生成モデルに差し替える）
 */
interface FarmResident {
  species: string
  pick: number
  kind: FarmKind
  size: number
  rocks?: [number, number]
  pen?: [number, number, number]
  plaza?: [number, number]
  /** 向きのずらし（ラジアン） */
  turn?: number
}
const FARM_RESIDENTS: FarmResident[] = [
  { species: 'ヤギ', pick: 0, kind: 'goat', size: 1.15, rocks: [Math.PI, 0.02] },
  { species: 'ヤギ', pick: 1, kind: 'goat', size: 1.1, rocks: [0.9, 0.36], turn: 0.4 },
  { species: 'ヤギ', pick: 2, kind: 'goat', size: 1.12, rocks: [-1.3, 0.34], turn: -0.5 },
  { species: 'ヤギ', pick: 3, kind: 'goat', size: 1.05, rocks: [2.3, 0.6], turn: 0.8 },
  { species: 'ヤギ', pick: 4, kind: 'goat', size: 1.1, rocks: [-2.4, 0.62], turn: -0.6 },
  { species: 'ヤギ', pick: 5, kind: 'goat', size: 1.08, rocks: [0.55, 0.78], turn: 0.3 },
  { species: 'ヤギ', pick: 6, kind: 'goat', size: 1.05, rocks: [-0.45, 1.22] },
  { species: 'ヤギ', pick: 7, kind: 'goat', size: 1.0, rocks: [0.2, 1.36], turn: 0.9 },
  { species: 'ポニー', pick: 0, kind: 'pony', size: 1.1, pen: [0, -3, 2] },
  { species: 'ポニー', pick: 1, kind: 'pony', size: 1.05, pen: [0, 2.5, -2], turn: 0.5 },
  { species: 'ポニー', pick: 2, kind: 'pony', size: 1.0, pen: [0, 4, 4], turn: -0.6 },
  { species: 'ヒツジ', pick: 0, kind: 'sheep', size: 1.15, pen: [2, -2.5, 1.5] },
  { species: 'ヒツジ', pick: 1, kind: 'sheep', size: 1.1, pen: [2, -0.5, -1.8], turn: 0.4 },
  { species: 'ヒツジ', pick: 2, kind: 'sheep', size: 1.12, pen: [2, 1.8, 0.6], turn: -0.3 },
  { species: 'ヒツジ', pick: 3, kind: 'sheep', size: 1.05, pen: [2, 0.6, 3.0], turn: 0.7 },
  // ギープ（レア）: 写真が無いので、ヒツジの放牧場の空いた所にヒツジの形で置き、生成モデル（一般的なギープの姿）に差し替える（main.ts）
  { species: 'ギープ', pick: 0, kind: 'sheep', size: 1.1, pen: [2, -2.4, -3.6], turn: 0.2 },
  { species: 'セントバーナード', pick: 0, kind: 'stbernard', size: 1.15, plaza: [0.95, 7] },
  { species: 'ボーダーコリー', pick: 0, kind: 'collie', size: 1.15, plaza: [-1.3, 7] },
  { species: 'ピレネーシェパード', pick: 0, kind: 'pyrenean', size: 1.2, plaza: [-1.75, 9.5] },
  { species: 'ホットベリーピック（ブタ）', pick: 0, kind: 'pig', size: 1.2, plaza: [1.95, 11] },
]

/** 坂に沿って体を前後に傾けてよい角度（rad） */
const MAX_PITCH = 0.3

/**
 * (x, z) から reach m 以内で、向き yaw の体（前後 ±half、左右 ±side）の 4 本の足の下（support の高さ）がいちばんそろう所。
 * 前後の差は体を傾けて合わせ（MAX_PITCH まで）、左右の差は合わせられないので小さい所を選ぶ。
 * y は体の中心の高さ（前足・後ろ足それぞれの高い方の平均。どの足も潜らない）、pitch は rotation.x（正で頭が下がる）
 */
function flattestSpot(
  x: number,
  z: number,
  yaw: number,
  half: number,
  side: number,
  reach: number,
  support: (x: number, z: number) => number,
  ok: (x: number, z: number) => boolean = () => true,
): { x: number; z: number; y: number; pitch: number } {
  const fx = Math.sin(yaw)
  const fz = Math.cos(yaw)
  const at = (px: number, pz: number, f: number, s: number) => support(px + fx * f + fz * s, pz + fz * f - fx * s)
  const maxRise = 2 * half * Math.tan(MAX_PITCH)
  let best = { x, z, y: support(x, z), pitch: 0, score: Infinity }
  for (let k = 0; k < 120; k++) {
    // 元の場所から金角で外へ。同じくらいなら近い方
    const rr = reach * Math.sqrt(k / 120)
    const a = k * 2.39996
    const px = x + Math.cos(a) * rr
    const pz = z + Math.sin(a) * rr
    if (k > 0 && !ok(px, pz)) continue
    const fl = at(px, pz, half, side)
    const fr = at(px, pz, half, -side)
    const bl = at(px, pz, -half, side)
    const br = at(px, pz, -half, -side)
    const front = Math.max(fl, fr)
    const back = Math.max(bl, br)
    const tilt = Math.max(-maxRise, Math.min(maxRise, back - front))
    const score = Math.max(Math.abs(fl - fr), Math.abs(bl - br)) + Math.abs(back - front - tilt) + Math.abs(tilt) * 0.15 + rr * 0.02
    if (score < best.score) {
      // 傾けきれない分は、高い方の足に合わせて持ち上げる
      const y = (front + back) / 2 + Math.abs(back - front - tilt) / 2
      best = { x: px, z: pz, y, pitch: Math.atan2(tilt, 2 * half), score }
    }
  }
  return best
}

function createFarmResidents(out: Lion[]): void {
  const region = OUTER_REGIONS.find((g) => g.key === 'partner')
  if (!region) return
  const a0 = Math.atan2(-region.z, -region.x)
  const pens = farmPens()
  const faceTo = (fx: number, fz: number) => Math.atan2(fx, fz)
  // 岩場のヤギどうしは重ならず、岩山のてっぺんから柱へ渡す橋の上と両端（主人公の通り道）はあける
  const rockGoats: Array<{ x: number; z: number }> = []
  const gx0 = region.x + GOAT_ROCKS.dx
  const gz0 = region.z + GOAT_ROCKS.dz
  const side = GOAT_ROCKS.gate + Math.PI / 2
  const goatPen = pens[1]
  const clearForGoat = (px: number, pz: number) => {
    if (rockGoats.some((g) => Math.hypot(g.x - px, g.z - pz) < 1.8)) return false
    // 柵（ヤギの放牧場）の内側 1.6m まで、橋の先の岩の柱（半径 1.9m）から 2.6m 離す
    if (Math.hypot(px - region.x - goatPen.x, pz - region.z - goatPen.z) > goatPen.r - 1.6) return false
    if (Math.hypot(px - gx0 - Math.cos(side) * 12.5, pz - gz0 - Math.sin(side) * 12.5) < 2.6) return false
    const along = (px - gx0) * Math.cos(side) + (pz - gz0) * Math.sin(side)
    const across = -(px - gx0) * Math.sin(side) + (pz - gz0) * Math.cos(side)
    return !(along > 1.5 && along < 14.5 && Math.abs(across) < 1.6)
  }
  for (const r of FARM_RESIDENTS) {
    const animal = ANIMALS.filter((a) => a.species === r.species)[r.pick]
    if (!animal) continue
    let x = region.x
    let z = region.z
    let yaw = 0
    let lift = 0
    if (r.rocks) {
      // 岩場の段の上（入り口の前の草地は持ち上げない）
      lift = r.rocks[1] < 1.05 ? 0.2 : 0
      const a = GOAT_ROCKS.gate + r.rocks[0]
      x += GOAT_ROCKS.dx + Math.cos(a) * GOAT_ROCKS.radius * r.rocks[1]
      z += GOAT_ROCKS.dz + Math.sin(a) * GOAT_ROCKS.radius * r.rocks[1]
      yaw = faceTo(Math.cos(GOAT_ROCKS.gate), Math.sin(GOAT_ROCKS.gate))
    } else if (r.pen) {
      const p = pens[r.pen[0]]
      x += p.x + r.pen[1]
      z += p.z + r.pen[2]
      yaw = faceTo(Math.cos(p.gate), Math.sin(p.gate))
    } else if (r.plaza) {
      const a = a0 + r.plaza[0]
      x += Math.cos(a) * r.plaza[1]
      z += Math.sin(a) * r.plaza[1]
      yaw = faceTo(Math.cos(a0), Math.sin(a0))
    }
    if (r.rocks && r.rocks[1] < 1.05) {
      // 岩山の急な坂や板の岩の縁では、前足と後ろ足の下の高さが 0.5〜1m ちがい、足が宙に浮いて見えた（11/14 くに「動物が浮いて見える」）。
      // 近く（4m 以内）で 4 本の足の下（地面と板の岩の上面）がいちばんそろう所へ寄せ、足の下でいちばん高い所に立たせる（どの足も岩に潜らない）
      // 坂では体を前後に少し傾けて、前足と後ろ足の両方を着ける
      const fit = flattestSpot(x, z, yaw + (r.turn ?? 0), 0.5 * r.size, 0.2 * r.size, 4, goatRockSupport, clearForGoat)
      x = fit.x
      z = fit.z
      rockGoats.push({ x, z })
      lift = fit.y - terrainHeight(x, z) + 0.02
      const goat = createFarmfolk({ id: animal.id, kind: r.kind, x, z, yaw: yaw + (r.turn ?? 0), size: r.size, lift })
      goat.group.rotation.order = 'YXZ'
      goat.group.rotation.x = fit.pitch
      out.push(goat)
      continue
    }
    out.push(createFarmfolk({ id: animal.id, kind: r.kind, x, z, yaw: yaw + (r.turn ?? 0), size: r.size, lift }))
  }
}

/**
 * 空の世界の鳥（名簿の 27 種 39 羽すべて）。種ごとに組み方（kind）・色（look）・大きさを決め、
 * 止まり木の列（biomes.ts の skyPerches）に名簿の並びで順に置く。小さい種は見つけやすいよう本物より大きめ。
 * 色は種の目印で、個体の羽色の再現ではない
 */
interface SkySpecies {
  kind: SkyKind
  perch: 'hawk' | 'owl' | 'parrot' | 'vulture'
  size: number
  look: SkyLook
}
const BEAK_DARK = '#3a3438'
const BEAK_PALE = '#e8dcc4'
const SKY_SPECIES: Record<string, SkySpecies> = {
  // インコ・オウム
  ベニコンゴウインコ: { kind: 'parrot', perch: 'parrot', size: 1.35, look: { body: '#d8342c', belly: '#d8342c', wing: '#2f8a4a', accent: '#2a64c8', tail: '#c8302a', face: '#f4ece4', beak: BEAK_PALE, longTail: true } },
  ヒメコンゴウインコ: { kind: 'parrot', perch: 'parrot', size: 1.0, look: { body: '#3faa4a', belly: '#5cbc5a', wing: '#2f9442', accent: '#d8342c', face: '#f4ece4', beak: BEAK_DARK, longTail: true } },
  タイハクオウム: { kind: 'parrot', perch: 'parrot', size: 1.2, look: { body: '#f6f4ee', belly: '#ffffff', crest: '#ffffff', beak: BEAK_DARK } },
  キバタン: { kind: 'parrot', perch: 'parrot', size: 1.2, look: { body: '#f6f4ee', belly: '#ffffff', crest: '#ffd84a', beak: BEAK_DARK } },
  ヨウム: { kind: 'parrot', perch: 'parrot', size: 1.05, look: { body: '#8c9096', belly: '#a2a6ac', wing: '#7a7e84', tail: '#d8342c', face: '#dcdee2', beak: BEAK_DARK } },
  オカメインコ: { kind: 'parrot', perch: 'parrot', size: 0.85, look: { body: '#8c8c92', belly: '#9a9aa0', wing: '#7c7c82', accent: '#f4f2ec', head: '#f4dc6a', crest: '#f4dc6a', cheek: '#f08a3a', beak: '#9a9aa0', longTail: true } },
  // フクロウ（耳のような羽角があるのはミミズク・コノハズク）
  メンフクロウ: { kind: 'owl', perch: 'owl', size: 1.15, look: { body: '#d8ae72', belly: '#f6efe2', face: '#fbf8f2', rim: '#c89a62', beak: BEAK_PALE } },
  アカアシモリフクロウ: { kind: 'owl', perch: 'owl', size: 1.1, look: { body: '#7a5236', belly: '#c89a6e', face: '#b88a5e', rim: '#5a3a24', beak: '#e8c860' } },
  モリフクロウ: { kind: 'owl', perch: 'owl', size: 1.05, look: { body: '#8a5e3a', belly: '#c8a072', face: '#c49a6c', rim: '#6a4428', beak: BEAK_PALE } },
  ナンベイヒナフクロウ: { kind: 'owl', perch: 'owl', size: 0.95, look: { body: '#6a4a32', belly: '#d8bc94', face: '#a8805a', rim: '#4a3020', beak: BEAK_PALE } },
  オオフクロウ: { kind: 'owl', perch: 'owl', size: 1.3, look: { body: '#5e4030', belly: '#d8b88a', face: '#c8a272', rim: '#3e2a1e', beak: BEAK_PALE } },
  ウラルフクロウ: { kind: 'owl', perch: 'owl', size: 1.2, look: { body: '#bcb4a6', belly: '#e8e2d6', face: '#e4ded2', rim: '#8a8274', beak: '#e8c860' } },
  ベンガルワシミミズク: { kind: 'owl', perch: 'owl', size: 1.4, look: { body: '#a07a52', belly: '#e2c89c', face: '#c8a676', rim: '#5a3e28', iris: '#ff9a1f', beak: BEAK_DARK, tufts: true } },
  ユーラシアワシミミズク: { kind: 'owl', perch: 'owl', size: 1.5, look: { body: '#9a6e44', belly: '#dcb684', face: '#c09a6a', rim: '#4a3220', iris: '#ff8a1a', beak: BEAK_DARK, tufts: true } },
  ワシミミズク: { kind: 'owl', perch: 'owl', size: 1.4, look: { body: '#8a6a4a', belly: '#e6d4b6', face: '#c8915a', rim: '#3e2c1e', iris: '#ffd030', beak: BEAK_DARK, tufts: true } },
  クロワシミミズク: { kind: 'owl', perch: 'owl', size: 1.45, look: { body: '#b4aca0', belly: '#ece6dc', face: '#e6e0d6', rim: '#5a524a', beak: BEAK_PALE, tufts: true } },
  'ベンガル×ワシミミズク': { kind: 'owl', perch: 'owl', size: 1.4, look: { body: '#946e48', belly: '#e0c294', face: '#c4a070', rim: '#4e3624', iris: '#ff9a1f', beak: BEAK_DARK, tufts: true } },
  アビシニアンワシミミズク: { kind: 'owl', perch: 'owl', size: 1.25, look: { body: '#7a5a40', belly: '#d6bc98', face: '#bc9c78', rim: '#4a3424', iris: '#f08a2a', beak: BEAK_DARK, tufts: true } },
  アフリカワシミミズク: { kind: 'owl', perch: 'owl', size: 1.15, look: { body: '#a0907e', belly: '#e8dccb', face: '#d8ccbc', rim: '#5a4a3c', iris: '#ffd030', beak: BEAK_DARK, tufts: true } },
  アフリカオオコノハズク: { kind: 'owl', perch: 'owl', size: 0.95, look: { body: '#9c9690', belly: '#e0dcd6', face: '#fbfaf6', rim: '#26242a', iris: '#ff8a1a', beak: BEAK_PALE, tufts: true } },
  インドオオコノハズク: { kind: 'owl', perch: 'owl', size: 0.9, look: { body: '#a08262', belly: '#d8c4a4', face: '#c8b08c', rim: '#5a4430', iris: '#e87a2a', beak: BEAK_PALE, tufts: true } },
  スピックスコノハズク: { kind: 'owl', perch: 'owl', size: 0.85, look: { body: '#8a7a68', belly: '#d6ccbc', face: '#c4b8a6', rim: '#3e3428', iris: '#ffd030', beak: BEAK_PALE, tufts: true } },
  コキンメフクロウ: { kind: 'owl', perch: 'owl', size: 0.85, look: { body: '#8a6e52', belly: '#e6d8c2', face: '#d8c8b0', rim: '#6a5038', iris: '#ffd84a', beak: '#c8b878' } },
  // タカ・ハヤブサ
  ハリスホーク: { kind: 'hawk', perch: 'hawk', size: 1.3, look: { body: '#3e2a20', belly: '#4a3226', accent: '#a04a24', tail: '#2e2018', iris: '#4a2a14', beak: BEAK_DARK } },
  ワシノスリ: { kind: 'hawk', perch: 'hawk', size: 1.5, look: { body: '#3c4048', belly: '#ece8e0', wing: '#5a5e68', tail: '#3a3c42', head: '#3c4048', beak: BEAK_DARK } },
  ラナーハヤブサ: { kind: 'hawk', perch: 'hawk', size: 1.1, look: { body: '#7a7e88', belly: '#f0e2ca', wing: '#6a6e78', head: '#c47a4a', face: '#3a3438', beak: '#3a4a6a' } },
  // コンドル
  ヒメコンドル: { kind: 'vulture', perch: 'vulture', size: 1.5, look: { body: '#2e2622', belly: '#3a302a', wing: '#2a2420', accent: '#8a8078', head: '#c8443a', beak: BEAK_PALE } },
}

function createSkyResidents(out: Lion[]): void {
  const perches = skyPerches()
  const used = { hawk: 0, owl: 0, parrot: 0, vulture: 0 }
  for (const animal of ANIMALS) {
    if (animal.world !== 'sky') continue
    const sp = SKY_SPECIES[animal.species]
    if (!sp) continue
    const p = perches[sp.perch][used[sp.perch]++]
    if (!p) continue
    // 止まり木の上で見つけやすいよう、どの種も 1.4 倍（水の世界のペンギンと同じくらいの見え方）
    out.push(createSkyfolk({ id: animal.id, kind: sp.kind, look: sp.look, x: p.x, y: p.y, z: p.z, yaw: p.face, size: sp.size * 1.4 }))
  }
}

/**
 * 名簿のうち、上の表でまだ置いていない子（2026-11-06、全個体を置く）。種ごとに集まる場所（anchor、ワールドの中心からのずれ。
 * サバンナは原点から）と広がり（spread）を決め、残りの子を名簿の並びで、木や岩の当たり判定・ほかの子・観察スポットを避けた空き地へ置く。
 * 向きはワールドの中心（観察スポット）の方。形は既存の目印（オオカミ・キツネ・クマ・カンガルーなど。ハスキー・ギンギツネ・アカカンガルー・
 * ミーアキャット・ウッドチャックは毛色だけ変えた近い形）と、wildfolk.ts の新しい目印。ギープは形の手がかりが無いので、ここでも置かない
 */
type Make = (at: { id: string; x: number; z: number; yaw: number; size: number }) => Lion
const lionLike = (species: NonNullable<LionOptions['species']>, coat?: string): Make => (at) => createLion({ ...at, species, coat })
const upright = (variant: UprightVariant, coat?: string): Make => (at) => createKangaroo({ ...at, variant, coat })
const wild = (kind: WildKind): Make => (at) => createWildfolk({ ...at, kind })
interface Extra {
  species: string
  region: 'africa' | 'north' | 'jungle' | 'south' | 'water' | 'partner'
  at: [number, number]
  spread: number
  size: number
  make: Make
}
const EXTRA: Extra[] = [
  // サバンナ（原点から）。11/6 の iPhone 実機テストで「一か所に集まりすぎ・名前の札が重なる」ので、群れ（同じ種）はまとめたまま、
  // 違う種の群れと 1 頭の子は、地形と目印（木・水場・コピエの麓）に沿って互いに 30m ほど離す。ライオンの家族（コピエの台地）とライリー（水場）はそのまま。
  // スポーンからライリーへの見通し（南東）と、コピエへの登り道はふさがない
  // - ミーアキャットの群れ: スポーンの北西の草地（最初に出会える）。巣穴のまわりに少し広く
  { species: 'ミーアキャット', region: 'africa', at: [-20, 48], spread: 5, size: 0.38, make: upright('prairie', '#cdb48e') },
  // - ハイエナの群れ: 西の草原、アカシア（-64, 18）の北
  { species: 'ブチハイエナ', region: 'africa', at: [-62, 34], spread: 4, size: 1.1, make: wild('hyena') },
  // - ラーテル: 南東のアカシア（44, 78）の根もと
  { species: 'ラーテル', region: 'africa', at: [50, 72], spread: 1, size: 1.1, make: wild('ratel') },
  // - スナネコ: 南西のアカシア（-52, 70）のかげ
  { species: 'スナネコ', region: 'africa', at: [-46, 75], spread: 1, size: 1.3, make: wild('sandcat') },
  // - リクガメ: 3 種を分ける。アルダブラは水場の東の岸、ケヅメは東の草原（アカシア 88, 2 の南）、パンケーキはコピエの東の麓の岩場
  { species: 'アルダブラゾウガメ', region: 'africa', at: [70, 16], spread: 1, size: 1.6, make: wild('aldabra') },
  { species: 'ケヅメリクガメ', region: 'africa', at: [82, -24], spread: 3, size: 1.0, make: wild('sulcata') },
  { species: 'パンケーキリクガメ', region: 'africa', at: [34, -60], spread: 1.5, size: 0.6, make: wild('pancake') },
  // ジャングル
  { species: 'ワオキツネザル', region: 'jungle', at: [-8, 12], spread: 4, size: 0.4, make: upright('lemur') },
  { species: 'キンカジュー', region: 'jungle', at: [11, -5], spread: 4, size: 0.36, make: lionLike('kinkajou') },
  { species: 'ビントロング', region: 'jungle', at: [10, -13], spread: 2, size: 0.48, make: lionLike('binturong') },
  { species: 'アカハナグマ', region: 'jungle', at: [-11, -4], spread: 3.5, size: 1.2, make: wild('coati') },
  // - アメリカバク: 前は [-3, -13] で、大きな木の樹冠の影にずっと入って目立たなかった（11/8 くにの指示）。南へ寄せて、歩き回る半径 6 m がまるごと日なたになる所に
  { species: 'アメリカバク', region: 'jungle', at: [-3, -8.3], spread: 1, size: 1.0, make: wild('tapir') },
  { species: 'コモンリスザル', region: 'jungle', at: [13, 4], spread: 1, size: 1.8, make: wild('squirrelmonkey') },
  // - コモンマーモセット: 前は [14, 8] で、シダの株（0.4 m 先）に体が隠れていた（11/13 くにの指示）。まわり 2.5 m にシダの無い北へ 3.5 m（ワールドの m で）寄せる
  { species: 'コモンマーモセット', region: 'jungle', at: [14.4, 9.35], spread: 1, size: 1.9, make: wild('marmoset') },
  { species: 'スローロリス', region: 'jungle', at: [15, 0], spread: 1, size: 1.9, make: wild('loris') },
  { species: 'シャムワニ', region: 'jungle', at: [-15, 6], spread: 1, size: 1.3, make: wild('croc') },
  { species: 'メガネカイマン', region: 'jungle', at: [-15, 11], spread: 1, size: 1.0, make: wild('caiman') },
  { species: 'ビルマニシキヘビ', region: 'jungle', at: [6, 15], spread: 2.5, size: 1.2, make: wild('python') },
  // 北の世界
  { species: 'ホッキョクオオカミ', region: 'north', at: [0, -12], spread: 6, size: 0.82, make: lionLike('wolf') },
  { species: 'シベリアンハスキー', region: 'north', at: [-8, 10], spread: 4, size: 0.74, make: lionLike('wolf', '#8a929e') },
  { species: 'ツキノワグマ', region: 'north', at: [14, 3], spread: 1, size: 0.95, make: lionLike('bear') },
  { species: 'ギンギツネ', region: 'north', at: [-14, 5], spread: 1, size: 0.55, make: lionLike('fox', '#4a4a54') },
  { species: 'ホンドタヌキ', region: 'north', at: [-9, -12], spread: 1, size: 1.2, make: wild('tanuki') },
  { species: 'ウッドチャック', region: 'north', at: [10, 11], spread: 1, size: 0.5, make: upright('prairie', '#86643f') },
  { species: 'プレーリードッグ', region: 'north', at: [5.6, 10.8], spread: 1, size: 0.32, make: upright('prairie') },
  { species: 'ヤマアラシ', region: 'north', at: [12, -8], spread: 1, size: 1.2, make: wild('porcupine') },
  { species: 'アメリカビーバー', region: 'north', at: [15, -4], spread: 1, size: 1.2, make: wild('beaver') },
  { species: 'ニホンザル', region: 'north', at: [-3, 14], spread: 1, size: 1.5, make: wild('macaque') },
  // 南半球
  { species: 'オオカンガルー', region: 'south', at: [2, 12], spread: 5, size: 0.95, make: upright('kangaroo') },
  { species: 'アカカンガルー', region: 'south', at: [8, 14], spread: 1, size: 1.0, make: upright('kangaroo', '#b8643c') },
  { species: 'パルマワラビー', region: 'south', at: [13, 9], spread: 3, size: 0.6, make: upright('wallaby') },
  { species: 'カピバラ', region: 'south', at: [-13, 7], spread: 1, size: 0.76, make: lionLike('capybara') },
  { species: 'マーラ', region: 'south', at: [-9, 16], spread: 3, size: 0.49, make: lionLike('mara') },
  // 水の世界: 潟のふちのペリカンのそば
  { species: 'モモイロペリカン', region: 'water', at: [8, -6.5], spread: 1.5, size: 1.1, make: (at) => createWaterfolk({ ...at, kind: 'pelican' }) },
]

/**
 * ジャングル・北の世界・南半球の群れの拠点を、観察スポットから外へ広げる（11/6 の iPhone 実機テスト: スポットのまわり 15m に 30 頭ほどが集まり、名前の札が重なっていた）。
 * 群れ（同じ種）は形を変えずに丸ごと動かす: 拠点（その種の RESIDENTS の重心、無ければ EXTRA の at）を SPREAD 倍の距離へ。
 * ワールドの代表（ティガー・オオカミ・オオカンガルー）と、止まり木の子は動かさない（スポットのそばで出会える）
 */
type SpreadRegion = Extra['region']
const SPREAD: Partial<Record<SpreadRegion, number>> = { jungle: 2.6, north: 2.6, south: 2.6 }
const STAY_NEAR_SPOT = new Set(['ベンガルトラ', 'ホッキョクオオカミ', 'オオカンガルー'])

/** その種の群れを動かす量（ワールドの中心からのずれに足す m） */
export function groupShift(region: SpreadRegion, species: string): { dx: number; dz: number } {
  const k = SPREAD[region]
  if (!k || STAY_NEAR_SPOT.has(species)) return { dx: 0, dz: 0 }
  const own = RESIDENTS.filter((r) => r.region === region && r.species === species && !r.perch)
  let cx: number
  let cz: number
  if (own.length > 0) {
    cx = own.reduce((a, r) => a + r.dx, 0) / own.length
    cz = own.reduce((a, r) => a + r.dz, 0) / own.length
  } else {
    const e = EXTRA.find((x) => x.region === region && x.species === species)
    if (!e) return { dx: 0, dz: 0 }
    ;[cx, cz] = e.at
  }
  return { dx: cx * (k - 1), dz: cz * (k - 1) }
}

/**
 * 生成モデルが読めた時だけ置く子の場所（main.ts の place）: その種の群れの拠点（動かした後）から、ワールドの中心の方へ toward m。
 * 群れの子と同じ所で出会えるように。ワールドの座標で返す
 */
export function residentPlace(region: SpreadRegion, species: string, toward = 1.5): { x: number; z: number } {
  const center = OUTER_REGIONS.find((g) => g.key === region) ?? { x: 0, z: 0 }
  const own = RESIDENTS.filter((r) => r.region === region && r.species === species && !r.perch)
  const e = EXTRA.find((x) => x.region === region && x.species === species)
  const base = own.length > 0 ? { dx: own.reduce((a, r) => a + r.dx, 0) / own.length, dz: own.reduce((a, r) => a + r.dz, 0) / own.length } : e ? { dx: e.at[0], dz: e.at[1] } : { dx: 0, dz: 0 }
  const s = groupShift(region, species)
  const ax = base.dx + s.dx
  const az = base.dz + s.dz
  const d = Math.hypot(ax, az) || 1
  return { x: center.x + ax - (ax / d) * toward, z: center.z + az - (az / d) * toward }
}

/** EXTRA の子を、当たり判定を避けた空き地へ置く */
function createExtraResidents(out: Lion[], colliders: Collider[]): void {
  const placedIds = new Set(out.map((l) => l.id))
  for (const l of LIONS) placedIds.add(l.id)
  // 置いた子（と、サバンナのライオン・グラン）の場所と半径
  const bodies: Array<{ x: number; z: number; r: number }> = out.map((l) => ({ x: l.position.x, z: l.position.z, r: l.collider.r }))
  for (const l of LIONS) bodies.push({ x: l.x, z: l.z, r: 1.4 })
  // シマウマのグラン（生成モデルが読めた時だけ main.ts で置く）の場所をあけておく
  bodies.push({ x: SAVANNA_ZEBRA.x, z: SAVANNA_ZEBRA.z, r: 2 })
  const free = (x: number, z: number, r: number, cx: number, cz: number, africa: boolean) => {
    if (!isWalkable(x, z)) return false
    if (africa) {
      if (Math.hypot(x - KOPJE.x, z - KOPJE.z) < KOPJE.radius + 3) return false
      if (Math.hypot(x - WATERHOLE.x, z - WATERHOLE.z) < WATERHOLE.radius + 1.5) return false
    } else if (Math.hypot(x - cx, z - cz) < 4) return false
    for (const c of colliders) if (Math.hypot(x - c.x, z - c.z) < c.r + r + 0.4) return false
    for (const b of bodies) if (Math.hypot(x - b.x, z - b.z) < b.r + r + 0.35) return false
    return true
  }
  for (const e of EXTRA) {
    const region = e.region === 'africa' ? { x: 0, z: 0 } : OUTER_REGIONS.find((g) => g.key === e.region)
    if (!region) continue
    const left = ANIMALS.filter((a) => a.species === e.species && !placedIds.has(a.id))
    const shift = e.region === 'africa' ? { dx: 0, dz: 0 } : groupShift(e.region, e.species)
    const ax = region.x + e.at[0] + shift.dx
    const az = region.z + e.at[1] + shift.dz
    const r = Math.max(0.3, 0.45 * e.size)
    left.forEach((animal, i) => {
      // 金角で広げていき、空いた所が見つかるまで少しずつ外へ
      let x = ax
      let z = az
      for (let k = 0; k < 80; k++) {
        const n = i + k * left.length
        const rr = e.spread * Math.sqrt((n + 0.5) / Math.max(1, left.length)) * (k > 0 ? 1 + k * 0.08 : 1)
        const a = n * 2.39996
        x = ax + Math.cos(a) * rr
        z = az + Math.sin(a) * rr
        if (free(x, z, r, region.x, region.z, e.region === 'africa')) break
      }
      const cx = e.region === 'africa' ? 0 : region.x
      const cz = e.region === 'africa' ? 30 : region.z
      const yaw = Math.atan2(cx - x, cz - z) + Math.sin(i * 1.7) * 0.5
      const lion = e.make({ id: animal.id, x, z, yaw, size: e.size })
      // 描く回数を抑える（1 頭 40 個ほどの部品を数個に）
      mergeStatic(lion.group)
      out.push(lion)
      placedIds.add(animal.id)
      bodies.push({ x, z, r: lion.collider.r })
    })
  }
  // ふれあいワールド: 岩場が込み合うので、残りのヤギ 4 頭は岩場の入り口の前の草地に
  const partner = OUTER_REGIONS.find((g) => g.key === 'partner')
  if (partner) {
    const goats = ANIMALS.filter((a) => a.species === 'ヤギ' && !placedIds.has(a.id))
    const gx = partner.x + GOAT_ROCKS.dx + Math.cos(GOAT_ROCKS.gate) * (GOAT_ROCKS.radius + 3.5)
    const gz = partner.z + GOAT_ROCKS.dz + Math.sin(GOAT_ROCKS.gate) * (GOAT_ROCKS.radius + 3.5)
    goats.forEach((animal, i) => {
      let x = gx
      let z = gz
      for (let k = 0; k < 60; k++) {
        const rr = 2.2 * Math.sqrt(i + 0.5 + k * goats.length) * 0.7
        const a = (i + k * goats.length) * 2.39996
        x = gx + Math.cos(a) * rr
        z = gz + Math.sin(a) * rr
        if (free(x, z, 0.5, partner.x, partner.z, false)) break
      }
      const goat = createFarmfolk({ id: animal.id, kind: 'goat', x, z, yaw: Math.atan2(partner.x - x, partner.z - z) + Math.sin(i * 2.1) * 0.6, size: 1.05 })
      mergeStatic(goat.group)
      out.push(goat)
      placedIds.add(animal.id)
      bodies.push({ x, z, r: 0.5 })
    })
  }
}

/** (x, z) が歩ける所で木や岩・ほかの子に重ならなければそのまま、だめなら少しずつ外へ探す */
function freeSpot(x: number, z: number, r: number, colliders: Collider[], placed: Lion[]): { x: number; z: number } {
  const ok = (px: number, pz: number) =>
    isWalkable(px, pz) &&
    colliders.every((c) => Math.hypot(px - c.x, pz - c.z) >= c.r + r + 0.4) &&
    placed.every((l) => Math.hypot(px - l.position.x, pz - l.position.z) >= l.collider.r + r + 0.35)
  if (ok(x, z)) return { x, z }
  for (let k = 1; k < 60; k++) {
    const a = k * 2.39996
    const rr = 0.6 * Math.sqrt(k)
    if (ok(x + Math.cos(a) * rr, z + Math.sin(a) * rr)) return { x: x + Math.cos(a) * rr, z: z + Math.sin(a) * rr }
  }
  return { x, z }
}

/** ほかのワールドの子を作る。返す形はライオンと同じなので、出会い・ピン・地図にそのまま乗る */
export function createResidents(colliders: Collider[] = []): Lion[] {
  const out: Lion[] = []
  for (const r of RESIDENTS) {
    const animal = r.name
      ? ANIMALS.find((a) => a.species === r.species && a.name === r.name)
      : ANIMALS.filter((a) => a.species === r.species)[r.pick ?? 0]
    const region = OUTER_REGIONS.find((g) => g.key === r.region)
    if (!animal || !region) continue
    if (r.perch) {
      // 枝の高さはワールドの y で決める（幹の根元の地面から）
      const px = region.x + JUNGLE_PERCH.dx
      const pz = region.z + JUNGLE_PERCH.dz
      const branchY = terrainHeight(px, pz) + JUNGLE_PERCH.height
      const x = px + r.dx
      if (r.kind === 'sloth') {
        out.push(createSloth({ id: animal.id, x, y: branchY - JUNGLE_PERCH.radius * 0.6, z: pz, yaw: r.yaw, size: r.size }))
      } else {
        const lift = branchY + JUNGLE_PERCH.radius * 0.8 - terrainHeight(x, pz)
        out.push(createLion({ id: animal.id, x, z: pz, yaw: r.yaw, size: r.size, lift, species: r.kind as NonNullable<LionOptions['species']> }))
      }
      continue
    }
    const shift = groupShift(r.region, r.species)
    const spot = freeSpot(region.x + r.dx + shift.dx, region.z + r.dz + shift.dz, Math.max(0.3, 0.45 * r.size), colliders, out)
    // 動かした群れは、ワールドの中心（スポット）の方を向く
    const yaw = shift.dx || shift.dz ? Math.atan2(region.x - spot.x, region.z - spot.z) + (r.yaw % 0.8) - 0.4 : r.yaw
    const at = { id: animal.id, x: spot.x, z: spot.z, yaw, size: r.size }
    if (r.kind === 'penguin' || r.kind === 'pelican' || r.kind === 'otter') {
      out.push(createWaterfolk({ ...at, kind: r.kind }))
      continue
    }
    const upright: string[] = ['kangaroo', 'wallaby', 'prairie', 'lemur']
    out.push(
      upright.includes(r.kind)
        ? createKangaroo({ ...at, variant: r.kind as UprightVariant })
        : createLion({ ...at, species: r.kind as NonNullable<LionOptions['species']> }),
    )
  }
  createFarmResidents(out)
  createSkyResidents(out)
  createExtraResidents(out, colliders)
  // 描く回数を抑える: 動かない部品をまとめる（首・尾・体のまとまりと名前のある耳は残すので、動きと生成モデルへの差し替えはそのまま）
  for (const lion of out) mergeStatic(lion.group)
  // 小さい子は影の読み取りのずれ（normalBias 1.8m）で体がまだらに暗くなるので、影は受けず落とすだけにする
  for (const lion of out) {
    if (lion.group.scale.x >= 0.75) continue
    lion.group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.receiveShadow = false
    })
  }
  return out
}
