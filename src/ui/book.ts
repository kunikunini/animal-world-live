import type { Animal } from '../data/animals'
import { getAnimal } from '../data/animals'
import type { FriendBookStore } from '../data/friends'
import { formatMetDate } from '../data/friends'

export interface BookView {
  open: () => void
  close: () => void
  isOpen: () => boolean
  onVisit: (fn: (animal: Animal) => void) => void
  onOpenChange: (fn: (open: boolean) => void) => void
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
}

function avatar(animal: Animal): string {
  if (animal.photo) return `<img class="book-avatar" src="${esc(animal.photo)}" alt="" />`
  return `<div class="book-avatar book-avatar-placeholder" aria-hidden="true">${esc(animal.name.slice(0, 1))}</div>`
}

/**
 * ともだち帳。出会って友達になった個体のページが並ぶ。
 * 収集率や「あと○頭」は出さない。カードの「会いに行く」で 3D を歩かずに映像へ直行する。
 */
export function createBookView(store: FriendBookStore): BookView {
  const root = document.getElementById('book') as HTMLElement
  const list = document.getElementById('book-list') as HTMLElement
  const empty = document.getElementById('book-empty') as HTMLElement
  const note = document.getElementById('book-note') as HTMLElement
  const closeBtn = document.getElementById('book-close') as HTMLButtonElement

  let open = false
  const visitListeners: Array<(animal: Animal) => void> = []
  const openListeners: Array<(open: boolean) => void> = []

  const render = () => {
    const entries = store.list()
    const cards = entries
      .map((e) => {
        const animal = getAnimal(e.animalId)
        if (!animal) return ''
        const marks = animal.identifyingMarks
          ? esc(animal.identifyingMarks)
          : '<span class="profile-pending">見分けポイントは準備中</span>'
        return `
          <li class="book-card">
            ${avatar(animal)}
            <div class="book-card-body">
              <h3 class="book-card-name">${esc(animal.name)}</h3>
              <p class="book-card-sub">${esc(animal.species)}</p>
              <p class="book-card-marks">${marks}</p>
              <p class="book-card-date">初めて出会った日: ${esc(formatMetDate(e.firstMetAt))}</p>
            </div>
            <button class="btn btn-primary btn-small" type="button" data-visit="${esc(animal.id)}">会いに行く</button>
          </li>`
      })
      .join('')
    list.innerHTML = cards
    empty.hidden = entries.length > 0
    note.hidden = store.isPersistent
  }

  list.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-visit]')
    if (!target) return
    const animal = getAnimal(target.dataset.visit ?? '')
    if (animal) visitListeners.forEach((fn) => fn(animal))
  })

  const setOpen = (next: boolean) => {
    if (open === next) return
    open = next
    root.hidden = !open
    if (open) {
      render()
      closeBtn.focus()
    }
    openListeners.forEach((fn) => fn(open))
  }

  closeBtn.addEventListener('click', () => setOpen(false))
  window.addEventListener('keydown', (e) => {
    if (open && e.key === 'Escape') setOpen(false)
  })
  store.onChange(() => {
    if (open) render()
  })

  return {
    open: () => setOpen(true),
    close: () => setOpen(false),
    isOpen: () => open,
    onVisit: (fn) => {
      visitListeners.push(fn)
    },
    onOpenChange: (fn) => {
      openListeners.push(fn)
    },
  }
}
