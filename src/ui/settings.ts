/**
 * 設定。ホームの歯車から開くシート。「動きをへらす」と「言語」（日本語・English）。
 * 「動きをへらす」は前と同じ保存キーを使う（ワールドの HUD にあった時の選択を引き継ぐ）。
 * 保存が無ければ端末の「視差効果を減らす」に従う。
 */
import { getLang, onLangChange, setLang, type Lang } from './i18n'

const MOTION_KEY = 'awl.reduceMotion'

export interface Settings {
  open: () => void
  close: () => void
  isOpen: () => boolean
  readonly reduceMotion: boolean
  onReduceMotionChange: (fn: (on: boolean) => void) => void
}

function readMotion(): boolean | null {
  try {
    const v = localStorage.getItem(MOTION_KEY)
    if (v === '1') return true
    if (v === '0') return false
  } catch {
    // localStorage が使えない環境では既定値にする
  }
  return null
}

function writeMotion(on: boolean): void {
  try {
    localStorage.setItem(MOTION_KEY, on ? '1' : '0')
  } catch {
    // 保存できなくても動作は続ける
  }
}

export function createSettings(): Settings {
  const root = document.getElementById('settings') as HTMLElement
  const closeBtn = document.getElementById('settings-close') as HTMLButtonElement
  const openBtn = document.getElementById('home-settings') as HTMLButtonElement
  const motion = document.getElementById('reduce-motion') as HTMLInputElement

  const prefers = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  let reduceMotion = readMotion() ?? prefers
  motion.checked = reduceMotion
  const motionListeners: Array<(on: boolean) => void> = []
  motion.addEventListener('change', () => {
    reduceMotion = motion.checked
    writeMotion(reduceMotion)
    motionListeners.forEach((fn) => fn(reduceMotion))
  })

  // 言語: 押した方に切り替える。押されている方は aria-pressed
  const langBtns = [...root.querySelectorAll<HTMLButtonElement>('button[data-lang]')]
  const syncLang = () => {
    for (const b of langBtns) b.setAttribute('aria-pressed', String(b.dataset.lang === getLang()))
  }
  syncLang()
  onLangChange(syncLang)
  for (const b of langBtns) b.addEventListener('click', () => setLang(b.dataset.lang as Lang))

  let open = false
  const setOpen = (next: boolean) => {
    if (open === next) return
    open = next
    root.hidden = !open
    if (open) closeBtn.focus()
    else openBtn.focus()
  }
  openBtn.addEventListener('click', () => setOpen(true))
  closeBtn.addEventListener('click', () => setOpen(false))
  root.addEventListener('click', (e) => {
    if (e.target === root) setOpen(false)
  })
  window.addEventListener('keydown', (e) => {
    if (open && e.key === 'Escape') setOpen(false)
  })

  return {
    open: () => setOpen(true),
    close: () => setOpen(false),
    isOpen: () => open,
    get reduceMotion() {
      return reduceMotion
    },
    onReduceMotionChange: (fn) => {
      motionListeners.push(fn)
    },
  }
}
