import type { Animal } from '../data/animals'
import type { ChatReadStore } from '../data/chatRead'
import { checkLetter } from '../data/letterFilter'
import type { Letter, LetterStore } from '../data/letters'
import { LETTER_MAX } from '../data/letters'
import type { Notice, NoticeStore } from '../data/notices'
import { SPECIES_VIDEOS } from '../data/videos'
import { getWorld } from '../data/worlds'
import { formatMetDate } from '../data/friends'
import { faceMarkup } from './faces'
import { esc } from './html'
import { animalName, getLang, speciesName, t } from './i18n'
import { refreshIn } from './transition'

/**
 * ともだち帳のトーク画面。LINE のトークに似た見た目だが、会話をする場所ではなく「手紙」に近い。
 * 左に並ぶのは、データから言えること（ともだちになった日・収録映像）と、スタッフ画面（staff.html）から出したお知らせ
 * （お知らせ・収録の予定・きょうの写真・お手紙へのお返事。お返事は承認したものだけ）。お知らせがまだ無い子には「みほん」1 通。
 * 右に並ぶのは自分が書いたお手紙。この端末に保存するだけで、届いたふり・既読・返事の演出はしない。押すと「とりけす」が出る。
 * 右上の「会いに行く」で、歩かずにその子の観察モニターへ。帳にいるのはともだちだけなので、この入口はともだち専用。
 */
export interface ChatView {
  show: (animal: Animal, fromList: boolean) => void
  hide: () => void
  isOpen: () => boolean
  current: () => Animal | null
  onBack: (fn: () => void) => void
  onVisit: (fn: (animal: Animal) => void) => void
  /** ハートのボタン（おうえん。おとなの方へ） */
  onSupport: (fn: (animal: Animal) => void) => void
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

/** 「2026-11-04」→「11月4日」 */
export function formatYmd(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd)
  if (!m) return ymd
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return getLang() === 'en' ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : `${d.getMonth() + 1}月${d.getDate()}日`
}

/** お知らせの見出し（種類ごと）。一覧の下書きにも使う */
export function noticeHeading(n: Notice): string {
  if (n.kind === 'schedule') return t('noticeSchedule')
  if (n.kind === 'photo') return t('noticePhoto')
  if (n.kind === 'reply') return t('noticeReply')
  return n.title || t('staffNotice')
}

const QUICK = ['quick1', 'quick2', 'quick3', 'quick4'] as const

export interface ChatDeps {
  letters: LetterStore
  notices: NoticeStore
  read: ChatReadStore
  friendSince: (animalId: string) => string | undefined
}

