import type { Animal } from '../data/animals'
import { animalsInVideo, animalsInWorld, getAnimal, listReadyAnimals } from '../data/animals'
import { SPECIES_VIDEOS, STAFF_VIDEOS, videoForSpecies } from '../data/videos'
import type { SpeciesVideo } from '../data/videos'
import { WORLDS, getWorld } from '../data/worlds'
import type { WorldInfo, WorldKey } from '../data/worlds'
import type { FriendBookStore } from '../data/friends'
import { faceMarkup } from './faces'
import { esc } from './html'
import { SCOPE_MS } from './scope'
import { animalName, getLang, onLangChange, speciesName, subAreaName, t } from './i18n'
import type { I18nKey } from './i18n'
import { hideView, showView } from './transition'
import { handleReactClick, reactButtonsMarkup, syncReactButtons } from './reactButtons'
import { reactions, videoKeyOf } from '../data/reactions'

/**
 * アニマルスコープ（動画一覧）。どのワールドの観察スポットでも、スコープをのぞくと同じ一覧が開く。
 * いまある映像は実物、まだ無い枠（ライブ・ほかのワールド・ほかの動物・動物園）は形だけのシルエットで、押せない。
 * 段の並びは「ライブ → 注目 → ともだち → ワールド → どうぶつ → おすすめ → すべての動画 → スタッフ撮影 → 動物園」。
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


const PAW =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="15.5" rx="4.6" ry="3.8"/><circle cx="6.5" cy="10" r="2"/><circle cx="10" cy="6.8" r="2"/><circle cx="14" cy="6.8" r="2"/><circle cx="17.5" cy="10" r="2"/></svg>'
const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>'
const CHECK =
  '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'
const LOGO =
  '<svg class="cat-logo-mark" viewBox="0 0 24 24" aria-hidden="true"><circle cx="7" cy="14" r="5" fill="#f26a1b"/><circle cx="17" cy="14" r="5" fill="#f26a1b"/><rect x="9" y="7" width="6" height="6" rx="2" fill="#f4c242"/><circle cx="7" cy="14" r="2.6" fill="#fff6e6"/><circle cx="17" cy="14" r="2.6" fill="#fff6e6"/></svg>'

const times = (n: number, fn: (i: number) => string) => Array.from({ length: n }, (_, i) => fn(i)).join('')

const worldName = (w: WorldInfo) => w.name[getLang()]

/** ワールドのカードの絵: いまのワールドをゲームの中で撮った物（public/worlds/<key>.webp、640×360） */
const worldImage = (key: WorldKey) => `/worlds/${key}.webp`

/** 動物園からえらぶ: 架空の動物園の絵（public/zoos/、実在の動物園ではない）。参加する動物園は募集中 */
const ZOO_ART = ['sea', 'forest', 'snow', 'grass']

/** 「どうぶつからえらぶ」の種のアイコン（クレイアニメ風のイラスト。Codex で生成。ライオンは段のいちばん左で /species/lion.webp を直接使う） */
const SPECIES_ICON: Record<string, string> = {
  カピバラ: 'capybara',
  ブチハイエナ: 'hyena',
  モモイロペリカン: 'pelican',
  オオカンガルー: 'kangaroo',
  マーラ: 'mara',
  ポニー: 'pony',
  コモンリスザル: 'squirrel-monkey',
}

/** ライブの窓の下の名前（左から）。配信はまだ無いので、どの窓にも木の看板（文言は子ごとに変える）を赤い丸の下のふちに札として貼る。日本語はくにの看板の絵（文字入り、ロープを外した）、英語は木の色の札に英文 */
const LIVE_SPECIES: Array<{ ja: string; en: string; away: { ja: string; en: string }; sign: string }> = [
  { ja: 'ライオン', en: 'Lion', away: { ja: '帰宅中', en: 'Gone home' }, sign: 'home' },
  { ja: 'アメリカバク', en: 'Lowland tapir', away: { ja: 'おひるね中', en: 'Napping' }, sign: 'nap' },
  { ja: 'ブチハイエナ', en: 'Spotted hyena', away: { ja: 'ごはん中', en: 'Eating' }, sign: 'eat' },
  { ja: 'ポニー', en: 'Pony', away: { ja: 'おさんぽ中', en: 'On a walk' }, sign: 'walk' },
  { ja: 'カンガルー', en: 'Kangaroo', away: { ja: 'おでかけ中', en: 'Out & about' }, sign: 'out' },
]

/** いちばん上の大きな枠: 新着の映像を何本まで順に見せるか、1 本を何ミリ秒見せるか */
const HERO_MAX = 5
const HERO_MS = 7000
/** 新着の枠: 表紙を見せてから映像を作るまでの待ち（開く瞬間・切り替えの瞬間に読み込みを重ねない。スマホのメモリ） */
const HERO_VIDEO_WAIT = 1500

interface HeroSlide {
  animal: Animal
  video: SpeciesVideo
  title: string
  meta: string
}

/** 一覧の小さな絵は 640×360 の縮小版（1280×720 の表紙を何枚も並べると、iPhone でメモリを使いすぎる） */
const thumb = (poster: string) => poster.replace(/_poster\.jpg$/, '_poster-sm.jpg')
/**
 * 段のカードの表紙。スマホのカードは幅 208px なので、その 2 倍の 416px の版（_poster-xs.jpg）を出す。
 * 幅 768px 以上（カード 260px）だけ 640px の版。iPhone は画像を「幅×高さ×4 バイト」に広げて持つので、大きい版を出さない
 */
const cardImg = (poster: string) => {
  const sm = esc(thumb(poster))
  const xs = esc(poster.replace(/_poster\.jpg$/, '_poster-xs.jpg'))
  return `<picture><source media="(min-width: 768px)" srcset="${sm}" /><img src="${xs}" alt="" loading="lazy" decoding="async" /></picture>`
}

/** スタッフが撮った映像の表紙の左上に付ける札（その映像にだけ付ける。段の見出しだけでは、どの映像の話か伝わらないため） */
const CAM =
  '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6.5" width="13" height="11" rx="2.5"/><path d="M15.5 10.5l6-3.5v10l-6-3.5z"/></svg>'
