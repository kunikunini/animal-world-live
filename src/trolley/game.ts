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
import { createTrolleyAudio } from './audio'
import { createFinale } from './finale'
import { CART_W, buildCourse, railSlope, railY, sampleAt, themeAt, type ChaseKind, type Course, type CourseEvent, type ItemKind, type ThiefKind, type ThrowerKind } from './course'
import { createRenderer, drawItemIcon, type Bat, type Clod, type FloatText, type Mole, type Mouse, type Particle, type Racer, type Sloth, type ViewState } from './render'
import { TROLLEY_WORLD_NAME, arrivalSpot, routeFrom, type TrolleyStation } from './stations'

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
  | 'score' | 'lever' | 'howLever' | 'hintLever' | 'adventure' | 'tapTap' | 'tapSub' | 'timeBonus'
  | 'boulderCome' | 'hintBoulder' | 'boulderBump' | 'boulderBoom' | 'boulderSafe' | 'boulderClose' | 'boulderR' | 'boulderClean' | 'boulderHits'
  | 'hintMonkey' | 'hintIce' | 'hintSloth' | 'iceOn' | 'raceStart' | 'hintRace' | 'raceWin' | 'raceLose' | 'raceR' | 'raceWinR' | 'raceLoseR'
  | 'slothFive' | 'slothBye' | 'slothR' | 'mudOn' | 'riverOn'
  | 'back' | 'leverHold' | 'turbo' | 'turboOn' | 'turboBlock' | 'turboSmash' | 'turboDrain' | 'turboR'
  | 'coachLever' | 'coachJump' | 'coachDown' | 'coachMouse' | 'coachMonkey' | 'coachTurbo' | 'coachTap' | 'coachHold' | 'coachOk'
const WORLD = TROLLEY_WORLD_NAME
const ITEM_NAME: Record<ItemKind, { ja: string; en: string }> = {
  shell: { ja: 'かいがら', en: 'shell' },
  gem: { ja: 'ひかる石', en: 'glow stone' },
  feather: { ja: 'はね', en: 'feather' },
  snow: { ja: 'ゆきの けっしょう', en: 'snowflake' },
  fruit: { ja: 'くだもの', en: 'fruit' },
  star: { ja: 'ほしの かけら', en: 'star bit' },
  clover: { ja: 'よつばの クローバー', en: 'clover' },
}
/** いたずらの生き物の名前（結果の札・ことば） */
const THROWER_NAME: Record<ThrowerKind, { ja: string; en: string }> = {
  mole: { ja: 'モグラ', en: 'Moles' },
  beaver: { ja: 'ビーバー', en: 'Beavers' },
  goat: { ja: 'ヤギ', en: 'Goats' },
  mara: { ja: 'マーラ', en: 'Maras' },
}
const THROWER_HIT: Record<ThrowerKind, { ja: string; en: string }> = {
  mole: { ja: 'モグラの いたずら！', en: 'Mole prank!' },
  beaver: { ja: 'ビーバーの ダム！', en: 'Beaver dam!' },
  goat: { ja: 'ヤギの ほしくさ！', en: 'Goat’s hay!' },
  mara: { ja: 'マーラの いたずら！', en: 'Mara prank!' },
}
const THIEF_NAME: Record<ThiefKind, { ja: string; en: string }> = {
  mouse: { ja: 'ネズミ', en: 'Mice' },
  monkey: { ja: 'リスザル', en: 'Squirrel monkeys' },
}
const RACER_NAME: Record<'kangaroo' | 'collie', { ja: string; en: string }> = {
  kangaroo: { ja: 'カンガルー', en: 'Kangaroo' },
  collie: { ja: 'ボーダーコリー', en: 'Border collie' },
}
const CHASE_NAME: Record<ChaseKind, { ja: string; en: string }> = {
  rock: { ja: 'おおいわ', en: 'Boulder' },
  redrock: { ja: 'あかい おおいわ', en: 'Red boulder' },
  snow: { ja: 'おおきな ゆきだま', en: 'Giant snowball' },
  log: { ja: 'まるた', en: 'Log' },
  hay: { ja: 'ほしくさロール', en: 'Hay bale' },
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
  score: { ja: 'とくてん', en: 'Score' },
  lever: { ja: 'こいで<br>かそく', en: 'Pump<br>faster' },
  howLever: { ja: 'レバーを おしつづけると はやくなる（→キー）', en: 'Hold the lever to speed up (→ key)' },
  hintLever: { ja: 'レバーを おしつづけて スピードアップ！', en: 'Hold the lever to speed up!' },
  adventure: { ja: 'ぼうけんに しゅっぱつ！', en: 'Off on an adventure!' },
  tapTap: { ja: 'タップ タップ！', en: 'Tap! Tap!' },
  tapSub: { ja: 'れんだで 出口へ いそげ！', en: 'Mash to rush for the exit!' },
  timeBonus: { ja: 'タイムボーナス', en: 'Time bonus' },
  boulderCome: { ja: 'うしろから {thing}が！', en: '{thing} behind you!' },
  hintBoulder: { ja: 'レバーを こいで にげろ！', en: 'Pump the lever to escape!' },
  boulderBump: { ja: 'ゴツン！ いそげ！', en: 'Bonk! Hurry!' },
  boulderBoom: { ja: 'ドーン！', en: 'Boom!' },
  boulderSafe: { ja: 'にげきった！', en: 'Escaped!' },
  boulderClose: { ja: 'ふう… セーフ！', en: 'Phew… safe!' },
  boulderR: { ja: '{thing}', en: '{thing}' },
  hintMonkey: { ja: 'リスザルが のってきたら ジャンプで ふりおとそう', en: 'If a monkey hops in, jump to shake it off' },
  hintIce: { ja: 'こおりの さか！ ツルツル すべるよ', en: 'Icy slope! Slippery and fast' },
  hintSloth: { ja: 'ジャンプで ナマケモノと ハイタッチ！', en: 'Jump to high-five the sloth!' },
  iceOn: { ja: 'ツルツル～！', en: 'Wheee!' },
  raceStart: { ja: '{who}と きょうそう！', en: 'Race the {who}!' },
  hintRace: { ja: 'レバーを こいで かとう！', en: 'Pump the lever to win!' },
  raceWin: { ja: 'かった！', en: 'You win!' },
  raceLose: { ja: 'まけた～ また きょうそうしよう', en: 'So close! Race again soon' },
  raceR: { ja: '{who}と きょうそう', en: 'Race vs {who}' },
  raceWinR: { ja: 'かった', en: 'won' },
  raceLoseR: { ja: 'まけた', en: 'lost' },
  slothFive: { ja: 'ハイタッチ！', en: 'High five!' },
  slothBye: { ja: 'またね～', en: 'See ya~' },
  slothR: { ja: 'ナマケモノ', en: 'Sloths' },
  mudOn: { ja: 'どろんこ！', en: 'Mud!' },
  riverOn: { ja: 'カイマンが みてる！', en: 'Caimans are watching!' },
  boulderClean: { ja: 'ぶつからずに にげきった', en: 'escaped without a bump' },
  boulderHits: { ja: 'ゴツン {n}かい', en: '{n} bump(s)' },
  back: { ja: '{from}に もどる', en: 'Back to {from}' },
  leverHold: { ja: 'おしっぱなしで<br>はやく', en: 'Hold to<br>go fast' },
  turbo: { ja: 'ターボ', en: 'Turbo' },
  turboOn: { ja: 'ターボ！', en: 'Turbo!' },
  turboBlock: { ja: 'ターボで はねかえした！', en: 'Turbo bounced it off!' },
  turboSmash: { ja: 'ターボで こなごな！', en: 'Turbo smash!' },
  turboDrain: { ja: 'ターボの ゲージも へった…', en: 'Your turbo gauge dropped…' },
  turboR: { ja: 'ターボ', en: 'Turbo' },
  coachLever: { ja: 'レバーを おしっぱなしに すると<br>トロッコが はやく なるよ', en: 'Hold the lever<br>to make the cart go faster' },
  coachJump: { ja: 'せんろが きれてる！<br>がめんを タップして ジャンプ', en: 'The track ends!<br>Tap the screen to jump' },
  coachDown: { ja: '▼を おすと したの みちへ<br>おさなければ そのまま すすむよ', en: 'Press ▼ for the lower track<br>or just keep going' },
  coachMouse: { ja: 'ネズミは あつめた ものを とっていくよ！<br>ジャンプで ふりおとそう', en: 'Mice steal what you collected!<br>Jump to shake them off' },
  coachMonkey: { ja: 'リスザルは あつめた ものを とっていくよ！<br>ジャンプで ふりおとそう', en: 'Monkeys steal what you collected!<br>Jump to shake them off' },
  coachTurbo: { ja: 'ターボ！ しばらく はやく なって<br>アイテムを すいよせ、いたずらも はねかえすよ', en: 'Turbo! For a while you go faster,<br>pull in items and bounce off pranks' },
  coachTap: { ja: 'タップ', en: 'Tap' },
  coachHold: { ja: 'おしっぱなし', en: 'Hold' },
  coachOk: { ja: 'タップで つづける', en: 'Tap to continue' },
}

