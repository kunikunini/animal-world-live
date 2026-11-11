import raw from './animals.json'
import rosterRaw from './roster.json'
import { staffVideoForSpecies, staffVideosFor, videoForSpecies } from './videos'
import photosRaw from './photos.json'
import profilesRaw from './profiles.json'
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
  /** スタッフが撮った映像。モニターに「スタッフ撮影」と出す */
  staff?: boolean
  /** 縦長の映像。左右にぼかした背景を敷いて中央に出す */
  portrait?: boolean
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
  /** その種の一般的な説明（子ども向け。{漢字|よみ} はふりがな）。同じ種でも個体ごとに話題が違う */
  speciesInfo?: string
  /** speciesInfo の出典 */
  speciesSources?: { title: string; url: string }[]
  /** 英語表示の本文（日本語の確認済みの文を、スコップの口調のまま子ども向けの英語にしたもの）。無ければ日本語のまま出す */
  en?: ProfileText
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
  /** 映像（videos.json）の id。種の映像かスタッフ撮影。ライオンは無し */
  videoId?: string
  /**
   * 映像がその種のみんなのもので、この子が映っているかは確かめていない時のまとまり。
   * モニターに「どの子が映っているかは未確認」と出す。その種が 1 頭だけなら無し
   */
  videoGroup?: VideoSubject
}

/** プロフィールの本文（英語版） */
export interface ProfileText {
  family: string
  personality: string
  favorites: string
  identifyingMarks: string
  keeperComment: string
  speciesInfo: string
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
 * ライオン以外の個体。プロフィールの本文は下の profiles.json から入れる（無い項目は空のまま、埋めない）。
 * 映像は種ごと（videos.json）。その種の映像が無ければ url は空で、モニターは「映像はじゅんびちゅう」を出し、
 * 収録映像のバッジも出さない。
 */
const rosterAnimals: Animal[] = rosterRows.map((r) => {
  // その子と名前で決まったスタッフ撮影の映像があれば、種の映像より先に出す（この子が映っていると言える）
  const staff = staffVideosFor(r.id)[0]
  // 種の映像が無ければ、個体の決まっていないスタッフ撮影（種だけ分かっている物）をその種のみんなに出す
  const found = staff ? null : (videoForSpecies(r.species) ?? staffVideoForSpecies(r.species))
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
    video: staff
      ? { source: 'recorded', url: staff.url, fallbackUrl: staff.fallbackUrl, poster: staff.poster, staff: true, portrait: staff.portrait }
      : found
        ? found.video.staff
          ? { source: 'recorded', url: found.video.url, fallbackUrl: found.video.fallbackUrl, poster: found.video.poster, staff: true, portrait: found.video.portrait }
          : { source: 'recorded', url: found.video.url, fallbackUrl: found.video.fallbackUrl, poster: found.video.poster }
        : { source: 'recorded', url: '', poster: '' },
    world: r.world,
    subArea: r.subArea,
    representative: r.representative,
    videoId: staff?.id ?? found?.video.id,
    videoGroup: found && groupSize > 1 ? found.subject : undefined,
  }
})

// ライオン（animals.json）。自分の映像がまだ無い子（アレックス）に、名前で決まったスタッフ撮影があればそれを出す
const lions: Animal[] = data.animals.map((a) => {
  const staff = a.video.url ? undefined : staffVideosFor(a.id)[0]
  const video: VideoSource = staff
    ? { source: 'recorded', url: staff.url, fallbackUrl: staff.fallbackUrl, poster: staff.poster, staff: true, portrait: staff.portrait }
    : a.video
  // 映像がそろったので「準備中」（一覧に出さない）から外す
  return { ...a, video, videoId: staff?.id ?? a.videoId, status: staff ? 'ready' : a.status, world: 'africa', subArea: '', representative: true }
})

/**
 * 子ども向けのプロフィール（profiles.json）。飼育日誌から下書きし、施設側が確認したもの。
 * animals.json に既に文がある項目（クレアの見分けポイントなど）は上書きしない
 */
interface ProfileRow {
  personality: string
  favorites: string
  identifyingMarks: string
  speciesInfo: string
  speciesSources: { title: string; url: string }[]
  /** 英語の名前（ライオン以外の子。animals.json に nameEn がある子はそちら） */
  nameEn?: string
  en?: ProfileText
}
const PROFILES = (profilesRaw as { profiles: Record<string, ProfileRow> }).profiles
for (const a of [...lions, ...rosterAnimals]) {
  const p = PROFILES[a.id]
  if (!p) continue
  a.personality ||= p.personality
  a.favorites ||= p.favorites
  a.identifyingMarks ||= p.identifyingMarks
  a.speciesInfo = p.speciesInfo
  a.speciesSources = p.speciesSources
  a.nameEn ||= p.nameEn
  if (p.en) a.en = p.en
}

/** 顔の写真（tools/photos-import.mjs が書く。id → public/faces の画像）。無い子は自作の顔のまま */
const PHOTOS = (photosRaw as { photos: Record<string, string> }).photos
for (const a of [...lions, ...rosterAnimals]) if (PHOTOS[a.id]) a.photo = PHOTOS[a.id]

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
