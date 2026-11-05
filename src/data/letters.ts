/**
 * どうぶつへのお手紙の保存（ともだち帳のトーク画面）。
 * 試作版なので、この端末の localStorage に残すだけで、飼育員さんへ届ける仕組みはまだ無い
 * （UI にもその旨を出す。届いたふり・既読・返事の演出はしない）。
 * localStorage が使えない環境ではメモリに持ち、その旨を伝える（friends.ts と同じ決まり）。
 */

const STORAGE_KEY = 'awl.letters.v1'

/** 1 通あたりの文字数の上限。長い文章ではなく、ひとこと */
export const LETTER_MAX = 200

export interface Letter {
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
  /** その子へのお手紙（古い順） */
  listFor: (animalId: string) => Letter[]
  /** いちばん新しいお手紙 */
  lastFor: (animalId: string) => Letter | undefined
  /** 書く。空文字は無視して undefined */
  add: (animalId: string, text: string) => Letter | undefined
  /** true なら再読み込み後も残る */
  isPersistent: boolean
  onChange: (fn: () => void) => void
}

function readStorage(): Letter[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Partial<StoredFile>
    if (parsed.version !== 1 || !Array.isArray(parsed.letters)) return []
    return parsed.letters.filter(
      (l): l is Letter => typeof l?.animalId === 'string' && typeof l?.text === 'string' && typeof l?.sentAt === 'string',
    )
  } catch {
    return null
  }
}

function writeStorage(letters: Letter[]): boolean {
  try {
    const file: StoredFile = { version: 1, letters }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(file))
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

  return {
    listFor: (id) => letters.filter((l) => l.animalId === id),
    lastFor: (id) => {
      for (let i = letters.length - 1; i >= 0; i--) if (letters[i].animalId === id) return letters[i]
      return undefined
    },
    add: (id, text) => {
      const body = text.replace(/\s+/g, ' ').trim().slice(0, LETTER_MAX)
      if (!body) return undefined
      const letter: Letter = { animalId: id, text: body, sentAt: new Date().toISOString() }
      letters = [...letters, letter]
      if (persistent) persistent = writeStorage(letters)
      emit()
      return letter
    },
    get isPersistent() {
      return persistent
    },
    onChange: (fn) => {
      listeners.push(fn)
    },
  }
}
