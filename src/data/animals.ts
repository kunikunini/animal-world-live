import raw from './animals.json'

/** 映像の再生元。今回実装するのは recorded（収録映像）だけ。将来 live を足せるよう型だけ用意する */
export type VideoSourceKind = 'recorded' | 'live'

export interface VideoSource {
  source: VideoSourceKind
  /** MP4 の URL（配信用。R2 の https://media.kobakuni.com/...）。空なら映像なし */
  url: string
  /** url が読めない時に試す予備の URL（リポジトリ内の /media/...。LAN での開発や実機確認用） */
  fallbackUrl?: string
  /** 再生前に見せる静止画の URL。空なら色だけのポスター */
  poster: string
  /** true のときは仮映像（自作プレースホルダ）。UI に「仮映像」と出す */
  placeholder?: boolean
}

export interface Animal {
  id: string
  name: string
  /** 英語表示の名前（無ければ name のまま） */
  nameEn?: string
  species: string
  ageLabel: string
  family: string
  personality: string
  favorites: string
  identifyingMarks: string
  keeperComment: string
  /** ready: プロフィールと映像がそろっている。preparing: 準備中（一覧に出さない） */
  status: 'ready' | 'preparing'
  /** 任意。写真がなくても UI は成立させる */
  photo?: string
  video: VideoSource
}

interface AnimalsFile {
  animals: Animal[]
}

const data = raw as AnimalsFile

export const ANIMALS: readonly Animal[] = data.animals

export function getAnimal(id: string): Animal | undefined {
  return ANIMALS.find((a) => a.id === id)
}

/** 一覧に出してよい個体 */
export function listReadyAnimals(): Animal[] {
  return ANIMALS.filter((a) => a.status === 'ready')
}
