import * as THREE from 'three'
import { SPAWN, WALK_RADIUS, WATERHOLE } from '../world/layout'
import { terrainHeight } from '../world/terrain'

export interface PlayerController {
  object: THREE.Object3D
  update: (dt: number, time: number) => void
  setReduceMotion: (on: boolean) => void
  dispose: () => void
}

const WALK_SPEED = 6.5
const TURN_SPEED = 9
const CAM_DISTANCE = 9.5
const CAM_HEIGHT = 4.6
const DRAG_THRESHOLD = 8

const _dir = new THREE.Vector3()
const _target = new THREE.Vector3()
const _camPos = new THREE.Vector3()
const _look = new THREE.Vector3()
const _hit = new THREE.Vector3()

/** 歩く人。精巧なモデルは作らず、温かい色のシンプルな姿にする */
function createFigure(): THREE.Group {
  const g = new THREE.Group()
  const skin = new THREE.MeshStandardMaterial({ color: '#f1c9a0', roughness: 0.8 })
  const cloth = new THREE.MeshStandardMaterial({ color: '#d96f3a', roughness: 0.85 })
  const hatMat = new THREE.MeshStandardMaterial({ color: '#e8d6a8', roughness: 0.9 })

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.7, 4, 10), cloth)
  body.position.y = 0.68
  body.castShadow = true

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), skin)
  head.position.y = 1.58
  head.castShadow = true

  const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.52, 0.08, 14), hatMat)
  hat.position.y = 1.8
  hat.castShadow = true
  const hatTop = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.22, 14), hatMat)
  hatTop.position.y = 1.93
  hatTop.castShadow = true

  g.add(body, head, hat, hatTop)
  return g
}

/** タップ先の目印 */
function createMarker(): THREE.Mesh {
  const geo = new THREE.RingGeometry(0.45, 0.65, 32)
  geo.rotateX(-Math.PI / 2)
  const mat = new THREE.MeshBasicMaterial({ color: '#fff2c8', transparent: true, opacity: 0, depthWrite: false })
  const m = new THREE.Mesh(geo, mat)
  m.visible = false
  return m
}

/** 水場の中には入れないように目的地を手前に寄せる */
function clampDestination(p: THREE.Vector3): void {
  const r = Math.hypot(p.x, p.z)
  if (r > WALK_RADIUS) {
    p.x *= WALK_RADIUS / r
    p.z *= WALK_RADIUS / r
  }
  const dx = p.x - WATERHOLE.x
  const dz = p.z - WATERHOLE.z
  const d = Math.hypot(dx, dz)
  const min = WATERHOLE.radius + 1.2
  if (d < min) {
    const k = d < 1e-3 ? 1 : min / d
    p.x = WATERHOLE.x + (d < 1e-3 ? min : dx * k)
    p.z = WATERHOLE.z + (d < 1e-3 ? 0 : dz * k)
  }
}

