import * as THREE from 'three'
import { mulberry32 } from './noise'
import { WORLD_SEED } from './layout'
import { OUTER_REGIONS } from './regions'
import type { RegionKey } from './regions'
import { toonMaterial } from '../render/toon'

export interface Clouds {
  group: THREE.Group
  /** 動きをへらす: 雲の流れを止める */
  setReduceMotion: (on: boolean) => void
  update: (dt: number) => void
}

interface CloudWorld {
  key: RegionKey
  cx: number
  cz: number
  count: number
  /** 中心からの距離（m） */
  rMin: number
  rMax: number
  /** 高さ（m） */
  yMin: number
  yMax: number
  /** 塊の大きさ */
  sMin: number
  sMax: number
  /** 流れる速さ（m/s）。+x へ流れ、wrap を越えたら反対側へ戻る */
  vMin: number
  vMax: number
  wrap: number
  /** 上面と下面の色（雲の重さ） */
  top: string
  bottom: string
}

/**
 * ワールドごとの雲。サバンナは今までと同じ（乱数の順番も同じなので、見た目は変わらない）。
 * 北の世界: 灰白の重い雲がゆっくり。ジャングル: 高くそびえる白い雲。南半球: 小さな雲が速く流れる。
 * 水の世界: 海の上の高い空に、ふくらんだ白い雲が海風で流れる（空撮の高さより上）（いちばん後ろに足したので、ほかの雲の並びは変わらない）。
 */
function cloudWorlds(): CloudWorld[] {
  const north = OUTER_REGIONS[0]
  const jungle = OUTER_REGIONS[1]
  const south = OUTER_REGIONS[2]
  const water = OUTER_REGIONS.find((r) => r.key === 'water') ?? OUTER_REGIONS[3]
  const partner = OUTER_REGIONS.find((r) => r.key === 'partner') ?? OUTER_REGIONS[4]
  const skyWorld = OUTER_REGIONS.find((r) => r.key === 'sky') ?? OUTER_REGIONS[5]
  return [
    { key: 'africa', cx: 0, cz: 0, count: 11, rMin: 170, rMax: 320, yMin: 52, yMax: 92, sMin: 14, sMax: 30, vMin: 0.6, vMax: 1.2, wrap: 320, top: '#ffffff', bottom: '#dfe6f5' },
    { key: 'north', cx: north.x, cz: north.z, count: 9, rMin: 30, rMax: 150, yMin: 58, yMax: 82, sMin: 14, sMax: 24, vMin: 0.25, vMax: 0.45, wrap: 170, top: '#f3f5f9', bottom: '#b7c1cf' },
    { key: 'jungle', cx: jungle.x, cz: jungle.z, count: 7, rMin: 20, rMax: 140, yMin: 75, yMax: 105, sMin: 22, sMax: 36, vMin: 0.35, vMax: 0.55, wrap: 170, top: '#ffffff', bottom: '#d9e3ec' },
    { key: 'south', cx: south.x, cz: south.z, count: 10, rMin: 0, rMax: 150, yMin: 50, yMax: 80, sMin: 10, sMax: 20, vMin: 1.6, vMax: 2.4, wrap: 170, top: '#ffffff', bottom: '#e6ebf4' },
    { key: 'water', cx: water.x + 60, cz: water.z, count: 10, rMin: 30, rMax: 190, yMin: 96, yMax: 124, sMin: 16, sMax: 28, vMin: 0.9, vMax: 1.4, wrap: 200, top: '#ffffff', bottom: '#dbe9f5' },
    { key: 'partner', cx: partner.x, cz: partner.z, count: 9, rMin: 20, rMax: 170, yMin: 96, yMax: 120, sMin: 14, sMax: 24, vMin: 0.5, vMax: 0.8, wrap: 190, top: '#ffffff', bottom: '#e4ecf6' },
    // 空の世界: 大きくふくらんだ白い雲が多め（空撮より高く。地面が 10m 高いぶんも上げる）
    { key: 'sky', cx: skyWorld.x, cz: skyWorld.z, count: 14, rMin: 20, rMax: 190, yMin: 104, yMax: 132, sMin: 18, sMax: 32, vMin: 0.6, vMax: 1.0, wrap: 200, top: '#ffffff', bottom: '#e2eaf8' },
  ]
}

