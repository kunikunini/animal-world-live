/**
 * BGM・環境音・効果音。Web Audio の 1 つの AudioContext に、BGM／環境音／効果音の 3 つの音量（GainNode）を置く。
 * - 自動再生の制限があるので、最初のユーザー操作（pointerdown / keydown）まで何も鳴らさない。
 *   それまでに頼まれた曲は覚えておき、操作の直後に流し始める
 * - BGM と環境音はループ。切り替えはクロスフェード。デコードした曲は少しだけ持ち（iPhone のメモリ対策）、古いものは捨てる
 * - 音源が無い・読めない・AudioContext が作れない時は、黙って無音のまま続ける（操作は止めない）
 * - 音量とミュートは BGM（曲）・まわりの音（環境音）・効果音で別々。「動きをへらす」とは独立。この端末に覚える
 *   （まわりの音は 11/6 に BGM から分けた。保存が無ければ、それまでの BGM の値を引き継ぐ）
 */
import { playFriendChime } from '../ui/chime'

export type BgmKey = 'home' | 'savanna' | 'jungle' | 'north' | 'south' | 'water' | 'sky' | 'partner'
export type AmbKey = 'savanna' | 'jungle' | 'north' | 'south' | 'water'
export type SeName =
  | 'step-grass'
  | 'step-snow'
  | 'jump'
  | 'land'
  | 'scope-open'
  | 'scope-close'
  | 'encounter'
  | 'friend'
  | 'tap'
  | 'book'
  | 'notice'
/** ともだちになる時の音: いまの合成チャイム（既定）か、ElevenLabs で作った候補 */
export type FriendSound = 'chime' | 'new'
/** 音量・ミュートを別々に持つ 3 つの系統 */
export type SoundChannel = 'bgm' | 'amb' | 'se'

const BASE = `${import.meta.env.BASE_URL}audio/`
const FADE_S = 1.8
/** 同じ場所の 2 曲を交互にする時のクロスフェード（秒） */
const SWAP_S = 3
/** デコードして持っておく BGM・環境音の数（いまの 2 曲＋フェード中の前の曲＋環境音） */
const KEEP_LOOPS = 5
/** 足音のバリエーション */
const STEP_VARIANTS = 3

const KEY = {
  bgmVol: 'awl.vol.bgm',
  seVol: 'awl.vol.se',
  bgmMute: 'awl.mute.bgm',
  ambVol: 'awl.vol.amb',
  ambMute: 'awl.mute.amb',
  seMute: 'awl.mute.se',
  friend: 'awl.friendSound',
}

function readNum(key: string, fallback: number): number {
  try {
    const v = localStorage.getItem(key)
    if (v === null) return fallback
    const n = Number(v)
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : fallback
  } catch {
    return fallback
  }
}

function readStr(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // 保存できなくても動作は続ける
  }
}

interface Layer {
  bus: GainNode | null
  /** 鳴らしたい場所の曲（1 曲目のファイル名。解放前・読み込み中も持つ） */
  want: string | null
  /** いま鳴っている場所の曲（1 曲目のファイル名） */
  key: string | null
  /** いま鳴っているファイル（1 曲目か 2 曲目） */
  track: string | null
  src: AudioBufferSourceNode | null
  gain: GainNode | null
  /** 次の曲へ切り替えるタイマー */
  timer: number
}

const bgmVol0 = readNum(KEY.bgmVol, 0.6)
const bgmMute0 = readStr(KEY.bgmMute) === '1'
const ambMuteStr = readStr(KEY.ambMute)
const state = {
  bgmVol: bgmVol0,
  ambVol: readNum(KEY.ambVol, bgmVol0),
  seVol: readNum(KEY.seVol, 0.8),
  bgmMute: bgmMute0,
  ambMute: ambMuteStr === null ? bgmMute0 : ambMuteStr === '1',
  seMute: readStr(KEY.seMute) === '1',
  friend: (readStr(KEY.friend) === 'new' ? 'new' : 'chime') as FriendSound,
}

