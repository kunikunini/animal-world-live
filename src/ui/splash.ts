// 立ち上げの画面（スプラッシュ、見た目は index.html に直接書いてある）を消す。
// ホームの絵（画面に合う 1 枚）とロゴの字が届いたら、スプラッシュの裏で重い準備（ワールドの組み立て）を済ませてから、ふわっと消す。
// 動き（public/splash.css、スコップが出てロゴが決まるまで）を見せ終えてから消す。遅くても 4.5 秒で消す
// （届かなくてもホームは動く。白い画面で待たせない）。タップでもすぐ消える
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
  void Promise.all([kvLoaded(), fonts]).then(() => {
    if (done) return
    // スプラッシュが描かれてから重い準備をする
    setTimeout(() => {
      if (done) return
      behind?.()
      setTimeout(out, Math.max(0, min - performance.now()))
    }, 60)
  })
  setTimeout(out, Math.max(0, MAX_MS - performance.now()))
  el.addEventListener('pointerdown', out, { once: true })
}
