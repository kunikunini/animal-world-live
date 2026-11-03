/**
 * 出会いの導線。そばに来たライオンの頭に、光る双眼鏡のアイコンを重ねる。
 * タップでその個体の観察モニターを開く。文字やカードは出さない。
 */
export interface EncounterIcon {
  /** screen はアイコンの中心。null なら隠す。name はアクセシビリティ用 */
  set: (screen: { x: number; y: number } | null, name?: string) => void
  /** 画面上の直径（px） */
  size: () => number
  onTap: (fn: () => void) => void
  setReduceMotion: (on: boolean) => void
}

const BINOCULARS_SVG = `
<svg viewBox="0 0 40 40" aria-hidden="true" fill="currentColor">
  <g transform="rotate(-16 20 20)">
    <path d="M9 5h6v7l3 2v15a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V14l3-2z" />
    <path d="M25 5h6v7l3 2v15a3 3 0 0 1-3 3H25a3 3 0 0 1-3-3V14l3-2z" />
    <rect x="15" y="10" width="10" height="6" rx="1.5" opacity="0.85" />
    <circle cx="20" cy="8" r="2.4" opacity="0.85" />
    <ellipse cx="11" cy="32" rx="7" ry="2.6" />
    <ellipse cx="29" cy="32" rx="7" ry="2.6" />
    <ellipse cx="11" cy="32" rx="4.6" ry="1.7" fill="#2b1d12" opacity="0.6" />
    <ellipse cx="29" cy="32" rx="4.6" ry="1.7" fill="#2b1d12" opacity="0.6" />
  </g>
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
        el.style.transform = `translate(-50%, -50%) translate(${screen.x.toFixed(0)}px, ${screen.y.toFixed(0)}px)`
        if (name) el.setAttribute('aria-label', `${name}を双眼鏡で見る`)
      }
    },
    size: () => el.offsetWidth || 56,
    onTap: (fn) => {
      listeners.push(fn)
    },
    setReduceMotion: (on) => {
      el.classList.toggle('is-still', on)
    },
  }
}
