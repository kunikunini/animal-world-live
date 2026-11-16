import * as THREE from 'three'
import { ANIME_LOOK } from './look'

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
/** アニメ塗り（日なたと影の 2 色をくっきり分け、横向きの面の縁に日の光の輪郭を足す）。0 でいままでの段のトゥーン */
const animeUniform = { value: ANIME_LOOK ? 1 : 0 }

export function setClay(value: number): void {
  // アニメ塗りの時はクレイを使わない（なめらかな坂とくっきりした 2 色はぶつかる）
  if (ANIME_LOOK) value = 0
  // 寄せきったら 0 / 1 で止める（ほかのワールドでクレイの計算をしない）
  clayUniform.value = value < 0.004 ? 0 : value > 0.996 ? 1 : value
}

export function getClay(): number {
  return clayUniform.value
}

/**
 * 影の青み（11/16 見本の絵に寄せる）。日の当たらない所（落ち影と、日と反対を向いた面）に青い光を足す。
 * 地面や草の黄色には青の成分がほとんど無く、照り返しを青くしても影が黒っぽい茶色のままになるため、色を掛けずに足す。
 * 強さは main.ts がいるワールドの重みで 0..1 に寄せる（いまはサバンナだけ）。0 ならいままでと同じ絵
 */
const shadeUniform = { value: 0 }
export const shadeColor = { value: new THREE.Color('#161e44') }
export function setShadeTint(value: number): void {
  shadeUniform.value = value < 0.004 ? 0 : value > 0.996 ? 1 : value
  contactShadowMaterial.opacity = CONTACT_OPACITY * shadeUniform.value
  contactShadowMaterial.visible = shadeUniform.value > 0
}

/**
 * 11/16 動物の足もとの影（地面に接する丸い影）。生成モデルの動物に付ける（aiLionModel.ts）。
 * 影の色づけと同じ重み（サバンナにいるときだけ）で濃さを寄せ、ほかのワールドでは描かない
 */
const CONTACT_OPACITY = 0.75
function contactShadowTexture(): THREE.Texture {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const g = canvas.getContext('2d')
  if (g) {
    // alphaMap は緑の値を読む。透明度で描くと iPhone の Safari では透明な所の色が白のまま残り、影が四角になる。
    // 不透明な黒の上に白→黒の色だけで丸を描く
    g.fillStyle = '#000'
    g.fillRect(0, 0, size, size)
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    grad.addColorStop(0, '#fff')
    grad.addColorStop(0.55, 'rgb(179,179,179)')
    grad.addColorStop(1, '#000')
    g.fillStyle = grad
    g.fillRect(0, 0, size, size)
  }
  return new THREE.CanvasTexture(canvas)
}
export const contactShadowMaterial = new THREE.MeshBasicMaterial({
  color: '#2a2348',
  alphaMap: typeof document !== 'undefined' ? contactShadowTexture() : null,
  transparent: true,
  opacity: 0,
  visible: false,
  depthWrite: false,
  polygonOffset: true,
  polygonOffsetFactor: -2,
  polygonOffsetUnits: -2,
})
// 板は平らなので、でこぼこの地面では縁が埋まり、遠くでは奥行きの精度が足りず地面に負けて消える（iPhone で起きた）。
// 画面上の位置は変えずに、奥行きだけカメラの方へ CONTACT_LIFT m 寄せて、地面より手前に描く
const CONTACT_LIFT = 0.15
contactShadowMaterial.onBeforeCompile = (shader) => {
  shader.vertexShader = shader.vertexShader.replace(
    '#include <project_vertex>',
    `#include <project_vertex>
    mvPosition.xyz *= max( 0.0, 1.0 - ${CONTACT_LIFT.toFixed(2)} / length( mvPosition.xyz ) );
    gl_Position = projectionMatrix * mvPosition;`,
  )
}
export function getShadeTint(): number {
  return shadeUniform.value
}

// クレイの坂は、トゥーンの段のテクセルの中心を結ぶ
const RAMP = TOON_STEPS.map((v) => v.toFixed(3))

