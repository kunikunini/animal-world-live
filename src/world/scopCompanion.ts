import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { clayCompile, toonMaterial } from '../render/toon'

/**
 * あそびかたツアーの案内役スコップ（3D）。主人公の斜め前（行き先の方、画面で見て右寄り）に立ち、跳ねながら先導する。
 * モデルは public/models/scop.glb（Meshy、リグなし）。跳ねる・つぶれる・向きを変える動きはここで付ける
 * （跳ね方は立ち上げの画面と同じ #011 スクワッシュ＆ストレッチ）。
 * ふだんは振り返ってカメラのほう（顔が見える向き）を向き、歩く間は進む方へ半分ほど、目印がある時はその方へ少し向く。
 * 吹き出し（guide.ts）は anchor()（頭の上）の画面の位置に付く。
 */
export interface ScopCompanion {
  root: THREE.Group
  /**
   * 毎コマ。hero: 主人公の足元、look: 向く目印（無ければ null）。
   * 主人公から離れすぎた時（ワープ・ワールドの移動）はその場へ置き直す
   */
  update: (dt: number, hero: THREE.Vector3, camera: THREE.Camera, look: THREE.Vector3 | null) => void
  /** 頭の上（吹き出しの付く所）。ワールドの座標 */
  anchor: (out: THREE.Vector3) => THREE.Vector3
  setVisible: (on: boolean) => void
  /** しゃべる時に 1 回跳ねる（ツアーの段が変わった時） */
  hop: () => void
  setReduceMotion: (on: boolean) => void
}

/** 主人公の背の高さに対するスコップの高さ */
const HEIGHT_RATIO = 0.46
/**
 * 立つ所: 主人公の斜め前（先導する。幼稚園の先生が前を歩いて振り返る感じ）。
 * 前 = ツアーの目印があればその方、無ければカメラの向く方（奥）。LEAD m 前へ、SIDE m 横へ（画面で見て右）。
 * 置く所が画面のはし（EDGE、-1〜1 の画面の座標）より外になる時だけ、はしに収まるまで主人公へ寄せる（最小 SIDE_MIN 倍）
 */
const LEAD = 1.1
const SIDE = 0.55
const SIDE_MIN = 0.45
const EDGE = 0.72
/** ついてくる速さ（1 秒あたりの寄り方） */
const FOLLOW = 5
/** これより離れたら置き直す（m） */
const SNAP = 10
/** 目印のほうへ向く割合（1 で目印を真っすぐ向く。顔が見えるよう、カメラ寄りの斜め前まで） */
const LOOK_TURN = 0.18
/** 歩いている間、進む方へ向く割合 */
const MOVE_TURN = 0.25
/** 跳ねる: 1 回の時間（s）と高さ（スコップの高さに対する割合） */
const HOP_TIME = 0.42
const HOP_HEIGHT = 0.3
/** 着地でつぶれる時間（s）と、つぶれ・伸び（立ち上げの画面と同じ 0.9・1.08） */
const LAND_TIME = 0.18
const SQUASH = 0.9
const STRETCH = 1.08

export function contactShadow(radius: number): THREE.Mesh | null {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, '#ffffff')
  g.addColorStop(0.45, '#d9d9d9')
  g.addColorStop(1, '#000000')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const geo = new THREE.PlaneGeometry(radius * 2, radius * 2)
  geo.rotateX(-Math.PI / 2)
  const mat = new THREE.MeshBasicMaterial({
    color: '#22160e',
    alphaMap: new THREE.CanvasTexture(canvas),
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.renderOrder = 2
  return mesh
}

/** 角度の差（-π〜π） */
const angleDiff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b))

