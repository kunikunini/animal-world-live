import * as THREE from 'three'
import { createScene, sunDiscDir } from './world/scene'
import { createTerrain, terrainHeight } from './world/terrain'
import { NO_REFLECT_LAYER, createProps } from './world/props'
import { createBiomeProps } from './world/biomes'
import { createResidents } from './world/residents'
import { OUTER_REGIONS, biomeAt, regionAt, routeTo } from './world/regions'
import type { BiomeWeights, RegionKey } from './world/regions'
import { getWorld } from './data/worlds'
import { createPlayer } from './player/controller'
import { loadHero } from './player/heroModel'
import type { HeroModel } from './player/heroModel'
import { createHud } from './ui/hud'
import { createObservationSpot } from './world/spots'
import { createAtmosphere } from './world/atmosphere'
import { createClouds } from './world/clouds'
import { createWeather } from './world/weather'
import { createPostFx } from './render/postfx'
import { getClay, setClay, vividToon } from './render/toon'
import { LIONS, SPOT } from './world/layout'
import { createLion } from './world/lions'
import { loadLionModel } from './world/lionModel'
import { loadAiLion, POSTURE_DEFAULT, type AiLion, type PostureFix } from './world/aiLionModel'
import { createLionWander, type LionWander } from './world/lionWander'
import { createObserveView } from './ui/observe'
import { createBookView } from './ui/book'
import { createWorldLabels } from './ui/labels'
import type { LabelEntry, Rect } from './ui/labels'
import { createEncounterIcon } from './ui/encounter'
import { createMinimap } from './ui/minimap'
import { createMapView } from './ui/map'
import { createJoystick } from './ui/joystick'
import { createHome } from './ui/home'
import { createStory } from './ui/story'
import { createIris } from './ui/iris'
import { createSettings } from './ui/settings'
import { createGuide } from './ui/guide'
import { createCatalog } from './ui/catalog'
import { createScope } from './ui/scope'
import { animalName, applyStatic, getLang, onLangChange, t } from './ui/i18n'
import { createFauna } from './world/fauna'
import { createFriendBookStore } from './data/friends'
import { createEncounterStore } from './data/encounters'
import { getAnimal, type Animal } from './data/animals'
import { applyView, viewNames } from './debug/views'

