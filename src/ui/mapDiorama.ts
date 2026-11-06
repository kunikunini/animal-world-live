import * as THREE from 'three'
import { ACACIAS, WATERHOLE } from '../world/layout'
import type { Collider } from '../world/props'
import type { RegionKey } from '../world/regions'
import { SEA_LEVEL, WATER_LEVEL, terrainHeight } from '../world/terrain'
import { mapGroundColor } from './minimap'

/**
 * 3D の地図: いまいるワールドを小さなジオラマにしたもの（スーパーマリオブラザーズ 3 のワールドマップの考え方を借りる。11/6 のくにの要望）。
 * - 地面は本編と同じ高さ（少し強調）と、2D の地図と同じ色。ふちは粘土の板のような崖
 * - 木と岩は本編の当たり判定の場所に、軽い形（インスタンス）で。動物は本編のモデルを使わず、ピンで表す
 * - 拠点は色のついたパネル、道は飛び石。小さな主人公が道をたどって歩く
 * 開いている間だけ描く（自分の WebGL を 1 つ持つ。初めて 3D を開いた時に作る）
 */
export interface DioramaBase {
  id: string
  kind: 'entry' | 'spot' | 'pass' | 'animal'
  x: number
  z: number
  label: string
}
export interface DioramaMarker {
  id: string
  x: number
  z: number
  friend: boolean
}
export interface DioramaState {
  world: RegionKey
  center: { x: number; z: number }
  bases: DioramaBase[]
  roads: Array<[number, number, number, number, boolean?]>
  markers: DioramaMarker[]
  showMarkers: boolean
  player: { x: number; z: number; heading: number }
  heroColor: string
  target: string | null
}

export interface Diorama {
  /** 中身を差し替えて描き直す（ワールドが変わった時は地形を作る） */
  set: (s: DioramaState, colliders: Collider[]) => void
  setVisible: (on: boolean) => void
  /** 点の列（世界座標）をたどって主人公を歩かせる。終わったら done */
  travel: (points: Array<{ x: number; z: number }>, done: () => void) => void
  /** 歩いている途中なら、すぐ着いたことにする */
  skip: () => boolean
  isTraveling: () => boolean
  setReduceMotion: (on: boolean) => void
  onBase: (fn: (id: string) => void) => void
}

/** ジオラマの半径（m）と高さの強調 */
const RADIUS: Partial<Record<RegionKey, number>> = { africa: 132 }
const R_DEFAULT = 112
const V_SCALE = 2.6
const RINGS = 34
const SEGS = 96
const SKIRT = 9

const BASE_COLOR: Record<DioramaBase['kind'], number> = { entry: 0x2f6bff, spot: 0xf26a1b, pass: 0x8a6a46, animal: 0x3f9a4a }
const TREE_STYLE: Record<RegionKey, { leaf: number; shape: 'flat' | 'ball' | 'cone' }> = {
  africa: { leaf: 0x6faa3a, shape: 'flat' },
  south: { leaf: 0x7f9a3a, shape: 'flat' },
  jungle: { leaf: 0x2f8a3e, shape: 'ball' },
  north: { leaf: 0x2f6a46, shape: 'cone' },
  water: { leaf: 0x5aa84a, shape: 'ball' },
  partner: { leaf: 0x6cc04a, shape: 'ball' },
  sky: { leaf: 0x7cbf54, shape: 'ball' },
}

