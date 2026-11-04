import { esc } from './html'

const STORAGE_KEY = 'awl.reduceMotion'

export type ToastIcon = 'bino' | 'book' | 'home'

export interface Hud {
  show: () => void
  reduceMotion: boolean
  onReduceMotionChange: (fn: (on: boolean) => void) => void
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
  /** 「観察スポットへ」ボタンの表示切り替え */
  setGoToSpotVisible: (visible: boolean) => void
  /** 3D空間の位置に重ねるスポットのラベル。screen が null なら隠す */
  setSpotLabel: (screen: { x: number; y: number } | null, distance: number) => void
  /** ボタンを持たない小さな通知。2〜3秒で消える */
  toast: (text: string, icon?: ToastIcon) => void
  /** モニターや帳が開いている間は「ホームへ」を重ねない */
  setOverlayOpen: (open: boolean) => void
  setFps: (fps: number) => void
}

function readStored(): boolean | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === '1') return true
    if (v === '0') return false
  } catch {
    // localStorage が使えない環境では既定値にする
  }
  return null
}

function writeStored(on: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, on ? '1' : '0')
  } catch {
    // 保存できなくても動作は続ける
  }
}

export function createHud(): Hud {
  const root = document.getElementById('hud') as HTMLElement
  const checkbox = document.getElementById('reduce-motion') as HTMLInputElement
  const fpsEl = document.getElementById('fps') as HTMLElement
  const goToSpotBtn = document.getElementById('goto-spot') as HTMLButtonElement
  const spotLabel = document.getElementById('spot-label') as HTMLElement
  const spotDistance = document.getElementById('spot-distance') as HTMLElement
  const toastEl = document.getElementById('hud-toast') as HTMLElement
  const openBookBtn = document.getElementById('open-book') as HTMLButtonElement
  const jumpBtn = document.getElementById('jump') as HTMLButtonElement
  const goHomeBtn = document.getElementById('go-home') as HTMLButtonElement
  const bookDot = document.getElementById('hud-book-dot') as HTMLElement

  const prefers = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const stored = readStored()
  let reduceMotion = stored ?? prefers
  checkbox.checked = reduceMotion
  const toggleEl = checkbox.closest('.toggle') as HTMLElement
  toggleEl.classList.toggle('is-on', reduceMotion)

  const motionListeners: Array<(on: boolean) => void> = []
  checkbox.addEventListener('change', () => {
    reduceMotion = checkbox.checked
    toggleEl.classList.toggle('is-on', reduceMotion)
    writeStored(reduceMotion)
    motionListeners.forEach((fn) => fn(reduceMotion))
  })

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
  let toastTimer = 0

  return {
    show: () => {
      root.hidden = false
    },
    get reduceMotion() {
      return reduceMotion
    },
    onReduceMotionChange: (fn) => {
      motionListeners.push(fn)
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
      openBookBtn.setAttribute('aria-label', on ? 'ともだち帳（あたらしいともだちがいます）' : 'ともだち帳')
    },
    setGoToSpotVisible: (visible) => {
      goToSpotBtn.hidden = !visible
    },
    setSpotLabel: (screen, distance) => {
      const visible = screen !== null
      if (visible !== lastLabelVisible) {
        spotLabel.hidden = !visible
        lastLabelVisible = visible
      }
      if (screen) {
        spotLabel.style.transform = `translate(-50%, -100%) translate(${screen.x.toFixed(0)}px, ${screen.y.toFixed(0)}px)`
        spotDistance.textContent = distance >= 1000 ? '' : `あと ${Math.max(0, Math.round(distance))} m`
      }
    },
    toast: (text, icon) => {
      const iconHtml = icon
        ? `<svg class="ico${icon === 'bino' ? ' ico-fill' : ''}" aria-hidden="true"><use href="#i-${icon}" /></svg>`
        : ''
      toastEl.innerHTML = `${iconHtml}<span>${esc(text)}</span>`
      toastEl.hidden = false
      toastEl.classList.toggle('is-animated', !reduceMotion)
      window.clearTimeout(toastTimer)
      toastTimer = window.setTimeout(() => {
        toastEl.hidden = true
      }, 2500)
    },
    setOverlayOpen: (open) => {
      goHomeBtn.hidden = open
    },
    setFps: (fps) => {
      if (!fpsEl.hidden) fpsEl.textContent = `${fps.toFixed(0)} fps`
    },
  }
}
