import * as THREE from 'three'
import { mulberry32 } from './noise'
import { WORLD_SEED } from './layout'
import { OUTER_REGIONS } from './regions'
import type { Region, RegionKey } from './regions'
import type { Collider } from './props'
import { terrainHeight } from './terrain'
import { toonMaterial } from '../render/toon'

/**
 * サバンナ以外の 3 つのワールドの置き物。どれも InstancedMesh で、種類ごとに 1〜2 回の描画で済ませる。
 * 北の世界: 雪をかぶったトウヒの森と雪の岩。ジャングル: 背の高い木、ヤシ、シダ、大木の目印。
 * 南半球: 白い幹のユーカリ、赤い岩、とげとげの草むら、赤い一枚岩の目印。
 * 形は様式化した目印で、特定の場所の再現ではない。
 */
export interface BiomeProps {
  group: THREE.Group
}

const _m = new THREE.Matrix4()
const _p = new THREE.Vector3()
const _q = new THREE.Quaternion()
const _s = new THREE.Vector3()
const _e = new THREE.Euler()
const _c = new THREE.Color()

/**
 * ジャングルの「止まり木」: スポットの北東に立つ木と、東へ張り出した横枝。
 * 木の上で暮らす子（ビントロング・キンカジュー・ナマケモノ）はこの枝に置く（residents.ts）
 */
export const JUNGLE_PERCH = { dx: 7, dz: -9, height: 2.7, length: 6.2, radius: 0.24 }

function region(key: RegionKey): Region {
  return OUTER_REGIONS.find((r) => r.key === key) as Region
}

/** 原点からワールドの中心までの道（置き物を避ける帯）からの距離 */
function distToPath(x: number, z: number, r: Region): number {
  const len2 = r.x * r.x + r.z * r.z
  const t = Math.max(0, Math.min(1, (x * r.x + z * r.z) / len2))
  return Math.hypot(x - r.x * t, z - r.z * t)
}

/** ワールドの中に置き場所を散らす。spot（中心）のまわりと道はあける */
function scatter(rand: () => number, r: Region, count: number, opts: { min?: number; max: number; clearing: number; path: number }): Array<{ x: number; z: number }> {
  const out: Array<{ x: number; z: number }> = []
  let guard = 0
  while (out.length < count && guard++ < count * 20) {
    const a = rand() * Math.PI * 2
    const min = opts.min ?? 0
    const d = Math.sqrt(min * min + rand() * (opts.max * opts.max - min * min))
    const x = r.x + Math.cos(a) * d
    const z = r.z + Math.sin(a) * d
    if (Math.hypot(x - r.x, z - r.z) < opts.clearing) continue
    if (distToPath(x, z, r) < opts.path) continue
    out.push({ x, z })
  }
  return out
}

function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, count: number, shadow = true): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geo, mat, count)
  mesh.castShadow = shadow
  mesh.receiveShadow = true
  return mesh
}

function finish(...meshes: THREE.InstancedMesh[]): void {
  for (const m of meshes) {
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
    m.computeBoundingSphere()
  }
}

