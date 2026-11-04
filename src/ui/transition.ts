/**
 * 画面（シート・モニター・物語・通知）の出入りをなめらかにする。
 * 出す時は hidden を外してから 1 フレーム遅れで .is-out を外し、CSS の transition で浮かび上がらせる。
 * 消す時は .is-out を付け、transition が終わってから hidden に戻す（途中でまた出したら取り消す）。
 * 見た目の動き（ずらす・縮める）は CSS 側。「動きをへらす」の時は body.is-reduce-motion でフェードだけになる。
 */
const LEAVE_MS = 320

const timers = new WeakMap<HTMLElement, number>()

export function showView(el: HTMLElement): void {
  window.clearTimeout(timers.get(el))
  timers.delete(el)
  if (!el.hidden && !el.classList.contains('is-out')) return
  el.classList.add('is-out')
  el.hidden = false
  // いったん .is-out の状態で描いてから外す（同じフレームだと transition が走らない）
  void el.offsetWidth
  el.classList.remove('is-out')
}

export function hideView(el: HTMLElement, onHidden?: () => void): void {
  if (el.hidden) {
    onHidden?.()
    return
  }
  // 消えている途中に何度呼ばれても、最初の予定どおりに消す（毎フレーム呼ぶ部品のため）
  if (el.classList.contains('is-out') && timers.has(el)) return
  el.classList.add('is-out')
  window.clearTimeout(timers.get(el))
  timers.set(
    el,
    window.setTimeout(() => {
      timers.delete(el)
      el.hidden = true
      el.classList.remove('is-out')
      onHidden?.()
    }, LEAVE_MS),
  )
}

export function setViewOpen(el: HTMLElement, open: boolean): void {
  if (open) showView(el)
  else hideView(el)
}

/** 中身の差し替え（家族の切り替え・物語のコマ送り）を、ふわっと入れ直す */
export function refreshIn(...els: HTMLElement[]): void {
  for (const el of els) {
    el.classList.remove('is-refresh')
    void el.offsetWidth
    el.classList.add('is-refresh')
  }
}
