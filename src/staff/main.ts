import type { Animal } from '../data/animals'
import { ANIMALS, getAnimal, listReadyAnimals } from '../data/animals'
import { createFriendBookStore } from '../data/friends'
import type { Letter } from '../data/letters'
import { createLetterStore } from '../data/letters'
import type { Notice, NoticeInput, NoticeKind } from '../data/notices'
import { createNoticeStore } from '../data/notices'
import { WORLDS } from '../data/worlds'
import { faceMarkup } from '../ui/faces'
import { esc } from '../ui/html'

/**
 * スタッフ画面（試作）。施設のスタッフが、ともだち帳のトークに出すお知らせを書き、届いたお手紙を読む。
 * 試作版なので保存はこの端末の localStorage だけ（ともだち帳と同じ鍵）。サーバー・ログイン・配信は無い。
 * - お知らせを出す: 定型（お知らせ／収録の予定／きょうの写真）から選んで書く。「ともだちに出す」か「下書きに保存」
 * - お手紙: 週ごとの「お手紙まとめ」。まとめをコピーして飼育員に渡せる。1 通ごとに「お返事を書く」
 * - 下書き・承認: お返事は下書きにしか保存できず、「承認して出す」で初めてトークに出る（確認した言葉だけ届く）
 * - 出したお知らせ: 取り下げられる
 * 日本語のみ（施設のスタッフ向け）。
 */

type Tab = 'compose' | 'letters' | 'drafts' | 'published'

interface FormState {
  kind: NoticeKind
  title: string
  body: string
  date: string
  time: string
  photo: string
  replyTo: string
  quote: string
  /** 編集中の下書きの id（新規なら空） */
  editingId: string
}

const KIND_LABEL: Record<NoticeKind, string> = {
  notice: 'お知らせ',
  schedule: '収録の予定',
  photo: 'きょうの写真',
  reply: 'お手紙へのお返事',
}

const PHOTO_MAX_PX = 720

const main = document.getElementById('st-main') as HTMLElement
const toastEl = document.getElementById('st-toast') as HTMLElement

const friends = createFriendBookStore()
const letters = createLetterStore()
const notices = createNoticeStore()

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const emptyForm = (kind: NoticeKind = 'notice'): FormState => ({
  kind,
  title: '',
  body: '',
  date: kind === 'photo' ? today() : '',
  time: '',
  photo: '',
  replyTo: '',
  quote: '',
  editingId: '',
})

/** 定型の下書き。事実は書かず、書く場所だけ示す（スタッフが書き換える） */
const TEMPLATES: Record<Exclude<NoticeKind, 'reply'>, (a: Animal) => Partial<FormState>> = {
  notice: (a) => ({ title: `きょうの${a.name}`, body: `${a.name}のきょうのようすを書く。\n（例: ごはんの時間、お気に入りの場所、飼育のスケジュール）` }),
  schedule: (a) => ({ title: `${a.name}の映像を収録します`, body: `収録した映像は、あとでともだち帳で見られます。`, date: today(), time: '' }),
  photo: (a) => ({ title: `きょうの${a.name}`, body: '', date: today() }),
}

let selectedId = ''
let tab: Tab = 'compose'
let form: FormState = emptyForm()
let toastTimer = 0

const toast = (text: string) => {
  toastEl.textContent = text
  toastEl.hidden = false
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => {
    toastEl.hidden = true
  }, 2600)
}

const fmtDateTime = (iso: string) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}

const fmtYmd = (ymd: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd)
  return m ? `${Number(m[2])}月${Number(m[3])}日` : ymd
}

/** その週の月曜（0 時）。お手紙まとめの区切り */
const weekStart = (iso: string) => {
  const d = new Date(iso)
  const day = (d.getDay() + 6) % 7
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - day)
  return d
}

const worldName = (a: Animal) => WORLDS.find((w) => w.key === a.world)?.name.ja ?? ''

/* ---------- 左: 動物の一覧 ---------- */