function hasWebGL(canvas: HTMLCanvasElement): boolean {
  try {
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {
    return false
  }
}

function isMobile(): boolean {
  return window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 768
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

/** 3D ワールドに依存しない部分。ホーム・ともだち帳・観察モニターは WebGL が無くても使える */
function createShell() {
  const store = createFriendBookStore()
  const met = createEncounterStore()
  const hud = createHud()
  const observe = createObserveView(store, met)
  const book = createBookView(store)
  const home = createHome(store)
  const story = createStory()
  const iris = createIris()
  const settings = createSettings()
  const catalog = createCatalog(store)
  const scope = createScope()
  const guide = createGuide()

  // あそび方ナビの節目。映像を開いた時、その子がすでにともだちなら「ともだちになる」の段は済んだことにする（もう一度見る時に詰まらない）
  const guideWatched = (animal: Animal) => {
    guide.reach('open')
    if (store.has(animal.id)) guide.reach('befriend')
  }
  observe.onBefriend(() => guide.reach('befriend'))
  observe.onOpenChange((open) => document.body.classList.toggle('observe-open', open))
  book.onOpenChange((open) => {
    document.body.classList.toggle('book-open', open)
    if (open) guide.reach('book')
  })
  book.onVisit(() => guide.reach('visit'))

  // アニマルスコープの一覧から: 映像のカードでモニター、帳のボタンで帳（閉じると一覧に戻る）
  catalog.onWatch((animal) => {
    met.mark(animal.id)
    observe.open(animal, 'world')
    guideWatched(animal)
  })
  catalog.onOpenBook(() => book.open('world'))
  book.onOpenChange((open) => {
    if (!open && !observe.isOpen()) catalog.restoreFocus()
  })

  // ともだち帳の「会いに行く」: 3D を歩かずに映像へ直行
  book.onVisit((animal) => {
    met.mark(animal.id)
    observe.open(animal, 'book')
    guideWatched(animal)
  })
  hud.onOpenBook(() => book.open('world'))
  home.onBook(() => book.open('home'))

  // 登録したあと: 帳のボタンに点（帳で見るまで残る）。モニターを閉じて HUD が見えた瞬間に一拍弾ませる
  const syncBookNew = () => hud.setBookNew(store.unseen().length > 0)
  syncBookNew()
  store.onChange(syncBookNew)
  onLangChange(syncBookNew)
  observe.onOpenChange((open) => {
    if (open) return
    if (book.isOpen()) book.restoreFocus()
    else if (catalog.isOpen()) catalog.restoreFocus()
    else if (store.unseen().length > 0) hud.pulseBook()
  })
  // 登録直後の「ともだち帳を見る」: モニターを閉じて帳を開く（新しい子の札が見える）
  observe.onSeeBook(() => {
    // 帳を先に開く（モニターを閉じた時に「帳が開いている」扱いになり、HUD を弾ませない）
    book.open('world')
    observe.close()
  })

  const applyMotion = (on: boolean) => {
    observe.setReduceMotion(on)
    book.setReduceMotion(on)
    home.setReduceMotion(on)
    iris.setReduceMotion(on)
    hud.setReduceMotion(on)
    // 画面の出入りは CSS の transition。動きをへらす時はフェードだけにする
    document.body.classList.toggle('is-reduce-motion', on)
  }
  applyMotion(settings.reduceMotion)
  settings.onReduceMotionChange(applyMotion)

  return { store, met, hud, observe, book, home, story, iris, settings, catalog, scope, guide, guideWatched }
}

type Shell = ReturnType<typeof createShell>

interface WorldHandle {
  /** ホームにいる間は更新も描画も止める */
  pause: () => void
  resume: () => void
  /** いまの画面を画像にする（ホームのスコープのレンズに映す） */
  snapshot: () => string
}

/**
 * ワールドを組み立てる。startPaused なら止めたまま作り、数フレームだけ描いてシェーダーを先に用意する
 * （ホームにいる間に裏で準備しておき、「のぞいてみる」で待たせないため）
 */
function startWorld(canvas: HTMLCanvasElement, shell: Shell, startPaused = false): WorldHandle {
  const { hud, observe, book, store, met, catalog, scope, guide, guideWatched } = shell
  const mobile = isMobile()
  const { renderer, scene, camera, sun, hemi, sky, setDpr } = createScene(canvas, mobile ? 1.5 : 2)
  if (mobile) sun.shadow.mapSize.set(1024, 1024)

  const terrain = createTerrain()
  scene.add(terrain)

  // 草と光の粒は水の映り込みに描かないレイヤーに置く。メインカメラでは見える
  camera.layers.enable(NO_REFLECT_LAYER)
  const props = createProps({ mobile, camera })
  scene.add(props.group)
  // サバンナから峠を抜けた先の 3 つのワールドの木や岩
  scene.add(createBiomeProps({ mobile, colliders: props.colliders }).group)

  // 観察スポット: サバンナはコピエの頂上、ほかのワールドは中心。いるワールドのスポットが「いまのスポット」
  const savannaSpot = createObservationSpot()
  scene.add(savannaSpot.group)
  const worldSpots = [
    { key: 'africa' as RegionKey, spot: savannaSpot, route: [SPOT.approach, { x: SPOT.x, z: SPOT.z }] },
    ...OUTER_REGIONS.map((r) => {
      const s = createObservationSpot({ x: r.x, z: r.z })
      scene.add(s.group)
      return { key: r.key, spot: s, route: [{ x: r.x, z: r.z }] }
    }),
  ]
  let here = worldSpots[0]
  let spot = here.spot

  const atmosphere = createAtmosphere()
  atmosphere.group.traverse((o) => {
    if ((o as THREE.Points).isPoints) o.layers.set(NO_REFLECT_LAYER)
  })
  scene.add(atmosphere.group)

  const clouds = createClouds()
  scene.add(clouds.group)

  // 北の雪とジャングルのもや。濃さはいるワールドの重みで決める
  const weather = createWeather({ mobile })
  scene.add(weather.group)

  // 風景の生き物（鳥の群れ、遠くで草を食む生き物）。名前も出会いも無い
  const fauna = createFauna({ mobile, colliders: props.colliders })
  scene.add(fauna.group)

  // 様式化ライオン。当たり判定も岩と同じ配列に入れる
  // ほかのワールドで会える子（トラ・オオカミ）も同じ伏せの体で作り、出会いの仕組みに乗せる
  const lions = [...LIONS.map((l) => createLion(l)), ...createResidents()]
  for (const lion of lions) {
    vividToon(lion.group)
    scene.add(lion.group)
    props.colliders.push(lion.collider)
  }
  // 実験: ?lion=v2 で Blender 製モデルに差し替える。読めなければプリミティブのまま
  if (new URLSearchParams(location.search).get('lion') === 'v2') {
    const angie = lions.find((l) => l.id === 'angie')
    if (angie) {
      loadLionModel('/models/angie-v2.glb')
        .then((loaded) => {
          angie.swapModel(loaded.model, loaded.parts)
          vividToon(angie.group)
        })
        .catch((err) => console.warn('lion v2 model not loaded; keeping primitive', err))
    }
  }
  // 群れの 5 頭は、期間中に用意したクレイ版の絵から Meshy で生成したモデル（四足リグ＋歩行）が既定。
  // ?model=primitive でプリミティブ版（伏せ）に戻せる。読めない時もプリミティブ版のまま続く
  const aiLions: Record<string, AiLion> = {}
  const wanderers: LionWander[] = []
  let reduceMotionNow = shell.settings.reduceMotion
  if (new URLSearchParams(location.search).get('model') !== 'primitive') {
    // 姿勢の補正の強さ。アレックス（体が大きく腰が落ちやすい）だけ強め
    const posture: Record<string, PostureFix> = { alex: { hind: 0.9, spine: 1.0, tail: 0.5, front: 0.7, ground: true } }
    // 歩き方: 成獣はゆったり、仔はせわしなく。たてがみの雄はいちばんゆっくり
    const walk: Record<string, { speed: number; radius: number; idle: [number, number] }> = {
      alex: { speed: 0.7, radius: 3.0, idle: [9, 18] },
      angie: { speed: 0.8, radius: 3.0, idle: [7, 15] },
      riley: { speed: 0.8, radius: 3.2, idle: [7, 15] },
      claire: { speed: 0.75, radius: 3.5, idle: [4, 10] },
      carla: { speed: 0.75, radius: 3.5, idle: [4, 10] },
    }
    for (const id of Object.keys(walk)) {
      const lion = lions.find((l) => l.id === id)
      if (!lion) continue
      // 大きさはプリミティブ版に合わせる: 群れの中での体の長さ（頭から尾の先、群れの座標）をそろえる
      loadAiLion(`/models/lion-${id}.glb`, { length: primitiveLength(lion.group), posture: posture[id] ?? POSTURE_DEFAULT })
        .then((ai) => {
          lion.swapModel(ai.model, ai.parts)
          lion.headHeight = ai.headHeight
          aiLions[id] = ai
          const w = createLionWander(lion, ai, props.colliders, walk[id])
          w.setReduceMotion(reduceMotionNow)
          wanderers.push(w)
        })
        .catch((err) => console.warn('[lion-ai] model not loaded; keeping primitive', id, err))
    }
  }

  // カラーグレーディング（1パス）。スマホでは最初から切る
  const postfx = createPostFx(renderer, scene, camera)
  postfx.setEnabled(!mobile)
  const applyPostSize = () => {
    const dpr = renderer.getPixelRatio()
    postfx.setSize(window.innerWidth, window.innerHeight, dpr)
  }
  applyPostSize()
  window.addEventListener('resize', applyPostSize)

  const player = createPlayer(camera, terrain, canvas, scene, props.colliders)
  scene.add(player.object)
  let walkX = player.object.position.x
  let walkZ = player.object.position.z

  // プレイヤーの姿は Meshy で生成した主人公が既定（操作はそのまま）。?hero=off でいままでの姿。
  // 高さはいままでの姿（入れ物の最初の子、2.03m）の 0.59 倍（1.20m）を既定にする。読めなければいままでの姿のまま続ける。
  // 比べる用: &heroSep=off で接地影と輪郭なし、&heroScale=1 でいままでの姿と同じ高さ（ほかの数でも掛けられる）
  const HERO_SCALE = 0.59
  let hero: HeroModel | null = null
  const heroPrev = new THREE.Vector3()
  let heroSpeed = 0
  const heroQuery = new URLSearchParams(location.search)
  if (heroQuery.get('hero') !== 'off') {
    const figure = player.object.children[0]
    const figureHeight = new THREE.Box3().setFromObject(figure).getSize(new THREE.Vector3()).y
    const heroScale = Number(heroQuery.get('heroScale') ?? HERO_SCALE) || HERO_SCALE
    loadHero('/models/hero-boy.glb', { height: figureHeight * heroScale, separation: heroQuery.get('heroSep') !== 'off', ground: terrainHeight })
      .then((loaded) => {
        figure.visible = false
        player.object.add(loaded.root)
        if (loaded.shadow) scene.add(loaded.shadow)
        heroPrev.copy(player.object.position)
        hero = loaded
      })
      .catch((err) => console.warn('hero model not loaded; keeping primitive', err))
  }

  hud.onJump(() => player.jump())

  // 左下の半透明スティック（スマホ）。細かい移動用。タップ移動と併用できる。?stick=1 で PC でも出す
  const joystick = createJoystick()
  joystick.onChange((x, z) => player.setStick(x, z))
  if (mobile || new URLSearchParams(location.search).get('stick') === '1') joystick.show()

  // 「観察スポットへ」: 南の登り口を経由して台地の頂上へ
  // 着いている時は同じボタンが「スコープをのぞく」になる
  hud.onGoToSpot(() => {
    if (arrived) void openScope()
    else player.goTo(here.route)
  })

  // 出会い: そばにいるライオンの頭の上に「双眼鏡 + 名前」のピン。タップでその個体の観察モニター
  const labels = createWorldLabels()
  const nameOf = (id: string) => {
    const a = getAnimal(id)
    return a ? animalName(a) : id
  }
  for (const lion of lions) labels.add(lion.id, nameOf(lion.id))
  onLangChange(() => {
    for (const lion of lions) labels.rename(lion.id, nameOf(lion.id))
  })
  const encounterIcon = createEncounterIcon()
  let encounterId: string | null = null
  encounterIcon.onTap(() => {
    const animal = getAnimal(encounterId ?? SPOT.animalId)
    if (!animal) return
    met.mark(animal.id)
    observe.open(animal, 'world')
    guideWatched(animal)
  })

  // 広げた全体地図（ミニマップの「地図を広げる」から開く）
  const mapView = createMapView()

  // 何かの画面が開いている間は、ワールドのタップとキーを止め、「ホームへ」も重ねない
  let paused = startPaused
  // アニマルスコープの一覧を見ている間は true。描画も止める（canvas は最後の絵のまま一覧の下に隠れる）
  let viewing = false
  const syncInput = () => {
    const blocked = observe.isOpen() || book.isOpen() || mapView.isOpen() || catalog.isOpen()
    player.setInputEnabled(!blocked && !paused)
    joystick.setEnabled(!blocked && !paused)
    hud.setOverlayOpen(blocked)
    if (!blocked && !paused) canvas.focus()
  }
  observe.onOpenChange(syncInput)
  book.onOpenChange(syncInput)
  syncInput()

  // 観察スポットに立つ → スコープをのぞく演出 → アニマルスコープ（動画一覧）
  const body = document.body
  let unscopeTimer = 0
  const openScope = async () => {
    if (viewing || paused || observe.isOpen() || book.isOpen() || mapView.isOpen()) return
    viewing = true
    player.goTo([])
    window.clearTimeout(unscopeTimer)
    body.classList.remove('is-unscoping')
    const animate = !body.classList.contains('is-reduce-motion')
    if (animate) body.classList.add('is-scoping')
    // どのワールドのスポットからでも、同じアニマルスコープ（段の一覧）を開く
    catalog.open(animate)
    if (animate) {
      const { skipped } = await scope.play()
      if (skipped) catalog.settle()
    }
    body.classList.remove('is-scoping')
    if (catalog.isOpen()) body.classList.add('is-viewing')
  }
  catalog.onOpenChange((open) => {
    syncInput()
    if (open) return
    // 一覧を閉じた: 世界がぼけた寄りから戻ってくる。HUD もふわっと戻る
    viewing = false
    clock.getDelta()
    body.classList.remove('is-viewing', 'is-scoping')
    if (!body.classList.contains('is-reduce-motion')) {
      body.classList.add('is-unscoping')
      unscopeTimer = window.setTimeout(() => body.classList.remove('is-unscoping'), 650)
    }
  })

  // 左上のミニマップ。タップした場所へ歩く（画面が開いている間は無効）。「地図を広げる」で全体地図
  const minimap = createMinimap()
  // 地図のタップ: ワールドをまたぐ時は峠を通って歩く（北とジャングルのように直接つながっていないワールドもある）
  const walkTo = (x: number, z: number) => player.goTo(routeTo(player.object.position, { x, z }))
  minimap.onPick((x, z) => {
    if (observe.isOpen() || book.isOpen() || mapView.isOpen()) return
    walkTo(x, z)
  })
  minimap.onExpand(() => {
    if (observe.isOpen() || book.isOpen()) return
    mapView.open()
  })
  mapView.onPick(walkTo)
  mapView.onOpenChange(() => syncInput())
  minimap.show()
  let minimapTimer = 0

  const applyReduceMotion = (on: boolean) => {
    player.setReduceMotion(on)
    props.setSway(on ? 0 : 1)
    atmosphere.setReduceMotion(on)
    lions.forEach((l) => l.setReduceMotion(on))
    reduceMotionNow = on
    wanderers.forEach((w) => w.setReduceMotion(on))
    encounterIcon.setReduceMotion(on)
    fauna.setReduceMotion(on)
    clouds.setReduceMotion(on)
    weather.setReduceMotion(on)
  }
  // 設定はホームで変える。ワールドは止まっているだけなので、戻った時には反映済み
  applyReduceMotion(shell.settings.reduceMotion)
  shell.settings.onReduceMotionChange(applyReduceMotion)
  hud.show()

  // ピンを画面の端に寄せる時の余白。下は HUD（スティック・ジャンプ・観察スポットへ）の上端から測る
  const stickEl = document.getElementById('stick')
  const jumpEl = document.getElementById('jump')
  const spotBtnEl = document.getElementById('goto-spot')
  const safe = { top: 72, bottom: 190 }
  const measureSafe = () => {
    let reserve = 0
    for (const el of [stickEl, jumpEl, spotBtnEl]) {
      if (!el || el.hidden) continue
      const r = el.getBoundingClientRect()
      // スマホでは観察スポットへが地図の下（上側）にあるので、下の余白には数えない
      if (r.height === 0 || r.top < window.innerHeight / 2) continue
      reserve = Math.max(reserve, window.innerHeight - r.top)
    }
    safe.bottom = Math.min(window.innerHeight * 0.45, reserve + 12)
    safe.top = 72
  }
  measureSafe()
  window.addEventListener('resize', measureSafe)

  const spotHead = spot.position.clone().add(new THREE.Vector3(0, 2.2, 0))
  // いるワールドが変わったら、スポット・案内・霧の色を切り替える
  const fogColor = (scene.fog as THREE.Fog).color
  const FOG_TINT: Record<RegionKey, THREE.Color> = {
    // サバンナはトップの絵に寄せて、地平線の空に近い澄んだ水色へ
    africa: new THREE.Color('#a6cff0'),
    // 北は雪明かりの白、ジャングルは湿った淡い緑、南半球はベージュをやめて空に近い薄い色（遠くが茶色くにごらない）
    north: new THREE.Color('#dfeaf6'),
    jungle: new THREE.Color('#d6eadb'),
    south: new THREE.Color('#dcd6d2'),
  }
  // 明るさもワールドごと。サバンナは明るく、照り返しを紫から乾いた草の色へ（影が濁らない）。
  // さらにトップの絵に寄せて、日なたと影の差をはっきり（日差しを強く、照り返しを弱く）、空を深い青に、霞を遠くへ。
  // ほかのワールドはいままでの値のまま
  const baseExposure = renderer.toneMappingExposure
  const skyU = (sky.material as THREE.ShaderMaterial).uniforms as {
    uTop: { value: THREE.Color }
    uHorizon: { value: THREE.Color }
    uGlow: { value: THREE.Color }
    uSunDir: { value: THREE.Vector3 }
    uDisc: { value: number }
    uHalo: { value: number }
  }
  const fog = scene.fog as THREE.Fog
  interface Light {
    exposure: number
    sky: THREE.Color
    ground: THREE.Color
    intensity: number
    sun: number
    top: THREE.Color
    horizon: THREE.Color
    near: number
    far: number
    /** PC の色補正（スマホは色補正なし）。サバンナは素の色を鮮やかにしたので、重ねすぎないよう弱める */
    gradeSat: number
    gradeContrast: number
    /**
     * 空に描く太陽。方角は光（南西）と同じで、仰角だけ低く置く。
     * 光の仰角（38度）のままだと、ふつうのカメラ（画面の上端は水平から約11度。いちばん見上げても約50度）では振り返っても見えないため。
     * ふつうの俯角では円盤は入らず、少し見上げると入る
     * 影の向きは光のままなので、太陽と反対側に伸びる関係は保たれる
     */
    sunElev: number
    sunGlow: THREE.Color
    /** 円盤の見込み半径（度） */
    sunDisc: number
    /** まわりの光の輪の強さ */
    sunHalo: number
  }
  const baseLight = (): Light => ({
    exposure: baseExposure,
    sky: hemi.color.clone(),
    ground: hemi.groundColor.clone(),
    intensity: hemi.intensity,
    sun: sun.intensity,
    top: skyU.uTop.value.clone(),
    horizon: skyU.uHorizon.value.clone(),
    near: fog.near,
    far: fog.far,
    gradeSat: postfx.grade.saturation,
    gradeContrast: postfx.grade.contrast,
    sunElev: 20,
    sunGlow: skyU.uGlow.value.clone(),
    sunDisc: 4,
    sunHalo: 1,
  })
  const LIGHT: Record<RegionKey, Light> = {
    africa: {
      exposure: 0.95,
      sky: new THREE.Color('#c4dcff'),
      ground: new THREE.Color('#c4a26a'),
      intensity: 0.64,
      sun: 2.3,
      top: new THREE.Color('#0a4cd4'),
      horizon: new THREE.Color('#5ea6ee'),
      near: 130,
      far: 520,
      gradeSat: 1.04,
      gradeContrast: 1.06,
      // サバンナ: 大きく暖かい太陽
      sunElev: 20,
      sunGlow: new THREE.Color('#fff4d0'),
      sunDisc: 4.2,
      sunHalo: 1.3,
    },
    // 北の世界: 深い青空と白い雪明かり。照り返しは雪の青白、影は青く。低く白い冬の太陽（輪は弱い）
    north: {
      exposure: 0.95,
      sky: new THREE.Color('#d2e6ff'),
      ground: new THREE.Color('#bccfe4'),
      intensity: 0.72,
      sun: 2.2,
      top: new THREE.Color('#1b5fd8'),
      horizon: new THREE.Color('#8ac4f2'),
      near: 120,
      far: 470,
      gradeSat: 1.08,
      gradeContrast: 1.06,
      sunElev: 13,
      sunGlow: new THREE.Color('#f7f3ec'),
      sunDisc: 3.2,
      sunHalo: 0.7,
    },
    // ジャングル: 深い青空、照り返しは若葉の緑（紫の影が草をにごらせない）。霧は近いまま淡い緑で湿った空気。高めの太陽ににじむ広い輪
    jungle: {
      exposure: 0.96,
      sky: new THREE.Color('#c6e2ff'),
      ground: new THREE.Color('#7cab4e'),
      intensity: 0.7,
      sun: 2.25,
      top: new THREE.Color('#1a5bd6'),
      horizon: new THREE.Color('#8ecaf0'),
      near: 90,
      far: 420,
      gradeSat: 1.1,
      gradeContrast: 1.06,
      sunElev: 26,
      sunGlow: new THREE.Color('#fbf3d6'),
      sunDisc: 3.4,
      sunHalo: 1.7,
    },
    // 南半球: いちばん深い青空と遠くまで澄んだ空気、照り返しは赤土。少し低く、オレンジがかった大きな太陽
    south: {
      exposure: 0.96,
      sky: new THREE.Color('#c8dcff'),
      ground: new THREE.Color('#cf8e58'),
      intensity: 0.66,
      sun: 2.3,
      top: new THREE.Color('#0f52d4'),
      horizon: new THREE.Color('#7cbcf0'),
      near: 120,
      far: 500,
      gradeSat: 1.06,
      gradeContrast: 1.06,
      sunElev: 18,
      sunGlow: new THREE.Color('#ffdca6'),
      sunDisc: 4.6,
      sunHalo: 1.2,
    },
  }
  const lightTarget: Light = { ...baseLight() }
  // 空の太陽の仰角と大きさ（度）。ワールドの重みで目標が変わり、ほかの光と同じ速さで寄せる
  let sunElev = lightTarget.sunElev
  let sunDisc = lightTarget.sunDisc
  const weights: BiomeWeights = { africa: 1, north: 0, jungle: 0, south: 0 }
  const fogTarget = new THREE.Color()
  // 入った時から明るく（最初に目標を出した時に、そこまで合わせる）
  let lightReady = false
  let lightSnap = false
  const regionName = (key: RegionKey) => {
    if (key === 'africa') return t('catSavanna')
    const w = getWorld(key)
    return w ? w.name[getLang()] : key
  }
  const projected = new THREE.Vector3()
  let arrived = false

  // 出会いの対象の切り替えに間を置く（家族が固まっている場所でピンが飛び回らないように）
  let candidateId: string | null = null
  let candidateSince = 0
  const SWITCH_MARGIN = 0.8
  const SWITCH_DELAY = 0.5

  // 影のカメラはプレイヤーについていく
  const sunOffset = sun.position.clone()

  const clock = new THREE.Clock()
  let fpsAcc = 0
  let fpsFrames = 0
  let slowSeconds = 0
  let frames = 0
  let currentDpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2)

  // 止めたまま作った時に描く枚数（後処理のシェーダーもここで用意される）
  let warmFrames = startPaused ? 2 : 0
  const tick = () => {
    if (paused || viewing) {
      if (warmFrames > 0) {
        warmFrames--
        postfx.render()
      }
      requestAnimationFrame(tick)
      return
    }
    const dt = Math.min(clock.getDelta(), 0.05)
    const time = clock.elapsedTime
    frames++
    if (frames % 60 === 0) measureSafe()

    player.update(dt)
    // あそび方ナビ「歩く」: タップ移動・スティック・キー・スポットへの自動歩行のどれでも、少し歩いたら済み
    if (guide.isActive()) {
      guide.walk(Math.hypot(player.object.position.x - walkX, player.object.position.z - walkZ))
      // すでに札が出ている子のそばで始めた時は「そば」の段は済み
      if (encounterId !== null) guide.reach('near')
    }
    walkX = player.object.position.x
    walkZ = player.object.position.z
    if (hero) {
      // 入れ物が 1 コマで動いた量から、速さと空中かどうかを出してアニメを選ぶ（瞬間移動の時は速さ 0）
      const p = player.object.position
      const moved = Math.hypot(p.x - heroPrev.x, p.z - heroPrev.z)
      const speed = dt > 0 && moved < 2 ? moved / dt : 0
      heroSpeed += (speed - heroSpeed) * Math.min(1, dt * 12)
      heroPrev.copy(p)
      hero.update(dt, heroSpeed, Math.max(0, p.y - terrainHeight(p.x, p.z)))
    }
    props.update(time)
    atmosphere.update(time, dt, camera.position)
    clouds.update(dt)
    weather.update(time, dt, camera.position, weights)
    fauna.update(time, dt)
    lions.forEach((l) => l.update(time, dt, player.object.position))
    // 生成モデルの群れ: 少し歩いては立ち止まる → 歩行の再生・姿勢の補正・生活感レイヤーを骨に写す
    for (const w of wanderers) w.update(dt, time, player.object.position)
    for (const ai of Object.values(aiLions)) ai.tick(dt)

    // いまいるワールド。変わったらスポットを切り替え、名前を知らせる（サバンナに戻った時も）
    const px = player.object.position.x
    const pz = player.object.position.z
    const regionKey = regionAt(px, pz)
    if (regionKey !== here.key) {
      here = worldSpots.find((w) => w.key === regionKey) ?? worldSpots[0]
      spot = here.spot
      spotHead.copy(spot.position).add(new THREE.Vector3(0, 2.2, 0))
      arrived = false
      hud.toast(t('enterRegion', { world: regionName(regionKey) }), 'bino')
    }
    if (frames % 8 === 0 || !lightReady) {
      if (!lightReady) lightSnap = true
      lightReady = true
      biomeAt(px, pz, weights)
      fogTarget.setRGB(0, 0, 0)
      lightTarget.exposure = 0
      lightTarget.intensity = 0
      lightTarget.sun = 0
      lightTarget.near = 0
      lightTarget.far = 0
      lightTarget.gradeSat = 0
      lightTarget.gradeContrast = 0
      lightTarget.sunElev = 0
      lightTarget.sunDisc = 0
      lightTarget.sunHalo = 0
      lightTarget.sunGlow.setRGB(0, 0, 0)
      lightTarget.sky.setRGB(0, 0, 0)
      lightTarget.ground.setRGB(0, 0, 0)
      lightTarget.top.setRGB(0, 0, 0)
      lightTarget.horizon.setRGB(0, 0, 0)
      for (const k of ['africa', 'north', 'jungle', 'south'] as const) {
        const wk = weights[k]
        fogTarget.r += FOG_TINT[k].r * wk
        fogTarget.g += FOG_TINT[k].g * wk
        fogTarget.b += FOG_TINT[k].b * wk
        const L = LIGHT[k]
        lightTarget.exposure += L.exposure * wk
        lightTarget.intensity += L.intensity * wk
        lightTarget.sky.r += L.sky.r * wk
        lightTarget.sky.g += L.sky.g * wk
        lightTarget.sky.b += L.sky.b * wk
        lightTarget.ground.r += L.ground.r * wk
        lightTarget.ground.g += L.ground.g * wk
        lightTarget.ground.b += L.ground.b * wk
        lightTarget.sun += L.sun * wk
        lightTarget.near += L.near * wk
        lightTarget.far += L.far * wk
        lightTarget.gradeSat += L.gradeSat * wk
        lightTarget.gradeContrast += L.gradeContrast * wk
        lightTarget.sunElev += L.sunElev * wk
        lightTarget.sunDisc += L.sunDisc * wk
        lightTarget.sunHalo += L.sunHalo * wk
        lightTarget.sunGlow.r += L.sunGlow.r * wk
        lightTarget.sunGlow.g += L.sunGlow.g * wk
        lightTarget.sunGlow.b += L.sunGlow.b * wk
        lightTarget.top.r += L.top.r * wk
        lightTarget.top.g += L.top.g * wk
        lightTarget.top.b += L.top.b * wk
        lightTarget.horizon.r += L.horizon.r * wk
        lightTarget.horizon.g += L.horizon.g * wk
        lightTarget.horizon.b += L.horizon.b * wk
      }
    }
    fogColor.lerp(fogTarget, Math.min(1, dt * 2))
    const lk = lightSnap ? 1 : Math.min(1, dt * 2)
    lightSnap = false
    renderer.toneMappingExposure += (lightTarget.exposure - renderer.toneMappingExposure) * lk
    hemi.intensity += (lightTarget.intensity - hemi.intensity) * lk
    hemi.color.lerp(lightTarget.sky, lk)
    hemi.groundColor.lerp(lightTarget.ground, lk)
    sun.intensity += (lightTarget.sun - sun.intensity) * lk
    fog.near += (lightTarget.near - fog.near) * lk
    fog.far += (lightTarget.far - fog.far) * lk
    postfx.grade.saturation += (lightTarget.gradeSat - postfx.grade.saturation) * lk
    postfx.grade.contrast += (lightTarget.gradeContrast - postfx.grade.contrast) * lk
    // サバンナだけクレイアニメ（粘土）の見た目。峠でほかのワールドの見た目へ溶ける
    setClay(getClay() + (weights.africa - getClay()) * lk)
    skyU.uTop.value.lerp(lightTarget.top, lk)
    skyU.uHorizon.value.lerp(lightTarget.horizon, lk)
    skyU.uGlow.value.lerp(lightTarget.sunGlow, lk)
    sunElev += (lightTarget.sunElev - sunElev) * lk
    sunDisc += (lightTarget.sunDisc - sunDisc) * lk
    sunDiscDir(sunElev, skyU.uSunDir.value)
    skyU.uDisc.value = Math.cos((sunDisc * Math.PI) / 180)
    skyU.uHalo.value += (lightTarget.sunHalo - skyU.uHalo.value) * lk
    for (const w of worldSpots) if (w !== here) w.spot.update(time, 999)

    // 観察スポットとの距離。着いたら「観察スポットへ」を隠す
    const distance = Math.hypot(player.object.position.x - spot.position.x, player.object.position.z - spot.position.z)
    spot.update(time, distance)
    arrived = distance < SPOT.arriveRadius
    // 着いたらボタンが「スコープをのぞく」に変わる。のぞくのは押した時だけ（勝手には開かない）
    hud.setSpotMode(arrived ? 'scope' : player.isAutoWalking() ? 'hidden' : 'go')

    // 出会い: そばにいる個体を決める。切り替えは「はっきり近い状態が少し続いたら」
    let closest: { id: string; d: number } | null = null
    // いま出会っている個体の距離と届く範囲（範囲外なら null）
    let currentD: number | null = null
    const heads = new Map<string, { x: number; y: number; d: number }>()
    for (const lion of lions) {
      const d = Math.hypot(player.object.position.x - lion.position.x, player.object.position.z - lion.position.z)
      const reach = lion.collider.r + 4.2
      if (lion.id === encounterId && d < reach) currentD = d
      if (d < reach && (!closest || d < closest.d)) closest = { id: lion.id, d }
      // 伏せたライオンの頭のあたり
      projected.copy(lion.position).setY(lion.position.y + (lion.headHeight ?? 0.95) * lion.group.scale.y + 0.1).project(camera)
      const onScreen = projected.z < 1 && Math.abs(projected.x) < 1.1 && Math.abs(projected.y) < 1.1
      if (onScreen && d < 45) {
        heads.set(lion.id, {
          x: ((projected.x + 1) / 2) * window.innerWidth,
          y: ((1 - projected.y) / 2) * window.innerHeight,
          d,
        })
      }
    }
    let nextId = encounterId
    if (encounterId !== null && currentD !== null) {
      if (closest && closest.id !== encounterId && closest.d < currentD - SWITCH_MARGIN) {
        if (candidateId !== closest.id) {
          candidateId = closest.id
          candidateSince = time
        } else if (time - candidateSince >= SWITCH_DELAY) {
          nextId = closest.id
        }
      } else {
        candidateId = null
      }
    } else {
      nextId = closest ? closest.id : null
      candidateId = null
    }

    // ピン: 対象の頭の少し上。画面に入っていない時は端に寄せて、必ず押せるようにする
    const obstacles: Rect[] = []
    const labelEntries: LabelEntry[] = []
    if (nextId) {
      const lion = lions.find((l) => l.id === nextId)
      if (lion) {
        const scale = lion.group.scale.y
        projected.copy(lion.position).setY(lion.position.y + (lion.headHeight ?? 0.95) * scale + 0.1 + 0.45 * scale).project(camera)
        let sx = projected.x
        let sy = projected.y
        if (projected.z >= 1) {
          // カメラの後ろにいる時は射影が裏返るので戻す
          sx = -sx
          sy = -sy
        }
        const size = encounterIcon.size()
        const x = clamp(((sx + 1) / 2) * window.innerWidth, size.w / 2 + 12, window.innerWidth - size.w / 2 - 12)
        const y = clamp(((1 - sy) / 2) * window.innerHeight, safe.top + size.h, window.innerHeight - safe.bottom)
        encounterIcon.set({ x, y }, nameOf(nextId))
        obstacles.push({ l: x - size.w / 2, r: x + size.w / 2, t: y - size.h, b: y })
      }
    } else {
      encounterIcon.set(null)
    }
    for (const [id, head] of heads) {
      if (id === nextId) continue
      labelEntries.push({ id, x: head.x, y: head.y - 10, d: head.d })
    }
    labels.layout(labelEntries, obstacles)

    minimapTimer -= dt
    if (minimapTimer <= 0) {
      minimapTimer = 0.1
      const mapPlayer = { x: player.object.position.x, z: player.object.position.z, heading: player.object.rotation.y }
      // 地図は出会いの記録: 出会った個体だけ。ともだち帳に登録済みなら区別する
      const mapLions = lions
        .filter((l) => met.has(l.id))
        .map((l) => ({
          id: l.id,
          name: nameOf(l.id),
          x: l.position.x,
          z: l.position.z,
          active: nextId === l.id,
          friend: store.has(l.id),
        }))
      minimap.update(mapPlayer, mapLions)
      mapView.update(mapPlayer, mapLions)
    }
    if (nextId !== encounterId) {
      encounterId = nextId
      candidateId = null
      const lion = lions.find((l) => l.id === nextId)
      if (lion) {
        lion.notice(time)
        // 出会いの記録。地図に出るのはここから
        met.mark(lion.id)
        hud.toast(t('nearby', { name: nameOf(lion.id) }), 'bino')
        guide.reach('near')
      }
    }

    // スポットのラベルを画面に重ねる（カメラの後ろにある時は隠す）
    projected.copy(spotHead).project(camera)
    if (projected.z < 1 && Math.abs(projected.x) < 1.1 && Math.abs(projected.y) < 1.1 && !arrived) {
      hud.setSpotLabel(
        {
          x: ((projected.x + 1) / 2) * window.innerWidth,
          y: clamp(((1 - projected.y) / 2) * window.innerHeight, 64, window.innerHeight),
        },
        distance,
      )
    } else {
      hud.setSpotLabel(null, distance)
    }

    sun.target.position.copy(player.object.position)
    sun.position.copy(player.object.position).add(sunOffset)
    sky.position.copy(camera.position)

    postfx.render()

    // 簡易 FPS 計測と DPR の自動調整
    fpsAcc += dt
    fpsFrames++
    if (fpsAcc >= 1) {
      const fps = fpsFrames / fpsAcc
      hud.setFps(fps)
      // 画面が隠れている間はブラウザが描画を間引くので、見えている時だけ判定する
      if (fps < 28 && currentDpr <= 1 && postfx.enabled && document.visibilityState === 'visible') {
        postfx.setEnabled(false)
      }
      if (fps < 28 && currentDpr > 1 && document.visibilityState === 'visible') {
        slowSeconds++
        if (slowSeconds >= 3) {
          currentDpr = Math.max(1, currentDpr - 0.5)
          setDpr(currentDpr)
          applyPostSize()
          slowSeconds = 0
        }
      } else {
        slowSeconds = 0
      }
      fpsAcc = 0
      fpsFrames = 0
    }
    requestAnimationFrame(tick)
  }

  if (import.meta.env.DEV) {
    // 開発時だけ、ブラウザのコンソールから中身を覗けるようにする
    ;(window as unknown as { __awl: unknown }).__awl = {
      renderer,
      hemi,
      camera,
      sun,
      scene,
      spot,
      player,
      props,
      shell,
      lions,
      hero: () => hero,
      clouds,
      weather,
      weights,
      views: viewNames(),
      view: (name: Parameters<typeof applyView>[0]) => applyView(name, player),
      // 生成モデルの群れ（歩行の計測用: action を止めてコマ送り、posture を書き換え）
      aiLions: () => aiLions,
      // 描画直後に canvas を画像化する（判定用スクリーンショット）
      capture: (quality = 0.92) => {
        postfx.render()
        return canvas.toDataURL('image/jpeg', quality)
      },
    }
  }

  // 1フレーム描いてから幕を開ける（白画面を見せない）
  renderer.render(scene, camera)
  requestAnimationFrame(tick)

  return {
    pause: () => {
      paused = true
      player.setInputEnabled(false)
      joystick.setEnabled(false)
    },
    resume: () => {
      paused = false
      clock.getDelta()
      syncInput()
    },
    snapshot: () => {
      // レンズに映すだけなので小さく縮めてから画像にする（全解像度の toDataURL は重い）
      try {
        postfx.render()
        const small = document.createElement('canvas')
        const w = 480
        const h = Math.max(1, Math.round((w * canvas.height) / Math.max(1, canvas.width)))
        small.width = w
        small.height = h
        const ctx = small.getContext('2d')
        if (!ctx) return ''
        ctx.drawImage(canvas, 0, 0, w, h)
        return small.toDataURL('image/jpeg', 0.7)
      } catch {
        return ''
      }
    },
  }
}

function nextFrames(n: number): Promise<void> {
  return new Promise((resolve) => {
    const step = () => (--n <= 0 ? resolve() : requestAnimationFrame(step))
    requestAnimationFrame(step)
  })
}

function main(): void {
  applyStatic()
  const canvas = document.getElementById('world') as HTMLCanvasElement
  const shell = createShell()
  const webgl = hasWebGL(canvas)
  if (!webgl) {
    shell.home.showFallback()
    shell.book.setCanEnterWorld(false)
  }

  let world: WorldHandle | null = null
  let busy = false

  // ホーム → 幕が双眼鏡の形に閉じる → ワールド → 幕が開く
  const enterWorld = async () => {
    if (busy || !webgl) return
    busy = true
    try {
      if (shell.story.shouldShow()) await shell.story.play()
      await shell.iris.close()
      // 裏での準備が間に合っていなければ、幕に「じゅんびちゅう」を出してから組み立てる
      shell.iris.setWaiting(true)
      if (!world) {
        await nextFrames(2)
        world = startWorld(canvas, shell)
      } else world.resume()
      shell.home.hide()
      document.body.classList.add('in-world')
      canvas.focus()
      await shell.iris.open()
      // 初めての人には、幕が開いてからあそび方ナビを出す
      shell.guide.autoStart(shell.store.list().length > 0)
      shell.guide.setInWorld(true)
    } catch (err) {
      console.error(err)
      shell.home.show()
      document.body.classList.remove('in-world')
      shell.home.showFallback()
      await shell.iris.open()
    } finally {
      shell.iris.setWaiting(false)
      busy = false
    }
  }

  // ワールド → 幕が閉じる → ホーム → 幕が開く
  const goHome = async () => {
    if (busy || !world) return
    busy = true
    await shell.iris.close()
    shell.guide.setInWorld(false)
    world.pause()
    shell.home.show()
    document.body.classList.remove('in-world')
    await shell.iris.open()
    busy = false
  }

  shell.home.onEnter(() => {
    void enterWorld()
  })

  // ホームが表示されて落ち着いたら、裏でワールドを組み立てておく（ホームの絵が不透明で隠している）。
  // 失敗しても world は null のままにして、「のぞいてみる」の時にもう一度試し、だめなら案内を出す
  const prewarm = () => {
    if (world || busy || !webgl || !shell.home.isOpen()) return
    try {
      world = startWorld(canvas, shell, true)
    } catch (err) {
      console.warn('world prewarm failed', err)
      world = null
    }
  }
  const idle = (window as unknown as { requestIdleCallback?: (fn: () => void, o?: { timeout: number }) => void }).requestIdleCallback
  window.setTimeout(() => {
    if (idle) idle(prewarm, { timeout: 1500 })
    else prewarm()
  }, 1200)
  // 帳の出口: ワールドからならそのまま閉じて戻る。ホームからなら閉じてワールドへ入る
  shell.book.onGoWorld((from) => {
    shell.book.close()
    if (from === 'home') void enterWorld()
  })
  shell.hud.onGoHome(() => {
    void goHome()
  })
  // 設定の「あそび方をもう一度見る」: ナビを最初に戻してワールドへ
  shell.settings.onReplayGuide(() => {
    shell.guide.start()
    void enterWorld()
  })
}

main()

/** プリミティブ版の体の長さ（群れの座標系の z 方向、頭から尾の先まで）。生成モデルの大きさをこれにそろえる */
function primitiveLength(group: THREE.Object3D): number {
  group.updateMatrixWorld(true)
  const inv = group.matrixWorld.clone().invert()
  const box = new THREE.Box3()
  const m = new THREE.Matrix4()
  group.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox()
    box.union(mesh.geometry.boundingBox!.clone().applyMatrix4(m.multiplyMatrices(inv, mesh.matrixWorld)))
  })
  return box.getSize(new THREE.Vector3()).z
}
