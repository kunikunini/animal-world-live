const STORAGE_KEY = 'awl.reduceMotion'

export interface Hud {
  show: () => void
  reduceMotion: boolean
  onReduceMotionChange: (fn: (on: boolean) => void) => void
  onGoToSpot: (fn: () => void) => void
  /** 「観察スポットへ」ボタンの表示切り替え */
  setGoToSpotVisible: (visible: boolean) => void
  /** 3D空間の位置に重ねるスポットのラベル。screen が null なら隠す */
  setSpotLabel: (screen: { x: number; y: number } | null, distance: number) => void
  /** 到着バナー */
  setArrived: (arrived: boolean) => void
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
  const arrived = document.getElementById('arrived') as HTMLElement

  const prefers = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const stored = readStored()
  let reduceMotion = stored ?? prefers
  checkbox.checked = reduceMotion

  const motionListeners: Array<(on: boolean) => void> = []
  checkbox.addEventListener('change', () => {
    reduceMotion = checkbox.checked
    writeStored(reduceMotion)
    motionListeners.forEach((fn) => fn(reduceMotion))
  })

  const goToListeners: Array<() => void> = []
  goToSpotBtn.addEventListener('click', () => goToListeners.forEach((fn) => fn()))

  if (import.meta.env.DEV) fpsEl.hidden = false

  let lastLabelVisible = false

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
    setArrived: (on) => {
      arrived.hidden = !on
    },
    setFps: (fps) => {
      if (!fpsEl.hidden) fpsEl.textContent = `${fps.toFixed(0)} fps`
    },
  }
}
