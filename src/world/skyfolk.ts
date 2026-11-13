import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { toonMaterial } from '../render/toon'
import type { Collider } from './props'
import type { Lion } from './lions'

/**
 * 空の世界の鳥の様式化した目印。止まり木の上に立つ姿を、4 つの組み方で作り、種ごとに色と飾りを変える:
 * フクロウ（丸い体、顔の皿、大きな目、種によって耳のような羽角）、インコ・オウム（細身の体、曲がった大きなくちばし、
 * 種によって長い尾・冠羽・ほおの色）、タカ・ハヤブサ（立った体、たたんだ翼、黄色い足とくちばしの付け根）、
 * コンドル（背を丸めた黒い体、羽毛のない赤い頭）。
 * 色は種の目印で、個体の羽色の再現ではない。ライオンと同じ「しるし」の作り（プリミティブ、スキニングなしの微アニメ）で、
 * 出会いの仕組みにそのまま乗る。本物の行動の再現ではなく、本物の姿は収録映像で見せる。
 */
export type SkyKind = 'owl' | 'parrot' | 'hawk' | 'vulture'

export interface SkyLook {
  /** 背と頭の色 */
  body: string
  /** おなかの色 */
  belly: string
  /** 翼の色（省略時は体と同じ） */
  wing?: string
  /** 顔の皿（フクロウ）・顔の白い所（インコ）の色 */
  face?: string
  /** 顔の皿の縁取り（フクロウ） */
  rim?: string
  /** 目の色（虹彩）。黒い目の種は省略 */
  iris?: string
  beak: string
  /** 耳のような羽角（ミミズク・コノハズク） */
  tufts?: boolean
  /** 冠羽の色（オウム・オカメインコ） */
  crest?: string
  /** ほおの丸い色（オカメインコ） */
  cheek?: string
  /** 尾の色（省略時は翼と同じ） */
  tail?: string
  /** 長い尾（コンゴウインコ） */
  longTail?: boolean
  /** 肩・翼の差し色（ハリスホークの赤茶など） */
  accent?: string
  /** 頭の色（省略時は体と同じ。コンドルの赤い頭、ハヤブサの頭など） */
  head?: string
}

export interface SkyfolkOptions {
  id: string
  kind: SkyKind
  look: SkyLook
  /** 足もとの位置（止まり木の上。y は世界の高さ） */
  x: number
  y: number
  z: number
  /** 向き（ラジアン。0 で +z = 南を向く） */
  yaw: number
  size?: number
}

const matCache = new Map<string, THREE.Material>()
const mat = (color: string) => {
  let m = matCache.get(color)
  if (!m) {
    m = toonMaterial({ color })
    matCache.set(color, m)
  }
  return m
}
const sphere = new THREE.SphereGeometry(1, 14, 10)
const smallSphere = new THREE.SphereGeometry(1, 8, 6)
const cone = new THREE.ConeGeometry(1, 1, 8)
const eyeMat = new THREE.MeshBasicMaterial({ color: '#140d08' })
const glintMat = new THREE.MeshBasicMaterial({ color: '#fff6e6' })

// 小さい子は影の読み取りのずれで体がまだらに暗くなるので、影は受けず落とすだけにする（residents.ts と同じ）
function part(geo: THREE.BufferGeometry, color: string, x: number, y: number, z: number, sx: number, sy: number, sz: number): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat(color))
  m.position.set(x, y, z)
  m.scale.set(sx, sy, sz)
  m.castShadow = true
  m.receiveShadow = false
  return m
}

/** 黒い瞳に小さなハイライト。iris があれば色の輪を後ろに敷く（フクロウの大きな目） */
function eye(r: number, iris?: string): THREE.Object3D {
  const g = new THREE.Group()
  if (iris) {
    const ring = new THREE.Mesh(smallSphere, new THREE.MeshBasicMaterial({ color: iris }))
    ring.scale.set(r, r, r * 0.5)
    g.add(ring)
  }
  const p = new THREE.Mesh(smallSphere, eyeMat)
  const pr = iris ? r * 0.52 : r
  p.scale.set(pr, pr, pr * 0.6)
  p.position.z = iris ? r * 0.3 : 0
  const glint = new THREE.Mesh(smallSphere, glintMat)
  glint.scale.setScalar(pr * 0.34)
  glint.position.set(pr * 0.3, pr * 0.35, (iris ? r * 0.3 : 0) + pr * 0.5)
  g.add(p, glint)
  return g
}

