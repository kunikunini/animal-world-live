/**
 * あそびかたツアー（チュートリアル）。初めての人が、ひと通りのことを順番に体験できるように案内する（2026-11-06 に作り直し）。
 * 画面を少し暗くして、次にさわる所（ボタン・名前の札・ワールドの中のライリーや観察スポット）だけを明るく抜き、矢印で示す。
 * 暗い所も押せる（抜いた所を押させるために画面をふさがない）。カードの「つぎへ」でその段を飛ばせて、「おわる」でいつでも終われる。
 * 「ともだちになる」は押すよう勧めるだけで、押すのは本人（押さなくても「つぎへ」で進める）。
 *
 * 案内役は双眼鏡のキャラクター「スコップ」（カードの見出しに public/splash-scop.webp の静止画、セリフはおしゃべりでダジャレ好きな口調。11/6）。
 * ことばは子どもにも読めるよう、漢字は小学校で習うものだけにして、すべてにふりがなをつける（`{漢字|よみ}` の書き方）。
 * 初めてワールドに入った時に 1 回だけ自動で出る（記録は awl.guide.v2。前のナビを見た人にも 1 回出す）。
 * 設定の「あそび方をもう一度見る」でいつでも最初から。?guide=1 で毎回出す（確認用）。
 */
import { phraseHtml } from './phrase'
import { getLang } from './i18n'
import type { Lang } from './i18n'

const STORAGE_KEY = 'awl.guide.v2'

/** 起きたことの知らせ（main.ts が呼ぶ）。いまの段が待っているものなら次へ進む */
export type GuideEvent = 'nearRiley' | 'observeOpen' | 'observeClose' | 'befriend' | 'book' | 'bookClose' | 'chat' | 'spot' | 'scope' | 'scopeClose' | 'map' | 'mapClose' | 'near' | 'open' | 'visit'
/** 前のナビの節目の名前（main.ts の呼び出しをそのまま使う） */
export type GuideStep = GuideEvent

/** ワールドの中の目印（main.ts が毎コマ画面の位置を渡す） */
export interface WorldPoint {
  /** 画面の位置（px）。カメラの後ろなら onScreen が false */
  x: number
  y: number
  onScreen: boolean
  /** カメラの後ろにある（x, y は裏返さずにそのまま） */
  behind: boolean
  /** プレイヤーからの距離（m） */
  distance: number
}

export interface GuideFrame {
  riley: WorldPoint | null
  spot: WorldPoint | null
}

export interface Guide {
  /** 初めてワールドに入った時に呼ぶ。記録が無ければ始める */
  autoStart: (hasFriends: boolean) => void
  /** 最初から出す（設定の「もう一度見る」） */
  start: () => void
  /** 途中でやめる・終える。記録を付けて隠す */
  stop: () => void
  isActive: () => boolean
  /** ワールドにいる間だけ出す（ホームでは隠す。進み具合は残す） */
  setInWorld: (on: boolean) => void
  /** 起きたことを伝える */
  reach: (event: GuideEvent) => void
  /** 前のナビの名残り（歩いた距離）。いまは使わない */
  walk: (meters: number) => void
  /** 毎コマ: ワールドの中の目印の画面の位置。暗幕の穴と矢印を合わせる */
  frame: (f: GuideFrame) => void
  /** 「いっしょに行く」・照らしたライリーやスポットを押した時（main.ts がそこまで歩かせる） */
  onWalkTo: (fn: (target: 'riley' | 'spot') => void) => void
}

type Text = Record<Lang, string>
interface Step {
  text: Text
  /** 明るく抜く所。前から順に、見えている最初のものを使う。'riley' / 'spot' はワールドの中の目印 */
  targets: string[]
  /** この知らせが来たら次の段へ */
  until?: GuideEvent[]
  /** ワールドの目印までこの距離（m）より近づいたら次へ */
  near?: { target: 'riley'; within: number }
  /** 「いっしょに行く」ボタンを出す（照らしたライリー・スポットそのものを押しても歩く） */
  walkTo?: 'riley'
  /** この段の説明に要る画面。開いていない時（前の段を「つぎへ」で飛ばした時など）はこの段を飛ばす */
  needs?: 'observe' | 'book' | 'chat' | 'catalog' | 'map' | 'arrived' | 'friendRow'
}

