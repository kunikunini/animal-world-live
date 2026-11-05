import * as THREE from 'three'
import { toonMaterial } from '../render/toon'
import { terrainHeight } from './terrain'
import type { Collider } from './props'
import type { Lion } from './lions'

/**
 * 水の世界の子の様式化した目印: ケープペンギン（立ち姿。黒い背と白いおなか、胸の黒い帯、目の上の桃色）、
 * モモイロペリカン（立ち姿。白い体、黒い風切羽、S 字の首、黄色いのど袋の長いくちばし）、
 * コツメカワウソ（伏せ。茶色の細長い体、白っぽいほおとのど、太く先の細い尾）。
 * ライオンと同じ「しるし」の作り（プリミティブ、スキニングなしの微アニメ）で、出会いの仕組みにそのまま乗る。
 * 本物の行動の再現ではなく、本物の姿はモニターの収録映像で見せる。
 */
export type WaterfolkKind = 'penguin' | 'pelican' | 'otter'

export interface WaterfolkOptions {
  id: string
  kind: WaterfolkKind
  x: number
  z: number
  /** 向き（ラジアン。0 で +z = 南を向く） */
  yaw: number
  size?: number
}

// 小さい子は影の読み取りのずれ（normalBias 1.8m）で体がまだらに暗くなるので、影は受けず落とすだけにする（residents.ts と同じ）
const cast = (m: THREE.Mesh) => {
  m.castShadow = true
  m.receiveShadow = false
  return m
}

const eyeMat = new THREE.MeshBasicMaterial({ color: '#140d08' })
const glintMat = new THREE.MeshBasicMaterial({ color: '#fff6e6' })

/** 光の影響を受けない黒いビーズの目に、小さなハイライト */
function eye(r: number): THREE.Mesh {
  const e = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), eyeMat)
  const g = new THREE.Mesh(new THREE.SphereGeometry(r * 0.32, 6, 4), glintMat)
  g.position.set(0, r * 0.4, r * 0.85)
  e.add(g)
  return e
}

interface Built {
  body: THREE.Group
  neck: THREE.Group
  /** そばに来た時に動かす部分（ひれ・尾など）。rotation.z / rotation.y を揺らす */
  flaps: THREE.Object3D[]
  tail?: THREE.Object3D
  headHeight: number
  radius: number
}

/** ケープペンギン（高さ約 0.6m） */
function buildPenguin(): Built {
  const black = toonMaterial({ color: '#25272c' })
  const white = toonMaterial({ color: '#f7f6f2' })
  const pink = toonMaterial({ color: '#f08a9c' })
  const foot = toonMaterial({ color: '#4a3a3c' })
  const body = new THREE.Group()
  const torso = cast(new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), black))
  torso.position.set(0, 0.3, 0)
  torso.scale.set(1, 1.65, 0.95)
  const belly = cast(new THREE.Mesh(new THREE.SphereGeometry(0.155, 16, 12), white))
  belly.position.set(0, 0.29, 0.05)
  belly.scale.set(0.92, 1.55, 0.8)
  // 胸の黒い帯（おなかの前を横切る弧）
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.125, 0.014, 5, 18, Math.PI), black)
  band.rotation.x = Math.PI / 2
  band.position.set(0, 0.43, 0.03)
  // おなかの黒い点
  const dots: THREE.Mesh[] = []
  for (const [x, y] of [[0.05, 0.3], [-0.07, 0.24], [0.02, 0.2]] as const) {
    const d = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 4), black)
    d.position.set(x, y, 0.17)
    dots.push(d)
  }
  body.add(torso, belly, band, ...dots)
  // 足（短い桃黒の水かき）
  for (const side of [-1, 1]) {
    const f = cast(new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), foot))
    f.position.set(side * 0.06, 0.015, 0.06)
    f.scale.set(1, 0.4, 1.6)
    body.add(f)
  }
  // ひれ: 肩から下へ垂らす。気づいた時に少し広げる
  const flaps: THREE.Object3D[] = []
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group()
    pivot.position.set(side * 0.15, 0.46, -0.01)
    const fl = cast(new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), black))
    fl.position.set(side * 0.012, -0.1, 0)
    fl.scale.set(0.28, 2.0, 0.8)
    fl.rotation.z = side * 0.12
    pivot.add(fl)
    pivot.userData.side = side
    body.add(pivot)
    flaps.push(pivot)
  }
  // 首と頭
  const neck = new THREE.Group()
  neck.position.set(0, 0.52, 0)
  const head = cast(new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), black))
  head.position.set(0, 0.11, 0.015)
  head.scale.set(0.95, 1, 1.05)
  // のどの白（おなかへつながる）
  const throat = cast(new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), white))
  throat.position.set(0, 0.035, 0.06)
  throat.scale.set(0.95, 0.9, 0.7)
  neck.add(head, throat)
  for (const side of [-1, 1]) {
    // 目の上から頬を回ってのどへ下りる白い帯
    const stripe = cast(new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), white))
    stripe.position.set(side * 0.08, 0.085, 0.03)
    stripe.scale.set(0.38, 1.3, 0.62)
    stripe.rotation.x = 0.75
    const brow = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), pink)
    brow.position.set(side * 0.055, 0.155, 0.075)
    brow.scale.set(1.3, 0.8, 0.8)
    const e = eye(0.015)
    e.position.set(side * 0.058, 0.128, 0.083)
    neck.add(stripe, brow, e)
  }
  const beak = cast(new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.1, 6), black))
  beak.rotation.x = Math.PI / 2
  beak.position.set(0, 0.095, 0.145)
  neck.add(beak)
  return { body, neck, flaps, headHeight: 0.82, radius: 0.24 }
}

