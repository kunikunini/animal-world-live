import { sound } from '../audio/sound'
import type { ScopTalk } from '../data/scopTalks'

/**
 * ワールドのスコップと話す画面。
 * - 「声をかける」: 話せるスコップのそばに来ると、スコップの頭の上に出る
 * - メッセージ窓: 画面の下の RPG のような窓。名前の札「スコップ」と、1 文字ずつ「ピッ」と出る文（うんちくなので、読む速さで）。
 *   文の速さは声の長さに合わせる。窓を押すと、出ている途中なら全部出し、出きっていれば閉じる。
 *   動きをへらす時は、はじめから全部出して「ピッ」も鳴らさない
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
const unitHtml = (u: Unit) => (u.rt ? `<ruby>${esc(u.base)}<rt>${esc(u.rt)}</rt></ruby>` : esc(u.base))

/** 声が無い時（音を切っている時）の 1 秒あたりの文字数（よみの文字数で数える） */
const PLAIN_CPS = 12

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

  const render = () => {
    textEl.innerHTML = chars.slice(0, shown).map(unitHtml).join('')
    const done = shown >= chars.length
    moreEl.hidden = !done
    // 長い文は窓の中で下へ送る
    textEl.scrollTop = textEl.scrollHeight
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
      if (on && screen) call.style.transform = `translate(-50%, -100%) translate(${screen.x.toFixed(0)}px, ${screen.y.toFixed(0)}px)`
    },
    onCall: (fn) => {
      callListeners.push(fn)
    },
    open: (talk) => {
      chars = units(talk.text)
      totalW = chars.reduce((a, u) => a + u.w, 0)
      // 声の長さで出しきる（少し早めに出しきって、声が文を追いかける）。声が鳴らない時はふつうの速さ
      cps = sound.voiceOn() ? Math.max(7, Math.min(20, totalW / Math.max(1, talk.sec * 0.92))) : PLAIN_CPS
      shown = 0
      shownW = 0
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