let ctx: AudioContext | null = null
let unlocked = false
let failed = false
let seBus: GainNode | null = null
/** 観察モニター（収録映像）を見ている間は BGM を下げる */
let duck = 1
let bgmBase: BgmKey | null = null
let bgmOverride: BgmKey | null = null
const bgm: Layer = { bus: null, want: null, key: null, track: null, src: null, gain: null, timer: 0 }
const amb: Layer = { bus: null, want: null, key: null, track: null, src: null, gain: null, timer: 0 }

const loops = new Map<string, Promise<AudioBuffer | null>>()
const loopOrder: string[] = []
const shots = new Map<string, Promise<AudioBuffer | null>>()

const listeners: Array<() => void> = []
/** 開発用: 実際に鳴らした効果音（検証で、出ない・遅れる・二重を見る） */
const played: Array<{ name: string; t: number }> = []
function logPlayed(name: string): void {
  played.push({ name, t: Math.round(performance.now()) })
  if (played.length > 200) played.shift()
}

function curve(v: number): number {
  // つまみの位置を耳の感じに近づける
  return v * v
}

function applyVolumes(): void {
  if (!ctx) return
  const now = ctx.currentTime
  const b = state.bgmMute ? 0 : curve(state.bgmVol) * duck
  const a = state.ambMute ? 0 : curve(state.ambVol) * duck
  bgm.bus?.gain.setTargetAtTime(b * 0.75, now, 0.08)
  amb.bus?.gain.setTargetAtTime(a * 0.55, now, 0.08)
  seBus?.gain.setTargetAtTime(state.seMute ? 0 : curve(state.seVol), now, 0.03)
}

function ensureContext(): AudioContext | null {
  if (ctx || failed) return ctx
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) {
      failed = true
      return null
    }
    ctx = new AC()
    bgm.bus = ctx.createGain()
    amb.bus = ctx.createGain()
    seBus = ctx.createGain()
    for (const g of [bgm.bus, amb.bus, seBus]) {
      g.gain.value = 0
      g.connect(ctx.destination)
    }
    applyVolumes()
  } catch {
    failed = true
    ctx = null
  }
  return ctx
}

async function fetchBuffer(path: string): Promise<AudioBuffer | null> {
  const ac = ensureContext()
  if (!ac) return null
  try {
    const res = await fetch(BASE + path)
    if (!res.ok) return null
    const data = await res.arrayBuffer()
    // Safari の古い版は Promise を返さないので、コールバックの形で呼ぶ
    return await new Promise<AudioBuffer | null>((resolve) => {
      try {
        const p = ac.decodeAudioData(data, resolve, () => resolve(null))
        if (p && typeof p.catch === 'function') p.catch(() => resolve(null))
      } catch {
        resolve(null)
      }
    })
  } catch {
    return null
  }
}

/**
 * ループの長さ（秒）。BGM と環境音のファイルは、ループの前後に「ループの続き」を LOOP_PAD 秒ずつ足してある
 * （mp3 の両端は数ミリ秒ぶれるので、そこを使わずに内側だけをくり返す）。loops.json が無い時はファイル全体をくり返す
 */
const LOOP_PAD = 0.25
let loopLengths: Promise<Record<string, number>> | null = null
function getLoopLengths(): Promise<Record<string, number>> {
  if (!loopLengths) {
    loopLengths = fetch(BASE + 'loops.json')
      .then((r) => (r.ok ? (r.json() as Promise<Record<string, number>>) : {}))
      .catch(() => ({}))
  }
  return loopLengths
}

/** その場所の 2 曲目（bgm-home.mp3 → bgm-home-2.mp3） */
function secondOf(file: string): string {
  return file.replace(/\.mp3$/, '-2.mp3')
}

function baseOf(file: string): string {
  return file.replace(/\.mp3$/, '')
}

function loadLoop(file: string): Promise<AudioBuffer | null> {
  let p = loops.get(file)
  if (!p) {
    p = fetchBuffer(file)
    loops.set(file, p)
  }
  const i = loopOrder.indexOf(file)
  if (i >= 0) loopOrder.splice(i, 1)
  loopOrder.push(file)
  // 古いものを捨てる（いま鳴っている・鳴らしたい曲は残す）
  while (loopOrder.length > KEEP_LOOPS) {
    const keep = [bgm.key, bgm.want, bgm.track, amb.key, amb.want].filter(Boolean).flatMap((f) => [f, secondOf(f as string)])
    const old = loopOrder.find((f) => !keep.includes(f))
    if (!old) break
    loopOrder.splice(loopOrder.indexOf(old), 1)
    loops.delete(old)
  }
  return p
}

