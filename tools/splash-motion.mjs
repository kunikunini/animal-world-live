// 立ち上げの画面（スプラッシュ）の動きを CSS に書き出す: node tools/splash-motion.mjs → public/splash.css
//
// 動きは Motion Prompt（https://showheyohtaki.github.io/motion-prompt/、MIT）の 3 つの見本のコードを、数字ごと移したもの:
//   #005 マスクリビール … 双眼鏡のスコップが、線の向こうからせり上がる
//   #003 バースト       … スコップが一度縮んで溜め、ばねで戻る瞬間に、輪・線・粒が弾ける
//   #008 キネティックタイポグラフィ … ロゴの 3 語を、ANIMAL は「はねる」、WORLD は「まわる」、2 行目の大きな LIVE は「ドン!」で出す
// 見本は Canvas に時刻 u から 1 コマずつ描く関数。ここではその関数を 1/60 秒ごとに計算して CSS の keyframes にする。
// 立ち上げ中は本体の JS がワールドの組み立てで約 2 秒止まるので、Canvas や JS の動きだと止まってしまう。
// transform と opacity だけの CSS の動きは別のスレッドで動くので、止まらない。
// 距離は見本のカードの px を、スコップは幅 150px、ロゴは文字の大きさ 88px を基準に、画面に合わせて伸び縮みさせる
// （せり上がりだけはスコップの高さに対する割合）。スコップの絵は public/splash-scop.webp（くにが用意したキャラクターの絵を切り抜いた物）。
// 色は黄色の地で見えるように替えた（見本の黄 → 白、ミント → コーラルなど）。
// 見本どおりにできなかった所: バーストの輪の太さ（16 → 0）は、白い円の上に地の色の円を重ねて作った。
// 2 つの円の大きさの差で、太さが同じように細くなる

import fs from 'node:fs'

// Motion Prompt #001-024 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#001
// （kit の補助関数のうち、使う物だけ）
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x))
const lerp = (a, b, x) => a + (b - a) * x
const P = (t, a, b) => clamp((t - a) / (b - a))
const eIO = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)
const eIOs = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2)
const eOut = (x) => 1 - Math.pow(1 - x, 3)
const eOut5 = (x) => 1 - Math.pow(1 - x, 5)
const eIn = (x) => x * x * x
const backOut = (x, s = 1.70158) => 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2)
const spring = (t, w = 14, d = 7) => (t <= 0 ? 0 : 1 - Math.exp(-d * t) * Math.cos(w * t))

const FPS = 60
const n4 = (x) => (Math.abs(x) < 1e-5 ? '0' : String(+x.toFixed(4)))
// 見本のカードの px → スコップの幅（--bw）・ロゴの文字の大きさ（--fs）に比例した長さ
const B = (px) => `calc(var(--bw) * ${n4(px / 150)})`
const T = (px) => `calc(var(--fs) * ${n4(px / 88)})`

// 関数 fn(t)（t は秒）を 0〜dur で 1/60 秒ごとに計算して keyframes にする。同じ値が続くコマは省く
function keyframes(name, dur, fn) {
  const steps = Math.round(dur * FPS)
  const rows = []
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * dur
    rows.push([(i / steps) * 100, fn(t)])
  }
  const out = rows.filter((r, i) => i === 0 || i === rows.length - 1 || r[1] !== rows[i - 1][1] || r[1] !== rows[i + 1][1])
  return `@keyframes ${name} {\n${out.map(([p, v]) => `  ${n4(p)}% { ${v} }`).join('\n')}\n}\n`
}

// ---- 時間割（スプラッシュが出てからの秒） ----
const REV = 0 // #005 マスクリビール
const BUR = 0.85 // #003 バースト（溜め 0.3〜0.5、0.5 で弾ける）
const ANI = 1.45 // #008 ANIMAL（はねる）
const WOR = 1.72 // #008 WORLD（まわる）
const LIV = 2.15 // #008 LIVE（ドン!）
const FLOAT = 2.7 // そのあと、ふわふわ浮く
export const SHOW_MS = 3300 // ここまで見せてから消す（src/ui/splash.ts）

let css = ''
const kf = []

