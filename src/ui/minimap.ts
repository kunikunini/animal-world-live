import { ACACIAS, KOPJE, SPOT, WALK_RADIUS, WATERHOLE } from '../world/layout'
import { OUTER_REGIONS, PASS_HALF_WIDTH, SAVANNA } from '../world/regions'
import type { RegionKey } from '../world/regions'
import { getWorld } from '../data/worlds'
import { getLang, t } from './i18n'

/**
 * 地図の描画。左上のミニマップと、広げた全体地図の両方で使う。
 * 4 つのワールドと峠の道を円形の俯瞰で描く。北が上。
 * 見る範囲（中心と半径）は setView で変えられる。ミニマップは自分のまわり、広げた地図は全体。
 * 地形・コピエ・水場・木・観察スポットは見る範囲が変わった時だけ描き直し、
 * 自分の位置と向き、ライオンの位置を毎回重ねる。色はワールドのトークンと同じ系統。
 */
export interface MinimapMarker {
  id: string
  name: string
  x: number
  z: number
  /** 強調（そばにいる個体など） */
  active?: boolean
  /** ともだち帳に登録済み。緑の輪で区別し、広げた地図では名前に添える */
  friend?: boolean
}

export interface MapPlayer {
  x: number
  z: number
  heading: number
}

export interface MapRenderer {
  size: number
  draw: (ctx: CanvasRenderingContext2D, player: MapPlayer, lions: MinimapMarker[]) => void
  /** キャンバス座標（0..size）→ 世界座標。範囲外なら null */
  toWorld: (mx: number, my: number) => { x: number; z: number } | null
  /** 見る範囲。中心（世界座標）と半径（m） */
  setView: (cx: number, cz: number, radius: number) => void
}

/** 自分のまわりを見るミニマップの半径（いままでのサバンナ全体と同じ） */
export const MINIMAP_RADIUS = WALK_RADIUS + 8

/** ワールドごとの地図の色（中心・縁） */
const REGION_COLORS: Record<RegionKey, [string, string]> = {
  africa: ['#f6dc8a', '#cfa42f'],
  north: ['#f1f6fa', '#bccbdb'],
  jungle: ['#8fc06a', '#4f8a43'],
  south: ['#e9a777', '#c06a44'],
}

const C = {
  grass0: '#f6dc8a',
  grass1: '#e8c45a',
  grass2: '#cfa42f',
  water: '#8fc6ec',
  rock: '#b8834a',
  ramp: '#c9a27a',
  plateau: '#dcc29a',
  tree: '#6fae2e',
  spot: '#f4c242',
  rim: '#ffffff',
  ink: '#2b1d12',
  lion: '#d9a95f',
  lionActive: '#f4c242',
  lionEdge: '#6a4727',
  friend: '#6fae2e',
  you: '#f26a1b',
}

interface Box {
  l: number
  t: number
  r: number
  b: number
}

function overlaps(a: Box, b: Box): boolean {
  return a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** 白いピルの文字。left/top はピルの左上 */
function drawPill(ctx: CanvasRenderingContext2D, text: string, left: number, top: number, u: number): void {
  const font = `800 ${Math.round(11 * u)}px ${FONT}`
  ctx.font = font
  const padX = 6 * u
  const h = 16 * u
  const w = ctx.measureText(text).width + padX * 2
  ctx.fillStyle = 'rgba(255, 255, 255, 0.94)'
  roundRect(ctx, left, top, w, h, h / 2)
  ctx.fill()
  ctx.fillStyle = C.ink
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, left + padX, top + h / 2 + 0.5 * u)
}

function pillWidth(ctx: CanvasRenderingContext2D, text: string, u: number): number {
  ctx.font = `800 ${Math.round(11 * u)}px ${FONT}`
  return ctx.measureText(text).width + 12 * u
}

const FONT = "'Hiragino Maru Gothic ProN', 'Hiragino Sans', 'Noto Sans JP', system-ui, sans-serif"