/** 北の世界: 雪をかぶったトウヒ（円錐 3 段＋雪の帽子）と、雪の乗った岩 */
function createNorth(rand: () => number, group: THREE.Group, colliders: Collider[], mobile: boolean): void {
  const r = region('north')
  const spots = scatter(rand, r, mobile ? 110 : 160, { max: r.walk + 40, clearing: 14, path: 7 })
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.3, 1, 6)
  trunkGeo.translate(0, 0.5, 0)
  const coneGeo = new THREE.ConeGeometry(1, 1, 8)
  coneGeo.translate(0, 0.5, 0)
  const trunks = instanced(trunkGeo, toonMaterial({ color: '#4d3627' }), spots.length)
  const cones = instanced(coneGeo, toonMaterial(), spots.length * 3)
  const caps = instanced(coneGeo, toonMaterial({ color: '#f3f7fb' }), spots.length * 3, false)
  const greenA = new THREE.Color('#2f5d4a')
  const greenB = new THREE.Color('#3f7258')
  spots.forEach((t, i) => {
    const y = terrainHeight(t.x, t.z)
    const s = 0.8 + rand() * 0.7
    const h = (7 + rand() * 4) * s
    _q.setFromEuler(_e.set(0, rand() * Math.PI * 2, 0))
    _m.compose(_p.set(t.x, y - 0.2, t.z), _q, _s.set(s, h * 0.3, s))
    trunks.setMatrixAt(i, _m)
    _c.copy(greenA).lerp(greenB, rand())
    for (let k = 0; k < 3; k++) {
      const w = (2.4 - k * 0.6) * s
      const ch = h * (0.42 - k * 0.07)
      const cy = y + h * (0.18 + k * 0.24)
      _m.compose(_p.set(t.x, cy, t.z), _q, _s.set(w, ch, w))
      cones.setMatrixAt(i * 3 + k, _m)
      cones.setColorAt(i * 3 + k, _c)
      // 雪の帽子: 同じ円錐を小さく上へずらす
      _m.compose(_p.set(t.x, cy + ch * 0.42, t.z), _q, _s.set(w * 0.62, ch * 0.6, w * 0.62))
      caps.setMatrixAt(i * 3 + k, _m)
    }
    if (Math.hypot(t.x - r.x, t.z - r.z) < r.walk + 3) colliders.push({ x: t.x, z: t.z, r: 0.5 * s })
  })
  finish(trunks, cones, caps)
  group.add(trunks, cones, caps)

  // 雪の乗った岩
  const rocks = scatter(rand, r, 40, { max: r.walk + 20, clearing: 10, path: 6 })
  const rockGeo = new THREE.IcosahedronGeometry(1, 0)
  const rockMesh = instanced(rockGeo, toonMaterial({ color: '#8790a0' }), rocks.length)
  const snowMesh = instanced(rockGeo, toonMaterial({ color: '#f1f6fa' }), rocks.length, false)
  rocks.forEach((p, i) => {
    const s = 0.7 + rand() * 1.8
    const y = terrainHeight(p.x, p.z) - s * 0.3
    _q.setFromEuler(_e.set(rand(), rand() * 3, rand()))
    _m.compose(_p.set(p.x, y, p.z), _q, _s.set(s * 1.3, s * 0.8, s))
    rockMesh.setMatrixAt(i, _m)
    _m.compose(_p.set(p.x, y + s * 0.35, p.z), _q, _s.set(s * 1.15, s * 0.5, s * 0.9))
    snowMesh.setMatrixAt(i, _m)
    if (s > 1.1) colliders.push({ x: p.x, z: p.z, r: s * 0.9 })
  })
  finish(rockMesh, snowMesh)
  group.add(rockMesh, snowMesh)
}

