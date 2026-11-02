import type { Animal } from '../data/animals'
import { resolveVideoSource } from '../video/source'

export interface ObserveView {
  open: (animal: Animal) => void
  close: () => void
  isOpen: () => boolean
  onClose: (fn: () => void) => void
}

/**
 * 観察画面。収録映像を HTML の <video> で重ねて再生する。
 * 再生はユーザーのタップで始める（自動再生しない）。映像が読めない時はポスターと再試行を出す。
 */
export function createObserveView(): ObserveView {
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

  const closeListeners: Array<() => void> = []
  let open = false
  let current: Animal | null = null

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

  const close = () => {
    if (!open) return
    open = false
    video.pause()
    root.hidden = true
    closeListeners.forEach((fn) => fn())
  }
  closeBtn.addEventListener('click', close)
  window.addEventListener('keydown', (e) => {
    if (open && e.key === 'Escape') close()
  })

  return {
    open: (animal) => {
      current = animal
      title.textContent = `${animal.name}たちの観察モニター`
      load(animal)
      root.hidden = false
      open = true
      closeBtn.focus()
    },
    close,
    isOpen: () => open,
    onClose: (fn) => {
      closeListeners.push(fn)
    },
  }
}
