import * as THREE from 'three'
import { Simplex2D, lerp, smoothstep } from './noise'
import { KOPJE, TERRAIN_SEGMENTS, TERRAIN_SIZE, WATERHOLE, WORLD_SEED } from './layout'
import { toonMaterial } from '../render/toon'

const simplex = new Simplex2D(WORLD_SEED)
const detail = new Simplex2D(WORLD_SEED + 7)
const patch = new Simplex2D(WORLD_SEED + 31)

/** 起伏のもとになるノイズ高さ（コピエと水場の加工前） */
function baseHeight(x: number, z: number): number {
  const broad = simplex.fbm(x * 0.011, z * 0.011, 4, 2.1, 0.5) * 3.6
  const fine = detail.fbm(x * 0.05, z * 0.05, 2, 2, 0.5) * 0.35
  return broad + fine
}

const kopjeTop = baseHeight(KOPJE.x, KOPJE.z) + KOPJE.height
const waterBase = baseHeight(WATERHOLE.x, WATERHOLE.z) - WATERHOLE.depth

/** 水面の高さ */
export const WATER_LEVEL = waterBase + 0.75

/**
 * 地形の高さ関数。地形メッシュ、置き物の足元、プレイヤーの高さがすべてこれを使う。
 */
export function terrainHeight(x: number, z: number): number {
  let h = baseHeight(x, z)

  // コピエ: 中心が平らな台地になるように持ち上げる
  const dk = Math.hypot(x - KOPJE.x, z - KOPJE.z) / KOPJE.radius
  if (dk < 1) {
    const w = 1 - smoothstep(KOPJE.plateau, 1, dk)
    h = lerp(h, kopjeTop, w)
  }

  // 水場: ゆるい窪みにする
  const dw = Math.hypot(x - WATERHOLE.x, z - WATERHOLE.z) / (WATERHOLE.radius * 1.9)
  if (dw < 1) {
    const w = 1 - smoothstep(0.3, 1, dw)
    h = lerp(h, waterBase, w)
  }

  return h
}

/** 地形の傾き（法線の y 成分。1 が水平） */
export function terrainSlope(x: number, z: number): number {
  const e = 0.75
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
const colRock = new THREE.Color('#9a7a5e')

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

  // コピエの台地と斜面は岩肌
  const dk = Math.hypot(x - KOPJE.x, z - KOPJE.z) / KOPJE.radius
  if (dk < 1) {
    const w = 1 - smoothstep(0.5, 0.95, dk)
    out.lerp(colRock, w * 0.85)
  }

  // 急斜面は土が見える
  const slope = terrainSlope(x, z)
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
