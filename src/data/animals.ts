import raw from './animals.json'
import rosterRaw from './roster.json'
import { videoForSpecies } from './videos'
import type { VideoSubject } from './videos'
import type { WorldKey } from './worlds'

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
  /** どのワールドの子か。ライオンは africa */
  world?: WorldKey
  /** ワールドの中の区分（ジャングルの「アジア」など）。無ければ空 */
  subArea?: string
  /** 3D の出会いと実写を先に作る代表の種か（D-32） */
  representative?: boolean
  /** 種の映像（videos.json）の id。ライオンは無し */
  videoId?: string
  /**
   * 映像がその種のみんなのもので、この子が映っているかは確かめていない時のまとまり。
   * モニターに「どの子が映っているかは未確認」と出す。その種が 1 頭だけなら無し
   */
  videoGroup?: VideoSubject
}

interface AnimalsFile {
  animals: Animal[]
}

const data = raw as AnimalsFile

/** roster.json の 1 行。CSV から自動生成（tools/roster-from-csv.mjs） */
interface RosterRow {
  id: string
  world: WorldKey
  subArea: string
  species: string
  name: string
  representative: boolean
}

const rosterRows = (rosterRaw as { animals: RosterRow[] }).animals

/**
 * ライオン以外の個体。プロフィールの本文はまだ無いので空のまま（埋めない）。
 * 映像は種ごと（videos.json）。その種の映像が無ければ url は空で、モニターは「映像はじゅんびちゅう」を出し、
 * 収録映像のバッジも出さない。
 */
const rosterAnimals: Animal[] = rosterRows.map((r) => {
  const found = videoForSpecies(r.species)
  // 映像のまとまり（例: カンガルー 2 種）に何頭いるか。1 頭ならその子の映像と言える
  const groupSize = found ? rosterRows.filter((x) => found.subject.species.includes(x.species)).length : 0
  return {
    id: r.id,
    name: r.name,
    species: r.species,
    ageLabel: '',
    family: '',
    personality: '',
    favorites: '',
    identifyingMarks: '',
    keeperComment: '',
    status: 'ready',
    video: found
      ? { source: 'recorded', url: found.video.url, fallbackUrl: found.video.fallbackUrl, poster: found.video.poster }
      : { source: 'recorded', url: '', poster: '' },
    world: r.world,
    subArea: r.subArea,
    representative: r.representative,
    videoId: found?.video.id,
    videoGroup: found && groupSize > 1 ? found.subject : undefined,
  }
})

const lions: Animal[] = data.animals.map((a) => ({ ...a, world: 'africa', subArea: '', representative: true }))

export const ANIMALS: readonly Animal[] = [...lions, ...rosterAnimals]

/** そのワールドの個体（データの並び順） */
export function animalsInWorld(world: WorldKey): Animal[] {
  return ANIMALS.filter((a) => a.world === world && a.status === 'ready')
}

export function getAnimal(id: string): Animal | undefined {
  return ANIMALS.find((a) => a.id === id)
}

/** 一覧に出してよい個体 */
export function listReadyAnimals(): Animal[] {
  return ANIMALS.filter((a) => a.status === 'ready')
}

/** その映像に映っている種の子たち（まとまりごとに、データの並び順で） */
export function animalsInVideo(videoId: string): Animal[] {
  return ANIMALS.filter((a) => a.videoId === videoId && a.status === 'ready')
}
