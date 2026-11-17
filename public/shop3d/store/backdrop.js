import * as THREE from 'three';
import {canvasTexture} from './util.js';

// 店の外の遠景。ANIMAL WORLD LIVE に置いたこの売り場では、ふれあいワールドの景色（青い空、緑の丘、オレンジの岩山、丸い木）に合わせてある。
// 店を囲む筒を、遠いものから順に重ねる。遠い層ほど、ぼかして、空の色に近づける（空気遠近）。
// 絵はすべてここで描く（画像は使わない）。毎回同じ景色になるよう、乱数は決まった種から作る。
const BASE = -1.5;          // 筒の下端の高さ（地面より少し下）
const HAZE = [226, 238, 230];   // 遠くの空気の色

export function buildBackdrop(){
  let seed = 8843;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const pick = (a, b) => a + (b - a) * rnd();
  const rgb = (c, a = 1) => `rgba(${c.map(Math.round).join(',')},${a})`;
  const mix = (c, d, t) => c.map((v, i) => v + (d[i] - v) * t);
  const group = new THREE.Group();

  // 層を1枚作る。r：筒の半径、tall：筒の高さ（m）、w・h：絵の大きさ、rep：一周に絵を何回くり返すか、soft：ぼかしの強さ
  // draw には、m → 画素の変換（X・Y）と、1mあたりの画素数（sx・sy）を渡す
  function layer(order, r, tall, w, h, rep, soft, draw){
    const sx = rep * w / (2 * Math.PI * r), sy = h / tall;
    const tex = canvasTexture(w, h, g => {
      draw(g, {w, h, sx, sy, Y:m => h - (m - BASE) * sy});
      if (soft > 1) {   // ぼかし：小さく縮めてから、なめらかに引きのばす（どのブラウザでも同じに出る）
        const t = document.createElement('canvas'); t.width = Math.ceil(w / soft); t.height = Math.ceil(h / soft);
        const tg = t.getContext('2d'); tg.imageSmoothingQuality = 'high'; tg.drawImage(g.canvas, 0, 0, t.width, t.height);
        g.clearRect(0, 0, w, h); g.imageSmoothingQuality = 'high'; g.drawImage(t, 0, 0, w, h);
      }
    }, {repeat:[rep, 1]});
    tex.wrapT = THREE.ClampToEdgeWrapping;
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, tall, 72, 1, true),
      new THREE.MeshBasicMaterial({map:tex, transparent:true, side:THREE.BackSide, depthWrite:false, toneMapped:false, fog:false}));
    mesh.position.y = BASE + tall / 2; mesh.renderOrder = order;
    group.add(mesh);
  }
  // 稜線：くり返しの継ぎ目が出ないよう、絵の幅でちょうど一周する波を重ねる。sharp は、とがった峰にする波
  function ridge(w, base, waves){
    const ph = waves.map(() => rnd() * 6.283);
    return x => waves.reduce((y, [f, a, sharp], i) => {
      const s = sharp ? 1 - 2 * Math.abs(Math.sin(Math.PI * f * x / w + ph[i])) : Math.sin(2 * Math.PI * f * x / w + ph[i]);
      return y + a * s;
    }, base);
  }
  function fillRidge(g, v, line, paint){
    g.beginPath(); g.moveTo(0, v.h);
    for (let x = 0; x <= v.w; x += 2) g.lineTo(x, v.Y(line(x)));
    g.lineTo(v.w, v.h); g.closePath(); g.fillStyle = paint; g.fill();
  }
  // すそにたまる、もや（下へ行くほど空気の色に近づく）
  function mist(g, v, from, to, strength){
    const gr = g.createLinearGradient(0, v.Y(from), 0, v.Y(to));
    gr.addColorStop(0, rgb(HAZE, 0)); gr.addColorStop(1, rgb(HAZE, strength));
    g.globalCompositeOperation = 'source-atop'; g.fillStyle = gr; g.fillRect(0, 0, v.w, v.h); g.globalCompositeOperation = 'source-over';
  }
  // 木は、絵の左右のはしで切れないよう、となりのくり返しにも描く
  const wrap = (v, x, fn) => { for (const dx of [-v.w, 0, v.w]) fn(x + dx); };
  function conifer(g, v, x, foot, tall, wide, col){
    g.fillStyle = col;
    for (let i = 0; i < 3; i++) {
      const y0 = foot + tall * (0.12 + i * 0.27), y1 = Math.min(foot + tall, y0 + tall * 0.5), hw = wide * (1 - i * 0.26) / 2;
      g.beginPath(); g.moveTo(x - hw * v.sx, v.Y(y0)); g.lineTo(x, v.Y(y1)); g.lineTo(x + hw * v.sx, v.Y(y0)); g.closePath(); g.fill();
    }
    g.fillRect(x - 0.08 * v.sx, v.Y(foot + tall * 0.14), 0.16 * v.sx, tall * 0.14 * v.sy);
  }
  function leafy(g, v, x, foot, tall, wide, col, shade){
    g.fillStyle = rgb(shade); g.fillRect(x - 0.1 * v.sx, v.Y(foot + tall * 0.5), 0.2 * v.sx, tall * 0.5 * v.sy);
    for (let i = 0; i < 7; i++) {
      const cx = x + pick(-0.32, 0.32) * wide * v.sx, cy = v.Y(foot + tall * pick(0.5, 0.82)), rr = wide * pick(0.26, 0.4);
      g.fillStyle = rgb(mix(col, shade, i < 3 ? 0.55 : pick(0, 0.25)));
      g.beginPath(); g.ellipse(cx, cy, rr * v.sx, rr * v.sy, 0, 0, 6.283); g.fill();
    }
  }

  // ---- ANIMAL WORLD LIVE のふれあいワールドに合わせた遠景（2026-11-18 作り直し） ----
  // 色は、ワールドの店の前から外を向いた画面で測った値に合わせる（空 #8ab2d9→地平 #a5c6db、雲 #dbe6e6、
  // 遠い山 #b8d7ca・#aed3c3、まんなかの丘 #67b06a〜#438d5b、手前の草 #84be3b）。ワールドと同じ、面で塗ったローポリの山に、
  // 遠いほど霞む空気遠近。日は左上から当たる。
  const hex = c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  const AIR = hex('#b4d2d6'), SUNLIT = [255, 244, 214], COOL = [60, 84, 120];
  const clamp01 = t => Math.max(0, Math.min(1, t));
  // 面で塗った山：step（m）ごとの頂点を直線で結ぶ。左へ上る面（日の側）は明るく、右へ上る面は青みのかげ。
  // 各面は、頂の色から、すその色へ縦に変わる。air：空気の色へ寄せる割合
  function facets(g, v, line, step, c, air, lo, hi, {lit = 0.16, shade = 0.18} = {}){
    const top = mix(hex(c.top), AIR, air), foot = mix(hex(c.foot), AIR, air);
    const n = Math.round(v.w / (step * v.sx)), dx = v.w / n;
    const hs = []; for (let k = 0; k <= n; k++) hs.push(line(k * dx));
    for (let k = 0; k < n; k++) {
      const a = hs[k], b = hs[k + 1], up = Math.max(a, b), t = clamp01((up - lo) / (hi - lo));
      const slope = (b - a) / step;   // 正：右へ上る（かげ）
      const base = mix(foot, top, t);
      const col = slope < 0 ? mix(base, mix(SUNLIT, AIR, air), lit * clamp01(-slope * 2 + 0.3)) : mix(base, mix(COOL, AIR, air), shade * clamp01(slope * 2 + 0.2));
      const gr = g.createLinearGradient(0, v.Y(up), 0, v.Y(lo - 1));
      gr.addColorStop(0, rgb(col)); gr.addColorStop(1, rgb(mix(col, foot, 0.75)));
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(k * dx - 0.5, v.h); g.lineTo(k * dx - 0.5, v.Y(a)); g.lineTo((k + 1) * dx + 0.5, v.Y(b)); g.lineTo((k + 1) * dx + 0.5, v.h); g.closePath(); g.fill();
    }
  }
  // すそにたまる空気（下へ行くほど空気の色）
  function airFoot(g, v, from, to, strength){
    const gr = g.createLinearGradient(0, v.Y(from), 0, v.Y(to));
    gr.addColorStop(0, rgb(AIR, 0)); gr.addColorStop(1, rgb(AIR, strength));
    g.globalCompositeOperation = 'source-atop'; g.fillStyle = gr; g.fillRect(0, 0, v.w, v.h); g.globalCompositeOperation = 'source-over';
  }
  // ワールドの木：かさを広げた木（平たい樹冠が2〜3段）と、丸い木。かげ色の上に日なたの色を少し上へずらして重ねる
  function tree(g, v, x, foot, tall, col, air, umbrella, tiers){
    const C = (c, a = 1) => rgb(mix(c, AIR, air), a);
    const dark = mix(col, [20, 60, 56], 0.4), light = mix(col, SUNLIT, 0.22);
    g.fillStyle = C([94, 76, 58]); g.fillRect(x - 0.07 * v.sx, v.Y(foot + tall * 0.72), 0.14 * v.sx, tall * 0.72 * v.sy);
    if (umbrella) {   // かさの木
      for (let i = 0; i < tiers; i++) {
        const y = foot + tall * (0.66 + i * 0.13), hw = tall * (0.62 - i * 0.16), th = tall * 0.1;
        g.fillStyle = C(dark); g.beginPath(); g.ellipse(x, v.Y(y), hw * v.sx, th * v.sy, 0, 0, 6.283); g.fill();
        g.fillStyle = C(i === tiers - 1 ? light : col); g.beginPath(); g.ellipse(x - hw * 0.08 * v.sx, v.Y(y + th * 0.45), hw * 0.9 * v.sx, th * 0.62 * v.sy, 0, 0, 6.283); g.fill();
      }
    } else {   // 丸い木
      const r = tall * 0.3, cy = foot + tall * 0.7;
      g.fillStyle = C(dark); g.beginPath(); g.ellipse(x, v.Y(cy), r * v.sx, r * 1.1 * v.sy, 0, 0, 6.283); g.fill();
      g.fillStyle = C(col); g.beginPath(); g.ellipse(x - r * 0.12 * v.sx, v.Y(cy + r * 0.15), r * 0.82 * v.sx, r * 0.9 * v.sy, 0, 0, 6.283); g.fill();
      g.fillStyle = C(light); g.beginPath(); g.ellipse(x - r * 0.32 * v.sx, v.Y(cy + r * 0.42), r * 0.4 * v.sx, r * 0.4 * v.sy, 0, 0, 6.283); g.fill();
    }
  }
  // 雲：大きくやわらかい積雲（底は平ら）。かげ→本体→上の照り返し
  function cloud(g, v, cx, cy, len, size){
    const puffs = [];
    for (let k = 0; k < 11; k++) { const ox = pick(-len, len), rx = size * pick(0.5, 1) * (1 - Math.abs(ox) / len * 0.5); puffs.push([cx + ox, cy - rx * pick(0.15, 0.6), rx]); }
    const flat = cy + size * 0.12;
    const draw = (dx, dy, s, col) => wrap(v, 0, off => {
      g.save(); g.beginPath(); g.rect(-v.w, 0, v.w * 3, flat + dy); g.clip(); g.fillStyle = col;
      for (const [px, py, rx] of puffs) { g.beginPath(); g.ellipse(px + off + dx, py + dy, rx * s, rx * 0.7 * s, 0, 0, 6.283); g.fill(); }
      g.restore();
    });
    draw(0, 0, 1.0, 'rgba(196,210,216,.92)');
    draw(-size * 0.06, -size * 0.1, 0.9, 'rgba(226,234,236,.96)');
    draw(-size * 0.12, -size * 0.2, 0.7, 'rgba(244,246,242,.9)');
  }

  // 1. 空：上は青、地平は霞んだ水色。日の側にやわらかなかがやき。大きな雲
  layer(1, 40, 72, 2048, 1024, 1, 1.5, (g, v) => {
    const gr = g.createLinearGradient(0, 0, 0, v.Y(0));
    gr.addColorStop(0, '#3a78d8'); gr.addColorStop(0.45, '#6c9ed8'); gr.addColorStop(0.68, '#8ab2d9'); gr.addColorStop(0.88, '#a5c6db'); gr.addColorStop(1, '#bcd8d4');
    g.fillStyle = gr; g.fillRect(0, 0, v.w, v.h);
    const x = 0.3 * v.w, y = v.Y(30), R = 30 * v.sy;   // 日のかがやき（左上の光の側に1つ）
    const glow = g.createRadialGradient(x, y, 0, x, y, R);
    glow.addColorStop(0, 'rgba(255,240,204,.45)'); glow.addColorStop(0.4, 'rgba(255,240,204,.16)'); glow.addColorStop(1, 'rgba(255,240,204,0)');
    g.fillStyle = glow; g.fillRect(0, 0, v.w, v.h);
    for (let i = 0; i < 26; i++) { const y = pick(9, 30), size = (y < 16 ? pick(16, 26) : pick(24, 44)); cloud(g, v, (i + pick(0, 0.8)) / 26 * v.w, v.Y(y), size * pick(1.6, 3.0), size); }
  });

  // 2. いちばん遠い山なみ：2列。空気の色に溶けかけた、青みの淡い緑
  layer(2, 38.6, 36, 2048, 512, 3, 1, (g, v) => {
    const back = ridge(v.w, 7.5, [[2, 3.0, true], [5, 1.6, true], [11, 0.6, false]]);
    facets(g, v, back, 3.0, {top:'#c4ddd2', foot:'#b2d0c8'}, 0.25, 3, 11, {lit:0.12, shade:0.1});
    const front = ridge(v.w, 4.2, [[3, 2.0, true], [7, 1.0, true]]);
    facets(g, v, front, 2.4, {top:'#b8d7ca', foot:'#a4c8b8'}, 0.12, 1, 7, {lit:0.14, shade:0.14});
    airFoot(g, v, 4, 0, 0.5);
  });

  // 3. サバンナの岩山：一周に1つだけ、霞んだ赤茶の台地
  layer(3, 36.8, 30, 2048, 512, 1, 1, (g, v) => {
    const W = v.w / v.sx, c0 = 0.62 * W;   // 横の位置（m）
    const line = x => { const m = x / v.sx, d = Math.abs(m - c0) / 26; return d > 1 ? -2 : -2 + (9.5 + 1.2 * Math.sin(m * 0.9) * (1 - d)) * Math.min(1, (1 - d) * 3.2); };
    facets(g, v, line, 2.2, {top:'#d8a888', foot:'#b88468'}, 0.3, 0, 9, {lit:0.18, shade:0.2});
    airFoot(g, v, 5, -1, 0.5);
  });

  // 4. まんなかの丘：ワールドの濃い緑のローポリ
  layer(4, 34.6, 26, 2048, 512, 3, 1, (g, v) => {
    const line = ridge(v.w, 4.6, [[2, 2.2, true], [5, 1.2, true], [9, 0.5, false]]);
    facets(g, v, line, 2.6, {top:'#67b06a', foot:'#438d5b'}, 0.18, 0, 8, {lit:0.18, shade:0.2});
    for (let m = 0; m < v.w / v.sx; m += pick(0.8, 4)) {   // 斜面に点々と木
      const x = m * v.sx; if (line(x) > 6.2) continue;   // 高い峰には置かない（遠くの山の上に浮いて見える）
      const d = pick(0.3, 2.5), umb = rnd() < 0.6, tiers = 2 + Math.floor(rnd() * 2), tall = pick(1.6, 2.4), col = mix(hex('#3f8f52'), hex('#5fae5c'), rnd());
      wrap(v, x, xx => tree(g, v, xx, line(x) - d, tall, col, 0.2, umb, tiers));
    }
    airFoot(g, v, 4, -1, 0.3);
  });

  // 5. 手前の丘と木。すそはお店の前の草の色へなじませる
  layer(5, 32.2, 22, 2048, 1024, 4, 1, (g, v) => {
    const line = ridge(v.w, 1.6, [[3, 0.6, false], [7, 0.3, false]]);
    facets(g, v, line, 2.0, {top:'#7cbf5a', foot:'#5a9e44'}, 0, -1.5, 2.5, {lit:0.12, shade:0.12});
    const a = hex('#3f8f52'), b = hex('#5fae5c');
    const trees = [];
    for (let m = 0; m < v.w / v.sx; m += pick(1.0, 3.2)) { if (rnd() < 0.18) m += pick(3, 7); trees.push([m * v.sx, pick(2.6, 4.2), mix(a, b, rnd()), pick(0.2, 1.4), rnd() < 0.6, 2 + Math.floor(rnd() * 2)]); }
    trees.sort((p, q) => q[3] - p[3]);   // 奥から描く
    for (const [x, tall, col, d, umb, tiers] of trees) wrap(v, x, xx => tree(g, v, xx, line(x) - d, tall, col, d * 0.05, umb, tiers));
    const gr = g.createLinearGradient(0, v.Y(0.4), 0, v.Y(-1.5));   // すそ：地面の草の色へ
    gr.addColorStop(0, 'rgba(74,120,46,0)'); gr.addColorStop(1, 'rgba(74,120,46,1)');
    g.globalCompositeOperation = 'source-atop'; g.fillStyle = gr; g.fillRect(0, 0, v.w, v.h); g.globalCompositeOperation = 'source-over';
  });

  return {group, top:0x3a78d8};   // top：筒より上に見える空の色
}
