import * as THREE from 'three'
import { toonMaterial } from '../render/toon'
import { terrainHeight } from './terrain'
import { flatten } from './skyfolk'
import type { Collider } from './props'
import type { Lion } from './lions'

/**
 * まだ 3D の姿が無かった種の様式化した目印（2026-11-06、全個体を置くために追加）。4 つの組み方で、種ごとに形と色を変える:
 * ・四つ足（立ち姿）: ブチハイエナ・ラーテル・スナネコ・アメリカバク・アカハナグマ・ホンドタヌキ・アメリカビーバー・ヤマアラシ
 * ・座ったサル: ニホンザル・コモンリスザル・コモンマーモセット・スローロリス
 * ・カメ: アルダブラゾウガメ・ケヅメリクガメ・パンケーキリクガメ
 * ・はう子: シャムワニ・メガネカイマン（伏せたワニ）、ビルマニシキヘビ（とぐろ）
 * 色は種の目印で、個体の毛色・模様の再現ではない。ライオンと同じ「しるし」の作り（プリミティブ、スキニングなしの微アニメ）で、
 * 出会いの仕組みにそのまま乗る。本物の行動の再現ではない。
 */
export type WildKind =
  | 'hyena'
  | 'ratel'
  | 'sandcat'
  | 'tapir'
  | 'coati'
  | 'tanuki'
  | 'beaver'
  | 'porcupine'
  | 'macaque'
  | 'squirrelmonkey'
  | 'marmoset'
  | 'loris'
  | 'aldabra'
  | 'sulcata'
  | 'pancake'
  | 'croc'
  | 'caiman'
  | 'python'

export interface WildfolkOptions {
  id: string
  kind: WildKind
  x: number
  z: number
  /** 向き（ラジアン。0 で +z = 南を向く） */
  yaw: number
  size?: number
}

const matCache = new Map<string, THREE.Material>()
const mat = (color: string) => {
  let m = matCache.get(color)
  if (!m) {
    m = toonMaterial({ color })
    matCache.set(color, m)
  }
  return m
}
const sphere = new THREE.SphereGeometry(1, 14, 10)
const small = new THREE.SphereGeometry(1, 8, 6)
const cone = new THREE.ConeGeometry(1, 1, 8)
const cyl = new THREE.CylinderGeometry(1, 1, 1, 8)
const eyeMat = new THREE.MeshBasicMaterial({ color: '#140d08' })
const glintMat = new THREE.MeshBasicMaterial({ color: '#fff6e6' })

function part(geo: THREE.BufferGeometry, color: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, rx = 0, ry = 0, rz = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat(color))
  m.position.set(x, y, z)
  m.scale.set(sx, sy, sz)
  m.rotation.set(rx, ry, rz)
  m.castShadow = true
  m.receiveShadow = false
  return m
}
function eye(parent: THREE.Object3D, r: number, x: number, y: number, z: number, ring?: string): void {
  for (const side of [-1, 1]) {
    if (ring) parent.add(part(small, ring, side * x, y, z - r * 0.2, r * 1.7, r * 1.7, r * 0.8))
    const e = new THREE.Mesh(small, eyeMat)
    e.scale.setScalar(r)
    e.position.set(side * x, y, z)
    const g = new THREE.Mesh(small, glintMat)
    g.scale.setScalar(r * 0.32)
    g.position.set(side * x + r * 0.25, y + r * 0.35, z + r * 0.8)
    parent.add(e, g)
  }
}

interface Built {
  body: THREE.Group
  neck: THREE.Group
  tail?: THREE.Group
  headHeight: number
  radius: number
  /** 首を回せる大きさ */
  turn: number
}

