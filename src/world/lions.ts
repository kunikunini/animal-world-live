import * as THREE from 'three'
import { toonMaterial } from '../render/toon'
import { terrainHeight } from './terrain'
import type { Collider } from './props'

/**
 * 様式化したライオン。プリミティブだけで組み、スキニングなしの微アニメで生きている感じを出す。
 * 本物の行動を強制しない「しるし」で、本物の姿はモニターの収録映像で見せる。
 *
 * 試作2回目の見立てに従い「ライオン読み」を優先: 頭を横に広く、鼻先を前に長く、肩まわりに量感。
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
  /** 仔は小さく、頭が大きめ。耳の後ろは暗い色 */
  cub?: boolean
  /** 体の大きさの倍率（成獣 1、仔は自動で小さくなる） */
  size?: number
  /** 毛色の個体差。省略時は標準の黄褐色 */
  coat?: string
  /** たてがみの色（mane のとき） */
  maneColor?: string
}

export interface Lion {
  id: string
  group: THREE.Group
  position: THREE.Vector3
  collider: Collider
  update: (time: number, dt: number, player: THREE.Vector3) => void
  setReduceMotion: (on: boolean) => void
  /** そばに来た人に気づく: 耳をぴくりとさせ、少し早くこちらを向き、尾を一度大きく振る */
  notice: (time: number) => void
  /**
   * 実験用: 別の造形（glTF など）に差し替える。first/second は首と尾のピボット、
   * ears は耳のメッシュ。名前が見つからなければ、その部分の微アニメだけ止まる。
   */
  swapModel: (model: THREE.Object3D, parts: { neck?: THREE.Object3D; ears?: THREE.Object3D[]; tail?: THREE.Object3D }) => void
}

export const LION_COLORS = {
  tawny: '#d9a95f',
  belly: '#efd6a8',
  dark: '#6a4727',
  mane: '#8d5a2b',
  nose: '#3a2a22',
} as const

