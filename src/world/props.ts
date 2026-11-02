import * as THREE from 'three'
import { mulberry32 } from './noise'
import { ACACIAS, KOPJE, WALK_RADIUS, WATERHOLE, WORLD_SEED } from './layout'
import { WATER_LEVEL, terrainHeight } from './terrain'

/** 円柱の当たり判定（xz 平面の円）。キャラとカメラがめり込まないために使う */
export interface Collider {
  x: number
  z: number
  r: number
}

export interface Props {
  group: THREE.Group
  colliders: Collider[]
  /** 草の揺れ。0 で止まる */
  setSway: (amount: number) => void
  update: (time: number) => void
}

const _m = new THREE.Matrix4()
const _p = new THREE.Vector3()
const _q = new THREE.Quaternion()
const _s = new THREE.Vector3()
const _e = new THREE.Euler()
const _c = new THREE.Color()

function distToWater(x: number, z: number): number {
  return Math.hypot(x - WATERHOLE.x, z - WATERHOLE.z)
}

function distToKopje(x: number, z: number): number {
  return Math.hypot(x - KOPJE.x, z - KOPJE.z)
}

/** アカシア: 細い幹と平たい傘状の冠。InstancedMesh 2つで描く */
function createAcacias(rand: () => number, group: THREE.Group, colliders: Collider[]): void {
  const trees = [...ACACIAS]
  // 外側にもまばらに
  for (let i = 0; i < 18; i++) {
    const a = rand() * Math.PI * 2
    const r = 95 + rand() * 50
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r
    if (distToWater(x, z) < 24) continue
    trees.push({ x, z, scale: 0.8 + rand() * 0.5 })
  }

  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.5, 1, 7, 1)
  trunkGeo.translate(0, 0.5, 0)
  const trunkMat = new THREE.MeshStandardMaterial({ color: '#4a3220', roughness: 0.9 })
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, trees.length)
  trunks.castShadow = true
  trunks.receiveShadow = true

  const BLOBS = 5
  const blobGeo = new THREE.SphereGeometry(1, 7, 5)
  const blobMat = new THREE.MeshStandardMaterial({ roughness: 0.85, flatShading: true })
  const blobs = new THREE.InstancedMesh(blobGeo, blobMat, trees.length * BLOBS)
  blobs.castShadow = true
  blobs.receiveShadow = true

  const canopyA = new THREE.Color('#5e6d2a')
  const canopyB = new THREE.Color('#7d7f32')

  trees.forEach((t, i) => {
    const y = terrainHeight(t.x, t.z)
    const h = (5.5 + rand() * 2.5) * t.scale
    const lean = (rand() - 0.5) * 0.16
    const yaw = rand() * Math.PI * 2

    _e.set(lean, yaw, (rand() - 0.5) * 0.16)
    _q.setFromEuler(_e)
    _p.set(t.x, y - 0.3, t.z)
    _s.set(t.scale, h, t.scale)
    _m.compose(_p, _q, _s)
    trunks.setMatrixAt(i, _m)
    colliders.push({ x: t.x, z: t.z, r: 0.55 * t.scale })

    // 幹の先端（傾きを含む）
    const top = new THREE.Vector3(0, h, 0).applyQuaternion(_q).add(_p)
    const spread = 3.2 * t.scale
    for (let b = 0; b < BLOBS; b++) {
      const a = (b / BLOBS) * Math.PI * 2 + rand() * 0.8
      const r = b === 0 ? 0 : spread * (0.45 + rand() * 0.5)
      const rx = 2.2 * t.scale * (0.8 + rand() * 0.5)
      const ry = 0.7 * t.scale * (0.8 + rand() * 0.4)
      _p.set(top.x + Math.cos(a) * r, top.y + (rand() - 0.3) * 0.5 * t.scale, top.z + Math.sin(a) * r)
      _e.set(0, rand() * Math.PI, 0)
      _q.setFromEuler(_e)
      _s.set(rx, ry, rx * (0.8 + rand() * 0.4))
      _m.compose(_p, _q, _s)
      const idx = i * BLOBS + b
      blobs.setMatrixAt(idx, _m)
      _c.copy(canopyA).lerp(canopyB, rand())
      blobs.setColorAt(idx, _c)
    }
  })
  trunks.instanceMatrix.needsUpdate = true
  blobs.instanceMatrix.needsUpdate = true
  if (blobs.instanceColor) blobs.instanceColor.needsUpdate = true

  group.add(trunks, blobs)
}

