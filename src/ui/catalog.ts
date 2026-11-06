import type { Animal } from '../data/animals'
import { animalsInVideo, animalsInWorld, getAnimal } from '../data/animals'
import { SPECIES_VIDEOS, videoForSpecies } from '../data/videos'
import { WORLDS, getWorld } from '../data/worlds'
import type { WorldInfo, WorldKey } from '../data/worlds'
import type { FriendBookStore } from '../data/friends'
import { faceMarkup } from './faces'
import { esc } from './html'
import { animalName, getLang, onLangChange, speciesName, subAreaName, t } from './i18n'
import type { I18nKey } from './i18n'
import { hideView, showView } from './transition'

/**
 * アニマルスコープ（動画一覧）。どのワールドの観察スポットでも、スコープをのぞくと同じ一覧が開く。
 * いまある映像は実物、まだ無い枠（ライブ・ほかのワールド・ほかの動物・動物園）は形だけのシルエットで、押せない。
 * 段の並びは「ライブ → 注目 → ともだち → ワールド → どうぶつ → おすすめ → すべての動画 → 動物園」。
 * 「ワールド」の段から、開いているワールド（D-36）の動物の一覧へ入れる（サバンナも同じ）。一覧は同じ画面の中で切り替える。
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

const worldName = (w: WorldInfo) => w.name[getLang()]

/** ワールドのカードの絵（自作 SVG。地形の雰囲気だけ） */
const WORLD_ART: Partial<Record<WorldKey, string>> = {
  jungle:
    '<path d="M0 132V96q30-18 58-4t62-6 62 2 50-6V132z" fill="#0f5a37"/><path d="M28 104c-4-26 6-48 22-60-10 18-12 38-8 60z" fill="#1f8a4f"/><path d="M40 52c14-10 34-10 46 0-16-2-30 0-46 0zM40 52c-14-8-30-6-40 4 14-4 26-4 40-4zM40 52c4-14 18-22 32-22-14 6-24 14-32 22z" fill="#7ad17f"/><path d="M182 108c-2-30 8-52 24-64-12 20-14 42-10 64z" fill="#1f8a4f"/><path d="M196 46c12-12 30-14 36-8-12 0-24 4-36 8zM196 46c-12-10-30-8-36 0 12-2 24-2 36 0z" fill="#7ad17f"/>',
  south:
    '<circle cx="178" cy="40" r="20" fill="#ffe08a"/><path d="M0 132v-30q60-10 116-6t116 2V132z" fill="#8f3720"/><path d="M58 98q6-26 40-28t52 8q10 10 16 20z" fill="#c95d36"/><path d="M70 92q14-14 34-14" stroke="#e98a5a" stroke-width="3" fill="none" stroke-linecap="round"/>',
  partner:
    '<circle cx="186" cy="32" r="15" fill="#fff1b8"/><path d="M0 132V96q40-22 92-10t82-6 58 6V132z" fill="#5fae4a"/><path d="M0 132v-22q60-12 116-4t116-6V132z" fill="#8fd052"/><path d="M132 98V70l22-16 22 16v28z" fill="#c8402f"/><path d="M128 72l26-20 26 20" stroke="#6a4a3a" stroke-width="5" fill="none" stroke-linejoin="round"/><path d="M146 98V82h16v16z" fill="#f6f1e6"/><path d="M20 112h86M20 104h86" stroke="#f3e2c4" stroke-width="3"/><path d="M24 116v-18M46 116v-18M68 116v-18M90 116v-18" stroke="#b07a48" stroke-width="4" stroke-linecap="round"/>',
  water:
    '<circle cx="182" cy="34" r="16" fill="#fff4c2"/><path d="M118 92q14-26 34-26t30 26z" fill="#3f9a5a"/><path d="M128 92q10-16 24-16" stroke="#7ccf7a" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M0 132V92q29-8 58 0t58 0 58 0 58 0V132z" fill="#1d6fa6"/><path d="M0 106q29-8 58 0t58 0 58 0 58 0" stroke="#bfefff" stroke-width="3" fill="none"/><path d="M0 132v-12q40-10 80-2t72-6 80 4V132z" fill="#f4dc9c"/><path d="M40 112c0-10 4-16 9-16s9 6 9 16z" fill="#23252b"/><path d="M45 112c0-7 2-11 4-11s4 4 4 11z" fill="#f7f6f2"/><circle cx="49" cy="93" r="5" fill="#23252b"/>',
  sky:
    '<circle cx="40" cy="30" r="15" fill="#fff4c8"/><path d="M150 40q4-14 18-12 6-10 18-4 14-2 14 12 10 2 8 10h-62q-6-4 4-6z" fill="#fff"/><path d="M16 66q2-10 14-9 6-8 16-2 10 0 10 9h-38z" fill="#fff" opacity=".9"/><path d="M0 132V96l22-40 14 28 18-52 22 58 14-18 18 28V132z" fill="#8a88c4"/><path d="M36 84l18-52 6 18-10 34zM22 56l6 14-6 4z" fill="#f4e4c8"/><path d="M0 132v-24q60-14 116-6t116-6V132z" fill="#a4d66a"/><path d="M168 132V82" stroke="#7a5431" stroke-width="5"/><path d="M154 82h28" stroke="#7a5431" stroke-width="5" stroke-linecap="round"/><ellipse cx="168" cy="70" rx="10" ry="12" fill="#9a7a5a"/><circle cx="168" cy="60" r="8" fill="#b08a64"/><circle cx="164.5" cy="60" r="3.2" fill="#ffd34a"/><circle cx="171.5" cy="60" r="3.2" fill="#ffd34a"/><circle cx="164.5" cy="60" r="1.5" fill="#1a1410"/><circle cx="171.5" cy="60" r="1.5" fill="#1a1410"/><path d="M162 53l-2-6 5 4zM174 53l2-6-5 4z" fill="#8a6a4a"/><path d="M112 30q8-6 14 0 6-6 14 0" stroke="#3a3550" stroke-width="3" fill="none" stroke-linecap="round"/>',
  north:
    '<path d="M0 132V92l40-44 30 30 46-58 50 62 30-26 36 36V132z" fill="#2f5f96"/><path d="M116 20l-18 24 10-4 8 8 8-8 10 4zM40 48l-12 14 7-3 5 5 5-5 7 3z" fill="#fff"/><path d="M0 132v-22q58-12 116-6t116-4V132z" fill="#e9f4fb"/><path d="M180 112l10-28 10 28zM196 116l8-22 8 22z" fill="#1f4f3a"/>',
}

