/**
 * トロッコの音。曲も効果音も Web Audio でその場で合成する（音源ファイル・有料の生成は使わない）。
 * 出口は sound.synthOut（BGM・効果音の音量と消音の設定がそのまま効く）。音が使えない時は何もしない。
 * 曲は 128 BPM・16 分音符の刻み。区間（水・まん中・空）で調と楽器を替え、小節の頭で切り替える。
 */
import { sound } from '../audio/sound'
import type { Theme } from './course'

const BPM = 128
const STEP_S = 60 / BPM / 4

type Out = { ctx: AudioContext; out: AudioNode }

/** 区間ごとの曲: 4 小節のコード（根音の MIDI と和音の形）、メロディ（16 分音符 64 個。-1 は休み） */
interface Song {
  chords: Array<{ root: number; tones: number[] }>
  lead: number[]
  arpWave: OscillatorType
  pad: boolean
  drums: 'full' | 'soft'
}

const MAJ = [0, 4, 7, 12]
const MIN = [0, 3, 7, 12]
const SUS = [0, 5, 7, 12]

// メロディは度数ではなく MIDI の音で書く（-1 は休み、-2 はのばす）
const _ = -1
const L = -2
const SONGS: Record<Theme, Song> = {
  // 水の世界: ハ長調、はずむ三角波の分散和音、ドラムはしっかり
  water: {
    chords: [
      { root: 48, tones: MAJ },
      { root: 45, tones: MIN },
      { root: 41, tones: MAJ },
      { root: 43, tones: MAJ },
    ],
    lead: [
      72, _, 76, _, 79, L, 76, _, 74, _, 72, _, 74, L, _, _,
      69, _, 72, _, 76, L, 74, _, 72, _, 69, _, 72, L, _, _,
      65, _, 69, _, 72, L, 74, _, 76, _, 77, _, 76, L, 74, _,
      74, _, 76, _, 79, L, L, _, 81, _, 79, _, 76, L, _, _,
    ],
    arpWave: 'triangle',
    pad: false,
    drums: 'full',
  },
  // まん中の暗い坑道: イ短調、シンセの和音を薄く、ドラムは控えめ。メロディは少なめで洞窟の響き
  mid: {
    chords: [
      { root: 45, tones: MIN },
      { root: 41, tones: MAJ },
      { root: 43, tones: MAJ },
      { root: 40, tones: SUS },
    ],
    lead: [
      _, _, _, _, 76, L, L, L, _, _, 74, _, 72, L, L, L,
      _, _, _, _, 72, L, L, L, _, _, 74, _, 76, L, L, L,
      _, _, _, _, 79, L, L, L, 77, _, 76, _, 74, L, L, L,
      _, _, _, _, 71, L, L, L, _, _, 72, _, 71, L, L, L,
    ],
    arpWave: 'square',
    pad: true,
    drums: 'soft',
  },
  // 空の世界: ヘ長調、明るく軽い。和音を厚く、高いメロディ
  sky: {
    chords: [
      { root: 41, tones: MAJ },
      { root: 43, tones: SUS },
      { root: 45, tones: MIN },
      { root: 48, tones: MAJ },
    ],
    lead: [
      77, _, 81, _, 84, L, 81, _, 79, L, 77, _, 79, L, _, _,
      79, _, 81, _, 86, L, 84, _, 81, L, 79, _, 81, L, _, _,
      81, _, 84, _, 88, L, 86, _, 84, L, 81, _, 84, L, 86, _,
      84, _, 81, _, 79, L, 77, _, 79, L, L, _, 77, L, _, _,
    ],
    arpWave: 'triangle',
    pad: true,
    drums: 'full',
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
    const cur = SONGS[song]
    const bar = Math.floor(s / 16) % 4
    const i = s % 16
    const ch = cur.chords[bar]
    // ベース: 8 分音符で根音と 5 度、1 拍目は長め
    if (i % 2 === 0) {
      const m = ch.root - 12 + (i % 8 === 4 ? 7 : 0)
      tone(o, t, hz(m), hz(m), i === 0 ? STEP_S * 3 : STEP_S * 1.6, 0.16, 'triangle', 0.006)
    }
    // 分散和音: 16 分音符
    const m = ch.root + 12 + ch.tones[(i + bar) % ch.tones.length] + (i >= 8 ? 12 : 0)
    tone(o, t, hz(m), hz(m), STEP_S * 0.9, cur.arpWave === 'square' ? 0.018 : 0.045, cur.arpWave, 0.003)
    // 和音の帯（まん中・空）: 小節の頭で 2 拍
    if (cur.pad && i === 0) {
      for (const k of ch.tones.slice(0, 3)) {
        const f = hz(ch.root + 12 + k)
        for (const det of [-6, 6]) {
          const osc = o.ctx.createOscillator()
          osc.type = 'sawtooth'
          osc.frequency.value = f
          osc.detune.value = det
          const lp = o.ctx.createBiquadFilter()
          lp.type = 'lowpass'
          lp.frequency.value = song === 'mid' ? 700 : 1300
          const g = o.ctx.createGain()
          const dur = STEP_S * 15
          g.gain.setValueAtTime(0.0001, t)
          g.gain.linearRampToValueAtTime(0.012, t + 0.25)
          g.gain.linearRampToValueAtTime(0.0001, t + dur)
          osc.connect(lp).connect(g).connect(o.out)
          osc.start(t)
          osc.stop(t + dur + 0.05)
        }
      }
    }
    // メロディ
    const n = cur.lead[(bar * 16 + i) % 64]
    if (n >= 0) {
      let len = 1
      while (cur.lead[(bar * 16 + i + len) % 64] === L && len < 8) len++
      const f = hz(n)
      tone(o, t, f, f, STEP_S * len * 0.95 + 0.05, song === 'mid' ? 0.05 : 0.06, 'square', 0.01)
      tone(o, t, f * 2, f * 2, STEP_S * len * 0.6, 0.012, 'sine', 0.01)
    }
    // ドラム
    if (i === 0 || i === 8 || (cur.drums === 'full' && i === 10)) tone(o, t, 140, 45, 0.16, 0.32, 'sine', 0.002)
    if (cur.drums === 'full' && (i === 4 || i === 12)) hiss(o, t, 0.14, 0.12, 'bandpass', 1800, 1200, 0.8)
    if (i % 2 === 0 || cur.drums === 'full') hiss(o, t, 0.035, i % 4 === 2 ? 0.05 : 0.028, 'highpass', 7600)
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
