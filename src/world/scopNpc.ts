import * as THREE from 'three'
import { contactShadow, loadScopModel } from './scopCompanion'
import { createObservationSpot, type ObservationSpot } from './spots'
import { OUTER_REGIONS, SAVANNA, isWalkable, type Region, type RegionKey } from './regions'
import { SPOT } from './layout'
import { terrainHeight } from './terrain'
import type { Collider } from './props'
import { toonMaterial } from '../render/toon'

/**
 * ワールドにいるスコップ（ツアーのあと）。
 * - 話せるスコップ: 各ワールドの観察スポットのそば。近づくと跳ねてこちらを向き、「声をかける」で話す（ui/scopTalk.ts）
 * - 手の届かないスコップ: 木のてっぺんや雲の上で寝ている・跳ねている（見つけるだけ。話さない）
 * - にせの観察スポット: サバンナの奥。双眼鏡の代わりにスコップが台の上で逆立ちしている（地図には載せない）
 * モデルはツアーのスコップと同じ public/models/scop.glb を clone する。
 */
export type ScopTalkKey = RegionKey | 'fake'

export interface ScopNpcs {
  group: THREE.Group
  update: (dt: number, time: number, player: THREE.Vector3) => void
  /** いちばん近い話せるスコップ（届く範囲の内側だけ） */
  nearest: (player: THREE.Vector3) => { key: ScopTalkKey; distance: number; head: THREE.Vector3 } | null
  /** 話し始めた時: 1 回跳ねる */
  talk: (key: ScopTalkKey) => void
  /** ツアーの間は、ツアーのスコップと 2 匹にならないよう、スポットのそばのスコップを隠す */
  setTalkersVisible: (on: boolean) => void
  setReduceMotion: (on: boolean) => void
}

type Pose = 'stand' | 'sleep' | 'hop' | 'headstand'

/** 声をかけられる距離（m）。観察スポットの「スコープをのぞく」（4.5m）と重なりにくいよう、スポットからは離して置く */
const TALK_REACH = 3.6
/** 話せるスコップをスポットから離す距離 */
const TALKER_DIST = 7
/** 手の届かないスコップは少し大きく（遠くからでも見つかるように） */
const FAR_SCALE = 1.7

interface Npc {
  key: ScopTalkKey | null
  pose: Pose
  root: THREE.Group
  body: THREE.Group
  pivot: THREE.Group
  height: number
  base: THREE.Vector3
  /** 話せるスコップ: 顔を向ける・跳ねる */
  yaw: number
  hopT: number
  nextHop: number
  breath: number
  zzz: THREE.Sprite[]
  /** 雲（空の世界）: 一緒にゆっくり上下する */
  float?: THREE.Object3D
  floatY?: number
  talker: boolean
}

function zTexture(): THREE.CanvasTexture | null {
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 64
  const ctx = c.getContext('2d')
  if (!ctx) return null
  ctx.font = 'bold 52px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineWidth = 8
  ctx.strokeStyle = '#2f4fd8'
  ctx.strokeText('Z', 32, 34)
  ctx.fillStyle = '#ffffff'
  ctx.fillText('Z', 32, 34)
  return new THREE.CanvasTexture(c)
}

/** (x, z) の真上から下へ見て、いちばん上の面の高さ（木のてっぺん・岩・屋根）。当たらなければ地面 */
function topAt(surfaces: THREE.Object3D[], x: number, z: number): number {
  const ray = new THREE.Raycaster(new THREE.Vector3(x, 400, z), new THREE.Vector3(0, -1, 0))
  const hit = ray.intersectObjects(surfaces, true)[0]
  return hit ? hit.point.y : terrainHeight(x, z)
}

/** 小さな雲（空の世界のスコップの寝床）。白い玉を束ねる */
function smallCloud(): THREE.Group {
  const g = new THREE.Group()
  const mat = toonMaterial({ color: '#ffffff' })
  mat.emissive.set('#8d9bb4')
  const geo = new THREE.SphereGeometry(1, 12, 8)
  const blobs: Array<[number, number, number, number]> = [
    [0, 0, 0, 1.6],
    [-1.6, -0.2, 0.2, 1.15],
    [1.6, -0.2, -0.1, 1.2],
    [0.4, 0.15, 1.1, 1.0],
    [-0.5, 0.1, -1.0, 1.05],
  ]
  for (const [x, y, z, s] of blobs) {
    const m = new THREE.Mesh(geo, mat)
    m.position.set(x, y, z)
    m.scale.set(s, s * 0.62, s)
    g.add(m)
  }
  return g
}

