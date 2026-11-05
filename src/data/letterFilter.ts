/**
 * 子どもが書くお手紙のフィルタ。送る前に端末の中で見る（サーバーは無い）。
 * 止めるのは 2 つだけ: 連絡先らしきもの（電話番号・メールアドレス・URL。個人情報を外へ出さない）と、
 * 乱暴な言葉の短い一覧。言葉の一覧は施設と相談して増やす前提で、ここでは最小限にしている。
 */
import { ANIMALS } from './animals'

export type LetterCheck = { ok: true } | { ok: false; reason: 'contact' | 'word' }

const CONTACT = [
  /https?:\/\//i,
  /www\./i,
  /[\w.+-]+@[\w-]+\.[\w.-]+/,
  // 電話番号らしき並び（10 桁以上の数字。区切りは任意）
  /(?:\d[\s-]?){10,}/,
  /line\s*id/i,
]

const WORDS = ['しね', '死ね', 'ころす', '殺す', 'ばか', 'バカ', 'あほ', 'アホ', 'きもい', 'うざい', 'くそ', 'クソ', 'ぶす', 'ブス', 'でぶ', 'デブ']

/**
 * 止めない言葉（ホワイトリスト）。動物の名前・種名は、止める言葉を含んでいても通す
 * （「アホウドリ」のように、止める言葉を部分に含む動物名があるため）。
 * アプリのデータにある個体名・英語名・種名を使い、データに無い動物の名前はここに足す。
 */
const SAFE_WORDS = ['アホウドリ', 'あほうどり', 'バカガイ', 'ばかがい', 'オオバカガイ']

let safeList: string[] | null = null

function safeWords(): string[] {
  if (safeList) return safeList
  const set = new Set<string>(SAFE_WORDS)
  for (const a of ANIMALS) {
    for (const w of [a.name, a.nameEn ?? '', a.species]) if (w) set.add(w.normalize('NFKC'))
  }
  // 長い語から消す（「オオバカガイ」の中の「バカガイ」のように、短い語が長い語の一部のことがある）
  safeList = [...set].sort((x, y) => y.length - x.length)
  return safeList
}

/** 止めない言葉を先に取り除いた文。残りに止める言葉があれば止める */
function withoutSafeWords(t: string): string {
  let out = t
  for (const w of safeWords()) if (out.includes(w)) out = out.split(w).join(' ')
  return out
}

export function checkLetter(text: string): LetterCheck {
  const t = text.normalize('NFKC')
  if (CONTACT.some((re) => re.test(t))) return { ok: false, reason: 'contact' }
  const rest = withoutSafeWords(t)
  if (WORDS.some((w) => rest.includes(w))) return { ok: false, reason: 'word' }
  return { ok: true }
}