/** ジャングル: 背の高い木（細い幹に濃い緑の玉）、ヤシ、シダ。目印は中心の奥の大木 */
function createJungle(rand: () => number, group: THREE.Group, colliders: Collider[], mobile: boolean): void {
  const r = region('jungle')
  // 広場は広めに: 日は西から差すので、西の高い木の影がスポットまで伸びないように
  const trees = scatter(rand, r, mobile ? 90 : 130, { max: r.walk + 40, clearing: 24, path: 7 })
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.45, 1, 7)
  trunkGeo.translate(0, 0.5, 0)
  const blobGeo = new THREE.IcosahedronGeometry(1, 1)
  const BLOBS = 4
  const trunks = instanced(trunkGeo, toonMaterial({ color: '#5b4330' }), trees.length)
  const blobs = instanced(blobGeo, toonMaterial(), trees.length * BLOBS)
  const leafA = new THREE.Color('#2f6b35')
  const leafB = new THREE.Color('#4f8f3a')
  trees.forEach((t, i) => {
    const y = terrainHeight(t.x, t.z)
    const s = 0.8 + rand() * 0.6
    const h = (11 + rand() * 6) * s
    _q.setFromEuler(_e.set((rand() - 0.5) * 0.1, rand() * Math.PI * 2, (rand() - 0.5) * 0.1))
    _m.compose(_p.set(t.x, y - 0.3, t.z), _q, _s.set(s, h, s))
    trunks.setMatrixAt(i, _m)
    for (let b = 0; b < BLOBS; b++) {
      const a = (b / BLOBS) * Math.PI * 2 + rand()
      const rr = b === 0 ? 0 : 2.2 * s * (0.6 + rand() * 0.5)
      const bs = (b === 0 ? 3.4 : 2.6) * s * (0.85 + rand() * 0.3)
      _m.compose(
        _p.set(t.x + Math.cos(a) * rr, y + h - 0.6 + (rand() - 0.5) * 1.6 * s, t.z + Math.sin(a) * rr),
        _q.setFromEuler(_e.set(0, rand() * 3, 0)),
        _s.set(bs, bs * 0.72, bs),
      )
      blobs.setMatrixAt(i * BLOBS + b, _m)
      blobs.setColorAt(i * BLOBS + b, _c.copy(leafA).lerp(leafB, rand()))
    }
    if (Math.hypot(t.x - r.x, t.z - r.z) < r.walk + 3) colliders.push({ x: t.x, z: t.z, r: 0.55 * s })
  })
  finish(trunks, blobs)
  group.add(trunks, blobs)

  // ヤシ: 少し曲がった幹に、垂れた細長い葉 6 枚
  const palms = scatter(rand, r, mobile ? 30 : 45, { max: r.walk + 10, clearing: 12, path: 6 })
  const leafGeo = new THREE.ConeGeometry(0.5, 4.2, 4)
  leafGeo.translate(0, 2.1, 0)
  leafGeo.rotateX(Math.PI / 2)
  const LEAVES = 6
  const palmTrunks = instanced(trunkGeo, toonMaterial({ color: '#7a5d3e' }), palms.length)
  const palmLeaves = instanced(leafGeo, toonMaterial({ color: '#4c9a45' }), palms.length * LEAVES)
  palms.forEach((t, i) => {
    const y = terrainHeight(t.x, t.z)
    const s = 0.8 + rand() * 0.4
    const h = (6 + rand() * 3) * s
    const lean = 0.12 + rand() * 0.12
    const yaw = rand() * Math.PI * 2
    _q.setFromEuler(_e.set(lean, yaw, 0, 'YXZ'))
    _m.compose(_p.set(t.x, y - 0.2, t.z), _q, _s.set(0.55 * s, h, 0.55 * s))
    palmTrunks.setMatrixAt(i, _m)
    const top = new THREE.Vector3(0, h, 0).applyQuaternion(_q).add(_p)
    for (let k = 0; k < LEAVES; k++) {
      const ly = (k / LEAVES) * Math.PI * 2 + rand() * 0.4
      _q.setFromEuler(_e.set(0.35 + rand() * 0.25, ly, 0, 'YXZ'))
      _m.compose(top, _q, _s.set(s, s, s))
      palmLeaves.setMatrixAt(i * LEAVES + k, _m)
    }
    colliders.push({ x: t.x, z: t.z, r: 0.4 * s })
  })
  finish(palmTrunks, palmLeaves)
  group.add(palmTrunks, palmLeaves)

  // シダ: 地面に広がる低い葉の束（当たり判定なし）
  const ferns = scatter(rand, r, mobile ? 380 : 800, { max: r.walk + 15, clearing: 5, path: 3 })
  const fernGeo = new THREE.ConeGeometry(0.28, 1.6, 3)
  fernGeo.translate(0, 0.8, 0)
  fernGeo.rotateX(1.05)
  const FRONDS = 5
  const fernMesh = instanced(fernGeo, toonMaterial(), ferns.length * FRONDS, false)
  const fernA = new THREE.Color('#3f8a3a')
  const fernB = new THREE.Color('#7ab04a')
  ferns.forEach((f, i) => {
    const y = terrainHeight(f.x, f.z)
    const s = 0.7 + rand() * 0.8
    _c.copy(fernA).lerp(fernB, rand())
    for (let k = 0; k < FRONDS; k++) {
      _q.setFromEuler(_e.set(0, (k / FRONDS) * Math.PI * 2 + rand() * 0.5, 0))
      _m.compose(_p.set(f.x, y, f.z), _q, _s.set(s, s, s))
      fernMesh.setMatrixAt(i * FRONDS + k, _m)
      fernMesh.setColorAt(i * FRONDS + k, _c)
    }
  })
  finish(fernMesh)
  group.add(fernMesh)

  // 止まり木: 縦の幹と、東へ張り出した横枝（枝の先は細く）
  {
    const P = JUNGLE_PERCH
    const px = r.x + P.dx
    const pz = r.z + P.dz
    const py = terrainHeight(px, pz)
    const bark = toonMaterial({ color: '#6b4c33' })
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.5, P.height + 3.5, 9), bark)
    trunk.position.set(px, py + (P.height + 3.5) / 2 - 0.3, pz)
    const branch = new THREE.Mesh(new THREE.CylinderGeometry(P.radius * 0.7, P.radius, P.length, 8), bark)
    branch.rotation.z = Math.PI / 2
    branch.position.set(px + P.length / 2, py + P.height, pz)
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), toonMaterial({ color: '#3b7d3c' }))
    crown.scale.set(3.4, 2.4, 3.4)
    crown.position.set(px - 0.5, py + P.height + 4.2, pz)
    for (const m of [trunk, branch, crown]) {
      m.castShadow = true
      m.receiveShadow = true
      group.add(m)
    }
    colliders.push({ x: px, z: pz, r: 0.6 })
  }

  // 目印の大木: 中心の北西。日は西から差すので、影がスポットにかからない側に置く
  const gx = r.x - 20
  const gz = r.z - 22
  const gy = terrainHeight(gx, gz)
  const giant = new THREE.Group()
  giant.position.set(gx, gy - 0.5, gz)
  const giantTrunk = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 3.2, 26, 10), toonMaterial({ color: '#5a412c' }))
  giantTrunk.position.y = 13
  giantTrunk.castShadow = true
  giant.add(giantTrunk)
  const giantLeaf = toonMaterial({ color: '#2f6f36' })
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2
    const blob = new THREE.Mesh(blobGeo, giantLeaf)
    const rr = k === 0 ? 0 : 7
    blob.position.set(Math.cos(a) * rr, 26 + (k === 0 ? 3 : rand() * 2), Math.sin(a) * rr)
    blob.scale.set(k === 0 ? 10 : 7, k === 0 ? 6.5 : 4.6, k === 0 ? 10 : 7)
    blob.castShadow = true
    giant.add(blob)
  }
  group.add(giant)
  colliders.push({ x: gx, z: gz, r: 3.4 })
}