export function createLion(options: LionOptions): Lion {
  const group = new THREE.Group()
  group.name = `lion-${options.id}`
  const y = terrainHeight(options.x, options.z)
  const position = new THREE.Vector3(options.x, y, options.z)
  group.position.copy(position)
  group.rotation.y = options.yaw
  const scale = (options.cub ? 0.58 : 1) * (options.size ?? 1)
  group.scale.setScalar(scale)

  const coat = new THREE.Color(options.coat ?? LION_COLORS.tawny)
  const tawny = toonMaterial({ color: coat })
  const tawnyLight = toonMaterial({ color: coat.clone().lerp(new THREE.Color('#f3dcae'), 0.35) })
  const belly = toonMaterial({ color: LION_COLORS.belly })
  const dark = toonMaterial({ color: LION_COLORS.dark })
  const nose = toonMaterial({ color: LION_COLORS.nose })

  const cast = (m: THREE.Mesh) => {
    m.castShadow = true
    m.receiveShadow = true
    return m
  }

  // プリミティブ版の全パーツをまとめる（差し替え時に丸ごと隠す）
  const primitive = new THREE.Group()
  primitive.name = 'primitive'
  group.add(primitive)

  // --- 胴（伏せ）。前が少し高く、肩に量感 ---
  const body = new THREE.Group()
  const torso = cast(new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 0.95, 6, 14), tawny))
  torso.position.set(0, 0.42, -0.1)
  torso.rotation.set(Math.PI / 2 - 0.08, 0, 0)
  torso.scale.set(1.12, 1, 1)
  const chest = cast(new THREE.Mesh(new THREE.SphereGeometry(0.4, 14, 10), tawny))
  chest.position.set(0, 0.5, 0.42)
  chest.scale.set(1.3, 0.95, 1.05)
  const bellyMesh = cast(new THREE.Mesh(new THREE.SphereGeometry(0.33, 12, 8), belly))
  bellyMesh.position.set(0, 0.3, 0.1)
  bellyMesh.scale.set(1.1, 0.6, 1.5)
  body.add(torso, chest, bellyMesh)

  // 肩甲骨のふくらみ。背中の線より少し上に出す
  for (const side of [-1, 1]) {
    const shoulder = cast(new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), tawny))
    shoulder.position.set(side * 0.3, 0.62, 0.5)
    shoulder.scale.set(1, 0.85, 1.15)
    body.add(shoulder)
  }

  // 後ろ脚（折りたたみ）
  for (const side of [-1, 1]) {
    const thigh = cast(new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 8), tawny))
    thigh.position.set(side * 0.32, 0.27, -0.55)
    thigh.scale.set(1, 0.75, 1.15)
    const hindPaw = cast(new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), belly))
    hindPaw.position.set(side * 0.38, 0.1, -0.2)
    hindPaw.scale.set(1, 0.6, 1.3)
    body.add(thigh, hindPaw)
  }
  // 前脚（前へ伸ばす）。肩から出るように少し外へ。上腕で胸とつなぐ
  for (const side of [-1, 1]) {
    const upper = cast(new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.3, 4, 10), tawny))
    upper.rotation.x = -0.85
    upper.position.set(side * 0.27, 0.32, 0.64)
    body.add(upper)
    const leg = cast(new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.55, 4, 10), tawny))
    leg.rotation.x = Math.PI / 2
    leg.position.set(side * 0.25, 0.14, 0.85)
    const paw = cast(new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), belly))
    paw.position.set(side * 0.25, 0.11, 1.2)
    paw.scale.set(1, 0.7, 1.2)
    body.add(leg, paw)
  }
  primitive.add(body)

  // --- 首と頭（プレイヤーの方をゆっくり向く） ---
  const neckPivot = new THREE.Group()
  neckPivot.position.set(0, 0.64, 0.62)
  const neck = cast(new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.3, 4, 10), tawny))
  neck.rotation.x = -0.5
  neck.position.set(0, 0.2, 0.12)
  neckPivot.add(neck)

  const head = new THREE.Group()
  head.position.set(0, 0.44, 0.32)
  // ライオンの頭は体に対して大きい。仔はさらに大きめ
  const headScale = options.cub ? 1.3 : 1.1
  head.scale.setScalar(headScale)

  // 頭蓋: 横に広く、少し平たい
  const skull = cast(new THREE.Mesh(new THREE.SphereGeometry(0.29, 14, 10), tawny))
  skull.scale.set(1.36, 0.84, 1.04)
  // 額: 眉のあたりを前に張り出す
  const brow = cast(new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), tawny))
  brow.position.set(0, 0.07, 0.17)
  brow.scale.set(1.6, 0.55, 1.0)
  // 鼻すじ: 額から鼻先へ長く前に出す（丸みのあるカプセル）
  const bridge = cast(new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.3, 4, 10), tawnyLight))
  bridge.rotation.x = Math.PI / 2
  bridge.position.set(0, 0.01, 0.38)
  bridge.scale.set(1.15, 0.8, 1)
  // 口まわり: 上は淡い黄褐色、下唇だけ白く。長く、丸い
  const muzzle = cast(new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), tawnyLight))
  muzzle.position.set(0, -0.09, 0.38)
  muzzle.scale.set(1.0, 0.62, 1.45)
  const lip = cast(new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), belly))
  lip.position.set(0, -0.15, 0.42)
  lip.scale.set(1.05, 0.5, 1.3)
  // 鼻先: 黒い逆三角形（低い円錐を前に倒す）
  const noseTip = cast(new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.07, 3), nose))
  noseTip.rotation.set(Math.PI / 2 + 0.25, Math.PI, 0)
  noseTip.position.set(0, 0.01, 0.6)
  noseTip.scale.set(1.3, 1, 1)
  // 下あご
  const chin = cast(new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), belly))
  chin.position.set(0, -0.2, 0.36)
  chin.scale.set(1, 0.55, 1.3)
  head.add(skull, brow, bridge, muzzle, lip, noseTip, chin)
  // 頬のふくらみ（白）。顔の横幅を出す
  for (const side of [-1, 1]) {
    const cheek = cast(new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), tawnyLight))
    cheek.position.set(side * 0.22, -0.13, 0.17)
    cheek.scale.set(1, 0.8, 1.1)
    head.add(cheek)
  }
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), nose)
    eye.position.set(side * 0.15, 0.045, 0.27)
    // 目の下の黒いすじ（ライオンらしさ）
    const tear = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.09, 0.02), nose)
    tear.position.set(side * 0.125, -0.02, 0.37)
    tear.rotation.z = side * 0.25
    // 耳は頭のてっぺんではなく横寄りに。丸く小さめ
    // 仔は耳の後ろが暗く、縁が黒い（写真の参考）。成獣は体と同じ色
    const ear = cast(new THREE.Mesh(new THREE.SphereGeometry(0.095, 8, 6), options.cub ? dark : tawny))
    ear.position.set(side * 0.31, 0.17, -0.06)
    ear.rotation.z = side * -0.35
    ear.scale.set(1, 1, 0.45)
    ear.name = `ear${side}`
    const earIn = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), options.cub ? belly : dark)
    earIn.position.set(0, 0, 0.05)
    ear.add(earIn)
    head.add(eye, tear, ear)
  }
  if (options.mane) {
    // たてがみ: 顔を囲む輪（上ほど暗く盛り上がる）と、首の後ろ・胸のふくらみ。顔は前に出す
    const maneColor = new THREE.Color(options.maneColor ?? LION_COLORS.mane)
    const maneMat = toonMaterial({ color: maneColor })
    const maneTop = toonMaterial({ color: maneColor.clone().lerp(new THREE.Color('#3a2416'), 0.3) })
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2
      const up = Math.sin(a)
      const r = 0.42 + Math.max(0, up) * 0.08
      const tuft = cast(new THREE.Mesh(new THREE.SphereGeometry(0.19, 8, 6), up > 0.3 ? maneTop : maneMat))
      tuft.position.set(Math.cos(a) * r, up * r * 0.85 + 0.04, -0.06 - Math.max(0, up) * 0.04)
      tuft.scale.set(1.1, 1 + Math.max(0, up) * 0.35, 0.8)
      head.add(tuft)
    }
    const maneBack = cast(new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), maneMat))
    maneBack.position.set(0, -0.02, -0.2)
    maneBack.scale.set(1.2, 1, 0.9)
    neck.add(maneBack)
    const maneChest = cast(new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), maneMat))
    maneChest.position.set(0, 0.5, 0.52)
    maneChest.scale.set(1.3, 0.85, 1)
    body.add(maneChest)
  }
  neckPivot.add(head)
  primitive.add(neckPivot)

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
  primitive.add(tailPivot)

  const collider: Collider = { x: options.x, z: options.z, r: 1.05 * scale }

  // --- 微アニメ ---
  // 差し替え可能な「動く部分」
  let animNeck: THREE.Object3D = neckPivot
  let animEars: THREE.Object3D[] = [head.getObjectByName('ear-1') as THREE.Mesh, head.getObjectByName('ear1') as THREE.Mesh]
  let animTail: THREE.Object3D = tailPivot
  let animBody: THREE.Object3D = body

  // 気質: 仔はせわしなく、たてがみの雄はゆったり
  const tempo = options.cub
    ? { breath: 3.0, earMin: 1.5, earRange: 3, tail: 1.7, idleLook: 0.3 }
    : options.mane
      ? { breath: 1.7, earMin: 4, earRange: 6, tail: 0.6, idleLook: 0.12 }
      : { breath: 2.2, earMin: 3, earRange: 5, tail: 0.9, idleLook: 0.18 }

  let reduceMotion = false
  let earTimer = 2 + Math.random() * 4
  let earFlick = 0
  let flickSide = 0
  const headTarget = new THREE.Vector3()
  const breathPhase = Math.random() * Math.PI * 2
  let noticeTime = -10

  const update = (time: number, dt: number, player: THREE.Vector3) => {
    // 呼吸
    const breath = reduceMotion ? 0 : Math.sin(time * tempo.breath + breathPhase) * 0.02
    animBody.scale.set(1, 1 + breath, 1)

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
      wantYaw = Math.sin(time * 0.23) * tempo.idleLook
    }
    // 気づいた直後は少し早く向く
    const quick = time - noticeTime < 1.2 ? 2.2 : 1
    const k = reduceMotion ? 1 : Math.min(1, dt * 1.8 * quick)
    animNeck.rotation.y += (wantYaw - animNeck.rotation.y) * k
    animNeck.rotation.x += (-wantPitch - animNeck.rotation.x) * k

    // 耳のぴくり
    if (!reduceMotion) {
      earTimer -= dt
      if (earTimer <= 0) {
        earTimer = tempo.earMin + Math.random() * tempo.earRange
        earFlick = 0.25
        flickSide = Math.random() < 0.5 ? 0 : 1
      }
      if (earFlick > 0) {
        earFlick -= dt
        const ear = animEars[flickSide]
        if (ear) ear.rotation.z = Math.sin(((0.25 - earFlick) / 0.25) * Math.PI) * 0.5 * (flickSide === 0 ? 1 : -1)
      } else {
        animEars.forEach((e) => {
          if (e) e.rotation.z = 0
        })
      }
      // 尾先がゆっくり動く。気づいた直後は大きく
      const lift = Math.max(0, 1 - (time - noticeTime) / 1.5)
      animTail.rotation.y = Math.sin(time * tempo.tail) * (0.12 + lift * 0.25)
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
    notice: (time) => {
      noticeTime = time
      earTimer = 0
    },
    swapModel: (model, parts) => {
      primitive.visible = false
      model.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          o.castShadow = true
          o.receiveShadow = true
        }
      })
      group.add(model)
      animBody = model
      animNeck = parts.neck ?? new THREE.Object3D()
      animEars = parts.ears ?? []
      animTail = parts.tail ?? new THREE.Object3D()
    },
  }
}
