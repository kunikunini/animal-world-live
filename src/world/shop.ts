import * as THREE from 'three'
import { OUTER_REGIONS } from './regions'
import type { Collider } from './props'
import { terrainHeight } from './terrain'
import { toonMaterial } from '../render/toon'
import { loadShopModel } from './shopModel'

/**
 * ふれあいワールドの一角の「グッズのお店」（大きな木のお店）。
 * 売り場（public/shop3d）と同じ、Blender で作った大樹の店のモデルの外観を、そのままワールドに立てる。
 * 扉の前で「お店に入る」を押すと、売り場の店内を上に重ねて開く。売り場は別のプロジェクトで作ったものを写した、見るだけの版（README）。
 * モデルは重い（外観だけで約 33 万三角形・8.7MB）ので、ふれあいワールドに近づいた時に読み、それまで（と、読めなかった時）はコードで作ったローポリの木を立てておく。
 *
 * 場所は、ポニー（サクラ・きのこ・めい）の放牧場の奥、山のふもと。扉は広場の方を向く。
 */
const PARTNER = OUTER_REGIONS.find((r) => r.key === 'partner') ?? { x: -254.6, z: 254.6, walk: 100 }
const TO_ORIGIN = Math.atan2(-PARTNER.z, -PARTNER.x)
const ANGLE = TO_ORIGIN + Math.PI * 0.55
const DIST = 106
/** ローポリの木の幹の根もとの半径（m） */
const TRUNK = 4.1
/** モデルの扉の位置（正面 +z） */
const DOOR = 4.3

const x = PARTNER.x + Math.cos(ANGLE) * DIST
const z = PARTNER.z + Math.sin(ANGLE) * DIST
/** 扉が広場の中心を向く向き（+z が正面） */
const yaw = Math.atan2(PARTNER.x - x, PARTNER.z - z)

export const SHOP = {
  x,
  z,
  yaw,
  /** 幹の当たり判定の半径（根の張り出しは、モデルの形から足す） */
  radius: 4.3,
  /** 石畳のまんなか（ここに近づくと「お店に入る」が出る） */
  doorX: x + Math.sin(yaw) * (DOOR + 6.5),
  doorZ: z + Math.cos(yaw) * (DOOR + 6.5),
  /** 「お店に入る」を出す距離（石畳のまんなかから。石畳の手前〜扉の前） */
  reach: 8,
  /** まわりの木をどける半径（枝と根の広がり） */
  clear: 15,
}

/** 木を出さない場所: 枝と根の広がりと、扉の正面（放牧場の側からお店が見えるように、幅 20m・奥行き 30m をあける） */
export function shopClears(px: number, pz: number): boolean {
  const dx = px - SHOP.x
  const dz = pz - SHOP.z
  if (Math.hypot(dx, dz) < SHOP.clear) return true
  const ahead = dx * Math.sin(SHOP.yaw) + dz * Math.cos(SHOP.yaw)
  const side = dx * Math.cos(SHOP.yaw) - dz * Math.sin(SHOP.yaw)
  return ahead > 0 && ahead < 30 && Math.abs(side) < 10
}

/** お店の床の高さ: 店内（半径 5m）でいちばん高い地面のすぐ上（床から地面がのぞかない）。幹は地面の下まであるので、低い側にもすき間はできない */
function floorHeight(): number {
  let h = terrainHeight(SHOP.x, SHOP.z)
  for (let r = 1; r <= 5; r++) {
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2
      h = Math.max(h, terrainHeight(SHOP.x + Math.cos(a) * r, SHOP.z + Math.sin(a) * r))
    }
  }
  return h + 0.04
}

/** モデルを読みはじめる距離と、描く距離（m。霧の終わりは 380m） */
const LOAD_DIST = 340
const SHOW_DIST = 360
/** 外観に使う部品（店内の棚・商品・地面は入れない）。扉のガラス越しに見える床と丸天井だけ入れる */
const SHELL_PARTS = ['Trunk_Lower', 'Roots_outer', 'Moss_Trunk', 'Moss_Roots', 'Ivy_Trunk', 'Ivy_Stems_Trunk', 'Door_Frame', 'Door_L', 'Door_R', 'Round_Window_E', 'Round_Window_W', 'Lanterns_Door', 'Lanterns_Path', 'Bench', 'Mushrooms', 'Path_Stones', 'Rocks', 'Floor']
/** まわりの草花（スマホでは入れない） */
const GREEN_PARTS = ['Grass', 'Ferns_Outside', 'Flowers_Ground', 'Moss_Clumps']
const ROOF_SKIP = ['Ceiling_Ribs']
/** 地面に沿わせる部品（モデルの地面は平ら。ワールドの地面の起伏に合わせて、頂点ごとに上下させる） */
const ON_GROUND = new Set(['Roots_outer', 'Moss_Roots', 'Lanterns_Path', 'Bench', 'Mushrooms', 'Path_Stones', 'Rocks', ...GREEN_PARTS])
/** 影を落とす部品（葉の 1 枚ずつは落とさない） */
const CAST = new Set(['Trunk_Lower', 'Trunk_Upper', 'Roots_outer', 'Branches', 'Canopy_Cores'])

