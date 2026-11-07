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
  const next = reactions.toggle(key, kind)
  const on = kind === 'fav' ? next.fav : next.like
  if (on && !document.body.classList.contains('is-reduce-motion')) {
    btn.classList.remove('is-pop')
    void btn.offsetWidth
    btn.classList.add('is-pop')
  }
  return true
}

/** 画面の中の 👍/❤️ を、保存されている状態に合わせる（ほかの場所で押された時） */
export function syncReactButtons(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('[data-react]').forEach((b) => {
    const r = reactions.get(b.dataset.reactKey ?? '')
    b.setAttribute('aria-pressed', String(b.dataset.react === 'fav' ? r.fav : r.like))
  })
}
