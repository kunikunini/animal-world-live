import { t } from './i18n'
import { hideView, showView } from './transition'
import { sound } from '../audio/sound'

/** 同じ子の出会いの音を鳴らし直すまでの間（札が出たり消えたりしても何度も鳴らさない） */
const ENCOUNTER_COOLDOWN_MS = 12000

/**
 * 出会いの導線。そばに来たライオンの頭の上に「双眼鏡 + 名前」のピンを浮かべ、尻尾で頭を指す。
 * 顔を隠さないよう頭の上に置き、名前はピンに合体させる（その個体の名前ラベルは別に出さない）。
 * タップでその個体の観察モニターを開く。
 */
export interface EncounterIcon {
  /** screen は尻尾の先（頭の少し上）。null なら隠す。name はピンの文字 */
  set: (screen: { x: number; y: number } | null, name?: string) => void
  /** 画面上の大きさ（px）。ラベルの重なり回避に使う */
  size: () => { w: number; h: number }
  onTap: (fn: () => void) => void
  setReduceMotion: (on: boolean) => void
}

export function createEncounterIcon(): EncounterIcon {
  const el = document.createElement('button')
  el.type = 'button'
  el.className = 'encounter-pin'
  el.hidden = true
  el.innerHTML = `<span class="pin-body"><svg aria-hidden="true"><use href="#i-bino" /></svg><span class="pin-name"></span></span>`
  document.body.append(el)
  const nameEl = el.querySelector('.pin-name') as HTMLElement

  const listeners: Array<() => void> = []
  // タップの反応を速く。ワールドのタップ移動には渡さない
  el.addEventListener('pointerdown', (e) => e.stopPropagation())
  el.addEventListener('click', (e) => {
    e.stopPropagation()
    listeners.forEach((fn) => fn())
  })

  let visible = false
  let currentName = ''
  const heardAt = new Map<string, number>()
  let w = 0
  let h = 0

  return {
    set: (screen, name) => {
      const next = screen !== null
      if (next !== visible) {
        if (next) {
          const key = name ?? currentName
          const now = performance.now()
          if (now - (heardAt.get(key) ?? -Infinity) > ENCOUNTER_COOLDOWN_MS) {
            sound.play('encounter')
            sound.say('find', 450)
          }
          heardAt.set(key, now)
        }
        if (next) showView(el)
        else hideView(el)
        visible = next
      }
      if (!screen) return
      if (name !== undefined && name !== currentName) {
        currentName = name
        nameEl.textContent = name
        el.setAttribute('aria-label', t('lookAt', { name }))
        w = 0
      }
      if (w === 0) {
        w = el.offsetWidth
        h = el.offsetHeight
      }
      el.style.transform = `translate(-50%, -100%) translate(${screen.x.toFixed(0)}px, ${screen.y.toFixed(0)}px)`
    },
    size: () => ({ w: w || 150, h: h || 58 }),
    onTap: (fn) => {
      listeners.push(fn)
    },
    setReduceMotion: (on) => {
      el.classList.toggle('is-still', on)
    },
  }
}