/** スコップのモデル（足の裏が y=0、真ん中が原点、高さ height）。ワールドのスコップ（scopNpc.ts）も clone して使う */
export async function loadScopModel(url: string, heroHeight: number): Promise<{ model: THREE.Group; height: number }> {
  const loader = new GLTFLoader()
  loader.setMeshoptDecoder(MeshoptDecoder)
  const gltf = await loader.loadAsync(url)
  const inner = gltf.scene
  inner.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.castShadow = true
    // Meshy の素材（色の画像を自己発光にも使い、金属度 1）は捨て、ワールドと同じトゥーン素材（クレイ込み）に色の画像だけ移す
    const src = mesh.material as THREE.MeshStandardMaterial
    const mat = toonMaterial({ color: '#ffffff' })
    mat.map = src.map ?? null
    mat.onBeforeCompile = (shader) => clayCompile(shader)
    mesh.material = mat
    src.dispose()
  })
  // 大きさと接地: 高さを主人公の HEIGHT_RATIO 倍に、足の裏を y=0、真ん中を原点に。正面は +z（Meshy の書き出しのまま）
  const height = heroHeight * HEIGHT_RATIO
  const box = new THREE.Box3().setFromObject(inner)
  const size = box.getSize(new THREE.Vector3())
  inner.scale.setScalar(size.y > 0 ? height / size.y : 1)
  inner.updateMatrixWorld(true)
  box.setFromObject(inner)
  const c = box.getCenter(new THREE.Vector3())
  inner.position.set(-c.x, -box.min.y, -c.z)
  const model = new THREE.Group()
  model.add(inner)
  return { model, height }
}

