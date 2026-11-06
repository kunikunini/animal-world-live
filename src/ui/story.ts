import { sound } from '../audio/sound'
import { ANIMALS } from '../data/animals'
import { WORLDS, type WorldKey } from '../data/worlds'
import { faceMarkup } from './faces'
import { esc } from './html'
import { getLang, t } from './i18n'
import { hideView, showView } from './transition'

/**
 * おはなし: ワールドに入る前に 1 回だけ見る、紙芝居ふうのオープニング（クレイアニメの絵 12 枚）。
 * 6 人の子どもたちに ふしぎな箱が届く → 青い双眼鏡 → のぞくとサバンナ → 歩く・跳ぶ → ライリー（おとなの雌ライオン）と出会う（名前の札）
 * → 収録映像で本当の姿も見られる → ともだちになるかは きみが決める → ともだち帳 → 7 つのワールド → みんなで。
 * 絵は期間中に画像生成で作ったもの（出所は README）。言葉は全部 HTML で重ね、漢字は小学校までで全部ルビ。
 * ナレーションは黄色いパーカーの子の声（ElevenLabs）、最後の一言は 6 人全員。間はサバンナの曲（ループしない 1 本）。
 * コマは自動で進み（1 コマ 5〜8 秒、ナレーションが終わるまで）、絵を押すか「つぎへ」で先へ、「とまる」で一時停止、「とばす」・Esc でいつでも終われる。
 * 切り替えは前のコマが紙芝居のページのように左の端からめくれて、下の次のコマが現れる。
 * 絵が読めなくても色の地と言葉だけで続く（白画面にしない）。「動きをへらす」ではカメラの寄りとめくりをやめてフェードだけ。
 * 主人公はホームで選んだ子（声はその子）。絵はキービジュアルと同じ 6 人の子どもたち。
 * 記録は awl.story.v2（前の 3 コマを見た人にも 1 回出す）。?story=1 で毎回出す（確認用）。
 */
const STORAGE_KEY = 'awl.story.v2'
const BASE = `${import.meta.env.BASE_URL}story/`
const HOME = `${import.meta.env.BASE_URL}home/`

type Lines = { ja: string; en: string }
/** 絵の上に重ねる部品 */
type Overlay = 'sparkle' | 'iris' | 'pin' | 'monitor' | 'decide' | 'book' | 'world' | 'finale'
/** カメラの動き（ゆっくり寄る・引く・横に流す） */
type Move = 'in' | 'out' | 'left' | 'right'

interface Panel {
  /** 絵（public/story/<img>-1280.webp と -768.webp）。home: は public/home/ の絵をそのまま */
  img: string
  /** ナレーション（public/audio/vo-story-<voice>.mp3）。言葉が変わるコマで鳴らす。長さ（秒）は hold を決めるのに使う */
  voice?: string
  voiceSec?: number
  /** 絵が読めない時の地の色 */
  tint: [string, string]
  /** 見せる時間（ms）。たっぷり読める長さ */
  hold: number
  text: Lines
  move: Move
  overlay?: Overlay
  /** 7 つのワールドのコマ: ワールドの名前を出す */
  world?: WorldKey
  /** 次のコマへの移り方。turn＝ページをめくる（既定）、quick＝速くめくる */
  leave?: 'turn' | 'quick'
}

