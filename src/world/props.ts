import * as THREE from 'three'
import { Reflector } from 'three/addons/objects/Reflector.js'
import { Simplex2D, mulberry32, smoothstep } from './noise'
import { ACACIAS, KOPJE, LIONS, SPAWN, SPOT, WALK_RADIUS, WATERHOLE, WORLD_SEED } from './layout'
import { SEA_LEVEL, WATER_LEVEL, savannaTrail, terrainHeight } from './terrain'
import { MAP_BOUNDS, OUTER_REGIONS, PASS_HALF_WIDTH, REACH_BINS, REGIONS, biomeAt, distToPassAxis, distToPassAxisOf, emptyWeights, reachBin, setReach } from './regions'
import type { Region } from './regions'
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

/**
 * アカシア: 細い幹と、平たく横に広がる傘の冠。InstancedMesh 2つで描く。
 * 冠は真ん中の 5 つ（並びを変えないよう、乱数の数は前と同じ）と、縁に足す 4 つ（別の乱数）で、上が平らな傘にする
 */
function createAcacias(rand: () => number, rand2: () => number, group: THREE.Group, colliders: Collider[]): void {
  const trees = [...ACACIAS]
  // 外側にもまばらに
  for (let i = 0; i < 18; i++) {
    const a = rand() * Math.PI * 2
    const r = 95 + rand() * 50
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r
    if (distToWater(x, z) < 24) continue
    // 乱数の順番はいままでどおり（サバンナの木の並びを変えない）
    const scale = 0.8 + rand() * 0.5
    // 峠の道はあけておく
    if (Math.hypot(x, z) > 105 && distToPassAxis(x, z) < PASS_HALF_WIDTH + 4) continue
    trees.push({ x, z, scale })
  }

  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.5, 1, 7, 1)
  trunkGeo.translate(0, 0.5, 0)
  const trunkMat = toonMaterial({ color: '#5a3d26' })
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, trees.length)
  trunks.castShadow = true
  trunks.receiveShadow = true

  const CORE = 5
  const RIM = 4
  const BLOBS = CORE + RIM
  const blobGeo = new THREE.SphereGeometry(1, 8, 5)
  const blobMat = toonMaterial()
  const blobs = new THREE.InstancedMesh(blobGeo, blobMat, trees.length * BLOBS)
  blobs.castShadow = true
  blobs.receiveShadow = true

  // トップの絵のような、鮮やかな若葉色
  const canopyA = new THREE.Color('#56a02a')
  const canopyB = new THREE.Color('#84bc3a')
  const canopyDry = new THREE.Color('#a2aa3c')

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
    const spread = 3.6 * t.scale
    // 木ごとに少しだけ乾いた色の木もある
    const dryness = rand2() * 0.45
    for (let b = 0; b < CORE; b++) {
      const a = (b / CORE) * Math.PI * 2 + rand() * 0.8
      const r = b === 0 ? 0 : spread * (0.45 + rand() * 0.5)
      const rx = 2.4 * t.scale * (0.8 + rand() * 0.5)
      const ry = 0.5 * t.scale * (0.8 + rand() * 0.4)
      // 上が平らにそろう傘（高さのばらつきは小さく）
      _p.set(top.x + Math.cos(a) * r, top.y + (rand() - 0.3) * 0.22 * t.scale, top.z + Math.sin(a) * r)
      _e.set(0, rand() * Math.PI, 0)
      _q.setFromEuler(_e)
      _s.set(rx, ry, rx * (0.8 + rand() * 0.4))
      _m.compose(_p, _q, _s)
      const idx = i * BLOBS + b
      blobs.setMatrixAt(idx, _m)
      _c.copy(canopyA).lerp(canopyB, rand()).lerp(canopyDry, dryness)
      blobs.setColorAt(idx, _c)
    }
    // 縁: 外へ張り出す薄い葉の層。傘の端は少し垂れる
    for (let b = 0; b < RIM; b++) {
      const a = (b / RIM) * Math.PI * 2 + rand2() * 1.2
      const r = spread * (1.0 + rand2() * 0.35)
      const rx = 1.7 * t.scale * (0.8 + rand2() * 0.4)
      _p.set(top.x + Math.cos(a) * r, top.y - (0.12 + rand2() * 0.2) * t.scale, top.z + Math.sin(a) * r)
      _e.set(0, rand2() * Math.PI, 0)
      _q.setFromEuler(_e)
      _s.set(rx, 0.36 * t.scale, rx * 0.8)
      _m.compose(_p, _q, _s)
      const idx = i * BLOBS + CORE + b
      blobs.setMatrixAt(idx, _m)
      _c.copy(canopyA).lerp(canopyB, rand2() * 0.6).lerp(canopyDry, dryness)
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
    const rs = 0.5 + rand() * 1.4
    if (Math.hypot(x, z) > 105 && distToPassAxis(x, z) < PASS_HALF_WIDTH + 2) continue
    placements.push({ x, z, s: rs, sink: 0.35 })
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

/**
 * 遠景の山並み。角度に沿ったノイズで稜線を作った帯を3層重ねる。
 * 近い層は赤く低く、遠い層は高く、霧に溶けて淡くなる。頂点カラー（麓は暗く、峰は明るい）に
 * トゥーンの陰影が乗るので、太陽の向きで面の明暗が出る。
 */
interface RangeLayer {
  r: number
  h: number
  spread: number
  segs: number
  foot: string
  peak: string
  seed: number
}

interface RangeOptions {
  /** 山並みの輪の中心 */
  cx: number
  cz: number
  layers: RangeLayer[]
  /** 輪を開けておく向き（ラジアン。x = cos, z = sin）と半角。となりのワールドに面した側 */
  gap?: { angle: number; half: number }
  /** サバンナの輪: 各ワールドへの峠を切る */
  cutPasses?: boolean
  /** 水の世界: 稜線の低いところを海の下へ沈めて、つながった山並みではなく島々に見せる */
  islands?: boolean
  /**
   * ほかのワールドの山並み: となりのワールドの歩ける円と、そこへの峠にかかる所は地面の下まで下げる
   * （ななめに置いたふれあいワールドは、ジャングル・南半球の山並みと重なるため）
   */
  avoid?: Region[]
  name: string
}

/** 山並みの輪。外側の層ほど高く、色は麓から峰へ。gap と峠のところは地面の下まで下げる */
function createRange(group: THREE.Group, o: RangeOptions): void {
  const ridgeNoise = new Simplex2D(WORLD_SEED + 77)
  const colFoot = new THREE.Color()
  const colPeak = new THREE.Color()

  for (const L of o.layers) {
    const positions: number[] = []
    const colors: number[] = []
    const indices: number[] = []
    const rows = 3
    colFoot.set(L.foot)
    colPeak.set(L.peak)

    // 周期的な稜線: 角度を円周上の点にしてノイズを引くと、一周でつながる
    const ridge = (a: number, k: number, off: number) => ridgeNoise.noise(Math.cos(a) * k + off, Math.sin(a) * k + off)
    for (let i = 0; i <= L.segs; i++) {
      const a = (i / L.segs) * Math.PI * 2
      const broad = ridge(a, 2.2, L.seed) * 0.5 + 0.5
      const sharp = 1 - Math.abs(ridge(a, 7, L.seed + 11))
      const fine = ridge(a, 19, L.seed + 23) * 0.5
      const height = o.islands
        ? L.h * (broad * 1.7 - 0.62) + L.spread * (sharp * 0.8 + fine * 0.4 - 0.5)
        : L.h * (0.45 + 0.55 * broad) + L.spread * (sharp * 0.8 + fine * 0.4)
      // 切れ目: 開けておく向きと峠では、山を地面の下まで下げる
      let keep = 1
      if (o.gap) {
        const da = Math.abs(Math.atan2(Math.sin(a - o.gap.angle), Math.cos(a - o.gap.angle)))
        keep = Math.min(keep, smoothstep(o.gap.half, o.gap.half + 0.35, da))
      }
      if (o.cutPasses) {
        const mx = o.cx + Math.cos(a) * L.r
        const mz = o.cz + Math.sin(a) * L.r
        keep = Math.min(keep, smoothstep(PASS_HALF_WIDTH + 14, PASS_HALF_WIDTH + 44, distToPassAxis(mx, mz)))
        // 外側の層はほかのワールドの歩ける円の中を横切る。円（＋余白）にかかる所も地面の下まで下げる。
        // 麓から峰（稜線のゆれ込み）までの帯で測る
        const ca = Math.cos(a)
        const sa = Math.sin(a)
        for (const r of OUTER_REGIONS) {
          const d = distToSegment(r.x, r.z, o.cx + ca * (L.r - 3), o.cz + sa * (L.r - 3), o.cx + ca * (L.r + 14), o.cz + sa * (L.r + 14))
          keep = Math.min(keep, smoothstep(r.walk + 8, r.walk + 36, d))
        }
      }
      if (o.avoid) {
        const ca = Math.cos(a)
        const sa = Math.sin(a)
        for (const r of o.avoid) {
          const d = distToSegment(r.x, r.z, o.cx + ca * (L.r - 3), o.cz + sa * (L.r - 3), o.cx + ca * (L.r + 14), o.cz + sa * (L.r + 14))
          // サバンナの輪より広めにあける（となりのワールドの山が歩ける円のすぐ外に壁のように立たないように）
          keep = Math.min(keep, smoothstep(r.walk + 20, r.walk + 62, d))
          const mx = o.cx + ca * L.r
          const mz = o.cz + sa * L.r
          keep = Math.min(keep, smoothstep(PASS_HALF_WIDTH + 14, PASS_HALF_WIDTH + 44, distToPassAxisOf(r, mx, mz)))
        }
      }
      // 行0: 麓（外側・低い）、行1: 肩、行2: 峰
      const ys = [-4, height * (0.42 + 0.12 * ridge(a, 5, L.seed + 31)), height].map((y, row) => (row === 0 ? y : -6 + (y + 6) * keep))
      const rs = [L.r + 14, L.r + 5, L.r]
      for (let row = 0; row < rows; row++) {
        const rr = rs[row] + (row === 2 ? ridge(a, 13, L.seed + 41) * 3 : 0)
        positions.push(o.cx + Math.cos(a) * rr, ys[row], o.cz + Math.sin(a) * rr)
        const t = row === 0 ? 0 : row === 1 ? 0.45 : 0.85 + 0.15 * sharp
        _c.copy(colFoot).lerp(colPeak, t)
        colors.push(_c.r, _c.g, _c.b)
      }
    }
    for (let i = 0; i < L.segs; i++) {
      for (let row = 0; row < rows - 1; row++) {
        const a0 = i * rows + row
        const a1 = a0 + 1
        const b0 = (i + 1) * rows + row
        const b1 = b0 + 1
        indices.push(a0, b0, a1, a1, b0, b1)
      }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    geo.setIndex(indices)
    geo.computeVertexNormals()
    const mesh = new THREE.Mesh(geo, toonMaterial({ vertexColors: true, side: THREE.DoubleSide }))
    mesh.frustumCulled = false
    mesh.name = `${o.name}-${L.r}`
    group.add(mesh)
  }
}

/** 円の外へ歩ける分の上限（m）。サバンナは内側の山（172m）の手前、ほかのワールドは自分の山並み（150m）の手前まで */
const REACH_EXTRA_SAVANNA = 40
const REACH_EXTRA_OUTER = 38
/** 山から離しておく距離（m） */
const REACH_MOUNTAIN_MARGIN = 10

/**
 * 円の縁の先で、見えている地面を歩けるようにする（regions.ts の setReach）。向きごとに、
 * ①山（地面より 1m 以上高い山並みの頂点）のふもとの手前、②海の波打ちぎわ・地形の端、③急な段差、のいちばん近いところまで。
 * 山は峠やとなりのワールドのところで切ってあるので、実際に作った山の頂点で測る（切った所の先は開けたまま歩ける）
 */
function measureReach(group: THREE.Group): void {
  const step = (Math.PI * 2) / REACH_BINS
  const w = emptyWeights()
  // 海は水の世界の地面の、海面より低い所だけ（sea.ts と同じ見分け方。サバンナの縁の低い地面は海ではない）
  const isSea = (x: number, z: number, h: number) => h < SEA_LEVEL + 0.25 && biomeAt(x, z, w).water >= 0.5
  const peaks: number[] = []
  group.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || !o.name.startsWith('mountains')) return
    const pos = o.geometry.getAttribute('position')
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      const z = pos.getZ(i)
      if (y > terrainHeight(x, z) + 1) peaks.push(x, z)
    }
  })
  for (const r of REGIONS) {
    const cap = r.walk + (r.key === 'africa' ? REACH_EXTRA_SAVANNA : REACH_EXTRA_OUTER)
    const table = new Float32Array(REACH_BINS).fill(cap)
    // ① 山: 頂点の向きと、まわり（頂点の間隔ぶん）の向きを、その手前までにする
    for (let i = 0; i < peaks.length; i += 2) {
      const x = peaks[i]
      const z = peaks[i + 1]
      const d = Math.hypot(x - r.x, z - r.z)
      if (d >= cap + REACH_MOUNTAIN_MARGIN) continue
      const limit = Math.max(r.walk, d - REACH_MOUNTAIN_MARGIN)
      const b = reachBin(r, x, z)
      const spread = Math.ceil(Math.atan2(9, Math.max(1, d)) / step)
      for (let k = -spread; k <= spread; k++) {
        const j = (b + k + REACH_BINS) % REACH_BINS
        if (limit < table[j]) table[j] = limit
      }
    }
    // ② 海・地形の端、③ 急な段差: 円の縁から外へ 2m ずつたどる
    for (let j = 0; j < REACH_BINS; j++) {
      const a = j * step
      const ca = Math.cos(a)
      const sa = Math.sin(a)
      let prev = terrainHeight(r.x + ca * r.walk, r.z + sa * r.walk)
      for (let rr = r.walk + 2; rr <= table[j]; rr += 2) {
        const x = r.x + ca * rr
        const z = r.z + sa * rr
        const h = terrainHeight(x, z)
        const off = x < MAP_BOUNDS.minX + 8 || x > MAP_BOUNDS.maxX - 8 || z < MAP_BOUNDS.minZ + 8 || z > MAP_BOUNDS.maxZ - 8
        if (off || isSea(x, z, h) || Math.abs(h - prev) > 1.6) {
          table[j] = Math.max(r.walk, rr - 4)
          break
        }
        prev = h
      }
    }
    setReach(r.key, table)
  }
}

