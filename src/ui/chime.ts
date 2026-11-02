/**
 * 「ともだちになる」の優しい効果音。外部の音源ファイルは使わず、その場で合成する。
 * ユーザーの操作の直後にだけ鳴らす（自動再生しない）。
 */

let ctx: AudioContext | null = null

function getContext(): AudioContext | null {
  try {
    if (!ctx) ctx = new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

export function playFriendChime(): void {
  const ac = getContext()
  if (!ac) return
  const now = ac.currentTime
  const master = ac.createGain()
  master.gain.value = 0.0001
  master.connect(ac.destination)
  master.gain.exponentialRampToValueAtTime(0.09, now + 0.02)
  master.gain.exponentialRampToValueAtTime(0.0001, now + 1.1)

  // E5 → A5 のふたつの音を少しずらして重ねる
  const notes: Array<[number, number]> = [
    [659.25, 0],
    [880.0, 0.16],
  ]
  for (const [freq, delay] of notes) {
    const osc = ac.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = freq
    const g = ac.createGain()
    g.gain.value = 0.0001
    g.gain.exponentialRampToValueAtTime(1, now + delay + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.9)
    osc.connect(g)
    g.connect(master)
    osc.start(now + delay)
    osc.stop(now + delay + 1.0)
  }
}
