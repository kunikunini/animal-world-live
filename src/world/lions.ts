import * as THREE from 'three'
import { toonMaterial } from '../render/toon'
import { terrainHeight } from './terrain'
import type { Collider } from './props'

/**
 * 様式化したライオン。プリミティブだけで組み、スキニングなしの微アニメで生きている感じを出す。
 * 本物の行動を強制しない「しるし」で、本物の姿はモニターの収録映像で見せる。
 */
export interface LionOptions {
  id: string
  /** 伏せている位置（x, z）。高さは地形から取る */
  x: number
  z: number
  /** 向き（ラジアン。0 で +z = 南を向く） */
  yaw: number
  /** たてがみ（成獣の雄） */
  mane?: boolean
  /** 仔は小さく、頭が大きめ */
  cub?: boolean
}

export interface Lion {
  id: string
  group: THREE.Group
  position: THREE.Vector3
  collider: Collider
  update: (time: number, dt: number, player: THREE.Vector3) => void
  setReduceMotion: (on: boolean) => void
}

const TAWNY = '#d9a95f'
const BELLY = '#efd6a8'
const DARK = '#6a4727'
const MANE = '#8d5a2b'
const NOSE = '#3a2a22'

export function createLion(options: LionOptions): Lion {
  const group = new THREE.Group()
  group.name = `lion-${options.id}`
  const y = terrainHeight(options.x, options.z)
  const position = new THREE.Vector3(options.x, y, options.z)
  group.position.copy(position)
  group.rotation.y = options.yaw
  const scale = options.cub ? 0.58 : 1
  group.scale.setScalar(scale)

  const tawny = toonMaterial({ color: TAWNY })
  const belly = toonMaterial({ color: BELLY })
  const dark = toonMaterial({ color: DARK })
  const nose = toonMaterial({ color: NOSE })

  const cast = (m: THREE.Mesh) => {
    m.castShadow = true
    m.receiveShadow = true
    return m
  }

  // --- 胴（伏せ）。前が少し高い ---
  const body = new THREE.Group()
  const torso = cast(new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 0.95, 6, 14), tawny))
  torso.rotation.x = Math.PI / 2
  torso.rotation.z = 0
  torso.position.set(0, 0.42, -0.1)
  torso.rotation.set(Math.PI / 2 - 0.08, 0, 0)
  const chest = cast(new THREE.Mesh(new THREE.SphereGeometry(0.4, 14, 10), tawny))
  chest.position.set(0, 0.5, 0.42)
  chest.scale.set(1, 0.95, 1.05)
  const bellyMesh = cast(new THREE.Mesh(new THREE.SphereGeometry(0.33, 12, 8), belly))
  bellyMesh.position.set(0, 0.3, 0.1)
  bellyMesh.scale.set(1, 0.6, 1.5)
  body.add(torso, chest, bellyMesh)

  // 後ろ脚（折りたたみ）
  for (const side of [-1, 1]) {
    const thigh = cast(new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 8), tawny))
    thigh.position.set(side * 0.3, 0.27, -0.55)
    thigh.scale.set(1, 0.75, 1.15)
    const hindPaw = cast(new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), belly))
    hindPaw.position.set(side * 0.36, 0.1, -0.2)
    hindPaw.scale.set(1, 0.6, 1.3)
    body.add(thigh, hindPaw)
  }
  // 前脚（前へ伸ばす）
  for (const side of [-1, 1]) {
    const leg = cast(new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.55, 4, 10), tawny))
    leg.rotation.x = Math.PI / 2
    leg.position.set(side * 0.22, 0.13, 0.85)
    const paw = cast(new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), belly))
    paw.position.set(side * 0.22, 0.11, 1.18)
    paw.scale.set(1, 0.7, 1.2)
    body.add(leg, paw)
  }
  group.add(body)

  // --- 首と頭（プレイヤーの方をゆっくり向く） ---
  const neckPivot = new THREE.Group()
  neckPivot.position.set(0, 0.62, 0.62)
  const neck = cast(new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.3, 4, 10), tawny))
  neck.rotation.x = -0.5
  neck.position.set(0, 0.22, 0.12)
  neckPivot.add(neck)

  const head = new THREE.Group()
  head.position.set(0, 0.46, 0.3)
  const headScale = options.cub ? 1.25 : 1
  head.scale.setScalar(headScale)
  const skull = cast(new THREE.Mesh(new THREE.SphereGeometry(0.29, 14, 10), tawny))
  skull.scale.set(1, 0.92, 1)
  const muzzle = cast(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.26), belly))
  muzzle.position.set(0, -0.09, 0.26)
  const noseTip = cast(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.07, 0.06), nose))
  noseTip.position.set(0, -0.02, 0.4)
  const chin = cast(new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), belly))
  chin.position.set(0, -0.2, 0.22)
  head.add(skull, muzzle, noseTip, chin)
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), nose)
    eye.position.set(side * 0.11, 0.06, 0.25)
    const ear = cast(new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), tawny))
    ear.position.set(side * 0.2, 0.24, -0.02)
    ear.scale.set(1, 1, 0.5)
    ear.name = `ear${side}`
    const earIn = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), dark)
    earIn.position.set(0, 0, 0.05)
    ear.add(earIn)
    head.add(eye, ear)
  }
  if (options.mane) {
    const maneMat = toonMaterial({ color: MANE })
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2
      const tuft = cast(new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), maneMat))
      tuft.position.set(Math.cos(a) * 0.3, Math.sin(a) * 0.28 - 0.02, -0.12)
      tuft.scale.set(1, 1, 0.7)
      head.add(tuft)
    }
    const maneBack = cast(new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), maneMat))
    maneBack.position.set(0, 0.05, -0.08)
    neck.add(maneBack)
  }
  neckPivot.add(head)
  group.add(neckPivot)

  // --- 尾。後ろから横へ、地面に沿わせる ---
  const tailPivot = new THREE.Group()
  tailPivot.position.set(0, 0.36, -0.75)
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.15, -0.12, -0.3),
    new THREE.Vector3(0.45, -0.26, -0.45),
    new THREE.Vector3(0.75, -0.3, -0.35),
  ])
  const tail = cast(new THREE.Mesh(new THREE.TubeGeometry(curve, 10, 0.045, 7, false), tawny))
  const tuft = cast(new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 6), dark))
  tuft.position.copy(curve.getPoint(1))
  tailPivot.add(tail, tuft)
  group.add(tailPivot)

  const collider: Collider = { x: options.x, z: options.z, r: 1.05 * scale }

  // --- 微アニメ ---
  const ears = [head.getObjectByName('ear-1') as THREE.Mesh, head.getObjectByName('ear1') as THREE.Mesh]
  let reduceMotion = false
  let earTimer = 2 + Math.random() * 4
  let earFlick = 0
  let flickSide = 0
  const headTarget = new THREE.Vector3()
  const breathPhase = Math.random() * Math.PI * 2

  const update = (time: number, dt: number, player: THREE.Vector3) => {
    // 呼吸
    const breath = reduceMotion ? 0 : Math.sin(time * 2.2 + breathPhase) * 0.02
    body.scale.set(1, 1 + breath, 1)

    // 近くに来たら、ゆっくりこちらを向く。遠いときは正面に戻る
    headTarget.copy(player)
    group.worldToLocal(headTarget)
    const dist = Math.hypot(headTarget.x, headTarget.z)
    let wantYaw = 0
    let wantPitch = 0
    if (dist < 14) {
      wantYaw = Math.atan2(headTarget.x, headTarget.z)
      wantYaw = Math.max(-0.7, Math.min(0.7, wantYaw))
      wantPitch = Math.max(-0.2, Math.min(0.25, Math.atan2(headTarget.y - 1.0, dist) * 0.5))
    } else if (!reduceMotion) {
      wantYaw = Math.sin(time * 0.23) * 0.18
    }
    const k = reduceMotion ? 1 : Math.min(1, dt * 1.8)
    neckPivot.rotation.y += (wantYaw - neckPivot.rotation.y) * k
    neckPivot.rotation.x += (-wantPitch - neckPivot.rotation.x) * k

    // 耳のぴくり
    if (!reduceMotion) {
      earTimer -= dt
      if (earTimer <= 0) {
        earTimer = 3 + Math.random() * 5
        earFlick = 0.25
        flickSide = Math.random() < 0.5 ? 0 : 1
      }
      if (earFlick > 0) {
        earFlick -= dt
        const ear = ears[flickSide]
        if (ear) ear.rotation.z = Math.sin((0.25 - earFlick) / 0.25 * Math.PI) * 0.5 * (flickSide === 0 ? 1 : -1)
      } else {
        ears.forEach((e) => {
          if (e) e.rotation.z = 0
        })
      }
      // 尾先がゆっくり動く
      tailPivot.rotation.y = Math.sin(time * 0.9) * 0.12
    }
  }

  return {
    id: options.id,
    group,
    position,
    collider,
    update,
    setReduceMotion: (on) => {
      reduceMotion = on
    },
  }
}
