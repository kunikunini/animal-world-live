import { alog } from './audioLog'

/**
 * 実機の調べ用: 「アニマルスコープを開くとアプリが最初から読み込み直しになる」（11/7、iPhone）の確定診断。
 * スコープの一覧・観察モニターを開いている間だけ、開いた時刻を sessionStorage に置き、閉じたら消す。
 * 読み込み直しが起きると、閉じる処理が走らないまま次の読み込みで印が見つかる → 設定の「音の記録」（見出しを 5 回押す）に残す。
 * sessionStorage はタブを閉じると消えるので、ふつうに閉じて開き直した時は出ない。記録に個人の情報は入れない（時刻と画面の名前だけ）
 */
const KEY = 'awl.scopeTrace.v1'

interface Trace {
  /** 開いた時刻（ローカルの時:分:秒） */
  at: string
  /** 開いていた画面: list（一覧）・monitor（観察モニター） */
  views: string[]
}

const read = (): Trace | null => {
  try {
    const raw = sessionStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Trace) : null
  } catch {
    return null
  }
}

const write = (tr: Trace | null) => {
  try {
    if (tr) sessionStorage.setItem(KEY, JSON.stringify(tr))
    else sessionStorage.removeItem(KEY)
  } catch {
    // 記録できなくても続ける
  }
}

const hms = () => {
  const d = new Date()
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':')
}

/** アプリの読み込み時に 1 回: 前の読み込みがスコープ表示中に終わっていたら記録に残す */
export function checkScopeTraceOnLoad(): void {
  const tr = read()
  if (!tr) return
  let nav = ''
  try {
    nav = (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.type ?? ''
  } catch {
    // 分からなくても続ける
  }
  alog(`★再読み込み: 直前はスコープ表示中（${tr.views.join('+') || '?'}、${tr.at} に開いた）nav=${nav || '?'}`)
  write(null)
}

/** 一覧・モニターを開いた／閉じた時に呼ぶ */
export function traceScopeView(view: 'list' | 'monitor', open: boolean): void {
  const tr = read()
  const views = (tr?.views ?? []).filter((v) => v !== view)
  if (open) views.push(view)
  if (!views.length) {
    write(null)
    alog(`scope closed (${view})`)
    return
  }
  write({ at: tr?.at ?? hms(), views })
  if (open) alog(`scope open (${view})`)
}