export function createDiorama(wrap: HTMLElement): Diorama {
  const canvas = document.createElement('canvas')
  canvas.className = 'map-3d-canvas'
  const overlay = document.createElement('div')
  overlay.className = 'map-3d-overlay'
  wrap.append(canvas, overlay)

  let renderer: THREE.WebGLRenderer | null = null
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(32, 3 / 4, 5, 2000)
  scene.add(new THREE.HemisphereLight(0xfff6e0, 0x8a6a46, 1.6))
  const sun = new THREE.DirectionalLight(0xffffff, 1.6)
  sun.position.set(-0.5, 1, 0.6)
  scene.add(sun)

  const worlds = new Map<RegionKey, THREE.Group>()
  let current: THREE.Group | null = null
  let state: DioramaState | null = null
  const dynamic = new THREE.Group()
  scene.add(dynamic)
  const baseListeners: Array<(id: string) => void> = []
  let visible = false
  let reduceMotion = false

  // 小さな主人公: 服の色の胴と頭と髪。足もとに黄色い輪（いつも現在地が分かる）
  const hero = new THREE.Group()
  const heroBody = new THREE.Mesh(new THREE.CapsuleGeometry(1.1, 1.6, 4, 10), new THREE.MeshLambertMaterial({ color: 0xf2c230 }))
  heroBody.position.y = 2.0
  const heroHead = new THREE.Mesh(new THREE.SphereGeometry(1.25, 14, 10), new THREE.MeshLambertMaterial({ color: 0xf1c9a0 }))
  heroHead.position.y = 4.4
  const heroHair = new THREE.Mesh(new THREE.SphereGeometry(1.32, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), new THREE.MeshLambertMaterial({ color: 0x3a2618 }))
  heroHair.position.y = 4.55
  const heroNose = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), new THREE.MeshLambertMaterial({ color: 0xe8a77c }))
  heroNose.position.set(0, 4.3, 1.2)
  const heroFig = new THREE.Group()
  heroFig.add(heroBody, heroHead, heroHair, heroNose)
  // ジオラマは直径 230〜260m あるので、主人公とピンは大きく誇張する（ワールドマップのコマのように）
  heroFig.scale.setScalar(5)
  const ring = new THREE.Mesh(new THREE.TorusGeometry(7, 1.1, 6, 28), new THREE.MeshBasicMaterial({ color: 0xffd21f }))
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.4
  // 「いまここ」: 頭の上に浮かぶ黄色い逆三角（いつも現在地が分かる）
  const here = new THREE.Mesh(new THREE.ConeGeometry(4.5, 7, 3), new THREE.MeshLambertMaterial({ color: 0xffd21f, emissive: 0x6a4a00 }))
  here.rotation.x = Math.PI
  here.position.y = 36
  hero.add(heroFig, ring, here)
  scene.add(hero)

  let base0 = 0
  let center = { x: 0, z: 0 }
  let radius = R_DEFAULT
  /** 本編の地面の高さ → ジオラマの高さ */
  const yAt = (x: number, z: number) => {
    let h = terrainHeight(x, z)
    if (state?.world === 'africa' && Math.hypot(x - WATERHOLE.x, z - WATERHOLE.z) < WATERHOLE.radius + 1) h = Math.max(h, WATER_LEVEL)
    if (state?.world === 'water') h = Math.max(h, SEA_LEVEL)
    return (h - base0) * V_SCALE
  }

  const buildWorld = (world: RegionKey, colliders: Collider[]): THREE.Group => {
    const g = new THREE.Group()
    const pos: number[] = []
    const col: number[] = []
    const idx: number[] = []
    const c: [number, number, number] = [0, 0, 0]
    const vert = (x: number, z: number, y: number, rgb: [number, number, number]) => {
      pos.push(x, y, z)
      col.push(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255)
      return pos.length / 3 - 1
    }
    const groundColor = (x: number, z: number, y: number): [number, number, number] => {
      const h = terrainHeight(x, z)
      if (world === 'africa' && h <= WATER_LEVEL + 0.02 && Math.hypot(x - WATERHOLE.x, z - WATERHOLE.z) < WATERHOLE.radius + 1) return [94, 178, 214]
      if (world === 'water' && h <= SEA_LEVEL + 0.02) return [84, 176, 214]
      mapGroundColor(x, z, c)
      // 高い所は少し明るく（粘土の起伏が読めるように）
      const k = 1 + Math.min(0.12, y * 0.006)
      return [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k)]
    }
    // 上面: 中心から外への同心円の格子
    const ringIdx: number[][] = []
    for (let i = 0; i <= RINGS; i++) {
      const rr = (radius * i) / RINGS
      const row: number[] = []
      const n = i === 0 ? 1 : SEGS
      for (let j = 0; j < n; j++) {
        const a = (j / SEGS) * Math.PI * 2
        const x = center.x + Math.cos(a) * rr
        const z = center.z + Math.sin(a) * rr
        const y = yAt(x, z)
        row.push(vert(x, z, y, groundColor(x, z, y)))
      }
      ringIdx.push(row)
    }
    for (let i = 1; i <= RINGS; i++) {
      for (let j = 0; j < SEGS; j++) {
        const j2 = (j + 1) % SEGS
        if (i === 1) {
          idx.push(ringIdx[0][0], ringIdx[1][j2], ringIdx[1][j])
          continue
        }
        const a = ringIdx[i - 1][j]
        const b = ringIdx[i - 1][j2]
        const cc = ringIdx[i][j]
        const d = ringIdx[i][j2]
        idx.push(a, b, d, a, d, cc)
      }
    }
    // ふち: 粘土の板の崖（上は地面の縁、下は平ら）
    const outer = ringIdx[RINGS]
    const bottom = Math.min(...outer.map((k) => pos[k * 3 + 1])) - SKIRT
    const clay: [number, number, number] = [176, 122, 76]
    const clayDark: [number, number, number] = [140, 92, 56]
    const skirtTop: number[] = []
    const skirtBot: number[] = []
    for (let j = 0; j < SEGS; j++) {
      const k = outer[j]
      const sh = j % 2 ? clay : clayDark
      skirtTop.push(vert(pos[k * 3], pos[k * 3 + 2], pos[k * 3 + 1], sh))
      skirtBot.push(vert(pos[k * 3], pos[k * 3 + 2], bottom, clayDark))
    }
    for (let j = 0; j < SEGS; j++) {
      const j2 = (j + 1) % SEGS
      idx.push(skirtTop[j], skirtBot[j], skirtBot[j2], skirtTop[j], skirtBot[j2], skirtTop[j2])
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
    geo.setIndex(idx)
    geo.computeVertexNormals()
    g.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })))
    // 底の板
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(radius + 4, radius + 6, 3, SEGS), new THREE.MeshLambertMaterial({ color: 0x7a5236 }))
    plate.position.set(center.x, bottom - 1.5, center.z)
    g.add(plate)

    // 木と岩（当たり判定の場所から。サバンナの大きなアカシアは置き場所の表から）
    const inside = (x: number, z: number) => Math.hypot(x - center.x, z - center.z) < radius - 3
    const trees: Array<{ x: number; z: number; s: number }> = []
    const rocks: Array<{ x: number; z: number; s: number }> = []
    const posts: Array<{ x: number; z: number; s: number }> = []
    if (world === 'africa') for (const t of ACACIAS) trees.push({ x: t.x, z: t.z, s: t.scale })
    for (const cl of colliders) {
      if (!inside(cl.x, cl.z)) continue
      // ふれあいワールドの細い当たり判定は柵の杭（木にしない）
      if (world === 'partner' && cl.r < 0.38) {
        if (posts.length < 200) posts.push({ x: cl.x, z: cl.z, s: 1 })
      } else if (cl.r <= 0.7) {
        if (world !== 'africa' && trees.length < 160) trees.push({ x: cl.x, z: cl.z, s: Math.max(0.7, cl.r * 1.8) })
      } else if (cl.r < 4 && rocks.length < 80) rocks.push({ x: cl.x, z: cl.z, s: cl.r })
    }
    const style = TREE_STYLE[world]
    const m4 = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const v = new THREE.Vector3()
    const sc = new THREE.Vector3()
    if (trees.length) {
      const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.5, 0.8, 1, 6), new THREE.MeshLambertMaterial({ color: 0x6b4a2e }), trees.length)
      const leafGeo =
        style.shape === 'flat' ? new THREE.CylinderGeometry(4.2, 3.2, 1.6, 9) : style.shape === 'cone' ? new THREE.ConeGeometry(3, 7, 7) : new THREE.IcosahedronGeometry(3.2, 0)
      const leaf = new THREE.InstancedMesh(leafGeo, new THREE.MeshLambertMaterial({ color: style.leaf, flatShading: true }), trees.length)
      trees.forEach((t, i) => {
        const y = yAt(t.x, t.z)
        const s = t.s * (world === 'africa' ? 2 : 1.3)
        const th = style.shape === 'flat' ? 6 * s : 3 * s
        m4.compose(v.set(t.x, y + th / 2, t.z), q.identity(), sc.set(s, th, s))
        trunk.setMatrixAt(i, m4)
        const ly = style.shape === 'cone' ? y + th + 2.6 * s : y + th + 0.6 * s
        m4.compose(v.set(t.x, ly, t.z), q.setFromAxisAngle(sc.set(0, 1, 0), i * 1.3), sc.set(s, s, s))
        leaf.setMatrixAt(i, m4)
      })
      g.add(trunk, leaf)
    }
    if (posts.length) {
      const post = new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, 3, 1.1), new THREE.MeshLambertMaterial({ color: 0xa8784a }), posts.length)
      posts.forEach((p, i) => post.setMatrixAt(i, m4.makeTranslation(p.x, yAt(p.x, p.z) + 1.5, p.z)))
      g.add(post)
    }
    if (rocks.length) {
      const rock = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: 0xa08a74, flatShading: true }), rocks.length)
      rocks.forEach((r, i) => {
        const s = r.s * 1.1
        m4.compose(v.set(r.x, yAt(r.x, r.z) + s * 0.3, r.z), q.setFromAxisAngle(sc.set(0, 1, 0), i * 2.1), sc.set(s, s * 0.7, s))
        rock.setMatrixAt(i, m4)
      })
      g.add(rock)
    }
    return g
  }

  // 拠点のパネル・道の飛び石・動物のピン（開くたびに作り直す。数は少ない）
  const panelGeo = new THREE.CylinderGeometry(5, 5.6, 1.8, 6)
  const stoneGeo = new THREE.CylinderGeometry(1.5, 1.7, 0.6, 7)
  const stoneMat = new THREE.MeshLambertMaterial({ color: 0xfff1cf })
  const pinHeadGeo = new THREE.SphereGeometry(4.5, 12, 9)
  const pinTipGeo = new THREE.ConeGeometry(3, 8, 8)
  const pinMat = new THREE.MeshLambertMaterial({ color: 0xe2a64a })
  const pinFriendMat = new THREE.MeshLambertMaterial({ color: 0xf0508a })
  const panelMats = new Map<string, THREE.MeshLambertMaterial>()
  const panelMat = (kind: DioramaBase['kind']) => {
    let m = panelMats.get(kind)
    if (!m) {
      m = new THREE.MeshLambertMaterial({ color: BASE_COLOR[kind] })
      panelMats.set(kind, m)
    }
    return m
  }
  /** 画面の上の札（拠点の名前・ともだちのハート）。位置は描くたびに合わせる */
  let tags: Array<{ el: HTMLElement; x: number; y: number; z: number; under?: boolean; free?: boolean }> = []
  /** ピン（足もと）の場所。札で隠さない */
  let pins: Array<{ x: number; y: number; z: number }> = []

  const rebuildDynamic = () => {
    if (!state) return
    dynamic.clear()
    overlay.textContent = ''
    tags = []
    pins = []
    const inside = (x: number, z: number) => Math.hypot(x - center.x, z - center.z) < radius - 1
    // 道: 5m ごとの飛び石（ワールドの中だけ）
    const stones: Array<[number, number]> = []
    for (const [x1, z1, x2, z2, animal] of state.roads) {
      if (animal && !state.showMarkers) continue
      const len = Math.hypot(x2 - x1, z2 - z1)
      const n = Math.max(1, Math.floor(len / 5))
      for (let i = 0; i <= n; i++) {
        const x = x1 + ((x2 - x1) * i) / n
        const z = z1 + ((z2 - z1) * i) / n
        if (inside(x, z)) stones.push([x, z])
      }
    }
    if (stones.length) {
      const m = new THREE.InstancedMesh(stoneGeo, stoneMat, stones.length)
      const m4 = new THREE.Matrix4()
      stones.forEach(([x, z], i) => m.setMatrixAt(i, m4.makeTranslation(x, yAt(x, z) + 0.3, z)))
      dynamic.add(m)
    }
    // 拠点
    for (const b of state.bases) {
      if (!inside(b.x, b.z)) continue
      if (b.kind === 'animal' && !state.showMarkers) continue
      const y = yAt(b.x, b.z)
      const p = new THREE.Mesh(panelGeo, panelMat(b.kind))
      p.position.set(b.x, y + 0.7, b.z)
      if (state.target === b.id) p.scale.setScalar(1.25)
      dynamic.add(p)
      // いま立っている拠点の札は出さない（小さな主人公がその場所の印。札で主人公を隠さない）
      if (Math.hypot(b.x - state.player.x, b.z - state.player.z) < 10) continue
      const el = document.createElement('button')
      el.type = 'button'
      el.className = `map3d-base is-${b.kind}${state.target === b.id ? ' is-target' : ''}`
      el.dataset.base = b.id
      el.textContent = b.label
      overlay.append(el)
      tags.push({ el, x: b.x, y, z: b.z, under: true })
    }
    // 出会った動物のピン（ともだちはピンクとハート）
    if (state.showMarkers) {
      for (const mk of state.markers) {
        if (!inside(mk.x, mk.z)) continue
        const y = yAt(mk.x, mk.z)
        const head = new THREE.Mesh(pinHeadGeo, mk.friend ? pinFriendMat : pinMat)
        head.position.set(mk.x, y + 12.5, mk.z)
        const tip = new THREE.Mesh(pinTipGeo, mk.friend ? pinFriendMat : pinMat)
        tip.position.set(mk.x, y + 5, mk.z)
        tip.rotation.x = Math.PI
        dynamic.add(head, tip)
        pins.push({ x: mk.x, y, z: mk.z })
        if (mk.friend) {
          const el = document.createElement('span')
          el.className = 'map3d-heart'
          el.textContent = '♥'
          el.setAttribute('aria-hidden', 'true')
          overlay.append(el)
          tags.push({ el, x: mk.x, y: y + 19, z: mk.z, free: true })
        }
      }
    }
  }

  overlay.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-base]')
    if (b?.dataset.base) baseListeners.forEach((fn) => fn(b.dataset.base as string))
  })

  const _v = new THREE.Vector3()
  /** 札を置く。カメラは動かないので、作り直した時と大きさが変わった時だけ。重なる札は上へ（だめなら下へ）ずらす */
  const placeTags = () => {
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    const placed: Array<{ l: number; t: number; r: number; b: number }> = []
    // 小さな主人公（足もとから「いまここ」の三角まで）の上には札を置かない
    _v.copy(hero.position).project(camera)
    const fx = ((_v.x + 1) / 2) * w
    const fy = ((1 - _v.y) / 2) * h
    _v.copy(hero.position).setY(hero.position.y + 42).project(camera)
    const hy = ((1 - _v.y) / 2) * h
    placed.push({ l: fx - 22, t: hy - 8, r: fx + 22, b: fy + 10 })
    for (const p of pins) {
      _v.set(p.x, p.y, p.z).project(camera)
      const px = ((_v.x + 1) / 2) * w
      const py = ((1 - _v.y) / 2) * h
      _v.set(p.x, p.y + 17, p.z).project(camera)
      placed.push({ l: px - 10, t: ((1 - _v.y) / 2) * h - 4, r: px + 10, b: py + 4 })
    }
    const items = tags.map((tg) => {
      _v.set(tg.x, tg.y, tg.z).project(camera)
      return { tg, sx: ((_v.x + 1) / 2) * w, sy: ((1 - _v.y) / 2) * h, bw: tg.el.offsetWidth, bh: tg.el.offsetHeight }
    })
    items.sort((a, b) => b.sy - a.sy)
    for (const it of items) {
      // ハートはピンの上にそのまま（ほかの札をよけない）
      if (it.tg.free) {
        it.tg.el.style.transform = `translate(${(it.sx - it.bw / 2).toFixed(1)}px, ${(it.sy - it.bh).toFixed(1)}px)`
        continue
      }
      // 札は拠点の少し下（拠点の上に立つ小さな主人公を隠さない）。重なれば下・上・左右へずらす
      const hit = (l: number, t: number) => placed.some((p) => l < p.r && l + it.bw > p.l && t < p.b && t + it.bh > p.t)
      const x0 = it.sx - it.bw / 2
      const y0 = it.tg.under ? it.sy + 6 : it.sy - it.bh
      let at = { l: x0, t: y0 }
      const step = it.bh + 3
      const cands: Array<[number, number]> = [[0, 0], [0, step], [0, -step], [it.bw * 0.6, 0], [-it.bw * 0.6, 0], [0, 2 * step], [0, -2 * step], [it.bw * 0.6, step], [-it.bw * 0.6, step]]
      for (const [dx, dy] of cands) {
        if (!hit(x0 + dx, y0 + dy)) {
          at = { l: x0 + dx, t: y0 + dy }
          break
        }
      }
      at.l = Math.max(2, Math.min(w - it.bw - 2, at.l))
      placed.push({ l: at.l, t: at.t, r: at.l + it.bw, b: at.t + it.bh })
      it.tg.el.style.transform = `translate(${at.l.toFixed(1)}px, ${at.t.toFixed(1)}px)`
    }
  }

  const resize = () => {
    if (!renderer) return
    const w = canvas.clientWidth || 300
    const h = canvas.clientHeight || 400
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    // ジオラマ全体（直径）が横幅に収まる距離
    const fitW = (radius * 2.25) / (2 * Math.tan((camera.fov * Math.PI) / 360) * camera.aspect)
    const dist = Math.max(fitW, radius * 2.1)
    // 上から 65° ほどで見下ろす（縦長の枠に板が大きく入り、起伏も読める）
    camera.position.set(center.x, dist * 0.86, center.z + dist * 0.5)
    camera.lookAt(center.x, 0, center.z + radius * 0.06)
    camera.updateProjectionMatrix()
  }

  // 歩く
  let path: Array<{ x: number; z: number }> = []
  let seg = 0
  let along = 0
  let speed = 40
  let onDone: (() => void) | null = null
  let last = 0
  const putHero = (x: number, z: number, heading: number) => {
    hero.position.set(x, yAt(x, z), z)
    heroFig.rotation.y = heading
  }
  const finish = () => {
    const p = path[path.length - 1]
    if (p) putHero(p.x, p.z, heroFig.rotation.y)
    path = []
    const fn = onDone
    onDone = null
    fn?.()
  }

  const frame = (now: number) => {
    if (!visible || !renderer) return
    const dt = Math.min(0.05, (now - (last || now)) / 1000)
    last = now
    if (path.length > 1) {
      along += speed * dt
      while (seg < path.length - 1) {
        const a = path[seg]
        const b = path[seg + 1]
        const len = Math.hypot(b.x - a.x, b.z - a.z)
        if (along < len) {
          const t = along / len
          putHero(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, Math.atan2(b.x - a.x, b.z - a.z))
          break
        }
        along -= len
        seg++
      }
      if (seg >= path.length - 1) finish()
    }
    const bob = reduceMotion ? 0 : path.length > 1 ? Math.abs(Math.sin(now / 90)) * 0.9 : Math.sin(now / 400) * 0.25
    heroFig.position.y = bob
    here.position.y = 36 + (reduceMotion ? 0 : Math.sin(now / 250) * 2)
    here.rotation.y = now / 600
    ring.scale.setScalar(reduceMotion ? 1 : 1 + Math.sin(now / 300) * 0.12)
    renderer.render(scene, camera)
    requestAnimationFrame(frame)
  }

  if (import.meta.env.DEV) (window as unknown as { __awlMap3d: unknown }).__awlMap3d = { scene, hero, camera, yAt, info: () => renderer?.info.render }
  return {
    set: (s, colliders) => {
      const worldChanged = !state || state.world !== s.world
      state = s
      center = s.center
      radius = RADIUS[s.world] ?? R_DEFAULT
      base0 = terrainHeight(center.x, center.z)
      if (worldChanged) {
        if (current) scene.remove(current)
        let g = worlds.get(s.world)
        if (!g) {
          g = buildWorld(s.world, colliders)
          worlds.set(s.world, g)
        }
        current = g
        scene.add(g)
      }
      ;(heroBody.material as THREE.MeshLambertMaterial).color.set(s.heroColor)
      if (!path.length) putHero(s.player.x, s.player.z, s.player.heading)
      rebuildDynamic()
      resize()
      placeTags()
    },
    setVisible: (on) => {
      if (on === visible) return
      visible = on
      if (on) {
        if (!renderer) {
          renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
          renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
          renderer.outputColorSpace = THREE.SRGBColorSpace
        }
        resize()
        placeTags()
        last = 0
        requestAnimationFrame(frame)
      }
    },
    travel: (points, done) => {
      path = points
      seg = 0
      along = 0
      let len = 0
      for (let i = 1; i < points.length; i++) len += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z)
      // 遠くても近くても 1.2〜3.5 秒で着く
      speed = len / Math.min(3.5, Math.max(1.2, len / 45))
      onDone = done
      if (points.length < 2 || len < 0.5) finish()
    },
    skip: () => {
      if (path.length < 2) return false
      finish()
      return true
    },
    isTraveling: () => path.length > 1,
    setReduceMotion: (on) => {
      reduceMotion = on
    },
    onBase: (fn) => {
      baseListeners.push(fn)
    },
  }
}