// ---- Motion Prompt #005 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#005 ----
// 境目の線: 0.1〜0.5 秒で中央から左右へ（easeInOut 3 乗）、2.05〜2.3 秒で縮めて消す。幅 380・太さ 6
kf.push(keyframes('sp-line', 2.3, (lu) => {
  const lg = eIO(P(lu, 0.1, 0.5)) * (1 - eIO(P(lu, 2.05, 2.3)))
  return `transform: scaleX(${n4(lg)});`
}))
// 上の段: 線より上だけ見える切り抜きの中で、120px 下から定位置へ（0.35〜1.0 秒・easeOut 5 乗）。
// 文字の下端は線の 14px 上、切り抜きの下端は線の 5px 上
// スコップは文字より縦に長いので、距離は文字の高さ 98px に対する 120px の割合（スコップの高さの 122%）で
kf.push(keyframes('sp-rise', 1.0, (lu) => {
  const up = (1 - eOut5(P(lu, 0.35, 1.0))) * 120
  return `transform: translateY(${n4((up / 98) * 100)}%);`
}))

// ---- Motion Prompt #003 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#003 ----
// 溜め: 0.3〜0.5 秒で拡大率 1→0.7（easeInOut 2 乗）。0.5 秒に弾けて 0.7→1 を ばね 1 − e^(−6.5t)·cos(16t) で
const FIRE = 0.5
kf.push(keyframes('sp-pop', 1.6, (lu) => {
  const tt = lu - FIRE
  const sc = tt < 0 ? 1 - 0.3 * eIOs(P(lu, 0.3, FIRE)) : 0.7 + 0.3 * spring(tt, 16, 6.5)
  return `transform: scale(${n4(sc)});`
}))
// 輪: 半径 44→90、太さ 16→0 を 0.6 秒で easeOut（5 乗）。外の白い円（半径＋太さ/2）と内の地の色の円（半径−太さ/2）で作る
const ringQ = (tt) => eOut5(tt / 0.6 > 1 ? 1 : tt / 0.6)
const ringR = (tt, side) => {
  const q = ringQ(tt)
  return 44 + 46 * q + side * 8 * (1 - q)
}
// 円の元の大きさは半径 100（見本の px）。scale で半径に合わせる
kf.push(keyframes('sp-ring-out', 0.75, (tt) => (tt <= 0 || tt >= 0.6 ? `transform: scale(0); opacity: 0;` : `transform: scale(${n4(ringR(tt, 1) / 100)}); opacity: 1;`)))
kf.push(keyframes('sp-ring-in', 0.75, (tt) => (tt <= 0 || tt >= 0.6 ? `transform: scale(0); opacity: 0;` : `transform: scale(${n4(Math.max(0, ringR(tt, -1)) / 100)}); opacity: 1;`)))
// 放射の線 10 本（太さ 9）: 先端の半径 64→130（縦は 0.82 倍）。長さ 36 を弾けてから 0.22〜0.7 秒で 0 へ。
// 線ごとの向きと縦 0.82 倍は、入れ物の回転と横の伸び縮みで（下の RAYS）。ここでは中心からの距離と長さだけ
kf.push(keyframes('sp-ray', 0.75, (tt) => {
  const q = ringQ(tt)
  const r1 = 64 + 66 * q
  const len = 36 * (1 - P(tt, 0.22, 0.7))
  if (tt <= 0 || len <= 0.5) return 'opacity: 0;'
  return `opacity: 1; transform: translateX(${B(r1 - len)}) scaleX(${n4(len / 36)});`
}))
// 粒 10 個（半径 8→4.8）: 半径 58→150（横 1.45 倍・縦 0.78 倍の楕円状）。0.3〜0.72 秒でフェードアウト。
// 向きと楕円の伸びは、粒ごとの回転と --m（下の DOTS）
kf.push(keyframes('sp-dot', 0.75, (tt) => {
  const q = ringQ(tt)
  const fade = 1 - P(tt, 0.3, 0.72)
  if (tt <= 0 || fade <= 0) return 'opacity: 0;'
  const r2 = 58 + 92 * q
  return `opacity: ${n4(fade)}; transform: translateX(calc(var(--bw) * ${n4(r2 / 150)} * var(--m))) scale(${n4(1 - q * 0.4)});`
}))

