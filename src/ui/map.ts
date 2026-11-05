import { CONTINENT_VIEW, bindMapPick, createMapRenderer } from './minimap'
import type { MapPlayer, MinimapMarker } from './minimap'
import { setViewOpen } from './transition'

/**
 * 広げた全体地図。場所の名前と、出会った動物の種の名前つき（「動物の名前」ボタンで隠せる）。タップした場所へ歩いて閉じる。
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
  const namesBtn = document.getElementById('map-names') as HTMLButtonElement
  // 広げた地図は海に浮かぶ大陸の全体（縦長 3:4。西のジャングルから東の海岸まで、北の世界から南半球まで）
  const renderer = createMapRenderer({ width: 750, height: 1000, labels: true, box: CONTINENT_VIEW })
  canvas.width = renderer.width
  canvas.height = renderer.height
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
    setViewOpen(root, open)
    if (open) {
      redraw()
      closeBtn.focus()
    }
    openListeners.forEach((fn) => fn(open))
  }

  // 動物の名前を出す／隠す。この端末に覚えておく（保存できなくても切り替えはできる）
  const NAMES_KEY = 'awl.mapNames.v1'
  let names = true
  try {
    names = localStorage.getItem(NAMES_KEY) !== '0'
  } catch {
    // 読めなければ出す
  }
  const applyNames = () => {
    renderer.setNames(names)
    namesBtn.setAttribute('aria-pressed', String(names))
  }
  applyNames()
  namesBtn.addEventListener('click', () => {
    names = !names
    try {
      localStorage.setItem(NAMES_KEY, names ? '1' : '0')
    } catch {
      // 保存できなくても今回は切り替える
    }
    applyNames()
    redraw()
  })

  closeBtn.addEventListener('click', () => setOpen(false))
  // シートの外（暗い地の部分）を押しても閉じる
  root.addEventListener('click', (e) => {
    if (open && e.target === root) setOpen(false)
  })
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