const renderAnimalList = (): string => {
  const all = listReadyAnimals()
  const groups = WORLDS.filter((w) => all.some((a) => a.world === w.key))
  const row = (a: Animal) => {
    const n = letters.listFor(a.id).length
    const drafts = notices.drafts().filter((x) => x.animalId === a.id).length
    const fr = friends.has(a.id)
    return `<button type="button" class="st-row${a.id === selectedId ? ' is-on' : ''}" data-select="${esc(a.id)}" aria-pressed="${a.id === selectedId}">
      <span class="st-ava">${faceMarkup(a)}</span>
      <span class="st-row-main"><span class="st-row-name">${esc(a.name)}</span><span class="st-row-sub">${esc(a.species)}</span></span>
      <span class="st-row-side">${fr ? '<span class="st-pill st-pill-friend" title="この端末でともだち">ともだち</span>' : ''}${n ? `<span class="st-pill">手紙 ${n}</span>` : ''}${drafts ? `<span class="st-pill st-pill-draft">下書き ${drafts}</span>` : ''}</span>
    </button>`
  }
  const options = groups
    .map((w) => `<optgroup label="${esc(w.name.ja)}">${all.filter((a) => a.world === w.key).map((a) => `<option value="${esc(a.id)}"${a.id === selectedId ? ' selected' : ''}>${esc(a.name)}（${esc(a.species)}）</option>`).join('')}</optgroup>`)
    .join('')
  return `
    <aside class="st-side">
      <label class="st-select-wrap"><span>動物</span><select id="st-select">${options}</select></label>
      <div class="st-list">
        ${groups.map((w) => `<h2 class="st-world">${esc(w.name.ja)}</h2>${all.filter((a) => a.world === w.key).map(row).join('')}`).join('')}
      </div>
    </aside>`
}

/* ---------- 右: 選んだ動物 ---------- */

const bubblePreview = (n: NoticeInput, when = '出す時の時刻'): string => {
  const body = esc(n.body).replace(/\n/g, '<br />')
  let inner = ''
  if (n.kind === 'schedule') {
    const dateLine = [n.date ? fmtYmd(n.date) : '', n.time ?? ''].filter(Boolean).join(' ')
    inner = `<p class="pv-kind">収録の予定</p>${dateLine ? `<p class="pv-date">${esc(dateLine)}</p>` : ''}${n.title ? `<p class="pv-title">${esc(n.title)}</p>` : ''}${body ? `<p class="pv-body">${body}</p>` : ''}<p class="pv-sub">ライブ配信ではありません。収録した映像は、あとでここで見られます</p>`
  } else if (n.kind === 'photo') {
    inner = `${n.photo ? `<img class="pv-photo" src="${esc(n.photo)}" alt="" />` : '<div class="pv-photo pv-photo-empty">写真を選ぶ</div>'}<p class="pv-kind">きょうの写真${n.date ? ` ・ ${esc(fmtYmd(n.date))}` : ''}</p>${n.title ? `<p class="pv-title">${esc(n.title)}</p>` : ''}${body ? `<p class="pv-body">${body}</p>` : ''}`
  } else if (n.kind === 'reply') {
    inner = `${n.quote ? `<span class="pv-quote"><span>あなたのお手紙</span>${esc(n.quote)}</span>` : ''}${body || '<span class="pv-empty">（お返事の本文）</span>'}`
  } else {
    inner = `${n.title ? `<strong class="pv-ntitle">${esc(n.title)}</strong>` : ''}${body || '<span class="pv-empty">（本文）</span>'}`
  }
  const sender = n.kind === 'reply' ? '飼育員さんからのお返事' : 'スタッフからのお知らせ'
  return `<div class="pv"><span class="pv-sender">${sender}</span><div class="pv-line"><div class="pv-bubble">${inner}</div><span class="pv-meta">${esc(when)}</span></div></div>`
}