function fadeOut(src: AudioBufferSourceNode, gain: GainNode, seconds: number): void {
  if (!ctx) return
  const now = ctx.currentTime
  gain.gain.cancelScheduledValues(now)
  gain.gain.setValueAtTime(gain.gain.value, now)
  gain.gain.linearRampToValueAtTime(0, now + seconds)
  try {
    src.stop(now + seconds + 0.05)
  } catch {
    // すでに止まっている
  }
  window.setTimeout(() => gain.disconnect(), (seconds + 0.3) * 1000)
}

function stopLayer(layer: Layer): void {
  window.clearTimeout(layer.timer)
  if (ctx && layer.src && layer.gain) fadeOut(layer.src, layer.gain, FADE_S)
  layer.src = null
  layer.gain = null
  layer.key = null
  layer.track = null
}

/**
 * その場所の曲を 1 つ鳴らす（ループ再生のまま）。2 曲目があれば、ループ 1 回分の少し前から
 * もう片方の曲へ SWAP_S 秒でクロスフェードし、それを交互にくり返す。タイマーが遅れても、鳴っている曲はループするので途切れない
 */
function playTrack(layer: Layer, list: string[], index: number, buf: AudioBuffer, lengths: Record<string, number>, fadeS: number): void {
  if (!ctx || !layer.bus) return
  const file = list[index]
  const src = ctx.createBufferSource()
  src.buffer = buf
  src.loop = true
  const len = lengths[baseOf(file)]
  const padded = typeof len === 'number' && buf.duration >= len + LOOP_PAD * 2 - 0.01
  if (padded) {
    src.loopStart = LOOP_PAD
    src.loopEnd = LOOP_PAD + len
  }
  const gain = ctx.createGain()
  const now = ctx.currentTime
  gain.gain.setValueAtTime(0, now)
  gain.gain.linearRampToValueAtTime(1, now + fadeS)
  src.connect(gain)
  gain.connect(layer.bus)
  src.start(now, padded ? LOOP_PAD : 0)
  layer.src = src
  layer.gain = gain
  layer.track = file
  if (list.length < 2) return
  const nextIndex = (index + 1) % list.length
  const next = list[nextIndex]
  // 次の曲は切り替えの少し前から読んでおく
  const playFor = (padded ? len : buf.duration) - SWAP_S
  const key = layer.key
  window.clearTimeout(layer.timer)
  layer.timer = window.setTimeout(async () => {
    if (layer.src !== src || layer.key !== key) return
    const nextBuf = await loadLoop(next)
    if (!nextBuf || layer.src !== src || layer.key !== key) return
    fadeOut(src, gain, SWAP_S)
    playTrack(layer, list, nextIndex, nextBuf, lengths, SWAP_S)
  }, Math.max(1, playFor) * 1000)
  window.setTimeout(() => {
    if (layer.src === src) void loadLoop(next)
  }, Math.max(0, playFor - 8) * 1000)
}

async function syncLayer(layer: Layer): Promise<void> {
  if (!unlocked || !ctx) return
  const want = layer.want
  if (want === layer.key) return
  stopLayer(layer)
  if (!want) return
  const [buf, lengths] = await Promise.all([loadLoop(want), getLoopLengths()])
  // 読み込みの間に行き先が変わった、または別の呼び出しが先に鳴らした
  if (!buf || !ctx || layer.want !== want || layer.key !== null || !layer.bus) return
  layer.key = want
  // 2 曲目が loops.json にあれば交互にする（環境音は 1 本）
  const second = secondOf(want)
  const list = baseOf(second) in lengths ? [want, second] : [want]
  playTrack(layer, list, 0, buf, lengths, FADE_S)
}

function syncBgm(): void {
  const key = bgmOverride ?? bgmBase
  bgm.want = key ? `bgm-${key}.mp3` : null
  void syncLayer(bgm)
}

