import { onLangChange, t } from './i18n'
import { hideView, showView } from './transition'
import type { Iris } from './iris'
import type { StationHit } from '../world/trolleyStation'
import { trolleyUrl } from '../trolley/game'

/**
 * 駅のトロッコの前で出る「トロッコで ○○へ」のボタン（お店の「お店に入る」と同じ形・同じ場所）。
 * 押すと幕を閉じ、3D を手放してから、トロッコのモードで起動し直す（iPhone のメモリのため、2D の坑道と 3D を同時に持たない）。
 */
export interface TrolleyGate {
  setNear: (hit: StationHit | null) => void
}

export function createTrolleyGate(iris: Iris, getBack: () => { x: number; z: number; heading: number }, beforeLeave: () => void): TrolleyGate {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'shop-enter trolley-enter'
  btn.hidden = true
  const label = document.createElement('span')
  btn.append(label)
  document.body.append(btn)
  let near: StationHit | null = null
  let busy = false
  const paint = () => {
    if (near) label.textContent = t(near.to.region === 'sky' ? 'trolleyToSky' : 'trolleyToWater')
  }
  onLangChange(paint)
  btn.addEventListener('click', async () => {
    if (!near || busy) return
    busy = true
    const url = trolleyUrl(near.route, near.from.region, getBack())
    try {
      await iris.close()
    } catch {
      // 幕が閉じなくても移る
    }
    beforeLeave()
    location.replace(url)
  })
  // ブラウザの「戻る」でこのページが出し直された時は、押せるように戻す
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) busy = false
  })
  return {
    setNear: (hit) => {
      const same = hit?.from === near?.from
      if (same) return
      const was = near
      near = hit
      paint()
      if (hit && !was) showView(btn)
      else if (!hit && was) hideView(btn)
    },
  }
}
