import * as THREE from 'three'
import { mulberry32 } from './noise'
import { WORLD_SEED } from './layout'
import { OUTER_REGIONS } from './regions'
import type { Region, RegionKey } from './regions'
import { rockCollider, rockRise } from './props'
import type { Collider } from './props'
import { CREEK, GOAT_ROCKS, JUNGLE_POND, LAGOON, SEA_LEVEL, SKY_RING, creekDist, farmPathDist, farmPens, lagoonDist, shapeHeight, skyPathDist, terrainHeight } from './terrain'
import { toonMaterial } from '../render/toon'
import { SUN_LIGHT_DIR } from './scene'
import { createShopHouse, shopClears } from './shop'
import { addWalkSurface, deckSurface, rampSurface } from './walkSurfaces'

/**
 * サバンナ以外の 5 つのワールドの置き物。どれも InstancedMesh で、種類ごとに 1〜2 回の描画で済ませる。
 * 北の世界: 雪をかぶったトウヒの森と雪の岩。ジャングル: 背の高い木、ヤシ、シダ、大木の目印。
 * 南半球: 白い幹のユーカリ、赤い岩、とげとげの草むら、赤い一枚岩の目印。
 * 水の世界: 砂丘の浜の草、ヤシ、潟と小川のふちの葦、浜の岩と流木、貝殻とヒトデ、沖の岩のアーチの目印。
 * ふれあいワールド: 木の柵で囲った放牧場 3 つ、丸い木、花、干し草、目印に赤い納屋。
 * 形は様式化した目印で、特定の場所の再現ではない。
 */
export interface BiomeProps {
  group: THREE.Group
}

const _m = new THREE.Matrix4()
const _p = new THREE.Vector3()
const _q = new THREE.Quaternion()
const _s = new THREE.Vector3()
const _e = new THREE.Euler()
const _c = new THREE.Color()

/**
 * ジャングルの「止まり木」: スポットの北東に立つ木と、東へ張り出した横枝。
 * 木の上で暮らす子（ビントロング・キンカジュー・ナマケモノ）はこの枝に置く（residents.ts）
 */
export const JUNGLE_PERCH = { dx: 7, dz: -9, height: 2.7, length: 6.2, radius: 0.24 }

/** ヤギの岩場の板が地面から出てよい高さ（m）。これより低ければ主人公は板の上を歩いて見える */
const GOAT_SLAB_RISE = 0.3
/** 放牧場の柵の上端（地面から m、柱の頭 1.15m＋少し）。主人公の足がこれより上なら柵に当たらない */
const FENCE_TOP = 1.2

/** 円の外へ歩ける範囲（props.ts の REACH_EXTRA_OUTER）＋少し。ここまでの木と岩には当たり判定を付ける */
const REACH_BAND = 40

/** 岩の当たり判定を形から付ける（歩ける範囲の外の岩は付けない） */
function addRock(colliders: Collider[], r: Region, geo: THREE.BufferGeometry, m: THREE.Matrix4): void {
  if (Math.hypot(m.elements[12] - r.x, m.elements[14] - r.z) > r.walk + REACH_BAND) return
  const c = rockCollider(geo, m)
  if (c) colliders.push(c)
}

function region(key: RegionKey): Region {
  return OUTER_REGIONS.find((r) => r.key === key) as Region
}

/** 原点からワールドの中心までの道（置き物を避ける帯）からの距離 */
function distToPath(x: number, z: number, r: Region): number {
  const len2 = r.x * r.x + r.z * r.z
  const t = Math.max(0, Math.min(1, (x * r.x + z * r.z) / len2))
  return Math.hypot(x - r.x * t, z - r.z * t)
}

/** ワールドの中に置き場所を散らす。spot（中心）のまわりと道はあける */
function scatter(rand: () => number, r: Region, count: number, opts: { min?: number; max: number; clearing: number; path: number }): Array<{ x: number; z: number }> {
  const out: Array<{ x: number; z: number }> = []
  let guard = 0
  while (out.length < count && guard++ < count * 20) {
    const a = rand() * Math.PI * 2
    const min = opts.min ?? 0
    const d = Math.sqrt(min * min + rand() * (opts.max * opts.max - min * min))
    const x = r.x + Math.cos(a) * d
    const z = r.z + Math.sin(a) * d
    if (Math.hypot(x - r.x, z - r.z) < opts.clearing) continue
    if (distToPath(x, z, r) < opts.path) continue
    out.push({ x, z })
  }
  return out
}

function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, count: number, shadow = true): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geo, mat, count)
  mesh.castShadow = shadow
  mesh.receiveShadow = true
  return mesh
}

function finish(...meshes: THREE.InstancedMesh[]): void {
  for (const m of meshes) {
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
    m.computeBoundingSphere()
  }
}

/** 北の世界: 雪をかぶったトウヒ（円錐 3 段＋雪の帽子）と、雪の乗った岩 */
function createNorth(rand: () => number, group: THREE.Group, colliders: Collider[], mobile: boolean): void {
  const r = region('north')
  const spots = scatter(rand, r, mobile ? 110 : 160, { max: r.walk + 40, clearing: 14, path: 7 })
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.3, 1, 6)
  trunkGeo.translate(0, 0.5, 0)
  const coneGeo = new THREE.ConeGeometry(1, 1, 8)
  coneGeo.translate(0, 0.5, 0)
  const trunks = instanced(trunkGeo, toonMaterial({ color: '#4d3627' }), spots.length)
  const cones = instanced(coneGeo, toonMaterial(), spots.length * 3)
  const caps = instanced(coneGeo, toonMaterial({ color: '#f6fafd' }), spots.length * 3, false)
  // トップの絵の、雪をかぶった深い緑のトウヒ
  const greenA = new THREE.Color('#257a44')
  const greenB = new THREE.Color('#3e9a5a')
  spots.forEach((t, i) => {
    const y = terrainHeight(t.x, t.z)
    const s = 0.8 + rand() * 0.7
    const h = (7 + rand() * 4) * s
    _q.setFromEuler(_e.set(0, rand() * Math.PI * 2, 0))
    _m.compose(_p.set(t.x, y - 0.2, t.z), _q, _s.set(s, h * 0.3, s))
    trunks.setMatrixAt(i, _m)
    _c.copy(greenA).lerp(greenB, rand())
    for (let k = 0; k < 3; k++) {
      const w = (2.4 - k * 0.6) * s
      const ch = h * (0.42 - k * 0.07)
      const cy = y + h * (0.18 + k * 0.24)
      _m.compose(_p.set(t.x, cy, t.z), _q, _s.set(w, ch, w))
      cones.setMatrixAt(i * 3 + k, _m)
      cones.setColorAt(i * 3 + k, _c)
      // 雪の帽子: 同じ円錐を小さく上へずらす
      _m.compose(_p.set(t.x, cy + ch * 0.42, t.z), _q, _s.set(w * 0.62, ch * 0.6, w * 0.62))
      caps.setMatrixAt(i * 3 + k, _m)
    }
    if (Math.hypot(t.x - r.x, t.z - r.z) < r.walk + REACH_BAND) colliders.push({ x: t.x, z: t.z, r: 0.5 * s })
  })
  finish(trunks, cones, caps)
  group.add(trunks, cones, caps)

  // 雪の乗った岩
  const rocks = scatter(rand, r, 40, { max: r.walk + 20, clearing: 10, path: 6 })
  const rockGeo = new THREE.IcosahedronGeometry(1, 0)
  const rockMesh = instanced(rockGeo, toonMaterial({ color: '#929cab' }), rocks.length)
  const snowMesh = instanced(rockGeo, toonMaterial({ color: '#f4f8fc' }), rocks.length, false)
  rocks.forEach((p, i) => {
    const s = 0.7 + rand() * 1.8
    const y = terrainHeight(p.x, p.z) - s * 0.3
    _q.setFromEuler(_e.set(rand(), rand() * 3, rand()))
    _m.compose(_p.set(p.x, y, p.z), _q, _s.set(s * 1.3, s * 0.8, s))
    rockMesh.setMatrixAt(i, _m)
    addRock(colliders, r, rockGeo, _m)
    _m.compose(_p.set(p.x, y + s * 0.35, p.z), _q, _s.set(s * 1.15, s * 0.5, s * 0.9))
    snowMesh.setMatrixAt(i, _m)
    addRock(colliders, r, rockGeo, _m)
  })
  finish(rockMesh, snowMesh)
  group.add(rockMesh, snowMesh)
}

/**
 * ジャングルの沼の水の素材（映り込みの描画はしない軽いシェーダー。スマホでも同じ）。
 * - 色: 真ん中は深い青、岸に近いほど浅い明るい青緑。斜めから見るほど空色を映す
 * - さざ波: 向きの違う波を重ねて面の向きをゆらし、日の向き（SUN_LIGHT_DIR）の照り返しを細く散らす
 * - きらめき: 小さなます目ごとに、照り返しの強い所で時々ちかっと光る点
 */
function createPondMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    fog: true,
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uTime: { value: 0 },
      uCenter: { value: new THREE.Vector2(JUNGLE_POND.x, JUNGLE_POND.z) },
      uRadius: { value: JUNGLE_POND.radius * 1.12 },
      uSun: { value: SUN_LIGHT_DIR.clone().normalize() },
      uDeep: { value: new THREE.Color('#1c64b0') },
      uShallow: { value: new THREE.Color('#3c9ccc') },
      uSky: { value: new THREE.Color('#bfe4ff') },
    },
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      varying vec3 vWorld;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      uniform float uTime;
      uniform vec2 uCenter;
      uniform float uRadius;
      uniform vec3 uSun;
      uniform vec3 uDeep;
      uniform vec3 uShallow;
      uniform vec3 uSky;
      varying vec3 vWorld;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main() {
        vec2 p = vWorld.xz;
        float t = uTime;
        // さざ波: 3 つの向きの波の傾き
        vec2 g = vec2(0.0);
        g += vec2(0.8, 0.6) * cos(dot(p, vec2(0.8, 0.6)) * 1.7 + t * 1.1) * 0.06;
        g += vec2(-0.5, 0.85) * cos(dot(p, vec2(-0.5, 0.85)) * 2.6 - t * 1.4) * 0.045;
        g += vec2(0.95, -0.3) * cos(dot(p, vec2(0.95, -0.3)) * 4.1 + t * 1.9) * 0.03;
        vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
        vec3 v = normalize(cameraPosition - vWorld);
        // 色: 真ん中は深く、岸は浅く
        float r = length(p - uCenter) / uRadius;
        vec3 col = mix(uDeep, uShallow, smoothstep(0.35, 1.0, r));
        // 空の映り込み（斜めから見るほど強い）
        float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
        col = mix(col, uSky, 0.05 + fres * 0.35);
        // 日の照り返し（細い）と、ゆるい光の帯
        vec3 h = normalize(uSun + v);
        float nh = max(dot(n, h), 0.0);
        float spec = pow(nh, 70.0);
        float sheen = pow(nh, 8.0);
        col += vec3(1.0, 0.97, 0.88) * (spec * 1.6 + sheen * 0.22);
        // 波の山に乗る細い光の線（ゆっくり流れる）
        float crest = sin(dot(p, vec2(0.6, 0.8)) * 2.3 + t * 1.2) * sin(dot(p, vec2(-0.7, 0.7)) * 1.9 - t * 0.9);
        col += vec3(0.85, 0.95, 1.0) * pow(max(crest, 0.0), 6.0) * 0.16;
        // きらめき: 0.5m のます目ごとに、時々ちかっと光る点（照り返しの向きに近い所ほど強い）
        vec2 cell = floor(p / 0.5);
        float rnd = hash(cell);
        float tw = sin(t * (1.6 + rnd * 2.4) + rnd * 6.2831) * 0.5 + 0.5;
        vec2 f = fract(p / 0.5) - 0.5 - (vec2(hash(cell + 3.1), hash(cell + 7.7)) - 0.5) * 0.5;
        float dotShape = smoothstep(0.09, 0.0, length(f));
        float glint = step(0.8, rnd) * pow(tw, 8.0) * dotShape * (0.45 + sheen * 2.0);
        col += vec3(1.0) * glint * 1.6;
        gl_FragColor = vec4(col, 0.9);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  })
}

/** ジャングル: 背の高い木（細い幹に濃い緑の玉）、ヤシ、シダ。目印は中心の奥の大木 */
function createJungle(rand: () => number, group: THREE.Group, colliders: Collider[], mobile: boolean): void {
  const r = region('jungle')
  // 広場は広めに: 日は西から差すので、西の高い木の影がスポットまで伸びないように
  // ワニの沼の中と岸には、木・ヤシ・シダを生やさない（rand は同じ数だけ使うので、ほかの場所の並びは変わらない）
  const offPond = (m: number) => (p: { x: number; z: number }) => Math.hypot(p.x - JUNGLE_POND.x, p.z - JUNGLE_POND.z) > JUNGLE_POND.radius + m
  const trees = scatter(rand, r, mobile ? 90 : 130, { max: r.walk + 40, clearing: 24, path: 7 }).filter(offPond(3.5))
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.45, 1, 7)
  trunkGeo.translate(0, 0.5, 0)
  const blobGeo = new THREE.IcosahedronGeometry(1, 1)
  const BLOBS = 4
  const trunks = instanced(trunkGeo, toonMaterial({ color: '#5b4330' }), trees.length)
  const blobs = instanced(blobGeo, toonMaterial(), trees.length * BLOBS)
  // トップの絵の、鮮やかで濃い緑の葉
  const leafA = new THREE.Color('#2f8a3e')
  const leafB = new THREE.Color('#5cb842')
  trees.forEach((t, i) => {
    const y = terrainHeight(t.x, t.z)
    const s = 0.8 + rand() * 0.6
    const h = (11 + rand() * 6) * s
    _q.setFromEuler(_e.set((rand() - 0.5) * 0.1, rand() * Math.PI * 2, (rand() - 0.5) * 0.1))
    _m.compose(_p.set(t.x, y - 0.3, t.z), _q, _s.set(s, h, s))
    trunks.setMatrixAt(i, _m)
    for (let b = 0; b < BLOBS; b++) {
      const a = (b / BLOBS) * Math.PI * 2 + rand()
      const rr = b === 0 ? 0 : 2.2 * s * (0.6 + rand() * 0.5)
      const bs = (b === 0 ? 3.4 : 2.6) * s * (0.85 + rand() * 0.3)
      _m.compose(
        _p.set(t.x + Math.cos(a) * rr, y + h - 0.6 + (rand() - 0.5) * 1.6 * s, t.z + Math.sin(a) * rr),
        _q.setFromEuler(_e.set(0, rand() * 3, 0)),
        _s.set(bs, bs * 0.72, bs),
      )
      blobs.setMatrixAt(i * BLOBS + b, _m)
      blobs.setColorAt(i * BLOBS + b, _c.copy(leafA).lerp(leafB, rand()))
    }
    if (Math.hypot(t.x - r.x, t.z - r.z) < r.walk + REACH_BAND) colliders.push({ x: t.x, z: t.z, r: 0.55 * s })
  })
  finish(trunks, blobs)
  group.add(trunks, blobs)

  // ヤシ: 少し曲がった幹に、垂れた細長い葉 6 枚
  const palms = scatter(rand, r, mobile ? 30 : 45, { max: r.walk + 10, clearing: 12, path: 6 }).filter(offPond(2.5))
  const leafGeo = new THREE.ConeGeometry(0.5, 4.2, 4)
  leafGeo.translate(0, 2.1, 0)
  leafGeo.rotateX(Math.PI / 2)
  const LEAVES = 6
  const palmTrunks = instanced(trunkGeo, toonMaterial({ color: '#7a5d3e' }), palms.length)
  const palmLeaves = instanced(leafGeo, toonMaterial({ color: '#5cb84c' }), palms.length * LEAVES)
  palms.forEach((t, i) => {
    const y = terrainHeight(t.x, t.z)
    const s = 0.8 + rand() * 0.4
    const h = (6 + rand() * 3) * s
    const lean = 0.12 + rand() * 0.12
    const yaw = rand() * Math.PI * 2
    _q.setFromEuler(_e.set(lean, yaw, 0, 'YXZ'))
    _m.compose(_p.set(t.x, y - 0.2, t.z), _q, _s.set(0.55 * s, h, 0.55 * s))
    palmTrunks.setMatrixAt(i, _m)
    const top = new THREE.Vector3(0, h, 0).applyQuaternion(_q).add(_p)
    for (let k = 0; k < LEAVES; k++) {
      const ly = (k / LEAVES) * Math.PI * 2 + rand() * 0.4
      _q.setFromEuler(_e.set(0.35 + rand() * 0.25, ly, 0, 'YXZ'))
      _m.compose(top, _q, _s.set(s, s, s))
      palmLeaves.setMatrixAt(i * LEAVES + k, _m)
    }
    colliders.push({ x: t.x, z: t.z, r: 0.4 * s })
  })
  finish(palmTrunks, palmLeaves)
  group.add(palmTrunks, palmLeaves)

  // シダ: 地面に広がる低い葉の束（当たり判定なし）
  const ferns = scatter(rand, r, mobile ? 380 : 800, { max: r.walk + 15, clearing: 5, path: 3 }).filter(offPond(0.5))
  const fernGeo = new THREE.ConeGeometry(0.28, 1.6, 3)
  fernGeo.translate(0, 0.8, 0)
  fernGeo.rotateX(1.05)
  const FRONDS = 5
  const fernMesh = instanced(fernGeo, toonMaterial(), ferns.length * FRONDS, false)
  const fernA = new THREE.Color('#4aa842')
  const fernB = new THREE.Color('#93cf4e')
  ferns.forEach((f, i) => {
    const y = terrainHeight(f.x, f.z)
    const s = 0.7 + rand() * 0.8
    _c.copy(fernA).lerp(fernB, rand())
    for (let k = 0; k < FRONDS; k++) {
      _q.setFromEuler(_e.set(0, (k / FRONDS) * Math.PI * 2 + rand() * 0.5, 0))
      _m.compose(_p.set(f.x, y, f.z), _q, _s.set(s, s, s))
      fernMesh.setMatrixAt(i * FRONDS + k, _m)
      fernMesh.setColorAt(i * FRONDS + k, _c)
    }
  })
  finish(fernMesh)
  // 葉は株の中心から 1m ほど広がる
  fernMesh.userData.clearAroundAnimals = 1.0
  group.add(fernMesh)

  // ワニの沼の水面: 青い水に、空の映り込み（斜めから見るほど空色）・ゆっくり動くさざ波・日の光の照り返しときらめき
  const pond = new THREE.Mesh(new THREE.CircleGeometry(JUNGLE_POND.radius * 1.12, 48).rotateX(-Math.PI / 2), createPondMaterial())
  pond.position.set(JUNGLE_POND.x, JUNGLE_POND.level, JUNGLE_POND.z)
  pond.name = 'jungle-pond'
  // 時間は描く直前に進める（ほかの更新の道を増やさない）
  pond.onBeforeRender = () => {
    ;(pond.material as THREE.ShaderMaterial).uniforms.uTime.value = performance.now() / 1000
  }
  group.add(pond)

  // 止まり木: 縦の幹と、東へ張り出した横枝（枝の先は細く）
  {
    const P = JUNGLE_PERCH
    const px = r.x + P.dx
    const pz = r.z + P.dz
    const py = terrainHeight(px, pz)
    const bark = toonMaterial({ color: '#6b4c33' })
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.5, P.height + 3.5, 9), bark)
    trunk.position.set(px, py + (P.height + 3.5) / 2 - 0.3, pz)
    const branch = new THREE.Mesh(new THREE.CylinderGeometry(P.radius * 0.7, P.radius, P.length, 8), bark)
    branch.rotation.z = Math.PI / 2
    branch.position.set(px + P.length / 2, py + P.height, pz)
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), toonMaterial({ color: '#3f9a44' }))
    crown.scale.set(3.4, 2.4, 3.4)
    crown.position.set(px - 0.5, py + P.height + 4.2, pz)
    for (const m of [trunk, branch, crown]) {
      m.castShadow = true
      m.receiveShadow = true
      group.add(m)
    }
    colliders.push({ x: px, z: pz, r: 0.6 })
  }

  // 目印の大木: 中心の北西。日は西から差すので、影がスポットにかからない側に置く
  const gx = r.x - 20
  const gz = r.z - 22
  const gy = terrainHeight(gx, gz)
  const giant = new THREE.Group()
  giant.position.set(gx, gy - 0.5, gz)
  const giantTrunk = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 3.2, 26, 10), toonMaterial({ color: '#5a412c' }))
  giantTrunk.position.y = 13
  giantTrunk.castShadow = true
  giant.add(giantTrunk)
  const giantLeaf = toonMaterial({ color: '#338a3f' })
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2
    const blob = new THREE.Mesh(blobGeo, giantLeaf)
    const rr = k === 0 ? 0 : 7
    blob.position.set(Math.cos(a) * rr, 26 + (k === 0 ? 3 : rand() * 2), Math.sin(a) * rr)
    blob.scale.set(k === 0 ? 10 : 7, k === 0 ? 6.5 : 4.6, k === 0 ? 10 : 7)
    blob.castShadow = true
    giant.add(blob)
  }
  group.add(giant)
  colliders.push({ x: gx, z: gz, r: 3.4 })
}

