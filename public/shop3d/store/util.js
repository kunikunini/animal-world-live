import * as THREE from 'three';

// 看板・札の文字は、サイト（/cheer）と同じ丸ゴシック。英字だけの札は、サイトの英字の見出しと同じ Fredoka で描く
export const FONT = '"Zen Maru Gothic","Hiragino Maru Gothic ProN","Hiragino Sans",sans-serif';
const FONT_EN = '"Fredoka",' + FONT;
const fontFor = text => (/^[\x20-\x7e]+$/.test(text) ? FONT_EN : FONT);
// 看板を描く前に、使う文字のフォントを読み込んでおく（読み込めなくても、予備の文字で描いて続ける）
export async function loadSignFonts(text){
  if (!document.fonts) return;
  const wait = Promise.all(['700 40px "Zen Maru Gothic"', '600 40px "Fredoka"'].map(f => document.fonts.load(f, text || 'あ')));
  await Promise.race([wait, new Promise(ok => setTimeout(ok, 4000))]).catch(() => {});
}
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

// 臨界減衰ばね：途中で目標が変わっても速度を保って滑らかにつながる
export function spring(x, v, target, dt, omega){
  const off = x - target, term = v + omega * off, e = Math.exp(-omega * dt);
  return [target + (off + term * dt) * e, (v - omega * term * dt) * e];
}

export function canvasTexture(w, h, draw, {repeat} = {}){
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}

// 木目：ゆらぐ細い線を重ねる
export function woodTexture(base = '#b98a5a', dark = [90, 55, 28], w = 1024, h = 128, lines = 90){
  return canvasTexture(w, h, g => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < lines; i++) {
      const y0 = Math.random() * h, amp = 2 + Math.random() * 5, f = 0.004 + Math.random() * 0.01, ph = Math.random() * 6;
      g.strokeStyle = `rgba(${dark[0] + Math.random() * 40},${dark[1] + Math.random() * 25},${dark[2] + Math.random() * 15},${0.08 + Math.random() * 0.18})`;
      g.lineWidth = 0.6 + Math.random() * 1.6;
      g.beginPath();
      for (let x = 0; x <= w; x += 8) { const y = y0 + Math.sin(x * f + ph) * amp; x ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.stroke();
    }
  });
}

// 床：板を1枚ずつ色を変えて並べる
export function plankTexture(){
  const W = 1024, H = 1024, rows = 8;
  return canvasTexture(W, H, g => {
    for (let r = 0; r < rows; r++) {
      const y = r * H / rows, h = H / rows;
      let x = -Math.random() * 300;
      while (x < W) {
        const len = 320 + Math.random() * 260, k = 0.9 + Math.random() * 0.2;
        g.fillStyle = `rgb(${Math.round(176 * k)},${Math.round(134 * k)},${Math.round(92 * k)})`;
        g.fillRect(x, y, len, h);
        for (let i = 0; i < 14; i++) {
          const yy = y + Math.random() * h;
          g.strokeStyle = `rgba(96,62,34,${0.05 + Math.random() * 0.12})`; g.lineWidth = 0.6 + Math.random() * 1.4;
          g.beginPath(); g.moveTo(x, yy); g.bezierCurveTo(x + len * .3, yy + 4, x + len * .6, yy - 4, x + len, yy + 2); g.stroke();
        }
        g.fillStyle = 'rgba(60,38,20,.5)'; g.fillRect(x + len - 1.5, y, 1.5, h);
        x += len;
      }
      g.fillStyle = 'rgba(60,38,20,.55)'; g.fillRect(0, y, W, 1.5);
    }
  });
}

// 札・看板の文字（日本語はブラウザの文字で描く）
export function signTexture(title, sub, {w = 512, h = 128, bg = '#fbfaf6', ink = '#2a2622', muted = '#8a8178', center = false} = {}){
  return canvasTexture(w, h, g => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.textAlign = center ? 'center' : 'left';
    const x = center ? w / 2 : h * 0.2;
    g.fillStyle = ink; g.font = `${fontFor(title) === FONT ? 700 : 600} ${h * (sub ? 0.36 : 0.44)}px ${fontFor(title)}`;
    g.fillText(title, x, sub ? h * 0.5 : h * 0.66);
    if (sub) { g.fillStyle = muted; g.font = `${h * 0.22}px ${FONT}`; g.fillText(sub, x, h * 0.82); }
  });
}

