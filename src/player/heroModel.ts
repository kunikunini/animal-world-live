import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { clayCompile, toonMaterial } from '../render/toon'

/**
 * 実験（exp/hero）: Meshy で生成した主人公（人型リグ＋アニメ付き glTF）を読み込む。
 * 操作（player/controller.ts）には触らず、プレイヤーの入れ物に子として足し、毎フレームの速さと空中かどうかでアニメを選ぶ。
 * 読めなければ呼び出し側がいままでの姿のまま続ける。
 * 向きは頭の前の目印（headfront）が +z（コントローラーの前）を向くように回し、足の裏を y=0、全身の高さを height にそろえる。
 */
export type HeroMove = 'idle' | 'walk' | 'run' | 'jump'

export interface HeroModel {
  root: THREE.Group
  clipNames: string[]
  /** 骨の名前と親（報告用） */
  bones: Array<{ name: string; parent: string | null }>
  /** speed: 水平の速さ（m/s）、airborne: 空中か */
  update: (dt: number, speed: number, airborne: boolean) => void
  move: () => HeroMove
  /** 歩行・走行のクリップの、そのまま再生した時の地面の速さ（m/s、大きさをそろえた後） */
  natural: { walk: number; run: number }
}

/**
 * 歩き→走りに切り替える速さ（m/s）。操作の速さはスティックで 1.6〜6.5、キーとタップ移動は 6.5。
 * クリップをそのまま再生した時の速さは歩き約 0.9・走り約 2.0 と遅いので、歩きはスティックを少し倒した時だけにする
 */
const RUN_FROM = 2.0
const RUN_FULL = 3.0
const STOP_BELOW = 0.2
/** 足の運びの速さの倍率の範囲（これを超える速さでは足が地面を少し滑る。脚が速く回りすぎて見えないようにする） */
const CYCLE_MIN = 0.6
const CYCLE_MAX = 1.7