const CLAY_COMMON_FRAG = /* glsl */ `
uniform float uClay;
uniform float uAnime;
uniform float uShade;
uniform vec3 uShadeColor;
vec3 toonDirect = vec3( 0.0 );
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
  vec3 base = vec3( mix( banded, clayRamp( coord.x ), clayK ) );
  // アニメ塗り: 光の境目を 1 本の線に。境目は画面で 1〜2 画素だけぼかしてギザギザを消す。影は黒くせず 0.5
  float animeEdge = fwidth( dotNL ) * 1.5 + 0.015;
  float anime = mix( 0.5, 1.0, smoothstep( 0.06 - animeEdge, 0.06 + animeEdge, dotNL ) );
  return mix( base, vec3( anime ), uAnime );
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

// 影の青み。日の光がどれだけ届いたか（落ち影・面の向き込み）を日の光そのものの強さで割って測り、届かない所ほど青を足す
const SHADE_TINT = /* glsl */ `
#if NUM_DIR_LIGHTS > 0
if ( uShade > 0.001 ) {
  float sunL = dot( directionalLights[ 0 ].color, vec3( 0.3333 ) );
  float litK = clamp( dot( toonDirect, vec3( 0.3333 ) ) / max( sunL, 1e-4 ), 0.0, 1.0 );
  float shadeK = ( 1.0 - smoothstep( 0.3, 0.9, litK ) ) * uShade;
  outgoingLight = mix( outgoingLight, outgoingLight * 0.9 + uShadeColor, shadeK );
}
#endif
`

// 縁の光（リムライト）。横を向いた面の輪郭だけ明るくし、地面（上向きの面）には出さない。日の当たる側を強く
const ANIME_RIM = /* glsl */ `
#if NUM_DIR_LIGHTS > 0
if ( uAnime > 0.001 ) {
  vec3 rimV = normalize( vViewPosition );
  float rimF = 1.0 - max( dot( normal, rimV ), 0.0 );
  vec3 rimUp = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );
  float rimSide = 1.0 - smoothstep( 0.5, 0.85, dot( normal, rimUp ) );
  float rimSun = 0.35 + 0.65 * max( dot( normal, directionalLights[ 0 ].direction ), 0.0 );
  float rim = smoothstep( 0.6, 0.76, rimF ) * rimSide * rimSun;
  outgoingLight += mix( diffuseColor.rgb, vec3( 1.0 ), 0.55 ) * directionalLights[ 0 ].color * rim * 0.32 * uAnime;
}
#endif
`

const CLAY_DIRECT = /* glsl */ `
varying vec3 vViewPosition;
struct ToonMaterial {
  vec3 diffuseColor;
};
void RE_Direct_Toon( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
  vec3 irradiance = getGradientIrradiance( geometryNormal, directLight.direction ) * directLight.color;
  toonDirect += irradiance;
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

/**
 * 11/16 生成モデルの動物の色の画像（AWL_ANIMAL を付けた材質だけ）。写真のような細かい毛の模様が
 * 塗りの世界から浮くので、サバンナにいるときだけ（uShade の重み）画像を少しぼかして読み、
 * 明るさを数段にまとめる。色合いは保つ。重み 0 ならいままでと同じ
 */
const ANIMAL_MAP = /* glsl */ `
#if defined( USE_MAP ) && defined( AWL_ANIMAL )
  vec4 sampledDiffuseColor = texture2D( map, vMapUv, uShade * 1.0 );
  vec3 animalTex = sampledDiffuseColor.rgb;
  float animalL = max( dot( animalTex, vec3( 0.2126, 0.7152, 0.0722 ) ), 1e-4 );
  // 見た目の明るさ（ガンマ寄り）で 5 段にまとめる。段の境目は少しだけなめらかに
  float animalG = sqrt( animalL ) * 5.0;
  float animalQ = ( floor( animalG ) + smoothstep( 0.4, 0.6, fract( animalG ) ) ) / 5.0;
  animalTex *= mix( 1.0, ( animalQ * animalQ ) / animalL, uShade * 0.8 );
  diffuseColor *= vec4( animalTex, sampledDiffuseColor.a );
#else
  #include <map_fragment>
#endif
`

/** トゥーンのシェーダーにクレイの見た目を足す（強さ 0 ならいままでと同じ） */
export function clayCompile(shader: THREE.WebGLProgramParametersWithUniforms): void {
  shader.uniforms.uClay = clayUniform
  shader.uniforms.uAnime = animeUniform
  shader.uniforms.uShade = shadeUniform
  shader.uniforms.uShadeColor = shadeColor
  let v = shader.vertexShader
  v = swap(v, '#include <common>', '#include <common>\nvarying vec3 vClayP;')
  v = swap(v, '#include <worldpos_vertex>', '#include <worldpos_vertex>\nvClayP = transformed;')
  shader.vertexShader = v
  let f = shader.fragmentShader
  f = swap(f, '#include <common>', `#include <common>\n${CLAY_COMMON_FRAG}`)
  f = swap(f, '#include <gradientmap_pars_fragment>', CLAY_GRADIENT)
  f = swap(f, '#include <lights_toon_pars_fragment>', CLAY_DIRECT)
  f = swap(f, '#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${CLAY_SURFACE}`)
  f = swap(f, '#include <map_fragment>', ANIMAL_MAP)
  f = swap(
    f,
    'vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;',
    `vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + totalEmissiveRadiance;\n${SHADE_TINT}\n${ANIME_RIM}`,
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
