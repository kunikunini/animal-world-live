import * as THREE from 'three'
import { mulberry32 } from './noise'
import { WORLD_SEED } from './layout'
import { toonMaterial } from '../render/toon'

export interface Clouds {
  group: THREE.Group
  update: (dt: number) => void
}

/**
 * 低ポリの雲。平たい球を数個束ねた塊をトゥーンで白く塗り、空をゆっくり流す。
 */
export function createClouds(): Clouds {
  const rand = mulberry32(WORLD_SEED + 505)
  const group = new THREE.Group()
  group.name = 'clouds'

  const CLUSTERS = 11
  const BLOBS = 7
  const geo = new THREE.SphereGeometry(1, 10, 7)
  const mat = toonMaterial({ color: '#ffffff' })
  const mesh = new THREE.InstancedMesh(geo, mat, CLUSTERS * BLOBS)
  mesh.frustumCulled = false

  const clusters = Array.from({ length: CLUSTERS }, (_, i) => {
    const a = (i / CLUSTERS) * Math.PI * 2 + rand() * 0.5
    const r = 170 + rand() * 150
    return {
      x: Math.cos(a) * r,
      y: 52 + rand() * 40,
      z: Math.sin(a) * r,
      scale: 14 + rand() * 16,
      speed: 0.6 + rand() * 0.6,
      blobs: Array.from({ length: BLOBS }, (_, b) => ({
        dx: (b - BLOBS / 2) * 0.55 + (rand() - 0.5) * 0.4,
        dy: (rand() - 0.3) * 0.25,
        dz: (rand() - 0.5) * 0.5,
        s: 0.55 + rand() * 0.5 - Math.abs(b - BLOBS / 2) * 0.06,
      })),
    }
  })

  const _m = new THREE.Matrix4()
  const _p = new THREE.Vector3()
  const _q = new THREE.Quaternion()
  const _s = new THREE.Vector3()
  const _c = new THREE.Color()
  const top = new THREE.Color('#ffffff')
  const bottom = new THREE.Color('#dfe6f5')

  const write = () => {
    clusters.forEach((c, ci) => {
      c.blobs.forEach((b, bi) => {
        _p.set(c.x + b.dx * c.scale, c.y + b.dy * c.scale, c.z + b.dz * c.scale)
        _s.set(b.s * c.scale, b.s * c.scale * 0.55, b.s * c.scale * 0.8)
        _m.compose(_p, _q, _s)
        const idx = ci * BLOBS + bi
        mesh.setMatrixAt(idx, _m)
        _c.copy(bottom).lerp(top, Math.min(1, Math.max(0, b.dy * 2 + 0.6)))
        mesh.setColorAt(idx, _c)
      })
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }
  write()
  group.add(mesh)

  return {
    group,
    update: (dt) => {
      for (const c of clusters) {
        c.x += c.speed * dt
        if (c.x > 320) c.x = -320
      }
      write()
    },
  }
}