const STEPS: Step[] = [
  {
    text: {
      ja: 'ぼく、スコップ！ あそびかたを すこしずつ しょうかいするよ。わからなくなったら「つぎへ」を おしてね。',
      en: 'Hi, I’m Scop! Let’s scope out how to play, step by step. Stuck? Tap “Next”.',
    },
    targets: [],
  },
  {
    text: {
      ja: 'ぼくと どうぶつに {会|あ}いに いこう！ {矢印|やじるし}の ライリーを おすか「いっしょに {行|い}く」を おすと、ライリーの ところまで {歩|ある}くよ。',
      en: 'Let’s go meet an animal! Tap Riley (where the arrow points) or “Walk me there” to walk over.',
    },
    targets: ['riley'],
    // 名前の札（双眼鏡のピン）が出るのはライリーから約 5.4m（当たり判定＋4.2m）なので、その内側に入ったら次へ
    near: { target: 'riley', within: 4.5 },
    // ライリーの札が出たら（いちばん近い子がライリーになったら）次へ
    until: ['nearRiley'],
    walkTo: 'riley',
  },
  {
    text: {
      ja: 'ライリーの {頭|あたま}の {上|うえ}に、{名前|なまえ}の ふだが {出|で}たね。ふだを おしてみよう！',
      en: 'A name tag popped up over Riley. Tap it — tag, you’re it!',
    },
    targets: ['.encounter-pin', '.lion-label[data-id="riley"]', 'riley'],
    until: ['observeOpen'],
  },
  {
    text: {
      ja: 'ここは どうぶつの へや。{動画|どうが}や プロフィールが {見|み}られるよ。{気|き}に{入|い}ったら「ともだちになる」を おしてね。おすかどうかは、きみが {決|き}めてね。',
      en: 'Welcome to the animal’s room, with videos and a profile! If you like them, tap “Become friends”. It’s up to you.',
    },
    targets: ['#befriend', '#befriended'],
    until: ['befriend'],
    needs: 'observe',
  },
  {
    text: {
      ja: 'ともだちに なると「ともだち{帳|ちょう}」に のるよ。ちょうど いいから {開|ひら}こう！',
      en: 'Friends go in your Friend Book. Let’s open the Friend Book!',
    },
    // ともだちにならずに「つぎへ」した時は、モニターの「閉じる」→ 帳のボタン（モニターの下に隠れた帳のボタンは照らさない）
    targets: ['#befriend-see', '#observe-close', '#open-book'],
    until: ['book'],
  },
  {
    text: {
      ja: 'ともだちを おすと、トークが {開|ひら}くよ。ドキドキ！',
      en: 'Tap a friend to open your talk — ooh!',
    },
    targets: ['#book-list button[data-chat]'],
    until: ['chat'],
    needs: 'friendRow',
  },
  {
    text: {
      ja: 'トークには、{飼育員|しいくいん}さんからの おしらせや {写真|しゃしん}が とどくよ。おてがみも {書|か}けるよ。「{会|あ}いに{行|い}く」を おすと、いつでも {動画|どうが}で {会|あ}えるよ。さあ、おしてね！',
      en: 'In the talk you get notices and photos from the keepers, and you can write letters. “Go see” lets you watch the video any time — try it!',
    },
    targets: ['#chat-visit', '#chat-log'],
    until: ['visit', 'observeOpen'],
    needs: 'chat',
  },
  {
    text: {
      ja: 'つぎは「{観察|かんさつ}スポット」へ しゅっぱーつ！ {光|ひか}っている ところを {順番|じゅんばん}に おしてね。スポットまで {歩|ある}くよ。',
      en: 'Next stop: the observation spot! Tap the glowing places one by one and you’ll walk there.',
    },
    // 開いている画面を閉じてから（映像 → トーク → 帳の順）、スポットのボタンかスポットそのもの
    targets: ['#observe-close', '#chat-back', '#book-close', '#goto-spot', 'spot'],
    until: ['spot'],
  },
  {
    text: {
      ja: 'とうちゃーく！「スコープをのぞく」を おしてね。',
      en: 'Spot on! Now tap “Look through the scope”.',
    },
    targets: ['#goto-spot[data-mode="scope"]', 'spot'],
    until: ['scope'],
    needs: 'arrived',
  },
  {
    text: {
      ja: 'ここが「アニマルスコープ」。どうぶつの {動画|どうが}が いっぱい！ レンズが くぎづけ！',
      en: 'This is the Animal Scope, full of animal videos. My lenses are glued!',
    },
    targets: [],
    needs: 'catalog',
  },
  {
    text: {
      ja: 'ワールドは なんと {七|なな}つ！ ワールドを おすと、そこに いる どうぶつが {見|み}られるよ。{山|やま}の あいだの {道|みち}を {歩|ある}くと、ほかの ワールドにも {行|い}けるよ。',
      en: 'Seven worlds in all! Tap a world to see who lives there. Walk the paths between the mountains to visit other worlds.',
    },
    targets: ['#catalog [data-world]'],
    needs: 'catalog',
  },
  {
    text: {
      ja: 'さいごは「{地図|ちず}」を {開|ひら}こう！',
      en: 'Last stop: let’s open the map!',
    },
    // 一覧のワールドのページ → 一覧へ戻る → 一覧を閉じる → 地図
    targets: ['#observe-close', '#chat-back', '#book-close', '#catalog [data-list]', '#catalog [data-back]', '#minimap-expand'],
    until: ['map'],
  },
  {
    text: {
      ja: '{地図|ちず}には、{会|あ}った どうぶつが のるよ。{行|い}きたい ところを おすと、そこまで {歩|ある}くよ。どこへ {行|い}く？',
      en: 'Animals you’ve met appear on the map. Tap a place to walk there — where to?',
    },
    targets: ['#map-canvas', '#map-3d'],
    until: ['mapClose'],
    needs: 'map',
  },
  {
    text: {
      ja: 'やったね、これで おしまい！ また {見|み}たいときは、ホームの「{設定|せってい}」から ぼくを よんでね。',
      en: 'Hooray, all done! To see this again, call me from Settings on the home screen.',
    },
    targets: [],
  },
]

