import type { Animal } from '../data/animals'
import { getAnimal } from '../data/animals'
import type { FriendBookStore } from '../data/friends'
import { createLetterStore } from '../data/letters'
import { WORLDS } from '../data/worlds'
import type { WorldKey } from '../data/worlds'
import { createChatView, formatWhen } from './chat'
import { faceMarkup } from './faces'
import { esc } from './html'
import { animalName, getLang, onLangChange, t } from './i18n'
import { refreshIn, setViewOpen } from './transition'

/** 帳をどこから開いたか。ホームからなら「のぞいてみる」、ワールドからなら「ワールドに戻る」 */
export type BookOrigin = 'home' | 'world'

export interface BookView {
  open: (from: BookOrigin) => void
  close: () => void
  isOpen: () => boolean
  onVisit: (fn: (animal: Animal) => void) => void
  onOpenChange: (fn: (open: boolean) => void) => void
  /** 観察モニターから帳へ戻ってきた時、さっき押したところにフォーカスを戻す */
  restoreFocus: () => void
  setReduceMotion: (on: boolean) => void
  /** 帳の下の「ワールド／のぞいてみる」。行き止まりにしないための出口 */
  onGoWorld: (fn: (from: BookOrigin) => void) => void
  /** WebGL が無い時: ホームから開いた帳には「のぞいてみる」を出さない */
  setCanEnterWorld: (on: boolean) => void
}

type Filter = 'all' | 'new' | WorldKey

/**
 * ともだち帳。LINE のトーク一覧に似た形で、ともだちになった個体が 1 行ずつ並ぶ（収集率や「あと○頭」は出さない）。
 * 行を押すとその子のトーク画面（chat.ts）。そこから「会いに行く」で、3D を歩かずに映像へ直行する。
 * 登録してからまだ帳で見ていない子には「あたらしい」の印。そのトークを開くか、帳を閉じたら見たことにする。
 */