const renderCompose = (a: Animal): string => {
  const isReply = form.kind === 'reply'
  const kinds = (['notice', 'schedule', 'photo'] as const)
    .map((k) => `<button type="button" class="st-chip${form.kind === k ? ' is-on' : ''}" data-kind="${k}" aria-pressed="${form.kind === k}">${KIND_LABEL[k]}</button>`)
    .join('')
  const replyHead = isReply
    ? `<div class="st-reply-head"><span class="st-pill st-pill-draft">お手紙へのお返事</span><blockquote class="st-quote">${esc(form.quote)}</blockquote><p class="st-help">お返事は下書きにだけ保存できます。「下書き・承認」で承認した時に、ともだち帳へ「飼育員さんからのお返事」として出ます（動物が書いた形にはなりません）。</p><button type="button" class="st-btn st-btn-quiet" data-cancel-reply="1">お返事をやめる</button></div>`
    : `<div class="st-kinds" role="group" aria-label="種類">${kinds}</div>`
  const fields = `
    ${form.kind !== 'reply' ? `<label class="st-field"><span>見出し</span><input id="f-title" type="text" maxlength="40" value="${esc(form.title)}" placeholder="${form.kind === 'photo' ? '写真のひとこと（任意）' : '見出し'}" /></label>` : ''}
    ${form.kind === 'schedule' || form.kind === 'photo' ? `<div class="st-field-row"><label class="st-field"><span>${form.kind === 'schedule' ? '収録する日' : '撮った日'}</span><input id="f-date" type="date" value="${esc(form.date)}" /></label>${form.kind === 'schedule' ? `<label class="st-field"><span>時刻（任意・文字）</span><input id="f-time" type="text" maxlength="20" value="${esc(form.time)}" placeholder="14:00ごろ" /></label>` : ''}</div>` : ''}
    ${form.kind === 'photo' ? `<label class="st-field"><span>写真（端末の中で ${PHOTO_MAX_PX}px に縮小します）</span><input id="f-photo" type="file" accept="image/*" /></label>` : ''}
    <label class="st-field"><span>${form.kind === 'reply' ? 'お返事の本文' : '本文'}</span><textarea id="f-body" rows="5" maxlength="400" placeholder="${form.kind === 'photo' ? '写真の説明（任意）' : '本文'}">${esc(form.body)}</textarea></label>
    <p class="st-help">書くのは確かめたことだけ。ライブ配信の案内、ほかの人の名前・連絡先は書かない。</p>`
  const actions = isReply
    ? `<button type="button" class="st-btn st-btn-main" data-save="draft">下書きに保存（承認してから出す）</button>`
    : `<button type="button" class="st-btn st-btn-main" data-save="publish">${form.editingId ? '承認して出す' : 'ともだちに出す'}</button><button type="button" class="st-btn" data-save="draft">下書きに保存</button>${form.editingId ? '<button type="button" class="st-btn st-btn-quiet" data-cancel-edit="1">編集をやめる</button>' : ''}`
  return `
    <section class="st-compose">
      <div class="st-compose-form">
        ${form.editingId ? '<p class="st-editing">下書きを編集中</p>' : ''}
        ${replyHead}
        ${fields}
        <div class="st-actions">${actions}</div>
        ${notices.lastWriteFailed ? '<p class="st-error">保存できませんでした。端末の保存がいっぱいかもしれません（写真を減らしてください）。</p>' : ''}
      </div>
      <div class="st-compose-preview">
        <h3 class="st-h3">ともだち帳での見え方</h3>
        ${bubblePreview({ animalId: a.id, kind: form.kind, title: form.title, body: form.body, date: form.date || undefined, time: form.time || undefined, photo: form.photo || undefined, quote: form.quote || undefined })}
        <p class="st-help">届く先: この端末で${a.name}とともだちになっている人${friends.has(a.id) ? '（この端末ではともだち）' : '（この端末ではまだともだちではないので、ともだちになってから見えます）'}</p>
      </div>
    </section>`
}

const digestText = (a: Animal, start: Date, items: Letter[]): string => {
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  const lines = items.map((l) => `- ${fmtDateTime(l.sentAt)} ${l.text}`)
  return `${a.name}へのお手紙まとめ（${start.getMonth() + 1}/${start.getDate()}〜${end.getMonth() + 1}/${end.getDate()}、${items.length}通）\n${lines.join('\n')}`
}