interface Built {
  body: THREE.Group
  neck: THREE.Group
  /** 翼（気づいた時に少し広げる）。rotation.z を揺らす */
  wings: THREE.Object3D[]
  tail?: THREE.Object3D
  headHeight: number
  radius: number
  /** 首を回せる大きさ（フクロウは大きく回る） */
  turn: number
}

function wing(side: number, color: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, tilt: number): THREE.Group {
  const pivot = new THREE.Group()
  pivot.position.set(side * x, y, z)
  const w = part(sphere, color, side * sx * 0.25, -sy * 0.55, 0, sx, sy, sz)
  w.rotation.z = side * tilt
  pivot.add(w)
  pivot.userData.side = side
  return pivot
}

function feet(body: THREE.Group, color: string, spread: number, r: number): void {
  for (const side of [-1, 1]) body.add(part(smallSphere, color, side * spread, r * 0.5, r * 0.6, r * 1.1, r * 0.7, r * 1.6))
}

/** フクロウ（高さ約 0.5m） */
function buildOwl(L: SkyLook): Built {
  const body = new THREE.Group()
  const wingC = L.wing ?? L.body
  body.add(part(sphere, L.body, 0, 0.2, -0.01, 0.16, 0.2, 0.15))
  body.add(part(sphere, L.belly, 0, 0.19, 0.045, 0.13, 0.16, 0.11))
  // 尾: 背の下から止まり木の後ろへ短く
  const tail = new THREE.Group()
  tail.position.set(0, 0.08, -0.1)
  const t = part(sphere, L.tail ?? wingC, 0, -0.04, -0.03, 0.07, 0.1, 0.035)
  t.rotation.x = 0.5
  tail.add(t)
  body.add(tail)
  feet(body, '#c9a24a', 0.05, 0.028)
  const wings = [-1, 1].map((side) => wing(side, wingC, 0.13, 0.32, -0.02, 0.06, 0.15, 0.11, 0.08))
  body.add(...wings)
  const neck = new THREE.Group()
  neck.position.set(0, 0.36, 0)
  neck.add(part(sphere, L.head ?? L.body, 0, 0.06, 0, 0.13, 0.12, 0.12))
  // 顔の皿: 前に平たい円。縁取りがあればひと回り大きく後ろに
  if (L.rim) neck.add(part(sphere, L.rim, 0, 0.055, 0.07, 0.12, 0.112, 0.05))
  neck.add(part(sphere, L.face ?? L.belly, 0, 0.055, 0.082, 0.108, 0.1, 0.045))
  for (const side of [-1, 1]) {
    const e = eye(0.032, L.iris)
    e.position.set(side * 0.046, 0.07, 0.118)
    neck.add(e)
    if (L.tufts) {
      const tf = part(cone, L.head ?? L.body, side * 0.075, 0.17, 0.0, 0.03, 0.09, 0.022)
      tf.rotation.z = -side * 0.35
      neck.add(tf)
    }
  }
  const beak = part(cone, L.beak, 0, 0.03, 0.125, 0.016, 0.04, 0.016)
  beak.rotation.x = Math.PI
  neck.add(beak)
  return { body, neck, wings, tail, headHeight: 0.6, radius: 0.22, turn: 1.9 }
}