/** 南半球: 白い幹のユーカリ、赤い岩、とげとげの草むら。目印は奥の赤い一枚岩 */
function createSouth(rand: () => number, group: THREE.Group, colliders: Collider[], mobile: boolean): void {
  const r = region('south')
  const trees = scatter(rand, r, 34, { max: r.walk + 30, clearing: 16, path: 8 })
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.32, 1, 6)
  trunkGeo.translate(0, 0.5, 0)
  const blobGeo = new THREE.IcosahedronGeometry(1, 0)
  const BLOBS = 3
  const trunks = instanced(trunkGeo, toonMaterial({ color: '#e8e0d2' }), trees.length)
  const blobs = instanced(blobGeo, toonMaterial(), trees.length * BLOBS)
  // トップの絵のユーカリ: 灰色がかった緑を少し緑へ
  const gumA = new THREE.Color('#6f9a52')
  const gumB = new THREE.Color('#9cbb6c')
  trees.forEach((t, i) => {
    const y = terrainHeight(t.x, t.z)
    const s = 0.8 + rand() * 0.5
    const h = (6 + rand() * 3) * s
    _q.setFromEuler(_e.set((rand() - 0.5) * 0.25, rand() * Math.PI * 2, (rand() - 0.5) * 0.25))
    _m.compose(_p.set(t.x, y - 0.2, t.z), _q, _s.set(s, h, s))
    trunks.setMatrixAt(i, _m)
    const top = new THREE.Vector3(0, h, 0).applyQuaternion(_q).add(_p)
    for (let b = 0; b < BLOBS; b++) {
      const a = (b / BLOBS) * Math.PI * 2 + rand()
      const bs = 1.7 * s * (0.8 + rand() * 0.4)
      _m.compose(
        _p.set(top.x + Math.cos(a) * 1.4 * s, top.y - rand() * 1.2 * s, top.z + Math.sin(a) * 1.4 * s),
        _q.setFromEuler(_e.set(0, rand() * 3, 0)),
        _s.set(bs, bs * 0.6, bs),
      )
      blobs.setMatrixAt(i * BLOBS + b, _m)
      blobs.setColorAt(i * BLOBS + b, _c.copy(gumA).lerp(gumB, rand()))
    }
    if (Math.hypot(t.x - r.x, t.z - r.z) < r.walk + REACH_BAND) colliders.push({ x: t.x, z: t.z, r: 0.4 * s })
  })
  finish(trunks, blobs)
  group.add(trunks, blobs)

  // 赤い岩
  const rocks = scatter(rand, r, 50, { max: r.walk + 25, clearing: 10, path: 6 })
  const rockMesh = instanced(blobGeo, toonMaterial({ color: '#c4583a' }), rocks.length)
  rocks.forEach((p, i) => {
    const s = 0.5 + rand() * 1.6
    _q.setFromEuler(_e.set(rand(), rand() * 3, rand()))
    _m.compose(_p.set(p.x, terrainHeight(p.x, p.z) - s * 0.3, p.z), _q, _s.set(s * 1.4, s * 0.7, s))
    rockMesh.setMatrixAt(i, _m)
    addRock(colliders, r, blobGeo, _m)
  })
  finish(rockMesh)
  group.add(rockMesh)

  // とげとげの草むら（スピニフェックス風の丸い株）
  const tufts = scatter(rand, r, mobile ? 300 : 600, { max: r.walk + 15, clearing: 4, path: 3 })
  const tuftGeo = new THREE.IcosahedronGeometry(1, 0)
  const tuftMesh = instanced(tuftGeo, toonMaterial(), tufts.length, false)
  const tuftA = new THREE.Color('#dbb24a')
  const tuftB = new THREE.Color('#efcf6c')
  tufts.forEach((p, i) => {
    const s = 0.35 + rand() * 0.5
    _q.setFromEuler(_e.set(0, rand() * 3, 0))
    _m.compose(_p.set(p.x, terrainHeight(p.x, p.z), p.z), _q, _s.set(s * 1.3, s * 0.7, s * 1.3))
    tuftMesh.setMatrixAt(i, _m)
    tuftMesh.setColorAt(i, _c.copy(tuftA).lerp(tuftB, rand()))
  })
  finish(tuftMesh)
  tuftMesh.userData.clearAroundAnimals = 1.0
  group.add(tuftMesh)

  // 目印の赤い一枚岩: 中心の奥（サバンナと反対側）に、横長で角の丸い岩
  const mx = r.x
  const mz = r.z + 62
  const mono = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), toonMaterial({ color: '#c9573a' }))
  mono.scale.set(34, 13, 15)
  mono.position.set(mx, terrainHeight(mx, mz) - 3, mz)
  mono.castShadow = true
  mono.receiveShadow = true
  group.add(mono)
  // 当たり判定: 横長の楕円を、5m おきの円で覆う（端の地面から出ている所まで）
  {
    const ax = 34 * Math.sqrt(1 - (3.45 / 13) ** 2)
    const az = 15 * Math.sqrt(1 - (3.45 / 13) ** 2)
    const half = (x: number) => az * Math.sqrt(Math.max(0, 1 - (x / ax) ** 2))
    for (let dx = -30; dx <= 30; dx += 5) {
      const h = Math.max(half(dx - 2.5), half(dx + 2.5))
      colliders.push({ x: mx + dx, z: mz, r: Math.hypot(h, 2.5) + 0.3 })
    }
  }
}

/**
 * 水の世界の置き物。ペンギン・ペリカン・カワウソのまわり（residents.ts）と、潟・小川の中はあける。
 * 乱数はほかのワールドと別の列（いままでの木や岩の並びを変えない）
 */