/**
 * 低ポリの雲。平たい球を数個束ねた塊をトゥーンで白く塗り、空をゆっくり流す。
 */
export function createClouds(): Clouds {
  const rand = mulberry32(WORLD_SEED + 505)
  const group = new THREE.Group()
  group.name = 'clouds'

  const BLOBS = 7
  const worlds = cloudWorlds()
  const total = worlds.reduce((n, w) => n + w.count, 0)
  const geo = new THREE.SphereGeometry(1, 10, 7)
  const mat = toonMaterial({ color: '#ffffff' })
  // 下から見上げても灰色に沈まない、白い雲（影の側はうすい青灰色）
  mat.emissive.set('#8d9bb4')
  const mesh = new THREE.InstancedMesh(geo, mat, total * BLOBS)
  mesh.frustumCulled = false

  const clusters = worlds.flatMap((w) =>
    Array.from({ length: w.count }, (_, i) => {
      const a = (i / w.count) * Math.PI * 2 + rand() * 0.5
      const r = w.rMin + rand() * (w.rMax - w.rMin)
      return {
        world: w,
        x: w.cx + Math.cos(a) * r,
        y: w.yMin + rand() * (w.yMax - w.yMin),
        z: w.cz + Math.sin(a) * r,
        scale: w.sMin + rand() * (w.sMax - w.sMin),
        speed: w.vMin + rand() * (w.vMax - w.vMin),
        blobs: Array.from({ length: BLOBS }, (_, b) => ({
          dx: (b - BLOBS / 2) * 0.55 + (rand() - 0.5) * 0.4,
          dy: (rand() - 0.3) * 0.25,
          dz: (rand() - 0.5) * 0.5,
          s: 0.55 + rand() * 0.5 - Math.abs(b - BLOBS / 2) * 0.06,
        })),
      }
    }),
  )

  const _m = new THREE.Matrix4()
  const _p = new THREE.Vector3()
  const _q = new THREE.Quaternion()
  const _s = new THREE.Vector3()
  const _c = new THREE.Color()
  const _top = new THREE.Color()
  const _bottom = new THREE.Color()

  // 色は作る時に一度だけ。位置は流れるたびに書き直す
  const writeColors = () => {
    clusters.forEach((c, ci) => {
      _top.set(c.world.top)
      _bottom.set(c.world.bottom)
      c.blobs.forEach((b, bi) => {
        _c.copy(_bottom).lerp(_top, Math.min(1, Math.max(0, b.dy * 2 + 0.6)))
        mesh.setColorAt(ci * BLOBS + bi, _c)
      })
    })
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }
  const write = () => {
    clusters.forEach((c, ci) => {
      c.blobs.forEach((b, bi) => {
        _p.set(c.x + b.dx * c.scale, c.y + b.dy * c.scale, c.z + b.dz * c.scale)
        _s.set(b.s * c.scale, b.s * c.scale * 0.55, b.s * c.scale * 0.8)
        _m.compose(_p, _q, _s)
        mesh.setMatrixAt(ci * BLOBS + bi, _m)
      })
    })
    mesh.instanceMatrix.needsUpdate = true
  }
  write()
  writeColors()
  group.add(mesh)

  let reduceMotion = false
  return {
    group,
    setReduceMotion: (on) => {
      reduceMotion = on
    },
    update: (dt) => {
      if (reduceMotion) return
      for (const c of clusters) {
        c.x += c.speed * dt
        if (c.x > c.world.cx + c.world.wrap) c.x = c.world.cx - c.world.wrap
      }
      write()
    },
  }
}
