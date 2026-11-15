// トロッコに出てくる動物のドット絵（src/trolley/pixel.ts の paint で、形から描く）。
// 向きは、ことわりがなければ右向き。足もとが絵のいちばん下。1 ドット ≒ 1.5u（render.ts の px()）
import { paint, type Op, type Sprite } from './pixel'

const EYE = '#16121a'

// ---- モグラ（左向き）: 土から出て、笑う・すねる・投げる ----
export type FaceState = 'idle' | 'laugh' | 'pout' | 'throw'
const faceOps = (ex: number, ey: number, st: FaceState): Op[] =>
  st === 'laugh'
    ? [['p', ex - 1, ey + 1, EYE, 'a'], ['p', ex, ey, EYE, 'a'], ['p', ex + 1, ey, EYE, 'a'], ['p', ex + 2, ey + 1, EYE, 'a']]
    : st === 'pout'
      ? [['p', ex - 1, ey - 1, EYE, 'a'], ['p', ex, ey - 1, EYE, 'a'], ['p', ex + 1, ey, EYE, 'a'], ['p', ex + 2, ey, EYE, 'a']]
      : [['p', ex, ey, EYE, 'a'], ['p', ex + 1, ey, EYE, 'a'], ['p', ex, ey - 1, '#ffffff', 'a']]

export function moleSprite(st: FaceState, frame: number): Sprite {
  const j = st === 'laugh' && frame ? -1 : 0
  const hands: Op[] =
    st === 'throw'
      ? [['e', 4, 9, 4, 5, '#ffb3c1'], ['e', 29, 26, 4, 5, '#ffb3c1']]
      : [['e', 4, 26 + j, 4, 5, '#ffb3c1'], ['e', 29, 26 - j, 4, 5, '#ffb3c1']]
  return paint(`mole:${st}:${frame}`, 34, 40, [
    ['e', 17, 26, 12, 14, '#4a4248'],
    ['e', 14, 19, 6, 6, '#5d545c'],
    ['e', 17, 33, 8, 5, '#3e373d'],
    ...hands,
    ['e', 10, 15, 6, 5, '#8a7f88'],
    ['e', 5, 17, 4, 3, '#ff9fb3'],
    ['p', 4, 16, '#ffd6e0', 'a'],
    ...faceOps(10, 13, st),
  ])
}

// ---- 投げてくるいたずらっ子（左向き）: ビーバー・ヤギ・マーラ ----
export function throwerSprite(kind: 'beaver' | 'goat' | 'mara', st: FaceState, frame: number): Sprite {
  const thr = st === 'throw'
  const j = st === 'laugh' && frame ? -1 : 0
  let ops: Op[]
  if (kind === 'beaver') {
    ops = [
      ['e', 26, 31 + j, 6, 3, '#4a3424'],
      ['e', 15, 27, 10, 11, '#8a5a34'],
      ['e', 13, 29, 6, 7, '#b07a4c'],
      ['e', 11, 13 + j, 7, 6.5, '#8a5a34'],
      ['e', 15, 7 + j, 2, 2, '#6a4426'],
      ['e', 6, 15 + j, 3.5, 3, '#b07a4c'],
      ['p', 2, 13 + j, '#222'],
      ['r', 4, 18 + j, 3, 2, '#f6a440'],
      ...(thr ? ([['e', 4, 6, 3, 4, '#6a4426']] as Op[]) : ([['e', 6, 25, 3, 4, '#6a4426']] as Op[])),
      ['e', 23, 25, 3, 4, '#6a4426'],
      ...faceOps(8, 11 + j, st),
    ]
  } else if (kind === 'goat') {
    const hy = thr ? -4 : 0
    ops = [
      ['e', 21, 24, 11, 8, '#f4f1ea'],
      ['r', 14, 30, 3, 6, '#e8ddd0'],
      ['r', 26, 30, 3, 6, '#e8ddd0'],
      ['e', 13, 19 + hy / 2, 4, 5, '#f4f1ea'],
      ['e', 9, 12 + hy, 5, 6, '#f4f1ea'],
      ['e', 5, 16 + hy, 3, 2.5, '#e8ddd0'],
      ['t', 5, 18 + hy, 9, 18 + hy, 7, 24 + hy, '#ddd2c2'],
      ['e', 15, 10 + hy, 3, 1.5, '#f4f1ea'],
      ['l', 10, 6 + hy, 14, 2 + hy, '#9a8a70', 'a'],
      ['l', 11, 6 + hy, 15, 3 + hy, '#b8a88a', 'a'],
      ['e', 30, 21, 2, 2, '#f4f1ea'],
      ...faceOps(7, 11 + hy, st),
    ]
  } else {
    ops = [
      ['e', 18, 25, 10, 7, '#9a7a58'],
      ['e', 26, 25, 4, 4, '#f4efe4'],
      ['e', 16, 28, 5, 3, '#c9b08a'],
      ['r', 11, 30, 2, 10, '#8a6a4a'],
      ...(thr ? ([['r', 24, 29, 8, 2, '#8a6a4a']] as Op[]) : ([['r', 23, 30, 2, 10, '#8a6a4a']] as Op[])),
      ['e', 9, 15, 5, 5.5, '#9a7a58'],
      ['e', 5, 17, 3, 2.5, '#b89a74'],
      ['e', 9, 6, 1.5, 4, '#8a6a4a'],
      ['e', 12, 6, 1.5, 4, '#8a6a4a'],
      ['p', 2, 16, '#222'],
      ...faceOps(7, 14, st),
    ]
  }
  return paint(`thrower:${kind}:${st}:${frame}`, 34, 40, ops)
}