/** インコ・オウム（高さ約 0.45m。コンゴウインコは長い尾） */
function buildParrot(L: SkyLook): Built {
  const body = new THREE.Group()
  const wingC = L.wing ?? L.body
  body.add(part(sphere, L.body, 0, 0.17, 0, 0.1, 0.16, 0.095))
  body.add(part(sphere, L.belly, 0, 0.16, 0.035, 0.085, 0.13, 0.07))
  const tail = new THREE.Group()
  tail.position.set(0, 0.06, -0.07)
  const len = L.longTail ? 0.42 : 0.14
  const t = part(sphere, L.tail ?? wingC, 0, -len * 0.5, -0.04, 0.045, len * 0.5, 0.02)
  t.rotation.x = 0.28
  tail.add(t)
  body.add(tail)
  feet(body, '#5a5560', 0.035, 0.022)
  const wings = [-1, 1].map((side) => wing(side, wingC, 0.08, 0.27, -0.02, 0.045, 0.13, 0.08, 0.06))
  if (L.accent) for (const w of wings) w.add(part(sphere, L.accent, (w.userData.side as number) * 0.012, -0.03, 0.01, 0.04, 0.05, 0.07))
  body.add(...wings)
  const neck = new THREE.Group()
  neck.position.set(0, 0.3, 0.01)
  neck.add(part(sphere, L.head ?? L.body, 0, 0.05, 0, 0.085, 0.085, 0.085))
  if (L.face) neck.add(part(sphere, L.face, 0, 0.04, 0.05, 0.068, 0.055, 0.05))
  if (L.cheek) for (const side of [-1, 1]) neck.add(part(smallSphere, L.cheek, side * 0.06, 0.03, 0.04, 0.024, 0.024, 0.016))
  for (const side of [-1, 1]) {
    const e = eye(0.014)
    e.position.set(side * 0.058, 0.06, 0.05)
    neck.add(e)
  }
  // 曲がった大きなくちばし: 上は下向きの円錐、下は小さな玉
  const upper = part(cone, L.beak, 0, 0.035, 0.09, 0.03, 0.07, 0.032)
  upper.rotation.x = Math.PI * 0.62
  neck.add(upper, part(smallSphere, L.beak, 0, 0.0, 0.075, 0.022, 0.02, 0.022))
  if (L.crest) {
    for (let i = 0; i < 4; i++) {
      const c = part(cone, L.crest, 0, 0.12 + i * 0.005, -0.01 - i * 0.022, 0.018, 0.11 - i * 0.012, 0.012)
      c.rotation.x = -0.35 - i * 0.22
      neck.add(c)
    }
  }
  return { body, neck, wings, tail, headHeight: 0.5, radius: 0.18, turn: 1.1 }
}

/** タカ・ハヤブサ（高さ約 0.55m） */
function buildHawk(L: SkyLook): Built {
  const body = new THREE.Group()
  const wingC = L.wing ?? L.body
  body.add(part(sphere, L.body, 0, 0.22, -0.01, 0.12, 0.2, 0.12))
  body.add(part(sphere, L.belly, 0, 0.2, 0.04, 0.095, 0.16, 0.085))
  const tail = new THREE.Group()
  tail.position.set(0, 0.08, -0.09)
  const t = part(sphere, L.tail ?? wingC, 0, -0.17, -0.05, 0.055, 0.22, 0.02)
  t.rotation.x = 0.3
  tail.add(t)
  body.add(tail)
  feet(body, '#f2c230', 0.045, 0.026)
  // たたんだ翼は長く、先が尾の上で交差する（タカらしい細長い後ろ姿）
  const wings = [-1, 1].map((side) => wing(side, wingC, 0.1, 0.38, -0.05, 0.05, 0.25, 0.1, -0.12))
  if (L.accent) for (const w of wings) w.add(part(sphere, L.accent, (w.userData.side as number) * 0.012, -0.04, 0.02, 0.045, 0.06, 0.08))
  body.add(...wings)
  const neck = new THREE.Group()
  neck.position.set(0, 0.4, 0.01)
  neck.add(part(sphere, L.head ?? L.body, 0, 0.04, 0.01, 0.075, 0.072, 0.085))
  if (L.face) for (const side of [-1, 1]) neck.add(part(smallSphere, L.face, side * 0.05, 0.02, 0.04, 0.02, 0.035, 0.02))
  for (const side of [-1, 1]) {
    const e = eye(0.017, L.iris)
    e.position.set(side * 0.048, 0.055, 0.05)
    // 目の上の張り出し（タカの鋭い目つき）
    const brow = part(smallSphere, L.head ?? L.body, side * 0.045, 0.074, 0.055, 0.03, 0.012, 0.022)
    brow.rotation.z = side * 0.3
    neck.add(e, brow)
  }
  // くちばしの付け根（黄色）と、曲がった先
  neck.add(part(smallSphere, '#f2c230', 0, 0.045, 0.08, 0.03, 0.026, 0.026))
  const hook = part(cone, L.beak, 0, 0.028, 0.112, 0.03, 0.07, 0.028)
  hook.rotation.x = Math.PI * 0.6
  neck.add(hook)
  return { body, neck, wings, tail, headHeight: 0.58, radius: 0.2, turn: 1.0 }
}

