import type { Animal } from '../data/animals'
import type { Letter, LetterStore } from '../data/letters'
import { LETTER_MAX } from '../data/letters'
import { SPECIES_VIDEOS } from '../data/videos'
import { getWorld } from '../data/worlds'
import { formatMetDate } from '../data/friends'
import { faceMarkup } from './faces'
import { esc } from './html'
import { animalName, getLang, speciesName, t } from './i18n'
import { refreshIn } from './transition'

/**
 * ともだち帳のトーク画面。LINE のトークに似た見た目だが、会話をする場所ではなく「手紙」に近い。
 * 左に並ぶのは、データから言えること（ともだちになった日・収録映像）と、スタッフのお知らせの「みほん」1 通だけ
 * （本物のお知らせはまだ届かないので、みほんと明記し、時刻も付けない）。
 * 右に並ぶのは自分が書いたお手紙。この端末に保存するだけで、届いたふり・既読・返事の演出はしない。
 * 右上の「会いに行く」で、歩かずにその子の観察モニターへ。帳にいるのはともだちだけなので、この入口はともだち専用。
 */
export interface ChatView {
  show: (animal: Animal, fromList: boolean) => void
  hide: () => void
  isOpen: () => boolean
  current: () => Animal | null
  onBack: (fn: () => void) => void
  onVisit: (fn: (animal: Animal) => void) => void
  /** モニターから戻ってきた時、「会いに行く」にフォーカスを返す */
  focusVisit: () => void
  setReduceMotion: (on: boolean) => void
}

/** 「11月4日」。今日なら「14:05」 */
export function formatWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
  if (sameDay) return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
  return getLang() === 'en' ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : `${d.getMonth() + 1}月${d.getDate()}日`
}

/** 収録日「2026-11-04」→「11月4日」 */
function formatRecorded(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd)
  if (!m) return ymd
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return getLang() === 'en' ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : `${d.getMonth() + 1}月${d.getDate()}日`
}

const QUICK = ['quick1', 'quick2', 'quick3', 'quick4'] as const

