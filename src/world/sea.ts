import * as THREE from 'three'
import { SEA_LEVEL, terrainHeight } from './terrain'
import { TERRAIN_SIZE } from './layout'
import { MAP_BOUNDS, biomeAt, emptyWeights } from './regions'

/**
 * 水の世界の海。東に広げた 1 枚の板で、水の世界の地面のうち海面より低いところだけが見える（潟と小川も同じ板）。
 * ほかのワールドの低い所には出さない（深さのテクスチャで「水の世界の地面か」も焼いておく）。
 * 映り込みは描かない（サバンナの水場の Reflector とは別。描く回数を増やさない）。
 * 深さ（海面 − 地面）を 2m 間隔の小さなテクスチャに焼いておき、浅いところは砂が透ける明るい水色、
 * 沖は深い青、波打ちぎわには寄せては返す白い泡の帯。さざ波の光の筋がゆっくり流れる。
 * 「動きをへらす」では波を止める。外部素材は使わず、すべてコードで作る。
 */
export interface Sea {
  mesh: THREE.Mesh
  update: (time: number) => void
  setReduceMotion: (on: boolean) => void
}

/** 深さのテクスチャの範囲（世界座標）と、1 画素の大きさ */
const BOX = { minX: 100, maxX: 520, minZ: -480, maxZ: 480 }
const STEP = 2.5
/** テクスチャに入れる最大の深さ（m）。これより深いところは同じ色 */
const MAX_DEPTH = 8

/** 地形のメッシュがある所か（その外は地面が無いので、深い海として扱う） */
function hasGround(x: number, z: number): boolean {
  const half = TERRAIN_SIZE / 2
  if (x <= half) return Math.abs(z) <= MAP_BOUNDS.maxZ
  return x <= MAP_BOUNDS.maxX && Math.abs(z) <= half
}

const _bw = emptyWeights()
/**
 * 深さ（0..1 = 0..MAX_DEPTH m）。0 は陸か、ほかのワールドの地面（海を出さない）。
 * 地形のメッシュの外は深い海
 */
function depthTexture(): THREE.DataTexture {
  const w = Math.round((BOX.maxX - BOX.minX) / STEP) + 1
  const h = Math.round((BOX.maxZ - BOX.minZ) / STEP) + 1
  const data = new Uint8Array(w * h)
  for (let j = 0; j < h; j++) {
    const z = BOX.minZ + j * STEP
    for (let i = 0; i < w; i++) {
      const x = BOX.minX + i * STEP
      // 地面の無い所は深い海。ただしサバンナと北・南のタイルの列（x ≤ 200）の外には海を出さない
      let d = x <= TERRAIN_SIZE / 2 ? 0 : MAX_DEPTH
      if (hasGround(x, z)) d = biomeAt(x, z, _bw).water >= 0.5 ? SEA_LEVEL - terrainHeight(x, z) : 0
      data[j * w + i] = Math.round(Math.max(0, Math.min(1, d / MAX_DEPTH)) * 255)
    }
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RedFormat, THREE.UnsignedByteType)
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearFilter
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  tex.needsUpdate = true
  return tex
}

export function createSea(): Sea {
  // 板は東の海の全体（水平線の先まで）。西の端はテクスチャの西の端（その西には出さない）
  const geo = new THREE.PlaneGeometry(1000, 1800, 1, 1)
  geo.rotateX(-Math.PI / 2)
  geo.translate(BOX.minX + 500, 0, 0)
  const uniforms = {
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    uDepth: { value: depthTexture() },
    uBox: { value: new THREE.Vector4(BOX.minX - STEP / 2, BOX.minZ - STEP / 2, BOX.maxX - BOX.minX + STEP, BOX.maxZ - BOX.minZ + STEP) },
    uMaxDepth: { value: MAX_DEPTH },
    uTime: { value: 0 },
    uShallow: { value: new THREE.Color('#58d4dc') },
    uMid: { value: new THREE.Color('#2fb4d4') },
    uDeep: { value: new THREE.Color('#1675bd') },
    uFoam: { value: new THREE.Color('#ffffff') },
  }
  const mat = new THREE.ShaderMaterial({
    name: 'StylizedSea',
    uniforms,
    transparent: true,
    depthWrite: false,
    fog: true,
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      #include <common>
      #include <fog_pars_vertex>
      void main() {
        vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uDepth;
      uniform vec4 uBox;
      uniform float uMaxDepth;
      uniform float uTime;
      uniform vec3 uShallow;
      uniform vec3 uMid;
      uniform vec3 uDeep;
      uniform vec3 uFoam;
      varying vec3 vWorld;
      #include <common>
      #include <fog_pars_fragment>
      void main() {
        vec2 uv = (vWorld.xz - uBox.xy) / uBox.zw;
        if (uv.x < 0.0 || ((uv.y < 0.0 || uv.y > 1.0) && vWorld.x <= 200.0)) discard;
        bool inside = uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0;
        float d = inside ? texture2D(uDepth, uv).r * uMaxDepth : uMaxDepth;
        // 陸（深さ 0）は描かない。波打ちぎわはふちをやわらかく
        float edge = smoothstep(0.0, 0.08, d);
        if (edge < 0.01) discard;
        vec3 c = mix(uShallow, uMid, smoothstep(0.15, 1.4, d));
        c = mix(c, uDeep, smoothstep(1.4, 6.5, d));
        // さざ波の光の筋（2 方向の波を重ねる）。沖ほど少し強く
        vec2 p = vWorld.xz;
        float w1 = sin(dot(p, vec2(0.12, 0.05)) + uTime * 0.9);
        float w2 = sin(dot(p, vec2(-0.04, 0.15)) - uTime * 0.7);
        float glint = smoothstep(0.55, 0.95, w1 * w2);
        c = mix(c, vec3(1.0), glint * 0.16 * smoothstep(0.3, 3.0, d));
        // 波打ちぎわの泡: 寄せては返す白い帯
        float surge = 0.16 + 0.1 * sin(uTime * 1.1 + p.x * 0.07 + p.y * 0.05);
        float foam = 1.0 - smoothstep(surge * 0.4, surge + 0.12, d);
        float lace = 0.6 + 0.4 * sin(p.x * 0.9 + p.y * 0.7 + uTime * 1.6) * sin(p.x * 0.5 - p.y * 1.1);
        c = mix(c, uFoam, foam * lace * 0.85);
        float a = mix(0.78, 0.97, smoothstep(0.1, 2.5, d));
        a = max(a, foam * 0.9) * edge;
        gl_FragColor = vec4(c, a);
        #include <fog_fragment>
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.y = SEA_LEVEL
  mesh.name = 'sea'
  mesh.frustumCulled = false
  let reduceMotion = false
  return {
    mesh,
    update: (time) => {
      if (!reduceMotion) uniforms.uTime.value = time
    },
    setReduceMotion: (on) => {
      reduceMotion = on
    },
  }
}