const staffChip = (extra = '', hidden = false) =>
  `<span class="cat-staff-chip${extra}"${hidden ? ' hidden' : ''}>${CAM}<span>${esc(t('staffShot'))}</span></span>`

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

  // ---- いちばん上の新着の枠 ----
  // Motion Prompt #137 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#137
  //   切り替え: 次の 1 本が横から入り、今の 1 本を一緒に押し出す（1.15 秒、cubic ease-in-out、2 枚はつながったまま・フェードなし、継ぎ目に細い線）
  // Motion Prompt #005 · MIT License (c) 2026 Shohei Ohtaki · https://showheyohtaki.github.io/motion-prompt/#005
  //   文字: 線が真ん中から伸び（0.1–0.5 秒）、上の段は線の下から（0.35–1.0 秒）、下の段は線の上から（0.55–1.15 秒）quint ease-out で出る。
  //   消える時は上の段が backIn（s=1.2）で上へ、下の段が ease-in で下へ。透明度は変えず、枠の外へ出て隠れるだけ
  let heroSlides: HeroSlide[] = []
  let heroIndex = 0
  let heroTimer = 0
  let heroVisible = true
  let heroIo: IntersectionObserver | null = null
  /** 止めるボタンで止めた（開き直すまで続く） */
  let heroPaused = false
  /** 動きをへらす時に、再生ボタンで流した */
  let heroPlayed = false
  /** いま表に出ている板（0 か 1） */
  let heroPane = 0
  /** 押し出しの途中（指で動かしている間も含む） */
  let heroBusy = false

  const PUSH_MS = 1150
  const PUSH_EASE = 'cubic-bezier(0.65, 0, 0.35, 1)'
  const QUINT_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)'
  const BACK_IN = 'cubic-bezier(0.6, -0.28, 0.735, 0.045)'
  const CUBIC_IN = 'cubic-bezier(0.32, 0, 0.67, 0)'

  /** 新着の映像: スタッフ撮影（新しい順）のあとに種の映像（videos.json の下の行ほど新しい）。開ける子がいる物だけ */
  const newestSlides = (): HeroSlide[] => {
    const out: HeroSlide[] = []
    for (const v of [...STAFF_VIDEOS, ...[...SPECIES_VIDEOS].reverse()]) {
      const named = v.animalIds.map((id) => getAnimal(id)).find((x): x is Animal => !!x && x.status === 'ready')
      const a = named ?? listReadyAnimals().find((x) => x.videoId === v.id)
      if (!a) continue
      const w = a.world ? getWorld(a.world) : undefined
      const place = a.world === 'africa' ? t('catSavanna') : w ? worldName(w) : ''
      out.push({
        animal: a,
        video: v,
        title: named ? animalName(a) : v.title[getLang()],
        meta: [t('catNew'), place, speciesName(a.species)].filter(Boolean).join(' ・ '),
      })
      if (out.length >= HERO_MAX) break
    }
    return out
  }

  const heroEl = () => root.querySelector<HTMLElement>('.cat-hero[aria-roledescription]')
  const reduceMotion = () => document.body.classList.contains('is-reduce-motion')
  const panes = (el: HTMLElement) => el.querySelectorAll<HTMLElement>('.cat-hero-pane')
  const anim = (el: Element | null, frames: Keyframe[], duration: number, easing: string, delay = 0) =>
    el?.animate(frames, { duration, easing, delay, fill: 'both' })

  /** 文字と操作（観察する・👍・❤️・点）を i 本目に合わせる */
  const fillSlideText = (el: HTMLElement, i: number) => {
    const sl = heroSlides[i]
    if (!sl) return
    ;(el.querySelector('.cat-hero-staff') as HTMLElement).hidden = !sl.video.staff
    ;(el.querySelector('.cat-hero-meta') as HTMLElement).textContent = sl.meta
    ;(el.querySelector('.cat-hero-title') as HTMLElement).textContent = sl.title
    const watch = el.querySelector<HTMLElement>('.cat-watch')
    if (watch) {
      watch.dataset.watch = sl.animal.id
      watch.setAttribute('aria-label', `${t('catWatch')}: ${sl.title}`)
    }
    const rx = el.querySelector<HTMLElement>('.cat-hero-rx')
    if (rx) rx.innerHTML = reactButtonsMarkup(sl.video.id)
    ;(el.querySelector('.cat-inbook') as HTMLElement).hidden = !store.has(sl.animal.id)
    el.querySelectorAll<HTMLElement>('.cat-hero-dot').forEach((d, n) => {
      if (n === i) d.setAttribute('aria-current', 'true')
      else d.removeAttribute('aria-current')
    })
  }

  /** 板に表紙を入れる。読み終わる（decode）まで待つ（読めなくても 700ms で先へ） */
  const fillPane = (pane: HTMLElement, i: number): Promise<void> => {
    const sl = heroSlides[i]
    const img = pane.querySelector<HTMLImageElement>('.cat-hero-img')
    if (!sl || !img) return Promise.resolve()
    pane.classList.toggle('is-portrait', sl.video.portrait)
    // 縦長の映像の左右は、あらかじめぼかした小さい表紙（160×90）で埋める（大きな面を filter でぼかさない。iPhone のメモリ）
    if (sl.video.portrait) pane.style.setProperty('--blur', `url("${sl.video.poster.replace(/_poster\.jpg$/, '_poster-blur.jpg')}")`)
    else pane.style.removeProperty('--blur')
    if (img.getAttribute('src') !== sl.video.poster) img.src = sl.video.poster
    const done = img.decode ? img.decode().catch(() => undefined) : Promise.resolve()
    return Promise.race([done, new Promise<void>((r) => window.setTimeout(r, 700))])
  }

  /** #005 の入り（押し出しが終わってから） */
  const revealText = (el: HTMLElement) => {
    if (reduceMotion()) return
    anim(el.querySelector('.cat-hero-line'), [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], 400, 'cubic-bezier(0.65, 0, 0.35, 1)', 100)
    anim(el.querySelector('.cat-hero-meta'), [{ transform: 'translateY(105%)' }, { transform: 'translateY(0)' }], 650, QUINT_OUT, 350)
    anim(el.querySelector('.cat-hero-title'), [{ transform: 'translateY(-105%)' }, { transform: 'translateY(0)' }], 600, QUINT_OUT, 550)
  }

  /** #005 の出（押し出しと同時に始める） */
  const hideText = (el: HTMLElement) => {
    if (reduceMotion()) return
    anim(el.querySelector('.cat-hero-meta'), [{ transform: 'translateY(0)' }, { transform: 'translateY(-105%)' }], 350, BACK_IN)
    anim(el.querySelector('.cat-hero-title'), [{ transform: 'translateY(0)' }, { transform: 'translateY(105%)' }], 300, CUBIC_IN, 50)
    anim(el.querySelector('.cat-hero-line'), [{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], 250, 'cubic-bezier(0.65, 0, 0.35, 1)', 100)
  }

  /** 板と映像の横の位置（板の幅に対する割合、-1〜1） */
  const place = (el: HTMLElement, out: number, inn: number) => {
    const [a, b] = [panes(el)[heroPane], panes(el)[1 - heroPane]]
    const video = el.querySelector<HTMLElement>('.cat-hero-video')
    if (a) a.style.transform = `translateX(${out * 100}%)`
    if (video) video.style.transform = `translateX(${out * 100}%)`
    if (b) b.style.transform = `translateX(${inn * 100}%)`
  }

  /**
   * i 本目へ替える。dir=1 は次の 1 本が右から入る（左へ送る）、-1 は左から。
   * from は指で動かした分（0〜1）。そこから残りを同じ速さの割合で押し出す
   */
  const goSlide = async (i: number, dir: 1 | -1, from = 0) => {
    const el = heroEl()
    if (!el || !heroSlides[i]) return
    if (i === heroIndex && from === 0) return
    window.clearTimeout(heroTimer)
    heroTimer = 0
    heroBusy = true
    const incoming = panes(el)[1 - heroPane]
    if (!incoming) return
    incoming.style.setProperty('--seam', dir > 0 ? '0%' : '100%')
    await fillPane(incoming, i)
    if (!heroEl() || heroEl() !== el) return
    const video = el.querySelector<HTMLVideoElement>('.cat-hero-video')
    if (reduceMotion()) {
      place(el, -dir, 0)
    } else {
      hideText(el)
      incoming.classList.add('is-incoming')
      const ms = Math.max(240, PUSH_MS * (1 - from))
      const outgoing = panes(el)[heroPane]
      const frames = (a: number, b: number) => [{ transform: `translateX(${a * 100}%)` }, { transform: `translateX(${b * 100}%)` }]
      const runs = [
        outgoing?.animate(frames(-dir * from, -dir), { duration: ms, easing: PUSH_EASE, fill: 'forwards' }),
        video?.animate(frames(-dir * from, -dir), { duration: ms, easing: PUSH_EASE, fill: 'forwards' }),
        incoming.animate(frames(dir * (1 - from), 0), { duration: ms, easing: PUSH_EASE, fill: 'forwards' }),
      ]
      await Promise.all(runs.map((r) => r?.finished.catch(() => undefined)))
      if (heroEl() !== el) return
      place(el, -dir, 0)
      runs.forEach((r) => r?.cancel())
      incoming.classList.remove('is-incoming')
    }
    // 表に出た板を入れ替え、映像は新しい板の位置へ戻して読み直す（表紙が見えている間に替える）
    heroPane = 1 - heroPane
    heroIndex = i
    // 押し出しの間は前の 1 本が出ていく板と一緒に動き、終わった瞬間に要素ごと捨てる（新しい 1 本は syncHero が待ちのあとに作る）
    dropHeroVideo()
    const old = panes(el)[1 - heroPane]
    if (old) old.style.transform = 'translateX(100%)'
    fillSlideText(el, i)
    revealText(el)
    heroBusy = false
    syncHero()
  }

  const nextIndex = (d: 1 | -1) => (heroIndex + d + heroSlides.length) % heroSlides.length

  /** 動きをへらす時は、再生ボタンを押した時だけ流す */
  const heroRunning = () => !heroPaused && (!reduceMotion() || heroPlayed)

  const syncPauseBtn = (el: HTMLElement) => {
    const btn = el.querySelector<HTMLElement>('.cat-hero-ctl')
    if (!btn) return
    const running = heroRunning()
    btn.setAttribute('aria-label', t(running ? 'heroPause' : 'heroPlay'))
    btn.setAttribute('title', t(running ? 'heroPause' : 'heroPlay'))
    btn.setAttribute('aria-pressed', String(!running))
    const use = btn.querySelector('use')
    use?.setAttribute('href', running ? '#i-pause' : '#i-play')
  }

  /**
   * 音なしのプレビューと切り替えを、見えている間だけ動かす。一覧を閉じた・ワールドの一覧へ移った・モニターや帳を開いた・
   * 枠が画面の外・タブが裏・止めるボタン、のどれかなら止めて映像を手放す（スマホのメモリ。モニターの映像と同時に 2 本読まない）。
   * 動きをへらす設定では、再生ボタンを押すまで流さず・切り替えない
   */
  const heroActive = () => {
    const body = document.body
    return (
      !!heroEl() &&
      open &&
      page === null &&
      heroVisible &&
      !document.hidden &&
      !body.classList.contains('observe-open') &&
      !body.classList.contains('book-open')
    )
  }

  /**
   * 新着の枠で音なしのプレビュー映像を流すか（11/8 くに: スコープの一覧を開いて 0.7 秒で iPhone がページを落とした件の第 2 弾）。
   * 一覧を開いている間は <video> を 1 本も作らず、表紙の絵だけで切り替える。映像を読むのは「観察する」でモニターを開いた時だけ
   */
  const HERO_PREVIEW_VIDEO = false
  let heroVideoTimer = 0
  /** のぞく演出の間は映像を作らない（演出が終わる時刻。performance.now()） */
  let heroNotBefore = 0
  /** 枠の映像を要素ごと手放す（止める → src を外す → 読み込みを捨てる → DOM から外す） */
  const dropHeroVideo = () => {
    window.clearTimeout(heroVideoTimer)
    heroVideoTimer = 0
    root.querySelectorAll<HTMLVideoElement>('.cat-hero-video').forEach((v) => {
      try {
        v.pause()
        v.removeAttribute('src')
        v.load()
      } catch {
        // 外す処理は続ける
      }
      v.remove()
    })
    heroEl()?.classList.remove('is-playing')
  }

  /** 今の 1 本の <video> を作って音なしで流す（待ちのあと。まだ見えていて、流す状態で、押し出しの途中でない時だけ） */
  const startHeroVideo = () => {
    heroVideoTimer = 0
    const el = heroEl()
    const sl = heroSlides[heroIndex]
    if (!HERO_PREVIEW_VIDEO || !el || !sl || !heroActive() || !heroRunning() || heroBusy) return
    const v = document.createElement('video')
    v.className = 'cat-hero-video'
    v.classList.toggle('is-portrait', sl.video.portrait)
    v.muted = true
    v.defaultMuted = true
    v.playsInline = true
    v.setAttribute('muted', '')
    v.setAttribute('playsinline', '')
    v.preload = 'auto'
    v.setAttribute('aria-hidden', 'true')
    v.tabIndex = -1
    v.dataset.src = sl.video.url
    v.addEventListener('playing', () => {
      if (v.isConnected) el.classList.add('is-playing')
    })
    v.addEventListener('error', () => el.classList.remove('is-playing'))
    v.src = sl.video.url
    // 板（2 枚）の上、影の下に置く
    const lastPane = [...panes(el)].pop()
    if (lastPane) lastPane.after(v)
    else el.prepend(v)
    void v.play().catch(() => undefined)
  }

  /**
   * 映像の寿命（fix/scope-memory の決まり）: 一覧を開いた瞬間は表紙だけ。のぞく演出が終わり、表紙を見せて落ち着いてから（1.5 秒）
   * <video> を 1 本だけ作る。切り替え・閉じる・モニターや帳を開く・枠が画面の外・タブが裏の時は、前の要素を捨てる。
   * 停止ボタンで止めた時は、その 1 本を止めて今の絵を残す（増やさない）。動きをへらす設定では、再生ボタンを押すまで作らない
   */
  const syncHero = () => {
    const el = heroEl()
    if (el) syncPauseBtn(el)
    if (heroBusy) return
    const active = heroActive()
    const running = active && heroRunning()
    const sl = heroSlides[heroIndex]
    if (el) {
      const v = el.querySelector<HTMLVideoElement>('.cat-hero-video')
      if (HERO_PREVIEW_VIDEO && running && sl) {
        if (v && v.dataset.src === sl.video.url) {
          if (v.paused) void v.play().catch(() => undefined)
        } else {
          if (v) dropHeroVideo()
          if (!heroVideoTimer) {
            const wait = Math.max(HERO_VIDEO_WAIT, heroNotBefore - performance.now() + HERO_VIDEO_WAIT)
            heroVideoTimer = window.setTimeout(startHeroVideo, wait)
          }
        }
      } else if (active && heroPaused && v) {
        v.pause()
        window.clearTimeout(heroVideoTimer)
        heroVideoTimer = 0
      } else {
        dropHeroVideo()
      }
    }
    if (running && heroSlides.length > 1) {
      if (!heroTimer)
        heroTimer = window.setTimeout(() => {
          heroTimer = 0
          void goSlide(nextIndex(1), 1)
        }, HERO_MS)
    } else if (heroTimer) {
      window.clearTimeout(heroTimer)
      heroTimer = 0
    }
  }

  /** 指で横に送る。縦に動かした時はスクロールに任せる。動かした分だけ板がついてくる */
  const bindSwipe = (el: HTMLElement) => {
    let id = -1
    let x0 = 0
    let y0 = 0
    let t0 = 0
    let dir: 1 | -1 = 1
    let mode: 'idle' | 'wait' | 'drag' | 'off' = 'idle'
    let target = 0
    let ready = false
    let swallowClick = false
    const width = () => el.getBoundingClientRect().width || 1
    el.addEventListener('pointerdown', (e) => {
      if (heroBusy || heroSlides.length < 2 || (e.pointerType === 'mouse' && e.button !== 0)) return
      if ((e.target as HTMLElement).closest('.cat-hero-dots, .cat-hero-ctl')) return
      id = e.pointerId
      x0 = e.clientX
      y0 = e.clientY
      t0 = performance.now()
      mode = 'wait'
    })
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id || mode === 'idle' || mode === 'off') return
      const dx = e.clientX - x0
      const dy = e.clientY - y0
      if (mode === 'wait') {
        if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
          mode = 'off'
          return
        }
        if (Math.abs(dx) < 10) return
        mode = 'drag'
        dir = dx < 0 ? 1 : -1
        target = nextIndex(dir)
        ready = false
        heroBusy = true
        window.clearTimeout(heroTimer)
        heroTimer = 0
        const inc = panes(el)[1 - heroPane]
        if (inc) {
          inc.style.setProperty('--seam', dir > 0 ? '0%' : '100%')
          inc.classList.add('is-incoming')
          void fillPane(inc, target).then(() => (ready = true))
        }
        try {
          el.setPointerCapture(id)
        } catch {
          // 取れなくても動かせる
        }
      }
      if (mode !== 'drag' || reduceMotion()) return
      // 向きと逆へ戻した分は 0 で止める（反対側の 1 本は出さない）
      const p = Math.min(1, Math.max(0, (-dir * dx) / width()))
      place(el, -dir * p, dir * (1 - p))
    })
    const end = (e: PointerEvent) => {
      if (e.pointerId !== id) return
      id = -1
      const was = mode
      mode = 'idle'
      if (was !== 'drag') return
      swallowClick = true
      window.setTimeout(() => (swallowClick = false), 0)
      const dx = e.clientX - x0
      const p = Math.min(1, Math.max(0, (-dir * dx) / width()))
      const v = Math.abs(dx) / Math.max(1, performance.now() - t0)
      const go = e.type !== 'pointercancel' && (p > 0.2 || (v > 0.45 && p > 0.04))
      heroBusy = false
      if (go) {
        void goSlide(target, dir, reduceMotion() ? 0 : p)
        return
      }
      // 戻す
      const inc = panes(el)[1 - heroPane]
      if (reduceMotion() || p === 0) {
        place(el, 0, dir)
        inc?.classList.remove('is-incoming')
        syncHero()
        return
      }
      heroBusy = true
      const ms = Math.max(200, 500 * p)
      const outgoing = panes(el)[heroPane]
      const video = el.querySelector<HTMLElement>('.cat-hero-video')
      const fr = (a: number, b: number) => [{ transform: `translateX(${a * 100}%)` }, { transform: `translateX(${b * 100}%)` }]
      const runs = [
        outgoing?.animate(fr(-dir * p, 0), { duration: ms, easing: QUINT_OUT, fill: 'forwards' }),
        video?.animate(fr(-dir * p, 0), { duration: ms, easing: QUINT_OUT, fill: 'forwards' }),
        inc?.animate(fr(dir * (1 - p), dir), { duration: ms, easing: QUINT_OUT, fill: 'forwards' }),
      ]
      void Promise.all(runs.map((r) => r?.finished.catch(() => undefined))).then(() => {
        place(el, 0, dir)
        runs.forEach((r) => r?.cancel())
        inc?.classList.remove('is-incoming')
        heroBusy = false
        syncHero()
      })
      void ready
    }
    el.addEventListener('pointerup', end)
    el.addEventListener('pointercancel', end)
    // 指で送ったあとの click（観察するボタンの上で離した時など）は押したことにしない
    el.addEventListener(
      'click',
      (e) => {
        if (swallowClick) {
          e.stopPropagation()
          e.preventDefault()
        }
      },
      true,
    )
  }

  /** 描き直したあとに枠をつなぐ */
  const mountHero = () => {
    heroIo?.disconnect()
    heroIo = null
    heroBusy = false
    const el = heroEl()
    if (!el) {
      syncHero()
      return
    }
    heroVisible = true
    if ('IntersectionObserver' in window) {
      heroIo = new IntersectionObserver(
        (entries) => {
          heroVisible = entries.some((e) => e.isIntersecting)
          syncHero()
        },
        { threshold: 0.25 },
      )
      heroIo.observe(el)
    }
    heroPane = 0
    const [a, b] = [panes(el)[0], panes(el)[1]]
    if (a) a.style.transform = 'translateX(0)'
    if (b) b.style.transform = 'translateX(100%)'
    if (a) void fillPane(a, heroIndex)
    fillSlideText(el, heroIndex)
    revealText(el)
    bindSwipe(el)
    syncHero()
  }

  document.addEventListener('visibilitychange', syncHero)
  // モニター・帳を開いた／閉じた、動きをへらすを切り替えた時（body の class で分かる）
  new MutationObserver(() => {
    if (open) syncHero()
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] })

  const section = (key: string, title: string, body: string, extra = '') =>
    `<section class="cat-sec" data-sec="${key}"><h2 class="cat-h">${title}${extra}</h2>${body}</section>`

  /** いま開いているワールドの一覧。null ならアニマルスコープの段の一覧 */
  let page: WorldKey | 'favs' | null = null

  /** 一覧に出せる映像を 1 本ずつ（同じ映像は 1 回）。ライオンの家族 → 種の映像 → スタッフ撮影（新しい順） */
  interface VidItem {
    key: string
    animal: Animal
    poster: string
    title: string
    duration: string
    place: string
    /** スタッフが撮った映像（表紙に「スタッフ撮影」の札を付ける） */
    staff: boolean
  }
  const placeOf = (a: Animal) => {
    const w = a.world ? getWorld(a.world) : undefined
    return a.world === 'africa' ? t('catSavanna') : w ? worldName(w) : ''
  }
  const allVideoItems = (): VidItem[] => {
    const out: VidItem[] = []
    const main = getAnimal(FEATURED.animalId)
    if (main) out.push({ key: videoKeyOf(main), animal: main, poster: FEATURED.poster, title: t('catRecTitle'), duration: FEATURED.duration, place: t('catSavanna'), staff: false })
    for (const v of SPECIES_VIDEOS) {
      const first = animalsInVideo(v.id)[0]
      if (first) out.push({ key: v.id, animal: first, poster: v.poster, title: v.title[getLang()], duration: v.duration, place: placeOf(first), staff: false })
    }
    for (const v of STAFF_VIDEOS) {
      const named = v.animalIds.map((id) => getAnimal(id)).find((x): x is Animal => !!x && x.status === 'ready')
      const a = named ?? listReadyAnimals().find((x) => x.videoId === v.id)
      if (!a) continue
      out.push({ key: v.id, animal: a, poster: v.poster, title: named ? `${animalName(a)}（${speciesName(a.species)}）` : v.title[getLang()], duration: v.duration, place: placeOf(a), staff: true })
    }
    return out
  }

  /** お気に入りにした映像（❤️ を押した順の新しい方から）。一覧に無い映像の鍵は飛ばす */
  const favItems = (): VidItem[] => {
    const byKey = new Map(allVideoItems().map((it) => [it.key, it]))
    return reactions
      .favorites()
      .map((k) => byKey.get(k))
      .filter((x): x is VidItem => !!x)
  }

  /** 横長の映像カード（数は出さない。👍・❤️ の状態はモニターと新着の枠のボタンで見る） */
  const videoCardHtml = (it: VidItem) =>
    `<button type="button" class="cat-card" data-watch="${esc(it.animal.id)}"><span class="cat-thumb">${cardImg(it.poster)}${it.staff ? staffChip() : ''}<span class="cat-dur">${esc(it.duration)}</span></span><span class="cat-card-title">${esc(it.title)}</span><span class="cat-card-meta">${esc(t('recorded'))}${it.place ? ` ・ ${esc(it.place)}` : ''}</span></button>`

  /** お気に入り（❤️ を押した映像、新しい順）の一覧 */
  const renderFavsPage = () => {
    const meta = (k: I18nKey) => esc(t(k))
    const items = favItems()
    const cards = items
      .map(
        (it) =>
          `<div class="cat-fav-card"><button type="button" class="cat-card" data-watch="${esc(it.animal.id)}"><span class="cat-thumb"><img src="${esc(thumb(it.poster))}" alt="" loading="lazy" decoding="async" />${it.staff ? staffChip() : ''}<span class="cat-dur">${esc(it.duration)}</span></span><span class="cat-card-title">${esc(it.title)}</span><span class="cat-card-meta">${meta('recorded')}${it.place ? ` ・ ${esc(it.place)}` : ''}</span></button>${reactButtonsMarkup(it.key)}</div>`,
      )
      .join('')
    root.innerHTML = `
      <div class="cat-scroll" tabindex="-1">
        <div class="cat-glow" aria-hidden="true"></div>
        <header class="cat-top">
          <button type="button" class="cat-icon-btn" data-list="1" aria-label="${meta('catBackList')}" title="${meta('catBackList')}"><svg class="ico" aria-hidden="true"><use href="#i-back" /></svg></button>
          <h1 class="cat-logo"><svg class="ico cat-logo-heart" aria-hidden="true"><use href="#i-heart" /></svg><span>${meta('catFavs')}</span></h1>
          <div class="cat-top-right"><button type="button" class="cat-top-book" data-book="1"><svg class="ico" aria-hidden="true"><use href="#i-book" /></svg><span>${meta('book')}</span></button></div>
        </header>
        <section class="cat-sec">
          <p class="cat-fav-lead">${items.length ? meta('catFavsLead') : meta('catFavsEmpty')}</p>
          ${items.length ? `<div class="cat-fav-grid">${cards}</div>` : ''}
          <p class="cat-fav-note">${meta('reactLocal')}</p>
        </section>
      </div>`
  }

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
                return `<button type="button" class="cat-face cat-face-l" data-watch="${esc(a.id)}" aria-label="${esc(t('lookAt', { name: animalName(a) }))}${has ? esc(`（${t('inBook')}）`) : ''}">${faceMarkup(a, 'cat-face-img', true)}<span>${esc(animalName(a))}</span>${has ? `<span class="cat-face-check" aria-hidden="true">${CHECK}</span>` : ''}</button>`
              })
              .join('')
            const film = videoForSpecies(sp) || inSub.some((a) => a.species === sp && a.video.staff)
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
          <div class="cat-top-right"><button type="button" class="cat-icon-btn cat-top-fav" data-favs="1" aria-label="${meta('catFavs')}" title="${meta('catFavs')}"><svg class="ico" aria-hidden="true"><use href="#i-heart" /></svg></button><button type="button" class="cat-top-book" data-book="1"><svg class="ico" aria-hidden="true"><use href="#i-book" /></svg><span>${meta('book')}</span></button></div>
        </header>
        <div class="wp-banner" style="--w1:${w.colors[0]};--w2:${w.colors[1]}"><img class="cat-world-art" src="${worldImage(w.key)}" alt="" decoding="async" style="object-fit:cover" /><span class="cat-world-shade" aria-hidden="true"></span>${only}<p class="wp-lead">${meta('catWorldLead')}</p></div>
        ${body}
      </div>`
  }

  /**
   * 開いた瞬間に全部の段を組み上げない（11/8 iPhone で一覧を開いて 0.7〜1.2 秒でページごと読み直された）。
   * 開いた時は見出しと最初の段（ライブ）だけ作り、ほかの段は同じ高さの空の枠（.cat-lazy）にしておく。
   * 枠が画面に入った時（IntersectionObserver）に、その段だけ組み上げる。一度に組むのは 1 回の知らせで入った枠だけ。
   * のぞく演出の途中で足した段の「下から並ぶ」動きは、開いた時から数えた元の時刻に合わせる
   */
  const lazyHtml = new Map<string, string>()
  let lazyIo: IntersectionObserver | null = null
  let openedAt = 0
  /** 空の枠の高さ（px、375px 幅で測った段の高さ。段が組み上がった時にずれが小さいように） */
  const LAZY_H: Record<string, number> = { hero: 440, friends: 141, worlds: 175, animals: 168, recs: 215, staff: 214, zoos: 139 }
  const stopLazy = () => {
    lazyIo?.disconnect()
    lazyIo = null
    lazyHtml.clear()
  }
  const lazySlot = (key: string, html: string) => {
    if (!html) return ''
    lazyHtml.set(key, html)
    return `<div class="cat-lazy" data-lazy="${key}" style="min-height:${LAZY_H[key] ?? 160}px" aria-hidden="true"></div>`
  }
  const fillLazy = (slot: HTMLElement) => {
    const key = slot.dataset.lazy ?? ''
    const html = lazyHtml.get(key)
    lazyIo?.unobserve(slot)
    lazyHtml.delete(key)
    if (html === undefined || !slot.isConnected) return
    const tpl = document.createElement('template')
    tpl.innerHTML = html
    const added = Array.from(tpl.content.children) as HTMLElement[]
    slot.replaceWith(tpl.content)
    if (root.classList.contains('is-scope-in')) {
      const since = (performance.now() - openedAt) / 1000
      for (const el of added) {
        const d = parseFloat(getComputedStyle(el).animationDelay) || 0
        el.style.animationDelay = `${(d - since).toFixed(2)}s`
      }
    }
    if (key === 'hero') mountHero()
  }
  /** 残りの空の枠を全部組む（ジャンプ・👍❤️ の直し・閉じる前など、段がそろっている必要がある時） */
  const fillAllLazy = () => {
    root.querySelectorAll<HTMLElement>('.cat-lazy').forEach(fillLazy)
    stopLazy()
  }
  const watchLazy = () => {
    const sc = scrollEl()
    const slots = root.querySelectorAll<HTMLElement>('.cat-lazy')
    if (!sc || !slots.length) return
    if (!('IntersectionObserver' in window)) {
      fillAllLazy()
      return
    }
    lazyIo = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) fillLazy(e.target as HTMLElement)
      },
      { root: sc, rootMargin: '0px 0px 120px 0px' },
    )
    slots.forEach((el) => lazyIo!.observe(el))
  }

  const render = (staged = false) => {
    stopLazy()
    // 描き直す前に、今の枠の映像を要素ごと手放す（外れた <video> が読み続けないように）
    dropHeroVideo()
    window.clearTimeout(heroTimer)
    heroTimer = 0
    heroIo?.disconnect()
    heroIo = null
    if (page === 'favs') {
      renderFavsPage()
      return
    }
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
      `<div class="cat-row">${LIVE_SPECIES.map(
        (sp) =>
          `<div class="cat-live" role="img" aria-label="${esc(`${sp[getLang()]}（${sp.away[getLang()]}）`)}"><div class="cat-live-ring"><div class="cat-sil cat-sil-round">${PAW}</div><span class="cat-live-sign${getLang() === 'ja' ? ' is-art' : ''}" style="--sign:url(/ui/label-${sp.sign}.webp)" aria-hidden="true"><span>${esc(sp.away[getLang()])}</span></span></div><span class="cat-live-name">${esc(sp[getLang()])}</span></div>`,
      ).join('')}</div>`,
    )

    // いちばん上: 新着の映像（アプリに足した新しい順）を最大 5 本、時間で切り替える。今の 1 本は音なしで流す（下の mountHero）
    heroSlides = newestSlides()
    if (heroIndex >= heroSlides.length) heroIndex = 0
    const hero = heroSlides.length
      ? `<section class="cat-sec cat-hero-sec" data-sec="hero">
          <div class="cat-hero" aria-roledescription="carousel" aria-label="${meta('catNew')}">
            <div class="cat-hero-pane"><img class="cat-hero-img" alt="" decoding="async" /></div>
            <div class="cat-hero-pane"><img class="cat-hero-img" alt="" decoding="async" /></div>
            <!-- 映像の <video> は表紙を見せて落ち着いてから 1 本だけ作る（startHeroVideo） -->
            <div class="cat-hero-shade" aria-hidden="true"></div>
            <!-- 再生・停止は映像の真ん中（くにの指示） -->
              ${heroSlides.length ? `<button type="button" class="cat-hero-ctl" data-hero-ctl="1" aria-pressed="false" aria-label="${meta('heroPause')}"><svg class="ico ico-fill" aria-hidden="true"><use href="#i-pause" /></svg></button>` : ''}
            <div class="cat-hero-corner">
              <span class="cat-badge"><svg class="ico" aria-hidden="true"><use href="#i-film" /></svg>${meta('recorded')}</span>
              ${staffChip(' cat-hero-staff', true)}
            </div>
            ${
              heroSlides.length > 1
                ? `<div class="cat-hero-dots">${heroSlides
                    .map((sl, i) => `<button type="button" class="cat-hero-dot" data-slide="${i}" aria-label="${esc(t('catSlide', { n: String(i + 1), title: sl.title }))}"></button>`)
                    .join('')}</div>`
                : ''
            }
            <div class="cat-hero-text" aria-live="off">
              <span class="cat-hero-clip"><span class="cat-hero-meta"></span></span>
              <span class="cat-hero-line" aria-hidden="true"></span>
              <span class="cat-hero-clip"><span class="cat-hero-title"></span></span>
              <div class="cat-hero-actions">
                <button type="button" class="cat-watch" data-watch="">${PLAY}${meta('catWatch')}</button>
                <span class="cat-hero-rx"></span>
                <span class="cat-inbook" role="img" aria-label="${meta('inBook')}" title="${meta('inBook')}" hidden>${CHECK}</span>
              </div>
            </div>
          </div>
        </section>`
      : main
        ? `<section class="cat-sec cat-hero-sec" data-sec="hero">
          <div class="cat-hero">
            <img class="cat-hero-img" src="${esc(FEATURED.poster)}" alt="" decoding="async" />
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
            `<button type="button" class="cat-face" data-watch="${esc(a.id)}" aria-label="${esc(t('lookAt', { name: animalName(a) }))}">${faceMarkup(a, 'cat-face-img', true)}<span>${esc(animalName(a))}</span></button>`,
        )
        .join('')}<button type="button" class="cat-face cat-face-add" data-back="1"><span class="cat-face-plus" aria-hidden="true">+</span><span>${meta('catMeet')}</span></button></div>`,
      `<button type="button" class="cat-h-link" data-book="1">${meta('book')} ›</button>`,
    )

    const worldCard = (w: WorldInfo) => {
      const style = `--w1:${w.colors[0]};--w2:${w.colors[1]}`
      const art = `<img src="${worldImage(w.key)}" alt="" loading="lazy" decoding="async" />`
      if (!w.open)
        return `<div class="cat-world cat-world-soon" style="${style}">${art}<span class="cat-world-shade" aria-hidden="true"></span><span class="cat-world-name">${esc(worldName(w))}</span><span class="cat-world-tag">${meta('catWorldSoon')}</span></div>`
      return `<button type="button" class="cat-world cat-world-open" style="${style}" data-world="${w.key}" aria-label="${esc(t('catWorldEnter', { world: worldName(w) }))}">${art}<span class="cat-world-shade" aria-hidden="true"></span><span class="cat-world-name">${esc(worldName(w))}</span></button>`
    }
    const worlds = section(
      'worlds',
      meta('catRowWorlds'),
      `<div class="cat-row"><button type="button" class="cat-world" data-world="africa" aria-label="${esc(t('catWorldEnter', { world: t('catSavanna') }))}"><img src="${worldImage('africa')}" alt="" decoding="async" /><span class="cat-world-shade" aria-hidden="true"></span><span class="cat-world-name">${meta('catSavanna')}</span></button>${WORLDS.filter((w) => w.key !== 'africa')
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
        const icon = SPECIES_ICON[sub.species[0]]
        const face = icon ? `<img class="cat-face-img" src="/species/${icon}.webp" alt="" loading="lazy" decoding="async" />` : faceMarkup(first, 'cat-face-img', true)
        return [`<button type="button" class="cat-face cat-face-l" data-watch="${esc(first.id)}">${face}<span>${esc(label)}</span></button>`]
      })
    })
    // 段が寂しくならないよう、5 つに満たない分は形だけのシルエット
    const animalSils = Math.max(0, 4 - videoSpecies.length)
    const animals = section(
      'animals',
      meta('catRowAnimals'),
      `<div class="cat-row cat-row-faces">${
        lion
          ? `<button type="button" class="cat-face cat-face-l" data-watch="${esc(FEATURED.animalId)}"><img class="cat-face-img" src="/species/lion.webp" alt="" loading="lazy" decoding="async" /><span>${esc(speciesName(lion.species))}</span></button>`
          : ''
      }${videoSpecies.join('')}${times(animalSils, () => `<div class="cat-face cat-face-l" aria-hidden="true"><div class="cat-sil cat-sil-round">${PAW}</div><span class="cat-bar-sil" style="width:48px"></span></div>`)}</div>`,
    )

    // お気に入り: この端末で ❤️ を押した映像だけ（新しい順）。0 本の時は段ごと隠す（❤️ が押されたら出す）。数は出さない
    const favList = favItems()
    const favRow = `<section class="cat-sec" data-sec="favs"${favList.length ? '' : ' hidden'}><h2 class="cat-h">${meta('catFavs')}<button type="button" class="cat-h-link" data-favs="1">${meta('catSeeAll')} ›</button></h2><div class="cat-row">${favList.map(videoCardHtml).join('')}</div></section>`

    // 種の映像のカード（3 枚に満たない分は形だけのシルエット）
    const recCards = SPECIES_VIDEOS.flatMap((v) => {
      const first = animalsInVideo(v.id)[0]
      if (!first) return []
      const w = first.world ? getWorld(first.world) : undefined
      const place = first.world === 'africa' ? t('catSavanna') : w ? worldName(w) : ''
      return [
        `<button type="button" class="cat-card" data-watch="${esc(first.id)}"><span class="cat-thumb">${cardImg(v.poster)}<span class="cat-dur">${esc(v.duration)}</span></span><span class="cat-card-title">${esc(v.title[getLang()])}</span><span class="cat-card-meta">${meta('recorded')}${place ? ` ・ ${esc(place)}` : ''}</span></button>`,
      ]
    })
    const recs = section(
      'recs',
      meta('catRowRecs'),
      `<div class="cat-row">${
        main
          ? `<button type="button" class="cat-card" data-watch="${esc(main.id)}"><span class="cat-thumb">${cardImg(FEATURED.poster)}<span class="cat-dur">${FEATURED.duration}</span></span><span class="cat-card-title">${meta('catRecTitle')}</span><span class="cat-card-meta">${meta('recorded')} ・ ${meta('catSavanna')}</span></button>`
          : ''
      }${recCards.join('')}${times(
        Math.max(0, 3 - recCards.length),
        () =>
          `<div class="cat-card" aria-hidden="true"><span class="cat-thumb cat-sil">${PLAY}</span><span class="cat-bar-sil" style="width:72%;height:12px"></span><span class="cat-bar-sil" style="width:46%"></span></div>`,
      )}</div>`,
    )

    // スタッフ撮影（新しい順）。縦長の映像も同じ形のカード（表紙は 16:9 に切り抜いてある）。順位や人気の飾りは付けない
    const staffCards = STAFF_VIDEOS.flatMap((v) => {
      const named = v.animalIds.map((id) => getAnimal(id)).find((x): x is Animal => !!x && x.status === 'ready')
      // 個体が決まっていない映像（複数の子が映っている等）は、その映像を出しているその種の子のモニターを開き、カードは種名だけ（個体名はあとで animalIds に足す）
      const a = named ?? listReadyAnimals().find((x) => x.videoId === v.id)
      if (!a) return []
      const w = a.world ? getWorld(a.world) : undefined
      const place = a.world === 'africa' ? t('catSavanna') : w ? worldName(w) : ''
      const title = named ? `${animalName(a)}（${speciesName(a.species)}）` : v.title[getLang()]
      return [
        `<button type="button" class="cat-card" data-watch="${esc(a.id)}"><span class="cat-thumb">${cardImg(v.poster)}${staffChip()}<span class="cat-dur">${esc(v.duration)}</span></span><span class="cat-card-title">${esc(title)}</span><span class="cat-card-meta">${meta('recorded')}${place ? ` ・ ${esc(place)}` : ''}</span></button>`,
      ]
    })
    const staff = staffCards.length ? section('staff', meta('catRowStaff'), `<div class="cat-row">${staffCards.join('')}</div>`) : ''

    const zoos = section(
      'zoos',
      meta('catRowZoos'),
      `<div class="cat-row">${ZOO_ART.map(
        (z) =>
          `<div class="cat-zoo" role="img" aria-label="${meta('catZooWanted')}"><span class="cat-zoo-art"><img src="/zoos/${z}.webp" alt="" loading="lazy" decoding="async" /><span class="cat-world-tag">${meta('catZooWanted')}</span></span></div>`,
      ).join('')}</div>`,
    )

    root.innerHTML = `
      <div class="cat-scroll" tabindex="-1">
        <div class="cat-glow" aria-hidden="true"></div>
        <header class="cat-top">
          <button type="button" class="cat-icon-btn" data-back="1" aria-label="${meta('backWorld')}" title="${meta('backWorld')}"><svg class="ico" aria-hidden="true"><use href="#i-back" /></svg></button>
          <h1 class="cat-logo">${LOGO}<span>${meta('scope')}</span></h1>
          <div class="cat-top-right"><button type="button" class="cat-icon-btn cat-top-fav" data-favs="1" aria-label="${meta('catFavs')}" title="${meta('catFavs')}"><svg class="ico" aria-hidden="true"><use href="#i-heart" /></svg></button><button type="button" class="cat-top-book" data-book="1"><svg class="ico" aria-hidden="true"><use href="#i-book" /></svg><span>${meta('book')}</span></button></div>
        </header>
        <nav class="cat-chips cat-row" aria-label="${meta('catCategories')}">
          ${chip('all', 'catAll', true)}${chip('live', 'catLive', false, true)}${chip('worlds', 'catWorlds')}${chip('animals', 'catAnimals')}${chip('zoos', 'catZoos')}
        </nav>
        ${live}${
          staged
            ? `${lazySlot('hero', hero)}${lazySlot('friends', friendsRow)}${lazySlot('worlds', worlds)}${lazySlot('animals', animals)}${favRow}${lazySlot('recs', recs)}${lazySlot('staff', staff)}${lazySlot('zoos', zoos)}`
            : `${hero}${friendsRow}${worlds}${animals}${favRow}${recs}${staff}${zoos}`
        }
      </div>`
    mountHero()
    if (staged) watchLazy()
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
    if (handleReactClick(target)) return
    if (target.dataset.slide) {
      const i = Number(target.dataset.slide)
      if (!heroBusy && i !== heroIndex) void goSlide(i, i > heroIndex ? 1 : -1)
      return
    }
    if (target.dataset.heroCtl) {
      if (heroRunning()) heroPaused = true
      else {
        heroPaused = false
        if (reduceMotion()) heroPlayed = true
      }
      syncHero()
      return
    }
    const worldKey = target.dataset.world as WorldKey | undefined
    if (worldKey && getWorld(worldKey)?.open) {
      goPage(worldKey)
      return
    }
    if (target.dataset.favs) {
      goPage('favs')
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
      fillAllLazy()
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
  const goPage = (next: WorldKey | 'favs' | null) => {
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
    if (from === 'favs') {
      const favBtn = root.querySelector<HTMLElement>('[data-favs]')
      scrollEl()?.scrollTo({ top: 0 })
      ;(favBtn ?? scroller)?.focus({ preventScroll: true })
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
  // 👍・❤️ が押された（ここでもモニターでもトークでも）: ボタンの状態と、おすすめの並び・お気に入りの一覧を直す（新着の枠は作り直さない）
  reactions.onChange(() => {
    if (!open) return
    fillAllLazy()
    if (page === 'favs') {
      const top = scrollEl()?.scrollTop ?? 0
      const focusedKey = (document.activeElement as HTMLElement | null)?.dataset?.reactKey
      render()
      const s2 = scrollEl()
      if (s2) s2.scrollTop = top
      if (focusedKey) (root.querySelector<HTMLElement>(`[data-react-key="${focusedKey}"]`) ?? s2)?.focus({ preventScroll: true })
      return
    }
    syncReactButtons(root)
    const sec = root.querySelector<HTMLElement>('[data-sec="favs"]')
    const row = sec?.querySelector<HTMLElement>('.cat-row')
    if (sec && row) {
      const list = favItems()
      row.innerHTML = list.map(videoCardHtml).join('')
      sec.hidden = list.length === 0
    }
  })

  const setOpen = (next: boolean, withScope = false, startPage: WorldKey | null = null) => {
    if (next === open) return
    open = next
    if (next) {
      page = startPage
      // 開くたびに、いちばん新しい 1 本から、流れる状態で見せる
      heroIndex = 0
      heroPaused = false
      heroPlayed = false
      heroNotBefore = withScope ? performance.now() + SCOPE_MS : 0
      openedAt = performance.now()
      render(!page)
      root.classList.remove('is-leave')
      root.classList.toggle('is-scope-in', withScope)
      if (withScope) {
        // 演出の側で出し入れする（transition のフェードは使わない）
        root.hidden = false
        root.classList.remove('is-out')
      } else showView(root)
      scrollEl()?.focus({ preventScroll: true })
    } else {
      stopLazy()
      root.classList.remove('is-scope-in')
      root.classList.add('is-leave')
      hideView(root, () => root.classList.remove('is-leave'))
    }
    syncHero()
    openListeners.forEach((fn) => fn(next))
  }

  return {
    open: (withScope) => setOpen(true, withScope),
    settle: () => {
      root.classList.remove('is-scope-in')
      heroNotBefore = 0
    },
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
