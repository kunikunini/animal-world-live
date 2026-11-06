/**
 * 子ども向けの分かち書きの日本語（文節の間に空白）を、文節の中では改行しない HTML にする（11/6 の UT 健診: 「一／つずつ」「プロフ／ィール」のように言葉の途中で折れていた）。
 * 文節は「空白」と「、」「……」「。」「！」「？」のあと、「「」の前で区切る。`{漢字|よみ}` はふりがなにする。
 * sentences: 文（。！？のあと）もまとまりにして、文の切れ目で先に改行する（おはなしの字幕のような短い 2 行向け。長い文章では行末が空きやすいので使わない）
 * CSS: `.ph`（文節）は inline-block＋nowrap、`.ph-sent`（文）は inline-block
 */
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)

export function rubyHtml(s: string): string {
  return esc(s).replace(/\{([^|}]+)\|([^}]+)\}/g, '<ruby>$1<rt>$2</rt></ruby>')
}

function phrases(text: string): string {
  return text
    .trim()
    .split(/\s+/)
    .map((part) =>
      part
        .split(/(?<=、|……|。|！|？)|(?=「)/)
        // 長すぎるまとまり（読みを除いて 12 字より長い）は、はみ出さないよう ふつうに折り返す
        .map((ph) => (ph.replace(/\{([^|}]+)\|[^}]+\}/g, '$1').length > 12 ? rubyHtml(ph) : `<span class="ph">${rubyHtml(ph)}</span>`))
        .join('<wbr>'),
    )
    .join(' ')
}

export function phraseHtml(s: string, opts: { sentences?: boolean } = {}): string {
  if (!opts.sentences) return phrases(s)
  const sentences = s.match(/[^。！？]+[。！？]*\s*/g) ?? [s]
  return sentences
    // 元の文の間に空白があれば空白、無ければ改行できる所だけ
    .map((sent) => `<span class="ph-sent">${phrases(sent)}</span>${/\s$/.test(sent) ? ' ' : '<wbr>'}`)
    .join('')
}
