import ROSTER from './heroes.json'

/**
 * 主人公の名簿。キービジュアルの子どもたちを Meshy で 3D にしたもの（出所は public/models/SOURCE.md）。
 * 名前は付けず、見た目（服の色など）で呼ぶ。
 * - model: 読み込む GLB（選んでいる 1 人だけ読む）
 * - thumb: ホームの「だれで冒険する？」の絵（キャラクターシートの正面を小さく切り出したもの）
 * - scale: それまでのプレイヤーの姿（2.03 m）に対する高さの倍率。0.59 で 1.20 m（子どもの実寸）
 * 選んだ子は `awl.hero.v1` に保存し、次に開いた時もその子で始まる。保存できない環境ではこの回だけ覚える。
 */
export interface HeroEntry {
  id: string
  model: string
  thumb: string
  scale: number
  label: { ja: string; en: string }
}

export const HEROES: readonly HeroEntry[] = ROSTER
/** 既定で、ほかの子が読めない時に代わりに出す子 */
export const DEFAULT_HERO = 'yellow'

const STORAGE_KEY = 'awl.hero.v1'
let memory: string | null = null

export function heroById(id: string): HeroEntry {
  return HEROES.find((h) => h.id === id) ?? HEROES.find((h) => h.id === DEFAULT_HERO) ?? HEROES[0]
}

export function getHeroId(): string {
  let id = memory
  try {
    id = localStorage.getItem(STORAGE_KEY) ?? id
  } catch {
    // 保存が使えない環境: この回だけ覚えている値を使う
  }
  return id && HEROES.some((h) => h.id === id) ? id : DEFAULT_HERO
}

export function setHeroId(id: string): void {
  memory = id
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    // 保存できなくても、この回は選んだ子のまま
  }
}
