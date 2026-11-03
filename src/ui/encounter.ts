/**
 * 出会いの導線。そばに来たライオンの頭の上に、光る双眼鏡のアイコンを浮かせる。
 * タップでその個体の観察モニターを開く。文字やカードは出さない。
 */
export interface EncounterIcon {
  /** screen が null なら隠す。name はアクセシビリティ用 */
  set: (screen: { x: number; y: number } | null, name?: string) => void
  onTap: (fn: () => void) => void
  setReduceMotion: (on: boolean) => void
}

const BINOCULARS_SVG = `
<svg viewBox="0 0 32 32" aria-hidden="true" fill="currentColor">
  <rect x="9" y="4" width="5" height="8" rx="1.5" />
  <rect x="18" y="4" width="5" height="8" rx="1.5" />
  <rect x="13" y="9" width="6" height="5" rx="1.2" opacity="0.85" />
  <circle cx="10" cy="20" r="7" />
  <circle cx="22" cy="20" r="7" />
  <circle cx="10" cy="20" r="3.2" fill="#2b1d12" opacity="0.55" />
  <circle cx="22" cy="20" r="3.2" fill="#2b1d12" opacity="0.55" />
</svg>`

export function createEncounterIcon(): EncounterIcon {
  const el = document.createElement('button')
  el.type = 'button'
  el.className = 'encounter-icon'
  el.hidden = true
  el.innerHTML = BINOCULARS_SVG
  document.body.append(el)

  const listeners: Array<() => void> = []
  // タップの反応を速く。ワールドのタップ移動には渡さない
  el.addEventListener('pointerdown', (e) => e.stopPropagation())
  el.addEventListener('click', (e) => {
    e.stopPropagation()
    listeners.forEach((fn) => fn())
  })

  let visible = false

  return {
    set: (screen, name) => {
      const next = screen !== null
      if (next !== visible) {
        el.hidden = !next
        visible = next
      }
      if (screen) {
        el.style.transform = `translate(-50%, -100%) translate(${screen.x.toFixed(0)}px, ${screen.y.toFixed(0)}px)`
        if (name) el.setAttribute('aria-label', `${name}を双眼鏡で見る`)
      }
    },
    onTap: (fn) => {
      listeners.push(fn)
    },
    setReduceMotion: (on) => {
      el.classList.toggle('is-still', on)
    },
  }
}