// ---- 動き ----
const G = 1500
const JUMP_V = 600
const HOLD_T = 0.24
const CRUISE = 330
/** レバーをこいでいる時のめざす速さ */
const LEVER_V = 590
/** 大岩の大きさ（半径）・めざす速さ・いちばん近づける距離（トロッコのまん中から） */
const BOULDER_R = 72
const BOULDER_V = 450
const BOULDER_V_MAX = 660
const BOULDER_NEAR = BOULDER_R + 44
/** 出口の遠近の画面に切り替える、出口までの距離 */
const FINALE_AT = 700
const ITEM_PT: Record<ItemKind, number> = { shell: 100, feather: 150, gem: 200, snow: 150, fruit: 150, star: 150, clover: 150 }
/** かけっこの相手のめざす速さ（ふつうのトロッコ 330 より速く、レバーをこいだ時 590 より遅い） */
const RACE_V = 470
const V_MIN = 150
const V_MAX = 680
const SLOPE_G = 950
/** ターボ: アイテム 1 つでゲージが 1/10 たまり、いっぱいで 5 秒。はやくなり、アイテムをすいよせ、いたずらをはねかえす */
const TURBO_PER = 0.1
const TURBO_LEN = 5
const TURBO_V = 660
const TURBO_PULL = 260
/** ネズミ・リスザルにとられた時に減るゲージ */
const STEAL_DRAIN = 0.3

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
      <div class="tr-turbo" aria-hidden="true"><b></b><div class="tr-turbo-bar"><i></i></div></div>
      <div class="tr-score"><span></span><b>0</b></div>
      <div class="tr-progress" aria-hidden="true"><span class="tr-pl"></span><div class="tr-bar"><i class="tr-fill"></i><b class="tr-dot"></b></div><span class="tr-pr"></span></div>
      <button type="button" class="tr-skip"></button>
    </div>
    <p class="tr-hint" role="status" aria-live="polite"></p>
    <button type="button" class="tr-down" hidden></button>
    <button type="button" class="tr-back"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg><span></span></button>
    <div class="tr-lever-wrap" hidden><div class="tr-speed" aria-hidden="true"><i></i></div><button type="button" class="tr-lever"><i aria-hidden="true"></i><span></span></button></div>
    <div class="tr-coach" hidden><div class="tr-coach-card" role="status"><p class="tr-coach-text"></p><p class="tr-coach-ok"></p></div><div class="tr-coach-hand" aria-hidden="true"><b></b><span></span></div></div>
    <div class="tr-banner" aria-hidden="true"></div>
    <div class="tr-cd" role="status" aria-live="assertive"></div>
    <div class="tr-tap" hidden><b></b><span></span><div class="tr-tap-bar"><i></i></div></div>
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
  const scoreEl = $<HTMLDivElement>('.tr-score')
  const leverBtn = $<HTMLButtonElement>('.tr-lever')
  const bannerEl = $<HTMLDivElement>('.tr-banner')
  const cdEl = $<HTMLDivElement>('.tr-cd')
  const tapEl = $<HTMLDivElement>('.tr-tap')
  const tapFill = $<HTMLElement>('.tr-tap-bar i')
  scoreEl.querySelector('span')!.textContent = tr('score')
  leverBtn.querySelector('span')!.innerHTML = tr('leverHold')
  const leverWrap = $<HTMLDivElement>('.tr-lever-wrap')
  const speedFill = $<HTMLElement>('.tr-speed i')
  const backBtn = $<HTMLButtonElement>('.tr-back')
  backBtn.querySelector('span')!.textContent = tr('back')
  backBtn.addEventListener('click', () => {
    if (phase !== 'title') return
    sound.play('tap')
    leave(origin, fromKey, false)
  })
  leverBtn.setAttribute('aria-label', tr('howLever'))
  bannerEl.textContent = tr('adventure')
  tapEl.querySelector('b')!.textContent = tr('tapTap')
  tapEl.querySelector('span')!.textContent = tr('tapSub')
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
  const finale = createFinale(canvas, heroLook, toKey)
  const audio = createTrolleyAudio()
  const mainRails = course.rails.map((r, i) => (r.kind === 'main' ? i : -1)).filter((i) => i >= 0)

  // ---- 状態 ----
  type Phase = 'title' | 'intro' | 'ride' | 'finale' | 'ending' | 'result' | 'leaving'
  let phase: Phase = 'title'
  let t = 0
  let rideT = 0
  let autopilot = false
  let skipped = false
  const counts: Record<ItemKind, number> = { shell: 0, gem: 0, feather: 0, snow: 0, fruit: 0, star: 0, clover: 0 }
  const tally = { moleHit: 0, moleDodge: 0, mouseSteal: 0, mouseShake: 0, bats: 0, five: 0, slothSeen: 0, turbo: 0 }
  /** このコースに出てくる、いたずらの生き物の種類（結果の札の行の名前） */
  const throwerKinds = new Set<ThrowerKind>()
  const thiefKinds = new Set<ThiefKind>()
  for (const ev of course.events) {
    if (ev.type === 'mole') throwerKinds.add(ev.kind ?? 'mole')
    if (ev.type === 'mouse') thiefKinds.add(ev.kind ?? 'mouse')
  }
  const raceLog: Array<{ kind: 'kangaroo' | 'collie'; win: boolean }> = []
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
    pump: 0,
    pumpA: 0,
  }
  let lever = false
  let score = 0
  /** ターボのゲージ（0〜1）と、のこりの秒 */
  let turbo = 0
  let turboT = 0
  let introT = 0
  let cdShown = -1
  const fin = { k: 0, scroll: 0, rush: 0, white: 0, taps: 0, done: false }
  let forkChoice: 'down' | null = null
  let autoHold = 0
  const particles: Particle[] = []
  const moles: Mole[] = []
  const clods: Clod[] = []
  const mice: Mouse[] = []
  const bats: Bat[] = []
  const racers: Racer[] = []
  const sloths: Sloth[] = []
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
  const iceSaid = new Set<CourseEvent>()
  let hintTimer = 0
  let hintKey: string | null = null
  // 大岩（11/14 くに: 後半で うしろから追いかけてきて ハラハラさせる。追いつかれても止まらず、前へ押し出されるだけ）
  const boulder = {
    state: 'idle' as 'idle' | 'fall' | 'roll' | 'drop' | 'gone',
    x: 0,
    y: 0,
    vy: 0,
    v: 0,
    rot: 0,
    rollAcc: 0,
    cool: 0,
    bumps: 0,
    seen: false,
    pit: 0,
    kind: 'rock' as ChaseKind,
  }

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
  const scoreNum = scoreEl.querySelector('b')!
  const addScore = (n: number, x?: number, y?: number) => {
    score = Math.max(0, score + n)
    scoreNum.textContent = String(score)
    scoreEl.classList.remove('is-pop')
    void scoreEl.offsetWidth
    scoreEl.classList.add('is-pop')
    if (x !== undefined && y !== undefined) say(n > 0 ? `+${n}` : String(n), x, y, n > 0 ? '#fff3a6' : '#ff9aa8')
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

  // ---- ターボ ----
  const turboEl = $<HTMLElement>('.tr-turbo')
  const turboFill = turboEl.querySelector('i') as HTMLElement
  ;(turboEl.querySelector('b') as HTMLElement).textContent = tr('turbo')
  let turboShown = -1
  const paintTurbo = () => {
    const k = turboT > 0 ? turboT / TURBO_LEN : turbo
    const q = Math.round(k * 50) / 50
    if (q === turboShown) return
    turboShown = q
    turboFill.style.width = `${q * 100}%`
    turboEl.classList.toggle('is-on', turboT > 0)
  }
  const startTurbo = () => {
    turbo = 0
    turboT = TURBO_LEN
    tally.turbo++
    flash = Math.max(flash, 0.5)
    audio.item()
    say(tr('turboOn'), cart.x, cart.y + 170, '#ffe36b', true)
    coachOpen('turbo')
  }
  const gainTurbo = (n: number) => {
    if (turboT > 0) return
    turbo = Math.min(1, turbo + n)
    if (turbo >= 1) startTurbo()
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
      <p class="tr-note">${tr('autoNote')}</p>
      ${best ? `<p class="tr-best">${tr('best', { t: fmt(best) })}</p>` : ''}
      ${portrait() ? `<p class="tr-rotate">${tr('rotate')}</p>` : ''}`
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

  // 出発: はじめの画面が飛んでいき、主人公に寄って「ぼうけんに しゅっぱつ！」、3・2・1・GO で走り出す
  function depart(auto: boolean): void {
    if (phase !== 'title') return
    autopilot = auto
    phase = 'intro'
    introT = 0
    cdShown = -1
    titleCard.classList.add('is-out')
    backBtn.hidden = true
    window.setTimeout(() => (titleCard.hidden = true), reduce ? 10 : 380)
    if (!reduce) bannerEl.classList.add('is-on')
    audio.whoosh()
    canvas.focus()
  }
  const INTRO_LEN = () => (reduce ? 1.0 : 3.6)
  function stepIntro(dt: number): void {
    introT += dt
    cart.cheer = 1
    // 数え: 3（1.3 秒）・2（2.0）・1（2.7）・GO（3.4）。動きをへらす時は GO だけ
    const marks = reduce ? [{ at: 0.4, n: 0 }] : [{ at: 1.3, n: 3 }, { at: 2.0, n: 2 }, { at: 2.7, n: 1 }, { at: 3.4, n: 0 }]
    for (let i = 0; i < marks.length; i++) {
      if (introT >= marks[i].at && cdShown < i) {
        cdShown = i
        const n = marks[i].n
        if (i === 0) bannerEl.classList.remove('is-on')
        cdEl.textContent = n > 0 ? String(n) : 'GO!'
        cdEl.className = `tr-cd is-on${n === 0 ? ' is-go' : ''}`
        void cdEl.offsetWidth
        cdEl.classList.add('is-anim')
        try {
          audio.count(n)
        } catch {
          // 音が出なくても進む
        }
        if (n === 0) go()
      }
    }
    if (introT > INTRO_LEN()) {
      cdEl.className = 'tr-cd'
      cdEl.textContent = ''
    }
  }
  function go(): void {
    phase = 'ride'
    hud.hidden = false
    if (!autopilot) leverWrap.hidden = false
    audio.music(true)
    sound.say('start')
    cart.v = 220
    cart.squash = -0.5
    flash = Math.max(flash, 0.35)
    if (!reduce) speedLines = 1
    addShake(6)
    emit(18, () => ({ x: cart.x - CART_W / 2 + Math.random() * 20, y: cart.y + 6, vx: -120 - Math.random() * 260, vy: 40 + Math.random() * 160, life: 0.7, size: 4 + Math.random() * 5, kind: 'dust', color: 'rgba(210,190,160,0.75)' }))
    window.setTimeout(() => {
      cdEl.className = 'tr-cd'
      cdEl.textContent = ''
    }, 1000)
    if (!autopilot)
      window.setTimeout(() => {
        if (coachDone.has('lever')) showHint('lever', tr('hintLever'))
        else coachOpen('lever')
      }, 1800)
  }

  // ---- ゲーム画面の説明（はじめての時だけ。自分で運転する時だけ） ----
  // その場面でゲームを止め、やることを指でさす。言われたことをすると、そのまま続きが動く
  type CoachKey = 'lever' | 'jump' | 'down' | 'mouse' | 'turbo'
  const COACH_KEY = 'awl.trolley.coach'
  const coachDone = new Set<CoachKey>()
  try {
    const raw = localStorage.getItem(COACH_KEY)
    if (raw) for (const k of JSON.parse(raw) as CoachKey[]) coachDone.add(k)
  } catch {
    // 読めなければ毎回出す
  }
  const coachEl = $<HTMLDivElement>('.tr-coach')
  const coachText = coachEl.querySelector('.tr-coach-text') as HTMLElement
  const coachOk = coachEl.querySelector('.tr-coach-ok') as HTMLElement
  const coachHand = coachEl.querySelector('.tr-coach-hand') as HTMLElement
  let coach: CoachKey | null = null
  let coachTarget: HTMLElement | null = null
  const coachTargetOf = (k: CoachKey): HTMLElement | null =>
    k === 'lever' ? leverBtn : k === 'down' ? downBtn : k === 'turbo' ? turboEl : null
  function coachOpen(k: CoachKey, monkey = false): void {
    if (autopilot || coach || coachDone.has(k) || phase !== 'ride') return
    coach = k
    coachDone.add(k)
    try {
      localStorage.setItem(COACH_KEY, JSON.stringify([...coachDone]))
    } catch {
      // 保存できなくても続ける
    }
    leverOn(false)
    hintEl.classList.remove('is-on')
    const textKey = ({ lever: 'coachLever', jump: 'coachJump', down: 'coachDown', mouse: 'coachMouse', turbo: 'coachTurbo' } as const)[k]
    coachText.innerHTML = tr(monkey && k === 'mouse' ? 'coachMonkey' : textKey)
    coachOk.textContent = k === 'turbo' ? tr('coachOk') : ''
    coachOk.hidden = k !== 'turbo'
    coachEl.dataset.k = k
    coachEl.hidden = false
    coachTarget = coachTargetOf(k)
    coachTarget?.classList.add('is-coach')
    ;(coachHand.querySelector('span') as HTMLElement).textContent = k === 'lever' ? tr('coachHold') : k === 'turbo' ? '' : tr('coachTap')
    placeHand()
  }
  /** 指を目あての上に（目あてが無い時は画面のまん中＝どこでもタップ） */
  function placeHand(): void {
    if (!coach) return
    const box = root.getBoundingClientRect()
    const r = coachTarget?.getBoundingClientRect()
    const x = r ? r.left + r.width / 2 - box.left : box.width * 0.62
    const y = r ? r.top + r.height / 2 - box.top : box.height * 0.62
    coachHand.style.left = `${x}px`
    coachHand.style.top = `${y}px`
  }
  window.addEventListener('resize', placeHand)
  function coachClose(): void {
    if (!coach) return
    coach = null
    coachEl.hidden = true
    coachTarget?.classList.remove('is-coach')
    coachTarget = null
    last = performance.now()
    // レバーの説明が ほかの説明と重なって出せなかった時は、少しあとで出す
    if (!coachDone.has('lever')) window.setTimeout(() => coachOpen('lever'), 1500)
  }

  // ---- 入力 ----
  const jumpPress = () => {
    if (phase !== 'ride' || autopilot) return
    if (coach === 'lever') return
    if (coach === 'down' || coach === 'turbo') {
      // 下の道の説明でタップ＝そのまま進む。ターボの説明はタップで閉じるだけ
      coachClose()
      return
    }
    coachClose()
    tryJump()
    cart.holding = true
  }
  const jumpRelease = () => {
    cart.holding = false
  }
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    if (phase === 'finale') finaleTap()
    else jumpPress()
  })
  // レバー: 押している間こぐ（トロッコの手こぎレバー）
  const leverOn = (on: boolean) => {
    lever = on && phase === 'ride' && !autopilot
    leverBtn.classList.toggle('is-on', lever)
    if (lever && coach === 'lever') coachClose()
  }
  leverBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    e.stopPropagation()
    try {
      leverBtn.setPointerCapture(e.pointerId)
    } catch {
      // 取れなくても続ける
    }
    leverOn(true)
  })
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) leverBtn.addEventListener(ev, () => leverOn(false))
  leverBtn.addEventListener('contextmenu', (e) => e.preventDefault())
  window.addEventListener('pointerup', jumpRelease)
  window.addEventListener('pointercancel', jumpRelease)
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return
    if (phase === 'finale' && (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowUp' || e.key === 'ArrowRight')) {
      e.preventDefault()
      finaleTap()
      return
    }
    if (phase === 'ride' && !autopilot && (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D')) {
      e.preventDefault()
      leverOn(true)
      return
    }
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
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') leverOn(false)
  })
  const chooseDown = () => {
    if (!downCue) return
    if (coach === 'down') coachClose()
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
      addScore(300, cart.x, cart.y + 190)
      audio.squeak()
      say(tr('mouseShake'), cart.x, cart.y + 140, '#9cf0ff')
    }
  }

  // ---- とばす ----
  function doSkip(): void {
    if (phase === 'finale') {
      // ラストスパート中のとばす: そのまま光の中へ
      skipped = true
      fin.k = 1
      return
    }
    if (phase !== 'ride') return
    coachClose()
    leverOn(false)
    leverWrap.hidden = true
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
    if (boulder.state !== 'idle') boulder.state = 'gone'
    racers.length = 0
    sloths.length = 0
    audio.setBoulder(null)
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
      let target = lever ? LEVER_V : CRUISE
      if (turboT > 0) target = Math.max(target, TURBO_V)
      let acc = -SLOPE_G * sinA + (target - cart.v) * (lever || turboT > 0 ? 1.1 : 0.7)
      const boost = inRange('boost', cart.x)
      if (boost) acc += 380
      if (inRange('splash', cart.x)) {
        target = CRUISE * 0.8
        acc += (target - cart.v) * 1.5
      }
      if (phase === 'title' || phase === 'intro') acc = 0
      if (phase === 'ending') {
        const left = Math.max(0, course.endX - cart.x)
        const want = Math.sqrt(2 * 420 * left)
        cart.v = Math.min(cart.v, want)
        acc = Math.min(acc, 0)
      }
      if (phase === 'ride' && rideT < 1.2) cart.v = Math.max(cart.v, Math.min(CRUISE, 220 + rideT * 200))
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
        if (lever && cart.v > 420 && Math.random() < 0.5) {
          const wx = CART_W / 2 - 14
          emit(1, () => ({ x: cart.x - wx, y: cart.y + 2, vx: -cart.v * (0.2 + Math.random() * 0.3), vy: 60 + Math.random() * 140, life: 0.3, size: 2, kind: 'spark', color: '#ffd56b', g: 900 }))
        }
        if (boost && Math.random() < 0.9) {
          const ice = boost.type === 'boost' && boost.kind === 'ice'
          for (const wx of [-CART_W / 2 + 14, CART_W / 2 - 14]) {
            emit(1, () => ({ x: cart.x + wx, y: cart.y + 2, vx: -cart.v * (0.3 + Math.random() * 0.4), vy: 80 + Math.random() * 200, life: 0.35, size: ice ? 2.6 : 2, kind: ice ? 'glint' : 'spark', color: ice ? (Math.random() < 0.5 ? '#e6f7ff' : '#9fdcff') : Math.random() < 0.5 ? '#ffd56b' : '#ff9a3d', g: 900 }))
          }
          if (ice && !iceSaid.has(boost)) {
            iceSaid.add(boost)
            say(tr('iceOn'), cart.x, cart.y + 140, '#c8f0ff', true)
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
        const hk: Record<typeof ev.key, Key> = { jump: 'hintJump', fork: 'hintFork', mouse: 'hintMouse', monkey: 'hintMonkey', ice: 'hintIce', sloth: 'hintSloth' }
        if (!autopilot) showHint(ev.key, tr(hk[ev.key]))
      } else if (ev.type === 'mole' && cx >= ev.x - 660) {
        fired.add(ev)
        const hx = ev.x + 150
        moles.push({ x: hx, y: mainYAt(hx) ?? cart.y, state: 'up', t: 0, kind: ev.kind ?? 'mole' })
        audio.pop()
        ;(moles[moles.length - 1] as Mole & { target?: number }).target = ev.x
      } else if (ev.type === 'mouse' && cx >= ev.x - 900) {
        fired.add(ev)
        const y = mainYAt(ev.x) ?? cart.y
        mice.push({ x: ev.x, y, beamY: y + 150, state: 'wait', t: 0, carry: null, vx: 0, vy: 0, kind: ev.kind ?? 'mouse' })
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
      } else if (ev.type === 'boulder' && cx >= ev.x0) {
        fired.add(ev)
        startBoulder(ev.pit, ev.kind)
      } else if (ev.type === 'race' && cx >= ev.x0) {
        fired.add(ev)
        startRace(ev.kind, ev.x1)
      } else if (ev.type === 'sloth' && cx >= ev.x - 900) {
        fired.add(ev)
        const y = mainYAt(ev.x) ?? cart.y
        sloths.push({ x: ev.x, hand: y + 210, state: 'hang', t: 0 })
        tally.slothSeen++
      } else if (ev.type === 'fork' && cart.ri >= 0 && course.rails[cart.ri].kind === 'main' && cx >= ev.x - 560 && cx < ev.x) {
        fired.add(ev)
        if (ev.dir === 'down') {
          downCue = ev
          forkChoice = autopilot ? 'down' : null
          downBtn.hidden = autopilot
          downBtn.querySelector('span')!.textContent = tr('down')
          if (!autopilot) {
            showHint('down', tr('hintDown'))
            coachOpen('down')
          }
        }
      }
    }
    if (downCue && cx > downCue.x + 10) hideDown()
    // 水たまり
    for (const ev of course.events) {
      if (ev.type !== 'splash') continue
      const on = cart.ri >= 0 && cx >= ev.x0 && cx <= ev.x1
      const sk = ev.kind ?? 'water'
      if (on && !inSplash.has(ev)) {
        inSplash.add(ev)
        audio.splash()
        if (sk === 'mud') {
          // ブタのどろんこ: 画面に泥がはねる
          dirt = Math.max(dirt, 0.7)
          dirtSeed = (dirtSeed * 7 + 13) % 997
          say(tr('mudOn'), cx + 20, cart.y + 140, '#e0b48a', true)
        }
      }
      if (on && Math.random() < 0.8) {
        const color = sk === 'snow' ? 'rgba(255,255,255,0.9)' : sk === 'mud' ? 'rgba(122,84,52,0.9)' : 'rgba(170,230,255,0.85)'
        emit(2, () => ({ x: cx + (Math.random() - 0.3) * 50, y: cart.y + 6, vx: -cart.v * 0.2 + (Math.random() - 0.5) * 160, vy: 160 + Math.random() * 220, life: 0.6, size: (sk === 'snow' ? 3.5 : 2.5) + Math.random() * 2, kind: sk === 'snow' ? 'dust' : 'drop', color, g: sk === 'snow' ? 500 : 900 }))
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
        clods.push({ x: m.x, y: m.y + 40, x0: m.x - 6, y0: m.y + 40, x1: target, y1: ty, t: 0, dur: 0.6, state: 'fly', kind: m.kind === 'beaver' ? 'sticks' : m.kind === 'goat' ? 'hay' : 'dirt' })
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
        if (near && cart.y - c.y < 24 && cart.y - c.y > -30 && turboT > 0) {
          // ターボ中は くだいて進む（遅くならない）
          c.state = 'burst'
          tally.moleDodge++
          addShake(4)
          audio.thud()
          say(tr('turboSmash'), cart.x + 20, cart.y + 140, '#ffe36b')
          addScore(300, c.x, c.y + 170)
          const cc = c.kind === 'hay' ? ['#e8c766', '#c9a23f'] : c.kind === 'sticks' ? ['#8a5a32', '#5e3a1e'] : ['#7a5434', '#5d3e24']
          emit(16, () => ({ x: c.x, y: c.y + 12, vx: (Math.random() - 0.3) * 300, vy: 100 + Math.random() * 260, life: 0.7, size: 3 + Math.random() * 4, kind: 'dirt', color: Math.random() < 0.5 ? cc[0] : cc[1], g: 900 }))
          for (const m of moles) {
            if (m.state === 'laugh' && Math.abs(((m as Mole & { target?: number }).target ?? 0) - c.x) < 4) {
              m.state = 'pout'
              m.t = 0
            }
          }
        } else if (near && cart.y - c.y < 24 && cart.y - c.y > -30) {
          // 当たった: 遅くなり、画面に土がつき、目が回る（止まらない）
          c.state = 'burst'
          cart.v *= 0.55
          cart.dizzy = 1.3
          dirt = 1
          dirtSeed = (dirtSeed * 7 + 13) % 997
          addShake(10)
          audio.thud()
          tally.moleHit++
          const by = moles.find((m) => Math.abs(((m as Mole & { target?: number }).target ?? 0) - c.x) < 4)
          say(THROWER_HIT[by?.kind ?? 'mole'][lang], cart.x + 20, cart.y + 140, '#ffb36b', true)
          const cc = c.kind === 'hay' ? ['#e8c766', '#c9a23f'] : c.kind === 'sticks' ? ['#8a5a32', '#5e3a1e'] : ['#7a5434', '#5d3e24']
          emit(16, () => ({ x: c.x, y: c.y + 12, vx: (Math.random() - 0.3) * 300, vy: 100 + Math.random() * 260, life: 0.7, size: 3 + Math.random() * 4, kind: 'dirt', color: Math.random() < 0.5 ? cc[0] : cc[1], g: 900 }))
          for (const m of moles) if (m.state === 'laugh' && Math.abs(((m as Mole & { target?: number }).target ?? 0) - c.x) < 4) m.t = 0
        } else if (cart.x > c.x + CART_W / 2 + 6 && c.state === 'rest') {
          c.state = 'passed'
          tally.moleDodge++
          say(tr('dodge'), c.x, c.y + 110, '#ffe36b')
          addScore(300, c.x, c.y + 170)
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
      } else if (m.state === 'drop' && m.t > 0.3 && turboT > 0) {
        // ターボ中は のってこられない（はねかえす）
        m.state = 'tumble'
        m.t = 0
        m.x = cart.x - 14
        m.y = cart.y + 46
        m.vx = -200
        m.vy = 380
        tally.mouseShake++
        addScore(300, cart.x, cart.y + 190)
        audio.squeak()
        say(tr('turboBlock'), cart.x, cart.y + 150, '#9cf0ff')
      } else if (m.state === 'drop' && m.t > 0.3) {
        m.state = 'ride'
        m.t = 0
        say(m.kind === 'monkey' ? (lang === 'en' ? 'A monkey hopped in!' : 'リスザルが のってきた！') : tr('mouseOn'), cart.x, cart.y + 150, '#ffd0d8')
        if (!autopilot) {
          showHint('mouseOn', tr(m.kind === 'monkey' ? 'hintMonkey' : 'hintMouse'))
          coachOpen('mouse', m.kind === 'monkey')
        }
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
            addScore(-ITEM_PT[kind])
            if (turbo > 0) {
              turbo = Math.max(0, turbo - STEAL_DRAIN)
              turboEl.classList.remove('is-drain')
              void turboEl.offsetWidth
              turboEl.classList.add('is-drain')
            }
            say(m.kind === 'monkey' ? (lang === 'en' ? `The monkey took a ${ITEM_NAME[kind].en}!` : `リスザルが ${ITEM_NAME[kind].ja}を もっていった！`) : tr('mouseSteal', { item: ITEM_NAME[kind][lang] }), cart.x, cart.y + 150, '#ffb3c6')
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
    const pull = turboT > 0
    for (const it of course.items) {
      if (it.taken || it.x - cx > (pull ? TURBO_PULL : 60) || cx - it.x > 60) continue
      if (pull) {
        // ターボ中は まわりのアイテムを すいよせる
        const k = Math.min(1, dt * 7)
        it.x += (cx + 10 - it.x) * k
        it.y += (cart.y + 44 - it.y) * k
      }
      const dx = it.x - cx
      const dy = it.y - (cart.y + 44)
      if (dx * dx + dy * dy < 48 * 48) {
        it.taken = true
        it.at = t
        counts[it.kind]++
        paintCount(it.kind, true)
        addScore(ITEM_PT[it.kind] * (turboT > 0 ? 2 : 1), it.x, it.y + 40)
        gainTurbo(TURBO_PER)
        audio.item()
        emit(6, () => ({ x: it.x, y: it.y, vx: (Math.random() - 0.5) * 220, vy: (Math.random() - 0.5) * 220, life: 0.45, size: 5, kind: 'star', color: it.kind === 'gem' ? '#c9b2ff' : it.kind === 'shell' ? '#ffc4d4' : '#ffffff', rot: Math.random() * 6 }))
      }
    }

    // はじめての切れ目: おまかせがジャンプする所で止めて、タップを教える
    if (!autopilot && !coachDone.has('jump') && cart.ri >= 0 && phase === 'ride') {
      const r = course.rails[cart.ri]
      const end = r.xs[r.xs.length - 1]
      const continues = course.rails.some((o, oi) => oi !== cart.ri && o.xs[0] <= end + 2 && o.xs[o.xs.length - 1] > end + 2 && Math.abs((railY(o, end + 2) ?? 1e9) - r.ys[r.ys.length - 1]) < 16)
      if (!continues && end - cx > 0 && end - cx < cart.v * 0.04 + 16) coachOpen('jump')
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
      // ナマケモノとハイタッチ（てっぺんで手に届くように、0.4 秒前に跳ぶ）
      for (const sl of sloths) {
        const lead = cart.v * 0.4
        if (sl.state === 'hang' && sl.x - cx < lead + 6 && sl.x - cx > lead - 40) autoJump()
      }
    }
  }

  // ---- 大岩 ----
  function startBoulder(pit: number, kind: ChaseKind): void {
    boulder.kind = kind
    boulder.state = 'fall'
    boulder.seen = true
    boulder.pit = pit
    boulder.x = cart.x - 300
    boulder.y = ceilAt(boulder.x) - BOULDER_R
    boulder.vy = 0
    boulder.v = cart.v
    boulder.rot = 0
    boulder.cool = 0
    audio.boom()
    addShake(8)
    say(tr('boulderCome', { thing: CHASE_NAME[kind][lang] }), cart.x, cart.y + 170, '#ffb36b', true)
    if (!autopilot) showHint('boulder', tr('hintBoulder'))
    // 天井からぱらぱら
    emit(14, () => ({ x: boulder.x + (Math.random() - 0.5) * 140, y: boulder.y + BOULDER_R * 0.6, vx: (Math.random() - 0.5) * 120, vy: -40 - Math.random() * 120, life: 0.9, size: 3 + Math.random() * 4, kind: 'dirt', color: Math.random() < 0.5 ? '#7a5434' : '#5d3e24', g: 900 }))
  }
  function boulderDust(n: number, spread: number): void {
    emit(n, () => ({ x: boulder.x + (Math.random() - 0.5) * spread, y: boulder.y - BOULDER_R + 4, vx: (Math.random() - 0.5) * 260, vy: 60 + Math.random() * 200, life: 0.7, size: 4 + Math.random() * 6, kind: 'dust', color: 'rgba(205,185,150,0.75)', g: 300 }))
  }
  function stepBoulder(dt: number): void {
    if (boulder.state === 'idle' || boulder.state === 'gone') return
    if (phase !== 'ride') {
      boulder.state = 'gone'
      audio.setBoulder(null)
      return
    }
    boulder.cool = Math.max(0, boulder.cool - dt)
    const dist = cart.x - boulder.x
    if (boulder.state === 'fall') {
      // 天井から落ちて、線路の上で弾む
      boulder.vy -= G * dt
      boulder.x += boulder.v * dt
      boulder.y += boulder.vy * dt
      const gy = mainYAt(boulder.x)
      if (gy !== null && boulder.y - BOULDER_R <= gy) {
        boulder.y = gy + BOULDER_R
        boulder.state = 'roll'
        boulder.v = cart.v + 60
        audio.boom()
        addShake(12)
        boulderDust(16, 160)
      }
    } else if (boulder.state === 'roll') {
      const gy = mainYAt(boulder.x)
      if (gy === null || boulder.x >= boulder.pit) {
        // 最後の切れ目に落ちる
        boulder.state = 'drop'
        boulder.vy = 0
        return
      }
      // 坂で速くなる（トロッコと同じ式。めざす速さはふつうのトロッコより速く、レバーをこいだ時より遅い）
      const r = course.rails[mainRails.find((i) => railY(course.rails[i], boulder.x) !== null) ?? 0]
      const slope = railSlope(r, boulder.x)
      const sinA = slope / Math.sqrt(1 + slope * slope)
      boulder.v = Math.min(BOULDER_V_MAX, Math.max(160, boulder.v + (-SLOPE_G * sinA + (BOULDER_V - boulder.v) * 0.7) * dt))
      const dx = (boulder.v * dt) / Math.sqrt(1 + slope * slope)
      boulder.x += dx
      boulder.y = (mainYAt(boulder.x) ?? gy) + BOULDER_R
      boulder.rot += dx / BOULDER_R
      boulder.rollAcc += dx
      const near = Math.min(1, Math.max(0.15, 1 - (dist - BOULDER_NEAR) / 420))
      if (boulder.rollAcc > BOULDER_R * 2.2) {
        boulder.rollAcc = 0
        audio.roll(near)
        addShake(2 + 4 * near)
      }
      if (Math.random() < 0.35) boulderDust(1, 60)
      // 追いつかれた: ゴツンと前へ押し出される（止まらない）。大岩は弾んで少し遅れる
      if (cart.x - boulder.x < BOULDER_NEAR) {
        boulder.x = cart.x - BOULDER_NEAR
        if (boulder.cool <= 0) {
          boulder.cool = 1.2
          boulder.bumps++
          cart.v = Math.max(cart.v, 600)
          cart.squash = -0.6
          boulder.v = Math.min(boulder.v, cart.v * 0.45)
          addShake(14)
          audio.thud()
          say(tr('boulderBump'), cart.x, cart.y + 160, '#ff9aa8', true)
          emit(10, () => ({ x: cart.x - CART_W / 2, y: cart.y + 30, vx: -60 + (Math.random() - 0.5) * 200, vy: 80 + Math.random() * 200, life: 0.6, size: 6, kind: 'star', color: '#ffe36b', rot: Math.random() * 6 }))
        }
      }
    } else if (boulder.state === 'drop') {
      boulder.vy -= G * dt
      boulder.x += boulder.v * 0.5 * dt
      boulder.y += boulder.vy * dt
      boulder.rot += (boulder.v * 0.5 * dt) / BOULDER_R
      const low = lowestRailAt(boulder.x)
      const floor = low ? low.y : boulder.y - 400
      if (boulder.y - BOULDER_R <= floor || boulder.y < cart.y - 700) {
        // 穴の底で砕ける
        boulder.y = floor + BOULDER_R
        boulder.state = 'gone'
        audio.boom()
        addShake(14)
        const bc: Record<ChaseKind, [string, string]> = { rock: ['#6b6178', '#4a4256'], redrock: ['#a8573a', '#7a3a24'], snow: ['#ffffff', '#d8ecfa'], log: ['#8a5a32', '#c99a62'], hay: ['#e8c766', '#c9a23f'] }
        emit(26, () => ({ x: boulder.x + (Math.random() - 0.5) * 120, y: boulder.y - BOULDER_R * 0.4, vx: (Math.random() - 0.5) * 420, vy: 120 + Math.random() * 420, life: 0.9, size: 5 + Math.random() * 9, kind: 'dirt', color: Math.random() < 0.5 ? bc[boulder.kind][0] : bc[boulder.kind][1], g: 1100 }))
        boulderDust(20, 200)
        say(tr('boulderBoom'), boulder.x, boulder.y + 60, '#ffd27a', true)
        const pts = boulder.bumps === 0 ? 500 : 200
        say(tr(boulder.bumps === 0 ? 'boulderSafe' : 'boulderClose'), cart.x, cart.y + 170, '#9cf0ff', true)
        addScore(pts, cart.x, cart.y + 230)
      }
    }
    audio.setBoulder(boulder.state === 'gone' ? null : Math.min(1, Math.max(0.15, 1 - (cart.x - boulder.x - BOULDER_NEAR) / 420)))
    if (boulder.state === 'gone') audio.setBoulder(null)
  }

  // ---- かけっこ（カンガルー・ボーダーコリー） ----
  function startRace(kind: 'kangaroo' | 'collie', x1: number): void {
    const y = mainYAt(cart.x + 40) ?? cart.y
    racers.push({ kind, x: cart.x + 40, y, v: Math.max(cart.v, 300), t: 0, phase: 0, state: 'run', x1 })
    say(tr('raceStart', { who: RACER_NAME[kind][lang] }), cart.x + 40, cart.y + 170, '#ffe36b', true)
    if (!autopilot) showHint('race', tr('hintRace'))
    audio.count(0)
  }
  function stepRacers(dt: number): void {
    for (const r of racers) {
      r.t += dt
      if (r.state === 'run') {
        r.v += (RACE_V - r.v) * Math.min(1, dt * 1.5)
        // うしろに離れすぎたら少しだけ追いつく（画面から消えないように）
        if (cart.x - r.x > 420) r.v = Math.max(r.v, cart.v + 60)
        r.x += r.v * dt
        const winR = r.x >= r.x1
        const winC = cart.x >= r.x1
        if (winR || winC) {
          const win = winC && (!winR || cart.x - r.x1 >= r.x - r.x1)
          r.state = win ? 'lost' : 'won'
          r.t = 0
          raceLog.push({ kind: r.kind, win })
          if (win) {
            say(tr('raceWin'), cart.x, cart.y + 170, '#ffe36b', true)
            addScore(500, cart.x, cart.y + 230)
            audio.fanfare()
            emit(14, () => ({ x: cart.x + (Math.random() - 0.5) * 120, y: cart.y + 120 + Math.random() * 80, vx: (Math.random() - 0.5) * 300, vy: 100 + Math.random() * 200, life: 1, size: 6, kind: 'star', color: ['#ffe36b', '#ffb3c6', '#9cf0ff'][Math.floor(Math.random() * 3)], rot: Math.random() * 6, g: 200 }))
          } else {
            say(tr('raceLose'), cart.x, cart.y + 170, '#e8e0ff', true)
            addScore(100, cart.x, cart.y + 230)
          }
        }
      } else if (r.state === 'won' || r.state === 'lost') {
        // 勝った方は跳ねてよろこび、負けた方はゆっくり止まる。しばらくして消える
        r.v = Math.max(0, r.v - (r.state === 'won' ? 260 : 340) * dt)
        r.x += r.v * dt
        if (r.t > 4) r.state = 'gone'
      }
      if (r.state !== 'gone') {
        r.phase += (r.v * dt) / (r.kind === 'kangaroo' ? 120 : 46)
        r.y = mainYAt(r.x) ?? lowestRailAt(r.x)?.y ?? r.y
      }
    }
  }

  // ---- ナマケモノ（ジャンプで手にさわるとハイタッチ） ----
  function stepSloths(dt: number): void {
    for (const sl of sloths) {
      sl.t += dt
      if (sl.state !== 'hang') continue
      if (Math.abs(cart.x - sl.x) < 46 && cart.y + 82 >= sl.hand - 26) {
        sl.state = 'five'
        sl.t = 0
        tally.five++
        addScore(300, sl.x, sl.hand + 40)
        say(tr('slothFive'), sl.x, sl.hand + 90, '#ffe36b', true)
        audio.item()
        emit(10, () => ({ x: sl.x, y: sl.hand, vx: (Math.random() - 0.5) * 260, vy: (Math.random() - 0.5) * 260, life: 0.7, size: 6, kind: 'star', color: '#ffe36b', rot: Math.random() * 6 }))
      } else if (cart.x > sl.x + 50) {
        sl.state = 'bye'
        sl.t = 0
        say(tr('slothBye'), sl.x, sl.hand + 60, '#d9f2c8')
      }
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
    if (lever && cart.v > 460) speedLines = Math.max(speedLines, Math.min(0.7, (cart.v - 460) / 180))
    if (turboT > 0) {
      turboT = Math.max(0, turboT - dt)
      speedLines = Math.max(speedLines, 0.8)
      if (Math.random() < dt * 30) emit(1, () => ({ x: cart.x - 40, y: cart.y + 20 + Math.random() * 50, vx: -120 - Math.random() * 80, vy: (Math.random() - 0.5) * 60, life: 0.5, size: 5, kind: 'star', color: Math.random() < 0.5 ? '#ffe36b' : '#9cf0ff', rot: Math.random() * 6 }))
    }
    paintTurbo()
    speedFill.style.height = `${Math.round(Math.min(1, Math.max(0, (cart.v - 150) / (V_MAX - 150))) * 100)}%`
    if (reduce) speedLines = 0
    // レバーをこぐ手の動き（こいでいる時だけ回す。1 回こぐごとに音）
    cart.pump += ((lever ? 1 : 0) - cart.pump) * Math.min(1, dt * 10)
    if (lever) {
      const before = Math.floor(cart.pumpA / (Math.PI * 2))
      cart.pumpA += dt * 10
      if (Math.floor(cart.pumpA / (Math.PI * 2)) > before) audio.pump()
    }
    cart.cheer += ((phase === 'intro' ? 1 : phase === 'finale' ? Math.min(1, 0.3 + fin.rush) : phase === 'title' ? 0.5 + 0.5 * Math.sin(t * 3) : phase === 'ending' || phase === 'result' ? 1 : cart.ri < 0 && cart.vy > 200 ? 1 : 0) - cart.cheer) * Math.min(1, dt * 8)
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
    const fast = Math.min(1, Math.max(0, (cart.v - CRUISE) / (LEVER_V - CRUISE)))
    let zt = phase === 'title' ? 0.95 : phase === 'intro' ? 1.32 : 1 - 0.08 * fast
    for (const cv of course.caverns) if (cart.x > cv.x0 && cart.x < cv.x1) zt = 0.78
    if (cart.ri >= 0 && inRange('boost', cart.x)) zt = Math.min(zt, 0.9)
    if (phase === 'ending' || phase === 'result') zt = 0.86
    if (reduce) zt = 1 - (1 - zt) * 0.4
    zoom += (zt - zoom) * Math.min(1, dt * (reduce ? 0.8 : 1.4))
    const viewW = w / (s * zoom)
    let ahead = phase === 'title' ? 120 : phase === 'intro' ? 20 : viewW * (0.2 + 0.1 * fast)
    // 大岩に追われている間は、うしろを広く見せる（トロッコを右へ寄せる）
    if (boulder.state === 'fall' || boulder.state === 'roll' || boulder.state === 'drop') ahead = Math.max(-viewW * 0.25, Math.min(ahead, viewW * 0.5 - 380))
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
    const ty = cart.y + (phase === 'intro' ? 40 : 70) + (n ? (look / n) * 0.35 : 0)
    camX += (tx - camX) * Math.min(1, dt * (phase === 'intro' ? 3 : 9))
    camY += (ty - camY) * Math.min(1, dt * 4)
  }

  // ---- 出口のラストスパート（うしろから見た遠近の画面・連打） ----
  function startFinale(): void {
    phase = 'finale'
    leverOn(false)
    leverWrap.hidden = true
    hideDown()
    hintEl.classList.remove('is-on')
    Object.assign(fin, { k: 0, scroll: 0, rush: 0, white: 0, taps: 0, done: false })
    tapEl.hidden = false
    tapEl.classList.toggle('is-auto', autopilot)
    audio.whoosh()
    audio.setFinale(0)
    flash = 0
  }
  function finaleTap(): void {
    if (phase !== 'finale' || fin.k >= 1) return
    fin.taps++
    fin.k = Math.min(1, fin.k + 0.045)
    fin.rush = Math.min(1, fin.rush + 0.35)
    addScore(10)
    tapEl.classList.remove('is-hit')
    void tapEl.offsetWidth
    tapEl.classList.add('is-hit')
    try {
      audio.tapHit(fin.k)
    } catch {
      // 音が出なくても進む
    }
  }
  function stepFinale(dt: number): void {
    // 何もしなくても少しずつ進む（おまかせ・動きをへらす時は速め）。タップでぐんと進む
    fin.k = Math.min(1, fin.k + dt * (autopilot || reduce ? 0.3 : 0.09))
    if (autopilot && !reduce && Math.random() < dt * 7) fin.rush = Math.min(1, fin.rush + 0.25)
    fin.rush = Math.max(0, fin.rush - dt * 1.6)
    fin.scroll += dt * (1.6 + 5 * fin.rush + 3 * fin.k)
    tapFill.style.width = `${(fin.k * 100).toFixed(1)}%`
    try {
      audio.setFinale(fin.k)
    } catch {
      // 音が出なくても進む
    }
    if (fin.k >= 1) fin.white = Math.min(1, fin.white + dt * (reduce ? 3 : 1.6))
    if (fin.white >= 1 && !fin.done) {
      fin.done = true
      tapEl.hidden = true
      audio.setFinale(null)
      // 出口の外へ: 横から見た画面に戻し、外の駅でブレーキ
      const x = course.exitX + 10
      const ri = mainRails.find((i) => railY(course.rails[i], x) !== null) ?? cart.ri
      cart.x = x
      cart.ri = ri
      cart.y = railY(course.rails[ri], x) ?? cart.y
      cart.vy = 0
      cart.v = Math.max(cart.v, 380)
      camX = cart.x + 120
      camY = cart.y + 60
      wasAuto = autopilot
      arrive()
      flash = 1
    }
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
    const bonus = skipped ? 0 : Math.max(0, Math.round(150 - rideT) * 20)
    const total = score + bonus
    const items = itemKinds
      .map((k) => `<li><canvas data-icon="${k}" width="48" height="48"></canvas><span>${ITEM_NAME[k][lang]}</span><b>${counts[k]}</b></li>`)
      .join('')
    const moleTxt = lang === 'en' ? `${tally.moleHit} hit · ${tally.moleDodge} dodged` : `あたった ${tally.moleHit}・よけた ${tally.moleDodge}`
    const mouseTxt = lang === 'en' ? `${tally.mouseSteal} took · ${tally.mouseShake} shook off` : `とられた ${tally.mouseSteal}・ふりおとした ${tally.mouseShake}`
    const names = <K extends string>(set: Set<K>, table: Record<K, { ja: string; en: string }>) => [...set].map((k) => table[k][lang]).join(lang === 'en' ? ' & ' : '・')
    const raceRows = raceLog.map((r) => `<dt>${tr('raceR', { who: RACER_NAME[r.kind][lang] })}</dt><dd>${tr(r.win ? 'raceWinR' : 'raceLoseR')}</dd>`).join('')
    const slothRow = tally.slothSeen > 0 ? `<dt>${tr('slothR')}</dt><dd>${lang === 'en' ? `${tally.five} high five(s)` : `ハイタッチ ${tally.five}`}</dd>` : ''
    resultCard.innerHTML = `
      <h1 class="tr-h">${tr('arrive')}</h1>
      ${skipped ? `<p class="tr-sub">${tr('skipped')}</p>` : wasAuto ? `<p class="tr-sub">${tr('autoDone')}</p>` : ''}
      <div class="tr-big">
        <div class="tr-big-score"><span>${tr('score')}</span><b data-total="${total}">0</b>${bonus > 0 ? `<small>${tr('timeBonus')} +${bonus}</small>` : ''}</div>
        ${skipped ? '' : `<div class="tr-big-time"><span>${tr('time')}</span><b>${fmt(rideT)}</b>${newBest ? `<em>${tr('newBest')}</em>` : ''}</div>`}
      </div>
      <h2 class="tr-h2">${tr('got')}</h2>
      <ul class="tr-items">${items}</ul>
      <h2 class="tr-h2">${tr('mischief')}</h2>
      <dl class="tr-tally">
        ${throwerKinds.size ? `<dt>${names(throwerKinds, THROWER_NAME)}</dt><dd>${moleTxt}</dd>` : ''}
        ${thiefKinds.size ? `<dt>${names(thiefKinds, THIEF_NAME)}</dt><dd>${mouseTxt}</dd>` : ''}
        <dt>${tr('batsR')}</dt><dd>${tally.bats}</dd>
        <dt>${tr('turboR')}</dt><dd>${lang === 'en' ? `${tally.turbo} time(s)` : `${tally.turbo}かい`}</dd>
        ${raceRows}${slothRow}
        ${boulder.seen && boulder.state === 'gone' ? `<dt>${tr('boulderR', { thing: CHASE_NAME[boulder.kind][lang] })}</dt><dd>${boulder.bumps === 0 ? tr('boulderClean') : tr('boulderHits', { n: String(boulder.bumps) })}</dd>` : ''}
      </dl>
      <div class="tr-actions">
        <button type="button" class="tr-btn tr-primary" data-act="go">${tr('goWorld')}</button>
        <button type="button" class="tr-btn" data-act="again">${tr('again')}</button>
      </div>`
    resultCard.querySelectorAll<HTMLCanvasElement>('canvas[data-icon]').forEach((c) => {
      const cx = c.getContext('2d')
      if (cx) drawItemIcon(cx, c.dataset.icon as ItemKind, 24, 24, 15, 0)
    })
    resultCard.hidden = false
    // 得点を数え上げる
    const bigScore = resultCard.querySelector<HTMLElement>('.tr-big-score b')
    if (bigScore) {
      const t0 = performance.now()
      const dur = reduce ? 1 : 1300
      const up = (now: number) => {
        const k = Math.min(1, (now - t0) / dur)
        bigScore.textContent = String(Math.round(total * (1 - Math.pow(1 - k, 3))))
        if (k < 1) requestAnimationFrame(up)
        else resultCard.querySelector('.tr-big')?.classList.add('is-done')
      }
      requestAnimationFrame(up)
    }
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
    // トロッコで着く時は出口の光の白へ（着いた側も白い画面から始まり、ワールドができたら薄れる）
    fadeEl.classList.toggle('is-white', viaTrolley)
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
    cart: { x: 0, y: 0, angle: 0, wheel: 0, onRail: true, cheer: 0, dizzy: 0, squash: 0, pump: 0, pumpA: 0 },
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
    turbo: 0,
    flash: 0,
    shakeX: 0,
    shakeY: 0,
    reduce,
    boulder: { on: false, x: 0, y: 0, rot: 0, r: BOULDER_R, kind: 'rock' },
    racers,
    sloths,
  }
  window.addEventListener('resize', () => {
    renderer.resize()
    if (phase === 'title') paintTitle()
  })
  const tick = (dt: number) => {
    if (phase !== 'leaving') {
      t += dt
      if (phase === 'ride' || phase === 'finale') rideT += dt
      if (phase === 'intro') stepIntro(dt)
      if (phase === 'finale') stepFinale(dt)
      else {
        // 物理は細かく刻む（速い時に線路の端や着地を飛ばさない）
        const sub = Math.max(1, Math.ceil(dt / 0.012))
        for (let i = 0; i < sub; i++) stepCart(dt / sub)
        if (phase === 'ride' || phase === 'ending') stepEvents(dt)
        stepBoulder(dt)
        stepRacers(dt)
        stepSloths(dt)
      }
      stepFx(dt)
      if (phase !== 'finale') stepCamera(dt)
      if (phase === 'ride' && cart.x > course.exitX - FINALE_AT) startFinale()
      if (phase === 'ending' && cart.x >= course.endX - 2 && cart.v < 6) {
        cart.v = 0
        window.setTimeout(showResult, reduce ? 300 : 900)
        phase = 'result'
      }
      const theme = themeAt(course, cart.x)
      try {
        audio.setDrive(cart.pump)
        audio.update(dt, theme, phase === 'finale' ? 520 : cart.v, cart.ri >= 0, phase === 'finale' || (cart.ri >= 0 && !!inRange('boost', cart.x)))
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
      tick(coach ? 0 : dt)
    } catch (err) {
      console.warn('[awl] トロッコの 1 コマで失敗（続けます）', err)
    }
    syncView()
    drawNow()
  }
  function syncView(): void {
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
    view.cart.pump = cart.pump
    view.cart.pumpA = cart.pumpA
    view.lampFlicker = lampFlicker
    view.boulder.on = boulder.state === 'fall' || boulder.state === 'roll' || boulder.state === 'drop'
    view.boulder.x = boulder.x
    view.boulder.y = boulder.y
    view.boulder.rot = boulder.rot
    view.boulder.kind = boulder.kind
    view.dirt = dirt
    view.dirtSeed = dirtSeed
    view.speedLines = speedLines
    view.flash = flash
    view.turbo = turboT > 0 ? Math.min(1, turboT / 0.4, (TURBO_LEN - turboT) / 0.2 + 0.3) : 0
    view.shakeX = shake > 0 ? (Math.random() - 0.5) * shake : 0
    view.shakeY = shake > 0 ? (Math.random() - 0.5) * shake : 0
  }
  function drawNow(): void {
    try {
      if (phase === 'finale') finale.draw({ k: fin.k, t, scroll: fin.scroll, rush: fin.rush, white: fin.white, cheer: cart.cheer, reduce })
      else renderer.draw(view)
    } catch (err) {
      console.warn('[awl] トロッコの絵で失敗（続けます）', err)
    }
  }
  requestAnimationFrame(frame)

  // 開発用の窓口（?debug=1 の時だけ）
  if (new URLSearchParams(location.search).get('debug') === '1') {
    ;(window as unknown as { __trolley?: unknown }).__trolley = { course, cart, counts, tally, depart, doSkip, get phase() { return phase }, audioOn: () => sound.synthOut('bgm') !== null, fin, finaleTap, get score() { return score }, boulder, racers, sloths, raceLog, lever: (on: boolean) => leverOn(on), sim: (sec: number) => { for (let i = 0; i < sec * 60; i++) tick(coach ? 0 : 1 / 60) }, get coach() { return coach }, get turbo() { return { turbo, turboT } },
      /** 開発用: いまの場面を n 回描いて、1 回あたりの時間（ms）の中央値と最大 */
      bench: (n: number) => {
        const a: number[] = []
        for (let i = 0; i < n; i++) {
          const d0 = performance.now()
          syncView()
          drawNow()
          a.push(performance.now() - d0)
        }
        a.sort((x, y) => x - y)
        return { phase, med: a[a.length >> 1], max: a[a.length - 1] }
      },
      /** 開発用: 1/60 秒進めて描き、トロッコの画面上の位置と拡大率を返す（カメラのがたつきを見る） */
      probe: () => {
        tick(1 / 60)
        syncView()
        drawNow()
        const p = renderer.toScreen(view.cart.x, view.cart.y)
        return { phase, x: p.x, y: p.y, zoom, cx: cart.x, v: cart.v }
      } }
  }
}
