import * as THREE from 'three'
import { createScene, sunDiscDir } from './world/scene'
import { createTerrain, terrainHeight } from './world/terrain'
import { NO_REFLECT_LAYER, createProps } from './world/props'
import { createBiomeProps } from './world/biomes'
import { createSea } from './world/sea'
import { createResidents, residentPlace } from './world/residents'
import { OUTER_REGIONS, REGIONS, REGION_KEYS, biomeAt, emptyWeights, regionAt, routeTo } from './world/regions'
import type { BiomeWeights, RegionKey } from './world/regions'
import { getWorld } from './data/worlds'
import { createPlayer } from './player/controller'
import { loadHero } from './player/heroModel'
import { DEFAULT_HERO, getHeroId, heroById, setHeroId } from './data/heroes'
import type { HeroModel } from './player/heroModel'
import { createHud } from './ui/hud'
import { createObservationSpot } from './world/spots'
import { createAtmosphere } from './world/atmosphere'
import { createClouds } from './world/clouds'
import { createWeather } from './world/weather'
import { createPostFx } from './render/postfx'
import { getClay, setClay, vividToon } from './render/toon'
import { LIONS, SAVANNA_HYENA, SAVANNA_MEERKAT, SAVANNA_ZEBRA, SPAWN, SPOT } from './world/layout'
import { createLion } from './world/lions'
import { loadLionModel } from './world/lionModel'
import { loadAiLion, POSTURE_DEFAULT, type AiLion, type PostureFix } from './world/aiLionModel'
import { roamFor } from './data/roam'
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
import { hideSplash } from './ui/splash'
import { createIris } from './ui/iris'
import { REGION_AMB, REGION_BGM, sound } from './audio/sound'
import { createSettings } from './ui/settings'
import { createGuide } from './ui/guide'
import { createCatalog } from './ui/catalog'
import { createScope } from './ui/scope'
import { animalName, applyStatic, getLang, onLangChange, speciesName, t, tIn } from './ui/i18n'
import type { Lang } from './ui/i18n'
import { createRegionTitle } from './ui/regionTitle'
import { createFauna } from './world/fauna'
import { createFriendBookStore } from './data/friends'
import { createEncounterStore } from './data/encounters'
import { ANIMALS, getAnimal, type Animal } from './data/animals'
import { applyView, viewNames } from './debug/views'
import { createSoundPanel } from './ui/soundControls'
import { createStaminaUi } from './ui/stamina'

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
  // HUD の音のボタン（双眼鏡の右）と、押すと開く BGM・まわりの音・効果音の板
  createSoundPanel()
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
  // あそびかたツアーの節目（開く・閉じる）
  observe.onOpenChange((open) => guide.reach(open ? 'observeOpen' : 'observeClose'))
  book.onOpenChange((open) => {
    if (!open) guide.reach('bookClose')
  })
  book.onChatOpen(() => guide.reach('chat'))
  observe.onOpenChange((open) => document.body.classList.toggle('observe-open', open))
  book.onOpenChange((open) => {
    document.body.classList.toggle('book-open', open)
    if (open) guide.reach('book')
    // ともだち帳を開いている間は「ふれあい・パートナー」の曲。閉じたら開く前の曲へ戻る
    if (open) sound.play('book')
    sound.setBgmOverride(open ? 'partner' : null)
  })
  // 収録映像を見ている間は BGM と環境音を下げる
  observe.onOpenChange((open) => sound.setDuck(open))
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
    story.setReduceMotion(on)
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
  /** 入る演出の準備（幕が開く前に呼ぶ）。最初の絵からモザイクと主人公の寄りにしておく */
  prepareIntro: () => void
  /** 入る演出を始める（幕が開いたら呼ぶ）。終わったら解決する */
  playIntro: () => Promise<void>
  /** ホームで選んだ主人公に替える（読み込めたら差し替え、だめなら既定の子 → いままでの姿） */
  setHero: (id: string) => void
  /** いま読み込み中の主人公が出そろうまで（読み込んでいなければすぐ）。幕を開ける前に待つ */
  heroReady: () => Promise<void>
  /** スタート地点（サバンナの南、コピエの方を向く）へ戻す。あそびかたツアーを設定から見返す時に使う */
  toStart: () => void
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
  // サバンナから峠を抜けた先の 5 つのワールドの木や岩
  scene.add(createBiomeProps({ mobile, colliders: props.colliders }).group)
  // 水の世界の海（潟と小川も）
  const sea = createSea()
  scene.add(sea.mesh)

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
  const lions = [...LIONS.map((l) => createLion(l)), ...createResidents(props.colliders)]
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
    // 歩き方は data/roam.ts（種ごとの範囲と、仔・雄の違い）
    for (const id of ['alex', 'angie', 'riley', 'claire', 'carla']) {
      const lion = lions.find((l) => l.id === id)
      if (!lion) continue
      // 大きさはプリミティブ版に合わせる: 群れの中での体の長さ（頭から尾の先、群れの座標）をそろえる
      loadAiLion(`/models/lion-${id}.glb`, { length: primitiveLength(lion.group), posture: posture[id] ?? POSTURE_DEFAULT })
        .then((ai) => {
          lion.swapModel(ai.model, ai.parts)
          lion.headHeight = ai.headHeight
          aiLions[id] = ai
          const w = createLionWander(lion, ai, props.colliders, roamFor('ライオン', id))
          w.setReduceMotion(reduceMotionNow)
          wanderers.push(w)
        })
        .catch((err) => console.warn('[lion-ai] model not loaded; keeping primitive', id, err))
    }
  }
  // ほかのワールドの子の生成モデル（ライオンと同じ作り方: 写真を参照したクレイ版の絵 → Meshy → 四足リグ＋歩行）。
  // 既定は生成モデル。?model=primitive（全部）か、種ごとの ?tiger=primitive・?capybara=primitive でプリミティブ版（伏せ）に戻して見比べられる。
  // place のある子は、モデルが読めた時だけ place の場所に置く。プリミティブ版の無い子（グラン）は読めなければ居ないまま（?zebra=off でも置かない）。
  // 群れの場所に自動で置いたプリミティブ版がいる子（銀牙・ピーター・ゆめこ・虎・テル）は、読めればそれと入れ替え、読めなければ・?<key>=primitive ならプリミティブ版のまま
  {
    const q = new URLSearchParams(location.search)
    const AI_RESIDENTS: {
      key: string
      species: string
      name: string
      file: string
      posture: PostureFix
      /** 尾の無い子: 止まっている間の尾の揺れ（生活感レイヤー）も骨に写さない */
      noTail?: boolean
      /** プリミティブ版が無い子の置き場所（体の長さ m は群れの座標。ライオンの成獣は 2.9） */
      place?: { x: number; z: number; yaw: number; length: number }
      /** 直立の子（ヒューマノイドのリグ）: 向きは書き出しのまま、大きさはプリミティブ版の高さに合わせる */
      upright?: boolean
      /** 歩かない子: 歩き回りを付けず、その場で呼吸・首・揺れだけ */
      still?: boolean
      /** 色の明るさ（1 で書き出しのまま）。?<key>Bright=<数> で試せる */
      brighten?: number
      /** 群れのプリミティブ版の差し替え口が無い子（wildfolk など）: その子の今の場所・向き・体の長さで place と同じように入れ替える */
      replaceHost?: boolean
    }[] = [
      // ティガー: 接地を入れると腰が立ち姿の 83〜93% に落ちる忍び足。アレックス並みに強く寄せる（後ろ脚 0.95・背骨 0.85・尾 0.5・前脚 0.7）
      { key: 'tiger', species: 'ベンガルトラ', name: 'ティガー', file: 'tiger-tigger', posture: { hind: 0.95, spine: 0.85, tail: 0.5, front: 0.7, ground: true } },
      // しずか: 南半球の西のカピバラ 2 頭のうち中心から遠い方（近い方のマロは夜間バッチの生成モデル）。
      // 写真参照で作り直したモデル（11/6）。接地だけだと腰 84〜87%。前の版の強さ（後ろ脚 0.6・背骨 0.9・前脚 0.9）だと腰の下限が 98.4% なので、
      // 後ろ脚 0.7・背骨 0.98 に上げる（前脚 0.9 はそのまま。腰 99.1〜100.7%）。
      // 尾は無い子なので、リグが付けた尾の骨（お尻の毛に付いている）は歩行でも止まっている間も動かさない
      { key: 'capybara', species: 'カピバラ', name: 'しずか', file: 'capybara-shizuka', posture: { hind: 0.7, spine: 0.98, tail: 1, front: 0.9, ground: true }, noTail: true },
      // グラン: サバンナの西、スタートからスポットへ向かう道の左手の草原。体の長さはアンジーの 1.15 倍（実物の比）。
      // 接地だけだと腰が 85〜90% の忍び足。ティガーと同じ強さで寄せる
      { key: 'zebra', species: 'グラントシマウマ', name: 'グラン', file: 'zebra-gran', posture: { hind: 0.95, spine: 0.85, tail: 0.5, front: 0.7, ground: true }, place: { ...SAVANNA_ZEBRA, length: 3.3 } },
      // フェン: 北の世界の中心の北のホッキョクオオカミ 3 頭のうち、いちばん東の子（ネガ・マリはプリミティブ版のまま）。大きさはプリミティブ版の体の長さにそろえる。
      // 接地だけだと腰 86〜100% で前足が浮く。後ろ脚 0.9・背骨 0.95・尾 0.5・前脚 0.85 で腰 99.3〜103.3%（フェンで測って決めた値）
      { key: 'wolf', species: 'ホッキョクオオカミ', name: 'フェン', file: 'wolf-fen', posture: { hind: 0.9, spine: 0.95, tail: 0.5, front: 0.85, ground: true } },
      // 銀牙: 北の世界の中心の南西、サバンナから来た人が最初に見る雪原（キツネの東 15 m。名簿の全個体を置いた後、ハスキーの群れと重ならないよう東へ 5 m ずらした）。群れの場所に自動で置いたプリミティブ版と入れ替える（読めなければプリミティブ版のまま）。
      // 体の長さ（鼻先〜尾の先）1.4 m は実物の成犬の目安。接地だけだと腰が 86〜89% の忍び足。
      // 後ろ脚 0.75・背骨 0.9・尾 0.5・前脚 0.7 で腰 99.1〜101.3%（銀牙で測って決めた値）
      { key: 'husky', species: 'シベリアンハスキー', name: '銀牙', file: 'husky-ginga', posture: { hind: 0.75, spine: 0.9, tail: 0.5, front: 0.7, ground: true }, place: { ...residentPlace('north', 'シベリアンハスキー'), yaw: 0.3, length: 1.4 } },
      // ピーター: サバンナの道（スタート → スポット）の右手の草原。グラン（道の左手）と道をはさんだ向かい、ライリー（40, 5）から 22 m。群れの場所に自動で置いたプリミティブ版と入れ替える（読めなければプリミティブ版のまま）。
      // 体の長さ 1.7 m は実物の成獣の目安。接地だけだと腰 80〜83%。後ろ脚 0.9・背骨 0.95・尾 0.5・前脚 0.8 で腰 99.1〜102.3%（ピーターで測って決めた値）
      { key: 'hyena', species: 'ブチハイエナ', name: 'ピーター', file: 'hyena-peter', posture: { hind: 0.9, spine: 0.95, tail: 0.5, front: 0.8, ground: true }, place: { ...SAVANNA_HYENA, length: 1.7 } },
      // ゆめこ: ジャングルの中心の西（ティガーの反対側。名簿の全個体を置いた後、アカハナグマの群れと重ならないよう南へ 4.5 m ずらした）。群れの場所に自動で置いたプリミティブ版と入れ替える（読めなければプリミティブ版のまま）。体の長さ 2.1 m は実物の成獣の目安。
      // 色の画像が暗く、ジャングルの光では写真より黒く沈むので、明るさを 2.5 倍にする（1・1.35・1.7・2.5・3.5 を写真と並べて、毛の灰色がいちばん近い値）。
      // 尾はごく短いので、尾の骨は動かさない（noTail・尾 1）。接地だけだと腰 79〜82%。後ろ脚 0.95・背骨 0.9・前脚 0.8 で腰 99.4〜102.8%（ゆめこで測って決めた値）
      { key: 'tapir', species: 'アメリカバク', name: 'ゆめこ', file: 'tapir-yumeko', posture: { hind: 0.95, spine: 0.9, tail: 1, front: 0.8, ground: true }, noTail: true, brighten: 2.5, place: { ...residentPlace('jungle', 'アメリカバク'), yaw: 1.3, length: 2.1 } },
      // かぼす: 南半球の中心の南のマーラ 2 頭のうち名簿の並びの最初の子（ゆずは夜間バッチの生成モデル）。大きさはプリミティブ版の体の長さにそろえる。
      // 尾はごく短いので尾の骨は動かさない。接地だけだと腰 82〜84%。後ろ脚 0.95・背骨 0.8・前脚 0.7 で腰 99.1〜100.2%（かぼすで測って決めた値）
      { key: 'mara', species: 'マーラ', name: 'かぼす', file: 'mara-kabosu', posture: { hind: 0.95, spine: 0.8, tail: 1, front: 0.7, ground: true }, noTail: true },
      // めい: ふれあいワールドの放牧場（farmPens の 0 番）のポニー 3 頭のうち名簿の並びの最初の子（きのこ・サクラは夜間バッチの生成モデル）。大きさはプリミティブ版の体の長さにそろえる。
      // 放牧場（半径 15 m）の中で、まわり 2 m だけ歩く。接地だけだと腰 76〜88%。後ろ脚 0.95・背骨 0.9・尾 0.5・前脚 0.8 で腰 99.1〜101.8%（めいで測って決めた値）
      { key: 'pony', species: 'ポニー', name: 'めい', file: 'pony-mei', posture: { hind: 0.95, spine: 0.9, tail: 0.5, front: 0.8, ground: true } },
      // リンリン: 水の世界の浜のケープペンギン 6 羽のうち pick 0（ほかの 5 羽はプリミティブ版のまま）。四足リグは二本足の体に合わず、ヒューマノイドのリグの歩きは
      // ひれが人の腕のように振れて体が歪むので、歩かせない（静止＋呼吸・首・左右の揺れ。waterfolk.ts）。大きさはプリミティブ版の高さにそろえる
      { key: 'penguin', species: 'ケープペンギン', name: 'リンリン', file: 'penguin-rinrin', posture: { hind: 0, spine: 0, tail: 0, front: 0, ground: false }, upright: true, still: true },
      // ハルト: 水の世界の潟の北西の岸のコツメカワウソ 3 頭のうちハルト（ケント・ミナトはプリミティブ版のまま）。水に入らないよう、まわり 1.2 m だけ歩く。
      // 補正の弱い組では前の体が沈んで腰が上がりすぎる（最大 106〜121%）。後ろ脚 0.85・背骨 1・尾 0.5・前脚 0.95 で腰 99.8〜103.6%（ハルトで測って決めた値）
      { key: 'otter', species: 'コツメカワウソ', name: 'ハルト', file: 'otter-haruto', posture: { hind: 0.85, spine: 1, tail: 0.5, front: 0.95, ground: true } },
      // 虎: サバンナのスタート（0, 72）からスポットへ向かう途中、左手 4.5 m の踏み分け道の上（−4.5, 43.5）。背の高い草の中だと体が隠れるので、草の生えない道に置き、
      // まわり 1 m だけ歩く。群れの場所に自動で置いたプリミティブ版と入れ替える（読めなければプリミティブ版のまま）。体の長さ 0.55 m（鼻先〜尾の先）は実物の成獣の目安。
      // 接地だけだと腰 81〜85%。後ろ脚 0.7・背骨 0.95・尾 0.5・前脚 0.65 で腰 99.6〜102.8%（虎で測って決めた値）
      { key: 'meerkat', species: 'ミーアキャット', name: '虎', file: 'meerkat-tora', posture: { hind: 0.7, spine: 0.95, tail: 0.5, front: 0.65, ground: true }, place: { ...SAVANNA_MEERKAT, length: 0.55 } },
      // テル: ジャングルの中心の西、ゆめこ（南米）の北 13 m。群れの場所に自動で置いたプリミティブ版と入れ替える（読めなければプリミティブ版のまま）。体の長さ 0.75 m（鼻先〜尾の先、尾が体より長い）は実物の目安。
      // 補正の弱い組では前足が沈み、腰が上がりすぎる（最大 111〜122%）。後ろ脚 0.95・背骨 0.95・尾 0.5・前脚 0.95 で腰 99.5〜101.8%（テルで測って決めた値）
      { key: 'squirrelMonkey', species: 'コモンリスザル', name: 'テル', file: 'squirrel-monkey-teru', posture: { hind: 0.95, spine: 0.95, tail: 0.5, front: 0.95, ground: true }, place: { ...residentPlace('jungle', 'コモンリスザル'), yaw: 1.3, length: 0.75 } },
      // ---- 夜間バッチ（exp/animals-night）: 群れの場所のプリミティブ版と入れ替える（読めなければ・?<key>=primitive ならプリミティブ版のまま）。大きさはプリミティブ版の体の長さにそろえる ----
      // ウーピー: サバンナのブチハイエナの群れ（3 頭）のうち名簿の 2 番目。コピー方式の試しでピーターの値（0.9／0.95／0.5／0.8）を流用すると腰の下限が 98.7% で届かず、
      // ウーピーで振って背骨だけ 1 に上げた（後ろ脚 0.9・背骨 1・尾 0.5・前脚 0.8 で腰 99.2〜101.6%）
      // ハイエナの群れのプリミティブ版（wildfolk）は差し替え口が無いので、その子の場所・向き・体の長さで入れ替える（replaceHost）
      { key: 'hyenaWhoopi', species: 'ブチハイエナ', name: 'ウーピー', file: 'hyena-whoopi', posture: { hind: 0.9, spine: 1, tail: 0.5, front: 0.8, ground: true }, replaceHost: true },
      // マロ: 南半球の西のカピバラ 2 頭のうち中心に近い方（しずかの隣）。しずかの値（0.7／0.98／1／0.9）の流用は腰の下限 98.9% で届かず、背骨だけ 1 に上げた
      // （後ろ脚 0.7・背骨 1・尾 1・前脚 0.9 で腰 99.3〜101.9%）。尾は無い子なので尾の骨は動かさない（noTail）
      { key: 'capybaraMaro', species: 'カピバラ', name: 'マロ', file: 'capybara-maro', posture: { hind: 0.7, spine: 1, tail: 1, front: 0.9, ground: true }, noTail: true },
      // ゆず: 南半球の中心の南のマーラ 2 頭のうちゆず（かぼすの隣）。かぼすの値（0.95／0.8／1／0.7）の流用は腰の下限 98.9% で届かず、後ろ脚だけ 1 に上げた（腰 99.9〜101.5%）。尾は無い子なので尾の骨は動かさない（noTail）
      { key: 'maraYuzu', species: 'マーラ', name: 'ゆず', file: 'mara-yuzu', posture: { hind: 1, spine: 0.8, tail: 1, front: 0.7, ground: true }, noTail: true },
      // きのこ: ふれあいワールドの放牧場のポニー 3 頭のうちきのこ。めいの値（0.95／0.9／0.5／0.8）の流用は腰 98.5〜105.2% で外れ、1／0.9／0.5／0.9 に（腰 99.9〜101.6%）
      { key: 'ponyKinoko', species: 'ポニー', name: 'きのこ', file: 'pony-kinoko', posture: { hind: 1, spine: 0.9, tail: 0.5, front: 0.9, ground: true } },
      // アンバー: サバンナのブチハイエナの群れ（3 頭）のうち名簿の 3 番目。ウーピーの値（0.9／1／0.5／0.8）の流用だけで腰 99.6〜103.0%。群れのプリミティブ版（wildfolk）と replaceHost で入れ替える
      { key: 'hyenaAmber', species: 'ブチハイエナ', name: 'アンバー', file: 'hyena-amber', posture: { hind: 0.9, spine: 1, tail: 0.5, front: 0.8, ground: true }, replaceHost: true },
      // ラピ: 南半球のカピバラ 3 頭のうちラピ。マロの値（0.7／1／1／0.9）の流用だけで腰 100.0〜101.4%。尾の骨は動かさない（noTail）
      { key: 'capybaraRapi', species: 'カピバラ', name: 'ラピ', file: 'capybara-rapi', posture: { hind: 0.7, spine: 1, tail: 1, front: 0.9, ground: true }, noTail: true },
      // ライム: 南半球のマーラ 5 頭のうちライム。ゆずの値（1／0.8／1／0.7）の流用だけで腰 100.3〜102.4%。尾の骨は動かさない（noTail）
      { key: 'maraLime', species: 'マーラ', name: 'ライム', file: 'mara-lime', posture: { hind: 1, spine: 0.8, tail: 1, front: 0.7, ground: true }, noTail: true },
      // レモン: 南半球のマーラ 5 頭のうちレモン。ゆずの値（1／0.8／1／0.7）の流用だけで腰 99.8〜100.5%。尾の骨は動かさない（noTail）
      { key: 'maraLemon', species: 'マーラ', name: 'レモン', file: 'mara-lemon', posture: { hind: 1, spine: 0.8, tail: 1, front: 0.7, ground: true }, noTail: true },
      // サクラ: ふれあいワールドの放牧場のポニー 3 頭のうちサクラ。コピー方式できのこの値（後ろ脚 1・背骨 0.9・尾 0.5・前脚 0.9）を流用
      // ライチ: 南半球のマーラ 5 頭のうちライチ。コピー方式でゆずの値（後ろ脚 1・背骨 0.8・尾 1・前脚 0.7）を流用。尾の骨は動かさない（noTail）
      { key: 'maraLychee', species: 'マーラ', name: 'ライチ', file: 'mara-lychee', posture: { hind: 1, spine: 0.8, tail: 1, front: 0.7, ground: true }, noTail: true },
      { key: 'ponySakura', species: 'ポニー', name: 'サクラ', file: 'pony-sakura', posture: { hind: 1, spine: 0.9, tail: 0.5, front: 0.9, ground: true } },
      // 夜間バッチ 2（11/7）。姿勢の補正値は各子で測って決めた値（LOG）
      // ラーテル・プレーリードッグ・ワオキツネザルの群れのプリミティブ版（wildfolk・直立の形）は差し替え口が無いので replaceHost
      { key: 'ratelWinnie', species: 'ラーテル', name: 'ウィニー', file: 'ratel-winnie', posture: { hind: 1, spine: 0.8, tail: 0.5, front: 1, ground: true }, replaceHost: true },
      { key: 'prairieCookie', species: 'プレーリードッグ', name: 'クッキー', file: 'prairie-cookie', posture: { hind: 1, spine: 0.9, tail: 0.5, front: 0.9, ground: true }, replaceHost: true },
      { key: 'kinkajouFig', species: 'キンカジュー', name: 'フィグ', file: 'kinkajou-fig', posture: { hind: 1, spine: 0.8, tail: 0.5, front: 1, ground: true } },
      { key: 'goatLatte', species: 'ヤギ', name: 'ラテ', file: 'goat-latte', posture: { hind: 0.9, spine: 1, tail: 0.5, front: 0.8, ground: true } },
      { key: 'lemurJimin', species: 'ワオキツネザル', name: 'ジミン', file: 'lemur-jimin', posture: { hind: 1, spine: 0.8, tail: 0.5, front: 1, ground: true }, replaceHost: true },
      { key: 'foxDaichan', species: 'キタキツネ', name: 'だいちゃん', file: 'fox-daichan', posture: { hind: 1, spine: 0.8, tail: 0.5, front: 1, ground: true } },
      { key: 'binturongBin', species: 'ビントロング', name: 'ビン', file: 'binturong-bin', posture: { hind: 1, spine: 0.8, tail: 0.5, front: 1, ground: true } },
      { key: 'binturongBasil', species: 'ビントロング', name: 'バジル', file: 'binturong-basil', posture: { hind: 1, spine: 0.8, tail: 0.5, front: 1, ground: true } },
      { key: 'bearGorou', species: 'ツキノワグマ', name: 'ゴロウ', file: 'bear-gorou', posture: { hind: 1, spine: 0.9, tail: 0.5, front: 0.9, ground: true }, noTail: true },
      { key: 'bearMakkun', species: 'ツキノワグマ', name: 'まっ君', file: 'bear-makkun', posture: { hind: 1, spine: 0.9, tail: 0.5, front: 0.9, ground: true }, noTail: true },
      { key: 'binturongParsley', species: 'ビントロング', name: 'パセリ', file: 'binturong-parsley', posture: { hind: 1, spine: 0.8, tail: 0.5, front: 1, ground: true } },
      { key: 'lemurPercy', species: 'ワオキツネザル', name: 'パーシー', file: 'lemur-percy', posture: { hind: 1, spine: 0.8, tail: 0.5, front: 1, ground: true }, replaceHost: true },
      { key: 'lemurSana', species: 'ワオキツネザル', name: 'サナ', file: 'lemur-sana', posture: { hind: 1, spine: 0.8, tail: 0.5, front: 1, ground: true }, replaceHost: true },
      { key: 'kinkajouKuko', species: 'キンカジュー', name: 'クコ', file: 'kinkajou-kuko', posture: { hind: 1, spine: 0.8, tail: 0.5, front: 1, ground: true } },
      { key: 'kinkajouCoco', species: 'キンカジュー', name: 'ココ', file: 'kinkajou-coco', posture: { hind: 1, spine: 0.8, tail: 0.5, front: 1, ground: true } },
      { key: 'prairieTanpopo', species: 'プレーリードッグ', name: 'たんぽぽ', file: 'prairie-tanpopo', posture: { hind: 1, spine: 0.9, tail: 0.5, front: 0.9, ground: true }, replaceHost: true },
      { key: 'goatShiki', species: 'ヤギ', name: 'シキ', file: 'goat-shiki', posture: { hind: 0.9, spine: 1, tail: 0.5, front: 0.8, ground: true } },
      { key: 'goatTwotone', species: 'ヤギ', name: 'ツートン', file: 'goat-twotone', posture: { hind: 1, spine: 0.9, tail: 0.5, front: 0.9, ground: true } },
      { key: 'goatMarble', species: 'ヤギ', name: 'マーブル', file: 'goat-marble', posture: { hind: 0.9, spine: 1, tail: 0.5, front: 0.8, ground: true } },
      { key: 'kinkajouVilla', species: 'キンカジュー', name: 'ヴィラ', file: 'kinkajou-villa', posture: { hind: 1, spine: 0.8, tail: 0.5, front: 1, ground: true } },
      { key: 'lemurMomo', species: 'ワオキツネザル', name: 'モモ', file: 'lemur-momo', posture: { hind: 1, spine: 0.8, tail: 0.5, front: 1, ground: true }, replaceHost: true },
      { key: 'lemurGeorge', species: 'ワオキツネザル', name: 'ジョージ', file: 'lemur-george', posture: { hind: 1, spine: 0.8, tail: 0.5, front: 1, ground: true }, replaceHost: true },
      { key: 'lemurLuna', species: 'ワオキツネザル', name: 'ルナ', file: 'lemur-luna', posture: { hind: 1, spine: 0.8, tail: 0.5, front: 1, ground: true }, replaceHost: true },
      { key: 'goatNatsume', species: 'ヤギ', name: 'ナツメ', file: 'goat-natsume', posture: { hind: 0.9, spine: 1, tail: 0.5, front: 0.8, ground: true } },
      { key: 'kinkajouHazel', species: 'キンカジュー', name: 'ヘーゼル', file: 'kinkajou-hazel', posture: { hind: 1, spine: 0.8, tail: 0.5, front: 1, ground: true } },
      { key: 'kinkajouChirine', species: 'キンカジュー', name: 'チリーヌ', file: 'kinkajou-chirine', posture: { hind: 1, spine: 0.8, tail: 0.5, front: 1, ground: true } },
      { key: 'goatMifuyu', species: 'ヤギ', name: 'みふゆ', file: 'goat-mifuyu', posture: { hind: 0.9, spine: 1, tail: 0.5, front: 0.8, ground: true } },
      { key: 'goatBaum', species: 'ヤギ', name: 'バウム', file: 'goat-baum', posture: { hind: 0.9, spine: 1, tail: 0.5, front: 0.8, ground: true } },
      { key: 'lemurJupiter', species: 'ワオキツネザル', name: 'ジュピター', file: 'lemur-jupiter', posture: { hind: 1, spine: 0.8, tail: 0.5, front: 1, ground: true }, replaceHost: true },
      { key: 'lemurSpacey', species: 'ワオキツネザル', name: 'スペイシー', file: 'lemur-spacey', posture: { hind: 1, spine: 0.8, tail: 0.5, front: 1, ground: true }, replaceHost: true },
      { key: 'kinkajouMia', species: 'キンカジュー', name: 'ミア', file: 'kinkajou-mia', posture: { hind: 1, spine: 0.8, tail: 0.5, front: 1, ground: true } },
      { key: 'goatMachiko', species: 'ヤギ', name: 'まちこ', file: 'goat-machiko', posture: { hind: 0.9, spine: 1, tail: 0.5, front: 0.8, ground: true } },
      { key: 'goatMarge', species: 'ヤギ', name: 'マージュ', file: 'goat-marge', posture: { hind: 1, spine: 0.9, tail: 0.5, front: 0.9, ground: true } },
      { key: 'goatFlow', species: 'ヤギ', name: 'フロー', file: 'goat-flow', posture: { hind: 1, spine: 0.9, tail: 0.5, front: 0.9, ground: true } },
      { key: 'goatLattejr', species: 'ヤギ', name: 'ラテjr', file: 'goat-lattejr', posture: { hind: 1, spine: 0.9, tail: 0.5, front: 0.9, ground: true } },
      { key: 'goatShizuru', species: 'ヤギ', name: 'しずる', file: 'goat-shizuru', posture: { hind: 1, spine: 0.9, tail: 0.5, front: 0.9, ground: true } },
      { key: 'meerkatMoa', species: 'ミーアキャット', name: 'モア', file: 'meerkat-moa', posture: { hind: 1, spine: 0.8, tail: 0.5, front: 1, ground: true }, replaceHost: true },
      { key: 'meerkatYomogi', species: 'ミーアキャット', name: 'ヨモギ', file: 'meerkat-yomogi', posture: { hind: 1, spine: 0.8, tail: 0.5, front: 1, ground: true }, replaceHost: true },
      { key: 'meerkatSuzu', species: 'ミーアキャット', name: 'すず', file: 'meerkat-suzu', posture: { hind: 1, spine: 0.8, tail: 0.5, front: 1, ground: true }, replaceHost: true },
      { key: 'meerkatHaruka', species: 'ミーアキャット', name: 'はるか', file: 'meerkat-haruka', posture: { hind: 1, spine: 0.8, tail: 0.5, front: 1, ground: true }, replaceHost: true },
      { key: 'meerkatSou', species: 'ミーアキャット', name: 'そう', file: 'meerkat-sou', posture: { hind: 1, spine: 0.8, tail: 0.5, front: 1, ground: true }, replaceHost: true },
      { key: 'wolfNega', species: 'ホッキョクオオカミ', name: 'ネガ', file: 'wolf-nega', posture: { hind: 1, spine: 0.8, tail: 0.5, front: 1, ground: true } },
      { key: 'wolfMari', species: 'ホッキョクオオカミ', name: 'マリ', file: 'wolf-mari', posture: { hind: 0.9, spine: 0.95, tail: 0.5, front: 0.85, ground: true } },
      { key: 'huskyRock', species: 'シベリアンハスキー', name: 'ロック', file: 'husky-rock', posture: { hind: 1, spine: 0.9, tail: 0.5, front: 0.9, ground: true } },
      { key: 'sandcatSheri', species: 'スナネコ', name: 'シェリ', file: 'sandcat-sheri', posture: { hind: 1, spine: 0.8, tail: 0.5, front: 1, ground: true }, replaceHost: true },
      { key: 'tortoiseLeonardo', species: 'ケヅメリクガメ', name: 'レオナルド', file: 'tortoise-leonardo', posture: { hind: 1, spine: 0.9, tail: 0.5, front: 0.9, ground: true }, replaceHost: true },
    ]
    for (const r of AI_RESIDENTS) {
      if (q.get('model') === 'primitive' || q.get(r.key) === 'primitive' || q.get(r.key) === 'off') continue
      const animal = ANIMALS.find((a) => a.species === r.species && a.name === r.name)
      if (!animal) continue
      let host = lions.find((l) => l.id === animal.id)
      const place = r.place ?? (r.replaceHost && host ? { x: host.group.position.x, z: host.group.position.z, yaw: host.group.rotation.y, length: primitiveLength(host.group, 'z') } : undefined)
      if (!host && !place) continue
      const posture = q.get('fix') === 'off' ? { hind: 0, spine: 0, tail: 0, front: 0, ground: false } : r.posture
      loadAiLion(`/models/${r.file}.glb`, { length: place ? place.length : primitiveLength(host!.group, r.upright ? 'y' : 'z'), posture, upright: r.upright, brighten: q.has(`${r.key}Bright`) ? Number(q.get(`${r.key}Bright`)) : r.brighten })
        .then((ai) => {
          if (place) {
            // place の子: place の場所に入れ物を作る（中のプリミティブは swapModel で隠れる）。出会い・名前の札・地図に乗せる。
            // 名簿の全個体を置いた後（11/6）は、群れの場所に自動で置いたプリミティブ版がいるので、それを取り除いて入れ替える（読めなければそのまま残る）
            const old = host
            host = createLion({ id: animal.id, x: place.x, z: place.z, yaw: place.yaw })
            vividToon(host.group)
            scene.add(host.group)
            props.colliders.push(host.collider)
            host.setReduceMotion(reduceMotionNow)
            const at = old ? lions.indexOf(old) : -1
            if (old && at >= 0) {
              scene.remove(old.group)
              const c = props.colliders.indexOf(old.collider)
              if (c >= 0) props.colliders.splice(c, 1)
              lions[at] = host
            } else {
              lions.push(host)
              labels.add(host.id, nameOf(host.id))
            }
          }
          if (!host) return
          // 尾の無い子は、Lion.update が書く尾の揺れを使わない入れ物に向ける（ai.parts.tail は 0 のまま）
          host.swapModel(ai.model, r.noTail ? { ...ai.parts, tail: new THREE.Object3D() } : ai.parts)
          host.headHeight = ai.headHeight
          aiLions[r.key] = ai
          const roam = roamFor(r.species, animal.id)
          if (r.still || roam.tier === 'still') return
          const w = createLionWander(host, ai, props.colliders, roam)
          w.setReduceMotion(reduceMotionNow)
          wanderers.push(w)
        })
        .catch((err) => console.warn(place && !host ? '[animals-ai] model not loaded; not placed' : '[animals-ai] model not loaded; keeping primitive', r.key, err))
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
  // 足音: 北の世界の雪の上は雪、ほかは草。跳ぶ・着地
  const stepBiome = emptyWeights()
  const playStep = (x: number, z: number) => {
    sound.play(biomeAt(x, z, stepBiome).north > 0.5 ? 'step-snow' : 'step-grass')
    // 歩き続けている時だけ、ときどき主人公の息づかい
    sound.walkStep()
  }
  // 主人公のモデルがある時は、モデルの足が地面に着く瞬間に鳴らす（下の hero.update）。これは読めなかった時の、いままでの姿の足音
  let heroSteps = false
  player.onStep((x, z) => {
    if (!heroSteps) playStep(x, z)
  })
  player.onJump(() => {
    sound.play('jump')
    sound.say('jump')
  })
  player.onLand((drop) => {
    sound.play('land')
    sound.landed(drop)
  })
  scene.add(player.object)
  const guideProj = new THREE.Vector3()
  // あそびかたツアーの「いっしょに行く」・照らしたライリーを押した時: ライリーの手前（2.5m）まで歩く
  guide.onWalkTo((target) => {
    // 照らした観察スポットを押した時は「観察スポットへ」と同じ道で歩く
    if (target === 'spot') {
      // 着いていればスコープを開く（「スコープをのぞく」と同じ）。まだならスポットまで歩く
      if (arrived) void openScope()
      else player.goTo(here.route)
      return
    }
    const riley = lions.find((l) => l.id === 'riley')
    if (!riley) return
    const p = player.object.position
    const dx = p.x - riley.position.x
    const dz = p.z - riley.position.z
    const d = Math.hypot(dx, dz) || 1
    player.goTo(routeTo({ x: p.x, z: p.z }, { x: riley.position.x + (dx / d) * 2.5, z: riley.position.z + (dz / d) * 2.5 }))
  })
  let walkX = player.object.position.x
  let walkZ = player.object.position.z

  // プレイヤーの姿は名簿（src/data/heroes.json）の主人公のうち、選んでいる 1 人だけを読み込む（操作はそのまま）。
  // 高さは名簿の倍率 × いままでの姿（入れ物の最初の子、2.03m）。0.59 で 1.20m。
  // 読めなければ既定の黄色い子、それも読めなければいままでの姿のまま続ける。?hero=off でいままでの姿。
  // 比べる用: &heroSep=off で接地影と輪郭なし、&heroScale=1 でいままでの姿と同じ高さ（ほかの数でも掛けられる）
  let hero: HeroModel | null = null
  let heroId: string | null = null
  let heroWant: string | null = null
  const heroPrev = new THREE.Vector3()
  let heroSpeed = 0
  const heroQuery = new URLSearchParams(location.search)
  const heroOff = heroQuery.get('hero') === 'off'
  const figure = player.object.children[0]
  const figureHeight = new THREE.Box3().setFromObject(figure).getSize(new THREE.Vector3()).y
  const heroScaleOverride = Number(heroQuery.get('heroScale')) || 0
  const putHero = (next: HeroModel | null, id: string | null) => {
    if (hero) {
      player.object.remove(hero.root)
      if (hero.shadow) scene.remove(hero.shadow)
      hero.dispose()
    }
    hero = next
    heroId = id
    heroSteps = !!next
    figure.visible = !next
    if (next) {
      player.object.add(next.root)
      if (next.shadow) scene.add(next.shadow)
      heroPrev.copy(player.object.position)
    }
  }
  const chooseHero = async (id: string): Promise<void> => {
    if (heroOff || id === heroId) return
    heroWant = id
    const entry = heroById(id)
    try {
      const loaded = await loadHero(entry.model, {
        height: figureHeight * (heroScaleOverride || entry.scale),
        separation: heroQuery.get('heroSep') !== 'off',
        ground: terrainHeight,
      })
      // 読み込み中に別の子が選ばれていたら、こちらは捨てる
      if (heroWant !== id) return loaded.dispose()
      putHero(loaded, entry.id)
    } catch (err) {
      console.warn('hero model not loaded', entry.id, err)
      if (heroWant !== id) return
      if (entry.id !== DEFAULT_HERO) return chooseHero(DEFAULT_HERO)
      putHero(null, null)
    }
  }
  let heroTask: Promise<void> = chooseHero(getHeroId())

  hud.onJump(() => player.jump())

  // ダッシュ（ジャンプの上のボタン、PC は Shift）と、主人公の頭の右のがんばりゲージ
  const staminaUi = createStaminaUi()
  staminaUi.onDash((on) => player.setDash(on))
  player.onDashEnd(() => staminaUi.setDashOn(false))
  player.onExhaust(() => sound.say('breath'))
  const staminaProj = new THREE.Vector3()

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
  // 広げた地図に出す種の名前
  const speciesOf = (id: string) => {
    const a = getAnimal(id)
    return a ? speciesName(a.species) : undefined
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

  // 入る演出の間は true（操作を止め、HUD を隠す）
  let introOn = false
  // 何かの画面が開いている間は、ワールドのタップとキーを止め、「ホームへ」も重ねない
  let paused = startPaused
  // アニマルスコープの一覧を見ている間は true。描画も止める（canvas は最後の絵のまま一覧の下に隠れる）
  let viewing = false
  const syncInput = () => {
    const blocked = observe.isOpen() || book.isOpen() || mapView.isOpen() || catalog.isOpen() || introOn
    player.setInputEnabled(!blocked && !paused)
    joystick.setEnabled(!blocked && !paused)
    staminaUi.setEnabled(!blocked && !paused)
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
    // 開く音は「構える」（双眼鏡の形に絞られる 0.3 秒目）に合わせる
    sound.cancelTap()
    if (animate) window.setTimeout(() => sound.play('scope-open'), 250)
    else sound.play('scope-open')
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
    guide.reach(open ? 'scope' : 'scopeClose')
    syncInput()
    if (open) return
    // 一覧を閉じた: 世界がぼけた寄りから戻ってくる。HUD もふわっと戻る
    viewing = false
    sound.play('scope-close')
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
  mapView.onOpenChange((open) => {
    guide.reach(open ? 'map' : 'mapClose')
    // 地図が開いている間は、あそび方ナビのカードを下に（地図の見出しと「動物の名前」をふさがない）
    document.body.classList.toggle('map-open', open)
    syncInput()
  })
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
    sea.setReduceMotion(on)
  }
  // 設定はホームで変える。ワールドは止まっているだけなので、戻った時には反映済み
  applyReduceMotion(shell.settings.reduceMotion)
  shell.settings.onReduceMotionChange(applyReduceMotion)
  player.setSensitivity(shell.settings.sensitivity)
  shell.settings.onSensitivityChange((s) => player.setSensitivity(s))
  hud.show()

  // ピンを画面の端に寄せる時の余白。下は HUD（スティック・ジャンプ・観察スポットへ）の上端から測る
  const stickEl = document.getElementById('stick')
  const jumpEl = document.getElementById('jump')
  const spotBtnEl = document.getElementById('goto-spot')
  const safe = { top: 72, bottom: 190 }
  const measureSafe = () => {
    let reserve = 0
    for (const el of [stickEl, jumpEl, document.getElementById('dash'), spotBtnEl]) {
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
    // 水の世界: 海の上の明るい水色（遠くの水平線が空に溶ける）
    water: new THREE.Color('#c4e6f4'),
    // ふれあいワールド: 春の牧場のやわらかい明るい霞（少し黄緑がかった白）
    partner: new THREE.Color('#e2efd8'),
    // 空の世界: 雲に近い高原の澄んだ明るい青白（遠くの岩の峰が空に溶ける）
    sky: new THREE.Color('#d8e6fb'),
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
    // 水の世界: 澄んだ明るい青空、照り返しは海と砂の明るい水色（影が青く澄む）。霞は遠く、高めの白い太陽に広い輪（海の照り返し）
    water: {
      exposure: 0.97,
      sky: new THREE.Color('#cfe6ff'),
      ground: new THREE.Color('#a9d4dc'),
      intensity: 0.7,
      sun: 2.25,
      top: new THREE.Color('#1462d8'),
      horizon: new THREE.Color('#86cdf2'),
      near: 130,
      far: 520,
      gradeSat: 1.08,
      gradeContrast: 1.05,
      sunElev: 24,
      sunGlow: new THREE.Color('#fff8e2'),
      sunDisc: 3.8,
      sunHalo: 1.6,
    },
    // ふれあいワールド: やさしい青空、照り返しは牧草の明るい緑。影はやわらかく、暖かい午後の太陽
    partner: {
      exposure: 0.97,
      sky: new THREE.Color('#d4e8ff'),
      ground: new THREE.Color('#9cc870'),
      intensity: 0.72,
      sun: 2.2,
      top: new THREE.Color('#2a6ee0'),
      horizon: new THREE.Color('#9ad0f4'),
      near: 120,
      far: 480,
      gradeSat: 1.07,
      gradeContrast: 1.04,
      sunElev: 22,
      sunGlow: new THREE.Color('#fff0cc'),
      sunDisc: 4.0,
      sunHalo: 1.3,
    },
    // 空の世界: 高い所の深い青空と強い日差し、照り返しは高原の明るい草。霞は遠く（澄んだ空気）
    sky: {
      exposure: 0.98,
      sky: new THREE.Color('#d0e2ff'),
      ground: new THREE.Color('#a8cf7a'),
      intensity: 0.7,
      sun: 2.35,
      top: new THREE.Color('#1f5fd8'),
      horizon: new THREE.Color('#a8d4fa'),
      near: 140,
      far: 560,
      gradeSat: 1.06,
      gradeContrast: 1.05,
      sunElev: 24,
      sunGlow: new THREE.Color('#fff4d6'),
      sunDisc: 4.2,
      sunHalo: 1.5,
    },
  }
  const lightTarget: Light = { ...baseLight() }
  // 空の太陽の仰角と大きさ（度）。ワールドの重みで目標が変わり、ほかの光と同じ速さで寄せる
  let sunElev = lightTarget.sunElev
  let sunDisc = lightTarget.sunDisc
  const weights: BiomeWeights = emptyWeights()
  const fogTarget = new THREE.Color()
  // 入った時から明るく（最初に目標を出した時に、そこまで合わせる）
  let lightReady = false
  let lightSnap = false
  const regionName = (key: RegionKey, l: Lang = getLang()) => {
    if (key === 'africa') return tIn(l, 'catSavanna')
    const w = getWorld(key)
    return w ? w.name[l] : key
  }
  // ワールドに入った時の大きな名前。日本語の時は英語の名前を上に小さく添える
  const regionTitle = createRegionTitle()
  const showRegionTitle = (key: RegionKey) => {
    regionTitle.show(
      regionName(key),
      getLang() === 'ja' ? regionName(key, 'en').toUpperCase() : '',
      t('enterRegion', { world: regionName(key) }),
    )
  }

  // ホームから入る演出: 幕が開くとモザイクがかかった世界がだんだん見えてきて、主人公のすぐそばからゆっくり引き、
  // 途中でいまいるワールドの名前がふわっと出る。モザイクは描いた絵を小さく縮めた 2D の canvas を、
  // 画素をにじませずに全面へ引き伸ばして重ねる（後処理の有無に関係なく、どの端末でも同じに見える）。
  // そのワールドに初めて来た時は、寄り・引きの代わりにドローンの空撮（空から回って全体を見渡し、主人公の後ろへ降りてくる）。
  // 歩いてほかのワールドに初めて入った時も同じ空撮を流す（名前はワールドが変わった時に出ている）
  const INTRO_MS = 3200
  /** モザイクがほどけるまで（ms） */
  const MOSAIC_MS = 1760
  /** モザイクの最初のマス目の大きさ（CSS px） */
  const MOSAIC_MAX = 46
  /** 空撮の長さ（ms）。空から見渡す・動物の群れのまわりを回る・主人公の後ろへ降りる */
  const FLY_MS = 10000
  const FLY_KEY = 'awl.flyover.v1'
  const flyForced = new URLSearchParams(location.search).get('flyover') === '1'
  const flySeen = new Set<string>()
  try {
    const raw = localStorage.getItem(FLY_KEY)
    if (raw) for (const k of JSON.parse(raw) as string[]) flySeen.add(k)
  } catch {
    // 読めなければ、どのワールドも初めて扱い
  }
  const shouldFly = (key: RegionKey) => flyForced || !flySeen.has(key)
  const markFlown = (key: RegionKey) => {
    flySeen.add(key)
    try {
      localStorage.setItem(FLY_KEY, JSON.stringify([...flySeen]))
    } catch {
      // 保存できなくても続ける（次もまた流れるだけ）
    }
  }
  const mosaic = document.getElementById('world-mosaic') as HTMLCanvasElement
  const mosaicCtx = mosaic.getContext('2d')
  const introSkip = document.getElementById('intro-skip') as HTMLButtonElement
  let introStart: number | null = null
  let introTitled = false
  let introMosaic = false
  let introDone: (() => void) | null = null
  /** 空撮の中身。null なら寄り・引きの演出 */
  let fly: { key: RegionKey; cx: number; cy: number; cz: number; radius: number; endAngle: number } | null = null
  const flyPos = new THREE.Vector3()
  const flyLook = new THREE.Vector3()
  const followPos = new THREE.Vector3()
  const followLook = new THREE.Vector3()
  const flyOverride = { position: flyPos, lookAt: flyLook }
  const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)
  const introElapsed = () => (introStart === null ? 0 : performance.now() - introStart)
  const introLength = () => (fly ? FLY_MS : INTRO_MS)
  /**
   * そのワールドでいちばん見ばえのする動物の群れ（同じ種で 30m 以内に集まっている子たち。体の大きさの合計がいちばん大きい群れ）。
   * 空撮の途中で、この群れのそばを低く飛んで見せる。size は群れの子の平均の大きさ（当たりの半径、m）。いなければ null
   */
  const biggestGroup = (key: RegionKey): { at: THREE.Vector3; size: number } | null => {
    const groups: Array<{ species: string; x: number; y: number; z: number; n: number; r: number }> = []
    for (const l of lions) {
      if (regionAt(l.position.x, l.position.z) !== key) continue
      const species = getAnimal(l.id)?.species ?? l.id
      const g = groups.find((it) => it.species === species && Math.hypot(it.x - l.position.x, it.z - l.position.z) < 30)
      if (g) {
        g.x = (g.x * g.n + l.position.x) / (g.n + 1)
        g.y = (g.y * g.n + l.position.y) / (g.n + 1)
        g.z = (g.z * g.n + l.position.z) / (g.n + 1)
        g.n += 1
        g.r += l.collider.r
      } else {
        groups.push({ species, x: l.position.x, y: l.position.y, z: l.position.z, n: 1, r: l.collider.r })
      }
    }
    // 体の大きさで比べる（半径の 2 乗の合計）。小さい子がたくさんいる群れ（キンカジュー・ミーアキャットなど）より、
    // ライオンやトラのような見ばえのする子を選ぶ（11/6 に全個体を置いて、頭数だけだと小さい子の群れが選ばれるようになったため）
    const weight = (g: { r: number; n: number }) => g.n * (g.r / g.n) ** 2
    groups.sort((a, b) => weight(b) - weight(a))
    const g = groups[0]
    return g ? { at: new THREE.Vector3(g.x, g.y, g.z), size: g.r / g.n } : null
  }
  /**
   * 空撮の道すじ: 高い空から回って全体を見渡す（3 点）→ 動物の群れへ下りていき、群れを見たまままわりを低く回る（3 点）
   * → 主人公の後ろの高いところ → いつものカメラの位置。
   * 点と点の間は同じ時間で、なめらかな曲線（Catmull-Rom）でつなぐ。注視点も点ごとに決めて、区間ごとになめらかに移す
   */
  let flyCurve: THREE.CatmullRomCurve3 | null = null
  let flyLooks: THREE.Vector3[] = []
  const setupFly = (key: RegionKey) => {
    const r = REGIONS.find((it) => it.key === key) ?? REGIONS[0]
    player.followPose(followPos, followLook)
    const cy = terrainHeight(r.x, r.z)
    const center = new THREE.Vector3(r.x, cy, r.z)
    const found = biggestGroup(key)
    const group = found?.at ?? null
    // 小さい子の群れほど近くを飛ぶ（ライオンくらいで 1、小さい子は 0.45 まで寄る）
    const near = clamp((found?.size ?? 1) / 1.0, 0.45, 1)
    // 群れの方角（いなければ主人公の後ろの方角）で回り終わる
    const target = group ?? followPos
    const endAngle = Math.atan2(target.x - r.x, target.z - r.z)
    const R = r.walk
    const ring = (angle: number, dist: number, h: number) =>
      new THREE.Vector3(r.x + Math.sin(angle) * dist, cy + h, r.z + Math.cos(angle) * dist)
    const points = [ring(endAngle - 2.3, R * 1.15, R * 0.85), ring(endAngle - 1.3, R * 1.05, R * 0.75), ring(endAngle - 0.35, R * 0.95, R * 0.55)]
    const looks = [center.clone(), center.clone(), center.clone()]
    if (group) {
      // 群れへ: 外側（ワールドの縁の側）から近づいて、横をかすめて通り過ぎる
      const out = new THREE.Vector3(group.x - r.x, 0, group.z - r.z)
      if (out.lengthSq() < 1) out.set(Math.sin(endAngle), 0, Math.cos(endAngle))
      out.normalize()
      const side = new THREE.Vector3(out.z, 0, -out.x)
      const gLook = group.clone().setY(group.y + Math.max(0.4, near))
      // 近づく → 横 → 回り込んだ向こう側（群れを見たまま、まわりを半周ほど）
      points.push(group.clone().addScaledVector(out, 24 * near).addScaledVector(side, -8 * near).setY(group.y + 10 * near))
      looks.push(gLook.clone())
      points.push(group.clone().addScaledVector(out, 4 * near).addScaledVector(side, 13 * near).setY(group.y + 5 * near))
      looks.push(gLook.clone())
      points.push(group.clone().addScaledVector(out, -9 * near).addScaledVector(side, 8 * near).setY(group.y + 6 * near))
      looks.push(gLook.clone())
    }
    // 主人公の後ろの高いところを通ってから、いつもの位置へ後ろから降りる（台地や岩をかすめない、真上から見下ろさない）
    const back = new THREE.Vector3(followPos.x - followLook.x, 0, followPos.z - followLook.z)
    if (back.lengthSq() < 0.01) back.set(0, 0, 1)
    back.normalize()
    points.push(followPos.clone().addScaledVector(back, 16).setY(followPos.y + 8))
    looks.push(followLook.clone())
    points.push(followPos.clone())
    looks.push(followLook.clone())
    // 地形に潜らない: 低く飛ぶ点は、まわり（半径 7m）のいちばん高い地面より 3m 上に（ふれあいワールドのヤギの岩場のような盛り上がりの上を通るため）
    for (let i = 0; i < points.length - 1; i++) {
      const p = points[i]
      let ground = terrainHeight(p.x, p.z)
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2
        ground = Math.max(ground, terrainHeight(p.x + Math.cos(a) * 7, p.z + Math.sin(a) * 7))
      }
      p.y = Math.max(p.y, ground + 3)
    }
    flyCurve = new THREE.CatmullRomCurve3(points, false, 'centripetal')
    flyLooks = looks
    fly = { key, cx: r.x, cy, cz: r.z, radius: R, endAngle }
    document.body.classList.add('world-fly')
  }
  const smooth = (x: number) => x * x * (3 - 2 * x)
  /** 空撮のカメラ。p は 0〜1 */
  const flyCamera = (p: number) => {
    if (!fly || !flyCurve) return
    const n = flyLooks.length - 1
    // 全体をゆっくり始めてゆっくり止める（ゆるい曲線にして、群れのそばの区間の時間を削らない）。
    // 最後の点（主人公の後ろ）は毎フレーム今の位置に合わせる
    const u = 0.5 - 0.5 * Math.cos(Math.PI * p)
    player.followPose(followPos, followLook)
    flyCurve.points[n].copy(followPos)
    flyLooks[n].copy(followLook)
    flyCurve.getPoint(u, flyPos)
    const seg = Math.min(n - 1, Math.floor(u * n))
    const local = u * n - seg
    // 地面より下にはもぐらない
    flyPos.y = Math.max(flyPos.y, terrainHeight(flyPos.x, flyPos.z) + 2.5)
    flyLook.copy(flyLooks[seg]).lerp(flyLooks[seg + 1], smooth(local))
    camera.position.copy(flyPos)
    camera.lookAt(flyLook)
    player.setCameraOverride(flyOverride)
  }
  /** 描く前に: カメラ（空撮、または寄りから引き） */
  const introCamera = () => {
    const p = Math.min(1, introElapsed() / introLength())
    if (fly) flyCamera(p)
    else player.setIntro(easeInOut(clamp((p - 0.04) / 0.96, 0, 1)))
  }
  /** 描いた後に: モザイク・名前・終わり */
  const introAfterRender = () => {
    const t = introElapsed()
    // モザイクは最初の 1.76 秒でほどけ、終わりぎわは透けて消える
    const m = introMosaic ? Math.min(1, t / MOSAIC_MS) : 1
    const block = 1 + (MOSAIC_MAX - 1) * Math.pow(1 - m, 2.2)
    if (mosaicCtx && block > 1.5) {
      const w = Math.max(2, Math.round(window.innerWidth / block))
      const h = Math.max(2, Math.round(window.innerHeight / block))
      if (mosaic.width !== w) mosaic.width = w
      if (mosaic.height !== h) mosaic.height = h
      mosaicCtx.imageSmoothingEnabled = true
      mosaicCtx.drawImage(canvas, 0, 0, w, h)
      mosaic.style.opacity = m < 0.8 ? '1' : String(1 - (m - 0.8) / 0.2)
      mosaic.hidden = false
    } else {
      mosaic.hidden = true
    }
    if (!introTitled && t >= (fly ? 1500 : INTRO_MS * 0.4)) {
      introTitled = true
      showRegionTitle(here.key)
    }
    if (t >= introLength()) endIntro()
  }
  /** 歩いてほかのワールドに初めて入った時の空撮（操作を止め、HUD を隠す） */
  const startRegionFly = (key: RegionKey) => {
    if (introOn || reduceMotionNow || !shouldFly(key)) return
    introOn = true
    introMosaic = false
    // 名前はワールドが変わった時に出しているので、空撮の途中では出さない
    introTitled = true
    setupFly(key)
    document.body.classList.add('world-intro')
    syncInput()
    introStart = performance.now()
  }
  introSkip.addEventListener('click', () => endIntro())
  const endIntro = () => {
    if (!introOn) return
    introOn = false
    introStart = null
    if (fly) {
      markFlown(fly.key)
      fly = null
      player.setCameraOverride(null)
      document.body.classList.remove('world-fly')
    }
    player.setIntro(null)
    mosaic.hidden = true
    document.body.classList.remove('world-intro')
    // 飛ばした時も名前は出す
    if (!introTitled) {
      introTitled = true
      showRegionTitle(here.key)
    }
    syncInput()
    const done = introDone
    introDone = null
    done?.()
  }
  const projected = new THREE.Vector3()
  const camRight = new THREE.Vector3()
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
    // あそびかたツアー: ライリーと観察スポットの画面の位置（暗幕の穴と矢印を合わせる）
    if (guide.isActive()) {
      const pp = player.object.position
      const toScreen = (p: THREE.Vector3, lift: number) => {
        guideProj.copy(p).setY(p.y + lift).project(camera)
        return {
          x: ((guideProj.x + 1) / 2) * window.innerWidth,
          y: ((1 - guideProj.y) / 2) * window.innerHeight,
          onScreen: guideProj.z < 1 && Math.abs(guideProj.x) < 0.92 && Math.abs(guideProj.y) < 0.92,
          behind: guideProj.z >= 1,
          distance: Math.hypot(p.x - pp.x, p.z - pp.z),
        }
      }
      const riley = lions.find((l) => l.id === 'riley')
      guide.frame({
        riley: riley ? toScreen(riley.position, (riley.headHeight ?? 0.95) * riley.group.scale.y * 0.6) : null,
        spot: toScreen(spot.position, 1.6),
      })
    }
    if (hero) {
      // 入れ物が 1 コマで動いた量から、速さと空中かどうかを出してアニメを選ぶ（瞬間移動の時は速さ 0）
      const p = player.object.position
      const moved = Math.hypot(p.x - heroPrev.x, p.z - heroPrev.z)
      const speed = dt > 0 && moved < 2 ? moved / dt : 0
      heroSpeed += (speed - heroSpeed) * Math.min(1, dt * 12)
      heroPrev.copy(p)
      if (hero.update(dt, heroSpeed, Math.max(0, p.y - terrainHeight(p.x, p.z))) && heroSpeed > 1) playStep(p.x, p.z)
    }
    {
      // がんばりゲージは主人公の頭の高さ（1.4m）の右に
      staminaProj.copy(player.object.position).setY(player.object.position.y + 1.4).project(camera)
      const vis = staminaProj.z < 1 && Math.abs(staminaProj.x) < 0.95 && Math.abs(staminaProj.y) < 0.95
      staminaUi.update(dt, player.stamina(), vis ? { x: ((staminaProj.x + 1) / 2) * window.innerWidth, y: ((1 - staminaProj.y) / 2) * window.innerHeight } : null)
    }
    props.update(time)
    sea.update(time)
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
    // そのワールドの BGM と環境音（変わった時だけクロスフェード）
    sound.setBgm(REGION_BGM[regionKey] ?? 'savanna')
    sound.setAmb(REGION_AMB[regionKey] ?? null)
    if (regionKey !== here.key) {
      here = worldSpots.find((w) => w.key === regionKey) ?? worldSpots[0]
      spot = here.spot
      spotHead.copy(spot.position).add(new THREE.Vector3(0, 2.2, 0))
      arrived = false
      showRegionTitle(regionKey)
      // 初めてのワールドなら、ドローンの空撮でまず全体を見せる
      startRegionFly(regionKey)
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
      for (const k of REGION_KEYS) {
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
    spot.update(time, distance, player.object.position)
    const wasArrived = arrived
    arrived = distance < SPOT.arriveRadius
    if (arrived && !wasArrived) guide.reach('spot')
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
          species: speciesOf(l.id),
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
        // 「〇〇のそばに来ました」の通知は出さない（頭の上の名前の札で分かる）
        guide.reach('near')
        if (lion.id === 'riley') guide.reach('nearRiley')
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

    // 着いている時は「スコープをのぞく」を双眼鏡の右上の吹き出しにする（双眼鏡が画面の外なら下のまん中のまま）
    if (arrived) {
      camRight.setFromMatrixColumn(camera.matrixWorld, 0).setY(0).normalize()
      // 双眼鏡の右上と左上（右に入らない時は左上に出す）
      projected.copy(spot.head).addScaledVector(camRight, 0.42).setY(spot.head.y + 0.22).project(camera)
      const rightX = ((projected.x + 1) / 2) * window.innerWidth
      const onScreen = projected.z < 1 && Math.abs(projected.x) < 0.95 && Math.abs(projected.y) < 0.95
      const topY = ((1 - projected.y) / 2) * window.innerHeight
      projected.copy(spot.head).addScaledVector(camRight, -0.42).setY(spot.head.y + 0.22).project(camera)
      const leftX = ((projected.x + 1) / 2) * window.innerWidth
      if (onScreen) {
        hud.setScopeAnchor({ x: rightX, leftX, y: topY })
      } else {
        hud.setScopeAnchor(null)
      }
    } else {
      hud.setScopeAnchor(null)
    }

    if (introOn) introCamera()
    sun.target.position.copy(player.object.position)
    sun.position.copy(player.object.position).add(sunOffset)
    sky.position.copy(camera.position)

    postfx.render()
    if (introOn) introAfterRender()

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
      heroId: () => heroId,
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
    toStart: () => {
      player.teleport(SPAWN.x, SPAWN.z, Math.PI)
    },
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
    prepareIntro: () => {
      introTitled = false
      introStart = null
      // 「動きをへらす」では空撮・寄り・引きとモザイクをせず、名前だけ出す（playIntro で）
      if (reduceMotionNow) return
      introOn = true
      introMosaic = true
      document.body.classList.add('world-intro')
      // 初めてのワールドなら空撮から、そうでなければ主人公の寄りから
      if (shouldFly(here.key)) {
        setupFly(here.key)
        flyCamera(0)
      } else {
        player.setIntro(0)
      }
      syncInput()
    },
    playIntro: () => {
      if (!introOn) {
        showRegionTitle(here.key)
        return Promise.resolve()
      }
      introStart = performance.now()
      return new Promise<void>((resolve) => {
        introDone = resolve
      })
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
    setHero: (id) => {
      heroTask = chooseHero(id)
    },
    heroReady: () => heroTask,
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
  sound.init()
  sound.setBgm('home')
  sound.setVoiceHero(getHeroId())
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
      // 初めて入る時はワールドの組み立てに時間がかかるので、幕が閉じた所で出発地のサバンナの曲へ替える
      // （待っている間もホームの曲が流れ続けていた。組み立て済みなら、最初のコマでいまいるワールドの曲になる）
      if (!world) sound.setBgm('savanna')
      // 裏での準備が間に合っていなければ、幕に「じゅんびちゅう」を出してから組み立てる
      shell.iris.setWaiting(true)
      if (!world) {
        await nextFrames(2)
        world = startWorld(canvas, shell)
      } else world.resume()
      // 選んだ子の読み込みを少しだけ待つ（入る演出の寄りで前の子が一瞬映らないように。遅い回線でも 2.5 秒で先へ進む）
      await Promise.race([world.heroReady(), new Promise((r) => window.setTimeout(r, 2500))])
      world.prepareIntro()
      shell.home.hide()
      document.body.classList.add('in-world')
      canvas.focus()
      await shell.iris.open()
      // 幕が開いたら入る演出（モザイク → 寄りから引き → ワールドの名前）。終わってからあそび方ナビを出す
      await world.playIntro()
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
    sound.setBgm('home')
    sound.setAmb(null)
    shell.home.show()
    document.body.classList.remove('in-world')
    await shell.iris.open()
    busy = false
  }

  shell.home.onEnter(() => {
    void enterWorld()
  })
  // 物語をみる: ホームの上で紙芝居を流し、最後の「のぞいてみる」まで見たら「だれで冒険する？」へ（とばした時はホームのまま）
  shell.home.onStory(async () => {
    if (busy) return
    busy = true
    let how: 'end' | 'skip' = 'skip'
    try {
      how = await shell.story.play()
    } finally {
      busy = false
    }
    if (how === 'end' && webgl) shell.home.openPick()
  })
  // だれで冒険する？: 保存して、組み立て済みのワールドなら主人公を替える（まだなら組み立てる時に読む）
  shell.home.onHero((id) => {
    setHeroId(id)
    sound.setVoiceHero(id)
    world?.setHero(id)
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
  // 立ち上げの画面（スプラッシュ）が出ている間に組み立てる（約 2 秒止まるのを、ホームが出たあとにしない）。
  // スプラッシュが先に消えた時（ホームの絵が 4 秒で届かない等）は、下の後回しの準備で組み立てる
  hideSplash(prewarm)
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
    // ほかのワールドにいても、ライリーに近いスタート地点から始める
    world?.toStart()
    void enterWorld()
  })
}

main()

/** プリミティブ版の体の長さ（群れの座標系の z 方向、頭から尾の先まで）。生成モデルの大きさをこれにそろえる */
function primitiveLength(group: THREE.Object3D, axis: 'y' | 'z' = 'z'): number {
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
  return box.getSize(new THREE.Vector3())[axis]
}
