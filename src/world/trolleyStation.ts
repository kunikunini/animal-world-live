import * as THREE from 'three'
import type { Collider } from './props'
import { terrainHeight } from './terrain'
import { toonMaterial } from '../render/toon'
import { getLang, onLangChange } from '../ui/i18n'
import { TROLLEY_REACH, TROLLEY_ROUTES, type TrolleyStation } from '../trolley/stations'

/**
 * トロッコの駅（ワールドの側）。山のすそのトンネルの口・木の枠・線路・トロッコ・行き先の看板。
 * トロッコの前に立つと「トロッコで ○○へ」が出る（src/ui/trolleyGate.ts）。乗ると、2D の坑道のモード（src/trolley/game.ts）で起動し直す。
 * 駅のまわり（半径 9m と、ワールドの内側へ 14m の通り道）の木・岩・草むらはどける（乱数の並びは変えず、大きさ 0 にする）。
 */
const WORLD_NAME: Record<string, { ja: string; en: string }> = {
  water: { ja: '水の世界', en: 'Water World' },
  sky: { ja: '空の世界', en: 'Sky World' },
}

export interface StationHit {
  route: string
  from: TrolleyStation
  to: TrolleyStation
}

/** 駅のまわりで、物を置かない所か */
function stationClears(s: TrolleyStation, x: number, z: number): boolean {
  const dx = x - s.x
  const dz = z - s.z
  if (Math.hypot(dx, dz) < 9) return true
  // ワールドの内側（トンネルと逆）へ 14m、幅 7m
  const back = -(dx * Math.sin(s.out) + dz * Math.cos(s.out))
  const side = dx * Math.cos(s.out) - dz * Math.sin(s.out)
  return back > 0 && back < 14 && Math.abs(side) < 3.5
}

const _m = new THREE.Matrix4()
const _p = new THREE.Vector3()

/** 駅のまわりの木・岩・草（InstancedMesh の 1 本ずつ）と、その当たり判定をどける */
function clearAround(groups: THREE.Object3D[], colliders: Collider[], stations: TrolleyStation[]): void {
  const hit = (x: number, z: number) => stations.some((s) => stationClears(s, x, z))
  for (const g of groups) {
    g.traverse((o) => {
      const m = o as THREE.InstancedMesh
      if (!m.isInstancedMesh) return
      let changed = false
      for (let i = 0; i < m.count; i++) {
        m.getMatrixAt(i, _m)
        _p.setFromMatrixPosition(_m)
        if (!hit(_p.x, _p.z)) continue
        _m.scale(_p.set(0, 0, 0))
        m.setMatrixAt(i, _m)
        changed = true
      }
      if (changed) {
        m.instanceMatrix.needsUpdate = true
        m.computeBoundingSphere()
      }
    })
  }
  for (let i = colliders.length - 1; i >= 0; i--) if (hit(colliders[i].x, colliders[i].z)) colliders.splice(i, 1)
}

/** 行き先の看板の字（言語を切り替えたら描き直す） */
function signTexture(to: string): { tex: THREE.CanvasTexture; paint: () => void } {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 256
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  const paint = () => {
    const ctx = c.getContext('2d')
    if (!ctx) return
    const lang = getLang()
    ctx.fillStyle = '#7a4e2a'
    ctx.fillRect(0, 0, 512, 256)
    // 木目
    ctx.strokeStyle = 'rgba(60,34,16,0.35)'
    ctx.lineWidth = 3
    for (let y = 20; y < 256; y += 36) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.bezierCurveTo(160, y + 8, 340, y - 8, 512, y + 4)
      ctx.stroke()
    }
    ctx.strokeStyle = '#4a2c14'
    ctx.lineWidth = 14
    ctx.strokeRect(7, 7, 498, 242)
    ctx.fillStyle = '#fff6e0'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `900 ${lang === 'en' ? 52 : 60}px 'Hiragino Maru Gothic ProN', 'Hiragino Sans', 'Noto Sans JP', sans-serif`
    ctx.fillText(lang === 'en' ? 'MINE CART' : 'トロッコ', 256, 84)
    ctx.font = `900 ${lang === 'en' ? 44 : 50}px 'Hiragino Maru Gothic ProN', 'Hiragino Sans', 'Noto Sans JP', sans-serif`
    ctx.fillStyle = '#ffd966'
    ctx.fillText(`${WORLD_NAME[to][lang]} ➜`, 256, 178)
    tex.needsUpdate = true
  }
  paint()
  return { tex, paint }
}

