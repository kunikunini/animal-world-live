// 動物の一覧 CSV（ワールド区分）から src/data/roster.json を作る。
// 使い方: node tools/roster-from-csv.mjs <animals_by_world_current.csv> [出力先]
// CSV はリポジトリに入れない（施設の飼育エリア名を含むため）。出すのはワールド・区分・種・個体名・代表フラグだけ。
// ライオンは src/data/animals.json に手書きのプロフィールがあるので、ここでは出さない。
import fs from 'node:fs'

const [, , csvPath, outPath = 'src/data/roster.json'] = process.argv
if (!csvPath) {
  console.error('usage: node tools/roster-from-csv.mjs <csv> [out]')
  process.exit(1)
}

/** CSV のワールド名 → コード内のキー */
const WORLD_KEYS = {
  アフリカ: 'africa',
  ジャングル: 'jungle',
  北の世界: 'north',
  南半球: 'south',
  水の世界: 'water',
  空の世界: 'sky',
  'ふれあい・パートナー': 'partner',
}
/** ライオンは animals.json 側 */
const SKIP_SPECIES = new Set(['アフリカライオン'])

/** 引用符つきの欄にだけ対応する小さな CSV の読み取り */
function parseCsv(text) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      if (row.some((v) => v !== '')) rows.push(row)
      row = []
      cell = ''
    } else cell += c
  }
  if (cell || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

/** 種と名前から、並び替えに左右されない ID を作る（同じ名前の別の種がいるので名前だけでは作らない） */
function stableId(species, name) {
  let h = 0x811c9dc5
  for (const ch of `${species}/${name}`) {
    h ^= ch.codePointAt(0)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return `r-${h.toString(36)}`
}

const [header, ...body] = parseCsv(fs.readFileSync(csvPath, 'utf8').replace(/^﻿/, ''))
const col = (name) => {
  const i = header.indexOf(name)
  if (i < 0) throw new Error(`CSV に ${name} の列がない`)
  return i
}
const iWorld = col('world')
const iSub = col('sub_area')
const iSpecies = col('species')
const iCount = col('count')
const iNames = col('individual_names')
const iRep = col('representative')

const animals = []
const seen = new Set()
for (const r of body) {
  const world = WORLD_KEYS[r[iWorld]]
  if (!world) throw new Error(`知らないワールド: ${r[iWorld]}`)
  const species = r[iSpecies].trim()
  if (SKIP_SPECIES.has(species)) continue
  const names = r[iNames].split('、').map((n) => n.trim()).filter(Boolean)
  if (names.length !== Number(r[iCount])) throw new Error(`${species}: count と名前の数が合わない`)
  // 区分の表記は「ジャングル（アジア）」のようにかっこの中だけを使う
  const sub = (r[iSub].match(/（(.+)）/)?.[1] ?? '').trim()
  for (const name of names) {
    const id = stableId(species, name)
    if (seen.has(id)) throw new Error(`ID が重なった: ${species} ${name}`)
    seen.add(id)
    animals.push({ id, world, subArea: sub, species, name, representative: r[iRep] === 'yes' })
  }
}

const out = {
  $comment:
    '自動生成（tools/roster-from-csv.mjs）。手で直さない。出所は北海道アニマルワールドの飼育記録（2026-11-04 時点で施設にいる個体）。ワールド・区分・種・個体名・代表フラグだけで、担当者名・飼育エリア名・給餌の情報は含まない。ライオンは animals.json。',
  animals,
}
fs.writeFileSync(outPath, `${JSON.stringify(out, null, 1)}\n`)
const byWorld = {}
for (const a of animals) byWorld[a.world] = (byWorld[a.world] ?? 0) + 1
console.log(outPath, animals.length, byWorld)