/** コピエの岩と、平原に散らばる岩 */
function createRocks(rand: () => number, group: THREE.Group, colliders: Collider[]): void {
  const placements: Array<{ x: number; z: number; s: number; sink: number }> = []

  // コピエ: 台地の縁と斜面に大きな岩。南側（スポーン側）は登り口として空ける
  for (let i = 0; i < 34; i++) {
    const a = rand() * Math.PI * 2
    const south = Math.abs(a - Math.PI / 2) // +z 方向が南
    if (south < 0.55) continue
    const r = KOPJE.radius * (0.35 + rand() * 0.6)
    const x = KOPJE.x + Math.cos(a) * r
    const z = KOPJE.z + Math.sin(a) * r
    placements.push({ x, z, s: 2.2 + rand() * 3.4, sink: 0.6 })
  }
  // 台地の上にも低い岩をいくつか（観察スポットの雰囲気づくり）。中央は空けておく
  for (let i = 0; i < 5; i++) {
    const a = rand() * Math.PI * 2
    const r = KOPJE.radius * (0.2 + rand() * 0.1)
    placements.push({ x: KOPJE.x + Math.cos(a) * r, z: KOPJE.z + Math.sin(a) * r, s: 0.8 + rand() * 1.0, sink: 0.4 })
  }
  // 平原に散らばる岩
  for (let i = 0; i < 40; i++) {
    const a = rand() * Math.PI * 2
    const r = 20 + rand() * 120
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r
    if (distToWater(x, z) < 16 || distToKopje(x, z) < KOPJE.radius + 4) continue
    placements.push({ x, z, s: 0.5 + rand() * 1.4, sink: 0.35 })
  }

  const geo = new THREE.DodecahedronGeometry(1, 0)
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true })
  const rocks = new THREE.InstancedMesh(geo, mat, placements.length)
  rocks.castShadow = true
  rocks.receiveShadow = true

  const rockA = new THREE.Color('#8c7458')
  const rockB = new THREE.Color('#a68a66')

  placements.forEach((p, i) => {
    const y = terrainHeight(p.x, p.z) - p.sink * p.s * 0.4
    _p.set(p.x, y, p.z)
    _e.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI)
    _q.setFromEuler(_e)
    const sx = p.s * (0.8 + rand() * 0.5)
    const sz = p.s * (0.8 + rand() * 0.5)
    _s.set(sx, p.s * (0.6 + rand() * 0.5), sz)
    _m.compose(_p, _q, _s)
    rocks.setMatrixAt(i, _m)
    // 小石は当たり判定なし。十二面体の外接半径は1なので少し内側を取る
    if (p.s >= 0.9) colliders.push({ x: p.x, z: p.z, r: Math.max(sx, sz) * 0.8 })
    _c.copy(rockA).lerp(rockB, rand())
    rocks.setColorAt(i, _c)
  })
  rocks.instanceMatrix.needsUpdate = true
  if (rocks.instanceColor) rocks.instanceColor.needsUpdate = true
  group.add(rocks)
}

