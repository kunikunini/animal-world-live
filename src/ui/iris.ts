/**
 * 往復の演出。画面が双眼鏡の形（重なった 2 つの円）に絞られ、また広がる。
 * close() で幕が閉じ、open() で開く。「動きをへらす」のときは短いフェードにする。
 * 2 つの円の重なりも透けるよう、塗りではなくマスク（白い矩形から黒い円を抜く）で描く。
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
  const left = document.getElementById('iris-l') as unknown as SVGCircleElement
  const right = document.getElementById('iris-r') as unknown as SVGCircleElement
  let reduceMotion = false

  /** 2 つの円の半径。0 で全面が幕 */
  const draw = (r: number) => {
    const w = window.innerWidth
    const h = window.innerHeight
    const off = Math.min(w, h) * 0.16
    const cy = h / 2
    left.setAttribute('cx', String(w / 2 - off))
    right.setAttribute('cx', String(w / 2 + off))
    left.setAttribute('cy', String(cy))
    right.setAttribute('cy', String(cy))
    left.setAttribute('r', String(Math.max(0, r)))
    right.setAttribute('r', String(Math.max(0, r)))
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