const renderLetters = (a: Animal): string => {
  const items = letters.listFor(a.id)
  if (items.length === 0) return `<section class="st-sec"><p class="st-empty">${esc(a.name)}へのお手紙は、この端末にはまだありません。</p></section>`
  const groups = new Map<string, { start: Date; items: Letter[] }>()
  for (const l of items) {
    const s = weekStart(l.sentAt)
    const key = s.toISOString()
    const g = groups.get(key) ?? { start: s, items: [] }
    g.items.push(l)
    groups.set(key, g)
  }
  const replied = new Set(notices.list().filter((n) => n.kind === 'reply' && n.replyTo).map((n) => n.replyTo as string))
  const blocks = [...groups.values()]
    .sort((x, y) => y.start.getTime() - x.start.getTime())
    .map((g) => {
      const end = new Date(g.start)
      end.setDate(end.getDate() + 6)
      return `<section class="st-week">
        <header class="st-week-head"><h3 class="st-h3">${g.start.getMonth() + 1}月${g.start.getDate()}日〜${end.getMonth() + 1}月${end.getDate()}日 <span class="st-count">${g.items.length}通</span></h3><button type="button" class="st-btn st-btn-small" data-copy="${esc(g.start.toISOString())}">まとめをコピー</button></header>
        <ul class="st-letters">${[...g.items]
          .reverse()
          .map(
            (l) =>
              `<li class="st-letter"><span class="st-letter-time">${esc(fmtDateTime(l.sentAt))}</span><span class="st-letter-text">${esc(l.text)}</span><span class="st-letter-act">${replied.has(l.id) ? '<span class="st-pill st-pill-friend">お返事あり</span>' : ''}<button type="button" class="st-btn st-btn-small" data-reply="${esc(l.id)}">お返事を書く</button></span></li>`,
          )
          .join('')}</ul>
      </section>`
    })
    .join('')
  return `<section class="st-sec"><p class="st-help">お手紙は週ごとにまとめています。「まとめをコピー」で文章にして飼育員に渡せます。お返事は承認してから届きます。</p>${blocks}</section>`
}

const noticeRow = (n: Notice, actions: string): string => {
  const a = getAnimal(n.animalId)
  const title = n.kind === 'notice' ? n.title || n.body.slice(0, 24) : n.kind === 'reply' ? `お返事: ${n.body.slice(0, 24)}` : `${KIND_LABEL[n.kind]}${n.title ? `: ${n.title}` : ''}`
  return `<li class="st-notice"><span class="st-notice-main"><span class="st-notice-kind">${KIND_LABEL[n.kind]}${a && a.id !== selectedId ? ` ・ ${esc(a.name)}` : ''}</span><span class="st-notice-title">${esc(title)}</span><span class="st-notice-time">${n.status === 'published' ? `出した: ${esc(fmtDateTime(n.publishedAt ?? n.createdAt))}` : `下書き: ${esc(fmtDateTime(n.createdAt))}`}</span></span><span class="st-notice-act">${actions}</span></li>`
}

const renderDrafts = (a: Animal): string => {
  const items = notices.drafts().filter((n) => n.animalId === a.id)
  if (items.length === 0) return `<section class="st-sec"><p class="st-empty">${esc(a.name)}の下書きはありません。</p></section>`
  return `<section class="st-sec"><p class="st-help">「承認して出す」で、ともだち帳のトークに出ます。お返事はここで承認した時に初めて届きます。</p><ul class="st-notices">${items
    .slice()
    .reverse()
    .map((n) => noticeRow(n, `<button type="button" class="st-btn st-btn-small st-btn-main" data-approve="${esc(n.id)}">承認して出す</button><button type="button" class="st-btn st-btn-small" data-edit="${esc(n.id)}">編集</button><button type="button" class="st-btn st-btn-small st-btn-quiet" data-delete="${esc(n.id)}">削除</button>`))
    .join('')}</ul></section>`
}

const renderPublished = (a: Animal): string => {
  const items = notices.publishedFor(a.id)
  if (items.length === 0) return `<section class="st-sec"><p class="st-empty">${esc(a.name)}に出したお知らせはまだありません。</p></section>`
  return `<section class="st-sec"><ul class="st-notices">${items
    .slice()
    .reverse()
    .map((n) => noticeRow(n, `<button type="button" class="st-btn st-btn-small st-btn-quiet" data-delete="${esc(n.id)}">取り下げる</button>`))
    .join('')}</ul></section>`
}

const renderMainPane = (): string => {
  const a = getAnimal(selectedId)
  if (!a) return '<section class="st-pane"><p class="st-empty">動物を選んでください</p></section>'
  const counts = {
    letters: letters.listFor(a.id).length,
    drafts: notices.drafts().filter((n) => n.animalId === a.id).length,
    published: notices.publishedFor(a.id).length,
  }
  const tabBtn = (k: Tab, label: string, n?: number) =>
    `<button type="button" class="st-tab${tab === k ? ' is-on' : ''}" role="tab" aria-selected="${tab === k}" data-tab="${k}">${label}${n ? `<span class="st-tab-n">${n}</span>` : ''}</button>`
  const body = tab === 'compose' ? renderCompose(a) : tab === 'letters' ? renderLetters(a) : tab === 'drafts' ? renderDrafts(a) : renderPublished(a)
  return `
    <section class="st-pane">
      <header class="st-pane-head">
        <span class="st-ava st-ava-l">${faceMarkup(a)}</span>
        <div class="st-pane-who"><h2 class="st-h2">${esc(a.name)}</h2><p class="st-pane-sub">${esc(a.species)}${a.world ? ` ・ ${esc(worldName(a))}` : ''}</p></div>
      </header>
      <div class="st-tabs" role="tablist">${tabBtn('compose', 'お知らせを出す')}${tabBtn('letters', 'お手紙', counts.letters)}${tabBtn('drafts', '下書き・承認', counts.drafts)}${tabBtn('published', '出したお知らせ', counts.published)}</div>
      ${body}
    </section>`
}