export function createChatView(letters: LetterStore, friendSince: (animalId: string) => string | undefined): ChatView {
  const root = document.getElementById('book-chat') as HTMLElement
  const backBtn = document.getElementById('chat-back') as HTMLButtonElement
  const faceEl = document.getElementById('chat-face') as HTMLElement
  const nameEl = document.getElementById('chat-name') as HTMLElement
  const subEl = document.getElementById('chat-sub') as HTMLElement
  const visitBtn = document.getElementById('chat-visit') as HTMLButtonElement
  const log = document.getElementById('chat-log') as HTMLElement
  const quick = document.getElementById('chat-quick') as HTMLElement
  const form = document.getElementById('chat-form') as HTMLFormElement
  const input = document.getElementById('chat-input') as HTMLInputElement
  const note = document.getElementById('chat-note') as HTMLElement

  let open = false
  let reduceMotion = false
  let animal: Animal | null = null
  const backListeners: Array<() => void> = []
  const visitListeners: Array<(animal: Animal) => void> = []

  const bubbleLeft = (body: string, meta: string, sender = '') =>
    `<li class="ch-item ch-left">${sender ? `<span class="ch-sender">${sender}</span>` : ''}<div class="ch-line"><div class="ch-bubble">${body}</div>${meta ? `<span class="ch-meta">${meta}</span>` : ''}</div></li>`

  const videoCard = (a: Animal): string => {
    if (!a.video.url) return ''
    const sv = a.videoId ? SPECIES_VIDEOS.find((v) => v.id === a.videoId) : undefined
    const lines: string[] = []
    if (sv) lines.push(`${esc(t('videoRecordedOn', { date: formatRecorded(sv.recordedOn) }))} ・ ${esc(sv.duration)}`)
    if (a.videoGroup) {
      const label = a.videoGroup.label ? a.videoGroup.label[getLang()] : a.videoGroup.species.map(speciesName).join(getLang() === 'en' ? ' & ' : '・')
      lines.push(esc(t('videoGroupNote', { label })))
    }
    const badge = a.video.placeholder ? t('placeholder') : t('recorded')
    return `
      <div class="ch-card">
        <button type="button" class="ch-poster" data-visit="${esc(a.id)}" aria-label="${esc(t('chatWatch'))}">
          ${a.video.poster ? `<img src="${esc(a.video.poster)}" alt="" />` : ''}
          <span class="ch-badge"><svg class="ico" aria-hidden="true"><use href="#i-film" /></svg>${esc(badge)}</span>
          <span class="ch-play" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z" /></svg></span>
        </button>
        <p class="ch-card-title">${esc(t('sysVideo', { name: animalName(a) }))}</p>
        ${lines.map((l) => `<p class="ch-card-sub">${l}</p>`).join('')}
      </div>`
  }

  const render = () => {
    if (!animal) return
    const a = animal
    const since = friendSince(a.id)
    const items: string[] = []
    if (since) items.push(`<li class="ch-item ch-sys"><span>${esc(t('sysFriend', { date: formatMetDate(since) }))}</span></li>`)
    const card = videoCard(a)
    if (card) items.push(bubbleLeft(card, since ? esc(formatWhen(since)) : ''))
    // スタッフのお知らせは「みほん」1 通だけ。時刻は付けない（届いたお知らせではないので）
    items.push(
      bubbleLeft(
        `<span class="ch-sample-tag">${esc(t('sampleTag'))}</span>${esc(t('sampleNotice'))}`,
        '',
        getLang() === 'en' ? `${esc(t('staffNotice'))} (${esc(t('sampleTag'))})` : `${esc(t('staffNotice'))}（${esc(t('sampleTag'))}）`,
      ),
    )
    for (const l of letters.listFor(a.id)) items.push(letterItem(l))
    log.innerHTML = items.join('')
    log.scrollTop = log.scrollHeight
  }

  const letterItem = (l: Letter) =>
    `<li class="ch-item ch-right"><div class="ch-line"><span class="ch-meta">${esc(formatWhen(l.sentAt))}</span><div class="ch-bubble" aria-label="${esc(t('yourLetter'))}">${esc(l.text)}</div></div></li>`

  const renderHead = (a: Animal) => {
    faceEl.innerHTML = faceMarkup(a)
    nameEl.textContent = animalName(a)
    const world = a.world ? getWorld(a.world) : undefined
    subEl.textContent = [speciesName(a.species), world ? world.name[getLang()] : ''].filter(Boolean).join(getLang() === 'en' ? ' · ' : '・')
    visitBtn.setAttribute('aria-label', t('visit', { name: animalName(a) }))
    visitBtn.title = t('visit', { name: animalName(a) })
    input.placeholder = t('letterPlaceholder', { name: animalName(a) })
    input.maxLength = LETTER_MAX
    quick.innerHTML = QUICK.map((k) => `<button type="button" class="ch-quick" data-quick="${k}">${esc(t(k))}</button>`).join('')
    note.textContent = letters.isPersistent ? t('letterNote') : t('letterMemoryNote')
  }

  const sendText = (text: string) => {
    if (!animal) return
    const added = letters.add(animal.id, text)
    if (!added) return
    // 追加した 1 通だけ足して、いちばん下へ
    log.insertAdjacentHTML('beforeend', letterItem(added))
    const last = log.lastElementChild as HTMLElement | null
    if (last && !reduceMotion) refreshIn(last)
    log.scrollTo({ top: log.scrollHeight, behavior: reduceMotion ? 'auto' : 'smooth' })
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault()
    sendText(input.value)
    input.value = ''
    input.focus()
  })
  quick.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-quick]')
    if (!b) return
    sendText(t(b.dataset.quick as (typeof QUICK)[number]))
  })
  log.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-visit]')
    if (!b || !animal) return
    visitListeners.forEach((fn) => fn(animal as Animal))
  })
  visitBtn.addEventListener('click', () => {
    const a = animal
    if (a) visitListeners.forEach((fn) => fn(a))
  })
  backBtn.addEventListener('click', () => backListeners.forEach((fn) => fn()))
  // 書いている途中の WASD やスペースをワールドに渡さない（帳が開いている間は入力は止まっているが、念のため）
  input.addEventListener('keydown', (e) => e.stopPropagation())

  return {
    show: (a, fromList) => {
      animal = a
      open = true
      renderHead(a)
      render()
      root.hidden = false
      if (fromList && !reduceMotion) refreshIn(root)
      backBtn.focus()
    },
    hide: () => {
      open = false
      animal = null
      root.hidden = true
      input.value = ''
    },
    isOpen: () => open,
    current: () => animal,
    onBack: (fn) => {
      backListeners.push(fn)
    },
    onVisit: (fn) => {
      visitListeners.push(fn)
    },
    focusVisit: () => {
      if (open) visitBtn.focus()
    },
    setReduceMotion: (on) => {
      reduceMotion = on
    },
  }
}