export function createMapRenderer(size: number, options: { labels: boolean; baseAlpha?: number }): MapRenderer {
  const c = size / 2
  let vx = 0
  let vz = 0
  let viewR = MINIMAP_RADIUS
  let k = (size / 2 - size * 0.02) / viewR
  const px = (x: number) => c + (x - vx) * k
  const py = (z: number) => c + (z - vz) * k
  const u = size / 280 // 280px を基準にした線や点の倍率

  // --- 動かない部分（見る範囲が変わった時だけ描き直す） ---
  const base = document.createElement('canvas')
  base.width = size
  base.height = size
  const b = base.getContext('2d') as CanvasRenderingContext2D

  const regionFill = (key: RegionKey, x: number, z: number, r: number) => {
    const [inner, outer] = REGION_COLORS[key]
    const grad = b.createRadialGradient(px(x), py(z), r * k * 0.1, px(x), py(z), r * k)
    grad.addColorStop(0, inner)
    grad.addColorStop(0.75, inner)
    grad.addColorStop(1, outer)
    b.fillStyle = grad
    b.beginPath()
    b.arc(px(x), py(z), r * k, 0, Math.PI * 2)
    b.fill()
  }

  const spotRing = (x: number, z: number) => {
    b.strokeStyle = C.rim
    b.lineWidth = 4 * u
    b.beginPath()
    b.arc(px(x), py(z), 5 * u, 0, Math.PI * 2)
    b.stroke()
    b.strokeStyle = C.spot
    b.lineWidth = 2.4 * u
    b.beginPath()
    b.arc(px(x), py(z), 5 * u, 0, Math.PI * 2)
    b.stroke()
  }

  const drawBase = () => {
    b.clearRect(0, 0, size, size)
    b.save()
    b.beginPath()
    b.arc(c, c, c - 3 * u, 0, Math.PI * 2)
    b.clip()
    // 歩けない所（山）はうすい影
    b.fillStyle = 'rgba(90, 70, 50, 0.35)'
    b.fillRect(0, 0, size, size)

    // 峠の道: サバンナからとなりのワールドへ
    b.lineCap = 'round'
    for (const r of OUTER_REGIONS) {
      const grad = b.createLinearGradient(px(0), py(0), px(r.x), py(r.z))
      grad.addColorStop(0.35, REGION_COLORS.africa[1])
      grad.addColorStop(0.65, REGION_COLORS[r.key][1])
      b.strokeStyle = grad
      b.lineWidth = PASS_HALF_WIDTH * 2 * k
      b.beginPath()
      b.moveTo(px(0), py(0))
      b.lineTo(px(r.x), py(r.z))
      b.stroke()
    }
    regionFill('africa', SAVANNA.x, SAVANNA.z, SAVANNA.walk)
    for (const r of OUTER_REGIONS) regionFill(r.key, r.x, r.z, r.walk)

    // 水場
    b.fillStyle = C.water
    b.beginPath()
    b.arc(px(WATERHOLE.x), py(WATERHOLE.z), WATERHOLE.radius * k, 0, Math.PI * 2)
    b.fill()

    // コピエ: 岩肌の円、南の坂、頂上の台地
    b.fillStyle = C.rock
    b.beginPath()
    b.arc(px(KOPJE.x), py(KOPJE.z), KOPJE.radius * k, 0, Math.PI * 2)
    b.fill()
    b.fillStyle = C.ramp
    b.beginPath()
    b.moveTo(px(KOPJE.x), py(KOPJE.z))
    b.arc(px(KOPJE.x), py(KOPJE.z), KOPJE.radius * k, Math.PI / 2 - KOPJE.rampHalfAngle, Math.PI / 2 + KOPJE.rampHalfAngle)
    b.closePath()
    b.fill()
    b.fillStyle = C.plateau
    b.beginPath()
    b.arc(px(KOPJE.x), py(KOPJE.z), KOPJE.radius * KOPJE.plateau * k, 0, Math.PI * 2)
    b.fill()

    // 木
    b.fillStyle = C.tree
    for (const tr of ACACIAS) {
      b.beginPath()
      b.arc(px(tr.x), py(tr.z), 2.6 * u * tr.scale * Math.min(1, k / ((size / 2) / MINIMAP_RADIUS)) ** 0.5, 0, Math.PI * 2)
      b.fill()
    }

    // 観察スポット: 金の輪に白い縁（4 つのワールドそれぞれ）
    spotRing(SPOT.x, SPOT.z)
    for (const r of OUTER_REGIONS) spotRing(r.x, r.z)
    b.restore()

    // 縁と「N」
    b.strokeStyle = 'rgba(255, 255, 255, 0.7)'
    b.lineWidth = 2 * u
    b.beginPath()
    b.arc(c, c, c - 3 * u, 0, Math.PI * 2)
    b.stroke()
    b.fillStyle = C.ink
    b.font = `800 ${Math.round(16 * u)}px ${FONT}`
    b.textAlign = 'center'
    b.textBaseline = 'top'
    b.fillText('N', c, 8 * u)
  }
  drawBase()

  const setView = (cx: number, cz: number, radius: number) => {
    if (Math.abs(cx - vx) < 0.5 && Math.abs(cz - vz) < 0.5 && radius === viewR) return
    vx = cx
    vz = cz
    viewR = radius
    k = (size / 2 - size * 0.02) / viewR
    drawBase()
  }

  // 広げた地図だけ、場所の名前を入れる。個体の名前はこれらを避けて置く。
  // 言語を切り替えられるので、地形と違って毎回描く（3 つだけなので軽い）
  const drawPlaceLabels = (ctx: CanvasRenderingContext2D): Box[] => {
    const boxes: Box[] = []
    if (!options.labels) return boxes
    const pill = (text: string, left: number, top: number) => {
      drawPill(ctx, text, left, top, u)
      boxes.push({ l: left, t: top, r: left + pillWidth(ctx, text, u), b: top + 16 * u })
    }
    for (const r of OUTER_REGIONS) {
      const w = getWorld(r.key)
      const name = w ? w.name[getLang()] : r.key
      pill(name, px(r.x) - pillWidth(ctx, name, u) / 2, py(r.z) - (r.walk * 0.55) * k)
    }
    pill(t('waterhole'), px(WATERHOLE.x) + (WATERHOLE.radius + 3) * k, py(WATERHOLE.z) - 8 * u)
    const kopje = t('kopje')
    pill(kopje, px(KOPJE.x) - pillWidth(ctx, kopje, u) / 2, py(KOPJE.z) - (KOPJE.radius + 6) * k - 8 * u)
    pill(t('spot'), px(SPOT.x) + 8 * u, py(SPOT.z) - 8 * u)
    return boxes
  }

  const draw = (ctx: CanvasRenderingContext2D, player: MapPlayer, lions: MinimapMarker[]) => {
    ctx.clearRect(0, 0, size, size)
    // 地形（動かない部分）だけ透かす。自分と動物の印は不透明のまま
    ctx.globalAlpha = options.baseAlpha ?? 1
    ctx.drawImage(base, 0, 0)
    ctx.globalAlpha = 1
    const placeBoxes = drawPlaceLabels(ctx)

    // 出会った個体: 黄褐色の点に暗い縁。そばにいる個体は少し大きく。ともだちは緑の輪を足す
    for (const l of lions) {
      const r = (l.active ? 6 : 4.5) * u
      ctx.fillStyle = l.active ? C.lionActive : C.lion
      ctx.strokeStyle = C.lionEdge
      ctx.lineWidth = 1.5 * u
      ctx.beginPath()
      ctx.arc(px(l.x), py(l.z), r, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      if (l.friend) {
        ctx.strokeStyle = C.rim
        ctx.lineWidth = 3.5 * u
        ctx.beginPath()
        ctx.arc(px(l.x), py(l.z), r + 3 * u, 0, Math.PI * 2)
        ctx.stroke()
        ctx.strokeStyle = C.friend
        ctx.lineWidth = 2 * u
        ctx.beginPath()
        ctx.arc(px(l.x), py(l.z), r + 3 * u, 0, Math.PI * 2)
        ctx.stroke()
      }
    }

    // 自分: 向きのある三角。heading 0 で +z（画面の下）を向く
    ctx.save()
    ctx.translate(px(player.x), py(player.z))
    ctx.rotate(-player.heading)
    ctx.fillStyle = C.you
    ctx.strokeStyle = C.rim
    ctx.lineWidth = 2 * u
    ctx.beginPath()
    ctx.moveTo(0, 9 * u)
    ctx.lineTo(-6 * u, -6 * u)
    ctx.lineTo(0, -2 * u)
    ctx.lineTo(6 * u, -6 * u)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.restore()

    if (options.labels) {
      // 名前のピル。点の右 → 左 → 下 → 上の順に、置けるところへ。重なる時は下へずらす
      const placed: Box[] = [...placeBoxes]
      const h = 16 * u
      const put = (text: string, x: number, y: number) => {
        const w = pillWidth(ctx, text, u)
        const candidates: Box[] = [
          { l: x + 8 * u, t: y - h / 2, r: x + 8 * u + w, b: y + h / 2 },
          { l: x - 8 * u - w, t: y - h / 2, r: x - 8 * u, b: y + h / 2 },
          { l: x - w / 2, t: y + 8 * u, r: x + w / 2, b: y + 8 * u + h },
          { l: x - w / 2, t: y - 8 * u - h, r: x + w / 2, b: y - 8 * u },
        ]
        let box = candidates.find((cand) => !placed.some((p) => overlaps(cand, p)) && cand.l > 2 * u && cand.r < size - 2 * u)
        if (!box) {
          box = { ...candidates[0] }
          for (let guard = 0; guard < 12 && placed.some((p) => overlaps(box as Box, p)); guard++) {
            box.t += h + 2 * u
            box.b += h + 2 * u
          }
        }
        placed.push(box)
        drawPill(ctx, text, box.l, box.t, u)
      }
      for (const l of lions) put(l.friend ? t('friendTag', { name: l.name }) : l.name, px(l.x), py(l.z))
      put(t('you'), px(player.x), py(player.z))
    }
  }

  const toWorld = (mx: number, my: number) => {
    const dx = (mx - c) / k
    const dz = (my - c) / k
    if (Math.hypot(dx, dz) > viewR) return null
    return { x: vx + dx, z: vz + dz }
  }

  return { size, draw, toWorld, setView }
}

/** キャンバス上のタップ位置を世界座標に変換して通知する */
export function bindMapPick(canvas: HTMLCanvasElement, renderer: MapRenderer, onPick: (x: number, z: number) => void): void {
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    e.stopPropagation()
  })
  canvas.addEventListener('pointerup', (e) => {
    e.preventDefault()
    e.stopPropagation()
    const rect = canvas.getBoundingClientRect()
    const mx = ((e.clientX - rect.left) / rect.width) * renderer.size
    const my = ((e.clientY - rect.top) / rect.height) * renderer.size
    const w = renderer.toWorld(mx, my)
    if (w) onPick(w.x, w.z)
  })
}

