import type * as THREE from 'three'
import { terrainHeight } from './terrain'

/**
 * 地形の上に置いた、主人公が上を歩ける面（橋の板・柱の頂の台）。
 * 地形の高さ（terrainHeight）だけでは橋の上を歩けず、下の地面へすり抜けてしまうので、主人公の足元はこちらも見る。
 * 面は「足の高さから STEP_UP までの高さ」の時だけ乗る（橋の下を歩く時に、急に橋の上へ持ち上げない）
 */
export interface WalkSurface {
  /** (x, z) が面の上ならその高さ、外なら null */
  heightAt: (x: number, z: number) => number | null
  /** 面の上にいる時に、手すりの内側へ戻す（手すりの無い面は何もしない） */
  constrain?: (p: { x: number; z: number }) => void
  /** タップで面を目指す時に通る点（地面からの入口から順に） */
  via: Array<{ x: number; z: number }>
  /** タップの当たりに使う形 */
  meshes: THREE.Object3D[]
}

/** 段差として乗れる高さ（m） */
export const STEP_UP = 0.5

const surfaces: WalkSurface[] = []

export function addWalkSurface(s: WalkSurface): void {
  surfaces.push(s)
}

export function walkSurfaces(): readonly WalkSurface[] {
  return surfaces
}

/** 平らな円い台（柱の頂など） */
export function deckSurface(x: number, z: number, r: number, y: number, via: WalkSurface['via'], meshes: THREE.Object3D[]): WalkSurface {
  return {
    heightAt: (px, pz) => (Math.hypot(px - x, pz - z) <= r ? y : null),
    via,
    meshes,
  }
}

/** a から b へ傾いた、幅 2×half の板（橋）。rail の時は両側に手すりがあり、上にいる間は inner より外へ出ない */
export function rampSurface(
  a: { x: number; z: number; y: number },
  b: { x: number; z: number; y: number },
  half: number,
  rail: number | null,
  via: WalkSurface['via'],
  meshes: THREE.Object3D[],
): WalkSurface {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const len = Math.hypot(dx, dz)
  const ux = dx / len
  const uz = dz / len
  const local = (px: number, pz: number) => {
    const rx = px - a.x
    const rz = pz - a.z
    return { t: (rx * ux + rz * uz) / len, s: -rx * uz + rz * ux }
  }
  return {
    heightAt: (px, pz) => {
      const { t, s } = local(px, pz)
      if (t < 0 || t > 1 || Math.abs(s) > half) return null
      return a.y + (b.y - a.y) * t
    },
    constrain: rail === null
      ? undefined
      : (p) => {
          const { t, s } = local(p.x, p.z)
          // 端（両側の入口）は開けておく
          if (t <= 0.02 || t >= 0.98 || Math.abs(s) <= rail) return
          const k = Math.sign(s) * rail - s
          p.x += -uz * k
          p.z += ux * k
        },
    via,
    meshes,
  }
}

/** 足の高さ feetY から乗れる、いちばん高い面（無ければ null）。乗っている面も返す */
export function surfaceUnder(x: number, z: number, feetY: number): { y: number; surface: WalkSurface } | null {
  let best: { y: number; surface: WalkSurface } | null = null
  for (const s of surfaces) {
    const y = s.heightAt(x, z)
    if (y === null || y > feetY + STEP_UP) continue
    if (!best || y > best.y) best = { y, surface: s }
  }
  return best
}

/** 足元の高さ: 地形と、足の高さから乗れる面の高いほう */
export function groundUnder(x: number, z: number, feetY: number): number {
  const g = terrainHeight(x, z)
  const s = surfaceUnder(x, z, feetY)
  return s && s.y > g ? s.y : g
}