/** モモイロペリカン（高さ約 1.3m） */
function buildPelican(): Built {
  const plume = toonMaterial({ color: '#f9ecea' })
  const wingMat = toonMaterial({ color: '#f1e1dc' })
  const quill = toonMaterial({ color: '#2a2826' })
  const leg = toonMaterial({ color: '#f0a65a' })
  const billMat = toonMaterial({ color: '#a9b8c6' })
  const tip = toonMaterial({ color: '#f2c24a' })
  const pouchMat = toonMaterial({ color: '#f7c54c' })
  const skin = toonMaterial({ color: '#f4b8a0' })
  const body = new THREE.Group()
  const torso = cast(new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), plume))
  torso.position.set(0, 0.66, -0.05)
  torso.scale.set(0.82, 0.78, 1.4)
  torso.rotation.x = -0.18
  body.add(torso)
  for (const side of [-1, 1]) {
    const wing = cast(new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), wingMat))
    wing.position.set(side * 0.19, 0.7, -0.12)
    wing.scale.set(0.26, 0.6, 1.35)
    wing.rotation.x = -0.2
    // 風切羽の黒（たたんだ翼の後ろ下）
    const prim = cast(new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), quill))
    prim.position.set(side * 0.17, 0.6, -0.42)
    prim.scale.set(0.22, 0.36, 1.25)
    prim.rotation.x = -0.35
    body.add(wing, prim)
    const shin = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.032, 0.42, 6), leg))
    shin.position.set(side * 0.1, 0.21, 0.02)
    const foot = cast(new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), leg))
    foot.position.set(side * 0.1, 0.02, 0.07)
    foot.scale.set(1.1, 0.28, 1.5)
    body.add(shin, foot)
  }
  const tail = cast(new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.2, 6), plume))
  tail.rotation.x = -Math.PI / 2 - 0.3
  tail.position.set(0, 0.62, -0.48)
  body.add(tail)
  // 首: 体の前から上へ S 字に
  const neck = new THREE.Group()
  neck.position.set(0, 0.8, 0.26)
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -0.06, -0.04),
    new THREE.Vector3(0, 0.16, 0.08),
    new THREE.Vector3(0, 0.36, -0.03),
    new THREE.Vector3(0, 0.5, 0.03),
  ])
  const neckMesh = cast(new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.066, 8, false), plume))
  neck.add(neckMesh)
  const head = new THREE.Group()
  head.position.set(0, 0.55, 0.05)
  const skull = cast(new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), plume))
  skull.scale.set(0.95, 1, 1.15)
  head.add(skull)
  for (const side of [-1, 1]) {
    // 目のまわりの桃色の肌
    const ring = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), skin)
    ring.position.set(side * 0.062, 0.01, 0.04)
    ring.scale.set(0.6, 1, 1.2)
    const e = eye(0.013)
    e.position.set(side * 0.074, 0.012, 0.045)
    head.add(ring, e)
  }
  // くちばし: 前下へ長く。下に黄色いのど袋
  const bill = new THREE.Group()
  bill.position.set(0, -0.01, 0.07)
  bill.rotation.x = 0.55
  const upperGeo = new THREE.CylinderGeometry(0.016, 0.036, 0.44, 6)
  upperGeo.rotateX(Math.PI / 2)
  upperGeo.translate(0, 0, 0.22)
  const upper = cast(new THREE.Mesh(upperGeo, billMat))
  upper.scale.set(1.15, 0.7, 1)
  const hook = cast(new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), tip))
  hook.position.set(0, -0.004, 0.44)
  const pouch = cast(new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), pouchMat))
  pouch.position.set(0, -0.042, 0.2)
  pouch.scale.set(0.6, 0.75, 3.1)
  bill.add(upper, hook, pouch)
  head.add(bill)
  neck.add(head)
  return { body, neck, flaps: [], headHeight: 1.55, radius: 0.45 }
}