const UI: Record<'next' | 'done' | 'quit' | 'walk' | 'title' | 'away' | 'min' | 'expand', Text> = {
  next: { ja: 'つぎへ', en: 'Next' },
  done: { ja: 'おわる', en: 'Finish' },
  quit: { ja: 'あそびかたを おわる', en: 'End the tour' },
  min: { ja: 'ちいさく する', en: 'Hide' },
  expand: { ja: 'ひらく', en: 'Show' },
  walk: { ja: 'いっしょに {行|い}く', en: 'Walk me there' },
  title: { ja: 'あそびかた', en: 'How to play' },
  away: { ja: 'あと {m} m', en: '{m} m to go' },
}

/** 完了の祝いの星（スコップのまわり）。左・上は %、散る向きは px */
const CELEBRATE_STARS = [
  [-10, 4, -16, -22],
  [70, -6, 18, -26],
  [-14, 52, -24, 4],
  [84, 40, 26, -4],
  [4, 86, -14, 20],
  [64, 88, 18, 20],
]

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)
/** `{漢字|よみ}` をふりがなつきの HTML に */
function rubyHtml(s: string): string {
  return esc(s).replace(/\{([^|}]+)\|([^}]+)\}/g, '<ruby>$1<rt>$2</rt></ruby>')
}

function readDone(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}
function writeDone(): void {
  try {
    localStorage.setItem(STORAGE_KEY, '1')
  } catch {
    // 保存できなくても続ける
  }
}

/** 目に見えている要素か（hidden・表示なし・大きさ 0・画面の外は見えていない） */
function visibleRect(el: Element | null): DOMRect | null {
  if (!el || !(el instanceof HTMLElement)) return null
  if (el.closest('[hidden]')) return null
  const r = el.getBoundingClientRect()
  if (r.width < 2 || r.height < 2) return null
  if (r.bottom < 0 || r.right < 0 || r.top > window.innerHeight || r.left > window.innerWidth) return null
  const cs = getComputedStyle(el)
  if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.05) return null
  // ほかの画面（映像・帳など）の下に隠れていないか: 真ん中を押した時に当たるのがこの要素（かその中）か。ツアーのカードは数えない
  const cx = Math.min(window.innerWidth - 1, Math.max(0, r.left + r.width / 2))
  const cy = Math.min(window.innerHeight - 1, Math.max(0, r.top + r.height / 2))
  const hit = document.elementFromPoint(cx, cy)
  if (hit && hit !== el && !el.contains(hit) && !hit.closest('.coach-card')) return null
  return r
}

