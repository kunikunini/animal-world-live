/**
 * ワールドに入った時の名前の表示。オープンワールドのゲームの地名表示のように、
 * 大きな太い文字を半透明で、ふわっと出してふわっと消す（動きは style.css の「ワールドの名前」）。
 * 画面のタップは素通りする。読み上げは「〇〇に来ました」。
 */
export interface RegionTitle {
  /** main: 大きく出す名前／sub: 上に小さく添える名前（別の言語の名前。無ければ出さない）／spoken: 読み上げる文 */
  show: (main: string, sub: string, spoken: string) => void
}

export function createRegionTitle(): RegionTitle {
  const root = document.getElementById('region-title') as HTMLElement
  const mainEl = document.getElementById('region-title-main') as HTMLElement
  const subEl = document.getElementById('region-title-sub') as HTMLElement
  const spokenEl = document.getElementById('region-title-spoken') as HTMLElement

  // 消え終わったら隠す（次に出す時はアニメーションを最初から）
  root.addEventListener('animationend', (e) => {
    if (e.target !== root) return
    root.classList.remove('is-on')
    root.hidden = true
  })

  return {
    show: (main, sub, spoken) => {
      mainEl.textContent = main
      subEl.textContent = sub
      subEl.hidden = !sub
      spokenEl.textContent = spoken
      root.hidden = false
      root.classList.remove('is-on')
      void root.offsetWidth
      root.classList.add('is-on')
    },
  }
}
