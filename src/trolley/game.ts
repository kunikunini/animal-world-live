/**
 * トロッコのモード（?trolley=<ルート>&from=<出発のワールド>）。スコープと同じく、3D のワールドを作らずに起動し直し、
 * 2D の横スクロールの坑道を走る。着いたら行き先のワールドを、着く駅の前から起動し直す（iPhone のメモリのため、3D と同時に持たない）。
 *
 * 遊び方: タップ（スペース・↑）でジャンプ（長押しで少し高く）、▼（↓）で下の道。上の道へはジャンプで乗りうつる。
 * いたずらする生き物（モグラ・ネズミ・コウモリ）は敵ではない。当たっても止まらず、戻されず、必ず向こうに着く。
 * 「おまかせで のる」は自動で走る（ゲームが苦手な子・動きをへらす設定）。「とばす」は出口の手前へ飛んで、出口から出る所は見せる。
 */
import './trolley.css'
import { sound } from '../audio/sound'
import { getHeroId, heroById } from '../data/heroes'
import { getLang } from '../ui/i18n'
import { dropSplash } from '../ui/splash'
import { saveHopShot } from '../scopeMode'
import { createTrolleyAudio } from './audio'
import { CART_W, buildCourse, railSlope, railY, sampleAt, themeAt, type Course, type CourseEvent, type ItemKind } from './course'
import { createRenderer, drawItemIcon, type Bat, type Clod, type FloatText, type Mole, type Mouse, type Particle, type ViewState } from './render'
import { arrivalSpot, routeFrom, type TrolleyStation } from './stations'

export interface TrolleyParams {
  route: string
  from: string
}

export function trolleyParams(): TrolleyParams | null {
  const q = new URLSearchParams(location.search)
  const route = q.get('trolley')
  const from = q.get('from')
  if (!route || !from) return null
  return routeFrom(route, from) ? { route, from } : null
}

/** ワールドから、トロッコのモードへ（駅で「トロッコにのる」を押した時） */
export function trolleyUrl(route: string, from: string, back: { x: number; z: number; heading: number }): string {
  const url = new URL(location.pathname, location.origin)
  url.searchParams.set('trolley', route)
  url.searchParams.set('from', from)
  url.searchParams.set('bx', back.x.toFixed(2))
  url.searchParams.set('bz', back.z.toFixed(2))
  url.searchParams.set('bh', back.heading.toFixed(3))
  return url.toString()
}

// ---- ことば ----
type Key =
  | 'title' | 'route' | 'play' | 'auto' | 'autoNote' | 'cancel' | 'howJump' | 'howDown' | 'best' | 'skip'
  | 'hintJump' | 'hintFork' | 'hintMouse' | 'hintDown' | 'down' | 'downOn' | 'arrive' | 'goWorld' | 'again'
  | 'moleHit' | 'moleMiss' | 'dodge' | 'mouseOn' | 'mouseShake' | 'mouseSteal' | 'mouseEmpty' | 'bats' | 'upPath' | 'downPath'
  | 'skipped' | 'mischief' | 'time' | 'got' | 'molesR' | 'miceR' | 'batsR' | 'rotate' | 'start' | 'newBest' | 'autoDone'
const WORLD: Record<string, { ja: string; en: string }> = {
  water: { ja: '水の世界', en: 'Water World' },
  sky: { ja: '空の世界', en: 'Sky World' },
}
const ITEM_NAME: Record<ItemKind, { ja: string; en: string }> = {
  shell: { ja: 'かいがら', en: 'shell' },
  gem: { ja: 'ひかる石', en: 'glow stone' },
  feather: { ja: 'はね', en: 'feather' },
}
const DICT: Record<Key, { ja: string; en: string }> = {
  title: { ja: 'トロッコで {to}へ', en: 'Mine cart to {to}' },
  route: { ja: '{from} → トンネル → {to}', en: '{from} → tunnel → {to}' },
  play: { ja: 'じぶんで うんてん', en: 'I’ll drive' },
  auto: { ja: 'おまかせで のる', en: 'Just ride' },
  autoNote: { ja: 'おまかせは、トロッコが じぶんで はしるよ', en: 'Just ride: the cart drives itself' },
  cancel: { ja: 'やめて {from}に もどる', en: 'Back to {from}' },
  howJump: { ja: 'タップで ジャンプ（ながおしで たかく）', en: 'Tap to jump (hold to go higher)' },
  howDown: { ja: '▼で したの みち・ジャンプで うえの みち', en: '▼ for the lower track · jump for the upper one' },
  best: { ja: 'ベスト {t}', en: 'Best {t}' },
  skip: { ja: 'とばす', en: 'Skip' },
  hintJump: { ja: 'タップで ジャンプ！', en: 'Tap to jump!' },
  hintFork: { ja: 'わかれみち！', en: 'A fork ahead!' },
  hintMouse: { ja: 'ネズミが のってきたら ジャンプで ふりおとそう', en: 'If a mouse hops in, jump to shake it off' },
  hintDown: { ja: '▼を おすと したの みちへ', en: 'Press ▼ for the lower track' },
  down: { ja: 'したの みち', en: 'Lower track' },
  downOn: { ja: 'したへ いくよ！', en: 'Going down!' },
  arrive: { ja: '{to}に とうちゃく！', en: 'Welcome to {to}!' },
  goWorld: { ja: '{to}へ', en: 'Into {to}' },
  again: { ja: 'もういちど のる', en: 'Ride again' },
  moleHit: { ja: 'モグラの いたずら！', en: 'Mole prank!' },
  moleMiss: { ja: 'あれれ？', en: 'Huh?' },
  dodge: { ja: 'ひらり！', en: 'Dodged!' },
  mouseOn: { ja: 'ネズミが のってきた！', en: 'A mouse hopped in!' },
  mouseShake: { ja: 'ころりん！ セーフ', en: 'Tumble! Safe' },
  mouseSteal: { ja: '{item}を もっていかれた！', en: 'It took a {item}!' },
  mouseEmpty: { ja: 'からっぽ… ざんねん', en: 'Empty… too bad' },
  bats: { ja: 'コウモリが ランプに びっくり！', en: 'Bats! The lamp flickers' },
  upPath: { ja: 'うえの みち！', en: 'Upper track!' },
  downPath: { ja: 'したの みち！', en: 'Lower track!' },
  skipped: { ja: 'とちゅうから ショートカットしたよ', en: 'You took a shortcut' },
  mischief: { ja: 'いたずら', en: 'Pranks' },
  time: { ja: 'タイム', en: 'Time' },
  got: { ja: 'あつめたもの', en: 'Collected' },
  molesR: { ja: 'モグラ', en: 'Moles' },
  miceR: { ja: 'ネズミ', en: 'Mice' },
  batsR: { ja: 'コウモリ', en: 'Bats' },
  rotate: { ja: 'よこむきに すると ひろく みえるよ', en: 'Turn sideways for a wider view' },
  start: { ja: 'しゅっぱつ！', en: 'Let’s go!' },
  newBest: { ja: 'ベスト きろく！', en: 'New best!' },
  autoDone: { ja: 'おまかせで のったよ', en: 'Rode on autopilot' },
}