/** 一覧の小さな絵は 640×360 の縮小版（1280×720 の表紙を何枚も並べると、iPhone でメモリを使いすぎる） */
const thumb = (poster: string) => poster.replace(/_poster\.jpg$/, '_poster-sm.jpg')

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

  /** いま開いているワールドの一覧。null ならアニマルスコープの段の一覧 */
  let page: WorldKey | null = null

  const renderWorldPage = (w: WorldInfo) => {
    const meta = (k: I18nKey) => esc(t(k))
    const list = animalsInWorld(w.key)
    // 区分 → 種 の順にまとめる。代表の種を先に、あとはデータの並び
    const subs: string[] = []
    for (const a of list) if (!subs.includes(a.subArea ?? '')) subs.push(a.subArea ?? '')
    const body = subs
      .map((sub) => {
        const inSub = list.filter((a) => (a.subArea ?? '') === sub)
        const species: string[] = []
        for (const a of inSub) if (!species.includes(a.species)) species.push(a.species)
        const rep = (sp: string) => (inSub.find((a) => a.species === sp)?.representative ? 0 : 1)
        species.sort((x, y) => rep(x) - rep(y))
        const blocks = species
          .map((sp) => {
            const faces = inSub
              .filter((a) => a.species === sp)
              .map((a) => {
                const has = store.has(a.id)
                return `<button type="button" class="cat-face cat-face-l" data-watch="${esc(a.id)}" aria-label="${esc(t('lookAt', { name: animalName(a) }))}${has ? esc(`（${t('inBook')}）`) : ''}">${faceMarkup(a, 'cat-face-img')}<span>${esc(animalName(a))}</span>${has ? `<span class="cat-face-check" aria-hidden="true">${CHECK}</span>` : ''}</button>`
              })
              .join('')
            const film = videoForSpecies(sp)
              ? `<span class="wp-has-video"><svg class="ico" aria-hidden="true"><use href="#i-film" /></svg>${meta('catHasVideo')}</span>`
              : ''
            return `<div class="wp-species"><h3 class="wp-species-h">${esc(speciesName(sp))}${film}</h3><div class="wp-grid">${faces}</div></div>`
          })
          .join('')
        const heading = sub && subs.length > 1 ? `<h2 class="cat-h">${esc(subAreaName(sub))}</h2>` : ''
        return `<section class="cat-sec wp-sec">${heading}${blocks}</section>`
      })
      .join('')
    const only = subs.length === 1 && subs[0] ? `<p class="wp-sub">${esc(subAreaName(subs[0]))}</p>` : ''
    root.innerHTML = `
      <div class="cat-scroll" tabindex="-1">
        <div class="cat-glow" aria-hidden="true"></div>
        <header class="cat-top">
          <button type="button" class="cat-icon-btn" data-list="1" aria-label="${meta('catBackList')}" title="${meta('catBackList')}"><svg class="ico" aria-hidden="true"><use href="#i-back" /></svg></button>
          <h1 class="cat-logo"><span>${esc(worldName(w))}</span></h1>
          <button type="button" class="cat-top-book" data-book="1"><svg class="ico" aria-hidden="true"><use href="#i-book" /></svg><span>${meta('book')}</span></button>
        </header>
        <div class="wp-banner" style="--w1:${w.colors[0]};--w2:${w.colors[1]}">${w.key === 'africa' ? `<img class="cat-world-art" src="${SAVANNA_IMAGE}" alt="" style="object-fit:cover" />` : `<svg class="cat-world-art" viewBox="0 0 232 132" preserveAspectRatio="xMidYMax slice" aria-hidden="true">${WORLD_ART[w.key] ?? ''}</svg>`}<span class="cat-world-shade" aria-hidden="true"></span>${only}<p class="wp-lead">${meta('catWorldLead')}</p></div>
        ${body}
      </div>`
  }

  const render = () => {
    const pageWorld = page ? getWorld(page) : undefined
    if (pageWorld) {
      renderWorldPage(pageWorld)
      return
    }
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

    const worldCard = (w: WorldInfo) => {
      const style = `--w1:${w.colors[0]};--w2:${w.colors[1]}`
      const art = `<svg class="cat-world-art" viewBox="0 0 232 132" preserveAspectRatio="xMidYMax slice" aria-hidden="true">${WORLD_ART[w.key] ?? '<path d="M0 132V96q58-20 116-6t116-4V132z" fill="rgba(255,255,255,.28)"/>'}</svg>`
      if (!w.open)
        return `<div class="cat-world cat-world-soon" style="${style}">${art}<span class="cat-world-shade" aria-hidden="true"></span><span class="cat-world-name">${esc(worldName(w))}</span><span class="cat-world-tag">${meta('catWorldSoon')}</span></div>`
      return `<button type="button" class="cat-world cat-world-open" style="${style}" data-world="${w.key}" aria-label="${esc(t('catWorldEnter', { world: worldName(w) }))}">${art}<span class="cat-world-shade" aria-hidden="true"></span><span class="cat-world-name">${esc(worldName(w))}</span></button>`
    }
    const worlds = section(
      'worlds',
      meta('catRowWorlds'),
      `<div class="cat-row"><button type="button" class="cat-world" data-world="africa" aria-label="${esc(t('catWorldEnter', { world: t('catSavanna') }))}"><img src="${SAVANNA_IMAGE}" alt="" /><span class="cat-world-shade" aria-hidden="true"></span><span class="cat-world-name">${meta('catSavanna')}</span></button>${WORLDS.filter((w) => w.key !== 'africa')
        .map(worldCard)
        .join('')}</div>`,
    )

    // 映像のある種（ライオンのあとに、映像ごと・映っている種ごと）。押すとその種の最初の子のモニター
    const videoSpecies = SPECIES_VIDEOS.flatMap((v) => {
      const inVideo = animalsInVideo(v.id)
      return v.subjects.flatMap((sub) => {
        const first = inVideo.find((a) => sub.species.includes(a.species))
        if (!first) return []
        const label = sub.label ? sub.label[getLang()] : speciesName(first.species)
        return [`<button type="button" class="cat-face cat-face-l" data-watch="${esc(first.id)}">${faceMarkup(first, 'cat-face-img')}<span>${esc(label)}</span></button>`]
      })
    })
    // 段が寂しくならないよう、5 つに満たない分は形だけのシルエット
    const animalSils = Math.max(0, 4 - videoSpecies.length)
    const animals = section(
      'animals',
      meta('catRowAnimals'),
      `<div class="cat-row cat-row-faces">${
        lion
          ? `<button type="button" class="cat-face cat-face-l" data-watch="${esc(FEATURED.animalId)}">${faceMarkup(lion, 'cat-face-img')}<span>${esc(speciesName(lion.species))}</span></button>`
          : ''
      }${videoSpecies.join('')}${times(animalSils, () => `<div class="cat-face cat-face-l" aria-hidden="true"><div class="cat-sil cat-sil-round">${PAW}</div><span class="cat-bar-sil" style="width:48px"></span></div>`)}</div>`,
    )

    // 人気を測ったデータは無いので、順位（1・2…）は出さない（11/6 の UT 健診）。見出しは「おすすめ」、縦長のポスターの棚
    const popular = section(
      'popular',
      meta('catRowPopular'),
      `<div class="cat-row cat-row-rank">${
        main
          ? `<button type="button" class="cat-rank" data-watch="${esc(main.id)}" aria-label="${esc(featuredTitle())}"><img src="${esc(thumb(FEATURED.poster))}" alt="" /></button>`
          : ''
      }${times(4, () => `<div class="cat-rank cat-rank-sil" aria-hidden="true"><div class="cat-sil">${PLAY}</div></div>`)}</div>`,
    )

    // 種の映像のカード（3 枚に満たない分は形だけのシルエット）
    const recCards = SPECIES_VIDEOS.flatMap((v) => {
      const first = animalsInVideo(v.id)[0]
      if (!first) return []
      const w = first.world ? getWorld(first.world) : undefined
      const place = first.world === 'africa' ? t('catSavanna') : w ? worldName(w) : ''
      return [
        `<button type="button" class="cat-card" data-watch="${esc(first.id)}"><span class="cat-thumb"><img src="${esc(thumb(v.poster))}" alt="" loading="lazy" /><span class="cat-dur">${esc(v.duration)}</span></span><span class="cat-card-title">${esc(v.title[getLang()])}</span><span class="cat-card-meta">${meta('recorded')}${place ? ` ・ ${esc(place)}` : ''}</span></button>`,
      ]
    })
    const recs = section(
      'recs',
      meta('catRowRecs'),
      `<div class="cat-row">${
        main
          ? `<button type="button" class="cat-card" data-watch="${esc(main.id)}"><span class="cat-thumb"><img src="${esc(thumb(FEATURED.poster))}" alt="" /><span class="cat-dur">${FEATURED.duration}</span></span><span class="cat-card-title">${meta('catRecTitle')}</span><span class="cat-card-meta">${meta('recorded')} ・ ${meta('catSavanna')}</span></button>`
          : ''
      }${recCards.join('')}${times(
        Math.max(0, 3 - recCards.length),
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
  // 下へ送ったら、上に貼りついた見出し（戻るボタン）に地の色を敷く（いちばん上では今までどおり光の模様が見える）
  root.addEventListener(
    'scroll',
    (e) => {
      const el = e.target as HTMLElement
      if (el.classList?.contains('cat-scroll')) el.classList.toggle('is-scrolled', el.scrollTop > 8)
    },
    true,
  )

  root.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('button')
    if (!target || !open) return
    if (target.dataset.back) {
      setOpen(false)
      return
    }
    const worldKey = target.dataset.world as WorldKey | undefined
    if (worldKey && getWorld(worldKey)?.open) {
      goPage(worldKey)
      return
    }
    if (target.dataset.list) {
      goPage(null)
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

  /** ワールドの一覧と段の一覧を切り替える。戻った時は押したワールドのカードへフォーカスを返す */
  const goPage = (next: WorldKey | null) => {
    const from = page
    page = next
    returnFocus = null
    // のぞく演出（3.3 秒）の途中でページを替えると、作り直したページで演出が最初からやり直しになり、しばらく拡大されたままずれて見える。替える前に演出を終える
    root.classList.remove('is-scope-in')
    render()
    const scroller = scrollEl()
    if (next) {
      scroller?.focus({ preventScroll: true })
      return
    }
    const card = from ? root.querySelector<HTMLElement>(`[data-world="${from}"]`) : null
    const sec = root.querySelector<HTMLElement>('[data-sec="worlds"]')
    if (scroller && sec) scroller.scrollTop = Math.max(0, sec.offsetTop - 12)
    ;(card ?? scroller)?.focus({ preventScroll: true })
  }

  window.addEventListener('keydown', (e) => {
    if (!open || e.key !== 'Escape' || !document.activeElement || !root.contains(document.activeElement)) return
    if (page) goPage(null)
    else setOpen(false)
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

  const setOpen = (next: boolean, withScope = false, startPage: WorldKey | null = null) => {
    if (next === open) return
    open = next
    if (next) {
      page = startPage
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