/** 水場 */
function createWater(group: THREE.Group): void {
  const geo = new THREE.CircleGeometry(WATERHOLE.radius, 40)
  geo.rotateX(-Math.PI / 2)
  const mat = new THREE.MeshStandardMaterial({
    color: '#6f93a6',
    roughness: 0.12,
    metalness: 0.05,
    transparent: true,
    opacity: 0.92,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.set(WATERHOLE.x, WATER_LEVEL, WATERHOLE.z)
  mesh.receiveShadow = true
  mesh.name = 'water'
  group.add(mesh)
}

/** 遠景の山並み。霧に溶ける低ポリの円錐 */
function createMountains(rand: () => number, group: THREE.Group): void {
  const count = 30
  const geo = new THREE.ConeGeometry(1, 1, 6, 1)
  geo.translate(0, 0.5, 0)
  const mat = new THREE.MeshBasicMaterial()
  const mountains = new THREE.InstancedMesh(geo, mat, count)

  const mA = new THREE.Color('#b48d68')
  const mB = new THREE.Color('#c39b73')

  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + (rand() - 0.5) * 0.18
    const r = 182 + rand() * 16
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r
    const h = 14 + rand() * 20
    const w = 36 + rand() * 36
    _p.set(x, terrainHeight(x, z) - 2, z)
    _e.set(0, rand() * Math.PI, 0)
    _q.setFromEuler(_e)
    _s.set(w, h, w * (0.8 + rand() * 0.4))
    _m.compose(_p, _q, _s)
    mountains.setMatrixAt(i, _m)
    _c.copy(mA).lerp(mB, rand())
    mountains.setColorAt(i, _c)
  }
  mountains.instanceMatrix.needsUpdate = true
  if (mountains.instanceColor) mountains.instanceColor.needsUpdate = true
  group.add(mountains)
}

/** 草むら。細い三角の板を数千本、InstancedMesh で描き、頂点シェーダで揺らす */
function createGrass(rand: () => number, group: THREE.Group): { mesh: THREE.InstancedMesh; uniforms: { uTime: { value: number }; uSway: { value: number } } } {
  const count = 14000
  const geo = new THREE.BufferGeometry()
  // 2枚の板を十字に。根元 y=0、先端 y=1
  // 表裏それぞれの巻き順で三角形を持ち、FrontSide のまま両面から見えるようにする
  // （DoubleSide だと裏面の法線が反転して暗い棘に見える）
  const verts = new Float32Array([
    -0.06, 0, 0, 0.06, 0, 0, 0, 1, 0,
    0.06, 0, 0, -0.06, 0, 0, 0, 1, 0,
    0, 0, -0.06, 0, 0, 0.06, 0, 1, 0,
    0, 0, 0.06, 0, 0, -0.06, 0, 1, 0,
  ])
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3))
  // 法線を上向きにそろえ、地面と同じ明るさで光らせる
  const normals = new Float32Array(12 * 3)
  for (let i = 0; i < 12; i++) normals[i * 3 + 1] = 1
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3))

  const uniforms = { uTime: { value: 0 }, uSway: { value: 1 } }
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.9 })
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime
    shader.uniforms.uSway = uniforms.uSway
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uSway;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float ph = instanceMatrix[3].x * 0.35 + instanceMatrix[3].z * 0.27;
        float sway = sin(uTime * 1.6 + ph) * 0.5 + sin(uTime * 2.7 + ph * 1.7) * 0.25;
        transformed.x += sway * uSway * position.y * 0.35;
        transformed.z += sway * uSway * position.y * 0.12;`,
      )
  }

  const grass = new THREE.InstancedMesh(geo, mat, count)
  grass.receiveShadow = true
  grass.frustumCulled = false

  const gA = new THREE.Color('#e6c66c')
  const gB = new THREE.Color('#cfa548')
  const gC = new THREE.Color('#a9ad48')

  let placed = 0
  let guard = 0
  while (placed < count && guard++ < count * 3) {
    const a = rand() * Math.PI * 2
    // 近くを密に、遠くをまばらに
    const r = Math.pow(rand(), 0.7) * (WALK_RADIUS + 25)
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r
    const dw = distToWater(x, z)
    if (dw < WATERHOLE.radius + 1.5) continue
    if (distToKopje(x, z) < KOPJE.radius * 0.95) continue
    const h = 0.3 + rand() * 0.45
    _p.set(x, terrainHeight(x, z) - 0.02, z)
    _e.set(0, rand() * Math.PI, 0)
    _q.setFromEuler(_e)
    _s.set(0.8 + rand() * 0.5, h, 0.8 + rand() * 0.5)
    _m.compose(_p, _q, _s)
    grass.setMatrixAt(placed, _m)
    _c.copy(gA).lerp(gB, rand())
    if (dw < WATERHOLE.radius * 2.2) _c.lerp(gC, 0.7)
    grass.setColorAt(placed, _c)
    placed++
  }
  grass.count = placed
  grass.instanceMatrix.needsUpdate = true
  if (grass.instanceColor) grass.instanceColor.needsUpdate = true
  group.add(grass)
  return { mesh: grass, uniforms }
}

export function createProps(): Props {
  const rand = mulberry32(WORLD_SEED + 101)
  const group = new THREE.Group()
  group.name = 'props'

  const colliders: Collider[] = []
  createAcacias(rand, group, colliders)
  createRocks(rand, group, colliders)
  createWater(group)
  createMountains(rand, group)
  const grass = createGrass(rand, group)

  return {
    group,
    colliders,
    setSway: (amount) => {
      grass.uniforms.uSway.value = amount
    },
    update: (time) => {
      grass.uniforms.uTime.value = time
    },
  }
}