// ---- 動き ----
const G = 1500
const JUMP_V = 600
const HOLD_T = 0.24
const CRUISE = 300
const V_MIN = 150
const V_MAX = 680
const SLOPE_G = 950

export function startTrolleyMode(p: TrolleyParams): void {
  const found = routeFrom(p.route, p.from)
  if (!found) return
  const lang = getLang()
  const fromKey = found.from.region
  const toKey = found.to.region
  const tr = (k: Key, vars: Record<string, string> = {}) => {
    let s = DICT[k][lang]
    const all: Record<string, string> = { from: WORLD[fromKey][lang], to: WORLD[toKey][lang], ...vars }
    for (const [n, v] of Object.entries(all)) s = s.split(`{${n}}`).join(v)
    return s
  }
  document.documentElement.lang = lang
  document.body.classList.add('trolley-mode')
  dropSplash(false)
  sound.setBgm(null)
  sound.setAmb(null)
  sound.setVoiceHero(getHeroId())

  const reduce = (() => {
    try {
      const m = localStorage.getItem('awl.reduceMotion')
      if (m === '1') return true
      if (m === '0') return false
    } catch {
      // 読めなくても続ける
    }
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  })()

  // 戻り先（やめる時）: 駅で押した時の位置
  const q = new URLSearchParams(location.search)
  const num = (k: string) => {
    const v = Number(q.get(k))
    return q.get(k) !== null && Number.isFinite(v) ? v : null
  }
  const bx = num('bx')
  const bz = num('bz')
  const bh = num('bh')
  const origin = bx !== null && bz !== null ? { x: bx, z: bz, heading: bh ?? found.from.out + Math.PI } : arrivalSpot(found.from)

  // ---- 画面 ----
  const root = document.createElement('div')
  root.className = 'trolley'
  const canvas = document.createElement('canvas')
  canvas.className = 'trolley-canvas'
  canvas.setAttribute('aria-label', tr('title'))
  root.append(canvas)
  root.insertAdjacentHTML(
    'beforeend',
    `<div class="tr-hud" hidden>
      <div class="tr-counts"></div>
      <div class="tr-progress" aria-hidden="true"><span class="tr-pl"></span><div class="tr-bar"><i class="tr-fill"></i><b class="tr-dot"></b></div><span class="tr-pr"></span></div>
      <button type="button" class="tr-skip"></button>
    </div>
    <p class="tr-hint" role="status" aria-live="polite"></p>
    <button type="button" class="tr-down" hidden></button>
    <div class="tr-card tr-title" role="dialog" aria-modal="true"></div>
    <div class="tr-card tr-result" role="dialog" aria-modal="true" hidden></div>
    <div class="tr-fade"></div>`,
  )
  document.body.append(root)
  const $ = <T extends HTMLElement>(sel: string) => root.querySelector(sel) as T
  const hud = $<HTMLDivElement>('.tr-hud')
  const countsEl = $<HTMLDivElement>('.tr-counts')
  const fill = $<HTMLElement>('.tr-fill')
  const dot = $<HTMLElement>('.tr-dot')
  const skipBtn = $<HTMLButtonElement>('.tr-skip')
  const hintEl = $<HTMLParagraphElement>('.tr-hint')
  const downBtn = $<HTMLButtonElement>('.tr-down')
  const titleCard = $<HTMLDivElement>('.tr-title')
  const resultCard = $<HTMLDivElement>('.tr-result')
  const fadeEl = $<HTMLDivElement>('.tr-fade')
  $<HTMLElement>('.tr-pl').textContent = WORLD[fromKey][lang]
  $<HTMLElement>('.tr-pr').textContent = WORLD[toKey][lang]
  skipBtn.innerHTML = `<span>${tr('skip')}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5l8 7-8 7zM12 5l8 7-8 7z" fill="currentColor"/></svg>`
  downBtn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16l-8 11z" fill="currentColor"/></svg><span>${tr('down')}</span>`

  // ---- 主人公の絵（顔の丸と、上着の色） ----
  const heroEntry = heroById(getHeroId())
  const heroLook = { img: null as HTMLImageElement | null, jacket: '#f2b632', jacketDark: '#c58d1b' }
  const img = new Image()
  img.decoding = 'async'
  img.onload = () => {
    heroLook.img = img
    try {
      const c = document.createElement('canvas')
      c.width = 24
      c.height = 24
      const cx = c.getContext('2d')
      if (cx) {
        cx.drawImage(img, 0, 0, 24, 24)
        const d = cx.getImageData(6, 22, 12, 2).data
        let r = 0
        let g = 0
        let b = 0
        const n = d.length / 4
        for (let i = 0; i < d.length; i += 4) {
          r += d[i]
          g += d[i + 1]
          b += d[i + 2]
        }
        heroLook.jacket = `rgb(${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)})`
      }
    } catch {
      // 色が取れなくても黄色の上着で続ける
    }
  }
  img.src = heroEntry.thumb

  const course: Course = buildCourse(found.from.region, found.to.region)
  const renderer = createRenderer(canvas, course, heroLook)
  const audio = createTrolleyAudio()
  const mainRails = course.rails.map((r, i) => (r.kind === 'main' ? i : -1)).filter((i) => i >= 0)

  // ---- 状態 ----
  type Phase = 'title' | 'ride' | 'ending' | 'result' | 'leaving'
  let phase: Phase = 'title'
  let t = 0
  let rideT = 0
  let autopilot = false
  let skipped = false
  const counts: Record<ItemKind, number> = { shell: 0, gem: 0, feather: 0 }
  const tally = { moleHit: 0, moleDodge: 0, mouseSteal: 0, mouseShake: 0, bats: 0 }
  const startRail = mainRails.find((i) => railY(course.rails[i], course.startX) !== null) ?? 0
  const cart = {
    x: course.startX,
    y: railY(course.rails[startRail], course.startX) ?? 0,
    v: 0,
    vy: 0,
    ri: startRail,
    angle: 0,
    wheel: 0,
    cheer: 0,
    dizzy: 0,
    squash: 0,
    coyote: 0,
    holding: false,
    holdT: 0,
    clackAcc: 0,
    lastJumpVoice: -10,
  }
  let forkChoice: 'down' | null = null
  let autoHold = 0
  const particles: Particle[] = []
  const moles: Mole[] = []
  const clods: Clod[] = []
  const mice: Mouse[] = []
  const bats: Bat[] = []
  const texts: FloatText[] = []
  let dirt = 0
  let dirtSeed = 1
  let speedLines = 0
  let flash = 0
  let shake = 0
  let lampFlicker = 0
  let camX = course.startX + 160
  let camY = cart.y + 60
  let zoom = 0.95
  const fired = new Set<CourseEvent>()
  const inSplash = new Set<CourseEvent>()
  const inVent = new Set<CourseEvent>()
  let hintTimer = 0
  let hintKey: string | null = null

  // ---- 小さな道具 ----
  const lowestRailAt = (x: number): { ri: number; y: number } | null => {
    let best: { ri: number; y: number } | null = null
    course.rails.forEach((r, ri) => {
      const y = railY(r, x)
      if (y !== null && (!best || y < best.y)) best = { ri, y }
    })
    return best
  }
  const mainYAt = (x: number): number | null => {
    for (const i of mainRails) {
      const y = railY(course.rails[i], x)
      if (y !== null) return y
    }
    return null
  }
  const ceilAt = (x: number) => sampleAt(course.ceil, x)
  const emit = (n: number, f: (i: number) => Partial<Particle> & Pick<Particle, 'x' | 'y'>) => {
    const lim = reduce ? Math.ceil(n / 2) : n
    for (let i = 0; i < lim; i++) {
      const p = f(i)
      particles.push({ vx: 0, vy: 0, life: 0.6, max: 0.6, size: 3, kind: 'dust', color: '#c9a77a', g: 0, rot: 0, ...p, ...(p.life !== undefined && p.max === undefined ? { max: p.life } : {}) })
    }
    if (particles.length > 500) particles.splice(0, particles.length - 500)
  }
  const say = (text: string, x: number, y: number, color = '#ffffff', big = false) => {
    texts.push({ x, y, text, t: 0, color, big })
  }
  const showHint = (key: string, text: string) => {
    if (hintKey === key) return
    hintKey = key
    hintEl.textContent = text
    hintEl.classList.add('is-on')
    window.clearTimeout(hintTimer)
    hintTimer = window.setTimeout(() => {
      hintEl.classList.remove('is-on')
      hintKey = null
    }, 2600)
  }
  const addShake = (k: number) => {
    if (!reduce) shake = Math.max(shake, k)
  }

  // ---- 数の表示 ----
  const itemKinds: ItemKind[] = Array.from(new Set(course.items.map((i) => i.kind)))
  const countEls = new Map<ItemKind, { root: HTMLElement; num: HTMLElement }>()
  for (const k of itemKinds) {
    const el = document.createElement('div')
    el.className = 'tr-count'
    const ic = document.createElement('canvas')
    ic.width = 48
    ic.height = 48
    const icx = ic.getContext('2d')
    if (icx) drawItemIcon(icx, k, 24, 24, 15, 0)
    const n = document.createElement('b')
    n.textContent = '0'
    el.append(ic, n)
    el.setAttribute('aria-label', ITEM_NAME[k][lang])
    countsEl.append(el)
    countEls.set(k, { root: el, num: n })
  }
  const paintCount = (k: ItemKind, pop: boolean) => {
    const c = countEls.get(k)
    if (!c) return
    c.num.textContent = String(counts[k])
    if (pop) {
      c.root.classList.remove('is-pop')
      void c.root.offsetWidth
      c.root.classList.add('is-pop')
    }
  }

  // ---- はじめの画面 ----
  const fmt = (sec: number) => {
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    const cs = Math.floor((sec * 10) % 10)
    return `${m}:${String(s).padStart(2, '0')}.${cs}`
  }
  const bestKey = `awl.trolley.best.${p.route}.${fromKey}`
  const readBest = (): number | null => {
    try {
      const v = Number(localStorage.getItem(bestKey))
      return v > 0 ? v : null
    } catch {
      return null
    }
  }
  const portrait = () => window.innerHeight > window.innerWidth * 1.1
  const paintTitle = () => {
    const best = readBest()
    titleCard.innerHTML = `
      <h1 class="tr-h">${tr('title')}</h1>
      <p class="tr-sub">${tr('route')}</p>
      <div class="tr-actions">
        <button type="button" class="tr-btn tr-primary" data-act="play">${tr('play')}</button>
        <button type="button" class="tr-btn" data-act="auto">${tr('auto')}</button>
      </div>
      <ul class="tr-how">
        <li>${tr('howJump')}</li>
        <li>${tr('howDown')}</li>
        <li class="tr-note">${tr('autoNote')}</li>
      </ul>
      ${best ? `<p class="tr-best">${tr('best', { t: fmt(best) })}</p>` : ''}
      ${portrait() ? `<p class="tr-rotate">${tr('rotate')}</p>` : ''}
      <button type="button" class="tr-link" data-act="cancel">${tr('cancel')}</button>`
    if (reduce) titleCard.querySelector('[data-act="auto"]')?.classList.add('tr-primary')
  }
  paintTitle()
  titleCard.addEventListener('click', (e) => {
    const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act
    if (!act) return
    if (act === 'cancel') {
      sound.play('tap')
      leave(origin, fromKey, false)
      return
    }
    sound.play('tap')
    depart(act === 'auto')
  })
  // はじめの画面のボタンへ（キーボード）
  window.setTimeout(() => titleCard.querySelector<HTMLButtonElement>(reduce ? '[data-act="auto"]' : '[data-act="play"]')?.focus(), 60)

  function depart(auto: boolean): void {
    if (phase !== 'title') return
    autopilot = auto
    phase = 'ride'
    titleCard.hidden = true
    hud.hidden = false
    audio.music(true)
    sound.say('start')
    say(tr('start'), cart.x + 30, cart.y + 120, '#ffe36b', true)
    canvas.focus()
  }

  // ---- 入力 ----
  const jumpPress = () => {
    if (phase !== 'ride' || autopilot) return
    tryJump()
    cart.holding = true
  }
  const jumpRelease = () => {
    cart.holding = false
  }
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    jumpPress()
  })
  window.addEventListener('pointerup', jumpRelease)
  window.addEventListener('pointercancel', jumpRelease)
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return
    if (phase === 'ride' && !autopilot && (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W')) {
      e.preventDefault()
      jumpPress()
    } else if (phase === 'ride' && !autopilot && (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S')) {
      e.preventDefault()
      chooseDown()
    }
  })
  window.addEventListener('keyup', (e) => {
    if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') jumpRelease()
  })
  const chooseDown = () => {
    if (!downCue) return
    forkChoice = 'down'
    downBtn.classList.add('is-on')
    downBtn.querySelector('span')!.textContent = tr('downOn')
    sound.play('tap')
  }
  downBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation()
    e.preventDefault()
    chooseDown()
  })
  skipBtn.addEventListener('click', () => doSkip())
  document.addEventListener('visibilitychange', () => {
    last = performance.now()
  })

  function tryJump(): void {
    const onRail = cart.ri >= 0
    if (!onRail && cart.coyote <= 0) return
    const slope = onRail ? railSlope(course.rails[cart.ri], cart.x) : 0
    cart.vy = JUMP_V + Math.max(0, slope) * cart.v * 0.6
    cart.ri = -1
    cart.coyote = 0
    cart.holdT = 0
    cart.squash = -0.6
    audio.jump()
    emit(6, () => ({ x: cart.x + (Math.random() - 0.5) * 40, y: cart.y + 2, vx: (Math.random() - 0.5) * 80, vy: 60 + Math.random() * 60, life: 0.4, size: 3 + Math.random() * 3, kind: 'dust', color: 'rgba(200,180,150,0.7)' }))
    if (t - cart.lastJumpVoice > 3.5 && Math.random() < 0.55) {
      sound.say('jump')
      cart.lastJumpVoice = t
    }
    // 乗っているネズミはふり落とされる
    for (const m of mice) {
      if (m.state !== 'ride') continue
      m.state = 'tumble'
      m.t = 0
      m.x = cart.x - 14
      m.y = cart.y + 46
      m.vx = -160
      m.vy = 340
      tally.mouseShake++
      audio.squeak()
      say(tr('mouseShake'), cart.x, cart.y + 140, '#9cf0ff')
    }
  }

  // ---- とばす ----
  function doSkip(): void {
    if (phase !== 'ride') return
    skipped = true
    autopilot = true
    flash = 1
    audio.whoosh()
    const x = course.exitX - 900
    const ri = mainRails.find((i) => railY(course.rails[i], x) !== null) ?? cart.ri
    cart.x = x
    cart.ri = ri
    cart.y = railY(course.rails[ri], x) ?? cart.y
    cart.vy = 0
    cart.v = 420
    moles.length = 0
    clods.length = 0
    mice.length = 0
    bats.length = 0
    dirt = 0
    for (const ev of course.events) if (('x' in ev ? ev.x : ev.x0) < x + 400) fired.add(ev)
    camX = cart.x + 120
    camY = cart.y + 60
    skipBtn.hidden = true
    hideDown()
  }

  // ---- 分かれ道の合図 ----
  let downCue: Extract<CourseEvent, { type: 'fork' }> | null = null
  const hideDown = () => {
    downCue = null
    downBtn.hidden = true
    downBtn.classList.remove('is-on')
    forkChoice = null
  }

  // ---- 1 コマ ----
  function autoJump(): void {
    if (cart.ri < 0) return
    tryJump()
    autoHold = HOLD_T
  }

  function stepCart(dt: number): void {
    if (cart.ri >= 0) {
      const r = course.rails[cart.ri]
      const slope = railSlope(r, cart.x)
      const sinA = slope / Math.sqrt(1 + slope * slope)
      let target = CRUISE
      let acc = -SLOPE_G * sinA + (target - cart.v) * 0.7
      const boost = inRange('boost', cart.x)
      if (boost) acc += 380
      if (inRange('splash', cart.x)) {
        target = CRUISE * 0.8
        acc += (target - cart.v) * 1.5
      }
      if (phase === 'title') acc = 0
      if (phase === 'ending') {
        const left = Math.max(0, course.endX - cart.x)
        const want = Math.sqrt(2 * 420 * left)
        cart.v = Math.min(cart.v, want)
        acc = Math.min(acc, 0)
      }
      if (phase === 'ride' && rideT < 1.6) cart.v = Math.max(cart.v, Math.min(CRUISE, rideT * 260))
      if (phase === 'result' || phase === 'leaving') cart.v = 0
      else if (phase !== 'title') cart.v = Math.min(V_MAX, Math.max(phase === 'ending' ? 0 : V_MIN, cart.v + acc * dt))
      const dx = (cart.v * dt) / Math.sqrt(1 + slope * slope)
      const nx = cart.x + dx
      // 下の道への分かれ道
      if (downCue && forkChoice === 'down' && r.kind === 'main' && cart.x < downCue.x && nx >= downCue.x) {
        cart.ri = downCue.rail
        say(tr('downPath'), cart.x, cart.y + 120, '#9cf0ff')
        hideDown()
      }
      const cur = course.rails[cart.ri]
      const end = cur.xs[cur.xs.length - 1]
      if (nx > end) {
        // 線路の終わり: 続く線路があれば乗りうつる、無ければ宙へ
        const y0 = cur.ys[cur.ys.length - 1]
        let next = -1
        course.rails.forEach((o, oi) => {
          if (oi === cart.ri) return
          const y = railY(o, nx)
          if (y !== null && Math.abs(y - y0) < 16 && o.xs[0] <= end + 2) next = oi
        })
        if (next >= 0) {
          cart.ri = next
          cart.x = nx
          cart.y = railY(course.rails[next], nx) ?? y0
        } else {
          cart.ri = -1
          cart.x = nx
          cart.vy = slope * cart.v
          cart.coyote = 0.1
        }
      } else {
        cart.x = nx
        cart.y = railY(cur, nx) ?? cart.y
      }
      if (cart.ri >= 0) {
        const a = Math.atan(railSlope(course.rails[cart.ri], cart.x))
        cart.angle += (a - cart.angle) * Math.min(1, dt * 14)
        cart.clackAcc += dx
        if (cart.clackAcc > 118) {
          cart.clackAcc = 0
          audio.clack()
        }
        if (boost && Math.random() < 0.9) {
          for (const wx of [-CART_W / 2 + 14, CART_W / 2 - 14]) {
            emit(1, () => ({ x: cart.x + wx, y: cart.y + 2, vx: -cart.v * (0.3 + Math.random() * 0.4), vy: 80 + Math.random() * 200, life: 0.35, size: 2, kind: 'spark', color: Math.random() < 0.5 ? '#ffd56b' : '#ff9a3d', g: 900 }))
          }
        }
      }
    } else {
      // 宙
      cart.coyote -= dt
      cart.holdT += dt
      autoHold -= dt
      const hold = (cart.holding || autoHold > 0) && cart.vy > 0 && cart.holdT < HOLD_T
      cart.vy -= G * dt * (hold ? 0.45 : 1)
      for (const ev of course.events) {
        if (ev.type !== 'vent' || Math.abs(cart.x - ev.x) > ev.w / 2) continue
        cart.vy = Math.min(560, cart.vy + 2700 * dt)
        if (!inVent.has(ev)) {
          inVent.add(ev)
          audio.wind()
        }
        emit(1, () => ({ x: cart.x + (Math.random() - 0.5) * 60, y: cart.y - 20, vx: 0, vy: 420, life: 0.4, size: 4, kind: 'wind', color: 'rgba(255,255,255,0.5)' }))
      }
      const nx = cart.x + cart.v * dt
      let ny = cart.y + cart.vy * dt
      if (ny + 70 > ceilAt(nx) && cart.vy > 0) {
        cart.vy = -40
        ny = Math.min(ny, ceilAt(nx) - 70)
        addShake(4)
        audio.thud()
      }
      // 着地: 下へ通り抜けた線路のうち、いちばん高いもの
      let land = -1
      let landY = -Infinity
      if (cart.vy <= 0) {
        course.rails.forEach((r, ri) => {
          const y = railY(r, nx)
          if (y === null) return
          if (cart.y >= y - 3 && ny <= y && y > landY) {
            land = ri
            landY = y
          }
        })
      }
      const fallV = cart.vy
      cart.x = nx
      if (land >= 0) {
        cart.ri = land
        cart.y = landY
        cart.vy = 0
        const hard = fallV < -700
        audio.land(hard)
        cart.squash = hard ? 1 : 0.5
        addShake(hard ? 9 : 3)
        emit(hard ? 14 : 7, () => ({ x: cart.x + (Math.random() - 0.5) * 60, y: cart.y + 3, vx: (Math.random() - 0.5) * 220, vy: 40 + Math.random() * 120, life: 0.5, size: 3 + Math.random() * 4, kind: 'dust', color: 'rgba(205,185,150,0.75)', g: 300 }))
        if (hard && course.rails[land].kind === 'rescue') sound.say('land')
        if (course.rails[land].kind === 'branch') say(tr('upPath'), cart.x, cart.y + 120, '#ffe36b')
      } else {
        cart.y = ny
        // 万一どこにも乗れずに落ち続けたら、いちばん下の線路へ
        const low = lowestRailAt(nx)
        if (low && ny < low.y - 260) {
          cart.ri = low.ri
          cart.y = low.y
          cart.vy = 0
        }
      }
      const a = Math.atan2(cart.vy, cart.v) * 0.5
      cart.angle += (a - cart.angle) * Math.min(1, dt * 8)
    }
    cart.wheel += (cart.v * dt) / 9
    cart.squash += (0 - cart.squash) * Math.min(1, dt * 10)
  }

  function inRange(type: 'boost' | 'splash', x: number): CourseEvent | null {
    for (const ev of course.events) {
      if (ev.type === type && x >= ev.x0 && x <= ev.x1) return ev
    }
    return null
  }

  function stepEvents(dt: number): void {
    const cx = cart.x
    for (const ev of course.events) {
      if (fired.has(ev)) continue
      if (ev.type === 'hint' && cx >= ev.x) {
        fired.add(ev)
        if (!autopilot) showHint(ev.key, ev.key === 'jump' ? tr('hintJump') : ev.key === 'fork' ? tr('hintFork') : tr('hintMouse'))
      } else if (ev.type === 'mole' && cx >= ev.x - 660) {
        fired.add(ev)
        const hx = ev.x + 150
        moles.push({ x: hx, y: mainYAt(hx) ?? cart.y, state: 'up', t: 0 })
        audio.pop()
        ;(moles[moles.length - 1] as Mole & { target?: number }).target = ev.x
      } else if (ev.type === 'mouse' && cx >= ev.x - 900) {
        fired.add(ev)
        const y = mainYAt(ev.x) ?? cart.y
        mice.push({ x: ev.x, y, beamY: y + 150, state: 'wait', t: 0, carry: null, vx: 0, vy: 0 })
      } else if (ev.type === 'bats' && cx >= ev.x - 240) {
        fired.add(ev)
        const n = reduce ? 8 : 16
        for (let i = 0; i < n; i++) {
          const x = cx + 260 + Math.random() * 500
          bats.push({ x, y: ceilAt(x) - 30 - Math.random() * 90, vx: -(380 + Math.random() * 280), vy: (Math.random() - 0.5) * 60, phase: Math.random() * 6, life: 2.4 })
        }
        lampFlicker = 1.3
        tally.bats++
        audio.bats()
        say(tr('bats'), cx + 80, cart.y + 150, '#d9c6ff')
      } else if (ev.type === 'fork' && cart.ri >= 0 && course.rails[cart.ri].kind === 'main' && cx >= ev.x - 560 && cx < ev.x) {
        fired.add(ev)
        if (ev.dir === 'down') {
          downCue = ev
          forkChoice = autopilot ? 'down' : null
          downBtn.hidden = autopilot
          downBtn.querySelector('span')!.textContent = tr('down')
          if (!autopilot) showHint('down', tr('hintDown'))
        }
      }
    }
    if (downCue && cx > downCue.x + 10) hideDown()
    // 水たまり
    for (const ev of course.events) {
      if (ev.type !== 'splash') continue
      const on = cart.ri >= 0 && cx >= ev.x0 && cx <= ev.x1
      if (on && !inSplash.has(ev)) {
        inSplash.add(ev)
        audio.splash()
      }
      if (on && Math.random() < 0.8) {
        emit(2, () => ({ x: cx + (Math.random() - 0.3) * 50, y: cart.y + 6, vx: -cart.v * 0.2 + (Math.random() - 0.5) * 160, vy: 160 + Math.random() * 220, life: 0.6, size: 2.5 + Math.random() * 2, kind: 'drop', color: 'rgba(170,230,255,0.85)', g: 900 }))
      }
    }
    // 上昇気流の穴の風（いつも）
    for (const ev of course.events) {
      if (ev.type !== 'vent' || Math.abs(ev.x - camX) > 900 || Math.random() > 0.3) continue
      const gy = lowestRailAt(ev.x)?.y ?? cart.y - 200
      emit(1, () => ({ x: ev.x + (Math.random() - 0.5) * ev.w, y: gy, vx: 0, vy: 300 + Math.random() * 200, life: 1.1, size: 3, kind: 'wind', color: 'rgba(255,255,255,0.35)' }))
      if (Math.random() < 0.15) emit(1, () => ({ x: ev.x + (Math.random() - 0.5) * ev.w, y: gy, vx: (Math.random() - 0.5) * 30, vy: 200, life: 1.6, size: 6, kind: 'leaf', color: '#fff', rot: Math.random() * 6 }))
    }

    // モグラ
    for (const m of moles) {
      m.t += dt
      const target = (m as Mole & { target?: number }).target ?? m.x
      if (m.state === 'up' && m.t > 0.3) {
        m.state = 'throw'
        m.t = 0
        const ty = mainYAt(target) ?? cart.y
        clods.push({ x: m.x, y: m.y + 40, x0: m.x - 6, y0: m.y + 40, x1: target, y1: ty, t: 0, dur: 0.6, state: 'fly' })
        audio.throwClod()
      } else if (m.state === 'throw' && m.t > 0.35) {
        m.state = 'laugh'
        m.t = 0
      } else if ((m.state === 'laugh' || m.state === 'pout') && cx > m.x + 160) {
        m.state = 'down'
        m.t = 0
      } else if (m.state === 'down' && m.t > 0.35) m.state = 'gone'
    }
    // 土のかたまり
    for (const c of clods) {
      if (c.state === 'fly') {
        c.t += dt
        const k = Math.min(1, c.t / c.dur)
        c.x = c.x0 + (c.x1 - c.x0) * k
        c.y = c.y0 + (c.y1 - c.y0) * k + Math.sin(Math.PI * k) * 120
        if (k >= 1) {
          c.state = 'rest'
          emit(5, () => ({ x: c.x, y: c.y + 4, vx: (Math.random() - 0.5) * 120, vy: 60 + Math.random() * 80, life: 0.4, size: 3, kind: 'dirt', color: '#7a5434', g: 600 }))
        }
      }
      if (c.state === 'rest' || (c.state === 'fly' && c.t > c.dur * 0.7)) {
        const near = Math.abs(cart.x - c.x) < CART_W / 2 + 6
        if (near && cart.y - c.y < 24 && cart.y - c.y > -30) {
          // 当たった: 遅くなり、画面に土がつき、目が回る（止まらない）
          c.state = 'burst'
          cart.v *= 0.55
          cart.dizzy = 1.3
          dirt = 1
          dirtSeed = (dirtSeed * 7 + 13) % 997
          addShake(10)
          audio.thud()
          tally.moleHit++
          say(tr('moleHit'), cart.x + 20, cart.y + 140, '#ffb36b', true)
          emit(16, () => ({ x: c.x, y: c.y + 12, vx: (Math.random() - 0.3) * 300, vy: 100 + Math.random() * 260, life: 0.7, size: 3 + Math.random() * 4, kind: 'dirt', color: Math.random() < 0.5 ? '#7a5434' : '#5d3e24', g: 900 }))
          for (const m of moles) if (m.state === 'laugh' && Math.abs(((m as Mole & { target?: number }).target ?? 0) - c.x) < 4) m.t = 0
        } else if (cart.x > c.x + CART_W / 2 + 6 && c.state === 'rest') {
          c.state = 'passed'
          tally.moleDodge++
          say(tr('dodge'), c.x, c.y + 110, '#ffe36b')
          emit(8, () => ({ x: c.x, y: c.y + 60, vx: (Math.random() - 0.5) * 200, vy: (Math.random() - 0.5) * 200, life: 0.6, size: 6, kind: 'star', color: '#ffe36b', rot: Math.random() * 6 }))
          for (const m of moles) {
            if (m.state === 'laugh' && Math.abs(((m as Mole & { target?: number }).target ?? 0) - c.x) < 4) {
              m.state = 'pout'
              m.t = 0
              say(tr('moleMiss'), m.x, m.y + 70, '#e8e0ff')
            }
          }
        }
      }
    }
    // ネズミ
    for (const m of mice) {
      m.t += dt
      if (m.state === 'wait' && cx >= m.x - 24 && cart.ri >= 0) {
        m.state = 'drop'
        m.t = 0
        audio.squeak()
      } else if (m.state === 'drop' && m.t > 0.3) {
        m.state = 'ride'
        m.t = 0
        say(tr('mouseOn'), cart.x, cart.y + 150, '#ffd0d8')
        if (!autopilot) showHint('mouseOn', tr('hintMouse'))
      } else if (m.state === 'ride') {
        if (autopilot && m.t > 0.55 && cart.ri >= 0) autoJump()
        if (m.state === 'ride' && m.t > 1.8) {
          const kind = (Object.keys(counts) as ItemKind[]).sort((a, b) => counts[b] - counts[a])[0]
          m.state = 'run'
          m.t = 0
          m.x = cart.x - 14
          m.y = cart.y + 46
          m.vx = -220
          m.vy = 300
          audio.squeak()
          if (kind && counts[kind] > 0) {
            counts[kind]--
            m.carry = kind
            paintCount(kind, true)
            tally.mouseSteal++
            say(tr('mouseSteal', { item: ITEM_NAME[kind][lang] }), cart.x, cart.y + 150, '#ffb3c6')
          } else say(tr('mouseEmpty'), cart.x, cart.y + 150, '#e8e0ff')
        }
      } else if (m.state === 'run' || m.state === 'tumble') {
        m.x += m.vx * dt
        m.vy -= 1500 * dt
        m.y += m.vy * dt
        const low = lowestRailAt(m.x)
        const floor = low ? Math.max(low.y, mainYAt(m.x) ?? low.y) : m.y
        if (m.y < floor) {
          m.y = floor
          m.vy = 0
        }
        if (m.t > 3) m.state = 'gone'
      }
    }
    // コウモリ
    for (const b of bats) {
      b.x += b.vx * dt
      b.y += b.vy * dt + Math.sin(t * 9 + b.phase) * 40 * dt
      b.life -= dt
    }
    for (let i = bats.length - 1; i >= 0; i--) if (bats[i].life <= 0) bats.splice(i, 1)

    // 拾う
    for (const it of course.items) {
      if (it.taken || Math.abs(it.x - cx) > 60) continue
      const dx = it.x - cx
      const dy = it.y - (cart.y + 44)
      if (dx * dx + dy * dy < 48 * 48) {
        it.taken = true
        it.at = t
        counts[it.kind]++
        paintCount(it.kind, true)
        audio.item()
        emit(6, () => ({ x: it.x, y: it.y, vx: (Math.random() - 0.5) * 220, vy: (Math.random() - 0.5) * 220, life: 0.45, size: 5, kind: 'star', color: it.kind === 'gem' ? '#c9b2ff' : it.kind === 'shell' ? '#ffc4d4' : '#ffffff', rot: Math.random() * 6 }))
      }
    }

    // おまかせ: 切れ目・土のかたまりの手前でジャンプ、上の道へはジャンプで乗りうつる
    if (autopilot && cart.ri >= 0 && phase === 'ride') {
      const r = course.rails[cart.ri]
      const ahead = cart.v * 0.04 + 16
      const end = r.xs[r.xs.length - 1]
      const continues = course.rails.some((o, oi) => oi !== cart.ri && o.xs[0] <= end + 2 && o.xs[o.xs.length - 1] > end + 2 && Math.abs((railY(o, end + 2) ?? 1e9) - r.ys[r.ys.length - 1]) < 16)
      if (end - cx < ahead && end - cx > 0 && !continues) autoJump()
      for (const c of clods) if ((c.state === 'rest' || c.state === 'fly') && c.x - cx > 30 && c.x - cx < ahead + 50) autoJump()
      for (const ev of course.events) if (ev.type === 'fork' && ev.dir === 'up' && r.kind === 'main' && ev.x - cx < 10 && ev.x - cx > -30) autoJump()
    }
  }

  function stepFx(dt: number): void {
    for (const p of particles) {
      p.life -= dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vy -= p.g * dt
      if (p.kind === 'leaf') {
        p.rot += dt * 2
        p.vx = Math.sin(t * 2 + p.rot) * 40
      }
      if (p.kind === 'star') p.rot += dt * 4
    }
    for (let i = particles.length - 1; i >= 0; i--) if (particles[i].life <= 0) particles.splice(i, 1)
    for (const tx of texts) tx.t += dt
    for (let i = texts.length - 1; i >= 0; i--) if (texts[i].t > 1.6) texts.splice(i, 1)
    dirt = Math.max(0, dirt - dt * 0.75)
    flash = Math.max(0, flash - dt * 1.6)
    shake = Math.max(0, shake - dt * 30)
    lampFlicker = Math.max(0, lampFlicker - dt)
    cart.dizzy = Math.max(0, cart.dizzy - dt)
    const boost = cart.ri >= 0 && !!inRange('boost', cart.x)
    speedLines += ((boost ? 1 : cart.v > 520 ? 0.5 : 0) - speedLines) * Math.min(1, dt * 4)
    if (reduce) speedLines = 0
    cart.cheer += ((phase === 'title' ? 0.5 + 0.5 * Math.sin(t * 3) : phase === 'ending' || phase === 'result' ? 1 : cart.ri < 0 && cart.vy > 200 ? 1 : 0) - cart.cheer) * Math.min(1, dt * 8)
    // 外の光の粒（駅のまわり）
    if (Math.random() < 0.2) {
      const x = camX + (Math.random() - 0.5) * 900
      if (x > course.mouthX && x < course.exitX && themeAt(course, x) === 'mid') {
        emit(1, () => ({ x, y: cart.y + Math.random() * 220, vx: (Math.random() - 0.5) * 10, vy: 6, life: 2, size: 1.6, kind: 'glint', color: 'rgba(170,255,220,0.8)' }))
      }
    }
  }

  function stepCamera(dt: number): void {
    const { w } = renderer.size()
    const s = renderer.scale()
    let zt = phase === 'title' ? 0.95 : 1
    for (const cv of course.caverns) if (cart.x > cv.x0 && cart.x < cv.x1) zt = 0.78
    if (cart.ri >= 0 && inRange('boost', cart.x)) zt = Math.min(zt, 0.9)
    if (phase === 'ending' || phase === 'result') zt = 0.86
    if (reduce) zt = 1 - (1 - zt) * 0.4
    zoom += (zt - zoom) * Math.min(1, dt * (reduce ? 0.8 : 1.4))
    const viewW = w / (s * zoom)
    const ahead = phase === 'title' ? 120 : viewW * 0.2
    const tx = cart.x + ahead
    // 先の線路の高さも少し見る
    let look = 0
    let n = 0
    for (let d = 100; d <= 500; d += 100) {
      const y = cart.ri >= 0 ? railY(course.rails[cart.ri], cart.x + d) : null
      if (y !== null) {
        look += y - cart.y
        n++
      }
    }
    const ty = cart.y + 70 + (n ? (look / n) * 0.35 : 0)
    camX += (tx - camX) * Math.min(1, dt * 9)
    camY += (ty - camY) * Math.min(1, dt * 4)
  }

  // ---- 終わり ----
  function arrive(): void {
    phase = 'ending'
    autopilot = true
    flash = Math.max(flash, 0.85)
    skipBtn.hidden = true
    hideDown()
    audio.whoosh()
    window.setTimeout(() => audio.fanfare(), 250)
    audio.music(false)
    for (let i = 0; i < (reduce ? 10 : 26); i++) {
      emit(1, () => ({ x: cart.x + 200 + Math.random() * 300, y: cart.y + 100 + Math.random() * 200, vx: (Math.random() - 0.5) * 300, vy: 100 + Math.random() * 200, life: 1.4, size: 6, kind: 'star', color: ['#ffe36b', '#ffb3c6', '#9cf0ff', '#c9b2ff'][i % 4], rot: Math.random() * 6, g: 160 }))
    }
  }

  function showResult(): void {
    phase = 'result'
    hud.hidden = true
    const best = readBest()
    let newBest = false
    // おまかせ・とばした回はベストに記録しない
    if (!skipped && !wasAuto && (best === null || rideT < best)) {
      newBest = true
      try {
        localStorage.setItem(bestKey, rideT.toFixed(2))
      } catch {
        // 保存できなくても続ける
      }
    }
    const items = itemKinds
      .map((k) => `<li><canvas data-icon="${k}" width="48" height="48"></canvas><span>${ITEM_NAME[k][lang]}</span><b>${counts[k]}</b></li>`)
      .join('')
    const moleTxt = lang === 'en' ? `${tally.moleHit} hit · ${tally.moleDodge} dodged` : `あたった ${tally.moleHit}・よけた ${tally.moleDodge}`
    const mouseTxt = lang === 'en' ? `${tally.mouseSteal} took · ${tally.mouseShake} shook off` : `とられた ${tally.mouseSteal}・ふりおとした ${tally.mouseShake}`
    resultCard.innerHTML = `
      <h1 class="tr-h">${tr('arrive')}</h1>
      ${skipped ? `<p class="tr-sub">${tr('skipped')}</p>` : wasAuto ? `<p class="tr-sub">${tr('autoDone')}</p>` : ''}
      <h2 class="tr-h2">${tr('got')}</h2>
      <ul class="tr-items">${items}</ul>
      <h2 class="tr-h2">${tr('mischief')}</h2>
      <dl class="tr-tally">
        <dt>${tr('molesR')}</dt><dd>${moleTxt}</dd>
        <dt>${tr('miceR')}</dt><dd>${mouseTxt}</dd>
        <dt>${tr('batsR')}</dt><dd>${tally.bats}</dd>
      </dl>
      ${skipped ? '' : `<p class="tr-time">${tr('time')} <b>${fmt(rideT)}</b>${newBest ? ` <em>${tr('newBest')}</em>` : ''}</p>`}
      <div class="tr-actions">
        <button type="button" class="tr-btn tr-primary" data-act="go">${tr('goWorld')}</button>
        <button type="button" class="tr-btn" data-act="again">${tr('again')}</button>
      </div>`
    resultCard.querySelectorAll<HTMLCanvasElement>('canvas[data-icon]').forEach((c) => {
      const cx = c.getContext('2d')
      if (cx) drawItemIcon(cx, c.dataset.icon as ItemKind, 24, 24, 15, 0)
    })
    resultCard.hidden = false
    window.setTimeout(() => resultCard.querySelector<HTMLButtonElement>('[data-act="go"]')?.focus(), 60)
  }
  let wasAuto = false
  resultCard.addEventListener('click', (e) => {
    const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act
    if (!act) return
    sound.play('tap')
    if (act === 'go') leave(arrivalSpot(found.to), toKey, true)
    else location.replace(location.href)
  })

  function leave(spot: { x: number; z: number; heading: number }, region: TrolleyStation['region'], viaTrolley: boolean): void {
    if (phase === 'leaving') return
    phase = 'leaving'
    // 出口の明るい絵を、ワールドへ戻る「のぞき窓」の中に見せる
    try {
      const small = document.createElement('canvas')
      small.width = 96
      small.height = Math.max(1, Math.round((96 * canvas.height) / Math.max(1, canvas.width)))
      small.getContext('2d')?.drawImage(canvas, 0, 0, small.width, small.height)
      saveHopShot(small.toDataURL('image/jpeg', 0.6))
    } catch {
      // 取れなくても続ける
    }
    fadeEl.classList.add('is-on')
    audio.stop()
    const url = new URL(location.pathname, location.origin)
    url.searchParams.set('rx', spot.x.toFixed(2))
    url.searchParams.set('rz', spot.z.toFixed(2))
    url.searchParams.set('rh', spot.heading.toFixed(3))
    url.searchParams.set('rg', region)
    if (viaTrolley) url.searchParams.set('via', 'trolley')
    window.setTimeout(() => location.replace(url.toString()), 380)
  }

  // ---- ループ ----
  let last = performance.now()
  const view: ViewState = {
    t: 0,
    camX,
    camY,
    zoom,
    cart: { x: 0, y: 0, angle: 0, wheel: 0, onRail: true, cheer: 0, dizzy: 0, squash: 0 },
    lampFlicker: 0,
    particles,
    moles,
    clods,
    mice,
    bats,
    texts,
    dirt: 0,
    dirtSeed: 1,
    speedLines: 0,
    flash: 0,
    shakeX: 0,
    shakeY: 0,
    reduce,
  }
  window.addEventListener('resize', () => {
    renderer.resize()
    if (phase === 'title') paintTitle()
  })
  const tick = (dt: number) => {
    if (phase !== 'leaving') {
      t += dt
      if (phase === 'ride') rideT += dt
      // 物理は細かく刻む（速い時に線路の端や着地を飛ばさない）
      const sub = Math.max(1, Math.ceil(dt / 0.012))
      for (let i = 0; i < sub; i++) stepCart(dt / sub)
      if (phase === 'ride' || phase === 'ending') stepEvents(dt)
      stepFx(dt)
      stepCamera(dt)
      if (phase === 'ride' && cart.x > course.exitX - 20) {
        wasAuto = autopilot
        arrive()
      }
      if (phase === 'ending' && cart.x >= course.endX - 2 && cart.v < 6) {
        cart.v = 0
        window.setTimeout(showResult, reduce ? 300 : 900)
        phase = 'result'
      }
      const theme = themeAt(course, cart.x)
      try {
        audio.update(dt, theme, cart.v, cart.ri >= 0, cart.ri >= 0 && !!inRange('boost', cart.x))
      } catch {
        // 音が鳴らせなくても走る
      }
      const prog = Math.min(1, Math.max(0, (cart.x - course.mouthX) / (course.exitX - course.mouthX)))
      fill.style.width = `${(prog * 100).toFixed(1)}%`
      dot.style.left = `${(prog * 100).toFixed(1)}%`
    }
  }
  const frame = (now: number) => {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000))
    last = now
    // 次のコマを先に頼む（1 コマで何か失敗しても、止まらずに走り続ける）
    requestAnimationFrame(frame)
    try {
      tick(dt)
    } catch (err) {
      console.warn('[awl] トロッコの 1 コマで失敗（続けます）', err)
    }
    view.t = t
    view.camX = camX
    view.camY = camY
    view.zoom = zoom
    view.cart.x = cart.x
    view.cart.y = cart.y
    view.cart.angle = cart.angle
    view.cart.wheel = cart.wheel
    view.cart.onRail = cart.ri >= 0
    view.cart.cheer = cart.cheer
    view.cart.dizzy = cart.dizzy
    view.cart.squash = cart.squash
    view.lampFlicker = lampFlicker
    view.dirt = dirt
    view.dirtSeed = dirtSeed
    view.speedLines = speedLines
    view.flash = flash
    view.shakeX = shake > 0 ? (Math.random() - 0.5) * shake : 0
    view.shakeY = shake > 0 ? (Math.random() - 0.5) * shake : 0
    try {
      renderer.draw(view)
    } catch (err) {
      console.warn('[awl] トロッコの絵で失敗（続けます）', err)
    }
  }
  requestAnimationFrame(frame)

  // 開発用の窓口（?debug=1 の時だけ）
  if (new URLSearchParams(location.search).get('debug') === '1') {
    ;(window as unknown as { __trolley?: unknown }).__trolley = { course, cart, counts, tally, depart, doSkip, get phase() { return phase }, audioOn: () => sound.synthOut('bgm') !== null, sim: (sec: number) => { for (let i = 0; i < sec * 60; i++) tick(1 / 60) } }
  }
}
