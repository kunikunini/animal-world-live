import * as THREE from 'three'
import { mulberry32 } from './noise'
import { WORLD_SEED } from './layout'
import { OUTER_REGIONS } from './regions'
import type { BiomeWeights } from './regions'
import { terrainHeight } from './terrain'
import { NO_REFLECT_LAYER } from './props'
import { createMoteTexture } from './atmosphere'

export interface Weather {
  group: THREE.Group
  /** 動きをへらす: 雪は消し、もやは流さない */
  setReduceMotion: (on: boolean) => void
  update: (time: number, dt: number, cameraPosition: THREE.Vector3, weights: BiomeWeights) => void
}

const SNOW_RANGE = 22
const MIST_COUNT = 8

/**
 * ワールドごとの空気の動き。北の世界は雪が舞い、ジャングルは地面近くに白いもやが流れる。
 * 濃さはいる場所の重み（biomeAt）に合わせるので、峠を越えるとなめらかに現れて消える。
 */
export function createWeather(options: { mobile: boolean }): Weather {
  const rand = mulberry32(WORLD_SEED + 1207)
  const group = new THREE.Group()
  group.name = 'weather'
  const texture = createMoteTexture()

  // 雪: カメラのまわりの箱の中を落ちる粒。箱の外へ出たら反対側へ戻す
  const snowCount = options.mobile ? 320 : 520
  const snowPos = new Float32Array(snowCount * 3)
  const snowVel = new Float32Array(snowCount * 2) // 落ちる速さ、横揺れの位相
  for (let i = 0; i < snowCount; i++) {
    snowPos[i * 3] = (rand() - 0.5) * SNOW_RANGE * 2
    snowPos[i * 3 + 1] = rand() * 14 - 4
    snowPos[i * 3 + 2] = (rand() - 0.5) * SNOW_RANGE * 2
    snowVel[i * 2] = 1.0 + rand() * 0.9
    snowVel[i * 2 + 1] = rand() * Math.PI * 2
  }
  const snowGeo = new THREE.BufferGeometry()
  snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3))
  const snowMat = new THREE.PointsMaterial({
    color: '#ffffff',
    map: texture,
    size: 0.3,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    fog: false,
  })
  const snow = new THREE.Points(snowGeo, snowMat)
  snow.frustumCulled = false
  snow.visible = false
  snow.layers.set(NO_REFLECT_LAYER)
  group.add(snow)

  // もや: ジャングルの地面近くに置いた、横に長い白い板（カメラの方を向く）。ゆっくり +x へ流れる
  const jungle = OUTER_REGIONS[1]
  const mistMat = new THREE.SpriteMaterial({
    map: texture,
    color: '#e6efe8',
    transparent: true,
    opacity: 0,
    depthWrite: false,
    fog: true,
  })
  const mists = Array.from({ length: MIST_COUNT }, (_, i) => {
    const a = (i / MIST_COUNT) * Math.PI * 2 + rand() * 0.6
    const r = 18 + rand() * 70
    const sprite = new THREE.Sprite(mistMat)
    const w = 22 + rand() * 14
    sprite.scale.set(w, w * 0.32, 1)
    sprite.layers.set(NO_REFLECT_LAYER)
    group.add(sprite)
    return {
      sprite,
      x: jungle.x + Math.cos(a) * r,
      z: jungle.z + Math.sin(a) * r,
      lift: 1.4 + rand() * 1.2,
      speed: 0.25 + rand() * 0.2,
      phase: rand() * Math.PI * 2,
    }
  })
  const MIST_WRAP = 95
  const placeMist = (time: number) => {
    for (const m of mists) {
      m.sprite.position.set(m.x, terrainHeight(m.x, m.z) + m.lift + Math.sin(time * 0.3 + m.phase) * 0.3, m.z)
    }
  }
  placeMist(0)

  let reduceMotion = false
  const update = (time: number, dt: number, cam: THREE.Vector3, weights: BiomeWeights) => {
    // 雪
    const n = weights.north
    const showSnow = !reduceMotion && n > 0.01
    snow.visible = showSnow
    if (showSnow) {
      snowMat.opacity = 0.85 * n
      const arr = snowGeo.attributes.position.array as Float32Array
      for (let i = 0; i < snowCount; i++) {
        const ix = i * 3
        const ph = snowVel[i * 2 + 1]
        arr[ix] += Math.sin(time * 0.8 + ph) * 0.35 * dt
        arr[ix + 1] -= snowVel[i * 2] * dt
        arr[ix + 2] += Math.cos(time * 0.7 + ph) * 0.35 * dt
        const relX = arr[ix] - cam.x
        const relZ = arr[ix + 2] - cam.z
        if (relX > SNOW_RANGE) arr[ix] -= SNOW_RANGE * 2
        else if (relX < -SNOW_RANGE) arr[ix] += SNOW_RANGE * 2
        if (relZ > SNOW_RANGE) arr[ix + 2] -= SNOW_RANGE * 2
        else if (relZ < -SNOW_RANGE) arr[ix + 2] += SNOW_RANGE * 2
        const relY = arr[ix + 1] - cam.y
        if (relY < -5) arr[ix + 1] = cam.y + 10
        else if (relY > 11) arr[ix + 1] = cam.y - 4
      }
      ;(snowGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true
    }

    // もや
    const j = weights.jungle
    const showMist = j > 0.01
    for (const m of mists) m.sprite.visible = showMist
    if (showMist) {
      mistMat.opacity = 0.16 * j
      if (!reduceMotion) {
        for (const m of mists) {
          m.x += m.speed * dt
          if (m.x > jungle.x + MIST_WRAP) m.x = jungle.x - MIST_WRAP
        }
        placeMist(time)
      }
    }
  }

  return {
    group,
    setReduceMotion: (on) => {
      reduceMotion = on
      if (on) snow.visible = false
    },
    update,
  }
}
