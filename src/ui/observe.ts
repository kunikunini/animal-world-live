import type { Animal } from '../data/animals'
import { ANIMALS } from '../data/animals'
import type { EncounterStore } from '../data/encounters'
import type { FriendBookStore } from '../data/friends'
import { formatMetDate } from '../data/friends'
import { resolveVideoSource } from '../video/source'
import { faceMarkup } from './faces'
import { esc } from './html'
import { renderHero, renderProfile } from './profile'
import { sound } from '../audio/sound'
import { animalName, getLang, speciesName, t } from './i18n'
import { refreshIn, setViewOpen } from './transition'

export type ObserveOrigin = 'world' | 'book'

export interface ObserveView {
  open: (animal: Animal, from: ObserveOrigin) => void
  close: () => void
  isOpen: () => boolean
  onOpenChange: (fn: (open: boolean) => void) => void
  /** 「ともだちになる」が押された直後 */
  onBefriend: (fn: (animal: Animal) => void) => void
  /** 登録直後の「ともだち帳を見る」 */
  onSeeBook: (fn: (animal: Animal) => void) => void
  setReduceMotion: (on: boolean) => void
}

/** 祝いの星。帯の周りに 8 個、散る方向を CSS 変数で渡す */
const STARS = [
  [-6, -8, -14, -34],
  [18, -16, 10, -30],
  [44, -4, 22, -28],
  [62, -14, 28, -22],
  [78, 6, 32, -16],
  [8, 18, -24, 12],
  [30, 22, -6, 26],
  [66, 20, 20, 22],
]

/**
 * 観察モニター。映像 → 顔と名前 → ともだちになる → 項目カードの順。
 * 出会った個体のチップ（顔）で家族を切り替えられる。
 * 開いた瞬間に再生を始める。音声付きが拒否されたらミュートで再生し「音を出す」を出す。
 * 映像が無い個体は「準備中」を正直に出す（偽の映像は入れない）。
 */