function createWater(rand: () => number, group: THREE.Group, colliders: Collider[], mobile: boolean): void {
  const r = region('water')
  /** 海面からの高さ（置き場所を選ぶ条件。描いた地面に合わせる前の形の式で測る） */
  const rel = (x: number, z: number) => shapeHeight(x, z) - SEA_LEVEL
  /** 潟・小川の中か、そのすぐそば */
  const wet = (x: number, z: number, margin: number) => {
    const lx = x - r.x
    const lz = z - r.z
    return lagoonDist(lx, lz) < 1.05 + margin / LAGOON.rx || (lx > 18 && creekDist(lx, lz) < 3.5 + margin)
  }
  /** 動物のいるあたり（スポットの東の潟の南西と、南東の浜） */
  const nearResidents = (x: number, z: number) => {
    const lx = x - r.x
    const lz = z - r.z
    return lx > -6 && lx < 16 && lz > -18 && lz < 16
  }

  // 砂丘の浜の草: 細い葉 3 枚の株。波打ちぎわと潟の中には生やさない
  const tuftSpots = scatter(rand, r, mobile ? 520 : 1000, { max: r.walk + 30, clearing: 6, path: 3 }).filter(
    (p) => rel(p.x, p.z) > 0.8 && !wet(p.x, p.z, 0.5) && !nearResidents(p.x, p.z),
  )
  const bladeGeo = new THREE.ConeGeometry(0.06, 1, 3)
  bladeGeo.translate(0, 0.5, 0)
  const BLADES = 3
  const blades = instanced(bladeGeo, toonMaterial(), tuftSpots.length * BLADES, false)
  const grassA = new THREE.Color('#8cc24a')
  const grassB = new THREE.Color('#d2d977')
  tuftSpots.forEach((p, i) => {
    const y = terrainHeight(p.x, p.z)
    const s = 0.6 + rand() * 0.7
    _c.copy(grassA).lerp(grassB, rand())
    for (let k = 0; k < BLADES; k++) {
      _q.setFromEuler(_e.set((rand() - 0.5) * 0.9, (k / BLADES) * Math.PI * 2 + rand(), (rand() - 0.5) * 0.9))
      _m.compose(_p.set(p.x, y - 0.05, p.z), _q, _s.set(s, s * (0.7 + rand() * 0.5), s))
      blades.setMatrixAt(i * BLADES + k, _m)
      blades.setColorAt(i * BLADES + k, _c)
    }
  })
  finish(blades)
  group.add(blades)

  // ヤシ: 西の砂丘に少し。曲がった幹に垂れた葉 7 枚
  const palms = scatter(rand, r, 40, { min: 26, max: r.walk + 20, clearing: 26, path: 9 })
    .filter((p) => p.x - r.x < -8 && rel(p.x, p.z) > 1 && !wet(p.x, p.z, 3))
    .slice(0, mobile ? 12 : 18)
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.26, 1, 6)
  trunkGeo.translate(0, 0.5, 0)
  const leafGeo = new THREE.ConeGeometry(0.55, 4.0, 4)
  leafGeo.translate(0, 2.0, 0)
  leafGeo.rotateX(Math.PI / 2)
  const LEAVES = 7
  const palmTrunks = instanced(trunkGeo, toonMaterial({ color: '#9a7650' }), palms.length)
  const palmLeaves = instanced(leafGeo, toonMaterial(), palms.length * LEAVES)
  const leafA = new THREE.Color('#4fae46')
  const leafB = new THREE.Color('#86c84e')
  palms.forEach((t, i) => {
    const y = terrainHeight(t.x, t.z)
    const s = 0.85 + rand() * 0.4
    const h = (6.5 + rand() * 3) * s
    _q.setFromEuler(_e.set(0.14 + rand() * 0.16, rand() * Math.PI * 2, 0, 'YXZ'))
    _m.compose(_p.set(t.x, y - 0.2, t.z), _q, _s.set(s, h, s))
    palmTrunks.setMatrixAt(i, _m)
    const top = new THREE.Vector3(0, h, 0).applyQuaternion(_q).add(_p)
    _c.copy(leafA).lerp(leafB, rand())
    for (let k = 0; k < LEAVES; k++) {
      _q.setFromEuler(_e.set(0.3 + rand() * 0.3, (k / LEAVES) * Math.PI * 2 + rand() * 0.4, 0, 'YXZ'))
      _m.compose(top, _q, _s.set(s, s, s))
      palmLeaves.setMatrixAt(i * LEAVES + k, _m)
      palmLeaves.setColorAt(i * LEAVES + k, _c)
    }
    colliders.push({ x: t.x, z: t.z, r: 0.4 * s })
  })
  finish(palmTrunks, palmLeaves)
  group.add(palmTrunks, palmLeaves)

  // 葦: 潟と小川のふちに束で。茶色い穂をつける（ペリカン・カワウソのいる南西と北西のふちはあける）
  const reedSpots: Array<{ x: number; z: number }> = []
  for (let i = 0; i < 34; i++) {
    const a = rand() * Math.PI * 2
    const lx = LAGOON.dx + Math.cos(a) * LAGOON.rx * (1.0 + rand() * 0.15)
    const lz = LAGOON.dz + Math.sin(a) * LAGOON.rz * (1.0 + rand() * 0.15)
    if (lx < 12 && lz > -16) continue
    if (lx < 4) continue
    reedSpots.push({ x: r.x + lx, z: r.z + lz })
  }
  for (let i = 0; i < CREEK.length - 1; i++) {
    for (let k = 0; k < 6; k++) {
      const t = rand()
      const [ax, az] = CREEK[i]
      const [bx, bz] = CREEK[i + 1]
      const side = rand() < 0.5 ? -1 : 1
      const vx = bx - ax
      const vz = bz - az
      const len = Math.hypot(vx, vz)
      const off = side * (3.2 + rand() * 1.2)
      const lx = ax + vx * t + (-vz / len) * off
      const lz = az + vz * t + (vx / len) * off
      if (Math.hypot(lx, lz) > r.walk - 8) continue
      reedSpots.push({ x: r.x + lx, z: r.z + lz })
    }
  }
  const STEMS = 5
  const stemGeo = new THREE.CylinderGeometry(0.025, 0.035, 1, 4)
  stemGeo.translate(0, 0.5, 0)
  const headGeo = new THREE.CapsuleGeometry(0.05, 0.22, 2, 6)
  const stems = instanced(stemGeo, toonMaterial({ color: '#7fa850' }), reedSpots.length * STEMS, false)
  const heads = instanced(headGeo, toonMaterial({ color: '#8a5a36' }), reedSpots.length * STEMS, false)
  reedSpots.forEach((p, i) => {
    const y = terrainHeight(p.x, p.z)
    for (let k = 0; k < STEMS; k++) {
      const h = 1.2 + rand() * 0.8
      const x = p.x + (rand() - 0.5) * 0.7
      const z = p.z + (rand() - 0.5) * 0.7
      _q.setFromEuler(_e.set((rand() - 0.5) * 0.25, 0, (rand() - 0.5) * 0.25))
      _m.compose(_p.set(x, y - 0.1, z), _q, _s.set(1, h, 1))
      stems.setMatrixAt(i * STEMS + k, _m)
      const top = new THREE.Vector3(0, h - 0.15, 0).applyQuaternion(_q).add(_p)
      _m.compose(top, _q, _s.set(1, 1, 1))
      heads.setMatrixAt(i * STEMS + k, _m)
    }
  })
  finish(stems, heads)
  group.add(stems, heads)

  // 浜の岩: ペンギンのいる浜の奥にひとかたまり＋波打ちぎわにぽつぽつ
  const rockGeo = new THREE.IcosahedronGeometry(1, 1)
  const rockPlaces: Array<{ x: number; z: number; s: number }> = [
    { x: r.x + 13.5, z: r.z + 12, s: 1.7 },
    { x: r.x + 14.5, z: r.z + 8.2, s: 1.2 },
    { x: r.x + 11.8, z: r.z + 15.2, s: 1.3 },
    { x: r.x + 3.8, z: r.z + 14.6, s: 0.9 },
    { x: r.x + 16.2, z: r.z + 14.4, s: 0.9 },
  ]
  for (let i = 0; i < 46; i++) {
    const a = rand() * Math.PI * 2
    const d = 82 + rand() * 30
    const x = r.x + Math.cos(a) * d
    const z = r.z + Math.sin(a) * d
    const h = rel(x, z)
    if (h > 1.2 || h < -1.5 || x - r.x < -40) continue
    rockPlaces.push({ x, z, s: 0.5 + rand() * 1.4 })
  }
  const rocks = instanced(rockGeo, toonMaterial(), rockPlaces.length)
  const rockA = new THREE.Color('#8f9aa2')
  const rockB = new THREE.Color('#b6bcc0')
  rockPlaces.forEach((p, i) => {
    _q.setFromEuler(_e.set(rand(), rand() * 3, rand()))
    _m.compose(_p.set(p.x, terrainHeight(p.x, p.z) - p.s * 0.3, p.z), _q, _s.set(p.s * 1.3, p.s * 0.75, p.s))
    rocks.setMatrixAt(i, _m)
    rocks.setColorAt(i, _c.copy(rockA).lerp(rockB, rand()))
    addRock(colliders, r, rockGeo, _m)
  })
  finish(rocks)
  group.add(rocks)

  // 流木: 浜に横たわる白っぽい丸太
  const logs = scatter(rand, r, 14, { min: 55, max: r.walk - 4, clearing: 30, path: 8 }).filter((p) => {
    const h = rel(p.x, p.z)
    return h > 0.15 && h < 1.4 && !wet(p.x, p.z, 2)
  })
  const logGeo = new THREE.CylinderGeometry(0.18, 0.24, 1, 7)
  logGeo.rotateZ(Math.PI / 2)
  const logMesh = instanced(logGeo, toonMaterial({ color: '#c9b59a' }), logs.length)
  logs.forEach((p, i) => {
    const len = 2.4 + rand() * 2.4
    _q.setFromEuler(_e.set(0, rand() * Math.PI, (rand() - 0.5) * 0.08))
    _m.compose(_p.set(p.x, terrainHeight(p.x, p.z) + 0.1, p.z), _q, _s.set(len, 1, 1))
    logMesh.setMatrixAt(i, _m)
    colliders.push({ x: p.x, z: p.z, r: 0.5 })
  })
  finish(logMesh)
  group.add(logMesh)

  // 貝殻とヒトデ: 波打ちぎわの近くに小さく（当たり判定なし）
  const shells = scatter(rand, r, mobile ? 120 : 220, { min: 40, max: r.walk + 4, clearing: 12, path: 2 }).filter((p) => {
    const h = rel(p.x, p.z)
    return h > 0.05 && h < 0.9
  })
  const starGeo = new THREE.ConeGeometry(0.16, 0.05, 5)
  const shellMesh = instanced(starGeo, toonMaterial(), shells.length, false)
  const shellColors = ['#f38a6a', '#f6b26b', '#f7d9c4', '#e98aa6'].map((c) => new THREE.Color(c))
  shells.forEach((p, i) => {
    const s = 0.7 + rand() * 0.7
    _q.setFromEuler(_e.set(0, rand() * Math.PI * 2, 0))
    _m.compose(_p.set(p.x, terrainHeight(p.x, p.z) + 0.02, p.z), _q, _s.set(s, s, s))
    shellMesh.setMatrixAt(i, _m)
    shellMesh.setColorAt(i, shellColors[Math.floor(rand() * shellColors.length)])
  })
  finish(shellMesh)
  group.add(shellMesh)

  // 目印: 沖の岩のアーチと、まわりの岩の柱（東の海。上に草をのせる）
  const stone = toonMaterial({ color: '#a39f98' })
  const grassTop = toonMaterial({ color: '#7cc25a' })
  const ax = r.x + 132
  const az = r.z + 16
  const arch = new THREE.Group()
  arch.position.set(ax, SEA_LEVEL - 2, az)
  arch.rotation.y = 0.35
  const ring = new THREE.Mesh(new THREE.TorusGeometry(11, 3.6, 8, 22, Math.PI), stone)
  ring.scale.set(1, 1.5, 1)
  arch.add(ring)
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 4.6, 8, 9), stone)
    leg.position.set(side * 11, -1, 0)
    arch.add(leg)
  }
  const cap = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), grassTop)
  cap.scale.set(6.5, 1.6, 3.6)
  cap.position.set(0, (11 + 3.6) * 1.5 - 0.6, 0)
  arch.add(cap)
  const stacks: Array<[number, number, number, number]> = [
    [ax + 22, az - 14, 3.2, 15],
    [ax - 12, az + 26, 2.4, 9],
    [ax + 8, az + 30, 1.8, 6],
  ]
  for (const [sx, sz, sr, sh] of stacks) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(sr * 0.75, sr, sh + 2, 8), stone)
    col.position.set(sx - ax, sh / 2 - 1, sz - az)
    col.rotation.y = rand()
    const top = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), grassTop)
    top.scale.set(sr * 0.85, sr * 0.35, sr * 0.85)
    top.position.set(sx - ax, sh, sz - az)
    arch.add(col, top)
  }
  arch.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true
      o.receiveShadow = true
    }
  })
  group.add(arch)
}

/** ふれあいワールドの中心から峠（原点）への向き */
function partnerToOrigin(r: Region): number {
  return Math.atan2(-r.z, -r.x)
}

/** ヤギの岩場の板の岩（createPartner で作る）。ヤギを板の上に立たせるのに使う */
let goatSlabs: THREE.InstancedMesh | null = null
const _ray = new THREE.Raycaster()
const _down = new THREE.Vector3(0, -1, 0)
const _from = new THREE.Vector3()
/** ヤギの岩場で足を置ける高さ: 地面と、板の岩の上面の高いほう（置き物を作った後に呼ぶ） */
export function goatRockSupport(x: number, z: number): number {
  const g = terrainHeight(x, z)
  if (!goatSlabs) return g
  _from.set(x, g + 3, z)
  _ray.set(_from, _down)
  _ray.far = 3.5
  const hit = _ray.intersectObject(goatSlabs, false)[0]
  return hit && hit.point.y > g ? hit.point.y : g
}

