import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { toonMaterial } from '../render/toon'

/**
 * 実験（exp/lion-ai）: Meshy で生成したライオン（スキン＋歩行アニメ付き glTF）を読み込む。
 * ?model=ai のときだけ使う。読めなければ呼び出し側がプリミティブ版のまま続ける。
 * 向きと大きさはここで揃える: 頭が +z（群れの yaw 0 の向き）、足が y=0、体高 height。
 */
export interface LoadedAiLion {
  model: THREE.Object3D
  mixer: THREE.AnimationMixer | null
  /** 頭のボーン（見つかれば、静止時に首振りの生活感レイヤーに使う） */
  head?: THREE.Object3D
  clipNames: string[]
}

export async function loadAiLion(
  url: string,
  // length（頭から尾の先、+z 方向）があればそれに、なければ体高 height にそろえる
  opts: { length?: number; height?: number; animate: boolean; toon: boolean },
): Promise<LoadedAiLion> {
  const loader = new GLTFLoader()
  loader.setMeshoptDecoder(MeshoptDecoder)
  const gltf = await loader.loadAsync(url)
  const inner = gltf.scene
  inner.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.frustumCulled = false // スキンの境界箱がずれて消えるのを防ぐ
    // Meshy の書き出しは色の画像を自己発光（emissive 白）にも使い、金属度 1 になっている。
    // そのままだとワールドの光とトゥーンの陰影が効かないので、群れと同じトゥーン素材に差し替える
    const src = mesh.material as THREE.MeshStandardMaterial
    if (opts.toon && src.map) {
      mesh.material = toonMaterial({ color: '#ffffff' })
      ;(mesh.material as THREE.MeshToonMaterial).map = src.map
      src.dispose()
    }
  })

  const find = (re: RegExp) => {
    let hit: THREE.Object3D | undefined
    inner.traverse((o) => {
      if (!hit && re.test(o.name)) hit = o
    })
    return hit
  }
  const head = find(/head/i)
  const hips = find(/hips|pelvis|root/i)

  // 向き: 頭の位置が腰より前（+z）になるように回す
  const wrap = new THREE.Group()
  wrap.add(inner)
  inner.updateMatrixWorld(true)
  if (head && hips) {
    const h = head.getWorldPosition(new THREE.Vector3())
    const p = hips.getWorldPosition(new THREE.Vector3())
    inner.rotation.y = -Math.atan2(h.x - p.x, h.z - p.z)
  } else {
    // リグなし（静止モデル）: 体の長い方向の両端で高さを比べ、たてがみで高い側を頭とみなす
    const box0 = new THREE.Box3().setFromObject(inner)
    const size0 = box0.getSize(new THREE.Vector3())
    const c0 = box0.getCenter(new THREE.Vector3())
    const alongX = size0.x > size0.z
    let topPos = -Infinity
    let topNeg = -Infinity
    const v = new THREE.Vector3()
    inner.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      const pos = mesh.geometry.getAttribute('position')
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld)
        const d = alongX ? v.x - c0.x : v.z - c0.z
        if (d > 0) topPos = Math.max(topPos, v.y)
        else topNeg = Math.max(topNeg, v.y)
      }
    })
    const headSign = topPos >= topNeg ? 1 : -1
    inner.rotation.y = alongX ? -Math.atan2(headSign, 0) : headSign > 0 ? 0 : Math.PI
  }
  inner.updateMatrixWorld(true)

  // 大きさと接地
  const box = new THREE.Box3().setFromObject(inner)
  const size = box.getSize(new THREE.Vector3())
  const s = opts.length && size.z > 0 ? opts.length / size.z : opts.height && size.y > 0 ? opts.height / size.y : 1
  inner.scale.setScalar(s)
  inner.updateMatrixWorld(true)
  box.setFromObject(inner)
  const c = box.getCenter(new THREE.Vector3())
  inner.position.set(-c.x, -box.min.y, -c.z)

  let mixer: THREE.AnimationMixer | null = null
  const clips = gltf.animations
  if (opts.animate && clips.length) {
    mixer = new THREE.AnimationMixer(inner)
    const clip = clips.find((c) => /walk/i.test(c.name)) ?? clips[0]
    mixer.clipAction(clip).play()
  }
  return { model: wrap, mixer, head, clipNames: clips.map((c) => c.name) }
}
