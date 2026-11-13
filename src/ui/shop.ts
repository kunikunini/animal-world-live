import { onLangChange, t } from './i18n'
import { hideView, showView } from './transition'

/** 3D の売り場（public/shop3d。別のプロジェクトで作ったものを写した、見るだけの版） */
const SHOP_URL = '/shop3d/index.html?awl'
/** これだけ待っても売り場の用意ができなければ、うまく開けなかった案内を出す */
const LOAD_TIMEOUT_MS = 20000

/**
 * グッズのお店。扉の前に来た時の「お店に入る」ボタンと、売り場を上に重ねる画面。
 * 売り場は iframe で開き、出たら iframe ごと外す（ワールドと売り場の 3D を同時に持たない）。
 * 入るのは、必ずユーザーがボタンを押した時だけ。
 */
export interface ShopView {
  /** 扉の前にいる間だけ true にする */
  setNear: (near: boolean) => void
  open: () => void
  close: () => void
  isOpen: () => boolean
  onOpenChange: (fn: (open: boolean) => void) => void
}

export function createShopView(): ShopView {
  const enter = document.createElement('button')
  enter.type = 'button'
  enter.className = 'shop-enter'
  enter.hidden = true
  const enterLabel = document.createElement('span')
  enter.append(enterLabel)

  const view = document.createElement('div')
  view.className = 'shop-view'
  view.hidden = true
  view.setAttribute('role', 'dialog')
  view.setAttribute('aria-modal', 'true')
  const status = document.createElement('p')
  status.className = 'shop-view-status'
  status.setAttribute('role', 'status')
  const back = document.createElement('button')
  back.type = 'button'
  back.className = 'shop-view-back'
  view.append(status, back)
  document.body.append(enter, view)

  const paint = () => {
    enterLabel.textContent = t('shopEnter')
    back.textContent = t('shopBack')
    view.setAttribute('aria-label', t('shopName'))
    if (!status.hidden) status.textContent = t(status.dataset.key === 'fail' ? 'shopFail' : 'shopLoading')
  }
  const setStatus = (key: 'loading' | 'fail' | null) => {
    status.hidden = key === null
    if (key) status.dataset.key = key
    view.classList.toggle('is-failed', key === 'fail')
    paint()
  }
  setStatus(null)
  onLangChange(paint)

  const listeners: Array<(open: boolean) => void> = []
  let frame: HTMLIFrameElement | null = null
  let loadTimer = 0
  let open = false
  let near = false

  const close = () => {
    if (!open) return
    open = false
    window.clearTimeout(loadTimer)
    hideView(view, () => {
      // 売り場の 3D を手放す（開き直したら読み込み直す）
      if (!open) {
        frame?.remove()
        frame = null
      }
    })
    // まだ扉の前にいるので、また入れるようにする
    if (near) showView(enter)
    listeners.forEach((fn) => fn(false))
  }

  const openView = () => {
    if (open) return
    open = true
    enter.hidden = true
    setStatus('loading')
    frame?.remove()
    const f = document.createElement('iframe')
    f.className = 'shop-view-frame'
    f.title = t('shopName')
    // ページが届いても、お店の 3D はまだ。「準備しています」と「ワールドにもどる」は、売り場からの合図（awl-shop-ready）まで出しておく
    f.addEventListener('load', () => frame === f && f.focus())
    f.addEventListener('error', () => frame === f && setStatus('fail'))
    f.src = SHOP_URL
    frame = f
    view.prepend(f)
    loadTimer = window.setTimeout(() => frame === f && !status.hidden && setStatus('fail'), LOAD_TIMEOUT_MS)
    showView(view)
    listeners.forEach((fn) => fn(true))
  }

  // ワールドのタップ移動には渡さない
  enter.addEventListener('pointerdown', (e) => e.stopPropagation())
  enter.addEventListener('click', (e) => {
    e.stopPropagation()
    openView()
  })
  back.addEventListener('click', close)
  view.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close()
  })
  // 売り場の中の「ワールドにもどる」
  window.addEventListener('message', (e) => {
    if (!open || !frame || e.origin !== location.origin || e.source !== frame.contentWindow) return
    const type = (e.data as { type?: string } | null)?.type
    if (type === 'awl-shop-close') close()
    else if (type === 'awl-shop-ready') {
      window.clearTimeout(loadTimer)
      setStatus(null)
    } else if (type === 'awl-shop-fail') setStatus('fail')
  })

  return {
    setNear: (next) => {
      if (next === near) return
      near = next
      if (next && !open) showView(enter)
      else hideView(enter)
    },
    open: openView,
    close,
    isOpen: () => open,
    onOpenChange: (fn) => {
      listeners.push(fn)
    },
  }
}