// ---- ネズミ（右向き）: run の時は足が 2 コマ ----
export function mouseSprite(run: boolean, frame: number): Sprite {
  const f = run ? frame : 0
  return paint(`mouse:${run}:${f}`, 28, 17, [
    ['e', 12, 11, 7, 5, '#9a9198'],
    ['e', 13, 13, 4, 2, '#c9c2c8'],
    ['e', 19, 9, 4, 4, '#9a9198'],
    ['e', 17, 4, 3, 3, '#9a9198'],
    ['e', 17, 4, 1.5, 1.5, '#f2b6c0'],
    ['p', 23, 9, '#ff8fa3'],
    ['r', 8 + f, 15, 2, 1, '#e5a7b1'],
    ['r', 15 - f, 15, 2, 1, '#e5a7b1'],
    ['p', 20, 8, EYE, 'a'],
    ['l', 5, 11, 2, 7, '#d99aa2', 'a'],
    ['l', 2, 7, 1, 3, '#d99aa2', 'a'],
    ['p', 25, 8, '#6a6a6a', 'a'],
    ['p', 25, 10, '#6a6a6a', 'a'],
  ])
}

// ---- リスザル（右向き）: hang はつるにぶら下がる ----
export function monkeySprite(run: boolean, hang: boolean, frame: number): Sprite {
  const f = run ? frame : 0
  const arm: Op[] = hang ? [['r', 15, 1, 2, 15, '#e0b85a']] : [['r', 15, 18, 4, 2, '#e0b85a']]
  return paint(`monkey:${run}:${hang}:${f}`, 24, 29, [
    ['e', 4, 21, 2, 2, '#c99a3a'],
    ['e', 2, 16, 2, 2.5, '#c99a3a'],
    ['e', 2, 10, 1.5, 2.5, '#c99a3a'],
    ['e', 3, 6, 1.5, 2, '#2a2a2a'],
    ['r', 8 + f, 24, 3, 5, '#c9a24a'],
    ['r', 13 - f, 24, 3, 5, '#c9a24a'],
    ['e', 11, 19, 6, 7, '#c9a24a'],
    ['e', 13, 20, 3, 4, '#f2e2b0'],
    ...arm,
    ['e', 13, 9, 6, 6, '#7a7468'],
    ['e', 14, 11, 5, 4.5, '#f6efe0'],
    ['e', 8, 10, 2, 2, '#f6efe0'],
    ['e', 16, 13, 2, 1.5, '#2a2220'],
    ['p', 13, 10, EYE, 'a'],
    ['p', 17, 10, EYE, 'a'],
  ])
}

