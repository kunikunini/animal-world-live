import { sound } from '../audio/sound'
import type { ScopTalk } from '../data/scopTalks'

/**
 * ワールドのスコップと話す画面。
 * - 「声をかける」: 話せるスコップのそばに来ると、スコップの頭の上に出る
 * - メッセージ窓: 画面の下の RPG のような窓。名前の札「スコップ」と、1 文字ずつ「ピッ」と出る文（うんちくなので、読む速さで）。
 *   文の速さは声の長さに合わせる。窓を押すと、出ている途中なら全部出し、出きっていれば閉じる。
 *   動きをへらす時は、はじめから全部出して「ピッ」も鳴らさない
 * - 文ははじめから全部並べておき、まだの文字は見えなくしておく（出る途中で言葉が次の行へ跳ねたり、窓がのびたりしないように）
 * - 話し終わって（文が出きって、声も終わって）1 秒たったら、窓はフッと消える。動きをへらす時はフェードなしで消す
 */
export interface ScopTalkUi {
  /** 「声をかける」の位置（画面の座標）。null で隠す */
  setCall: (screen: { x: number; y: number } | null) => void
  onCall: (fn: () => void) => void
  open: (talk: ScopTalk) => void
  close: () => void
  isOpen: () => boolean
  setReduceMotion: (on: boolean) => void
}

/** 文の 1 まとまり: ふつうの 1 文字か、ルビ付きの言葉（{漢字|よみ}）。ルビ付きは、よみの文字数ぶんの時間で出す */
type Unit = { base: string; rt?: string; w: number }
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)
function units(text: string): Unit[] {
  const out: Unit[] = []
  const re = /\{([^|}]+)\|([^}]+)\}/g
  let last = 0
  for (let m = re.exec(text); m; m = re.exec(text)) {
    for (const c of Array.from(text.slice(last, m.index))) out.push({ base: c, w: 1 })
    out.push({ base: m[1], rt: m[2], w: Array.from(m[2]).length })
    last = m.index + m[0].length
  }
  for (const c of Array.from(text.slice(last))) out.push({ base: c, w: 1 })
  return out
}
const unitHtml = (u: Unit) => `<span class="is-yet">${u.rt ? `<ruby>${esc(u.base)}<rt>${esc(u.rt)}</rt></ruby>` : esc(u.base)}</span>`

/** 声が無い時（音を切っている時）の 1 秒あたりの文字数（よみの文字数で数える） */
const PLAIN_CPS = 12
/** 話し終わってから窓が消えはじめるまで（ms） */
const LINGER_MS = 1000
/** フェードの長さ（ms。style.css の .scop-msg の transition と合わせる） */
const FADE_MS = 400
/** 「声をかける」と画面の端のすきま（px） */
const CALL_EDGE = 8
/** 「声をかける」が上に跳ねる分（style.css の scop-call-bob の margin-top の最大） */
const CALL_BOB = 15