/** コンドル（高さ約 0.6m、背を丸める） */
function buildVulture(L: SkyLook): Built {
  const body = new THREE.Group()
  const wingC = L.wing ?? L.body
  body.add(part(sphere, L.body, 0, 0.24, -0.02, 0.16, 0.2, 0.17))
  const tail = new THREE.Group()
  tail.position.set(0, 0.1, -0.14)
  const t = part(sphere, L.tail ?? wingC, 0, -0.08, -0.04, 0.07, 0.14, 0.025)
  t.rotation.x = 0.6
  tail.add(t)
  body.add(tail)
  feet(body, '#c9b8a8', 0.05, 0.03)
  const wings = [-1, 1].map((side) => wing(side, wingC, 0.13, 0.38, -0.05, 0.065, 0.2, 0.15, 0.1))
  if (L.accent) for (const w of wings) w.add(part(sphere, L.accent, (w.userData.side as number) * 0.01, -0.12, -0.04, 0.05, 0.1, 0.11))
  body.add(...wings)
  // 背を丸めて、首を前へ低く出す
  const neck = new THREE.Group()
  neck.position.set(0, 0.36, 0.11)
  neck.add(part(sphere, L.belly, 0, -0.01, -0.03, 0.06, 0.05, 0.06))
  neck.add(part(sphere, L.head ?? '#c8443a', 0, 0.03, 0.03, 0.05, 0.05, 0.065))
  for (const side of [-1, 1]) {
    const e = eye(0.011)
    e.position.set(side * 0.034, 0.045, 0.06)
    neck.add(e)
  }
  const hook = part(cone, L.beak, 0, 0.02, 0.1, 0.018, 0.04, 0.018)
  hook.rotation.x = Math.PI * 0.6
  neck.add(hook)
  return { body, neck, wings, tail, headHeight: 0.55, radius: 0.24, turn: 0.8 }
}

const litVC = toonMaterial({ vertexColors: true })
const unlitVC = new THREE.MeshBasicMaterial({ vertexColors: true })
const _inv = new THREE.Matrix4()
const _rel = new THREE.Matrix4()

/**
 * 動かない部品を 1 つにまとめる（39 羽 × 20 個ほどの部品を、1 羽あたり体・首・翼・尾の数個に）。
 * root の下の部品を root から見た形に焼き、材質の色を頂点の色にして、光を受けるものと受けないもの（目）の 2 つに。
 * keep（翼・尾のように動かす部分）の下はまとめない
 */
export function flatten(root: THREE.Object3D, keep: THREE.Object3D[]): void {
  _inv.copy(root.matrixWorld).invert()
  const lit: THREE.BufferGeometry[] = []
  const unlit: THREE.BufferGeometry[] = []
  const walk = (o: THREE.Object3D) => {
    for (const c of o.children) {
      if (keep.includes(c)) continue
      const m = c as THREE.Mesh
      if (m.isMesh) {
        const geo = m.geometry.clone()
        geo.applyMatrix4(_rel.multiplyMatrices(_inv, m.matrixWorld))
        const col = (m.material as THREE.MeshBasicMaterial).color
        const n = geo.attributes.position.count
        const arr = new Float32Array(n * 3)
        for (let i = 0; i < n; i++) col.toArray(arr, i * 3)
        geo.setAttribute('color', new THREE.BufferAttribute(arr, 3))
        ;((m.material as THREE.Material).type === 'MeshBasicMaterial' ? unlit : lit).push(geo)
      }
      walk(c)
    }
  }
  walk(root)
  for (const c of [...root.children]) if (!keep.includes(c)) root.remove(c)
  if (lit.length) {
    const mesh = new THREE.Mesh(mergeGeometries(lit), litVC)
    mesh.castShadow = true
    mesh.receiveShadow = false
    root.add(mesh)
  }
  if (unlit.length) root.add(new THREE.Mesh(mergeGeometries(unlit), unlitVC))
}

