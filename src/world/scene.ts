import * as THREE from 'three'

export interface SceneSetup {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  sun: THREE.DirectionalLight
  /** 空と地面の照り返し。ワールドごとの明るさの切り替えに使う */
  hemi: THREE.HemisphereLight
  sky: THREE.Mesh
  setDpr: (dpr: number) => void
  resize: () => void
}

// 様式化した色彩: 青い空と金の草原のコントラスト
const SKY_TOP = new THREE.Color('#3d7bd8')
const SKY_HORIZON = new THREE.Color('#d6ecf8')
const SKY_BELOW = new THREE.Color('#c9c2a6')
const SUN_GLOW = new THREE.Color('#fff2cc')
const FOG_COLOR = new THREE.Color('#d9e9f3')

/** 光の向き。昼下がりの斜光。仰角 約38度、西寄り（南西）。影は長すぎず、面の向きで色の段差が出る */
export const SUN_LIGHT_DIR = new THREE.Vector3(-0.62, 0.62, 0.48)
/** 空に描く太陽の円盤の方角（xz）。光と同じ南西。仰角はワールドごとに main.ts で決める */
export const SUN_AZIMUTH = { x: SUN_LIGHT_DIR.x, z: SUN_LIGHT_DIR.z }
const azLen = Math.hypot(SUN_AZIMUTH.x, SUN_AZIMUTH.z)
SUN_AZIMUTH.x /= azLen
SUN_AZIMUTH.z /= azLen

/** 仰角（度）から、空に描く太陽の向きを出す。方角は光と同じ */
export function sunDiscDir(elevDeg: number, out: THREE.Vector3): THREE.Vector3 {
  const e = (elevDeg * Math.PI) / 180
  return out.set(Math.cos(e) * SUN_AZIMUTH.x, Math.sin(e), Math.cos(e) * SUN_AZIMUTH.z)
}

function createSky(): THREE.Mesh {
  const geo = new THREE.SphereGeometry(420, 32, 16)
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: SKY_TOP },
      uHorizon: { value: SKY_HORIZON },
      uBelow: { value: SKY_BELOW },
      uGlow: { value: SUN_GLOW.clone() },
      // 空に描く太陽。光の向きとは別に、見上げた時・振り返った時に画面へ入る高さに置く（main.ts がワールドごとに動かす）
      uSunDir: { value: sunDiscDir(20, new THREE.Vector3()) },
      // 円盤の大きさ（見込み角の cos）と、まわりの光の輪の強さ
      uDisc: { value: Math.cos((4 * Math.PI) / 180) },
      uHalo: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop;
      uniform vec3 uHorizon;
      uniform vec3 uBelow;
      uniform vec3 uGlow;
      uniform vec3 uSunDir;
      uniform float uDisc;
      uniform float uHalo;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float y = d.y;
        vec3 col;
        if (y >= 0.0) {
          float t = pow(clamp(y, 0.0, 1.0), 0.7);
          col = mix(uHorizon, uTop, t);
        } else {
          float t = clamp(-y * 6.0, 0.0, 1.0);
          col = mix(uHorizon, uBelow, t);
        }
        float s = max(dot(d, uSunDir), 0.0);
        // 太陽のまわりの光の輪。広い照り返しと、円盤のすぐ外の明るい輪
        float glow = (pow(s, 6.0) * 0.22 + pow(s, 48.0) * 0.55) * uHalo;
        // 太陽の円盤。縁はやわらかく。大きさはワールドごと（uDisc）
        float disc = smoothstep(uDisc - 0.0012, uDisc + 0.0004, s) * 1.4;
        col += uGlow * (glow + disc);
        // 地平線ぎわの霞
        float haze = exp(-abs(y) * 7.0) * 0.22;
        col = mix(col, uHorizon, haze);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.name = 'sky'
  mesh.frustumCulled = false
  mesh.renderOrder = -1
  return mesh
}

export function createScene(canvas: HTMLCanvasElement, maxDpr: number): SceneSetup {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  })
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 0.92
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  const scene = new THREE.Scene()
  scene.background = FOG_COLOR
  // 遠い山脈（半径 258m）がうっすら残る距離まで霧を伸ばす
  scene.fog = new THREE.Fog(FOG_COLOR, 60, 380)

  const camera = new THREE.PerspectiveCamera(50, 1, 0.3, 900)

  // 光の向きは SUN_LIGHT_DIR（南西の上）。動物の顔に日が当たる向きなので、ここは変えない
  const sun = new THREE.DirectionalLight('#fff0d2', 2.1)
  sun.position.copy(SUN_LIGHT_DIR).multiplyScalar(120)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.camera.near = 10
  sun.shadow.camera.far = 320
  sun.shadow.camera.left = -70
  sun.shadow.camera.right = 70
  sun.shadow.camera.top = 70
  sun.shadow.camera.bottom = -70
  sun.shadow.bias = -0.0006
  // 細い円柱（脚など）に斜めから光が当たると自己遮蔽の縞が出るので、法線方向のバイアスを大きめに取る
  sun.shadow.normalBias = 1.8
  scene.add(sun)
  scene.add(sun.target)

  // 影は黒くせず、空の青と地面の反射で青紫がかった影にする
  const hemi = new THREE.HemisphereLight('#bcd8ff', '#8c7aa6', 0.65)
  scene.add(hemi)

  const sky = createSky()
  scene.add(sky)

  let dpr = Math.min(window.devicePixelRatio || 1, maxDpr)

  const resize = () => {
    const w = window.innerWidth
    const h = window.innerHeight
    renderer.setPixelRatio(dpr)
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }

  const setDpr = (next: number) => {
    dpr = Math.max(0.75, Math.min(next, maxDpr))
    resize()
  }

  resize()
  window.addEventListener('resize', resize)

  return { renderer, scene, camera, sun, hemi, sky, setDpr, resize }
}