export function createObserveView(store: FriendBookStore, met: EncounterStore): ObserveView {
  const root = document.getElementById('observe') as HTMLElement
  const title = document.getElementById('observe-title') as HTMLElement
  const chips = document.getElementById('observe-chips') as HTMLElement
  const hero = document.getElementById('observe-hero') as HTMLElement
  const badge = document.getElementById('observe-badge') as HTMLElement
  const placeholderNote = document.getElementById('observe-placeholder') as HTMLElement
  const groupNote = document.getElementById('observe-group-note') as HTMLElement
  const badgeStaff = document.getElementById('observe-badge-staff') as HTMLElement
  const videoBox = document.querySelector('#observe .m-video') as HTMLElement
  const poster = document.getElementById('observe-poster') as HTMLElement
  const posterFace = document.getElementById('observe-poster-face') as HTMLElement
  const posterText = document.getElementById('observe-poster-text') as HTMLElement
  const retryBtn = document.getElementById('observe-retry') as HTMLButtonElement
  const unmuteBtn = document.getElementById('observe-unmute') as HTMLButtonElement
  const closeBtn = document.getElementById('observe-close') as HTMLButtonElement
  const profile = document.getElementById('observe-profile') as HTMLElement
  const befriendBtn = document.getElementById('befriend') as HTMLButtonElement
  const befriended = document.getElementById('befriended') as HTMLElement
  const befriendedDate = document.getElementById('befriended-date') as HTMLElement
  const befriendedText = document.getElementById('befriended-text') as HTMLElement
  const seeBookBtn = document.getElementById('befriend-see') as HTMLButtonElement
  const seeBookLabel = document.getElementById('befriend-see-label') as HTMLElement
  const stars = document.getElementById('befriend-stars') as HTMLElement
  const status = document.getElementById('befriend-status') as HTMLElement
  const memoryNote = document.getElementById('befriend-memory-note') as HTMLElement

  const openListeners: Array<(open: boolean) => void> = []
  const befriendListeners: Array<(animal: Animal) => void> = []
  const seeBookListeners: Array<(animal: Animal) => void> = []
  let open = false
  let current: Animal | null = null
  let origin: ObserveOrigin = 'world'
  let reduceMotion = false
  let starTimer = 0
  /** いま <video> に入っている URL。家族で同じ映像を共有する個体へ切り替えた時は読み直さない */
  let loadedUrl = ''
  /** 読み込みの世代。古い play() の結果は捨てる */
  let loadSeq = 0
  /** 試す URL の並び（第一が R2、予備がリポジトリ内）と、いま何番目か */
  let sources: string[] = []
  let sourceIndex = 0
  /**
   * モニターの <video>。開く時にその 1 本だけ作り、閉じたら要素ごと捨てる（スマホのメモリ。閉じた後に前の映像を読んだまま残さない）。
   * 閉じている間は null。開いている間は必ずある（映像の無い子では hidden のまま src を入れない）
   */
  let video: HTMLVideoElement = null as unknown as HTMLVideoElement
  let hasVideo = false

  const showPoster = (text: string, canRetry: boolean) => {
    poster.hidden = false
    posterText.textContent = text
    retryBtn.hidden = !canRetry
    posterFace.innerHTML = current ? faceMarkup(current) : ''
  }

  /** まず音声付きで再生し（「音声」がオフなら音なし）、拒否されたらミュートで再生して「音を出す」を見せる */
  const play = async (seq: number) => {
    unmuteBtn.hidden = true
    try {
      // 設定の「音声」がオフの時は、映像も音なしで流す（映像の操作から音を出すことはできる）
      video.muted = !sound.soundOn
      await video.play()
      if (seq !== loadSeq) return
      poster.hidden = true
    } catch (err) {
      if (seq !== loadSeq) return
      if ((err as DOMException).name === 'AbortError') return
      try {
        video.muted = true
        await video.play()
        if (seq !== loadSeq) return
        poster.hidden = true
        unmuteBtn.hidden = false
      } catch (err2) {
        if (seq !== loadSeq) return
        console.warn('video play failed', err2)
        showPoster(t('videoFailed'), true)
      }
    }
  }

  const load = (animal: Animal) => {
    const resolved = resolveVideoSource(animal.video)
    const seq = ++loadSeq
    badge.hidden = !resolved
    badgeStaff.hidden = !(resolved && animal.video.staff)
    // 縦長の映像: 左右に、表紙（左右をぼかして 16:9 にした物）を敷いて中央に出す。2 本目の <video> は使わない（スマホのメモリ）
    const portrait = !!resolved && animal.video.portrait === true && !!resolved.poster
    video.classList.toggle('is-portrait', portrait)
    video.style.backgroundImage = portrait ? `url("${resolved.poster}")` : ''
    placeholderNote.hidden = !(resolved?.placeholder ?? false)
    // 種のみんなの映像: この子が映っているとは言わない
    const group = resolved ? animal.videoGroup : undefined
    groupNote.hidden = !group
    if (group) groupNote.textContent = t('videoGroupNote', { label: group.label ? group.label[getLang()] : speciesName(animal.species) })

    if (!resolved) {
      video.pause()
      video.removeAttribute('src')
      video.removeAttribute('poster')
      video.load()
      loadedUrl = ''
      video.hidden = true
      unmuteBtn.hidden = true
      showPoster(t('videoPending'), false)
      return
    }

    video.hidden = false
    if (loadedUrl === resolved.url && !video.error) {
      // 同じ映像（家族で共有）。止めずにそのまま
      poster.hidden = true
      if (video.paused) void play(seq)
      return
    }
    loadedUrl = resolved.url
    sources = [resolved.url, resolved.fallbackUrl].filter(Boolean)
    sourceIndex = 0
    if (resolved.poster) video.poster = resolved.poster
    else video.removeAttribute('poster')
    applySource(seq)
  }

  /** sources[sourceIndex] を <video> に入れて再生を始める */
  const applySource = (seq: number) => {
    video.pause()
    video.src = sources[sourceIndex]
    video.load()
    poster.hidden = true
    void play(seq)
  }

  /**
   * 「ともだちになる」の状態。登録済みなら帯を見せ、ボタンは出さない。
   * 登録したばかりでまだ帳で見ていない子は「加わりました」。登録済みなら、どこから開いても帳へ行くボタンを出す
   * （帳から開いた時は、下に開いている帳へ戻る）
   */
  const renderFriendState = (animal: Animal) => {
    const entry = store.get(animal.id)
    const fresh = entry?.seenAt === null
    befriendBtn.hidden = !!entry
    befriended.hidden = !entry
    befriended.classList.toggle('is-fresh', fresh)
    befriendedText.textContent = fresh ? t('addedBook') : t('inBook')
    seeBookBtn.hidden = !entry
    seeBookLabel.textContent = origin === 'book' ? t('backBook') : t('seeBook')
    if (entry) befriendedDate.textContent = formatMetDate(entry.firstMetAt)
    memoryNote.hidden = store.isPersistent
  }

  /** 祝い: 金の星が帯の周りに散る。動きをへらす時は静かに出して消す */
  const celebrate = () => {
    window.clearTimeout(starTimer)
    stars.innerHTML = STARS.map(
      ([x, y, dx, dy]) =>
        `<svg viewBox="0 0 24 24" style="left:${x}%;top:${y}px;--dx:${dx}px;--dy:${dy}px"><use href="#i-star" /></svg>`,
    ).join('')
    stars.classList.remove('is-burst', 'is-still')
    void stars.offsetWidth
    stars.classList.add(reduceMotion ? 'is-still' : 'is-burst')
    starTimer = window.setTimeout(
      () => {
        stars.classList.remove('is-burst', 'is-still')
        stars.innerHTML = ''
      },
      reduceMotion ? 1600 : 900,
    )
  }

  /** 出会った個体のチップ（顔）。未出会いの個体は出さない（地図と同じルール）。2頭以上で見せる。
   *  いま見ている子と同じワールド・同じ種の子だけ（ライオンの家族の切り替え用。ほかのワールドの子は混ぜない） */
  const renderChips = () => {
    const metAnimals = ANIMALS.filter(
      (a) => met.has(a.id) && a.species === current?.species && a.world === current?.world,
    )
    chips.hidden = metAnimals.length < 2
    chips.innerHTML = metAnimals
      .map((a) => {
        const isCurrent = a.id === current?.id
        return `
          <button class="chip${isCurrent ? ' is-current' : ''}" type="button" role="tab" aria-selected="${isCurrent}" data-animal="${esc(a.id)}">
            <span class="chip-face">${faceMarkup(a)}</span>
            <span class="chip-name">${esc(animalName(a))}</span>
          </button>`
      })
      .join('')
  }

  const show = (animal: Animal) => {
    current = animal
    title.textContent = t('monitorOf', { name: animalName(animal) })
    hero.innerHTML = renderHero(animal)
    load(animal)
    profile.innerHTML = renderProfile(animal)
    befriended.classList.remove('is-pop')
    renderFriendState(animal)
    renderChips()
  }

  chips.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-animal]')
    if (!target) return
    const animal = ANIMALS.find((a) => a.id === target.dataset.animal)
    if (animal && animal.id !== current?.id) {
      show(animal)
      // 家族の切り替え: 顔と名前・帯・項目をふわっと入れ直す
      refreshIn(hero, befriended, profile)
    }
  })

  met.onChange(() => {
    if (open) renderChips()
  })

  retryBtn.addEventListener('click', () => {
    if (current && hasVideo) {
      loadedUrl = ''
      load(current)
    }
  })

  unmuteBtn.addEventListener('click', () => {
    // ユーザーのタップなので音を出せる
    if (!hasVideo) return
    video.muted = false
    unmuteBtn.hidden = true
  })

  /**
   * 全画面とピクチャーインピクチャー。<video controls> の操作から入れる（iPhone は専用の全画面プレーヤー）。
   * - 戻ってきた時: iPhone の Safari で、全画面から戻った後に「戻る」が効かなくなる報告があった（このリポジトリの環境では再現できていない）。
   *   ページの位置を 0 に戻し、観察モニターの重なりを作り直し、フォーカスを「戻る」へ戻す
   * - 閉じる時: 全画面・ピクチャーインピクチャーのままなら先に普通の表示へ戻す（閉じた後に映像だけ浮いて残らないように）
   */
  type FsVideo = HTMLVideoElement & {
    webkitDisplayingFullscreen?: boolean
    webkitExitFullscreen?: () => void
    webkitPresentationMode?: string
    webkitSetPresentationMode?: (mode: string) => void
  }
  const resetScroll = () => {
    window.scrollTo(0, 0)
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
  }
  const afterFullscreen = () => {
    if (!open) return
    resetScroll()
    root.classList.add('is-relayer')
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        root.classList.remove('is-relayer')
        resetScroll()
        if (open) closeBtn.focus({ preventScroll: true })
      }),
    )
    // iPhone は全画面を閉じるアニメーションの後にもう一度位置が動くことがある
    window.setTimeout(resetScroll, 400)
  }
  const onFullscreenChange = () => {
    const d = document as Document & { webkitFullscreenElement?: Element | null }
    if (!document.fullscreenElement && !d.webkitFullscreenElement) afterFullscreen()
  }
  document.addEventListener('fullscreenchange', onFullscreenChange)
  document.addEventListener('webkitfullscreenchange', onFullscreenChange)

  /** モニターの <video> を作る（開く時に 1 回）。属性は前の index.html の物と同じ */
  const createVideo = () => {
    const v = document.createElement('video')
    v.id = 'observe-video'
    v.className = 'observe-video'
    v.playsInline = true
    v.setAttribute('playsinline', '')
    v.loop = true
    v.preload = 'metadata'
    v.controls = true
    v.setAttribute('controlslist', 'nodownload')
    v.hidden = true
    v.addEventListener('error', () => {
      if (v !== video || v.hidden || !v.getAttribute('src')) return
      if (sourceIndex + 1 < sources.length) {
        // 配信元（R2）が読めない時はリポジトリ内の予備へ
        console.warn('video source failed, trying fallback', sources[sourceIndex])
        sourceIndex++
        applySource(++loadSeq)
        return
      }
      showPoster(t('videoLoadFailed'), true)
    })
    // 動画の操作（全画面の中など）で音を出した時も「音を出す」を消す（残ったままにしない）
    v.addEventListener('volumechange', () => {
      if (!v.muted) unmuteBtn.hidden = true
    })
    v.addEventListener('webkitendfullscreen', afterFullscreen)
    v.addEventListener('leavepictureinpicture', afterFullscreen)
    videoBox.insertBefore(v, poster)
    video = v
    hasVideo = true
    loadedUrl = ''
  }

  /** 閉じた時: 再生を止め、読み込みを捨て、要素ごと外す */
  const destroyVideo = () => {
    if (!hasVideo) return
    const v = video
    hasVideo = false
    video = null as unknown as HTMLVideoElement
    loadedUrl = ''
    sources = []
    try {
      v.pause()
      v.removeAttribute('src')
      v.removeAttribute('poster')
      v.load()
    } catch {
      // 外す処理は続ける
    }
    v.remove()
  }

  const leaveFullscreen = () => {
    if (!hasVideo) return
    const fsVideo = video as FsVideo
    try {
      if (fsVideo.webkitDisplayingFullscreen) fsVideo.webkitExitFullscreen?.()
    } catch {
      // 戻せなくても閉じる処理は続ける
    }
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
    if (document.pictureInPictureElement === video) void document.exitPictureInPicture().catch(() => undefined)
    try {
      if (fsVideo.webkitPresentationMode && fsVideo.webkitPresentationMode !== 'inline') fsVideo.webkitSetPresentationMode?.('inline')
    } catch {
      // 同上
    }
  }

  befriendBtn.addEventListener('click', () => {
    if (!current) return
    // ユーザー自身が押す瞬間。動物が承諾したという表現はしない
    store.add(current.id)
    renderFriendState(current)
    befriended.classList.remove('is-pop')
    if (!reduceMotion) {
      void befriended.offsetWidth
      befriended.classList.add('is-pop')
    }
    celebrate()
    sound.play('friend')
    // ユーザーが押した喜び（「よしっ」「やったー！」）。動物が承諾したという言い方はしない
    sound.say('friend', 650)
    status.textContent = t('addedStatus', { name: animalName(current) })
    // 押したボタンは消えるので、次の行き先へフォーカスを移す（キーボード・読み上げの人が迷わない）
    if (!seeBookBtn.hidden) seeBookBtn.focus()
    else closeBtn.focus()
    befriendListeners.forEach((fn) => fn(current as Animal))
  })

  seeBookBtn.addEventListener('click', () => {
    if (current) seeBookListeners.forEach((fn) => fn(current as Animal))
  })

  const setOpen = (next: boolean) => {
    if (open === next) return
    open = next
    setViewOpen(root, open)
    if (!open) {
      leaveFullscreen()
      loadSeq++
      destroyVideo()
      status.textContent = ''
    }
    openListeners.forEach((fn) => fn(open))
  }

  closeBtn.addEventListener('click', () => setOpen(false))
  // パネルの外（暗い地の部分）を押しても戻れる。PC では浮いたカードの周り
  root.addEventListener('click', (e) => {
    if (open && e.target === root) setOpen(false)
  })
  window.addEventListener('keydown', (e) => {
    if (open && e.key === 'Escape') {
      // 下に開いているともだち帳まで閉じないように、ここで止める
      e.stopImmediatePropagation()
      setOpen(false)
    }
  })

  return {
    open: (animal, from) => {
      origin = from
      const backLabel = from === 'book' ? t('backBook') : t('backWorld')
      closeBtn.setAttribute('aria-label', backLabel)
      closeBtn.title = backLabel
      if (!hasVideo) createVideo()
      show(animal)
      setOpen(true)
      closeBtn.focus()
    },
    close: () => setOpen(false),
    isOpen: () => open,
    onOpenChange: (fn) => {
      openListeners.push(fn)
    },
    onBefriend: (fn) => {
      befriendListeners.push(fn)
    },
    onSeeBook: (fn) => {
      seeBookListeners.push(fn)
    },
    setReduceMotion: (on) => {
      reduceMotion = on
    },
  }
}