// ---- Motion Prompt #008 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#008 ----
// はねる: 1 文字ずつ 0.1 秒ずらす。高さ 78px × |sin(πt/0.4)| × e^(−2.6t) で弾む。接地の瞬間は縦に最大 16% つぶす
kf.push(keyframes('sp-hop', 1.7, (tt) => {
  const s = Math.abs(Math.sin((Math.PI * tt) / 0.4))
  const y = -78 * s * Math.exp(-2.6 * tt)
  const near = s < 0.25 ? 1 : 0
  const sq = 1 - 0.16 * near * Math.exp(-2.6 * tt)
  const a = P(tt, 0, 0.08)
  return `opacity: ${n4(a)}; transform: translateY(${T(y)}) scale(${n4(2 - sq)}, ${n4(sq)});`
}))
// まわる: 1 文字ずつ 0.12 秒ずらす。0.62 秒で −360°→0° を backOut（s=1.3）。拡大率 0→1 を 0.25 秒で easeOut（3 乗）
kf.push(keyframes('sp-spin', 0.62, (tt) => {
  const q = backOut(P(tt, 0, 0.62), 1.3)
  const sc = eOut(P(tt, 0, 0.25))
  return `transform: rotate(${n4((1 - q) * -360)}deg) scale(${n4(sc)});`
}))
// ドン!: 0.02〜0.2 秒で拡大率 3.4→1（easeIn 3 乗）で叩きつけ、斜体風に傾ける。
// 着地後: 横揺れ 10px × e^(−9t) × sin(38t)、縦つぶれ 20% × e^(−11t)
const HIT = 0.2
const SKEW = (Math.atan(-0.14) * 180) / Math.PI
kf.push(keyframes('sp-slam', 0.8, (lu) => {
  const tt = lu - HIT
  const sc = tt < 0 ? lerp(3.4, 1, eIn(P(lu, 0.02, HIT))) : 1
  const dx = tt > 0 ? 10 * Math.exp(-9 * tt) * Math.sin(38 * tt) : 0
  const sy = tt > 0 ? 1 - 0.2 * Math.exp(-11 * tt) : 1
  return `opacity: ${n4(P(lu, 0.02, 0.1))}; transform: translateX(${T(dx)}) scale(${n4(sc * (2 - sy))}, ${n4(sc * sy)}) skewX(${n4(SKEW)}deg);`
}))
// 放射の線 8 本を 0.4 秒: 半径 120→170（easeOut 3 乗）、長さ 26、太さ 7→0。横 1.35 倍・縦 0.5 倍の楕円状
kf.push(keyframes('sp-slam-ray', 0.4, (tt) => {
  const q = eOut(tt / 0.4)
  if (tt <= 0 || q >= 0.97) return 'opacity: 0;'
  return `opacity: 1; transform: translateX(${T(120 + 50 * q)}) scaleY(${n4(1 - q)});`
}))

// ---- 線・粒の向き（見本の角度をそのまま） ----
const RAYS = []
const DOTS = []
for (let i = 0; i < 10; i++) {
  const a = (i / 10) * Math.PI * 2 - Math.PI / 2
  // 線: 縦 0.82 倍にした向きと、その向きでの伸び
  RAYS.push({ deg: (Math.atan2(0.82 * Math.sin(a), Math.cos(a)) * 180) / Math.PI, k: Math.hypot(Math.cos(a), 0.82 * Math.sin(a)), col: i % 2 ? 'var(--sp-coral)' : '#fff' })
  const a2 = a + Math.PI / 10
  DOTS.push({ deg: (Math.atan2(0.78 * Math.sin(a2), 1.45 * Math.cos(a2)) * 180) / Math.PI, m: Math.hypot(1.45 * Math.cos(a2), 0.78 * Math.sin(a2)), col: i % 2 ? 'var(--sp-coral)' : 'var(--sp-blue)' })
}
const SLAM_RAYS = []
for (let i = 0; i < 8; i++) {
  const a = (i / 8) * Math.PI * 2 + 0.2
  SLAM_RAYS.push({ deg: (Math.atan2(0.5 * Math.sin(a), 1.35 * Math.cos(a)) * 180) / Math.PI, k: Math.hypot(1.35 * Math.cos(a), 0.5 * Math.sin(a)) })
}

const WORDS = [
  { w: 'ANIMAL', anim: 'sp-hop', start: ANI + 0.06, step: 0.1 },
  { w: 'WORLD', anim: 'sp-spin', start: WOR + 0.05, step: 0.12 },
  { w: 'LIVE', anim: null, start: LIV },
]