interface QuadSpec {
  len: number
  r: number
  /** 背の高さ（地面から背中まで） */
  h: number
  legR: number
  coat: string
  belly: string
  leg: string
  head: number
  snout: number
  muzzle: string
  ear: 'round' | 'tri' | 'big' | 'tiny'
  tail: 'bushy' | 'thin' | 'ringed' | 'flat' | 'stub'
  tailColor?: string
  /** 前が高い（ハイエナの下がった背） */
  slope?: number
}
const QUAD: Record<string, QuadSpec> = {
  hyena: { len: 0.95, r: 0.22, h: 0.78, legR: 0.055, coat: '#c9a874', belly: '#d8bf92', leg: '#b8955e', head: 0.17, snout: 0.12, muzzle: '#3a2c22', ear: 'round', tail: 'bushy', tailColor: '#3a2c22', slope: 0.22 },
  ratel: { len: 0.72, r: 0.16, h: 0.34, legR: 0.05, coat: '#2a2624', belly: '#2a2624', leg: '#1e1b1a', head: 0.12, snout: 0.06, muzzle: '#2a2624', ear: 'tiny', tail: 'stub' },
  sandcat: { len: 0.46, r: 0.11, h: 0.27, legR: 0.03, coat: '#dcc494', belly: '#f2e6cc', leg: '#d2b886', head: 0.1, snout: 0.03, muzzle: '#f2e6cc', ear: 'big', tail: 'ringed', tailColor: '#2a221c' },
  tapir: { len: 1.55, r: 0.38, h: 0.86, legR: 0.085, coat: '#5e5250', belly: '#6a5e5a', leg: '#3a3230', head: 0.22, snout: 0.26, muzzle: '#2e292b', ear: 'round', tail: 'stub' },
  coati: { len: 0.62, r: 0.13, h: 0.33, legR: 0.035, coat: '#a8683a', belly: '#d8b48a', leg: '#4a3020', head: 0.1, snout: 0.12, muzzle: '#4a3020', ear: 'round', tail: 'ringed', tailColor: '#4a3020' },
  tanuki: { len: 0.56, r: 0.17, h: 0.36, legR: 0.035, coat: '#9a8668', belly: '#b8a684', leg: '#2e2620', head: 0.12, snout: 0.06, muzzle: '#e8dcc6', ear: 'round', tail: 'bushy', tailColor: '#5a4a38' },
  beaver: { len: 0.7, r: 0.22, h: 0.3, legR: 0.045, coat: '#6e4a2e', belly: '#8a6040', leg: '#3a2a20', head: 0.13, snout: 0.05, muzzle: '#5a3a24', ear: 'tiny', tail: 'flat', tailColor: '#3a2e28' },
  porcupine: { len: 0.56, r: 0.2, h: 0.3, legR: 0.04, coat: '#3a3430', belly: '#4a423c', leg: '#2a2420', head: 0.1, snout: 0.05, muzzle: '#2a2420', ear: 'tiny', tail: 'stub' },
}

