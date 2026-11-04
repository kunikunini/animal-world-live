import type { Animal } from '../data/animals'

/**
 * 表示言語。日本語（既定）と英語。設定（ホームの歯車）で切り替え、`awl.lang` に保存する。
 *
 * 訳すのは画面の部品（ボタン・見出し・案内・物語）と、名前・種名だけ。
 * プロフィールの本文（見分けポイント・家族・飼育員コメントなど）は施設からいただいた原文なので、
 * 機械的に訳さず日本語のまま出し、英語のときはその旨を添える（確認していない訳を事実として出さない）。
 *
 * 静的な HTML は data-i18n（文字）・data-i18n-aria（aria-label）・data-i18n-title（title）に鍵を書く。
 */
export type Lang = 'ja' | 'en'

const STORAGE_KEY = 'awl.lang'

const DICT = {
  worldCanvas: { ja: 'サバンナの3Dワールド', en: '3D savanna world' },
  home: { ja: 'ホーム', en: 'Home' },
  enterWorld: { ja: 'アニマルワールドに入る', en: 'Enter Animal World' },
  tagline: { ja: '世界中の動物たちと、友達になろう。', en: 'Make friends with animals from around the world.' },
  homeStory: { ja: 'ふしぎな双眼鏡をのぞくと、どうぶつたちの世界へ。', en: 'Look through the magic binoculars into the world of animals.' },
  peek: { ja: 'のぞいてみる', en: 'Take a look' },
  book: { ja: 'ともだち帳', en: 'Friend Book' },
  bookNew: { ja: 'ともだち帳（あたらしいともだちがいます）', en: 'Friend Book (new friends)' },
  settings: { ja: '設定', en: 'Settings' },
  fallbackTitle: { ja: 'このブラウザでは3Dを表示できません', en: 'This browser can’t show 3D' },
  fallbackBody: {
    ja: 'WebGLが使えない環境のようです。別のブラウザか端末でもう一度開いてみてください。',
    en: 'WebGL doesn’t seem to be available here. Please try another browser or device.',
  },
  story: { ja: 'おはなし', en: 'Story' },
  gettingReady: { ja: 'じゅんびちゅう…', en: 'Getting ready…' },
  skip: { ja: 'スキップ', en: 'Skip' },
  next: { ja: 'つぎへ', en: 'Next' },
  story1: { ja: 'ある日、きみのもとに ふしぎな双眼鏡がとどいた。', en: 'One day, a pair of magic binoculars arrived for you.' },
  story2: { ja: 'のぞいてみると、どうぶつたちの世界につながっていた。', en: 'When you looked through them, they led to the world of animals.' },
  story3: { ja: 'ともだちになったら、ともだち帳に書いておこう。', en: 'When you make a new friend, keep them in your Friend Book.' },
  minimap: { ja: '地図。タップした場所へ歩く', en: 'Map. Tap a place to walk there' },
  expandMap: { ja: '地図を広げる', en: 'Open the map' },
  map: { ja: '地図', en: 'Map' },
  close: { ja: '閉じる', en: 'Close' },
  mapCanvas: { ja: 'サバンナ全体の地図。北が上。タップした場所へ歩く', en: 'Map of the whole savanna. North is up. Tap a place to walk there' },
  legend: { ja: '凡例', en: 'Legend' },
  you: { ja: 'あなた', en: 'You' },
  metAnimals: { ja: '出会った動物', en: 'Animals you met' },
  friends: { ja: 'ともだち', en: 'Friends' },
  spot: { ja: '観察スポット', en: 'Viewing spot' },
  waterhole: { ja: '水場', en: 'Waterhole' },
  kopje: { ja: 'コピエ', en: 'Kopje' },
  monitor: { ja: '観察モニター', en: 'Viewing monitor' },
  monitorOf: { ja: '{name}の観察モニター', en: '{name} — viewing monitor' },
  retry: { ja: 'もう一度試す', en: 'Try again' },
  backWorld: { ja: '世界に戻る', en: 'Back to the world' },
  recorded: { ja: '収録映像', en: 'Recorded video' },
  placeholder: { ja: '仮映像（色と文字だけの自作プレースホルダ）', en: 'Placeholder video (homemade, colors and text only)' },
  unmute: { ja: '音を出す', en: 'Turn sound on' },
  videoFailed: { ja: '映像を再生できませんでした', en: 'Couldn’t play the video' },
  videoPending: { ja: '映像は準備中です', en: 'Video coming soon' },
  videoLoadFailed: { ja: '映像を読み込めませんでした', en: 'Couldn’t load the video' },
  befriend: { ja: 'ともだちになる', en: 'Become friends' },
  inBook: { ja: 'ともだち帳に書いてあります', en: 'In your Friend Book' },
  addedBook: { ja: 'ともだち帳に加わりました', en: 'Added to your Friend Book' },
  addedStatus: { ja: '{name}がともだち帳に加わりました', en: '{name} was added to your Friend Book' },
  firstMet: { ja: '初めて出会った日', en: 'First met' },
  seeBook: { ja: 'ともだち帳を見る', en: 'Open Friend Book' },
  backBook: { ja: 'ともだち帳に戻る', en: 'Back to Friend Book' },
  memoryNote: {
    ja: 'この環境では保存できないため、ページを閉じるとともだち帳は消えます。',
    en: 'Saving isn’t available here, so your Friend Book will be cleared when you close the page.',
  },
  bookEmpty: { ja: 'まだ誰もいません', en: 'No one here yet' },
  toWorld: { ja: 'ワールドに戻る', en: 'Back to the world' },
  visit: { ja: '{name}に会いに行く', en: 'Visit {name}' },
  visitNew: { ja: '{name}（あたらしいともだち）に会いに行く', en: 'Visit {name} (new friend)' },
  tagNew: { ja: 'あたらしい', en: 'New' },
  metOn: { ja: '{date}に出会った', en: 'Met {date}' },
  stick: { ja: '移動スティック', en: 'Movement stick' },
  goHome: { ja: 'ホームへ', en: 'Home' },
  gotoSpot: { ja: '観察スポットへ', en: 'Go to the viewing spot' },
  jump: { ja: 'ジャンプ', en: 'Jump' },
  distance: { ja: 'あと {n} m', en: '{n} m to go' },
  nearby: { ja: '{name}のそばに来ました', en: 'You’re near {name}' },
  friendTag: { ja: '{name}（ともだち）', en: '{name} (friend)' },
  faceOf: { ja: '{name}の顔', en: '{name}’s face' },
  lookAt: { ja: '{name}を双眼鏡で見る', en: 'Look at {name} through the binoculars' },
  pending: { ja: '準備中', en: 'Coming soon' },
  fIdentify: { ja: '見分けポイント', en: 'How to tell' },
  fFamily: { ja: '家族', en: 'Family' },
  fPersonality: { ja: '性格', en: 'Personality' },
  fFavorites: { ja: '好きなもの', en: 'Favorites' },
  fKeeper: { ja: '飼育員コメント', en: 'Keeper’s note' },
  profileInJa: { ja: '', en: 'Profile notes are shown in the original Japanese.' },
  reduceMotion: { ja: '動きをへらす', en: 'Reduce motion' },
  reduceMotionDesc: { ja: '画面の揺れ・アニメーションを少なくします', en: 'Less camera sway and animation' },
  language: { ja: '言語', en: 'Language' },
  languageDesc: { ja: 'プロフィールの本文は日本語のままです', en: 'Profile notes stay in Japanese' },
} satisfies Record<string, Record<Lang, string>>