css += `/* 立ち上げの画面（スプラッシュ）。tools/splash-motion.mjs が書き出す（手で直さない）。
   動きは Motion Prompt（MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/）の
   #005 マスクリビール・#003 バースト・#008 キネティックタイポグラフィを移したもの。くわしくは道具の頭の説明 */
.splash {
  --bw: clamp(140px, min(56vw, 32vh), 300px);
  --fs0: clamp(32px, min(10.5vw, 7.6vh), 76px);
  --fs: var(--fs0);
  --sp-bg: #fbcd03;
  --sp-coral: #ff6b5c;
  --sp-blue: #2f6bff;
  --sp-navy: #1f2a44;
  --sp-red: #ec2a22;
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: calc(var(--bw) * 0.16 + var(--fs) * 0.3);
  overflow: hidden;
  background: var(--sp-bg);
  transition: opacity 0.6s ease, visibility 0s linear 0.6s;
  animation: sp-auto 0.6s ease 7s forwards;
}
.sp-stage { position: relative; width: var(--bw); aspect-ratio: 560 / 624; }
.sp-stage > * { position: absolute; }
/* バースト（スコップの後ろ）。中心はスコップの真ん中 */
.sp-burst { left: 50%; top: 50%; width: 0; height: 0; }
.sp-burst > * { position: absolute; left: 0; top: 0; }
.sp-ring { width: ${B(200)}; height: ${B(200)}; margin: ${B(-100)} 0 0 ${B(-100)}; border-radius: 50%; opacity: 0; transform: scale(0); }
.sp-ring.o { background: #fff; animation: sp-ring-out 0.75s linear ${BUR + FIRE}s both; }
.sp-ring.i { background: var(--sp-bg); animation: sp-ring-in 0.75s linear ${BUR + FIRE}s both; }
.sp-rays, .sp-dots, .sp-ray, .sp-dot { position: absolute; left: 0; top: 0; width: 0; height: 0; }
.sp-ray i { position: absolute; left: 0; top: ${B(-4.5)}; width: ${B(36)}; height: ${B(9)}; border-radius: ${B(4.5)}; transform-origin: 0 50%; opacity: 0; animation: sp-ray 0.75s linear ${BUR + FIRE}s both; }
.sp-dot i { position: absolute; left: ${B(-8)}; top: ${B(-8)}; width: ${B(16)}; height: ${B(16)}; border-radius: 50%; opacity: 0; animation: sp-dot 0.75s linear ${BUR + FIRE}s both; }
${RAYS.map((r, i) => `.sp-ray:nth-of-type(${i + 1}) { transform: rotate(${n4(r.deg)}deg) scaleX(${n4(r.k)}); } .sp-ray:nth-of-type(${i + 1}) i { background: ${r.col}; }`).join('\n')}
${DOTS.map((d, i) => `.sp-dot:nth-of-type(${i + 1}) { transform: rotate(${n4(d.deg)}deg); --m: ${n4(d.m)}; } .sp-dot:nth-of-type(${i + 1}) i { background: ${d.col}; }`).join('\n')}
/* マスクリビール: 切り抜きの下端は線の 5px 上（スコップの下端の 9px 下）。上と横は、ばねで大きくなっても切れないよう広く */
.sp-clip { left: ${B(-60)}; right: ${B(-60)}; top: ${B(-60)}; bottom: ${B(-9)}; overflow: hidden; }
.sp-float { position: absolute; left: ${B(60)}; top: ${B(60)}; width: var(--bw); animation: sp-float 2.6s ease-in-out ${FLOAT}s infinite; }
.sp-rise { animation: sp-rise 1s linear ${REV}s both; }
.sp-pop { animation: sp-pop 1.6s linear ${BUR}s both; }
.sp-pop img { display: block; width: 100%; height: auto; filter: drop-shadow(0 ${B(3)} ${B(5)} rgba(120, 70, 0, 0.28)); }
.sp-line { left: 50%; top: calc(100% + ${B(14 - 3 - 9)}); width: ${B(380)}; height: ${B(6)}; margin-left: ${B(-190)}; border-radius: ${B(3)}; background: var(--sp-coral); transform: scaleX(0); animation: sp-line 2.3s linear ${REV}s both; }
/* ロゴ: 「ANIMAL WORLD」の下に、大きな「LIVE」（中央揃え） */
.splash-logo {
  display: flex;
  flex-direction: column;
  align-items: center;
  max-width: 96vw;
  font-family: 'Baloo 2', 'Zen Maru Gothic', 'Hiragino Maru Gothic ProN', system-ui, sans-serif;
  font-weight: 800;
  font-size: var(--fs);
  line-height: 1;
  letter-spacing: 0.01em;
  white-space: nowrap;
  color: #fff;
  -webkit-text-stroke: 0.18em var(--sp-navy);
  paint-order: stroke fill;
  text-shadow: 0 0.1em 0 var(--sp-navy);
}
.sp-row { display: flex; column-gap: 0.32em; }
.sp-word { position: relative; display: inline-flex; }
.sp-word > i { display: inline-block; font-style: normal; }
.sp-w1 > i { transform-origin: 50% 100%; animation: sp-hop 1.7s linear both; }
.sp-w2 > i { transform-origin: 50% 55%; animation: sp-spin 0.62s linear both; }
${WORDS.filter((w) => w.anim).map((w, wi) => [...w.w].map((_, i) => `.sp-w${wi + 1} > i:nth-child(${i + 1}) { animation-delay: ${n4(w.start + i * w.step)}s; }`).join('\n')).join('\n')}
.sp-live {
  /* LIVE は上の行の 2.6 倍。放射の線などの長さもこの大きさに合わせる（--fs）。線は叩きつける動きと別に（見本も文字とは別に描く） */
  --fs: calc(var(--fs0) * 2.6);
  position: relative;
  font-size: var(--fs);
  margin-top: -0.04em;
}
.sp-w3 {
  /* 赤に黒いふち */
  color: var(--sp-red);
  -webkit-text-stroke: 0.15em #000;
  text-shadow: 0 0.07em 0 #000;
  transform-origin: 50% 100%;
  animation: sp-slam 0.8s linear ${LIV}s both;
}
.sp-live .sp-sray { position: absolute; left: 50%; top: 50%; width: 0; height: 0; }
.sp-live .sp-sray i { position: absolute; left: 0; top: ${T(-3.5)}; width: ${T(26)}; height: ${T(7)}; border-radius: ${T(3.5)}; background: var(--sp-red); opacity: 0; animation: sp-slam-ray 0.4s linear ${n4(LIV + HIT)}s both; }
${SLAM_RAYS.map((r, i) => `.sp-sray:nth-of-type(${i + 1}) { transform: rotate(${n4(r.deg)}deg) scaleX(${n4(r.k)}); }`).join('\n')}
/* 消える時: 少し大きくなりながら、ふわっと */
.splash.is-out { opacity: 0; visibility: hidden; }
.splash.is-out .sp-stage { scale: 1.06; transition: scale 0.6s ease; }
/* 動きをへらす: 見本の動きはやめて、フェードだけ */
.splash.is-still * { animation: none !important; }
.splash.is-still .sp-stage, .splash.is-still .splash-logo { animation: sp-fade 0.5s ease both !important; }
.splash.is-still.is-out .sp-stage { scale: 1; }
@keyframes sp-float { 0%, 100% { translate: 0 0; } 50% { translate: 0 -6px; } }
@keyframes sp-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes sp-auto { to { opacity: 0; visibility: hidden; } }
/* スプラッシュが出ている間は、ホームのボタンの出てくる動きを止めておく（消えてから「ぽん」と出る） */
.is-splash .home, .is-splash .home * { animation-play-state: paused !important; }
`
css += kf.join('')