export function createScopTalk(root: HTMLElement = document.body): ScopTalkUi {
  const call = document.createElement('button')
  call.type = 'button'
  call.className = 'scop-call'
  call.hidden = true
  call.innerHTML = '<svg class="ico ico-fill" aria-hidden="true"><use href="#i-bubble" /></svg><span>こえを かける</span>'
  call.setAttribute('aria-label', 'スコップに こえを かける')

  const win = document.createElement('div')
  win.className = 'scop-msg'
  win.hidden = true
  win.setAttribute('role', 'dialog')
  win.setAttribute('aria-label', 'スコップの おはなし')
  win.innerHTML = `<div class="scop-msg-name">スコップ</div>
    <p class="scop-msg-text" aria-live="polite"></p>
    <span class="scop-msg-more" aria-hidden="true">▼</span>
    <button type="button" class="scop-msg-close" aria-label="とじる">×</button>`
  const textEl = win.querySelector('.scop-msg-text') as HTMLElement
  const moreEl = win.querySelector('.scop-msg-more') as HTMLElement
  const closeBtn = win.querySelector('.scop-msg-close') as HTMLButtonElement
  root.append(call, win)

  const callListeners: Array<() => void> = []
  let reduce = false
  let chars: Unit[] = []
  // 出した量（よみの文字数）と、出しきった まとまりの数
  let shownW = 0
  let totalW = 0
  let shown = 0
  let cps = PLAIN_CPS
  let raf = 0
  let startAt = 0
  let lastBlip = 0
  let open = false
  let spans: HTMLElement[] = []
  let revealed = 0
  // 話しはじめた時刻と声の長さ（声を切っていても、この長さは読む時間として待つ）
  let openAt = 0
  let talkMs = 0
  let endTimer = 0
  let fadeTimer = 0
  let callW = 0
  let callH = 0

  const clearTimers = () => {
    if (endTimer) clearTimeout(endTimer)
    if (fadeTimer) clearTimeout(fadeTimer)
    endTimer = 0
    fadeTimer = 0
  }
  const render = () => {
    for (; revealed < shown; revealed++) spans[revealed].classList.remove('is-yet')
    const done = shown >= chars.length
    moreEl.hidden = !done
    // 長い文は窓の中で下へ送る（最後に出た文字が見えるところまで）
    const last = spans[shown - 1]
    if (last) {
      const bottom = last.offsetTop + last.offsetHeight
      if (bottom > textEl.scrollTop + textEl.clientHeight) textEl.scrollTop = bottom - textEl.clientHeight
    }
    if (done && !endTimer && !fadeTimer) waitEnd()
  }
  // 文が出きったあと、声が終わるのを待ってから 1 秒おいて消す
  const waitEnd = () => {
    endTimer = 0
    if (!open) return
    if (performance.now() < openAt + talkMs || sound.narrating()) {
      endTimer = window.setTimeout(waitEnd, 200)
      return
    }
    endTimer = window.setTimeout(fadeOut, LINGER_MS)
  }
  const fadeOut = () => {
    endTimer = 0
    if (!open) return
    if (reduce) {
      close()
      return
    }
    win.classList.add('is-fading')
    // transitionend が来ない時（transition が切られている時など）も閉じる
    fadeTimer = window.setTimeout(close, FADE_MS + 100)
  }
  const tick = (now: number) => {
    raf = 0
    if (!open) return
    // 時間ぶんのよみの文字数まで出す（ルビ付きの言葉は、よみの 1 文字目で丸ごと出す）
    const wantW = Math.min(totalW, Math.floor(((now - startAt) / 1000) * cps))
    let want = shown
    let w = shownW
    while (want < chars.length && w < wantW) {
      w += chars[want].w
      want++
    }
    if (want > shown) {
      // 空白と記号では鳴らさない。鳴らしすぎないよう 45ms あける
      const added = chars.slice(shown, want).some((u) => !!u.rt || /[^\s、。！？!?「」…〜ー]/.test(u.base))
      shown = want
      shownW = w
      if (added && now - lastBlip > 45) {
        lastBlip = now
        sound.blip()
      }
      render()
    }
    if (shown < chars.length) raf = requestAnimationFrame(tick)
  }
  const finish = () => {
    if (raf) cancelAnimationFrame(raf)
    raf = 0
    shown = chars.length
    shownW = totalW
    render()
  }
  const close = () => {
    clearTimers()
    win.classList.remove('is-fading')
    if (!open) return
    open = false
    if (raf) cancelAnimationFrame(raf)
    raf = 0
    sound.stopNarration()
    win.hidden = true
  }

  call.addEventListener('click', (e) => {
    e.stopPropagation()
    for (const fn of callListeners) fn()
  })
  win.addEventListener('transitionend', (e) => {
    if (e.target === win && e.propertyName === 'opacity' && win.classList.contains('is-fading')) close()
  })
  win.addEventListener('click', (e) => {
    e.stopPropagation()
    if (shown < chars.length) finish()
    else close()
  })
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    close()
  })

  return {
    setCall: (screen) => {
      const on = screen !== null && !open
      if (call.hidden === on) call.hidden = !on
      if (on && screen) {
        // 画面の端では止めて、はみ出さないようにする（幅・高さは一度測って覚えておく）
        if (!callW) {
          callW = call.offsetWidth
          callH = call.offsetHeight
        }
        const x = Math.max(CALL_EDGE + callW / 2, Math.min(window.innerWidth - CALL_EDGE - callW / 2, screen.x))
        const y = Math.max(CALL_EDGE + callH + CALL_BOB, Math.min(window.innerHeight - CALL_EDGE, screen.y))
        call.style.transform = `translate(-50%, -100%) translate(${x.toFixed(0)}px, ${y.toFixed(0)}px)`
      }
    },
    onCall: (fn) => {
      callListeners.push(fn)
    },
    open: (talk) => {
      chars = units(talk.text)
      totalW = chars.reduce((a, u) => a + u.w, 0)
      // 声の長さで出しきる（少し早めに出しきって、声が文を追いかける）。声が鳴らない時はふつうの速さ
      cps = sound.voiceOn() ? Math.max(7, Math.min(20, totalW / Math.max(1, talk.sec * 0.92))) : PLAIN_CPS
      clearTimers()
      win.classList.remove('is-fading')
      shown = 0
      shownW = 0
      revealed = 0
      textEl.innerHTML = chars.map(unitHtml).join('')
      spans = Array.from(textEl.children) as HTMLElement[]
      textEl.scrollTop = 0
      openAt = performance.now()
      talkMs = talk.sec * 1000
      open = true
      win.hidden = false
      call.hidden = true
      sound.narrate(talk.voice, 'scop')
      if (reduce) {
        finish()
        return
      }
      render()
      startAt = performance.now()
      lastBlip = 0
      if (!raf) raf = requestAnimationFrame(tick)
    },
    close,
    isOpen: () => open,
    setReduceMotion: (on) => {
      reduce = on
    },
  }
}
