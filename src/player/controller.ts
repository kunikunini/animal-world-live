import * as THREE from 'three'
import { SPAWN, WALK_RADIUS, WATERHOLE } from '../world/layout'
import { terrainHeight, terrainSlope } from '../world/terrain'
import type { Collider } from '../world/props'
import { toonMaterial } from '../render/toon'

export interface CameraOverride {
  position: { x: number; y: number; z: number }
  lookAt: { x: number; y: number; z: number }
}

export interface PlayerController {
  object: THREE.Object3D
  update: (dt: number) => void
  setReduceMotion: (on: boolean) => void
  /** 経由点をたどって歩く（最後の点が目的地） */
  goTo: (waypoints: Array<{ x: number; z: number }>) => void
  /** 今、目的地へ向かって歩いているか */
  isAutoWalking: () => boolean
  /** 観察画面などを開いている間、タップとキーを受け付けない */
  setInputEnabled: (on: boolean) => void
  /** 開発用: 位置と向きを即座に変える（スクリーンショットの定点） */
  teleport: (x: number, z: number, heading?: number, camYaw?: number) => void
  /** 開発用: 追従カメラを止めて固定の位置・注視点にする。null で戻す */
  setCameraOverride: (override: CameraOverride | null) => void
  dispose: () => void
}

const WALK_SPEED = 6.5
const TURN_SPEED = 9
const CAM_DISTANCE = 9.0
const CAM_HEIGHT = 3.4
const DRAG_THRESHOLD = 8
const PLAYER_RADIUS = 0.45
const CAMERA_RADIUS = 0.7
/** 登れる傾きの下限（法線の y 成分）。これより急な斜面は崖として扱う。南の坂（約32度）は登れる */
const MAX_CLIMB_SLOPE = 0.64

const _dir = new THREE.Vector3()
const _target = new THREE.Vector3()
const _camPos = new THREE.Vector3()
const _look = new THREE.Vector3()
const _hit = new THREE.Vector3()
const _prev = new THREE.Vector3()