// ---- コウモリ: 羽ばたき 2 コマ ----
export function batSprite(frame: number): Sprite {
  const wings: Op[] = frame
    ? [['t', 10, 5, 1, 10, 4, 3, '#3a2d55'], ['t', 16, 5, 25, 10, 22, 3, '#3a2d55']]
    : [['t', 10, 6, 1, 0, 3, 8, '#3a2d55'], ['t', 16, 6, 25, 0, 23, 8, '#3a2d55']]
  return paint(`bat:${frame}`, 27, 12, [
    ...wings,
    ['e', 13, 6, 3, 4, '#2a1f3d'],
    ['p', 11, 1, '#2a1f3d'],
    ['p', 15, 1, '#2a1f3d'],
    ['p', 12, 5, '#ffe36b', 'a'],
    ['p', 14, 5, '#ffe36b', 'a'],
  ], '#120c1c')
}

// ---- 駅の出迎え（右向き） ----
export function penguinSprite(frame: number): Sprite {
  const fl: Op = frame ? ['e', 3, 10, 2, 6, '#22252c'] : ['e', 3, 17, 2, 6, '#22252c']
  return paint(`penguin:${frame}`, 21, 31, [
    fl,
    ['e', 10, 18, 8, 12, '#22252c'],
    ['e', 11, 20, 5.5, 9, '#f7f7f2'],
    ['e', 11, 7, 6, 6, '#22252c'],
    ['e', 14, 9, 2.5, 3, '#f7f7f2'],
    ['e', 8, 4, 2, 1, '#f7f7f2'],
    ['t', 16, 7, 20, 8, 16, 10, '#f3a03a'],
    ['r', 5, 30, 4, 1, '#f3a03a'],
    ['r', 12, 30, 4, 1, '#f3a03a'],
    ['p', 13, 6, '#ffffff', 'a'],
    ['p', 14, 6, EYE, 'a'],
  ])
}

export function huskySprite(frame: number): Sprite {
  const tail: Op = frame ? ['e', 4, 21, 3, 6, '#59606e'] : ['e', 5, 25, 3, 6, '#59606e']
  return paint(`husky:${frame}`, 31, 35, [
    tail,
    ['e', 13, 25, 9, 9, '#59606e'],
    ['e', 17, 26, 5, 7, '#f2f2f2'],
    ['t', 13, 8, 14, 0, 17, 6, '#59606e'],
    ['t', 18, 6, 21, 0, 23, 7, '#59606e'],
    ['e', 18, 11, 7, 6, '#59606e'],
    ['e', 20, 13, 5, 4, '#f2f2f2'],
    ['e', 25, 13, 3, 2, '#f2f2f2'],
    ['p', 28, 12, '#111'],
    ['e', 16, 33, 3, 1.5, '#f2f2f2'],
    ['e', 22, 33, 3, 1.5, '#f2f2f2'],
    ['p', 21, 10, EYE, 'a'],
    ['p', 21, 9, '#ffffff', 'a'],
  ])
}

export function lemurSprite(frame: number): Sprite {
  const tail: Op[] = []
  for (let i = 0; i < 9; i++) tail.push(['r', 2, 2 + i * 3, 3, 3, i % 2 ? '#f4f4f4' : '#2a2a2a'])
  const arm: Op = frame ? ['r', 17, 17, 2, 7, '#9a9aa0'] : ['r', 16, 24, 4, 2, '#9a9aa0']
  return paint(`lemur:${frame}`, 23, 41, [
    ...tail,
    ['r', 4, 29, 4, 3, '#9a9aa0'],
    ['r', 8, 35, 3, 6, '#9a9aa0'],
    ['r', 13, 35, 3, 6, '#9a9aa0'],
    ['e', 11, 28, 6, 8, '#9a9aa0'],
    ['e', 13, 29, 3.5, 6, '#ececec'],
    arm,
    ['e', 11, 12, 2, 2, '#9a9aa0'],
    ['e', 14, 17, 5, 5, '#9a9aa0'],
    ['e', 16, 18, 3.5, 3, '#f4f4f4'],
    ['p', 19, 18, '#222'],
    ['p', 15, 17, '#2a2a2a', 'a'],
    ['p', 16, 17, '#ffb300', 'a'],
  ])
}