/** ふれあいワールド: 放牧場の木の柵、赤い納屋、干し草、丸い木、花。乱数は別の列 */
function createPartner(rand: () => number, group: THREE.Group, colliders: Collider[], mobile: boolean): void {
  const r = region('partner')
  const a0 = partnerToOrigin(r)
  const pens = farmPens()
  const inPen = (x: number, z: number, margin: number) => pens.some((p) => Math.hypot(x - r.x - p.x, z - r.z - p.z) < p.r + margin)
  const onPath = (x: number, z: number, margin: number) => farmPathDist(x - r.x, z - r.z) < 3 + margin

  // 柵: 柱と横木 2 本。入り口の 1 区間だけ開ける。柱と区間の中ほどに当たり判定（すき間から入れない）
  const wood = toonMaterial({ color: '#b07a48' })
  const postGeo = new THREE.CylinderGeometry(0.09, 0.11, 1.2, 6)
  postGeo.translate(0, 0.6, 0)
  const railGeo = new THREE.BoxGeometry(1, 0.1, 0.06)
  const posts: Array<{ x: number; z: number }> = []
  const rails: Array<{ x: number; z: number; len: number; yaw: number }> = []
  for (const p of pens) {
    const n = Math.round((Math.PI * 2 * p.r) / 2.6)
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      const b = ((i + 1) / n) * Math.PI * 2
      const ax = r.x + p.x + Math.cos(a) * p.r
      const az = r.z + p.z + Math.sin(a) * p.r
      const bx = r.x + p.x + Math.cos(b) * p.r
      const bz = r.z + p.z + Math.sin(b) * p.r
      posts.push({ x: ax, z: az })
      // 上端は柱の頭（地面から 1.15m）。ジャンプ（約 2.5m）で跳び越えられる
      colliders.push({ x: ax, z: az, r: 0.35, top: terrainHeight(ax, az) + FENCE_TOP })
      const mid = (a + b) / 2
      const gateGap = Math.abs(Math.atan2(Math.sin(mid - p.gate), Math.cos(mid - p.gate))) < Math.PI / n
      if (gateGap) continue
      rails.push({ x: (ax + bx) / 2, z: (az + bz) / 2, len: Math.hypot(bx - ax, bz - az), yaw: Math.atan2(-(bz - az), bx - ax) })
      colliders.push({ x: (ax + bx) / 2, z: (az + bz) / 2, r: 0.75, top: Math.max(terrainHeight(ax, az), terrainHeight(bx, bz)) + FENCE_TOP })
    }
  }
  const postMesh = instanced(postGeo, wood, posts.length)
  posts.forEach((p, i) => {
    _m.compose(_p.set(p.x, terrainHeight(p.x, p.z) - 0.05, p.z), _q.identity(), _s.set(1, 1, 1))
    postMesh.setMatrixAt(i, _m)
  })
  const railMesh = instanced(railGeo, wood, rails.length * 2)
  rails.forEach((rl, i) => {
    const y = (terrainHeight(rl.x, rl.z) + terrainHeight(rl.x, rl.z)) / 2
    _q.setFromEuler(_e.set(0, rl.yaw, 0))
    for (let k = 0; k < 2; k++) {
      _m.compose(_p.set(rl.x, y + 0.5 + k * 0.42, rl.z), _q, _s.set(rl.len + 0.1, 1, 1))
      railMesh.setMatrixAt(i * 2 + k, _m)
    }
  })
  finish(postMesh, railMesh)
  group.add(postMesh, railMesh)

  // 目印の赤い納屋: 広場の向こう（峠と反対の側）。白い縁どりと大きな戸
  const barnA = a0 + Math.PI * 0.78
  const bx = r.x + Math.cos(barnA) * 82
  const bz = r.z + Math.sin(barnA) * 82
  const by = terrainHeight(bx, bz)
  const barn = new THREE.Group()
  barn.position.set(bx, by - 0.2, bz)
  // 戸が広場の方を向く
  barn.rotation.y = Math.atan2(r.x - bx, r.z - bz)
  const red = toonMaterial({ color: '#c8402f' })
  const white = toonMaterial({ color: '#f6f1e6' })
  const roofMat = toonMaterial({ color: '#6a4a3a' })
  const body = new THREE.Mesh(new THREE.BoxGeometry(12, 7, 9), red)
  body.position.y = 3.5
  // 切妻の屋根: 三角柱（棟は戸のある面から奥へ）
  const roofGeo = new THREE.CylinderGeometry(7.2, 7.2, 9.8, 3, 1)
  roofGeo.rotateZ(Math.PI / 2)
  roofGeo.rotateX(-Math.PI / 2)
  const roof = new THREE.Mesh(roofGeo, roofMat)
  roof.rotation.y = Math.PI / 2
  roof.scale.set(1, 0.42, 1)
  roof.position.y = 7 + 0.5 * 7.2 * 0.42
  const door = new THREE.Mesh(new THREE.BoxGeometry(4.4, 4.6, 0.2), white)
  door.position.set(0, 2.3, 4.55)
  const doorIn = new THREE.Mesh(new THREE.BoxGeometry(3.8, 4.0, 0.22), red)
  doorIn.position.set(0, 2.25, 4.57)
  const cross1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 5.4, 0.24), white)
  cross1.position.set(0, 2.25, 4.6)
  cross1.rotation.z = Math.atan2(3.8, 4.0)
  const cross2 = cross1.clone()
  cross2.rotation.z = -cross1.rotation.z
  const loft = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.6, 0.2), white)
  loft.position.set(0, 8.1, 4.95)
  for (const m of [body, roof, door, doorIn, cross1, cross2, loft]) {
    m.castShadow = true
    m.receiveShadow = true
    barn.add(m)
  }
  group.add(barn)
  // 当たり判定: 横長の箱（12m × 9m）を、長い向きに並べた 2 つの円で覆う（角まで）
  {
    const ux = Math.cos(barn.rotation.y)
    const uz = -Math.sin(barn.rotation.y)
    for (const k of [-3, 3]) colliders.push({ x: bx + ux * k, z: bz + uz * k, r: Math.hypot(3, 4.5) + 0.1 })
  }

  // 干し草のロール: 納屋のまわりと放牧場の外に
  const bales: Array<{ x: number; z: number }> = []
  for (let i = 0; i < 7; i++) {
    const a = barnA + (rand() - 0.5) * 0.5
    const d = 66 + rand() * 10
    bales.push({ x: r.x + Math.cos(a) * d, z: r.z + Math.sin(a) * d })
  }
  const baleGeo = new THREE.CylinderGeometry(0.75, 0.75, 1.2, 14)
  baleGeo.rotateZ(Math.PI / 2)
  const baleMesh = instanced(baleGeo, toonMaterial({ color: '#e9c862' }), bales.length)
  bales.forEach((b, i) => {
    _q.setFromEuler(_e.set(0, rand() * Math.PI, 0))
    _m.compose(_p.set(b.x, terrainHeight(b.x, b.z) + 0.68, b.z), _q, _s.set(1, 1, 1))
    baleMesh.setMatrixAt(i, _m)
    colliders.push({ x: b.x, z: b.z, r: 0.9 })
  })
  finish(baleMesh)
  group.add(baleMesh)

  // 丸い木: 細い幹にふっくらした明るい緑の玉 2〜3 個。放牧場・小道・広場はあける
  const trees = scatter(rand, r, mobile ? 70 : 100, { min: 44, max: r.walk + 40, clearing: 40, path: 10 }).filter(
    (p) => !inPen(p.x, p.z, 3) && !onPath(p.x, p.z, 2) && Math.hypot(p.x - bx, p.z - bz) > 12,
  )
  const trunkGeo = new THREE.CylinderGeometry(0.2, 0.32, 1, 6)
  trunkGeo.translate(0, 0.5, 0)
  const blobGeo = new THREE.IcosahedronGeometry(1, 1)
  const BLOBS = 3
  const trunks = instanced(trunkGeo, toonMaterial({ color: '#7a5636' }), trees.length)
  const blobs = instanced(blobGeo, toonMaterial(), trees.length * BLOBS)
  const leafA = new THREE.Color('#5cb84a')
  const leafB = new THREE.Color('#94d45c')
  trees.forEach((t, i) => {
    const y = terrainHeight(t.x, t.z)
    // お店（大きな木）のまわりの木は出さない。乱数は同じ数だけ引くので、ほかの木の並びは変わらない
    const s = (0.8 + rand() * 0.5) * (shopClears(t.x, t.z) ? 0 : 1)
    const h = (3.2 + rand() * 1.6) * s
    _q.setFromEuler(_e.set(0, rand() * Math.PI * 2, 0))
    _m.compose(_p.set(t.x, y - 0.2, t.z), _q, _s.set(s, h, s))
    trunks.setMatrixAt(i, _m)
    for (let b = 0; b < BLOBS; b++) {
      const a = (b / BLOBS) * Math.PI * 2 + rand()
      const rr = b === 0 ? 0 : 1.2 * s
      const bs = (b === 0 ? 2.5 : 1.8) * s * (0.85 + rand() * 0.3)
      _m.compose(_p.set(t.x + Math.cos(a) * rr, y + h + (b === 0 ? 1 : 0.2) * s, t.z + Math.sin(a) * rr), _q, _s.set(bs, bs * 0.85, bs))
      blobs.setMatrixAt(i * BLOBS + b, _m)
      blobs.setColorAt(i * BLOBS + b, _c.copy(leafA).lerp(leafB, rand()))
    }
    if (s > 0 && Math.hypot(t.x - r.x, t.z - r.z) < r.walk + REACH_BAND) colliders.push({ x: t.x, z: t.z, r: 0.5 * s })
  })
  finish(trunks, blobs)
  group.add(trunks, blobs)

  // グッズのお店（大きな木）: ポニーの放牧場の奥、山のふもと
  createShopHouse(group, colliders, mobile)

  // 花: 牧草地のところどころに小さな花の群れ（白・黄・桃・水色）。当たり判定なし
  const flowerSpots: Array<{ x: number; z: number }> = []
  const clumps = scatter(rand, r, mobile ? 50 : 80, { min: 10, max: r.walk + 10, clearing: 9, path: 4 })
  for (const c of clumps) {
    if (onPath(c.x, c.z, 1) || inPen(c.x, c.z, 1)) continue
    for (let k = 0; k < 9; k++) flowerSpots.push({ x: c.x + (rand() - 0.5) * 3.2, z: c.z + (rand() - 0.5) * 3.2 })
  }
  const flowerGeo = new THREE.IcosahedronGeometry(0.13, 0)
  const flowerMesh = instanced(flowerGeo, toonMaterial(), flowerSpots.length, false)
  const flowerColors = ['#ffffff', '#ffe066', '#ff9ec4', '#9fd8ff'].map((c) => new THREE.Color(c))
  flowerSpots.forEach((f, i) => {
    _m.compose(_p.set(f.x, terrainHeight(f.x, f.z) + 0.16, f.z), _q.identity(), _s.set(1, 0.7, 1))
    flowerMesh.setMatrixAt(i, _m)
    flowerMesh.setColorAt(i, flowerColors[Math.floor(rand() * flowerColors.length)])
  })
  finish(flowerMesh)
  group.add(flowerMesh)

  // ヤギの岩場: 岩山のまわりの岩の飾り、横に立つ岩の柱、てっぺんから柱へ渡す板の橋
  {
    const gx = r.x + GOAT_ROCKS.dx
    const gz = r.z + GOAT_ROCKS.dz
    const stone = toonMaterial({ color: '#9c948e' })
    // 岩の板: 段ごとに平たい岩を半分埋めて並べ、のっぺりした丘ではなく、ごつごつした岩場に見せる。
    // 板の上面は、板の下でいちばん低い地面のすぐ上（0.3m まで）に収めるので、段の縁にかかる板でも上を歩ける（当たり判定なし。主人公がめり込まない）。
    // ヤギは板の上に立つよう少し持ち上げる（residents.ts）。縁にはごろごろした岩
    const slabs: Array<{ x: number; z: number; s: number; flat: number }> = []
    const rings: Array<[number, number]> = [
      [0.0, 2],
      [0.24, 7],
      [0.42, 10],
      [0.6, 14],
      [0.76, 17],
      [0.92, 20],
    ]
    for (const [f, n] of rings) {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rand() * 0.35
        const d = GOAT_ROCKS.radius * f * (0.92 + rand() * 0.16) + (f === 0 ? rand() * 1.5 : 0)
        // 入り口の坂の真ん中（登り道）はあけて、踏み石を並べる（下）
        if (f > 0.2 && Math.cos(a - GOAT_ROCKS.gate) > 0.96) continue
        slabs.push({ x: gx + Math.cos(a) * d, z: gz + Math.sin(a) * d, s: (f > 0.85 ? 1.0 : 1.7) * (0.75 + rand() * 0.5), flat: f > 0.85 ? 0.75 : 0.42 })
      }
    }
    // 登り道の踏み石: 入り口から頂上へ、平たい石を段に
    for (let k = 0; k < 6; k++) {
      const d = GOAT_ROCKS.radius * (1.02 - k * 0.17)
      const a = GOAT_ROCKS.gate + (k % 2 ? 0.08 : -0.08)
      slabs.push({ x: gx + Math.cos(a) * d, z: gz + Math.sin(a) * d, s: 1.05, flat: 0.28 })
    }
    const slabGeo = new THREE.IcosahedronGeometry(1, 0)
    const slabMesh = instanced(slabGeo, toonMaterial(), slabs.length)
    const rockA = new THREE.Color('#9e968f')
    const rockB = new THREE.Color('#bdb5ab')
    slabs.forEach((b, i) => {
      _q.setFromEuler(_e.set((rand() - 0.5) * 0.25, rand() * 3, (rand() - 0.5) * 0.25))
      _p.set(b.x, terrainHeight(b.x, b.z) - b.s * b.flat * 0.72, b.z)
      // 段の縁にかかって下の段から高く出る板は、少し小さくして段の上に収め、それでも出る分だけ沈める
      let rise = Infinity
      for (const k of [1, 0.85, 0.7]) {
        _m.compose(_p, _q, _s.set(b.s * 1.4 * k, b.s * b.flat, b.s * 1.2 * k))
        rise = rockRise(slabGeo, _m)
        if (rise <= GOAT_SLAB_RISE) break
      }
      if (rise > GOAT_SLAB_RISE) _m.compose(_p.setY(_p.y - (rise - GOAT_SLAB_RISE)), _q, _s)
      slabMesh.setMatrixAt(i, _m)
      slabMesh.setColorAt(i, _c.copy(rockA).lerp(rockB, rand()))
    })
    finish(slabMesh)
    group.add(slabMesh)
    goatSlabs = slabMesh
    // 岩の柱: 岩山の横（入り口から見て左）。平らな頂に板を張る
    const side = GOAT_ROCKS.gate + Math.PI / 2
    const px = gx + Math.cos(side) * 12.5
    const pz = gz + Math.sin(side) * 12.5
    const startD = 3.2
    const sx = gx + Math.cos(side) * startD
    const sz = gz + Math.sin(side) * startD
    const sy = terrainHeight(sx, sz)
    const groundY = terrainHeight(px, pz)
    const pillarTop = sy - 0.3
    const pillar = new THREE.Group()
    pillar.position.set(px, groundY, pz)
    const tall = pillarTop - groundY
    for (let k = 0; k < 3; k++) {
      const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), stone)
      const t = (k + 0.5) / 3
      rock.position.y = tall * t - 0.2
      rock.scale.set(1.9 - k * 0.25, tall / 3 * 0.75, 1.7 - k * 0.2)
      rock.rotation.y = k * 1.3
      pillar.add(rock)
    }
    const deckGeo = new THREE.CylinderGeometry(1.5, 1.5, 0.18, 10)
    const deck = new THREE.Mesh(deckGeo, wood)
    deck.position.y = tall + 0.05
    pillar.add(deck)
    pillar.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true
        o.receiveShadow = true
      }
    })
    group.add(pillar)
    // 柱の岩は横からは登れない。頂の台（板の高さ）にいる時は当たらない
    const deckY = pillarTop + 0.14
    colliders.push({ x: px, z: pz, r: 1.9, top: deckY - 0.3, deck: true })
    // 板の橋: 岩山の上から柱の頂へ。板を並べ、両側に細い手すり
    const ex = px - Math.cos(side) * 1.3
    const ez = pz - Math.sin(side) * 1.3
    const ey = pillarTop + 0.14
    const len = Math.hypot(ex - sx, ez - sz)
    const bridge = new THREE.Group()
    bridge.position.set(sx, sy + 0.1, sz)
    // 向き（y）のあとに傾き（x）をかける
    bridge.rotation.order = 'YXZ'
    bridge.rotation.y = Math.atan2(ex - sx, ez - sz)
    const drop = ey - (sy + 0.1)
    bridge.rotation.x = -Math.atan2(drop, len)
    const span = Math.hypot(len, drop)
    const PLANKS = Math.round(span / 0.32)
    const plankGeo = new THREE.BoxGeometry(1.1, 0.07, 0.26)
    const planks = instanced(plankGeo, wood, PLANKS)
    for (let k = 0; k < PLANKS; k++) {
      _m.compose(_p.set(0, 0, (k + 0.5) * (span / PLANKS)), _q.identity(), _s.set(1, 1, 1))
      planks.setMatrixAt(k, _m)
    }
    finish(planks)
    planks.computeBoundingSphere()
    bridge.add(planks)
    for (const sgn of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, span), wood)
      rail.position.set(sgn * 0.55, 0.55, span / 2)
      bridge.add(rail)
      for (let k = 0; k <= 4; k++) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.55, 0.06), wood)
        post.position.set(sgn * 0.55, 0.27, (k / 4) * span)
        bridge.add(post)
      }
    }
    bridge.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true
    })
    group.add(bridge)
    // 上を歩ける面: 板の上面（板の中心から 0.035m 上）と、柱の頂の台。手すりの内側（0.55m − 体の半分ほど）から出ない。
    // 橋の始まりは岩山の上の地面より少し外へのばし、地面から段差なく乗れるようにする
    const pad = 0.6
    const top0 = { x: sx - Math.cos(side) * pad, z: sz - Math.sin(side) * pad, y: sy + 0.1 + 0.035 }
    const top1 = { x: ex, z: ez, y: ey + 0.035 }
    addWalkSurface(rampSurface(top0, top1, 0.62, 0.22, [{ x: sx, z: sz }], [planks]))
    addWalkSurface(deckSurface(px, pz, 1.5, deckY, [{ x: sx, z: sz }, { x: ex, z: ez }], [deck]))
  }

  // 広場の水飲みおけ（木の箱に水色の水面）
  const tx = r.x + Math.cos(a0 + Math.PI / 2) * 9
  const tz = r.z + Math.sin(a0 + Math.PI / 2) * 9
  const trough = new THREE.Group()
  trough.position.set(tx, terrainHeight(tx, tz), tz)
  trough.rotation.y = -a0
  const box = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.6, 0.9), wood)
  box.position.y = 0.3
  const waterTop = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.05, 0.65), toonMaterial({ color: '#8fd0ee' }))
  waterTop.position.y = 0.6
  box.castShadow = true
  trough.add(box, waterTop)
  group.add(trough)
  colliders.push({ x: tx, z: tz, r: 1.2 })
}