function buildStation(s: TrolleyStation, to: TrolleyStation, colliders: Collider[], mobile: boolean): THREE.Group {
  const g = new THREE.Group()
  g.name = `trolley-station-${s.region}`
  // 床の高さ: 線路の範囲でいちばん高い地面（線路が埋まらないように）
  let base = -Infinity
  const fx = Math.sin(s.out)
  const fz = Math.cos(s.out)
  for (let d = -4; d <= 6; d += 1) {
    for (const w of [-1.2, 0, 1.2]) base = Math.max(base, terrainHeight(s.x + fx * d + fz * w, s.z + fz * d - fx * w))
  }
  g.position.set(s.x, base, s.z)
  g.rotation.y = s.out

  const rock = toonMaterial({ color: s.region === 'sky' ? '#9a9cb2' : '#8f8a7e' })
  const rockDark = toonMaterial({ color: s.region === 'sky' ? '#7a7c94' : '#6f6a60' })
  const wood = toonMaterial({ color: '#8a5a32' })
  const woodDark = toonMaterial({ color: '#5e3a1e' })
  const iron = toonMaterial({ color: '#4a4f58' })
  const rust = toonMaterial({ color: '#b5643a' })
  const rustDark = toonMaterial({ color: '#7e3f22' })
  const hole = new THREE.MeshBasicMaterial({ color: '#0d0907' })
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0) => {
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(x, y, z)
    mesh.rotation.set(rx, ry, rz)
    mesh.castShadow = !mobile
    g.add(mesh)
    return mesh
  }

  // 山のすその岩（トンネルの口のまわり）。地面の下まで埋める
  const rockGeo = new THREE.DodecahedronGeometry(1, 0)
  const lumps: Array<[number, number, number, number, number, number]> = [
    [0, 2.6, 8.6, 5.6, 4.6, 4.2],
    [-4.2, 1.6, 7.2, 3.4, 3.4, 3.2],
    [4.4, 1.8, 7.4, 3.6, 3.6, 3.4],
    [-2.6, 4.6, 8.4, 2.8, 2.4, 2.6],
    [2.8, 4.9, 8.8, 2.9, 2.6, 2.7],
    [0, 6.4, 9.6, 3.2, 2.2, 3],
    [-6.6, 0.6, 6.4, 2.2, 2.2, 2.4],
    [6.8, 0.7, 6.6, 2.3, 2.2, 2.4],
  ]
  lumps.forEach(([x, y, z, sx, sy, sz], i) => {
    const m = add(rockGeo, i % 3 === 0 ? rockDark : rock, x, y, z, i * 0.9, i * 0.4)
    m.scale.set(sx, sy, sz)
  })
  // トンネルの口（暗い穴。アーチの形）
  const arch = new THREE.Shape()
  arch.moveTo(-1.75, -0.2)
  arch.lineTo(-1.75, 2.3)
  arch.absarc(0, 2.3, 1.75, Math.PI, 0, true)
  arch.lineTo(1.75, -0.2)
  arch.closePath()
  const archGeo = new THREE.ShapeGeometry(arch, 10)
  const mouth = add(archGeo, hole, 0, 0, 4.75, Math.PI)
  mouth.castShadow = false
  // 奥の暗さ（穴の中の筒）
  const tube = add(new THREE.CylinderGeometry(1.75, 1.75, 3.2, 14, 1, true, 0, Math.PI), hole, 0, 2.3, 6.3, 0, Math.PI / 2, Math.PI / 2)
  tube.castShadow = false
  // 木の枠（柱 2 本と梁、梁の上に小さな屋根）
  const post = new THREE.BoxGeometry(0.42, 4.4, 0.42)
  add(post, wood, -2.05, 2.1, 4.5)
  add(post, wood, 2.05, 2.1, 4.5)
  add(new THREE.BoxGeometry(5, 0.5, 0.55), woodDark, 0, 4.35, 4.5)
  add(new THREE.BoxGeometry(0.3, 1.4, 0.3), wood, -1.4, 3.7, 4.5, 0, 0, 0.75)
  add(new THREE.BoxGeometry(0.3, 1.4, 0.3), wood, 1.4, 3.7, 4.5, 0, 0, -0.75)
  // ランタン（梁から吊るす。ほんのり光る）
  const lampMat = new THREE.MeshBasicMaterial({ color: '#ffd27a' })
  add(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 4), iron, 0, 3.85, 4.15)
  const lamp = add(new THREE.SphereGeometry(0.22, 10, 8), lampMat, 0, 3.5, 4.15)
  lamp.castShadow = false

  // 線路: トロッコの後ろからトンネルの奥まで
  const railLen = 11
  const railZ = 1.6
  const railGeo = new THREE.BoxGeometry(0.1, 0.12, railLen)
  add(railGeo, iron, -0.62, 0.2, railZ)
  add(railGeo, iron, 0.62, 0.2, railZ)
  const ties = Math.floor(railLen / 0.75)
  const tieMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1.8, 0.12, 0.32), woodDark, ties)
  for (let i = 0; i < ties; i++) {
    _m.makeTranslation(0, 0.08, railZ - railLen / 2 + 0.35 + i * 0.75)
    tieMesh.setMatrixAt(i, _m)
  }
  tieMesh.receiveShadow = true
  g.add(tieMesh)
  // 車止め（ワールド側の端）
  add(new THREE.BoxGeometry(1.8, 0.5, 0.3), woodDark, 0, 0.45, railZ - railLen / 2 - 0.1)

  // トロッコ（さびた赤茶の箱に、黄色の帯と鋲）
  const cart = new THREE.Group()
  cart.position.set(0, 0.32, 0)
  g.add(cart)
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.95, 2.1), rust)
  box.position.y = 0.72
  const rim = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.14, 2.24), rustDark)
  rim.position.y = 1.22
  const band = new THREE.Mesh(new THREE.BoxGeometry(1.64, 0.12, 2.14), toonMaterial({ color: '#f2c14a' }))
  band.position.y = 0.55
  const inside = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.1, 1.86), toonMaterial({ color: '#3a2214' }))
  inside.position.y = 1.2
  cart.add(box, rim, band, inside)
  const wheelGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.14, 12)
  wheelGeo.rotateZ(Math.PI / 2)
  for (const wx of [-0.72, 0.72]) {
    for (const wz of [-0.6, 0.6]) {
      const w = new THREE.Mesh(wheelGeo, iron)
      w.position.set(wx, 0.14, wz)
      cart.add(w)
    }
  }
  cart.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = !mobile
  })

  // 行き先の看板（トロッコの横。ワールドの方を向く）
  const sign = signTexture(to.region)
  onLangChange(sign.paint)
  add(new THREE.BoxGeometry(0.2, 2.2, 0.2), wood, 2.3, 1.1, -1.2)
  const board = add(new THREE.PlaneGeometry(1.9, 0.95), new THREE.MeshBasicMaterial({ map: sign.tex }), 2.3, 2.1, -1.32, Math.PI)
  board.castShadow = false
  add(new THREE.BoxGeometry(2.0, 1.05, 0.08), woodDark, 2.3, 2.1, -1.24)

  // 当たり判定（ワールドの座標）
  const toWorld = (lx: number, lz: number) => ({ x: s.x + lx * Math.cos(s.out) + lz * fx, z: s.z - lx * Math.sin(s.out) + lz * fz })
  colliders.push({ ...toWorld(0, 8.4), r: 5 })
  colliders.push({ ...toWorld(-4.4, 7.2), r: 3 })
  colliders.push({ ...toWorld(4.6, 7.4), r: 3 })
  colliders.push({ ...toWorld(-2.05, 4.5), r: 0.4 })
  colliders.push({ ...toWorld(2.05, 4.5), r: 0.4 })
  colliders.push({ ...toWorld(0, 0), r: 1.1 })
  colliders.push({ ...toWorld(2.3, -1.2), r: 0.3 })
  return g
}

export function createTrolleyStations(scene: THREE.Object3D, clearIn: THREE.Object3D[], colliders: Collider[], mobile: boolean): void {
  const all = TROLLEY_ROUTES.flatMap((r) => [r.a, r.b])
  clearAround(clearIn, colliders, all)
  for (const r of TROLLEY_ROUTES) {
    scene.add(buildStation(r.a, r.b, colliders, mobile))
    scene.add(buildStation(r.b, r.a, colliders, mobile))
  }
}

/** いま立っている所が、どこかの駅のトロッコの前か（前＝ワールドの内側。トンネルの側は岩でふさがっている） */
export function nearStation(x: number, z: number): StationHit | null {
  for (const r of TROLLEY_ROUTES) {
    for (const [from, to] of [
      [r.a, r.b],
      [r.b, r.a],
    ] as const) {
      // トロッコの 2.5m 手前を中心に測る（トロッコの当たりの外に立った時に届く）
      const cx = from.x - Math.sin(from.out) * 2.5
      const cz = from.z - Math.cos(from.out) * 2.5
      if (Math.hypot(x - cx, z - cz) < TROLLEY_REACH) return { route: r.id, from, to }
    }
  }
  return null
}