const render = () => {
  if (!selectedId) {
    // 最初は、この端末でともだちになっている子がいればその子
    const firstFriend = friends.list().map((e) => e.animalId).find((id) => getAnimal(id))
    selectedId = firstFriend ?? ANIMALS.find((a) => a.status === 'ready')?.id ?? ''
  }
  const scroll = main.querySelector<HTMLElement>('.st-list')?.scrollTop ?? 0
  main.innerHTML = `${renderAnimalList()}${renderMainPane()}`
  const list = main.querySelector<HTMLElement>('.st-list')
  if (list) list.scrollTop = scroll
}

/* ---------- 入力の読み取り ---------- */

const readForm = () => {
  const el = (id: string) => document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null
  const title = el('f-title')
  if (title) form.title = title.value
  const body = el('f-body')
  if (body) form.body = body.value
  const date = el('f-date')
  if (date) form.date = date.value
  const time = el('f-time')
  if (time) form.time = time.value
}

const toInput = (a: Animal): NoticeInput => ({
  animalId: a.id,
  kind: form.kind,
  title: form.title.trim(),
  body: form.body.trim(),
  date: form.date || undefined,
  time: form.time.trim() || undefined,
  photo: form.photo || undefined,
  replyTo: form.replyTo || undefined,
  quote: form.quote || undefined,
})

const save = (mode: 'draft' | 'publish') => {
  const a = getAnimal(selectedId)
  if (!a) return
  readForm()
  const input = toInput(a)
  if (form.kind === 'photo' && !input.photo) {
    toast('写真を選んでください')
    return
  }
  if (form.kind !== 'photo' && !input.body && !input.title) {
    toast('本文を書いてください')
    return
  }
  if (form.editingId) {
    notices.update(form.editingId, input)
    if (mode === 'publish') notices.publish(form.editingId)
    toast(mode === 'publish' ? '承認して出しました。ともだち帳に届きます（この端末）' : '下書きを保存しました')
  } else {
    notices.add(input, mode === 'publish' ? 'published' : 'draft')
    toast(mode === 'publish' ? 'ともだちに出しました。ともだち帳に届きます（この端末）' : '下書きに保存しました')
  }
  if (notices.lastWriteFailed) toast('保存できませんでした（端末の保存がいっぱいかもしれません）')
  form = emptyForm(form.kind === 'reply' ? 'notice' : form.kind)
  if (mode === 'draft') tab = 'drafts'
  else if (!notices.lastWriteFailed) tab = 'published'
  render()
}

/** 画像を端末の中で縮小して data URL に（localStorage に収まる大きさ。写真の元ファイルは送らない） */
const shrinkImage = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, PHOTO_MAX_PX / Math.max(img.width, img.height))
      const w = Math.max(1, Math.round(img.width * scale))
      const h = Math.max(1, Math.round(img.height * scale))
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      const ctx = c.getContext('2d')
      if (!ctx) {
        URL.revokeObjectURL(url)
        reject(new Error('canvas'))
        return
      }
      ctx.drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(url)
      resolve(c.toDataURL('image/jpeg', 0.82))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('image'))
    }
    img.src = url
  })

/* ---------- イベント ---------- */