/** 四つ足の立ち姿（高さ 0.3〜1m） */
function buildQuad(kind: string): Built {
  const S = QUAD[kind]
  const body = new THREE.Group()
  const by = S.h - S.r
  // 胴: 横にした丸い筒（slope の分だけ前を上げる）
  body.add(part(new THREE.CapsuleGeometry(S.r, Math.max(0.05, S.len - S.r * 2), 5, 12), S.coat, 0, by, 0, 1, 1, 1, Math.PI / 2 - (S.slope ?? 0), 0, 0))
  body.add(part(sphere, S.belly, 0, by - S.r * 0.3, 0, S.r * 0.85, S.r * 0.7, S.len * 0.42))
  const fx = S.r * 0.58
  const fz = S.len / 2 - S.r * 0.75
  const rise = (S.slope ?? 0) * fz
  for (const [lx, lz] of [[-fx, fz], [fx, fz], [-fx, -fz], [fx, -fz]] as const) {
    const top = by + (lz > 0 ? rise : -rise)
    body.add(part(cyl, S.leg, lx, top / 2, lz, S.legR, top, S.legR))
    body.add(part(small, S.leg, lx, S.legR * 0.6, lz + S.legR * 0.5, S.legR * 1.15, S.legR * 0.7, S.legR * 1.5))
  }
  if (kind === 'hyena') {
    // まだらの斑点と、首のうしろのたてがみ
    for (let i = 0; i < 14; i++) {
      const a = (i * 2.4) % (Math.PI * 2)
      const t = ((i * 0.37) % 1) - 0.5
      body.add(part(small, '#5a4028', Math.cos(a) * S.r * 0.92, by + Math.abs(Math.sin(a)) * S.r * 0.85 + t * S.len * (S.slope ?? 0), t * S.len * 0.8, 0.035, 0.035, 0.035))
    }
    body.add(part(sphere, '#6a5034', 0, by + S.r * 0.9 + rise * 0.7, fz * 0.6, 0.04, 0.06, S.len * 0.22))
  }
  if (kind === 'ratel') {
    // 頭から尾まで背中の白っぽい帯
    body.add(part(sphere, '#d6d4ce', 0, by + S.r * 0.35, 0, S.r * 0.95, S.r * 0.72, S.len * 0.52))
  }
  if (kind === 'porcupine') {
    // 背中の長いとげ（先が白い）
    for (let i = 0; i < 26; i++) {
      const a = -0.9 + ((i * 0.61) % 1.8)
      const t = ((i * 0.29) % 1) - 0.5
      const q = part(cone, i % 3 === 0 ? '#f2eee6' : '#5a524c', Math.sin(a) * S.r * 0.8, by + Math.cos(a) * S.r * 0.85, t * S.len * 0.7, 0.025, 0.26, 0.025, -0.9 + t * 0.4, 0, -a * 0.8)
      body.add(q)
    }
  }
  // 尾
  const tail = new THREE.Group()
  tail.position.set(0, by + S.r * 0.3 - rise, -S.len / 2 + S.r * 0.2)
  const tc = S.tailColor ?? S.coat
  if (S.tail === 'bushy') tail.add(part(sphere, tc, 0, -0.06, -0.12, 0.06, 0.07, 0.16, 0.5, 0, 0))
  else if (S.tail === 'flat') tail.add(part(sphere, tc, 0, -S.r * 0.55, -0.2, 0.09, 0.02, 0.18))
  else if (S.tail === 'stub') tail.add(part(small, tc, 0, 0, -0.03, 0.04, 0.04, 0.05))
  else {
    // 縞の尾（ハナグマは立てる、スナネコは垂らして先が黒い）
    const up = kind === 'coati'
    const n = up ? 6 : 5
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n
      const len = up ? 0.42 : 0.24
      tail.add(part(small, i % 2 ? tc : S.coat, 0, up ? t * len * 0.9 : -t * len * 0.35, up ? -t * len * 0.35 : -t * len, 0.028, 0.028, 0.045))
    }
  }
  body.add(tail)
  // 首と頭
  const neck = new THREE.Group()
  neck.position.set(0, by + S.r * 0.4 + rise, S.len / 2 - S.r * 0.3)
  const hy = S.head * 0.6
  const hz = S.head * 0.7
  // バクは前へ長い頭（クマに見えないよう）
  const tapir = kind === 'tapir'
  neck.add(part(sphere, S.coat, 0, tapir ? hy - S.head * 0.2 : hy, tapir ? hz + S.head * 0.3 : hz, tapir ? S.head * 0.8 : S.head, S.head * (tapir ? 0.85 : 0.92), S.head * (tapir ? 1.6 : 1.05), tapir ? 0.25 : 0, 0, 0))
  if (tapir) {
    // 垂れた長い鼻
    neck.add(part(cyl, S.muzzle, 0, hy - S.head * 0.75, hz + S.head * 1.75, S.head * 0.3, S.snout * 1.3, S.head * 0.3, 0.7, 0, 0))
  } else if (kind === 'coati') {
    // 上へ反った細長い鼻と白い口もと
    neck.add(part(cone, '#e8d8c0', 0, hy - S.head * 0.15, hz + S.head * 0.9 + 0.04, S.head * 0.35, S.snout + 0.04, S.head * 0.35, Math.PI / 2 - 0.15, 0, 0))
    neck.add(part(small, '#2a1e16', 0, hy - S.head * 0.05, hz + S.head * 0.9 + S.snout + 0.02, 0.016, 0.016, 0.016))
  } else {
    neck.add(part(sphere, S.muzzle, 0, hy - S.head * 0.25, hz + S.head * 0.7 + S.snout * 0.4, S.head * 0.52, S.head * 0.42, S.head * 0.5 + S.snout * 0.5))
    neck.add(part(small, '#1e1a18', 0, hy - S.head * 0.12, hz + S.head * 1.2 + S.snout * 0.8, S.head * 0.16, S.head * 0.12, S.head * 0.1))
  }
  if (kind === 'tanuki') {
    // 目のまわりの黒いマスク
    for (const side of [-1, 1]) neck.add(part(sphere, '#2e2620', side * S.head * 0.42, hy + S.head * 0.12, hz + S.head * 0.62, S.head * 0.36, S.head * 0.26, S.head * 0.3, 0, 0, side * 0.4))
  }
  if (kind === 'ratel') neck.add(part(sphere, '#d6d4ce', 0, hy + S.head * 0.4, hz - S.head * 0.1, S.head * 0.95, S.head * 0.6, S.head * 1.0))
  if (kind === 'beaver') neck.add(part(small, '#e8902a', 0, hy - S.head * 0.55, hz + S.head * 1.05, S.head * 0.16, S.head * 0.2, S.head * 0.06))
  eye(neck, S.head * 0.12, S.head * 0.42, hy + S.head * 0.2, hz + S.head * 0.86)
  for (const side of [-1, 1]) {
    if (S.ear === 'tri' || S.ear === 'big') {
      const big = S.ear === 'big'
      neck.add(part(cone, S.coat, side * S.head * (big ? 0.7 : 0.55), hy + S.head * 0.9, hz - S.head * 0.1, S.head * (big ? 0.42 : 0.28), S.head * (big ? 0.8 : 0.7), S.head * 0.14, 0, 0, side * (big ? -0.7 : -0.25)))
      if (big) neck.add(part(cone, '#2a221c', side * S.head * 0.92, hy + S.head * 1.2, hz - S.head * 0.08, 0.012, 0.05, 0.01, 0, 0, side * -0.7))
    } else {
      const er = S.head * (S.ear === 'round' ? 0.3 : 0.16)
      neck.add(part(small, S.ear === 'round' && kind === 'tapir' ? '#e8e4dc' : S.coat, side * S.head * 0.62, hy + S.head * 0.82, hz - S.head * 0.1, er, er, er * 0.5))
    }
  }
  return { body, neck, tail, headHeight: S.h + S.head * 1.6, radius: Math.max(0.25, S.len * 0.45), turn: 0.8 }
}

