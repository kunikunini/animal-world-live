// 歩いて移動するための地図（床の高さと、通れない場所）。
// お店のモデルの三角形を、上から見た 10cm 角のマスに落として作る。
//   床・地面・小道 …… そのマスの床の高さ
//   台・棚・壁・幹 …… 足もとから頭の高さまでにあるものは、通れない
// 草・花・シダ・苔のかたまりは、踏んで歩ける（通れない物に数えない）。
const CELL = 0.1, X0 = -10, Z0 = -5, NX = 200, NZ = 265;   // x -10〜10、z -5〜21.5（入口の外の小道の先まで）
const FLOOR = /^(Floor|Rug|Rug_Flowers|Ground|Path_Stones)$/;
const SOFT = /^(Grass|Flowers_Ground|Ferns_Outside|Moss_Clumps|Ivy_|Lanterns_Door|Lanterns_Interior|Rattan_Pendant|Door_Frame|East_Ledge)/;
const BODY = 0.3, KNEE = 0.22, HEAD = 1.8;   // 体の半径／これより低い物はまたげる／これより高い物はくぐれる
const STEEP = 0.7;                             // 地面がこれより高い所（外の丘）は歩かない

const nameOf = o => { let p = o; while (p && !p.name) p = p.parent; return p ? p.name : ''; };
const idx = (i, k) => k * NX + i;
const cellX = x => Math.floor((x - X0) / CELL), cellZ = z => Math.floor((z - Z0) / CELL);
const inGrid = (i, k) => i >= 0 && k >= 0 && i < NX && k < NZ;

