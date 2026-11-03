import type { Animal } from '../data/animals'
import { getAnimal } from '../data/animals'
import type { FriendBookStore } from '../data/friends'
import { formatMetDateShort } from '../data/friends'
import { faceMarkup } from './faces'

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

/**
 * ともだち帳。出会って友達になった個体の顔が並ぶ。
 * 収集率や「あと○頭」は出さない。カード全体が「会いに行く」で、3D を歩かずに映像へ直行する。
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
        return `
          <li>
            <button class="fcard" type="button" data-visit="${esc(animal.id)}" aria-label="${esc(animal.name)}に会いに行く">
              <span class="fface">${faceMarkup(animal)}<span class="badge-see" aria-hidden="true"><svg><use href="#i-bino" /></svg></span></span>
              <span class="fname">${esc(animal.name)}</span>
              <span class="fsub">${esc(formatMetDateShort(e.firstMetAt))}に出会った</span>
            </button>
          </li>`
      })
      .join('')
    list.innerHTML = cards
    list.hidden = entries.length === 0
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
  // 幕のタップで閉じる（シートの中は閉じない）
  root.addEventListener('click', (e) => {
    if (e.target === root) setOpen(false)
  })
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