/** 座ったサル（高さ 0.3〜0.6m） */
function buildMonkey(kind: 'macaque' | 'squirrelmonkey' | 'marmoset' | 'loris'): Built {
  const C = {
    macaque: { coat: '#9a8670', belly: '#c8b89e', face: '#e2786c', arm: '#9a8670', tail: 0.08, ring: false, h: 0.55 },
    squirrelmonkey: { coat: '#a8a068', belly: '#f0e2b0', face: '#f6f0e2', arm: '#e8c040', tail: 0.5, ring: false, h: 0.34 },
    marmoset: { coat: '#8a8478', belly: '#b8b0a2', face: '#e8dccc', arm: '#6a645a', tail: 0.42, ring: true, h: 0.28 },
    loris: { coat: '#b08a60', belly: '#d8bc94', face: '#e8d4b4', arm: '#b08a60', tail: 0, ring: false, h: 0.3 },
  }[kind]
  const H = C.h
  const body = new THREE.Group()
  body.add(part(sphere, C.coat, 0, H * 0.34, -0.02, H * 0.3, H * 0.36, H * 0.27))
  body.add(part(sphere, C.belly, 0, H * 0.32, H * 0.08, H * 0.22, H * 0.28, H * 0.16))
  // 抱えたひざと腕
  for (const side of [-1, 1]) {
    body.add(part(sphere, C.coat, side * H * 0.18, H * 0.13, H * 0.14, H * 0.11, H * 0.1, H * 0.16))
    body.add(part(sphere, C.arm, side * H * 0.24, H * 0.32, H * 0.08, H * 0.07, H * 0.2, H * 0.07, -0.3, 0, side * 0.15))
  }
  let tail: THREE.Group | undefined
  if (C.tail > 0) {
    tail = new THREE.Group()
    tail.position.set(0, H * 0.06, -H * 0.24)
    const n = 7
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n
      // 地面に沿って後ろへ、先が少し巻く
      tail.add(part(small, C.ring && i % 2 ? '#2e2a26' : kind === 'squirrelmonkey' && i === n - 1 ? '#2a2420' : C.coat, Math.sin(t * 2.4) * C.tail * 0.25, 0.02 + Math.max(0, t - 0.7) * C.tail * 0.5, -t * C.tail, H * 0.05, H * 0.05, H * 0.07))
    }
    body.add(tail)
  }
  const neck = new THREE.Group()
  neck.position.set(0, H * 0.7, 0.02)
  const hr = H * (kind === 'loris' ? 0.24 : 0.21)
  neck.add(part(sphere, C.coat, 0, hr * 0.7, 0, hr, hr * 0.95, hr))
  neck.add(part(sphere, C.face, 0, hr * 0.6, hr * 0.62, hr * 0.72, hr * 0.7, hr * 0.42))
  if (kind === 'squirrelmonkey') neck.add(part(sphere, '#2a2420', 0, hr * 0.35, hr * 0.92, hr * 0.32, hr * 0.26, hr * 0.2))
  if (kind === 'marmoset') for (const side of [-1, 1]) neck.add(part(sphere, '#f6f2ea', side * hr * 0.95, hr * 0.9, -hr * 0.1, hr * 0.32, hr * 0.42, hr * 0.12, 0, 0, side * -0.4))
  eye(neck, hr * (kind === 'loris' ? 0.2 : 0.13), hr * 0.32, hr * 0.78, hr * 0.98, kind === 'loris' ? '#5a3a20' : undefined)
  for (const side of [-1, 1]) neck.add(part(small, kind === 'macaque' ? C.face : C.coat, side * hr * 0.95, hr * 0.7, 0, hr * 0.2, hr * 0.24, hr * 0.12))
  neck.add(part(small, '#4a3a30', 0, hr * 0.45, hr * 1.02, hr * 0.12, hr * 0.08, hr * 0.06))
  return { body, neck, tail, headHeight: H + hr, radius: 0.2, turn: 1.1 }
}

