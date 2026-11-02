import { bindMapPick, createMapRenderer } from './minimap'
import type { MapPlayer, MinimapMarker } from './minimap'

/**
 * 広げた全体地図。場所と個体の名前つき。タップした場所へ歩いて閉じる。
 * ともだち帳と同じオーバーレイの作法（閉じる・Esc・開いている間はワールドの入力を止める）。
 */
export interface MapView {
  open: () => void
  close: () => void
  isOpen: () => boolean
  onOpenChange: (fn: (open: boolean) => void) => void
  onPick: (fn: (x: number, z: number) => void) => void
  /** 最新の位置。開いている間だけ描き直す */
  update: (player: MapPlayer, lions: MinimapMarker[]) => void
}

export function createMapView(): MapView {
  const root = document.getElementById('map') as HTMLElement
  const canvas = document.getElementById('map-canvas') as HTMLCanvasElement
  const closeBtn = document.getElementById('map-close') as HTMLButtonElement
  const renderer = createMapRenderer(800, { labels: true })
  canvas.width = renderer.size
  canvas.height = renderer.size
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D

  let open = false
  let last: { player: MapPlayer; lions: MinimapMarker[] } | null = null
  const openListeners: Array<(open: boolean) => void> = []
  const pickListeners: Array<(x: number, z: number) => void> = []

  const redraw = () => {
    if (last) renderer.draw(ctx, last.player, last.lions)
  }

  const setOpen = (next: boolean) => {
    if (open === next) return
    open = next
    root.hidden = !open
    if (open) {
      redraw()
      closeBtn.focus()
    }
    openListeners.forEach((fn) => fn(open))
  }

  closeBtn.addEventListener('click', () => setOpen(false))
  window.addEventListener('keydown', (e) => {
    if (open && e.key === 'Escape') setOpen(false)
  })
  bindMapPick(canvas, renderer, (x, z) => {
    pickListeners.forEach((fn) => fn(x, z))
    setOpen(false)
  })

  return {
    open: () => setOpen(true),
    close: () => setOpen(false),
    isOpen: () => open,
    onOpenChange: (fn) => {
      openListeners.push(fn)
    },
    onPick: (fn) => {
      pickListeners.push(fn)
    },
    update: (player, lions) => {
      last = { player, lions }
      if (open) redraw()
    },
  }
}
