import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { toonMaterial } from '../render/toon'
import { LION_COLORS } from './lions'

/**
 * 実験: Blender で作った様式化ライオン（glTF）を読み込み、トゥーンマテリアルに差し替える。
 * 読めなければ呼び出し側がプリミティブ版のまま続ける。
 * ノード名の約束: NeckPivot（首の回転）、EarL / EarR（耳）、TailPivot（尾）。
 */
export interface LoadedLionModel {
  model: THREE.Object3D
  parts: { neck?: THREE.Object3D; ears?: THREE.Object3D[]; tail?: THREE.Object3D }
}

const COLOR_BY_MATERIAL: Record<string, string> = {
  Tawny: LION_COLORS.tawny,
  Belly: LION_COLORS.belly,
  Dark: LION_COLORS.dark,
  Nose: LION_COLORS.nose,
  Mane: LION_COLORS.mane,
}

export async function loadLionModel(url: string): Promise<LoadedLionModel> {
  const loader = new GLTFLoader()
  const gltf = await loader.loadAsync(url)
  const model = gltf.scene
  const cache = new Map<string, THREE.Material>()
  model.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    const src = mesh.material as THREE.MeshStandardMaterial
    const name = src?.name ?? ''
    let mat = cache.get(name)
    if (!mat) {
      const color = COLOR_BY_MATERIAL[name] ?? (src?.color ? `#${src.color.getHexString()}` : LION_COLORS.tawny)
      mat = toonMaterial({ color })
      cache.set(name, mat)
    }
    mesh.material = mat
  })
  const ears = [model.getObjectByName('EarL'), model.getObjectByName('EarR')].filter(Boolean) as THREE.Object3D[]
  return {
    model,
    parts: {
      neck: model.getObjectByName('NeckPivot') ?? undefined,
      ears: ears.length ? ears : undefined,
      tail: model.getObjectByName('TailPivot') ?? undefined,
    },
  }
}
