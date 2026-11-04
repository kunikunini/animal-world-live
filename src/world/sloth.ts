import * as THREE from 'three'
import { toonMaterial } from '../render/toon'
import type { Collider } from './props'
import type { Lion } from './lions'

/**
 * 様式化したフタユビナマケモノ。横枝に四本の腕でぶら下がり、顔をこちらへ向けている。
 * group の原点は枝に掛かる手の位置（地面からの高さは呼ぶ側が決める）。体はその下にぶら下がる。
 * ほかの子と同じ形（Lion）で返すので、出会いの仕組みにそのまま乗る。
 */
export interface SlothOptions {
  id: string
  x: number
  /** 枝の高さ（ワールドの y） */
  y: number
  z: number
  yaw: number
  size?: number
}

export function createSloth(options: SlothOptions): Lion {
  const group = new THREE.Group()
  group.name = `sloth-${options.id}`
  const position = new THREE.Vector3(options.x, options.y, options.z)
  group.position.copy(position)
  group.rotation.y = options.yaw
  const scale = options.size ?? 1
  group.scale.setScalar(scale)

  const fur = toonMaterial({ color: '#a58a6c' })
  const furLight = toonMaterial({ color: '#cdb796' })
  const face = toonMaterial({ color: '#efe3cf' })
  const dark = toonMaterial({ color: '#4a3527' })
  const claw = toonMaterial({ color: '#3a2c22' })
  const eyeMat = new THREE.MeshBasicMaterial({ color: '#140d08' })
  const glintMat = new THREE.MeshBasicMaterial({ color: '#fff6e6' })
  const cast = (m: THREE.Mesh) => {
    m.castShadow = true
    m.receiveShadow = true
    return m
  }

  // 体全体を少し揺らすための入れ物
  const hang = new THREE.Group()
  group.add(hang)

  // 胴: 枝の下にぶら下がる、ふさふさの楕円
  const torso = cast(new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 10), fur))
  torso.position.set(0, -0.55, 0)
  torso.scale.set(0.95, 0.8, 1.45)
  const back = cast(new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8), furLight))
  back.position.set(0, -0.72, -0.05)
  back.scale.set(0.9, 0.6, 1.3)
  hang.add(torso, back)

  // 四本の腕と脚: 胴から枝へまっすぐ伸び、先に黒い鉤爪
  const limbs = [
    { x: -0.2, z: 0.32 },
    { x: 0.2, z: 0.32 },
    { x: -0.2, z: -0.36 },
    { x: 0.2, z: -0.36 },
  ]
  for (const l of limbs) {
    const from = new THREE.Vector3(l.x * 1.2, -0.5, l.z * 0.8)
    const to = new THREE.Vector3(l.x, 0, l.z)
    const len = from.distanceTo(to)
    const limb = cast(new THREE.Mesh(new THREE.CapsuleGeometry(0.07, len, 4, 8), fur))
    limb.position.copy(from).add(to).multiplyScalar(0.5)
    limb.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize())
    const hook = cast(new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.018, 4, 8, Math.PI * 1.2), claw))
    hook.position.copy(to).add(new THREE.Vector3(0, 0.05, 0))
    hook.rotation.y = Math.PI / 2
    hang.add(limb, hook)
  }

  // 首と頭: 胴の前の下。顔はうすいクリームに、目から横へ伸びる黒い帯
  const neckPivot = new THREE.Group()
  neckPivot.position.set(0, -0.6, 0.42)
  const head = new THREE.Group()
  const skull = cast(new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), fur))
  skull.scale.set(1.05, 0.95, 0.95)
  const mask = cast(new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), face))
  mask.position.set(0, -0.01, 0.07)
  mask.scale.set(1.05, 0.9, 0.75)
  const snout = cast(new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), dark))
  snout.position.set(0, -0.05, 0.17)
  snout.scale.set(1.2, 0.8, 0.7)
  head.add(skull, mask, snout)
  for (const side of [-1, 1]) {
    const stripe = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), dark)
    stripe.position.set(side * 0.07, 0.03, 0.15)
    stripe.scale.set(1.6, 0.7, 0.5)
    stripe.rotation.z = side * -0.25
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), eyeMat)
    eye.position.set(side * 0.06, 0.035, 0.18)
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.007, 6, 4), glintMat)
    glint.position.set(side * -0.005, 0.009, 0.019)
    eye.add(glint)
    head.add(stripe, eye)
  }
  neckPivot.add(head)
  hang.add(neckPivot)

  // 当たり判定は小さく（枝の下を歩けるように）
  const collider: Collider = { x: options.x, z: options.z, r: 0.25 * scale }

  let reduceMotion = false
  let noticeTime = -10
  const headTarget = new THREE.Vector3()
  const phase = Math.random() * Math.PI * 2

  const update = (time: number, dt: number, player: THREE.Vector3) => {
    // ゆっくり、ゆっくり揺れる
    hang.rotation.x = reduceMotion ? 0 : Math.sin(time * 0.35 + phase) * 0.05
    headTarget.copy(player)
    group.worldToLocal(headTarget)
    const dist = Math.hypot(headTarget.x, headTarget.z)
    const wantYaw = dist < 14 ? Math.max(-0.9, Math.min(0.9, Math.atan2(headTarget.x, headTarget.z))) : 0
    // ナマケモノは気づいても、ゆっくり向く
    const k = reduceMotion ? 1 : Math.min(1, dt * (time - noticeTime < 3 ? 0.9 : 0.5))
    neckPivot.rotation.y += (wantYaw - neckPivot.rotation.y) * k
  }

  return {
    id: options.id,
    group,
    position,
    collider,
    // ピンは頭の少し下（体の倍率をかける前）。枝の上の高さから下がる
    headHeight: -0.35,
    update,
    setReduceMotion: (on) => {
      reduceMotion = on
    },
    notice: (time) => {
      noticeTime = time
    },
    swapModel: () => {
      // ナマケモノは差し替えの実験の対象外
    },
  }
}
