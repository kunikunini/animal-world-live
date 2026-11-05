import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'

export interface PostFx {
  render: () => void
  setSize: (w: number, h: number, dpr: number) => void
  /** 低性能時はパスを切って素の描画にする */
  setEnabled: (on: boolean) => void
  enabled: boolean
  /** 彩度とコントラスト（ワールドごとに切り替える） */
  grade: { saturation: number; contrast: number }
}

/**
 * カラーグレーディング1パス。彩度・コントラスト・影を青く／光を暖かく・周辺減光。
 * リニア空間で処理し、トーンマッピングと色空間変換は OutputPass に任せる。
 */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uSaturation: { value: 1.22 },
    uContrast: { value: 1.12 },
    uShadowTint: { value: new THREE.Vector3(0.88, 0.92, 1.1) },
    uHighlightTint: { value: new THREE.Vector3(1.05, 1.0, 0.94) },
    uVignette: { value: 0.28 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uSaturation;
    uniform float uContrast;
    uniform vec3 uShadowTint;
    uniform vec3 uHighlightTint;
    uniform float uVignette;
    varying vec2 vUv;
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec3 c = texel.rgb;
      float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
      // 彩度
      c = mix(vec3(luma), c, uSaturation);
      // コントラスト（中間グレーを軸に）
      c = (c - 0.18) * uContrast + 0.18;
      // スプリットトーン: 暗部を青く、明部を暖かく
      float t = smoothstep(0.05, 0.9, luma);
      c *= mix(uShadowTint, uHighlightTint, t);
      // 周辺減光
      vec2 d = vUv - 0.5;
      float v = 1.0 - dot(d, d) * 1.6 * uVignette;
      c *= clamp(v, 0.0, 1.0);
      gl_FragColor = vec4(max(c, 0.0), texel.a);
    }
  `,
}

export function createPostFx(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): PostFx {
  const composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))
  const gradePass = new ShaderPass(GradeShader)
  composer.addPass(gradePass)
  composer.addPass(new OutputPass())

  const fx: PostFx = {
    enabled: true,
    grade: { saturation: GradeShader.uniforms.uSaturation.value, contrast: GradeShader.uniforms.uContrast.value },
    render: () => {
      if (fx.enabled) {
        gradePass.uniforms.uSaturation.value = fx.grade.saturation
        gradePass.uniforms.uContrast.value = fx.grade.contrast
        composer.render()
      } else renderer.render(scene, camera)
    },
    setSize: (w, h, dpr) => {
      composer.setPixelRatio(dpr)
      composer.setSize(w, h)
    },
    setEnabled: (on) => {
      fx.enabled = on
    },
  }
  return fx
}
