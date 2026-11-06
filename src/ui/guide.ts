/**
 * あそびかたツアー（チュートリアル）。初めての人が、ひと通りのことを順番に体験できるように案内する（2026-11-06 に作り直し）。
 * 次にさわる所（ボタン・名前の札・ワールドの中のライリーや観察スポット）を光る輪で囲み、矢印で示す。画面の部品を示す時だけ、まわりを少し暗くする。
 * 暗い所も押せる（抜いた所を押させるために画面をふさがない）。吹き出しの「つぎへ」でその段を飛ばせて、「やめる」でいつでも終われる。
 * 「ともだちになる」は押すよう勧めるだけで、押すのは本人（押さなくても「つぎへ」で進める）。
 *
 * 案内役は双眼鏡のキャラクター「スコップ」。セリフはおしゃべりでダジャレ好きな口調で、その場その場でひと言（11/7、くにの「キャラクターの横に寄り添って
 * 案内する形に」）。ワールドでは 3D のスコップ（world/scopCompanion.ts）が主人公の横についてきて、吹き出しはその頭の上に付く。
 * 動物の部屋・ともだち帳・トーク・一覧・地図を開いている間（3D のスコップが隠れる）と、3D のスコップが読めない時（?scop=off も）は、
 * 吹き出しに 2D のスコップ（public/splash-scop.webp）を付けて、示す所に重ならない画面のすみに出す。
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
  /** 3D のスコップの頭の上（吹き出しの付く所）。読めていなければ null */
  scop: WorldPoint | null
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
  /** いま示しているワールドの中の目印（3D のスコップがそちらを向く） */
  worldTarget: () => 'riley' | 'spot' | null
  /** 段が変わった時（3D のスコップがしゃべるように跳ねる） */
  onStep: (fn: () => void) => void
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
  /** この段で、カードが必ずよける物（照らす所より重く数える）。照らす所が画面いっぱいで、どこに置いても重なる段に使う */
  clear?: string[]
}

const STEPS: Step[] = [
  {
    text: {
      ja: 'ぼく、スコップ！ いっしょに あそびかたを のぞいてみよう！',
      en: 'Hi, I’m Scop! Let’s scope out how to play!',
    },
    targets: [],
  },
  {
    text: {
      ja: 'ライリーに {会|あ}いに いこう！',
      en: 'Let’s go meet Riley!',
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
      ja: '{名前|なまえ}の ふだを おしてみて！',
      en: 'Tap the name tag — tag, you’re it!',
    },
    targets: ['.encounter-pin', '.lion-label[data-id="riley"]', 'riley'],
    until: ['observeOpen'],
  },
  {
    text: {
      ja: '「ともだちになる」を おすかどうかは、きみが {決|き}めてね。',
      en: 'Tap “Become friends” if you like. It’s up to you.',
    },
    targets: ['#befriend', '#befriended'],
    until: ['befriend'],
    needs: 'observe',
  },
  {
    text: {
      ja: 'ともだち{帳|ちょう}を {開|ひら}いてみよう！',
      en: 'Let’s open your Friend Book!',
    },
    // ともだちにならずに「つぎへ」した時は、モニターの「閉じる」→ 帳のボタン（モニターの下に隠れた帳のボタンは照らさない）
    targets: ['#befriend-see', '#observe-close', '#open-book'],
    until: ['book'],
  },
  {
    text: {
      ja: 'ともだちを おすと、トークが {開|ひら}くよ。',
      en: 'Tap a friend to open your talk.',
    },
    targets: ['#book-list button[data-chat]'],
    until: ['chat'],
    needs: 'friendRow',
  },
  {
    text: {
      ja: '{飼育員|しいくいん}さんの おしらせが とどくよ。「{会|あ}いに{行|い}く」も おしてみて！',
      en: 'Keepers send notes here. Try “Go see”!',
    },
    targets: ['#chat-visit', '#chat-log'],
    until: ['visit', 'observeOpen'],
    needs: 'chat',
  },
  {
    text: {
      ja: 'つぎは {光|ひか}っている {観察|かんさつ}スポットへ しゅっぱーつ！',
      en: 'Next stop: the glowing observation spot!',
    },
    // 開いている画面を閉じてから（映像 → トーク → 帳の順）、スポットのボタンかスポットそのもの
    targets: ['#observe-close', '#chat-back', '#book-close', '#goto-spot', 'spot'],
    until: ['spot'],
  },
  {
    text: {
      ja: 'とうちゃーく！「スコープをのぞく」を おしてね。',
      en: 'Spot on! Tap “Look through the scope”.',
    },
    targets: ['#goto-spot[data-mode="scope"]', 'spot'],
    until: ['scope'],
    needs: 'arrived',
  },
  {
    text: {
      ja: '{動画|どうが}が いっぱい！ レンズが くぎづけ！',
      en: 'So many videos — my lenses are glued!',
    },
    targets: [],
    needs: 'catalog',
  },
  {
    text: {
      ja: 'ワールドは {七|なな}つ！ おすと、そこの どうぶつが {見|み}られるよ。',
      en: 'Seven worlds! Tap one to see who lives there.',
    },
    targets: ['#catalog [data-world]'],
    needs: 'catalog',
  },
  {
    text: {
      ja: 'さいごは {地図|ちず}を {開|ひら}こう！',
      en: 'Last stop: open the map!',
    },
    // 一覧のワールドのページ → 一覧へ戻る → 一覧を閉じる → 地図
    targets: ['#observe-close', '#chat-back', '#book-close', '#catalog [data-list]', '#catalog [data-back]', '#minimap-expand'],
    until: ['map'],
  },
  {
    text: {
      ja: '{行|い}きたい ところを おすと、そこまで {歩|ある}くよ。',
      en: 'Tap a place and you’ll walk there.',
    },
    targets: ['#map-canvas', '#map-3d'],
    until: ['mapClose'],
    needs: 'map',
    // 地図は大きいのでカードはどこかで地図に重なる。見出し（2D／3D・動物・閉じる）は隠さない（閉じると次の段へ進む）
    clear: ['#map .sheet-head'],
  },
  {
    text: {
      ja: 'やったね！ また {見|み}たいときは ホームの {設定|せってい}から よんでね。',
      en: 'Hooray! Call me from Settings any time.',
    },
    targets: [],
  },
]