/**
 * 遠くの山脈。サバンナの輪（いままでの 3 層）には各ワールドへの峠を切る。
 * ほかのワールドにも、それぞれの色の山並みを、サバンナに面した側を開けて置く
 */
function createMountains(group: THREE.Group): void {
  createRange(group, {
    cx: 0,
    cz: 0,
    cutPasses: true,
    name: 'mountains',
    layers: [
      // トップの絵の遠い山のような青紫。奥ほど淡く
      { r: 172, h: 20, spread: 10, segs: 200, foot: '#7a72b4', peak: '#b2a9de', seed: 0.0 },
      { r: 212, h: 36, spread: 16, segs: 180, foot: '#8086c4', peak: '#bcc1ea', seed: 3.3 },
      { r: 258, h: 54, spread: 24, segs: 160, foot: '#98a3d6', peak: '#d3d9f4', seed: 7.1 },
    ],
  })
  for (const r of OUTER_REGIONS) {
    const toOrigin = Math.atan2(-r.z, -r.x)
    const look = OUTER_LOOKS[r.key as OuterLookKey]
    createRange(group, {
      cx: r.x,
      cz: r.z,
      gap: { angle: toOrigin, half: 0.95 },
      islands: r.key === 'water',
      avoid: OUTER_REGIONS.filter((g) => g !== r),
      name: `mountains-${r.key}`,
      layers: look.map((l, i) => ({ ...l, segs: 150, seed: 11 + i * 4.1 + r.x * 0.01 })),
    })
  }
}