/** 最初のユーザー操作で呼ぶ。iOS はこの中で鳴らさないと解放されないので、無音を 1 回鳴らす */
function unlock(): void {
  if (unlocked) return
  const ac = ensureContext()
  if (!ac) return
  try {
    if (ac.state === 'suspended') void ac.resume()
    const b = ac.createBuffer(1, 1, 22050)
    const s = ac.createBufferSource()
    s.buffer = b
    s.connect(ac.destination)
    s.start(0)
  } catch {
    // 解放できなくても続ける
  }
  unlocked = true
  window.removeEventListener('pointerdown', unlock, true)
  window.removeEventListener('keydown', unlock, true)
  window.removeEventListener('touchend', unlock, true)
  syncBgm()
  void syncLayer(amb)
}

let pendingTap = 0

function playShot(file: string, rate = 1, gain = 1): void {
  if (!unlocked || !ctx || !seBus || state.seMute) return
  let p = shots.get(file)
  if (!p) {
    p = fetchBuffer(file)
    shots.set(file, p)
  }
  void p.then((buf) => {
    if (!buf || !ctx || !seBus) return
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.playbackRate.value = rate
    const g = ctx.createGain()
    g.gain.value = gain
    src.connect(g)
    g.connect(seBus)
    src.start()
    logPlayed(file)
  })
}

let lastStep = 0
let stepIndex = 0

