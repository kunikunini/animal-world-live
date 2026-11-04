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
  recordedOn: string
  title: Text2
  subjects: VideoSubject[]
}

interface VideoRow {
  id: string
  file: string
  /** R2 に上げ終えたか。false なら開発サーバーでだけ出す（公開サイトは R2 からしか読めない） */
  onR2: boolean
  poster: string
  duration: string
  recordedOn: string
  title: Text2
  subjects: VideoSubject[]
}

/** ライオン以外の収録映像（videos.json の並び順） */
export const SPECIES_VIDEOS: readonly SpeciesVideo[] = (raw as { videos: VideoRow[] }).videos
  .filter((v) => v.onR2 || import.meta.env.DEV)
  .map((v) => ({
    id: v.id,
    url: R2 + v.file,
    fallbackUrl: `/media/${v.file}`,
    poster: `/media/${v.poster}`,
    duration: v.duration,
    recordedOn: v.recordedOn,
    title: v.title,
    subjects: v.subjects,
  }))

/** その種が映っている映像と、どのまとまりで映っているか（最初に見つかったもの） */
export function videoForSpecies(species: string): { video: SpeciesVideo; subject: VideoSubject } | null {
  for (const video of SPECIES_VIDEOS) {
    const subject = video.subjects.find((s) => s.species.includes(species))
    if (subject) return { video, subject }
  }
  return null
}
