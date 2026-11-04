import * as THREE from 'three'
import { toonMaterial } from '../render/toon'
import { terrainHeight } from './terrain'
import type { Collider } from './props'

/**
 * 風景の生き物。鳥の群れと、遠くの平原で草を食む生き物。
 * 実在の個体には見せず、名前・プロフィール・出会いの対象にはしない（地図にも出さない）。
 * すべてコードで生成する。
 */
export interface Fauna {
  group: THREE.Group
  update: (time: number, dt: number) => void
  setReduceMotion: (on: boolean) => void
}

interface Bird {
  mesh: THREE.Mesh
  phase: number
  radius: number
  speed: number
  height: number
}

interface Grazer {
  head: THREE.Group
  phase: number
}

const FLOCK_CENTER = { x: 22, z: -8 }
const HERD: ReadonlyArray<{ x: number; z: number; yaw: number; scale: number }> = [
  { x: -66, z: 34, yaw: 0.6, scale: 1.0 },
  { x: -58, z: 44, yaw: 2.4, scale: 0.9 },
  { x: -72, z: 48, yaw: -1.2, scale: 1.05 },
  { x: -52, z: 54, yaw: 1.9, scale: 0.85 },
]

function createBirdGeometry(): THREE.BufferGeometry {
  // V 字の板。中央がくぼんだ 2 枚の翼
  const geo = new THREE.BufferGeometry()
  const v = new Float32Array([
    -1.3, 0.25, 0.4, 0, 0, -0.25, 0, 0, 0.35,
    1.3, 0.25, 0.4, 0, 0, 0.35, 0, 0, -0.25,
  ])
  geo.setAttribute('position', new THREE.BufferAttribute(v, 3))
  geo.computeVertexNormals()
  return geo
}

function createGrazer(coat: THREE.Material, belly: THREE.Material, horn: THREE.Material): { group: THREE.Group; head: THREE.Group } {
  const group = new THREE.Group()
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.7, 0.55), coat)
  body.position.y = 0.95
  body.castShadow = true
  group.add(body)
  const under = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.25, 0.45), belly)
  under.position.set(0, 0.62, 0)
  group.add(under)
  for (const [x, z] of [[-0.5, -0.18], [-0.5, 0.18], [0.5, -0.18], [0.5, 0.18]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.7, 0.14), coat)
    leg.position.set(x, 0.35, z)
    leg.castShadow = true
    group.add(leg)
  }
  const head = new THREE.Group()
  head.position.set(0.72, 1.18, 0)
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.62, 0.26), coat)
  neck.position.set(0.1, 0.22, 0)
  neck.rotation.z = -0.45
  neck.castShadow = true
  head.add(neck)
  const face = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.26, 0.24), coat)
  face.position.set(0.42, 0.5, 0)
  face.castShadow = true
  head.add(face)
  for (const z of [-0.08, 0.08]) {
    const h = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.3, 5), horn)
    h.position.set(0.3, 0.75, z)
    h.rotation.z = -0.2
    head.add(h)
  }
  group.add(head)
  return { group, head }
}

export function createFauna(options: { mobile: boolean; colliders: Collider[] }): Fauna {
  const group = new THREE.Group()
  group.name = 'fauna'
  let reduceMotion = false

  // 鳥: 平原の上を旋回する群れ
  const birdGeo = createBirdGeometry()
  const birdMat = new THREE.MeshBasicMaterial({ color: '#3a2f28', side: THREE.DoubleSide })
  const birds: Bird[] = []
  const n = options.mobile ? 6 : 9
  for (let i = 0; i < n; i++) {
    const mesh = new THREE.Mesh(birdGeo, birdMat)
    mesh.scale.setScalar(0.9 + (i % 3) * 0.15)
    group.add(mesh)
    birds.push({ mesh, phase: i * 0.7, radius: 34 + i * 1.6, speed: 0.34 + (i % 3) * 0.03, height: 27 + i * 0.6 })
  }

  // 草を食む生き物: 遠くの平原に数頭
  const coat = toonMaterial({ color: '#c9a26a' })
  const belly = toonMaterial({ color: '#efe0c2' })
  const horn = toonMaterial({ color: '#5a4632' })
  const grazers: Grazer[] = []
  HERD.forEach((h, i) => {
    const g = createGrazer(coat, belly, horn)
    g.group.position.set(h.x, terrainHeight(h.x, h.z), h.z)
    g.group.rotation.y = h.yaw
    g.group.scale.setScalar(h.scale)
    group.add(g.group)
    options.colliders.push({ x: h.x, z: h.z, r: 0.9 * h.scale })
    grazers.push({ head: g.head, phase: i * 1.7 })
  })

  const placeBird = (b: Bird, time: number) => {
    const a = time * b.speed + b.phase
    b.mesh.position.set(
      FLOCK_CENTER.x + Math.cos(a) * b.radius,
      b.height + Math.sin(time * 1.3 + b.phase) * 0.8,
      FLOCK_CENTER.z + Math.sin(a) * b.radius,
    )
    b.mesh.rotation.set(0, -a, 0)
    // 羽ばたき: 翼の傾き
    b.mesh.rotation.z = reduceMotion ? 0 : Math.sin(time * 9 + b.phase) * 0.35
  }
  birds.forEach((b) => placeBird(b, 0))

  return {
    group,
    update: (time) => {
      if (reduceMotion) return
      for (const b of birds) placeBird(b, time)
      for (const g of grazers) {
        // 時々うつむいて草を食む
        const s = Math.sin(time * 0.6 + g.phase)
        g.head.rotation.z = s > 0.55 ? -((s - 0.55) / 0.45) * 0.9 : 0
      }
    },
    setReduceMotion: (on) => {
      reduceMotion = on
      if (on) birds.forEach((b) => placeBird(b, 0))
    },
  }
}
