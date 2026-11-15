// トロッコのドット絵（11/15 くに: 「ドット風のほうが良さそう」）。
// 絵は文字の表で書く（1 文字 = 1 ドット、'.' は透明）。色は表ごとのパレット。初めて使う時に小さなキャンバスに描いておく
import type { ItemKind } from './course'

export type Sprite = HTMLCanvasElement

const cache = new Map<string, Sprite>()

/** 文字の表からドット絵を作る（同じ名前は 1 回だけ作る） */
export function sprite(name: string, rows: readonly string[], pal: Readonly<Record<string, string>>): Sprite {
  const hit = cache.get(name)
  if (hit) return hit
  const h = rows.length
  const w = Math.max(...rows.map((r) => r.length))
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')
  if (g) {
    for (let y = 0; y < h; y++) {
      const row = rows[y]
      for (let x = 0; x < row.length; x++) {
        const col = pal[row[x]]
        if (!col) continue
        g.fillStyle = col
        g.fillRect(x, y, 1, 1)
      }
    }
  }
  cache.set(name, c)
  return c
}

/**
 * ドット絵を置く。(x, y) は足もとのまん中（anchor 'bottom'）か絵のまん中（'center'）、unit は 1 ドットの大きさ。
 * flip で左右反対。呼ぶ側の座標の向き（上が +y の時など）は呼ぶ側でそろえておく
 */
export function blit(
  ctx: CanvasRenderingContext2D,
  spr: Sprite,
  x: number,
  y: number,
  unit: number,
  opt: { flip?: boolean; anchor?: 'bottom' | 'center'; rot?: number; alpha?: number } = {},
): void {
  const w = spr.width * unit
  const h = spr.height * unit
  ctx.save()
  ctx.imageSmoothingEnabled = false
  ctx.translate(x, y)
  if (opt.rot) ctx.rotate(opt.rot)
  if (opt.flip) ctx.scale(-1, 1)
  if (opt.alpha !== undefined) ctx.globalAlpha *= opt.alpha
  ctx.drawImage(spr, -w / 2, opt.anchor === 'center' ? -h / 2 : -h, w, h)
  ctx.restore()
}

// ---- 拾うもの ----
const K = '#2a1a22'
const ITEM_ART: Record<ItemKind, { rows: string[]; pal: Record<string, string> }> = {
  // 貝がら（ピンクのホタテ）
  shell: {
    rows: [
      '....kkkkk....',
      '..kkwpPppkk..',
      '.kwwwpPppPpk.',
      '.kpPppPppPpk.',
      'kppPppPppPppk',
      'kppPppPppPppk',
      'kppPppPppPppk',
      '.kpPppPpdPdk.',
      '..kPppPpdPk..',
      '...kkpPpkk...',
      '....kpPpk....',
      '....kkkkk....',
    ],
    pal: { k: K, w: '#fff2f6', p: '#ffc2d2', P: '#ff8fae', d: '#d9607f' },
  },
  // 水晶（むらさき）
  gem: {
    rows: [
      '...kkkkkkk...',
      '..kwwlLlLLk..',
      '.kwwlLlLLLdk.',
      'kkkkkkkkkkkkk',
      '.kLlLLdLLLdk.',
      '..kLlLdLLdk..',
      '...kLlLdLk...',
      '....kLldk....',
      '.....kdk.....',
      '......k......',
    ],
    pal: { k: K, w: '#f4edff', l: '#c9b2ff', L: '#9a7cf2', d: '#6a4fc4' },
  },
  // 羽根（空の世界）
  feather: {
    rows: [
      '.........kk',
      '........kwk',
      '.......kwlk',
      '......kwllk',
      '.....kwlslk',
      '....kwlslk.',
      '...kwlslk..',
      '..kwlslk...',
      '..kllslk...',
      '.kllsk.....',
      '.klsk......',
      'kssk.......',
      'sk.........',
    ],
    pal: { k: '#3a4a6a', w: '#ffffff', l: '#dfe9ff', s: '#8fa6d6' },
  },
  // 雪のけっしょう
  snow: {
    rows: [
      '.....k.....',
      '...k.w.k...',
      '....kwk....',
      '.k...w...k.',
      '..ww.w.ww..',
      'kwwwwbwwwwk',
      '..ww.w.ww..',
      '.k...w...k.',
      '....kwk....',
      '...k.w.k...',
      '.....k.....',
    ],
    pal: { k: '#7fc4ef', w: '#ffffff', b: '#bfe8ff' },
  },
  // くだもの（マンゴー）
  fruit: {
    rows: [
      '......kgk...',
      '.....kgGk...',
      '...kkkkkk...',
      '..kyyYYooK..',
      '.kwyyYYoooK.',
      '.kyyYYooorK.',
      'kyyYYooorrK.',
      'kyYYooorrrK.',
      '.kYooorrrK..',
      '..kooorrK...',
      '...kKKKK....',
    ],
    pal: { k: K, K: '#5a2a14', w: '#fff6c8', y: '#ffe36b', Y: '#ffc94a', o: '#ff9a3a', r: '#e2563a', g: '#4caf50', G: '#2e7d32' },
  },
  // ほしのかけら
  star: {
    rows: [
      '......k......',
      '.....kwk.....',
      '.....kyk.....',
      '....kwyyk....',
      'kkkkkwyyykkkk',
      'kwwyyyyyyyyok',
      '.kyyyyyyyyok.',
      '..kyyyyyyok..',
      '...kyyyyyok..',
      '..kyyykyyook.',
      '..kyyk.kyook.',
      '.kyok...kook.',
      '.kkk.....kkk.',
    ],
    pal: { k: '#6b4a10', w: '#fffbe0', y: '#ffd84a', o: '#f0a020' },
  },
  // よつばのクローバー（ハートの葉 4 枚）
  clover: {
    rows: [
      '..kk.k.kk..',
      '.kwgkkkgGk.',
      '.kggGkgGGk.',
      '..kGGkGGk..',
      'kkkkkdkkkkk',
      'kwgGkdkgGGk',
      'kggGGkGGGGk',
      '.kGGk.kGGk.',
      '..kk.d.kk..',
      '......d....',
      '.......d...',
    ],
    pal: { k: '#1f4a24', w: '#eaffd8', g: '#9be37a', G: '#55b04a', d: '#2f6a2a' },
  },
}

