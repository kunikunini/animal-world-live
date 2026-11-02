/**
 * 出会いの記録。地図はレーダーではなく「出会った個体の記録」なので、
 * まだ出会っていない個体は地図に出さない。
 * 出会いの定義は、出会い判定（「○○のそばに来ました」のバナー）か、観察モニターを開いたこと。
 * ともだち帳と同じく localStorage に残し、使えない環境ではメモリに持つ。
 */

const STORAGE_KEY = 'awl.met.v1'

export interface EncounterEntry {
  animalId: string
  /** 初めて出会った日時（ISO 8601） */
  firstMetAt: string
}

interface StoredFile {
  version: 1
  entries: EncounterEntry[]
}

export interface EncounterStore {
  has: (animalId: string) => boolean
  list: () => EncounterEntry[]
  /** 出会いを記録する。すでにあれば何もしない */
  mark: (animalId: string) => void
  isPersistent: boolean
  onChange: (fn: () => void) => void
}

function readStorage(): EncounterEntry[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Partial<StoredFile>
    if (parsed.version !== 1 || !Array.isArray(parsed.entries)) return []
    return parsed.entries.filter(
      (e): e is EncounterEntry => typeof e?.animalId === 'string' && typeof e?.firstMetAt === 'string',
    )
  } catch {
    return null
  }
}

function writeStorage(entries: EncounterEntry[]): boolean {
  try {
    const file: StoredFile = { version: 1, entries }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(file))
    return true
  } catch {
    return false
  }
}

export function createEncounterStore(): EncounterStore {
  const loaded = readStorage()
  let persistent = loaded !== null
  let entries: EncounterEntry[] = loaded ?? []
  const listeners: Array<() => void> = []

  return {
    has: (id) => entries.some((e) => e.animalId === id),
    list: () => [...entries],
    mark: (id) => {
      if (entries.some((e) => e.animalId === id)) return
      entries = [...entries, { animalId: id, firstMetAt: new Date().toISOString() }]
      if (persistent) persistent = writeStorage(entries)
      listeners.forEach((fn) => fn())
    },
    get isPersistent() {
      return persistent
    },
    onChange: (fn) => {
      listeners.push(fn)
    },
  }
}
