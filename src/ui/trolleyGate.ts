import { getLang, onLangChange, t } from './i18n'
import { hideView, showView } from './transition'
import type { Iris } from './iris'
import type { StationHit } from '../world/trolleyStation'
import { trolleyUrl } from '../trolley/game'
import { TROLLEY_WORLD_NAME } from '../trolley/stations'

/**
 * 駅のトロッコの前で出る「トロッコで ○○へ」のボタン（お店の「お店に入る」と同じ形・同じ場所）。
 * 押すと幕を閉じ、3D を手放してから、トロッコのモードで起動し直す（iPhone のメモリのため、2D の坑道と 3D を同時に持たない）。
 */
export interface TrolleyGate {
  setNear: (hit: StationHit | null) => void
}

export function createTrolleyGate(iris: Iris, getBack: () => { x: number; z: number; heading: number }, beforeLeave: () => void): TrolleyGate {
  // 駅はワールドに 1 つで、行き先はとなりの 2 つ（11/15）。行き先ごとにボタンを縦に 2 つ
  const btns = [0, 1].map((i) => {
    const btn = document.createElement('button')
    btn.type = 'button'
    // 看板と同じ並び（1 つ目の行き先が上）
    btn.className = i === 0 ? 'shop-enter trolley-enter trolley-enter-2' : 'shop-enter trolley-enter'
    btn.hidden = true
    const label = document.createElement('span')
    btn.append(label)
    document.body.append(btn)
    btn.addEventListener('click', () => void go(i))
    return { btn, label }
  })
  let near: StationHit | null = null
  let busy = false
  const paint = () => {
    if (!near) return
    near.options.forEach((o, i) => {
      if (btns[i]) btns[i].label.textContent = t('trolleyTo', { world: TROLLEY_WORLD_NAME[o.to.region][getLang()] })
    })
  }
  onLangChange(paint)
  const go = async (i: number) => {
    const o = near?.options[i]
    if (!near || !o || busy) return
    busy = true
    const url = trolleyUrl(o.route, near.from.region, getBack())
    try {
      await iris.close()
    } catch {
      // 幕が閉じなくても移る
    }
    beforeLeave()
    location.replace(url)
  }
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
      btns.forEach((b, i) => {
        const on = !!hit && i < hit.options.length
        const wasOn = !!was && i < was.options.length
        if (on && !wasOn) showView(b.btn)
        else if (!on && wasOn) hideView(b.btn)
      })
    },
  }
}