export const sound = {
  /** 起動時に 1 回。最初の操作を待ち、タブが裏に回ったら止める */
  init(): void {
    // 開発中だけ、検証用にコンソールから触れるようにする
    if (import.meta.env.DEV) (window as unknown as { __awlSound?: unknown }).__awlSound = sound
    window.addEventListener('pointerdown', unlock, true)
    window.addEventListener('keydown', unlock, true)
    window.addEventListener('touchend', unlock, true)
    document.addEventListener('visibilitychange', () => {
      if (!ctx || !unlocked) return
      try {
        if (document.hidden) void ctx.suspend()
        else void ctx.resume()
      } catch {
        // 続ける
      }
    })
    // UI の決定・タップ: ボタンを押した時に小さく鳴らす。同じ操作で別の効果音が鳴る時はそちらだけにする
    document.addEventListener(
      'click',
      (e) => {
        const el = (e.target as Element | null)?.closest?.('button, a.set-row, [role="button"]')
        if (!el || el.closest('[data-sfx="none"]')) return
        window.clearTimeout(pendingTap)
        pendingTap = window.setTimeout(() => playShot('se-tap.mp3', 1, 0.7), 0)
      },
      true,
    )
  },

  /** ホームかワールドの BGM（ともだち帳を開いている間は上書きされる） */
  setBgm(key: BgmKey | null): void {
    if (bgmBase === key) return
    bgmBase = key
    syncBgm()
  },
  /** ともだち帳など、一時的に別の曲にする。null で前の曲へ戻す */
  setBgmOverride(key: BgmKey | null): void {
    if (bgmOverride === key) return
    bgmOverride = key
    syncBgm()
  },
  setAmb(key: AmbKey | null): void {
    const file = key ? `amb-${key}.mp3` : null
    if (amb.want === file) return
    amb.want = file
    void syncLayer(amb)
  },
  /** 収録映像を見ている間は BGM・環境音を下げる */
  setDuck(on: boolean): void {
    duck = on ? 0.3 : 1
    applyVolumes()
  },

  /** 同じ操作で少し遅れて別の効果音を鳴らす時、先にタップ音だけ取り消す */
  cancelTap(): void {
    window.clearTimeout(pendingTap)
  },
  /** 効果音。ほかの効果音が鳴る時は、同じ操作のタップ音を取り消す */
  play(name: SeName): void {
    if (name !== 'tap') window.clearTimeout(pendingTap)
    switch (name) {
      case 'step-grass':
      case 'step-snow': {
        // 歩きの揺れに合わせて呼ばれる。続けて呼ばれても詰まって聞こえないよう間を空ける
        const now = performance.now()
        if (now - lastStep < 180) return
        lastStep = now
        stepIndex = (stepIndex + 1 + Math.floor(Math.random() * (STEP_VARIANTS - 1))) % STEP_VARIANTS
        const rate = 0.96 + Math.random() * 0.08
        playShot(`se-${name}-${stepIndex + 1}.mp3`, rate, 0.55)
        return
      }
      case 'friend':
        if (state.friend === 'chime') {
          if (unlocked && ctx && seBus && !state.seMute) {
            playFriendChime(ctx, seBus)
            logPlayed('chime')
          }
        } else playShot('se-friend.mp3', 1, 0.3) // 合成チャイムと聴きくらべやすいよう、大きさをそろえる
        return
      default:
        playShot(`se-${name}.mp3`)
    }
  },

  get bgmVolume() {
    return state.bgmVol
  },
  get seVolume() {
    return state.seVol
  },
  get bgmMuted() {
    return state.bgmMute
  },
  get seMuted() {
    return state.seMute
  },
  get friendSound() {
    return state.friend
  },
  setBgmVolume(v: number): void {
    state.bgmVol = Math.min(1, Math.max(0, v))
    write(KEY.bgmVol, String(state.bgmVol))
    applyVolumes()
    listeners.forEach((fn) => fn())
  },
  setSeVolume(v: number): void {
    state.seVol = Math.min(1, Math.max(0, v))
    write(KEY.seVol, String(state.seVol))
    applyVolumes()
    listeners.forEach((fn) => fn())
  },
  setBgmMuted(on: boolean): void {
    state.bgmMute = on
    write(KEY.bgmMute, on ? '1' : '0')
    applyVolumes()
    listeners.forEach((fn) => fn())
  },
  setSeMuted(on: boolean): void {
    state.seMute = on
    write(KEY.seMute, on ? '1' : '0')
    applyVolumes()
    listeners.forEach((fn) => fn())
  },
  /** 系統ごとの音量（0〜1） */
  volume(ch: SoundChannel): number {
    return ch === 'bgm' ? state.bgmVol : ch === 'amb' ? state.ambVol : state.seVol
  },
  muted(ch: SoundChannel): boolean {
    return ch === 'bgm' ? state.bgmMute : ch === 'amb' ? state.ambMute : state.seMute
  },
  setVolume(ch: SoundChannel, v: number): void {
    if (ch === 'bgm') return this.setBgmVolume(v)
    if (ch === 'se') return this.setSeVolume(v)
    state.ambVol = Math.min(1, Math.max(0, v))
    write(KEY.ambVol, String(state.ambVol))
    applyVolumes()
    listeners.forEach((fn) => fn())
  },
  setMuted(ch: SoundChannel, on: boolean): void {
    if (ch === 'bgm') return this.setBgmMuted(on)
    if (ch === 'se') return this.setSeMuted(on)
    state.ambMute = on
    write(KEY.ambMute, on ? '1' : '0')
    applyVolumes()
    listeners.forEach((fn) => fn())
  },
  setFriendSound(v: FriendSound): void {
    state.friend = v
    write(KEY.friend, v)
    listeners.forEach((fn) => fn())
  },
  onChange(fn: () => void): void {
    listeners.push(fn)
  },
  /** 開発用: 今の状態（検証で使う） */
  debug() {
    return { played: [...played], unlocked, failed, ctx: ctx?.state ?? null, bgm: bgm.key, bgmTrack: bgm.track, bgmWant: bgm.want, amb: amb.key, ambWant: amb.want, bgmLoop: bgm.src ? [bgm.src.loopStart, bgm.src.loopEnd] : null, ambLoop: amb.src ? [amb.src.loopStart, amb.src.loopEnd] : null, ...state }
  },
}

/** ワールドの判定（regionAt）から BGM へ */
export const REGION_BGM: Record<string, BgmKey> = {
  africa: 'savanna',
  jungle: 'jungle',
  north: 'north',
  south: 'south',
  water: 'water',
  partner: 'partner',
  sky: 'sky',
}

/** ワールドの判定から環境音へ（ふれあいワールド・空の世界の環境音はまだ無い） */
export const REGION_AMB: Record<string, AmbKey> = {
  africa: 'savanna',
  jungle: 'jungle',
  north: 'north',
  south: 'south',
  water: 'water',
}
