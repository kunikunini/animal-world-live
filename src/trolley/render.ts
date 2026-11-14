/**
 * トロッコの絵（Canvas 2D）。横から見た坑道を、奥の岩・壁の飾り・地面と天井・線路・生き物・トロッコ・粒の順に重ね、
 * 最後に「明かりの地図」（暗い膜に、ランプ・ヘッドライト・水晶・外の光の穴を開ける）をかぶせる。
 * 区間（水・まん中・空）の色は境目で混ぜる。絵の飾りは場所から決まる乱数で毎回同じ所に出る。
 */
import { CART_W, STEP, railY, sampleAt, themeAt, type Course, type Item, type Theme } from './course'

export interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  max: number
  size: number
  kind: 'spark' | 'dust' | 'drop' | 'mist' | 'star' | 'leaf' | 'wind' | 'dirt' | 'glint'
  color: string
  g: number
  rot: number
}

export interface Mole {
  x: number
  y: number
  state: 'wait' | 'up' | 'throw' | 'laugh' | 'pout' | 'down' | 'gone'
  t: number
}
export interface Clod {
  x: number
  y: number
  x0: number
  y0: number
  x1: number
  y1: number
  t: number
  dur: number
  state: 'fly' | 'rest' | 'burst' | 'passed'
}
export interface Mouse {
  x: number
  y: number
  beamY: number
  state: 'wait' | 'drop' | 'ride' | 'steal' | 'run' | 'tumble' | 'gone'
  t: number
  carry: Item['kind'] | null
  vx: number
  vy: number
}
export interface Bat {
  x: number
  y: number
  vx: number
  vy: number
  phase: number
  life: number
}
export interface FloatText {
  x: number
  y: number
  text: string
  t: number
  color: string
  big: boolean
}

export interface ViewState {
  t: number
  camX: number
  camY: number
  zoom: number
  cart: { x: number; y: number; angle: number; wheel: number; onRail: boolean; cheer: number; dizzy: number; squash: number }
  lampFlicker: number
  particles: Particle[]
  moles: Mole[]
  clods: Clod[]
  mice: Mouse[]
  bats: Bat[]
  texts: FloatText[]
  dirt: number
  dirtSeed: number
  speedLines: number
  flash: number
  shakeX: number
  shakeY: number
  reduce: boolean
}

interface Pal {
  far: string
  back: string
  mid: string
  rock: string
  rockHi: string
  rockLo: string
  strata: string
  accent: string
  accent2: string
  dark: string
  darkness: number
}

const PAL: Record<Theme, Pal> = {
  water: { far: '#0b2533', back: '#123a4c', mid: '#1b4d61', rock: '#35535e', rockHi: '#6a8f99', rockLo: '#1b2e36', strata: '#2a4651', accent: '#7fe6f5', accent2: '#2fb6d6', dark: '#04121c', darkness: 0.5 },
  mid: { far: '#0e0b1c', back: '#18132d', mid: '#251d42', rock: '#3b3354', rockHi: '#6b6090', rockLo: '#1a1529', strata: '#2e2745', accent: '#c9a3ff', accent2: '#5ff2d3', dark: '#05030c', darkness: 0.76 },
  sky: { far: '#33476e', back: '#4b628d', mid: '#617ca8', rock: '#8a8aa2', rockHi: '#cfd0e0', rockLo: '#4f5068', strata: '#76778f', accent: '#ffffff', accent2: '#ffe9a6', dark: '#1a2340', darkness: 0.42 },
}

interface Outdoor {
  skyTop: string
  skyBot: string
  ground: string
  groundLo: string
  grass: string
  far: string
}
const OUT: Record<'water' | 'sky', Outdoor> = {
  water: { skyTop: '#47ade9', skyBot: '#d9f4ff', ground: '#ead6a2', groundLo: '#bd9f66', grass: '#7cc36a', far: '#2a9fd0' },
  sky: { skyTop: '#2f74dc', skyBot: '#d4ebff', ground: '#94c56f', groundLo: '#5f8a4a', grass: '#b2de86', far: '#ffffff' },
}

