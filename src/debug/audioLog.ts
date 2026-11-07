/**
 * 実機の調べ用: アプリを閉じる・スリープに入る時の出来事の記録（「閉じる時の電子音」の調査、11/7）。
 * いつも小さく記録だけしておき（この端末に最後の 80 件）、設定の見出し「設定」を 2 秒のうちに 5 回押すと画面の下に出す。
 * ホーム画面のアプリは URL に印を付けられないので、隠し操作で開く。記録に個人の情報は入れない（時刻と音の状態だけ）
 */
const KEY = 'awl.audioLog.v1'
const MAX = 80

export function alog(line: string): void {
  try {
    const arr: string[] = JSON.parse(localStorage.getItem(KEY) || '[]')
    const d = new Date()
    const ts = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`
    arr.push(`${ts} ${line}`)
    while (arr.length > MAX) arr.shift()
    localStorage.setItem(KEY, JSON.stringify(arr))
  } catch {
    // 記録できなくても続ける
  }
}

let panel: HTMLElement | null = null

function render(): void {
  if (!panel) return
  let arr: string[] = []
  try {
    arr = JSON.parse(localStorage.getItem(KEY) || '[]')
  } catch {
    // 空のまま
  }
  ;(panel.querySelector('pre') as HTMLElement).textContent = arr.slice().reverse().join('\n') || '（記録なし）'
}

export function toggleAudioLog(): void {
  if (panel) {
    panel.remove()
    panel = null
    return
  }
  panel = document.createElement('div')
  panel.setAttribute('style', 'position:fixed;left:8px;right:8px;bottom:8px;z-index:99999;max-height:45vh;display:flex;flex-direction:column;background:rgba(20,20,28,.92);color:#e8f0ff;border-radius:10px;font:11px/1.35 ui-monospace,Menlo,monospace;padding:8px;')
  panel.innerHTML =
    '<div style="display:flex;gap:8px;margin-bottom:6px"><b style="flex:1">音の記録（新しい順）</b><button type="button" data-a="r">更新</button><button type="button" data-a="c">消す</button><button type="button" data-a="x">閉じる</button></div><pre style="margin:0;overflow:auto;white-space:pre-wrap"></pre>'
  panel.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest<HTMLElement>('[data-a]')?.dataset.a
    if (a === 'c') {
      try {
        localStorage.removeItem(KEY)
      } catch {
        // 続ける
      }
    }
    if (a === 'x') return toggleAudioLog()
    render()
  })
  panel.dataset.sfx = 'none'
  document.body.append(panel)
  render()
}

/** 見出しを 2 秒のうちに 5 回押すと出す／隠す */
export function bindAudioLogGesture(el: HTMLElement): void {
  let taps: number[] = []
  el.addEventListener('click', () => {
    const now = performance.now()
    taps = taps.filter((t) => now - t < 2000)
    taps.push(now)
    if (taps.length >= 5) {
      taps = []
      toggleAudioLog()
    }
  })
}
