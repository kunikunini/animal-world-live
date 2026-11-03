/**
 * 往復の演出。画面が双眼鏡の形（重なった 2 つの円）に絞られ、また広がる。
 * close() で幕が閉じ、open() で開く。「動きをへらす」のときは短いフェードにする。
 */
export interface Iris {
  close: () => Promise<void>
  open: () => Promise<void>
  setReduceMotion: (on: boolean) => void
}

const CLOSE_MS = 420
const OPEN_MS = 520

function easeIn(t: number): number {
  return t * t
}

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t)
}

export function createIris(): Iris {
  const svg = document.getElementById('iris') as unknown as SVGSVGElement
  const path = document.getElementById('iris-path') as unknown as SVGPathElement
  let reduceMotion = false

  /** 外枠の矩形から 2 つの円を抜く（evenodd） */
  const draw = (r: number) => {
    const w = window.innerWidth
    const h = window.innerHeight
    const off = Math.min(w, h) * 0.16
    const cy = h / 2
    const circle = (cx: number) =>
      r <= 0 ? '' : `M${cx - r} ${cy} a${r} ${r} 0 1 0 ${r * 2} 0 a${r} ${r} 0 1 0 ${-r * 2} 0 Z `
    path.setAttribute('d', `M0 0 H${w} V${h} H0 Z ${circle(w / 2 - off)}${circle(w / 2 + off)}`)
  }

  /** 画面全体が円の中に入る半径 */
  const maxRadius = () => {
    const w = window.innerWidth
    const h = window.innerHeight
    const off = Math.min(w, h) * 0.16
    return Math.hypot(w / 2 - off, h / 2) + 4
  }

  const animate = (from: number, to: number, ms: number, ease: (t: number) => number) =>
    new Promise<void>((resolve) => {
      const start = performance.now()
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / ms)
        draw(from + (to - from) * ease(t))
        if (t < 1) requestAnimationFrame(step)
        else resolve()
      }
      requestAnimationFrame(step)
    })

  const fade = (toOpaque: boolean, ms: number) =>
    new Promise<void>((resolve) => {
      draw(0)
      const start = performance.now()
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / ms)
        svg.style.opacity = String(toOpaque ? t : 1 - t)
        if (t < 1) requestAnimationFrame(step)
        else resolve()
      }
      requestAnimationFrame(step)
    })

  return {
    close: async () => {
      svg.removeAttribute('hidden')
      svg.classList.add('is-blocking')
      svg.style.opacity = '1'
      if (reduceMotion) await fade(true, 220)
      else await animate(maxRadius(), 0, CLOSE_MS, easeIn)
    },
    open: async () => {
      svg.removeAttribute('hidden')
      if (reduceMotion) await fade(false, 260)
      else await animate(0, maxRadius(), OPEN_MS, easeOut)
      svg.setAttribute('hidden', '')
      svg.classList.remove('is-blocking')
      svg.style.opacity = '1'
    },
    setReduceMotion: (on) => {
      reduceMotion = on
    },
  }
}
