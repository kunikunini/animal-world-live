import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { toonMaterial } from '../render/toon'

/**
 * 群れの 5 頭の生成モデル（Meshy の Image to 3D。期間中に用意したクレイ版の絵から生成し、四足リグと「歩く」を付けた glTF）。
 * 読めなければ呼び出し側がプリミティブ版のまま続ける。
 * 向きと大きさはここで揃える: 頭が +z（群れの yaw 0 の向き）、足が y=0、体の長さ length。
 *
 * 歩行クリップは「歩いている間」だけ重みを上げて再生し、止まっている間は立ち姿（バインドポーズ）に戻る。
 * 立ち姿の上に、プリミティブ版と同じ生活感レイヤー（首を向ける・耳のぴくり・尾の揺れ）を骨で再現する。
 */
export interface AiLion {
  /** 群れの group に足す造形（足が y=0、頭が +z） */
  model: THREE.Object3D
  /** 頭のあたりの高さ（群れの倍率をかける前、m）。ピンと名前の位置に使う */
  headHeight: number
  /** createLion の swapModel に渡す「動く部分」。中身は空の Object3D で、Lion.update が書いた回転をこちらの骨に写す */
  parts: { neck: THREE.Object3D; ears: THREE.Object3D[]; tail: THREE.Object3D }
  clipNames: string[]
  /** 歩行の再生（移動中だけ true にする）。重みはなめらかに変わる */
  setWalking: (on: boolean) => void
  /** 体が進む速さ（model の座標で m/s）に合わせて、クリップの速さを決める（足が地面をすべらないように） */
  setWalkSpeed: (speed: number) => void
  /** クリップが timeScale 1 で進む速さ（model の座標で m/s。読み込み時に足先の動きから測る） */
  clipSpeed: number
  /** いまの歩行の重み（0 = 立ち姿、1 = 歩行） */
  walkWeight: () => number
  /** 毎フレーム呼ぶ（Lion.update と移動のあと）: 歩行の再生、姿勢の補正、生活感レイヤー、接地 */
  tick: (dt: number) => void
  /** 姿勢の補正の強さ（開発時の計測で書き換えると次のコマから効く） */
  posture: PostureFix
  mixer: THREE.AnimationMixer | null
  action: THREE.AnimationAction | null
}

/**
 * 歩行の姿勢の補正。Meshy の四足用「歩く」（イヌ科のリグ）は、ネコ科の体だと腰が落ちて尾の先が地面に着く。
 * 再生した後に、後ろ脚・背骨・尾・前脚のボーンの回転を立ち姿（バインドポーズ）の方へ寄せる（0 = そのまま、1 = 立ち姿）
 */
export interface PostureFix {
  hind: number
  spine: number
  tail: number
  /** 前脚も寄せる（成獣は前脚も曲がっていて、後ろを起こすと前足が浮くため） */
  front: number
  /** 毎コマ、いちばん低い足裏が地面（y=0）に来るように体全体の高さを合わせる */
  ground: boolean
  /**
   * 後ろ脚は、クリップの 1 周ぶんの平均の曲がり（腰が落ちる原因）だけを取り除き、前後の振りは残す。
   * この時の hind は「振りをどれだけ小さくするか」になる（0 = クリップの振りのまま）
   */
  hindCenter?: boolean
  /** 前脚も同じく、平均の曲がりだけ取り除いて振りを残す（front は振りを小さくする強さになる） */
  frontCenter?: boolean
}

/** 4 頭（アンジー・ライリー・クレア・カーラ）で決めた標準の強さ */
export const POSTURE_DEFAULT: PostureFix = { hind: 0.6, spine: 0.8, tail: 0.5, front: 0.5, ground: true }

/** 歩行の重みが 0 → 1 に変わるまでの秒数 */
const WALK_FADE = 0.35

/**
 * upright: 直立の子（ペンギン、ヒューマノイドのリグ）。向きは書き出しのまま（前が +z）で、length は前後の長さではなく高さとして合わせる
 */
