import * as THREE from 'three'
import { toonMaterial } from '../render/toon'
import { terrainHeight } from './terrain'
import type { Collider } from './props'

/**
 * 様式化したライオン。プリミティブだけで組み、スキニングなしの微アニメで生きている感じを出す。
 * 本物の行動を強制しない「しるし」で、本物の姿はモニターの収録映像で見せる。
 *
 * 試作2回目の見立てに従い「ライオン読み」を優先: 頭を横に広く、鼻先を前に長く、肩まわりに量感。
 *
 * 同じ伏せの体で、トラ（橙の地に黒い縞、白い頬）、オオカミ（細い体、長い鼻先、立った三角の耳、ふさふさの尾）、
 * キツネ（橙、黒い耳の裏、白い尾の先）、クマ（黒、胸の白い三日月、丸い耳、短い尾）、
 * カピバラ（茶色の太い胴、四角い大きな鼻づら、小さな耳、尾なし）、
 * マーラ（灰茶の体、白いおなか、うさぎのような長い耳、小さな頭）、
 * 木の枝に寝そべるビントロング（黒いぼさぼさの毛、白い縁の耳、太い尾を垂らす）とキンカジュー（金茶、丸い頭、細い尾を垂らす）も作る。
 * どれも様式化した目印で、個体の毛並みの再現ではない。
 */
export type RestingSpecies = 'lion' | 'tiger' | 'wolf' | 'fox' | 'bear' | 'capybara' | 'binturong' | 'kinkajou' | 'mara'

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
  /** たてがみの横と下の色（mane のとき） */
  maneColor?: string
  /** たてがみの上（頭頂）の色。省略時は濃い茶 */
  maneTopColor?: string
  /** 体の作り。省略時はライオン */
  species?: RestingSpecies
  /** 地面からの高さ（木の枝の上など）。尾は下へ垂らす */
  lift?: number
}

export interface Lion {
  id: string
  group: THREE.Group
  position: THREE.Vector3
  collider: Collider
  /** 頭のあたりの高さ（体の倍率をかける前、m）。ピンと名前をここに出す。省略時は伏せたライオンの 0.95 */
  headHeight?: number
  update: (time: number, dt: number, player: THREE.Vector3) => void
  setReduceMotion: (on: boolean) => void
  /** そばに来た人に気づく: 耳をぴくりとさせ、少し早くこちらを向き、尾を一度大きく振る */
  notice: (time: number) => void
  /**
   * 実験用: 別の造形（glTF など）に差し替える。first/second は首と尾のピボット、
   * ears は耳のメッシュ。名前が見つからなければ、その部分の微アニメだけ止まる。
   */
  swapModel: (model: THREE.Object3D, parts: { neck?: THREE.Object3D; ears?: THREE.Object3D[]; tail?: THREE.Object3D }) => void
  /** 遠景用: swapModel で隠したプリミティブ版を出す／隠す（生成モデル側の表示は呼ぶ側が切り替える）。無い入れ物は遠景では生成モデルごと隠す */
  showPrimitive?: (on: boolean) => void
}

export const LION_COLORS = {
  tawny: '#d9a95f',
  belly: '#efd6a8',
  dark: '#6a4727',
  mane: '#8d5a2b',
  nose: '#3a2a22',
} as const

/** 種ごとの色（ライオンは個体の coat を優先） */
const SPECIES_COLORS: Record<RestingSpecies, { coat: string; belly: string; dark: string; nose: string }> = {
  lion: { coat: LION_COLORS.tawny, belly: LION_COLORS.belly, dark: LION_COLORS.dark, nose: LION_COLORS.nose },
  tiger: { coat: '#e3873a', belly: '#f7efe2', dark: '#1f1814', nose: '#3a2a22' },
  wolf: { coat: '#ece4d4', belly: '#fbf7ef', dark: '#8a8580', nose: '#25262b' },
  fox: { coat: '#d97b36', belly: '#fbf3e6', dark: '#2e2420', nose: '#1e1a18' },
  bear: { coat: '#2a2624', belly: '#f2eee6', dark: '#2a2624', nose: '#151312' },
  capybara: { coat: '#9c6e48', belly: '#b38a62', dark: '#5a3e2a', nose: '#33261e' },
  binturong: { coat: '#2c2724', belly: '#403833', dark: '#efe9e0', nose: '#141211' },
  kinkajou: { coat: '#b47b42', belly: '#dcae70', dark: '#6a4526', nose: '#2a1d14' },
  mara: { coat: '#b6a48b', belly: '#f1e9da', dark: '#5f5244', nose: '#2a2420' },
}