export type I18nKey = keyof typeof DICT

/** 種名。プロフィールの本文と違い、決まった言葉なので訳す */
const SPECIES: Record<string, string> = {
  ライオン: 'Lion',
}

function readLang(): Lang {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'en' || v === 'ja') return v
  } catch {
    // 使えない環境では既定値
  }
  return 'ja'
}

let lang: Lang = readLang()
const listeners: Array<(lang: Lang) => void> = []

export function getLang(): Lang {
  return lang
}

export function setLang(next: Lang): void {
  if (next === lang) return
  lang = next
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // 保存できなくても今回は切り替える
  }
  applyStatic()
  listeners.forEach((fn) => fn(lang))
}

export function onLangChange(fn: (lang: Lang) => void): void {
  listeners.push(fn)
}

export function t(key: I18nKey, vars: Record<string, string | number> = {}): string {
  let s: string = DICT[key][lang]
  for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v))
  return s
}

export function animalName(animal: Animal): string {
  return lang === 'en' && animal.nameEn ? animal.nameEn : animal.name
}

export function speciesName(species: string): string {
  return lang === 'en' ? (SPECIES[species] ?? species) : species
}

/** 「2026年11月2日」／「Nov 2, 2026」 */
export function formatDate(d: Date): string {
  if (lang === 'en') return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}

/** 「11月2日」／「Nov 2」 */
export function formatDateShort(d: Date): string {
  if (lang === 'en') return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

/** data-i18n 系の属性が付いた静的な部品と、<html lang> を今の言語にする */
export function applyStatic(root: ParentNode = document): void {
  document.documentElement.lang = lang
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n as I18nKey)
  })
  root.querySelectorAll<HTMLElement>('[data-i18n-aria]').forEach((el) => {
    el.setAttribute('aria-label', t(el.dataset.i18nAria as I18nKey))
  })
  root.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((el) => {
    el.title = t(el.dataset.i18nTitle as I18nKey)
  })
}