let house: THREE.Group | null = null
let lowPoly: THREE.Group | null = null
let model: THREE.Group | null = null
let worldColliders: Collider[] = []
let withGreens = true
let loading = false

/** 毎フレーム呼ぶ: 近づいたらモデルを読み、遠い間は描かない */
export function updateShopHouse(px: number, pz: number): void {
  const d = Math.hypot(px - SHOP.x, pz - SHOP.z)
  if (model) model.visible = d < SHOW_DIST
  if (!loading && house && d < LOAD_DIST) {
    loading = true
    void loadModel().catch((err) => console.warn('[awl] お店のモデルを読めませんでした（ローポリの木のまま）', err))
  }
}

async function loadModel(): Promise<void> {
  if (!house) return
  const shellParts = new Set([...SHELL_PARTS, ...(withGreens ? GREEN_PARTS : [])])
  const [shell, roof] = await Promise.all([
    loadShopModel('/shop3d/models/shop-shell.glb', (n) => shellParts.has(n)),
    loadShopModel('/shop3d/models/shop-roof.glb', (n) => !ROOF_SKIP.includes(n)),
  ])
  const g = new THREE.Group()
  g.name = 'shop-model'
  const baseY = house.position.y
  const cos = Math.cos(SHOP.yaw)
  const sin = Math.sin(SHOP.yaw)
  const v = new THREE.Vector3()
  /** 当たり判定を置くマス（1m 角）。ひざ〜胸の高さに幹や根がある所 */
  const cells = new Set<string>()
  for (const node of [...Object.values(shell.nodes), ...Object.values(roof.nodes)]) {
    // 扉は閉じておく（モデルは開いた向き。中は売り場で見る）
    if (node.name === 'Door_L' || node.name === 'Door_R') node.quaternion.identity()
    node.updateMatrix()
    const follow = ON_GROUND.has(node.name)
    const solid = node.name === 'Roots_outer' || node.name === 'Trunk_Lower'
    node.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = CAST.has(node.name)
      // 石と苔は、ワールドの光では暗く沈むので、色を持ち上げる（売り場では、まわりの映り込みで明るく見えている）
      const mat = mesh.material as THREE.MeshToonMaterial
      const lift = mat.name === 'Stone' ? 2.4 : mat.name === 'Moss' ? 1.35 : 1
      if (lift !== 1 && !mat.userData.lifted) {
        mat.color.multiplyScalar(lift)
        mat.userData.lifted = true
      }
      mesh.receiveShadow = false
      if (!follow && !solid) return
      const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(node.matrix)
        if (solid && v.y > 0.5 && v.y < 1.5 && !(Math.abs(v.x) < 1.5 && v.z > 3)) cells.add(`${Math.round(v.x)},${Math.round(v.z)}`)
        if (follow) pos.setY(i, pos.getY(i) + terrainHeight(SHOP.x + v.x * cos + v.z * sin, SHOP.z - v.x * sin + v.z * cos) - baseY)
      }
      if (follow) mesh.geometry.computeBoundingSphere()
    })
    g.add(node)
  }
  // 根の張り出しの当たり判定（幹のまんなかの円の外だけ）
  for (const key of cells) {
    const [cx, cz] = key.split(',').map(Number)
    if (Math.hypot(cx, cz) < SHOP.radius - 0.4) continue
    worldColliders.push({ x: SHOP.x + cx * cos + cz * sin, z: SHOP.z - cx * sin + cz * cos, r: 0.75 })
  }
  // 入口の看板は、売り場と同じ木の板（ロゴ入り）に替える。ロゴが読めない時は、モデルの緑の看板のまま
  try {
    g.add(await createWoodSign())
    if (roof.nodes.Sign_AnimalShop) roof.nodes.Sign_AnimalShop.visible = false
  } catch (err) {
    console.warn('[awl] お店の看板のロゴを読めませんでした（モデルの看板のまま）', err)
  }
  if (lowPoly) house.remove(lowPoly)
  lowPoly = null
  house.add(g)
  model = g
}

