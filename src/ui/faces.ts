import type { Animal } from '../data/animals'
import { LIONS } from '../world/layout'
import { esc } from './html'
import { animalName, t } from './i18n'

/**
 * 顔。写真（animal.photo）があれば写真、無ければ自作 SVG のライオンの顔で成立させる。
 * 写真の選定は人間がやるので、無い状態が基本。頭文字の丸は使わない（顔が主役）。
 * SVG の色はワールドのライオンの毛色（layout.ts）から取る。事実の描写ではなく様式化。
 */
/** 14 の角を持つ星形。たてがみに使う */
function starPoints(cx: number, cy: number, outer: number, inner: number, n: number): string {
  const pts: string[] = []
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? outer : inner
    const a = (Math.PI * i) / n - Math.PI / 2
    pts.push(`${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r).toFixed(1)}`)
  }
  return pts.join(' ')
}

/** 顔のパーツだけ（地の四角は無し）。物語のコマなど、別の地の上に置く時に使う */
export function faceParts(animal: Animal): string {
  const p = LIONS.find((l) => l.id === animal.id)
  const coat = p?.coat ?? '#d9a95f'
  const cub = p?.cub === true
  const mane = p?.mane ? (p.maneColor ?? '#8d5a2b') : null
  const maneTop = p?.maneTopColor ?? '#5a3418'
  const r = cub ? 31 : 33
  const cy = cub ? 54 : 53
  const earR = cub ? 11 : 9.5
  const earDx = cub ? 25 : 27
  const earY = cub ? 30 : 31
  const eyeY = cub ? 50 : 48
  const eyeDx = cub ? 11.5 : 12.5
  const eyeR = cub ? 4.4 : 3.8
  const parts: string[] = []
  if (mane) {
    parts.push(`<polygon points="${starPoints(50, 55, 49, 40, 14)}" fill="${maneTop}" />`)
    parts.push(`<circle cx="50" cy="55" r="42" fill="${mane}" />`)
  }
  // 耳（内側はうすいピンク）
  parts.push(`<circle cx="${50 - earDx}" cy="${earY}" r="${earR}" fill="${coat}" /><circle cx="${50 + earDx}" cy="${earY}" r="${earR}" fill="${coat}" />`)
  parts.push(`<circle cx="${50 - earDx}" cy="${earY + 1}" r="${earR * 0.55}" fill="#e8a79a" /><circle cx="${50 + earDx}" cy="${earY + 1}" r="${earR * 0.55}" fill="#e8a79a" />`)
  // 顔
  parts.push(`<circle cx="50" cy="${cy}" r="${r}" fill="${coat}" />`)
  // 口まわり（明るい）
  parts.push(`<ellipse cx="50" cy="${cy + 11}" rx="${cub ? 15 : 16}" ry="${cub ? 11 : 12}" fill="#f3dcae" />`)
  // 鼻と口
  parts.push(`<path d="M${50 - 5.5} ${cy + 4.5} h11 l-5.5 6.5z" fill="#3a2a22" />`)
  parts.push(`<path d="M50 ${cy + 11} v3.5 M50 ${cy + 14.5} c-2 3 -5 3 -7 1 M50 ${cy + 14.5} c2 3 5 3 7 1" fill="none" stroke="#3a2a22" stroke-width="1.8" stroke-linecap="round" />`)
  // 目（黒に白い光）
  parts.push(`<circle cx="${50 - eyeDx}" cy="${eyeY}" r="${eyeR}" fill="#140d08" /><circle cx="${50 + eyeDx}" cy="${eyeY}" r="${eyeR}" fill="#140d08" />`)
  parts.push(`<circle cx="${50 - eyeDx + 1.4}" cy="${eyeY - 1.4}" r="1.3" fill="#fff" /><circle cx="${50 + eyeDx + 1.4}" cy="${eyeY - 1.4}" r="1.3" fill="#fff" />`)
  // ひげ
  parts.push(`<path d="M${50 - 14} ${cy + 9} h-9 M${50 - 14} ${cy + 13} h-8 M${50 + 14} ${cy + 9} h9 M${50 + 14} ${cy + 13} h8" fill="none" stroke="#3a2a22" stroke-width="1.2" stroke-linecap="round" opacity=".55" />`)
  return parts.join('')
}

/** 地の色。仔はうすい橙、おとなはうすい金 */
export function faceBackground(animal: Animal): string {
  const p = LIONS.find((l) => l.id === animal.id)
  return p?.cub ? '#ffe8d6' : '#fff1c9'
}

export function faceSvg(animal: Animal): string {
  return `<svg viewBox="0 0 100 100" role="img" aria-label="${esc(t('faceOf', { name: animalName(animal) }))}"><rect width="100" height="100" fill="${faceBackground(animal)}" />${faceParts(animal)}</svg>`
}

/** 顔の HTML。写真があれば img、無ければ SVG。cls はサイズ用のクラス */
export function faceMarkup(animal: Animal, cls = ''): string {
  if (animal.photo) {
    return `<img class="${esc(cls)}" src="${esc(animal.photo)}" alt="" />`
  }
  return `<span class="face-svg ${esc(cls)}" aria-hidden="true">${faceSvg(animal)}</span>`
}
