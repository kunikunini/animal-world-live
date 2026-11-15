/**
 * 歩き回る範囲（種ごと）。生成モデル（歩行クリップつき）の子が、自分の場所（群れの拠点の中の居場所）のまわりを歩く（world/lionWander.ts）。
 * 11/6 の iPhone 実機テストでの指摘（範囲が 3〜3.5m と狭い）で、動き方の層ごとに決め直した。数字はここだけ直せば変わる。
 * - wide: 大型でよく歩く（ライオン・シマウマ・ハイエナ・トラ・オオカミ）
 * - medium: 中型（ポニー・マーラ・バク・カピバラ）
 * - small: 巣穴や木のそばから離れない小さな子（ミーアキャット・リスザル）
 * - habitat: 水辺など、生息域の中だけ（カワウソ）
 * - still: 動かない（立ち姿＋生活感レイヤーだけ。ペンギン、歩行クリップの無いプリミティブの子はすべてこれ）
 * maxRise: 行き先の地面の高さが元の場所からこれ以上違う所へは行かない（m）。ライオンは台地から崖へ出ないよう小さく
 */
export type RoamTier = 'wide' | 'medium' | 'small' | 'habitat' | 'still'

export interface Roam {
  tier: RoamTier
  /** 自分の場所からここまで（m） */
  radius: number
  /** 歩く速さ（m/s） */
  speed: number
  /** 立ち止まる時間の幅（秒） */
  idle: [number, number]
  maxRise: number
  /** 同じ群れ（同じ種）の子のぶつかり判定は素通りする。固まって暮らす群れで、行き先がほかの子の判定にふさがれて歩き出せないのを防ぐ */
  passGroup?: boolean
}

const STILL: Roam = { tier: 'still', radius: 0, speed: 0, idle: [10, 20], maxRise: 0 }

export const ROAM: Record<string, Roam> = {
  ライオン: { tier: 'wide', radius: 9, speed: 0.8, idle: [7, 15], maxRise: 0.3 },
  グラントシマウマ: { tier: 'wide', radius: 14, speed: 0.9, idle: [6, 14], maxRise: 1.2 },
  ブチハイエナ: { tier: 'wide', radius: 12, speed: 0.85, idle: [6, 14], maxRise: 1.2 },
  ベンガルトラ: { tier: 'wide', radius: 10, speed: 0.8, idle: [8, 16], maxRise: 1.0 },
  ホッキョクオオカミ: { tier: 'wide', radius: 12, speed: 0.9, idle: [7, 15], maxRise: 1.2 },
  シベリアンハスキー: { tier: 'wide', radius: 10, speed: 0.9, idle: [5, 12], maxRise: 1.2 },
  ポニー: { tier: 'medium', radius: 6, speed: 0.7, idle: [8, 16], maxRise: 0.8 },
  マーラ: { tier: 'medium', radius: 6, speed: 0.7, idle: [6, 14], maxRise: 0.8 },
  アメリカバク: { tier: 'medium', radius: 6, speed: 0.6, idle: [8, 18], maxRise: 0.8 },
  カピバラ: { tier: 'medium', radius: 5, speed: 0.6, idle: [8, 18], maxRise: 0.6 },
  ミーアキャット: { tier: 'small', radius: 3, speed: 0.6, idle: [4, 10], maxRise: 0.5 },
  コモンリスザル: { tier: 'small', radius: 2, speed: 0.6, idle: [4, 10], maxRise: 0.5 },
  // 11/15 くに「アカハナグマが歩いているのを見たことがない」: 表に無くて動いていなかった。6 頭が固まっていて、互いの判定で行き先がふさがるので群れの中は素通り
  アカハナグマ: { tier: 'small', radius: 3, speed: 0.6, idle: [4, 10], maxRise: 0.5, passGroup: true },
  // 11/15 くにの指示（歩きの実証）: アカハナグマと同じく表に無くて動いていなかった。8 頭が固まっているので群れの中は素通り
  キンカジュー: { tier: 'small', radius: 3, speed: 0.5, idle: [5, 12], maxRise: 0.5, passGroup: true },
  // 11/15 くにの指示（歩きの実証）: 表に無くて動いていなかった。8 頭が固まっているので群れの中は素通り
  ワオキツネザル: { tier: 'small', radius: 3, speed: 0.6, idle: [5, 12], maxRise: 0.5, passGroup: true },
  // 11/15 くにの指示（歩きの実証）: 表に無くて動いていなかった。バジルとパセリが寄り合っているので群れの中は素通り（ビンは木の上なので下の PER_ANIMAL で動かさない）。体が重くゆっくり歩く
  ビントロング: { tier: 'small', radius: 4, speed: 0.45, idle: [6, 14], maxRise: 0.5, passGroup: true },
  コツメカワウソ: { tier: 'habitat', radius: 3, speed: 0.6, idle: [5, 12], maxRise: 0.4 },
  ケープペンギン: STILL,
}

/** 群れの中での個体ごとの違い（仔は母のそばから離れない、雄はゆっくり） */
const PER_ANIMAL: Record<string, Partial<Roam>> = {
  alex: { speed: 0.7, idle: [9, 18] },
  claire: { radius: 5, speed: 0.75, idle: [4, 10] },
  carla: { radius: 5, speed: 0.75, idle: [4, 10] },
  riley: { radius: 10 },
  // ビン（ビントロング）は木の上（地面から 4.4m）にいる。歩くと地面へ落ちるので、今まで通りその場にいる
  'r-14a9x66': { tier: 'still', radius: 0, speed: 0 },
}

/** 種と個体 id から歩く範囲を引く。表に無い種は動かない */
export function roamFor(species: string, id?: string): Roam {
  const base = ROAM[species] ?? STILL
  const over = id ? PER_ANIMAL[id] : undefined
  return over ? { ...base, ...over } : base
}