/**
 * 空の世界の止まり木。鳥はこの上に置く（residents.ts）。中心からの向きは、峠（原点）の向きを 0 として測る。
 * ・タカ・ハヤブサ: 峠から入って右手の、T 字の止まり木の杭（フライト場）
 * ・フクロウ: 広場の奥（峠と反対の側）の、2 列の弧に並べた丸太の止まり木
 * ・インコ・オウム: 峠から入って左手の、横枝を張った止まり木の木
 * ・コンドル: インコの木の奥の大きな岩の上
 * y は止まり木の上面の世界の高さ、face は広場（中心）を向く向き
 */
export interface SkyPerch {
  x: number
  y: number
  z: number
  face: number
}
const SKY_HAWK_POSTS = 6
const SKY_OWL_ROWS: Array<{ d: number; n: number; h: [number, number] }> = [
  { d: 15.5, n: 12, h: [0.45, 0.62] },
  { d: 20.5, n: 12, h: [0.8, 1.0] },
]
/** インコの木: 中心からの向き（峠からの角度）と距離、横枝の高さ・張り出しの向き・長さ */
const SKY_PARROT_TREE = { a: -0.95, d: 16, branches: [[1.7, 0.4, 2.2], [2.3, 2.4, 2.0], [2.9, -1.2, 2.3], [3.5, 1.4, 1.7], [4.1, -2.6, 1.5]] as Array<[number, number, number]> }
const SKY_VULTURE_ROCK = { a: -1.7, d: 23, h: 1.5, r: 1.6 }
let skyPerchCache: { hawk: SkyPerch[]; owl: SkyPerch[]; parrot: SkyPerch[]; vulture: SkyPerch[] } | null = null
export function skyPerches(): { hawk: SkyPerch[]; owl: SkyPerch[]; parrot: SkyPerch[]; vulture: SkyPerch[] } {
  if (skyPerchCache) return skyPerchCache
  const r = region('sky')
  const a0 = Math.atan2(-r.z, -r.x)
  const face = (x: number, z: number) => Math.atan2(r.x - x, r.z - z)
  const hawk: SkyPerch[] = []
  for (let i = 0; i < SKY_HAWK_POSTS; i++) {
    const a = a0 + 0.62 + i * 0.19
    const d = 17 + (i % 2) * 3.5
    const x = r.x + Math.cos(a) * d
    const z = r.z + Math.sin(a) * d
    hawk.push({ x, z, y: terrainHeight(x, z) + 1.0 + (i % 3) * 0.15, face: face(x, z) })
  }
  const owl: SkyPerch[] = []
  SKY_OWL_ROWS.forEach((row, ri) => {
    for (let i = 0; i < row.n; i++) {
      // 後ろの列は半分ずらして、前の列の子に隠れないように
      const a = a0 + Math.PI + ((i + ri * 0.5) / (row.n - 1) - 0.5 - ri * 0.02) * 1.9
      const x = r.x + Math.cos(a) * row.d
      const z = r.z + Math.sin(a) * row.d
      owl.push({ x, z, y: terrainHeight(x, z) + row.h[i % 2], face: face(x, z) })
    }
  })
  const ta = a0 + SKY_PARROT_TREE.a
  const tx = r.x + Math.cos(ta) * SKY_PARROT_TREE.d
  const tz = r.z + Math.sin(ta) * SKY_PARROT_TREE.d
  const ty = terrainHeight(tx, tz)
  const parrot: SkyPerch[] = []
  for (const [h, dir, len] of SKY_PARROT_TREE.branches) {
    // 枝の先寄りと中ほどに 1 羽ずつ（低い 3 本は 2 羽、上の 2 本は 1 羽）
    const n = h < 3 ? 2 : 1
    for (let k = 0; k < n; k++) {
      const t = n === 1 ? 0.7 : 0.45 + k * 0.4
      const x = tx + Math.cos(dir) * len * t
      const z = tz + Math.sin(dir) * len * t
      parrot.push({ x, z, y: ty + h + 0.08, face: face(x, z) })
    }
  }
  const va = a0 + SKY_VULTURE_ROCK.a
  const vx = r.x + Math.cos(va) * SKY_VULTURE_ROCK.d
  const vz = r.z + Math.sin(va) * SKY_VULTURE_ROCK.d
  const vulture: SkyPerch[] = [{ x: vx, z: vz, y: terrainHeight(vx, vz) + SKY_VULTURE_ROCK.h, face: face(vx, vz) }]
  skyPerchCache = { hawk, owl, parrot, vulture }
  return skyPerchCache
}

