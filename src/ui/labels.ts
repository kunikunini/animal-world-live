/**
 * 3D 空間の位置に重ねる名前ラベル（ライオン用）。
 * スポットのラベルと同じ見た目で小さめ。近づくほど距離を出す。
 */
export interface WorldLabels {
  add: (id: string, name: string) => void
  /** screen が null なら隠す */
  set: (id: string, screen: { x: number; y: number } | null, distance: number) => void
}

export function createWorldLabels(): WorldLabels {
  const items = new Map<string, { el: HTMLElement; dist: HTMLElement; visible: boolean }>()
  return {
    add: (id, name) => {
      const el = document.createElement('div')
      el.className = 'spot-label lion-label'
      el.hidden = true
      el.setAttribute('aria-hidden', 'true')
      const nameEl = document.createElement('span')
      nameEl.className = 'spot-label-name'
      nameEl.textContent = name
      const dist = document.createElement('span')
      dist.className = 'spot-label-distance'
      el.append(nameEl, dist)
      document.body.append(el)
      items.set(id, { el, dist, visible: false })
    },
    set: (id, screen, distance) => {
      const item = items.get(id)
      if (!item) return
      const visible = screen !== null
      if (visible !== item.visible) {
        item.el.hidden = !visible
        item.visible = visible
      }
      if (screen) {
        item.el.style.transform = `translate(-50%, -100%) translate(${screen.x.toFixed(0)}px, ${screen.y.toFixed(0)}px)`
        item.dist.textContent = distance < 8 ? 'そばにいる' : `あと ${Math.round(distance)} m`
      }
    },
  }
}