/**
 * 入口の木の看板。売り場（public/shop3d/store/room-tree.js）と同じ場所・大きさ・傾きで、
 * 木目の板にロゴ（売り場の store.json の room.sign と同じ画像）を入れ、枝の枠で囲み、幹から出した鉄の腕で吊る
 */
async function createWoodSign(): Promise<THREE.Group> {
  const logo = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('logo'))
    img.src = '/shop3d/assets/logos/logo-final.png'
  })
  const W = 1.25
  const H = 0.58
  const D = 0.035
  const c = document.createElement('canvas')
  c.width = 1024
  c.height = Math.round((1024 * H) / W)
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('canvas')
  ctx.fillStyle = '#c99b63'
  ctx.fillRect(0, 0, c.width, c.height)
  // 木目: ゆらぐ細い線（毎回同じ並び）
  let seed = 20261113
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296
  for (let i = 0; i < 90; i++) {
    const y = rnd() * c.height
    const amp = 1 + rnd() * 3
    const f = 0.008 + rnd() * 0.02
    const ph = rnd() * 6
    ctx.strokeStyle = `rgba(${95 + rnd() * 40},${58 + rnd() * 25},${28 + rnd() * 15},${0.08 + rnd() * 0.2})`
    ctx.lineWidth = 0.6 + rnd() * 1.4
    ctx.beginPath()
    for (let px = 0; px <= c.width; px += 8) {
      const yy = y + Math.sin(px * f + ph) * amp
      if (px) ctx.lineTo(px, yy)
      else ctx.moveTo(px, yy)
    }
    ctx.stroke()
  }
  const k = Math.min((c.width * 0.86) / logo.width, (c.height * 0.78) / logo.height)
  ctx.drawImage(logo, (c.width - logo.width * k) / 2, (c.height - logo.height * k) / 2, logo.width * k, logo.height * k)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4

  const sign = new THREE.Group()
  sign.name = 'shop-sign'
  const TILT = THREE.MathUtils.degToRad(11)
  const board = new THREE.Group()
  board.position.set(0, 3.3, 4.33)
  board.rotation.x = TILT
  const edge = toonMaterial({ color: '#a9763f' })
  const face = toonMaterial()
  face.map = tex
  board.add(new THREE.Mesh(new THREE.BoxGeometry(W, H, D), [edge, edge, edge, edge, face, edge]))
  // 枝の枠: 角から少しはみ出す 4 本
  const bark = toonMaterial({ color: '#6b4a2c' })
  for (const [len, px, py, rz] of [
    [W + 0.16, 0.02, H / 2, Math.PI / 2 + 0.02],
    [W + 0.2, -0.02, -H / 2, Math.PI / 2 - 0.015],
    [H + 0.16, -W / 2, 0.01, 0.03],
    [H + 0.2, W / 2, -0.01, -0.02],
  ]) {
    const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.026, len, 8), bark)
    branch.position.set(px, py, D / 2 + 0.012)
    branch.rotation.z = rz
    board.add(branch)
  }
  sign.add(board)
  // 幹に差しこんだ鉄の腕と、板を吊る輪
  const iron = toonMaterial({ color: '#2b2621' })
  const topY = 3.3 + (H / 2) * Math.cos(TILT)
  const topZ = 4.33 + (H / 2) * Math.sin(TILT) + 0.01
  const armY = topY + 0.07
  for (const ax of [-0.42, 0.42]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, topZ - 3.98 + 0.03), iron)
    arm.position.set(ax, armY, (3.98 + topZ) / 2)
    const brace = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.022, 0.3), iron)
    brace.position.set(ax, armY - 0.1, 4.12)
    brace.rotation.x = -0.75
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 6, 14), iron)
    hook.position.set(ax, armY - 0.035, topZ - 0.005)
    hook.rotation.y = Math.PI / 2
    sign.add(arm, brace, hook)
  }
  return sign
}

