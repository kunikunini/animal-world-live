/**
 * トロッコの音。曲も効果音も Web Audio でその場で合成する（音源ファイル・有料の生成は使わない）。
 * 出口は sound.synthOut（BGM・効果音の音量と消音の設定がそのまま効く）。音が使えない時は何もしない。
 * 曲は 158 BPM・16 分音符の刻み（11/14 くにの実機「スリルがない」→ アップテンポに作り直し）。
 * 4 つ打ちのキック・2 拍 4 拍のスネア・16 分のハイハット・オクターブで跳ねるベース・裏拍の和音で走る感じを出す。
 * 区間（水・まん中・空）で調とメロディを替え、小節の頭で切り替える。レバーをこいでいる間は刻みが増える。
 * 出口のラストスパートは、だんだん細かくなるスネアと上がっていく音（ライザー）。
 */
import { sound } from '../audio/sound'
import type { Theme } from './course'

const BPM = 158
const STEP_S = 60 / BPM / 4

type Out = { ctx: AudioContext; out: AudioNode }

/** 区間ごとの曲: 4 小節のコード（根音の MIDI と和音の形）、メロディ（16 分音符 64 個） */
interface Song {
  chords: Array<{ root: number; tones: number[] }>
  lead: number[]
  leadWave: OscillatorType
}

const MAJ = [0, 4, 7, 12]
const MIN = [0, 3, 7, 12]

// メロディは MIDI の音で書く（-1 は休み、-2 はのばす）
const _ = -1
const L = -2
const SONGS: Record<Theme, Song> = {
  // 水の世界: イ短調のサーフロック風。Am → F → G → E
  water: {
    chords: [
      { root: 45, tones: MIN },
      { root: 41, tones: MAJ },
      { root: 43, tones: MAJ },
      { root: 40, tones: MAJ },
    ],
    lead: [
      69, _, 72, 76, _, 76, 74, 72, 74, L, 72, _, 69, _, 64, _,
      65, _, 69, 72, _, 72, 74, 76, 77, L, 76, _, 74, _, 72, _,
      67, _, 71, 74, _, 74, 76, 79, 81, L, 79, _, 76, _, 74, _,
      76, _, _, 75, 76, _, 79, _, 80, L, L, _, 83, L, L, _,
    ],
    leadWave: 'square',
  },
  // まん中の暗い坑道: ホ短調のどきどきする刻み。Em → C → D → B
  mid: {
    chords: [
      { root: 40, tones: MIN },
      { root: 48, tones: MAJ },
      { root: 50, tones: MAJ },
      { root: 47, tones: MAJ },
    ],
    lead: [
      64, _, 64, 67, _, 64, 71, _, 70, _, 67, _, 64, _, 62, _,
      60, _, 64, 67, _, 72, 71, _, 67, _, 64, _, 67, L, _, _,
      62, _, 66, 69, _, 74, 72, _, 69, _, 66, _, 69, L, _, _,
      71, _, _, 71, 70, _, 71, _, 75, L, _, 74, 75, _, 78, _,
    ],
    leadWave: 'sawtooth',
  },
  // 空の世界: ニ長調の、空へかけ上がるメロディ。D → A → Bm → G
  sky: {
    chords: [
      { root: 50, tones: MAJ },
      { root: 45, tones: MAJ },
      { root: 47, tones: MIN },
      { root: 43, tones: MAJ },
    ],
    lead: [
      74, _, 78, 81, _, 78, 81, 86, L, _, 85, _, 83, _, 81, _,
      76, _, 81, 85, _, 81, 85, 88, L, _, 86, _, 85, _, 83, _,
      78, _, 83, 86, _, 83, 86, 90, L, _, 88, _, 86, _, 85, _,
      79, _, 83, 86, _, 88, _, 86, 85, _, 83, _, 81, L, L, _,
    ],
    leadWave: 'square',
  },
}

const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12)

function noiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds)
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
  return buf
}

