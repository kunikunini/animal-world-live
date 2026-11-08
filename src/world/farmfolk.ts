import * as THREE from 'three'
import { toonMaterial } from '../render/toon'
import { terrainHeight } from './terrain'
import type { Collider } from './props'
import type { Lion } from './lions'

/**
 * ふれあいワールドの子の様式化した目印。立ち姿の四つ足を同じ組み方で作り、種ごとに形と色を変える:
 * ヤギ（白、後ろへ反った角、あごひげ、上を向いた短い尾）、ヒツジ（もこもこの毛の玉、細い脚）、
 * ポニー（茶色のずんぐりした体、濃いたてがみと長い尾）、セントバーナード（白に赤茶のぶち、垂れ耳、目のまわりの濃い色）、
 * ボーダーコリー（黒に白い胸と鼻すじ、ふさふさの尾）、ピレネーシェパード（小さく毛の長い淡い茶色）、
 * ブタ（ずんぐりした体と垂れたおなか、丸い鼻、巻いた尾）。
 * 色は種の目印で、個体の毛色の再現ではない。ライオンと同じ「しるし」の作り（プリミティブ、スキニングなしの微アニメ）で、
 * 出会いの仕組みにそのまま乗る。本物の行動の再現ではない。
 */
export type FarmKind = 'goat' | 'sheep' | 'pony' | 'stbernard' | 'collie' | 'pyrenean' | 'pig'

export interface FarmfolkOptions {
  id: string
  kind: FarmKind
  x: number
  z: number
  /** 向き（ラジアン。0 で +z = 南を向く） */
  yaw: number
  size?: number
  /** 地面からの持ち上げ（岩場の板の上など、m） */
  lift?: number
}

interface Spec {
  /** 背の高さ（地面から背中の上まで、m） */
  h: number
  /** 体の長さ */
  len: number
  /** 体の太さ（半径） */
  r: number
  legR: number
  coat: string
  /** 脚の色（省略時は体と同じ） */
  leg?: string
  hoof: string
  /** 頭の大きさ（半径） */
  head: number
  /** 鼻先の長さ */
  snout: number
  /** 首の長さと前への傾き */
  neck: number
  neckTilt: number
  muzzle: string
  headHeight: number
}

const SPECS: Record<FarmKind, Spec> = {
  goat: { h: 0.72, len: 0.95, r: 0.2, legR: 0.045, coat: '#f2ede3', hoof: '#4a3f38', head: 0.12, snout: 0.1, neck: 0.26, neckTilt: 0.55, muzzle: '#e2cfc4', headHeight: 1.12 },
  sheep: { h: 0.7, len: 0.92, r: 0.26, legR: 0.04, coat: '#f4ecdb', leg: '#e6d6c2', hoof: '#4a3f38', head: 0.11, snout: 0.07, neck: 0.16, neckTilt: 0.9, muzzle: '#e8d5c2', headHeight: 1.0 },
  pony: { h: 1.05, len: 1.3, r: 0.3, legR: 0.07, coat: '#9a6a43', hoof: '#2b221d', head: 0.15, snout: 0.3, neck: 0.42, neckTilt: 0.5, muzzle: '#5e4030', headHeight: 1.62 },
  stbernard: { h: 0.76, len: 1.0, r: 0.25, legR: 0.07, coat: '#f4efe6', hoof: '#f4efe6', head: 0.17, snout: 0.1, neck: 0.18, neckTilt: 0.75, muzzle: '#f7f3ec', headHeight: 1.12 },
  collie: { h: 0.55, len: 0.78, r: 0.16, legR: 0.04, coat: '#262424', leg: '#f3efe8', hoof: '#f3efe8', head: 0.11, snout: 0.12, neck: 0.15, neckTilt: 0.65, muzzle: '#f3efe8', headHeight: 0.86 },
  pyrenean: { h: 0.45, len: 0.64, r: 0.14, legR: 0.036, coat: '#cba477', hoof: '#cba477', head: 0.1, snout: 0.07, neck: 0.12, neckTilt: 0.7, muzzle: '#b58c62', headHeight: 0.72 },
  pig: { h: 0.48, len: 0.82, r: 0.23, legR: 0.05, coat: '#6e6468', hoof: '#2a2526', head: 0.13, snout: 0.06, neck: 0.04, neckTilt: 1.3, muzzle: '#9a8688', headHeight: 0.72 },
}

