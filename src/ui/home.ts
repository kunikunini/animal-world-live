import type { FriendBookStore } from '../data/friends'

/**
 * ホーム: 平穏ないつもの世界。入口（アニマルスコープ）と、ともだち帳の居場所。
 * 2.5 層の絵（CSS 変数 --px/--py でポインタに合わせて少し動く）。
 * ワールドから帰ってくると、スコープのレンズに最後に見た景色が映り、
 * ともだちが増えていれば帳のボタンに印が付く。
 */
export interface HomeView {
  show: () => void
  hide: () => void
  isOpen: () => boolean
  /** 「のぞいてみる」とスコープのタップ */
  onEnter: (fn: () => void) => void
  /** 「ともだち帳」 */
  onBook: (fn: () => void) => void
  /** スコープのレンズに映す画像（data URL）。ワールドのスナップショット */
  setPeek: (url: string) => void
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
  const peekL = document.getElementById('home-peek-l') as unknown as SVGImageElement
  const peekR = document.getElementById('home-peek-r') as unknown as SVGImageElement

  let open = true
  let reduceMotion = false
  let seenCount = store.list().length
  const enterListeners: Array<() => void> = []
  const bookListeners: Array<() => void> = []

  const enter = () => enterListeners.forEach((fn) => fn())
  scope.addEventListener('click', enter)
  enterBtn.addEventListener('click', enter)
  const openBook = () => {
    newDot.hidden = true
    bookBtn.classList.remove('is-new')
    seenCount = store.list().length
    bookListeners.forEach((fn) => fn())
  }
  bookBtn.addEventListener('click', openBook)
  fallbackBook.addEventListener('click', openBook)

  // 視差: ポインタの位置で層を少しずらす。動きをへらす時は止める
  const onMove = (e: PointerEvent) => {
    if (reduceMotion || !open) return
    const px = (e.clientX / window.innerWidth - 0.5) * 2
    const py = (e.clientY / window.innerHeight - 0.5) * 2
    root.style.setProperty('--px', px.toFixed(3))
    root.style.setProperty('--py', py.toFixed(3))
  }
  root.addEventListener('pointermove', onMove)

  return {
    show: () => {
      open = true
      root.hidden = false
      // 帰ってきた時、ともだちが増えていれば帳のボタンに印
      const count = store.list().length
      if (count > seenCount) {
        newDot.hidden = false
        if (!reduceMotion) bookBtn.classList.add('is-new')
      }
    },
    hide: () => {
      open = false
      root.hidden = true
      root.style.setProperty('--px', '0')
      root.style.setProperty('--py', '0')
    },
    isOpen: () => open,
    onEnter: (fn) => {
      enterListeners.push(fn)
    },
    onBook: (fn) => {
      bookListeners.push(fn)
    },
    setPeek: (url) => {
      if (!url) return
      peekL.setAttribute('href', url)
      peekR.setAttribute('href', url)
    },
    setReduceMotion: (on) => {
      reduceMotion = on
      root.classList.toggle('is-still', on)
      if (on) {
        root.style.setProperty('--px', '0')
        root.style.setProperty('--py', '0')
      }
    },
    showFallback: () => {
      fallback.hidden = false
      enterBtn.disabled = true
      scope.disabled = true
    },
  }
}
