import * as THREE from 'three';
import {canvasTexture} from './util.js';

// 店の外の遠景：空、雪の残る遠い山、青い山なみ、森の丘、手前の木立。
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

  // 1. 空：上は青、地平へ向かって白っぽく。うすい雲
  layer(1, 40, 72, 1024, 1024, 2, 3, (g, v) => {
    const gr = g.createLinearGradient(0, 0, 0, v.Y(0));
    gr.addColorStop(0, '#6fb0e6'); gr.addColorStop(0.5, '#9fcdee'); gr.addColorStop(0.82, '#d3e8f2'); gr.addColorStop(1, rgb(HAZE));
    g.fillStyle = gr; g.fillRect(0, 0, v.w, v.h);
    for (let i = 0; i < 9; i++) {
      const cx = rnd() * v.w, cy = v.Y(pick(26, 52)), len = pick(60, 150);
      for (let k = 0; k < 9; k++) wrap(v, cx + pick(-len, len), x => {
        g.fillStyle = `rgba(255,255,255,${pick(0.1, 0.24)})`;
        g.beginPath(); g.ellipse(x, cy + pick(-10, 10), pick(40, 90), pick(10, 22), 0, 0, 6.283); g.fill();
      });
    }
  });

  // 2. いちばん遠い山：雪が残る、とがった峰。強くぼかして、空にとけこませる
  layer(2, 38.6, 36, 1024, 512, 3, 5, (g, v) => {
    const line = ridge(v.w, 15, [[2, 5.5, true], [3, 3, true], [7, 1.6, true], [13, 0.7, false]]);
    const gr = g.createLinearGradient(0, v.Y(25), 0, v.Y(6));
    gr.addColorStop(0, '#f6f9fc'); gr.addColorStop(0.3, '#e3ebf2'); gr.addColorStop(0.5, '#bccbdb'); gr.addColorStop(1, '#b3c6d3');
    fillRidge(g, v, line, gr);
    mist(g, v, 16, 5, 0.85);
  });

  // 3. 青い山なみ
  layer(3, 36.8, 30, 2048, 512, 3, 3.2, (g, v) => {
    const line = ridge(v.w, 11.5, [[3, 2.6, true], [5, 1.5, false], [11, 0.8, true], [23, 0.3, false]]);
    const gr = g.createLinearGradient(0, v.Y(16), 0, v.Y(5));
    gr.addColorStop(0, '#7fa0b4'); gr.addColorStop(1, '#a4bfbd');
    fillRidge(g, v, line, gr);
    mist(g, v, 11, 4, 0.7);
  });

  // 4. 森の丘：稜線に、針葉樹の頭が並ぶ
  layer(4, 34.6, 26, 2048, 512, 4, 1.9, (g, v) => {
    const line = ridge(v.w, 7.4, [[2, 1.5, false], [5, 0.9, false], [9, 0.5, false]]);
    const hill = [98, 142, 104];
    fillRidge(g, v, line, rgb(hill));
    for (let m = 0; m < v.w / v.sx; m += pick(0.5, 1.1)) {
      const x = m * v.sx, tall = pick(1.4, 2.8), col = rgb(mix(hill, [70, 112, 84], rnd()));
      wrap(v, x, xx => conifer(g, v, xx, line(x) - 0.5, tall, tall * 0.5, col));
    }
    mist(g, v, 8, 2.5, 0.6);
  });

  // 5. 手前の木立：針葉樹と広葉樹がまじる。ここは、ほとんどぼかさない
  layer(5, 32.2, 22, 2048, 1024, 4, 1.25, (g, v) => {
    const green = [66, 118, 72], dark = [44, 88, 58], light = [112, 158, 84], far = mix(green, HAZE, 0.32);
    const back = ridge(v.w, 2.0, [[3, 0.5, false], [7, 0.3, false]]);
    fillRidge(g, v, x => back(x) + 0.6, rgb(far));
    for (let m = 0; m < v.w / v.sx; m += pick(0.7, 1.4)) {   // 奥の列（少しかすむ）
      const x = m * v.sx, tall = pick(3.6, 5.6), col = rgb(mix(mix(dark, green, rnd()), HAZE, 0.3));
      wrap(v, x, xx => conifer(g, v, xx, back(x) - 0.2, tall, tall * 0.42, col));
    }
    fillRidge(g, v, x => back(x) - 0.5, rgb(mix(green, dark, 0.3)));
    for (let m = 0; m < v.w / v.sx; m += pick(0.9, 2.2)) {   // 手前の列
      const x = m * v.sx, foot = back(x) - 1.6;
      if (rnd() < 0.55) { const tall = pick(3.4, 6.0), col = rgb(mix(dark, green, rnd())); wrap(v, x, xx => conifer(g, v, xx, foot, tall, tall * 0.44, col)); }
      else { const tall = pick(3.0, 4.6), col = mix(green, light, rnd()), wide = tall * pick(0.7, 0.95); const s = seed; wrap(v, x, xx => { seed = s; leafy(g, v, xx, foot, tall, wide, col, dark); }); }
    }
    mist(g, v, 2.2, -1, 0.35);
  });

  return {group, top:0x6fb0e6};   // top：筒より上に見える空の色
}
