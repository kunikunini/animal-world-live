import type { Animal } from '../data/animals'
import type { FriendBookStore } from '../data/friends'
import { formatMetDate } from '../data/friends'
import { resolveVideoSource } from '../video/source'
import { renderProfile } from './profile'
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

/**
 * 観察画面。収録映像を HTML の <video> で重ねて再生し、その下にプロフィールと「ともだちになる」。
 * 再生はユーザーのタップで始める（自動再生しない）。映像が読めない時はポスターと再試行を出す。
 */
export function createObserveView(store: FriendBookStore): ObserveView {
  const root = document.getElementById('observe') as HTMLElement
  const title = document.getElementById('observe-title') as HTMLElement
  const badge = document.getElementById('observe-badge') as HTMLElement
  const placeholderNote = document.getElementById('observe-placeholder') as HTMLElement
  const video = document.getElementById('observe-video') as HTMLVideoElement
  const poster = document.getElementById('observe-poster') as HTMLElement
  const posterText = document.getElementById('observe-poster-text') as HTMLElement
  const playBtn = document.getElementById('observe-play') as HTMLButtonElement
  const retryBtn = document.getElementById('observe-retry') as HTMLButtonElement
  const closeBtn = document.getElementById('observe-close') as HTMLButtonElement
  const profile = document.getElementById('observe-profile') as HTMLElement
  const befriendBtn = document.getElementById('befriend') as HTMLButtonElement
  const befriended = document.getElementById('befriended') as HTMLElement
  const befriendedDate = document.getElementById('befriended-date') as HTMLElement
  const toast = document.getElementById('befriend-toast') as HTMLElement
  const memoryNote = document.getElementById('befriend-memory-note') as HTMLElement

  const openListeners: Array<(open: boolean) => void> = []
  const befriendListeners: Array<(animal: Animal) => void> = []
  let open = false
  let current: Animal | null = null
  let reduceMotion = false
  let toastTimer = 0

  const showPoster = (text: string, canPlay: boolean, canRetry: boolean) => {
    poster.hidden = false
    posterText.textContent = text
    playBtn.hidden = !canPlay
    retryBtn.hidden = !canRetry
  }

  const load = (animal: Animal) => {
    const resolved = resolveVideoSource(animal.video)
    badge.textContent = '収録映像'
    placeholderNote.hidden = !(resolved?.placeholder ?? false)
    video.pause()
    video.removeAttribute('src')
    video.load()

    if (!resolved) {
      video.hidden = true
      showPoster('映像は準備中です', false, false)
      return
    }
    video.hidden = false
    video.src = resolved.url
    if (resolved.poster) video.poster = resolved.poster
    else video.removeAttribute('poster')
    video.load()
    showPoster('タップして再生', true, false)
  }

  /** 「ともだちになる」の状態。登録済みなら日付を見せ、ボタンは出さない */
  const renderFriendState = (animal: Animal) => {
    const entry = store.get(animal.id)
    befriendBtn.hidden = !!entry
    befriended.hidden = !entry
    if (entry) befriendedDate.textContent = formatMetDate(entry.firstMetAt)
    memoryNote.hidden = store.isPersistent
  }

  const play = async () => {
    try {
      await video.play()
      poster.hidden = true
    } catch (err) {
      console.warn('video play failed', err)
      showPoster('映像を再生できませんでした', false, true)
    }
  }

  video.addEventListener('error', () => {
    showPoster('映像を読み込めませんでした', false, true)
  })
  video.addEventListener('ended', () => {
    showPoster('もう一度見る', true, false)
  })

  playBtn.addEventListener('click', () => void play())
  retryBtn.addEventListener('click', () => {
    if (current) {
      load(current)
      void play()
    }
  })

  befriendBtn.addEventListener('click', () => {
    if (!current) return
    // ユーザー自身が押す瞬間。動物が承諾したという表現はしない
    store.add(current.id)
    renderFriendState(current)
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
      current = animal
      title.textContent = `${animal.name}たちの観察モニター`
      closeBtn.textContent = from === 'book' ? 'ともだち帳に戻る' : '世界に戻る'
      load(animal)
      profile.innerHTML = renderProfile(animal)
      renderFriendState(animal)
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
