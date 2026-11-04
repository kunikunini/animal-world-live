import type { Animal } from '../data/animals'
import { getAnimal } from '../data/animals'
import type { FriendBookStore } from '../data/friends'
import { faceMarkup } from './faces'
import { esc } from './html'
import { animalName, onLangChange, speciesName, t } from './i18n'
import type { I18nKey } from './i18n'
import { hideView, showView } from './transition'

/**
 * アニマルスコープ（動画一覧）。観察スポットでスコープをのぞくと開く。
 * いまある映像は実物、まだ無い枠（ライブ・ほかのワールド・ほかの動物・動物園）は形だけのシルエットで、押せない。
 * 段の並びは「ライブ → 注目 → ともだち → ワールド → どうぶつ → 人気 → おすすめ → 動物園」。
 */
export interface CatalogView {
  /** withScope なら、のぞく演出に合わせた入り方（段が下から順に並ぶ）にする */
  open: (withScope: boolean) => void
  /** 演出をとばした時: 入りの動きを止めて、すぐ全部見せる */
  settle: () => void
  close: () => void
  isOpen: () => boolean
  onOpenChange: (fn: (open: boolean) => void) => void
  /** 映像のカードが押された */
  onWatch: (fn: (animal: Animal) => void) => void
  onOpenBook: (fn: () => void) => void
  /** 帳やモニターを閉じて戻ってきた時に、押したカードへフォーカスを返す */
  restoreFocus: () => void
}

/** いまある映像。増えたらここに足す */
interface VideoItem {
  animalId: string
  /** 一緒に映っている個体（タイトル用） */
  withIds: string[]
  poster: string
  duration: string
}

const FEATURED: VideoItem = {
  animalId: 'angie',
  withIds: ['claire', 'carla'],
  poster: '/media/angie-claire-carla_poster.jpg',
  duration: '3:01',
}

const SAVANNA_IMAGE = '/home/peek.jpg'

const PAW =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="15.5" rx="4.6" ry="3.8"/><circle cx="6.5" cy="10" r="2"/><circle cx="10" cy="6.8" r="2"/><circle cx="14" cy="6.8" r="2"/><circle cx="17.5" cy="10" r="2"/></svg>'
const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>'
const ZOO =
  '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 10l9-6 9 6M5 10v9h14v-9M10 19v-5h4v5"/></svg>'
const CHECK =
  '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'
const LOGO =
  '<svg class="cat-logo-mark" viewBox="0 0 24 24" aria-hidden="true"><circle cx="7" cy="14" r="5" fill="#f26a1b"/><circle cx="17" cy="14" r="5" fill="#f26a1b"/><rect x="9" y="7" width="6" height="6" rx="2" fill="#f4c242"/><circle cx="7" cy="14" r="2.6" fill="#fff6e6"/><circle cx="17" cy="14" r="2.6" fill="#fff6e6"/></svg>'

const times = (n: number, fn: (i: number) => string) => Array.from({ length: n }, (_, i) => fn(i)).join('')

