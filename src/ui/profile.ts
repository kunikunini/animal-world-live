import type { Animal } from '../data/animals'

/** 文字を HTML に安全に入れる */
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
}

/** 必須項目。空なら「準備中」と正直に出す（埋めない） */
function requiredField(label: string, value: string): string {
  const body = value ? esc(value) : '<span class="profile-pending">準備中</span>'
  return `<div class="profile-field"><dt>${label}</dt><dd>${body}</dd></div>`
}

/** 任意項目。空なら出さない */
function optionalField(label: string, value: string): string {
  if (!value) return ''
  return `<div class="profile-field"><dt>${label}</dt><dd>${esc(value)}</dd></div>`
}

/**
 * 写真。`photo` は任意で、無いときは頭文字の丸で成立させる。
 * 写真は許諾範囲が決まるまでリポジトリに入れないので、無い状態が基本。
 */
function avatar(animal: Animal): string {
  if (animal.photo) {
    return `<img class="profile-avatar" src="${esc(animal.photo)}" alt="${esc(animal.name)}の写真" />`
  }
  const initial = animal.name.slice(0, 1)
  return `<div class="profile-avatar profile-avatar-placeholder" aria-hidden="true">${esc(initial)}</div>`
}

/** プロフィールの HTML を返す。担当飼育員の氏名は扱わない（データにも無い） */
export function renderProfile(animal: Animal): string {
  const sub = [animal.species, animal.ageLabel].filter(Boolean).map(esc).join('・')
  return `
    <article class="profile">
      <header class="profile-header">
        ${avatar(animal)}
        <div>
          <h3 class="profile-name">${esc(animal.name)}</h3>
          <p class="profile-sub">${sub}</p>
        </div>
      </header>
      <dl class="profile-fields">
        ${optionalField('家族', animal.family)}
        ${optionalField('性格', animal.personality)}
        ${optionalField('好きなもの', animal.favorites)}
        ${requiredField('見分けポイント', animal.identifyingMarks)}
      </dl>
      <section class="profile-keeper">
        <h4 class="profile-keeper-title">飼育員コメント</h4>
        <p class="profile-keeper-body">${animal.keeperComment ? esc(animal.keeperComment) : '<span class="profile-pending">準備中</span>'}</p>
      </section>
    </article>
  `
}