export function buildNav(THREE, solid, boxes = []){
  const ground = new Float32Array(NX * NZ).fill(NaN);   // 床の高さ（NaN：床なし）
  const floorPri = new Uint8Array(NX * NZ);              // 店内の床（Floor・Rug）は、下の地面より優先
  const top = new Float32Array(NX * NZ).fill(-Infinity); // 通れない物のいちばん高い所
  const lowest = new Float32Array(NX * NZ).fill(Infinity);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  solid.updateMatrixWorld(true);

  // 三角形の上から見た形を、マスに落とす（縦の壁は線になるので、辺もなぞる）
  function raster(A, B, C, each){
    const minX = Math.min(A.x, B.x, C.x), maxX = Math.max(A.x, B.x, C.x), minZ = Math.min(A.z, B.z, C.z), maxZ = Math.max(A.z, B.z, C.z);
    if (maxX < X0 || minX > X0 + NX * CELL || maxZ < Z0 || minZ > Z0 + NZ * CELL) return;
    const d = (B.x - A.x) * (C.z - A.z) - (C.x - A.x) * (B.z - A.z);
    if (Math.abs(d) > 1e-9) {
      for (let k = Math.max(0, cellZ(minZ)); k <= Math.min(NZ - 1, cellZ(maxZ)); k++) for (let i = Math.max(0, cellX(minX)); i <= Math.min(NX - 1, cellX(maxX)); i++) {
        const px = X0 + (i + 0.5) * CELL, pz = Z0 + (k + 0.5) * CELL;
        const u = ((B.x - px) * (C.z - pz) - (C.x - px) * (B.z - pz)) / d, v = ((C.x - px) * (A.z - pz) - (A.x - px) * (C.z - pz)) / d, w = 1 - u - v;
        if (u >= -1e-6 && v >= -1e-6 && w >= -1e-6) each(i, k, u * A.y + v * B.y + w * C.y);
      }
    }
    for (const [P, Q] of [[A, B], [B, C], [C, A]]) {
      const n = Math.ceil(Math.hypot(Q.x - P.x, Q.z - P.z) / (CELL * 0.5)) + 1;
      for (let s = 0; s <= n; s++) {
        const t = s / n, i = cellX(P.x + (Q.x - P.x) * t), k = cellZ(P.z + (Q.z - P.z) * t);
        if (inGrid(i, k)) each(i, k, P.y + (Q.y - P.y) * t);
      }
    }
  }
  const meshes = [];
  solid.traverse(o => { if (o.isMesh && o.visible) meshes.push(o); });
  // 1. 床の高さ
  for (const o of meshes) {
    const name = nameOf(o); if (!FLOOR.test(name)) continue;
    const pri = /^(Floor|Rug)/.test(name) ? 1 : 0;
    eachTri(o, (A, B, C) => raster(A, B, C, (i, k, y) => {
      const j = idx(i, k);
      if (pri > floorPri[j]) { floorPri[j] = pri; ground[j] = y; }
      else if (pri === floorPri[j] && !(ground[j] >= y)) ground[j] = y;
    }));
  }
  // 2. 通れない物（足もとの高さを引いて、ひざ〜頭の高さにかかる三角形だけ）
  for (const o of meshes) {
    const name = nameOf(o); if (FLOOR.test(name) || SOFT.test(name)) continue;
    eachTri(o, (A, B, C) => {
      const g = groundAt((A.x + B.x + C.x) / 3, (A.z + B.z + C.z) / 3) || 0;
      const lo = Math.min(A.y, B.y, C.y) - g, hi = Math.max(A.y, B.y, C.y) - g;
      if (hi < KNEE || lo > HEAD) return;
      raster(A, B, C, (i, k) => { const j = idx(i, k); top[j] = Math.max(top[j], g + hi); lowest[j] = Math.min(lowest[j], g + lo); });
    });
  }
  // 売り場（つるしたラックなど）の箱
  for (const bx of boxes) {
    if (bx.min.y > HEAD || bx.max.y < KNEE) continue;
    for (let k = Math.max(0, cellZ(bx.min.z)); k <= Math.min(NZ - 1, cellZ(bx.max.z)); k++) for (let i = Math.max(0, cellX(bx.min.x)); i <= Math.min(NX - 1, cellX(bx.max.x)); i++) {
      const j = idx(i, k); top[j] = Math.max(top[j], bx.max.y); lowest[j] = Math.min(lowest[j], bx.min.y);
    }
  }
  function eachTri(o, fn){
    const pos = o.geometry.attributes.position, ix = o.geometry.index, m = o.matrixWorld, n = ix ? ix.count : pos.count;
    for (let t = 0; t < n; t += 3) {
      const i0 = ix ? ix.getX(t) : t, i1 = ix ? ix.getX(t + 1) : t + 1, i2 = ix ? ix.getX(t + 2) : t + 2;
      a.fromBufferAttribute(pos, i0).applyMatrix4(m); b.fromBufferAttribute(pos, i1).applyMatrix4(m); c.fromBufferAttribute(pos, i2).applyMatrix4(m);
      fn(a, b, c);
    }
  }
  function groundAt(x, z){
    const i = cellX(x), k = cellZ(z);
    if (!inGrid(i, k)) return NaN;
    return ground[idx(i, k)];
  }
  // 3. 歩けるマス：床があって、丘でなく、通れない物から体の半径ぶん離れている
  const wall = new Uint8Array(NX * NZ);
  for (let j = 0; j < NX * NZ; j++) wall[j] = top[j] > -Infinity || !(ground[j] < STEEP) ? 1 : 0;
  const R = Math.ceil(BODY / CELL), free = new Uint8Array(NX * NZ);
  for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) {
    let ok = !wall[idx(i, k)];
    for (let dk = -R; ok && dk <= R; dk++) for (let di = -R; ok && di <= R; di++) {
      if (di * di + dk * dk > R * R) continue;
      const ii = i + di, kk = k + dk;
      if (!inGrid(ii, kk) || (top[idx(ii, kk)] > -Infinity)) ok = false;
    }
    free[idx(i, k)] = ok ? 1 : 0;
  }

  // 画面を押した向きの先で、最初に当たる床（または物）の場所。物に当たったら、その場所（手前で止まるのは path の役目）
  function march(origin, dir, far = 40){
    const step = 0.04;
    for (let s = 0.1; s < far; s += step) {
      const x = origin.x + dir.x * s, y = origin.y + dir.y * s, z = origin.z + dir.z * s;
      const i = cellX(x), k = cellZ(z);
      if (!inGrid(i, k)) { if (y < -1) return null; continue; }
      const j = idx(i, k);
      if (top[j] > -Infinity && y <= top[j] && y >= lowest[j] - 0.05) return {x, z, y, thing:true};
      if (ground[j] === ground[j] && y <= ground[j] + 0.01) return {x, z, y:ground[j], thing:false};
    }
    return null;
  }

  // 道のり：start から、target にいちばん近い（行ける）マスまで。8方向のダイクストラ → 見通せる所は直線にまとめる
  function path(sx, sz, tx, tz){
    let s = nearestFree(cellX(sx), cellZ(sz));
    if (s < 0) return null;
    const dist = new Float64Array(NX * NZ).fill(Infinity), prev = new Int32Array(NX * NZ).fill(-1);
    const heap = new Heap(); dist[s] = 0; heap.push(s, 0);
    const ti = (tx - X0) / CELL - 0.5, tk = (tz - Z0) / CELL - 0.5;
    let best = s, bestD = Infinity;
    const D = [[1,0,1],[-1,0,1],[0,1,1],[0,-1,1],[1,1,Math.SQRT2],[1,-1,Math.SQRT2],[-1,1,Math.SQRT2],[-1,-1,Math.SQRT2]];
    while (heap.size) {
      const [j, d] = heap.pop(); if (d > dist[j]) continue;
      const i = j % NX, k = (j - i) / NX;
      const h = Math.hypot(i - ti, k - tk);
      if (h < bestD - 1e-6 || (Math.abs(h - bestD) < 1e-6 && d < dist[best])) { bestD = h; best = j; }
      if (h < 0.5) break;
      for (const [di, dk, w] of D) {
        const ii = i + di, kk = k + dk; if (!inGrid(ii, kk)) continue;
        const jj = idx(ii, kk); if (!free[jj]) continue;
        if (di && dk && (!free[idx(i + di, k)] || !free[idx(i, k + dk)])) continue;   // 角をすり抜けない
        const nd = d + w; if (nd < dist[jj]) { dist[jj] = nd; prev[jj] = j; heap.push(jj, nd); }
      }
    }
    const cells = []; for (let j = best, n = 0; j >= 0 && n < NX * NZ; j = prev[j], n++) cells.push(j);
    cells.reverse();
    const pt = j => { const i = j % NX, k = (j - i) / NX; return {x:X0 + (i + 0.5) * CELL, z:Z0 + (k + 0.5) * CELL}; };
    const pts = [{x:sx, z:sz}];
    if (!clear(sx, sz, pt(cells[0]).x, pt(cells[0]).z)) pts.push(pt(cells[0]));
    let anchor = pts[pts.length - 1];
    for (let n = 1; n < cells.length; n++) {
      if (!clear(anchor.x, anchor.z, pt(cells[n]).x, pt(cells[n]).z)) { anchor = pt(cells[n - 1]); pts.push(anchor); }
    }
    // 目的のマスまで行けるなら、押した点そのものへ（マスの中心へ寄せない）
    const end = bestD < 0.75 && freeAt(tx, tz) && clear(anchor.x, anchor.z, tx, tz) ? {x:tx, z:tz} : pt(cells[cells.length - 1]);
    pts.push(end);
    return {points:pts.filter((p, n) => n === 0 || Math.hypot(p.x - pts[n - 1].x, p.z - pts[n - 1].z) > 0.02), reached:bestD < 3};
  }
  function nearestFree(i0, k0){
    if (inGrid(i0, k0) && free[idx(i0, k0)]) return idx(i0, k0);
    for (let r = 1; r < 40; r++) {
      let best = -1, bd = Infinity;
      for (let dk = -r; dk <= r; dk++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dk)) !== r) continue;
        const i = i0 + di, k = k0 + dk;
        if (inGrid(i, k) && free[idx(i, k)] && di * di + dk * dk < bd) { bd = di * di + dk * dk; best = idx(i, k); }
      }
      if (best >= 0) return best;
    }
    return -1;
  }
  function freeAt(x, z){ const i = cellX(x), k = cellZ(z); return inGrid(i, k) && !!free[idx(i, k)]; }
  // 2点のあいだを、通れないマスにかからず歩けるか
  function clear(x0, z0, x1, z1){
    const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / (CELL * 0.4));
    for (let s = 1; s <= n; s++) if (!freeAt(x0 + (x1 - x0) * s / n, z0 + (z1 - z0) * s / n)) return false;
    return true;
  }
  return {groundAt:(x, z) => { const g = groundAt(x, z); return g === g ? g : 0; }, march, path, freeAt};
}

class Heap {
  constructor(){ this.k = []; this.v = []; }
  get size(){ return this.k.length; }
  push(key, val){
    const k = this.k, v = this.v; let i = k.length; k.push(key); v.push(val);
    while (i > 0) { const p = (i - 1) >> 1; if (v[p] <= val) break; k[i] = k[p]; v[i] = v[p]; i = p; }
    k[i] = key; v[i] = val;
  }
  pop(){
    const k = this.k, v = this.v, rk = k[0], rv = v[0], lk = k.pop(), lv = v.pop();
    if (k.length) {
      let i = 0; const n = k.length;
      for (;;) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && v[c + 1] < v[c]) c++; if (v[c] >= lv) break; k[i] = k[c]; v[i] = v[c]; i = c; }
      k[i] = lk; v[i] = lv;
    }
    return [rk, rv];
  }
}