const UI: Record<'next' | 'done' | 'quit' | 'quitLabel' | 'walk' | 'away', Text> = {
  next: { ja: 'つぎへ', en: 'Next' },
  done: { ja: 'おわる', en: 'Finish' },
  quit: { ja: 'やめる', en: 'Skip' },
  quitLabel: { ja: 'あそびかたを おわる', en: 'End the tour' },
  walk: { ja: 'いっしょに {行|い}く', en: 'Walk me there' },
  away: { ja: 'あと {m} m', en: '{m} m to go' },
}

/** 完了の祝いの星（吹き出しのまわり）。左・上は %、散る向きは px */
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
  // スコップの吹き出し（クラス名は前のカードのまま。ほかの画面の重なりの判定がこの名前で除いている）
  const card = document.createElement('div')
  card.className = 'coach-card'
  card.hidden = true
  card.setAttribute('role', 'dialog')
  card.setAttribute('aria-live', 'polite')
  card.innerHTML = `
    <span class="coach-face" aria-hidden="true"><img src="/splash-scop.webp" alt="" width="560" height="624" decoding="async" /></span>
    <div class="coach-body">
      <p class="coach-text"></p>
      <div class="coach-actions">
        <button type="button" class="coach-quit"></button>
        <span class="coach-count"></span>
        <button type="button" class="coach-walk"></button>
        <button type="button" class="coach-next"></button>
      </div>
    </div>
    <span class="coach-tail" aria-hidden="true"></span>
    <span class="stars" aria-hidden="true"></span>`
  document.body.append(hole, arrow, awayEl, card)
  // 画面のふちの矢印（ライリー・スポットが画面の外）を押しても、そこまで歩く
  arrow.addEventListener('click', () => {
    if (lit.world && !lit.rect) for (const fn of walkListeners) fn(lit.world)
  })
  const countEl = card.querySelector('.coach-count') as HTMLElement
  const textEl = card.querySelector('.coach-text') as HTMLElement
  const walkBtn = card.querySelector('.coach-walk') as HTMLButtonElement
  const nextBtn = card.querySelector('.coach-next') as HTMLButtonElement
  const quitBtn = card.querySelector('.coach-quit') as HTMLButtonElement
  const starsEl = card.querySelector('.stars') as HTMLElement
  /** 完了の段: 吹き出しのまわりに金の星が散る（ともだち登録の祝いと同じ星。動きをへらす時は静かに出して消す） */
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
  /** 矢印の向きを選んだ時の目印の四角（同じ所なら選び直さない） */
  let arrowFor = ''
  let arrowPick: { ax: number; ay: number; deg: number; dx: number; dy: number } | null = null

  const forced = new URLSearchParams(location.search).get('guide') === '1'
  let active = false
  let inWorld = false
  let index = 0
  let world: GuideFrame = { riley: null, spot: null, scop: null }
  let scrolledFor = -1
  /** いま照らしている物（DOM の要素、またはワールドの目印の名前）と、その画面の四角 */
  let lit: { el: Element | null; world: 'riley' | 'spot' | null; rect: { x: number; y: number; w: number; h: number } | null } = { el: null, world: null, rect: null }
  /** 開いている画面（知らせで覚える。分からない時は画面に出ているかで見る） */
  const opened = { observe: false, book: false, chat: false, catalog: false, map: false }
  const walkListeners: Array<(t: 'riley' | 'spot') => void> = []
  const stepListeners: Array<() => void> = []
  /** 最後に吹き出しに出した段（段が変わった時だけスコップを跳ねさせる） */
  let shownIndex = -1

  const label = (k: keyof typeof UI) => UI[k][getLang()]
  const html = (s: string) => (getLang() === 'ja' ? rubyHtml(s) : esc(s))
  // 吹き出しの本文は文節の中で改行せず、文の切れ目で先に改行する
  const textHtml = (s: string) => (getLang() === 'ja' ? phraseHtml(s, { sentences: true }) : esc(s))

  const render = () => {
    const step = STEPS[index]
    const last = index === STEPS.length - 1
    countEl.textContent = `${index + 1} / ${STEPS.length}`
    textEl.innerHTML = textHtml(step.text[getLang()])
    nextBtn.innerHTML = html(last ? label('done') : label('next'))
    quitBtn.innerHTML = html(label('quit'))
    quitBtn.setAttribute('aria-label', label('quitLabel'))
    quitBtn.hidden = last
    walkBtn.innerHTML = html(label('walk'))
    walkBtn.hidden = !step.walkTo
    const wasDone = card.classList.contains('is-done')
    card.classList.toggle('is-done', last)
    if (last && !wasDone) celebrate()
    if (shownIndex !== index) {
      shownIndex = index
      for (const fn of stepListeners) fn()
    }
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
      document.body.classList.remove('coach-on')
      shownIndex = -1
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

    // 吹き出しの置き場所。示す所と、隠したくない物（映像・お手紙の入力欄）に重ならない所を選ぶ。
    // 照らす所との重なりは 10 倍、段ごとの必ずよける物（clear）は 100 倍重く数える。
    // ワールドにいて 3D のスコップが見えている時は、スコップの頭の上（入らなければ右・左）に付けて、しっぽでスコップを指す。
    // 画面（動物の部屋・帳・トーク・一覧・地図）を開いている時と、3D のスコップがいない時は、2D のスコップを付けて画面のすみに
    // 目印が画面の外: 画面のふちに、目印のある向きを指す矢印（カメラの後ろなら向きを裏返す）。吹き出しと重なる時は、あとでふちに沿ってずらす
    let edge: { ax: number; ay: number; deg: number; dx: number; dy: number } | null = null
    const avoid: Array<{ x: number; y: number; w: number; h: number }> = []
    if (!rect && offTarget) {
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
      // 矢印の絵は下向き（+y）。向きの角度に合わせて回す
      edge = { ax: cx + dx * k, ay: cy + dy * k, deg: (Math.atan2(dy, dx) * 180) / Math.PI - 90, dx, dy }
    }
    const short = H < 560
    const stick = document.getElementById('stick')
    const reserve = stick && visibleRect(stick) && !short ? 200 : 12
    const keep = KEEP_CLEAR.map((sel) => visibleRect(document.querySelector(sel))).filter((r): r is DOMRect => r !== null)
    const must = (step.clear ?? []).map((sel) => visibleRect(document.querySelector(sel))).filter((r): r is DOMRect => r !== null)
    const m = 12
    const overlap = (x: number, y: number, w: number, h: number, r: { x: number; y: number; w: number; h: number }) =>
      Math.max(0, Math.min(x + w, r.x + r.w + m) - Math.max(x, r.x - m)) * Math.max(0, Math.min(y + h, r.y + r.h + m) - Math.max(y, r.y - m))
    const cost = (x: number, y: number, cw: number, ch: number) =>
      (rect ? overlap(x, y, cw, ch, rect) * 10 : 0) +
      avoid.reduce((sum, k) => sum + overlap(x, y, cw, ch, k) * 10, 0) +
      keep.reduce((sum, k) => sum + overlap(x, y, cw, ch, { x: k.left, y: k.top, w: k.width, h: k.height }), 0) +
      must.reduce((sum, k) => sum + overlap(x, y, cw, ch, { x: k.left, y: k.top, w: k.width, h: k.height }) * 100, 0)
    const OFF = 1e7
    const sheetOpen = opened.observe || opened.book || opened.chat || opened.catalog || opened.map
    const sp = world.scop
    let cardX = 0
    let cardY = 0
    let placed = false
    if (!sheetOpen && sp && sp.onScreen) {
      // スコップの体（頭の上から下）は隠さない
      avoid.push({ x: sp.x - 50, y: sp.y - 6, w: 100, h: 120 })
      card.classList.add('is-world')
      const cw = card.offsetWidth || 240
      const ch = card.offsetHeight || 110
      const gap = 18
      // tail: しっぽの向き（down = 吹き出しの下にしっぽ、left / right = 横）と、しっぽの付く位置（吹き出しの中の px）
      // 頭の上（真ん中・左寄せ・右寄せ）→ 右 → 左の順
      const opts: Array<{ x: number; y: number; tail: 'down' | 'left' | 'right' }> = [
        { x: sp.x - cw / 2, y: sp.y - ch - gap, tail: 'down' },
        { x: sp.x - cw + 34, y: sp.y - ch - gap, tail: 'down' },
        { x: sp.x - 34, y: sp.y - ch - gap, tail: 'down' },
        { x: sp.x + gap + 8, y: sp.y - ch / 2 + 24, tail: 'left' },
        { x: sp.x - gap - 8 - cw, y: sp.y - ch / 2 + 24, tail: 'right' },
      ]
      let best: { x: number; y: number; tail: 'down' | 'left' | 'right'; at: number } | null = null
      let bestA = Infinity
      for (const o of opts) {
        const x = Math.max(8, Math.min(W - cw - 8, o.x))
        const y = o.y
        const at = o.tail === 'down' ? sp.x - x : sp.y - y
        let a = cost(x, y, cw, ch)
        if (y < 8 || y + ch > H - (o.tail === 'down' ? 8 : reserve)) a += OFF
        if (o.tail === 'down' ? at < 22 || at > cw - 22 : at < 18 || at > ch - 18) a += OFF
        // 横に付ける時、画面のふちで押し戻されたら、しっぽがスコップに届かない
        if (o.tail !== 'down' && Math.abs(x - o.x) > 2) a += OFF
        if (a < bestA - 1) {
          best = { x, y, tail: o.tail, at }
          bestA = a
        }
      }
      if (best && bestA < OFF) {
        cardX = best.x
        cardY = best.y
        card.dataset.tail = best.tail
        card.style.setProperty('--tail-at', `${Math.round(best.at)}px`)
        placed = true
      }
    }
    if (!placed) {
      card.classList.remove('is-world')
      delete card.dataset.tail
      const cw = card.offsetWidth || 300
      const ch = card.offsetHeight || 110
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
      let best = cands[0]
      let bestA = Infinity
      for (const c of cands) {
        const a = cost(c[0], c[1], cw, ch)
        if (a < bestA - 1) {
          best = c
          bestA = a
        }
      }
      cardX = Math.max(8, best[0])
      cardY = Math.max(8, best[1])
    }
    const cw = card.offsetWidth || 240
    const ch = card.offsetHeight || 110
    card.style.left = `${cardX}px`
    card.style.top = `${cardY}px`

    if (rect) {
      hole.classList.toggle('is-round', rect.round)
      // ワールドの中の目印は輪だけ（まわりを暗くしない）。画面の部品はまわりを少し暗くして目立たせる
      hole.classList.toggle('is-ring', rect.round)
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
      if (arrowPick) {
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
      // 目印が無い段（説明だけ）・目印が画面の外: 穴をとじる（暗くしない）
      hole.classList.add('is-none')
      hole.classList.remove('is-ring')
      hole.style.width = '0px'
      hole.style.height = '0px'
      hole.style.transform = `translate(${W / 2}px, ${H / 2}px)`
      if (edge && offTarget) {
        // 画面の外: 画面のふちの矢印（向きと場所は上で決めた）
        arrow.hidden = false
        const { ax, deg, dx, dy } = edge
        let { ay } = edge
        // 矢印・「あと ○ m」が吹き出しに重なるなら、ふちに沿って吹き出しの上へ（入らなければ下へ）ずらす
        const near = (px: number, py: number, r: number) => px > cardX - r && px < cardX + cw + r && py > cardY - r && py < cardY + ch + r
        if (near(ax - dx * 40, ay - dy * 40, 44) || near(ax - dx * 96, ay - dy * 96, 30)) {
          const up = cardY - 56 - Math.max(0, -dy) * 96
          ay = up > 110 ? up : cardY + ch + 64 + Math.max(0, dy) * 96
        }
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
    arrowFor = ''
    render()
  }

  const start = () => {
    active = true
    index = 0
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
    worldTarget: () => (show() ? lit.world : null),
    onStep: (fn) => {
      stepListeners.push(fn)
    },
  }
}
