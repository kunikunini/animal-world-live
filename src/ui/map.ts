import { getWorld } from '../data/worlds'
import type { WorldKey } from '../data/worlds'
import { mapBases, nearestBase, roadPath, worldAt, worldCenter } from '../world/mapBases'
import type { MapBase } from '../world/mapBases'
import type { Collider } from '../world/props'
import type { RegionKey } from '../world/regions'
import { getLang, onLangChange, speciesName, t } from './i18n'
import { createDiorama } from './mapDiorama'
import type { Diorama, DioramaBase } from './mapDiorama'
import { CONTINENT_VIEW, createMapRenderer } from './minimap'
import type { MapOverlay, MapPlayer, MinimapMarker } from './minimap'
import { setViewOpen } from './transition'

/**
 * 広げた地図。2D（大陸を上から見た平面、北が上）と 3D（いまいるワールドのジオラマ）を切り替えられる（11/6 のくにの要望）。
 * - 拠点（スタート・観察スポット・峠・代表的な動物のいる所）が道でつながっていて、拠点を押すと地図の中で主人公が道をたどって歩き、
 *   着いたら地図を閉じて、本編のその場所に立っている（スーパーマリオブラザーズ 3 のワールドマップの考え方）。歩いている間にもう一度押すとすぐ着く
 * - 2D では、拠点ではない所を押すと、今までどおり本編でそこまで歩く
 * - 「動物」で、動物の印（点・ピン・名前・動物の拠点）を出す／隠す。2D・3D の両方に効く
 * - 2D／3D と「動物」は、この端末に覚える
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
  /** 最新の位置。開いている間だけ描き直す */
  update: (player: MapPlayer, lions: MinimapMarker[]) => void
  /** 本編の情報: 動物の今の位置（出会っていない子も）、木や岩、主人公の服の色、動きをへらす */
  configure: (deps: { animalAt: (id: string) => { x: number; z: number } | null; colliders: Collider[]; heroColor: () => string }) => void
  setReduceMotion: (on: boolean) => void
}

