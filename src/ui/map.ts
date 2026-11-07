import { getWorld } from '../data/worlds'
import type { WorldKey } from '../data/worlds'
import { mapBases, nearestBase, roadPath, worldAt, worldCenter } from '../world/mapBases'
import type { MapBase } from '../world/mapBases'
import type { Collider } from '../world/props'
import { REGIONS } from '../world/regions'
import type { RegionKey } from '../world/regions'
import { getLang, onLangChange, speciesName, t } from './i18n'
import { createDiorama } from './mapDiorama'
import type { Diorama, DioramaBase } from './mapDiorama'
import { CONTINENT_VIEW, createMapRenderer } from './minimap'
import type { FreeView, MapOverlay, MapPlayer, MinimapMarker } from './minimap'
import { setViewOpen } from './transition'

/**
 * 広げた地図。3D（いまいるワールドのジオラマ。まわりのワールドもうっすら）と 2D（大陸を上から見た平面）を切り替えられる。
 * 最初は 3D（11/7 のくにの要望）。シートを縦いっぱいに使い、地図を全面に出す。
 * - 拠点（スタート・観察スポット・峠・代表的な動物のいる所）が道でつながっていて、拠点を押すと地図の中で主人公が道をたどって歩き、
 *   着いたら地図を閉じて、本編のその場所に立っている（スーパーマリオブラザーズ 3 のワールドマップの考え方）。歩いている間にもう一度押すとすぐ着く
 * - 2D は Google マップのように: 1 本指でずらす、2 本指でつまんで拡大・縮小、ひねって回す（PC はドラッグ・ホイール・Shift＋ホイールで回す）。
 *   文字は大事な順に出し、重なる文字は出さない（寄ると出てくる）。拠点ではない所を押すと、今までどおり本編でそこまで歩く
 * - 右上の方位のボタンで北が上に、「向いている方を上に」で自分の向いている方を上にして自分を真ん中に
 * - 「動物」のスイッチで、動物の印（点・ピン・名前・動物の拠点）を出す／隠す。2D と 3D で別々に覚える（2D は最初オフ、3D は最初オン）
 * - 2D／3D と「動物」は、この端末に覚える。WebGL が使えない時は 2D だけ
 * - 3D を開いている間は本編を描かない（main.ts）。ジオラマは開いている間だけ描く
 * ともだち帳と同じオーバーレイの作法（閉じる・Esc・開いている間はワールドの入力を止める）。
 */
export interface MapView {
  open: () => void
  close: () => void
  isOpen: () => boolean
  /** 3D を開いているか（本編の描画を止める） */
  is3DOpen: () => boolean
  onOpenChange: (fn: (open: boolean) => void) => void
  onPick: (fn: (x: number, z: number) => void) => void
  /** 拠点に着いた（地図を閉じた後）。本編でその場所へ */
  onTravel: (fn: (base: MapBase) => void) => void
  /** 開いている時: その拠点の印の画面の四角（px）。見えていなければ null（あそびかたツアーが照らす） */
  baseRect: (id: string) => { x: number; y: number; w: number; h: number } | null
  /** 最新の位置。開いている間だけ描き直す */
  update: (player: MapPlayer, lions: MinimapMarker[]) => void
  /** 本編の情報: 動物の今の位置（出会っていない子も）、木や岩、主人公の服の色、動きをへらす */
  configure: (deps: {
    animalAt: (id: string) => { x: number; z: number } | null
    colliders: Collider[]
    heroColor: () => string
    /** いま操作している子の GLB（読めていなければ null） */
    heroModel: () => string | null
  }) => void
  setReduceMotion: (on: boolean) => void
}

/** 2D／3D（v2: 最初を 3D にした時に、前に覚えた 2D をいったん忘れる） */
const MODE_KEY = 'awl.mapMode.v2'
/** 動物の印: 3D は前からの鍵（最初はオン）、2D は新しい鍵（最初はオフ） */
const ANIMALS_3D_KEY = 'awl.mapAnimals.v1'
const ANIMALS_2D_KEY = 'awl.mapAnimals2d.v1'
/** 2D の拡大の範囲（大陸の全体が収まる縮尺に対する倍率） */
const ZOOM_MIN = 0.8
const ZOOM_MAX = 7
/** 「向いている方を上に」の時の寄り */
const FOLLOW_ZOOM = 2.6
/** 押しただけか、ドラッグか（CSS px） */
const DRAG_PX = 6

const read = (k: string): string | null => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v)
  } catch {
    // 保存できなくても今回は切り替える
  }
}

