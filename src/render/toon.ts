import * as THREE from 'three'

/**
 * 様式化（トゥーン）の陰影。段差のあるグラデーションをコードで作り、全マテリアルで共有する。
 * 外部テクスチャは使わない。
 */
let gradient: THREE.DataTexture | null = null

// 影 → 中間 → 明 → ハイライト。黒くつぶさず、影でも色が残る値にする。
// 影の段を少し深くして、動物や木の形がくっきり分かれるようにする
const TOON_STEPS = [0.32, 0.56, 0.86, 1.0]

export function toonGradient(): THREE.DataTexture {
  if (gradient) return gradient
  const steps = TOON_STEPS
  const data = new Uint8Array(steps.length * 4)
  steps.forEach((v, i) => {
    const b = Math.round(v * 255)
    data[i * 4] = b
    data[i * 4 + 1] = b
    data[i * 4 + 2] = b
    data[i * 4 + 3] = 255
  })
  gradient = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat)
  gradient.minFilter = THREE.NearestFilter
  gradient.magFilter = THREE.NearestFilter
  gradient.generateMipmaps = false
  gradient.needsUpdate = true
  return gradient
}

export interface ToonOptions {
  color?: THREE.ColorRepresentation
  vertexColors?: boolean
  transparent?: boolean
  opacity?: number
  side?: THREE.Side
}

export function toonMaterial(options: ToonOptions = {}): THREE.MeshToonMaterial {
  const mat = new THREE.MeshToonMaterial({
    color: options.color ?? '#ffffff',
    gradientMap: toonGradient(),
    vertexColors: options.vertexColors ?? false,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
    side: options.side ?? THREE.FrontSide,
  })
  // 全部の材質で同じ関数を使う（シェーダーを 1 つにまとめるため）。自分でも onBeforeCompile を使う材質は、前のものを呼んでから足す
  mat.onBeforeCompile = clayCompile
  return mat
}

/**
 * クレイアニメ（粘土）の見た目。サバンナにいる時だけ効かせる（強さは main.ts がいるワールドの重みで 0..1 に寄せる）。
 * スマホは色補正のパスを切っているので、材質のシェーダーの中で作る:
 * - 段のある陰影を、段の中心を結んだなめらかな坂に（明るさの平均は段と同じ）
 * - 指で押したような大小のくぼみを面の向きに足す（物の座標で決めるので、動いても模様は流れない）
 * - 色にむらをつけ、粘土のしっとりした弱いつやを日なたにだけ乗せる
 * 強さが 0 のワールドでは、いままでのトゥーンと同じ絵になる
 */
const clayUniform = { value: 0 }

export function setClay(value: number): void {
  // 寄せきったら 0 / 1 で止める（ほかのワールドでクレイの計算をしない）
  clayUniform.value = value < 0.004 ? 0 : value > 0.996 ? 1 : value
}

export function getClay(): number {
  return clayUniform.value
}

// クレイの坂は、トゥーンの段のテクセルの中心を結ぶ
const RAMP = TOON_STEPS.map((v) => v.toFixed(3))

const CLAY_COMMON_FRAG = /* glsl */ `
uniform float uClay;
varying vec3 vClayP;
float clayK = 0.0;
float clayHash( vec3 p ) {
  p = fract( p * 0.3183099 + 0.1 );
  p *= 17.0;
  return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) );
}
float clayNoise( vec3 x ) {
  vec3 i = floor( x );
  vec3 f = fract( x );
  f = f * f * ( 3.0 - 2.0 * f );
  return mix(
    mix( mix( clayHash( i ), clayHash( i + vec3( 1.0, 0.0, 0.0 ) ), f.x ), mix( clayHash( i + vec3( 0.0, 1.0, 0.0 ) ), clayHash( i + vec3( 1.0, 1.0, 0.0 ) ), f.x ), f.y ),
    mix( mix( clayHash( i + vec3( 0.0, 0.0, 1.0 ) ), clayHash( i + vec3( 1.0, 0.0, 1.0 ) ), f.x ), mix( clayHash( i + vec3( 0.0, 1.0, 1.0 ) ), clayHash( i + vec3( 1.0, 1.0, 1.0 ) ), f.x ), f.y ),
    f.z );
}
float clayRamp( float x ) {
  float t = clamp( ( x - 0.125 ) / 0.25, 0.0, 3.0 );
  float a = mix( ${RAMP[0]}, ${RAMP[1]}, clamp( t, 0.0, 1.0 ) );
  float b = mix( a, ${RAMP[2]}, clamp( t - 1.0, 0.0, 1.0 ) );
  return mix( b, ${RAMP[3]}, clamp( t - 2.0, 0.0, 1.0 ) );
}
`

const CLAY_GRADIENT = /* glsl */ `
#ifdef USE_GRADIENTMAP
  uniform sampler2D gradientMap;
#endif
vec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ) {
  float dotNL = dot( normal, lightDirection );
  vec2 coord = vec2( dotNL * 0.5 + 0.5, 0.0 );
  #ifdef USE_GRADIENTMAP
    float banded = texture2D( gradientMap, coord ).r;
  #else
    vec2 fw = fwidth( coord ) * 0.5;
    float banded = mix( 0.7, 1.0, smoothstep( 0.7 - fw.x, 0.7 + fw.x, coord.x ) );
  #endif
  return vec3( mix( banded, clayRamp( coord.x ), clayK ) );
}
`

