import { ANIMALS } from '../data/animals'
import { faceBackground, faceParts } from './faces'
import { esc } from './html'
import { t, type I18nKey } from './i18n'
import { hideView, refreshIn, showView } from './transition'

/**
 * 物語: 初回だけ 3 コマ。絵と一言だけで、説明文にしない。
 * ①ふしぎな双眼鏡が届く ②のぞくと動物たちの世界につながっている ③ともだちになると、ともだち帳に書かれる。
 * 会社名や事実には触れないフィクション。2 回目からは出ない（localStorage）。?story=1 で毎回出す（確認用）。
 */
const STORAGE_KEY = 'awl.story.v1'

export interface StoryView {
  /** まだ見ていない（または ?story=1）なら true */
  shouldShow: () => boolean
  /** 最後まで送るかスキップで解決する */
  play: () => Promise<void>
}

const BINO = `
  <rect x="74" y="118" width="252" height="104" rx="52" fill="#2f6bff" />
  <circle cx="200" cy="108" r="22" fill="#ffd233" /><circle cx="200" cy="108" r="11" fill="#fff" />
  <circle cx="140" cy="170" r="64" fill="#1f2a44" /><circle cx="260" cy="170" r="64" fill="#1f2a44" />`

const LENS_RINGS = `
  <circle cx="140" cy="170" r="54" fill="none" stroke="#fff" stroke-width="6" opacity=".9" /><circle cx="260" cy="170" r="54" fill="none" stroke="#fff" stroke-width="6" opacity=".9" />
  <path d="M104 150 a40 40 0 0 1 28 -30" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" opacity=".85" /><path d="M224 150 a40 40 0 0 1 28 -30" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" opacity=".85" />`

function star(x: number, y: number, s: number, color = '#ffd233'): string {
  return `<path transform="translate(${x} ${y}) scale(${s})" d="M0 -10l2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L0 4l-5.4 2.8 1.1-6.1L-8.8 -3.6l6.1-.8z" fill="${color}" />`
}

function scene1(): string {
  // 届いた箱の上に双眼鏡。星がきらきら
  return `<svg viewBox="0 0 400 250" aria-hidden="true">
    <rect width="400" height="250" fill="#9fdcff" />
    <ellipse cx="200" cy="232" rx="150" ry="14" fill="rgba(31,42,68,.12)" />
    <rect x="110" y="150" width="180" height="80" rx="14" fill="#f2c27a" />
    <rect x="110" y="150" width="180" height="22" rx="10" fill="#e4a95a" />
    <rect x="192" y="150" width="16" height="80" fill="#ff7bac" /><rect x="110" y="184" width="180" height="14" fill="#ff7bac" />
    <g transform="translate(70 -10) scale(.65)">${BINO}<circle cx="140" cy="170" r="54" fill="#9fdcff" /><circle cx="260" cy="170" r="54" fill="#9fdcff" />${LENS_RINGS}</g>
    ${star(60, 70, 1.4)}${star(340, 60, 1.1)}${star(330, 150, 0.8, '#fff')}${star(50, 160, 0.9, '#fff')}
  </svg>`
}

function scene2(): string {
  // レンズの向こうに、どうぶつたち（アンジーと仔）
  const angie = ANIMALS.find((a) => a.id === 'angie')
  const cub = ANIMALS.find((a) => a.id === 'claire')
  const face = (id: string, x: number, y: number, s: number) => {
    const a = ANIMALS.find((v) => v.id === id)
    if (!a) return ''
    return `<g transform="translate(${x} ${y}) scale(${s})"><circle cx="50" cy="52" r="50" fill="${faceBackground(a)}" />${faceParts(a)}</g>`
  }
  return `<svg viewBox="0 0 400 250" aria-hidden="true">
    <rect width="400" height="250" fill="#1f2a44" />
    <circle cx="140" cy="125" r="78" fill="#e0bf5c" /><circle cx="260" cy="125" r="78" fill="#e0bf5c" />
    <path d="M62 125 a78 78 0 0 1 156 0z" fill="#9fdcff" /><path d="M182 125 a78 78 0 0 1 156 0z" fill="#9fdcff" />
    <rect x="62" y="125" width="276" height="78" fill="#cfa42f" clip-path="inset(0)" />
    <circle cx="140" cy="125" r="78" fill="none" stroke="#1f2a44" stroke-width="18" /><circle cx="260" cy="125" r="78" fill="none" stroke="#1f2a44" stroke-width="18" />
    ${angie ? face('angie', 95, 80, 0.9) : ''}${cub ? face('claire', 222, 92, 0.76) : ''}
    <circle cx="140" cy="125" r="70" fill="none" stroke="#fff" stroke-width="6" opacity=".9" /><circle cx="260" cy="125" r="70" fill="none" stroke="#fff" stroke-width="6" opacity=".9" />
  </svg>`
}

