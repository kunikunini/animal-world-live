/**
 * 設定。ホームの歯車から開くシート。「動きをへらす」と「言語」（日本語・English）。
 * 「動きをへらす」は前と同じ保存キーを使う（ワールドの HUD にあった時の選択を引き継ぐ）。
 * 保存が無ければ端末の「視差効果を減らす」に従う。
 */
import { getLang, onLangChange, setLang, t, type Lang } from './i18n'
import { sound, type FriendSound } from '../audio/sound'
import { setViewOpen } from './transition'

const MOTION_KEY = 'awl.reduceMotion'

export interface Settings {
  open: () => void
  close: () => void
  isOpen: () => boolean
  readonly reduceMotion: boolean
  onReduceMotionChange: (fn: (on: boolean) => void) => void
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

  // 言語: 押した方に切り替える。押されている方は aria-pressed
  const langBtns = [...root.querySelectorAll<HTMLButtonElement>('button[data-lang]')]
  const syncLang = () => {
    for (const b of langBtns) b.setAttribute('aria-pressed', String(b.dataset.lang === getLang()))
  }
  syncLang()
  onLangChange(syncLang)
  for (const b of langBtns) b.addEventListener('click', () => setLang(b.dataset.lang as Lang))

  // 音: BGM（環境音を含む）と効果音の音量・ミュート。ともだちになる音の聴きくらべ
  const volBgm = document.getElementById('vol-bgm') as HTMLInputElement
  const volSe = document.getElementById('vol-se') as HTMLInputElement
  const muteBgm = document.getElementById('mute-bgm') as HTMLButtonElement
  const muteSe = document.getElementById('mute-se') as HTMLButtonElement
  const friendBtns = [...root.querySelectorAll<HTMLButtonElement>('button[data-friend-sound]')]
  const setMuteBtn = (btn: HTMLButtonElement, muted: boolean, muteKey: Parameters<typeof t>[0], unmuteKey: Parameters<typeof t>[0]) => {
    btn.setAttribute('aria-pressed', String(muted))
    btn.classList.toggle('is-muted', muted)
    const label = t(muted ? unmuteKey : muteKey)
    btn.setAttribute('aria-label', label)
    btn.title = label
    ;(btn.querySelector('use') as SVGUseElement).setAttribute('href', muted ? '#i-sound-off' : '#i-sound')
  }
  const syncSound = () => {
    volBgm.value = String(Math.round(sound.bgmVolume * 100))
    volSe.value = String(Math.round(sound.seVolume * 100))
    setMuteBtn(muteBgm, sound.bgmMuted, 'bgmMute', 'bgmUnmute')
    setMuteBtn(muteSe, sound.seMuted, 'seMute', 'seUnmute')
    for (const b of friendBtns) b.setAttribute('aria-pressed', String(b.dataset.friendSound === sound.friendSound))
  }
  syncSound()
  sound.onChange(syncSound)
  onLangChange(syncSound)
  volBgm.addEventListener('input', () => {
    sound.setBgmVolume(Number(volBgm.value) / 100)
    if (sound.bgmMuted) sound.setBgmMuted(false)
  })
  volSe.addEventListener('input', () => {
    sound.setSeVolume(Number(volSe.value) / 100)
    if (sound.seMuted) sound.setSeMuted(false)
  })
  // 効果音のつまみを離した時に 1 回鳴らして大きさを確かめる
  volSe.addEventListener('change', () => sound.play('notice'))
  muteBgm.addEventListener('click', () => sound.setBgmMuted(!sound.bgmMuted))
  muteSe.addEventListener('click', () => sound.setSeMuted(!sound.seMuted))
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
    onReplayGuide: (fn) => {
      replayListeners.push(fn)
    },
  }
}