export async function loadScopCompanion(url: string, opts: { heroHeight: number; ground: (x: number, z: number) => number }): Promise<ScopCompanion> {
  const { model: inner, height } = await loadScopModel(url, opts.heroHeight)

  // body: 跳ねる・つぶれる（足元が基準）。root: 置き場所と向き
  const body = new THREE.Group()
  body.add(inner)
  const root = new THREE.Group()
  root.name = 'scop-companion'
  root.add(body)
  root.visible = false
  const shadow = contactShadow(height * 0.42)
  if (shadow) root.add(shadow)

  const pos = new THREE.Vector3()
  let placed = false
  let yaw = 0
  let reduce = false
  /** 跳ねている途中の時間（-1 は地面にいる）、着地のつぶれの残り */
  let hopT = -1
  let landT = 0
  let talk = false
  let breath = 0
  const prev = new THREE.Vector3()
  const right = new THREE.Vector3()
  const toCam = new THREE.Vector3()
  const want = new THREE.Vector3()
  const ahead = new THREE.Vector3()
  const heroPrev = new THREE.Vector3()
  const heroVel = new THREE.Vector3()
  let heroSeen = false
  const side = new THREE.Vector3()
  const ndc = new THREE.Vector3()

  return {
    root,
    update: (dt, hero, camera, look) => {
      if (!root.visible) return
      // 置きたい所: 主人公の斜め前。前 = 目印の方（無ければカメラの奥の方）、横 = 画面で見て右
      right.setFromMatrixColumn(camera.matrixWorld, 0).setY(0)
      if (right.lengthSq() < 1e-6) right.set(1, 0, 0)
      right.normalize()
      toCam.set(camera.position.x - hero.x, 0, camera.position.z - hero.z)
      if (toCam.lengthSq() < 1e-6) toCam.set(0, 0, 1)
      toCam.normalize()
      ahead.set(-toCam.x, 0, -toCam.z)
      if (look) {
        ahead.set(look.x - hero.x, 0, look.z - hero.z)
        if (ahead.lengthSq() < 1) ahead.set(-toCam.x, 0, -toCam.z)
        ahead.normalize()
      }
      side.set(-ahead.z, 0, ahead.x)
      if (side.dot(right) < 0) side.negate()
      // 主人公が歩いている時は、ついていく遅れ（速さ ÷ FOLLOW）の分だけ先へ置いて、前を歩き続ける
      if (heroSeen && dt > 0) {
        const vx = (hero.x - heroPrev.x) / dt
        const vz = (hero.z - heroPrev.z) / dt
        if (Math.hypot(vx, vz) < 12) {
          const a = 1 - Math.exp(-6 * dt)
          heroVel.x += (vx - heroVel.x) * a
          heroVel.z += (vz - heroVel.z) * a
        }
      }
      heroPrev.copy(hero)
      heroSeen = true
      want.copy(hero).addScaledVector(ahead, LEAD).addScaledVector(side, SIDE)
      const hx = ndc.copy(hero).project(camera).x
      const wx = ndc.copy(want).project(camera).x
      if (Math.abs(wx) > EDGE && Math.abs(wx - hx) > 1e-3) {
        const k = Math.max(SIDE_MIN, Math.min(1, (Math.sign(wx) * EDGE - hx) / (wx - hx)))
        want.copy(hero).addScaledVector(ahead, LEAD * k).addScaledVector(side, SIDE * k)
      }
      want.x += heroVel.x / FOLLOW
      want.z += heroVel.z / FOLLOW
      if (!placed || pos.distanceTo(want) > SNAP) {
        pos.copy(want)
        prev.copy(want)
        placed = true
      } else {
        pos.lerp(want, 1 - Math.exp(-FOLLOW * dt))
      }
      const speed = Math.hypot(pos.x - prev.x, pos.z - prev.z) / Math.max(dt, 1e-3)
      prev.copy(pos)

      // 跳ねる: 動いている間は続けて、止まっている時はしゃべる時だけ 1 回。動きをへらす時は跳ねない
      let y = 0
      let sy = 1
      if (!reduce) {
        if (hopT < 0 && landT <= 0 && (speed > 0.6 || talk)) {
          hopT = 0
          talk = false
        }
        if (hopT >= 0) {
          hopT += dt
          const u = Math.min(1, hopT / HOP_TIME)
          y = height * HOP_HEIGHT * 4 * u * (1 - u)
          // 速いところで縦に伸びる（頂点で 1、離れる・着く瞬間で STRETCH）
          sy = 1 + (STRETCH - 1) * Math.pow(Math.abs(u - 0.5) * 2, 3)
          if (u >= 1) {
            hopT = -1
            landT = LAND_TIME
          }
        } else if (landT > 0) {
          landT -= dt
          const q = 1 - Math.max(0, landT) / LAND_TIME
          sy = 1 - (1 - SQUASH) * Math.pow(1 - q, 2)
        } else {
          // 止まっている時は、ゆっくり息をする
          breath += dt
          sy = 1 + 0.025 * Math.sin(breath * 2.4)
        }
      } else {
        talk = false
      }
      const gy = opts.ground(pos.x, pos.z)
      root.position.set(pos.x, gy, pos.z)
      body.position.y = y
      body.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy))
      if (shadow) shadow.scale.setScalar(1 - Math.min(0.5, y / height))

      // 向き: 振り返って主人公（カメラ）のほう。歩いている間は進む方へ半分ほど、止まっていて目印がある時はその方へ少し向く
      const toCamYaw = Math.atan2(camera.position.x - pos.x, camera.position.z - pos.z)
      const turn = speed > 0.6 ? MOVE_TURN : look ? LOOK_TURN : 0
      const target = toCamYaw + angleDiff(Math.atan2(ahead.x, ahead.z), toCamYaw) * turn
      yaw += angleDiff(target, yaw) * (reduce ? 1 : 1 - Math.exp(-8 * dt))
      root.rotation.y = yaw
    },
    // 跳ねている分は入れない（吹き出しが一緒に跳ねて読みにくくならないように）
    anchor: (out) => out.set(root.position.x, root.position.y + height * 1.04, root.position.z),
    setVisible: (on) => {
      if (on && !root.visible) {
        placed = false
        heroSeen = false
        heroVel.set(0, 0, 0)
      }
      root.visible = on
    },
    hop: () => {
      talk = true
    },
    setReduceMotion: (on) => {
      reduce = on
    },
  }
}