// 売り場の札：木の板。角を丸め、ふちをふくらませて、少し厚みのある立体にする。壁にじかに付ける（裏が z=0）
// image を渡すと、文字のかわりにその絵（ロゴ）を板に入れる。radius は角の丸み
export function woodSign(label, w, h, depth = 0.03, {image = null, radius = 0.06} = {}){
  const b = Math.min(0.011, depth * 0.4), r = Math.min(h * 0.42, radius) - b;   // b：ふちの丸み、r：角の丸み
  const x0 = -w / 2 + b, x1 = w / 2 - b, y0 = -h / 2 + b, y1 = h / 2 - b;
  const s = new THREE.Shape();
  s.moveTo(x0 + r, y0); s.lineTo(x1 - r, y0); s.quadraticCurveTo(x1, y0, x1, y0 + r);
  s.lineTo(x1, y1 - r); s.quadraticCurveTo(x1, y1, x1 - r, y1);
  s.lineTo(x0 + r, y1); s.quadraticCurveTo(x0, y1, x0, y1 - r);
  s.lineTo(x0, y0 + r); s.quadraticCurveTo(x0, y0, x0 + r, y0);
  const geo = new THREE.ExtrudeGeometry(s, {depth:depth - 2 * b, bevelEnabled:true, bevelThickness:b, bevelSize:b, bevelSegments:5, curveSegments:10});
  geo.translate(0, 0, b);
  const pos = geo.attributes.position, uv = geo.attributes.uv;   // 表の絵は、板いっぱいに1枚で貼る
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + w / 2) / w, (pos.getY(i) + h / 2) / h);
  const cw = image ? 2048 : 1024, ch = Math.round(cw * h / w);
  const tex = canvasTexture(cw, ch, g => {
    g.fillStyle = '#c99b63'; g.fillRect(0, 0, cw, ch);
    for (let i = 0; i < (image ? 150 : 70); i++) {   // 木目：ゆらぐ細い線
      const y = Math.random() * ch, amp = 2 + Math.random() * 5, f = 0.004 + Math.random() * 0.01, ph = Math.random() * 6;
      g.strokeStyle = `rgba(${95 + Math.random() * 40},${58 + Math.random() * 25},${28 + Math.random() * 15},${0.08 + Math.random() * 0.2})`;
      g.lineWidth = 0.8 + Math.random() * 2.2;
      g.beginPath();
      for (let x = 0; x <= cw; x += 8) { const yy = y + Math.sin(x * f + ph) * amp; x ? g.lineTo(x, yy) : g.moveTo(x, yy); }
      g.stroke();
    }
    if (image) {   // ロゴは、板のまんなかに、まわりに余白をとって入れる
      const k = Math.min(cw * 0.86 / image.width, ch * 0.78 / image.height), iw = image.width * k, ih = image.height * k;
      g.drawImage(image, (cw - iw) / 2, (ch - ih) / 2, iw, ih);
      return;
    }
    // 文字は、彫って色を入れたように（下に明るいふち）
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `${fontFor(label) === FONT ? 700 : 600} ${ch * 0.5}px ${fontFor(label)}`;
    g.fillStyle = 'rgba(255,236,200,.55)'; g.fillText(label, cw / 2, ch * 0.53 + ch * 0.018);
    g.fillStyle = '#3d2716'; g.fillText(label, cw / 2, ch * 0.53);
  });
  const mesh = new THREE.Mesh(geo, [new THREE.MeshStandardMaterial({map:tex, roughness:.72}), new THREE.MeshStandardMaterial({color:0xa9763f, roughness:.75})]);
  mesh.castShadow = true;
  return mesh;
}

// 画像を読み込む（看板に入れるロゴなど）
export function loadImage(url){
  return new Promise((ok, ng) => { const img = new Image(); img.onload = () => ok(img); img.onerror = () => ng(new Error('画像を読み込めません: ' + url)); img.src = url; });
}

// ぼんやりした丸（光だまり・接地の影）
export const PLAQUE = {bg:'#2f5d50', ink:'#f6f1e6', muted:'#b9cfc4', center:true};
export const PLAQUE_SIDE = 0x2f5d50;

export function glowTexture(inner = 'rgba(255,246,228,1)', outer = 'rgba(255,246,228,0)'){
  return canvasTexture(256, 256, g => {
    const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    gr.addColorStop(0, inner); gr.addColorStop(1, outer);
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  });
}

export function makeLoader(renderer){
  const loader = new THREE.TextureLoader();
  const aniso = renderer.capabilities.getMaxAnisotropy();
  const cache = new Map();
  // srgb=false は写真の色をそのまま使う素材（Tシャツ）用
  return function loadTex(url, srgb = true){
    const key = url + (srgb ? '|s' : '|n');
    if (!cache.has(key)) cache.set(key, new Promise((ok, ng) => loader.load(url, t => {
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = aniso; ok(t);
    }, undefined, () => ng(new Error('画像を読み込めません: ' + url)))));
    return cache.get(key);
  };
}

export function box(w, h, d, mat, x = 0, y = 0, z = 0){
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}
