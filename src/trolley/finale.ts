/**
 * 出口のラストスパート（くにの実機テスト 11/14「ゴールが ◎ があるだけで、新しい世界に入っていく感じがしない」）。
 * 横から見た坑道から、トロッコのうしろから見る遠近の画面に切り替える。レールが奥の光の丸へのびていき、
 * 画面をタップするたびに速くなり、出口の光がだんだん大きく・明るくなる。光でいっぱいになったら、新しいワールドへ。
 * 絵はすべて Canvas で描く。
 */
import type { TrolleyEnd } from './stations'

export interface FinaleView {
  /** 出口までの進み 0〜1（1 で光でいっぱい） */
  k: number
  t: number
  /** トンネルの流れる量（進んだ距離） */
  scroll: number
  /** タップの勢い 0〜1（速さの線・ゆれ） */
  rush: number
  /** 白い光で満たす 0〜1 */
  white: number
  cheer: number
  reduce: boolean
}

const ease = (x: number) => x * x * (3 - 2 * x)

export function createFinale(canvas: HTMLCanvasElement, hero: { img: HTMLImageElement | null; jacket: string }, to: TrolleyEnd) {
  const ctx = canvas.getContext('2d')!
  // 遠くの雲・波のきらめき（決まった並び）
  const rnd = (i: number) => {
    const x = Math.sin(i * 127.1 + 311.7) * 43758.5453
    return x - Math.floor(x)
  }

  function drawOutside(cx: number, cy: number, R: number, v: FinaleView): void {
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, R, 0, Math.PI * 2)
    ctx.clip()
    const sky = ctx.createLinearGradient(0, cy - R, 0, cy + R)
    sky.addColorStop(0, '#5fb4f2')
    sky.addColorStop(0.55, '#bfe6ff')
    sky.addColorStop(1, to === 'water' ? '#e8f7ff' : '#f2fbff')
    ctx.fillStyle = sky
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2)
    if (to === 'water') {
      // 海と、きらきらの波
      const sea = ctx.createLinearGradient(0, cy, 0, cy + R)
      sea.addColorStop(0, '#2fa3d8')
      sea.addColorStop(1, '#1b6fa8')
      ctx.fillStyle = sea
      ctx.fillRect(cx - R, cy + R * 0.12, R * 2, R)
      ctx.fillStyle = 'rgba(255,255,255,0.85)'
      for (let i = 0; i < 26; i++) {
        const x = cx + (rnd(i) - 0.5) * 2 * R
        const y = cy + R * (0.18 + rnd(i + 40) * 0.7)
        const tw = 0.5 + 0.5 * Math.sin(v.t * 4 + i)
        ctx.globalAlpha = tw
        ctx.fillRect(x, y, R * 0.06 * (0.5 + rnd(i + 9)), Math.max(1, R * 0.008))
      }
      ctx.globalAlpha = 1
      // 砂の岬
      ctx.fillStyle = '#f3dc9a'
      ctx.beginPath()
      ctx.ellipse(cx - R * 0.55, cy + R * 0.2, R * 0.7, R * 0.12, 0, 0, Math.PI * 2)
      ctx.fill()
    } else {
      // 雲の海と、遠くの岩の塔
      ctx.fillStyle = '#9aa0bf'
      for (const [dx, h] of [
        [-0.55, 0.5],
        [-0.3, 0.32],
        [0.42, 0.45],
        [0.65, 0.28],
      ]) {
        ctx.beginPath()
        ctx.moveTo(cx + R * (dx - 0.07), cy + R * 0.3)
        ctx.lineTo(cx + R * (dx - 0.03), cy + R * (0.3 - h))
        ctx.lineTo(cx + R * (dx + 0.04), cy + R * (0.3 - h * 0.92))
        ctx.lineTo(cx + R * (dx + 0.08), cy + R * 0.3)
        ctx.fill()
      }
      ctx.fillStyle = '#ffffff'
      for (let i = 0; i < 18; i++) {
        const x = cx + (rnd(i) - 0.5) * 2.2 * R + Math.sin(v.t * 0.4 + i) * R * 0.02
        const y = cy + R * (0.25 + rnd(i + 20) * 0.6)
        const r = R * (0.12 + rnd(i + 5) * 0.16)
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    // 鳥
    ctx.strokeStyle = 'rgba(40,50,70,0.7)'
    ctx.lineWidth = Math.max(1, R * 0.008)
    for (let i = 0; i < 4; i++) {
      const x = cx + R * (-0.3 + i * 0.18) + Math.sin(v.t * 0.7 + i) * R * 0.03
      const y = cy - R * (0.35 + rnd(i + 70) * 0.25)
      const w = R * 0.04
      const f = Math.sin(v.t * 8 + i * 2) * w * 0.5
      ctx.beginPath()
      ctx.moveTo(x - w, y - f)
      ctx.quadraticCurveTo(x - w * 0.4, y - w * 0.4, x, y)
      ctx.quadraticCurveTo(x + w * 0.4, y - w * 0.4, x + w, y - f)
      ctx.stroke()
    }
    ctx.restore()
  }

  function draw(v: FinaleView): void {
    const W = canvas.width
    const H = canvas.height
    const U = Math.min(W, H)
    const shake = v.reduce ? 0 : v.rush * U * 0.006
    const sx = (Math.random() - 0.5) * shake
    const sy = (Math.random() - 0.5) * shake
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, sx, sy)
    const vx = W / 2
    const vy = H * 0.42
    const k = ease(Math.min(1, v.k))
    // トンネルの奥（暗い）
    ctx.fillStyle = '#140d08'
    ctx.fillRect(-20, -20, W + 40, H + 40)

    // 出口の光の丸（近づくほど大きく）
    const R = U * (0.045 + 0.55 * k * k) + Math.max(W, H) * 0.25 * Math.max(0, k - 0.85) * 6
    // 光のにじみ
    const glowR = R * (2.2 + k)
    const glow = ctx.createRadialGradient(vx, vy, R * 0.6, vx, vy, glowR)
    glow.addColorStop(0, `rgba(255,248,220,${0.55 + 0.4 * k})`)
    glow.addColorStop(1, 'rgba(255,240,200,0)')
    ctx.fillStyle = glow
    ctx.fillRect(vx - glowR, vy - glowR, glowR * 2, glowR * 2)

    // トンネルの輪（奥から手前へ）。スクロールで手前へ流れる
    const N = 16
    const frac = v.scroll % 1
    const ring = (z: number) => {
      const s = (U * 0.62) / z
      return { s, hw: s * 1.05, top: vy - s * 1.0, floor: vy + s * 0.62 }
    }
    for (let i = N; i >= 1; i--) {
      const z = i - frac + 0.35
      const r = ring(z)
      if (r.hw < R * 0.9) continue
      // 光に近い奥ほど明るく（霧）
      const lit = Math.min(1, (R * 2.5) / r.hw) * (0.35 + 0.65 * k)
      const base = [62, 44, 30]
      const light = [255, 236, 196]
      const c = base.map((b, j) => Math.round(b + (light[j] - b) * lit * 0.55))
      ctx.strokeStyle = `rgb(${c[0]},${c[1]},${c[2]})`
      ctx.lineWidth = Math.max(2, r.s * 0.16)
      ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.moveTo(vx - r.hw, r.floor)
      ctx.lineTo(vx - r.hw, r.top + r.hw * 0.55)
      ctx.quadraticCurveTo(vx - r.hw, r.top, vx, r.top)
      ctx.quadraticCurveTo(vx + r.hw, r.top, vx + r.hw, r.top + r.hw * 0.55)
      ctx.lineTo(vx + r.hw, r.floor)
      ctx.stroke()
      // 3 つに 1 つは木の枠（柱と梁）
      const idx = Math.floor(v.scroll) + i
      if (idx % 3 === 0) {
        const wc = c.map((x, j) => Math.round(x * 0.6 + [138, 90, 50][j] * 0.4))
        ctx.fillStyle = `rgb(${wc[0]},${wc[1]},${wc[2]})`
        const pw = r.s * 0.09
        ctx.fillRect(vx - r.hw * 0.86 - pw / 2, r.top + r.s * 0.18, pw, r.floor - r.top - r.s * 0.18)
        ctx.fillRect(vx + r.hw * 0.86 - pw / 2, r.top + r.s * 0.18, pw, r.floor - r.top - r.s * 0.18)
        ctx.fillRect(vx - r.hw * 0.9, r.top + r.s * 0.16, r.hw * 1.8, pw * 0.9)
        // 吊りランプ
        if (idx % 6 === 0) {
          ctx.fillStyle = 'rgba(255,214,120,0.95)'
          ctx.beginPath()
          ctx.arc(vx, r.top + r.s * 0.34, r.s * 0.045, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }

    // 外の景色（光の丸の中）
    drawOutside(vx, vy, R, v)

    // 床（奥へすぼまる）
    const near = ring(0.32)
    const floorG = ctx.createLinearGradient(0, vy, 0, H)
    floorG.addColorStop(0, `rgba(120,96,70,${0.6 + 0.3 * k})`)
    floorG.addColorStop(1, '#2a1c12')
    ctx.fillStyle = floorG
    ctx.beginPath()
    ctx.moveTo(vx - R * 0.4, vy + R * 0.62)
    ctx.lineTo(vx + R * 0.4, vy + R * 0.62)
    ctx.lineTo(vx + near.hw * 1.2, H + 20)
    ctx.lineTo(vx - near.hw * 1.2, H + 20)
    ctx.closePath()
    ctx.fill()

    // 枕木（手前へ流れる）
    const tieFrac = (v.scroll * 3) % 1
    for (let j = 40; j >= 0; j--) {
      const z = (j - tieFrac) / 3 + 0.3
      if (z <= 0.3) continue
      const r = ring(z)
      if (r.hw < R * 0.3) continue
      const w = r.s * 0.5
      const lit = Math.min(1, (R * 2) / r.hw) * k
      ctx.fillStyle = `rgb(${Math.round(92 + 120 * lit)},${Math.round(62 + 100 * lit)},${Math.round(38 + 80 * lit)})`
      ctx.fillRect(vx - w, r.floor - r.s * 0.03, w * 2, Math.max(1, r.s * 0.06))
    }
    // レール（2 本。奥の光へのびる。光が当たると金色に光る）
    for (const side of [-1, 1]) {
      const g = ctx.createLinearGradient(0, vy + R * 0.6, 0, H)
      g.addColorStop(0, `rgba(255,236,170,${0.6 + 0.4 * k})`)
      g.addColorStop(1, '#8b919c')
      ctx.strokeStyle = g
      ctx.lineWidth = Math.max(2, U * 0.012)
      ctx.beginPath()
      const far = ring(40)
      ctx.moveTo(vx + side * far.s * 0.3, far.floor)
      ctx.lineTo(vx + side * near.s * 0.3, near.floor)
      ctx.stroke()
    }

    // 光の筋（出口からさしこむ）
    if (k > 0.05) {
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      const rays = 12
      for (let i = 0; i < rays; i++) {
        const a = (i / rays) * Math.PI * 2 + v.t * 0.15
        const len = Math.max(W, H)
        const wdt = 0.07 + 0.04 * Math.sin(v.t * 1.3 + i)
        ctx.fillStyle = `rgba(255,240,200,${0.07 * k})`
        ctx.beginPath()
        ctx.moveTo(vx, vy)
        ctx.lineTo(vx + Math.cos(a - wdt) * len, vy + Math.sin(a - wdt) * len)
        ctx.lineTo(vx + Math.cos(a + wdt) * len, vy + Math.sin(a + wdt) * len)
        ctx.closePath()
        ctx.fill()
      }
      ctx.restore()
    }

    // 速さの線（タップの勢い）
    if (!v.reduce && v.rush > 0.05) {
      ctx.strokeStyle = `rgba(255,255,255,${0.35 * v.rush})`
      ctx.lineWidth = Math.max(1, U * 0.003)
      for (let i = 0; i < 28; i++) {
        const a = rnd(i) * Math.PI * 2
        const d0 = U * (0.25 + ((rnd(i + 3) + v.t * 2.2) % 1) * 0.7)
        const d1 = d0 + U * 0.12 * v.rush
        ctx.beginPath()
        ctx.moveTo(vx + Math.cos(a) * d0, vy + Math.sin(a) * d0)
        ctx.lineTo(vx + Math.cos(a) * d1, vy + Math.sin(a) * d1)
        ctx.stroke()
      }
    }

    // まわりの暗さ（光が入るほどうすく）
    const vig = ctx.createRadialGradient(vx, vy, R, vx, vy, Math.max(W, H) * 0.8)
    vig.addColorStop(0, 'rgba(10,6,3,0)')
    vig.addColorStop(1, `rgba(10,6,3,${0.75 * (1 - k)})`)
    ctx.fillStyle = vig
    ctx.fillRect(-20, -20, W + 40, H + 40)

    drawCartBack(W, H, U, v, k)

    ctx.restore()
    // 白い光で満たす
    if (v.white > 0) {
      ctx.fillStyle = `rgba(255,253,244,${Math.min(1, v.white)})`
      ctx.fillRect(0, 0, W, H)
    }
  }

  /** うしろから見たトロッコと主人公（逆光でふちが光る） */
  function drawCartBack(W: number, H: number, U: number, v: FinaleView, k: number): void {
    const cw = Math.min(W * 0.36, U * 0.44)
    const bob = v.reduce ? 0 : Math.sin(v.t * (10 + v.rush * 14)) * U * 0.004
    const cx = W / 2
    const bottom = H + cw * 0.14 + bob
    const top = bottom - cw * 0.5
    const rim = `rgba(255,240,200,${0.35 + 0.6 * k})`
    // 主人公（背中・頭・ヘルメット）
    const headR = cw * 0.15
    const hx = cx
    const hy = top - headR * 0.9
    ctx.fillStyle = hero.jacket
    ctx.beginPath()
    ctx.ellipse(cx, top + cw * 0.02, cw * 0.24, cw * 0.17, 0, Math.PI, 0)
    ctx.fill()
    // 腕（ばんざい / レバーをにぎる）
    ctx.strokeStyle = hero.jacket
    ctx.lineCap = 'round'
    ctx.lineWidth = cw * 0.07
    const up = v.cheer
    for (const side of [-1, 1]) {
      const pump = v.reduce ? 0 : Math.sin(v.t * 16 + (side > 0 ? 0 : Math.PI)) * v.rush * cw * 0.03
      const ex = cx + side * cw * (0.2 + 0.12 * up)
      const ey = top - cw * (0.02 + 0.42 * up) + pump
      ctx.beginPath()
      ctx.moveTo(cx + side * cw * 0.17, top - cw * 0.06)
      ctx.lineTo(ex, ey)
      ctx.stroke()
      ctx.fillStyle = '#f2c7a5'
      ctx.beginPath()
      ctx.arc(ex, ey, cw * 0.04, 0, Math.PI * 2)
      ctx.fill()
    }
    // 頭（うしろ姿: 髪）
    ctx.fillStyle = '#3a2a20'
    ctx.beginPath()
    ctx.arc(hx, hy, headR, 0, Math.PI * 2)
    ctx.fill()
    // ヘルメット
    ctx.fillStyle = '#f2c232'
    ctx.beginPath()
    ctx.arc(hx, hy - headR * 0.15, headR * 1.08, Math.PI, 0)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#d9a21c'
    ctx.fillRect(hx - headR * 1.25, hy - headR * 0.2, headR * 2.5, headR * 0.22)
    // 逆光のふち
    ctx.strokeStyle = rim
    ctx.lineWidth = Math.max(1.5, cw * 0.012)
    ctx.beginPath()
    ctx.arc(hx, hy - headR * 0.15, headR * 1.1, Math.PI * 1.05, Math.PI * 1.95)
    ctx.stroke()

    // 箱（うしろの面）
    ctx.fillStyle = '#9c4626'
    ctx.beginPath()
    ctx.moveTo(cx - cw / 2, top)
    ctx.lineTo(cx + cw / 2, top)
    ctx.lineTo(cx + cw * 0.44, bottom)
    ctx.lineTo(cx - cw * 0.44, bottom)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#c9603a'
    ctx.fillRect(cx - cw / 2 - cw * 0.02, top - cw * 0.03, cw * 1.04, cw * 0.06)
    ctx.fillStyle = '#6e2f18'
    ctx.fillRect(cx - cw * 0.46, top + cw * 0.17, cw * 0.92, cw * 0.035)
    ctx.fillStyle = '#e9d29a'
    for (let i = 0; i < 6; i++) {
      const x = cx - cw * 0.4 + (i * cw * 0.8) / 5
      ctx.beginPath()
      ctx.arc(x, top + cw * 0.09, cw * 0.012, 0, Math.PI * 2)
      ctx.arc(x, top + cw * 0.27, cw * 0.012, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.strokeStyle = rim
    ctx.lineWidth = Math.max(1.5, cw * 0.01)
    ctx.beginPath()
    ctx.moveTo(cx - cw / 2 - cw * 0.02, top - cw * 0.03)
    ctx.lineTo(cx + cw / 2 + cw * 0.02, top - cw * 0.03)
    ctx.stroke()
  }

  return { draw }
}
