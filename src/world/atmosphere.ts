import * as THREE from 'three'
import { mulberry32 } from './noise'
import { WORLD_SEED } from './layout'

export interface Atmosphere {
  group: THREE.Group
  /** 動きをへらす: 光の粒を消し、鳥は羽ばたきを止めてゆっくり滑空だけにする */
  setReduceMotion: (on: boolean) => void
  update: (time: number, dt: number, cameraPosition: THREE.Vector3) => void
}

const MOTE_COUNT = 360
const MOTE_RANGE = 26
const BIRD_COUNT = 9

/** 丸くぼやけた粒のテクスチャを、その場で描く（画像ファイルは使わない） */
function createMoteTexture(): THREE.Texture | null {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.35, 'rgba(255,255,255,0.6)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** 逆光に浮かぶ金色の粒。カメラのまわりに漂わせ、範囲を出たら反対側へ戻す */
function createMotes(rand: () => number): { points: THREE.Points; velocities: Float32Array } {
  const positions = new Float32Array(MOTE_COUNT * 3)
  const velocities = new Float32Array(MOTE_COUNT * 3)
  for (let i = 0; i < MOTE_COUNT; i++) {
    positions[i * 3] = (rand() - 0.5) * MOTE_RANGE * 2
    positions[i * 3 + 1] = rand() * 7 + 0.3
    positions[i * 3 + 2] = (rand() - 0.5) * MOTE_RANGE * 2
    velocities[i * 3] = (rand() - 0.5) * 0.5
    velocities[i * 3 + 1] = rand() * 0.18 + 0.04
    velocities[i * 3 + 2] = (rand() - 0.5) * 0.5
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const mat = new THREE.PointsMaterial({
    color: '#ffe2a8',
    map: createMoteTexture(),
    size: 0.12,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const points = new THREE.Points(geo, mat)
  points.frustumCulled = false
  return { points, velocities }
}

/** 遠くをゆっくり回る鳥の影。2枚の三角形で V の字 */
function createBirds(): THREE.InstancedMesh {
  const verts = new Float32Array([
    0, 0, 0.35, -1.1, 0.25, -0.3, 0, 0, -0.25,
    0, 0, 0.35, 0, 0, -0.25, 1.1, 0.25, -0.3,
    0, 0, 0.35, 0, 0, -0.25, -1.1, 0.25, -0.3,
    0, 0, 0.35, 1.1, 0.25, -0.3, 0, 0, -0.25,
  ])
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3))
  const mat = new THREE.MeshBasicMaterial({ color: '#4a3220', fog: true })
  const birds = new THREE.InstancedMesh(geo, mat, BIRD_COUNT)
  birds.frustumCulled = false
  return birds
}

export function createAtmosphere(): Atmosphere {
  const rand = mulberry32(WORLD_SEED + 909)
  const group = new THREE.Group()
  group.name = 'atmosphere'

  const motes = createMotes(rand)
  group.add(motes.points)

  const birds = createBirds()
  group.add(birds)
  // 群れの中心。高く、少し離れた空を大きく回る
  const flock = { cx: 20, cz: -30, radius: 70, height: 46, speed: 0.045 }
  const birdOffset = Array.from({ length: BIRD_COUNT }, (_, i) => ({
    angle: i * 0.11 + rand() * 0.04,
    dr: (rand() - 0.5) * 10,
    dy: (rand() - 0.5) * 6,
    phase: rand() * Math.PI * 2,
    size: 0.9 + rand() * 0.5,
  }))

  let reduceMotion = false
  const _m = new THREE.Matrix4()
  const _p = new THREE.Vector3()
  const _q = new THREE.Quaternion()
  const _s = new THREE.Vector3()
  const _e = new THREE.Euler()

  const update = (time: number, dt: number, cam: THREE.Vector3) => {
    // 光の粒
    if (!reduceMotion) {
      const pos = motes.points.geometry.attributes.position as THREE.BufferAttribute
      const arr = pos.array as Float32Array
      const v = motes.velocities
      for (let i = 0; i < MOTE_COUNT; i++) {
        const ix = i * 3
        arr[ix] += (v[ix] + Math.sin(time * 0.7 + i) * 0.12) * dt
        arr[ix + 1] += v[ix + 1] * dt
        arr[ix + 2] += (v[ix + 2] + Math.cos(time * 0.6 + i * 1.3) * 0.12) * dt
        // カメラ中心の箱の外へ出たら反対側へ
        const relX = arr[ix] - cam.x
        const relZ = arr[ix + 2] - cam.z
        if (relX > MOTE_RANGE) arr[ix] -= MOTE_RANGE * 2
        else if (relX < -MOTE_RANGE) arr[ix] += MOTE_RANGE * 2
        if (relZ > MOTE_RANGE) arr[ix + 2] -= MOTE_RANGE * 2
        else if (relZ < -MOTE_RANGE) arr[ix + 2] += MOTE_RANGE * 2
        const relY = arr[ix + 1] - cam.y
        if (relY > 6) arr[ix + 1] = cam.y - 3
        else if (relY < -4) arr[ix + 1] = cam.y + 5
        // カメラの目の前に来た粒は大きな玉に見えるので、遠くへ送り直す
        if (relX * relX + relY * relY + relZ * relZ < 2.5 * 2.5) {
          arr[ix] = cam.x + (rand() - 0.5) * MOTE_RANGE * 2
          arr[ix + 2] = cam.z + (rand() - 0.5) * MOTE_RANGE * 2
        }
      }
      pos.needsUpdate = true
    }

    // 鳥
    const t = time * flock.speed
    for (let i = 0; i < BIRD_COUNT; i++) {
      const b = birdOffset[i]
      const a = t + b.angle
      const r = flock.radius + b.dr
      _p.set(flock.cx + Math.cos(a) * r, flock.height + b.dy + Math.sin(time * 0.3 + b.phase) * 1.5, flock.cz + Math.sin(a) * r)
      // 進行方向を向く（円の接線）
      _e.set(0, -a, 0)
      _q.setFromEuler(_e)
      const flap = reduceMotion ? 0.35 : Math.sin(time * 6 + b.phase)
      _s.set(b.size, b.size * (0.6 + flap * 0.5), b.size)
      _m.compose(_p, _q, _s)
      birds.setMatrixAt(i, _m)
    }
    birds.instanceMatrix.needsUpdate = true
  }

  return {
    group,
    setReduceMotion: (on) => {
      reduceMotion = on
      motes.points.visible = !on
    },
    update,
  }
}