export function createChatView({ letters, notices, read, friendSince }: ChatDeps): ChatView {
  const root = document.getElementById('book-chat') as HTMLElement
  const backBtn = document.getElementById('chat-back') as HTMLButtonElement
  const faceEl = document.getElementById('chat-face') as HTMLElement
  const nameEl = document.getElementById('chat-name') as HTMLElement
  const subEl = document.getElementById('chat-sub') as HTMLElement
  const visitBtn = document.getElementById('chat-visit') as HTMLButtonElement
  const supportBtn = document.getElementById('chat-support') as HTMLButtonElement
  const log = document.getElementById('chat-log') as HTMLElement
  const quick = document.getElementById('chat-quick') as HTMLElement
  const form = document.getElementById('chat-form') as HTMLFormElement
  const input = document.getElementById('chat-input') as HTMLInputElement
  const errorEl = document.getElementById('chat-error') as HTMLElement
  const note = document.getElementById('chat-note') as HTMLElement
  const status = document.getElementById('chat-status') as HTMLElement

  let open = false
  let reduceMotion = false
  let animal: Animal | null = null
  const backListeners: Array<() => void> = []
  const visitListeners: Array<(animal: Animal) => void> = []
  const supportListeners: Array<(animal: Animal) => void> = []

  const bubbleLeft = (body: string, meta: string, sender = '') =>
    `<li class="ch-item ch-left">${sender ? `<span class="ch-sender">${sender}</span>` : ''}<div class="ch-line"><div class="ch-bubble">${body}</div>${meta ? `<span class="ch-meta">${meta}</span>` : ''}</div></li>`

  const videoCard = (a: Animal): string => {
    if (!a.video.url) return ''
    const sv = a.videoId ? SPECIES_VIDEOS.find((v) => v.id === a.videoId) : undefined
    const lines: string[] = []
    if (sv) lines.push(`${esc(t('videoRecordedOn', { date: formatYmd(sv.recordedOn) }))} ・ ${esc(sv.duration)}`)
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

  /** スタッフからのお知らせ 1 通。種類ごとにカードの形を変える */
  const noticeItem = (n: Notice): string => {
    const when = n.publishedAt ? esc(formatWhen(n.publishedAt)) : ''
    const body = esc(n.body).replace(/\n/g, '<br />')
    if (n.kind === 'schedule') {
      const dateLine = [n.date ? formatYmd(n.date) : '', n.time ?? ''].filter(Boolean).join(' ')
      const html = `
        <div class="ch-card ch-card-pad">
          <p class="ch-card-kind"><svg class="ico" aria-hidden="true"><use href="#i-film" /></svg>${esc(t('noticeSchedule'))}</p>
          ${dateLine ? `<p class="ch-card-date">${esc(dateLine)}</p>` : ''}
          ${n.title ? `<p class="ch-card-title">${esc(n.title)}</p>` : ''}
          ${body ? `<p class="ch-card-body">${body}</p>` : ''}
          <p class="ch-card-sub">${esc(t('noticeScheduleNote'))}</p>
        </div>`
      return bubbleLeft(html, when, esc(t('staffNotice')))
    }
    if (n.kind === 'photo') {
      const html = `
        <div class="ch-card">
          ${n.photo ? `<img class="ch-photo" src="${esc(n.photo)}" alt="${esc(n.title || t('noticePhoto'))}" />` : ''}
          <p class="ch-card-kind">${esc(t('noticePhoto'))}${n.date ? ` ・ ${esc(formatYmd(n.date))}` : ''}</p>
          ${n.title ? `<p class="ch-card-title">${esc(n.title)}</p>` : ''}
          ${body ? `<p class="ch-card-body">${body}</p>` : ''}
        </div>`
      return bubbleLeft(html, when, esc(t('staffNotice')))
    }
    if (n.kind === 'reply') {
      const html = `${n.quote ? `<span class="ch-quote"><span class="ch-quote-label">${esc(t('yourLetter'))}</span>${esc(n.quote)}</span>` : ''}${body}`
      return bubbleLeft(html, when, esc(t('noticeReply')))
    }
    const html = `${n.title ? `<strong class="ch-ntitle">${esc(n.title)}</strong>` : ''}${body}`
    return bubbleLeft(html, when, esc(t('staffNotice')))
  }

  const letterItem = (l: Letter) =>
    `<li class="ch-item ch-right" data-letter="${esc(l.id)}"><div class="ch-line"><span class="ch-meta">${esc(formatWhen(l.sentAt))}</span><button type="button" class="ch-bubble ch-mine" aria-label="${esc(t('yourLetter'))}: ${esc(l.text)}" aria-expanded="false">${esc(l.text)}</button></div><div class="ch-actions" hidden><button type="button" class="ch-undo" data-undo="${esc(l.id)}"><svg class="ico" aria-hidden="true"><use href="#i-close" /></svg>${esc(t('undo'))}</button></div></li>`

  const render = () => {
    if (!animal) return
    const a = animal
    const since = friendSince(a.id)
    const items: string[] = []
    if (since) items.push(`<li class="ch-item ch-sys"><span>${esc(t('sysFriend', { date: formatMetDate(since) }))}</span></li>`)
    const card = videoCard(a)
    if (card) items.push(bubbleLeft(card, since ? esc(formatWhen(since)) : ''))
    const published = notices.publishedFor(a.id)
    if (published.length === 0) {
      // 本物のお知らせがまだ無い子には「みほん」1 通だけ。時刻は付けない（届いたお知らせではないので）
      items.push(
        bubbleLeft(
          `<span class="ch-sample-tag">${esc(t('sampleTag'))}</span>${esc(t('sampleNotice'))}`,
          '',
          getLang() === 'en' ? `${esc(t('staffNotice'))} (${esc(t('sampleTag'))})` : `${esc(t('staffNotice'))}（${esc(t('sampleTag'))}）`,
        ),
      )
    }
    // お知らせとお手紙を時刻の順に並べる
    const merged: Array<{ at: string; html: string }> = [
      ...published.map((n) => ({ at: n.publishedAt ?? n.createdAt, html: noticeItem(n) })),
      ...letters.listFor(a.id).map((l) => ({ at: l.sentAt, html: letterItem(l) })),
    ].sort((x, y) => (x.at < y.at ? -1 : x.at > y.at ? 1 : 0))
    for (const m of merged) items.push(m.html)
    log.innerHTML = items.join('')
    log.scrollTop = log.scrollHeight
  }

  const renderHead = (a: Animal) => {
    faceEl.innerHTML = faceMarkup(a)
    nameEl.textContent = animalName(a)
    const world = a.world ? getWorld(a.world) : undefined
    subEl.textContent = [speciesName(a.species), world ? world.name[getLang()] : ''].filter(Boolean).join(getLang() === 'en' ? ' · ' : '・')
    visitBtn.setAttribute('aria-label', t('visit', { name: animalName(a) }))
    visitBtn.title = t('visit', { name: animalName(a) })
    supportBtn.setAttribute('aria-label', t('supportAria', { name: animalName(a) }))
    supportBtn.title = t('support')
    input.placeholder = t('letterPlaceholder', { name: animalName(a) })
    input.maxLength = LETTER_MAX
    quick.innerHTML = QUICK.map((k) => `<button type="button" class="ch-quick" data-quick="${k}">${esc(t(k))}</button>`).join('')
    note.textContent = letters.isPersistent ? t('letterNote') : t('letterMemoryNote')
    errorEl.hidden = true
  }

  const showError = (msg: string) => {
    errorEl.textContent = msg
    errorEl.hidden = false
  }

  const sendText = (text: string) => {
    if (!animal) return false
    const check = checkLetter(text)
    if (!check.ok) {
      showError(check.reason === 'contact' ? t('filterContact') : t('filterWord'))
      return false
    }
    const added = letters.add(animal.id, text)
    if (!added) return false
    errorEl.hidden = true
    // 追加した 1 通だけ足して、いちばん下へ
    log.insertAdjacentHTML('beforeend', letterItem(added))
    const last = log.lastElementChild as HTMLElement | null
    if (last && !reduceMotion) refreshIn(last)
    log.scrollTo({ top: log.scrollHeight, behavior: reduceMotion ? 'auto' : 'smooth' })
    status.textContent = t('letterWritten')
    return true
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault()
    if (sendText(input.value)) input.value = ''
    input.focus()
  })
  input.addEventListener('input', () => {
    errorEl.hidden = true
  })
  quick.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-quick]')
    if (!b) return
    sendText(t(b.dataset.quick as (typeof QUICK)[number]))
  })
  log.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    const visit = target.closest<HTMLButtonElement>('button[data-visit]')
    if (visit) {
      const a = animal
      if (a) visitListeners.forEach((fn) => fn(a))
      return
    }
    const undo = target.closest<HTMLButtonElement>('button[data-undo]')
    if (undo) {
      const id = undo.dataset.undo ?? ''
      letters.remove(id)
      log.querySelector(`li[data-letter="${CSS.escape(id)}"]`)?.remove()
      status.textContent = t('letterRemoved')
      input.focus()
      return
    }
    // 自分の吹き出しを押すと「とりけす」が出る（もう一度押すと隠れる）
    const mine = target.closest<HTMLButtonElement>('button.ch-mine')
    if (mine) {
      const li = mine.closest('li')
      const actions = li?.querySelector<HTMLElement>('.ch-actions')
      if (!actions) return
      const show = actions.hidden
      log.querySelectorAll<HTMLElement>('.ch-actions').forEach((el) => {
        el.hidden = true
      })
      log.querySelectorAll<HTMLElement>('button.ch-mine').forEach((el) => el.setAttribute('aria-expanded', 'false'))
      actions.hidden = !show
      mine.setAttribute('aria-expanded', String(show))
      if (show) actions.scrollIntoView({ block: 'nearest' })
    }
  })
  visitBtn.addEventListener('click', () => {
    const a = animal
    if (a) visitListeners.forEach((fn) => fn(a))
  })
  supportBtn.addEventListener('click', () => {
    const a = animal
    if (a) supportListeners.forEach((fn) => fn(a))
  })
  backBtn.addEventListener('click', () => backListeners.forEach((fn) => fn()))
  // 書いている途中の WASD やスペースをワールドに渡さない。Esc だけは通す（一覧に戻る）
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') e.stopPropagation()
  })
  // スタッフ画面（別タブ）が出したお知らせは、開いている間に届く
  notices.onChange(() => {
    if (!open || !animal) return
    render()
    read.markRead(animal.id)
  })

  return {
    show: (a, fromList) => {
      animal = a
      open = true
      renderHead(a)
      render()
      read.markRead(a.id)
      root.hidden = false
      if (fromList && !reduceMotion) refreshIn(root)
      backBtn.focus()
    },
    hide: () => {
      open = false
      animal = null
      root.hidden = true
      input.value = ''
      status.textContent = ''
    },
    isOpen: () => open,
    current: () => animal,
    onBack: (fn) => {
      backListeners.push(fn)
    },
    onVisit: (fn) => {
      visitListeners.push(fn)
    },
    onSupport: (fn) => {
      supportListeners.push(fn)
    },
    focusVisit: () => {
      if (open) visitBtn.focus()
    },
    setReduceMotion: (on) => {
      reduceMotion = on
    },
  }
}
