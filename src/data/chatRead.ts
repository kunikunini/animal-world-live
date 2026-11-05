import { onStorageKey } from './storageSync'

/**
 * トークをいつまで読んだか（個体ごと）。お知らせの未読の数は「最後に開いた時刻より後に出たお知らせ」で決める。
 * 保存できない環境ではメモリだけ（その場合は開いている間だけ未読が消える）。
 */
const KEY = 'awl.chatread.v1'

export interface ChatReadStore {
  lastReadAt: (animalId: string) => string | undefined
  markRead: (animalId: string) => void
  onChange: (fn: () => void) => void
}

type Map = Record<string, string>

function read(): Map {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    const out: Map = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) if (typeof v === 'string') out[k] = v
    return out
  } catch {
    return {}
  }
}

export function createChatReadStore(): ChatReadStore {
  let map = read()
  const listeners: Array<() => void> = []
  onStorageKey(KEY, () => {
    map = read()
    listeners.forEach((fn) => fn())
  })
  return {
    lastReadAt: (id) => map[id],
    markRead: (id) => {
      map = { ...map, [id]: new Date().toISOString() }
      try {
        localStorage.setItem(KEY, JSON.stringify(map))
      } catch {
        // 保存できなくてもメモリの値で続ける
      }
      listeners.forEach((fn) => fn())
    },
    onChange: (fn) => {
      listeners.push(fn)
    },
  }
}
