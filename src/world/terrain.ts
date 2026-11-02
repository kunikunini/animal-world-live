import * as THREE from 'three'
import { Simplex2D, lerp, smoothstep } from './noise'
import { KOPJE, TERRAIN_SEGMENTS, TERRAIN_SIZE, WATERHOLE, WORLD_SEED } from './layout'
import { toonMaterial } from '../render/toon'

const simplex = new Simplex2D(WORLD_SEED)
const detail = new Simplex2D(WORLD_SEED + 7)
const patch = new Simplex2D(WORLD_SEED + 31)
const edge = new Simplex2D(WORLD_SEED + 13)

/** 起伏のもとになるノイズ高さ（コピエと水場の加工前） */
function baseHeight(x: number, z: number): number {
  const broad = simplex.fbm(x * 0.011, z * 0.011, 4, 2.1, 0.5) * 3.6
  const fine = detail.fbm(x * 0.05, z * 0.05, 2, 2, 0.5) * 0.35
  return broad + fine
}

const kopjeBase = baseHeight(KOPJE.x, KOPJE.z)
const kopjeTop = kopjeBase + KOPJE.height
const waterBase = baseHeight(WATERHOLE.x, WATERHOLE.z) - WATERHOLE.depth

/** 水面の高さ */
export const WATER_LEVEL = waterBase + 0.75

/** 0..1 を段々にする。段の上は平ら、段の間は急 */
function terrace(w: number, steps: number): number {
  const s = w * steps
  const i = Math.floor(s)
  const f = s - i
  return Math.min(1, (i + smoothstep(0.68, 1, f)) / steps)
}

/**
 * コピエの持ち上げ量（0..1）と「崖らしさ」（0 = 坂、1 = 段々の崖）。
 * 地形と色づけの両方で使う。
 */
export function kopjeShape(x: number, z: number): { w: number; cliff: number; dk: number } {
  const dx = x - KOPJE.x
  const dz = z - KOPJE.z
  let dk = Math.hypot(dx, dz) / KOPJE.radius
  if (dk >= 1.2) return { w: 0, cliff: 0, dk }
  // 縁を少し波打たせて、真円に見せない
  dk += edge.noise(x * 0.06, z * 0.06) * 0.06
  if (dk >= 1) return { w: 0, cliff: 0, dk }
  const w = 1 - smoothstep(KOPJE.plateau, 1, dk)
  // +z（南）が登り口。そこから外れるほど崖になる
  const ang = Math.atan2(dz, dx) - Math.PI / 2
  const south = Math.abs(Math.atan2(Math.sin(ang), Math.cos(ang)))
  const cliff = smoothstep(KOPJE.rampHalfAngle, KOPJE.rampHalfAngle + 0.3, south)
  return { w: lerp(w, terrace(w, KOPJE.terraces), cliff), cliff, dk }
}

/**
 * 地形の高さ関数。地形メッシュ、置き物の足元、プレイヤーの高さがすべてこれを使う。
 */
export function terrainHeight(x: number, z: number): number {
  let h = baseHeight(x, z)

  // コピエ: 中心が平らな台地。南は坂、ほかは地層の崖
  const k = kopjeShape(x, z)
  if (k.w > 0) h = lerp(h, kopjeTop, k.w)

  // 水場: ゆるい窪みにする
  const dw = Math.hypot(x - WATERHOLE.x, z - WATERHOLE.z) / (WATERHOLE.radius * 1.9)
  if (dw < 1) {
    const w = 1 - smoothstep(0.3, 1, dw)
    h = lerp(h, waterBase, w)
  }

  return h
}

/** 地形の傾き（法線の y 成分。1 が水平） */
export function terrainSlope(x: number, z: number, e = 0.75): number {
  const hx = terrainHeight(x + e, z) - terrainHeight(x - e, z)
  const hz = terrainHeight(x, z + e) - terrainHeight(x, z - e)
  const n = new THREE.Vector3(-hx, 2 * e, -hz).normalize()
  return n.y
}

