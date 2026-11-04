import { esc } from './html'
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
