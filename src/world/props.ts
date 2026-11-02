import * as THREE from 'three'
import { Reflector } from 'three/addons/objects/Reflector.js'
import { Simplex2D, mulberry32, smoothstep } from './noise'
import { ACACIAS, KOPJE, LIONS, SPAWN, SPOT, WALK_RADIUS, WATERHOLE, WORLD_SEED } from './layout'
import { WATER_LEVEL, terrainHeight } from './terrain'
import { toonMaterial } from '../render/toon'

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

/** 映り込みの描画から外すレイヤー（草や光の粒）。メインカメラでは有効にする */
export const NO_REFLECT_LAYER = 1

const _m = new THREE.Matrix4()
const _p = new THREE.Vector3()
const _q = new THREE.Quaternion()
const _s = new THREE.Vector3()
const _e = new THREE.Euler()
const _c = new THREE.Color()
const patchNoise = new Simplex2D(WORLD_SEED + 31)

function distToWater(x: number, z: number): number {
  return Math.hypot(x - WATERHOLE.x, z - WATERHOLE.z)
}

function distToKopje(x: number, z: number): number {
  return Math.hypot(x - KOPJE.x, z - KOPJE.z)
}

/** 点と線分の距離（xz） */
function distToSegment(x: number, z: number, ax: number, az: number, bx: number, bz: number): number {
  const vx = bx - ax
  const vz = bz - az
  const len2 = vx * vx + vz * vz
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / len2))
  return Math.hypot(x - (ax + vx * t), z - (az + vz * t))
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
  const trunkMat = toonMaterial({ color: '#5a3d26' })
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, trees.length)
  trunks.castShadow = true
  trunks.receiveShadow = true

  const BLOBS = 5
  const blobGeo = new THREE.SphereGeometry(1, 7, 5)
  const blobMat = toonMaterial()
  const blobs = new THREE.InstancedMesh(blobGeo, blobMat, trees.length * BLOBS)
  blobs.castShadow = true
  blobs.receiveShadow = true

  const canopyA = new THREE.Color('#5f8a2e')
  const canopyB = new THREE.Color('#86a33a')

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

  // コピエ: 崖の段の上に崩れた岩。南側（登り口）は空ける。地層を隠しすぎないよう控えめに
  for (let i = 0; i < 22; i++) {
    const a = rand() * Math.PI * 2
    const south = Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2)))
    if (south < KOPJE.rampHalfAngle + 0.25) continue
    const r = KOPJE.radius * (0.4 + rand() * 0.62)
    const x = KOPJE.x + Math.cos(a) * r
    const z = KOPJE.z + Math.sin(a) * r
    placements.push({ x, z, s: 1.4 + rand() * 2.4, sink: 0.7 })
  }
  // 台地の上にも低い岩をいくつか（観察スポットの雰囲気づくり）。スポットとライオンのそばは空ける
  for (let i = 0; i < 7; i++) {
    const a = rand() * Math.PI * 2
    const r = KOPJE.radius * (0.2 + rand() * 0.1)
    const x = KOPJE.x + Math.cos(a) * r
    const z = KOPJE.z + Math.sin(a) * r
    if (Math.hypot(x - SPOT.x, z - SPOT.z) < 5) continue
    if (LIONS.some((l) => Math.hypot(x - l.x, z - l.z) < 6.5)) continue
    placements.push({ x, z, s: 0.8 + rand() * 1.0, sink: 0.4 })
  }
  // 登り道の両脇に岩を並べ、道らしく見せる
  for (let i = 0; i < 10; i++) {
    const side = i % 2 === 0 ? 1 : -1
    const a = Math.PI / 2 + side * (KOPJE.rampHalfAngle + 0.12 + rand() * 0.1)
    const r = KOPJE.radius * (0.5 + (Math.floor(i / 2) / 5) * 0.5)
    placements.push({ x: KOPJE.x + Math.cos(a) * r, z: KOPJE.z + Math.sin(a) * r, s: 0.9 + rand() * 1.2, sink: 0.5 })
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
  const mat = toonMaterial()
  const rocks = new THREE.InstancedMesh(geo, mat, placements.length)
  rocks.castShadow = true
  rocks.receiveShadow = true

  const rockA = new THREE.Color('#a07a5c')
  const rockB = new THREE.Color('#c09a74')

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

const WATER_COLOR = '#9fcbe6'

/** 空と周囲を映す水面のシェーダ。映り込みに水の色を混ぜ、さざ波でわずかに歪める */
const WaterShader = {
  name: 'StylizedWater',
  uniforms: {
    color: { value: null as THREE.Color | null },
    tDiffuse: { value: null as THREE.Texture | null },
    textureMatrix: { value: null as THREE.Matrix4 | null },
    uTime: { value: 0 },
  },
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix;
    varying vec4 vUv;
    varying vec3 vWorld;
    #include <common>
    #include <fog_pars_vertex>
    void main() {
      vUv = textureMatrix * vec4(position, 1.0);
      vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 color;
    uniform sampler2D tDiffuse;
    uniform float uTime;
    varying vec4 vUv;
    varying vec3 vWorld;
    #include <common>
    #include <fog_pars_fragment>
    void main() {
      vec2 ripple = vec2(
        sin(vWorld.x * 1.3 + uTime * 1.1) + sin(vWorld.z * 1.7 - uTime * 0.9),
        cos(vWorld.x * 1.1 - uTime * 0.8) + sin(vWorld.z * 1.5 + uTime * 1.3)
      ) * 0.0035;
      vec4 uv = vUv;
      uv.xy += ripple * uv.w;
      vec3 refl = texture2DProj(tDiffuse, uv).rgb;
      // 映り込みを少し白っぽい水色へ寄せ、様式化した色にそろえる
      vec3 c = mix(refl, color, 0.4);
      c += color * 0.08;
      gl_FragColor = vec4(c, 1.0);
      #include <fog_fragment>
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
}

/**
 * 水場。PC は Reflector で空と岸を映す。スマホは映り込みを描かず空色の板にする。
 * 映り込みの描画からは草と光の粒（NO_REFLECT_LAYER）を外して負荷を抑える。
 */
function createWater(
  group: THREE.Group,
  options: PropsOptions,
): { update: (time: number) => void } {
  const geo = new THREE.CircleGeometry(WATERHOLE.radius, 48)
  geo.rotateX(-Math.PI / 2)

  if (options.mobile || !options.camera) {
    const mat = new THREE.MeshBasicMaterial({ color: WATER_COLOR, transparent: true, opacity: 0.94 })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(WATERHOLE.x, WATER_LEVEL, WATERHOLE.z)
    mesh.name = 'water'
    group.add(mesh)
    return { update: () => {} }
  }

  const reflector = new Reflector(geo, {
    color: WATER_COLOR,
    textureWidth: 640,
    textureHeight: 640,
    clipBias: 0.003,
    shader: WaterShader,
    multisample: 0,
  })
  reflector.position.set(WATERHOLE.x, WATER_LEVEL, WATERHOLE.z)
  reflector.name = 'water'
  const mat = reflector.material as THREE.ShaderMaterial
  Object.assign(mat.uniforms, THREE.UniformsUtils.clone(THREE.UniformsLib.fog))
  mat.fog = true
  // 映り込み用カメラからは草・光の粒を外す
  const reflectionCamera = reflector.getReflectionCamera(options.camera) as THREE.Camera
  reflectionCamera.layers.disable(NO_REFLECT_LAYER)
  group.add(reflector)
  return {
    update: (time) => {
      mat.uniforms.uTime.value = time
    },
  }
}

/** 遠景の山並み。霧に溶ける低ポリの円錐 */
function createMountains(rand: () => number, group: THREE.Group): void {
  const count = 30
  const geo = new THREE.ConeGeometry(1, 1, 6, 1)
  geo.translate(0, 0.5, 0)
  const mat = new THREE.MeshBasicMaterial()
  const mountains = new THREE.InstancedMesh(geo, mat, count)

  // 遠景の赤い丘。霧に溶けて淡くなる
  const mA = new THREE.Color('#c8785a')
  const mB = new THREE.Color('#d8906c')

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

/**
 * 草の濃さ（0..1）。デモの見せ場を優先して、スポーンから登り口への回廊と
 * コピエの麓を濃く、遠くはまばらにする。
 */
function grassDensity(x: number, z: number): number {
  const corridor = distToSegment(x, z, SPAWN.x, SPAWN.z + 10, KOPJE.x, KOPJE.z + KOPJE.radius)
  let d = 0.3
  d += 0.7 * (1 - smoothstep(10, 30, corridor))
  const foot = Math.abs(distToKopje(x, z) - KOPJE.radius)
  d += 0.45 * (1 - smoothstep(1, 14, foot))
  const far = Math.hypot(x, z)
  d *= 1 - smoothstep(95, 145, far) * 0.6
  return Math.min(1, d)
}

/**
 * 草むら。1本ずつの棘ではなく、数本の葉が外へ傾いた「房」を InstancedMesh で描く。
 * 葉は根元が暗く先端が明るい頂点カラー × 房ごとの色味。
 * 頂点シェーダで、風の波（世界座標で進む）と房ごとの細かな揺れを足し、
 * カメラから遠い房は背を低くして地面に溶かす（距離 LOD）。
 */
function createGrass(
  rand: () => number,
  group: THREE.Group,
  tufts: number,
  lodFar: number,
): { mesh: THREE.InstancedMesh; uniforms: { uTime: { value: number }; uSway: { value: number }; uLodFar: { value: number } } } {
  const BLADES = 4
  const positions: number[] = []
  const colors: number[] = []

  const pushTri = (a: number[], b: number[], c: number[], ca: number, cb: number, cc: number) => {
    positions.push(...a, ...b, ...c)
    colors.push(ca, ca, ca, cb, cb, cb, cc, cc, cc)
  }
  // 葉1枚: 根元(幅0.05) → 中ほど(幅0.03) → 先端。表裏2組の巻き順で両面から見える
  for (let k = 0; k < BLADES; k++) {
    const yaw = (k / BLADES) * Math.PI * 2 + rand() * 0.9
    const lean = 0.18 + rand() * 0.22
    const dx = Math.cos(yaw)
    const dz = Math.sin(yaw)
    const px = -dz
    const pz = dx
    const w0 = 0.05
    const w1 = 0.03
    const bl = [-px * w0, 0, -pz * w0]
    const br = [px * w0, 0, pz * w0]
    const ml = [dx * lean * 0.5 - px * w1, 0.55, dz * lean * 0.5 - pz * w1]
    const mr = [dx * lean * 0.5 + px * w1, 0.55, dz * lean * 0.5 + pz * w1]
    const tip = [dx * lean * 1.25, 1, dz * lean * 1.25]
    const cBase = 0.55
    const cMid = 0.85
    const cTip = 1.12
    pushTri(bl, br, mr, cBase, cBase, cMid)
    pushTri(bl, mr, ml, cBase, cMid, cMid)
    pushTri(ml, mr, tip, cMid, cMid, cTip)
    pushTri(br, bl, mr, cBase, cBase, cMid)
    pushTri(mr, bl, ml, cMid, cBase, cMid)
    pushTri(mr, ml, tip, cMid, cMid, cTip)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  // 法線を上向きにそろえ、地面と同じ明るさで光らせる
  const normals = new Float32Array(positions.length)
  for (let i = 1; i < normals.length; i += 3) normals[i] = 1
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3))

  const uniforms = { uTime: { value: 0 }, uSway: { value: 1 }, uLodFar: { value: lodFar } }
  const mat = toonMaterial({ vertexColors: true })
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime
    shader.uniforms.uSway = uniforms.uSway
    shader.uniforms.uLodFar = uniforms.uLodFar
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uSway;\nuniform float uLodFar;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec3 ipos = instanceMatrix[3].xyz;
        float bend = position.y * position.y;
        // 風の波: 世界座標で一定方向に進む大きなうねり ＋ ゆっくりした突風
        vec3 windW = vec3(0.8, 0.0, 0.6);
        float along = dot(ipos.xz, windW.xz);
        float wave = sin(along * 0.085 - uTime * 1.4);
        float gust = 0.5 + 0.5 * sin(along * 0.025 - uTime * 0.5 + 1.7);
        float windAmt = (0.1 + 0.5 * gust * (0.5 + 0.5 * wave)) * uSway;
        // 風向きを房のローカル座標へ
        vec3 windL = normalize(vec3(dot(windW, instanceMatrix[0].xyz), 0.0, dot(windW, instanceMatrix[2].xyz)) + vec3(1e-4));
        transformed.xz += windL.xz * windAmt * bend;
        // 房ごとの細かな揺れ
        float ph = ipos.x * 0.35 + ipos.z * 0.27;
        float sway = sin(uTime * 1.6 + ph) * 0.5 + sin(uTime * 2.7 + ph * 1.7) * 0.25;
        transformed.x += sway * uSway * bend * 0.2;
        transformed.z += sway * uSway * bend * 0.08;
        // 距離 LOD: 遠い房は背を低くして地面に溶かす
        float dcam = distance(ipos, cameraPosition);
        transformed.y *= 1.0 - smoothstep(uLodFar * 0.6, uLodFar, dcam);`,
      )
  }

  const grass = new THREE.InstancedMesh(geo, mat, tufts)
  grass.receiveShadow = true
  grass.frustumCulled = false
  grass.layers.set(NO_REFLECT_LAYER)

  const gA = new THREE.Color('#ecc85a')
  const gB = new THREE.Color('#d2a336')
  const gC = new THREE.Color('#a3bf44')
  const gD = new THREE.Color('#e9c57c')

  const R = WALK_RADIUS + 30
  let placed = 0
  let guard = 0
  while (placed < tufts && guard++ < tufts * 8) {
    const a = rand() * Math.PI * 2
    const r = Math.sqrt(rand()) * R
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r
    if (rand() > grassDensity(x, z)) continue
    const dw = distToWater(x, z)
    if (dw < WATERHOLE.radius + 1.5) continue
    if (distToKopje(x, z) < KOPJE.radius * 0.97) continue
    const h = 0.35 + rand() * 0.45
    _p.set(x, terrainHeight(x, z) - 0.03, z)
    _e.set(0, rand() * Math.PI, 0)
    _q.setFromEuler(_e)
    const w = 0.8 + rand() * 0.7
    _s.set(w, h, w)
    _m.compose(_p, _q, _s)
    grass.setMatrixAt(placed, _m)
    // 大きなまだら: 乾いた金色と、やや緑の群れ
    const patch = patchNoise.noise(x * 0.02 + 3, z * 0.02 - 7) * 0.5 + 0.5
    _c.copy(gA).lerp(gB, rand() * 0.8)
    _c.lerp(gD, Math.max(0, patch - 0.6) * 1.2)
    _c.lerp(gC, Math.max(0, 0.42 - patch) * 1.4)
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

export interface PropsOptions {
  /** 低性能端末では草の房を減らし、水の映り込みを描かない */
  mobile: boolean
  /** メインカメラ。水の映り込み用カメラの設定に使う（無ければ映り込みなし） */
  camera?: THREE.Camera
}

export function createProps(options: PropsOptions): Props {
  const rand = mulberry32(WORLD_SEED + 101)
  const group = new THREE.Group()
  group.name = 'props'

  const colliders: Collider[] = []
  createAcacias(rand, group, colliders)
  createRocks(rand, group, colliders)
  const water = createWater(group, options)
  createMountains(rand, group)
  const grass = createGrass(rand, group, options.mobile ? 6000 : 16000, options.mobile ? 110 : 175)

  return {
    group,
    colliders,
    setSway: (amount) => {
      grass.uniforms.uSway.value = amount
    },
    update: (time) => {
      grass.uniforms.uTime.value = time
      water.update(time)
    },
  }
}
