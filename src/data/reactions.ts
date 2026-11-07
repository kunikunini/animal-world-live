import type { Animal } from './animals'

/**
 * 映像ごとの 👍（いいね）と ❤️（お気に入り）。押すのはユーザー、保存はこの端末の localStorage だけ。
 * サーバーは無いので、スタッフ画面で見える数・アニマルスコープの「おすすめ」の並びは「この端末で押された数」。
 * 映像の鍵は、videos.json の id（種の映像・スタッフ撮影）か、それが無い映像（ライオンの家族）は MP4 の名前。
 * 家族で同じ映像を共有する子（アンジー・クレア・カーラ）は同じ鍵になる。
 * localStorage が使えない時はメモリに持つ（押せるが、閉じると消える）。
 */
const STORAGE_KEY = 'awl.reactions.v1'

export interface Reaction {
  like: boolean
  fav: boolean
  /** お気に入りにした時刻（ISO）。一覧の並び（新しい順）に使う */
  favAt?: string
}

export interface ReactionStore {
  get: (key: string) => Reaction
  toggle: (key: string, kind: 'like' | 'fav') => Reaction
  /** お気に入りの映像の鍵（新しく足した順） */
  favorites: () => string[]
  /** 並べ替え用の点（👍 と ❤️ の数の和。この端末では 0〜2） */
  score: (key: string) => number
  all: () => Record<string, Reaction>
  onChange: (fn: () => void) => void
}

/** その子が出している映像の鍵。映像が無ければ空 */
export function videoKeyOf(a: Animal): string {
  if (a.videoId) return a.videoId
  const url = a.video.url
  if (!url) return ''
  const file = url.split('/').pop() ?? ''
  return file.replace(/(_\d+p)?\.mp4$/i, '')
}

let memory: Record<string, Reaction> = {}

const read = (): Record<string, Reaction> => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    const out: Record<string, Reaction> = {}
    for (const [k, v] of Object.entries(parsed as Record<string, Partial<Reaction>>)) {
      if (!v || typeof v !== 'object') continue
      const r: Reaction = { like: v.like === true, fav: v.fav === true }
      if (r.fav && typeof v.favAt === 'string') r.favAt = v.favAt
      if (r.like || r.fav) out[k] = r
    }
    return out
  } catch {
    return { ...memory }
  }
}

const write = (data: Record<string, Reaction>) => {
  memory = data
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    // 保存できない環境（プライベートモード等）: メモリにだけ持つ
  }
}

export function createReactionStore(): ReactionStore {
  const listeners: Array<() => void> = []
  const emit = () => listeners.forEach((fn) => fn())
  // ほかのタブ（スタッフ画面・アプリ）で押された時も追いかける
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) emit()
  })
  const get = (key: string): Reaction => read()[key] ?? { like: false, fav: false }
  return {
    get,
    toggle: (key, kind) => {
      const data = read()
      const cur = data[key] ?? { like: false, fav: false }
      const next: Reaction = { ...cur, [kind]: !cur[kind] }
      if (kind === 'fav') {
        if (next.fav) next.favAt = new Date().toISOString()
        else delete next.favAt
      }
      if (next.like || next.fav) data[key] = next
      else delete data[key]
      write(data)
      emit()
      return next
    },
    favorites: () =>
      Object.entries(read())
        .filter(([, r]) => r.fav)
        .sort((a, b) => ((a[1].favAt ?? '') < (b[1].favAt ?? '') ? 1 : -1))
        .map(([k]) => k),
    score: (key) => {
      const r = get(key)
      return (r.like ? 1 : 0) + (r.fav ? 1 : 0)
    },
    all: read,
    onChange: (fn) => {
      listeners.push(fn)
    },
  }
}

/** アプリ全体で 1 つ（アニマルスコープ・モニター・ともだち帳のトークが同じ数を見る） */
export const reactions = createReactionStore()
