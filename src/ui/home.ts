import type { FriendBookStore } from '../data/friends'

/**
 * ホーム: キービジュアル 1 枚と、入口（「のぞいてみる」と絵の中の双眼鏡）、ともだち帳の居場所。
 * 絵は画面の縦横比で CSS が選ぶ。
 * まだ帳で見ていない新しいともだちがいれば、帳のボタンに印が付く（印は帳を閉じた時に消える）。
 */
export interface HomeView {
  show: () => void
  hide: () => void
  isOpen: () => boolean
  /** 「のぞいてみる」とスコープのタップ */
  onEnter: (fn: () => void) => void
  /** 「ともだち帳」 */
  onBook: (fn: () => void) => void
  setReduceMotion: (on: boolean) => void
  /** WebGL が無い時: 入口を無効にして案内を出す */
  showFallback: () => void
}

export function createHome(store: FriendBookStore): HomeView {
  const root = document.getElementById('home') as HTMLElement
  const scope = document.getElementById('home-scope') as HTMLButtonElement
  const enterBtn = document.getElementById('enter') as HTMLButtonElement
  const bookBtn = document.getElementById('entry-book') as HTMLButtonElement
  const newDot = document.getElementById('home-new-dot') as HTMLElement
  const fallback = document.getElementById('fallback') as HTMLElement
  const fallbackBook = document.getElementById('fallback-book') as HTMLButtonElement

  let open = true
  let reduceMotion = false
  const enterListeners: Array<() => void> = []
  const bookListeners: Array<() => void> = []

  const enter = () => enterListeners.forEach((fn) => fn())
  scope.addEventListener('click', enter)
  enterBtn.addEventListener('click', enter)
  const openBook = () => {
    bookBtn.classList.remove('is-new')
    bookListeners.forEach((fn) => fn())
  }

  // 新着の印は保存された「まだ見ていない」から決める。帳を閉じて見たことになったら消える
  const syncDot = () => {
    const fresh = store.unseen().length > 0
    newDot.hidden = !fresh
    if (!fresh) bookBtn.classList.remove('is-new')
  }
  syncDot()
  store.onChange(syncDot)
  bookBtn.addEventListener('click', openBook)
  fallbackBook.addEventListener('click', openBook)

  return {
    show: () => {
      open = true
      root.hidden = false
      // overflow: clip が効かない古いブラウザでも、ずれたまま出さない
      root.scrollTop = 0
      // 帰ってきた時、新しいともだちがいれば帳のボタンを少し弾ませる
      syncDot()
      if (!newDot.hidden && !reduceMotion) bookBtn.classList.add('is-new')
    },
    hide: () => {
      open = false
      root.hidden = true
    },
    isOpen: () => open,
    onEnter: (fn) => {
      enterListeners.push(fn)
    },
    onBook: (fn) => {
      bookListeners.push(fn)
    },
    setReduceMotion: (on) => {
      reduceMotion = on
      root.classList.toggle('is-still', on)
    },
    showFallback: () => {
      fallback.hidden = false
      enterBtn.disabled = true
      scope.disabled = true
    },
  }
}
