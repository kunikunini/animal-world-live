/**
 * 3D 空間の位置に重ねる名前ラベル（ライオン用）。名前だけを出す。
 * 近い個体を優先し、ラベル同士が重なるときは遠い個体のラベルを上へ 1 段ずらす。それでも重なる札は出さない。
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
  /** 札をタップした時（その子のそばへ歩く）。指が少し動いてもタップとみなす。ドラッグは無視 */
  onTap: (fn: (id: string) => void) => void
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
/** これより指が動いたらタップではない（controller.ts の DRAG_THRESHOLD と同じ） */
const TAP_SLOP = 8

function overlaps(a: Rect, b: Rect): boolean {
  return a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t
}

export function createWorldLabels(): WorldLabels {
  const items = new Map<string, Item>()
  const tapListeners: Array<(id: string) => void> = []

  /** 見えている札のうち、見た目の四角が (x, y) にいちばん近い子 */
  const nearestAt = (x: number, y: number): string | null => {
    let best: string | null = null
    let bestD = Infinity
    for (const [id, item] of items) {
      if (!item.visible) continue
      const r = item.el.getBoundingClientRect()
      const d = Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom))
      if (d < bestD) {
        bestD = d
        best = id
      }
    }
    return best
  }

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
      // 札は毎フレーム動くので click は使わない（押してから離すまでに札が指の下から外れると click が来ない）。
      // 押した札で指をつかまえ、離した時に動きが小さければタップ。札は body の直下なので、下の canvas のタップ移動には届かない
      // 押せる範囲は見た目より広いので、となりの札の範囲と重なることがある。その時は見た目の札がいちばん近い子にする
      let downId: number | null = null
      let downX = 0
      let downY = 0
      let tapId = id
      el.addEventListener('pointerdown', (e) => {
        if (downId !== null) return
        downId = e.pointerId
        downX = e.clientX
        downY = e.clientY
        tapId = nearestAt(e.clientX, e.clientY) ?? id
        el.setPointerCapture(e.pointerId)
      })
      el.addEventListener('pointerup', (e) => {
        if (e.pointerId !== downId) return
        downId = null
        if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
        if (Math.hypot(e.clientX - downX, e.clientY - downY) > TAP_SLOP) return
        tapListeners.forEach((fn) => fn(tapId))
      })
      el.addEventListener('pointercancel', (e) => {
        if (e.pointerId === downId) downId = null
      })
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
        // 近い個体のラベルを避けて上へ 1 段だけずらす。それでも重なる（群れの奥の子など）なら、その札は出さない
        // （11/6 の iPhone 実機テスト: 8 段まで積み上げていたので、群れの札が体から離れた塔になって追えなかった。近づけば近い順に出る）
        const hit = placed.find((p) => overlaps(rect, p))
        if (hit) {
          const dy = rect.b - hit.t + GAP
          rect.t -= dy
          rect.b -= dy
          if (placed.some((p) => overlaps(rect, p))) {
            shown.delete(e.id)
            setVisible(item, false)
            continue
          }
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
    onTap: (fn) => {
      tapListeners.push(fn)
    },
  }
}