main.addEventListener('click', (e) => {
  const el = e.target as HTMLElement
  const sel = el.closest<HTMLElement>('[data-select]')
  if (sel) {
    selectedId = sel.dataset.select ?? ''
    form = emptyForm()
    render()
    return
  }
  const tabEl = el.closest<HTMLElement>('[data-tab]')
  if (tabEl) {
    if (tab === 'compose') readForm()
    tab = tabEl.dataset.tab as Tab
    render()
    return
  }
  const kindEl = el.closest<HTMLElement>('[data-kind]')
  if (kindEl) {
    readForm()
    const a = getAnimal(selectedId)
    const kind = kindEl.dataset.kind as Exclude<NoticeKind, 'reply'>
    if (kind !== form.kind) {
      form = { ...emptyForm(kind), ...(a ? TEMPLATES[kind](a) : {}) }
      render()
      ;(document.getElementById(kind === 'photo' ? 'f-photo' : 'f-title') as HTMLElement | null)?.focus()
    }
    return
  }
  const saveEl = el.closest<HTMLElement>('[data-save]')
  if (saveEl) {
    save(saveEl.dataset.save as 'draft' | 'publish')
    return
  }
  if (el.closest('[data-cancel-reply]') || el.closest('[data-cancel-edit]')) {
    form = emptyForm()
    render()
    return
  }
  const replyEl = el.closest<HTMLElement>('[data-reply]')
  if (replyEl) {
    const l = letters.get(replyEl.dataset.reply ?? '')
    if (!l) return
    form = { ...emptyForm('reply'), replyTo: l.id, quote: l.text }
    tab = 'compose'
    render()
    ;(document.getElementById('f-body') as HTMLElement | null)?.focus()
    return
  }
  const copyEl = el.closest<HTMLElement>('[data-copy]')
  if (copyEl) {
    const a = getAnimal(selectedId)
    if (!a) return
    const start = new Date(copyEl.dataset.copy ?? '')
    const items = letters.listFor(a.id).filter((l) => weekStart(l.sentAt).getTime() === start.getTime())
    const text = digestText(a, start, items)
    navigator.clipboard
      ?.writeText(text)
      .then(() => toast('まとめをコピーしました'))
      .catch(() => {
        window.prompt('コピーできませんでした。この文章を選んでコピーしてください', text)
      })
    return
  }
  const approve = el.closest<HTMLElement>('[data-approve]')
  if (approve) {
    notices.publish(approve.dataset.approve ?? '')
    toast('承認して出しました。ともだち帳に届きます（この端末）')
    render()
    return
  }
  const edit = el.closest<HTMLElement>('[data-edit]')
  if (edit) {
    const n = notices.get(edit.dataset.edit ?? '')
    if (!n) return
    form = { kind: n.kind, title: n.title, body: n.body, date: n.date ?? '', time: n.time ?? '', photo: n.photo ?? '', replyTo: n.replyTo ?? '', quote: n.quote ?? '', editingId: n.id }
    tab = 'compose'
    render()
    return
  }
  const del = el.closest<HTMLElement>('[data-delete]')
  if (del) {
    const n = notices.get(del.dataset.delete ?? '')
    if (!n) return
    const ok = window.confirm(n.status === 'published' ? 'このお知らせを取り下げますか？ ともだち帳からも消えます。' : 'この下書きを削除しますか？')
    if (!ok) return
    notices.remove(n.id)
    toast(n.status === 'published' ? '取り下げました' : '削除しました')
    render()
  }
})

main.addEventListener('change', (e) => {
  const el = e.target as HTMLElement
  if (el.id === 'st-select') {
    selectedId = (el as HTMLSelectElement).value
    form = emptyForm()
    render()
    return
  }
  if (el.id === 'f-photo') {
    const file = (el as HTMLInputElement).files?.[0]
    if (!file) return
    readForm()
    shrinkImage(file)
      .then((dataUrl) => {
        form.photo = dataUrl
        render()
      })
      .catch(() => toast('この画像は読み込めませんでした'))
  }
})

// 入力のたびにプレビューを更新（描き直さず、プレビューの部分だけ）
main.addEventListener('input', (e) => {
  const el = e.target as HTMLElement
  if (!el.id.startsWith('f-')) return
  readForm()
  const a = getAnimal(selectedId)
  const pv = main.querySelector<HTMLElement>('.st-compose-preview .pv')
  if (a && pv) pv.outerHTML = bubblePreview(toInput(a))
})

// ともだち帳（別タブ）でお手紙が増えたら、一覧の数とお手紙の段を更新（入力中の本文は失わない）
letters.onChange(() => {
  if (tab === 'compose') readForm()
  render()
})
notices.onChange(() => {
  if (tab === 'compose') readForm()
  render()
})

render()
