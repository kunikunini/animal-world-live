import type { Animal } from '../data/animals'
import { faceMarkup } from './faces'
import { esc } from './html'
import { animalName, getLang, speciesName, t } from './i18n'

/** 項目カード。空の必須項目は「準備中」と正直に出す（埋めない）。任意項目は空なら出さない */
function field(icon: string, label: string, value: string, options: { required?: boolean; keeper?: boolean } = {}): string {
  if (!value && !options.required) return ''
  const body = value ? esc(value) : `<span class="pending">${esc(t('pending'))}</span>`
  return `
    <div class="field${options.keeper ? ' keeper' : ''}">
      <svg class="ico" aria-hidden="true"><use href="#i-${icon}" /></svg>
      <div><h4>${label}</h4><p>${body}</p></div>
    </div>`
}

/** 見出し: 顔 + 名前 + 種名（・年齢）。担当飼育員の氏名は扱わない（データにも無い） */
export function renderHero(animal: Animal): string {
  const sub = [speciesName(animal.species), animal.ageLabel].filter(Boolean).map(esc).join(getLang() === 'en' ? ' · ' : '・')
  return `
    <div class="hero-face">${faceMarkup(animal)}</div>
    <div><h3>${esc(animalName(animal))}</h3><p>${sub}</p></div>
  `
}

/** プロフィールの項目カード */
export function renderProfile(animal: Animal): string {
  // 本文は施設からいただいた日本語の原文のまま。英語表示ではその旨を添える
  const note = getLang() === 'en' ? `<p class="note-small fields-note">${esc(t('profileInJa'))}</p>` : ''
  return (
    note +
    [
      field('find', t('fIdentify'), animal.identifyingMarks, { required: true }),
      field('family', t('fFamily'), animal.family),
      field('sparkle', t('fPersonality'), animal.personality),
      field('heart', t('fFavorites'), animal.favorites),
      field('bubble', t('fKeeper'), animal.keeperComment, { required: true, keeper: true }),
    ].join('')
  )
}
