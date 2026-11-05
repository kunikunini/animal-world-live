import { esc } from './html'
import { sound } from '../audio/sound'
import { t } from './i18n'
import { hideView, showView } from './transition'

export type ToastIcon = 'bino' | 'book' | 'home'

export interface Hud {
  show: () => void
  /** 設定（ホーム）の「動きをへらす」。弾みとトーストの出方に使う */
  setReduceMotion: (on: boolean) => void
  onGoToSpot: (fn: () => void) => void
  /** 「ともだち帳」ボタン */
  onOpenBook: (fn: () => void) => void
  /** 「ジャンプ」ボタン（キーボードの Space と同じ） */
  onJump: (fn: () => void) => void
  /** 「ホームへ」ボタン */
  onGoHome: (fn: () => void) => void
  /** 帳に新しいページが増えたことを、ボタンの一拍の動きで伝える */
  pulseBook: () => void
  /** まだ帳で見ていない新しいともだちがいる間、帳のボタンに点を付ける（数は出さない） */
  setBookNew: (on: boolean) => void
  /** 「観察スポットへ」ボタン。go: スポットへ歩く／scope: 着いている時の「スコープをのぞく」／hidden: 出さない */
  setSpotMode: (mode: 'go' | 'scope' | 'hidden') => void
  /** 3D空間の位置に重ねるスポットのラベル。screen が null なら隠す */
  setSpotLabel: (screen: { x: number; y: number } | null, distance: number) => void
  /**
   * 着いている時の「スコープをのぞく」を、双眼鏡の右上の吹き出しにする。x は双眼鏡の右上、leftX は左上、y は上端の高さ。
   * 右に入らない時は左上、どちらにも入らない時（狭い画面で双眼鏡がまん中）は真上に出す。null なら下のまん中に戻す
   */
  setScopeAnchor: (screen: { x: number; leftX: number; y: number } | null) => void
  /** ボタンを持たない小さな通知。2〜3秒で消える */
  toast: (text: string, icon?: ToastIcon) => void
  /** モニターや帳が開いている間は「ホームへ」を重ねない */
  setOverlayOpen: (open: boolean) => void
  setFps: (fps: number) => void
}