export function itemSprite(kind: ItemKind): Sprite {
  const a = ITEM_ART[kind]
  return sprite(`item:${kind}`, a.rows, a.pal)
}

// ---- 形から描くドット絵（ぼかしなしで塗り、まわりに濃いふちを自動でつける） ----
/** e: だ円（中心・半径）、r: 四角、l: 線（太さ 1）、t: 三角、p: 1 ドット。最後の a は「ふちの後に描く」（ふちを付けない飾り） */
export type Op =
  | ['e', number, number, number, number, string, ('a' | undefined)?]
  | ['r', number, number, number, number, string, ('a' | undefined)?]
  | ['l', number, number, number, number, string, ('a' | undefined)?]
  | ['t', number, number, number, number, number, number, string, ('a' | undefined)?]
  | ['p', number, number, string, ('a' | undefined)?]

/** 形のリストからドット絵を作る。outline はふちの色（null でふちなし） */
export function paint(name: string, w: number, h: number, ops: readonly Op[], outline: string | null = '#2a1a22'): Sprite {
  const hit = cache.get(name)
  if (hit) return hit
  const grid: (string | null)[] = new Array(w * h).fill(null)
  const set = (x: number, y: number, c: string) => {
    if (x >= 0 && y >= 0 && x < w && y < h) grid[y * w + x] = c
  }
  const apply = (op: Op) => {
    switch (op[0]) {
      case 'e': {
        const [, cx, cy, rx, ry, c] = op
        for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
          for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
            const dx = (x + 0.5 - cx) / (rx + 0.01)
            const dy = (y + 0.5 - cy) / (ry + 0.01)
            if (dx * dx + dy * dy <= 1) set(x, y, c)
          }
        break
      }
      case 'r': {
        const [, x0, y0, rw, rh, c] = op
        for (let y = y0; y < y0 + rh; y++) for (let x = x0; x < x0 + rw; x++) set(x, y, c)
        break
      }
      case 'l': {
        const [, x0, y0, x1, y1, c] = op
        const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1)
        for (let i = 0; i <= n; i++) set(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), c)
        break
      }
      case 't': {
        const [, ax, ay, bx, by, qx, qy, c] = op
        const minX = Math.floor(Math.min(ax, bx, qx))
        const maxX = Math.ceil(Math.max(ax, bx, qx))
        const minY = Math.floor(Math.min(ay, by, qy))
        const maxY = Math.ceil(Math.max(ay, by, qy))
        const sgn = (px: number, py: number, x1: number, y1: number, x2: number, y2: number) => (px - x2) * (y1 - y2) - (x1 - x2) * (py - y2)
        for (let y = minY; y <= maxY; y++)
          for (let x = minX; x <= maxX; x++) {
            const px = x + 0.5
            const py = y + 0.5
            const d1 = sgn(px, py, ax, ay, bx, by)
            const d2 = sgn(px, py, bx, by, qx, qy)
            const d3 = sgn(px, py, qx, qy, ax, ay)
            const neg = d1 < 0 || d2 < 0 || d3 < 0
            const pos = d1 > 0 || d2 > 0 || d3 > 0
            if (!(neg && pos)) set(x, y, c)
          }
        break
      }
      case 'p':
        set(op[1], op[2], op[3])
        break
    }
  }
  const late = (op: Op) => op[op.length - 1] === 'a'
  for (const op of ops) if (!late(op)) apply(op)
  if (outline) {
    const filled = grid.map((c) => c !== null)
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (filled[y * w + x]) continue
        const near = (xx: number, yy: number) => xx >= 0 && yy >= 0 && xx < w && yy < h && filled[yy * w + xx]
        if (near(x - 1, y) || near(x + 1, y) || near(x, y - 1) || near(x, y + 1)) grid[y * w + x] = outline
      }
  }
  for (const op of ops) if (late(op)) apply(op)
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')
  if (g)
    for (let i = 0; i < grid.length; i++) {
      const col = grid[i]
      if (!col) continue
      g.fillStyle = col
      g.fillRect(i % w, Math.floor(i / w), 1, 1)
    }
  cache.set(name, c)
  return c
}
