/**
 * スコープ専用モード（11/8 スコープ落下 最終対策、くに決定）。
 * 観察スポットで「スコープをのぞく」を押したら、同じアプリを ?scope=1 で起動し直す。スコープ専用モードでは
 * WebGL・3D シーン・動物モデル・テクスチャを一切作らず、アニマルスコープの画面（一覧・観察モニター・ともだち帳）だけを描く。
 * 「ワールドにもどる」で通常起動に戻し、元の場所（遷移前のプレイヤーの位置と向き）から続ける。
 *
 * 渡すものはクエリに載せる（storage が使えない時でも戻れるように）。戻った側は読んだらすぐ URL から消す（読み込み直しで飛ばない）。
 * 位置と向き、いたワールド、あそびかたツアーの段だけ。個人の情報は載せない。
 * ページは location.replace で入れ替える（前のページを履歴に残さない。3D のページが裏に残らないように）
 */
export interface ReturnSpot {
  x: number
  z: number
  heading: number
  region: string
}

export interface ScopeHandoff {
  spot: ReturnSpot | null
  /** あそびかたツアーを途中で持ってきた時の段（無ければ null） */
  guide: number | null
}

const KEYS = ['scope', 'rx', 'rz', 'rh', 'rg', 'g'] as const

export function isScopeMode(): boolean {
  return new URLSearchParams(location.search).get('scope') === '1'
}

const num = (v: string | null): number | null => {
  if (v === null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** URL から受け取る（スコープ専用モードでも、戻った通常起動でも）。渡された印は URL から消す（scope=1 は残す） */
export function readHandoff(): ScopeHandoff {
  const q = new URLSearchParams(location.search)
  const x = num(q.get('rx'))
  const z = num(q.get('rz'))
  const heading = num(q.get('rh'))
  const g = num(q.get('g'))
  const spot = x !== null && z !== null ? { x, z, heading: heading ?? Math.PI, region: q.get('rg') ?? '' } : null
  const keep = isScopeMode()
  try {
    const url = new URL(location.href)
    for (const k of KEYS) if (!(keep && k === 'scope')) url.searchParams.delete(k)
    // スコープ専用モードでは戻り先を持ったままにする（読み込み直しても戻れるように）
    if (keep && spot) setSpot(url, spot, g)
    history.replaceState(history.state, '', url.toString())
  } catch {
    // 書き換えられなくても続ける
  }
  return { spot, guide: g === null ? null : Math.max(0, Math.round(g)) }
}

function setSpot(url: URL, spot: ReturnSpot, guide: number | null): void {
  url.searchParams.set('rx', spot.x.toFixed(2))
  url.searchParams.set('rz', spot.z.toFixed(2))
  url.searchParams.set('rh', spot.heading.toFixed(3))
  if (spot.region) url.searchParams.set('rg', spot.region)
  if (guide !== null) url.searchParams.set('g', String(guide))
  else url.searchParams.delete('g')
}

let leaving = false

/**
 * 行き来の画面（index.html の #hop）。to = スコープへ、back = ワールドへ。
 * 出す時は 0.25 秒でふわっと出し、出しきってからページを入れ替える（入れ替わった先は最初から同じ画面が出ている）
 */
function showHop(dir: 'to' | 'back'): Promise<void> {
  const root = document.documentElement
  const el = document.getElementById('hop')
  root.classList.remove('hop-to', 'hop-back')
  try {
    if (localStorage.getItem('awl.lang') === 'en') root.classList.add('hop-en')
  } catch {
    // 読めなくても続ける
  }
  root.classList.add('is-hop', `hop-${dir}`)
  if (!el) return Promise.resolve()
  el.classList.remove('is-out')
  el.classList.add('is-fade-in')
  return new Promise((r) => window.setTimeout(r, 260))
}

/** 行き来の画面を消す（次の画面が出せるようになったら呼ぶ）。0.45 秒で薄れる */
export function hideHop(): void {
  const root = document.documentElement
  const el = document.getElementById('hop')
  if (!el || !root.classList.contains('is-hop')) return
  el.classList.add('is-out')
  window.setTimeout(() => {
    root.classList.remove('is-hop', 'hop-to', 'hop-back')
    el.classList.remove('is-out', 'is-fade-in')
  }, 500)
}

/** 3D のワールドから、スコープ専用モードへ */
export function goScope(spot: ReturnSpot, guide: number | null): void {
  if (leaving) return
  leaving = true
  const url = new URL(location.href)
  for (const k of KEYS) url.searchParams.delete(k)
  url.searchParams.set('scope', '1')
  setSpot(url, spot, guide)
  void showHop('to').then(() => location.replace(url.toString()))
}

/** スコープ専用モードから、通常起動（ワールド）へ。戻り先があればそこへ */
export function goWorld(spot: ReturnSpot | null, guide: number | null): void {
  if (leaving) return
  leaving = true
  const url = new URL(location.href)
  for (const k of KEYS) url.searchParams.delete(k)
  if (spot) setSpot(url, spot, guide)
  else if (guide !== null) url.searchParams.set('g', String(guide))
  void showHop('back').then(() => location.replace(url.toString()))
}
