import type { VideoSource } from '../data/animals'

/** プレーヤーに渡す、解決済みの再生情報 */
export interface ResolvedVideo {
  kind: 'recorded'
  url: string
  poster: string
  /** バッジの文言。収録映像は常にこれ。LIVE 表示の部品は作らない */
  badge: '収録映像'
  placeholder: boolean
}

/**
 * 再生元を解決する。今回は recorded だけを実装する。
 * live は将来のために型だけあり、ここでは null（再生できない）を返す。
 */
export function resolveVideoSource(src: VideoSource): ResolvedVideo | null {
  if (src.source !== 'recorded') return null
  if (!src.url) return null
  return {
    kind: 'recorded',
    url: src.url,
    poster: src.poster,
    badge: '収録映像',
    placeholder: src.placeholder === true,
  }
}
