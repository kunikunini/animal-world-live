import type { Animal } from '../data/animals'
import { ANIMALS } from '../data/animals'
import type { EncounterStore } from '../data/encounters'
import type { FriendBookStore } from '../data/friends'
import { formatMetDate } from '../data/friends'
import { resolveVideoSource } from '../video/source'
import { faceMarkup } from './faces'
import { renderHero, renderProfile } from './profile'
import { playFriendChime } from './chime'

export type ObserveOrigin = 'world' | 'book'

export interface ObserveView {
  open: (animal: Animal, from: ObserveOrigin) => void
  close: () => void
  isOpen: () => boolean
  onOpenChange: (fn: (open: boolean) => void) => void
  /** 「ともだちになる」が押された直後 */
  onBefriend: (fn: (animal: Animal) => void) => void
  setReduceMotion: (on: boolean) => void
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
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
  const video = document.getElementById('observe-video') as HTMLVideoElement
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
  const stars = document.getElementById('befriend-stars') as HTMLElement
  const toast = document.getElementById('befriend-toast') as HTMLElement
  const memoryNote = document.getElementById('befriend-memory-note') as HTMLElement

  const openListeners: Array<(open: boolean) => void> = []
  const befriendListeners: Array<(animal: Animal) => void> = []
  let open = false
  let current: Animal | null = null
  let reduceMotion = false
  let toastTimer = 0
  let starTimer = 0
  /** いま <video> に入っている URL。家族で同じ映像を共有する個体へ切り替えた時は読み直さない */
  let loadedUrl = ''
  /** 読み込みの世代。古い play() の結果は捨てる */
  let loadSeq = 0
  /** 試す URL の並び（第一が R2、予備がリポジトリ内）と、いま何番目か */
  let sources: string[] = []
  let sourceIndex = 0

  const showPoster = (text: string, canRetry: boolean) => {
    poster.hidden = false
    posterText.textContent = text
    retryBtn.hidden = !canRetry
    posterFace.innerHTML = current ? faceMarkup(current) : ''
  }

  /** まず音声付きで再生し、拒否されたらミュートで再生して「音を出す」を見せる */
  const play = async (seq: number) => {
    unmuteBtn.hidden = true
    try {
      video.muted = false
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
        showPoster('映像を再生できませんでした', true)
      }
    }
  }

  const load = (animal: Animal) => {
    const resolved = resolveVideoSource(animal.video)
    const seq = ++loadSeq
    badge.hidden = !resolved
    placeholderNote.hidden = !(resolved?.placeholder ?? false)

    if (!resolved) {
      video.pause()
      video.removeAttribute('src')
      video.removeAttribute('poster')
      video.load()
      loadedUrl = ''
      video.hidden = true
      unmuteBtn.hidden = true
      showPoster('映像は準備中です', false)
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

  /** 「ともだちになる」の状態。登録済みなら帯を見せ、ボタンは出さない */
  const renderFriendState = (animal: Animal) => {
    const entry = store.get(animal.id)
    befriendBtn.hidden = !!entry
    befriended.hidden = !entry
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

  /** 出会った個体のチップ（顔）。未出会いの個体は出さない（地図と同じルール）。2頭以上で見せる */
  const renderChips = () => {
    const metAnimals = ANIMALS.filter((a) => met.has(a.id))
    chips.hidden = metAnimals.length < 2
    chips.innerHTML = metAnimals
      .map((a) => {
        const isCurrent = a.id === current?.id
        return `
          <button class="chip${isCurrent ? ' is-current' : ''}" type="button" role="tab" aria-selected="${isCurrent}" data-animal="${esc(a.id)}">
            <span class="chip-face">${faceMarkup(a)}</span>
            <span class="chip-name">${esc(a.name)}</span>
          </button>`
      })
      .join('')
  }

  const show = (animal: Animal) => {
    current = animal
    title.textContent = `${animal.name}の観察モニター`
    hero.innerHTML = renderHero(animal)
    load(animal)
    profile.innerHTML = renderProfile(animal)
    renderFriendState(animal)
    renderChips()
  }

  chips.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-animal]')
    if (!target) return
    const animal = ANIMALS.find((a) => a.id === target.dataset.animal)
    if (animal && animal.id !== current?.id) show(animal)
  })

  met.onChange(() => {
    if (open) renderChips()
  })

  video.addEventListener('error', () => {
    if (video.hidden) return
    if (sourceIndex + 1 < sources.length) {
      // 配信元（R2）が読めない時はリポジトリ内の予備へ
      console.warn('video source failed, trying fallback', sources[sourceIndex])
      sourceIndex++
      applySource(++loadSeq)
      return
    }
    showPoster('映像を読み込めませんでした', true)
  })

  retryBtn.addEventListener('click', () => {
    if (current) {
      loadedUrl = ''
      load(current)
    }
  })

  unmuteBtn.addEventListener('click', () => {
    // ユーザーのタップなので音を出せる
    video.muted = false
    unmuteBtn.hidden = true
  })

  befriendBtn.addEventListener('click', () => {
    if (!current) return
    // ユーザー自身が押す瞬間。動物が承諾したという表現はしない
    store.add(current.id)
    renderFriendState(current)
    celebrate()
    playFriendChime()
    toast.hidden = false
    toast.classList.toggle('is-animated', !reduceMotion)
    window.clearTimeout(toastTimer)
    toastTimer = window.setTimeout(() => {
      toast.hidden = true
    }, 2600)
    befriendListeners.forEach((fn) => fn(current as Animal))
  })

  const setOpen = (next: boolean) => {
    if (open === next) return
    open = next
    root.hidden = !open
    if (!open) {
      loadSeq++
      video.pause()
      toast.hidden = true
    }
    openListeners.forEach((fn) => fn(open))
  }

  closeBtn.addEventListener('click', () => setOpen(false))
  window.addEventListener('keydown', (e) => {
    if (open && e.key === 'Escape') {
      // 下に開いているともだち帳まで閉じないように、ここで止める
      e.stopImmediatePropagation()
      setOpen(false)
    }
  })

  return {
    open: (animal, from) => {
      const backLabel = from === 'book' ? 'ともだち帳に戻る' : '世界に戻る'
      closeBtn.setAttribute('aria-label', backLabel)
      closeBtn.title = backLabel
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
    setReduceMotion: (on) => {
      reduceMotion = on
    },
  }
}