export function createBookView(store: FriendBookStore): BookView {
  const root = document.getElementById('book') as HTMLElement
  const listPage = document.getElementById('book-list-page') as HTMLElement
  const list = document.getElementById('book-list') as HTMLElement
  const chips = document.getElementById('book-chips') as HTMLElement
  const empty = document.getElementById('book-empty') as HTMLElement
  const note = document.getElementById('book-note') as HTMLElement
  const closeBtn = document.getElementById('book-close') as HTMLButtonElement
  const worldBtn = document.getElementById('book-world') as HTMLButtonElement
  const worldLabel = document.getElementById('book-world-label') as HTMLElement

  const letters = createLetterStore()
  const chat = createChatView(letters, (id) => store.get(id)?.firstMetAt)

  let open = false
  let reduceMotion = false
  /** 今回開いた時点で新着だった子。閉じる時に見たことにする */
  let freshIds: string[] = []
  let lastRowId = ''
  let origin: BookOrigin = 'world'
  let canEnterWorld = true
  let filter: Filter = 'all'
  const worldListeners: Array<(from: BookOrigin) => void> = []
  const visitListeners: Array<(animal: Animal) => void> = []
  const openListeners: Array<(open: boolean) => void> = []

  interface Row {
    animal: Animal
    fresh: boolean
    preview: string
    /** 並び順と右端の時刻に使う（いちばん新しい出来事） */
    at: string
  }

  const rows = (): Row[] =>
    store
      .list()
      .map((e): Row | null => {
        const animal = getAnimal(e.animalId)
        if (!animal) return null
        const last = letters.lastFor(animal.id)
        const preview = last ? last.text : animal.video.url ? t('sysVideo', { name: animalName(animal) }) : t('metOn', { date: formatWhen(e.firstMetAt) })
        return { animal, fresh: freshIds.includes(animal.id), preview, at: last ? last.sentAt : e.firstMetAt }
      })
      .filter((r): r is Row => r !== null)
      .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))

  const matches = (r: Row) => filter === 'all' || (filter === 'new' ? r.fresh : r.animal.world === filter)

  const renderChips = (all: Row[]) => {
    const worlds = WORLDS.filter((w) => all.some((r) => r.animal.world === w.key))
    const items: Array<{ key: Filter; label: string }> = [{ key: 'all', label: t('catAll') }]
    if (all.some((r) => r.fresh)) items.push({ key: 'new', label: t('tagNew') })
    for (const w of worlds) items.push({ key: w.key, label: w.name[getLang()] })
    if (!items.some((i) => i.key === filter)) filter = 'all'
    chips.innerHTML = items
      .map((i) => `<button type="button" class="bk-chip${i.key === filter ? ' is-on' : ''}" data-filter="${i.key}" aria-pressed="${i.key === filter}">${esc(i.label)}</button>`)
      .join('')
    chips.hidden = all.length === 0
  }

  const render = () => {
    const all = rows()
    renderChips(all)
    list.innerHTML = all
      .filter(matches)
      .map(({ animal, fresh, preview, at }) => {
        const name = animalName(animal)
        const label = fresh ? t('openChatNew', { name }) : t('openChat', { name })
        return `
          <li>
            <button class="bk-row${fresh ? ' is-new' : ''}" type="button" data-chat="${esc(animal.id)}" aria-label="${esc(label)}">
              <span class="bk-ava">${faceMarkup(animal)}</span>
              <span class="bk-row-main"><span class="bk-name">${esc(name)}</span><span class="bk-prev">${esc(preview)}</span></span>
              <span class="bk-row-side"><span class="bk-time">${esc(formatWhen(at))}</span>${fresh ? `<span class="bk-new"><svg aria-hidden="true"><use href="#i-sparkle" /></svg>${esc(t('tagNew'))}</span>` : ''}</span>
            </button>
          </li>`
      })
      .join('')
    list.classList.toggle('is-still', reduceMotion)
    list.hidden = all.length === 0
    empty.hidden = all.length > 0
    note.hidden = store.isPersistent
  }

  const rowOf = (id: string) => list.querySelector<HTMLButtonElement>(`button[data-chat="${CSS.escape(id)}"]`)

  const showList = (focusId: string) => {
    chat.hide()
    listPage.hidden = false
    render()
    if (!reduceMotion) refreshIn(listPage)
    ;(focusId ? rowOf(focusId) : null)?.focus()
  }

  const openChat = (animal: Animal) => {
    lastRowId = animal.id
    // トークを開いたら見たことにする（行の印が消え、HUD とホームの点も消える）
    if (freshIds.includes(animal.id)) {
      freshIds = freshIds.filter((id) => id !== animal.id)
      store.markSeen([animal.id])
    }
    listPage.hidden = true
    chat.show(animal, true)
  }

  list.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-chat]')
    if (!target) return
    const animal = getAnimal(target.dataset.chat ?? '')
    if (animal) openChat(animal)
  })
  chips.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-filter]')
    if (!b) return
    filter = b.dataset.filter as Filter
    render()
    chips.querySelector<HTMLButtonElement>(`button[data-filter="${filter}"]`)?.focus()
  })
  chat.onBack(() => showList(lastRowId))
  chat.onVisit((animal) => visitListeners.forEach((fn) => fn(animal)))

  const setOpen = (next: boolean) => {
    if (open === next) return
    open = next
    setViewOpen(root, open)
    if (open) {
      worldLabel.textContent = origin === 'home' ? t('peek') : t('worldShort')
      worldBtn.hidden = origin === 'home' && !canEnterWorld
      freshIds = store.unseen().map((e) => e.animalId)
      lastRowId = ''
      filter = 'all'
      chat.hide()
      listPage.hidden = false
      render()
      closeBtn.focus()
      // 新しい子が見えるところへ（帳が長くなっても見落とさない）
      const first = freshIds[0] ? rowOf(freshIds[0]) : null
      first?.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' })
    } else {
      const seen = freshIds
      freshIds = []
      chat.hide()
      store.markSeen(seen)
    }
    openListeners.forEach((fn) => fn(open))
  }

  closeBtn.addEventListener('click', () => setOpen(false))
  // 幕のタップで閉じる（パネルの中は閉じない）
  root.addEventListener('click', (e) => {
    if (e.target === root) setOpen(false)
  })
  window.addEventListener('keydown', (e) => {
    if (!open || e.key !== 'Escape') return
    if (chat.isOpen()) showList(lastRowId)
    else setOpen(false)
  })
  worldBtn.addEventListener('click', () => {
    worldListeners.forEach((fn) => fn(origin))
  })
  store.onChange(() => {
    if (!open) return
    // 帳から開いたモニターで新しく登録した子も「あたらしい」に入れ、閉じる時に見たことにする
    for (const e of store.unseen()) if (!freshIds.includes(e.animalId)) freshIds.push(e.animalId)
    if (!chat.isOpen()) render()
  })
  onLangChange(() => {
    if (open && !chat.isOpen()) render()
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
      if (chat.isOpen()) chat.focusVisit()
      else (rowOf(lastRowId) ?? closeBtn).focus()
    },
    setReduceMotion: (on) => {
      reduceMotion = on
      chat.setReduceMotion(on)
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