// スプラッシュの中身（index.html の <div id="splash"> の中に入れる）
export const HTML = `<div class="sp-stage">
        <div class="sp-burst"><i class="sp-ring o"></i><i class="sp-ring i"></i><span class="sp-rays">${RAYS.map(() => '<b class="sp-ray"><i></i></b>').join('')}</span><span class="sp-dots">${DOTS.map(() => '<b class="sp-dot"><i></i></b>').join('')}</span></div>
        <div class="sp-clip"><div class="sp-float"><div class="sp-rise"><div class="sp-pop"><img src="/splash-scop.webp" alt="" width="560" height="624" decoding="async" /></div></div></div></div>
        <i class="sp-line"></i>
      </div>
      <div class="splash-logo">${(() => {
        const word = (w, wi) => `<span class="sp-word sp-w${wi + 1}">${[...w.w].map((c) => `<i>${c}</i>`).join('')}</span>`
        return `<span class="sp-row">${word(WORDS[0], 0)}${word(WORDS[1], 1)}</span><span class="sp-live">${SLAM_RAYS.map(() => '<b class="sp-sray"><i></i></b>').join('')}${word(WORDS[2], 2)}</span>`
      })()}</div>`

fs.writeFileSync('public/splash.css', css)
const page = fs.readFileSync('index.html', 'utf8')
const start = '<!-- splash:begin -->'
const end = '<!-- splash:end -->'
if (!page.includes(start)) throw new Error('index.html に splash:begin が無い')
const next = page.replace(new RegExp(`${start}[\\s\\S]*?${end}`), `${start}\n      ${HTML}\n      ${end}`)
fs.writeFileSync('index.html', next)
console.log(`public/splash.css ${(css.length / 1024).toFixed(1)}KB, keyframes ${kf.length}`)