/** 北の世界の小さな雪山（岩のとんがりに雪の帽子）。歩いては登れない */
function snowPeak(): { group: THREE.Group; top: number } {
  const g = new THREE.Group()
  const rock = new THREE.Mesh(new THREE.ConeGeometry(3.2, 7.5, 7), toonMaterial({ color: '#7d8796' }))
  rock.position.y = 3.75
  rock.castShadow = true
  const snow = new THREE.Mesh(new THREE.ConeGeometry(1.75, 3.0, 7), toonMaterial({ color: '#f4f8ff' }))
  snow.position.y = 7.5 - 1.5 + 0.12
  snow.castShadow = true
  // 平らな頂上（スコップが跳ねる所）
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.9, 0.3, 9), toonMaterial({ color: '#f4f8ff' }))
  cap.position.y = 7.2
  g.add(rock, snow, cap)
  return { group: g, top: 7.35 }
}

export async function loadScopNpcs(opts: {
  heroHeight: number
  /** 木・岩・屋根の上を測る相手（景色の部品のグループ） */
  surfaces: THREE.Object3D[]
  colliders: Collider[]
}): Promise<ScopNpcs> {
  const { model, height: h0 } = await loadScopModel('/models/scop.glb', opts.heroHeight)
  const group = new THREE.Group()
  group.name = 'scop-npcs'
  const ztex = zTexture()
  const npcs: Npc[] = []
  let reduce = false
  let talkersOn = true

  const make = (pose: Pose, at: THREE.Vector3, scale: number, key: ScopTalkKey | null, parent: THREE.Object3D = group): Npc => {
    const height = h0 * scale
    const root = new THREE.Group()
    root.position.copy(at)
    const body = new THREE.Group()
    const pivot = new THREE.Group()
    const m = model.clone()
    m.scale.setScalar(scale)
    m.position.y = -height / 2
    pivot.add(m)
    body.add(pivot)
    root.add(body)
    // 姿勢: 立つ・跳ねる（真ん中が高さの半分）、寝る（横に倒す）、逆立ち（上下を返して頭が足もと）
    if (pose === 'sleep') {
      pivot.rotation.z = Math.PI / 2
      pivot.position.y = height * 0.3
    } else if (pose === 'headstand') {
      pivot.rotation.z = Math.PI
      pivot.position.y = height / 2
    } else {
      pivot.position.y = height / 2
    }
    if (pose === 'stand' || pose === 'hop') {
      const sh = contactShadow(height * 0.42)
      if (sh) root.add(sh)
    }
    const zzz: THREE.Sprite[] = []
    if (pose === 'sleep' && ztex) {
      for (let i = 0; i < 2; i++) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: ztex, transparent: true, depthWrite: false }))
        s.scale.setScalar(height * 0.42)
        root.add(s)
        zzz.push(s)
      }
    }
    parent.add(root)
    const n: Npc = {
      key,
      pose,
      root,
      body,
      pivot,
      height,
      base: at.clone(),
      yaw: Math.random() * Math.PI * 2,
      hopT: -1,
      nextHop: 1 + Math.random() * 2,
      breath: Math.random() * 10,
      zzz,
      talker: key !== null && key !== 'fake',
    }
    root.rotation.y = n.yaw
    npcs.push(n)
    return n
  }

  const blocked = (x: number, z: number, margin: number) => opts.colliders.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + margin)

  // 話せるスコップ: スポットから TALKER_DIST m。やって来る向き（峠の方）から少し横、歩けて障害物の無い所
  const regions: Array<{ r: Region; spot: { x: number; z: number }; from: { x: number; z: number } }> = [
    { r: SAVANNA, spot: { x: SPOT.x, z: SPOT.z }, from: SPOT.approach },
    ...OUTER_REGIONS.map((r) => ({ r, spot: { x: r.x, z: r.z }, from: { x: 0, z: 0 } })),
  ]
  for (const { r, spot, from } of regions) {
    const gy = terrainHeight(spot.x, spot.z)
    const base = Math.atan2(from.z - spot.z, from.x - spot.x) + 0.7
    let at: THREE.Vector3 | null = null
    for (const dist of [TALKER_DIST, TALKER_DIST - 1.5, TALKER_DIST + 2]) {
      for (let k = 0; k < 16 && !at; k++) {
        const a = base + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.35
        const x = spot.x + Math.cos(a) * dist
        const z = spot.z + Math.sin(a) * dist
        const y = terrainHeight(x, z)
        if (!isWalkable(x, z) || blocked(x, z, 1.2) || Math.abs(y - gy) > 1.6) continue
        at = new THREE.Vector3(x, y, z)
      }
      if (at) break
    }
    if (!at) continue
    make('stand', at, 1, r.key)
    opts.colliders.push({ x: at.x, z: at.z, r: 0.45, map: false })
  }

  // 手の届かないスコップ
  const far = (pose: Pose, x: number, z: number, y?: number) => make(pose, new THREE.Vector3(x, y ?? topAt(opts.surfaces, x, z), z), FAR_SCALE, null)
  const R = Object.fromEntries(OUTER_REGIONS.map((r) => [r.key, r])) as Record<string, Region>
  // サバンナ: コピエのそばのアカシアのてっぺんで寝ている
  far('sleep', 32, -44)
  // ジャングル: スポットの南西のヤシのてっぺんで寝ている
  far('sleep', R.jungle.x - 10.2, R.jungle.z + 23.8)
  // 南半球: 奥の赤い一枚岩のてっぺんで跳ねている
  far('hop', R.south.x, R.south.z + 62)
  // 水の世界: 沖の岩のアーチのてっぺんで寝ている
  far('sleep', R.water.x + 132, R.water.z + 16)
  // ふれあいワールド: 赤い納屋の屋根の上で跳ねている（納屋の置き場所は biomes.ts と同じ式）
  {
    const r = R.partner
    const a = Math.atan2(-r.z, -r.x) + Math.PI * 0.78
    far('hop', r.x + Math.cos(a) * 82, r.z + Math.sin(a) * 82)
  }
  // 北の世界: スポットの奥の小さな雪山のてっぺんで跳ねている
  {
    const r = R.north
    const back = Math.atan2(-r.z, -r.x) + Math.PI
    for (const da of [0.5, -0.5, 0.9, -0.9, 0]) {
      const x = r.x + Math.cos(back + da) * 24
      const z = r.z + Math.sin(back + da) * 24
      if (blocked(x, z, 3.6)) continue
      const peak = snowPeak()
      const y = terrainHeight(x, z) - 0.3
      peak.group.position.set(x, y, z)
      group.add(peak.group)
      opts.colliders.push({ x, z, r: 3.0, map: false })
      far('hop', x, z, y + peak.top)
      break
    }
  }
  // 空の世界: スポットの奥に浮かぶ小さな雲の上で寝ている（雲と一緒にゆっくり上下する）
  {
    const r = R.sky
    const back = Math.atan2(-r.z, -r.x) + Math.PI + 0.4
    const x = r.x + Math.cos(back) * 20
    const z = r.z + Math.sin(back) * 20
    const cloud = smallCloud()
    const y = terrainHeight(x, z) + 11
    cloud.position.set(x, y, z)
    cloud.scale.setScalar(1.4)
    group.add(cloud)
    const n = make('sleep', new THREE.Vector3(0, 0.62 * 1.6 * 0.95, 0), FAR_SCALE / 1.4, null, cloud)
    n.float = cloud
    n.floatY = y
  }

  // にせの観察スポット: サバンナの奥（スポットと反対の南東）。双眼鏡の代わりに、スコップが台の上で逆立ち
  let fakeSpot: ObservationSpot | null = null
  for (const [x, z] of [
    [62, 62],
    [70, 48],
    [50, 74],
    [78, 30],
  ]) {
    if (!isWalkable(x, z) || blocked(x, z, 2)) continue
    fakeSpot = createObservationSpot({ x, z }, { head: false })
    group.add(fakeSpot.group)
    opts.colliders.push({ x, z, r: 0.3, map: false })
    make('headstand', new THREE.Vector3(x, fakeSpot.position.y + 1.36, z), 1, 'fake')
    break
  }

  const toPlayer = new THREE.Vector3()
  return {
    group,
    update: (dt, time, player) => {
      if (fakeSpot) fakeSpot.update(time, Math.hypot(player.x - fakeSpot.position.x, player.z - fakeSpot.position.z))
      for (const n of npcs) {
        const wp = n.float ? toPlayer.set(n.float.position.x, 0, n.float.position.z) : toPlayer.set(n.base.x, 0, n.base.z)
        const d = Math.hypot(player.x - wp.x, player.z - wp.z)
        const on = d < 260 && (!n.talker || talkersOn)
        n.root.visible = on
        if (n.float) n.float.visible = d < 260
        if (!on) continue
        n.breath += dt
        let y = 0
        let sy = 1
        // 跳ねる: hop はいつも、話せるスコップは近くに来た時と話し始めた時
        if (!reduce) {
          if (n.hopT < 0) {
            n.nextHop -= dt
            const want = n.pose === 'hop' || (n.talker && d < 12)
            if (want && n.nextHop <= 0) {
              n.hopT = 0
              n.nextHop = n.pose === 'hop' ? 0.25 + Math.random() * 0.3 : 2.2 + Math.random() * 1.6
            }
          }
          if (n.hopT >= 0) {
            n.hopT += dt
            const u = Math.min(1, n.hopT / 0.42)
            y = n.height * (n.pose === 'hop' ? 0.45 : 0.3) * 4 * u * (1 - u)
            sy = 1 + 0.08 * Math.pow(Math.abs(u - 0.5) * 2, 3)
            if (u >= 1) n.hopT = -1
          } else {
            sy = 1 + (n.pose === 'sleep' ? 0.05 : 0.025) * Math.sin(n.breath * (n.pose === 'sleep' ? 1.3 : 2.4))
          }
          if (n.pose === 'headstand') n.pivot.rotation.x = Math.sin(n.breath * 1.7) * 0.06
        }
        n.body.position.y = y
        n.body.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy))
        // 話せるスコップ・逆立ちは、近くのプレイヤーの方を向く
        if ((n.talker || n.key === 'fake') && d < 16) {
          const target = Math.atan2(player.x - n.base.x, player.z - n.base.z)
          const diff = Math.atan2(Math.sin(target - n.yaw), Math.cos(target - n.yaw))
          n.yaw += diff * (reduce ? 1 : Math.min(1, dt * 4))
          n.root.rotation.y = n.yaw
        }
        // 雲はゆっくり上下
        if (n.float && n.floatY !== undefined && !reduce) n.float.position.y = n.floatY + Math.sin(time * 0.6) * 0.5
        // Zzz: 頭のそばから上へ、2 つを交互に
        n.zzz.forEach((s, i) => {
          const u = reduce ? 0.4 : (time * 0.45 + i * 0.5) % 1
          s.position.set(n.height * 0.45 + u * n.height * 0.3, n.height * 0.55 + u * n.height * 0.9, 0)
          ;(s.material as THREE.SpriteMaterial).opacity = reduce ? 0.9 : Math.sin(u * Math.PI)
        })
      }
    },
    nearest: (player) => {
      let best: { key: ScopTalkKey; distance: number; head: THREE.Vector3 } | null = null
      for (const n of npcs) {
        if (!n.key || !n.root.visible) continue
        const d = Math.hypot(player.x - n.base.x, player.z - n.base.z)
        if (d > TALK_REACH || (best && d >= best.distance)) continue
        const top = n.pose === 'headstand' ? n.base.y + n.height * 1.05 : n.base.y + n.height * 1.08
        best = { key: n.key, distance: d, head: new THREE.Vector3(n.base.x, top, n.base.z) }
      }
      return best
    },
    talk: (key) => {
      const n = npcs.find((x) => x.key === key)
      if (n && !reduce && n.pose !== 'headstand') n.hopT = 0
    },
    setTalkersVisible: (on) => {
      talkersOn = on
    },
    setReduceMotion: (on) => {
      reduce = on
    },
  }
}