const T = {
  box: { ja: 'ある{日|ひ}、きみたちのところに ふしぎな はこが とどいた。', en: 'One day, a mysterious box arrived for you and your friends.' },
  bino: { ja: '{中|なか}には、{青|あお}い そうがんきょう。', en: 'Inside: a pair of blue binoculars.' },
  lens: { ja: 'のぞいてみると…… {遠|とお}い{国|くに}の どうぶつたちが {見|み}えた！', en: 'Look through them… and there are animals from a faraway land!' },
  run: { ja: '{気|き}がつくと、どうぶつたちの{世界|せかい}に！ {歩|ある}いて、{走|はし}って、ジャンプ！', en: 'Suddenly you are in the animals’ world! Walk, run, jump!' },
  meet: { ja: 'あっ、{見|み}つけた！ ライリー。どうぶつには みんな {名前|なまえ}がある。', en: 'Look! It’s Riley. Every animal here has a name.' },
  monitor: { ja: 'ほんものの ようすも {見|み}られる。{飼育員|しいくいん}さんの おはなしも。', en: 'You can watch the real animal too, with words from the keepers.' },
  decide: { ja: 'ともだちになるかどうかは、きみが きめる。', en: 'Whether to become friends is up to you.' },
  book: { ja: 'ともだち{帳|ちょう}に ともだちが ふえた。お{知|し}らせや {写真|しゃしん}も とどくよ。', en: 'A new friend in your Friend Book. News and photos will arrive there too.' },
  worlds: { ja: 'ワールドは {七|なな}つ。いろんな{国|くに}の どうぶつたちが {待|ま}っている。', en: 'There are seven worlds, full of animals waiting for you.' },
  finale: { ja: '{世界中|せかいじゅう}の どうぶつたちと、ともだちになろう！', en: 'Make friends with animals from all over the world!' },
} satisfies Record<string, Lines>

const PANELS: Panel[] = [
  { img: 's1-box', voice: 'box', voiceSec: 4.3, tint: ['#ffd98a', '#f2a65a'], hold: 5800, text: T.box, move: 'in' },
  { img: 's2-bino', voice: 'bino', voiceSec: 2.8, tint: ['#9fdcff', '#2f6bff'], hold: 5000, text: T.bino, move: 'in', overlay: 'sparkle' },
  { img: 's3-lens', voice: 'lens', voiceSec: 4.8, tint: ['#f6b73c', '#c9762a'], hold: 6600, text: T.lens, move: 'out', overlay: 'iris' },
  { img: 's4-run', voice: 'run', voiceSec: 5.7, tint: ['#9fdcff', '#f6b73c'], hold: 7600, text: T.run, move: 'right' },
  { img: 's5-meet', voice: 'meet', voiceSec: 5.4, tint: ['#f6b73c', '#c9762a'], hold: 7200, text: T.meet, move: 'in', overlay: 'pin' },
  { img: 's6-monitor', voice: 'monitor', voiceSec: 4.2, tint: ['#f6b73c', '#c9762a'], hold: 6200, text: T.monitor, move: 'left', overlay: 'monitor' },
  { img: 's7-decide', voice: 'decide', voiceSec: 3.2, tint: ['#ffb27a', '#e8640a'], hold: 6800, text: T.decide, move: 'in', overlay: 'decide' },
  { img: 's8-night', voice: 'book', voiceSec: 4.7, tint: ['#2b3a6b', '#13192b'], hold: 7200, text: T.book, move: 'out', overlay: 'book' },
  { img: 'home:lens-jungle', voice: 'worlds', voiceSec: 5.0, tint: ['#43b968', '#16764a'], hold: 1800, text: T.worlds, move: 'in', overlay: 'world', world: 'jungle', leave: 'quick' },
  { img: 'home:lens-north', tint: ['#8cc7ee', '#3f78b5'], hold: 1700, text: T.worlds, move: 'left', overlay: 'world', world: 'north', leave: 'quick' },
  { img: 'home:lens-south', tint: ['#f08a4b', '#b8492c'], hold: 1700, text: T.worlds, move: 'in', overlay: 'world', world: 'south', leave: 'quick' },
  { img: 's9-water', tint: ['#4fc3d9', '#1f7fa6'], hold: 1700, text: T.worlds, move: 'right', overlay: 'world', world: 'water', leave: 'quick' },
  { img: 's9-sky', tint: ['#9fb4f2', '#5a6fd0'], hold: 1700, text: T.worlds, move: 'in', overlay: 'world', world: 'sky', leave: 'quick' },
  { img: 's9-farm', tint: ['#f7a6b8', '#d0607e'], hold: 2000, text: T.worlds, move: 'left', overlay: 'world', world: 'partner', leave: 'quick' },
  { img: 's10-all', voice: 'finale', voiceSec: 3.5, tint: ['#ffb27a', '#ff7bac'], hold: 7600, text: T.finale, move: 'out', overlay: 'finale' },
]

