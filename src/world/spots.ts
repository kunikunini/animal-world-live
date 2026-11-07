import * as THREE from 'three'
import { SPOT } from './layout'
import { terrainHeight } from './terrain'
import { toonMaterial } from '../render/toon'

export interface ObservationSpot {
  group: THREE.Group
  /** スポットの足元の位置 */
  position: THREE.Vector3
  /** 双眼鏡の頭（中心）の世界座標。「スコープをのぞく」の吹き出しをこの右上に出す */
  head: THREE.Vector3
  /** distance はプレイヤーまでの距離。近づくと光の柱を消す。player を渡すと双眼鏡がそちらを向く */
  update: (time: number, distance: number, player?: THREE.Vector3) => void
}

/**
 * 観察スポット。コピエ台地の頂上に、木の柱と光の輪と、アプリのアイコンと同じ青い双眼鏡を置く
 * （青い本体・赤のアクセント・黒の接眼と縁・水色に光るレンズ）。
 * 双眼鏡は近くにいるプレイヤーの方へゆっくり向き、レンズ側が見える（アイコンと同じ見え方）。
 */
/** opts.head = false で双眼鏡を載せない（サバンナの奥のにせのスポット。台の上はスコップが逆立ちする） */
export function createObservationSpot(at: { x: number; z: number } = SPOT, opts: { head?: boolean } = {}): ObservationSpot {
  const group = new THREE.Group()
  group.name = 'observation-spot'
  const y = terrainHeight(at.x, at.z)
  const position = new THREE.Vector3(at.x, y, at.z)
  group.position.copy(position)

  const wood = toonMaterial({ color: '#7a5431' })
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 1.3, 8), wood)
  post.position.y = 0.65
  post.castShadow = true
  // 柱の上の受け（双眼鏡が載る小さな台）
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.08, 10), wood)
  cap.position.y = 1.32
  // 受けから双眼鏡の下までの短い首
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.16, 8), wood)
  neck.position.y = 1.42

  // 青い双眼鏡（アイコンと同じ配色）。レンズは頭の +z 側
  const head = new THREE.Group()
  // 遠くからでも青い双眼鏡と分かる大きさ（幅およそ 0.9m）
  const HEAD_Y = 1.6
  head.position.y = HEAD_Y
  head.scale.setScalar(1.5)
  const blue = toonMaterial({ color: '#2f4fd8' })
  const red = toonMaterial({ color: '#e8322a' })
  const black = toonMaterial({ color: '#26262b' })
  const glass = new THREE.MeshBasicMaterial({ color: '#3ff2ff' })
  const shine = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85 })
  const barrelGeo = new THREE.CylinderGeometry(0.135, 0.14, 0.26, 20)
  barrelGeo.rotateX(Math.PI / 2)
  const rimGeo = new THREE.TorusGeometry(0.112, 0.034, 10, 28)
  const glassGeo = new THREE.CircleGeometry(0.1, 28)
  const shineGeo = new THREE.CircleGeometry(0.03, 12)
  shineGeo.scale(1.4, 0.7, 1)
  const cupGeo = new THREE.CylinderGeometry(0.085, 0.095, 0.08, 16)
  cupGeo.rotateX(Math.PI / 2)
  const panelGeo = new THREE.BoxGeometry(0.13, 0.03, 0.15)
  const gripGeo = new THREE.BoxGeometry(0.035, 0.12, 0.13)
  for (const side of [-1, 1]) {
    const x = side * 0.155
    const barrel = new THREE.Mesh(barrelGeo, blue)
    barrel.position.x = x
    barrel.castShadow = true
    const rim = new THREE.Mesh(rimGeo, black)
    rim.position.set(x, 0, 0.13)
    const lens = new THREE.Mesh(glassGeo, glass)
    lens.position.set(x, 0, 0.135)
    const hi = new THREE.Mesh(shineGeo, shine)
    hi.position.set(x - 0.035, 0.04, 0.137)
    hi.rotation.z = 0.5
    const cup = new THREE.Mesh(cupGeo, black)
    cup.position.set(x, 0.01, -0.16)
    const panel = new THREE.Mesh(panelGeo, red)
    panel.position.set(x + side * 0.02, 0.13, 0)
    panel.rotation.z = -side * 0.35
    const grip = new THREE.Mesh(gripGeo, black)
    grip.position.set(x + side * 0.14, 0, 0.01)
    head.add(barrel, rim, lens, hi, cup, panel, grip)
  }
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.2), blue)
  bridge.position.y = 0.03
  const knobBase = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 16), black)
  knobBase.rotation.x = Math.PI / 2
  knobBase.position.set(0, 0.02, 0.11)
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.03, 16), red)
  knob.rotation.x = Math.PI / 2
  knob.position.set(0, 0.02, 0.145)
  const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.06, 16), red)
  dial.rotation.z = Math.PI / 2
  dial.position.set(0, 0.12, -0.02)
  head.add(bridge, knobBase, knob, dial)

  // 足元の光の輪
  const ringGeo = new THREE.RingGeometry(1.1, 1.45, 48)
  ringGeo.rotateX(-Math.PI / 2)
  const ringMat = new THREE.MeshBasicMaterial({ color: '#fff0c2', transparent: true, opacity: 0.7, depthWrite: false })
  const ring = new THREE.Mesh(ringGeo, ringMat)
  ring.position.y = 0.06

  // 遠くから見つけるための、やわらかい光の柱
  const beamGeo = new THREE.CylinderGeometry(0.35, 0.9, 14, 16, 1, true)
  beamGeo.translate(0, 7, 0)
  const beamMat = new THREE.MeshBasicMaterial({
    color: '#ffe3a6',
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  })
  const beam = new THREE.Mesh(beamGeo, beamMat)

  group.add(post, cap, neck, ring, beam)
  if (opts.head !== false) group.add(head)

  const headWorld = position.clone().add(new THREE.Vector3(0, head.position.y, 0))
  let lastTime = 0
  return {
    group,
    position,
    head: headWorld,
    update: (time, distance, player) => {
      const dt = Math.min(0.1, Math.max(0, time - lastTime))
      lastTime = time
      // 近く（25m 以内）にいるプレイヤーの方へ、ゆっくり向く
      if (player && distance < 25) {
        const target = Math.atan2(player.x - position.x, player.z - position.z)
        let diff = target - head.rotation.y
        diff = Math.atan2(Math.sin(diff), Math.cos(diff))
        head.rotation.y += diff * Math.min(1, dt * 2.5)
      }
      // ほんの少し上下に揺れる（見つけてもらうための小さな動き）
      head.position.y = HEAD_Y + Math.sin(time * 1.6) * 0.015
      const pulse = 0.5 + 0.5 * Math.sin(time * 1.8)
      ringMat.opacity = 0.45 + pulse * 0.35
      ring.scale.setScalar(1 + pulse * 0.08)
      // 近くでは柱が視界をふさぐので、8〜20m の間で消す
      const far = Math.min(1, Math.max(0, (distance - 8) / 12))
      beamMat.opacity = (0.12 + pulse * 0.06) * far
      beam.visible = far > 0.01
    },
  }
}