/** 空の世界: 鳥の止まり木（杭・丸太・木・岩）、高原の岩の塔、旗、高原の木と花。乱数は別の列 */
function createSky(rand: () => number, group: THREE.Group, colliders: Collider[], mobile: boolean): void {
  const r = region('sky')
  const a0 = Math.atan2(-r.z, -r.x)
  const perches = skyPerches()
  const wood = toonMaterial({ color: '#8a5e3a' })
  const woodDark = toonMaterial({ color: '#6a4628' })
  const onPath = (x: number, z: number, margin: number) => skyPathDist(x - r.x, z - r.z) < 3 + margin

  // タカの止まり木: 杭の上に、草を巻いたような T 字の横木
  const postGeo = new THREE.CylinderGeometry(0.07, 0.09, 1, 6)
  postGeo.translate(0, 0.5, 0)
  const barGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.7, 8)
  barGeo.rotateZ(Math.PI / 2)
  const hawkPosts = instanced(postGeo, woodDark, perches.hawk.length)
  const hawkBars = instanced(barGeo, toonMaterial({ color: '#c8a46a' }), perches.hawk.length)
  perches.hawk.forEach((p, i) => {
    const g = terrainHeight(p.x, p.z)
    _m.compose(_p.set(p.x, g - 0.05, p.z), _q.identity(), _s.set(1, p.y - 0.07 - g + 0.05, 1))
    hawkPosts.setMatrixAt(i, _m)
    // 横木は広場の方を向く鳥の左右に渡す
    _q.setFromEuler(_e.set(0, p.face, 0))
    _m.compose(_p.set(p.x, p.y - 0.07, p.z), _q, _s.set(1, 1, 1))
    hawkBars.setMatrixAt(i, _m)
    colliders.push({ x: p.x, z: p.z, r: 0.35 })
  })
  finish(hawkPosts, hawkBars)
  group.add(hawkPosts, hawkBars)

  // フクロウの止まり木: 切り株のような太い丸太。上面に鳥が立つ
  const logGeo = new THREE.CylinderGeometry(0.22, 0.26, 1, 9)
  logGeo.translate(0, 0.5, 0)
  const logTopGeo = new THREE.CylinderGeometry(0.21, 0.21, 0.03, 9)
  const logs = instanced(logGeo, wood, perches.owl.length)
  const logTops = instanced(logTopGeo, toonMaterial({ color: '#d9b98a' }), perches.owl.length, false)
  perches.owl.forEach((p, i) => {
    const g = terrainHeight(p.x, p.z)
    _q.setFromEuler(_e.set(0, rand() * Math.PI, 0))
    _m.compose(_p.set(p.x, g - 0.1, p.z), _q, _s.set(1, p.y - g + 0.1, 1))
    logs.setMatrixAt(i, _m)
    _m.compose(_p.set(p.x, p.y + 0.005, p.z), _q, _s.set(1, 1, 1))
    logTops.setMatrixAt(i, _m)
    colliders.push({ x: p.x, z: p.z, r: 0.4 })
  })
  finish(logs, logTops)
  group.add(logs, logTops)

  // フクロウの止まり木の奥の、日陰をつくる大きな木（木陰が好きなフクロウの居場所に見えるように）
  const shadeTrees: Array<{ x: number; z: number; s: number }> = []
  for (let i = 0; i < 4; i++) {
    const a = a0 + Math.PI + (i / 3 - 0.5) * 1.6
    const d = 27 + (i % 2) * 2
    shadeTrees.push({ x: r.x + Math.cos(a) * d, z: r.z + Math.sin(a) * d, s: 1.1 + rand() * 0.3 })
  }

  // インコの木: 枝を張った白っぽい枯れ木の止まり木
  const ta = a0 + SKY_PARROT_TREE.a
  const tx = r.x + Math.cos(ta) * SKY_PARROT_TREE.d
  const tz = r.z + Math.sin(ta) * SKY_PARROT_TREE.d
  const ty = terrainHeight(tx, tz)
  {
    const bark = toonMaterial({ color: '#cbb89a' })
    const tree = new THREE.Group()
    tree.position.set(tx, ty, tz)
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.3, 4.6, 8), bark)
    trunk.position.y = 2.3
    trunk.castShadow = true
    tree.add(trunk)
    for (const [h, dir, len] of SKY_PARROT_TREE.branches) {
      const geo = new THREE.CylinderGeometry(0.05, 0.08, len, 6)
      geo.translate(0, len / 2, 0)
      geo.rotateZ(-Math.PI / 2)
      const b = new THREE.Mesh(geo, bark)
      b.position.y = h
      b.rotation.y = -dir
      b.castShadow = true
      tree.add(b)
    }
    group.add(tree)
    colliders.push({ x: tx, z: tz, r: 0.5 })
    // 根もとの餌台（木の箱）
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.8), wood)
    box.position.set(tx + Math.cos(ta + 1.4) * 1.2, ty + 0.25, tz + Math.sin(ta + 1.4) * 1.2)
    box.castShadow = true
    group.add(box)
  }

  // コンドルの岩: 平らな頂の大きな岩
  {
    const v = perches.vulture[0]
    const g = terrainHeight(v.x, v.z)
    const stoneMat = toonMaterial({ color: '#a29cae' })
    // 平らな頂の岩と、根もとに寄りかかる岩 2 つ（ごつごつした岩場に見せる）
    const rock = new THREE.Mesh(new THREE.CylinderGeometry(SKY_VULTURE_ROCK.r * 0.62, SKY_VULTURE_ROCK.r, v.y - g + 0.3, 6), stoneMat)
    rock.position.set(v.x, g + (v.y - g) / 2 - 0.15, v.z)
    rock.rotation.set((rand() - 0.5) * 0.08, rand() * Math.PI, (rand() - 0.5) * 0.08)
    rock.castShadow = true
    rock.receiveShadow = true
    group.add(rock)
    for (let k = 0; k < 2; k++) {
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8 + k * 0.2, 0), stoneMat)
      const ba = rand() * Math.PI * 2
      b.position.set(v.x + Math.cos(ba) * SKY_VULTURE_ROCK.r, g + 0.3, v.z + Math.sin(ba) * SKY_VULTURE_ROCK.r)
      b.scale.set(1.2, 0.8, 1)
      b.rotation.set(rand(), rand(), rand())
      b.castShadow = true
      group.add(b)
      b.updateMatrix()
      addRock(colliders, r, b.geometry, b.matrix)
    }
    colliders.push({ x: v.x, z: v.z, r: SKY_VULTURE_ROCK.r * 0.9 })
  }

  // 高原の岩の塔: 細く高い岩の柱を、少しずつ細く重ねる（麓はうす紫 → 灰 → 頂はクリーム色）。峠の向きはあける
  const spires: Array<{ x: number; z: number; h: number; w: number }> = []
  let guard = 0
  while (spires.length < (mobile ? 5 : 7) && guard++ < 200) {
    const a = a0 + 0.9 + rand() * (Math.PI * 2 - 1.8)
    const d = 52 + rand() * 40
    const x = r.x + Math.cos(a) * d
    const z = r.z + Math.sin(a) * d
    if (spires.some((p) => Math.hypot(p.x - x, p.z - z) < 22)) continue
    spires.push({ x, z, h: 10 + rand() * 12, w: 2.2 + rand() * 1.8 })
  }
  const spireGeo = new THREE.CylinderGeometry(0.66, 1, 1, 6)
  spireGeo.translate(0, 0.5, 0)
  const SEG = 5
  const spireMesh = instanced(spireGeo, toonMaterial(), spires.length * SEG)
  const spireCols = ['#a6a4d2', '#b6b2d8', '#c8c2da', '#ddd4d2', '#f2e8d2'].map((c) => new THREE.Color(c))
  spires.forEach((sp, i) => {
    let y = terrainHeight(sp.x, sp.z) - 1
    let w = sp.w
    for (let k = 0; k < SEG; k++) {
      const h = (sp.h / SEG) * (1.25 - k * 0.1)
      _q.setFromEuler(_e.set((rand() - 0.5) * 0.08, rand() * Math.PI, (rand() - 0.5) * 0.08))
      _m.compose(_p.set(sp.x + (rand() - 0.5) * 0.3 * w, y, sp.z + (rand() - 0.5) * 0.3 * w), _q, _s.set(w, h * 1.15, w))
      spireMesh.setMatrixAt(i * SEG + k, _m)
      spireMesh.setColorAt(i * SEG + k, spireCols[k])
      // いちばん下の太い段の形で当たり判定を測る
      if (k === 0) addRock(colliders, r, spireGeo, _m)
      y += h
      w *= 0.8
    }
  })
  finish(spireMesh)
  group.add(spireMesh)

  // フライトの輪にそって、色とりどりの旗（風の強い高原らしさ）。峠からの道はあける
  const flagPoles: Array<{ x: number; z: number; a: number }> = []
  for (let i = 0; i < 10; i++) {
    const a = a0 + 0.35 + (i / 10) * (Math.PI * 2 - 0.7)
    flagPoles.push({ x: r.x + Math.cos(a) * (SKY_RING + 3.2), z: r.z + Math.sin(a) * (SKY_RING + 3.2), a })
  }
  const poleGeo = new THREE.CylinderGeometry(0.05, 0.06, 3.4, 5)
  poleGeo.translate(0, 1.7, 0)
  const flagGeo = new THREE.BufferGeometry()
  flagGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, -0.7, 0, 1.2, -0.35, 0], 3))
  flagGeo.computeVertexNormals()
  const poles = instanced(poleGeo, toonMaterial({ color: '#f6f1e6' }), flagPoles.length)
  const flags = instanced(flagGeo, toonMaterial({ side: THREE.DoubleSide }), flagPoles.length, false)
  const flagColors = ['#e8322a', '#f4c242', '#2f9be0', '#6fc04a', '#f26a9b'].map((c) => new THREE.Color(c))
  flagPoles.forEach((f, i) => {
    const g = terrainHeight(f.x, f.z)
    _m.compose(_p.set(f.x, g - 0.05, f.z), _q.identity(), _s.set(1, 1, 1))
    poles.setMatrixAt(i, _m)
    // 旗は風下（北東）へなびかせる
    _q.setFromEuler(_e.set(0, -0.8, 0))
    _m.compose(_p.set(f.x, g + 3.3, f.z), _q, _s.set(1, 1, 1))
    flags.setMatrixAt(i, _m)
    flags.setColorAt(i, flagColors[i % flagColors.length])
    colliders.push({ x: f.x, z: f.z, r: 0.25 })
  })
  finish(poles, flags)
  group.add(poles, flags)

  // 高原の木: 細い幹に、上へとがった濃い緑の葉（高い所の針葉樹）。日陰の大木も同じ作りで太く
  const trees = scatter(rand, r, mobile ? 40 : 60, { min: 40, max: r.walk + 36, clearing: 38, path: 10 }).filter(
    (p) => !onPath(p.x, p.z, 2) && !spires.some((sp) => Math.hypot(sp.x - p.x, sp.z - p.z) < sp.w + 3),
  )
  const all = [...trees.map((t) => ({ ...t, s: 0.8 + rand() * 0.5, shade: false })), ...shadeTrees.map((t) => ({ ...t, shade: true }))]
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.3, 1, 6)
  trunkGeo.translate(0, 0.5, 0)
  const crownGeo = new THREE.IcosahedronGeometry(1, 1)
  const trunks = instanced(trunkGeo, toonMaterial({ color: '#6a4a30' }), all.length)
  const crowns = instanced(crownGeo, toonMaterial(), all.length * 2)
  const leafA = new THREE.Color('#3f9a4e')
  const leafB = new THREE.Color('#6cc05a')
  all.forEach((t, i) => {
    const y = terrainHeight(t.x, t.z)
    const s = t.s
    const h = (t.shade ? 4.2 : 3 + rand() * 1.5) * s
    _q.setFromEuler(_e.set(0, rand() * Math.PI * 2, 0))
    _m.compose(_p.set(t.x, y - 0.2, t.z), _q, _s.set(s * (t.shade ? 1.5 : 1), h, s * (t.shade ? 1.5 : 1)))
    trunks.setMatrixAt(i, _m)
    for (let k = 0; k < 2; k++) {
      const cw = (t.shade ? 3.4 - k * 0.8 : 1.6 - k * 0.4) * s
      const ch = (t.shade ? 2.4 : 2.6) * s
      _m.compose(_p.set(t.x, y + h + k * ch * 0.6, t.z), _q, _s.set(cw, ch * (t.shade ? 0.8 : 1.1), cw))
      crowns.setMatrixAt(i * 2 + k, _m)
      crowns.setColorAt(i * 2 + k, _c.copy(leafA).lerp(leafB, rand()))
    }
    if (Math.hypot(t.x - r.x, t.z - r.z) < r.walk + REACH_BAND) colliders.push({ x: t.x, z: t.z, r: (t.shade ? 0.8 : 0.5) * s })
  })
  finish(trunks, crowns)
  group.add(trunks, crowns)

  // 岩: 高原にころがる、うす紫がかった灰色の岩
  const rocks = scatter(rand, r, 36, { min: 32, max: r.walk + 24, clearing: 30, path: 7 }).filter((p) => !onPath(p.x, p.z, 1))
  const rockGeo = new THREE.IcosahedronGeometry(1, 0)
  const rockMesh = instanced(rockGeo, toonMaterial({ color: '#a29cae' }), rocks.length)
  rocks.forEach((p, i) => {
    const s = 0.5 + rand() * 1.1
    _q.setFromEuler(_e.set(rand(), rand() * 3, rand()))
    _m.compose(_p.set(p.x, terrainHeight(p.x, p.z) + s * 0.2, p.z), _q, _s.set(s * 1.2, s * 0.7, s))
    rockMesh.setMatrixAt(i, _m)
    addRock(colliders, r, rockGeo, _m)
  })
  finish(rockMesh)
  group.add(rockMesh)

  // 花: 高原の小さな花の群れ（うす紫・白・黄・青）。当たり判定なし
  const flowerSpots: Array<{ x: number; z: number }> = []
  const clumps = scatter(rand, r, mobile ? 50 : 80, { min: 12, max: r.walk + 10, clearing: 12, path: 4 })
  for (const c of clumps) {
    if (onPath(c.x, c.z, 1)) continue
    for (let k = 0; k < 9; k++) flowerSpots.push({ x: c.x + (rand() - 0.5) * 3.2, z: c.z + (rand() - 0.5) * 3.2 })
  }
  const flowerGeo = new THREE.IcosahedronGeometry(0.13, 0)
  const flowerMesh = instanced(flowerGeo, toonMaterial(), flowerSpots.length, false)
  const flowerColors = ['#c9b4f4', '#ffffff', '#ffe066', '#8fc4ff'].map((c) => new THREE.Color(c))
  flowerSpots.forEach((f, i) => {
    _m.compose(_p.set(f.x, terrainHeight(f.x, f.z) + 0.16, f.z), _q.identity(), _s.set(1, 0.7, 1))
    flowerMesh.setMatrixAt(i, _m)
    flowerMesh.setColorAt(i, flowerColors[Math.floor(rand() * flowerColors.length)])
  })
  finish(flowerMesh)
  group.add(flowerMesh)
}

