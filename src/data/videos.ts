import raw from './videos.json'

/** 映像の配信元（R2）。読めない時はリポジトリ内の /media/ を試す（animals.json と同じ決まり） */
const R2 = 'https://media.kobakuni.com/'

export interface Text2 {
  ja: string
  en: string
}

/** 映像に映っている種のまとまり。label が無ければ種名で呼ぶ */
export interface VideoSubject {
  species: string[]
  label?: Text2
}

export interface SpeciesVideo {
  id: string
  url: string
  fallbackUrl: string
  poster: string
  duration: string
  /** 撮影日。スタッフ撮影で確かでない物は空 */
  recordedOn: string
  title: Text2
  subjects: VideoSubject[]
  /** スタッフが撮った映像（「スタッフ撮影」の棚に出す） */
  staff: boolean
  /** 縦長の映像。モニターでは左右にぼかした背景を敷いて中央に出す */
  portrait: boolean
  /** スタッフ撮影: 映っている子（ファイル名が個体名と完全一致した子だけ） */
  animalIds: string[]
}

interface VideoRow {
  id: string
  file: string
  /** R2 に上げ終えたか。false なら開発サーバーでだけ出す（公開サイトは R2 からしか読めない） */
  onR2: boolean
  poster: string
  duration: string
  recordedOn?: string
  title: Text2
  subjects: VideoSubject[]
  staff?: boolean
  portrait?: boolean
  animalIds?: string[]
}

const ALL_VIDEOS: readonly SpeciesVideo[] = (raw as { videos: VideoRow[] }).videos
  .filter((v) => v.onR2 || import.meta.env.DEV)
  .map((v) => ({
    id: v.id,
    url: R2 + v.file,
    fallbackUrl: `/media/${v.file}`,
    poster: `/media/${v.poster}`,
    duration: v.duration,
    recordedOn: v.recordedOn ?? '',
    title: v.title,
    subjects: v.subjects,
    staff: v.staff === true,
    portrait: v.portrait === true,
    animalIds: v.animalIds ?? [],
  }))

/** ライオン以外の種の収録映像（videos.json の並び順）。スタッフ撮影は入れない */
export const SPECIES_VIDEOS: readonly SpeciesVideo[] = ALL_VIDEOS.filter((v) => !v.staff)

/** スタッフ撮影の映像。新しい順（videos.json では下の行ほど新しい） */
export const STAFF_VIDEOS: readonly SpeciesVideo[] = ALL_VIDEOS.filter((v) => v.staff).reverse()

/** その子のスタッフ撮影の映像（新しい順） */
export function staffVideosFor(animalId: string): SpeciesVideo[] {
  return STAFF_VIDEOS.filter((v) => v.animalIds.includes(animalId))
}

/** id から映像を引く（種の映像とスタッフ撮影の両方） */
export function getVideo(id: string): SpeciesVideo | undefined {
  return ALL_VIDEOS.find((v) => v.id === id)
}

/** その種が映っている映像と、どのまとまりで映っているか（最初に見つかったもの） */
export function videoForSpecies(species: string): { video: SpeciesVideo; subject: VideoSubject } | null {
  for (const video of SPECIES_VIDEOS) {
    const subject = video.subjects.find((s) => s.species.includes(species))
    if (subject) return { video, subject }
  }
  return null
}

/**
 * 個体が決まっていないスタッフ撮影（複数の子が映っている等。animalIds が空で、subjects に種だけある物）のうち、その種が映っている物。
 * 種の映像（videoForSpecies）が無い種だけに使う。個体名は分かった時に animalIds に足す
 */
export function staffVideoForSpecies(species: string): { video: SpeciesVideo; subject: VideoSubject } | null {
  for (const video of STAFF_VIDEOS) {
    if (video.animalIds.length) continue
    const subject = video.subjects.find((s) => s.species.includes(species))
    if (subject) return { video, subject }
  }
  return null
}
