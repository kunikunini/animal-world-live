/**
 * 往復の演出。画面が双眼鏡の形（重なった 2 つの円）に絞られ、また広がる。
 * close() で幕が閉じ、open() で開く。「動きをへらす」のときは短いフェードにする。
 *
 * canvas に描く（幕を塗ってから 2 つの円を destination-out で抜く）。以前の SVG マスクは
 * iPhone で「ただ画面が切り替わるだけ」に見えた（11/4 実機）。マスクの中身の変化が描き直されない
 * 可能性があるので、どのブラウザでも毎フレーム確実に描ける canvas にした。
 * 進み方はフレームごとの経過を最大 1/30 秒に抑えて足す。ワールドの初回構築やシェーダーの
 * コンパイルでフレームが詰まっても、演出が一気に飛ばずに見える。
 */
export interface Iris {
  close: () => Promise<void>
  open: () => Promise<void>
  setReduceMotion: (on: boolean) => void
  /** 幕が閉じている間の「じゅんびちゅう」。少し待っても開かない時だけ浮かび上がる（CSS の遅延） */
  setWaiting: (on: boolean) => void
}

const CLOSE_MS = 420
const OPEN_MS = 520
/** 1 フレームで進める最大の時間 */
const MAX_STEP_MS = 34
const CURTAIN = '#13192b'

function easeIn(t: number): number {
  return t * t
}

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t)
}

const nextFrame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve))

export function createIris(): Iris {
  const canvas = document.getElementById('iris') as HTMLCanvasElement
  const ctx = canvas.getContext('2d')
  const wait = document.getElementById('iris-wait') as HTMLElement
  let reduceMotion = false

  const fit = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = Math.round(window.innerWidth * dpr)
    const h = Math.round(window.innerHeight * dpr)
    if (canvas.width !== w) canvas.width = w
    if (canvas.height !== h) canvas.height = h
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  /** 2 つの円の半径。0 で全面が幕 */
  const draw = (r: number) => {
    if (!ctx) return
    const w = window.innerWidth
    const h = window.innerHeight
    const off = Math.min(w, h) * 0.16
    ctx.globalCompositeOperation = 'source-over'
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = CURTAIN
    ctx.fillRect(0, 0, w, h)
    if (r <= 0) return
    ctx.globalCompositeOperation = 'destination-out'
    ctx.beginPath()
    ctx.arc(w / 2 - off, h / 2, r, 0, Math.PI * 2)
    ctx.arc(w / 2 + off, h / 2, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalCompositeOperation = 'source-over'
  }

  /** 画面全体が円の中に入る半径 */
  const maxRadius = () => {
    const w = window.innerWidth
    const h = window.innerHeight
    const off = Math.min(w, h) * 0.16
    return Math.hypot(w / 2 - off, h / 2) + 4
  }

  /** progress(t) を 0→1 で回す。経過はフレームごとに MAX_STEP_MS まで */
  const run = async (ms: number, progress: (t: number) => void) => {
    progress(0)
    let last = await nextFrame()
    let elapsed = 0
    while (elapsed < ms) {
      const now = await nextFrame()
      elapsed += Math.min(MAX_STEP_MS, now - last)
      last = now
      progress(Math.min(1, elapsed / ms))
    }
  }

  return {
    close: async () => {
      fit()
      canvas.hidden = false
      canvas.classList.add('is-blocking')
      if (reduceMotion) {
        draw(0)
        await run(220, (t) => (canvas.style.opacity = String(t)))
      } else {
        canvas.style.opacity = '1'
        const max = maxRadius()
        await run(CLOSE_MS, (t) => draw(max * (1 - easeIn(t))))
      }
    },
    open: async () => {
      fit()
      canvas.hidden = false
      draw(0)
      // 幕の裏でワールドの最初の重いフレームを済ませてから開く
      await nextFrame()
      await nextFrame()
      wait.hidden = true
      if (reduceMotion) {
        await run(260, (t) => (canvas.style.opacity = String(1 - t)))
      } else {
        const max = maxRadius()
        await run(OPEN_MS, (t) => draw(max * easeOut(t)))
      }
      canvas.hidden = true
      canvas.classList.remove('is-blocking')
      canvas.style.opacity = '1'
    },
    setReduceMotion: (on) => {
      reduceMotion = on
    },
    setWaiting: (on) => {
      wait.hidden = !on
    },
  }
}