const _cm = new THREE.Matrix4()
const _cp = new THREE.Vector3()
/**
 * 動物の体に重なるシダ・草むらの株を消す（大きさ 0 にする）。動物は置き物の後に置くので、
 * 当たり判定の無い低い葉の中に体が埋もれて見えていた（ジャングルのビントロングなど 4 頭、南半球の 2 頭）。
 * userData.clearAroundAnimals（株の中心から葉の届く m）を付けた InstancedMesh だけが対象
 */
export function clearPlantsAround(group: THREE.Object3D, bodies: Array<{ x: number; z: number; r: number }>): number {
  let cleared = 0
  group.traverse((o) => {
    const m = o as THREE.InstancedMesh
    const reach = m.userData?.clearAroundAnimals as number | undefined
    if (!m.isInstancedMesh || reach === undefined) return
    for (let i = 0; i < m.count; i++) {
      m.getMatrixAt(i, _cm)
      const sx = _cm.elements[0] * _cm.elements[0] + _cm.elements[1] * _cm.elements[1] + _cm.elements[2] * _cm.elements[2]
      if (sx === 0) continue
      _cp.setFromMatrixPosition(_cm)
      const ext = reach * Math.sqrt(sx)
      if (!bodies.some((b) => Math.hypot(b.x - _cp.x, b.z - _cp.z) < b.r + ext * 0.7)) continue
      _cm.scale(_cp.set(0, 0, 0))
      m.setMatrixAt(i, _cm)
      cleared++
    }
    m.instanceMatrix.needsUpdate = true
  })
  return cleared
}

export function createBiomeProps(options: { mobile: boolean; colliders: Collider[] }): BiomeProps {
  const group = new THREE.Group()
  group.name = 'biome-props'
  const rand = mulberry32(WORLD_SEED + 503)
  createNorth(rand, group, options.colliders, options.mobile)
  createJungle(rand, group, options.colliders, options.mobile)
  createSouth(rand, group, options.colliders, options.mobile)
  // 水の世界は後から足したので別の乱数の列（ほかのワールドの並びを変えない）
  createWater(mulberry32(WORLD_SEED + 509), group, options.colliders, options.mobile)
  createPartner(mulberry32(WORLD_SEED + 521), group, options.colliders, options.mobile)
  createSky(mulberry32(WORLD_SEED + 547), group, options.colliders, options.mobile)
  return { group }
}
