import * as THREE from 'three'

/**
 * 様式化（トゥーン）の陰影。段差のあるグラデーションをコードで作り、全マテリアルで共有する。
 * 外部テクスチャは使わない。
 */
let gradient: THREE.DataTexture | null = null

export function toonGradient(): THREE.DataTexture {
  if (gradient) return gradient
  // 影 → 中間 → 明 → ハイライト。黒くつぶさず、影でも色が残る値にする。
  // 影の段を少し深くして、動物や木の形がくっきり分かれるようにする
  const steps = [0.32, 0.56, 0.86, 1.0]
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

const vivid = new WeakSet<THREE.Material>()
/**
 * 動物の毛色を鮮やかにする（トップの絵のような色に）。ACES のトーンマッピングは日なたの明るい色を白っぽく褪せさせるので、
 * そのぶん素の色の彩度を上げて、草原の上で動物が沈まないようにする。毛色どうしの違い（個体差）は保つ。同じ材質は 1 回だけ
 */
export function vividToon(root: THREE.Object3D, saturation = 1.3): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const m of mats) {
      if (!(m instanceof THREE.MeshToonMaterial) || vivid.has(m)) continue
      vivid.add(m)
      const c = m.color
      const lum = c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722
      c.setRGB(
        Math.max(0, lum + (c.r - lum) * saturation),
        Math.max(0, lum + (c.g - lum) * saturation),
        Math.max(0, lum + (c.b - lum) * saturation),
      )
    }
  })
}
