/**
 * あそびかたツアー（チュートリアル）。初めての人が、ひと通りのことを順番に体験できるように案内する（2026-11-06 に作り直し）。
 * 画面を少し暗くして、次にさわる所（ボタン・名前の札・ワールドの中のライリーや観察スポット）だけを明るく抜き、矢印で示す。
 * 暗い所も押せる（抜いた所を押させるために画面をふさがない）。カードの「つぎへ」でその段を飛ばせて、「おわる」でいつでも終われる。
 * 「ともだちになる」は押すよう勧めるだけで、押すのは本人（押さなくても「つぎへ」で進める）。
 *
 * ことばは子どもにも読めるよう、漢字は小学校で習うものだけにして、すべてにふりがなをつける（`{漢字|よみ}` の書き方）。
 * 初めてワールドに入った時に 1 回だけ自動で出る（記録は awl.guide.v2。前のナビを見た人にも 1 回出す）。
 * 設定の「あそび方をもう一度見る」でいつでも最初から。?guide=1 で毎回出す（確認用）。
 */
import { getLang } from './i18n'
import type { Lang } from './i18n'

const STORAGE_KEY = 'awl.guide.v2'

/** 起きたことの知らせ（main.ts が呼ぶ）。いまの段が待っているものなら次へ進む */
export type GuideEvent = 'observeOpen' | 'observeClose' | 'befriend' | 'book' | 'bookClose' | 'chat' | 'spot' | 'scope' | 'scopeClose' | 'map' | 'mapClose' | 'near' | 'open' | 'visit'
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
  /** 「いっしょに行く」を押した時（main.ts がライリーのそばまで歩かせる） */
  onWalkTo: (fn: (target: 'riley') => void) => void
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
  /** 「いっしょに行く」ボタンを出す */
  walkTo?: 'riley'
}