export interface TrolleyAudio {
  /** 毎コマ。speed は u/s、onRail は線路の上か */
  update: (dt: number, theme: Theme, speed: number, onRail: boolean, boost: boolean) => void
  music: (on: boolean) => void
  clack: () => void
  jump: () => void
  land: (hard: boolean) => void
  item: () => void
  splash: () => void
  pop: () => void
  throwClod: () => void
  thud: () => void
  squeak: () => void
  bats: () => void
  wind: () => void
  fanfare: () => void
  whoosh: () => void
  /** レバーをこぐ強さ 0〜1（曲の刻みが増える） */
  setDrive: (k: number) => void
  /** レバーを 1 回こいだ音 */
  pump: () => void
  /** 出発の数え（3・2・1 は n、GO は 0） */
  count: (n: number) => void
  /** 出口のラストスパートの進み（null で終わり） */
  setFinale: (k: number | null) => void
  /** 連打の 1 回 */
  tapHit: (k: number) => void
  stop: () => void
}

export function createTrolleyAudio(): TrolleyAudio {
  let noise: AudioBuffer | null = null
  let rumbleSrc: AudioBufferSourceNode | null = null
  let rumbleGain: GainNode | null = null
  let rumbleFilter: BiquadFilterNode | null = null
  let sparkGain: GainNode | null = null
  let musicOn = false
  let nextT = 0
  let step = 0
  let song: Theme = 'water'
  let wantSong: Theme = 'water'
  let combo = 0
  let comboT = 0
  let stopped = false
  let drive = 0
  let finaleK: number | null = null

  const se = (): Out | null => (stopped ? null : sound.synthOut('se'))
  const bg = (): Out | null => (stopped ? null : sound.synthOut('bgm'))
  const getNoise = (ctx: AudioContext) => (noise ??= noiseBuffer(ctx, 1.5))

  /** 減衰する音 1 つ */
  function tone(o: Out, t: number, f0: number, f1: number, dur: number, gain: number, wave: OscillatorType = 'sine', attack = 0.004): void {
    const osc = o.ctx.createOscillator()
    const g = o.ctx.createGain()
    osc.type = wave
    osc.frequency.setValueAtTime(f0, t)
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(gain, t + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    osc.connect(g).connect(o.out)
    osc.start(t)
    osc.stop(t + dur + 0.02)
  }

  /** ノイズの一撃（帯域を絞る） */
  function hiss(o: Out, t: number, dur: number, gain: number, type: BiquadFilterType, f0: number, f1 = f0, q = 1): void {
    const src = o.ctx.createBufferSource()
    src.buffer = getNoise(o.ctx)
    const f = o.ctx.createBiquadFilter()
    f.type = type
    f.Q.value = q
    f.frequency.setValueAtTime(f0, t)
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur)
    const g = o.ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(gain, t + 0.006)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(f).connect(g).connect(o.out)
    src.start(t, Math.random() * 0.8)
    src.stop(t + dur + 0.02)
  }

  function startRumble(o: Out): void {
    if (rumbleSrc) return
    const src = o.ctx.createBufferSource()
    src.buffer = getNoise(o.ctx)
    src.loop = true
    const f = o.ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = 260
    const g = o.ctx.createGain()
    g.gain.value = 0
    src.connect(f).connect(g).connect(o.out)
    // 下り坂の火花のシャリシャリ
    const hf = o.ctx.createBiquadFilter()
    hf.type = 'highpass'
    hf.frequency.value = 5200
    const sg = o.ctx.createGain()
    sg.gain.value = 0
    src.connect(hf).connect(sg).connect(o.out)
    src.start()
    rumbleSrc = src
    rumbleGain = g
    rumbleFilter = f
    sparkGain = sg
  }

  function scheduleStep(o: Out, t: number, s: number): void {
    const i = s % 16
    // 出口のラストスパート: 和音をのばし、スネアがだんだん細かく、音が上がっていく
    if (finaleK !== null) {
      const fk = finaleK
      const every = fk < 0.35 ? 4 : fk < 0.7 ? 2 : 1
      if (i % 4 === 0) tone(o, t, 150, 45, 0.14, 0.34, 'sine', 0.002)
      if (i % every === 0) hiss(o, t, 0.08, 0.06 + 0.08 * fk, 'bandpass', 1900, 1400, 0.9)
      hiss(o, t, 0.03, 0.03, 'highpass', 8000)
      if (i % 2 === 0) {
        const m = 57 + Math.round(fk * 12)
        tone(o, t, hz(m - 12), hz(m - 12), STEP_S * 1.5, 0.12, 'sawtooth', 0.004)
        tone(o, t, hz(m + 12), hz(m + 12), STEP_S * 1.2, 0.035, 'square', 0.004)
      }
      return
    }
    const cur = SONGS[song]
    const bar = Math.floor(s / 16) % 4
    const ch = cur.chords[bar]
    // ベース: 16 分でオクターブを跳ねる（低い根音・高い根音）。のこぎり波を低く絞る
    {
      const m = ch.root - 12 + (i % 2 === 1 ? 12 : 0) + (i === 14 && bar === 3 ? 7 : 0)
      const osc = o.ctx.createOscillator()
      osc.type = 'sawtooth'
      osc.frequency.value = hz(m)
      const lp = o.ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.setValueAtTime(900, t)
      lp.frequency.exponentialRampToValueAtTime(220, t + STEP_S * 0.9)
      const g = o.ctx.createGain()
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(i % 2 === 0 ? 0.13 : 0.08, t + 0.005)
      g.gain.exponentialRampToValueAtTime(0.0001, t + STEP_S * 0.95)
      osc.connect(lp).connect(g).connect(o.out)
      osc.start(t)
      osc.stop(t + STEP_S + 0.02)
    }
    // 裏拍の和音（ギターのカッティングのように短く）
    if (i % 4 === 2) {
      for (const k of ch.tones.slice(0, 3)) tone(o, t, hz(ch.root + 12 + k), hz(ch.root + 12 + k), STEP_S * 0.7, 0.022, 'square', 0.002)
    }
    // レバーをこいでいる間は、高い分散和音を足して走る感じを強める
    if (drive > 0.2) {
      const m = ch.root + 24 + ch.tones[(i + bar) % ch.tones.length]
      tone(o, t, hz(m), hz(m), STEP_S * 0.6, 0.02 * drive, 'triangle', 0.002)
    }
    // メロディ
    const n = cur.lead[(bar * 16 + i) % 64]
    if (n >= 0) {
      let len = 1
      while (cur.lead[(bar * 16 + i + len) % 64] === L && len < 8) len++
      const f = hz(n)
      const osc = o.ctx.createOscillator()
      osc.type = cur.leadWave
      osc.frequency.value = f
      const lp = o.ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = cur.leadWave === 'sawtooth' ? 2400 : 3600
      const g = o.ctx.createGain()
      const dur = STEP_S * len * 0.92 + 0.03
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.055, t + 0.008)
      g.gain.setValueAtTime(0.05, t + dur * 0.7)
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
      osc.connect(lp).connect(g).connect(o.out)
      osc.start(t)
      osc.stop(t + dur + 0.02)
      tone(o, t, f * 2, f * 2, dur * 0.6, 0.012, 'sine', 0.008)
    }
    // ドラム: 4 つ打ちのキック、2・4 拍のスネア、4 小節目の最後はスネアの連打
    if (i % 4 === 0) tone(o, t, 160, 42, 0.15, 0.4, 'sine', 0.002)
    const fill = bar === 3 && i >= 12
    if (i === 4 || i === 12 || fill) hiss(o, t, fill ? 0.08 : 0.16, fill ? 0.1 : 0.15, 'bandpass', 1900, 1300, 0.8)
    if (i === 4 || i === 12) tone(o, t, 240, 160, 0.06, 0.08, 'triangle', 0.002)
    // ハイハット: 16 分（表は強め）、裏拍はオープン
    hiss(o, t, i % 4 === 2 ? 0.09 : 0.03, i % 4 === 2 ? 0.05 : i % 2 === 0 ? 0.035 : 0.022, 'highpass', 7800)
  }

  return {
    update(dt, theme, speed, onRail, boost) {
      wantSong = theme
      if (comboT > 0) {
        comboT -= dt
        if (comboT <= 0) combo = 0
      }
      const o = se()
      if (o) {
        startRumble(o)
        const now = o.ctx.currentTime
        const k = onRail ? Math.min(1, speed / 560) : 0
        rumbleGain?.gain.setTargetAtTime(0.05 + 0.2 * k * (onRail ? 1 : 0), now, 0.08)
        if (!onRail) rumbleGain?.gain.setTargetAtTime(0, now, 0.05)
        rumbleFilter?.frequency.setTargetAtTime(180 + 260 * k, now, 0.1)
        sparkGain?.gain.setTargetAtTime(boost && onRail ? 0.05 : 0, now, 0.12)
      }
      const b = bg()
      if (!b || !musicOn) return
      const now = b.ctx.currentTime
      if (nextT < now) nextT = now + 0.05
      while (nextT < now + 0.15) {
        // 曲は小節の頭で替える
        if (step % 16 === 0 && wantSong !== song) song = wantSong
        scheduleStep(b, nextT, step)
        nextT += STEP_S
        step++
      }
    },
    music(on) {
      musicOn = on
      if (on) {
        step = 0
        song = wantSong
        const b = bg()
        if (b) nextT = b.ctx.currentTime + 0.1
      }
    },
    clack() {
      const o = se()
      if (!o) return
      const t = o.ctx.currentTime
      hiss(o, t, 0.03, 0.09, 'bandpass', 2400, 2400, 3)
      hiss(o, t + 0.07, 0.03, 0.07, 'bandpass', 2000, 2000, 3)
    },
    jump() {
      const o = se()
      if (!o) return
      const t = o.ctx.currentTime
      tone(o, t, 320, 760, 0.16, 0.12, 'sine')
      hiss(o, t, 0.22, 0.06, 'bandpass', 600, 2400, 0.7)
    },
    land(hard) {
      const o = se()
      if (!o) return
      const t = o.ctx.currentTime
      tone(o, t, hard ? 150 : 110, 45, hard ? 0.28 : 0.16, hard ? 0.4 : 0.22, 'sine', 0.002)
      hiss(o, t, hard ? 0.3 : 0.12, hard ? 0.16 : 0.07, 'lowpass', 1200, 300)
      hiss(o, t, 0.05, 0.08, 'bandpass', 3000, 3000, 4)
    },
    item() {
      const o = se()
      if (!o) return
      const t = o.ctx.currentTime
      const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24]
      const m = 79 + scale[Math.min(combo, scale.length - 1)]
      combo++
      comboT = 1.1
      tone(o, t, hz(m), hz(m), 0.32, 0.08, 'sine', 0.002)
      tone(o, t, hz(m + 12), hz(m + 12), 0.18, 0.025, 'triangle', 0.002)
    },
    splash() {
      const o = se()
      if (!o) return
      const t = o.ctx.currentTime
      hiss(o, t, 0.45, 0.16, 'bandpass', 1600, 500, 0.6)
      for (let k = 0; k < 4; k++) tone(o, t + 0.05 + k * 0.06, 900 + Math.random() * 900, 1400 + Math.random() * 600, 0.06, 0.03)
    },
    pop() {
      const o = se()
      if (!o) return
      const t = o.ctx.currentTime
      tone(o, t, 380, 900, 0.09, 0.12, 'sine')
      hiss(o, t, 0.12, 0.05, 'lowpass', 900, 300)
    },
    throwClod() {
      const o = se()
      if (!o) return
      hiss(o, o.ctx.currentTime, 0.3, 0.07, 'bandpass', 500, 1500, 0.8)
    },
    thud() {
      const o = se()
      if (!o) return
      const t = o.ctx.currentTime
      tone(o, t, 120, 40, 0.3, 0.42, 'sine', 0.002)
      hiss(o, t, 0.35, 0.2, 'lowpass', 1400, 200)
      // ぼよん
      const osc = o.ctx.createOscillator()
      const g = o.ctx.createGain()
      const lfo = o.ctx.createOscillator()
      const lg = o.ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(260, t + 0.05)
      osc.frequency.exponentialRampToValueAtTime(130, t + 0.5)
      lfo.frequency.value = 14
      lg.gain.value = 18
      lfo.connect(lg).connect(osc.frequency)
      g.gain.setValueAtTime(0.0001, t + 0.05)
      g.gain.exponentialRampToValueAtTime(0.1, t + 0.08)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55)
      osc.connect(g).connect(o.out)
      osc.start(t + 0.05)
      lfo.start(t + 0.05)
      osc.stop(t + 0.6)
      lfo.stop(t + 0.6)
    },
    squeak() {
      const o = se()
      if (!o) return
      const t = o.ctx.currentTime
      tone(o, t, 1900, 2600, 0.07, 0.05, 'sine')
      tone(o, t + 0.1, 2100, 2900, 0.06, 0.045, 'sine')
    },
    bats() {
      const o = se()
      if (!o) return
      const t = o.ctx.currentTime
      for (let k = 0; k < 14; k++) hiss(o, t + k * 0.045 + Math.random() * 0.02, 0.05, 0.05, 'bandpass', 900 + Math.random() * 600, 700, 2)
      for (let k = 0; k < 3; k++) tone(o, t + 0.1 + k * 0.13, 5200, 4400, 0.04, 0.012)
    },
    wind() {
      const o = se()
      if (!o) return
      hiss(o, o.ctx.currentTime, 0.9, 0.12, 'bandpass', 380, 1400, 0.9)
    },
    fanfare() {
      const o = bg() ?? se()
      if (!o) return
      const t = o.ctx.currentTime + 0.05
      const notes = [60, 64, 67, 72, 76, 79, 84]
      notes.forEach((m, k) => tone(o, t + k * 0.07, hz(m), hz(m), 0.5, 0.06, 'square', 0.005))
      for (const m of [72, 76, 79, 84]) tone(o, t + 0.55, hz(m), hz(m), 1.4, 0.05, 'triangle', 0.01)
      tone(o, t + 0.55, hz(48), hz(48), 1.4, 0.16, 'triangle', 0.01)
    },
    whoosh() {
      const o = se()
      if (!o) return
      hiss(o, o.ctx.currentTime, 0.7, 0.14, 'bandpass', 300, 2600, 0.7)
    },
    setDrive(k) {
      drive = k
    },
    pump() {
      const o = se()
      if (!o) return
      const t = o.ctx.currentTime
      hiss(o, t, 0.08, 0.06, 'bandpass', 900, 1600, 2)
      tone(o, t, 200, 320, 0.08, 0.06, 'triangle', 0.003)
    },
    count(n) {
      const o = se()
      if (!o) return
      const t = o.ctx.currentTime
      if (n > 0) {
        tone(o, t, hz(72), hz(72), 0.22, 0.12, 'square', 0.004)
        tone(o, t, hz(84), hz(84), 0.12, 0.03, 'sine', 0.004)
      } else {
        for (const m of [72, 76, 79, 84]) tone(o, t, hz(m), hz(m), 0.5, 0.07, 'square', 0.004)
        hiss(o, t, 0.6, 0.12, 'bandpass', 400, 3000, 0.7)
        tone(o, t, 160, 40, 0.3, 0.4, 'sine', 0.002)
      }
    },
    setFinale(k) {
      finaleK = k
    },
    tapHit(k) {
      const o = se()
      if (!o) return
      const t = o.ctx.currentTime
      tone(o, t, hz(72 + Math.round(k * 14)), hz(79 + Math.round(k * 14)), 0.09, 0.07, 'square', 0.002)
      hiss(o, t, 0.06, 0.06, 'bandpass', 2600, 2600, 2)
    },
    stop() {
      musicOn = false
      try {
        rumbleSrc?.stop()
      } catch {
        // 止められなくても続ける
      }
      rumbleSrc = null
      stopped = true
    },
  }
}