// 指あと: 大きなうねり（約 1.1m）、親指で押したようなくぼみ（約 30cm）、へらでならした細かな筋（約 9cm）。
// 画面で 1 画素より細かくなる大きさは消す（遠くの地面がざらつかない）
const CLAY_SURFACE = /* glsl */ `
clayK = uClay;
if ( clayK > 0.001 ) {
  vec3 cp1 = vClayP * 0.9;
  vec3 cp2 = vClayP * 3.3 + 17.0;
  vec3 cp3 = vClayP * 11.0 + 41.0;
  float n1 = clayNoise( cp1 );
  float n2 = clayNoise( cp2 );
  float n3 = abs( clayNoise( cp3 ) * 2.0 - 1.0 );
  float f1 = 1.0 - smoothstep( 0.3, 0.9, length( fwidth( cp1 ) ) );
  float f2 = 1.0 - smoothstep( 0.3, 0.9, length( fwidth( cp2 ) ) );
  float f3 = 1.0 - smoothstep( 0.3, 0.9, length( fwidth( cp3 ) ) );
  float h = ( n1 * 0.1 * f1 + n2 * 0.035 * f2 + n3 * 0.008 * f3 ) * clayK;
  vec3 sp = - vViewPosition;
  vec3 dpx = dFdx( sp );
  vec3 dpy = dFdy( sp );
  vec3 r1 = cross( dpy, normal );
  vec3 r2 = cross( normal, dpx );
  float det = dot( dpx, r1 );
  vec3 grad = sign( det ) * ( dFdx( h ) * r1 + dFdy( h ) * r2 );
  normal = normalize( abs( det ) * normal - grad );
  // 色のむら。筋の谷は少し暗く（指で押した跡に影がたまる）
  diffuseColor.rgb *= 1.0 + ( ( n1 - 0.5 ) * 0.09 * f1 + ( n2 - 0.5 ) * 0.07 * f2 + ( n3 - 0.5 ) * 0.06 * f3 ) * clayK;
}
`

const CLAY_DIRECT = /* glsl */ `
varying vec3 vViewPosition;
struct ToonMaterial {
  vec3 diffuseColor;
};
void RE_Direct_Toon( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
  vec3 irradiance = getGradientIrradiance( geometryNormal, directLight.direction ) * directLight.color;
  reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
  if ( clayK > 0.001 ) {
    // 粘土のしっとりした弱いつや。影（directLight.color に入っている）の中には出ない
    vec3 hv = normalize( directLight.direction + geometryViewDir );
    float sheen = pow( max( dot( geometryNormal, hv ), 0.0 ), 6.0 );
    float lit = smoothstep( 0.0, 0.35, dot( geometryNormal, directLight.direction ) );
    reflectedLight.directSpecular += directLight.color * sheen * lit * 0.025 * clayK;
  }
}
void RE_IndirectDiffuse_Toon( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
  reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct RE_Direct_Toon
#define RE_IndirectDiffuse RE_IndirectDiffuse_Toon
`

function swap(src: string, find: string, to: string): string {
  if (!src.includes(find)) {
    console.warn('clay: shader chunk not found', find)
    return src
  }
  return src.replace(find, to)
}

/** トゥーンのシェーダーにクレイの見た目を足す（強さ 0 ならいままでと同じ） */
export function clayCompile(shader: THREE.WebGLProgramParametersWithUniforms): void {
  shader.uniforms.uClay = clayUniform
  let v = shader.vertexShader
  v = swap(v, '#include <common>', '#include <common>\nvarying vec3 vClayP;')
  v = swap(v, '#include <worldpos_vertex>', '#include <worldpos_vertex>\nvClayP = transformed;')
  shader.vertexShader = v
  let f = shader.fragmentShader
  f = swap(f, '#include <common>', `#include <common>\n${CLAY_COMMON_FRAG}`)
  f = swap(f, '#include <gradientmap_pars_fragment>', CLAY_GRADIENT)
  f = swap(f, '#include <lights_toon_pars_fragment>', CLAY_DIRECT)
  f = swap(f, '#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${CLAY_SURFACE}`)
  f = swap(
    f,
    'vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;',
    'vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + totalEmissiveRadiance;',
  )
  shader.fragmentShader = f
}

const vivid = new WeakSet<THREE.Material>()
/**
 * 動物の毛色を鮮やかにする（トップの絵のような色に）。ACES のトーンマッピングは日なたの明るい色を白っぽく褪せさせるので、
 * そのぶん素の色の彩度を上げて、草原の上で動物が沈まないようにする。毛色どうしの違い（個体差）は保つ。同じ材質は 1 回だけ
 */
export function vividToon(root: THREE.Object3D, saturation = 1.3): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const m of mats) {
      if (!(m instanceof THREE.MeshToonMaterial) || vivid.has(m)) continue
      vivid.add(m)
      const c = m.color
      const lum = c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722
      c.setRGB(
        Math.max(0, lum + (c.r - lum) * saturation),
        Math.max(0, lum + (c.g - lum) * saturation),
        Math.max(0, lum + (c.b - lum) * saturation),
      )
    }
  })
}
