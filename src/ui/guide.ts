/**
 * あそび方ナビ。初めての人に、実際にあそびながら順に教える小さなカード（画面の下）。
 * スライド式の説明ではなく、本当の操作（歩く → そばに行く → 札を押す → ともだちになる → ともだち帳 → 会いに行く）が
 * 起きた時に次の案内へ進む。「ともだちになる」は押すよう勧めるだけで、押すのは本人。
 *
 * 初回（記録が無く、ともだちもまだいない）だけ自動で出る。設定の「あそび方をもう一度見る」でいつでも出せる。
 * ?guide=1 で毎回出す（確認用）。記録は localStorage（使えなくても動く）。
 */
import { onLangChange, t } from './i18n'
import { hideView, showView } from './transition'

const STORAGE_KEY = 'awl.guide.v1'

/** 起きる順に並べた節目。reach() で「ここまで来た」と伝える */
export const GUIDE_STEPS = ['walk', 'near', 'open', 'befriend', 'book', 'visit'] as const
export type GuideStep = (typeof GUIDE_STEPS)[number]

const TEXT_KEYS = ['guide1', 'guide2', 'guide3', 'guide4', 'guide5', 'guide6', 'guide7'] as const

export interface Guide {
  /** 初めてワールドに入った時に呼ぶ。記録が無ければ始める（すでにともだちがいる人には出さず、記録だけ付ける） */
  autoStart: (hasFriends: boolean) => void
  /** 最初から出す（設定の「もう一度見る」） */
  start: () => void
  /** 途中でやめる・終える。記録を付けて隠す */
  stop: () => void
  isActive: () => boolean
  /** ワールドにいる間だけカードを出す（ホームでは隠す。進み具合は残す） */
  setInWorld: (on: boolean) => void
  /** 節目に来たことを伝える。先の節目なら手前も済んだことにする（順番どおりでなくても詰まらない） */
  reach: (step: GuideStep) => void
  /** 歩いた距離（m）を足す。始まってから 3m で「歩く」が済む（始める時に 0 に戻す） */
  walk: (meters: number) => void
}

/** 「歩く」が済む距離（m） */
const WALK_DONE = 3

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

export function createGuide(): Guide {
  const root = document.getElementById('guide') as HTMLElement
  const text = document.getElementById('guide-text') as HTMLElement
  const count = document.getElementById('guide-count') as HTMLElement
  const btn = document.getElementById('guide-skip') as HTMLButtonElement
  const btnText = btn.querySelector('span') as HTMLElement

  const forced = new URLSearchParams(location.search).get('guide') === '1'

  let active = false
  let inWorld = false
  // 0〜5 は節目の案内、6 は「できた」のカード
  let index = 0
  let walked = 0

  const render = () => {
    const last = index >= GUIDE_STEPS.length
    text.textContent = t(TEXT_KEYS[Math.min(index, TEXT_KEYS.length - 1)])
    count.textContent = last ? '' : t('guideCount', { n: index + 1, total: GUIDE_STEPS.length })
    btnText.textContent = last ? t('guideDone') : t('guideSkip')
    root.classList.toggle('is-final', last)
    root.classList.remove('is-refresh')
    void root.offsetWidth
    root.classList.add('is-refresh')
  }

  const sync = () => {
    if (active && inWorld) showView(root)
    else hideView(root)
  }

  const start = () => {
    active = true
    index = 0
    walked = 0
    render()
    sync()
  }

  const stop = () => {
    if (!active) return
    active = false
    writeDone()
    sync()
  }

  const reach = (step: GuideStep) => {
    if (!active) return
    const i = GUIDE_STEPS.indexOf(step)
    if (i < index) return
    index = i + 1
    render()
  }

  btn.addEventListener('click', stop)
  onLangChange(() => {
    if (active) render()
  })

  return {
    autoStart: (hasFriends) => {
      // 途中でホームへ戻って入り直した時は、続きから（最初に戻さない）
      if (active) return
      if (forced) {
        start()
        return
      }
      if (readDone()) return
      // この機能より前から遊んでいる人（ともだちがいる）には出さない
      if (hasFriends) writeDone()
      else start()
    },
    start,
    stop,
    isActive: () => active,
    setInWorld: (on) => {
      inWorld = on
      sync()
    },
    reach,
    walk: (meters) => {
      if (!active || index > 0) return
      walked += meters
      if (walked >= WALK_DONE) reach('walk')
    },
  }
}