/** 看板の板（木の板に白い字）。字はその場で描く */
function signTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 144
  const g = c.getContext('2d')
  if (g) {
    g.fillStyle = '#7a5232'
    g.fillRect(0, 0, c.width, c.height)
    g.strokeStyle = '#5a3a22'
    g.lineWidth = 10
    g.strokeRect(5, 5, c.width - 10, c.height - 10)
    g.fillStyle = '#fff6e6'
    g.font = '800 76px "Hiragino Maru Gothic ProN", "Hiragino Sans", system-ui, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText('ANIMAL SHOP', c.width / 2, c.height / 2 + 4, c.width - 48)
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** お店を置き、幹の当たり判定を足す。はじめはローポリの木で、近づくとモデルに替わる（updateShopHouse） */
export function createShopHouse(group: THREE.Group, colliders: Collider[], mobile: boolean): void {
  const root = new THREE.Group()
  root.name = 'shop-house'
  root.position.set(SHOP.x, floorHeight(), SHOP.z)
  root.rotation.y = SHOP.yaw
  group.add(root)
  house = root
  worldColliders = colliders
  withGreens = !mobile
  model = null
  loading = false
  colliders.push({ x: SHOP.x, z: SHOP.z, r: SHOP.radius })
  lowPoly = createLowPoly()
  root.add(lowPoly)
}

/** モデルが届くまでの、ローポリの木のお店 */
function createLowPoly(): THREE.Group {
  const house = new THREE.Group()
  house.position.y = -0.25

  const bark = toonMaterial({ color: '#8f6240' })
  const barkDark = toonMaterial({ color: '#5e3d26' })
  const cream = toonMaterial({ color: '#fff1cf' })
  const leafA = toonMaterial({ color: '#4fae45' })
  const leafB = toonMaterial({ color: '#86cf58' })
  const glow = new THREE.MeshBasicMaterial({ color: '#ffe08a' })
  const parts: THREE.Mesh[] = []
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, px: number, py: number, pz: number): THREE.Mesh => {
    const m = new THREE.Mesh(geo, mat)
    m.position.set(px, py, pz)
    parts.push(m)
    return m
  }

  // 幹: 下が太い 10 角の柱。根を 5 本張り出す（扉の正面はあける）
  const H = 7
  add(new THREE.CylinderGeometry(3.1, TRUNK, H, 10), bark, 0, H / 2, 0)
  for (const a of [0.2, 0.36, 0.5, 0.64, 0.8]) {
    const ang = a * Math.PI * 2
    const root = add(new THREE.ConeGeometry(1.1, 2.6, 6), bark, Math.sin(ang) * (TRUNK - 0.1), 0.9, Math.cos(ang) * (TRUNK - 0.1))
    root.rotation.set(Math.cos(ang) * 0.5, 0, -Math.sin(ang) * 0.5)
  }

  // 葉: 大きい玉をまんなかに、まわりに 5 つ
  add(new THREE.IcosahedronGeometry(5.6, 1), leafA, 0, H + 3.4, 0).scale.y = 0.82
  for (let i = 0; i < 5; i++) {
    const ang = (i / 5) * Math.PI * 2 + 0.3
    add(new THREE.IcosahedronGeometry(3.4, 1), i % 2 ? leafA : leafB, Math.sin(ang) * 4.3, H + 1.6 + (i % 2) * 0.7, Math.cos(ang) * 4.3).scale.y = 0.85
  }

  // 扉（正面 +z）: クリーム色の枠に、こげ茶の扉。幹の傾きに合わせて少し倒す
  const front = TRUNK - 0.28
  const tilt = -Math.atan2(TRUNK - 3.1, H)
  add(new THREE.BoxGeometry(2.5, 3.3, 0.3), cream, 0, 1.75, front).rotation.x = tilt
  add(new THREE.BoxGeometry(1.9, 2.9, 0.34), barkDark, 0, 1.6, front + 0.03).rotation.x = tilt
  add(new THREE.SphereGeometry(0.11, 8, 6), glow, 0.62, 1.55, front + 0.24)
  // 丸い窓を左右に
  for (const sx of [-1, 1]) {
    const ang = sx * 0.62
    const win = add(new THREE.CylinderGeometry(0.62, 0.62, 0.2, 14), cream, Math.sin(ang) * (front - 0.1), 3.0, Math.cos(ang) * (front - 0.1))
    win.rotation.set(Math.PI / 2 + tilt, 0, 0)
    win.rotation.order = 'YXZ'
    win.rotation.y = ang
    const pane = add(new THREE.CylinderGeometry(0.46, 0.46, 0.24, 14), glow, Math.sin(ang) * (front - 0.08), 3.0, Math.cos(ang) * (front - 0.08))
    pane.rotation.copy(win.rotation)
  }
  // 看板: 扉の上
  const sign = add(new THREE.PlaneGeometry(3.6, 1.0), new THREE.MeshBasicMaterial({ map: signTexture() }), 0, 4.35, front + 0.02)
  sign.rotation.x = tilt - 0.12
  add(new THREE.BoxGeometry(3.8, 1.16, 0.12), barkDark, 0, 4.35, front - 0.08).rotation.x = tilt - 0.12

  for (const m of parts) {
    if (m.material !== glow && !(m.geometry instanceof THREE.PlaneGeometry)) {
      m.castShadow = true
      m.receiveShadow = true
    }
    house.add(m)
  }
  return house
}