export function createPlayer(
  camera: THREE.PerspectiveCamera,
  terrain: THREE.Mesh,
  canvas: HTMLCanvasElement,
  scene: THREE.Scene,
): PlayerController {
  const object = new THREE.Group()
  object.position.set(SPAWN.x, terrainHeight(SPAWN.x, SPAWN.z), SPAWN.z)
  const figure = createFigure()
  object.add(figure)

  const marker = createMarker()
  scene.add(marker)
  let markerLife = 0

  let heading = Math.PI // -z（コピエの方向）を向く
  let camYaw = Math.PI
  let destination: THREE.Vector3 | null = null
  let reduceMotion = false
  let walkPhase = 0

  const keys = new Set<string>()
  const raycaster = new THREE.Raycaster()
  const ndc = new THREE.Vector2()

  // 初期カメラ位置
  _camPos.set(
    object.position.x + Math.sin(camYaw) * CAM_DISTANCE,
    object.position.y + CAM_HEIGHT,
    object.position.z + Math.cos(camYaw) * CAM_DISTANCE,
  )
  camera.position.copy(_camPos)
  camera.lookAt(object.position.x, object.position.y + 1.4, object.position.z)

  // --- 入力 ---
  let pointerId: number | null = null
  let downX = 0
  let downY = 0
  let lastX = 0
  let dragging = false

  const onPointerDown = (e: PointerEvent) => {
    if (pointerId !== null) return
    pointerId = e.pointerId
    downX = lastX = e.clientX
    downY = e.clientY
    dragging = false
    canvas.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return
    if (!dragging && Math.hypot(e.clientX - downX, e.clientY - downY) > DRAG_THRESHOLD) dragging = true
    if (dragging) {
      camYaw -= (e.clientX - lastX) * 0.006
    }
    lastX = e.clientX
  }

  const onPointerUp = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return
    pointerId = null
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId)
    if (dragging) return
    // タップ: 地形へレイを飛ばして目的地にする
    const rect = canvas.getBoundingClientRect()
    ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
    raycaster.setFromCamera(ndc, camera)
    const hits = raycaster.intersectObject(terrain, false)
    if (hits.length === 0) return
    _hit.copy(hits[0].point)
    clampDestination(_hit)
    _hit.y = terrainHeight(_hit.x, _hit.z)
    destination = _hit.clone()
    marker.position.copy(destination).add(new THREE.Vector3(0, 0.08, 0))
    marker.visible = true
    markerLife = 1
  }

  const onPointerCancel = (e: PointerEvent) => {
    if (e.pointerId === pointerId) pointerId = null
  }

  const onKeyDown = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase()
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
      keys.add(k)
      e.preventDefault()
    }
  }
  const onKeyUp = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase())
  const onBlur = () => keys.clear()

  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('pointercancel', onPointerCancel)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onBlur)

  // --- 更新 ---
  const update = (dt: number, time: number) => {
    // キー入力（カメラ基準）
    let kx = 0
    let kz = 0
    if (keys.has('w') || keys.has('arrowup')) kz -= 1
    if (keys.has('s') || keys.has('arrowdown')) kz += 1
    if (keys.has('a') || keys.has('arrowleft')) kx -= 1
    if (keys.has('d') || keys.has('arrowright')) kx += 1

    let moving = false
    if (kx !== 0 || kz !== 0) {
      destination = null
      marker.visible = false
      const len = Math.hypot(kx, kz)
      kx /= len
      kz /= len
      // カメラの向き（camYaw）を基準に回す
      const sin = Math.sin(camYaw)
      const cos = Math.cos(camYaw)
      _dir.set(kx * cos + kz * sin, 0, -kx * sin + kz * cos)
      _target.copy(object.position).addScaledVector(_dir, WALK_SPEED * dt)
      clampDestination(_target)
      object.position.x = _target.x
      object.position.z = _target.z
      moving = true
    } else if (destination) {
      _dir.subVectors(destination, object.position)
      _dir.y = 0
      const dist = _dir.length()
      if (dist < 0.15) {
        destination = null
      } else {
        _dir.divideScalar(dist)
        const step = Math.min(dist, WALK_SPEED * dt)
        object.position.addScaledVector(_dir, step)
        moving = true
      }
    }

    object.position.y = terrainHeight(object.position.x, object.position.z)

    // 向き
    if (moving) {
      const want = Math.atan2(_dir.x, _dir.z)
      let diff = want - heading
      diff = Math.atan2(Math.sin(diff), Math.cos(diff))
      heading += diff * Math.min(1, TURN_SPEED * dt)
      walkPhase += dt * 9
    }
    object.rotation.y = heading

    // 歩きの揺れ（動きをへらす時は止める）
    if (moving && !reduceMotion) {
      figure.position.y = Math.abs(Math.sin(walkPhase)) * 0.06
      figure.rotation.z = Math.sin(walkPhase) * 0.04
    } else {
      figure.position.y = 0
      figure.rotation.z = 0
    }

    // カメラ: 移動中はゆっくり背後へ回り込む
    if (moving && pointerId === null) {
      let diff = heading + Math.PI - camYaw
      diff = Math.atan2(Math.sin(diff), Math.cos(diff))
      camYaw += diff * Math.min(1, 1.6 * dt)
    }
    _camPos.set(
      object.position.x + Math.sin(camYaw) * CAM_DISTANCE,
      0,
      object.position.z + Math.cos(camYaw) * CAM_DISTANCE,
    )
    const groundAtCam = terrainHeight(_camPos.x, _camPos.z)
    _camPos.y = Math.max(object.position.y + CAM_HEIGHT, groundAtCam + 2.2)
    const follow = reduceMotion ? 1 : Math.min(1, 6 * dt)
    camera.position.lerp(_camPos, follow)
    _look.set(object.position.x, object.position.y + 1.5, object.position.z)
    camera.lookAt(_look)

    // 目印のフェード
    if (marker.visible) {
      markerLife -= dt * 0.9
      const m = marker.material as THREE.MeshBasicMaterial
      m.opacity = Math.max(0, Math.min(1, markerLife)) * 0.9
      marker.scale.setScalar(1 + (1 - Math.max(0, markerLife)) * 0.6)
      if (markerLife <= 0) marker.visible = false
    }
    void time
  }

  const dispose = () => {
    canvas.removeEventListener('pointerdown', onPointerDown)
    canvas.removeEventListener('pointermove', onPointerMove)
    canvas.removeEventListener('pointerup', onPointerUp)
    canvas.removeEventListener('pointercancel', onPointerCancel)
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    window.removeEventListener('blur', onBlur)
  }

  return {
    object,
    update,
    setReduceMotion: (on) => {
      reduceMotion = on
    },
    dispose,
  }
}
