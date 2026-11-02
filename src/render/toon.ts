import * as THREE from 'three'

/**
 * 様式化（トゥーン）の陰影。段差のあるグラデーションをコードで作り、全マテリアルで共有する。
 * 外部テクスチャは使わない。
 */
let gradient: THREE.DataTexture | null = null

export function toonGradient(): THREE.DataTexture {
  if (gradient) return gradient
  // 影 → 中間 → 明 → ハイライト。黒くつぶさず、影でも色が残る値にする
  const steps = [0.42, 0.62, 0.86, 1.0]
  const data = new Uint8Array(steps.length * 4)
  steps.forEach((v, i) => {
    const b = Math.round(v * 255)
    data[i * 4] = b
    data[i * 4 + 1] = b
    data[i * 4 + 2] = b
    data[i * 4 + 3] = 255
  })
  gradient = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat)
  gradient.minFilter = THREE.NearestFilter
  gradient.magFilter = THREE.NearestFilter
  gradient.generateMipmaps = false
  gradient.needsUpdate = true
  return gradient
}

export interface ToonOptions {
  color?: THREE.ColorRepresentation
  vertexColors?: boolean
  transparent?: boolean
  opacity?: number
  side?: THREE.Side
}

export function toonMaterial(options: ToonOptions = {}): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({
    color: options.color ?? '#ffffff',
    gradientMap: toonGradient(),
    vertexColors: options.vertexColors ?? false,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
    side: options.side ?? THREE.FrontSide,
  })
}