const hex = (h: string): [number, number, number] => {
  const n = parseInt(h.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const mix = (a: string, b: string, t: number): string => {
  const p = hex(a)
  const q = hex(b)
  const r = (i: number) => Math.round(p[i] + (q[i] - p[i]) * t)
  return `rgb(${r(0)},${r(1)},${r(2)})`
}
const rgba = (h: string, a: number): string => {
  const p = hex(h)
  return `rgba(${p[0]},${p[1]},${p[2]},${a})`
}
/** 場所から決まる乱数（0〜1） */
const hash = (i: number, k = 0): number => {
  let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(k + 0x27d4eb2f, 0xc2b2ae35)
  h ^= h >>> 15
  h = Math.imul(h, 0x2c1b3c6d)
  h ^= h >>> 12
  return ((h >>> 0) % 100000) / 100000
}

export interface Renderer {
  resize: () => void
  draw: (v: ViewState) => void
  /** 画面の点（CSS px）あたりの u */
  scale: () => number
  size: () => { w: number; h: number }
  /** ワールドの点の画面の位置（CSS px） */
  toScreen: (x: number, y: number) => { x: number; y: number }
}

export function createRenderer(canvas: HTMLCanvasElement, course: Course, hero: { img: HTMLImageElement | null; jacket: string; jacketDark: string }): Renderer {
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D
  const light = document.createElement('canvas')
  const lctx = light.getContext('2d') as CanvasRenderingContext2D
  let W = 1
  let H = 1
  let dpr = 1
  let base = 1
  const font = getComputedStyle(document.body).getPropertyValue('--font-home').trim() || 'system-ui, sans-serif'

  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2)
    W = Math.max(1, window.innerWidth)
    H = Math.max(1, window.innerHeight)
    canvas.width = Math.round(W * dpr)
    canvas.height = Math.round(H * dpr)
    canvas.style.width = `${W}px`
    canvas.style.height = `${H}px`
    // 明かりの地図は半分の細かさ（ぼけてちょうどいい）
    light.width = Math.max(1, Math.round((W * dpr) / 2))
    light.height = Math.max(1, Math.round((H * dpr) / 2))
    // 横長は高さ 400u、縦長は幅 470u が入る大きさ（縦長は上下に岩が広く見える）
    base = Math.min(H / 400, W / 470)
  }
  resize()

  // ---- 区間の色（境目 600u で混ぜる） ----
  const zoneBlend = (x: number): { a: Theme; b: Theme; t: number } => {
    const zs = course.zones
    for (let i = 0; i < zs.length; i++) {
      const z = zs[i]
      if (x < z.x0 || x >= z.x1) continue
      const next = zs[i + 1]
      const prev = zs[i - 1]
      if (next && x > z.x1 - 300) return { a: z.theme, b: next.theme, t: (x - (z.x1 - 300)) / 600 }
      if (prev && x < z.x0 + 300) return { a: prev.theme, b: z.theme, t: 0.5 + (x - z.x0) / 600 }
      return { a: z.theme, b: z.theme, t: 0 }
    }
    const th = themeAt(course, x)
    return { a: th, b: th, t: 0 }
  }
  const palColor = (x: number, key: keyof Omit<Pal, 'darkness'>): string => {
    const z = zoneBlend(x)
    return z.a === z.b ? PAL[z.a][key] : mix(PAL[z.a][key], PAL[z.b][key], Math.min(1, Math.max(0, z.t)))
  }
  const darknessAt = (x: number): number => {
    const z = zoneBlend(x)
    const d = PAL[z.a].darkness + (PAL[z.b].darkness - PAL[z.a].darkness) * Math.min(1, Math.max(0, z.t))
    // 入口・出口の近くは外の光で明るい
    const fromMouth = Math.min(1, Math.max(0, (x - course.mouthX) / 700))
    const toExit = Math.min(1, Math.max(0, (course.exitX - x) / 700))
    return d * Math.min(fromMouth, toExit)
  }

  // ---- 地面と天井（坑道の外は山の斜面と外の地面） ----
  const inTunnel = (x: number) => x >= course.mouthX && x <= course.exitX
  const groundAt = (x: number) => sampleAt(course.ground, Math.max(0, x)) + Math.sin(x * 0.05) * 2
  const ceilAt = (x: number): number => {
    const edge = x < course.mouthX ? course.mouthX : x > course.exitX ? course.exitX : x
    const c = sampleAt(course.ceil, edge)
    const out = x < course.mouthX ? course.mouthX - x : x > course.exitX ? x - course.exitX : 0
    const jag = (hash(Math.floor(x / 40), 7) - 0.5) * 18
    return c + jag + out * 1.9 + (out > 0 ? out * out * 0.0015 : 0)
  }

  let s = 1
  let camX = 0
  let camY = 0
  let cx = 0
  let cy = 0
  const X = (wx: number) => cx + (wx - camX) * s
  const Y = (wy: number) => cy - (wy - camY) * s

  // ---- 外（出発・着く駅） ----
  function drawOutdoor(side: 'from' | 'to', x0: number, x1: number): void {
    if (x1 <= x0) return
    const world = side === 'from' ? course.from : course.to
    const o = OUT[world]
    const sx0 = Math.max(0, X(x0))
    const sx1 = Math.min(W, X(x1))
    if (sx1 <= sx0) return
    ctx.save()
    ctx.beginPath()
    ctx.rect(sx0, 0, sx1 - sx0, H)
    ctx.clip()
    const g = ctx.createLinearGradient(0, 0, 0, H)
    g.addColorStop(0, o.skyTop)
    g.addColorStop(1, o.skyBot)
    ctx.fillStyle = g
    ctx.fillRect(sx0, 0, sx1 - sx0, H)
    const gy = Y(groundAt(side === 'from' ? course.startX : course.endX))
    if (world === 'water') {
      // 遠くの海ときらめき
      ctx.fillStyle = o.far
      ctx.fillRect(sx0, gy - 70 * s, sx1 - sx0, 80 * s)
      ctx.fillStyle = 'rgba(255,255,255,0.55)'
      for (let i = 0; i < 26; i++) {
        const px = ((hash(i, 3) * W * 1.4 - camX * 0.15 * s) % W + W) % W
        const py = gy - (10 + hash(i, 4) * 55) * s
        const w = (6 + hash(i, 5) * 14) * s * (0.6 + 0.4 * Math.sin(v_t * 2 + i))
        ctx.fillRect(px, py, w, 2 * s)
      }
    } else {
      // 雲の海と遠い鳥
      ctx.fillStyle = 'rgba(255,255,255,0.9)'
      for (let i = 0; i < 9; i++) {
        const px = ((hash(i, 8) * W * 1.6 - camX * 0.1 * s + v_t * 6 * s) % (W * 1.3)) - W * 0.15
        const py = gy - (20 + hash(i, 9) * 40) * s
        const r = (40 + hash(i, 10) * 50) * s
        ctx.beginPath()
        ctx.ellipse(px, py, r * 1.6, r * 0.5, 0, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.strokeStyle = 'rgba(40,50,80,0.6)'
      ctx.lineWidth = 2 * s
      for (let i = 0; i < 4; i++) {
        const px = ((hash(i, 11) * W + v_t * 30 * s * (0.6 + hash(i, 12))) % (W + 100)) - 50
        const py = H * (0.12 + hash(i, 13) * 0.2)
        const f = Math.sin(v_t * 7 + i * 2) * 5 * s
        ctx.beginPath()
        ctx.moveTo(px - 10 * s, py - f)
        ctx.quadraticCurveTo(px - 4 * s, py - 4 * s, px, py)
        ctx.quadraticCurveTo(px + 4 * s, py - 4 * s, px + 10 * s, py - f)
        ctx.stroke()
      }
    }
    ctx.restore()
  }

  let v_t = 0

  // ---- 坑道の奥（遠い岩・壁の飾り） ----
  function drawCaveBack(xa: number, xb: number): void {
    const sx0 = Math.max(0, X(Math.max(xa, course.mouthX)))
    const sx1 = Math.min(W, X(Math.min(xb, course.exitX)))
    if (sx1 <= sx0) return
    ctx.save()
    ctx.beginPath()
    ctx.rect(sx0, 0, sx1 - sx0, H)
    ctx.clip()
    // 奥の壁: 横のグラデーション（区間の色を 120u ごとに）
    const lg = ctx.createLinearGradient(sx0, 0, sx1, 0)
    const n = 8
    for (let i = 0; i <= n; i++) {
      const wx = camX + ((sx0 + ((sx1 - sx0) * i) / n - cx) / s)
      lg.addColorStop(i / n, palColor(wx, 'back'))
    }
    ctx.fillStyle = lg
    ctx.fillRect(sx0, 0, sx1 - sx0, H)
    // 遠い岩の塊（ゆっくり流れる 2 層）
    for (const [p, key, size] of [
      [0.35, 'far', 150],
      [0.6, 'mid', 95],
    ] as const) {
      const span = 170 * (size / 95)
      const u0 = Math.floor((camX * p - (cx / s) - 200) / span)
      const u1 = Math.ceil((camX * p + (W - cx) / s + 200) / span)
      for (let u = u0; u <= u1; u++) {
        const ux = u * span + hash(u, p * 100) * span * 0.6
        const sx = cx + (ux - camX * p) * s
        const wx = camX + (sx - cx) / s
        if (!inTunnel(wx)) continue
        const g = groundAt(wx)
        const c = ceilAt(wx)
        const up = hash(u, p * 100 + 1) > 0.5
        const r = size * (0.6 + hash(u, p * 100 + 2) * 0.7) * s
        const sy = up ? Y(c) + r * 0.35 : Y(g) - r * 0.25
        ctx.fillStyle = palColor(wx, key)
        ctx.beginPath()
        ctx.ellipse(sx, sy, r * 1.25, r, 0, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    // 区間ごとの壁の飾り（壁の層、p=0.85）
    const p = 0.85
    const span = 110
    const u0 = Math.floor((camX * p - cx / s - 100) / span)
    const u1 = Math.ceil((camX * p + (W - cx) / s + 100) / span)
    for (let u = u0; u <= u1; u++) {
      const ux = u * span + hash(u, 21) * 60
      const sx = cx + (ux - camX * p) * s
      const wx = camX + (sx - cx) / s
      if (!inTunnel(wx)) continue
      const th = themeAt(course, wx)
      const g = groundAt(wx)
      const c = ceilAt(wx)
      const k = hash(u, 22)
      const yy = Y(g + (c - g) * (0.25 + hash(u, 23) * 0.55))
      if (th === 'water') {
        if (k < 0.35) drawFossil(sx, yy, (10 + hash(u, 24) * 10) * s, palColor(wx, 'rockHi'))
        else if (k < 0.75) {
          // しずくの筋（天井の割れ目から）
          const top = Y(c) + 6 * s
          const len = (60 + hash(u, 25) * 120) * s
          const gr = ctx.createLinearGradient(0, top, 0, top + len)
          gr.addColorStop(0, rgba('#9eeaff', 0.5))
          gr.addColorStop(1, rgba('#9eeaff', 0))
          ctx.fillStyle = gr
          ctx.fillRect(sx, top, 2.2 * s, len)
          const dy = ((v_t * 160 + hash(u, 26) * 300) % 300) * s
          if (dy < len) {
            ctx.fillStyle = rgba('#c8f6ff', 0.8)
            ctx.beginPath()
            ctx.ellipse(sx + 1 * s, top + dy, 2 * s, 3 * s, 0, 0, Math.PI * 2)
            ctx.fill()
          }
        }
      } else if (th === 'mid') {
        if (k < 0.45) drawCrystal(sx, Y(g) + 4 * s, (14 + hash(u, 27) * 22) * s, hash(u, 28) > 0.5 ? PAL.mid.accent : PAL.mid.accent2, hash(u, 29))
        // ひかる虫（天井の点）
        for (let j = 0; j < 4; j++) {
          const tw = 0.5 + 0.5 * Math.sin(v_t * (1.5 + hash(u, 30 + j)) + j * 3 + u)
          ctx.fillStyle = rgba('#9dffd8', 0.35 + 0.5 * tw)
          const px = sx + (hash(u, 40 + j) - 0.5) * 90 * s
          const py = Y(c) + (6 + hash(u, 50 + j) * 40) * s
          ctx.fillRect(px, py, 2.2 * s, 2.2 * s)
        }
      } else {
        if (k < 0.3) {
          // 割れ目から見える空
          const py = Y(c) + 4 * s
          ctx.fillStyle = '#bfe2ff'
          ctx.beginPath()
          ctx.ellipse(sx, py, (10 + k * 30) * s, 6 * s, 0, 0, Math.PI * 2)
          ctx.fill()
        } else if (k < 0.5) {
          // 鳥の巣と羽根
          const py = Y(g + (c - g) * 0.55)
          ctx.fillStyle = '#8a6a44'
          ctx.beginPath()
          ctx.ellipse(sx, py, 18 * s, 7 * s, 0, 0, Math.PI)
          ctx.fill()
          ctx.fillStyle = '#f4efe6'
          ctx.beginPath()
          ctx.ellipse(sx - 5 * s, py - 2 * s, 5 * s, 3 * s, 0, 0, Math.PI * 2)
          ctx.ellipse(sx + 4 * s, py - 3 * s, 5 * s, 3 * s, 0, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }
    // 大きな洞窟の主役（滝・大水晶・吹き抜けの光）
    for (const cv of course.caverns) {
      const mx = (cv.x0 + cv.x1) / 2
      const sx = X(mx)
      if (sx < -W || sx > W * 2) continue
      if (cv.theme === 'water') drawWaterfall(mx)
      else if (cv.theme === 'mid') drawBigCrystals(cv.x0, cv.x1)
      else drawSkylight(mx)
    }
    ctx.restore()
  }

  function drawFossil(x: number, y: number, r: number, color: string): void {
    ctx.strokeStyle = rgba('#b6d3d9', 0.35)
    ctx.lineWidth = Math.max(1, r * 0.12)
    ctx.beginPath()
    for (let a = 0; a < Math.PI * 5; a += 0.3) {
      const rr = (r * a) / (Math.PI * 5)
      const px = x + Math.cos(a) * rr
      const py = y + Math.sin(a) * rr
      if (a === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.stroke()
    void color
  }

  function drawCrystal(x: number, y: number, h: number, color: string, seed: number): void {
    const n = 3 + Math.floor(seed * 3)
    for (let i = 0; i < n; i++) {
      const a = (i - (n - 1) / 2) * 0.32 + (seed - 0.5) * 0.3
      const hh = h * (0.6 + 0.4 * Math.cos(i * 1.7 + seed * 5))
      const w = h * 0.18
      const tx = x + Math.sin(a) * hh
      const ty = y - Math.cos(a) * hh
      const nx = Math.cos(a) * w
      const ny = Math.sin(a) * w
      ctx.fillStyle = rgba(color, 0.85)
      ctx.beginPath()
      ctx.moveTo(x - nx, y - ny)
      ctx.lineTo(tx - nx * 0.6, ty - ny * 0.6)
      ctx.lineTo(tx + Math.sin(a) * w, ty - Math.cos(a) * w)
      ctx.lineTo(tx + nx * 0.6, ty + ny * 0.6)
      ctx.lineTo(x + nx, y + ny)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.35)'
      ctx.beginPath()
      ctx.moveTo(x - nx * 0.2, y - ny * 0.2)
      ctx.lineTo(tx - nx * 0.4, ty - ny * 0.4)
      ctx.lineTo(tx + Math.sin(a) * w, ty - Math.cos(a) * w)
      ctx.closePath()
      ctx.fill()
    }
  }

  function drawWaterfall(mx: number): void {
    const c = ceilAt(mx)
    const g = groundAt(mx) - 260
    const top = Y(c)
    const bot = Y(g)
    const sx = X(mx + 120)
    const w = 70 * s
    const gr = ctx.createLinearGradient(sx - w, 0, sx + w, 0)
    gr.addColorStop(0, 'rgba(160,230,255,0)')
    gr.addColorStop(0.25, 'rgba(160,230,255,0.55)')
    gr.addColorStop(0.5, 'rgba(220,250,255,0.75)')
    gr.addColorStop(0.75, 'rgba(160,230,255,0.55)')
    gr.addColorStop(1, 'rgba(160,230,255,0)')
    ctx.fillStyle = gr
    ctx.fillRect(sx - w, top, w * 2, bot - top)
    // 流れる筋
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'
    ctx.lineWidth = 2 * s
    for (let i = 0; i < 10; i++) {
      const px = sx - w * 0.7 + (i / 9) * w * 1.4
      const off = ((v_t * 420 + i * 97) % 220) * s
      for (let y = top + off; y < bot; y += 220 * s) {
        ctx.beginPath()
        ctx.moveTo(px, y)
        ctx.lineTo(px, y + 50 * s)
        ctx.stroke()
      }
    }
    // しぶきのもや
    const mg = ctx.createRadialGradient(sx, bot, 0, sx, bot, 200 * s)
    mg.addColorStop(0, 'rgba(220,250,255,0.5)')
    mg.addColorStop(1, 'rgba(220,250,255,0)')
    ctx.fillStyle = mg
    ctx.fillRect(sx - 200 * s, bot - 200 * s, 400 * s, 400 * s)
  }

  function drawBigCrystals(x0: number, x1: number): void {
    for (let i = 0; i < 6; i++) {
      const wx = x0 + ((x1 - x0) * (i + 0.5)) / 6
      const g = groundAt(wx)
      const c = ceilAt(wx)
      drawCrystal(X(wx + 40), Y(g + (c - g) * 0.2), (80 + hash(i, 61) * 90) * s, i % 2 ? PAL.mid.accent : PAL.mid.accent2, hash(i, 62))
      drawCrystal(X(wx - 60), Y(c) + 10 * s, -(50 + hash(i, 63) * 50) * s, i % 2 ? PAL.mid.accent2 : PAL.mid.accent, hash(i, 64))
    }
  }

  function drawSkylight(mx: number): void {
    const c = ceilAt(mx)
    const g = groundAt(mx)
    const sx = X(mx)
    const top = Y(c) - 30 * s
    // 天井の大きな穴から差しこむ光の柱
    for (let i = -1; i <= 1; i++) {
      const bx = sx + i * 120 * s
      const gr = ctx.createLinearGradient(bx, top, bx + 140 * s, Y(g))
      gr.addColorStop(0, 'rgba(255,248,220,0.55)')
      gr.addColorStop(1, 'rgba(255,248,220,0)')
      ctx.fillStyle = gr
      ctx.beginPath()
      ctx.moveTo(bx - 40 * s, top)
      ctx.lineTo(bx + 40 * s, top)
      ctx.lineTo(bx + 220 * s, Y(g))
      ctx.lineTo(bx + 40 * s, Y(g))
      ctx.closePath()
      ctx.fill()
    }
    // 空と鳥
    ctx.fillStyle = '#cfe8ff'
    ctx.beginPath()
    ctx.ellipse(sx, top, 150 * s, 40 * s, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(40,50,80,0.7)'
    ctx.lineWidth = 2 * s
    for (let i = 0; i < 3; i++) {
      const px = sx + Math.sin(v_t * 0.6 + i * 2) * 90 * s
      const py = top - 4 * s + Math.cos(v_t * 0.8 + i) * 10 * s
      const f = Math.sin(v_t * 8 + i) * 4 * s
      ctx.beginPath()
      ctx.moveTo(px - 8 * s, py - f)
      ctx.quadraticCurveTo(px - 3 * s, py - 3 * s, px, py)
      ctx.quadraticCurveTo(px + 3 * s, py - 3 * s, px + 8 * s, py - f)
      ctx.stroke()
    }
  }

  // ---- 地面・天井の岩 ----
  function drawRock(xa: number, xb: number): void {
    const step = Math.max(12, STEP)
    const a = Math.floor(xa / step) * step
    // 地面
    ctx.beginPath()
    ctx.moveTo(X(a), H + 10)
    for (let x = a; x <= xb + step; x += step) ctx.lineTo(X(x), Y(groundAt(x)))
    ctx.lineTo(X(xb + step), H + 10)
    ctx.closePath()
    const gg = ctx.createLinearGradient(0, Y(groundAt((xa + xb) / 2)), 0, H)
    const midX = (xa + xb) / 2
    gg.addColorStop(0, palColor(midX, 'rock'))
    gg.addColorStop(1, palColor(midX, 'rockLo'))
    ctx.fillStyle = gg
    ctx.fill()
    // 外の地面（草・砂）を上にかぶせる
    for (const side of ['from', 'to'] as const) {
      const ox0 = side === 'from' ? xa : Math.max(xa, course.exitX - 40)
      const ox1 = side === 'from' ? Math.min(xb, course.mouthX + 40) : xb
      if (ox1 <= ox0) continue
      const o = OUT[side === 'from' ? course.from : course.to]
      ctx.beginPath()
      ctx.moveTo(X(ox0), H + 10)
      for (let x = Math.floor(ox0 / step) * step; x <= ox1 + step; x += step) ctx.lineTo(X(x), Y(groundAt(x)))
      ctx.lineTo(X(ox1 + step), H + 10)
      ctx.closePath()
      const og = ctx.createLinearGradient(0, Y(groundAt(ox0)), 0, Y(groundAt(ox0)) + 160 * s)
      og.addColorStop(0, o.ground)
      og.addColorStop(1, o.groundLo)
      ctx.fillStyle = og
      ctx.fill()
      ctx.strokeStyle = o.grass
      ctx.lineWidth = 5 * s
      ctx.beginPath()
      for (let x = Math.floor(ox0 / step) * step; x <= ox1; x += step) {
        if (x === Math.floor(ox0 / step) * step) ctx.moveTo(X(x), Y(groundAt(x)))
        else ctx.lineTo(X(x), Y(groundAt(x)))
      }
      ctx.stroke()
    }
    // 地層の線
    ctx.lineWidth = 5 * s
    for (let k = 1; k <= 4; k++) {
      ctx.strokeStyle = rgba('#000000', 0.12)
      ctx.beginPath()
      let first = true
      for (let x = a; x <= xb + step; x += step * 2) {
        const y = Y(groundAt(x) - k * 46 - Math.sin(x * 0.004 + k) * 14)
        if (first) ctx.moveTo(X(x), y)
        else ctx.lineTo(X(x), y)
        first = false
      }
      ctx.stroke()
    }
    // 小石
    const t0 = Math.floor(xa / 70)
    const t1 = Math.ceil(xb / 70)
    for (let i = t0; i <= t1; i++) {
      const x = i * 70 + hash(i, 71) * 50
      const y = groundAt(x) - 10 - hash(i, 72) * 130
      ctx.fillStyle = hash(i, 73) > 0.5 ? rgba('#ffffff', 0.08) : rgba('#000000', 0.18)
      ctx.beginPath()
      ctx.ellipse(X(x), Y(y), (4 + hash(i, 74) * 9) * s, (3 + hash(i, 75) * 5) * s, 0, 0, Math.PI * 2)
      ctx.fill()
    }
    // 天井（坑道の外は山の斜面）
    ctx.beginPath()
    ctx.moveTo(X(a), -10)
    for (let x = a; x <= xb + step; x += step) ctx.lineTo(X(x), Y(ceilAt(x)))
    ctx.lineTo(X(xb + step), -10)
    ctx.closePath()
    const cg = ctx.createLinearGradient(0, 0, 0, Y(ceilAt(midX)))
    cg.addColorStop(0, palColor(midX, 'rockLo'))
    cg.addColorStop(1, palColor(midX, 'rock'))
    ctx.fillStyle = cg
    ctx.fill()
    // 天井のふちの明るい線と、つらら石
    ctx.strokeStyle = rgba('#ffffff', 0.1)
    ctx.lineWidth = 3 * s
    ctx.beginPath()
    for (let x = a; x <= xb + step; x += step) {
      if (x === a) ctx.moveTo(X(x), Y(ceilAt(x)))
      else ctx.lineTo(X(x), Y(ceilAt(x)))
    }
    ctx.stroke()
    const k0 = Math.floor(xa / 90)
    const k1 = Math.ceil(xb / 90)
    for (let i = k0; i <= k1; i++) {
      const x = i * 90 + hash(i, 81) * 60
      if (!inTunnel(x) || hash(i, 82) < 0.35) continue
      const c = ceilAt(x)
      const len = (16 + hash(i, 83) * 44) * s
      const w = (6 + hash(i, 84) * 8) * s
      ctx.fillStyle = palColor(x, 'rock')
      ctx.beginPath()
      ctx.moveTo(X(x) - w, Y(c) - 2)
      ctx.lineTo(X(x) + (hash(i, 85) - 0.5) * 6 * s, Y(c) + len)
      ctx.lineTo(X(x) + w, Y(c) - 2)
      ctx.closePath()
      ctx.fill()
    }
  }

  // ---- 坑道の口（木の枠と看板） ----
  function drawPortal(x: number, side: 'from' | 'to'): void {
    const sx = X(x)
    if (sx < -200 || sx > W + 200) return
    const g = groundAt(x)
    const c = sampleAt(course.ceil, x)
    const top = Y(c) - 6 * s
    const post = (px: number) => {
      ctx.fillStyle = '#6b4526'
      ctx.fillRect(px - 9 * s, top, 18 * s, Y(g) - top)
      ctx.fillStyle = 'rgba(0,0,0,0.25)'
      ctx.fillRect(px + 3 * s, top, 6 * s, Y(g) - top)
    }
    post(sx - 24 * s)
    post(sx + 24 * s)
    ctx.fillStyle = '#7b5130'
    ctx.fillRect(sx - 60 * s, top - 14 * s, 120 * s, 22 * s)
    ctx.fillStyle = 'rgba(0,0,0,0.2)'
    ctx.fillRect(sx - 60 * s, top + 2 * s, 120 * s, 6 * s)
    // 看板（行き先）
    const label = side === 'from' ? signText(course.to, 'to') : signText(course.from, 'from')
    const bw = 150 * s
    const by = top - 54 * s
    ctx.fillStyle = '#f6e6c4'
    roundRect(sx - bw / 2, by, bw, 32 * s, 6 * s)
    ctx.fill()
    ctx.strokeStyle = '#6b4526'
    ctx.lineWidth = 3 * s
    ctx.stroke()
    ctx.fillStyle = '#4a2f18'
    ctx.font = `800 ${Math.round(15 * s)}px ${font}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, sx, by + 16.5 * s)
    // ランタン
    const lx = sx + 46 * s
    const ly = top + 30 * s
    ctx.fillStyle = '#ffcc66'
    ctx.beginPath()
    ctx.arc(lx, ly, 7 * s, 0, Math.PI * 2)
    ctx.fill()
  }
  let lang: 'ja' | 'en' = 'ja'
  const WORLD_NAME: Record<'water' | 'sky', { ja: string; en: string }> = {
    water: { ja: '水の世界', en: 'Water World' },
    sky: { ja: '空の世界', en: 'Sky World' },
  }
  const signText = (w: 'water' | 'sky', dir: 'to' | 'from') =>
    lang === 'en' ? (dir === 'to' ? `To ${WORLD_NAME[w].en} →` : `← ${WORLD_NAME[w].en}`) : dir === 'to' ? `${WORLD_NAME[w].ja} ゆき →` : `← ${WORLD_NAME[w].ja}`

  function roundRect(x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y, x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r)
    ctx.arcTo(x, y, x + w, y, r)
    ctx.closePath()
  }

  // ---- 駅のホーム・車止め ----
  function drawPlatform(x0: number, x1: number, world: 'water' | 'sky', end: boolean): void {
    const sx0 = X(x0)
    const sx1 = X(x1)
    if (sx1 < -50 || sx0 > W + 50) return
    const g = groundAt((x0 + x1) / 2)
    const py = Y(g + 26)
    ctx.fillStyle = '#a57449'
    ctx.fillRect(sx0, py, sx1 - sx0, 12 * s)
    ctx.fillStyle = '#7d5332'
    ctx.fillRect(sx0, py + 12 * s, sx1 - sx0, 6 * s)
    for (let x = x0 + 30; x < x1; x += 90) {
      ctx.fillStyle = '#6b4526'
      ctx.fillRect(X(x) - 4 * s, py + 18 * s, 8 * s, Y(g) - py - 18 * s)
    }
    // 車止め（着く駅）
    if (end) {
      const bx = X(course.endX + CART_W / 2 + 26)
      const by = Y(railYMain(course.endX + 60) ?? g)
      ctx.fillStyle = '#c0392b'
      ctx.fillRect(bx, by - 30 * s, 12 * s, 30 * s)
      ctx.fillStyle = '#f1f1f1'
      ctx.fillRect(bx, by - 22 * s, 12 * s, 5 * s)
    }
    // 生き物のお出迎え（水の世界はペンギン、空の世界はフクロウ）
    const ax = X(end ? x0 + 140 : x0 + 90)
    const ay = py
    if (world === 'water') drawPenguin(ax, ay, Math.sin(v_t * 4) * 0.4)
    else drawOwl(ax, ay - 2 * s, Math.sin(v_t * 2))
  }

  function drawPenguin(x: number, y: number, wave: number): void {
    const k = s * 1.1
    ctx.fillStyle = '#1f2633'
    ctx.beginPath()
    ctx.ellipse(x, y - 22 * k, 13 * k, 22 * k, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#f7f7f2'
    ctx.beginPath()
    ctx.ellipse(x + 2 * k, y - 19 * k, 9 * k, 17 * k, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#1f2633'
    ctx.save()
    ctx.translate(x - 11 * k, y - 26 * k)
    ctx.rotate(-0.6 - wave)
    ctx.beginPath()
    ctx.ellipse(0, 8 * k, 4 * k, 11 * k, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    ctx.fillStyle = '#f2a33a'
    ctx.beginPath()
    ctx.moveTo(x + 9 * k, y - 36 * k)
    ctx.lineTo(x + 17 * k, y - 34 * k)
    ctx.lineTo(x + 9 * k, y - 32 * k)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(x + 5 * k, y - 37 * k, 2.6 * k, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#111'
    ctx.beginPath()
    ctx.arc(x + 5.6 * k, y - 37 * k, 1.4 * k, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#f2a33a'
    ctx.fillRect(x - 6 * k, y - 2 * k, 7 * k, 3 * k)
    ctx.fillRect(x + 3 * k, y - 2 * k, 7 * k, 3 * k)
  }

  function drawOwl(x: number, y: number, tilt: number): void {
    const k = s * 1.1
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(tilt * 0.08)
    ctx.fillStyle = '#9b7653'
    ctx.beginPath()
    ctx.ellipse(0, -20 * k, 15 * k, 20 * k, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#e9d6b5'
    ctx.beginPath()
    ctx.ellipse(0, -15 * k, 9 * k, 12 * k, 0, 0, Math.PI * 2)
    ctx.fill()
    for (const sx of [-6, 6]) {
      ctx.fillStyle = '#fff'
      ctx.beginPath()
      ctx.arc(sx * k, -30 * k, 6 * k, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#f3b33d'
      ctx.beginPath()
      ctx.arc(sx * k, -30 * k, 4 * k, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#111'
      ctx.beginPath()
      ctx.arc(sx * k, -30 * k, 2 * k, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.fillStyle = '#e39a2d'
    ctx.beginPath()
    ctx.moveTo(-2 * k, -25 * k)
    ctx.lineTo(2 * k, -25 * k)
    ctx.lineTo(0, -20 * k)
    ctx.fill()
    ctx.fillStyle = '#9b7653'
    ctx.beginPath()
    ctx.moveTo(-13 * k, -36 * k)
    ctx.lineTo(-9 * k, -45 * k)
    ctx.lineTo(-5 * k, -37 * k)
    ctx.moveTo(13 * k, -36 * k)
    ctx.lineTo(9 * k, -45 * k)
    ctx.lineTo(5 * k, -37 * k)
    ctx.fill()
    ctx.restore()
  }

  const railYMain = (x: number): number | null => {
    for (const r of course.rails) {
      if (r.kind !== 'main') continue
      const y = railY(r, x)
      if (y !== null) return y
    }
    return null
  }

  // ---- 線路 ----
  function drawRails(xa: number, xb: number, t: number): void {
    for (let ri = 0; ri < course.rails.length; ri++) {
      const r = course.rails[ri]
      const n = r.xs.length
      if (r.xs[n - 1] < xa || r.xs[0] > xb) continue
      const i0 = Math.max(0, lowerIdx(r.xs, xa) - 1)
      const i1 = Math.min(n - 1, lowerIdx(r.xs, xb) + 1)
      // 柱（地面より高い所）
      for (let i = i0; i <= i1; i++) {
        const x = r.xs[i]
        if (Math.round(x) % 60 !== 0 && i !== i0) continue
        const y = r.ys[i]
        const g = groundAt(x)
        if (y - g > 18) {
          ctx.fillStyle = '#5a3a20'
          ctx.fillRect(X(x) - 4 * s, Y(y) + 6 * s, 8 * s, Y(g) - Y(y) - 6 * s)
          if (y - g > 60) {
            ctx.strokeStyle = 'rgba(70,45,24,0.9)'
            ctx.lineWidth = 3 * s
            ctx.beginPath()
            ctx.moveTo(X(x - 30), Y(y - 12))
            ctx.lineTo(X(x + 30), Y(Math.max(g + 10, y - 70)))
            ctx.moveTo(X(x + 30), Y(y - 12))
            ctx.lineTo(X(x - 30), Y(Math.max(g + 10, y - 70)))
            ctx.stroke()
          }
        }
      }
      // まくら木
      ctx.fillStyle = '#6e4a2b'
      const tieStep = 24
      const tx0 = Math.max(r.xs[0], Math.floor(xa / tieStep) * tieStep)
      for (let x = tx0; x <= Math.min(xb, r.xs[n - 1]); x += tieStep) {
        const y = railY(r, x)
        if (y === null) continue
        ctx.fillRect(X(x) - 5 * s, Y(y) + 1 * s, 10 * s, 9 * s)
      }
      // レール
      ctx.lineCap = 'round'
      ctx.strokeStyle = '#4b5059'
      ctx.lineWidth = 5 * s
      ctx.beginPath()
      for (let i = i0; i <= i1; i++) {
        const px = X(r.xs[i])
        const py = Y(r.ys[i]) - 1 * s
        if (i === i0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.stroke()
      ctx.strokeStyle = '#c9ced8'
      ctx.lineWidth = 1.6 * s
      ctx.beginPath()
      for (let i = i0; i <= i1; i++) {
        const px = X(r.xs[i])
        const py = Y(r.ys[i]) - 3 * s
        if (i === i0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.stroke()
      // 切れ目のはし: 折れた板
      for (const end of [0, n - 1]) {
        const x = r.xs[end]
        if (x < xa || x > xb) continue
        const joined = course.rails.some((o, oi) => oi !== ri && (railY(o, x + (end === 0 ? -2 : 2)) ?? 1e9) < 1e8 && Math.abs((railY(o, x) ?? 1e9) - r.ys[end]) < 14)
        if (joined) continue
        ctx.fillStyle = '#7a5230'
        ctx.save()
        ctx.translate(X(x), Y(r.ys[end]) + 4 * s)
        ctx.rotate(end === 0 ? -0.5 : 0.5)
        ctx.fillRect(-14 * s, -3 * s, 28 * s, 6 * s)
        ctx.restore()
      }
    }
    // 上昇気流の穴（切れ目の下の格子と、立ちのぼる風）
    for (const ev of course.events) {
      if (ev.type !== 'vent' || ev.x < xa - 200 || ev.x > xb + 200) continue
      const g = groundAt(ev.x)
      const gx = X(ev.x)
      ctx.fillStyle = '#2b2f3a'
      ctx.fillRect(gx - (ev.w / 2) * s, Y(g) - 4 * s, ev.w * s, 8 * s)
      ctx.strokeStyle = 'rgba(255,255,255,0.18)'
      ctx.lineWidth = 2 * s
      for (let k = 0; k < 9; k++) {
        const px = gx + (k / 8 - 0.5) * ev.w * s
        const off = ((t * 260 + k * 53) % 260) * s
        ctx.beginPath()
        ctx.moveTo(px + Math.sin(t * 3 + k) * 6 * s, Y(g) - off)
        ctx.lineTo(px + Math.sin(t * 3 + k + 0.5) * 6 * s, Y(g) - off - 60 * s)
        ctx.stroke()
      }
    }
    // 水たまり
    for (const ev of course.events) {
      if (ev.type !== 'splash' || ev.x1 < xa || ev.x0 > xb) continue
      ctx.fillStyle = 'rgba(110,210,240,0.45)'
      ctx.beginPath()
      let first = true
      for (let x = ev.x0; x <= ev.x1; x += 20) {
        const y = lowestRailY(x) ?? groundAt(x)
        const yy = Y(y + 8 + Math.sin(x * 0.06 + t * 4) * 2)
        if (first) ctx.moveTo(X(x), yy)
        else ctx.lineTo(X(x), yy)
        first = false
      }
      for (let x = ev.x1; x >= ev.x0; x -= 20) {
        const y = lowestRailY(x) ?? groundAt(x)
        ctx.lineTo(X(x), Y(y - 10))
      }
      ctx.closePath()
      ctx.fill()
    }
  }
  const lowestRailY = (x: number): number | null => {
    let lo: number | null = null
    for (const r of course.rails) {
      const y = railY(r, x)
      if (y !== null && (lo === null || y < lo)) lo = y
    }
    return lo
  }
  function lowerIdx(xs: number[], x: number): number {
    let lo = 0
    let hi = xs.length - 1
    if (x <= xs[0]) return 0
    if (x >= xs[hi]) return hi
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1
      if (xs[m] <= x) lo = m
      else hi = m
    }
    return lo
  }

  // ---- 拾うもの ----
  function drawItem(it: Item, t: number): void {
    const bob = Math.sin(t * 3 + it.x * 0.05) * 4
    const x = X(it.x)
    const y = Y(it.y + bob)
    if (x < -40 || x > W + 40) return
    // ぼんやり光る
    const gl = ctx.createRadialGradient(x, y, 0, x, y, 26 * s)
    const glow = it.kind === 'shell' ? '255,200,220' : it.kind === 'gem' ? '170,140,255' : '255,250,220'
    gl.addColorStop(0, `rgba(${glow},0.55)`)
    gl.addColorStop(1, `rgba(${glow},0)`)
    ctx.fillStyle = gl
    ctx.fillRect(x - 26 * s, y - 26 * s, 52 * s, 52 * s)
    drawItemIcon(ctx, it.kind, x, y, 13 * s, t + it.x)
  }

  // ---- 生き物 ----
  function drawMole(m: Mole, t: number): void {
    if (m.state === 'wait' || m.state === 'gone') return
    const x = X(m.x)
    const gy = Y(m.y)
    // 土の山
    ctx.fillStyle = '#6d4b2f'
    ctx.beginPath()
    ctx.ellipse(x, gy + 2 * s, 26 * s, 10 * s, 0, Math.PI, 0)
    ctx.fill()
    const up =
      m.state === 'up' ? Math.min(1, m.t / 0.25) : m.state === 'down' ? Math.max(0, 1 - m.t / 0.3) : 1
    if (up <= 0) return
    ctx.save()
    ctx.beginPath()
    ctx.rect(x - 40 * s, gy - 80 * s, 80 * s, 80 * s)
    ctx.clip()
    const k = s * 1.15
    const bodyY = gy + (1 - up) * 46 * k
    const wob = m.state === 'laugh' ? Math.sin(t * 22) * 2 * k : 0
    ctx.fillStyle = '#4a4248'
    ctx.beginPath()
    ctx.ellipse(x, bodyY - 20 * k + wob, 18 * k, 24 * k, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#5b525a'
    ctx.beginPath()
    ctx.ellipse(x - 4 * k, bodyY - 28 * k + wob, 9 * k, 10 * k, 0, 0, Math.PI * 2)
    ctx.fill()
    // 鼻
    ctx.fillStyle = '#ff9fb3'
    ctx.beginPath()
    ctx.ellipse(x - 12 * k, bodyY - 30 * k + wob, 6 * k, 5 * k, 0, 0, Math.PI * 2)
    ctx.fill()
    // 目（細い線）
    ctx.strokeStyle = '#111'
    ctx.lineWidth = 2 * k
    ctx.beginPath()
    if (m.state === 'laugh') {
      ctx.arc(x - 3 * k, bodyY - 36 * k + wob, 3 * k, Math.PI * 1.1, Math.PI * 1.9)
    } else if (m.state === 'pout') {
      ctx.moveTo(x - 6 * k, bodyY - 37 * k)
      ctx.lineTo(x, bodyY - 35 * k)
    } else {
      ctx.moveTo(x - 5 * k, bodyY - 36 * k)
      ctx.lineTo(x - 1 * k, bodyY - 36 * k)
    }
    ctx.stroke()
    // 大きなピンクの手
    const throwA = m.state === 'throw' ? -1.4 + Math.min(1, m.t / 0.2) * 1.6 : m.state === 'laugh' ? Math.sin(t * 16) * 0.4 : 0
    for (const side of [-1, 1]) {
      ctx.save()
      ctx.translate(x + side * 15 * k, bodyY - 14 * k + wob)
      ctx.rotate(side === -1 ? throwA : -throwA * 0.3)
      ctx.fillStyle = '#ffb3c1'
      ctx.beginPath()
      ctx.ellipse(side * 3 * k, -6 * k, 7 * k, 9 * k, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
    ctx.restore()
  }

  function drawClod(c: Clod): void {
    if (c.state === 'passed') return
    const x = X(c.x)
    const y = Y(c.y)
    if (c.state === 'burst') return
    ctx.fillStyle = '#7a5434'
    ctx.beginPath()
    ctx.ellipse(x, y - 12 * s, 17 * s, 13 * s, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#5d3e24'
    ctx.beginPath()
    ctx.arc(x - 6 * s, y - 15 * s, 4 * s, 0, Math.PI * 2)
    ctx.arc(x + 7 * s, y - 9 * s, 3 * s, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.15)'
    ctx.beginPath()
    ctx.ellipse(x - 4 * s, y - 20 * s, 6 * s, 3 * s, -0.3, 0, Math.PI * 2)
    ctx.fill()
  }

  function drawMouseAt(x: number, y: number, flip: number, t: number, carry: Item['kind'] | null, run: boolean): void {
    const k = s * 1.05
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(flip, 1)
    // しっぽ
    ctx.strokeStyle = '#d99aa2'
    ctx.lineWidth = 2 * k
    ctx.beginPath()
    ctx.moveTo(-12 * k, -6 * k)
    ctx.quadraticCurveTo(-26 * k, -6 * k + Math.sin(t * 10) * 6 * k, -30 * k, -16 * k)
    ctx.stroke()
    ctx.fillStyle = '#9a9198'
    ctx.beginPath()
    ctx.ellipse(0, -9 * k, 14 * k, 9 * k, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(12 * k, -13 * k, 8 * k, 7 * k, 0, 0, Math.PI * 2)
    ctx.fill()
    // 耳
    ctx.fillStyle = '#9a9198'
    ctx.beginPath()
    ctx.arc(9 * k, -22 * k, 6 * k, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#f2b6c0'
    ctx.beginPath()
    ctx.arc(9 * k, -22 * k, 3.6 * k, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#111'
    ctx.beginPath()
    ctx.arc(15 * k, -15 * k, 1.8 * k, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#ff8fa3'
    ctx.beginPath()
    ctx.arc(20 * k, -12 * k, 2 * k, 0, Math.PI * 2)
    ctx.fill()
    // ひげ
    ctx.strokeStyle = 'rgba(40,40,40,0.6)'
    ctx.lineWidth = 0.8 * k
    ctx.beginPath()
    ctx.moveTo(19 * k, -12 * k)
    ctx.lineTo(27 * k, -15 * k)
    ctx.moveTo(19 * k, -11 * k)
    ctx.lineTo(27 * k, -10 * k)
    ctx.stroke()
    // 足
    if (run) {
      const ph = Math.sin(t * 30)
      ctx.fillStyle = '#e5a7b1'
      ctx.fillRect(-6 * k + ph * 3 * k, -2 * k, 4 * k, 3 * k)
      ctx.fillRect(6 * k - ph * 3 * k, -2 * k, 4 * k, 3 * k)
    }
    if (carry) drawItemIcon(ctx, carry, 22 * k, -26 * k, 8 * k, t)
    ctx.restore()
  }

  function drawMouse(m: Mouse, t: number, cart: ViewState['cart']): void {
    if (m.state === 'gone') return
    if (m.state === 'wait') {
      // 梁の上で待つ
      const bx = X(m.x)
      const by = Y(m.beamY)
      ctx.fillStyle = '#6b4526'
      ctx.fillRect(bx - 50 * s, by, 100 * s, 10 * s)
      ctx.fillStyle = '#5a3a20'
      ctx.fillRect(bx - 50 * s, by - 200 * s, 8 * s, 200 * s)
      drawMouseAt(bx + 10 * s, by, -1, t, null, false)
      return
    }
    if (m.state === 'ride' || m.state === 'steal') {
      const p = cartPoint(cart, -14, 40)
      drawMouseAt(p.x, p.y, 1, t, m.carry, false)
      return
    }
    drawMouseAt(X(m.x), Y(m.y), m.state === 'run' ? -1 : 1, t, m.carry, m.state === 'run')
  }

  function drawBat(b: Bat, t: number): void {
    const x = X(b.x)
    const y = Y(b.y)
    const f = Math.sin(t * 26 + b.phase)
    const k = s
    ctx.fillStyle = '#2a1f3d'
    ctx.beginPath()
    ctx.ellipse(x, y, 6 * k, 5 * k, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(x - 3 * k, y)
    ctx.quadraticCurveTo(x - 12 * k, y - 10 * k * f, x - 20 * k, y + 2 * k * f)
    ctx.quadraticCurveTo(x - 12 * k, y + 2 * k, x - 3 * k, y + 2 * k)
    ctx.moveTo(x + 3 * k, y)
    ctx.quadraticCurveTo(x + 12 * k, y - 10 * k * f, x + 20 * k, y + 2 * k * f)
    ctx.quadraticCurveTo(x + 12 * k, y + 2 * k, x + 3 * k, y + 2 * k)
    ctx.fill()
    ctx.fillStyle = '#ffe36b'
    ctx.fillRect(x - 3 * k, y - 2 * k, 1.6 * k, 1.6 * k)
    ctx.fillRect(x + 1.4 * k, y - 2 * k, 1.6 * k, 1.6 * k)
  }

  // ---- トロッコと主人公 ----
  /** トロッコの中の点（トロッコの座標: 前が +x、上が +y）を画面へ */
  function cartPoint(c: ViewState['cart'], lx: number, ly: number): { x: number; y: number } {
    const ca = Math.cos(c.angle)
    const sa = Math.sin(c.angle)
    const wx = c.x + lx * ca - ly * sa
    const wy = c.y + lx * sa + ly * ca
    return { x: X(wx), y: Y(wy) }
  }

  function drawCart(c: ViewState['cart'], t: number): void {
    const p = cartPoint(c, 0, 0)
    ctx.save()
    ctx.translate(p.x, p.y)
    ctx.rotate(-c.angle)
    // トロッコの中は上が +y（キャンバスは下が +y なので裏返す）
    ctx.scale(s, -s)
    const sq = 1 + c.squash * 0.18
    ctx.scale(1 / sq, sq)
    // 主人公（箱のうしろ半分に座る）
    drawHero(c, t)
    // 箱
    const w = CART_W
    ctx.fillStyle = '#b8562f'
    ctx.beginPath()
    ctx.moveTo(-w / 2 - 4, 40)
    ctx.lineTo(w / 2 + 4, 40)
    ctx.lineTo(w / 2 - 3, 10)
    ctx.lineTo(-w / 2 + 3, 10)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#d9713f'
    ctx.fillRect(-w / 2 - 5, 36, w + 10, 6)
    ctx.fillStyle = '#7e3a1f'
    ctx.fillRect(-w / 2 + 2, 22, w - 4, 4)
    ctx.fillStyle = '#e9d29a'
    for (const rx of [-w / 2 + 8, -8, 8, w / 2 - 8]) {
      ctx.beginPath()
      ctx.arc(rx, 31, 1.8, 0, Math.PI * 2)
      ctx.arc(rx, 16, 1.8, 0, Math.PI * 2)
      ctx.fill()
    }
    // 車輪
    for (const wx of [-w / 2 + 14, w / 2 - 14]) {
      ctx.save()
      ctx.translate(wx, 8)
      ctx.fillStyle = '#2f333b'
      ctx.beginPath()
      ctx.arc(0, 0, 9, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#8b919c'
      ctx.lineWidth = 2
      ctx.rotate(-c.wheel)
      ctx.beginPath()
      ctx.moveTo(-7, 0)
      ctx.lineTo(7, 0)
      ctx.moveTo(0, -7)
      ctx.lineTo(0, 7)
      ctx.stroke()
      ctx.fillStyle = '#c9ced8'
      ctx.beginPath()
      ctx.arc(0, 0, 2.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
    ctx.restore()
  }

  function drawHero(c: ViewState['cart'], t: number): void {
    const cheer = c.cheer
    const bob = Math.sin(t * 14) * (c.onRail ? 0.8 : 0)
    // 体
    ctx.fillStyle = hero.jacket
    ctx.beginPath()
    ctx.ellipse(-6, 46 + bob, 14, 15, 0, 0, Math.PI * 2)
    ctx.fill()
    // 腕（ばんざい・ふちをつかむ）
    ctx.strokeStyle = hero.jacket
    ctx.lineCap = 'round'
    ctx.lineWidth = 7
    for (const side of [-1, 1]) {
      ctx.beginPath()
      ctx.moveTo(-6 + side * 9, 50 + bob)
      if (cheer > 0.3) ctx.lineTo(-6 + side * 16, 74 + bob)
      else ctx.lineTo(-6 + side * 4 + 12, 40)
      ctx.stroke()
    }
    ctx.fillStyle = '#f2c7a5'
    for (const side of [-1, 1]) {
      ctx.beginPath()
      if (cheer > 0.3) ctx.arc(-6 + side * 16, 77 + bob, 4, 0, Math.PI * 2)
      else ctx.arc(-6 + side * 4 + 13, 40, 3.6, 0, Math.PI * 2)
      ctx.fill()
    }
    // 頭（ホームの「だれで冒険する？」の顔の絵を丸く切る）
    const hx = -4
    const hy = 70 + bob
    const r = 15
    ctx.save()
    ctx.translate(hx, hy)
    ctx.scale(1, -1)
    ctx.beginPath()
    ctx.arc(0, 0, r, 0, Math.PI * 2)
    ctx.clip()
    if (hero.img && hero.img.complete && hero.img.naturalWidth > 0) {
      const iw = hero.img.naturalWidth
      ctx.drawImage(hero.img, iw * 0.14, iw * 0.06, iw * 0.72, iw * 0.72, -r * 1.05, -r * 1.12, r * 2.1, r * 2.1)
    } else {
      ctx.fillStyle = '#f2c7a5'
      ctx.fillRect(-r, -r, r * 2, r * 2)
      ctx.fillStyle = '#222'
      ctx.beginPath()
      ctx.arc(-5, 0, 2, 0, Math.PI * 2)
      ctx.arc(5, 0, 2, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.arc(hx, hy, r, 0, Math.PI * 2)
    ctx.stroke()
    // ヘルメットとランプ
    ctx.fillStyle = '#f5c518'
    ctx.beginPath()
    ctx.ellipse(hx, hy + 6, r + 2, 10, 0, 0, Math.PI)
    ctx.fill()
    ctx.fillStyle = '#d9a90c'
    ctx.fillRect(hx - r - 4, hy + 4, (r + 4) * 2, 3)
    ctx.fillStyle = '#fff7cf'
    ctx.beginPath()
    ctx.arc(hx + r - 1, hy + 9, 3.6, 0, Math.PI * 2)
    ctx.fill()
    // 目が回る（いたずらされた時）
    if (c.dizzy > 0) {
      ctx.fillStyle = '#ffe36b'
      for (let i = 0; i < 3; i++) {
        const a = t * 6 + (i * Math.PI * 2) / 3
        ctx.beginPath()
        ctx.arc(hx + Math.cos(a) * 18, hy + 22 + Math.sin(a) * 5, 2.6, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  // ---- 粒・文字・画面の汚れ ----
  function drawParticles(ps: Particle[], additive: boolean): void {
    for (const p of ps) {
      const add = p.kind === 'spark' || p.kind === 'glint' || p.kind === 'star'
      if (add !== additive) continue
      const a = Math.max(0, p.life / p.max)
      const x = X(p.x)
      const y = Y(p.y)
      if (x < -50 || x > W + 50 || y < -50 || y > H + 50) continue
      ctx.globalAlpha = Math.min(1, a * 1.4)
      ctx.fillStyle = p.color
      if (p.kind === 'spark') {
        ctx.strokeStyle = p.color
        ctx.lineWidth = p.size * s
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x - p.vx * 0.02 * s, y + p.vy * 0.02 * s)
        ctx.stroke()
      } else if (p.kind === 'star') {
        drawStar(x, y, p.size * s * (0.6 + a * 0.6), p.rot)
      } else if (p.kind === 'leaf') {
        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(p.rot)
        drawItemIcon(ctx, 'feather', 0, 0, p.size * s, p.rot)
        ctx.restore()
      } else if (p.kind === 'wind') {
        ctx.fillRect(x, y, p.size * 6 * s, 1.5 * s)
      } else {
        ctx.beginPath()
        ctx.arc(x, y, p.size * s * (p.kind === 'mist' ? 2 - a : 1), 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.globalAlpha = 1
  }
  function drawStar(x: number, y: number, r: number, rot: number): void {
    ctx.beginPath()
    for (let i = 0; i < 10; i++) {
      const rr = i % 2 === 0 ? r : r * 0.42
      const a = rot + (i * Math.PI) / 5 - Math.PI / 2
      if (i === 0) ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
      else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
    }
    ctx.closePath()
    ctx.fill()
  }

  function drawTexts(ts: FloatText[]): void {
    for (const ft of ts) {
      const k = Math.min(1, ft.t / 0.15)
      const fade = ft.t > 1.1 ? Math.max(0, 1 - (ft.t - 1.1) / 0.4) : 1
      const pop = 0.6 + 0.4 * k + (k < 1 ? 0 : Math.max(0, 0.12 - (ft.t - 0.15)) )
      const x = X(ft.x)
      const y = Y(ft.y) - ft.t * 30 * s
      const size = (ft.big ? 26 : 18) * s * pop
      ctx.globalAlpha = fade
      ctx.font = `900 ${Math.round(Math.max(10, size))}px ${font}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.lineWidth = Math.max(3, 5 * s)
      ctx.strokeStyle = 'rgba(20,16,40,0.85)'
      ctx.lineJoin = 'round'
      ctx.strokeText(ft.text, x, y)
      ctx.fillStyle = ft.color
      ctx.fillText(ft.text, x, y)
    }
    ctx.globalAlpha = 1
  }

  function drawDirt(amount: number, seed: number): void {
    if (amount <= 0) return
    // 泥はね: 画面のはし寄りに小さく。まん中（トロッコ）はふさがない
    const u = Math.min(W, H) / 400
    ctx.globalAlpha = Math.min(0.9, amount * 1.2)
    for (let i = 0; i < 7; i++) {
      const side = i % 2 ? 1 : 0
      const x = (side ? 0.72 + hash(seed, i * 3) * 0.24 : 0.04 + hash(seed, i * 3) * 0.24) * W
      const y = (0.14 + hash(seed, i * 3 + 1) * 0.72) * H
      const r = (12 + hash(seed, i * 3 + 2) * 22) * u
      ctx.fillStyle = i % 3 ? '#6b4a2e' : '#7d5634'
      ctx.beginPath()
      for (let k = 0; k <= 10; k++) {
        const a = (k / 10) * Math.PI * 2
        const rr = r * (0.75 + 0.3 * hash(seed + k, i))
        const px = x + Math.cos(a) * rr
        const py = y + Math.sin(a) * rr
        if (k === 0) ctx.moveTo(px, py)
        else ctx.quadraticCurveTo(x + Math.cos(a - 0.3) * rr * 1.15, y + Math.sin(a - 0.3) * rr * 1.15, px, py)
      }
      ctx.fill()
      // したたり（時間とともに伸びる）
      const drip = r * (0.4 + (1 - amount) * 1.4)
      ctx.beginPath()
      ctx.ellipse(x + r * 0.2, y + r * 0.6 + drip / 2, r * 0.16, drip / 2 + r * 0.1, 0, 0, Math.PI * 2)
      ctx.fill()
      // 飛び散った粒
      for (let k = 0; k < 4; k++) {
        const a = hash(seed + 7, i * 5 + k) * Math.PI * 2
        const d = r * (1.3 + hash(seed + 9, i * 5 + k) * 0.9)
        ctx.beginPath()
        ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, r * 0.13, 0, Math.PI * 2)
        ctx.fill()
      }
      // つや
      ctx.fillStyle = 'rgba(255,230,190,0.28)'
      ctx.beginPath()
      ctx.ellipse(x - r * 0.3, y - r * 0.35, r * 0.28, r * 0.16, -0.5, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  function drawSpeedLines(k: number, t: number): void {
    if (k <= 0) return
    ctx.strokeStyle = `rgba(255,255,255,${0.35 * k})`
    ctx.lineWidth = 2
    for (let i = 0; i < 18; i++) {
      const y = hash(i, 91) * H
      const len = (80 + hash(i, 92) * 160) * k
      const x = W - ((t * 2200 + hash(i, 93) * W * 2) % (W * 1.6))
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + len, y)
      ctx.stroke()
    }
  }

  // ---- 明かりの地図 ----
  function drawLight(v: ViewState, xa: number, xb: number): void {
    const lw = light.width
    const lh = light.height
    const k = lw / W
    const midX = camX
    const dark = darknessAt(midX)
    if (dark <= 0.01) return
    lctx.globalCompositeOperation = 'source-over'
    lctx.clearRect(0, 0, lw, lh)
    // 暗さは x で変わるので、横のグラデーション
    const g = lctx.createLinearGradient(0, 0, lw, 0)
    for (let i = 0; i <= 6; i++) {
      const wx = xa + ((xb - xa) * i) / 6
      g.addColorStop(i / 6, rgba(PAL[themeAt(course, wx)].dark, darknessAt(wx)))
    }
    lctx.fillStyle = g
    lctx.fillRect(0, 0, lw, lh)
    lctx.globalCompositeOperation = 'destination-out'
    const hole = (x: number, y: number, r: number, a: number) => {
      if (x < -r || x > W + r || y < -r || y > H + r) return
      const gr = lctx.createRadialGradient(x * k, y * k, 0, x * k, y * k, r * k)
      gr.addColorStop(0, `rgba(0,0,0,${a})`)
      gr.addColorStop(0.55, `rgba(0,0,0,${a * 0.55})`)
      gr.addColorStop(1, 'rgba(0,0,0,0)')
      lctx.fillStyle = gr
      lctx.fillRect((x - r) * k, (y - r) * k, r * 2 * k, r * 2 * k)
    }
    const c = v.cart
    const flick = v.lampFlicker > 0 ? 0.35 + 0.65 * Math.abs(Math.sin(v.t * 40)) : 1
    // ヘッドライトの円錐
    const lamp = cartPoint(c, 13, 79)
    const dirA = -c.angle
    const reach = 460 * s * flick
    lctx.save()
    lctx.translate(lamp.x * k, lamp.y * k)
    lctx.rotate(dirA)
    const cone = lctx.createRadialGradient(0, 0, 0, 0, 0, reach * k)
    cone.addColorStop(0, `rgba(0,0,0,${0.95 * flick})`)
    cone.addColorStop(0.6, `rgba(0,0,0,${0.6 * flick})`)
    cone.addColorStop(1, 'rgba(0,0,0,0)')
    lctx.fillStyle = cone
    lctx.beginPath()
    lctx.moveTo(0, 0)
    lctx.arc(0, 0, reach * k, -0.42, 0.62)
    lctx.closePath()
    lctx.fill()
    lctx.restore()
    hole(X(c.x), Y(c.y + 40), 150 * s * flick, 0.9)
    // 吊りランプ
    for (const l of course.lamps) {
      if (l.x < xa - 300 || l.x > xb + 300) continue
      hole(X(l.x), Y(l.y - 20), 230 * s, 0.85)
    }
    // 水晶・拾うもの・水・空の光
    for (const it of course.items) if (!it.taken && it.x > xa && it.x < xb) hole(X(it.x), Y(it.y), 40 * s, 0.6)
    for (const cv of course.caverns) {
      if (cv.x1 < xa - 400 || cv.x0 > xb + 400) continue
      const mx = (cv.x0 + cv.x1) / 2
      const r = (cv.theme === 'sky' ? 620 : 520) * s
      hole(X(mx + (cv.theme === 'water' ? 120 : 0)), Y((groundAt(mx) + ceilAt(mx)) / 2), r, cv.theme === 'mid' ? 0.75 : 0.85)
    }
    // 入口・出口の外の光
    hole(X(course.mouthX - 60), Y(groundAt(course.mouthX) + 120), 700 * s, 1)
    hole(X(course.exitX + 60), Y(groundAt(course.exitX) + 120), 700 * s, 1)
    lctx.globalCompositeOperation = 'source-over'
    ctx.drawImage(light, 0, 0, lw, lh, 0, 0, W, H)
    // ランプの暖かい光の輪（足し算）
    ctx.globalCompositeOperation = 'lighter'
    for (const l of course.lamps) {
      if (l.x < xa - 100 || l.x > xb + 100) continue
      const x = X(l.x)
      const y = Y(l.y - 20)
      const gr = ctx.createRadialGradient(x, y, 0, x, y, 60 * s)
      gr.addColorStop(0, 'rgba(255,200,110,0.55)')
      gr.addColorStop(1, 'rgba(255,200,110,0)')
      ctx.fillStyle = gr
      ctx.fillRect(x - 60 * s, y - 60 * s, 120 * s, 120 * s)
    }
    const lg = ctx.createRadialGradient(lamp.x, lamp.y, 0, lamp.x, lamp.y, 30 * s)
    lg.addColorStop(0, `rgba(255,250,210,${0.8 * flick})`)
    lg.addColorStop(1, 'rgba(255,250,210,0)')
    ctx.fillStyle = lg
    ctx.fillRect(lamp.x - 30 * s, lamp.y - 30 * s, 60 * s, 60 * s)
    ctx.globalCompositeOperation = 'source-over'
  }

  function drawLamps(xa: number, xb: number): void {
    for (const l of course.lamps) {
      if (l.x < xa - 50 || l.x > xb + 50) continue
      const x = X(l.x)
      const top = Y(ceilAt(l.x))
      const y = Y(l.y - 20)
      ctx.strokeStyle = '#2a2a2a'
      ctx.lineWidth = 1.5 * s
      ctx.beginPath()
      ctx.moveTo(x, top)
      ctx.lineTo(x, y - 8 * s)
      ctx.stroke()
      ctx.fillStyle = '#3a3a3a'
      ctx.fillRect(x - 6 * s, y - 10 * s, 12 * s, 3 * s)
      ctx.fillStyle = '#ffd27a'
      ctx.beginPath()
      ctx.ellipse(x, y, 5 * s, 7 * s, 0, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  return {
    resize,
    scale: () => base,
    size: () => ({ w: W, h: H }),
    toScreen: (x, y) => ({ x: X(x), y: Y(y) }),
    draw(v) {
      v_t = v.t
      lang = document.documentElement.lang === 'en' ? 'en' : 'ja'
      s = base * v.zoom
      camX = v.camX
      camY = v.camY
      cx = W * 0.5 + v.shakeX
      cy = H * 0.56 + v.shakeY
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const xa = camX - cx / s - 80
      const xb = camX + (W - cx) / s + 80
      ctx.fillStyle = palColor(camX, 'back')
      ctx.fillRect(0, 0, W, H)
      if (xa < course.mouthX) drawOutdoor('from', xa, course.mouthX + 10)
      if (xb > course.exitX) drawOutdoor('to', course.exitX - 10, xb)
      drawCaveBack(xa, xb)
      drawRock(xa, xb)
      drawPlatform(course.startX - 260, course.startX + 160, course.from, false)
      drawPlatform(course.endX - 200, course.endX + 220, course.to, true)
      drawLamps(xa, xb)
      for (const m of v.moles) drawMole(m, v.t)
      drawRails(xa, xb, v.t)
      drawPortal(course.mouthX, 'from')
      drawPortal(course.exitX, 'to')
      for (const it of course.items) if (!it.taken && it.x > xa - 40 && it.x < xb + 40) drawItem(it, v.t)
      for (const c of v.clods) drawClod(c)
      drawParticles(v.particles, false)
      drawCart(v.cart, v.t)
      for (const m of v.mice) drawMouse(m, v.t, v.cart)
      for (const b of v.bats) drawBat(b, v.t)
      drawLight(v, xa, xb)
      ctx.globalCompositeOperation = 'lighter'
      drawParticles(v.particles, true)
      ctx.globalCompositeOperation = 'source-over'
      drawTexts(v.texts)
      drawSpeedLines(v.speedLines, v.t)
      drawDirt(v.dirt, v.dirtSeed)
      if (v.flash > 0) {
        ctx.fillStyle = `rgba(255,252,240,${Math.min(1, v.flash)})`
        ctx.fillRect(0, 0, W, H)
      }
    },
  }
}

/** 拾うものの絵（HUD の数の横でも使う） */
export function drawItemIcon(ctx: CanvasRenderingContext2D, kind: Item['kind'], x: number, y: number, r: number, t: number): void {
  ctx.save()
  ctx.translate(x, y)
  if (kind === 'shell') {
    ctx.rotate(Math.sin(t * 2) * 0.15)
    ctx.fillStyle = '#ffb3c6'
    ctx.beginPath()
    ctx.moveTo(0, r * 0.9)
    for (let i = 0; i <= 8; i++) {
      const a = Math.PI + (i / 8) * Math.PI
      const rr = r * (i % 2 ? 1.0 : 0.9)
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr * 0.95 + r * 0.1)
    }
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = '#e07a97'
    ctx.lineWidth = Math.max(1, r * 0.1)
    for (let i = 1; i < 8; i += 1.5) {
      const a = Math.PI + (i / 8) * Math.PI
      ctx.beginPath()
      ctx.moveTo(0, r * 0.85)
      ctx.lineTo(Math.cos(a) * r * 0.85, Math.sin(a) * r * 0.8 + r * 0.1)
      ctx.stroke()
    }
    ctx.fillStyle = '#ffd6e2'
    ctx.fillRect(-r * 0.3, r * 0.7, r * 0.6, r * 0.3)
  } else if (kind === 'gem') {
    ctx.rotate(Math.sin(t * 1.5) * 0.1)
    ctx.fillStyle = '#a78bff'
    ctx.beginPath()
    ctx.moveTo(0, -r)
    ctx.lineTo(r * 0.8, -r * 0.2)
    ctx.lineTo(0, r)
    ctx.lineTo(-r * 0.8, -r * 0.2)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#e1d6ff'
    ctx.beginPath()
    ctx.moveTo(0, -r)
    ctx.lineTo(r * 0.8, -r * 0.2)
    ctx.lineTo(0, -r * 0.05)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#6f4fe0'
    ctx.beginPath()
    ctx.moveTo(-r * 0.8, -r * 0.2)
    ctx.lineTo(0, -r * 0.05)
    ctx.lineTo(0, r)
    ctx.closePath()
    ctx.fill()
  } else {
    ctx.rotate(-0.6 + Math.sin(t * 2.5) * 0.25)
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.moveTo(0, -r * 1.2)
    ctx.quadraticCurveTo(r * 0.8, -r * 0.3, r * 0.15, r * 1.1)
    ctx.quadraticCurveTo(-r * 0.7, -r * 0.1, 0, -r * 1.2)
    ctx.fill()
    ctx.strokeStyle = '#b9c7e6'
    ctx.lineWidth = Math.max(1, r * 0.12)
    ctx.beginPath()
    ctx.moveTo(0, -r * 1.0)
    ctx.quadraticCurveTo(r * 0.15, 0, r * 0.1, r * 1.3)
    ctx.stroke()
  }
  ctx.restore()
}
