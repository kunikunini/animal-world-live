import { ACACIAS, KOPJE, SPOT, WALK_RADIUS, WATERHOLE } from '../world/layout'

/**
 * 左上のミニマップ。歩ける範囲（半径 WALK_RADIUS）を俯瞰で描く。
 * 地形・コピエ・水場・木・観察スポットは一度だけ描いて使い回し、
 * 自分の位置と向き、ライオンの位置を毎回重ねる。タップした場所へ歩ける。
 */
export interface MinimapMarker {
  id: string
  x: number
  z: number
  /** 強調（そばにいる個体など） */
  active?: boolean
}

export interface Minimap {
  show: () => void
  update: (player: { x: number; z: number; heading: number }, lions: MinimapMarker[]) => void
  /** 地図のタップ。世界座標（x, z）を返す */
  onPick: (fn: (x: number, z: number) => void) => void
}

const SIZE = 280
const MAP_RADIUS = WALK_RADIUS + 8

export function createMinimap(): Minimap {
  const canvas = document.getElementById('minimap') as HTMLCanvasElement
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D
  const c = SIZE / 2
  const k = (SIZE / 2 - 6) / MAP_RADIUS
  const px = (x: number) => c + x * k
  const py = (z: number) => c + z * k

  // --- 動かない部分を一度だけ描く ---
  const base = document.createElement('canvas')
  base.width = SIZE
  base.height = SIZE
  const b = base.getContext('2d') as CanvasRenderingContext2D

  // 草原（外は少し暗く）
  const grad = b.createRadialGradient(c, c, 10, c, c, c)
  grad.addColorStop(0, '#e2bd5c')
  grad.addColorStop(0.75, '#d6ab3e')
  grad.addColorStop(1, '#b98f36')
  b.fillStyle = grad
  b.beginPath()
  b.arc(c, c, c - 3, 0, Math.PI * 2)
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
    b.arc(px(t.x), py(t.z), 2.6 * t.scale, 0, Math.PI * 2)
    b.fill()
  }

  // 観察スポット: 白い輪
  b.strokeStyle = '#fff6e6'
  b.lineWidth = 2
  b.beginPath()
  b.arc(px(SPOT.x), py(SPOT.z), 5, 0, Math.PI * 2)
  b.stroke()

  // 縁と「N」
  b.strokeStyle = 'rgba(43, 29, 18, 0.35)'
  b.lineWidth = 3
  b.beginPath()
  b.arc(c, c, c - 3, 0, Math.PI * 2)
  b.stroke()
  b.fillStyle = 'rgba(43, 29, 18, 0.7)'
  b.font = 'bold 18px system-ui, sans-serif'
  b.textAlign = 'center'
  b.textBaseline = 'top'
  b.fillText('N', c, 8)

  const pickListeners: Array<(x: number, z: number) => void> = []
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    e.stopPropagation()
  })
  canvas.addEventListener('pointerup', (e) => {
    e.preventDefault()
    e.stopPropagation()
    const rect = canvas.getBoundingClientRect()
    const mx = ((e.clientX - rect.left) / rect.width) * SIZE
    const my = ((e.clientY - rect.top) / rect.height) * SIZE
    const x = (mx - c) / k
    const z = (my - c) / k
    if (Math.hypot(x, z) > MAP_RADIUS) return
    pickListeners.forEach((fn) => fn(x, z))
  })

  return {
    show: () => {
      canvas.hidden = false
    },
    update: (player, lions) => {
      ctx.clearRect(0, 0, SIZE, SIZE)
      ctx.drawImage(base, 0, 0)

      // ライオン: 黄褐色の点に暗い縁。そばにいる個体は少し大きく
      for (const l of lions) {
        const r = l.active ? 6 : 4.5
        ctx.fillStyle = l.active ? '#f3c36a' : '#d9a95f'
        ctx.strokeStyle = '#6a4727'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(px(l.x), py(l.z), r, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
      }

      // 自分: 向きのある三角。heading 0 で +z（画面の下）を向く
      ctx.save()
      ctx.translate(px(player.x), py(player.z))
      ctx.rotate(-player.heading)
      ctx.fillStyle = '#e0683a'
      ctx.strokeStyle = '#fff6e6'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(0, 9)
      ctx.lineTo(-6, -6)
      ctx.lineTo(0, -2)
      ctx.lineTo(6, -6)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      ctx.restore()
    },
    onPick: (fn) => {
      pickListeners.push(fn)
    },
  }
}
