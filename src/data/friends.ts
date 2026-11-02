/**
 * ともだち帳の保存。
 * 動物を集める図鑑ではなく、出会った個体とのつながりを記録する場所。
 * localStorage が使えない環境ではメモリに持ち、その旨を伝える。
 */

const STORAGE_KEY = 'awl.friends.v1'

export interface FriendEntry {
  animalId: string
  /** 初めて出会った日時（ISO 8601） */
  firstMetAt: string
}

interface StoredFile {
  version: 1
  entries: FriendEntry[]
}

export interface FriendBookStore {
  list: () => FriendEntry[]
  get: (animalId: string) => FriendEntry | undefined
  has: (animalId: string) => boolean
  /** 登録する。すでにいれば何もしない。戻り値は登録内容 */
  add: (animalId: string) => FriendEntry
  /** true なら再読み込み後も残る */
  isPersistent: boolean
  onChange: (fn: () => void) => void
}

function readStorage(): FriendEntry[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Partial<StoredFile>
    if (parsed.version !== 1 || !Array.isArray(parsed.entries)) return []
    return parsed.entries.filter(
      (e): e is FriendEntry => typeof e?.animalId === 'string' && typeof e?.firstMetAt === 'string',
    )
  } catch {
    return null
  }
}

function writeStorage(entries: FriendEntry[]): boolean {
  try {
    const file: StoredFile = { version: 1, entries }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(file))
    return true
  } catch {
    return false
  }
}

export function createFriendBookStore(): FriendBookStore {
  const loaded = readStorage()
  let persistent = loaded !== null
  let entries: FriendEntry[] = loaded ?? []
  const listeners: Array<() => void> = []
  const emit = () => listeners.forEach((fn) => fn())

  return {
    list: () => [...entries],
    get: (id) => entries.find((e) => e.animalId === id),
    has: (id) => entries.some((e) => e.animalId === id),
    add: (id) => {
      const existing = entries.find((e) => e.animalId === id)
      if (existing) return existing
      const entry: FriendEntry = { animalId: id, firstMetAt: new Date().toISOString() }
      entries = [...entries, entry]
      if (persistent) persistent = writeStorage(entries)
      emit()
      return entry
    },
    get isPersistent() {
      return persistent
    },
    onChange: (fn) => {
      listeners.push(fn)
    },
  }
}

/** 「2026年11月2日」の形 */
export function formatMetDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}