/** el が見えるよう、いちばん近いスクロールする箱の中だけを動かす（外側の箱やページは動かさない） */
function scrollIntoBox(el: HTMLElement): void {
  let box = el.parentElement
  while (box && box !== document.body) {
    const oy = getComputedStyle(box).overflowY
    if ((oy === 'auto' || oy === 'scroll') && box.scrollHeight > box.clientHeight) break
    box = box.parentElement
  }
  if (!box || box === document.body) return
  const br = box.getBoundingClientRect()
  const er = el.getBoundingClientRect()
  const margin = 24
  let dy = 0
  if (er.bottom > br.bottom - margin) dy = er.bottom - (br.bottom - margin)
  else if (er.top < br.top + margin) dy = er.top - (br.top + margin)
  if (dy) box.scrollBy({ top: dy, behavior: document.body.classList.contains('is-reduce-motion') ? 'auto' : 'smooth' })
}

/** ツアーのカードで隠したくない物（ツアー中もこれを見ながら・さわりながら進めるように）: 動物の部屋の映像、トークのお手紙の入力 */
const KEEP_CLEAR = ['#observe-video', '#chat .ch-compose', '.ch-compose']

/** (x, y) にある、ツアー以外のいちばん上の要素が「見たり押したりする物」（文字・ボタン・入力・映像）か */
function contentAt(x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) return true
  for (const el of document.elementsFromPoint(x, y)) {
    if (el.closest('.coach-card, .coach-arrow, .coach-hole, .coach-away')) continue
    if (el.closest('button, a, input, textarea, select, video, label, [role="button"]')) return true
    for (const n of el.childNodes) if (n.nodeType === Node.TEXT_NODE && n.textContent?.trim()) return true
    return false
  }
  return false
}

/**
 * 矢印を置く向きを選ぶ。上・下・右・左の順に、矢印の絵（48px）の場所が画面の中で、文字・ボタン・映像・カードに重ならない所。
 * 画面の部品を照らす時（round でない）にどこも重なるなら null（矢印を出さない）。ワールドの目印（round）は重なりのいちばん少ない所
 */
function pickArrow(
  r: { x: number; y: number; w: number; h: number },
  cardBox: { x: number; y: number; w: number; h: number },
  round: boolean,
): { ax: number; ay: number; deg: number; dx: number; dy: number } | null {
  const cx = r.x + r.w / 2
  const cy = r.y + r.h / 2
  // ax, ay: 矢印の先。deg: 絵（下向き）の回し方。box: 絵のある四角。dx, dy: 指す向き
  const opts = [
    { ax: cx, ay: r.y - 8, deg: 0, dx: 0, dy: 1, box: [cx - 24, r.y - 64] },
    { ax: cx, ay: r.y + r.h + 8, deg: 180, dx: 0, dy: -1, box: [cx - 24, r.y + r.h + 16] },
    { ax: r.x + r.w + 8, ay: cy, deg: 90, dx: -1, dy: 0, box: [r.x + r.w + 16, cy - 24] },
    { ax: r.x - 8, ay: cy, deg: -90, dx: 1, dy: 0, box: [r.x - 64, cy - 24] },
  ]
  let best: (typeof opts)[number] | null = null
  let bestHits = Infinity
  for (const o of opts) {
    const [bx, by] = o.box
    if (bx < 4 || by < 4 || bx + 48 > window.innerWidth - 4 || by + 48 > window.innerHeight - 4) continue
    let hits = 0
    if (bx < cardBox.x + cardBox.w && bx + 48 > cardBox.x && by < cardBox.y + cardBox.h && by + 48 > cardBox.y) hits += 5
    for (const [px, py] of [[24, 24], [8, 8], [40, 8], [8, 40], [40, 40]]) if (contentAt(bx + px, by + py)) hits++
    if (hits < bestHits) {
      best = o
      bestHits = hits
    }
    if (hits === 0) break
  }
  if (!best || (!round && bestHits > 0)) return null
  return { ax: best.ax, ay: best.ay, deg: best.deg, dx: best.dx, dy: best.dy }
}