type OuterLookKey = 'north' | 'jungle' | 'south' | 'water' | 'partner' | 'sky'
/** ほかのワールドの山並みの色と高さ */
const OUTER_LOOKS: Record<OuterLookKey, Array<Omit<RangeLayer, 'segs' | 'seed'>>> = {
  // 北: 青い麓に白い雪の峰
  north: [
    { r: 150, h: 26, spread: 14, foot: '#9bb4d8', peak: '#ffffff' },
    { r: 188, h: 44, spread: 20, foot: '#aac0dc', peak: '#ffffff' },
    { r: 230, h: 64, spread: 26, foot: '#bccde6', peak: '#ffffff' },
  ],
  // ジャングル: 濃い緑の丸い山
  jungle: [
    { r: 150, h: 20, spread: 8, foot: '#2a8a4a', peak: '#62c05e' },
    { r: 188, h: 32, spread: 12, foot: '#3a9a58', peak: '#7fcc72' },
    { r: 230, h: 46, spread: 16, foot: '#6aae84', peak: '#aadcaa' },
  ],
  // 南半球: 赤い台地
  south: [
    { r: 150, h: 14, spread: 6, foot: '#b5452a', peak: '#e8804a' },
    { r: 188, h: 24, spread: 9, foot: '#c45f3a', peak: '#f09c66' },
    { r: 230, h: 36, spread: 12, foot: '#d08a6e', peak: '#f3c3a4' },
  ],
  // 水の世界: 沖に浮かぶ緑の島々（麓は岩の灰色、頂は明るい緑）。遠い島ほど淡く
  water: [
    { r: 150, h: 11, spread: 6, foot: '#8d9a90', peak: '#6cc06a' },
    { r: 188, h: 19, spread: 9, foot: '#94aaa2', peak: '#86cc7e' },
    { r: 230, h: 30, spread: 13, foot: '#a8c0c6', peak: '#b4dcb0' },
  ],
  // ふれあいワールド: 牧場を囲むなだらかな明るい緑の丘。遠いほど淡い
  partner: [
    { r: 150, h: 14, spread: 5, foot: '#5fae4a', peak: '#9ad86a' },
    { r: 188, h: 22, spread: 8, foot: '#72b85e', peak: '#b2e282' },
    { r: 230, h: 32, spread: 11, foot: '#94c890', peak: '#cdeab4' },
  ],
  // 空の世界: 高原（地面が約 10m 高い）を囲む、低めのとがった岩の峰（空を広く見せる）。麓はうす紫、日の当たる頂はクリーム色。北の世界の雪の峰と見分けがつく色
  sky: [
    { r: 150, h: 22, spread: 10, foot: '#a4a2d4', peak: '#f6ead2' },
    { r: 188, h: 32, spread: 14, foot: '#b2b2dc', peak: '#faf0de' },
    { r: 230, h: 46, spread: 18, foot: '#c4c6e8', peak: '#fdf8ee' },
  ],
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
  // 踏み分け道には草が生えない
  d *= 1 - savannaTrail(x, z) * 0.9
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
  // toonMaterial のクレイの見た目を残したまま、風の揺れを足す
  const baseCompile = mat.onBeforeCompile
  mat.onBeforeCompile = (shader, renderer) => {
    baseCompile.call(mat, shader, renderer)
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

  const gA = new THREE.Color('#fcd424')
  const gB = new THREE.Color('#e6ad16')
  const gC = new THREE.Color('#aacd22')
  const gD = new THREE.Color('#f8d34e')

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
    if (LIONS.some((l) => Math.hypot(x - l.x, z - l.z) < 1.8)) continue
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

/** サバンナで、茂みやアリ塚を置いてはいけない所（道・峠・水場・コピエ・ライオン・スポット・スタート地点） */
function savannaKeepClear(x: number, z: number, margin: number): boolean {
  if (Math.hypot(x, z) > 112) return true
  if (distToWater(x, z) < WATERHOLE.radius + 3 + margin) return true
  if (distToKopje(x, z) < KOPJE.radius * 0.95 + margin) return true
  if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 8 + margin) return true
  if (Math.hypot(x - SPOT.x, z - SPOT.z) < 6 + margin) return true
  if (LIONS.some((l) => Math.hypot(x - l.x, z - l.z) < 4 + margin)) return true
  // スタート地点からコピエの登り口への道
  if (distToSegment(x, z, SPAWN.x, SPAWN.z, KOPJE.x, KOPJE.z + KOPJE.radius) < 5 + margin) return true
  if (savannaTrail(x, z) > 0.2) return true
  if (Math.hypot(x, z) > 95 && distToPassAxis(x, z) < PASS_HALF_WIDTH + 3 + margin) return true
  return false
}

/**
 * 低い茂み（サバンナの灌木）。丸い葉の塊を 2〜3 つ寄せて 1 株にする。歩いて通り抜けられる（当たり判定なし）。
 * 岩のそば・コピエの麓・水場の外まわりに集まり、平原にはまばら。小さいので影は受けない（縞が出るため）
 */
function createBushes(rand: () => number, group: THREE.Group, count: number): void {
  const geo = new THREE.IcosahedronGeometry(1, 1)
  const mat = toonMaterial()
  const PER = 3
  const mesh = new THREE.InstancedMesh(geo, mat, count * PER)
  mesh.castShadow = true
  mesh.receiveShadow = false
  const olive = new THREE.Color('#6aa636')
  const deep = new THREE.Color('#4f8c30')
  const dry = new THREE.Color('#a5a842')
  // 集まる場所の中心
  const hubs: Array<{ x: number; z: number; r: number }> = [
    { x: KOPJE.x, z: KOPJE.z, r: KOPJE.radius + 10 },
    { x: WATERHOLE.x, z: WATERHOLE.z, r: WATERHOLE.radius + 12 },
  ]
  let placed = 0
  let guard = 0
  while (placed < count && guard++ < count * 30) {
    let x: number
    let z: number
    const pick = rand()
    if (pick < 0.45) {
      const hub = hubs[pick < 0.3 ? 0 : 1]
      const a = rand() * Math.PI * 2
      const r = hub.r + (rand() - 0.3) * 14
      x = hub.x + Math.cos(a) * r
      z = hub.z + Math.sin(a) * r
    } else {
      const a = rand() * Math.PI * 2
      const r = 12 + Math.sqrt(rand()) * 98
      x = Math.cos(a) * r
      z = Math.sin(a) * r
    }
    if (savannaKeepClear(x, z, 0)) continue
    const size = 0.55 + rand() * 0.75
    const tone = rand()
    for (let k = 0; k < PER; k++) {
      const a = rand() * Math.PI * 2
      const off = k === 0 ? 0 : size * (0.6 + rand() * 0.5)
      const bx = x + Math.cos(a) * off
      const bz = z + Math.sin(a) * off
      const s = size * (k === 0 ? 1 : 0.6 + rand() * 0.3)
      _p.set(bx, terrainHeight(bx, bz) + s * 0.35, bz)
      _e.set(0, rand() * Math.PI, 0)
      _q.setFromEuler(_e)
      _s.set(s * 1.15, s * 0.72, s)
      _m.compose(_p, _q, _s)
      mesh.setMatrixAt(placed * PER + k, _m)
      _c.copy(olive).lerp(deep, tone * 0.7).lerp(dry, Math.max(0, tone - 0.65) * 1.6 + rand() * 0.1)
      mesh.setColorAt(placed * PER + k, _c)
    }
    placed++
  }
  mesh.count = placed * PER
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  group.add(mesh)
}

/**
 * アリ塚。赤土の、先の細い塔が平原にぽつぽつ立つ。道とスタートから離して置き、小さな当たり判定を付ける
 */
function createTermiteMounds(rand: () => number, group: THREE.Group, colliders: Collider[], count: number): void {
  const geo = new THREE.CylinderGeometry(0.16, 1, 1, 7, 3)
  geo.translate(0, 0.5, 0)
  // 側面を少しでこぼこに
  const pos = geo.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i)
    if (y <= 0.01 || y >= 0.99) continue
    const k = 1 + Math.sin(i * 2.7) * 0.08
    pos.setX(i, pos.getX(i) * k)
    pos.setZ(i, pos.getZ(i) * k)
  }
  geo.computeVertexNormals()
  const mat = toonMaterial()
  const mesh = new THREE.InstancedMesh(geo, mat, count * 2)
  mesh.castShadow = true
  mesh.receiveShadow = false
  const red = new THREE.Color('#c0794a')
  const ochre = new THREE.Color('#d39a64')
  let placed = 0
  let n = 0
  let guard = 0
  while (placed < count && guard++ < count * 60) {
    const a = rand() * Math.PI * 2
    const r = 22 + rand() * 86
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r
    if (savannaKeepClear(x, z, 7)) continue
    if (colliders.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + 6)) continue
    const h = 1.6 + rand() * 1.8
    const w = 0.7 + rand() * 0.35
    const y = terrainHeight(x, z) - 0.15
    _c.copy(red).lerp(ochre, rand())
    // 本体と、脇の小さな塔
    _p.set(x, y, z)
    _e.set((rand() - 0.5) * 0.08, rand() * Math.PI, (rand() - 0.5) * 0.08)
    _q.setFromEuler(_e)
    _s.set(w, h, w * 0.9)
    _m.compose(_p, _q, _s)
    mesh.setMatrixAt(n, _m)
    mesh.setColorAt(n, _c)
    n++
    const sa = rand() * Math.PI * 2
    const sx = x + Math.cos(sa) * w * 0.7
    const sz = z + Math.sin(sa) * w * 0.7
    _p.set(sx, terrainHeight(sx, sz) - 0.1, sz)
    _s.set(w * 0.55, h * (0.45 + rand() * 0.2), w * 0.5)
    _m.compose(_p, _q, _s)
    mesh.setMatrixAt(n, _m)
    mesh.setColorAt(n, _c)
    n++
    colliders.push({ x, z, r: w * 0.85 })
    placed++
  }
  mesh.count = n
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  group.add(mesh)
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

  // 茂み・アリ塚・アカシアの縁の葉は別の乱数で（いままでの木・岩・草の並びを変えない）
  const rand2 = mulberry32(WORLD_SEED + 707)
  const colliders: Collider[] = []
  createAcacias(rand, rand2, group, colliders)
  createRocks(rand, group, colliders)
  const water = createWater(group, options)
  createMountains(group)
  measureReach(group)
  const grass = createGrass(rand, group, options.mobile ? 6000 : 16000, options.mobile ? 110 : 175)
  createBushes(rand2, group, options.mobile ? 110 : 150)
  createTermiteMounds(rand2, group, colliders, 7)

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
