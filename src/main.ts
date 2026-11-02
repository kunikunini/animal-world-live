import * as THREE from 'three'
import { createScene } from './world/scene'
import { createTerrain } from './world/terrain'
import { createProps } from './world/props'
import { createPlayer } from './player/controller'
import { createHud } from './ui/hud'
import { createObservationSpot } from './world/spots'
import { SPOT } from './world/layout'
import { createObserveView } from './ui/observe'
import { createBookView } from './ui/book'
import { createFriendBookStore } from './data/friends'
import { getAnimal } from './data/animals'

function hasWebGL(canvas: HTMLCanvasElement): boolean {
  try {
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {
    return false
  }
}

function isMobile(): boolean {
  return window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 768
}

/** 3D ワールドに依存しない部分。ともだち帳と観察モニターは WebGL が無くても使える */
function createShell() {
  const store = createFriendBookStore()
  const hud = createHud()
  const observe = createObserveView(store)
  const book = createBookView(store)

  // ともだち帳の「会いに行く」: 3D を歩かずに映像へ直行
  book.onVisit((animal) => observe.open(animal, 'book'))
  hud.onOpenBook(() => book.open())
  observe.onBefriend(() => hud.pulseBook())
  observe.setReduceMotion(hud.reduceMotion)
  hud.onReduceMotionChange((on) => observe.setReduceMotion(on))

  for (const id of ['entry-book', 'fallback-book']) {
    document.getElementById(id)?.addEventListener('click', () => book.open())
  }

  return { store, hud, observe, book }
}

type Shell = ReturnType<typeof createShell>

function startWorld(canvas: HTMLCanvasElement, shell: Shell): void {
  const { hud, observe, book } = shell
  const mobile = isMobile()
  const { renderer, scene, camera, sun, sky, setDpr } = createScene(canvas, mobile ? 1.5 : 2)
  if (mobile) sun.shadow.mapSize.set(1024, 1024)

  const terrain = createTerrain()
  scene.add(terrain)

  const props = createProps()
  scene.add(props.group)

  const spot = createObservationSpot()
  scene.add(spot.group)

  const player = createPlayer(camera, terrain, canvas, scene, props.colliders)
  scene.add(player.object)

  // 「観察スポットへ」: 南の登り口を経由して台地の頂上へ
  hud.onGoToSpot(() => {
    player.goTo([SPOT.approach, { x: SPOT.x, z: SPOT.z }])
  })

  // 観察画面。スポットの主役はアンジー（母）。家族の映像を共有する
  hud.onViewSpot(() => {
    const animal = getAnimal(SPOT.animalId)
    if (animal) observe.open(animal, 'world')
  })

  // 何かの画面が開いている間は、ワールドのタップとキーを止める
  const syncInput = () => {
    const blocked = observe.isOpen() || book.isOpen()
    player.setInputEnabled(!blocked)
    if (!blocked) canvas.focus()
  }
  observe.onOpenChange(syncInput)
  book.onOpenChange(syncInput)
  syncInput()

  const applyReduceMotion = (on: boolean) => {
    player.setReduceMotion(on)
    props.setSway(on ? 0 : 1)
  }
  applyReduceMotion(hud.reduceMotion)
  hud.onReduceMotionChange(applyReduceMotion)
  hud.show()

  const spotHead = spot.position.clone().add(new THREE.Vector3(0, 2.2, 0))
  const projected = new THREE.Vector3()
  let arrived = false

  // 影のカメラはプレイヤーについていく
  const sunOffset = sun.position.clone()

  const clock = new THREE.Clock()
  let fpsAcc = 0
  let fpsFrames = 0
  let slowSeconds = 0
  let currentDpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2)

  const tick = () => {
    const dt = Math.min(clock.getDelta(), 0.05)
    const time = clock.elapsedTime

    player.update(dt)
    props.update(time)

    // 観察スポットとの距離。着いたらバナー、離れたらボタン
    const distance = Math.hypot(player.object.position.x - spot.position.x, player.object.position.z - spot.position.z)
    spot.update(time, distance)
    const nowArrived = distance < SPOT.arriveRadius
    if (nowArrived !== arrived) {
      arrived = nowArrived
      hud.setArrived(arrived)
    }
    hud.setGoToSpotVisible(!arrived && !player.isAutoWalking())

    // スポットのラベルを画面に重ねる（カメラの後ろにある時は隠す）
    projected.copy(spotHead).project(camera)
    if (projected.z < 1 && Math.abs(projected.x) < 1.1 && Math.abs(projected.y) < 1.1 && !arrived) {
      hud.setSpotLabel(
        { x: ((projected.x + 1) / 2) * window.innerWidth, y: ((1 - projected.y) / 2) * window.innerHeight },
        distance,
      )
    } else {
      hud.setSpotLabel(null, distance)
    }

    sun.target.position.copy(player.object.position)
    sun.position.copy(player.object.position).add(sunOffset)
    sky.position.copy(camera.position)

    renderer.render(scene, camera)

    // 簡易 FPS 計測と DPR の自動調整
    fpsAcc += dt
    fpsFrames++
    if (fpsAcc >= 1) {
      const fps = fpsFrames / fpsAcc
      hud.setFps(fps)
      // 画面が隠れている間はブラウザが描画を間引くので、見えている時だけ判定する
      if (fps < 28 && currentDpr > 1 && document.visibilityState === 'visible') {
        slowSeconds++
        if (slowSeconds >= 3) {
          currentDpr = Math.max(1, currentDpr - 0.5)
          setDpr(currentDpr)
          slowSeconds = 0
        }
      } else {
        slowSeconds = 0
      }
      fpsAcc = 0
      fpsFrames = 0
    }
    requestAnimationFrame(tick)
  }

  if (import.meta.env.DEV) {
    // 開発時だけ、ブラウザのコンソールから中身を覗けるようにする
    ;(window as unknown as { __awl: unknown }).__awl = { camera, spot, player, props, shell }
  }

  // 1フレーム描いてから入口を消す（白画面を見せない）
  renderer.render(scene, camera)
  requestAnimationFrame(tick)
}

function main(): void {
  const canvas = document.getElementById('world') as HTMLCanvasElement
  const entry = document.getElementById('entry') as HTMLElement
  const fallback = document.getElementById('fallback') as HTMLElement
  const enter = document.getElementById('enter') as HTMLButtonElement

  const shell = createShell()

  if (!hasWebGL(canvas)) {
    entry.hidden = true
    fallback.hidden = false
    return
  }

  enter.addEventListener('click', () => {
    enter.disabled = true
    try {
      startWorld(canvas, shell)
      entry.hidden = true
      canvas.focus()
    } catch (err) {
      console.error(err)
      entry.hidden = true
      fallback.hidden = false
    }
  })
}

main()