export async function loadHero(url: string, height: number): Promise<HeroModel> {
  const loader = new GLTFLoader()
  loader.setMeshoptDecoder(MeshoptDecoder)
  const gltf = await loader.loadAsync(url)
  const inner = gltf.scene

  inner.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.castShadow = true
    mesh.frustumCulled = false // スキンの境界箱が動きについてこないので、消えないようにする
    // Meshy の素材（色の画像を自己発光にも使い、金属度 1）は光と陰影が効かないので、ワールドと同じトゥーン素材に差し替える
    const src = mesh.material as THREE.MeshStandardMaterial
    const mat = toonMaterial({ color: '#ffffff' })
    mat.map = src.map ?? null
    // サバンナのクレイの凹凸は物の座標で決める。スキンで動く体は、動いた後の位置だと模様が流れるので、元の形の位置で決める
    mat.onBeforeCompile = (shader) => {
      clayCompile(shader)
      shader.vertexShader = shader.vertexShader.replace('vClayP = transformed;', 'vClayP = position;')
    }
    mesh.material = mat
    src.dispose()
  })

  const find = (name: string) => inner.getObjectByName(name)
  const head = find('mixamorigHead') ?? find('mixamorig:Head')
  const headFront = find('headfront')
  const bones: HeroModel['bones'] = []
  inner.traverse((o) => {
    if ((o as THREE.Bone).isBone) bones.push({ name: o.name, parent: (o.parent as THREE.Bone | null)?.isBone ? o.parent!.name : null })
  })

  // 向き: 頭の前の目印が +z を向くように
  const wrap = new THREE.Group()
  wrap.name = 'hero'
  wrap.add(inner)
  inner.updateMatrixWorld(true)
  if (head && headFront) {
    const h = head.getWorldPosition(new THREE.Vector3())
    const f = headFront.getWorldPosition(new THREE.Vector3())
    inner.rotation.y = -Math.atan2(f.x - h.x, f.z - h.z)
  }
  inner.updateMatrixWorld(true)

  // 大きさと接地（立ち姿で測る）
  const box = new THREE.Box3().setFromObject(inner)
  const size = box.getSize(new THREE.Vector3())
  const s = size.y > 0 ? height / size.y : 1
  inner.scale.setScalar(s)
  inner.updateMatrixWorld(true)
  box.setFromObject(inner)
  const c = box.getCenter(new THREE.Vector3())
  inner.position.set(inner.position.x - c.x, inner.position.y - box.min.y, inner.position.z - c.z)
  inner.updateMatrixWorld(true)

  const clips = gltf.animations
  const clipNames = clips.map((c) => c.name)
  const pick = (re: RegExp) => clips.find((c) => re.test(c.name))
  const walkClip = pick(/walk/i)
  const runClip = pick(/run/i)
  const idleClip = pick(/idle|待機/i)
  const jumpClip = pick(/jump|ジャンプ/i)

  const mixer = new THREE.AnimationMixer(inner)
  const walk = walkClip ? mixer.clipAction(walkClip) : null
  const run = runClip ? mixer.clipAction(runClip) : null
  const idle = idleClip ? mixer.clipAction(idleClip) : null
  const jump = jumpClip ? mixer.clipAction(jumpClip) : null
  if (jump) {
    jump.setLoop(THREE.LoopOnce, 1)
    jump.clampWhenFinished = true
  }

  // クリップをそのまま再生した時の地面の速さを、足の動きから測る（その場で足踏みする歩き方なので、
  // 地面に着いている足が後ろへ動く速さ＝体が進むはずの速さ）
  const foot = find('mixamorigLeftFoot') ?? find('mixamorig:LeftFoot')
  const measure = (action: THREE.AnimationAction | null): number => {
    if (!action || !foot) return 0
    const clip = action.getClip()
    action.play()
    const n = 60
    const zs: number[] = []
    const ys: number[] = []
    const v = new THREE.Vector3()
    for (let i = 0; i <= n; i++) {
      mixer.setTime((clip.duration * i) / n)
      wrap.updateMatrixWorld(true)
      foot.getWorldPosition(v)
      zs.push(v.z)
      ys.push(v.y)
    }
    action.stop()
    // 足がいちばん低い 4 割のコマ（接地）で、前後に動く速さの平均
    const lowY = [...ys].sort((a, b) => a - b)[Math.floor(n * 0.4)]
    let dist = 0
    let time = 0
    const dt = clip.duration / n
    for (let i = 1; i <= n; i++) {
      if (ys[i] <= lowY && ys[i - 1] <= lowY) {
        dist += Math.abs(zs[i] - zs[i - 1])
        time += dt
      }
    }
    return time > 0 ? dist / time : 0
  }
  const natural = { walk: measure(walk), run: measure(run) }
  mixer.setTime(0)

  // ジャンプのクリップが無い時の代わり: 走りの、両足がいちばん高いコマ（宙に浮いている形）で止める
  let flightTime = 0
  if (!jump && run && foot) {
    const right = find('mixamorigRightFoot') ?? find('mixamorig:RightFoot')
    const clip = run.getClip()
    run.play()
    let best = -Infinity
    const a = new THREE.Vector3()
    const b = new THREE.Vector3()
    for (let i = 0; i <= 40; i++) {
      const t = (clip.duration * i) / 40
      mixer.setTime(t)
      wrap.updateMatrixWorld(true)
      foot.getWorldPosition(a)
      if (right) right.getWorldPosition(b)
      const low = right ? Math.min(a.y, b.y) : a.y
      if (low > best) {
        best = low
        flightTime = t
      }
    }
    run.stop()
    mixer.setTime(0)
  }

  // 重み（なめらかに寄せる）
  const w = { idle: 1, walk: 0, run: 0, jump: 0 }
  const target = { idle: 1, walk: 0, run: 0, jump: 0 }
  for (const a of [idle, walk, run]) {
    if (!a) continue
    a.play()
    a.setEffectiveWeight(0)
  }
  let move: HeroMove = 'idle'
  let wasAir = false
  let phase = 0 // 歩きと走りで足の運びをそろえる（0..1）

  const update = (dt: number, speed: number, airborne: boolean) => {
    // 地面にいる時の歩き・走りの割合（速さで連続的に）
    const runK = THREE.MathUtils.smoothstep(speed, RUN_FROM, RUN_FULL)
    if (airborne) move = 'jump'
    else if (speed < STOP_BELOW) move = 'idle'
    else move = runK >= 0.5 ? 'run' : 'walk'
    target.idle = move === 'idle' ? 1 : 0
    target.walk = move === 'walk' || move === 'run' ? 1 - runK : 0
    target.run = move === 'walk' || move === 'run' ? runK : 0
    target.jump = move === 'jump' ? 1 : 0

    const k = Math.min(1, dt * 10)
    w.idle += (target.idle - w.idle) * k
    w.walk += (target.walk - w.walk) * k
    w.run += (target.run - w.run) * k
    w.jump += (target.jump - w.jump) * (airborne ? 1 : k)

    // 足の運びの速さ: 実際の速さに合わせる（足が地面を滑らないように）
    if (move === 'walk' || move === 'run') {
      const nat = natural.walk * (1 - runK) + natural.run * runK
      const walkDur = walk?.getClip().duration ?? 1
      const runDur = run?.getClip().duration ?? 1
      const cycles = nat > 0 ? THREE.MathUtils.clamp(speed / nat, CYCLE_MIN, CYCLE_MAX) : 1 // 1 周を何倍の速さで回すか
      const dur = walkDur * (1 - runK) + runDur * runK
      phase = (phase + (dt * cycles) / dur) % 1
    }
    if (walk) {
      walk.time = phase * walk.getClip().duration
      walk.setEffectiveWeight(w.walk)
      walk.timeScale = 0
    }
    if (run) {
      run.time = phase * run.getClip().duration
      run.setEffectiveWeight(w.run)
      run.timeScale = 0
    }
    if (idle) idle.setEffectiveWeight(w.idle)

    if (jump) {
      if (airborne && !wasAir) jump.reset().play()
      jump.setEffectiveWeight(w.jump)
      if (!airborne && w.jump < 0.01) jump.stop()
    } else if (run && airborne) {
      // 代わり: 宙に浮いた形で止める
      run.time = flightTime
      run.setEffectiveWeight(1)
      if (walk) walk.setEffectiveWeight(0)
      if (idle) idle.setEffectiveWeight(0)
    }
    wasAir = airborne
    mixer.update(dt)
  }

  return { root: wrap, clipNames, bones, update, move: () => move, natural }
}
