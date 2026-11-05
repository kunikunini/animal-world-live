import * as THREE from 'three'
import { terrainHeight } from './terrain'
import { SPOT } from './layout'
import type { Collider } from './props'
import type { Lion } from './lions'
import type { AiLion } from './aiLionModel'

/**
 * 群れのライオンが、自分の場所のまわりを少し歩いては立ち止まる。
 * 歩いている間だけ生成モデルの歩行クリップを再生し、止まっている間は立ち姿＋呼吸＋生活感レイヤー（Lion.update）。
 *
 * 守ること:
 * - 行き先は自分の場所から radius 以内で、地面の高さが元の場所と同じくらい（コピエの台地から崖へ出ない、水場の斜面に下りない）
 * - 岩・木・ほかの個体の当たり判定、観察スポットとその登り道、プレイヤーのそばは避ける
 * - プレイヤーが出会いの範囲に来ている間は新しく歩き出さない（名前のピンが逃げない）
 * - 動きをへらす設定では歩かない
 */
export interface LionWander {
  update: (dt: number, time: number, player: THREE.Vector3) => void
  setReduceMotion: (on: boolean) => void
}

export interface WanderOptions {
  /** 歩く速さ（m/s） */
  speed: number
  /** 自分の場所からここまで（m） */
  radius: number
  /** 立ち止まる時間の幅（秒） */
  idle: [number, number]
}

const TURN_SPEED = 2.4
/** 観察スポットと、南の登り口からスポットまでの道には近づかない（m） */
const SPOT_CLEARANCE = 3.2
const PLAYER_CLEARANCE = 4.5

export function createLionWander(lion: Lion, ai: AiLion, colliders: Collider[], opts: WanderOptions): LionWander {
  const group = lion.group
  const home = { x: group.position.x, z: group.position.z, h: terrainHeight(group.position.x, group.position.z) }
  const own = lion.collider
  // 観察スポットと登り道からの距離。もともとそれより近くにいる子（アンジー）は、いまの距離より近づかなければよい
  const spotKeep = Math.min(SPOT_CLEARANCE + own.r, Math.hypot(SPOT.x - home.x, SPOT.z - home.z) - 0.3)
  const pathKeep = Math.min(SPOT_CLEARANCE + own.r, distanceToSegment(home.x, home.z, SPOT.approach.x, SPOT.approach.z, SPOT.x, SPOT.z) - 0.3)
  // クリップの速さを体の速さに合わせる（model は群れの倍率の中にあるので、倍率で割る）
  ai.setWalkSpeed(opts.speed / group.scale.y)
  let target: { x: number; z: number } | null = null
  let timer = opts.idle[0] * (0.3 + Math.random() * 0.7)
  let reduceMotion = false

  const place = (x: number, z: number) => {
    group.position.set(x, terrainHeight(x, z), z)
    lion.position.copy(group.position)
    own.x = x
    own.z = z
  }

  const clearOf = (x: number, z: number, player: THREE.Vector3): boolean => {
    // 地面の高さが元の場所と同じくらい（台地の上・平らな所にとどまる）
    if (Math.abs(terrainHeight(x, z) - home.h) > 0.3) return false
    for (const c of colliders) {
      if (c === own) continue
      if (Math.hypot(c.x - x, c.z - z) < c.r + own.r + 0.25) return false
    }
    if (Math.hypot(SPOT.x - x, SPOT.z - z) < spotKeep) return false
    if (distanceToSegment(x, z, SPOT.approach.x, SPOT.approach.z, SPOT.x, SPOT.z) < pathKeep) return false
    if (Math.hypot(player.x - x, player.z - z) < PLAYER_CLEARANCE) return false
    return true
  }

  const pick = (player: THREE.Vector3): { x: number; z: number } | null => {
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2
      const r = opts.radius * (0.45 + Math.random() * 0.55)
      const x = home.x + Math.cos(a) * r
      const z = home.z + Math.sin(a) * r
      // 行き先が近すぎる（向きを変えるだけ）のは選ばない
      if (Math.hypot(x - group.position.x, z - group.position.z) < 1.2) continue
      if (!clearOf(x, z, player)) continue
      // 途中も平らで、ほかの個体や岩にぶつからない
      let ok = true
      for (let t = 0.25; t < 1 && ok; t += 0.25) {
        const mx = group.position.x + (x - group.position.x) * t
        const mz = group.position.z + (z - group.position.z) * t
        ok = clearOf(mx, mz, player)
      }
      if (ok) return { x, z }
    }
    return null
  }

  const update = (dt: number, _time: number, player: THREE.Vector3) => {
    if (reduceMotion) {
      target = null
      ai.setWalking(false)
      return
    }
    if (target) {
      const dx = target.x - group.position.x
      const dz = target.z - group.position.z
      const dist = Math.hypot(dx, dz)
      if (dist < 0.12) {
        target = null
        timer = opts.idle[0] + Math.random() * (opts.idle[1] - opts.idle[0])
        ai.setWalking(false)
        return
      }
      // まず体を行き先へ向ける（立ったまま）。向いたら歩き出す
      const want = Math.atan2(dx, dz)
      let diff = want - group.rotation.y
      diff = Math.atan2(Math.sin(diff), Math.cos(diff))
      const turn = Math.sign(diff) * Math.min(Math.abs(diff), TURN_SPEED * dt)
      group.rotation.y += turn
      if (Math.abs(diff) > 0.45) {
        ai.setWalking(false)
        return
      }
      ai.setWalking(true)
      const stepLen = Math.min(dist, opts.speed * dt)
      place(group.position.x + (dx / dist) * stepLen, group.position.z + (dz / dist) * stepLen)
      return
    }
    ai.setWalking(false)
    timer -= dt
    if (timer > 0) return
    // プレイヤーが出会いの範囲（ピンが出る距離）にいる間は、そのまま立っている
    const d = Math.hypot(player.x - group.position.x, player.z - group.position.z)
    if (d < own.r + 4.2 + 2.0) {
      timer = 1.5
      return
    }
    target = pick(player)
    if (!target) timer = 2 + Math.random() * 2
  }

  return {
    update,
    setReduceMotion: (on) => {
      reduceMotion = on
    },
  }
}

function distanceToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const vx = bx - ax
  const vz = bz - az
  const len2 = vx * vx + vz * vz
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / len2)) : 0
  return Math.hypot(px - (ax + vx * t), pz - (az + vz * t))
}