export function createLion(options: LionOptions): Lion {
  const species = options.species ?? 'lion'
  const tiger = species === 'tiger'
  const wolf = species === 'wolf'
  const fox = species === 'fox'
  const bear = species === 'bear'
  const capy = species === 'capybara'
  const binturong = species === 'binturong'
  const kinkajou = species === 'kinkajou'
  /** 木の上の子: 丸い小さな耳、尾を枝から垂らす */
  const arboreal = binturong || kinkajou
  const mara = species === 'mara'
  /** 細い犬の仲間（オオカミ・キツネ）: 長い鼻先、三角の耳、ふさふさの尾 */
  const canid = wolf || fox
  const palette = SPECIES_COLORS[species]
  const group = new THREE.Group()
  group.name = `lion-${options.id}`
  const y = terrainHeight(options.x, options.z) + (options.lift ?? 0)
  const position = new THREE.Vector3(options.x, y, options.z)
  group.position.copy(position)
  group.rotation.y = options.yaw
  const scale = (options.cub ? 0.58 : 1) * (options.size ?? 1)
  group.scale.setScalar(scale)

  const coat = new THREE.Color(options.coat ?? palette.coat)
  const tawny = toonMaterial({ color: coat })
  const tawnyLight = toonMaterial({
    color: tiger || fox ? palette.belly : bear ? '#b49a7c' : capy ? coat.clone().lerp(new THREE.Color('#5a3e2a'), 0.2) : coat.clone().lerp(new THREE.Color('#f3dcae'), wolf ? 0.1 : 0.35),
  })
  const belly = toonMaterial({ color: palette.belly })
  const dark = toonMaterial({ color: palette.dark })
  const nose = toonMaterial({ color: palette.nose })
  const eyeMat = new THREE.MeshBasicMaterial({ color: '#140d08' })
  const glintMat = new THREE.MeshBasicMaterial({ color: '#fff6e6' })

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
  torso.scale.set(canid ? 0.9 : bear ? 1.32 : capy ? 1.2 : 1.12, canid ? 0.92 : bear ? 1.16 : capy ? 1.05 : 1, capy ? 1.12 : 1)
  const chest = cast(new THREE.Mesh(new THREE.SphereGeometry(0.4, 14, 10), canid ? belly : tawny))
  chest.position.set(0, 0.5, 0.42)
  chest.scale.set(canid ? 1.05 : bear ? 1.45 : 1.3, bear ? 1.1 : 0.95, 1.05)
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
  if (bear) {
    // ツキノワグマ: 胸の白い三日月
    const moon = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.04, 5, 16, Math.PI), belly)
    moon.position.set(0, 0.62, 0.86)
    moon.rotation.set(-0.15, 0, Math.PI)
    moon.scale.set(1.25, 0.8, 1)
    body.add(moon)
  }
  if (tiger) {
    // トラの縞: 胴を上から包む黒い弧。少しずつ傾けて、縞の流れを出す
    const stripeGeo = new THREE.TorusGeometry(0.375, 0.028, 4, 14, Math.PI * 0.78)
    for (let i = 0; i < 7; i++) {
      const stripe = new THREE.Mesh(stripeGeo, dark)
      stripe.position.set(0, 0.43, -0.62 + i * 0.16)
      stripe.rotation.set(0, (i % 2 ? 0.18 : -0.12), Math.PI * 0.11)
      stripe.scale.set(1.13, 1.01, 1)
      body.add(stripe)
    }
    // 腿と肩にも短い縞
    const shortGeo = new THREE.TorusGeometry(0.27, 0.024, 4, 10, Math.PI * 0.6)
    for (const side of [-1, 1]) {
      for (let i = 0; i < 2; i++) {
        const st = new THREE.Mesh(shortGeo, dark)
        st.position.set(side * 0.32, 0.29, -0.62 + i * 0.13)
        st.rotation.set(0, Math.PI / 2, side > 0 ? 0.6 : Math.PI - 0.6 - Math.PI * 0.6)
        body.add(st)
      }
    }
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
  const headScale = options.cub ? 1.3 : wolf ? 0.95 : fox ? 0.88 : bear ? 1.12 : mara ? 0.82 : 1.1
  head.scale.setScalar(headScale)
  // オオカミとキツネは鼻先を前へ長く。カピバラも少し前へ
  const snout = wolf ? 0.12 : fox ? 0.15 : capy ? 0.05 : bear ? 0.02 : binturong ? 0.04 : kinkajou ? -0.06 : 0

  // 頭蓋: 横に広く、少し平たい
  const skull = cast(new THREE.Mesh(new THREE.SphereGeometry(0.29, 14, 10), tawny))
  skull.scale.set(wolf ? 1.12 : fox ? 1.05 : bear ? 1.22 : capy ? 1.02 : 1.36, bear ? 0.98 : capy ? 0.98 : 0.84, capy ? 1.3 : 1.04)
  // 額: 眉のあたりを前に張り出す
  const brow = cast(new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), tawny))
  brow.position.set(0, 0.07, 0.17)
  brow.scale.set(1.6, 0.55, 1.0)
  // 鼻すじ: 額から鼻先へ長く前に出す（丸みのあるカプセル）
  const bridge = cast(new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.3, 4, 10), tawnyLight))
  bridge.rotation.x = Math.PI / 2
  bridge.position.set(0, 0.01, 0.38 + snout * 0.6)
  bridge.scale.set(wolf ? 0.95 : fox ? 0.82 : capy ? 1.45 : 1.15, capy ? 1.2 : 0.8, canid ? 1.5 : bear ? 0.7 : capy ? 1.15 : 1)
  // 口まわり: 上は淡い黄褐色、下唇だけ白く。長く、丸い
  const muzzle = cast(new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), tawnyLight))
  muzzle.position.set(0, -0.09, 0.38 + snout)
  muzzle.scale.set(wolf ? 0.78 : fox ? 0.68 : capy ? 1.3 : 1.0, capy ? 1.0 : 0.62, canid ? 1.85 : bear ? 1.05 : capy ? 1.5 : 1.45)
  const lip = cast(new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), bear || capy ? tawnyLight : belly))
  lip.position.set(0, -0.15, 0.42 + snout)
  lip.scale.set(1.05, 0.5, 1.3)
  // 鼻先: 黒い逆三角形（低い円錐を前に倒す）
  const noseTip = cast(new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.07, 3), nose))
  noseTip.rotation.set(Math.PI / 2 + 0.25, Math.PI, 0)
  noseTip.position.set(0, 0.01, 0.6 + snout * 1.4)
  noseTip.scale.set(1.3, 1, 1)
  // 下あご
  const chin = cast(new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), bear || capy ? tawnyLight : belly))
  chin.position.set(0, -0.2, 0.36 + snout)
  chin.scale.set(1, 0.55, 1.3)
  head.add(skull, brow, bridge, muzzle, lip, noseTip, chin)
  // 頬のふくらみ（白）。顔の横幅を出す
  for (const side of [-1, 1]) {
    const cheek = cast(new THREE.Mesh(new THREE.SphereGeometry(tiger ? 0.15 : 0.12, 10, 8), tawnyLight))
    cheek.position.set(side * 0.22, -0.13, 0.17)
    cheek.scale.set(1, 0.8, 1.1)
    head.add(cheek)
  }
  for (const side of [-1, 1]) {
    // 目: 光の影響を受けない黒いビーズ。顔から少し浮かせ、小さなハイライトを乗せる（遠くからも「目」と分かる）
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.052, 10, 8), eyeMat)
    // カピバラは目が高い位置に
    eye.position.set(side * 0.16, capy ? 0.12 : 0.05, capy ? 0.27 : 0.31)
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.016, 6, 4), glintMat)
    glint.position.set(side * -0.012, 0.022, 0.044)
    eye.add(glint)
    // 目の下の黒いすじ（ライオンらしさ）
    const tear = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.09, 0.02), nose)
    tear.position.set(side * 0.125, -0.02, 0.37)
    tear.rotation.z = side * 0.25
    // 耳は頭のてっぺんではなく横寄りに。丸く小さめ
    // 仔は耳の後ろが暗く、縁が黒い（写真の参考）。成獣は体と同じ色
    let ear: THREE.Mesh
    if (canid) {
      // オオカミ・キツネ: 立った三角の耳（キツネは大きく、裏が黒い）
      ear = cast(new THREE.Mesh(new THREE.ConeGeometry(fox ? 0.1 : 0.085, fox ? 0.28 : 0.22, 6), fox ? dark : tawny))
      ear.position.set(side * 0.2, fox ? 0.31 : 0.28, -0.04)
      ear.rotation.z = side * -0.28
      ear.scale.set(1, 1, 0.55)
      const earIn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.15, 6), fox ? belly : dark)
      earIn.position.set(0, -0.02, 0.035)
      ear.add(earIn)
    } else if (capy) {
      // カピバラ: 頭の上の小さな耳
      ear = cast(new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), dark))
      ear.position.set(side * 0.17, 0.21, -0.14)
      ear.scale.set(1, 0.9, 0.55)
    } else if (mara) {
      // マーラ: うさぎのような長い耳
      ear = cast(new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), tawny))
      ear.position.set(side * 0.15, 0.38, -0.1)
      ear.scale.set(0.95, 3.0, 0.45)
      ear.rotation.set(-0.3, 0, side * -0.18)
      const earIn = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), belly)
      earIn.position.set(0, 0, 0.03)
      ear.add(earIn)
    } else if (arboreal) {
      // ビントロングは白い縁の丸い耳、キンカジューは小さな丸い耳
      ear = cast(new THREE.Mesh(new THREE.SphereGeometry(binturong ? 0.085 : 0.07, 8, 6), binturong ? dark : tawny))
      ear.position.set(side * 0.24, 0.2, -0.08)
      ear.scale.set(1, 1, 0.45)
      const earIn = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), binturong ? tawny : belly)
      earIn.position.set(0, -0.005, 0.03)
      ear.add(earIn)
    } else if (bear) {
      // クマ: 頭のてっぺん寄りの丸い耳
      ear = cast(new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), tawny))
      ear.position.set(side * 0.24, 0.24, -0.08)
      ear.scale.set(1, 1, 0.5)
    } else {
      ear = cast(new THREE.Mesh(new THREE.SphereGeometry(0.095, 8, 6), options.cub || tiger ? dark : tawny))
      ear.position.set(side * 0.31, 0.17, -0.06)
      ear.rotation.z = side * -0.35
      ear.scale.set(1, 1, 0.45)
      const earIn = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), options.cub || tiger ? belly : dark)
      earIn.position.set(0, 0, 0.05)
      ear.add(earIn)
    }
    ear.name = `ear${side}`
    // 目の下の黒いすじはライオンだけ
    if (species === 'lion') head.add(tear)
    head.add(eye, ear)
  }
  if (tiger) {
    // 額の縞
    for (let i = 0; i < 3; i++) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.012, 0.12 - i * 0.02), dark)
      st.position.set((i - 1) * 0.07, 0.235 - Math.abs(i - 1) * 0.02, 0.1)
      st.rotation.set(-0.5, 0, (i - 1) * -0.35)
      head.add(st)
    }
    for (const side of [-1, 1]) {
      for (let i = 0; i < 2; i++) {
        const st = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.035, 0.13), dark)
        st.position.set(side * (0.36 - i * 0.02), 0.02 - i * 0.07, -0.02)
        st.rotation.set(0, side * 0.3, side * 0.5)
        head.add(st)
      }
    }
  }
  if (options.mane) {
    // たてがみ: 顔の後ろで囲む輪（上は濃い茶、横と下は金色のツートーン）＋首の後ろと胸のふくらみ。
    // 輪は顔より後ろに置き、直径を絞って、正面から見ても顔が前に出るようにする
    const maneSide = new THREE.Color(options.maneColor ?? LION_COLORS.mane)
    const maneTopColor = new THREE.Color(options.maneTopColor ?? '#5a3418')
    const sideMat = toonMaterial({ color: maneSide })
    const topMat = toonMaterial({ color: maneTopColor })
    const midMat = toonMaterial({ color: maneSide.clone().lerp(maneTopColor, 0.5) })
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2
      const up = Math.sin(a)
      const r = 0.34 + Math.max(0, up) * 0.07
      const mat = up > 0.55 ? topMat : up > 0.1 ? midMat : sideMat
      const tuft = cast(new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), mat))
      tuft.position.set(Math.cos(a) * r, up * r * 0.9 + 0.02, -0.2 - Math.max(0, up) * 0.03)
      tuft.scale.set(1.1, 1 + Math.max(0, up) * 0.4, 0.7)
      head.add(tuft)
    }
    // 頭頂のひとふさ（濃い茶）
    const crown = cast(new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), topMat))
    crown.position.set(0, 0.3, -0.12)
    crown.scale.set(1.4, 0.7, 0.9)
    head.add(crown)
    const maneBack = cast(new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), midMat))
    maneBack.position.set(0, -0.02, -0.24)
    maneBack.scale.set(1.15, 1, 0.9)
    neck.add(maneBack)
    const maneChest = cast(new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), sideMat))
    maneChest.position.set(0, 0.5, 0.52)
    maneChest.scale.set(1.3, 0.85, 1)
    body.add(maneChest)
  }
  neckPivot.add(head)
  primitive.add(neckPivot)

  // --- 尾。後ろから横へ、地面に沿わせる ---
  const tailPivot = new THREE.Group()
  tailPivot.position.set(0, 0.36, -0.75)
  // 木の上の子は尾を枝から下へ垂らす。ほかは後ろから横へ、地面に沿わせる
  const curve = new THREE.CatmullRomCurve3(
    arboreal
      ? [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.25, -0.3), new THREE.Vector3(0.05, -0.8, -0.35), new THREE.Vector3(0.12, -1.35, -0.22)]
      : [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.15, -0.12, -0.3), new THREE.Vector3(0.45, -0.26, -0.45), new THREE.Vector3(0.75, -0.3, -0.35)],
  )
  const tail = cast(new THREE.Mesh(new THREE.TubeGeometry(curve, 10, canid ? (fox ? 0.11 : 0.1) : binturong ? 0.13 : kinkajou ? 0.07 : 0.045, 7, false), tawny))
  // ライオンは黒い房、オオカミとキツネはふさふさの白い先、トラは黒い輪。クマは短い尾、カピバラは尾なし
  const tuft = cast(new THREE.Mesh(new THREE.SphereGeometry(canid ? 0.14 : binturong ? 0.13 : kinkajou ? 0.07 : 0.085, 8, 6), canid ? belly : arboreal ? tawny : dark))
  tuft.position.copy(curve.getPoint(1))
  if (canid) tuft.scale.set(1, 0.9, 1.6)
  if (bear) {
    const stub = cast(new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), tawny))
    tailPivot.add(stub)
  } else if (mara) {
    // マーラは短い尾
    const stub = cast(new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), dark))
    tailPivot.add(stub)
  } else if (!capy) tailPivot.add(tail, tuft)
  if (tiger) {
    const ringGeo = new THREE.TorusGeometry(0.05, 0.014, 4, 10)
    for (let i = 1; i <= 4; i++) {
      const tt = i / 5
      const ring = new THREE.Mesh(ringGeo, dark)
      ring.position.copy(curve.getPoint(tt))
      ring.lookAt(curve.getPoint(tt).add(curve.getTangent(tt)))
      tailPivot.add(ring)
    }
  }
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
    showPrimitive: (on) => {
      primitive.visible = on
    },
  }
}
