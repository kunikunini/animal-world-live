import * as THREE from 'three'
import { SPOT } from './layout'
import { terrainHeight } from './terrain'

export interface ObservationSpot {
  group: THREE.Group
  /** スポットの足元の位置 */
  position: THREE.Vector3
  /** distance はプレイヤーまでの距離。近づくと光の柱を消す */
  update: (time: number, distance: number) => void
}

/**
 * 観察スポット。コピエ台地の頂上に、木の柱と光の輪を置く。
 * 精巧な双眼鏡は作らず、遠くからでも見つけられる目印にする。
 */
export function createObservationSpot(): ObservationSpot {
  const group = new THREE.Group()
  group.name = 'observation-spot'
  const y = terrainHeight(SPOT.x, SPOT.z)
  const position = new THREE.Vector3(SPOT.x, y, SPOT.z)
  group.position.copy(position)

  const wood = new THREE.MeshStandardMaterial({ color: '#6b4a2b', roughness: 0.9 })
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 1.3, 8), wood)
  post.position.y = 0.65
  post.castShadow = true
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.08), wood)
  bar.position.y = 1.28
  bar.castShadow = true
  // 双眼鏡を模した2本の筒
  const lensMat = new THREE.MeshStandardMaterial({ color: '#2d2a26', roughness: 0.5, metalness: 0.3 })
  const lensL = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.3, 10), lensMat)
  lensL.rotation.x = Math.PI / 2
  lensL.position.set(-0.1, 1.42, 0)
  const lensR = lensL.clone()
  lensR.position.x = 0.1

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

  group.add(post, bar, lensL, lensR, ring, beam)

  return {
    group,
    position,
    update: (time, distance) => {
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
