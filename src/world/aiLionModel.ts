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
  /** 毎フレーム呼ぶ（歩行の再生と姿勢の補正）。歩行がなければ無い */
  tick?: (dt: number) => void
  /** 姿勢の補正の強さ（実験用。その場で書き換えると次のコマから効く） */
  posture?: PostureFix
}

/**
 * 歩行の姿勢の補正。Meshy の四足用「歩く」（イヌ科のリグ）は、ネコ科の体だと腰が落ちて尾の先が地面に着く。
 * 再生した後に、後ろ脚・背骨・尾のボーンの回転を立ち姿（バインドポーズ）の方へ寄せる（0 = そのまま、1 = 立ち姿）
 */
export interface PostureFix {
  hind: number
  spine: number
  tail: number
  /** 前脚も寄せる（成獣は前脚も曲がっていて、後ろを起こすと前足が浮くため） */
  front?: number
  /** 毎コマ、いちばん低い足裏が地面（y=0）に来るように体全体の高さを合わせる */
  ground: boolean
}

export async function loadAiLion(
  url: string,
  // length（頭から尾の先、+z 方向）があればそれに、なければ体高 height にそろえる
  opts: { length?: number; height?: number; animate: boolean; toon: boolean; posture?: PostureFix },
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
  let tick: ((dt: number) => void) | undefined
  const clips = gltf.animations
  if (opts.animate && clips.length) {
    const m = new THREE.AnimationMixer(inner)
    mixer = m
    const clip = clips.find((c) => /walk/i.test(c.name)) ?? clips[0]
    // 再生する前に立ち姿を控える。Meshy の書き出しは、ボーンの初期値がバインドポーズ（生成した立ち姿）と同じ
    // anim には前のコマで再生した値を控える（補正を重ねないため）
    const rest: { bone: THREE.Object3D; q: THREE.Quaternion; anim: THREE.Quaternion; k: number }[] = []
    inner.traverse((o) => {
      if ((o as THREE.Bone).isBone) rest.push({ bone: o, q: o.quaternion.clone(), anim: o.quaternion.clone(), k: 0 })
    })
    const soles = opts.posture?.ground ? findSoles(wrap) : []
    m.clipAction(clip).play()
    const posture = opts.posture
    const v = new THREE.Vector3()
    const toWrap = new THREE.Matrix4()
    tick = (dt) => {
      // ミキサーは値が前のコマと同じだとボーンに書き直さない。前のコマの補正を先に戻しておく
      for (const r of rest) if (r.k > 0) r.bone.quaternion.copy(r.anim)
      m.update(dt)
      if (!posture) return
      for (const r of rest) {
        r.k = weightFor(r.bone.name, posture)
        if (r.k > 0) {
          r.anim.copy(r.bone.quaternion)
          r.bone.quaternion.slerp(r.q, r.k)
        }
      }
      if (!posture.ground || !soles.length) return
      // いちばん低い足裏の点を地面に合わせる（足裏の頂点だけスキンを計算する）
      wrap.updateMatrixWorld(true)
      let low = Infinity
      for (const s of soles) {
        toWrap.copy(wrap.matrixWorld).invert().multiply(s.mesh.matrixWorld)
        for (const i of s.idx) {
          s.mesh.getVertexPosition(i, v).applyMatrix4(toWrap)
          if (v.y < low) low = v.y
        }
      }
      if (Number.isFinite(low)) wrap.position.y = -low * wrap.scale.y
    }
  }
  return { model: wrap, mixer, head, clipNames: clips.map((c) => c.name), tick, posture: tick ? opts.posture : undefined }
}

function weightFor(name: string, p: PostureFix): number {
  if (/tail/i.test(name)) return p.tail
  if (/backleg/i.test(name)) return p.hind
  if (/frontleg/i.test(name)) return p.front ?? 0
  if (/^(hips|chest)$/i.test(name)) return p.spine
  return 0
}

/** 4 本の足先のボーン（…leg2）に一番強く付いた頂点のうち、立ち姿で低い順に n 個ずつ（足裏） */
function findSoles(wrap: THREE.Object3D, n = 24): { mesh: THREE.SkinnedMesh; idx: number[] }[] {
  wrap.updateMatrixWorld(true)
  const out: { mesh: THREE.SkinnedMesh; idx: number[] }[] = []
  const v = new THREE.Vector3()
  wrap.traverse((o) => {
    const mesh = o as THREE.SkinnedMesh
    if (!mesh.isSkinnedMesh) return
    const bones = mesh.skeleton.bones
    const si = mesh.geometry.getAttribute('skinIndex')
    const sw = mesh.geometry.getAttribute('skinWeight')
    const pos = mesh.geometry.getAttribute('position')
    const byFoot = new Map<number, { i: number; y: number }[]>()
    for (let i = 0; i < pos.count; i++) {
      let best = 0
      let bi = -1
      for (let k = 0; k < 4; k++) {
        const w = sw.getComponent(i, k)
        if (w > best) {
          best = w
          bi = si.getComponent(i, k)
        }
      }
      if (bi < 0 || !/leg2$/i.test(bones[bi]?.name ?? '')) continue
      mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld)
      if (!byFoot.has(bi)) byFoot.set(bi, [])
      byFoot.get(bi)!.push({ i, y: v.y })
    }
    const idx: number[] = []
    for (const list of byFoot.values()) {
      list.sort((a, b) => a.y - b.y)
      idx.push(...list.slice(0, n).map((e) => e.i))
    }
    if (idx.length) out.push({ mesh, idx })
  })
  return out
}
