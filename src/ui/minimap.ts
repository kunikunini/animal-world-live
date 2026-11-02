import { ACACIAS, KOPJE, SPOT, WALK_RADIUS, WATERHOLE } from '../world/layout'

/**
 * 地図の描画。左上のミニマップと、広げた全体地図の両方で使う。
 * 歩ける範囲（半径 WALK_RADIUS）を円形の俯瞰で描く。北が上。
 * 地形・コピエ・水場・木・観察スポットは一度だけ描いて使い回し、
 * 自分の位置と向き、ライオンの位置を毎回重ねる。
 */
export interface MinimapMarker {
  id: string
  name: string
  x: number
  z: number
  /** 強調（そばにいる個体など） */
  active?: boolean
  /** ともだち帳に登録済み。白い輪で区別し、広げた地図では名前に添える */
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
}

const MAP_RADIUS = WALK_RADIUS + 8

export function createMapRenderer(size: number, options: { labels: boolean }): MapRenderer {
  const c = size / 2
  const k = (size / 2 - size * 0.02) / MAP_RADIUS
  const px = (x: number) => c + x * k
  const py = (z: number) => c + z * k
  const u = size / 280 // 280px を基準にした線や点の倍率

  // --- 動かない部分を一度だけ描く ---
  const base = document.createElement('canvas')
  base.width = size
  base.height = size
  const b = base.getContext('2d') as CanvasRenderingContext2D

  // 草原（外は少し暗く）
  const grad = b.createRadialGradient(c, c, 10 * u, c, c, c)
  grad.addColorStop(0, '#e2bd5c')
  grad.addColorStop(0.75, '#d6ab3e')
  grad.addColorStop(1, '#b98f36')
  b.fillStyle = grad
  b.beginPath()
  b.arc(c, c, c - 3 * u, 0, Math.PI * 2)
  b.fill()

  // 水場
  b.fillStyle = '#9fcbe6'
  b.beginPath()
  b.arc(px(WATERHOLE.x), py(WATERHOLE.z), WATERHOLE.radius * k, 0, Math.PI * 2)
  b.fill()

  // コピエ: 岩肌の円、南の坂、頂上の台地
  b.fillStyle = '#a8876a'
  b.beginPath()
  b.arc(px(KOPJE.x), py(KOPJE.z), KOPJE.radius * k, 0, Math.PI * 2)
  b.fill()
  b.fillStyle = '#c29a5c'
  b.beginPath()
  b.moveTo(px(KOPJE.x), py(KOPJE.z))
  b.arc(px(KOPJE.x), py(KOPJE.z), KOPJE.radius * k, Math.PI / 2 - KOPJE.rampHalfAngle, Math.PI / 2 + KOPJE.rampHalfAngle)
  b.closePath()
  b.fill()
  b.fillStyle = '#bfa184'
  b.beginPath()
  b.arc(px(KOPJE.x), py(KOPJE.z), KOPJE.radius * KOPJE.plateau * k, 0, Math.PI * 2)
  b.fill()

  // 木
  b.fillStyle = '#4f7f2a'
  for (const t of ACACIAS) {
    b.beginPath()
    b.arc(px(t.x), py(t.z), 2.6 * u * t.scale, 0, Math.PI * 2)
    b.fill()
  }

  // 観察スポット: 白い輪
  b.strokeStyle = '#fff6e6'
  b.lineWidth = 2 * u
  b.beginPath()
  b.arc(px(SPOT.x), py(SPOT.z), 5 * u, 0, Math.PI * 2)
  b.stroke()

  // 縁と「N」
  b.strokeStyle = 'rgba(43, 29, 18, 0.35)'
  b.lineWidth = 3 * u
  b.beginPath()
  b.arc(c, c, c - 3 * u, 0, Math.PI * 2)
  b.stroke()
  b.fillStyle = 'rgba(43, 29, 18, 0.7)'
  b.font = `bold ${Math.round(18 * u)}px system-ui, sans-serif`
  b.textAlign = 'center'
  b.textBaseline = 'top'
  b.fillText('N', c, 8 * u)

  // 広げた地図だけ、場所の名前を入れる
  if (options.labels) {
    const label = (text: string, x: number, y: number, align: CanvasTextAlign = 'center') => {
      b.font = `bold ${Math.round(11 * u)}px system-ui, sans-serif`
      b.textAlign = align
      b.textBaseline = 'middle'
      b.lineWidth = 3 * u
      b.strokeStyle = 'rgba(255, 246, 230, 0.9)'
      b.strokeText(text, x, y)
      b.fillStyle = '#2b1d12'
      b.fillText(text, x, y)
    }
    // 個体の名前と重ならないよう、水場は上、コピエは上（北側）に置く
    label('水場', px(WATERHOLE.x) + (WATERHOLE.radius + 3) * k, py(WATERHOLE.z), 'left')
    label('コピエ', px(KOPJE.x), py(KOPJE.z) - (KOPJE.radius + 6) * k)
    label('観察スポット', px(SPOT.x) + 8 * u, py(SPOT.z), 'left')
  }

  const draw = (ctx: CanvasRenderingContext2D, player: MapPlayer, lions: MinimapMarker[]) => {
    ctx.clearRect(0, 0, size, size)
    ctx.drawImage(base, 0, 0)

    // 出会った個体: 黄褐色の点に暗い縁。そばにいる個体は少し大きく。ともだちは白い輪を足す
    for (const l of lions) {
      const r = (l.active ? 6 : 4.5) * u
      ctx.fillStyle = l.active ? '#f3c36a' : '#d9a95f'
      ctx.strokeStyle = '#6a4727'
      ctx.lineWidth = 1.5 * u
      ctx.beginPath()
      ctx.arc(px(l.x), py(l.z), r, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      if (l.friend) {
        ctx.strokeStyle = '#fff6e6'
        ctx.lineWidth = 2 * u
        ctx.beginPath()
        ctx.arc(px(l.x), py(l.z), r + 3 * u, 0, Math.PI * 2)
        ctx.stroke()
      }
    }
    if (options.labels) {
      // 名前。台地の上の個体は地図では数ピクセルの距離に固まるので、コピエの左に縦に並べる。
      // それ以外は点の右に置く
      ctx.font = `bold ${Math.round(10 * u)}px system-ui, sans-serif`
      ctx.textBaseline = 'middle'
      ctx.lineWidth = 3 * u
      ctx.strokeStyle = 'rgba(255, 246, 230, 0.9)'
      ctx.fillStyle = '#2b1d12'
      const onKopje = lions.filter((l) => Math.hypot(l.x - KOPJE.x, l.z - KOPJE.z) < KOPJE.radius)
      const others = lions.filter((l) => !onKopje.includes(l))
      const lineH = 11 * u
      const left = px(KOPJE.x) - (KOPJE.radius + 3) * k
      const top = py(KOPJE.z) - ((onKopje.length - 1) * lineH) / 2
      const text = (l: MinimapMarker) => (l.friend ? `${l.name}（ともだち）` : l.name)
      ctx.textAlign = 'right'
      onKopje.forEach((l, i) => {
        ctx.strokeText(text(l), left, top + i * lineH)
        ctx.fillText(text(l), left, top + i * lineH)
      })
      ctx.textAlign = 'left'
      for (const l of others) {
        ctx.strokeText(text(l), px(l.x) + 7 * u, py(l.z))
        ctx.fillText(text(l), px(l.x) + 7 * u, py(l.z))
      }
    }

    // 自分: 向きのある三角。heading 0 で +z（画面の下）を向く
    ctx.save()
    ctx.translate(px(player.x), py(player.z))
    ctx.rotate(-player.heading)
    ctx.fillStyle = '#e0683a'
    ctx.strokeStyle = '#fff6e6'
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
      ctx.font = `bold ${Math.round(10 * u)}px system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.lineWidth = 3 * u
      ctx.strokeStyle = 'rgba(255, 246, 230, 0.9)'
      ctx.fillStyle = '#2b1d12'
      ctx.strokeText('あなた', px(player.x), py(player.z) + 11 * u)
      ctx.fillText('あなた', px(player.x), py(player.z) + 11 * u)
    }
  }

  const toWorld = (mx: number, my: number) => {
    const x = (mx - c) / k
    const z = (my - c) / k
    if (Math.hypot(x, z) > MAP_RADIUS) return null
    return { x, z }
  }

  return { size, draw, toWorld }
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
  const renderer = createMapRenderer(280, { labels: false })
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
    update: (player, lions) => renderer.draw(ctx, player, lions),
    onPick: (fn) => {
      pickListeners.push(fn)
    },
    onExpand: (fn) => {
      expandListeners.push(fn)
    },
  }
}