export function createHud(): Hud {
  const root = document.getElementById('hud') as HTMLElement
  const fpsEl = document.getElementById('fps') as HTMLElement
  const goToSpotBtn = document.getElementById('goto-spot') as HTMLButtonElement
  const spotLabel = document.getElementById('spot-label') as HTMLElement
  const spotDistance = document.getElementById('spot-distance') as HTMLElement
  const toastEl = document.getElementById('hud-toast') as HTMLElement
  const openBookBtn = document.getElementById('open-book') as HTMLButtonElement
  const jumpBtn = document.getElementById('jump') as HTMLButtonElement
  const goHomeBtn = document.getElementById('go-home') as HTMLButtonElement
  const bookDot = document.getElementById('hud-book-dot') as HTMLElement

  let reduceMotion = false

  const goToListeners: Array<() => void> = []
  goToSpotBtn.addEventListener('click', () => goToListeners.forEach((fn) => fn()))

  const bookListeners: Array<() => void> = []
  openBookBtn.addEventListener('click', () => bookListeners.forEach((fn) => fn()))

  const homeListeners: Array<() => void> = []
  goHomeBtn.addEventListener('click', () => homeListeners.forEach((fn) => fn()))

  const jumpListeners: Array<() => void> = []
  // タップの反応を速く、キーボードフォーカスは奪わない
  jumpBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    jumpListeners.forEach((fn) => fn())
  })

  // fps は通常は出さない。?debug=1 のときだけ
  fpsEl.hidden = new URLSearchParams(location.search).get('debug') !== '1'

  let lastLabelVisible = false
  let spotMode: 'go' | 'scope' | 'hidden' = 'go'
  const spotText = goToSpotBtn.querySelector<HTMLElement>('[data-i18n]')
  const applySpotMode = () => {
    goToSpotBtn.hidden = spotMode === 'hidden'
    const key = spotMode === 'scope' ? 'scopeOpen' : 'gotoSpot'
    goToSpotBtn.dataset.mode = spotMode
    goToSpotBtn.dataset.i18nAria = key
    goToSpotBtn.dataset.i18nTitle = key
    goToSpotBtn.setAttribute('aria-label', t(key))
    goToSpotBtn.title = t(key)
    if (spotText) {
      spotText.dataset.i18n = key
      spotText.textContent = t(key)
    }
  }
  let toastTimer = 0

  // 吹き出しの大きさ（画面からはみ出さないように寄せる時に使う）。付け外しと文言の切り替えの時だけ測る
  let anchored = false
  let bubbleW = 0
  let bubbleH = 0
  const measureBubble = () => {
    bubbleW = goToSpotBtn.offsetWidth
    bubbleH = goToSpotBtn.offsetHeight
  }

  return {
    show: () => {
      root.hidden = false
    },
    setReduceMotion: (on) => {
      reduceMotion = on
    },
    onGoToSpot: (fn) => {
      goToListeners.push(fn)
    },
    onOpenBook: (fn) => {
      bookListeners.push(fn)
    },
    onJump: (fn) => {
      jumpListeners.push(fn)
    },
    onGoHome: (fn) => {
      homeListeners.push(fn)
    },
    pulseBook: () => {
      if (reduceMotion) return
      openBookBtn.classList.remove('is-pulse')
      void openBookBtn.offsetWidth
      openBookBtn.classList.add('is-pulse')
    },
    setBookNew: (on) => {
      bookDot.hidden = !on
      openBookBtn.setAttribute('aria-label', on ? t('bookNew') : t('book'))
    },
    setSpotMode: (mode) => {
      if (mode === spotMode) return
      spotMode = mode
      applySpotMode()
      if (anchored) measureBubble()
    },
    setScopeAnchor: (screen) => {
      const on = screen !== null && spotMode === 'scope'
      if (on !== anchored) {
        anchored = on
        goToSpotBtn.classList.toggle('is-anchored', on)
        if (!on) goToSpotBtn.classList.remove('is-flip', 'is-center')
        if (on) measureBubble()
      }
      if (!on || !screen) return
      // 右上に入らなければ左上（しっぽは右下）、どちらにも入らなければ真上（しっぽは下のまん中）
      const fitsRight = screen.x + bubbleW <= window.innerWidth - 12
      const flip = !fitsRight && screen.leftX - bubbleW >= 12
      const center = !fitsRight && !flip
      goToSpotBtn.classList.toggle('is-flip', flip)
      goToSpotBtn.classList.toggle('is-center', center)
      const left = flip ? screen.leftX - bubbleW : center ? (screen.x + screen.leftX) / 2 - bubbleW / 2 : screen.x
      // 上は帳のボタンの列より下、下は画面の内側に寄せる
      const x = Math.min(Math.max(left, 12), window.innerWidth - bubbleW - 12)
      const y = Math.min(Math.max(screen.y, bubbleH + 84), window.innerHeight - 16)
      goToSpotBtn.style.setProperty('--ax', `${x.toFixed(0)}px`)
      goToSpotBtn.style.setProperty('--ay', `${y.toFixed(0)}px`)
    },
    setSpotLabel: (screen, distance) => {
      const visible = screen !== null
      if (visible !== lastLabelVisible) {
        spotLabel.hidden = !visible
        lastLabelVisible = visible
      }
      if (screen) {
        spotLabel.style.transform = `translate(-50%, -100%) translate(${screen.x.toFixed(0)}px, ${screen.y.toFixed(0)}px)`
        spotDistance.textContent = distance >= 1000 ? '' : t('distance', { n: Math.max(0, Math.round(distance)) })
      }
    },
    toast: (text, icon) => {
      const iconHtml = icon
        ? `<svg class="ico${icon === 'bino' ? ' ico-fill' : ''}" aria-hidden="true"><use href="#i-${icon}" /></svg>`
        : ''
      toastEl.innerHTML = `${iconHtml}<span>${esc(text)}</span>`
      showView(toastEl)
      sound.play('notice')
      window.clearTimeout(toastTimer)
      toastTimer = window.setTimeout(() => hideView(toastEl), 2500)
    },
    setOverlayOpen: (open) => {
      goHomeBtn.hidden = open
    },
    setFps: (fps) => {
      if (!fpsEl.hidden) fpsEl.textContent = `${fps.toFixed(0)} fps`
    },
  }
}