/** 絵の URL（1280 幅と 768 幅） */
function sources(img: string): { src: string; srcset: string } {
  if (img.startsWith('home:')) {
    const src = `${HOME}${img.slice(5)}.webp`
    return { src, srcset: src }
  }
  return { src: `${BASE}${img}-1280.webp`, srcset: `${BASE}${img}-768.webp 768w, ${BASE}${img}-1280.webp 1280w` }
}

/** `{漢字|よみ}` をふりがなつきの HTML に */
function rubyHtml(s: string): string {
  return esc(s).replace(/\{([^|}]+)\|([^}]+)\}/g, '<ruby>$1<rt>$2</rt></ruby>')
}

function lines(l: Lines): string {
  return getLang() === 'ja' ? rubyHtml(l.ja) : esc(l.en)
}

/** 日本語ならルビつき、英語ならそのまま */
function ja(s: string, en: string): string {
  return getLang() === 'ja' ? rubyHtml(s) : esc(en)
}

function star(x: number, y: number, s: number, delay: number, color = '#ffd233'): string {
  return `<svg class="st-star" style="left:${x}%;top:${y}%;width:${s}px;animation-delay:${delay}s" viewBox="-10 -10 20 20" aria-hidden="true"><path d="M0 -10l2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L0 4l-5.4 2.8 1.1-6.1L-8.8 -3.6l6.1-.8z" fill="${color}" /></svg>`
}

const RILEY = ANIMALS.find((a) => a.id === 'riley')

function rileyName(): string {
  if (!RILEY) return 'ライリー'
  return getLang() === 'en' && RILEY.nameEn ? RILEY.nameEn : RILEY.name
}