export function createMapView(): MapView {
  const root = document.getElementById('map') as HTMLElement
  const stage = document.getElementById('map-stage') as HTMLElement
  const canvas = document.getElementById('map-canvas') as HTMLCanvasElement
  const wrap3d = document.getElementById('map-3d') as HTMLElement
  const closeBtn = document.getElementById('map-close') as HTMLButtonElement
  const animalsBtn = document.getElementById('map-names') as HTMLButtonElement
  const animalsState = animalsBtn.querySelector('.map-switch-state') as HTMLElement
  const btn2d = document.getElementById('map-2d') as HTMLButtonElement
  const btn3d = document.getElementById('map-3d-btn') as HTMLButtonElement
  const compassBtn = document.getElementById('map-compass') as HTMLButtonElement
  const followBtn = document.getElementById('map-follow') as HTMLButtonElement
  // 2D は海に浮かぶ大陸の全体。見る所は指で変える
  const renderer = createMapRenderer({ width: 300, height: 400, labels: true, box: CONTINENT_VIEW, free: true })
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D
  let diorama: Diorama | null = null
  let has3d = true

  let open = false
  let mode: '2d' | '3d' = read(MODE_KEY) === '2d' ? '2d' : '3d'
  // 動物の印。3D は前の「動物」を隠していた人は隠したまま
  let animals3d = (read(ANIMALS_3D_KEY) ?? read('awl.mapNames.v1')) !== '0'
  let animals2d = read(ANIMALS_2D_KEY) === '1'
  const animalsOn = () => (mode === '2d' ? animals2d : animals3d)
  let last: { player: MapPlayer; lions: MinimapMarker[] } | null = null
  let deps: Parameters<MapView['configure']>[0] | null = null
  let target: string | null = null
  let travel2d: { points: Array<{ x: number; z: number }>; t0: number; dur: number; done: () => void } | null = null
  let reduceMotion = false
  /** 向いている方を上にしているか（指で回すと解ける） */
  let follow = false
  const openListeners: Array<(open: boolean) => void> = []
  const pickListeners: Array<(x: number, z: number) => void> = []
  const travelListeners: Array<(base: MapBase) => void> = []

  const worldName = (key: RegionKey) => (key === 'africa' ? t('catSavanna') : (getWorld(key as WorldKey)?.name[getLang()] ?? key))
  const baseLabel = (b: MapBase) => {
    if (b.kind === 'spot') return t('spot')
    if (b.kind === 'entry') return t('mapStart')
    if (b.kind === 'pass' && b.to) return t('mapPassTo', { world: worldName(b.to) })
    return b.species ? speciesName(b.species) : ''
  }
  /** 拠点の今の場所（動物の拠点は個体の今の位置） */
  const basePos = (b: MapBase) => (b.kind === 'animal' && b.animalId ? (deps?.animalAt(b.animalId) ?? { x: b.x, z: b.z }) : { x: b.x, z: b.z })
  const friendIds = () => new Set((last?.lions ?? []).filter((l) => l.friend).map((l) => l.id))

  const overlay2d = (): MapOverlay => {
    const { bases, roads } = mapBases()
    const byId = new Map(bases.map((b) => [b.id, basePos(b)]))
    const friends = friendIds()
    return {
      bases: bases.map((b) => ({ id: b.id, kind: b.kind, ...basePos(b), label: baseLabel(b), friend: !!b.animalId && friends.has(b.animalId), world: b.world, to: b.to })),
      labelWorld: last ? worldAt(last.player.x, last.player.z) : 'africa',
      roads: roads.map((r) => {
        const a = byId.get(r.a)!
        const b = byId.get(r.b)!
        return [a.x, a.z, b.x, b.z, r.b.includes(':animal:') || r.a.includes(':animal:')] as [number, number, number, number, boolean]
      }),
      target,
    }
  }

  // ---------------------------------------------------------------------------
  // 2D の見る所（中心・縮尺・回転）
  // ---------------------------------------------------------------------------
  let dpr = 1
  const view: FreeView = { cx: 0, cz: 0, k: 1, rot: 0 }
  let fitted = false
  const box = CONTINENT_VIEW
  const fitK = () => renderer.fitScale()
  const clampView = () => {
    const f = fitK()
    view.k = Math.min(f * ZOOM_MAX, Math.max(f * ZOOM_MIN, view.k))
    view.cx = Math.min(box.maxX, Math.max(box.minX, view.cx))
    view.cz = Math.min(box.maxZ, Math.max(box.minZ, view.cz))
    view.rot = Math.atan2(Math.sin(view.rot), Math.cos(view.rot))
  }
  const pushView = () => {
    clampView()
    renderer.setFreeView(view)
    updateCompass()
    needs = true
  }
  const fitAll = () => {
    view.cx = (box.minX + box.maxX) / 2
    view.cz = (box.minZ + box.maxZ) / 2
    view.k = fitK()
    view.rot = 0
  }
  /** 向いている方を上に: 自分を真ん中に、向きの方が画面の上になるように回す */
  const followPlayer = () => {
    const p = travel2d ? null : last?.player
    if (!p) return
    view.cx = p.x
    view.cz = p.z
    view.rot = Math.atan2(Math.sin(p.heading + Math.PI), Math.cos(p.heading + Math.PI))
  }
  /** キャンバスの大きさを舞台に合わせる（開いた時・回転した時） */
  const sizeCanvas = (): boolean => {
    const w = stage.clientWidth
    const h = stage.clientHeight
    if (!w || !h) return false
    dpr = Math.min(window.devicePixelRatio || 1, 3)
    const W = Math.round(w * dpr)
    const H = Math.round(h * dpr)
    if (canvas.width !== W || canvas.height !== H) {
      const zoom = fitted ? view.k / fitK() : 1
      canvas.width = W
      canvas.height = H
      renderer.resize(W, H, dpr)
      if (fitted) view.k = fitK() * zoom
    }
    if (!fitted) {
      fitAll()
      fitted = true
    }
    pushView()
    return true
  }

  // 2D を描く: 開いている間は毎コマ（光のまたたき・自分の印の輪）。動きをへらす時は変わった時だけ
  let needs = true
  let loop = 0
  const frame2d = () => {
    loop = 0
    if (!open || mode !== '2d') return
    if (last && (needs || !reduceMotion || renderer.needsFrame())) {
      needs = false
      renderer.setOverlay(overlay2d())
      renderer.draw(ctx, last.player, last.lions)
    }
    loop = requestAnimationFrame(frame2d)
  }
  const start2d = () => {
    if (!loop) loop = requestAnimationFrame(frame2d)
  }

  const refresh3d = (): boolean => {
    if (!last || !deps || !has3d) return false
    if (!diorama) {
      try {
        diorama = createDiorama(wrap3d)
      } catch (err) {
        console.warn('map 3d unavailable', err)
        return false
      }
      diorama.setReduceMotion(reduceMotion)
      diorama.onBase((id) => go(id))
      diorama.onView((yaw, byUser) => {
        if (mode !== '3d') return
        if (byUser && follow) setFollow(false)
        setNeedle(yaw)
      })
    }
    const world = worldAt(last.player.x, last.player.z)
    const center = world === 'africa' ? { x: 0, z: 0 } : worldCenter(world)
    const o = overlay2d()
    const bases: DioramaBase[] = o.bases.filter((b) => b.world === world)
    diorama.set(
      {
        world,
        center,
        bases,
        roads: o.roads,
        markers: last.lions.map((l) => ({ id: l.id, x: l.x, z: l.z, friend: !!l.friend })),
        showMarkers: animals3d,
        player: last.player,
        heroColor: deps.heroColor(),
        heroModel: deps.heroModel(),
        target,
        worlds: REGIONS.map((r) => ({ world: r.key, label: worldName(r.key), base: `${r.key}:spot` })),
      },
      deps.colliders,
    )
    return true
  }

  const redraw = () => {
    if (!open) return
    if (mode === '2d') {
      needs = true
      start2d()
    } else refresh3d()
  }

  // 方位: 赤い先が北。2D は地図の回転、3D は見る向き
  const setNeedle = (rad: number) => {
    const deg = `${((rad * 180) / Math.PI).toFixed(1)}deg`
    compassBtn.style.setProperty('--n-rot', deg)
    ;(compassBtn.querySelector('.map-compass-needle') as HTMLElement).style.rotate = deg
  }
  const updateCompass = () => {
    if (mode === '2d') setNeedle(view.rot)
  }
  const setFollow = (on: boolean) => {
    follow = on
    followBtn.setAttribute('aria-pressed', String(on))
  }

  /** 3D が使えない時: 2D だけにする（この端末の選択は変えない） */
  const drop3d = () => {
    has3d = false
    mode = '2d'
    btn3d.disabled = true
    btn3d.setAttribute('aria-disabled', 'true')
  }

  const applyMode = () => {
    btn2d.setAttribute('aria-checked', String(mode === '2d'))
    btn3d.setAttribute('aria-checked', String(mode === '3d'))
    canvas.hidden = mode !== '2d'
    wrap3d.hidden = mode !== '3d'
    if (diorama && !(open && mode === '3d')) diorama.setVisible(false)
    if (open && mode === '3d') {
      const ok = refresh3d() && !!diorama && diorama.setVisible(true)
      if (!ok && last && deps) {
        drop3d()
        return applyMode()
      }
    }
    applyAnimals()
    if (open && mode === '2d') {
      if (!sizeCanvas()) requestAnimationFrame(() => open && mode === '2d' && sizeCanvas())
      if (follow) {
        followPlayer()
        view.k = Math.max(view.k, fitK() * FOLLOW_ZOOM)
        pushView()
      }
    }
    if (open && mode === '3d' && follow) diorama?.headingUp()
    redraw()
  }

  const applyAnimals = () => {
    renderer.setMarkers(animals2d)
    renderer.setNames(animals2d)
    const on = animalsOn()
    animalsBtn.setAttribute('aria-checked', String(on))
    animalsState.textContent = on ? 'ON' : 'OFF'
    root.classList.toggle('is-animals', on)
  }

  const setOpen = (next: boolean) => {
    if (open === next) return
    open = next
    if (!open) {
      target = null
      travel2d = null
      renderer.setTraveler(null)
    }
    setViewOpen(root, open)
    applyMode()
    if (open) closeBtn.focus()
    openListeners.forEach((fn) => fn(open))
  }

  /** 拠点へ: 地図の中で道をたどって歩き、着いたら閉じて本編へ */
  const go = (id: string) => {
    if (!last || travel2d || diorama?.isTraveling()) {
      // 歩いている途中: もう一度押すとすぐ着く
      skip()
      return
    }
    const base = mapBases().bases.find((b) => b.id === id)
    if (!base) return
    target = id
    const start = nearestBase(last.player.x, last.player.z, basePos)
    const ids = roadPath(start.id, id)
    const points = [{ x: last.player.x, z: last.player.z }, ...ids.map((bid) => basePos(mapBases().bases.find((b) => b.id === bid)!))]
    const arrive = () => {
      window.setTimeout(() => {
        setOpen(false)
        travelListeners.forEach((fn) => fn(base))
      }, reduceMotion ? 0 : 280)
    }
    if (mode === '3d' && diorama) {
      refresh3d()
      diorama.travel(points, arrive)
      return
    }
    let len = 0
    for (let i = 1; i < points.length; i++) len += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z)
    // 2D は簡単に: 自分の印が道をなぞって動く（1〜2.5 秒）
    travel2d = { points, t0: performance.now(), dur: reduceMotion ? 0 : Math.min(2500, Math.max(1000, len * 8)), done: arrive }
    requestAnimationFrame(step2d)
  }
  const skip = () => {
    if (diorama?.skip()) return
    if (travel2d) travel2d.dur = 0
  }
  const step2d = (now: number) => {
    const tr = travel2d
    if (!tr || !last) return
    const k = tr.dur > 0 ? Math.min(1, (now - tr.t0) / tr.dur) : 1
    // 道の長さに沿って k の所
    const lens = tr.points.slice(1).map((p, i) => Math.hypot(p.x - tr.points[i].x, p.z - tr.points[i].z))
    let d = lens.reduce((a, b) => a + b, 0) * k
    let i = 0
    while (i < lens.length - 1 && d > lens[i]) d -= lens[i++]
    const a = tr.points[i]
    const b = tr.points[i + 1] ?? a
    const f = lens[i] ? Math.min(1, d / lens[i]) : 1
    renderer.setTraveler({ x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, heading: Math.atan2(b.x - a.x, b.z - a.z) })
    needs = true
    if (k >= 1) {
      travel2d = null
      tr.done()
      return
    }
    requestAnimationFrame(step2d)
  }

  applyAnimals()
  applyMode()
  animalsBtn.addEventListener('click', () => {
    if (mode === '2d') {
      animals2d = !animals2d
      write(ANIMALS_2D_KEY, animals2d ? '1' : '0')
    } else {
      animals3d = !animals3d
      write(ANIMALS_3D_KEY, animals3d ? '1' : '0')
    }
    applyAnimals()
    redraw()
  })
  const setMode = (m: '2d' | '3d') => {
    if (mode === m || travel2d || diorama?.isTraveling()) return
    if (m === '3d' && !has3d) return
    mode = m
    write(MODE_KEY, m)
    applyMode()
  }
  btn2d.addEventListener('click', () => setMode('2d'))
  btn3d.addEventListener('click', () => setMode('3d'))
  onLangChange(redraw)

  // 方位: 北を上に（3D は最初の見え方に）。向き合わせ: 押すたびに入れる／切る
  compassBtn.addEventListener('click', () => {
    setFollow(false)
    if (mode === '3d') {
      diorama?.northUp()
      return
    }
    view.rot = 0
    pushView()
  })
  followBtn.addEventListener('click', () => {
    setFollow(!follow)
    if (mode === '3d') {
      if (follow) diorama?.headingUp()
      else diorama?.northUp()
      return
    }
    if (follow) {
      followPlayer()
      view.k = Math.max(view.k, fitK() * FOLLOW_ZOOM)
    } else view.rot = 0
    pushView()
  })

  closeBtn.addEventListener('click', () => setOpen(false))
  // シートの外（暗い地の部分）を押しても閉じる
  root.addEventListener('click', (e) => {
    if (open && e.target === root) setOpen(false)
  })
  window.addEventListener('keydown', (e) => {
    if (open && e.key === 'Escape') setOpen(false)
  })
  // 舞台の大きさが変わったら（画面を回した時など）合わせる
  if ('ResizeObserver' in window)
    new ResizeObserver(() => {
      if (!open) return
      if (mode === '2d') sizeCanvas()
      else refresh3d()
    }).observe(stage)

  // ---------------------------------------------------------------------------
  // 2D の指とマウス: 1 本指でずらす、2 本指でつまんで拡大・ひねって回す。押しただけなら拠点へ／そこまで歩く
  // ---------------------------------------------------------------------------
  const pointers = new Map<number, { x: number; y: number }>()
  let downAt: { x: number; y: number } | null = null
  let dragged = false
  let gesture: { dist: number; angle: number; cx: number; cy: number } | null = null
  const twoFinger = () => {
    const [a, b] = [...pointers.values()]
    return { dist: Math.hypot(b.x - a.x, b.y - a.y), angle: Math.atan2(b.y - a.y, b.x - a.x), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }
  }
  /** 画面の点（client）→ キャンバスの点 */
  const toCanvas = (cx: number, cy: number) => {
    const r = canvas.getBoundingClientRect()
    return { x: ((cx - r.left) / r.width) * canvas.width, y: ((cy - r.top) / r.height) * canvas.height }
  }
  /** 画面の点 (sx, sy) の下の地面が、そこに残るように見る所を合わせる（拡大・回転の中心） */
  const anchor = (w: { x: number; z: number }, sx: number, sy: number) => {
    const X = sx - canvas.width / 2
    const Y = sy - canvas.height / 2
    const c = Math.cos(view.rot)
    const s = Math.sin(view.rot)
    view.cx = w.x - (X * c + Y * s) / view.k
    view.cz = w.z - (-X * s + Y * c) / view.k
  }
  const worldAtCanvas = (sx: number, sy: number) => {
    const X = sx - canvas.width / 2
    const Y = sy - canvas.height / 2
    const c = Math.cos(view.rot)
    const s = Math.sin(view.rot)
    return { x: view.cx + (X * c + Y * s) / view.k, z: view.cz + (-X * s + Y * c) / view.k }
  }
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (!pointers.size) dragged = false
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.size === 1) downAt = { x: e.clientX, y: e.clientY }
    if (pointers.size === 2) {
      gesture = twoFinger()
      dragged = true
    }
  })
  canvas.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId)
    if (!p) return
    const dx = e.clientX - p.x
    const dy = e.clientY - p.y
    p.x = e.clientX
    p.y = e.clientY
    if (!dragged && downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > DRAG_PX) {
      dragged = true
      try {
        canvas.setPointerCapture(e.pointerId)
      } catch {
        // 捕まえられなくても動かせる
      }
    }
    if (!dragged) return
    if (pointers.size >= 2 && gesture) {
      const g = twoFinger()
      const pivot = toCanvas(gesture.cx, gesture.cy)
      const w = worldAtCanvas(pivot.x, pivot.y)
      if (g.dist > 10 && gesture.dist > 10) view.k *= g.dist / gesture.dist
      let da = g.angle - gesture.angle
      if (da > Math.PI) da -= Math.PI * 2
      if (da < -Math.PI) da += Math.PI * 2
      // 少しのひねりでは回さない（拡大だけのつもりで回ってしまわないように）
      if (Math.abs(da) > 0.0015) {
        view.rot += da
        if (follow) setFollow(false)
      }
      clampView()
      const np = toCanvas(g.cx, g.cy)
      anchor(w, np.x, np.y)
      gesture = g
    } else if (pointers.size === 1) {
      // 1 本指: 地面が指についてくる
      const c = Math.cos(view.rot)
      const s = Math.sin(view.rot)
      const X = dx * dpr
      const Y = dy * dpr
      view.cx -= (X * c + Y * s) / view.k
      view.cz -= (-X * s + Y * c) / view.k
      if (follow) setFollow(false)
    }
    pushView()
  })
  const up2d = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return
    const wasTap = !dragged && pointers.size === 1
    pointers.delete(e.pointerId)
    if (pointers.size < 2) gesture = null
    if (pointers.size === 1) {
      const [q] = [...pointers.values()]
      downAt = { x: q.x, y: q.y }
    }
    if (!wasTap || e.type !== 'pointerup') return
    if (travel2d) {
      skip()
      return
    }
    const m = toCanvas(e.clientX, e.clientY)
    const id = renderer.baseAt(m.x, m.y)
    if (id) {
      go(id)
      return
    }
    const w = renderer.toWorld(m.x, m.y)
    if (!w) return
    pickListeners.forEach((fn) => fn(w.x, w.z))
    setOpen(false)
  }
  canvas.addEventListener('pointerup', (e) => {
    e.preventDefault()
    e.stopPropagation()
    up2d(e)
  })
  canvas.addEventListener('pointercancel', up2d)
  canvas.addEventListener('lostpointercapture', (e) => {
    if (pointers.has(e.pointerId) && dragged) up2d(e)
  })
  canvas.addEventListener('contextmenu', (e) => e.preventDefault())
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault()
      const m = toCanvas(e.clientX, e.clientY)
      const w = worldAtCanvas(m.x, m.y)
      const d = e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015)
      if (e.shiftKey) {
        view.rot += d
        if (follow) setFollow(false)
      } else view.k *= Math.exp(-d)
      clampView()
      anchor(w, m.x, m.y)
      pushView()
    },
    { passive: false },
  )
  // 3D: 拠点の札でない所を押した時も、歩いている途中ならすぐ着く（回したり寄ったりした時は除く）
  wrap3d.addEventListener('pointerup', (e) => {
    if ((e.target as HTMLElement).closest('[data-base]')) return
    if (diorama?.wasDrag()) return
    skip()
  })

  // 看板の字（Web フォント）が届いたら描き直す
  document.fonts?.load("16px 'Mochiy Pop One'", 'サバンナ').then(() => {
    needs = true
  }, () => {})

  if (import.meta.env.DEV) (window as unknown as { __awlMap2d: unknown }).__awlMap2d = { view, pushView, fitK, renderer }

  return {
    open: () => setOpen(true),
    close: () => setOpen(false),
    isOpen: () => open,
    is3DOpen: () => open && mode === '3d',
    onOpenChange: (fn) => {
      openListeners.push(fn)
    },
    onPick: (fn) => {
      pickListeners.push(fn)
    },
    onTravel: (fn) => {
      travelListeners.push(fn)
    },
    baseRect: (id) => {
      if (!open) return null
      if (mode === '3d') {
        const el = wrap3d.querySelector<HTMLElement>(`[data-base="${CSS.escape(id)}"]`)
        if (!el) return null
        const r = el.getBoundingClientRect()
        return r.width > 2 ? { x: r.left, y: r.top, w: r.width, h: r.height } : null
      }
      const p = renderer.basePoint(id)
      if (!p) return null
      const r = canvas.getBoundingClientRect()
      const x = r.left + (p.x / canvas.width) * r.width
      const y = r.top + (p.y / canvas.height) * r.height
      if (x < r.left || x > r.right || y < r.top || y > r.bottom) return null
      return { x: x - 26, y: y - 26, w: 52, h: 52 }
    },
    update: (player, lions) => {
      last = { player, lions }
      if (open && mode === '2d' && !travel2d) {
        if (follow) {
          followPlayer()
          pushView()
        }
        needs = true
      }
    },
    configure: (d) => {
      deps = d
    },
    setReduceMotion: (on) => {
      reduceMotion = on
      renderer.setReduceMotion(on)
      diorama?.setReduceMotion(on)
      needs = true
    },
  }
}