/** 歩く人。精巧なモデルは作らず、温かい色のシンプルな姿にする */
function createFigure(): THREE.Group {
  const g = new THREE.Group()
  const skin = toonMaterial({ color: '#f1c9a0' })
  const cloth = toonMaterial({ color: '#e0683a' })
  const hatMat = toonMaterial({ color: '#efe0b6' })

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

/** 世界の端と水場の中には入れないように位置を寄せる */
function clampToWorld(p: THREE.Vector3): void {
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

/** その場所に立てるか（崖のように急でないか） */
function canStand(x: number, z: number): boolean {
  return terrainSlope(x, z, 0.5) >= MAX_CLIMB_SLOPE
}

/** 岩や幹の円から押し出す。押し出した量を返す */
function pushOutOfColliders(p: THREE.Vector3, radius: number, colliders: Collider[]): number {
  let pushed = 0
  for (const c of colliders) {
    const dx = p.x - c.x
    const dz = p.z - c.z
    const min = c.r + radius
    const d2 = dx * dx + dz * dz
    if (d2 >= min * min) continue
    const d = Math.sqrt(d2)
    if (d < 1e-4) {
      p.x = c.x + min
      pushed += min
      continue
    }
    const k = min / d
    p.x = c.x + dx * k
    p.z = c.z + dz * k
    pushed += min - d
  }
  return pushed
}

export function createPlayer(
  camera: THREE.PerspectiveCamera,
  terrain: THREE.Mesh,
  canvas: HTMLCanvasElement,
  scene: THREE.Scene,
  colliders: Collider[],
): PlayerController {
  const object = new THREE.Group()
  object.position.set(SPAWN.x, terrainHeight(SPAWN.x, SPAWN.z), SPAWN.z)
  const figure = createFigure()
  object.add(figure)

  const marker = createMarker()
  scene.add(marker)
  let markerLife = 0

  let heading = Math.PI // -z（コピエの方向）を向く
  let camYaw = heading + Math.PI // カメラは背後（+z 側）から見る
  let waypoints: THREE.Vector3[] = []
  let reduceMotion = false
  let walkPhase = 0
  let stuckTime = 0
  let inputEnabled = true
  let cameraOverride: CameraOverride | null = null

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
  camera.lookAt(object.position.x, object.position.y + 2.3, object.position.z)

  const showMarker = (p: THREE.Vector3) => {
    marker.position.set(p.x, terrainHeight(p.x, p.z) + 0.08, p.z)
    marker.visible = true
    markerLife = 1
  }

  const goTo = (points: Array<{ x: number; z: number }>) => {
    waypoints = points.map((p) => {
      const v = new THREE.Vector3(p.x, 0, p.z)
      clampToWorld(v)
      v.y = terrainHeight(v.x, v.z)
      return v
    })
    stuckTime = 0
    if (waypoints.length > 0) showMarker(waypoints[waypoints.length - 1])
  }

  // --- 入力 ---
  let pointerId: number | null = null
  let downX = 0
  let downY = 0
  let lastX = 0
  let dragging = false

  const onPointerDown = (e: PointerEvent) => {
    if (!inputEnabled || pointerId !== null) return
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
    goTo([{ x: _hit.x, z: _hit.z }])
  }

  const onPointerCancel = (e: PointerEvent) => {
    if (e.pointerId === pointerId) pointerId = null
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (!inputEnabled) return
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
  const update = (dt: number) => {
    // キー入力（カメラ基準）
    let kx = 0
    let kz = 0
    if (keys.has('w') || keys.has('arrowup')) kz -= 1
    if (keys.has('s') || keys.has('arrowdown')) kz += 1
    if (keys.has('a') || keys.has('arrowleft')) kx -= 1
    if (keys.has('d') || keys.has('arrowright')) kx += 1

    _prev.copy(object.position)
    let moving = false
    let wanted = 0

    if (kx !== 0 || kz !== 0) {
      waypoints = []
      marker.visible = false
      const len = Math.hypot(kx, kz)
      kx /= len
      kz /= len
      // カメラの向き（camYaw）を基準に回す
      const sin = Math.sin(camYaw)
      const cos = Math.cos(camYaw)
      _dir.set(kx * cos + kz * sin, 0, -kx * sin + kz * cos)
      wanted = WALK_SPEED * dt
      _target.copy(object.position).addScaledVector(_dir, wanted)
      object.position.x = _target.x
      object.position.z = _target.z
      moving = true
    } else if (waypoints.length > 0) {
      const dest = waypoints[0]
      _dir.subVectors(dest, object.position)
      _dir.y = 0
      const dist = _dir.length()
      if (dist < 0.2) {
        waypoints.shift()
        stuckTime = 0
      } else {
        _dir.divideScalar(dist)
        wanted = Math.min(dist, WALK_SPEED * dt)
        object.position.addScaledVector(_dir, wanted)
        moving = true
      }
    }

    // 当たり判定: 世界の端・水場・岩・幹
    clampToWorld(object.position)
    pushOutOfColliders(object.position, PLAYER_RADIUS, colliders)

    // 崖: 急な斜面には入れない。すでに急な場所にいる時は抜け出せるように止めない。
    // 壁に沿って滑れるよう、x だけ・z だけの移動も試す
    if (moving && canStand(_prev.x, _prev.z) && !canStand(object.position.x, object.position.z)) {
      const nx = object.position.x
      const nz = object.position.z
      if (canStand(nx, _prev.z)) {
        object.position.z = _prev.z
      } else if (canStand(_prev.x, nz)) {
        object.position.x = _prev.x
      } else {
        object.position.x = _prev.x
        object.position.z = _prev.z
      }
    }
    object.position.y = terrainHeight(object.position.x, object.position.z)

    // 岩に阻まれて進めない時は、目的地をあきらめる（永遠に足踏みしない）
    if (moving && waypoints.length > 0 && wanted > 0) {
      const actual = Math.hypot(object.position.x - _prev.x, object.position.z - _prev.z)
      if (actual < wanted * 0.25) {
        stuckTime += dt
        if (stuckTime > 0.6) {
          waypoints = []
          marker.visible = false
          stuckTime = 0
        }
      } else {
        stuckTime = 0
      }
    }

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

    if (cameraOverride) {
      camera.position.set(cameraOverride.position.x, cameraOverride.position.y, cameraOverride.position.z)
      camera.lookAt(cameraOverride.lookAt.x, cameraOverride.lookAt.y, cameraOverride.lookAt.z)
      marker.visible = false
      return
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
    // カメラも岩にめり込まない。押し出された分だけキャラに寄る
    pushOutOfColliders(_camPos, CAMERA_RADIUS, colliders)
    const groundAtCam = terrainHeight(_camPos.x, _camPos.z)
    _camPos.y = Math.max(object.position.y + CAM_HEIGHT, groundAtCam + 2.2)
    const follow = reduceMotion ? 1 : Math.min(1, 6 * dt)
    camera.position.lerp(_camPos, follow)
    _look.set(object.position.x, object.position.y + 2.3, object.position.z)
    camera.lookAt(_look)

    // 目印のフェード
    if (marker.visible) {
      markerLife -= dt * 0.9
      const m = marker.material as THREE.MeshBasicMaterial
      m.opacity = Math.max(0, Math.min(1, markerLife)) * 0.9
      marker.scale.setScalar(1 + (1 - Math.max(0, markerLife)) * 0.6)
      if (markerLife <= 0) marker.visible = false
    }
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
    goTo,
    isAutoWalking: () => waypoints.length > 0,
    setInputEnabled: (on) => {
      inputEnabled = on
      if (!on) {
        keys.clear()
        pointerId = null
      }
    },
    setReduceMotion: (on) => {
      reduceMotion = on
    },
    teleport: (x, z, nextHeading, nextCamYaw) => {
      waypoints = []
      marker.visible = false
      object.position.set(x, 0, z)
      clampToWorld(object.position)
      object.position.y = terrainHeight(object.position.x, object.position.z)
      if (nextHeading !== undefined) heading = nextHeading
      camYaw = nextCamYaw ?? heading + Math.PI
      object.rotation.y = heading
      _camPos.set(
        object.position.x + Math.sin(camYaw) * CAM_DISTANCE,
        0,
        object.position.z + Math.cos(camYaw) * CAM_DISTANCE,
      )
      pushOutOfColliders(_camPos, CAMERA_RADIUS, colliders)
      _camPos.y = Math.max(object.position.y + CAM_HEIGHT, terrainHeight(_camPos.x, _camPos.z) + 2.2)
      camera.position.copy(_camPos)
      camera.lookAt(object.position.x, object.position.y + 2.3, object.position.z)
    },
    setCameraOverride: (override) => {
      cameraOverride = override
    },
    dispose,
  }
}
