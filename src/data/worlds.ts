/**
 * 7 つのワールド（D-30）。open は一覧から入れるワールド。D-36 でワールドごとに進めるので、
 * いまはサバンナ（3D）と、先に作るジャングル・南半球・北の世界、東に足した水の世界、南西に足したふれあいワールドが開いている。
 * 残りは名前だけ見せて「じゅんびちゅう」。
 */
export type WorldKey = 'africa' | 'jungle' | 'south' | 'north' | 'water' | 'sky' | 'partner'

export interface WorldInfo {
  key: WorldKey
  name: { ja: string; en: string }
  /** 一覧から入れるか */
  open: boolean
  /** カードの色（上・下）。ワールドの空気の色 */
  colors: [string, string]
}

export const WORLDS: readonly WorldInfo[] = [
  { key: 'africa', name: { ja: 'アフリカ', en: 'Africa' }, open: true, colors: ['#f6b73c', '#c9762a'] },
  { key: 'jungle', name: { ja: 'ジャングル', en: 'Jungle' }, open: true, colors: ['#43b968', '#16764a'] },
  { key: 'south', name: { ja: '南半球', en: 'Southern Lands' }, open: true, colors: ['#f08a4b', '#b8492c'] },
  { key: 'north', name: { ja: '北の世界', en: 'The North' }, open: true, colors: ['#8cc7ee', '#3f78b5'] },
  { key: 'water', name: { ja: '水の世界', en: 'Water World' }, open: true, colors: ['#4fc3d9', '#1f7fa6'] },
  { key: 'sky', name: { ja: '空の世界', en: 'Sky World' }, open: false, colors: ['#9fb4f2', '#5a6fd0'] },
  { key: 'partner', name: { ja: 'ふれあいワールド', en: 'Petting World' }, open: true, colors: ['#f7a6b8', '#d0607e'] },
]

export function getWorld(key: WorldKey): WorldInfo | undefined {
  return WORLDS.find((w) => w.key === key)
}