/** カメ（甲羅の長さ 0.3〜1.2m。size で変える） */
function buildTortoise(kind: 'aldabra' | 'sulcata' | 'pancake'): Built {
  const C = { aldabra: { shell: '#5e5850', rim: '#4a453e', skin: '#6a645a', h: 0.55 }, sulcata: { shell: '#b89a68', rim: '#8a6e44', skin: '#c8ae80', h: 0.5 }, pancake: { shell: '#8a6a3a', rim: '#e0c890', skin: '#a8885a', h: 0.22 } }[kind]
  const body = new THREE.Group()
  body.add(part(sphere, C.shell, 0, 0.12, 0, 0.42, C.h * 0.75, 0.52))
  body.add(part(cyl, C.rim, 0, 0.13, 0, 0.43, 0.04, 0.53))
  // 甲羅の板の盛り上がり
  for (const [x, z] of [[0, 0], [0, 0.26], [0, -0.26], [0.22, 0.12], [-0.22, 0.12], [0.22, -0.14], [-0.22, -0.14]] as const) {
    const top = 0.12 + Math.sqrt(Math.max(0, 1 - (x / 0.42) ** 2 - (z / 0.52) ** 2)) * C.h * 0.75
    body.add(part(small, kind === 'pancake' ? '#e0c890' : C.rim, x, top - 0.01, z, 0.11, 0.03, 0.11))
  }
  for (const [lx, lz] of [[-0.3, 0.3], [0.3, 0.3], [-0.3, -0.3], [0.3, -0.3]] as const) body.add(part(cyl, C.skin, lx, 0.07, lz, 0.08, 0.16, 0.08))
  body.add(part(cone, C.skin, 0, 0.1, -0.52, 0.05, 0.1, 0.05, -Math.PI / 2, 0, 0))
  const neck = new THREE.Group()
  neck.position.set(0, 0.14, 0.48)
  neck.add(part(cyl, C.skin, 0, 0.03, 0.08, 0.075, 0.2, 0.075, 1.2, 0, 0))
  neck.add(part(sphere, C.skin, 0, 0.1, 0.2, 0.1, 0.085, 0.12))
  eye(neck, 0.016, 0.06, 0.13, 0.27)
  return { body, neck, headHeight: C.h * 0.75 + 0.2, radius: 0.5, turn: 0.6 }
}