export interface Minimap {
  show: () => void
  update: (player: MapPlayer, lions: MinimapMarker[]) => void
  /** 地図のタップ。世界座標（x, z）を返す */
  onPick: (fn: (x: number, z: number) => void) => void
  /** 「地図を広げる」 */
  onExpand: (fn: () => void) => void
}

/** 左上のミニマップ */
export function createMinimap(): Minimap {
  const canvas = document.getElementById('minimap') as HTMLCanvasElement
  const expandBtn = document.getElementById('minimap-expand') as HTMLButtonElement
  // ワールドが透けて見えるよう、地形は半透明に
  const renderer = createMapRenderer(280, { labels: false, baseAlpha: 0.55 })
  canvas.width = renderer.size
  canvas.height = renderer.size
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D

  const pickListeners: Array<(x: number, z: number) => void> = []
  const expandListeners: Array<() => void> = []
  bindMapPick(canvas, renderer, (x, z) => pickListeners.forEach((fn) => fn(x, z)))
  expandBtn.addEventListener('click', () => expandListeners.forEach((fn) => fn()))

  return {
    show: () => {
      canvas.hidden = false
      expandBtn.hidden = false
    },
    update: (player, lions) => {
      // 自分のまわりを見る。サバンナの中ではいままでどおりサバンナ全体が入る
      const inSavanna = Math.hypot(player.x, player.z) < WALK_RADIUS - 20
      if (inSavanna) renderer.setView(0, 0, MINIMAP_RADIUS)
      else renderer.setView(Math.round(player.x / 4) * 4, Math.round(player.z / 4) * 4, MINIMAP_RADIUS)
      renderer.draw(ctx, player, lions)
    },
    onPick: (fn) => {
      pickListeners.push(fn)
    },
    onExpand: (fn) => {
      expandListeners.push(fn)
    },
  }
}
