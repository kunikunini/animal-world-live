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

const KEYS = ['scope', 'rx', 'rz', 'rh', 'rg', 'g', 'via'] as const

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

const SHOT_KEY = 'awl.hopShot'
const SHOT_RE = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/

/** スコープに入る前のワールドの小さな絵（のぞき窓の中にぼやけて見せる）。ワールドの側で、入れ替える前に保存する */
export function saveHopShot(dataUrl: string): void {
  try {
    if (SHOT_RE.test(dataUrl)) sessionStorage.setItem(SHOT_KEY, dataUrl)
  } catch {
    // 保存できなくても続ける（窓の中は紺のレンズになる）
  }
}

function readShot(): string | null {
  try {
    const v = sessionStorage.getItem(SHOT_KEY)
    return v && SHOT_RE.test(v) ? v : null
  } catch {
    return null
  }
}

const hopEl = () => document.getElementById('hop')
const reduced = () =>
  document.body.classList.contains('is-reduce-motion') || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)

/** のぞき窓の中身: solid = 紺のレンズ、see = 下の画面がうすく見える、shot = 入る前のワールドの小さな絵 */
function setView(view: 'solid' | 'see' | 'shot'): void {
  const el = hopEl()
  if (!el) return
  const shot = view === 'shot' ? readShot() : null
  el.classList.toggle('is-solid', view === 'solid' || (view === 'shot' && !shot))
  el.classList.toggle('has-shot', !!shot)
  if (shot) el.style.setProperty('--shot', `url("${shot}")`)
}

/**
 * 行き来の画面（index.html の #hop、のぞき窓）を出す。to = スコープへ、back = ワールドへ。
 * 0.25 秒でふわっと出し、出しきってからページを入れ替える（入れ替わった先は最初から同じ画面が出ている）
 */
async function showHop(dir: 'to' | 'back'): Promise<void> {
  const root = document.documentElement
  const el = hopEl()
  // スコップの絵を先に読み終えておく（出した瞬間に遅れて現れて、カクついて見えないように）
  await Promise.race([primeHop(), new Promise((r) => window.setTimeout(r, 150))])
  root.classList.remove('hop-to', 'hop-back')
  try {
    if (localStorage.getItem('awl.lang') === 'en') root.classList.add('hop-en')
  } catch {
    // 読めなくても続ける
  }
  setView(dir === 'back' ? 'shot' : 'solid')
  root.classList.add('is-hop', `hop-${dir}`)
  if (!el) return
  el.classList.remove('is-out', 'is-open', 'is-focus', 'is-fade-in')
  void el.offsetWidth
  el.classList.add('is-fade-in')
  // 出しきってから入れ替える（スコップが出てくる 0.35 秒）
  return new Promise((r) => window.setTimeout(r, 360))
}

/** 行き来の画面のスコップの絵を、見えない間に読み終えておく（起動時に呼ぶ） */
export function primeHop(): Promise<void> {
  const img = document.querySelector<HTMLImageElement>('#hop .hop-scop')
  if (!img?.decode) return Promise.resolve()
  return img.decode().catch(() => undefined)
}

function cleanup(): void {
  const el = hopEl()
  document.documentElement.classList.remove('is-hop', 'hop-to', 'hop-back')
  el?.classList.remove('is-out', 'is-open', 'is-focus', 'is-fade-in', 'is-wait', 'is-hint')
  el?.removeAttribute('role')
  el?.removeAttribute('aria-label')
  el?.setAttribute('aria-hidden', 'true')
}

/** 行き来の画面を 0.3 秒で薄くして消す（失敗した時・動きをへらす時） */
export function hideHop(): void {
  const el = hopEl()
  if (!el || !document.documentElement.classList.contains('is-hop')) return
  el.classList.add('is-out')
  window.setTimeout(cleanup, 350)
}

let opened = false
/** 窓が広がって画面いっぱいになり、消える（動きをへらす時はフェード） */
function openHop(): void {
  const el = hopEl()
  if (opened || !el || !document.documentElement.classList.contains('is-hop')) return
  opened = true
  window.clearTimeout(hintTimer)
  el.classList.remove('is-wait', 'is-hint')
  if (reduced()) {
    hideHop()
    return
  }
  el.classList.remove('is-fade-in')
  el.classList.add('is-open')
  window.setTimeout(cleanup, 650)
}

/**
 * のぞき窓は自動では広げず、タップで開く（11/8、くにの実機で自動で開くと入場の BGM が鳴らないことがあったため）。
 * そのタップで音の解放もする（sound.ts が window の捕捉（capture）で、このクリックより先に AudioContext を動かす。仕組みは変えない）。
 * 準備が済む前のタップは覚えておき、済んだらすぐ開く（そのタップで音はもう解放されている）
 */
let ready = false
let tapped = false
let hintTimer = 0
function onTap(): void {
  tapped = true
  if (ready) openHop()
}
function bindTap(): void {
  const el = hopEl()
  if (!el || el.dataset.bound) return
  el.dataset.bound = '1'
  // index.html の中のスクリプトが、本体が届く前のタップを覚えている
  if ((window as unknown as { __awlHopTap?: boolean }).__awlHopTap) tapped = true
  el.addEventListener('click', onTap)
  window.addEventListener('keydown', (e) => {
    if (!document.documentElement.classList.contains('is-hop') || opened) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onTap()
    }
  })
}

/** タップを待つ: スコップが跳ね、窓のふちが明滅する（動きをへらす時は止まったまま）。2.5 秒タップが無ければ吹き出しを出す */
function waitTap(): void {
  const el = hopEl()
  if (!el || opened) return
  el.classList.add('is-wait')
  el.setAttribute('role', 'button')
  el.removeAttribute('aria-hidden')
  const root = document.documentElement
  const en = root.classList.contains('hop-en')
  const back = root.classList.contains('hop-back')
  el.setAttribute('aria-label', back ? (en ? 'Tap to go back to the world' : 'タップで ワールドに もどる') : en ? 'Tap to look through the scope' : 'タップで スコープを のぞく')
  window.clearTimeout(hintTimer)
  hintTimer = window.setTimeout(() => {
    if (!opened) el.classList.add('is-hint')
  }, 2500)
}

/** スコープ専用モードの入場: 一覧を組んだら呼ぶ。窓の中に一覧がうすく見え、タップで窓が広がる */
export function revealHop(): void {
  bindTap()
  setView('see')
  ready = true
  if (tapped) {
    openHop()
    return
  }
  waitTap()
}

/** 行き来の画面のタップを、組み立て・一覧ができる前から受けられるようにする */
export function armHop(): void {
  bindTap()
}

/**
 * ワールドへ戻った時: 組み立てが済んで 1 コマ描いたら呼ぶ。窓の中のぼやけた絵が消えて本物のワールドにピントが合い、
 * タップでワールドに入る。組み立て中にタップされていたらすぐ広がる。動きをへらす時はピントの変化なし・フェードだけ
 */
export function focusHop(): void {
  bindTap()
  ready = true
  const el = hopEl()
  if (!el) return
  if (tapped) {
    openHop()
    return
  }
  el.classList.add('is-focus')
  waitTap()
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
