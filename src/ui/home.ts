import type { FriendBookStore } from '../data/friends'
import { HEROES, getHeroId } from '../data/heroes'
import { getLang, onLangChange } from './i18n'
import { sound } from '../audio/sound'

/**
 * ホーム: キービジュアル 1 枚と、入口（「のぞいてみる」と絵の中の双眼鏡）、ともだち帳の居場所。
 * 絵は画面の縦横比で CSS が選ぶ。
 * まだ帳で見ていない新しいともだちがいれば、帳のボタンに印が付く（印は帳を閉じた時に消える）。
 * 「だれで冒険する？」: 「のぞいてみる」（または絵の双眼鏡）を押すと、同じホームの上に出てくる。名簿の子どもたちを同じ大きさで並べ、
 * 押した子でそのまま冒険に出る（選んだ子に輪と印。前に選んだ子が最初から選ばれている）。矢印キーで動かし、Enter / Space で決める。
 * まわりを押すか Esc で閉じてホームに戻る。
 */
export interface HomeView {
  show: () => void
  hide: () => void
  isOpen: () => boolean
  /** 「だれで冒険する？」で子を選び終えた時（「のぞいてみる」とスコープのタップのあと） */
  onEnter: (fn: () => void) => void
  /** 「ともだち帳」 */
  onBook: (fn: () => void) => void
  /** 「物語をみる」（紙芝居のオープニングをもう一度） */
  onStory: (fn: () => void) => void
  /** 「だれで冒険する？」を開く（物語を最後まで見たあとに、そのまま冒険へ） */
  openPick: () => void
  setReduceMotion: (on: boolean) => void
  /** WebGL が無い時: 入口を無効にして案内を出す */
  showFallback: () => void
  /** 「だれで冒険する？」で子を選んだ時（名簿の id） */
  onHero: (fn: (id: string) => void) => void
}

export function createHome(store: FriendBookStore): HomeView {
  const root = document.getElementById('home') as HTMLElement
  const scope = document.getElementById('home-scope') as HTMLButtonElement
  const enterBtn = document.getElementById('enter') as HTMLButtonElement
  const bookBtn = document.getElementById('entry-book') as HTMLButtonElement
  const storyBtn = document.getElementById('home-story') as HTMLButtonElement
  const newDot = document.getElementById('home-new-dot') as HTMLElement
  const fallback = document.getElementById('fallback') as HTMLElement
  const fallbackBook = document.getElementById('fallback-book') as HTMLButtonElement

  let open = true
  let reduceMotion = false
  const enterListeners: Array<() => void> = []
  const bookListeners: Array<() => void> = []
  const storyListeners: Array<() => void> = []

  const enter = () => enterListeners.forEach((fn) => fn())
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
  storyBtn.addEventListener('click', () => storyListeners.forEach((fn) => fn()))

  // だれで冒険する？
  const pickBox = document.getElementById('home-pick') as HTMLElement
  const pickRow = document.getElementById('home-pick-row') as HTMLElement
  const heroListeners: Array<(id: string) => void> = []
  let picked = getHeroId()
  const picks = HEROES.map((h) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'home-pick-btn'
    b.setAttribute('role', 'radio')
    b.dataset.hero = h.id
    const img = document.createElement('img')
    img.src = h.thumb
    img.alt = ''
    img.decoding = 'async'
    img.draggable = false
    b.appendChild(img)
    pickRow.appendChild(b)
    return b
  })
  const syncPick = () => {
    const lang = getLang()
    picks.forEach((b, i) => {
      const on = HEROES[i].id === picked
      b.setAttribute('aria-checked', String(on))
      b.setAttribute('aria-label', HEROES[i].label[lang])
      b.title = HEROES[i].label[lang]
      b.tabIndex = on ? 0 : -1
    })
  }
  const select = (i: number) => {
    const id = HEROES[i].id
    if (id === picked) return
    picked = id
    syncPick()
    heroListeners.forEach((fn) => fn(id))
  }
  // 「のぞいてみる」で開き、子を押したらその子で出発する
  let picking = false
  const openPick = () => {
    if (picking || enterBtn.disabled) return
    picking = true
    syncPick()
    pickBox.hidden = false
    root.classList.add('is-picking')
    const on = picks.find((b) => b.getAttribute('aria-checked') === 'true') ?? picks[0]
    on.focus({ preventScroll: true })
  }
  const closePick = (focusEnter: boolean) => {
    if (!picking) return
    picking = false
    pickBox.hidden = true
    root.classList.remove('is-picking')
    if (focusEnter) enterBtn.focus({ preventScroll: true })
  }
  scope.addEventListener('click', openPick)
  enterBtn.addEventListener('click', openPick)
  picks.forEach((b, i) => {
    b.addEventListener('click', () => {
      select(i)
      // 選んだ子の声で「冒険に出発だ！」（同じ子をもう一度押した時も）
      sound.setVoiceHero(HEROES[i].id)
      sound.say('start', 150)
      closePick(false)
      enter()
    })
    b.addEventListener('keydown', (e) => {
      const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
      if (!step) return
      e.preventDefault()
      // 矢印は選ぶだけ（出発は Enter / Space / タップ）
      const next = (i + step + picks.length) % picks.length
      select(next)
      picks[next].focus()
    })
  })
  // まわり（ホームの絵のところ）を押すか Esc で閉じる
  root.addEventListener('click', (e) => {
    if (!picking) return
    const t = e.target as Node
    if (pickBox.contains(t) || enterBtn.contains(t) || scope.contains(t)) return
    closePick(true)
  })
  window.addEventListener('keydown', (e) => {
    if (picking && e.key === 'Escape') closePick(true)
  })
  syncPick()
  onLangChange(syncPick)

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
      closePick(false)
      root.hidden = true
    },
    isOpen: () => open,
    onStory: (fn) => {
      storyListeners.push(fn)
    },
    openPick: () => {
      if (!open) return
      openPick()
    },
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
    onHero: (fn) => {
      heroListeners.push(fn)
    },
  }
}
