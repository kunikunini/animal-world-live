// 個体の写真をフォルダから取り込む: 正方形に切り抜いて 480px の webp にし、public/faces/<id>.webp に置き、
// src/data/photos.json（id → 画像のパス）を書き足す。ともだち帳・プロフィール・一覧の顔に出る（src/ui/faces.ts）。
// 使い方: node tools/photos-import.mjs <写真のフォルダ> [--dry]
// ふだんのフォルダは ~/apps/ANIMAL-WORLD-LIVE-HANDOFF/media-inbox/プロフィールアイコン用（README あり、リポジトリの外）
// ファイル名で個体を決める（拡張子は jpg / jpeg / png / heic / webp）:
//   <個体名>.jpg          例: ウィニー.jpg（名前がほかの種と重なる子は、次の書き方にする）
//   <種>_<個体名>.jpg     例: ミーアキャット_すず.jpg
//   <id>.jpg              例: r-184v168.jpg、angie.jpg
// 名前が重なる・見つからないファイルは取り込まず、最後に一覧で出す。人や個人情報が写った写真は入れないこと（README の決まり）。
// 写真を公開してよいか（会社の確認・個体の見分け）は入れる前にくにが決める（OPEN_QUESTIONS の Q-13）
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFileSync } from 'node:child_process'

const args = process.argv.slice(2)
const dry = args.includes('--dry')
const dir = args.find((a) => !a.startsWith('--'))
if (!dir) {
  console.error('usage: node tools/photos-import.mjs <folder> [--dry]')
  process.exit(1)
}

const roster = JSON.parse(fs.readFileSync('src/data/roster.json', 'utf8')).animals
const lions = JSON.parse(fs.readFileSync('src/data/animals.json', 'utf8')).animals
const all = [...lions.map((a) => ({ id: a.id, name: a.name, species: a.species })), ...roster.map((a) => ({ id: a.id, name: a.name, species: a.species }))]
const photosPath = 'src/data/photos.json'
const photos = fs.existsSync(photosPath) ? JSON.parse(fs.readFileSync(photosPath, 'utf8')) : { $comment: '', photos: {} }
photos.$comment =
  'tools/photos-import.mjs が書く。個体の id → 顔の写真（public/faces/<id>.webp）。ここに無い子は自作の顔のまま。写真の出所は README に書く'

const norm = (s) => s.normalize('NFC').trim()
const done = []
const skipped = []
// 番号の無いファイルを先に（「名前.jpg」→「名前-2.jpg」→「名前-3.jpg」の順）
const order = (f) => {
  const b = path.basename(f, path.extname(f))
  const m = b.match(/^(.*)-(\d+)$/)
  return m ? [m[1], Number(m[2])] : [b, 1]
}
const files = fs.readdirSync(dir).sort((x, y) => {
  const [a, i] = order(x)
  const [b, j] = order(y)
  return a < b ? -1 : a > b ? 1 : i - j
})
for (const file of files) {
  const ext = path.extname(file).toLowerCase()
  if (!['.jpg', '.jpeg', '.png', '.heic', '.webp'].includes(ext)) continue
  // 同じ子の 2 枚目からは「名前-2」。顔の写真は 1 頭 1 枚なので、番号つきは 1 枚目が無い時だけ使う
  const base = norm(path.basename(file, path.extname(file))).replace(/-\d+$/, '')
  let hits = all.filter((a) => a.id === base)
  if (!hits.length) {
    const sep = base.indexOf('_')
    if (sep > 0) {
      const sp = base.slice(0, sep)
      const nm = base.slice(sep + 1)
      hits = all.filter((a) => norm(a.species) === sp && norm(a.name) === nm)
    } else {
      hits = all.filter((a) => norm(a.name) === base)
    }
  }
  if (hits.length !== 1) {
    skipped.push(`${file}: ${hits.length ? `名前が ${hits.length} 頭に重なる（${hits.map((h) => h.species).join('・')}）→ <種>_<個体名> にする` : '名簿に見つからない'}`)
    continue
  }
  const a = hits[0]
  if (done.some((d) => d.endsWith(`（${a.id}）`))) {
    skipped.push(`${file}: ${a.name} はもう 1 枚目を使った（顔は 1 頭 1 枚）`)
    continue
  }
  const out = `public/faces/${a.id}.webp`
  if (!dry) {
    fs.mkdirSync('public/faces', { recursive: true })
    // 短い辺に合わせて中央を正方形に切り、480px に。メタデータ（撮影場所など）は書き出さない
    let src = path.join(dir, file)
    if (ext === '.heic') {
      // iPhone の HEIC は ffmpeg で読めないことがあるので、先に macOS の sips で JPEG に
      const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'awl-photo-')), 'in.jpg')
      execFileSync('sips', ['-s', 'format', 'jpeg', src, '--out', tmp], { stdio: 'ignore' })
      src = tmp
    }
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', src, '-vf', "crop='min(iw,ih)':'min(iw,ih)',scale=480:480", '-map_metadata', '-1', '-c:v', 'libwebp', '-quality', '82', out])
    photos.photos[a.id] = `/faces/${a.id}.webp`
  }
  done.push(`${file} → ${a.species} ${a.name}（${a.id}）`)
}
if (!dry) fs.writeFileSync(photosPath, JSON.stringify(photos, null, 2) + '\n')
console.log(`取り込み ${done.length} 枚${dry ? '（--dry: 書き出していない）' : ''}`)
for (const d of done) console.log('  ' + d)
if (skipped.length) {
  console.log(`取り込まなかった ${skipped.length} 枚`)
  for (const s of skipped) console.log('  ' + s)
}