/**
 * どの組み方の目印にも使える軽量化: 各ノードの直下の「子を持たない・名前の無い」部品を、そのノードから見た形に焼いて 1 つにまとめる。
 * 首・尾などの動かすノード自体は残すので大きな動きはそのまま。名前のある部品（耳など、名前で探して動かすもの）はまとめない
 */
export function mergeStatic(root: THREE.Object3D): void {
  root.updateMatrixWorld(true)
  const visit = (node: THREE.Object3D) => {
    for (const c of [...node.children]) visit(c)
    // 名前の無い部品の下にぶら下がった部品（目のハイライトなど）は、見た目の位置のままこのノードの直下へ移してからまとめる
    for (const c of [...node.children]) {
      if (!(c as THREE.Mesh).isMesh || c.name || !c.children.length) continue
      const subs: THREE.Object3D[] = []
      c.traverse((d) => {
        if (d !== c) subs.push(d)
      })
      if (subs.every((d) => (d as THREE.Mesh).isMesh && !d.name)) for (const d of subs) node.attach(d)
    }
    const leaves = node.children.filter((c) => {
      const m = c as THREE.Mesh
      if (!m.isMesh || c.children.length || c.name || (m as THREE.SkinnedMesh).isSkinnedMesh || Array.isArray(m.material)) return false
      const mm = m.material as THREE.Material
      return !mm.transparent && (mm.type === 'MeshToonMaterial' || mm.type === 'MeshBasicMaterial') && !(mm as THREE.MeshToonMaterial).vertexColors
    }) as THREE.Mesh[]
    if (leaves.length < 2) return
    _inv.copy(node.matrixWorld).invert()
    for (const unlitPass of [false, true]) {
      const list = leaves.filter((m) => ((m.material as THREE.Material).type === 'MeshBasicMaterial') === unlitPass)
      if (list.length < 2) continue
      const geos: THREE.BufferGeometry[] = []
      for (const m of list) {
        let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()
        for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k)
        if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2))
        g.applyMatrix4(_rel.multiplyMatrices(_inv, m.matrixWorld))
        const col = (m.material as THREE.MeshBasicMaterial).color
        const n = g.attributes.position.count
        const arr = new Float32Array(n * 3)
        for (let i = 0; i < n; i++) col.toArray(arr, i * 3)
        g.setAttribute('color', new THREE.BufferAttribute(arr, 3))
        g.clearGroups()
        geos.push(g)
      }
      const merged = mergeGeometries(geos)
      if (!merged) continue
      const mesh = new THREE.Mesh(merged, unlitPass ? unlitVC : litVC)
      mesh.castShadow = list.some((m) => m.castShadow)
      mesh.receiveShadow = list.every((m) => m.receiveShadow)
      for (const m of list) node.remove(m)
      node.add(mesh)
    }
  }
  visit(root)
}

