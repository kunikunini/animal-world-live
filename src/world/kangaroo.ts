import * as THREE from 'three'
import { toonMaterial } from '../render/toon'
import { terrainHeight } from './terrain'
import type { Collider } from './props'
import type { Lion } from './lions'

/**
 * 様式化したカンガルー。後ろ脚を折って尾で支え、上体を起こして休んでいる姿。
 * ライオンと同じ「しるし」の作り（プリミティブ、スキニングなしの微アニメ）で、出会いの仕組みにそのまま乗る。
 */
export interface KangarooOptions {
  id: string
  x: number
  z: number
  yaw: number
  size?: number
  coat?: string
}

const COLORS = {
  coat: '#a8927b',
  belly: '#e8dcc8',
  dark: '#4a3a30',
  nose: '#2a2220',
}

export function createKangaroo(options: KangarooOptions): Lion {
  const group = new THREE.Group()
  group.name = `kangaroo-${options.id}`
  const y = terrainHeight(options.x, options.z)
  const position = new THREE.Vector3(options.x, y, options.z)
  group.position.copy(position)
  group.rotation.y = options.yaw
  const scale = options.size ?? 1
  group.scale.setScalar(scale)

  const coatColor = new THREE.Color(options.coat ?? COLORS.coat)
  const coat = toonMaterial({ color: coatColor })
  const coatLight = toonMaterial({ color: coatColor.clone().lerp(new THREE.Color(COLORS.belly), 0.4) })
  const belly = toonMaterial({ color: COLORS.belly })
  const dark = toonMaterial({ color: COLORS.dark })
  const nose = toonMaterial({ color: COLORS.nose })
  const eyeMat = new THREE.MeshBasicMaterial({ color: '#140d08' })
  const glintMat = new THREE.MeshBasicMaterial({ color: '#fff6e6' })
  const cast = (m: THREE.Mesh) => {
    m.castShadow = true
    m.receiveShadow = true
    return m
  }

  const body = new THREE.Group()
  // 長い後ろ足（地面にぺたり）と、大きな腿
  for (const side of [-1, 1]) {
    const foot = cast(new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.42, 4, 8), coat))
    foot.rotation.x = Math.PI / 2
    foot.position.set(side * 0.17, 0.07, 0.16)
    const toe = cast(new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), dark))
    toe.position.set(side * 0.17, 0.06, 0.42)
    toe.scale.set(1, 0.6, 1.2)
    const thigh = cast(new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8), coat))
    thigh.position.set(side * 0.19, 0.34, -0.02)
    thigh.scale.set(0.8, 1.05, 1.35)
    body.add(foot, toe, thigh)
  }
  // 胴: 下が太く上が細い。少し前かがみ
  const torso = cast(new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 10), coat))
  torso.position.set(0, 0.72, 0.02)
  torso.scale.set(0.9, 1.45, 0.85)
  torso.rotation.x = 0.18
  const bellyMesh = cast(new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 8), belly))
  bellyMesh.position.set(0, 0.68, 0.14)
  bellyMesh.scale.set(0.78, 1.3, 0.62)
  bellyMesh.rotation.x = 0.18
  const chest = cast(new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), coatLight))
  chest.position.set(0, 1.1, 0.12)
  chest.scale.set(1, 0.9, 0.9)
  body.add(torso, bellyMesh, chest)
  // 小さな前脚。胸の前にたらす
  for (const side of [-1, 1]) {
    const arm = cast(new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.24, 4, 8), coat))
    arm.position.set(side * 0.11, 0.9, 0.27)
    arm.rotation.set(0.5, 0, side * 0.15)
    const hand = cast(new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), dark))
    hand.position.set(side * 0.1, 0.78, 0.34)
    body.add(arm, hand)
  }
  group.add(body)

  // 太く長い尾: 後ろの地面に沿って伸ばす
  const tailPivot = new THREE.Group()
  tailPivot.position.set(0, 0.22, -0.28)
  const tail = cast(new THREE.Mesh(new THREE.ConeGeometry(0.13, 1.1, 10), coat))
  tail.rotation.x = -Math.PI / 2 + 0.12
  tail.position.set(0, -0.08, -0.5)
  tailPivot.add(tail)
  group.add(tailPivot)

  // 首と頭: 小さな頭、長い耳、前に出た鼻先
  const neckPivot = new THREE.Group()
  neckPivot.position.set(0, 1.2, 0.1)
  const neck = cast(new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.16, 4, 8), coat))
  neck.position.set(0, 0.06, 0.02)
  neck.rotation.x = 0.3
  neckPivot.add(neck)
  const head = new THREE.Group()
  head.position.set(0, 0.2, 0.08)
  const skull = cast(new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), coat))
  skull.scale.set(0.95, 0.9, 1.05)
  const muzzle = cast(new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.12, 4, 8), coatLight))
  muzzle.rotation.x = Math.PI / 2 + 0.2
  muzzle.position.set(0, -0.04, 0.16)
  const noseTip = cast(new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), nose))
  noseTip.position.set(0, -0.03, 0.27)
  noseTip.scale.set(1.3, 0.8, 0.8)
  head.add(skull, muzzle, noseTip)
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), eyeMat)
    eye.position.set(side * 0.08, 0.03, 0.1)
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.009, 6, 4), glintMat)
    glint.position.set(side * -0.006, 0.012, 0.024)
    eye.add(glint)
    const ear = cast(new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), coat))
    ear.position.set(side * 0.075, 0.2, -0.04)
    ear.scale.set(0.75, 2.4, 0.4)
    ear.rotation.z = side * -0.22
    ear.name = `ear${side}`
    const earIn = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), belly)
    earIn.position.set(0, 0, 0.03)
    ear.add(earIn)
    head.add(eye, ear)
  }
  neckPivot.add(head)
  group.add(neckPivot)

  const collider: Collider = { x: options.x, z: options.z, r: 0.6 * scale }
  const ears = [head.getObjectByName('ear-1'), head.getObjectByName('ear1')].filter(Boolean) as THREE.Object3D[]

  let reduceMotion = false
  let earTimer = 1.5 + Math.random() * 3
  let earFlick = 0
  let flickSide = 0
  let noticeTime = -10
  const headTarget = new THREE.Vector3()
  const breathPhase = Math.random() * Math.PI * 2

  const update = (time: number, dt: number, player: THREE.Vector3) => {
    const breath = reduceMotion ? 0 : Math.sin(time * 2.4 + breathPhase) * 0.018
    body.scale.set(1, 1 + breath, 1)
    headTarget.copy(player)
    group.worldToLocal(headTarget)
    const dist = Math.hypot(headTarget.x, headTarget.z)
    let wantYaw = 0
    if (dist < 14) wantYaw = Math.max(-0.8, Math.min(0.8, Math.atan2(headTarget.x, headTarget.z)))
    else if (!reduceMotion) wantYaw = Math.sin(time * 0.3 + breathPhase) * 0.25
    const quick = time - noticeTime < 1.2 ? 2.4 : 1
    const k = reduceMotion ? 1 : Math.min(1, dt * 2 * quick)
    neckPivot.rotation.y += (wantYaw - neckPivot.rotation.y) * k
    if (!reduceMotion) {
      // 耳をくるっと回す（カンガルーは耳がよく動く）
      earTimer -= dt
      if (earTimer <= 0) {
        earTimer = 1.5 + Math.random() * 3.5
        earFlick = 0.35
        flickSide = Math.random() < 0.5 ? 0 : 1
      }
      if (earFlick > 0) {
        earFlick -= dt
        const ear = ears[flickSide]
        if (ear) ear.rotation.y = Math.sin(((0.35 - earFlick) / 0.35) * Math.PI) * 0.8
      } else ears.forEach((e) => (e.rotation.y = 0))
      tailPivot.rotation.y = Math.sin(time * 0.5 + breathPhase) * 0.05
    }
  }

  return {
    id: options.id,
    group,
    position,
    collider,
    headHeight: 1.62,
    update,
    setReduceMotion: (on) => {
      reduceMotion = on
    },
    notice: (time) => {
      noticeTime = time
      earTimer = 0
    },
    swapModel: () => {
      // カンガルーは差し替えの実験の対象外
    },
  }
}