/** 伏せたワニ（長さ約 2m） */
function buildCroc(kind: 'croc' | 'caiman'): Built {
  const skin = kind === 'croc' ? '#5a6a48' : '#7a7a5a'
  const belly = kind === 'croc' ? '#a8a884' : '#c4c0a0'
  const body = new THREE.Group()
  body.add(part(sphere, skin, 0, 0.14, 0, 0.3, 0.15, 0.62))
  body.add(part(sphere, belly, 0, 0.08, 0.02, 0.27, 0.07, 0.55))
  // 背中のうろこの列
  for (let i = 0; i < 9; i++) for (const side of [-1, 1]) body.add(part(small, '#3e4a32', side * 0.08, 0.27 - Math.abs(i - 4) * 0.012, -0.5 + i * 0.12, 0.03, 0.025, 0.04))
  for (const [lx, lz] of [[-0.3, 0.32], [0.3, 0.32], [-0.3, -0.32], [0.3, -0.32]] as const) body.add(part(sphere, skin, lx, 0.06, lz, 0.1, 0.05, 0.08))
  const tail = new THREE.Group()
  tail.position.set(0, 0.12, -0.55)
  tail.add(part(cone, skin, 0, 0, -0.45, 0.16, 0.95, 0.1, -Math.PI / 2, 0, 0))
  body.add(tail)
  const neck = new THREE.Group()
  neck.position.set(0, 0.13, 0.58)
  neck.add(part(sphere, skin, 0, 0.02, 0.1, 0.17, 0.1, 0.18))
  // 長く平たい口先（メガネカイマンは少し短く、目の間に「めがね」の盛り上がり）
  const snout = kind === 'croc' ? 0.34 : 0.26
  neck.add(part(sphere, skin, 0, -0.01, 0.22 + snout / 2, 0.1, 0.06, snout))
  if (kind === 'caiman') neck.add(part(small, '#5a5a40', 0, 0.09, 0.2, 0.09, 0.025, 0.03))
  for (const side of [-1, 1]) neck.add(part(small, skin, side * 0.07, 0.09, 0.14, 0.045, 0.04, 0.045))
  eye(neck, 0.018, 0.07, 0.11, 0.17)
  return { body, neck, tail, headHeight: 0.4, radius: 0.7, turn: 0.35 }
}

/** とぐろを巻いたヘビ（ビルマニシキヘビ） */
function buildPython(): Built {
  const skin = '#c8a868'
  const blotch = '#6a4a28'
  const body = new THREE.Group()
  // 3 段のとぐろ（下ほど大きい）
  const rings: Array<[number, number, number]> = [[0.36, 0.08, 0.075], [0.27, 0.2, 0.07], [0.18, 0.31, 0.065]]
  for (const [R, y, r] of rings) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(R, r, 8, 24), mat(skin))
    t.rotation.x = Math.PI / 2
    t.position.y = y
    t.castShadow = true
    body.add(t)
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + y * 3
      body.add(part(small, blotch, Math.cos(a) * R, y + r * 0.55, Math.sin(a) * R, r * 0.6, r * 0.35, r * 0.75, 0, -a, 0))
    }
  }
  const neck = new THREE.Group()
  neck.position.set(0, 0.36, 0.05)
  neck.add(part(cyl, skin, 0, 0.1, 0.03, 0.055, 0.24, 0.055, 0.35, 0, 0))
  neck.add(part(sphere, skin, 0, 0.23, 0.11, 0.075, 0.05, 0.11))
  neck.add(part(sphere, blotch, 0, 0.255, 0.08, 0.05, 0.02, 0.07))
  eye(neck, 0.014, 0.05, 0.245, 0.17)
  return { body, neck, headHeight: 0.7, radius: 0.45, turn: 0.9 }
}

