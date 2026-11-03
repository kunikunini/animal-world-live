/**
 * 画面左下の半透明バーチャルスティック（スマホ用）。
 * タップ移動は大まかな移動、スティックは細かい移動。倒した量で速さが変わる。
 * 出力はカメラ基準の (x, z)。x は右が +、z は前（奥）が −（WASD と同じ向き）。
 */
export interface Joystick {
  show: () => void
  hide: () => void
  /** 画面が開いている間は受け付けない */
  setEnabled: (on: boolean) => void
  /** 倒している間は毎回、離したら (0, 0) */
  onChange: (fn: (x: number, z: number) => void) => void
}

export function createJoystick(): Joystick {
  const base = document.getElementById('stick') as HTMLElement
  const knob = base.querySelector('.stick-knob') as HTMLElement
  const listeners: Array<(x: number, z: number) => void> = []
  let enabled = true
  let pointerId: number | null = null
  let cx = 0
  let cy = 0
  let radius = 40

  const emit = (x: number, z: number) => listeners.forEach((fn) => fn(x, z))

  const place = (dx: number, dy: number) => {
    knob.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`
  }

  const reset = () => {
    pointerId = null
    base.classList.remove('is-active')
    place(0, 0)
    emit(0, 0)
  }

  const move = (clientX: number, clientY: number) => {
    let dx = clientX - cx
    let dy = clientY - cy
    const len = Math.hypot(dx, dy)
    if (len > radius) {
      dx = (dx / len) * radius
      dy = (dy / len) * radius
    }
    place(dx, dy)
    // 上に倒す（dy < 0）と前へ（z は −）
    emit(dx / radius, dy / radius)
  }

  base.addEventListener('pointerdown', (e) => {
    if (!enabled || pointerId !== null) return
    e.preventDefault()
    e.stopPropagation()
    pointerId = e.pointerId
    const r = base.getBoundingClientRect()
    cx = r.left + r.width / 2
    cy = r.top + r.height / 2
    radius = r.width * 0.34
    try {
      base.setPointerCapture(e.pointerId)
    } catch {
      // 取れなくても動く（指が外れたら pointerup / pointercancel で戻す）
    }
    base.classList.add('is-active')
    move(e.clientX, e.clientY)
  })
  base.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pointerId) return
    e.preventDefault()
    move(e.clientX, e.clientY)
  })
  const end = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return
    if (base.hasPointerCapture(e.pointerId)) base.releasePointerCapture(e.pointerId)
    reset()
  }
  base.addEventListener('pointerup', end)
  base.addEventListener('pointercancel', end)
  base.addEventListener('lostpointercapture', () => {
    if (pointerId !== null) reset()
  })

  return {
    show: () => {
      base.hidden = false
    },
    hide: () => {
      base.hidden = true
    },
    setEnabled: (on) => {
      enabled = on
      if (!on && pointerId !== null) reset()
    },
    onChange: (fn) => {
      listeners.push(fn)
    },
  }
}