const STEPS: Step[] = [
  {
    text: {
      ja: 'ようこそ！ これから、あそびかたを {一|ひと}つずつ しょうかいするよ。わからなくなったら「つぎへ」を おしてね。',
      en: 'Welcome! Let’s learn how to play, one step at a time. If you get stuck, tap “Next”.',
    },
    targets: [],
  },
  {
    text: {
      ja: 'まずは どうぶつに {会|あ}ってみよう！ {矢印|やじるし}の ライリーの ところまで {歩|ある}こう。{地面|じめん}を おすと、そこまで {歩|ある}くよ。',
      en: 'First, let’s meet an animal! Walk to Riley, where the arrow points. Tap the ground to walk there.',
    },
    targets: ['riley'],
    near: { target: 'riley', within: 9 },
    walkTo: 'riley',
  },
  {
    text: {
      ja: 'ライリーの {頭|あたま}の {上|うえ}に、{名前|なまえ}の ふだが {出|で}たよ。ふだを おしてみよう。',
      en: 'A name tag appeared above Riley’s head. Tap the tag.',
    },
    targets: ['.encounter-pin', '.lion-label[data-id="riley"]', 'riley'],
    until: ['observeOpen'],
  },
  {
    text: {
      ja: 'ここは どうぶつの へや。{動画|どうが}や プロフィールが {見|み}られるよ。{気|き}に{入|い}ったら「ともだちになる」を おしてね。おすかどうかは、きみが {決|き}めてね。',
      en: 'This is the animal’s room, with videos and a profile. If you like them, tap “Become friends”. It’s up to you.',
    },
    targets: ['#befriend', '#befriended'],
    until: ['befriend'],
  },
  {
    text: {
      ja: 'ともだちに なると「ともだち{帳|ちょう}」に のるよ。ともだち{帳|ちょう}を {開|ひら}いてみよう。',
      en: 'Friends appear in your Friend Book. Let’s open the Friend Book.',
    },
    targets: ['#befriend-see', '#open-book', '#observe-close'],
    until: ['book'],
  },
  {
    text: {
      ja: 'ともだちを おすと、その{子|こ}との トークが {開|ひら}くよ。',
      en: 'Tap a friend to open your talk with them.',
    },
    targets: ['#book-list button[data-chat]', '#book-empty'],
    until: ['chat'],
  },
  {
    text: {
      ja: 'トークには、{飼育員|しいくいん}さんからの おしらせや {写真|しゃしん}が とどくよ。おてがみも {書|か}けるよ。「{会|あ}いに{行|い}く」を おすと、いつでも {動画|どうが}で {会|あ}えるよ。',
      en: 'In the talk you get notices and photos from the keepers, and you can write letters. “Go see” lets you watch the video any time.',
    },
    targets: ['#chat-visit', '#chat-log'],
  },
  {
    text: {
      ja: 'つぎは「{観察|かんさつ}スポット」に {行|い}ってみよう。{光|ひか}っている ボタンを おすと、そこまで {歩|ある}くよ。',
      en: 'Next, let’s go to the observation spot. Tap the glowing button to walk there.',
    },
    targets: ['#chat-back', '#book-close', '#observe-close', '#goto-spot', 'spot'],
    until: ['spot'],
  },
  {
    text: {
      ja: '{着|つ}いたね！「スコープをのぞく」を おしてみよう。',
      en: 'You made it! Tap “Look through the scope”.',
    },
    targets: ['#goto-spot', 'spot'],
    until: ['scope'],
  },
  {
    text: {
      ja: 'ここが「アニマルスコープ」。いろいろな どうぶつの {動画|どうが}が {見|み}られるよ。',
      en: 'This is the Animal Scope. You can watch videos of many animals here.',
    },
    targets: [],
  },
  {
    text: {
      ja: 'ワールドは ぜんぶで {七|なな}つ。ワールドを おすと、そこに いる どうぶつが {見|み}られるよ。{山|やま}の あいだの {道|みち}を {歩|ある}くと、ほかの ワールドにも {行|い}けるよ。',
      en: 'There are seven worlds. Tap a world to see who lives there. Walk the paths between the mountains to visit other worlds.',
    },
    targets: ['#catalog [data-world]'],
  },
  {
    text: {
      ja: 'さいごに「{地図|ちず}」を {開|ひら}いてみよう。',
      en: 'Finally, let’s open the map.',
    },
    targets: ['#catalog [data-back]', '#minimap-expand'],
    until: ['map'],
  },
  {
    text: {
      ja: '{地図|ちず}には、{会|あ}った どうぶつが のるよ。{行|い}きたい ところを おすと、そこまで {歩|ある}くよ。',
      en: 'Animals you have met appear on the map. Tap a place to walk there.',
    },
    targets: ['#map-canvas'],
  },
  {
    text: {
      ja: 'これで おしまい！ よく できました。もう{一度|いちど} {見|み}たいときは、ホームの「{設定|せってい}」から いつでも {見|み}られるよ。',
      en: 'That’s everything — well done! To see this again, open Settings on the home screen.',
    },
    targets: [],
  },
]

