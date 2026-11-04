import { esc } from './html'
import { t } from './i18n'

/**
 * 観察スポットでスコープをのぞく演出（約 3.3 秒）。動きは CSS（style.css の「アニマルスコープ」）。
 *  0.0-0.4 ピンに立つ: 波紋ときらきら
 *  0.3-1.0 構える: 双眼鏡の形に絞られ、世界がぐっと寄ってぼける（ワールドの canvas は body.is-scoping で動かす）
 *  1.0-1.9 ピントを合わせる: くっきり、照準とダイヤル、レンズに光
 *  1.9-2.5 レンズに一覧が映る: ロゴ
 *  2.5-3.3 のぞきこむ: レンズが広がり、一覧の段が順に並ぶ（catalog の .is-scope-in）
 * 途中でタップすると、とばしてすぐ一覧を出す。
 */
export const SCOPE_MS = 3300

export interface ScopeAnimation {
  /** 演出を流す。終わるか、とばされたら resolve（skipped が true ならとばされた） */
  play: () => Promise<{ skipped: boolean }>
}

const SPARKS: Array<[number, number, string, number, string]> = [
  // dx, dy, 文字, 大きさ, 遅れ
  [-96, -70, '✦', 22, '0s'],
  [104, -84, '✦', 22, '.04s'],
  [-130, 10, '✦', 16, '.08s'],
  [128, 18, '✦', 16, '.02s'],
  [-40, -130, '●', 12, '.1s'],
  [52, -140, '●', 10, '.06s'],
  [-70, 70, '✦', 18, '.12s'],
  [78, 64, '●', 10, '.09s'],
]

const RETICLE =
  '<svg viewBox="0 0 150 150" fill="none" stroke="rgba(255,246,230,0.85)" stroke-width="2" stroke-linecap="round"><circle cx="75" cy="75" r="46" stroke-dasharray="6 10"/><circle cx="75" cy="75" r="4" fill="#f4c242" stroke="none"/><path d="M75 14v20M75 116v20M14 75h20M116 75h20"/></svg>'

export function createScope(): ScopeAnimation {
  const root = document.getElementById('scope') as HTMLElement
  let finish: ((skipped: boolean) => void) | null = null
  let timer = 0

  const build = () => {
    root.innerHTML = `
      <span class="sc-shock"></span><span class="sc-shock sc-shock-2"></span>
      ${SPARKS.map(
        ([dx, dy, ch, size, delay]) =>
          `<span class="sc-spark${ch === '●' ? ' sc-spark-dot' : ''}" style="--dx:${dx}px;--dy:${dy}px;font-size:${size}px;animation-delay:${delay}">${ch}</span>`,
      ).join('')}
      <div class="sc-hand">
        <div class="sc-curtain"></div>
        <div class="sc-rim sc-l"></div>
        <div class="sc-rim sc-r"></div>
        <div class="sc-ret sc-l">${RETICLE}</div>
        <div class="sc-ret sc-r">${RETICLE}</div>
        <div class="sc-dial">
          <svg class="sc-wheel" viewBox="0 0 64 64" width="58" height="58"><circle cx="32" cy="32" r="28" fill="#2b1d12" stroke="#f4c242" stroke-width="4"/><g stroke="#fff6e6" stroke-width="3" stroke-linecap="round"><path d="M32 8v8"/><path d="M32 48v8" opacity=".5"/><path d="M8 32h8" opacity=".5"/><path d="M48 32h8" opacity=".5"/></g><circle cx="32" cy="32" r="8" fill="#f26a1b"/></svg>
          <div class="sc-msgs">
            <span class="sc-msg sc-msg1">${esc(t('scopeFocusing'))}</span>
            <span class="sc-msg sc-msg2"><svg viewBox="0 0 24 24" width="26" height="26"><circle cx="7" cy="14" r="5" fill="#f4c242"/><circle cx="17" cy="14" r="5" fill="#f4c242"/><rect x="9" y="7" width="6" height="6" rx="2" fill="#ffd56a"/><circle cx="7" cy="14" r="2.4" fill="#2b1d12"/><circle cx="17" cy="14" r="2.4" fill="#2b1d12"/></svg>${esc(t('scope'))}</span>
          </div>
          <div class="sc-track"><div class="sc-fill"></div></div>
        </div>
      </div>
      <div class="sc-flash"></div>
      <span class="sc-skip">${esc(t('scopeSkip'))}</span>`
  }

  const end = (skipped: boolean) => {
    window.clearTimeout(timer)
    root.hidden = true
    root.innerHTML = ''
    const f = finish
    finish = null
    f?.(skipped)
  }

  root.addEventListener('pointerdown', (e) => {
    if (!finish) return
    e.preventDefault()
    end(true)
  })
  window.addEventListener('keydown', (e) => {
    if (finish && (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ')) end(true)
  })

  return {
    play: () => {
      if (finish) end(true)
      build()
      root.hidden = false
      return new Promise((resolve) => {
        finish = (skipped) => resolve({ skipped })
        timer = window.setTimeout(() => end(false), SCOPE_MS)
      })
    },
  }
}
