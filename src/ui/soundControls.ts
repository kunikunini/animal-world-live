/**
 * 音の音量とオン・オフのつまみ。設定のシートと、ワールドの HUD の音のボタン（地図の下、双眼鏡の右）から開く小さな板の両方で使う。
 * - `input[data-vol="bgm|amb|se"]` が音量（0〜100）、`button[data-mute="bgm|amb|se"]` がオン・オフ
 * - どちらで変えても sound.onChange でもう片方もそろう。値はこの端末に覚える（sound.ts）
 */
import { sound, type SoundChannel } from '../audio/sound'
import { onLangChange, t } from './i18n'

const CHANNELS: SoundChannel[] = ['bgm', 'amb', 'se']
const MUTE_KEY = { bgm: 'bgmMute', amb: 'ambMute', se: 'seMute' } as const
const UNMUTE_KEY = { bgm: 'bgmUnmute', amb: 'ambUnmute', se: 'seUnmute' } as const

export function bindSoundControls(root: HTMLElement): void {
  const vols = [...root.querySelectorAll<HTMLInputElement>('input[data-vol]')]
  const mutes = [...root.querySelectorAll<HTMLButtonElement>('button[data-mute]')]
  const ch = (el: HTMLElement) => (el.dataset.vol ?? el.dataset.mute) as SoundChannel

  const sync = () => {
    for (const v of vols) v.value = String(Math.round(sound.volume(ch(v)) * 100))
    for (const b of mutes) {
      const c = ch(b)
      const muted = sound.muted(c)
      b.setAttribute('aria-pressed', String(muted))
      b.classList.toggle('is-muted', muted)
      const label = t(muted ? UNMUTE_KEY[c] : MUTE_KEY[c])
      b.setAttribute('aria-label', label)
      b.title = label
      // 設定のシートのボタンはスピーカーの絵を切り替える（HUD の板の札は CSS で消した見た目にする）
      const use = b.querySelector<SVGUseElement>('use[data-swap]')
      if (use) use.setAttribute('href', muted ? '#i-sound-off' : '#i-sound')
    }
  }
  sync()
  sound.onChange(sync)
  onLangChange(sync)

  for (const v of vols) {
    v.addEventListener('input', () => {
      const c = ch(v)
      sound.setVolume(c, Number(v.value) / 100)
      if (sound.muted(c)) sound.setMuted(c, false)
    })
    // 効果音のつまみを離した時に 1 回鳴らして大きさを確かめる
    if (ch(v) === 'se') v.addEventListener('change', () => sound.play('notice'))
  }
  for (const b of mutes) b.addEventListener('click', () => sound.setMuted(ch(b), !sound.muted(ch(b))))
}

/** 3 つともオフか（HUD のボタンの絵を「消音」にする） */
export function allMuted(): boolean {
  return CHANNELS.every((c) => sound.muted(c))
}

/**
 * ワールドの HUD の音のボタンと、押すと開く板。板の外を押す・Esc・もう一度ボタンで閉じる。
 * ボタンの絵は生成画像（public/ui/sound-on.webp・sound-off.webp）。読めなくてもボタンは押せる（スピーカーの記号を下に敷く）
 */
export function createSoundPanel(): { close: () => void } {
  const btn = document.getElementById('hud-sound') as HTMLButtonElement
  const panel = document.getElementById('sound-panel') as HTMLElement
  const img = btn.querySelector('img') as HTMLImageElement
  const base = import.meta.env.BASE_URL
  bindSoundControls(panel)

  const syncIcon = () => {
    const off = allMuted()
    img.src = `${base}ui/${off ? 'sound-off' : 'sound-on'}.webp`
    btn.classList.toggle('is-muted', off)
  }
  syncIcon()
  sound.onChange(syncIcon)
  img.addEventListener('error', () => {
    img.hidden = true
  })

  let open = false
  const setOpen = (next: boolean) => {
    if (open === next) return
    open = next
    panel.hidden = !open
    btn.setAttribute('aria-expanded', String(open))
    if (open) sound.play('tap')
  }
  btn.addEventListener('click', () => setOpen(!open))
  // 板の外を押したら閉じる（ボタン自身は上の click で開け閉めする）
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (!open) return
      const target = e.target as Node
      if (panel.contains(target) || btn.contains(target)) return
      setOpen(false)
    },
    true,
  )
  window.addEventListener('keydown', (e) => {
    if (open && e.key === 'Escape') setOpen(false)
  })
  return { close: () => setOpen(false) }
}
