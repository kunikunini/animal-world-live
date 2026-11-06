/**
 * 3D 空間の位置に重ねる名前ラベル（ライオン用）。名前だけを出す。
 * 近い個体を優先し、ラベル同士が重なるときは遠い個体のラベルを上へずらす。
 */
export interface LabelEntry {
  id: string
  /** 画面座標。ラベルの下端の中心 */
  x: number
  y: number
  /** プレイヤーからの距離。近い順に優先する */
  d: number
  /** true なら矢印なし（アイコンの下にぶら下げる時） */
  under?: boolean
}

export interface PlacedLabel {
  x: number
  /** ずらした後のラベル上端 */
  top: number
}

export interface WorldLabels {
  add: (id: string, name: string) => void
  /** 言語を切り替えた時に名前を差し替える */
  rename: (id: string, name: string) => void
  /** 見せるラベルだけ渡す。渡さなかった id は隠す。obstacles は避ける矩形（双眼鏡のアイコンなど）。戻り値は確定した位置 */
  layout: (entries: LabelEntry[], obstacles?: Rect[]) => Map<string, PlacedLabel>
}

interface Item {
  el: HTMLElement
  visible: boolean
  w: number
  h: number
}

export interface Rect {
  l: number
  r: number
  t: number
  b: number
}

const GAP = 6

function overlaps(a: Rect, b: Rect): boolean {
  return a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t
}

export function createWorldLabels(): WorldLabels {
  const items = new Map<string, Item>()

  const setVisible = (item: Item, visible: boolean) => {
    if (visible === item.visible) return
    item.el.hidden = !visible
    item.visible = visible
  }

  return {
    add: (id, name) => {
      const el = document.createElement('div')
      el.className = 'spot-label lion-label'
      el.dataset.id = id
      el.hidden = true
      el.setAttribute('aria-hidden', 'true')
      const nameEl = document.createElement('span')
      nameEl.className = 'spot-label-name'
      nameEl.textContent = name
      el.append(nameEl)
      document.body.append(el)
      items.set(id, { el, visible: false, w: 0, h: 0 })
    },
    rename: (id, name) => {
      const item = items.get(id)
      if (!item) return
      const nameEl = item.el.querySelector('.spot-label-name')
      if (nameEl) nameEl.textContent = name
      item.w = 0
    },
    layout: (entries, obstacles = []) => {
      const placed: Rect[] = [...obstacles]
      const result = new Map<string, PlacedLabel>()
      const shown = new Set<string>()
      const sorted = [...entries].sort((a, b) => a.d - b.d)
      for (const e of sorted) {
        const item = items.get(e.id)
        if (!item) continue
        shown.add(e.id)
        setVisible(item, true)
        item.el.classList.toggle('is-under', e.under === true)
        // 名前は変わらないので、大きさは一度だけ測る
        if (item.w === 0) {
          item.w = item.el.offsetWidth
          item.h = item.el.offsetHeight
        }
        const rect: Rect = { l: e.x - item.w / 2, r: e.x + item.w / 2, t: e.y - item.h, b: e.y }
        // 近い個体のラベルを避けて上へ
        for (let guard = 0; guard < 8; guard++) {
          const hit = placed.find((p) => overlaps(rect, p))
          if (!hit) break
          const dy = rect.b - hit.t + GAP
          rect.t -= dy
          rect.b -= dy
        }
        item.el.style.transform = `translate(-50%, -100%) translate(${e.x.toFixed(0)}px, ${rect.b.toFixed(0)}px)`
        placed.push(rect)
        result.set(e.id, { x: e.x, top: rect.t })
      }
      for (const [id, item] of items) {
        if (!shown.has(id)) setVisible(item, false)
      }
      return result
    },
  }
}