// 彩度高めの金の草原。影が乗っても色が残る明るさにする
const colGrass = new THREE.Color('#cfa42f')
const colGrassDry = new THREE.Color('#e0bf5c')
const colGrassGreen = new THREE.Color('#9db840')
const colEarth = new THREE.Color('#b8834a')
const colRock = new THREE.Color('#a8876a')
// 地層の帯。赤い層・黄土の層・暗い層が重なる
const colStrata = [new THREE.Color('#c46c4a'), new THREE.Color('#e2aa6e'), new THREE.Color('#8f5f48')]

function vertexColor(x: number, z: number, h: number, out: THREE.Color): void {
  const n = detail.noise(x * 0.03 + 11, z * 0.03 - 5) * 0.5 + 0.5
  out.copy(colGrass).lerp(colGrassDry, n)

  // 大きなまだら。草むらと同じノイズで、乾いた金色の帯とやや緑の帯を作る
  const big = patch.noise(x * 0.02 + 3, z * 0.02 - 7) * 0.5 + 0.5
  out.lerp(colGrassDry, Math.max(0, big - 0.6) * 1.0)
  out.lerp(colGrassGreen, Math.max(0, 0.42 - big) * 1.1)

  // 低い場所はやや緑、乾いた高い場所は淡い黄土
  const rel = (h - 0) / 4
  if (rel < 0) out.lerp(colGrassGreen, Math.min(1, -rel * 0.5))
  else out.lerp(colGrassDry, Math.min(1, rel * 0.3))

  // 水場のまわりは土と緑
  const dw = Math.hypot(x - WATERHOLE.x, z - WATERHOLE.z) / (WATERHOLE.radius * 1.9)
  if (dw < 1) {
    const w = 1 - smoothstep(0.35, 1, dw)
    out.lerp(colGrassGreen, w * 0.6)
    const mud = 1 - smoothstep(0.45, 0.7, dw)
    out.lerp(colEarth, mud * 0.9)
  }

  const slope = terrainSlope(x, z, 0.6)

  // コピエ: 内側はほぼ岩肌。段の上には乾いた草が少し、崖の面は地層の帯、南の坂は土の道
  const k = kopjeShape(x, z)
  if (k.dk < 1.15) {
    const rockW = 1 - smoothstep(0.92, 1.12, k.dk)
    out.lerp(colRock, rockW * 0.9)
    if (slope > 0.96) out.lerp(colGrassDry, 0.3 * rockW)
    if (k.cliff < 1 && k.dk > KOPJE.plateau) {
      out.lerp(colEarth, (1 - k.cliff) * 0.55 * rockW)
      // 坂の下のほうには草が入り込む
      const low = smoothstep(0.6, 1.0, k.dk) * (1 - k.cliff)
      out.lerp(colGrassDry, low * 0.7)
    }
    if (k.cliff > 0.2 && slope < 0.85) {
      const band = Math.floor((h - kopjeBase + 0.4) / 0.8)
      const strata = colStrata[((band % 3) + 3) % 3]
      out.lerp(strata, Math.min(1, (0.85 - slope) * 3) * k.cliff)
    }
    return
  }

  // 急斜面は土が見える
  if (slope < 0.92) out.lerp(colEarth, Math.min(1, (0.92 - slope) * 4))
}

export function createTerrain(): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS)
  geo.rotateX(-Math.PI / 2)

  const pos = geo.attributes.position as THREE.BufferAttribute
  const colors = new Float32Array(pos.count * 3)
  const c = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const z = pos.getZ(i)
    const h = terrainHeight(x, z)
    pos.setY(i, h)
    vertexColor(x, z, h, c)
    colors[i * 3] = c.r
    colors[i * 3 + 1] = c.g
    colors[i * 3 + 2] = c.b
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geo.computeVertexNormals()

  // 面の割れ目を見せない滑らかな陰影に、段差のあるトゥーンを乗せる
  const mat = toonMaterial({ vertexColors: true })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.receiveShadow = true
  mesh.name = 'terrain'
  return mesh
}
