import type { Animal } from '../data/animals'
import { getAnimal } from '../data/animals'
import type { FriendBookStore } from '../data/friends'
import { formatMetDateShort } from '../data/friends'
import { faceMarkup } from './faces'
import { esc } from './html'
import { animalName, t } from './i18n'
import { setViewOpen } from './transition'

/** 帳をどこから開いたか。ホームからなら「のぞいてみる」、ワールドからなら「ワールドに戻る」 */
export type BookOrigin = 'home' | 'world'

export interface BookView {
  open: (from: BookOrigin) => void
  close: () => void
  isOpen: () => boolean
  onVisit: (fn: (animal: Animal) => void) => void
  onOpenChange: (fn: (open: boolean) => void) => void
  /** 観察モニターから帳へ戻ってきた時、さっき押したカードにフォーカスを戻す */
  restoreFocus: () => void
  setReduceMotion: (on: boolean) => void
  /** 帳の下の「のぞいてみる／ワールドに戻る」。行き止まりにしないための出口 */
  onGoWorld: (fn: (from: BookOrigin) => void) => void
  /** WebGL が無い時: ホームから開いた帳には「のぞいてみる」を出さない */
  setCanEnterWorld: (on: boolean) => void
}

/**
 * ともだち帳。出会って友達になった個体の顔が並ぶ。
 * 収集率や「あと○頭」は出さない。カード全体が「会いに行く」で、3D を歩かずに映像へ直行する。
 * 登録してからまだ帳で見ていない子には「あたらしい」の札と金の輪。帳を閉じたら見たことにする
 * （開いている間は印を残し、次に開いた時には消えている）。
 */
export function createBookView(store: FriendBookStore): BookView {
  const root = document.getElementById('book') as HTMLElement
  const list = document.getElementById('book-list') as HTMLElement
  const empty = document.getElementById('book-empty') as HTMLElement
  const note = document.getElementById('book-note') as HTMLElement
  const closeBtn = document.getElementById('book-close') as HTMLButtonElement
  const worldBtn = document.getElementById('book-world') as HTMLButtonElement
  const worldLabel = document.getElementById('book-world-label') as HTMLElement

  let open = false
  let reduceMotion = false
  /** 今回開いた時点で新着だった子。閉じる時に見たことにする */
  let freshIds: string[] = []
  let lastVisitId = ''
  let origin: BookOrigin = 'world'
  let canEnterWorld = true
  const worldListeners: Array<(from: BookOrigin) => void> = []
  const visitListeners: Array<(animal: Animal) => void> = []
  const openListeners: Array<(open: boolean) => void> = []

  const render = () => {
    const entries = store.list()
    const cards = entries
      .map((e) => {
        const animal = getAnimal(e.animalId)
        if (!animal) return ''
        const fresh = freshIds.includes(animal.id)
        const name = animalName(animal)
        const label = fresh ? t('visitNew', { name }) : t('visit', { name })
        return `
          <li>
            <button class="fcard${fresh ? ' is-new' : ''}" type="button" data-visit="${esc(animal.id)}" aria-label="${esc(label)}">
              <span class="fface">${faceMarkup(animal)}<span class="badge-see" aria-hidden="true"><svg><use href="#i-bino" /></svg></span></span>
              ${fresh ? `<span class="tag-new" aria-hidden="true"><svg><use href="#i-sparkle" /></svg>${esc(t('tagNew'))}</span>` : ''}
              <span class="fname">${esc(name)}</span>
              <span class="fsub">${esc(t('metOn', { date: formatMetDateShort(e.firstMetAt) }))}</span>
            </button>
          </li>`
      })
      .join('')
    list.innerHTML = cards
    list.classList.toggle('is-still', reduceMotion)
    list.hidden = entries.length === 0
    empty.hidden = entries.length > 0
    note.hidden = store.isPersistent
  }

  const cardOf = (id: string) => list.querySelector<HTMLButtonElement>(`button[data-visit="${CSS.escape(id)}"]`)

  list.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-visit]')
    if (!target) return
    const animal = getAnimal(target.dataset.visit ?? '')
    if (!animal) return
    lastVisitId = animal.id
    visitListeners.forEach((fn) => fn(animal))
  })

  const setOpen = (next: boolean) => {
    if (open === next) return
    open = next
    setViewOpen(root, open)
    if (open) {
      worldLabel.textContent = origin === 'home' ? t('peek') : t('toWorld')
      worldBtn.hidden = origin === 'home' && !canEnterWorld
      freshIds = store.unseen().map((e) => e.animalId)
      lastVisitId = ''
      render()
      closeBtn.focus()
      // 新しい子が見えるところへ（帳が長くなっても見落とさない）
      const first = freshIds[0] ? cardOf(freshIds[0]) : null
      first?.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' })
    } else {
      const seen = freshIds
      freshIds = []
      store.markSeen(seen)
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
  worldBtn.addEventListener('click', () => {
    worldListeners.forEach((fn) => fn(origin))
  })
  store.onChange(() => {
    if (!open) return
    // 帳から開いたモニターで新しく登録した子も「あたらしい」に入れ、閉じる時に見たことにする
    for (const e of store.unseen()) if (!freshIds.includes(e.animalId)) freshIds.push(e.animalId)
    render()
  })

  return {
    open: (from) => {
      if (!open) origin = from
      setOpen(true)
    },
    close: () => setOpen(false),
    isOpen: () => open,
    onVisit: (fn) => {
      visitListeners.push(fn)
    },
    onOpenChange: (fn) => {
      openListeners.push(fn)
    },
    restoreFocus: () => {
      if (!open) return
      ;(cardOf(lastVisitId) ?? closeBtn).focus()
    },
    setReduceMotion: (on) => {
      reduceMotion = on
      list.classList.toggle('is-still', on)
    },
    onGoWorld: (fn) => {
      worldListeners.push(fn)
    },
    setCanEnterWorld: (on) => {
      canEnterWorld = on
    },
  }
}