// 小さい子は影の読み取りのずれで体がまだらに暗くなるので、影は受けず落とすだけにする（waterfolk.ts と同じ）
const cast = (m: THREE.Mesh) => {
  m.castShadow = true
  m.receiveShadow = false
  return m
}
const eyeMat = new THREE.MeshBasicMaterial({ color: '#140d08' })
const glintMat = new THREE.MeshBasicMaterial({ color: '#fff6e6' })
function eye(r: number): THREE.Mesh {
  const e = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), eyeMat)
  const g = new THREE.Mesh(new THREE.SphereGeometry(r * 0.32, 6, 4), glintMat)
  g.position.set(0, r * 0.4, r * 0.85)
  e.add(g)
  return e
}

export function createFarmfolk(options: FarmfolkOptions): Lion {
  const kind = options.kind
  const S = SPECS[kind]
  const dog = kind === 'stbernard' || kind === 'collie' || kind === 'pyrenean'
  const group = new THREE.Group()
  group.name = `${kind}-${options.id}`
  const y = terrainHeight(options.x, options.z) + (options.lift ?? 0)
  const position = new THREE.Vector3(options.x, y, options.z)
  group.position.copy(position)
  group.rotation.y = options.yaw
  const scale = options.size ?? 1
  group.scale.setScalar(scale)

  const coat = toonMaterial({ color: S.coat })
  const legMat = toonMaterial({ color: S.leg ?? S.coat })
  const hoof = toonMaterial({ color: S.hoof })
  const muzzle = toonMaterial({ color: S.muzzle })
  const nose = toonMaterial({ color: '#2a2220' })

  const body = new THREE.Group()
  const by = S.h - S.r
  // 胴: 横にした丸い筒
  const torso = cast(new THREE.Mesh(new THREE.CapsuleGeometry(S.r, Math.max(0.05, S.len - S.r * 2), 6, 14), coat))
  torso.rotation.x = Math.PI / 2
  torso.position.set(0, by, 0)
  torso.scale.set(kind === 'pony' ? 0.95 : 1, 1, kind === 'pig' ? 1.05 : 1)
  body.add(torso)
  if (kind === 'pig') {
    // 垂れたおなか
    const belly = cast(new THREE.Mesh(new THREE.SphereGeometry(S.r * 0.95, 12, 10), coat))
    belly.position.set(0, by - S.r * 0.45, 0.02)
    belly.scale.set(1.05, 0.8, 1.5)
    body.add(belly)
  }
  // 脚: 胴の下から地面まで。先にひづめ・足先
  const legTop = by
  const legLen = legTop
  const fx = S.r * 0.58
  const fz = S.len / 2 - S.r * 0.75
  for (const [lx, lz] of [[-fx, fz], [fx, fz], [-fx, -fz], [fx, -fz]] as const) {
    const leg = cast(new THREE.Mesh(new THREE.CylinderGeometry(S.legR, S.legR * 0.9, legLen, 7), legMat))
    leg.position.set(lx, legLen / 2, lz)
    const foot = cast(new THREE.Mesh(new THREE.SphereGeometry(S.legR * 1.15, 8, 6), hoof))
    foot.position.set(lx, S.legR * 0.6, lz + (dog ? S.legR * 0.6 : 0))
    foot.scale.set(1, 0.65, dog ? 1.4 : 1)
    body.add(leg, foot)
  }

  // 種ごとの体の飾り
  if (kind === 'sheep') {
    // もこもこの毛: 胴のまわりに玉をちらす
    const wool = toonMaterial({ color: S.coat })
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2 * 3.1
      const t = (i % 11) / 10 - 0.5
      const ball = cast(new THREE.Mesh(new THREE.IcosahedronGeometry(S.r * 0.55, 1), wool))
      ball.position.set(Math.cos(a) * S.r * 0.9, by + Math.abs(Math.sin(a)) * S.r * 0.7 - S.r * 0.1, t * S.len * 0.85)
      body.add(ball)
    }
  }
  if (kind === 'stbernard') {
    // 背中の赤茶のぶち（鞍のように）
    const patch = toonMaterial({ color: '#a8562c' })
    const saddle = cast(new THREE.Mesh(new THREE.SphereGeometry(S.r * 1.02, 14, 10), patch))
    saddle.position.set(0, by + S.r * 0.12, -0.05)
    saddle.scale.set(1.03, 0.92, 1.45)
    body.add(saddle)
  }
  if (kind === 'collie') {
    // 白い胸
    const chest = cast(new THREE.Mesh(new THREE.SphereGeometry(S.r * 0.85, 10, 8), muzzle))
    chest.position.set(0, by - S.r * 0.15, S.len / 2 - S.r * 0.6)
    chest.scale.set(1, 1, 0.8)
    body.add(chest)
  }
  if (kind === 'pyrenean') {
    // 長い毛: 胴の下に垂れる房
    for (let i = 0; i < 8; i++) {
      const tuft = cast(new THREE.Mesh(new THREE.SphereGeometry(S.r * 0.45, 8, 6), coat))
      tuft.position.set((i % 2 ? 1 : -1) * S.r * 0.6, by - S.r * 0.75, (i / 7 - 0.5) * S.len * 0.7)
      tuft.scale.set(0.8, 1.2, 1)
      body.add(tuft)
    }
  }

  // 尾
  const tail = new THREE.Group()
  tail.position.set(0, by + S.r * 0.4, -S.len / 2 + S.r * 0.2)
  if (kind === 'goat') {
    const t = cast(new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.14, 6), coat))
    t.rotation.x = -0.4
    t.position.set(0, 0.06, -0.02)
    tail.add(t)
  } else if (kind === 'sheep') {
    const t = cast(new THREE.Mesh(new THREE.IcosahedronGeometry(0.08, 1), coat))
    t.position.set(0, -0.05, -0.04)
    tail.add(t)
  } else if (kind === 'pony') {
    const hair = toonMaterial({ color: '#4a2f1e' })
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.1, -0.15), new THREE.Vector3(0, -0.45, -0.22), new THREE.Vector3(0, -0.75, -0.18)])
    tail.add(cast(new THREE.Mesh(new THREE.TubeGeometry(curve, 10, 0.07, 7, false), hair)))
  } else if (kind === 'pig') {
    const t = cast(new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.014, 5, 10, Math.PI * 1.6), coat))
    t.rotation.y = Math.PI / 2
    t.position.set(0, 0, -0.03)
    tail.add(t)
  } else {
    // 犬: ふさふさの尾。コリーは先が白い
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.02, -0.12), new THREE.Vector3(0, -0.12, -0.26), new THREE.Vector3(0, -0.26, -0.3)])
    const tr = kind === 'stbernard' ? 0.06 : kind === 'collie' ? 0.05 : 0.045
    tail.add(cast(new THREE.Mesh(new THREE.TubeGeometry(curve, 10, tr, 7, false), kind === 'stbernard' ? toonMaterial({ color: '#a8562c' }) : coat)))
    const tip = cast(new THREE.Mesh(new THREE.SphereGeometry(tr * 1.25, 8, 6), kind === 'collie' ? muzzle : coat))
    tip.position.copy(curve.getPoint(1))
    tail.add(tip)
  }
  body.add(tail)

  // 首と頭（そばに来た人の方をゆっくり向く）
  const neck = new THREE.Group()
  neck.position.set(0, by + S.r * 0.55, S.len / 2 - S.r * 0.55)
  const neckMesh = cast(new THREE.Mesh(new THREE.CapsuleGeometry(S.r * (kind === 'pony' ? 0.55 : 0.6), S.neck, 4, 10), kind === 'collie' ? muzzle : coat))
  neckMesh.rotation.x = S.neckTilt
  const nTop = new THREE.Vector3(0, Math.cos(S.neckTilt) * S.neck, Math.sin(S.neckTilt) * S.neck)
  neckMesh.position.copy(nTop).multiplyScalar(0.5)
  neck.add(neckMesh)
  if (kind === 'pony') {
    // たてがみ: 首の後ろに沿って濃い色の板
    const hair = toonMaterial({ color: '#4a2f1e' })
    const mane = cast(new THREE.Mesh(new THREE.BoxGeometry(0.06, S.neck + 0.2, 0.12), hair))
    mane.rotation.x = S.neckTilt
    mane.position.copy(nTop).multiplyScalar(0.5).add(new THREE.Vector3(0, 0.12, -0.12))
    neck.add(mane)
  }
  const head = new THREE.Group()
  head.position.copy(nTop).add(new THREE.Vector3(0, S.head * 0.4, S.head * 0.2))
  const skull = cast(new THREE.Mesh(new THREE.SphereGeometry(S.head, 14, 10), kind === 'sheep' ? muzzle : coat))
  skull.scale.set(kind === 'pony' ? 0.85 : 1, kind === 'pig' ? 0.95 : 1, kind === 'pony' ? 1.1 : 1.05)
  head.add(skull)
  // 鼻先: 前へ伸ばす。ブタは丸い鼻の円盤
  const snout = cast(new THREE.Mesh(new THREE.SphereGeometry(S.head * (kind === 'pony' ? 0.62 : 0.55), 12, 8), muzzle))
  const rs = S.head * (kind === 'pony' ? 0.62 : 0.55)
  snout.position.set(0, kind === 'pony' ? -S.head * 0.25 : -S.head * 0.2, S.head * 0.5 + S.snout * 0.45)
  snout.scale.set(kind === 'pig' ? 0.95 : 0.92, kind === 'pig' ? 0.8 : 0.82, 1 + S.snout / (rs * 2.2))
  head.add(snout)
  const noseTip = new THREE.Mesh(
    kind === 'pig' ? new THREE.CylinderGeometry(S.head * 0.38, S.head * 0.38, 0.03, 12) : new THREE.SphereGeometry(S.head * 0.18, 8, 6),
    kind === 'pig' ? toonMaterial({ color: '#d99a9a' }) : nose,
  )
  if (kind === 'pig') noseTip.rotation.x = Math.PI / 2
  noseTip.position.set(0, snout.position.y + (kind === 'pig' ? 0 : S.head * 0.12), snout.position.z + rs * snout.scale.z * 0.95)
  head.add(noseTip)
  if (kind === 'stbernard') {
    // 目のまわりの濃い色
    const mask = cast(new THREE.Mesh(new THREE.SphereGeometry(S.head * 0.98, 12, 8), toonMaterial({ color: '#7a3c1e' })))
    mask.position.set(0, S.head * 0.25, -S.head * 0.08)
    mask.scale.set(1.02, 0.6, 0.98)
    head.add(mask)
  }
  if (kind === 'collie') {
    // 白い鼻すじ
    const blaze = new THREE.Mesh(new THREE.BoxGeometry(S.head * 0.25, S.head * 0.9, 0.02), muzzle)
    blaze.position.set(0, S.head * 0.3, S.head * 0.96)
    blaze.rotation.x = -0.35
    head.add(blaze)
  }
  for (const side of [-1, 1]) {
    const e = eye(S.head * 0.14)
    e.position.set(side * S.head * 0.52, S.head * 0.28, S.head * 0.78)
    head.add(e)
    // 耳
    let ear: THREE.Mesh
    if (kind === 'goat' || kind === 'sheep') {
      // 横に張り出した耳
      ear = cast(new THREE.Mesh(new THREE.SphereGeometry(S.head * 0.32, 8, 6), kind === 'sheep' ? muzzle : coat))
      ear.position.set(side * S.head * 1.0, S.head * 0.35, -S.head * 0.15)
      ear.scale.set(1.6, 0.5, 0.75)
      ear.rotation.z = side * -0.25
    } else if (kind === 'pony' || kind === 'collie' || kind === 'pyrenean') {
      // 立った耳（コリー・ピレネーは先が少し折れる）
      ear = cast(new THREE.Mesh(new THREE.ConeGeometry(S.head * 0.28, S.head * 0.75, 6), coat))
      ear.position.set(side * S.head * 0.55, S.head * 0.95, -S.head * 0.1)
      ear.rotation.z = side * -0.22
      if (kind !== 'pony') ear.rotation.x = 0.35
      ear.scale.set(1, 1, 0.55)
    } else if (kind === 'pig') {
      ear = cast(new THREE.Mesh(new THREE.ConeGeometry(S.head * 0.4, S.head * 0.7, 4), coat))
      ear.position.set(side * S.head * 0.62, S.head * 0.85, S.head * 0.1)
      ear.rotation.set(0.7, 0, side * -0.4)
    } else {
      // セントバーナード: 垂れ耳
      ear = cast(new THREE.Mesh(new THREE.SphereGeometry(S.head * 0.4, 8, 6), toonMaterial({ color: '#a8562c' })))
      ear.position.set(side * S.head * 0.9, S.head * 0.05, -S.head * 0.1)
      ear.scale.set(0.45, 1.25, 0.85)
    }
    ear.name = `ear${side}`
    head.add(ear)
    if (kind === 'goat') {
      // 後ろへ反った角
      const horn = cast(new THREE.Mesh(new THREE.ConeGeometry(S.head * 0.16, S.head * 1.1, 6), toonMaterial({ color: '#8f8579' })))
      horn.position.set(side * S.head * 0.35, S.head * 1.05, -S.head * 0.25)
      horn.rotation.set(-0.75, 0, side * -0.15)
      head.add(horn)
    }
  }
  if (kind === 'goat') {
    // あごひげ
    const beard = cast(new THREE.Mesh(new THREE.ConeGeometry(S.head * 0.18, S.head * 0.7, 6), coat))
    beard.rotation.x = Math.PI
    beard.position.set(0, -S.head * 0.75, S.head * 0.75)
    head.add(beard)
  }
  if (kind === 'sheep') {
    // 頭の上の毛
    const top = cast(new THREE.Mesh(new THREE.IcosahedronGeometry(S.head * 0.75, 1), coat))
    top.position.set(0, S.head * 0.7, -S.head * 0.15)
    head.add(top)
  }
  if (kind === 'pony') {
    // 前髪
    const forelock = cast(new THREE.Mesh(new THREE.SphereGeometry(S.head * 0.4, 8, 6), toonMaterial({ color: '#4a2f1e' })))
    forelock.position.set(0, S.head * 0.85, S.head * 0.2)
    forelock.scale.set(0.8, 0.6, 1)
    head.add(forelock)
  }
  neck.add(head)
  group.add(body, neck)

  const collider: Collider = { x: options.x, z: options.z, r: Math.max(0.3, S.len * 0.45) * scale }
  const ears = [head.getObjectByName('ear-1'), head.getObjectByName('ear1')].filter(Boolean) as THREE.Object3D[]
  let reduceMotion = false
  let noticeTime = -10
  let earTimer = 1 + Math.random() * 3
  let earFlick = 0
  let flickSide = 0
  const headTarget = new THREE.Vector3()
  const phase = Math.random() * Math.PI * 2
  // 気質: 犬はしっぽをよく振り、ポニーとヒツジはゆったり、ヤギとブタはきょろきょろ
  const tempo = dog ? { breath: 3.2, look: 0.4, rate: 0.45, wag: 6 } : kind === 'pony' || kind === 'sheep' ? { breath: 1.8, look: 0.25, rate: 0.2, wag: 1.2 } : { breath: 2.6, look: 0.45, rate: 0.5, wag: 2.5 }

  // 動かす部分。生成モデルに差し替えたら（swapModel）、モデルと首・尾の入れ物に向け直す
  let animBody: THREE.Object3D = body
  let animNeck: THREE.Object3D = neck
  let animTail: THREE.Object3D = tail
  let animEars: THREE.Object3D[] = ears

  const update = (time: number, dt: number, player: THREE.Vector3) => {
    const breath = reduceMotion ? 0 : Math.sin(time * tempo.breath + phase) * 0.018
    animBody.scale.set(1, 1 + breath, 1)
    headTarget.copy(player)
    group.worldToLocal(headTarget)
    const dist = Math.hypot(headTarget.x, headTarget.z)
    let wantYaw = 0
    if (dist < 14) wantYaw = Math.max(-0.75, Math.min(0.75, Math.atan2(headTarget.x, headTarget.z)))
    else if (!reduceMotion) wantYaw = Math.sin(time * tempo.rate + phase) * tempo.look
    const quick = time - noticeTime < 1.2 ? 2.4 : 1
    const k = reduceMotion ? 1 : Math.min(1, dt * 2 * quick)
    animNeck.rotation.y += (wantYaw - animNeck.rotation.y) * k
    if (reduceMotion) return
    // 尾: 犬は気づいた直後に大きく振る
    const lift = Math.max(0, 1 - (time - noticeTime) / 1.6)
    animTail.rotation.y = Math.sin(time * tempo.wag + phase) * (dog ? 0.25 + lift * 0.4 : 0.08 + lift * 0.2)
    // 耳のぴくり
    earTimer -= dt
    if (earTimer <= 0) {
      earTimer = 2 + Math.random() * 4
      earFlick = 0.3
      flickSide = Math.random() < 0.5 ? 0 : 1
    }
    if (earFlick > 0) {
      earFlick -= dt
      const ear = animEars[flickSide]
      if (ear) ear.rotation.y = Math.sin(((0.3 - earFlick) / 0.3) * Math.PI) * 0.5
    } else animEars.forEach((e) => (e.rotation.y = 0))
  }

  return {
    id: options.id,
    group,
    position,
    collider,
    headHeight: S.headHeight,
    update,
    setReduceMotion: (on) => {
      reduceMotion = on
      if (on) animTail.rotation.y = 0
    },
    notice: (time) => {
      noticeTime = time
      earTimer = 0
    },
    swapModel: (model, parts) => {
      // 生成モデル（Meshy）に差し替える。プリミティブの体と首は隠し、呼吸・首・尾の微アニメは渡された入れ物に書く
      body.visible = false
      neck.visible = false
      model.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          o.castShadow = true
          o.receiveShadow = true
        }
      })
      group.add(model)
      animBody = model
      animNeck = parts.neck ?? new THREE.Object3D()
      animTail = parts.tail ?? new THREE.Object3D()
      animEars = parts.ears ?? []
    },
    showPrimitive: (on) => {
      body.visible = on
      neck.visible = on
    },
  }
}