/** 絵の上に重ねる部品の HTML */
function overlayHtml(p: Panel): string {
  switch (p.overlay) {
    case 'sparkle':
      return star(30, 38, 26, 0) + star(66, 30, 20, 0.5) + star(56, 60, 16, 1.1, '#fff') + star(26, 62, 14, 0.8, '#fff') + star(72, 56, 22, 1.5)
    case 'iris':
      // 双眼鏡の 2 つの丸が開いていく幕（SMIL。入れた時に beginElement で始める）
      return `<svg class="st-iris" viewBox="0 0 600 400" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs><mask id="st-iris-m"><rect width="600" height="400" fill="#fff" />
          <circle cx="220" cy="200" r="0"><animate attributeName="r" begin="indefinite" dur="1.4s" from="0" to="520" fill="freeze" calcMode="spline" keySplines=".4 0 .2 1" /></circle>
          <circle cx="380" cy="200" r="0"><animate attributeName="r" begin="indefinite" dur="1.4s" from="0" to="520" fill="freeze" calcMode="spline" keySplines=".4 0 .2 1" /></circle>
        </mask></defs>
        <rect width="600" height="400" fill="#13192b" mask="url(#st-iris-m)" /></svg>`
    case 'pin':
      return `<div class="st-pin"><svg class="ico ico-fill"><use href="#i-bino" /></svg><span>${esc(rileyName())}</span></div>`
    case 'monitor': {
      const poster = RILEY?.video.poster ?? ''
      return `<div class="st-monitor">
        <div class="st-monitor-screen"${poster ? ` style="background-image:url('${esc(poster)}')"` : ''}>
          <span class="st-monitor-badge">${esc(t('recorded'))}</span>
          <span class="st-monitor-play" aria-hidden="true"></span>
        </div>
        <div class="st-monitor-note"><span class="st-chip">${ja('{飼育員|しいくいん}さんの おはなし', 'Keeper’s notes')}</span><span class="st-chip">${ja('{写真|しゃしん}', 'Photos')}</span></div>
      </div>`
    }
    case 'decide':
      return `<div class="st-decide"><div class="st-cta"><svg class="ico ico-fill"><use href="#i-heart" /></svg><span>${esc(t('befriend'))}</span></div><div class="st-burst" aria-hidden="true">${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<i style="--a:${i * 45}deg;--d:${(i % 3) * 0.08}s"></i>`).join('')}</div></div>`
    case 'book':
      return `<div class="st-book">
        <div class="st-book-face">${RILEY ? faceMarkup(RILEY) : ''}</div>
        <div class="st-book-body"><b>${esc(rileyName())}</b><span class="st-book-sub">${esc(getLang() === 'ja' ? 'ライオン' : 'Lion')}</span></div>
        <svg class="ico ico-fill st-book-heart"><use href="#i-heart" /></svg>
        <div class="st-book-tags"><span class="st-chip">${ja('お{知|し}らせ', 'News')}</span><span class="st-chip">${ja('きょうの{写真|しゃしん}', 'Photo of the day')}</span><span class="st-chip">${ja('お{手紙|てがみ}を{書|か}く', 'Write a letter')}</span></div>
      </div>`
    case 'world': {
      const w = WORLDS.find((x) => x.key === p.world)
      return w ? `<div class="st-world" style="--c1:${w.colors[0]};--c2:${w.colors[1]}">${esc(getLang() === 'ja' ? w.name.ja : w.name.en)}</div>` : ''
    }
    case 'finale':
      return `<div class="st-finale"><span class="st-logo">ANIMAL WORLD LIVE</span></div>`
    default:
      return ''
  }
}

function readSeen(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function writeSeen(): void {
  try {
    localStorage.setItem(STORAGE_KEY, '1')
  } catch {
    // 保存できなくても続ける
  }
}

export type StoryEnd = 'end' | 'skip'

export interface StoryView {
  /** まだ見ていない（または ?story=1）なら true */
  shouldShow: () => boolean
  /** 最後まで見たら 'end'、「とばす」・Esc なら 'skip' で解決する */
  play: () => Promise<StoryEnd>
  setReduceMotion: (on: boolean) => void
}

export function createStory(): StoryView {
  const root = document.getElementById('story') as HTMLElement
  const frame = document.getElementById('story-frame') as HTMLElement
  const caption = document.getElementById('story-text') as HTMLElement
  const prog = document.getElementById('story-prog') as HTMLElement
  const nextBtn = document.getElementById('story-next') as HTMLButtonElement
  const pauseBtn = document.getElementById('story-pause') as HTMLButtonElement
  const skipBtn = document.getElementById('story-skip') as HTMLButtonElement
  const forced = new URLSearchParams(location.search).get('story') === '1'

  let index = -1
  let resolveDone: ((how: StoryEnd) => void) | null = null
  let reduceMotion = false
  let current: HTMLElement | null = null
  let lastText: Lines | null = null
  let preloaded = false
  // 一時停止: コマの中の仕掛けは「絵が出てからの時間」で予約し、止めた時は残りの時間を取って、続ける時にかけ直す
  let paused = false
  let panelStart = 0
  let pausedAt = 0
  interface Cue {
    at: number
    fn: () => void
    id: number
    fired: boolean
  }
  const cues: Cue[] = []

  // 進み具合: コマごとの短い帯。見ている帯だけが hold の時間をかけて満ちる
  prog.innerHTML = PANELS.map(() => '<span class="story-seg"><i></i></span>').join('')
  const segs = Array.from(prog.children) as HTMLElement[]

  const preload = () => {
    if (preloaded) return
    preloaded = true
    for (const p of PANELS) {
      const im = new Image()
      const s = sources(p.img)
      im.srcset = s.srcset
      im.src = s.src
    }
  }

  const elapsed = () => (paused ? pausedAt : performance.now()) - panelStart
  const arm = (c: Cue) => {
    c.id = window.setTimeout(() => {
      c.fired = true
      c.fn()
    }, Math.max(0, c.at - elapsed()))
  }
  const disarm = () => {
    for (const c of cues) window.clearTimeout(c.id)
  }
  const clearCues = () => {
    disarm()
    cues.length = 0
  }
  const cue = (ms: number, fn: () => void) => {
    const c: Cue = { at: ms, fn, id: 0, fired: false }
    cues.push(c)
    if (!paused) arm(c)
  }

  /** コマを組み立てる */
  const buildCard = (p: Panel): HTMLElement => {
    const card = document.createElement('div')
    card.className = `story-card move-${p.move}`
    card.style.setProperty('--tint1', p.tint[0])
    card.style.setProperty('--tint2', p.tint[1])
    card.style.setProperty('--hold', `${p.hold + 900}ms`)
    const img = document.createElement('img')
    const s = sources(p.img)
    img.className = 'story-img'
    img.alt = ''
    img.decoding = 'async'
    img.draggable = false
    img.sizes = '(min-width: 900px) 900px, 100vw'
    img.srcset = s.srcset
    img.src = s.src
    img.addEventListener('load', () => card.classList.add('has-img'))
    img.addEventListener('error', () => card.classList.add('no-img'))
    if (img.complete && img.naturalWidth > 0) card.classList.add('has-img')
    card.appendChild(img)
    const ov = document.createElement('div')
    ov.className = `story-ov ov-${p.overlay ?? 'none'}`
    ov.innerHTML = overlayHtml(p)
    card.appendChild(ov)
    return card
  }

  /** コマごとの音と仕掛け（絵が出てからの時間で） */
  const direct = (p: Panel, card: HTMLElement) => {
    switch (p.overlay) {
      case 'iris': {
        sound.play('scope-open')
        const anims = card.querySelectorAll<SVGAnimateElement>('animate')
        if (reduceMotion) card.classList.add('iris-done')
        else {
          cue(80, () => anims.forEach((a) => a.beginElement()))
          cue(1500, () => card.classList.add('iris-done'))
        }
        break
      }
      case 'pin':
        // ナレーションが「あっ、見つけた！」と言うので、主人公の同じセリフは重ねない
        cue(900, () => {
          card.classList.add('pin-on')
          sound.play('encounter')
        })
        break
      case 'monitor':
        cue(500, () => card.classList.add('mon-on'))
        break
      case 'decide':
        cue(600, () => card.classList.add('cta-on'))
        // 絵の中の子が決めて押す。音とともに輝く（ナレーションが終わってから）
        cue(3600, () => {
          card.classList.add('cta-press')
          sound.play('friend')
          sound.say('friend', 350)
        })
        break
      case 'book':
        cue(700, () => {
          card.classList.add('book-on')
          sound.play('book')
        })
        cue(2600, () => {
          card.classList.add('tags-on')
          sound.play('notice')
        })
        break
      case 'finale':
        cue(900, () => card.classList.add('logo-on'))
        break
      default:
        break
    }
  }

  /** ナレーション: 日本語の時だけ（声は日本語で作ってある）。言葉が変わるコマで 1 回。最後の 1 枚はロゴが出てから */
  const narrate = (p: Panel) => {
    if (!p.voice || getLang() !== 'ja') return
    const delay = p.overlay === 'finale' ? 1100 : 350
    cue(delay, () => sound.narrate(p.voice as string))
  }

  const show = (i: number) => {
    clearCues()
    index = i
    panelStart = performance.now()
    const p = PANELS[i]
    const prev = current
    const card = buildCard(p)
    // 次のコマを前のコマの下に置き、前のコマを紙芝居のページのように左の端からめくる（7 つのワールドは速く）
    const quick = PANELS[i - 1]?.leave === 'quick'
    if (prev) {
      frame.insertBefore(card, prev)
      prev.classList.add(quick ? 'is-leave-quick' : 'is-leave')
      const gone = () => prev.remove()
      prev.addEventListener('animationend', gone, { once: true })
      window.setTimeout(gone, quick ? 700 : 1300)
    } else frame.appendChild(card)
    current = card
    // 言葉とナレーションは変わる時だけ
    if (p.text !== lastText) {
      lastText = p.text
      caption.innerHTML = lines(p.text)
      caption.classList.remove('is-refresh')
      void caption.offsetWidth
      caption.classList.add('is-refresh')
      narrate(p)
    }
    segs.forEach((s, k) => {
      s.classList.toggle('is-done', k < i)
      s.classList.toggle('is-on', k === i)
      s.style.setProperty('--hold', `${p.hold}ms`)
    })
    const last = i === PANELS.length - 1
    nextBtn.innerHTML = last
      ? `<svg class="ico ico-fill"><use href="#i-bino" /></svg>${esc(t('peek'))}`
      : esc(t('next'))
    if (last) nextBtn.setAttribute('aria-label', t('enterWorld'))
    else nextBtn.removeAttribute('aria-label')
    root.classList.toggle('is-last', last)
    direct(p, card)
    if (!last) cue(p.hold, () => advance())
  }

  const setPaused = (on: boolean) => {
    if (paused === on) return
    paused = on
    if (on) {
      pausedAt = performance.now()
      disarm()
    } else {
      // 止めていた分だけコマの始まりをずらし、まだ鳴っていない仕掛けをかけ直す
      panelStart += performance.now() - pausedAt
      for (const c of cues) if (!c.fired) arm(c)
    }
    root.classList.toggle('is-paused', on)
    sound.setPaused(on)
    pauseBtn.innerHTML = on
      ? `<svg class="ico ico-fill"><use href="#i-play" /></svg><span>${esc(t('resume'))}</span>`
      : `<svg class="ico ico-fill"><use href="#i-pause" /></svg><span>${esc(t('pause'))}</span>`
    pauseBtn.setAttribute('aria-pressed', on ? 'true' : 'false')
  }

  const finish = (how: StoryEnd) => {
    clearCues()
    setPaused(false)
    sound.stopNarration()
    sound.setStoryBgm(false)
    writeSeen()
    root.classList.remove('is-last')
    hideView(root, () => {
      frame.innerHTML = ''
      current = null
      lastText = null
    })
    const done = resolveDone
    resolveDone = null
    if (done) done(how)
  }

  const advance = () => {
    if (!resolveDone) return
    if (index < PANELS.length - 1) show(index + 1)
    else finish('end')
  }

  nextBtn.addEventListener('click', () => {
    setPaused(false)
    advance()
  })
  pauseBtn.addEventListener('click', () => setPaused(!paused))
  frame.addEventListener('click', () => {
    if (paused) setPaused(false)
    else if (index < PANELS.length - 1) advance()
  })
  skipBtn.addEventListener('click', () => finish('skip'))
  window.addEventListener('keydown', (e) => {
    if (!resolveDone) return
    if (e.key === 'Escape') finish('skip')
    else if (e.key === 'ArrowRight' || e.key === ' ') {
      // ボタンに焦点がある時の Space はボタン自身の click に任せる（二重に進めない）
      if (e.key === ' ' && document.activeElement instanceof HTMLButtonElement) return
      e.preventDefault()
      setPaused(false)
      advance()
    }
  })
  // 裏に回ったら止め、戻ったら続ける（自分で止めていた時はそのまま）
  let hiddenPause = false
  document.addEventListener('visibilitychange', () => {
    if (!resolveDone || index < 0) return
    if (document.hidden) {
      if (!paused) {
        hiddenPause = true
        setPaused(true)
      }
    } else if (hiddenPause) {
      hiddenPause = false
      setPaused(false)
    }
  })

  return {
    shouldShow: () => forced || !readSeen(),
    setReduceMotion: (on) => {
      reduceMotion = on
      root.classList.toggle('is-still', on)
    },
    play: () =>
      new Promise<StoryEnd>((resolve) => {
        preload()
        resolveDone = resolve
        index = -1
        current = null
        lastText = null
        frame.innerHTML = ''
        setPaused(false)
        showView(root)
        sound.setStoryBgm(true)
        show(0)
        nextBtn.focus({ preventScroll: true })
      }),
  }
}
