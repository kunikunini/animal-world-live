const STORAGE_KEY = 'awl.reduceMotion'

export interface Hud {
  show: () => void
  reduceMotion: boolean
  onReduceMotionChange: (fn: (on: boolean) => void) => void
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

  const prefers = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const stored = readStored()
  let reduceMotion = stored ?? prefers
  checkbox.checked = reduceMotion

  const listeners: Array<(on: boolean) => void> = []
  checkbox.addEventListener('change', () => {
    reduceMotion = checkbox.checked
    writeStored(reduceMotion)
    listeners.forEach((fn) => fn(reduceMotion))
  })

  if (import.meta.env.DEV) fpsEl.hidden = false

  return {
    show: () => {
      root.hidden = false
    },
    get reduceMotion() {
      return reduceMotion
    },
    onReduceMotionChange: (fn) => {
      listeners.push(fn)
    },
    setFps: (fps) => {
      if (!fpsEl.hidden) fpsEl.textContent = `${fps.toFixed(0)} fps`
    },
  }
}
