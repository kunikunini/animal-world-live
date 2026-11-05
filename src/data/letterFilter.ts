/**
 * 子どもが書くお手紙のフィルタ。送る前に端末の中で見る（サーバーは無い）。
 * 止めるのは 2 つだけ: 連絡先らしきもの（電話番号・メールアドレス・URL。個人情報を外へ出さない）と、
 * 乱暴な言葉の短い一覧。言葉の一覧は施設と相談して増やす前提で、ここでは最小限にしている。
 */
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

export function checkLetter(text: string): LetterCheck {
  const t = text.normalize('NFKC')
  if (CONTACT.some((re) => re.test(t))) return { ok: false, reason: 'contact' }
  if (WORDS.some((w) => t.includes(w))) return { ok: false, reason: 'word' }
  return { ok: true }
}