export function kangarooSprite(): Sprite {
  return paint('kangaroo', 27, 41, [
    ['t', 1, 39, 10, 30, 12, 35, '#b5733f'],
    ['e', 12, 26, 7, 9, '#c98a52'],
    ['e', 15, 27, 3, 6, '#e8c49a'],
    ['r', 10, 36, 11, 4, '#b5733f'],
    ['r', 17, 21, 4, 2, '#b5733f'],
    ['e', 16, 6, 1.5, 3.5, '#b5733f'],
    ['e', 19, 6, 1.5, 3.5, '#b5733f'],
    ['e', 18, 13, 4, 5, '#c98a52'],
    ['e', 22, 15, 3, 2.5, '#c98a52'],
    ['p', 25, 14, '#222'],
    ['p', 19, 12, EYE, 'a'],
  ])
}

export function sheepSprite(frame: number): Sprite {
  const d = frame ? 1 : 0
  return paint(`sheep:${frame}`, 29, 23, [
    ['r', 9 + d, 17, 2, 6, '#3a3330'],
    ['r', 18 - d, 17, 2, 6, '#3a3330'],
    ['e', 8, 10, 5, 5, '#f4f1ea'],
    ['e', 14, 8, 5, 5, '#f4f1ea'],
    ['e', 19, 10, 5, 5, '#f4f1ea'],
    ['e', 11, 14, 6, 5, '#f4f1ea'],
    ['e', 18, 14, 5, 5, '#f4f1ea'],
    ['e', 14, 16, 7, 2, '#e2ddd2'],
    ['e', 21, 7, 2, 1, '#3a3330'],
    ['e', 24, 11, 3.5, 4, '#3a3330'],
    ['p', 25, 10, '#ffffff', 'a'],
  ])
}

export function owlSprite(frame: number): Sprite {
  const look = frame ? 1 : 0
  return paint(`owl:${frame}`, 19, 23, [
    ['t', 3, 2, 6, 6, 2, 7, '#9a7a58'],
    ['t', 15, 2, 12, 6, 16, 7, '#9a7a58'],
    ['e', 9, 13, 7, 8, '#9a7a58'],
    ['e', 9, 16, 4.5, 5, '#e8d8b8'],
    ['e', 6, 8, 2.5, 2.5, '#ffffff'],
    ['e', 12, 8, 2.5, 2.5, '#ffffff'],
    ['p', 9, 10, '#f0a020'],
    ['r', 6, 21, 2, 2, '#f0a020'],
    ['r', 11, 21, 2, 2, '#f0a020'],
    ['p', 6 + look, 8, EYE, 'a'],
    ['p', 12 + look, 8, EYE, 'a'],
  ])
}

/** ボーダーコリー（右向き）: 走る 2 コマ */
export function collieSprite(frame: number): Sprite {
  const legs: Op[] = frame
    ? [['l', 10, 15, 8, 21, '#f4f4f4'], ['l', 13, 15, 14, 21, '#f4f4f4'], ['l', 20, 15, 19, 21, '#f4f4f4'], ['l', 23, 15, 26, 21, '#f4f4f4']]
    : [['l', 10, 15, 12, 21, '#f4f4f4'], ['l', 13, 15, 11, 21, '#f4f4f4'], ['l', 20, 15, 23, 21, '#f4f4f4'], ['l', 23, 15, 21, 21, '#f4f4f4']]
  return paint(`collie:${frame}`, 33, 23, [
    ...legs,
    ['e', 4, 9 - frame, 4, 2, '#222'],
    ['p', 1, 8 - frame, '#f4f4f4'],
    ['e', 15, 11, 9, 5, '#222'],
    ['e', 22, 13, 3, 4, '#f4f4f4'],
    ['t', 23, 4, 24, 0, 26, 4, '#222'],
    ['e', 25, 7, 4, 4, '#222'],
    ['e', 29, 9, 3, 2, '#f4f4f4'],
    ['r', 25, 4, 1, 4, '#f4f4f4'],
    ['p', 31, 8, '#111'],
    ['p', 27, 6, '#e0a040', 'a'],
  ])
}
