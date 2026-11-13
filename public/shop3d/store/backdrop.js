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

  // ---- ANIMAL WORLD LIVE のふれあいワールドに合わせた遠景（2026-11-13） ----
  // ワールドと同じ色（空 #2a6ee0→#9ad0f4、丘 #5fae4a/#9ad86a・#72b85e/#b2e282・#94c890/#cdeab4、木 #5cb84a/#94d45c）で、
  // ぼかさず、面で塗ったローポリの絵にする。もやは掛けない。
  const hex = c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  // 面で塗った山・丘：step（m）ごとの頂点を直線で結び、上り坂の面は明るく、下り坂の面は暗く塗る
  function facets(g, v, line, step, foot, peak, lo, hi){
    const n = Math.round(v.w / (step * v.sx)), dx = v.w / n;
    const hs = []; for (let k = 0; k <= n; k++) hs.push(line(k * dx));
    for (let k = 0; k < n; k++) {
      const a = hs[k], b = hs[k + 1], top = Math.max(a, b), t = Math.max(0, Math.min(1, (top - lo) / (hi - lo)));
      const base = mix(foot, peak, t), col = b > a ? mix(base, [255, 255, 255], 0.1) : mix(base, [0, 40, 20], 0.12);
      const gr = g.createLinearGradient(0, v.Y(top), 0, v.Y(lo - 2));
      gr.addColorStop(0, rgb(col)); gr.addColorStop(1, rgb(mix(col, foot, 0.7)));
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(k * dx - 0.5, v.h); g.lineTo(k * dx - 0.5, v.Y(a)); g.lineTo((k + 1) * dx + 0.5, v.Y(b)); g.lineTo((k + 1) * dx + 0.5, v.h); g.closePath(); g.fill();
    }
  }
  // ワールドの丸い木：細い幹に、明るい緑の玉が3つ（下の面は少し暗く）
  function roundTree(g, v, x, foot, tall, col){
    g.fillStyle = '#7a5636'; g.fillRect(x - 0.13 * v.sx, v.Y(foot + tall * 0.62), 0.26 * v.sx, tall * 0.62 * v.sy);
    const r = tall * 0.36;
    for (const [ox, oy, k] of [[-0.55, 0.62, 0.72], [0.55, 0.66, 0.7], [0, 0.86, 1]]) {
      const cx = x + ox * r * v.sx, cy = v.Y(foot + tall * oy), rr = r * k;
      g.fillStyle = rgb(mix(col, [20, 80, 30], 0.3)); g.beginPath(); g.ellipse(cx, cy, rr * v.sx, rr * 0.86 * v.sy, 0, 0, 6.283); g.fill();
      g.fillStyle = rgb(col); g.beginPath(); g.ellipse(cx - rr * 0.08 * v.sx, cy - rr * 0.16 * v.sy, rr * 0.9 * v.sx, rr * 0.72 * v.sy, 0, 0, 6.283); g.fill();
    }
  }

  // 1. 空：ワールドのふれあいワールドの空（上は濃い青、地平は水色）。白い雲のかたまり
  layer(1, 40, 72, 1024, 1024, 2, 1.5, (g, v) => {
    const gr = g.createLinearGradient(0, 0, 0, v.Y(0));
    gr.addColorStop(0, '#2a6ee0'); gr.addColorStop(0.45, '#4f93ea'); gr.addColorStop(0.8, '#9ad0f4'); gr.addColorStop(1, '#c4e4f8');
    g.fillStyle = gr; g.fillRect(0, 0, v.w, v.h);
    for (let i = 0; i < 7; i++) {
      const cx = rnd() * v.w, cy = v.Y(pick(24, 46)), len = pick(40, 90);
      for (let k = 0; k < 6; k++) { const ox = pick(-len, len), oy = pick(-6, 6), rx = pick(34, 70), ry = pick(12, 22); wrap(v, cx + ox, x => {
        g.fillStyle = 'rgba(255,255,255,.92)';
        g.beginPath(); g.ellipse(x, cy + oy, rx, ry, 0, 0, 6.283); g.fill();
      }); }
    }
  });

  // 2. いちばん遠い、うすい緑の山なみ
  layer(2, 38.6, 36, 1024, 512, 3, 1, (g, v) => {
    const line = ridge(v.w, 14, [[2, 3.4, true], [3, 2.2, true], [7, 1.0, false]]);
    facets(g, v, line, 3.2, hex('#94c890'), hex('#cdeab4'), 8, 20);
  });

  // 3. サバンナとの境の、オレンジ色の岩山（ところどころに、とがった峰が顔を出す）
  layer(3, 36.8, 30, 2048, 512, 3, 1, (g, v) => {
    const line = ridge(v.w, 5.5, [[2, 7.5, true], [5, 1.8, true], [9, 0.8, false]]);
    facets(g, v, line, 2.2, hex('#c8642e'), hex('#f0b47c'), 6, 15);
  });

  // 4. まんなかの丘
  layer(4, 34.6, 26, 2048, 512, 4, 1, (g, v) => {
    const line = ridge(v.w, 8.2, [[2, 1.8, false], [5, 1.1, false], [9, 0.6, true]]);
    facets(g, v, line, 2.6, hex('#72b85e'), hex('#b2e282'), 4, 11);
  });

  // 5. 手前の丘と、丸い木
  layer(5, 32.2, 22, 2048, 1024, 4, 1, (g, v) => {
    const line = ridge(v.w, 3.4, [[3, 0.8, false], [7, 0.5, false]]);
    facets(g, v, line, 2.0, hex('#5fae4a'), hex('#9ad86a'), 0, 5);
    const a = hex('#5cb84a'), b = hex('#94d45c');
    for (let m = 0; m < v.w / v.sx; m += pick(2.2, 5.5)) {
      const x = m * v.sx, tall = pick(3.2, 5.2), col = mix(a, b, rnd());
      wrap(v, x, xx => roundTree(g, v, xx, line(x) - pick(0.6, 2.2), tall, col));
    }
  });

  return {group, top:0x2a6ee0};   // top：筒より上に見える空の色
}
