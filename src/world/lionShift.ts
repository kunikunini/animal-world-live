import * as THREE from 'three'
import { shapeHeight, terrainHeight } from './terrain'
import { isWalkable } from './regions'
import { WATERHOLE } from './layout'
import type { Collider } from './props'
import type { Lion } from './lions'
import type { LionWander } from './lionWander'

/**
 * ライオンの丘（コピエの台地）と水辺の行き来（11/8 くにの指示）。
 * - アレックスは丘から動かない。ほかの 4 頭は、水辺に 2 頭・丘に 2 頭（＋アレックス）
 * - はじめは水辺にライリーとアンジー、丘にクレアとカーラ
 * - 一定の時間ごとに、水辺にいちばん長くいる子と丘にいちばん長くいる子が入れ替わる（順番に、みんなが行き来する）
 * - 入れ替わるのは、両方の場所がプレイヤーから見えていない時だけ（目の前で消えたり現れたりしない）
 * - あそびかたツアーの間はライリーは水辺（ツアーが水辺のライリーへ歩くため）。ツアー中は入れ替えず、ライリーが丘にいたら先に戻す
 * 2 か所に分けて置くのは、1 か所に群れの描画が集まらないようにするため
 */
export interface LionShift {
  /** 生成モデルが読めて歩き回りができた子を渡す（その子は以後これで置き直す） */
  setWander: (id: string, wander: LionWander) => void
  update: (dt: number, camera: THREE.Camera, player: THREE.Vector3, tourActive: boolean) => void
}

type Place = 'hill' | 'water'
interface Slot {
  x: number
  z: number
  yaw: number
  place: Place
  who: string | null
}

/** 入れ替えの間隔（秒） */
const INTERVAL = 90
/** これより近くにプレイヤーがいる場所では入れ替えない（m） */
const NEAR = 40

export function createLionShift(lions: Lion[], colliders: Collider[]): LionShift | null {
  const byId = new Map(lions.map((l) => [l.id, l]))
  const riley = byId.get('riley')
  const angie = byId.get('angie')
  const claire = byId.get('claire')
  const carla = byId.get('carla')
  if (!riley || !angie || !claire || !carla) return null
  const wanders = new Map<string, LionWander>()

  // 丘の場所: アンジー・クレア・カーラの元の場所（3 つのうち 2 つを使う）。水辺の場所: ライリーの元の場所と、そのそばの空き地
  const at = (l: Lion, place: Place): Slot => ({ x: l.group.position.x, z: l.group.position.z, yaw: l.group.rotation.y, place, who: null })
  const slots: Slot[] = [at(angie, 'hill'), at(claire, 'hill'), at(carla, 'hill'), at(riley, 'water')]
  const water2 = findNear(riley, colliders)
  if (!water2) return null
  slots.push({ ...water2, place: 'water', who: null })

  const move = (l: Lion, s: Slot) => {
    const old = slots.find((o) => o.who === l.id)
    if (old) old.who = null
    s.who = l.id
    const w = wanders.get(l.id)
    if (w) w.relocate(s.x, s.z, s.yaw)
    else {
      l.group.position.set(s.x, terrainHeight(s.x, s.z), s.z)
      l.group.rotation.y = s.yaw
      l.position.copy(l.group.position)
      l.collider.x = s.x
      l.collider.z = s.z
    }
  }
  // はじめの並び: 丘にクレア・カーラ（元の場所のまま）、水辺にライリー（元の場所）とアンジー
  slots[1].who = 'claire'
  slots[2].who = 'carla'
  slots[3].who = 'riley'
  move(angie, slots[4])

  // その場所に来てからの秒（長くいる子から動く）
  const stay = new Map<string, number>([['riley', 0], ['angie', 30], ['claire', 0], ['carla', 30]])
  let wait = INTERVAL
  const sphere = new THREE.Sphere(new THREE.Vector3(), 4)
  const frustum = new THREE.Frustum()
  const m = new THREE.Matrix4()

  const unseen = (x: number, z: number, player: THREE.Vector3): boolean => {
    if (Math.hypot(player.x - x, player.z - z) < NEAR) return false
    sphere.center.set(x, terrainHeight(x, z) + 1, z)
    return !frustum.intersectsSphere(sphere)
  }
  const placeOf = (id: string) => slots.find((s) => s.who === id)

  return {
    setWander: (id, wander) => {
      wanders.set(id, wander)
      const s = placeOf(id)
      // モデルが読めた時、はじめの並びで動かした子（アンジー）は、歩き回りの自分の場所も合わせる
      if (s) wander.relocate(s.x, s.z, s.yaw)
    },
    update: (dt, camera, player, tourActive) => {
      for (const [id, t] of stay) stay.set(id, t + dt)
      wait -= dt
      const rileyHill = placeOf('riley')?.place === 'hill'
      if (wait > 0 && !(tourActive && rileyHill)) return
      if (tourActive && !rileyHill) return
      camera.updateMatrixWorld()
      m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
      frustum.setFromProjectionMatrix(m)
      // 水辺から丘へ行く子と、丘から水辺へ行く子（いちばん長くいる子。ツアー中にライリーが丘にいたらライリー）
      const longest = (place: Place) =>
        slots
          .filter((s) => s.place === place && s.who)
          .sort((a, b) => (stay.get(b.who!) ?? 0) - (stay.get(a.who!) ?? 0))[0]
      const fromWater = longest('water')
      const fromHill = rileyHill && tourActive ? placeOf('riley') : longest('hill')
      const toHill = slots.find((s) => s.place === 'hill' && !s.who)
      if (!fromWater || !fromHill || !toHill) return
      const a = byId.get(fromWater.who!)!
      const b = byId.get(fromHill.who!)!
      // 4 か所（2 頭の今の場所と行き先）がどれも見えていない時だけ
      if (![fromWater, fromHill, toHill].every((s) => unseen(s.x, s.z, player))) {
        wait = 1
        return
      }
      const waterSlot = fromWater
      move(a, toHill)
      move(b, waterSlot)
      stay.set(a.id, 0)
      stay.set(b.id, 0)
      wait = INTERVAL
    },
  }
}

/** ライリーの場所のそばで、平らで歩けて、水場と岩・木・ほかの子から離れた所（4〜7m） */
function findNear(riley: Lion, colliders: Collider[]): { x: number; z: number; yaw: number } | null {
  const cx = riley.group.position.x
  const cz = riley.group.position.z
  // 平らかどうかは形の式で測る（選ぶ場所を変えない）
  const h = shapeHeight(cx, cz)
  for (const r of [5, 6, 4, 7]) {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2
      const x = cx + Math.cos(a) * r
      const z = cz + Math.sin(a) * r
      if (Math.abs(shapeHeight(x, z) - h) > 0.3) continue
      if (!isWalkable(x, z)) continue
      if (Math.hypot(x - WATERHOLE.x, z - WATERHOLE.z) < WATERHOLE.radius + 2) continue
      if (colliders.some((c) => c !== riley.collider && Math.hypot(c.x - x, c.z - z) < c.r + 1.6)) continue
      // 水場の方を向く
      return { x, z, yaw: Math.atan2(WATERHOLE.x - x, WATERHOLE.z - z) }
    }
  }
  return null
}