export function createGuide(): Guide {
  // 古いナビのカード（index.html）は使わない
  document.getElementById('guide')?.remove()

  const hole = document.createElement('div')
  hole.className = 'coach-hole'
  hole.hidden = true
  hole.setAttribute('aria-hidden', 'true')
  const arrow = document.createElement('div')
  arrow.className = 'coach-arrow'
  arrow.hidden = true
  arrow.setAttribute('aria-hidden', 'true')
  arrow.innerHTML = '<svg viewBox="0 0 48 48"><path d="M24 44 8 22h10V4h12v18h10z"/></svg>'
  // 「あと ○ m」: 矢印と一緒に回らないよう別の要素
  const awayEl = document.createElement('div')
  awayEl.className = 'coach-away'
  awayEl.setAttribute('aria-hidden', 'true')
  const card = document.createElement('div')
  card.className = 'coach-card'
  card.hidden = true
  card.setAttribute('role', 'dialog')
  card.setAttribute('aria-live', 'polite')
  card.innerHTML = `
    <div class="coach-head"><span class="coach-scop" aria-hidden="true"><img src="/splash-scop.webp" alt="" width="560" height="624" decoding="async" /><span class="stars"></span></span><span class="coach-title"></span><span class="coach-count"></span><button type="button" class="coach-min" aria-expanded="true"></button></div>
    <p class="coach-text"></p>
    <div class="coach-actions">
      <button type="button" class="coach-walk"></button>
      <button type="button" class="coach-next"></button>
    </div>
    <button type="button" class="coach-quit"></button>`
  document.body.append(hole, arrow, awayEl, card)
  // 画面のふちの矢印（ライリー・スポットが画面の外）を押しても、そこまで歩く
  arrow.addEventListener('click', () => {
    if (lit.world && !lit.rect) for (const fn of walkListeners) fn(lit.world)
  })
  const titleEl = card.querySelector('.coach-title') as HTMLElement
  const countEl = card.querySelector('.coach-count') as HTMLElement
  const textEl = card.querySelector('.coach-text') as HTMLElement
  const walkBtn = card.querySelector('.coach-walk') as HTMLButtonElement
  const nextBtn = card.querySelector('.coach-next') as HTMLButtonElement
  const quitBtn = card.querySelector('.coach-quit') as HTMLButtonElement
  const minBtn = card.querySelector('.coach-min') as HTMLButtonElement
  const starsEl = card.querySelector('.coach-scop .stars') as HTMLElement
  /** 完了の段: スコップのまわりに金の星が散る（ともだち登録の祝いと同じ星。動きをへらす時は静かに出して消す） */
  let starTimer = 0
  const celebrate = () => {
    window.clearTimeout(starTimer)
    const still = document.body.classList.contains('is-reduce-motion')
    starsEl.innerHTML = CELEBRATE_STARS.map(
      ([x, y, dx, dy]) => `<svg viewBox="0 0 24 24" style="left:${x}%;top:${y}%;--dx:${dx}px;--dy:${dy}px"><use href="#i-star" /></svg>`,
    ).join('')
    starsEl.classList.remove('is-burst', 'is-still')
    void starsEl.offsetWidth
    starsEl.classList.add(still ? 'is-still' : 'is-burst')
    starTimer = window.setTimeout(
      () => {
        starsEl.classList.remove('is-burst', 'is-still')
        starsEl.innerHTML = ''
      },
      still ? 1600 : 900,
    )
  }
  /** カードを小さくたたんでいるか（下の画面を全部さわれるように。段が変わると開き直す） */
  let minimized = false
  /** 矢印の向きを選んだ時の目印の四角（同じ所なら選び直さない） */
  let arrowFor = ''
  let arrowPick: { ax: number; ay: number; deg: number; dx: number; dy: number } | null = null

  const forced = new URLSearchParams(location.search).get('guide') === '1'
  let active = false
  let inWorld = false
  let index = 0
  let world: GuideFrame = { riley: null, spot: null }
  let scrolledFor = -1
  /** いま照らしている物（DOM の要素、またはワールドの目印の名前）と、その画面の四角 */
  let lit: { el: Element | null; world: 'riley' | 'spot' | null; rect: { x: number; y: number; w: number; h: number } | null } = { el: null, world: null, rect: null }
  /** 開いている画面（知らせで覚える。分からない時は画面に出ているかで見る） */
  const opened = { observe: false, book: false, chat: false, catalog: false, map: false }
  const walkListeners: Array<(t: 'riley' | 'spot') => void> = []

  const label = (k: keyof typeof UI) => UI[k][getLang()]
  const html = (s: string) => (getLang() === 'ja' ? rubyHtml(s) : esc(s))
  // カードの本文は文節の中で改行しない
  const textHtml = (s: string) => (getLang() === 'ja' ? phraseHtml(s) : esc(s))

  const render = () => {
    const step = STEPS[index]
    const last = index === STEPS.length - 1
    titleEl.innerHTML = html(label('title'))
    countEl.textContent = `${index + 1} / ${STEPS.length}`
    textEl.innerHTML = textHtml(step.text[getLang()])
    nextBtn.innerHTML = html(last ? label('done') : label('next'))
    quitBtn.innerHTML = html(label('quit'))
    quitBtn.hidden = last
    walkBtn.innerHTML = html(label('walk'))
    walkBtn.hidden = !step.walkTo
    minBtn.innerHTML = html(minimized ? label('expand') : label('min'))
    minBtn.setAttribute('aria-expanded', String(!minimized))
    card.classList.toggle('is-min', minimized)
    const wasDone = card.classList.contains('is-done')
    card.classList.toggle('is-done', last)
    if (last && !wasDone) celebrate()
    document.body.classList.toggle('coach-min', minimized)
    card.classList.remove('is-refresh')
    void card.offsetWidth
    card.classList.add('is-refresh')
    place()
  }

  const show = () => active && inWorld
  const sync = () => {
    const on = show()
    card.hidden = !on
    if (!on) {
      hole.hidden = true
      arrow.hidden = true
      awayEl.hidden = true
      document.body.classList.remove('coach-on', 'coach-min')
    } else {
      document.body.classList.add('coach-on')
      render()
      ensureLoop()
    }
  }

  /** 「あと ○ m」の札を、矢印のそばの (x, y) を中心に置く（画面からはみ出さないように） */
  const setAway = (x: number, y: number) => {
    awayEl.hidden = !awayEl.textContent || !show()
    const w = awayEl.offsetWidth || 70
    const cx = Math.max(w / 2 + 8, Math.min(window.innerWidth - w / 2 - 8, x))
    awayEl.style.transform = `translate(${cx - w / 2}px, ${y - 12}px)`
  }

  /** 暗幕の穴・矢印・カードの位置をいまの段の目印に合わせる */
  const place = () => {
    if (!show()) return
    const step = STEPS[index]
    let rect: { x: number; y: number; w: number; h: number; round: boolean } | null = null
    let offTarget: WorldPoint | null = null
    lit = { el: null, world: null, rect: null }
    for (const t of step.targets) {
      if (t === 'riley' || t === 'spot') {
        const p = world[t]
        if (!p) continue
        lit.world = t
        if (p.onScreen) {
          const size = Math.max(90, Math.min(200, 1400 / Math.max(4, p.distance)))
          rect = { x: p.x - size / 2, y: p.y - size / 2, w: size, h: size, round: true }
          awayEl.textContent = p.distance > 12 ? label('away').replace('{m}', String(Math.round(p.distance))) : ''
        } else offTarget = p
        break
      }
      const el = document.querySelector(t)
      // 一覧の中など、下へ隠れている目印は段の始めに 1 回だけ見える所へ
      if (el instanceof HTMLElement && !el.closest('[hidden]') && scrolledFor !== index) {
        const er = el.getBoundingClientRect()
        if (er.height > 0 && (er.bottom > window.innerHeight || er.top < 0)) {
          scrolledFor = index
          scrollIntoBox(el)
        }
      }
      const r = visibleRect(el)
      if (r) {
        lit.el = el
        const pad = 8
        rect = { x: r.left - pad, y: r.top - pad, w: r.width + pad * 2, h: r.height + pad * 2, round: false }
        awayEl.textContent = ''
        break
      }
    }
    hole.hidden = false
    lit.rect = rect
    const W = window.innerWidth
    const H = window.innerHeight

    // カードの置き場所: 上・下（スマホ横・横長は左・右も）のうち、照らす所と、隠したくない物（映像・お手紙の入力欄）に重ならない所。
    // 照らす所との重なりは 10 倍重く数える。どこも重なるなら重なりのいちばん小さい所（それでも隠れる時は「ちいさく する」でたためる）。
    // 下に置く時はスティックが出ていればその上
    const cw = card.offsetWidth || 320
    const ch = card.offsetHeight || 200
    const short = H < 560
    const stick = document.getElementById('stick')
    const reserve = stick && visibleRect(stick) && !short ? 200 : 12
    const cands: Array<[number, number]> = [
      [(W - cw) / 2, short ? 12 : 72],
      [(W - cw) / 2, H - reserve - ch],
    ]
    if (W > cw * 2 + 40) {
      // 横長の画面: 左右も候補（スマホ横では左右を先に）
      const side: Array<[number, number]> = [
        [12, (H - ch) / 2],
        [W - cw - 12, (H - ch) / 2],
      ]
      if (short) cands.unshift(...side)
      else cands.push(...side)
    }
    const keep = KEEP_CLEAR.map((sel) => visibleRect(document.querySelector(sel))).filter((r): r is DOMRect => r !== null)
    const m = 12
    const overlap = (x: number, y: number, w: number, h: number, r: { x: number; y: number; w: number; h: number }) =>
      Math.max(0, Math.min(x + w, r.x + r.w + m) - Math.max(x, r.x - m)) * Math.max(0, Math.min(y + h, r.y + r.h + m) - Math.max(y, r.y - m))
    const cost = (x: number, y: number) =>
      (rect ? overlap(x, y, cw, ch, rect) * 10 : 0) + keep.reduce((sum, k) => sum + overlap(x, y, cw, ch, { x: k.left, y: k.top, w: k.width, h: k.height }), 0)
    let best = cands[0]
    let bestA = Infinity
    for (const c of cands) {
      const a = cost(c[0], c[1])
      if (a < bestA - 1) {
        best = c
        bestA = a
      }
    }
    const cardX = Math.max(8, best[0])
    const cardY = Math.max(8, best[1])
    card.style.left = `${cardX}px`
    card.style.top = `${cardY}px`

    if (rect) {
      hole.classList.toggle('is-round', rect.round)
      hole.classList.remove('is-none')
      hole.style.transform = `translate(${rect.x}px, ${rect.y}px)`
      hole.style.width = `${rect.w}px`
      hole.style.height = `${rect.h}px`
      // 矢印: 穴の上・下・右・左のうち、文字・ボタン・映像・カードに重ならない向きから穴を指す。
      // 画面の部品（DOM）を照らしている時、どの向きも重なるなら矢印は出さない（光る穴で分かる）
      const key = `${index}:${Math.round(rect.x / 6)}:${Math.round(rect.y / 6)}:${Math.round(rect.w / 6)}:${Math.round(rect.h / 6)}:${Math.round(cardY / 6)}`
      if (key !== arrowFor) {
        arrowFor = key
        arrowPick = pickArrow(rect, { x: cardX, y: cardY, w: cw, h: ch }, rect.round)
      }
      if (arrowPick && !minimized) {
        arrow.hidden = false
        arrow.style.transform = `translate(${arrowPick.ax}px, ${arrowPick.ay}px) rotate(${arrowPick.deg}deg)`
        arrow.classList.toggle('is-below', arrowPick.deg === 180)
        setAway(arrowPick.ax - arrowPick.dx * 84, arrowPick.ay - arrowPick.dy * 84)
      } else {
        arrow.hidden = true
        setAway(rect.x + rect.w / 2, rect.y > 90 ? rect.y - 40 : rect.y + rect.h + 16)
      }
    } else {
      arrowFor = ''
      // 目印が無い段（説明だけ）・目印が画面の外: 穴をとじて全体を少し暗く
      hole.classList.add('is-none')
      hole.style.width = '0px'
      hole.style.height = '0px'
      hole.style.transform = `translate(${W / 2}px, ${H / 2}px)`
      if (offTarget) {
        // 画面の外: 画面のふちに、目印のある向きを指す矢印（カメラの後ろなら向きを裏返す）
        arrow.hidden = false
        const cx = W / 2
        const cy = H / 2
        let dx = offTarget.x - cx
        let dy = offTarget.y - cy
        if (offTarget.behind) {
          dx = -dx
          dy = Math.abs(dy) + cy
        }
        const len = Math.hypot(dx, dy) || 1
        dx /= len
        dy /= len
        const mx = cx - 56
        const my = cy - 120
        const k = Math.min(Math.abs(dx) > 1e-3 ? mx / Math.abs(dx) : Infinity, Math.abs(dy) > 1e-3 ? my / Math.abs(dy) : Infinity)
        const ax = cx + dx * k
        const ay = cy + dy * k
        // 矢印の絵は下向き（+y）。向きの角度に合わせて回す
        const deg = (Math.atan2(dy, dx) * 180) / Math.PI - 90
        arrow.classList.toggle('is-below', Math.abs(deg) > 90)
        arrow.style.transform = `translate(${ax}px, ${ay}px) rotate(${deg}deg) scale(1.5)`
        awayEl.textContent = label('away').replace('{m}', String(Math.round(offTarget.distance)))
        setAway(ax - dx * 96, ay - dy * 96)
      } else {
        arrow.hidden = true
        awayEl.textContent = ''
      }
    }
  }

  const seen = (sel: string) => visibleRect(document.querySelector(sel)) !== null
  const needMet = (n: Step['needs']) => {
    if (!n) return true
    if (n === 'arrived') return (world.spot?.distance ?? Infinity) < 5
    if (n === 'chat') return opened.chat || seen('#book-chat')
    // ともだち帳が開いていて、ともだちの行がある（ともだちにならずに進んだ時は、トークの段を飛ばす）
    if (n === 'friendRow') return opened.book && document.querySelector('#book-list button[data-chat]') !== null
    return opened[n]
  }
  let goSeq = 0
  const go = (i: number, retry = true) => {
    if (i >= STEPS.length) {
      stop()
      return
    }
    // 説明に要る画面が開いていない段は飛ばす（前の段を「つぎへ」で飛ばした時に、無い画面の話をしない）。
    // 開く途中のこともあるので、1 回だけ少し待ってから決める
    if (i < STEPS.length - 1 && !needMet(STEPS[i].needs)) {
      if (retry) {
        const seq = ++goSeq
        window.setTimeout(() => {
          if (seq === goSeq && active) go(i, false)
        }, 600)
        return
      }
      go(i + 1, true)
      return
    }
    goSeq++
    index = i
    scrolledFor = -1
    minimized = false
    arrowFor = ''
    render()
  }

  const start = () => {
    active = true
    index = 0
    minimized = false
    sync()
  }

  const stop = () => {
    if (!active) return
    active = false
    writeDone()
    sync()
  }

  nextBtn.addEventListener('click', () => go(index + 1))
  // 照らした物を押したら、その段は済み: 知らせを待つ段は知らせで、待たない段は押したことで次へ。
  // 照らしたライリー・スポット（ワールドの中）を押したら、そこまで歩く（地面ではなく動物を押しても歩くように）
  const inLit = (x: number, y: number) => {
    const r = lit.rect
    return r !== null && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h
  }
  document.addEventListener(
    'click',
    (e) => {
      if (!show() || card.contains(e.target as Node)) return
      const step = STEPS[index]
      const at = index
      if (lit.el && lit.el.contains(e.target as Node)) {
        if (!step.until) window.setTimeout(() => index === at && go(index + 1), 120)
        return
      }
      if (lit.world && inLit(e.clientX, e.clientY)) {
        const target = lit.world
        // ワールドのタップ移動のあとに上書きする
        window.setTimeout(() => {
          for (const fn of walkListeners) fn(target)
        }, 30)
      }
    },
    true,
  )
  quitBtn.addEventListener('click', stop)
  minBtn.addEventListener('click', () => {
    minimized = !minimized
    render()
  })
  walkBtn.addEventListener('click', () => {
    const t = STEPS[index].walkTo
    if (t) for (const fn of walkListeners) fn(t)
  })
  window.addEventListener('resize', place)
  // 一覧・帳・地図を開いている間はワールドの毎コマが止まることがあるので、ツアーも自分で毎コマ位置を合わせる（出ている間だけ）
  let loopOn = false
  const loop = () => {
    if (!show()) {
      loopOn = false
      return
    }
    place()
    requestAnimationFrame(loop)
  }
  const ensureLoop = () => {
    if (loopOn || !show()) return
    loopOn = true
    requestAnimationFrame(loop)
  }

  return {
    autoStart: () => {
      // 途中でホームへ戻って入り直した時は、続きから
      if (active) return
      if (forced || !readDone()) start()
    },
    start,
    stop,
    isActive: () => active,
    setInWorld: (on) => {
      inWorld = on
      sync()
    },
    reach: (event) => {
      if (event === 'observeOpen' || event === 'observeClose') opened.observe = event === 'observeOpen'
      if (event === 'book' || event === 'bookClose') opened.book = event === 'book'
      if (event === 'chat') opened.chat = true
      if (event === 'bookClose') opened.chat = false
      if (event === 'scope' || event === 'scopeClose') opened.catalog = event === 'scope'
      if (event === 'map' || event === 'mapClose') opened.map = event === 'map'
      if (!active) return
      const step = STEPS[index]
      if (step.until?.includes(event)) {
        go(index + 1)
      }
      // もうともだちの子を開いた時（もう一度見る時）は、main.ts が開いたすぐあとに befriend を送るので「ともだちになる」の段は飛ぶ
    },
    walk: () => {
      // 前のナビの「歩く」の段は無くなった
    },
    frame: (f) => {
      world = f
      if (!show()) return
      const step = STEPS[index]
      if (step.near) {
        const p = f[step.near.target]
        if (p && p.distance < step.near.within) {
          go(index + 1)
        }
      }
    },
    onWalkTo: (fn) => {
      walkListeners.push(fn)
    },
  }
}