/** 南半球: 白い幹のユーカリ、赤い岩、とげとげの草むら。目印は奥の赤い一枚岩 */
function createSouth(rand: () => number, group: THREE.Group, colliders: Collider[], mobile: boolean): void {
  const r = region('south')
  const trees = scatter(rand, r, 34, { max: r.walk + 30, clearing: 16, path: 8 })
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.32, 1, 6)
  trunkGeo.translate(0, 0.5, 0)
  const blobGeo = new THREE.IcosahedronGeometry(1, 0)
  const BLOBS = 3
  const trunks = instanced(trunkGeo, toonMaterial({ color: '#e8e0d2' }), trees.length)
  const blobs = instanced(blobGeo, toonMaterial(), trees.length * BLOBS)
  const gumA = new THREE.Color('#6f8a62')
  const gumB = new THREE.Color('#93a777')
  trees.forEach((t, i) => {
    const y = terrainHeight(t.x, t.z)
    const s = 0.8 + rand() * 0.5
    const h = (6 + rand() * 3) * s
    _q.setFromEuler(_e.set((rand() - 0.5) * 0.25, rand() * Math.PI * 2, (rand() - 0.5) * 0.25))
    _m.compose(_p.set(t.x, y - 0.2, t.z), _q, _s.set(s, h, s))
    trunks.setMatrixAt(i, _m)
    const top = new THREE.Vector3(0, h, 0).applyQuaternion(_q).add(_p)
    for (let b = 0; b < BLOBS; b++) {
      const a = (b / BLOBS) * Math.PI * 2 + rand()
      const bs = 1.7 * s * (0.8 + rand() * 0.4)
      _m.compose(
        _p.set(top.x + Math.cos(a) * 1.4 * s, top.y - rand() * 1.2 * s, top.z + Math.sin(a) * 1.4 * s),
        _q.setFromEuler(_e.set(0, rand() * 3, 0)),
        _s.set(bs, bs * 0.6, bs),
      )
      blobs.setMatrixAt(i * BLOBS + b, _m)
      blobs.setColorAt(i * BLOBS + b, _c.copy(gumA).lerp(gumB, rand()))
    }
    if (Math.hypot(t.x - r.x, t.z - r.z) < r.walk + 3) colliders.push({ x: t.x, z: t.z, r: 0.4 * s })
  })
  finish(trunks, blobs)
  group.add(trunks, blobs)

  // 赤い岩
  const rocks = scatter(rand, r, 50, { max: r.walk + 25, clearing: 10, path: 6 })
  const rockMesh = instanced(blobGeo, toonMaterial({ color: '#a8553a' }), rocks.length)
  rocks.forEach((p, i) => {
    const s = 0.5 + rand() * 1.6
    _q.setFromEuler(_e.set(rand(), rand() * 3, rand()))
    _m.compose(_p.set(p.x, terrainHeight(p.x, p.z) - s * 0.3, p.z), _q, _s.set(s * 1.4, s * 0.7, s))
    rockMesh.setMatrixAt(i, _m)
    if (s > 1.1) colliders.push({ x: p.x, z: p.z, r: s })
  })
  finish(rockMesh)
  group.add(rockMesh)

  // とげとげの草むら（スピニフェックス風の丸い株）
  const tufts = scatter(rand, r, mobile ? 300 : 600, { max: r.walk + 15, clearing: 4, path: 3 })
  const tuftGeo = new THREE.IcosahedronGeometry(1, 0)
  const tuftMesh = instanced(tuftGeo, toonMaterial(), tufts.length, false)
  const tuftA = new THREE.Color('#b9a052')
  const tuftB = new THREE.Color('#d2b866')
  tufts.forEach((p, i) => {
    const s = 0.35 + rand() * 0.5
    _q.setFromEuler(_e.set(0, rand() * 3, 0))
    _m.compose(_p.set(p.x, terrainHeight(p.x, p.z), p.z), _q, _s.set(s * 1.3, s * 0.7, s * 1.3))
    tuftMesh.setMatrixAt(i, _m)
    tuftMesh.setColorAt(i, _c.copy(tuftA).lerp(tuftB, rand()))
  })
  finish(tuftMesh)
  group.add(tuftMesh)

  // 目印の赤い一枚岩: 中心の奥（サバンナと反対側）に、横長で角の丸い岩
  const mx = r.x
  const mz = r.z + 62
  const mono = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), toonMaterial({ color: '#a6614a' }))
  mono.scale.set(34, 13, 15)
  mono.position.set(mx, terrainHeight(mx, mz) - 3, mz)
  mono.castShadow = true
  mono.receiveShadow = true
  group.add(mono)
  colliders.push({ x: mx - 20, z: mz, r: 12 }, { x: mx, z: mz, r: 15 }, { x: mx + 20, z: mz, r: 12 })
}

export function createBiomeProps(options: { mobile: boolean; colliders: Collider[] }): BiomeProps {
  const group = new THREE.Group()
  group.name = 'biome-props'
  const rand = mulberry32(WORLD_SEED + 503)
  createNorth(rand, group, options.colliders, options.mobile)
  createJungle(rand, group, options.colliders, options.mobile)
  createSouth(rand, group, options.colliders, options.mobile)
  return { group }
}