export function createWildfolk(options: WildfolkOptions): Lion {
  const group = new THREE.Group()
  group.name = `${options.kind}-${options.id}`
  const y = terrainHeight(options.x, options.z)
  const position = new THREE.Vector3(options.x, y, options.z)
  group.position.copy(position)
  group.rotation.y = options.yaw
  const scale = options.size ?? 1
  group.scale.setScalar(scale)
  const k = options.kind
  const built =
    k === 'macaque' || k === 'squirrelmonkey' || k === 'marmoset' || k === 'loris'
      ? buildMonkey(k)
      : k === 'aldabra' || k === 'sulcata' || k === 'pancake'
        ? buildTortoise(k)
        : k === 'croc' || k === 'caiman'
          ? buildCroc(k)
          : k === 'python'
            ? buildPython()
            : buildQuad(k)
  group.add(built.body, built.neck)
  group.updateMatrixWorld(true)
  const moving = built.tail ? [built.tail] : []
  flatten(built.body, moving)
  if (built.tail) flatten(built.tail, [])
  flatten(built.neck, [])

  const collider: Collider = { x: options.x, z: options.z, r: built.radius * scale }
  let reduceMotion = false
  let noticeTime = -10
  const headTarget = new THREE.Vector3()
  const phase = Math.random() * Math.PI * 2
  // 気質: カメとワニはほとんど動かず、サルとハナグマはきょろきょろ
  const slow = k === 'aldabra' || k === 'sulcata' || k === 'pancake' || k === 'croc' || k === 'caiman'
  const tempo = slow ? { breath: 0.8, look: 0.15, rate: 0.08 } : k === 'python' ? { breath: 0.9, look: 0.35, rate: 0.2 } : { breath: 2.6, look: 0.45, rate: 0.45 }

  const update = (time: number, dt: number, player: THREE.Vector3) => {
    const breath = reduceMotion ? 0 : Math.sin(time * tempo.breath + phase) * (slow ? 0.008 : 0.018)
    built.body.scale.set(1, 1 + breath, 1)
    headTarget.copy(player)
    group.worldToLocal(headTarget)
    const dist = Math.hypot(headTarget.x, headTarget.z) * scale
    let wantYaw = 0
    if (dist < 14) wantYaw = Math.max(-built.turn, Math.min(built.turn, Math.atan2(headTarget.x, headTarget.z)))
    else if (!reduceMotion) wantYaw = Math.sin(time * tempo.rate + phase) * tempo.look
    const quick = time - noticeTime < 1.2 ? 2.4 : 1
    const kk = reduceMotion ? 1 : Math.min(1, dt * (slow ? 0.8 : 2) * quick)
    built.neck.rotation.y += (wantYaw - built.neck.rotation.y) * kk
    if (reduceMotion || !built.tail) return
    const lift = Math.max(0, 1 - (time - noticeTime) / 1.4)
    built.tail.rotation.y = Math.sin(time * 1.6 + phase) * (0.08 + lift * 0.3)
  }

  return {
    id: options.id,
    group,
    position,
    collider,
    headHeight: built.headHeight,
    update,
    setReduceMotion: (on) => {
      reduceMotion = on
    },
    notice: (time) => {
      noticeTime = time
    },
    swapModel: () => {
      // この子たちは差し替えの実験の対象外
    },
  }
}