export async function loadAiLion(url: string, opts: { length: number; posture: PostureFix; upright?: boolean; /** 色の画像に掛ける明るさ（1 で書き出しのまま）。暗い毛色がワールドの光で沈む子だけ上げる */ brighten?: number }): Promise<AiLion> {
  const loader = new GLTFLoader()
  loader.setMeshoptDecoder(MeshoptDecoder)
  const gltf = await loader.loadAsync(url)
  const inner = gltf.scene
  inner.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.frustumCulled = false // スキンの境界箱がずれて消えるのを防ぐ
    // Meshy の書き出しは色の画像を自己発光（emissive 白）にも使い、金属度 1 になっている。
    // そのままだとワールドの光とトゥーンの陰影が効かないので、群れと同じトゥーン素材（クレイの見た目込み）に差し替える
    const src = mesh.material as THREE.MeshStandardMaterial
    if (src.map) {
      const mat = toonMaterial({ color: '#ffffff' })
      mat.map = src.map
      if (opts.brighten) mat.color.setScalar(opts.brighten)
      mesh.material = mat
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
  const head = find(/^head$/i) ?? find(/head/i)
  const hips = find(/^hips$/i) ?? find(/hips|pelvis|root/i)
  const tailRoot = find(/^tail$/i) ?? find(/tail/i)
  const ears = [find(/^(L_)?earend$/i), find(/^R_earend$/i)]

  // 向き: 頭の位置が腰より前（+z）になるように回す
  const wrap = new THREE.Group()
  wrap.name = 'ai-lion'
  wrap.add(inner)
  inner.updateMatrixWorld(true)
  if (head && hips && !opts.upright) {
    const h = head.getWorldPosition(new THREE.Vector3())
    const p = hips.getWorldPosition(new THREE.Vector3())
    inner.rotation.y = -Math.atan2(h.x - p.x, h.z - p.z)
  }
  inner.updateMatrixWorld(true)

  // 大きさと接地（立ち姿で足が y=0）
  const box = new THREE.Box3().setFromObject(inner)
  const size = box.getSize(new THREE.Vector3())
  const along = opts.upright ? size.y : size.z
  const s = along > 0 ? opts.length / along : 1
  inner.scale.setScalar(s)
  inner.updateMatrixWorld(true)
  box.setFromObject(inner)
  const c = box.getCenter(new THREE.Vector3())
  inner.position.set(-c.x, -box.min.y, -c.z)
  wrap.updateMatrixWorld(true)
  const headHeight = head ? head.getWorldPosition(new THREE.Vector3()).y + 0.12 : size.y * s * 0.85

  // Lion.update が書く「動く部分」。空の Object3D に回転だけ書いてもらい、tick で骨に写す
  const parts = { neck: new THREE.Object3D(), ears: [new THREE.Object3D(), new THREE.Object3D()], tail: new THREE.Object3D() }

  const posture = { ...opts.posture }
  let mixer: THREE.AnimationMixer | null = null
  let action: THREE.AnimationAction | null = null
  // 立ち姿（バインドポーズ）と、前のコマでミキサーが書いた素の値（補正と生活感レイヤーを重ねないために控える）。
  // Meshy の書き出しは骨の初期値がバインドポーズ
  // meanInv: 歩行 1 周ぶんの平均の曲がり（立ち姿からの差）の逆。脚の hindCenter・frontCenter で使う
  const bones: { bone: THREE.Object3D; rest: THREE.Quaternion; raw: THREE.Quaternion; k: number; hind: boolean; front: boolean; meanInv: THREE.Quaternion }[] = []
  inner.traverse((o) => {
    if ((o as THREE.Bone).isBone)
      bones.push({ bone: o, rest: o.quaternion.clone(), raw: o.quaternion.clone(), k: weightFor(o.name, posture), hind: /backleg/i.test(o.name), front: /frontleg/i.test(o.name), meanInv: new THREE.Quaternion() })
  })
  // Meshy の「歩く」は腰の骨に、リグの寸法合わせの名残（位置のずれと一様な縮小 約 0.93）を入れてくる。
  // そのままだと歩き出した時に体が 7% 縮んで前にずれる（立ち姿と歩行の間でポップする）ので、腰の位置と大きさは常に立ち姿の値に戻す
  const hipsRest = hips ? { pos: hips.position.clone(), scale: hips.scale.clone() } : null
  const hipsRaw = hips ? { pos: hips.position.clone(), scale: hips.scale.clone() } : null
  const clips = gltf.animations
  if (clips.length) {
    mixer = new THREE.AnimationMixer(inner)
    const clip = clips.find((c) => /walk/i.test(c.name)) ?? clips[0]
    action = mixer.clipAction(clip)
    action.setEffectiveWeight(0)
    action.play()
  }
  const soles = posture.ground ? findSoles(wrap) : []

  const qCenter = new THREE.Quaternion()
  /** 歩行の姿勢の補正: 骨の回転を立ち姿の方へ寄せる。腰の位置と大きさは寸法合わせの名残なので常に立ち姿へ */
  const applyPosture = (w = 1) => {
    for (const b of bones) {
      b.k = weightFor(b.bone.name, posture)
      if ((b.hind && posture.hindCenter) || (b.front && posture.frontCenter)) b.bone.quaternion.multiply(qCenter.identity().slerp(b.meanInv, w))
      if (b.k > 0) b.bone.quaternion.slerp(b.rest, b.k)
    }
    if (hips && hipsRest) {
      hips.position.copy(hipsRest.pos)
      hips.scale.copy(hipsRest.scale)
    }
  }

  // クリップの速さ: 地面に着いている足は体の速さで後ろへ動く。足先の骨を 1 周ぶん追い、いちばん速く後ろ（-z）へ動いた速さを採る
  let clipSpeed = 1
  if (mixer && action) {
    const feet = bones.filter((b) => /leg2$/i.test(b.bone.name)).map((b) => b.bone)
    const N = 24
    const dur = action.getClip().duration
    const prev: THREE.Vector3[] = feet.map(() => new THREE.Vector3())
    const cur = new THREE.Vector3()
    let fastest = 0
    action.setEffectiveWeight(1)
    // 脚の平均の曲がり: 1 周を同じ間隔で取り、立ち姿からの差（rest⁻¹ · 再生の値）を平均する
    const legBones = bones.filter((b) => b.hind || b.front)
    const sum = legBones.map(() => new THREE.Vector4())
    const d = new THREE.Quaternion()
    for (let k = 0; k < N; k++) {
      mixer.setTime((k / N) * dur)
      legBones.forEach((b, i) => {
        d.copy(b.rest).invert().multiply(b.bone.quaternion)
        const s4 = sum[i]
        const sign = k > 0 && s4.x * d.x + s4.y * d.y + s4.z * d.z + s4.w * d.w < 0 ? -1 : 1
        s4.x += d.x * sign
        s4.y += d.y * sign
        s4.z += d.z * sign
        s4.w += d.w * sign
      })
    }
    legBones.forEach((b, i) => b.meanInv.set(sum[i].x, sum[i].y, sum[i].z, sum[i].w).normalize().invert())
    for (let k = 0; k <= N; k++) {
      mixer.setTime((k / N) * dur)
      applyPosture()
      wrap.updateMatrixWorld(true)
      feet.forEach((f, i) => {
        f.getWorldPosition(cur)
        wrap.worldToLocal(cur)
        if (k > 0) fastest = Math.max(fastest, (prev[i].z - cur.z) / (dur / N))
        prev[i].copy(cur)
      })
    }
    if (fastest > 0.05) clipSpeed = fastest
    mixer.setTime(0)
    action.setEffectiveWeight(0)
    mixer.update(0)
    for (const b of bones) b.bone.quaternion.copy(b.rest)
  }

  let walkTarget = 0
  let walk = 0
  let restWritten = false
  const v = new THREE.Vector3()
  const toWrap = new THREE.Matrix4()
  const qGroup = new THREE.Quaternion()
  const qParent = new THREE.Quaternion()
  const qParentInv = new THREE.Quaternion()
  const qRot = new THREE.Quaternion()
  const axis = new THREE.Vector3()
  /** 骨を、群れの座標の軸 axisGroup のまわりに angle 回す（骨のローカル軸の向きに左右されない） */
  const rotateBone = (bone: THREE.Object3D | undefined, axisGroup: THREE.Vector3, angle: number) => {
    if (!bone || !bone.parent || Math.abs(angle) < 1e-4) return
    bone.parent.getWorldQuaternion(qParent)
    qParentInv.copy(qParent).invert()
    axis.copy(axisGroup).applyQuaternion(qGroup)
    qRot.setFromAxisAngle(axis, angle)
    // local' = parent⁻¹ · R · parent · local
    bone.quaternion.premultiply(qParent).premultiply(qRot).premultiply(qParentInv)
  }

  const tick = (dt: number) => {
    // 歩行の重みをなめらかに
    const step = dt / WALK_FADE
    walk += Math.max(-step, Math.min(step, walkTarget - walk))
    if (mixer && action) {
      // ミキサーは値が前のコマと同じだと骨に書き直さない。前のコマの補正と生活感レイヤーを先に戻しておく
      for (const b of bones) b.bone.quaternion.copy(b.raw)
      if (hips && hipsRaw) {
        hips.position.copy(hipsRaw.pos)
        hips.scale.copy(hipsRaw.scale)
      }
      if (walk > 0 || !restWritten) {
        action.setEffectiveWeight(walk)
        mixer.update(dt)
        restWritten = walk === 0
      }
      for (const b of bones) b.raw.copy(b.bone.quaternion)
      if (hips && hipsRaw) {
        hipsRaw.pos.copy(hips.position)
        hipsRaw.scale.copy(hips.scale)
      }
      // 姿勢の補正: 歩いている間だけ、立ち姿の方へ寄せる（腰の位置と大きさは重みが途中でも戻す）
      if (walk > 0) applyPosture(walk)
    }

    // 生活感レイヤー（首・耳・尾）。歩いている間はクリップの動きに任せ、止まるほど強く効かせる
    const life = 1 - walk
    if (life > 0.001 && wrap.parent) {
      wrap.updateMatrixWorld(true)
      wrap.parent.getWorldQuaternion(qGroup)
      rotateBone(head, UP, parts.neck.rotation.y * life)
      rotateBone(head, RIGHT, parts.neck.rotation.x * life)
      rotateBone(ears[0], FORWARD, parts.ears[0].rotation.z * life)
      rotateBone(ears[1], FORWARD, parts.ears[1].rotation.z * life)
      rotateBone(tailRoot, UP, parts.tail.rotation.y * life)
    }

    // 接地: 歩いている間、いちばん低い足裏の点を地面に合わせる（足裏の頂点だけスキンを計算する）。立ち姿は足が y=0 で作ってある
    if (walk > 0 && soles.length) {
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
    } else {
      wrap.position.y = 0
    }
  }

  return {
    model: wrap,
    headHeight,
    parts,
    clipNames: clips.map((c) => c.name),
    setWalking: (on) => {
      walkTarget = on ? 1 : 0
    },
    setWalkSpeed: (speed) => {
      if (action) action.timeScale = speed / clipSpeed
    },
    clipSpeed,
    walkWeight: () => walk,
    tick,
    posture,
    mixer,
    action,
  }
}

const UP = new THREE.Vector3(0, 1, 0)
const RIGHT = new THREE.Vector3(1, 0, 0)
const FORWARD = new THREE.Vector3(0, 0, 1)

function weightFor(name: string, p: PostureFix): number {
  if (/tail/i.test(name)) return p.tail
  if (/backleg/i.test(name)) return p.hind
  if (/frontleg/i.test(name)) return p.front
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