export function createCatalog(store: FriendBookStore): CatalogView {
  const root = document.getElementById('catalog') as HTMLElement
  let open = false
  const openListeners: Array<(open: boolean) => void> = []
  const watchListeners: Array<(animal: Animal) => void> = []
  const bookListeners: Array<() => void> = []
  let returnFocus: HTMLElement | null = null

  const featuredTitle = () => {
    const main = getAnimal(FEATURED.animalId)
    const [b, c] = FEATURED.withIds.map((id) => getAnimal(id))
    if (!main || !b || !c) return main ? animalName(main) : ''
    return t('catHeroTitle', { a: animalName(main), b: animalName(b), c: animalName(c) })
  }

  const section = (key: string, title: string, body: string, extra = '') =>
    `<section class="cat-sec" data-sec="${key}"><h2 class="cat-h">${title}${extra}</h2>${body}</section>`

  const render = () => {
    const main = getAnimal(FEATURED.animalId)
    const friends = store
      .list()
      .map((e) => getAnimal(e.animalId))
      .filter((a): a is Animal => !!a)
    const lion = getAnimal('alex') ?? main
    const inBook = main ? store.has(main.id) : false
    const meta = (k: I18nKey) => esc(t(k))
    const chip = (k: string, label: I18nKey, active = false, dot = false) =>
      `<button type="button" class="cat-chip${active ? ' is-on' : ''}" data-jump="${k}" aria-pressed="${active}">${dot ? '<span class="cat-live-dot"></span>' : ''}${meta(label)}</button>`

    const live = section(
      'live',
      `<span class="cat-live-dot"></span>${meta('catRowLive')}`,
      `<div class="cat-row">${times(
        5,
        () =>
          `<div class="cat-live" aria-hidden="true"><div class="cat-live-ring"><div class="cat-sil cat-sil-round">${PAW}</div><span class="cat-live-tag">LIVE</span></div><span class="cat-bar-sil" style="width:52px"></span></div>`,
      )}</div>`,
    )

    const hero = main
      ? `<section class="cat-sec cat-hero-sec" data-sec="hero">
          <div class="cat-hero">
            <img class="cat-hero-img" src="${esc(FEATURED.poster)}" alt="" />
            <div class="cat-hero-shade" aria-hidden="true"></div>
            <span class="cat-badge"><svg class="ico" aria-hidden="true"><use href="#i-film" /></svg>${meta('recorded')}</span>
            <div class="cat-hero-text">
              <span class="cat-hero-meta">${meta('catSavanna')} ・ ${esc(speciesName(main.species))}</span>
              <span class="cat-hero-title">${esc(featuredTitle())}</span>
              <div class="cat-hero-actions">
                <button type="button" class="cat-watch" data-watch="${esc(main.id)}">${PLAY}${meta('catWatch')}</button>
                ${inBook ? `<span class="cat-inbook" role="img" aria-label="${meta('inBook')}" title="${meta('inBook')}">${CHECK}</span>` : ''}
              </div>
            </div>
          </div>
        </section>`
      : ''

    const friendsRow = section(
      'friends',
      meta('catRowFriends'),
      `<div class="cat-row cat-row-faces">${friends
        .map(
          (a) =>
            `<button type="button" class="cat-face" data-watch="${esc(a.id)}" aria-label="${esc(t('lookAt', { name: animalName(a) }))}">${faceMarkup(a, 'cat-face-img')}<span>${esc(animalName(a))}</span></button>`,
        )
        .join('')}<button type="button" class="cat-face cat-face-add" data-back="1"><span class="cat-face-plus" aria-hidden="true">+</span><span>${meta('catMeet')}</span></button></div>`,
      `<button type="button" class="cat-h-link" data-book="1">${meta('book')} ›</button>`,
    )

    const worlds = section(
      'worlds',
      meta('catRowWorlds'),
      `<div class="cat-row"><button type="button" class="cat-world" data-back="1"><img src="${SAVANNA_IMAGE}" alt="" /><span class="cat-world-shade" aria-hidden="true"></span><span class="cat-world-name">${meta('catSavanna')}</span></button>${times(
        3,
        () =>
          `<div class="cat-world cat-sil" aria-hidden="true"><svg class="cat-world-hill" viewBox="0 0 232 132" preserveAspectRatio="none"><path d="M0 92 Q 40 70 80 86 T 160 80 T 232 88 V132 H0 Z"/><circle cx="186" cy="38" r="16"/></svg><span class="cat-bar-sil cat-world-bar"></span></div>`,
      )}</div>`,
    )

    const animals = section(
      'animals',
      meta('catRowAnimals'),
      `<div class="cat-row cat-row-faces">${
        lion
          ? `<button type="button" class="cat-face cat-face-l" data-watch="${esc(FEATURED.animalId)}">${faceMarkup(lion, 'cat-face-img')}<span>${esc(speciesName(lion.species))}</span></button>`
          : ''
      }${times(4, () => `<div class="cat-face cat-face-l" aria-hidden="true"><div class="cat-sil cat-sil-round">${PAW}</div><span class="cat-bar-sil" style="width:48px"></span></div>`)}</div>`,
    )

    const popular = section(
      'popular',
      meta('catRowPopular'),
      `<div class="cat-row cat-row-rank">${
        main
          ? `<button type="button" class="cat-rank" data-watch="${esc(main.id)}" aria-label="${esc(`1. ${featuredTitle()}`)}"><span class="cat-rank-n" aria-hidden="true">1</span><img src="${esc(FEATURED.poster)}" alt="" /></button>`
          : ''
      }${[2, 3, 4, 5].map((n) => `<div class="cat-rank cat-rank-sil" aria-hidden="true"><span class="cat-rank-n">${n}</span><div class="cat-sil">${PLAY}</div></div>`).join('')}</div>`,
    )

    const recs = section(
      'recs',
      meta('catRowRecs'),
      `<div class="cat-row">${
        main
          ? `<button type="button" class="cat-card" data-watch="${esc(main.id)}"><span class="cat-thumb"><img src="${esc(FEATURED.poster)}" alt="" /><span class="cat-dur">${FEATURED.duration}</span></span><span class="cat-card-title">${meta('catRecTitle')}</span><span class="cat-card-meta">${meta('recorded')} ・ ${meta('catSavanna')}</span></button>`
          : ''
      }${times(
        3,
        () =>
          `<div class="cat-card" aria-hidden="true"><span class="cat-thumb cat-sil">${PLAY}</span><span class="cat-bar-sil" style="width:72%;height:12px"></span><span class="cat-bar-sil" style="width:46%"></span></div>`,
      )}</div>`,
    )

    const zoos = section(
      'zoos',
      meta('catRowZoos'),
      `<div class="cat-row">${times(
        4,
        () => `<div class="cat-zoo" aria-hidden="true"><span class="cat-sil">${ZOO}</span><span class="cat-bar-sil" style="width:64%"></span></div>`,
      )}</div>`,
    )

    root.innerHTML = `
      <div class="cat-scroll" tabindex="-1">
        <div class="cat-glow" aria-hidden="true"></div>
        <header class="cat-top">
          <button type="button" class="cat-icon-btn" data-back="1" aria-label="${meta('backWorld')}" title="${meta('backWorld')}"><svg class="ico" aria-hidden="true"><use href="#i-back" /></svg></button>
          <h1 class="cat-logo">${LOGO}<span>${meta('scope')}</span></h1>
          <button type="button" class="cat-top-book" data-book="1"><svg class="ico" aria-hidden="true"><use href="#i-book" /></svg><span>${meta('book')}</span></button>
        </header>
        <nav class="cat-chips cat-row" aria-label="${meta('catCategories')}">
          ${chip('all', 'catAll', true)}${chip('live', 'catLive', false, true)}${chip('worlds', 'catWorlds')}${chip('animals', 'catAnimals')}${chip('zoos', 'catZoos')}
        </nav>
        ${live}${hero}${friendsRow}${worlds}${animals}${popular}${recs}${zoos}
      </div>`
  }

  const scrollEl = () => root.querySelector<HTMLElement>('.cat-scroll')

  root.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('button')
    if (!target || !open) return
    if (target.dataset.back) {
      setOpen(false)
      return
    }
    if (target.dataset.book) {
      returnFocus = target
      bookListeners.forEach((fn) => fn())
      return
    }
    const watchId = target.dataset.watch
    if (watchId) {
      const animal = getAnimal(watchId)
      if (animal) {
        returnFocus = target
        watchListeners.forEach((fn) => fn(animal))
      }
      return
    }
    const jump = target.dataset.jump
    if (jump) {
      root.querySelectorAll<HTMLElement>('.cat-chip').forEach((c) => {
        const on = c === target
        c.classList.toggle('is-on', on)
        c.setAttribute('aria-pressed', String(on))
      })
      const scroller = scrollEl()
      if (!scroller) return
      if (jump === 'all') {
        scroller.scrollTo({ top: 0, behavior: 'smooth' })
        return
      }
      const sec = root.querySelector<HTMLElement>(`[data-sec="${jump}"]`)
      if (sec) scroller.scrollTo({ top: Math.max(0, sec.offsetTop - 12), behavior: 'smooth' })
    }
  })

  window.addEventListener('keydown', (e) => {
    if (open && e.key === 'Escape' && document.activeElement && root.contains(document.activeElement)) setOpen(false)
  })

  store.onChange(() => {
    if (open) {
      const top = scrollEl()?.scrollTop ?? 0
      render()
      const s = scrollEl()
      if (s) s.scrollTop = top
    }
  })
  onLangChange(() => {
    if (open) render()
  })

  const setOpen = (next: boolean, withScope = false) => {
    if (next === open) return
    open = next
    if (next) {
      render()
      root.classList.remove('is-leave')
      root.classList.toggle('is-scope-in', withScope)
      if (withScope) {
        // 演出の側で出し入れする（transition のフェードは使わない）
        root.hidden = false
        root.classList.remove('is-out')
      } else showView(root)
      scrollEl()?.focus({ preventScroll: true })
    } else {
      root.classList.remove('is-scope-in')
      root.classList.add('is-leave')
      hideView(root, () => root.classList.remove('is-leave'))
    }
    openListeners.forEach((fn) => fn(next))
  }

  return {
    open: (withScope) => setOpen(true, withScope),
    settle: () => root.classList.remove('is-scope-in'),
    close: () => setOpen(false),
    isOpen: () => open,
    onOpenChange: (fn) => {
      openListeners.push(fn)
    },
    onWatch: (fn) => {
      watchListeners.push(fn)
    },
    onOpenBook: (fn) => {
      bookListeners.push(fn)
    },
    restoreFocus: () => {
      if (open && returnFocus && root.contains(returnFocus)) returnFocus.focus({ preventScroll: true })
    },
  }
}
