import * as THREE from 'three'

/**
 * 絵作りの切り替え（お試し）。既定は「アニメ塗り＋空気遠近」。
 * `?look=classic` で、いままでの段のトゥーン＋サバンナのクレイ＋薄い霧に戻せる（見比べ用）
 */
export const ANIME_LOOK = new URLSearchParams(location.search).get('look') !== 'classic'

/** 霧の最大の濃さ。遠くの山を消し切らず、青白いシルエットとして残す */
const FOG_MAX = 0.86

if (ANIME_LOOK) {
  // 線形の霧を、近くから早めにかかって遠くで頭打ちになる曲線へ（手前・中景・遠景の層がはっきり分かれる）
  THREE.ShaderChunk.fog_fragment = /* glsl */ `
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float fogLin = clamp( ( vFogDepth - fogNear ) / max( fogFar - fogNear, 1.0 ), 0.0, 1.0 );
    float fogFactor = ${FOG_MAX.toFixed(2)} * ( 1.0 - pow( 1.0 - fogLin, 1.6 ) );
  #endif
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif
`
}
