/**
 * ダッシュのボタン（ジャンプの上）と、がんばりゲージ（主人公の頭の右に出る丸いゲージ）。
 * - ボタン: 押すとダッシュ。押したまま（0.3 秒より長く）なら離した時に止める、短く押したら止まるまで続く
 * - ゲージ: 満タンで走っていない時は消える。走ると緑が減り、少なくなると黄色、息切れ中は赤で満タンまで戻るのを見せる
 */
export interface StaminaState {
  value: number
  dashing: boolean
  exhausted: boolean
  resting: boolean
}

export interface StaminaUi {
  /** 毎フレーム。x, y は主人公の頭の画面座標（px）、見えない時は null */
  update: (dt: number, state: StaminaState, at: { x: number; y: number } | null) => void
  /** ダッシュのボタンが押された・離された */
  onDash: (fn: (on: boolean) => void) => void
  /** ダッシュが自分で止まった時に、ボタンの見た目を戻す */
  setDashOn: (on: boolean) => void
  setEnabled: (on: boolean) => void
}

const RING = 2 * Math.PI * 15
const HOLD_MS = 300

export function createStaminaUi(): StaminaUi {
  const btn = document.getElementById('dash') as HTMLButtonElement
  const gauge = document.getElementById('stamina') as HTMLElement
  const fg = gauge.querySelector('.st-fg') as SVGCircleElement
  fg.style.strokeDasharray = `${RING}`
  // ジャンプとダッシュの人形の絵が読めない時は、下の記号を見せる
  for (const img of document.querySelectorAll<HTMLImageElement>('#dash img, #jump img')) {
    img.addEventListener('error', () => {
      img.hidden = true
    })
  }
  const listeners: Array<(on: boolean) => void> = []
  let on = false
  let enabled = true
  let downAt = 0
  let pointer: number | null = null
  let shown = 0 // 表示の濃さ（0〜1）
  let fullT = 0

  const set = (next: boolean) => {
    on = next
    btn.classList.toggle('is-on', on)
    btn.setAttribute('aria-pressed', String(on))
    listeners.forEach((fn) => fn(on))
  }

  btn.addEventListener('pointerdown', (e) => {
    if (!enabled || btn.classList.contains('is-tired')) return
    e.preventDefault()
    pointer = e.pointerId
    downAt = performance.now()
    try {
      btn.setPointerCapture(e.pointerId)
    } catch {
      // 取れなくても動く
    }
    // 走っている時に短く押したら止める
    if (on) {
      set(false)
      pointer = null
      return
    }
    set(true)
  })
  const release = (e: PointerEvent) => {
    if (e.pointerId !== pointer) return
    pointer = null
    if (on && performance.now() - downAt > HOLD_MS) set(false)
  }
  btn.addEventListener('pointerup', release)
  btn.addEventListener('pointercancel', release)
  // キーボード（Enter / Space）では切り替え
  btn.addEventListener('click', (e) => {
    if ((e as PointerEvent).pointerType) return
    if (!enabled) return
    set(!on)
  })

  return {
    update: (dt, s, at) => {
      btn.classList.toggle('is-tired', s.exhausted)
      // 満タンで走っていない時は 0.6 秒たってから消す
      const want = s.dashing || s.value < 1 || s.exhausted ? 1 : 0
      fullT = want ? 0 : fullT + dt
      const target = want || fullT < 0.6 ? 1 : 0
      shown += (target - shown) * Math.min(1, dt * 8)
      if (shown < 0.02 || !at) {
        if (!gauge.hidden) gauge.hidden = true
        return
      }
      if (gauge.hidden) gauge.hidden = false
      gauge.style.opacity = shown.toFixed(2)
      gauge.style.transform = `translate(${(at.x + 26).toFixed(1)}px, ${(at.y - 22).toFixed(1)}px)`
      fg.style.strokeDashoffset = `${(RING * (1 - s.value)).toFixed(2)}`
      gauge.classList.toggle('is-low', !s.exhausted && s.value < 0.3)
      gauge.classList.toggle('is-tired', s.exhausted)
      gauge.classList.toggle('is-resting', s.resting)
    },
    onDash: (fn) => {
      listeners.push(fn)
    },
    setDashOn: (next) => {
      if (next === on) return
      on = next
      btn.classList.toggle('is-on', on)
      btn.setAttribute('aria-pressed', String(on))
    },
    setEnabled: (next) => {
      enabled = next
      if (!next && on) set(false)
    },
  }
}
