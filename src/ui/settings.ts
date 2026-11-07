/**
 * 設定。ホームの歯車から開くシート。「動きをへらす」「操作の感度」「音」「言語」（日本語・English）など。
 * 「動きをへらす」は前と同じ保存キーを使う（ワールドの HUD にあった時の選択を引き継ぐ）。
 * 保存が無ければ端末の「視差効果を減らす」に従う。
 */
import { getLang, onLangChange, setLang, t, type Lang } from './i18n'
import { bindAudioLogGesture } from '../debug/audioLog'
import { sound, type FriendSound } from '../audio/sound'
import { setViewOpen } from './transition'
import { bindSoundControls } from './soundControls'

const MOTION_KEY = 'awl.reduceMotion'
const SENS_KEY = 'awl.sensitivity'
/** 操作の感度の既定（1 が 11/6 までの速さ。くにの「感度が高いので半分くらいに」） */
const SENS_DEFAULT = 0.5

export interface Settings {
  open: () => void
  close: () => void
  isOpen: () => boolean
  readonly reduceMotion: boolean
  onReduceMotionChange: (fn: (on: boolean) => void) => void
  /** 操作の感度（0.1〜1） */
  readonly sensitivity: number
  onSensitivityChange: (fn: (s: number) => void) => void
  /** 「あそび方をもう一度見る」が押された（シートは閉じてから伝える） */
  onReplayGuide: (fn: () => void) => void
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

function readSensitivity(): number {
  try {
    const v = localStorage.getItem(SENS_KEY)
    const n = v === null ? NaN : Number(v)
    if (Number.isFinite(n)) return Math.min(1, Math.max(0.1, n))
  } catch {
    // localStorage が使えない環境では既定値にする
  }
  return SENS_DEFAULT
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
  // 実機の調べ用: 見出し「設定」を 2 秒のうちに 5 回押すと、閉じる・スリープの時の音の記録を出す
  const titleEl = root.querySelector<HTMLElement>('.sheet-title')
  if (titleEl) bindAudioLogGesture(titleEl)
  const closeBtn = document.getElementById('settings-close') as HTMLButtonElement
  const openBtn = document.getElementById('home-settings') as HTMLButtonElement
  const motion = document.getElementById('reduce-motion') as HTMLInputElement
  const replayBtn = document.getElementById('replay-guide') as HTMLButtonElement

  const prefers = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  let reduceMotion = readMotion() ?? prefers
  motion.checked = reduceMotion
  const motionListeners: Array<(on: boolean) => void> = []
  motion.addEventListener('change', () => {
    reduceMotion = motion.checked
    writeMotion(reduceMotion)
    motionListeners.forEach((fn) => fn(reduceMotion))
  })

  // 操作の感度: つまみは 10〜100（100 が 11/6 までの速さ）
  const sens = document.getElementById('sensitivity') as HTMLInputElement
  let sensitivity = readSensitivity()
  sens.value = String(Math.round(sensitivity * 100))
  const sensListeners: Array<(s: number) => void> = []
  sens.addEventListener('input', () => {
    sensitivity = Number(sens.value) / 100
    try {
      localStorage.setItem(SENS_KEY, String(sensitivity))
    } catch {
      // 保存できなくても動作は続ける
    }
    sensListeners.forEach((fn) => fn(sensitivity))
  })

  // 言語: 押した方に切り替える。押されている方は aria-pressed
  const langBtns = [...root.querySelectorAll<HTMLButtonElement>('button[data-lang]')]
  const syncLang = () => {
    for (const b of langBtns) b.setAttribute('aria-pressed', String(b.dataset.lang === getLang()))
  }
  syncLang()
  onLangChange(syncLang)
  for (const b of langBtns) b.addEventListener('click', () => setLang(b.dataset.lang as Lang))

  // 音: BGM・まわりの音・効果音の音量とオン・オフ（HUD の音の板と同じつまみ）。ともだちになる音の聴きくらべ
  bindSoundControls(root)
  // 「くわしく設定」で 3 つのつまみを開け閉めする（閉じた状態から始める）
  const moreBtn = document.getElementById('sound-more') as HTMLButtonElement
  const detail = document.getElementById('sound-detail') as HTMLElement
  const moreLabel = moreBtn.querySelector('span') as HTMLElement
  const syncMore = () => {
    const open = !detail.hidden
    moreBtn.setAttribute('aria-expanded', String(open))
    moreLabel.dataset.i18n = open ? 'soundLess' : 'soundMore'
    moreLabel.textContent = t(open ? 'soundLess' : 'soundMore')
  }
  moreBtn.addEventListener('click', () => {
    detail.hidden = !detail.hidden
    syncMore()
  })
  onLangChange(syncMore)
  const friendBtns = [...root.querySelectorAll<HTMLButtonElement>('button[data-friend-sound]')]
  const syncFriend = () => {
    for (const b of friendBtns) b.setAttribute('aria-pressed', String(b.dataset.friendSound === sound.friendSound))
  }
  syncFriend()
  sound.onChange(syncFriend)
  for (const b of friendBtns) {
    b.addEventListener('click', () => {
      sound.setFriendSound(b.dataset.friendSound as FriendSound)
      sound.play('friend')
    })
  }

  let open = false
  const setOpen = (next: boolean) => {
    if (open === next) return
    open = next
    setViewOpen(root, open)
    if (open) closeBtn.focus()
    else openBtn.focus()
  }
  openBtn.addEventListener('click', () => setOpen(true))
  const replayListeners: Array<() => void> = []
  replayBtn.addEventListener('click', () => {
    setOpen(false)
    replayListeners.forEach((fn) => fn())
  })
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
    get sensitivity() {
      return sensitivity
    },
    onSensitivityChange: (fn) => {
      sensListeners.push(fn)
    },
    onReplayGuide: (fn) => {
      replayListeners.push(fn)
    },
  }
}
