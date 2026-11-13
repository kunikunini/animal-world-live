import { onLangChange, t } from './i18n'
import { hideView, showView } from './transition'
import type { Iris } from './iris'

/** 3D の売り場（public/shop3d。別のプロジェクトで作ったものを写した、見るだけの版） */
const SHOP_URL = '/shop3d/index.html?awl'
/** スマホ用: ページごと移る時の行き先 */
const SHOP_NAV_URL = '/shop3d/index.html?awl=nav'
/** これだけ待っても売り場の用意ができなければ、うまく開けなかった案内を出す */
const LOAD_TIMEOUT_MS = 20000

/**
 * グッズのお店。お店の前（石畳の手前から）に来た時の「お店に入る」ボタンと、売り場を上に重ねる画面。
 * 入る時と出る時は、ゲームを始める時と同じ演出（双眼鏡の形に絞られて、また開く幕）をはさむ。
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

export function createShopView(iris: Iris, navigate = false): ShopView {
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

  let busy = false
  /** ページごとお店へ移った（ブラウザの「戻る」でこのページが出し直された時に、お店の前から入り直す） */
  let left = false
  window.addEventListener('pageshow', (e) => {
    if (e.persisted && left) location.replace('/?shop')
  })
  /** 売り場の用意ができた（true）・失敗した（false）を待つ間だけ入っている */
  let settle: ((ok: boolean) => void) | null = null

  // 出る: 幕（ゲームを始める時と同じ、双眼鏡の形の演出）を閉じ、売り場を外して、ワールドで幕を開ける
  const close = async () => {
    if (!open || busy) return
    busy = true
    await iris.close()
    // 売り場の 3D を手放す（開き直したら読み込み直す）
    frame?.remove()
    frame = null
    view.hidden = true
    setStatus(null)
    open = false
    listeners.forEach((fn) => fn(false))
    // まだお店の前にいるので、また入れるようにする
    if (near) showView(enter)
    await iris.open()
    busy = false
  }

  // 入る: 幕を閉じ、その裏で売り場を読み、用意ができたら幕を開ける。売り場は外観から始まり、合図で扉をくぐって店内へ歩く
  const openView = async () => {
    if (open || busy) return
    open = true
    busy = true
    hideView(enter)
    listeners.forEach((fn) => fn(true))
    await iris.close()
    if (navigate) {
      // スマホ: ワールドの上に重ねず、ページごとお店へ移る（ワールドとお店の 3D を同時に持つと、メモリが足りずにページが落ちて、スタートに戻ってしまう）。
      // お店を出ると /?shop で、ワールドのお店の前に戻ってくる
      left = true
      location.assign(SHOP_NAV_URL)
      return
    }
    setStatus(null)
    const f = document.createElement('iframe')
    f.className = 'shop-view-frame'
    f.title = t('shopName')
    f.addEventListener('load', () => frame === f && f.focus())
    f.addEventListener('error', () => frame === f && settle?.(false))
    f.src = SHOP_URL
    frame = f
    view.prepend(f)
    view.hidden = false
    // 少し待っても用意ができない時だけ、幕の上に「じゅんびちゅう」が浮かぶ
    iris.setWaiting(true)
    const ok = await new Promise<boolean>((resolve) => {
      settle = resolve
      loadTimer = window.setTimeout(() => resolve(false), LOAD_TIMEOUT_MS)
    })
    settle = null
    window.clearTimeout(loadTimer)
    iris.setWaiting(false)
    if (!ok) setStatus('fail')
    await iris.open()
    busy = false
    if (ok) f.contentWindow?.postMessage({ type: 'awl-shop-go' }, location.origin)
  }

  // ワールドのタップ移動には渡さない
  enter.addEventListener('pointerdown', (e) => e.stopPropagation())
  enter.addEventListener('click', (e) => {
    e.stopPropagation()
    void openView()
  })
  back.addEventListener('click', () => void close())
  view.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') void close()
  })
  // 売り場の中の「ワールドにもどる」
  window.addEventListener('message', (e) => {
    if (!open || !frame || e.origin !== location.origin || e.source !== frame.contentWindow) return
    const type = (e.data as { type?: string } | null)?.type
    if (type === 'awl-shop-close') void close()
    else if (type === 'awl-shop-ready') settle?.(true)
    else if (type === 'awl-shop-fail') {
      if (settle) settle(false)
      else setStatus('fail')
    }
  })

  return {
    setNear: (next) => {
      if (next === near) return
      near = next
      if (next && !open) showView(enter)
      else hideView(enter)
    },
    open: () => void openView(),
    close: () => void close(),
    isOpen: () => open,
    onOpenChange: (fn) => {
      listeners.push(fn)
    },
  }
}
