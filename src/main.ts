import * as THREE from 'three'
import { createScene } from './world/scene'
import { createTerrain } from './world/terrain'
import { createProps } from './world/props'
import { createPlayer } from './player/controller'
import { createHud } from './ui/hud'

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

function startWorld(canvas: HTMLCanvasElement): void {
  const mobile = isMobile()
  const { renderer, scene, camera, sun, sky, setDpr } = createScene(canvas, mobile ? 1.5 : 2)
  if (mobile) sun.shadow.mapSize.set(1024, 1024)

  const terrain = createTerrain()
  scene.add(terrain)

  const props = createProps()
  scene.add(props.group)

  const hud = createHud()
  const player = createPlayer(camera, terrain, canvas, scene)
  scene.add(player.object)

  const applyReduceMotion = (on: boolean) => {
    player.setReduceMotion(on)
    props.setSway(on ? 0 : 1)
  }
  applyReduceMotion(hud.reduceMotion)
  hud.onReduceMotionChange(applyReduceMotion)
  hud.show()

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

    player.update(dt, time)
    props.update(time)

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

  // 1フレーム描いてから入口を消す（白画面を見せない）
  renderer.render(scene, camera)
  requestAnimationFrame(tick)
}

function main(): void {
  const canvas = document.getElementById('world') as HTMLCanvasElement
  const entry = document.getElementById('entry') as HTMLElement
  const fallback = document.getElementById('fallback') as HTMLElement
  const enter = document.getElementById('enter') as HTMLButtonElement

  if (!hasWebGL(canvas)) {
    entry.hidden = true
    fallback.hidden = false
    return
  }

  enter.addEventListener('click', () => {
    enter.disabled = true
    try {
      startWorld(canvas)
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
