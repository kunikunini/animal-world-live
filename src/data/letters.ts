import { onStorageKey } from './storageSync'

/**
 * どうぶつへのお手紙の保存（ともだち帳のトーク画面）。
 * 試作版なので、この端末の localStorage に残すだけで、施設のサーバーへ送る仕組みはまだ無い
 * （UI にもその旨を出す。届いたふり・既読・返事の演出はしない）。
 * 同じ端末のスタッフ画面（staff.html）は同じ保存を読んで「お手紙まとめ」を作り、お返事はお知らせとして出す。
 * localStorage が使えない環境ではメモリに持ち、その旨を伝える（friends.ts と同じ決まり）。
 */

export const LETTERS_KEY = 'awl.letters.v1'

/** 1 通あたりの文字数の上限。長い文章ではなく、ひとこと */
export const LETTER_MAX = 200

export interface Letter {
  id: string
  animalId: string
  text: string
  /** 書いた日時（ISO 8601） */
  sentAt: string
}

interface StoredFile {
  version: 1
  letters: Letter[]
}

export interface LetterStore {
  /** 全部（古い順） */
  listAll: () => Letter[]
  /** その子へのお手紙（古い順） */
  listFor: (animalId: string) => Letter[]
  /** いちばん新しいお手紙 */
  lastFor: (animalId: string) => Letter | undefined
  get: (id: string) => Letter | undefined
  /** 書く。空文字は無視して undefined */
  add: (animalId: string, text: string) => Letter | undefined
  /** とりけす（書いた本人が消す） */
  remove: (id: string) => void
  /** true なら再読み込み後も残る */
  isPersistent: boolean
  onChange: (fn: () => void) => void
}

export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function readStorage(): Letter[] | null {
  try {
    const raw = localStorage.getItem(LETTERS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Partial<StoredFile>
    if (parsed.version !== 1 || !Array.isArray(parsed.letters)) return []
    return parsed.letters
      .filter((l): l is Letter => typeof l?.animalId === 'string' && typeof l?.text === 'string' && typeof l?.sentAt === 'string')
      // id の無い古い記録には、並び順から決まる id を付ける（とりけすために要る）
      .map((l, i) => (typeof l.id === 'string' && l.id ? l : { ...l, id: `old-${l.sentAt}-${i}` }))
  } catch {
    return null
  }
}

function writeStorage(letters: Letter[]): boolean {
  try {
    const file: StoredFile = { version: 1, letters }
    localStorage.setItem(LETTERS_KEY, JSON.stringify(file))
    return true
  } catch {
    return false
  }
}

export function createLetterStore(): LetterStore {
  const loaded = readStorage()
  let persistent = loaded !== null
  let letters: Letter[] = loaded ?? []
  const listeners: Array<() => void> = []
  const emit = () => listeners.forEach((fn) => fn())
  const save = () => {
    if (persistent) persistent = writeStorage(letters)
    emit()
  }
  // 別のタブ（スタッフ画面）が書き換えたら読み直す
  onStorageKey(LETTERS_KEY, () => {
    const next = readStorage()
    if (next === null) return
    letters = next
    emit()
  })

  return {
    listAll: () => [...letters],
    listFor: (id) => letters.filter((l) => l.animalId === id),
    lastFor: (id) => {
      for (let i = letters.length - 1; i >= 0; i--) if (letters[i].animalId === id) return letters[i]
      return undefined
    },
    get: (id) => letters.find((l) => l.id === id),
    add: (id, text) => {
      const body = text.replace(/\s+/g, ' ').trim().slice(0, LETTER_MAX)
      if (!body) return undefined
      const letter: Letter = { id: newId('l'), animalId: id, text: body, sentAt: new Date().toISOString() }
      letters = [...letters, letter]
      save()
      return letter
    },
    remove: (id) => {
      if (!letters.some((l) => l.id === id)) return
      letters = letters.filter((l) => l.id !== id)
      save()
    },
    get isPersistent() {
      return persistent
    },
    onChange: (fn) => {
      listeners.push(fn)
    },
  }
}
