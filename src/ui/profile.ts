import type { Animal, ProfileText } from '../data/animals'
import { faceMarkup } from './faces'
import { esc } from './html'
import { animalName, getLang, speciesName, t } from './i18n'

/** {漢字|よみ} をふりがな付きで出す（ほかはエスケープしたまま） */
function ruby(s: string): string {
  return esc(s).replace(/\{([^|}]+)\|([^}]+)\}/g, '<ruby>$1<rt>$2</rt></ruby>')
}

/** 項目カード。空の必須項目は「準備中」と正直に出す（埋めない）。任意項目は空なら出さない */
function field(
  icon: string,
  label: string,
  value: string,
  options: { required?: boolean; keeper?: boolean; extra?: string } = {},
): string {
  if (!value && !options.required) return ''
  const body = value ? ruby(value) : `<span class="pending">${esc(t('pending'))}</span>`
  return `
    <div class="field${options.keeper ? ' keeper' : ''}">
      <svg class="ico" aria-hidden="true"><use href="#i-${icon}" /></svg>
      <div><h4>${label}</h4><p>${body}</p>${options.extra || ''}</div>
    </div>`
}

/** 種の説明の出典（小さなリンク） */
function sources(list: { title: string; url: string }[] | undefined): string {
  if (!list?.length) return ''
  const links = list
    .filter((s) => /^https:\/\//.test(s.url))
    .map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title || s.url)}</a>`)
  return links.length ? `<p class="field-src">${esc(t('fSources'))}: ${links.join(' / ')}</p>` : ''
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
  // 英語表示では英語版の本文（animal.en）を出す。英語版が無い子だけ、日本語のままである旨を添える
  const en = getLang() === 'en' ? animal.en : undefined
  const note = getLang() === 'en' && !en ? `<p class="note-small fields-note">${esc(t('profileInJa'))}</p>` : ''
  const v = (k: keyof ProfileText): string => (en ? en[k] : (animal[k] ?? '')) || ''
  return (
    note +
    [
      field('find', t('fIdentify'), v('identifyingMarks'), { required: true }),
      field('family', t('fFamily'), v('family')),
      field('sparkle', t('fPersonality'), v('personality')),
      field('heart', t('fFavorites'), v('favorites')),
      field('book', t('fSpecies'), v('speciesInfo'), { extra: sources(animal.speciesSources) }),
      field('bubble', t('fKeeper'), v('keeperComment'), { required: true, keeper: true }),
    ].join('')
  )
}
