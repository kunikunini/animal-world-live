import type { Animal } from '../data/animals'
import { faceMarkup } from './faces'

/** 文字を HTML に安全に入れる */
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
}

/** 項目カード。空の必須項目は「準備中」と正直に出す（埋めない）。任意項目は空なら出さない */
function field(icon: string, label: string, value: string, options: { required?: boolean; keeper?: boolean } = {}): string {
  if (!value && !options.required) return ''
  const body = value ? esc(value) : '<span class="pending">準備中</span>'
  return `
    <div class="field${options.keeper ? ' keeper' : ''}">
      <svg class="ico" aria-hidden="true"><use href="#i-${icon}" /></svg>
      <div><h4>${label}</h4><p>${body}</p></div>
    </div>`
}

/** 見出し: 顔 + 名前 + 種名（・年齢）。担当飼育員の氏名は扱わない（データにも無い） */
export function renderHero(animal: Animal): string {
  const sub = [animal.species, animal.ageLabel].filter(Boolean).map(esc).join('・')
  return `
    <div class="hero-face">${faceMarkup(animal)}</div>
    <div><h3>${esc(animal.name)}</h3><p>${sub}</p></div>
  `
}

/** プロフィールの項目カード */
export function renderProfile(animal: Animal): string {
  return [
    field('find', '見分けポイント', animal.identifyingMarks, { required: true }),
    field('family', '家族', animal.family),
    field('sparkle', '性格', animal.personality),
    field('heart', '好きなもの', animal.favorites),
    field('bubble', '飼育員コメント', animal.keeperComment, { required: true, keeper: true }),
  ].join('')
}