function scene3(): string {
  // 開いたともだち帳に顔とハート
  const angie = ANIMALS.find((a) => a.id === 'angie')
  const faceInner = angie ? `<circle cx="50" cy="52" r="50" fill="${faceBackground(angie)}" />${faceParts(angie)}` : ''
  return `<svg viewBox="0 0 400 250" aria-hidden="true">
    <rect width="400" height="250" fill="#fff1c9" />
    <path d="M60 60 q70 -16 140 0 v150 q-70 -16 -140 0z" fill="#fff" stroke="#e8d6b0" stroke-width="3" />
    <path d="M200 60 q70 -16 140 0 v150 q-70 -16 -140 0z" fill="#fff" stroke="#e8d6b0" stroke-width="3" />
    <g transform="translate(92 86) scale(.76)">${faceInner}</g>
    <rect x="96" y="172" width="68" height="10" rx="5" fill="#2b1d12" opacity=".7" />
    <path transform="translate(270 118) scale(3.2)" d="M0 8.5s-7.5-4.6-7.5-10A4.2 4.2 0 0 1 0-4a4.2 4.2 0 0 1 7.5 2.5c0 5.4-7.5 10-7.5 10z" fill="#ff7bac" />
    <rect x="236" y="172" width="68" height="10" rx="5" fill="#2b1d12" opacity=".4" /><rect x="236" y="190" width="48" height="10" rx="5" fill="#2b1d12" opacity=".25" />
    ${star(330, 70, 1.1)}${star(60, 40, 0.9)}${star(350, 200, 0.8, '#ff7bac')}
  </svg>`
}

const PANELS: Array<{ art: () => string; text: I18nKey }> = [
  { art: scene1, text: 'story1' },
  { art: scene2, text: 'story2' },
  { art: scene3, text: 'story3' },
]

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

export function createStory(): StoryView {
  const root = document.getElementById('story') as HTMLElement
  const art = document.getElementById('story-art') as HTMLElement
  const text = document.getElementById('story-text') as HTMLElement
  const dots = document.getElementById('story-dots') as HTMLElement
  const nextBtn = document.getElementById('story-next') as HTMLButtonElement
  const skipBtn = document.getElementById('story-skip') as HTMLButtonElement
  const forced = new URLSearchParams(location.search).get('story') === '1'

  let index = 0
  let resolveDone: (() => void) | null = null

  const render = () => {
    const panel = PANELS[index]
    art.innerHTML = panel.art()
    text.textContent = t(panel.text)
    dots.innerHTML = PANELS.map((_, i) => `<span class="story-dot${i === index ? ' is-on' : ''}"></span>`).join('')
    const last = index === PANELS.length - 1
    nextBtn.innerHTML = last
      ? `<svg class="ico ico-fill"><use href="#i-bino" /></svg>${esc(t('peek'))}`
      : esc(t('next'))
    if (last) nextBtn.setAttribute('aria-label', t('enterWorld'))
    else nextBtn.removeAttribute('aria-label')
  }

  const finish = () => {
    writeSeen()
    hideView(root)
    const done = resolveDone
    resolveDone = null
    if (done) done()
  }

  nextBtn.addEventListener('click', () => {
    if (index < PANELS.length - 1) {
      index++
      render()
      refreshIn(art, text)
      nextBtn.focus()
    } else {
      finish()
    }
  })
  skipBtn.addEventListener('click', finish)
  window.addEventListener('keydown', (e) => {
    if (resolveDone && e.key === 'Escape') finish()
  })

  return {
    shouldShow: () => forced || !readSeen(),
    play: () =>
      new Promise<void>((resolve) => {
        resolveDone = resolve
        index = 0
        render()
        showView(root)
        nextBtn.focus()
      }),
  }
}