export function createSkyfolk(options: SkyfolkOptions): Lion {
  const group = new THREE.Group()
  group.name = `${options.kind}-${options.id}`
  const position = new THREE.Vector3(options.x, options.y, options.z)
  group.position.copy(position)
  group.rotation.y = options.yaw
  const scale = options.size ?? 1
  group.scale.setScalar(scale)
  const L = options.look
  const built =
    options.kind === 'owl' ? buildOwl(L) : options.kind === 'parrot' ? buildParrot(L) : options.kind === 'hawk' ? buildHawk(L) : buildVulture(L)
  group.add(built.body, built.neck)
  group.updateMatrixWorld(true)
  const moving = [...built.wings, ...(built.tail ? [built.tail] : [])]
  flatten(built.body, moving)
  for (const m of moving) flatten(m, [])
  flatten(built.neck, [])

  const collider: Collider = { x: options.x, z: options.z, r: built.radius * scale }
  let reduceMotion = false
  let noticeTime = -10
  const headTarget = new THREE.Vector3()
  const phase = Math.random() * Math.PI * 2
  // 気質: フクロウはじっとしてゆっくり首を回し、インコはせわしなく首をかしげ、タカは鋭くあたりを見回す
  const tempo =
    options.kind === 'owl'
      ? { breath: 1.8, look: 0.9, lookRate: 0.16, tilt: 0.12 }
      : options.kind === 'parrot'
        ? { breath: 3.2, look: 0.5, lookRate: 0.55, tilt: 0.3 }
        : options.kind === 'hawk'
          ? { breath: 2.4, look: 0.6, lookRate: 0.35, tilt: 0.06 }
          : { breath: 1.5, look: 0.35, lookRate: 0.15, tilt: 0.05 }

  // 生成モデルに差し替えたら（swapModel）、呼吸と首の動きをモデルと首の入れ物に向け直す（翼・尾は止める）
  let animBody: THREE.Object3D = built.body
  let animNeck: THREE.Object3D = built.neck
  let swapped = false

  const update = (time: number, dt: number, player: THREE.Vector3) => {
    const breath = reduceMotion ? 0 : Math.sin(time * tempo.breath + phase) * 0.025
    animBody.scale.set(1 + breath * 0.5, 1 + breath, 1 + breath * 0.5)
    headTarget.copy(player)
    group.worldToLocal(headTarget)
    const dist = Math.hypot(headTarget.x, headTarget.z) * scale
    let wantYaw = 0
    if (dist < 14) wantYaw = Math.max(-built.turn, Math.min(built.turn, Math.atan2(headTarget.x, headTarget.z)))
    else if (!reduceMotion) wantYaw = Math.sin(time * tempo.lookRate + phase) * tempo.look
    const quick = time - noticeTime < 1.2 ? 2.4 : 1
    const k = reduceMotion ? 1 : Math.min(1, dt * 2 * quick)
    animNeck.rotation.y += (wantYaw - animNeck.rotation.y) * k
    if (reduceMotion || swapped) return
    // 首をかしげる（フクロウ・インコらしさ）
    built.neck.rotation.z = Math.sin(time * tempo.lookRate * 1.7 + phase * 2) * tempo.tilt
    // 気づいた直後: 翼を少し広げて、尾をふる
    const lift = Math.max(0, 1 - (time - noticeTime) / 1.4)
    for (const w of built.wings) w.rotation.z = (w.userData.side as number) * lift * 0.5 * Math.abs(Math.sin((time - noticeTime) * 7))
    if (built.tail) built.tail.rotation.y = Math.sin(time * 1.3 + phase) * (0.04 + lift * 0.25)
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
      if (on) {
        for (const w of built.wings) w.rotation.z = 0
        built.neck.rotation.z = 0
      }
    },
    notice: (time) => {
      noticeTime = time
    },
    swapModel: (model, parts) => {
      // 生成モデル（Meshy、リグなし）に差し替える。止まり木の上でその場の呼吸と首の向きだけ（歩かない・羽ばたかない）。
      // 足を止まり木の上（y=0）に置き、高さはプリミティブ版の止まり木から上（頭・冠羽のてっぺん）にそろえる。
      // 渡される大きさはプリミティブ版の上下の全長で、長い尾のインコは垂れた尾のぶん大きくなりすぎるので、ここで測り直す
      group.updateMatrixWorld(true)
      const inv = group.matrixWorld.clone().invert()
      const local = (root: THREE.Object3D) => {
        const box = new THREE.Box3()
        group.updateMatrixWorld(true)
        root.traverse((o) => {
          const mesh = o as THREE.Mesh
          if (!mesh.isMesh) return
          if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox()
          box.union(mesh.geometry.boundingBox!.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld)))
        })
        return box
      }
      const top = Math.max(local(built.body).max.y, local(built.neck).max.y)
      built.body.visible = false
      built.neck.visible = false
      // 呼吸は model の scale に毎コマ書くので、大きさの合わせは外側の入れ物に持たせる
      const holder = new THREE.Group()
      holder.add(model)
      group.add(holder)
      const box = local(model)
      const h = box.max.y - box.min.y
      if (h > 0 && top > 0) holder.scale.setScalar(top / h)
      holder.position.y = -box.min.y * holder.scale.y
      model.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          o.castShadow = true
          o.receiveShadow = true
        }
      })
      animBody = model
      animNeck = parts.neck ?? new THREE.Object3D()
      swapped = true
    },
  }
}
