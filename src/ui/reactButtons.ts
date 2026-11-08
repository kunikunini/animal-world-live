import { reactions } from '../data/reactions'
import { esc } from './html'
import { t } from './i18n'

/**
 * 映像ごとの 👍（いいね）と ❤️（お気に入り）のボタン。アニマルスコープの新着・モニター・ともだち帳のトークで同じ物を使う。
 * 押した状態は aria-pressed。数はこの端末の中だけ（data/reactions.ts）なので、ボタンには数を出さない。
 * variant: 'dark' は映像の上（白い縁）、'light' は明るい地（モニターの下・トーク）。labels で文字も出す
 */
export function reactButtonsMarkup(key: string, variant: 'dark' | 'light' = 'dark', labels = false): string {
  if (!key) return ''
  const r = reactions.get(key)
  const btn = (kind: 'like' | 'fav', icon: string, label: string, on: boolean) =>
    `<button type="button" class="rx-btn rx-${kind}" data-react="${kind}" data-react-key="${esc(key)}" aria-pressed="${on}" aria-label="${esc(label)}" title="${esc(label)}"><svg class="ico" aria-hidden="true"><use href="#${icon}" /></svg>${labels ? `<span>${esc(label)}</span>` : ''}</button>`
  return `<span class="rx rx-${variant}${labels ? ' rx-labels' : ''}">${btn('like', 'i-like', t('react'), r.like)}${btn('fav', 'i-heart', t('favorite'), r.fav)}</span>`
}

/** 押された 👍/❤️ を切り替える。ボタンでなければ false（呼び出し側はほかの処理へ進む） */
export function handleReactClick(target: Element | null): boolean {
  const btn = target?.closest<HTMLElement>('[data-react]')
  if (!btn) return false
  const key = btn.dataset.reactKey ?? ''
  const kind = btn.dataset.react === 'fav' ? 'fav' : 'like'
  if (!key) return true
  // 押すと一覧が描き直されてボタンが外れることがある（お気に入り）ので、位置は切り替える前に測る
  const rect = btn.getBoundingClientRect()
  const next = reactions.toggle(key, kind)
  const on = kind === 'fav' ? next.fav : next.like
  if (on && !document.body.classList.contains('is-reduce-motion')) {
    btn.classList.remove('is-pop')
    void btn.offsetWidth
    btn.classList.add('is-pop')
    burst(rect, kind)
  }
  return true
}

const HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2z"/></svg>'
const SPARK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.5l2.6 7.9 7.9 2.6-7.9 2.6-2.6 7.9-2.6-7.9-7.9-2.6 7.9-2.6z"/></svg>'

/**
 * 👍/❤️ を押した時のはじける演出。ボタンの外（一覧の枠など）で切れないよう、body に固定位置の層を置いて描き、終わったら消す。
 * 👍 は黄色の星が散って親指が浮かぶ、❤️ はピンクのハートが散って大きなハートが浮かぶ。どちらもボタンのまわりに輪が広がる
 */
function burst(r: DOMRect, kind: 'like' | 'fav'): void {
  if (!r.width || typeof document.body.animate !== 'function') return
  const layer = document.createElement('div')
  layer.className = `rx-burst rx-burst-${kind}`
  layer.setAttribute('aria-hidden', 'true')
  layer.style.left = `${r.left + r.width / 2}px`
  layer.style.top = `${r.top + r.height / 2}px`
  document.body.appendChild(layer)
  const size = r.width
  const ease = 'cubic-bezier(0.22, 1, 0.36, 1)'

  const ring = document.createElement('span')
  ring.className = 'rx-ring'
  ring.style.width = ring.style.height = `${size}px`
  layer.appendChild(ring)
  ring.animate(
    [
      { transform: 'translate(-50%, -50%) scale(0.7)', opacity: 0.95, borderWidth: '5px' },
      { transform: 'translate(-50%, -50%) scale(2)', opacity: 0, borderWidth: '1px' },
    ],
    { duration: 560, easing: ease, fill: 'forwards' },
  )

  const n = kind === 'fav' ? 8 : 10
  const colors = kind === 'fav' ? ['#ff5c7a', '#ff8fa6', '#ffd0da', '#ff3d63'] : ['#f4c242', '#ffe08a', '#fff6e0', '#f26a1b']
  for (let i = 0; i < n; i++) {
    const p = document.createElement('span')
    p.className = 'rx-bit'
    p.innerHTML = kind === 'fav' && i % 2 === 0 ? HEART : SPARK
    const s = (kind === 'fav' && i % 2 === 0 ? 15 : 11) + Math.random() * 6
    p.style.width = p.style.height = `${s}px`
    p.style.color = colors[i % colors.length]
    layer.appendChild(p)
    const ang = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.5 - Math.PI / 2
    const d = size * (0.85 + Math.random() * 0.45)
    const dx = Math.cos(ang) * d
    const dy = Math.sin(ang) * d
    const rot = (Math.random() - 0.5) * 120
    p.animate(
      [
        { transform: 'translate(-50%, -50%) translate(0, 0) scale(0.2) rotate(0deg)', opacity: 1, easing: ease },
        { transform: `translate(-50%, -50%) translate(${dx}px, ${dy}px) scale(1) rotate(${rot}deg)`, opacity: 1, offset: 0.55, easing: 'ease-in' },
        { transform: `translate(-50%, -50%) translate(${dx * 1.15}px, ${dy * 1.15 + 10}px) scale(0.5) rotate(${rot * 1.4}deg)`, opacity: 0 },
      ],
      { duration: 620 + Math.random() * 180, delay: Math.random() * 40, fill: 'forwards' },
    )
  }

  // 真ん中から、大きな ❤️ / 👍 がふわっと上へ
  const big = document.createElement('span')
  big.className = 'rx-float'
  big.innerHTML = kind === 'fav' ? HEART : '<svg class="ico" aria-hidden="true"><use href="#i-like" /></svg>'
  big.style.width = big.style.height = `${Math.round(size * 0.62)}px`
  layer.appendChild(big)
  big.animate(
    [
      { transform: 'translate(-50%, -50%) translateY(0) scale(0.4) rotate(0deg)', opacity: 0, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
      { transform: `translate(-50%, -50%) translateY(${-size * 0.7}px) scale(1.25) rotate(${kind === 'like' ? -14 : 0}deg)`, opacity: 1, offset: 0.4, easing: 'ease-in' },
      { transform: `translate(-50%, -50%) translateY(${-size * 1.25}px) scale(1) rotate(${kind === 'like' ? 6 : 0}deg)`, opacity: 0 },
    ],
    { duration: 820, fill: 'forwards' },
  )

  window.setTimeout(() => layer.remove(), 1100)
}

/** 画面の中の 👍/❤️ を、保存されている状態に合わせる（ほかの場所で押された時） */
export function syncReactButtons(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('[data-react]').forEach((b) => {
    const r = reactions.get(b.dataset.reactKey ?? '')
    b.setAttribute('aria-pressed', String(b.dataset.react === 'fav' ? r.fav : r.like))
  })
}
