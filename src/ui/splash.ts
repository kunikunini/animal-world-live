// 立ち上げの画面（スプラッシュ、見た目は index.html に直接書いてある）を消す。
// ホームの絵（画面に合う 1 枚）とロゴの字が届いたら、スプラッシュの裏で重い準備（ワールドの組み立て）を済ませてから、ふわっと消す。
// 動き（public/splash.css、スコップが出てロゴが決まるまで）を見せ終えてから消す。遅くても 4.5 秒で見せ終える
// （届かなくてもホームは動く。白い画面で待たせない）。音が出せない時は吹き出しでタップを待つ。タップでもすぐ消える
const SHOW_MS = 3300 // tools/splash-motion.mjs の SHOW_MS と同じ
const MAX_MS = 4500

function kvLoaded(): Promise<void> {
  const home = document.getElementById('home')
  const url = home ? getComputedStyle(home).getPropertyValue('--kv').match(/url\(['"]?([^'")]+)/)?.[1] : undefined
  if (!url) return Promise.resolve()
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = img.onerror = () => resolve()
    img.src = url
  })
}

export function hideSplash(behind?: () => void): void {
  const el = document.getElementById('splash')
  const root = document.documentElement
  if (!el) {
    root.classList.remove('is-splash')
    behind?.()
    return
  }
  let done = false
  const out = () => {
    if (done) return
    done = true
    el.classList.add('is-out')
    // 消え始めたらホームのボタンを「ぽん」と出す
    root.classList.remove('is-splash')
    setTimeout(() => el.remove(), 700)
  }
  const t0 = (window as unknown as { __awlSplashT0?: number }).__awlSplashT0 ?? 0
  const min = t0 + (el.classList.contains('is-still') ? 900 : SHOW_MS)
  const fonts = document.fonts?.ready.then(() => undefined) ?? Promise.resolve()
  // 見せ終えた時: 音がもう出せるなら（自動再生を許すブラウザ、または途中でタップした）そのまま消す。
  // 出せないなら（iPhone などは最初のタップまで音が出ない）、スコップの吹き出し「画面を タップして はじめよう！」を出して、
  // タップを待つ。そのタップで音の許可が取れて、ホームに替わると同時に BGM が鳴る
  let waiting = false
  const finish = () => {
    if (done || waiting) return
    const ac = (window as unknown as { __awlAudio?: AudioContext }).__awlAudio
    // 回線がとても遅く、本体が届く前に CSS の保険（7 秒）で消えていたら、出し直さない
    if (!ac || ac.state === 'running' || performance.now() - t0 > 6800) return out()
    waiting = true
    el.classList.add('is-wait')
  }
  // JS が動いたので、index.html の「7 秒で消える」保険はこちらで引き受ける
  ;(window as unknown as { __awlSplashJs?: boolean }).__awlSplashJs = true
  void Promise.all([kvLoaded(), fonts]).then(() => {
    if (done) return
    // スプラッシュが描かれてから重い準備をする
    setTimeout(() => {
      if (done) return
      behind?.()
      setTimeout(finish, Math.max(0, min - performance.now()))
    }, 60)
  })
  setTimeout(finish, Math.max(0, MAX_MS - performance.now()))
  // タップ（click は iPhone の touchend のあとに来るので、音の許可を取った後で消える）とキー
  el.addEventListener('click', out)
  window.addEventListener('keydown', out, { once: true })
}
