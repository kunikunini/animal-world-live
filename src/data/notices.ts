import { newId } from './letters'
import { onStorageKey } from './storageSync'

/**
 * 施設のスタッフからのお知らせ。スタッフ画面（staff.html）で書き、ともだち帳のトークに届く。
 * 試作版: 保存はこの端末の localStorage だけ（サーバー・ログインは無い）。同じ端末のともだち帳にだけ届く。
 * 種類: notice（お知らせ）／schedule（収録の予定）／photo（きょうの写真）／reply（お手紙へのお返事）。
 * お返事は「下書き → 承認して出す」の 2 段階で、承認したものだけトークに出る（飼育員が確認した言葉だけ届く）。
 * ライブ配信は無いので、schedule は「収録の予定」であって配信の予定ではない。
 */

export const NOTICES_KEY = 'awl.notices.v1'

export type NoticeKind = 'notice' | 'schedule' | 'photo' | 'reply'
export type NoticeStatus = 'draft' | 'published'

export interface Notice {
  id: string
  animalId: string
  kind: NoticeKind
  title: string
  body: string
  /** schedule: 予定の日（YYYY-MM-DD）と時刻の文字（任意） */
  date?: string
  time?: string
  /** photo: 縮小した画像の data URL */
  photo?: string
  /** reply: どのお手紙への返事か（id と、その時の本文） */
  replyTo?: string
  quote?: string
  status: NoticeStatus
  createdAt: string
  publishedAt?: string
}

export type NoticeInput = Omit<Notice, 'id' | 'status' | 'createdAt' | 'publishedAt'>

interface StoredFile {
  version: 1
  notices: Notice[]
}

export interface NoticeStore {
  list: () => Notice[]
  /** その子のトークに出すもの（出した順） */
  publishedFor: (animalId: string) => Notice[]
  drafts: () => Notice[]
  get: (id: string) => Notice | undefined
  add: (input: NoticeInput, status: NoticeStatus) => Notice
  update: (id: string, patch: Partial<NoticeInput>) => void
  publish: (id: string) => void
  remove: (id: string) => void
  isPersistent: boolean
  /** 保存に失敗した時（容量いっぱいなど）に true。写真を小さくするよう案内する */
  lastWriteFailed: boolean
  onChange: (fn: () => void) => void
}

const KINDS: NoticeKind[] = ['notice', 'schedule', 'photo', 'reply']

function readStorage(): Notice[] | null {
  try {
    const raw = localStorage.getItem(NOTICES_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Partial<StoredFile>
    if (parsed.version !== 1 || !Array.isArray(parsed.notices)) return []
    return parsed.notices.filter(
      (n): n is Notice =>
        typeof n?.id === 'string' &&
        typeof n?.animalId === 'string' &&
        KINDS.includes(n?.kind) &&
        typeof n?.body === 'string' &&
        (n?.status === 'draft' || n?.status === 'published') &&
        typeof n?.createdAt === 'string',
    )
  } catch {
    return null
  }
}

function writeStorage(notices: Notice[]): boolean {
  try {
    const file: StoredFile = { version: 1, notices }
    localStorage.setItem(NOTICES_KEY, JSON.stringify(file))
    return true
  } catch {
    return false
  }
}

export function createNoticeStore(): NoticeStore {
  const loaded = readStorage()
  const persistent = loaded !== null
  let notices: Notice[] = loaded ?? []
  let lastWriteFailed = false
  const listeners: Array<() => void> = []
  const emit = () => listeners.forEach((fn) => fn())
  const save = () => {
    if (persistent) lastWriteFailed = !writeStorage(notices)
    emit()
  }
  onStorageKey(NOTICES_KEY, () => {
    const next = readStorage()
    if (next === null) return
    notices = next
    emit()
  })

  return {
    list: () => [...notices],
    publishedFor: (animalId) => notices.filter((n) => n.animalId === animalId && n.status === 'published'),
    drafts: () => notices.filter((n) => n.status === 'draft'),
    get: (id) => notices.find((n) => n.id === id),
    add: (input, status) => {
      const now = new Date().toISOString()
      const notice: Notice = { ...input, id: newId('n'), status, createdAt: now, publishedAt: status === 'published' ? now : undefined }
      notices = [...notices, notice]
      save()
      return notice
    },
    update: (id, patch) => {
      notices = notices.map((n) => (n.id === id ? { ...n, ...patch } : n))
      save()
    },
    publish: (id) => {
      const now = new Date().toISOString()
      notices = notices.map((n) => (n.id === id && n.status === 'draft' ? { ...n, status: 'published', publishedAt: now } : n))
      save()
    },
    remove: (id) => {
      if (!notices.some((n) => n.id === id)) return
      notices = notices.filter((n) => n.id !== id)
      save()
    },
    get isPersistent() {
      return persistent
    },
    get lastWriteFailed() {
      return lastWriteFailed
    },
    onChange: (fn) => {
      listeners.push(fn)
    },
  }
}
