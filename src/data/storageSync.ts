/**
 * 同じ端末の別のタブ（ともだち帳とスタッフ画面）で localStorage が書き換わった時に知らせる。
 * `storage` イベントは書き換えたタブ自身には来ないので、同じタブの中は各ストアの onChange でまかなう。
 */
export function onStorageKey(key: string, fn: () => void): void {
  try {
    window.addEventListener('storage', (e) => {
      if (e.key === key || e.key === null) fn()
    })
  } catch {
    // window が無い環境は無視
  }
}