/** コツメカワウソ（伏せ。頭から尾の先まで約 0.85m） */
function buildOtter(): Built {
  const coat = toonMaterial({ color: '#7d5538' })
  const dark = toonMaterial({ color: '#5a3b26' })
  const pale = toonMaterial({ color: '#ead8bd' })
  const nose = toonMaterial({ color: '#2a1e18' })
  const body = new THREE.Group()
  const torso = cast(new THREE.Mesh(new THREE.CapsuleGeometry(0.095, 0.34, 6, 12), coat))
  torso.rotation.x = Math.PI / 2
  torso.position.set(0, 0.1, -0.02)
  torso.scale.set(1.08, 1, 0.9)
  const chest = cast(new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), pale))
  chest.position.set(0, 0.085, 0.17)
  chest.scale.set(1, 0.8, 1.1)
  body.add(torso, chest)
  // 短い脚（前へ出した前足、たたんだ後ろ足）
  for (const side of [-1, 1]) {
    const front = cast(new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), dark))
    front.position.set(side * 0.06, 0.025, 0.25)
    front.scale.set(1, 0.6, 1.5)
    const hind = cast(new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), dark))
    hind.position.set(side * 0.08, 0.03, -0.18)
    hind.scale.set(1, 0.6, 1.4)
    body.add(front, hind)
  }
  // 尾: 付け根が太く、先が細い。地面に沿わせて後ろへ
  const tail = new THREE.Group()
  tail.position.set(0, 0.07, -0.25)
  const tailGeo = new THREE.ConeGeometry(0.05, 0.36, 8)
  tailGeo.rotateX(-Math.PI / 2)
  tailGeo.translate(0, 0, -0.17)
  const tailMesh = cast(new THREE.Mesh(tailGeo, coat))
  tailMesh.rotation.x = 0.12
  tailMesh.scale.set(1, 0.75, 1)
  tail.add(tailMesh)
  body.add(tail)
  // 首と頭: 少し持ち上げて前を見る
  const neck = new THREE.Group()
  neck.position.set(0, 0.13, 0.22)
  const neckMesh = cast(new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), coat))
  neckMesh.position.set(0, 0.0, -0.01)
  neckMesh.scale.set(1, 1, 1.2)
  const head = cast(new THREE.Mesh(new THREE.SphereGeometry(0.074, 12, 10), coat))
  head.position.set(0, 0.05, 0.07)
  head.scale.set(1.12, 0.86, 1)
  const cheek = cast(new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), pale))
  cheek.position.set(0, 0.02, 0.105)
  cheek.scale.set(1.25, 0.72, 0.8)
  const muzzle = cast(new THREE.Mesh(new THREE.SphereGeometry(0.036, 8, 6), pale))
  muzzle.position.set(0, 0.035, 0.14)
  muzzle.scale.set(1.3, 0.8, 1)
  const noseTip = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), nose)
  noseTip.position.set(0, 0.05, 0.172)
  noseTip.scale.set(1.4, 0.8, 0.8)
  neck.add(neckMesh, head, cheek, muzzle, noseTip)
  const flaps: THREE.Object3D[] = []
  for (const side of [-1, 1]) {
    const ear = cast(new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 5), dark))
    ear.position.set(side * 0.064, 0.094, 0.04)
    ear.scale.set(1, 0.9, 0.6)
    const e = eye(0.012)
    e.position.set(side * 0.042, 0.078, 0.126)
    neck.add(ear, e)
  }
  return { body, neck, flaps, tail, headHeight: 0.42, radius: 0.32 }
}