const UI: Record<'next' | 'done' | 'quit' | 'walk' | 'title' | 'away', Text> = {
  next: { ja: 'つぎへ', en: 'Next' },
  done: { ja: 'おわる', en: 'Finish' },
  quit: { ja: 'チュートリアルを おわる', en: 'End the tutorial' },
  walk: { ja: 'いっしょに {行|い}く', en: 'Walk me there' },
  title: { ja: 'あそびかた', en: 'How to play' },
  away: { ja: 'あと {m} m', en: '{m} m to go' },
}

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
  return r
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
    <div class="coach-head"><span class="coach-title"></span><span class="coach-count"></span></div>
    <p class="coach-text"></p>
    <div class="coach-actions">
      <button type="button" class="coach-walk"></button>
      <button type="button" class="coach-next"></button>
    </div>
    <button type="button" class="coach-quit"></button>`
  document.body.append(hole, arrow, awayEl, card)
  const titleEl = card.querySelector('.coach-title') as HTMLElement
  const countEl = card.querySelector('.coach-count') as HTMLElement
  const textEl = card.querySelector('.coach-text') as HTMLElement
  const walkBtn = card.querySelector('.coach-walk') as HTMLButtonElement
  const nextBtn = card.querySelector('.coach-next') as HTMLButtonElement
  const quitBtn = card.querySelector('.coach-quit') as HTMLButtonElement

  const forced = new URLSearchParams(location.search).get('guide') === '1'
  let active = false
  let inWorld = false
  let index = 0
  let world: GuideFrame = { riley: null, spot: null }
  let scrolledFor = -1
  const walkListeners: Array<(t: 'riley') => void> = []

  const label = (k: keyof typeof UI) => UI[k][getLang()]
  const html = (s: string) => (getLang() === 'ja' ? rubyHtml(s) : esc(s))

  const render = () => {
    const step = STEPS[index]
    const last = index === STEPS.length - 1
    titleEl.innerHTML = html(label('title'))
    countEl.textContent = `${index + 1} / ${STEPS.length}`
    textEl.innerHTML = html(step.text[getLang()])
    nextBtn.innerHTML = html(last ? label('done') : label('next'))
    quitBtn.innerHTML = html(label('quit'))
    quitBtn.hidden = last
    walkBtn.innerHTML = html(label('walk'))
    walkBtn.hidden = !step.walkTo
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
    for (const t of step.targets) {
      if (t === 'riley' || t === 'spot') {
        const p = world[t]
        if (!p) continue
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
          el.scrollIntoView({ block: 'end', behavior: document.body.classList.contains('is-reduce-motion') ? 'auto' : 'smooth' })
        }
      }
      const r = visibleRect(el)
      if (r) {
        const pad = 8
        rect = { x: r.left - pad, y: r.top - pad, w: r.width + pad * 2, h: r.height + pad * 2, round: false }
        awayEl.textContent = ''
        break
      }
    }
    hole.hidden = false
    if (rect) {
      hole.classList.toggle('is-round', rect.round)
      hole.classList.remove('is-none')
      hole.style.transform = `translate(${rect.x}px, ${rect.y}px)`
      hole.style.width = `${rect.w}px`
      hole.style.height = `${rect.h}px`
      // 矢印は穴の上（上に場所が無ければ下）から穴を指す
      arrow.hidden = false
      const above = rect.y > 90
      const ax = rect.x + rect.w / 2
      const ay = above ? rect.y - 8 : rect.y + rect.h + 8
      arrow.style.transform = `translate(${ax}px, ${ay}px) rotate(${above ? 0 : 180}deg)`
      arrow.classList.toggle('is-below', !above)
      setAway(ax, above ? ay - 84 : ay + 84)
    } else {
      // 目印が無い段（説明だけ）・目印が画面の外: 穴をとじて全体を少し暗く
      hole.classList.add('is-none')
      hole.style.width = '0px'
      hole.style.height = '0px'
      hole.style.transform = `translate(${window.innerWidth / 2}px, ${window.innerHeight / 2}px)`
      if (offTarget) {
        // 画面の外: 画面のふちに、目印のある向きを指す矢印（カメラの後ろなら向きを裏返す）
        arrow.hidden = false
        const cx = window.innerWidth / 2
        const cy = window.innerHeight / 2
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
    // カードは上。照らす所と重なる時は下へ（スティックが出ている時はその上）。どちらも重なるなら重なりの少ない方
    const H = window.innerHeight
    const ch = card.offsetHeight || 200
    const topY = 72
    const stick = document.getElementById('stick')
    const reserve = stick && visibleRect(stick) ? 200 : 24
    const lowY = H - reserve - ch
    const overlap = (a0: number, a1: number) => (rect ? Math.max(0, Math.min(a1, rect.y + rect.h) - Math.max(a0, rect.y)) : 0)
    const oTop = overlap(topY, topY + ch)
    const oLow = overlap(lowY, lowY + ch)
    const low = oTop > 0 && oLow < oTop
    card.style.top = low ? `${Math.max(8, lowY)}px` : ''
    card.classList.toggle('is-low', low)
  }

  const go = (i: number) => {
    if (i >= STEPS.length) {
      stop()
      return
    }
    index = i
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
