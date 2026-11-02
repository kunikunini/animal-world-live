import { KOPJE, LIONS, SPAWN } from '../world/layout'
import { terrainHeight } from '../world/terrain'
import type { PlayerController } from '../player/controller'

/**
 * 開発用の定点カメラ。デモ動画の見せ場（入口の眺め、登り道、頂上のパノラマ）と、
 * ライオン造形の比較用アングルを、いつでも同じ位置から撮れるようにする。
 * 本番ビルドには入らない（main.ts の DEV ブロックからだけ呼ぶ）。
 */
export type ViewName =
  | 'entrance'
  | 'far'
  | 'climb'
  | 'summit'
  | 'summit-east'
  | 'angie'
  | 'angie-side'
  | 'angie-front'
  | 'family'
  | 'alex'
  | 'riley'
  | 'free'

const angie = LIONS.find((l) => l.id === 'angie') ?? LIONS[0]

/** ライオン基準のカメラ位置: 前方 f、右 r、上 u の距離から求める */
function lionView(f: number, r: number, u: number, lookUp: number) {
  const yaw = angie.yaw
  const fx = Math.sin(yaw)
  const fz = Math.cos(yaw)
  const rx = Math.cos(yaw)
  const rz = -Math.sin(yaw)
  const y = terrainHeight(angie.x, angie.z)
  return {
    position: { x: angie.x + fx * f + rx * r, y: y + u, z: angie.z + fz * f + rz * r },
    lookAt: { x: angie.x + fx * 0.35, y: y + lookUp, z: angie.z + fz * 0.35 },
  }
}

export function applyView(name: ViewName, player: PlayerController): void {
  player.setCameraOverride(null)
  switch (name) {
    case 'entrance':
      // 入口: スポーン地点から北のコピエを見る（起動時と同じ構図）
      player.teleport(SPAWN.x, SPAWN.z, Math.PI)
      break
    case 'far':
      // 平原からコピエ台地を見上げる遠景
      player.teleport(-6, 26, Math.PI - 0.12)
      break
    case 'climb':
      // 登り道: 南の坂のふもとから台地へ向かう
      player.teleport(0, KOPJE.z + KOPJE.radius - 1, Math.PI)
      break
    case 'summit':
      // 頂上のパノラマ: 台地の南の縁から平原を見下ろす
      player.teleport(KOPJE.x + 1.5, KOPJE.z + 6, 0)
      break
    case 'summit-east':
      // 頂上から水場（東）を見る
      player.teleport(KOPJE.x + 4, KOPJE.z - 1, Math.PI / 2)
      break
    case 'angie':
      // 造形比較: 左斜め前から（右側には観察ポストがある）。プレイヤーは視界の外（頭がこちらを向く距離）に置く
      player.teleport(angie.x + 7, angie.z + 6, Math.PI)
      player.setCameraOverride(lionView(3.2, -2.6, 1.6, 0.7))
      break
    case 'angie-side':
      player.teleport(angie.x + 7, angie.z + 6, Math.PI)
      player.setCameraOverride(lionView(0.4, 4.4, 1.3, 0.6))
      break
    case 'angie-front':
      player.teleport(angie.x + 7, angie.z + 6, Math.PI)
      player.setCameraOverride(lionView(4.2, 0.6, 1.4, 0.65))
      break
    case 'family': {
      // 家族の場面: スポットの東側から、アンジーと双子をひとつの画面に
      const y = terrainHeight(KOPJE.x, KOPJE.z)
      player.teleport(KOPJE.x + 3, KOPJE.z + 4, -2.3)
      player.setCameraOverride({
        position: { x: KOPJE.x - 0.2, y: y + 2.4, z: KOPJE.z + 3.0 },
        lookAt: { x: KOPJE.x - 4.6, y: y + 0.5, z: KOPJE.z - 3.4 },
      })
      break
    }
    case 'alex': {
      const y = terrainHeight(KOPJE.x, KOPJE.z)
      player.teleport(KOPJE.x + 1.5, KOPJE.z - 1.5, 0)
      player.setCameraOverride({
        position: { x: KOPJE.x + 1.2, y: y + 1.9, z: KOPJE.z - 7.8 },
        lookAt: { x: KOPJE.x + 4.8, y: y + 0.7, z: KOPJE.z - 5.2 },
      })
      break
    }
    case 'riley': {
      const y = terrainHeight(40, 5)
      player.teleport(35, 10, 0)
      player.setCameraOverride({
        position: { x: 35.5, y: y + 2.2, z: 9.5 },
        lookAt: { x: 41, y: y + 0.6, z: 3.5 },
      })
      break
    }
    case 'free':
    default:
      break
  }
}

export function viewNames(): ViewName[] {
  return ['entrance', 'far', 'climb', 'summit', 'summit-east', 'angie', 'angie-side', 'angie-front', 'family', 'alex', 'riley', 'free']
}