export function createWaterfolk(options: WaterfolkOptions): Lion {
  const group = new THREE.Group()
  group.name = `${options.kind}-${options.id}`
  const y = terrainHeight(options.x, options.z)
  const position = new THREE.Vector3(options.x, y, options.z)
  group.position.copy(position)
  group.rotation.y = options.yaw
  const scale = options.size ?? 1
  group.scale.setScalar(scale)
  const built = options.kind === 'penguin' ? buildPenguin() : options.kind === 'pelican' ? buildPelican() : buildOtter()
  group.add(built.body, built.neck)

  const collider: Collider = { x: options.x, z: options.z, r: built.radius * scale }
  let reduceMotion = false
  let noticeTime = -10
  const headTarget = new THREE.Vector3()
  const phase = Math.random() * Math.PI * 2
  // 気質: ペンギンはせわしなく首を振り、ペリカンはゆったり、カワウソはきょろきょろ
  const tempo = options.kind === 'penguin' ? { breath: 2.8, look: 0.45, lookRate: 0.5 } : options.kind === 'pelican' ? { breath: 1.6, look: 0.3, lookRate: 0.18 } : { breath: 3.2, look: 0.4, lookRate: 0.42 }

  const update = (time: number, dt: number, player: THREE.Vector3) => {
    const breath = reduceMotion ? 0 : Math.sin(time * tempo.breath + phase) * 0.02
    built.body.scale.set(1, 1 + breath, 1)
    headTarget.copy(player)
    group.worldToLocal(headTarget)
    const dist = Math.hypot(headTarget.x, headTarget.z)
    let wantYaw = 0
    if (dist < 14) wantYaw = Math.max(-0.85, Math.min(0.85, Math.atan2(headTarget.x, headTarget.z)))
    else if (!reduceMotion) wantYaw = Math.sin(time * tempo.lookRate + phase) * tempo.look
    const quick = time - noticeTime < 1.2 ? 2.4 : 1
    const k = reduceMotion ? 1 : Math.min(1, dt * 2 * quick)
    built.neck.rotation.y += (wantYaw - built.neck.rotation.y) * k
    if (reduceMotion) return
    // 気づいた直後: ペンギンはひれを少し広げ、カワウソは尾を振る
    const lift = Math.max(0, 1 - (time - noticeTime) / 1.4)
    for (const f of built.flaps) f.rotation.z = (f.userData.side as number) * (0.05 + lift * 0.55 * Math.abs(Math.sin((time - noticeTime) * 9)))
    if (built.tail) built.tail.rotation.y = Math.sin(time * 1.1 + phase) * (0.1 + lift * 0.35)
  }

  return {
    id: options.id,
    group,
    position,
    collider,
    headHeight: built.headHeight,
    update,
    setReduceMotion: (on) => {
      reduceMotion = on
      if (on) for (const f of built.flaps) f.rotation.z = 0
    },
    notice: (time) => {
      noticeTime = time
    },
    swapModel: () => {
      // 水の世界の子は差し替えの実験の対象外
    },
  }
}