const MODE_KEY = 'awl.mapMode.v1'
const ANIMALS_KEY = 'awl.mapAnimals.v1'

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
  const canvas = document.getElementById('map-canvas') as HTMLCanvasElement
  const wrap3d = document.getElementById('map-3d') as HTMLElement
  const closeBtn = document.getElementById('map-close') as HTMLButtonElement
  const namesBtn = document.getElementById('map-names') as HTMLButtonElement
  const btn2d = document.getElementById('map-2d') as HTMLButtonElement
  const btn3d = document.getElementById('map-3d-btn') as HTMLButtonElement
  // 2D は海に浮かぶ大陸の全体（縦長 3:4。西のジャングルから東の海岸まで、北の世界から南半球まで）
  const renderer = createMapRenderer({ width: 750, height: 1000, labels: true, box: CONTINENT_VIEW })
  canvas.width = renderer.width
  canvas.height = renderer.height
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D
  let diorama: Diorama | null = null

  let open = false
  let mode: '2d' | '3d' = read(MODE_KEY) === '3d' ? '3d' : '2d'
  // 動物の印。前の「動物の名前」を隠していた人は、隠したまま
  let markers = (read(ANIMALS_KEY) ?? read('awl.mapNames.v1')) !== '0'
  let last: { player: MapPlayer; lions: MinimapMarker[] } | null = null
  let deps: Parameters<MapView['configure']>[0] | null = null
  let target: string | null = null
  let travel2d: { points: Array<{ x: number; z: number }>; t0: number; dur: number; done: () => void } | null = null
  let reduceMotion = false
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
      bases: bases.map((b) => ({ id: b.id, kind: b.kind, ...basePos(b), label: baseLabel(b), friend: !!b.animalId && friends.has(b.animalId), world: b.world })),
      labelWorld: last ? worldAt(last.player.x, last.player.z) : 'africa',
      roads: roads.map((r) => {
        const a = byId.get(r.a)!
        const b = byId.get(r.b)!
        return [a.x, a.z, b.x, b.z, r.b.includes(':animal:') || r.a.includes(':animal:')] as [number, number, number, number, boolean]
      }),
      target,
    }
  }

  const redraw2d = () => {
    if (!last) return
    renderer.setOverlay(overlay2d())
    renderer.draw(ctx, last.player, last.lions)
  }

  const refresh3d = () => {
    if (!last || !deps) return
    if (!diorama) {
      diorama = createDiorama(wrap3d)
      diorama.setReduceMotion(reduceMotion)
      diorama.onBase((id) => go(id))
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
        showMarkers: markers,
        player: last.player,
        heroColor: deps.heroColor(),
        target,
      },
      deps.colliders,
    )
  }

  const redraw = () => {
    if (!open) return
    if (mode === '2d') redraw2d()
    else refresh3d()
  }

  const applyMode = () => {
    btn2d.setAttribute('aria-checked', String(mode === '2d'))
    btn3d.setAttribute('aria-checked', String(mode === '3d'))
    canvas.hidden = mode !== '2d'
    wrap3d.hidden = mode !== '3d'
    diorama?.setVisible(open && mode === '3d')
    if (open && mode === '3d') {
      refresh3d()
      diorama?.setVisible(true)
    }
    redraw()
  }

  const applyMarkers = () => {
    renderer.setMarkers(markers)
    renderer.setNames(markers)
    namesBtn.setAttribute('aria-pressed', String(markers))
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
    redraw2d()
    if (k >= 1) {
      travel2d = null
      tr.done()
      return
    }
    requestAnimationFrame(step2d)
  }

  applyMarkers()
  applyMode()
  namesBtn.addEventListener('click', () => {
    markers = !markers
    write(ANIMALS_KEY, markers ? '1' : '0')
    applyMarkers()
    redraw()
  })
  const setMode = (m: '2d' | '3d') => {
    if (mode === m || travel2d || diorama?.isTraveling()) return
    mode = m
    write(MODE_KEY, m)
    applyMode()
  }
  btn2d.addEventListener('click', () => setMode('2d'))
  btn3d.addEventListener('click', () => setMode('3d'))
  onLangChange(redraw)

  closeBtn.addEventListener('click', () => setOpen(false))
  // シートの外（暗い地の部分）を押しても閉じる
  root.addEventListener('click', (e) => {
    if (open && e.target === root) setOpen(false)
  })
  window.addEventListener('keydown', (e) => {
    if (open && e.key === 'Escape') setOpen(false)
  })
  // 2D: 拠点を押したら拠点へ、ほかの所を押したら今までどおり本編でそこまで歩く。歩いている途中に押すとすぐ着く
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    e.stopPropagation()
  })
  canvas.addEventListener('pointerup', (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (travel2d) {
      skip()
      return
    }
    const rect = canvas.getBoundingClientRect()
    const mx = ((e.clientX - rect.left) / rect.width) * renderer.width
    const my = ((e.clientY - rect.top) / rect.height) * renderer.height
    const id = renderer.baseAt(mx, my)
    if (id) {
      go(id)
      return
    }
    const w = renderer.toWorld(mx, my)
    if (!w) return
    pickListeners.forEach((fn) => fn(w.x, w.z))
    setOpen(false)
  })
  // 3D: 拠点の札でない所を押した時も、歩いている途中ならすぐ着く
  wrap3d.addEventListener('pointerup', (e) => {
    if ((e.target as HTMLElement).closest('[data-base]')) return
    skip()
  })

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
    update: (player, lions) => {
      last = { player, lions }
      if (open && mode === '2d' && !travel2d) redraw2d()
    },
    configure: (d) => {
      deps = d
    },
    setReduceMotion: (on) => {
      reduceMotion = on
      diorama?.setReduceMotion(on)
    },
  }
}
