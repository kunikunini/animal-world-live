import * as THREE from 'three';
import {loadGLB} from './glb.js';
import {woodTexture, woodSign, loadImage} from './util.js';
import {buildBackdrop} from './backdrop.js';
import {addFigurines} from './figurines.js';

// 森の大樹の店。外観・内装は Blender のモデル（prototypes/tree-shop-blender-v2）で、ここでは読み込んで光を当てるだけ。
// 返す形は room.js の buildRoom と同じ。売り場の場所は、モデルの中の目印（売り場の id と同じ名前の空ノード）から取る。
// 原点は床の中央、奥が -z、入口が +z。
const CAST = /^(fx_|Register|West_Cabinet|Stool|Pots|Island_Baskets|Door_[LR]$|Bench|Mushrooms|Lanterns_Path)/;   // 影を落とすもの（幹・屋根・地面は落とさない）
const RECEIVE = /^(Floor|Rug|Ground|Path_Stones|fx_|West_|Register_Counter|North_GreenWall|NW_MorinoaWall)/;

// 看板の外枠：拾ってきた木の枝を、わざとそろえずに組んだふち。枝は少し曲がり、太さも長さもまちまちで、角では重なってはみ出す。
// 毎回同じ形になるよう、乱数は決まった種から作る
function branchFrame(w, h, depth){
  let seed = 20261112;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296, jit = a => (rnd() - 0.5) * 2 * a;
  const bark = new THREE.MeshStandardMaterial({map:woodTexture('#6b4a2c', [38, 24, 12], 512, 64, 60), roughness:.9});
  const cut = new THREE.MeshStandardMaterial({color:0xcfa46c, roughness:.8});   // 枝の切り口
  const frame = new THREE.Group();
  // a から b へ、少し曲がった枝を1本。r は太さ（先へ行くほど少し細い）
  function branch(a, b, r){
    const dir = b.clone().sub(a), side = new THREE.Vector3(-dir.y, dir.x, 0).normalize(), pts = [];
    for (let i = 0; i <= 5; i++) {
      const t = i / 5, bend = Math.sin(t * Math.PI) * 0.5 + 0.5;
      pts.push(a.clone().lerp(b, t).addScaledVector(side, jit(0.022) * bend).add(new THREE.Vector3(0, 0, jit(0.012))));
    }
    const curve = new THREE.CatmullRomCurve3(pts), geo = new THREE.TubeGeometry(curve, 28, r, 9, false);
    const pos = geo.attributes.position, c = new THREE.Vector3();   // 根もとから先へ細くし、こぶを付ける
    for (let i = 0; i < pos.count; i++) {
      const t = Math.floor(i / 10) / 28; curve.getPoint(t, c);
      const k = (1 - 0.28 * t) * (1 + 0.1 * Math.sin(t * 23 + r * 400));
      pos.setXYZ(i, c.x + (pos.getX(i) - c.x) * k, c.y + (pos.getY(i) - c.y) * k, c.z + (pos.getZ(i) - c.z) * k);
    }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, bark); m.castShadow = true; frame.add(m);
    for (const [t, k] of [[0, 1], [1, 0.72]]) {   // 両はしの切り口
      const cap = new THREE.Mesh(new THREE.CircleGeometry(r * k, 9), cut), p = curve.getPoint(t), tan = curve.getTangent(t).multiplyScalar(t ? 1 : -1);
      cap.position.copy(p); cap.lookAt(p.clone().add(tan)); frame.add(cap);
    }
    if (rnd() < 0.6) {   // ときどき、小枝が1本出ている
      const t = 0.25 + rnd() * 0.5, p = curve.getPoint(t), out = side.clone().multiplyScalar(rnd() < 0.5 ? 1 : -1).add(dir.clone().normalize().multiplyScalar(0.7)).normalize();
      const twig = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.18, r * 0.36, 0.11 + rnd() * 0.07, 6), bark);
      twig.position.copy(p).addScaledVector(out, 0.06); twig.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), out); frame.add(twig);
    }
  }
  const x = w / 2, y = h / 2, z = depth - 0.005, over = () => 0.07 + rnd() * 0.13;   // over：角からはみ出す長さ
  const P = (px, py, pz = z) => new THREE.Vector3(px, py, pz);
  // 上と下は、長い枝1本と、途中から重なる短い枝1本。左右は1本ずつ。向きも少しずつ傾ける
  branch(P(-x - over(), y + jit(0.03)), P(x * 0.45, y + jit(0.03)), 0.05);
  branch(P(x + over(), y + jit(0.03), z + 0.03), P(-x * 0.1, y + 0.01 + jit(0.03), z + 0.03), 0.042);
  branch(P(x + over(), -y + jit(0.03)), P(-x * 0.35, -y + jit(0.03)), 0.052);
  branch(P(-x - over(), -y + jit(0.03), z + 0.03), P(x * 0.15, -y - 0.01 + jit(0.03), z + 0.03), 0.04);
  branch(P(-x + jit(0.03), -y - over(), z + 0.05), P(-x + jit(0.03), y + over(), z + 0.05), 0.047);
  branch(P(x + jit(0.03), y + over(), z + 0.05), P(x + jit(0.03), -y - over(), z + 0.05), 0.05);
  return frame;
}

// 木のざらつき：木の材質に、木目の絵から作った凹凸を足す（光が当たると、木目の筋と細かいざらつきが浮く）。
// 凹凸の絵は、木目の絵の「細かい明暗」だけを取り出して強め、砂目を足したもの。色の大きなむらは凹凸にしない。
const WOOD = {'Oak':[1.6, 0.68], 'Floor planks':[1.5, 0.6], 'Inner wood':[2.2, 0.88], 'Weathered wood':[2.4, 0.95], 'Bark':[2.6, 0.97]};   // 材質名 → [凹凸の強さ, 表面の粗さ]
const WOOD_PLAIN = {'Oak dark':['Oak', [0.62, 0.5, 0.42]], 'Carved wood':['Inner wood', [0.95, 0.8, 0.62]]};   // 色だけだった木 → [借りる木目, かける色]
function roughenWood(root, aniso){
  const bumps = new Map(), byName = {};
  root.traverse(o => { if (o.isMesh && o.material.map && WOOD[o.material.name]) byName[o.material.name] = o.material; });
  function bumpOf(map){
    if (bumps.has(map.image)) return bumps.get(map.image);
    const S = 1024, c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d', {willReadFrequently:true}); g.drawImage(map.image, 0, 0, S, S);
    const src = g.getImageData(0, 0, S, S).data;
    const t = document.createElement('canvas'); t.width = t.height = S / 16;   // 大きなむら（これを引く）
    const tg = t.getContext('2d'); tg.imageSmoothingQuality = 'high'; tg.drawImage(c, 0, 0, t.width, t.height);
    g.imageSmoothingQuality = 'high'; g.drawImage(t, 0, 0, S, S);
    const img = g.getImageData(0, 0, S, S), low = img.data;
    let seed = 4711; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let i = 0; i < low.length; i += 4) {
      const lum = v => v[i] * 0.3 + v[i + 1] * 0.59 + v[i + 2] * 0.11;
      const h = Math.max(0, Math.min(255, 128 + (lum(src) - lum(low)) * 2.6 + (rnd() - 0.5) * 34));
      low[i] = low[i + 1] = low[i + 2] = h; low[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(c);
    tex.flipY = false; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = aniso;
    bumps.set(map.image, tex);
    return tex;
  }
  const done = new Set();
  root.traverse(o => {
    if (!o.isMesh || done.has(o.material)) return;
    const m = o.material; done.add(m);
    if (WOOD_PLAIN[m.name] && !m.map && byName[WOOD_PLAIN[m.name][0]]) {   // 色だけの木にも、木目を入れる
      const [from, tint] = WOOD_PLAIN[m.name];
      m.map = byName[from].map; m.color.setRGB(...tint);
      m.bumpMap = bumpOf(m.map); m.bumpScale = WOOD[from][0]; m.roughness = Math.max(m.roughness, 0.72); m.needsUpdate = true;
    } else if (WOOD[m.name] && m.map) {
      const [bump, rough] = WOOD[m.name];
      m.bumpMap = bumpOf(m.map); m.bumpScale = bump; m.roughness = rough; m.needsUpdate = true;
    }
  });
}

// 丸窓の枠：元の貼り方では木目が出ない（のっぺりする）ので、輪に沿って木目が回るように貼り直す
function ringUV(node){
  node.traverse(o => {
    if (!o.isMesh || o.material.name !== 'Oak') return;
    const geo = o.geometry = o.geometry.toNonIndexed(), pos = geo.attributes.position;
    geo.computeBoundingBox();
    const c = geo.boundingBox.getCenter(new THREE.Vector3()), n = new THREE.Vector3(c.x, 0, c.z).normalize(), t = new THREE.Vector3(-n.z, 0, n.x);
    const uv = new Float32Array(pos.count * 2), p = new THREE.Vector3(), REP = 5;
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i).sub(c);
      const a = p.dot(t), b = p.y;
      uv[i * 2] = Math.atan2(b, a) / (2 * Math.PI) * REP; uv[i * 2 + 1] = Math.hypot(a, b) * 1.3 + p.dot(n) * 1.3;
    }
    for (let i = 0; i < pos.count; i += 3) {   // 輪の継ぎ目をまたぐ三角形は、木目がつぶれないよう、同じ周にそろえる
      const u = [uv[i * 2], uv[i * 2 + 2], uv[i * 2 + 4]], hi = Math.max(...u);
      for (let k = 0; k < 3; k++) if (hi - u[k] > REP / 2) uv[(i + k) * 2] += REP;
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  });
}

// ランタンの灯り：灯りの面のまわりに、ぼんやり広がる光のにじみを重ねる
function lanternGlow(root){
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'), gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, 'rgba(255,232,150,.95)'); gr.addColorStop(0.2, 'rgba(255,218,120,.55)'); gr.addColorStop(0.5, 'rgba(255,204,100,.2)'); gr.addColorStop(1, 'rgba(255,196,90,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({map:tex, transparent:true, opacity:.85, depthWrite:false, toneMapped:false, fog:false});
  const spots = [], v = new THREE.Vector3();
  root.updateWorldMatrix(true, true);
  root.traverse(o => {
    if (!o.isMesh || o.material.name !== 'Lantern glow') return;
    const pos = o.geometry.attributes.position, big = /Rattan/.test(o.parent?.name || o.name);
    for (let i = 0; i < pos.count; i++) {   // 近い頂点をまとめて、灯り1つずつの中心を出す
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      let s = spots.find(s => s.sum.clone().divideScalar(s.n).distanceTo(v) < 0.5);
      if (!s) spots.push(s = {sum:new THREE.Vector3(), n:0, big});
      s.sum.add(v); s.n++;
    }
  });
  for (const s of spots) {
    const sp = new THREE.Sprite(mat); sp.position.copy(s.sum.divideScalar(s.n));
    sp.scale.setScalar(s.big ? 2.0 : sp.position.z > 2.5 ? 1.7 : 1.3);   // 外のランタンは大きめ、店内は控えめ
    sp.renderOrder = 10; root.add(sp);
  }
}

// 面の向きごとに、まっすぐ絵を貼り直す（1mあたり rep 回くり返す）
function boxUV(mesh, rep){
  const geo = mesh.geometry = mesh.geometry.toNonIndexed(), pos = geo.attributes.position, uv = new Float32Array(pos.count * 2);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
    n.crossVectors(b.clone().sub(a), c.clone().sub(a));
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    [a, b, c].forEach((p, k) => {
      const [u, v] = ax >= ay && ax >= az ? [p.z, p.y] : ay >= az ? [p.x, p.z] : [p.x, p.y];
      uv[(i + k) * 2] = u * rep; uv[(i + k) * 2 + 1] = -v * rep;
    });
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

// 壁面緑化の草むら：いろいろな向きの短い草の葉を、何千本も重ねて描く（筋が一方向にそろわない）。くり返しても継ぎ目が出ない
function weedTexture(aniso){
  const S = 1024; let seed = 5150;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296, pick = (a, b) => a + (b - a) * rnd();
  const make = paint => {
    const c = document.createElement('canvas'); c.width = c.height = S; paint(c.getContext('2d'));
    const t = new THREE.CanvasTexture(c); t.flipY = false; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso; return t;
  };
  const items = [];   // 色の絵と凹凸の絵で、同じ葉を同じ場所に描く
  for (let i = 0; i < 260; i++) items.push({kind:'patch', x:rnd() * S, y:rnd() * S, r:pick(40, 120), tone:rnd()});
  for (let i = 0; i < 9000; i++) items.push({kind:'blade', x:rnd() * S, y:rnd() * S, len:pick(10, 34), ang:-Math.PI / 2 + pick(-1.25, 1.25), bend:pick(-0.5, 0.5), w:pick(1.2, 3.2), tone:rnd(), lift:rnd()});
  for (let i = 0; i < 700; i++) items.push({kind:'leaf', x:rnd() * S, y:rnd() * S, r:pick(3, 7), ang:rnd() * 6.283, tone:rnd()});
  const each = (g, it, fn) => { for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) {
    if (it.x + dx < -130 || it.x + dx > S + 130 || it.y + dy < -130 || it.y + dy > S + 130) continue;
    g.save(); g.translate(it.x + dx, it.y + dy); fn(); g.restore();
  } };
  const blade = (g, it) => {
    const ex = Math.cos(it.ang) * it.len, ey = Math.sin(it.ang) * it.len, mx = ex / 2 - ey * it.bend * 0.4, my = ey / 2 + ex * it.bend * 0.4;
    g.lineWidth = it.w; g.lineCap = 'round'; g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(mx, my, ex, ey); g.stroke();
  };
  const greens = [[95, 127, 102], [122, 150, 120], [157, 181, 154], [188, 204, 178], [108, 138, 112]];   // 北欧風の壁紙（#9db59a・#5f7f66）に合わせた、くすんだ緑
  const col = (tone, k = 1) => { const a = greens[Math.floor(tone * greens.length) % greens.length]; return `rgb(${a.map(v => Math.round(v * k)).join(',')})`; };
  const map = make(g => {
    g.fillStyle = '#8fa98c'; g.fillRect(0, 0, S, S);
    for (const it of items) each(g, it, () => {
      if (it.kind === 'patch') { const gr = g.createRadialGradient(0, 0, 0, 0, 0, it.r); gr.addColorStop(0, it.tone < 0.5 ? 'rgba(95,127,102,.32)' : 'rgba(214,222,196,.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(-it.r, -it.r, it.r * 2, it.r * 2); }
      else if (it.kind === 'blade') { g.strokeStyle = col(it.tone, 0.8 + it.lift * 0.4); blade(g, it); }
      else { g.rotate(it.ang); g.fillStyle = col(it.tone, 1.15); g.beginPath(); g.ellipse(0, 0, it.r, it.r * 0.6, 0, 0, 6.283); g.fill(); }
    });
  });
  map.colorSpace = THREE.SRGBColorSpace;
  const bump = make(g => {
    g.fillStyle = '#555'; g.fillRect(0, 0, S, S);
    for (const it of items) each(g, it, () => {
      const v = Math.round(90 + (it.lift ?? it.tone) * 150), c = `rgb(${v},${v},${v})`;
      if (it.kind === 'blade') { g.strokeStyle = c; blade(g, it); }
      else if (it.kind === 'leaf') { g.rotate(it.ang); g.fillStyle = c; g.beginPath(); g.ellipse(0, 0, it.r, it.r * 0.6, 0, 0, 6.283); g.fill(); }
    });
  });
  return {map, bump};
}

// 北欧風の壁紙（自然の柄）。その場で描く。w・h は壁の大きさ（m）
//   leaf：くすんだ緑の地に、生成りの枝葉と、からし色・れんが色の実（マグカップの後ろ）
//   forest：生成りの地に、もみの木と丸い木が並ぶ森（ステッカーの後ろ）
function wallpaper(kind, w, h, aniso){
  const PX = 640, W = Math.round(w * PX), H = Math.round(h * PX);   // 1m＝640画素
  let seed = kind === 'leaf' ? 311 : kind === 'grove' ? 4242 : kind === 'orchard' ? 1207 : 977;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296, pick = (a, b) => a + (b - a) * rnd();
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const grainy = () => {   // 紙のこまかいむら
    for (let i = 0; i < 5000; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '60,50,30'},${pick(0.02, 0.06)})`; g.fillRect(rnd() * W, rnd() * H, pick(1, 3), pick(1, 3)); }
  };
  if (kind === 'leaf') {
    g.fillStyle = '#9db59a'; g.fillRect(0, 0, W, H);
    const cream = '#f3ecdc', deep = '#5f7f66', mustard = '#d9a441', brick = '#c4684a';
    const leaf = (x, y, ang, len, col) => { g.save(); g.translate(x, y); g.rotate(ang); g.fillStyle = col; g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(len * 0.5, -len * 0.34, len, 0); g.quadraticCurveTo(len * 0.5, len * 0.34, 0, 0); g.fill(); g.restore(); };
    const step = 0.2 * PX;   // 枝どうしの間隔
    for (let col = 0, x = step * 0.5; x < W + step; x += step, col++) {
      const up = col % 2 === 0, tall = 0.34 * PX;
      for (let y = (up ? 0 : -tall / 2) - 20; y < H + tall; y += tall) {
        const sway = pick(-6, 6);
        g.strokeStyle = cream; g.lineWidth = 3.2; g.lineCap = 'round';
        g.beginPath(); g.moveTo(x, y + tall * 0.86); g.quadraticCurveTo(x + sway, y + tall * 0.45, x, y + tall * 0.08); g.stroke();
        for (let k = 0; k < 4; k++) {
          const ly = y + tall * (0.72 - k * 0.17), len = (30 - k * 3.5);
          leaf(x, ly, -0.55, len, k % 2 ? deep : cream); leaf(x, ly, Math.PI + 0.55, len, k % 2 ? cream : deep);
        }
        leaf(x, y + tall * 0.1, -Math.PI / 2, 24, cream);
        g.fillStyle = rnd() < 0.5 ? mustard : brick;   // 枝のあいだの実
        for (const [dx, dy] of [[step * 0.5, tall * 0.3], [step * 0.5 + 9, tall * 0.3 + 11], [step * 0.5 - 8, tall * 0.3 + 13]]) { g.beginPath(); g.arc(x + dx, y + dy, 4.6, 0, 6.283); g.fill(); }
      }
    }
    grainy();
  } else if (kind === 'grove') {   // 森：白地に、形のちがう木を散らす。葉は4色の緑、幹と枝はこげ茶の線
    g.fillStyle = '#f7f7f2'; g.fillRect(0, 0, W, H);
    const leafCols = ['#a4d6ae', '#9bd88b', '#a7e6d7', '#62a783'], wood = '#3b2715';
    const tree = (x, y, s, shape, col) => {
      g.save(); g.translate(x, y); g.rotate(pick(-0.1, 0.1));
      g.fillStyle = col; g.beginPath();
      if (shape === 0) g.ellipse(0, -s * 0.62, s * 0.24, s * 0.36, 0, 0, 6.283);                        // たまご形
      else if (shape === 1) { g.moveTo(0, -s); g.bezierCurveTo(s * 0.1, -s * 0.9, s * 0.3, -s * 0.5, s * 0.2, -s * 0.32); g.bezierCurveTo(s * 0.12, -s * 0.2, -s * 0.12, -s * 0.2, -s * 0.2, -s * 0.32); g.bezierCurveTo(-s * 0.3, -s * 0.5, -s * 0.1, -s * 0.9, 0, -s); }   // しずく形
      else if (shape === 2) for (const [cx, cy, r] of [[-0.17, -0.5, 0.2], [0.17, -0.5, 0.2], [0, -0.72, 0.21], [0, -0.52, 0.16]]) { g.moveTo(cx * s + r * s, cy * s); g.arc(cx * s, cy * s, r * s, 0, 6.283); }   // もこもこ
      else for (const a of [-1.15, -0.6, 0, 0.6, 1.15]) { const len = s * (a === 0 ? 0.5 : 0.4); g.save(); g.translate(0, -s * 0.4); g.rotate(a); g.moveTo(0, 0); g.bezierCurveTo(s * 0.13, -len * 0.3, s * 0.1, -len * 0.85, 0, -len); g.bezierCurveTo(-s * 0.1, -len * 0.85, -s * 0.13, -len * 0.3, 0, 0); g.restore(); }   // 葉のかたち
      g.fill();
      g.fillStyle = wood; g.beginPath();   // 幹：根もとが太く、上へ細くなる
      const top = -s * 0.78, hw = s * 0.035, lean = pick(-0.03, 0.03) * s;
      g.moveTo(-hw, 0); g.quadraticCurveTo(-hw * 0.5 + lean, top * 0.5, lean, top); g.quadraticCurveTo(hw * 0.5 + lean, top * 0.5, hw, 0); g.closePath(); g.fill();
      g.strokeStyle = wood; g.lineWidth = Math.max(2, s * 0.02); g.lineCap = 'round';   // 枝
      const n = shape === 2 ? 4 : 3;
      for (let i = 0; i < n; i++) {
        const by = top * (0.42 + i * 0.4 / n), side = i % 2 ? 1 : -1, len = s * pick(0.12, 0.2);
        g.beginPath(); g.moveTo(lean * (by / top), by); g.quadraticCurveTo(side * len * 0.5, by - len * 0.3, side * len * 0.75, by - len); g.stroke();
      }
      g.restore();
    };
    const cellX = 0.34 * PX, cellY = 0.4 * PX;
    for (let row = -1, y = cellY * 0.6; y < H + cellY; y += cellY, row++) {
      for (let x = (row % 2 ? 0.5 : 0.08) * cellX; x < W + cellX * 0.5; x += cellX) {
        tree(x + pick(-0.16, 0.16) * cellX, y + pick(-0.14, 0.14) * cellY, pick(0.23, 0.3) * PX, Math.floor(rnd() * 4), leafCols[Math.floor(rnd() * leafCols.length)]);
      }
    }
    for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(60,50,30,${pick(0.012, 0.03)})`; g.fillRect(rnd() * W, rnd() * H, pick(1, 3), pick(1, 3)); }
  } else if (kind === 'orchard') {   // 実のなる木：灰色がかった地に、枝を左右に広げたオリーブ色の木と小さな葉、ところどころに黄色い実
    g.fillStyle = '#c9cdc6'; g.fillRect(0, 0, W, H);
    const olive = '#7c7626', fruit = '#f3d53c';
    const leaf = (x, y, ang, len) => { g.save(); g.translate(x, y); g.rotate(ang); g.beginPath(); g.ellipse(0, 0, len, len * 0.46, 0, 0, 6.283); g.fill(); g.restore(); };
    const fruits = [];
    const tree = (x, y, tall) => {
      g.fillStyle = olive; g.strokeStyle = olive; g.lineCap = 'round';
      const bw = tall * 0.036;
      g.beginPath(); g.moveTo(x - bw, y); g.lineTo(x - bw * 0.3, y - tall); g.lineTo(x + bw * 0.3, y - tall); g.lineTo(x + bw, y); g.closePath(); g.fill();
      const n = 7;
      for (let i = 0; i < n; i++) {
        const ty = y - tall * (0.16 + i * 0.115), len = tall * 0.3 * (1 - i * 0.105);
        for (const side of [-1, 1]) {
          const l = len * pick(0.86, 1.08), ex = x + side * l, ey = ty - l * pick(0.5, 0.66);
          g.lineWidth = tall * 0.03 * (1 - i * 0.07);
          g.beginPath(); g.moveTo(x, ty); g.quadraticCurveTo(x + side * l * 0.72, ty + l * 0.02, ex, ey); g.stroke();
          const ll = tall * pick(0.034, 0.046);
          leaf(ex + side * ll * 0.5, ey - ll * 1.5, side * pick(0.5, 1.0), ll);                       // 枝の先の葉
          if (i < 5) leaf(x + side * l * pick(0.5, 0.7), ty + ll * pick(1.3, 1.9), -side * pick(0.3, 0.8), ll * 0.9);   // 枝の下の葉
          if (i < 4 && rnd() < 0.6) leaf(ex + side * ll * pick(1.6, 2.4), ey + ll * pick(-0.4, 1.2), side * pick(-0.4, 0.6), ll * 0.85);
          if (rnd() < 0.2) fruits.push([ex + side * pick(-0.3, 0.6) * ll * 3, ey - pick(0.2, 1.2) * ll * 2, tall * pick(0.03, 0.05)]);
        }
      }
      leaf(x, y - tall - tall * 0.03, Math.PI / 2, tall * 0.04);
    };
    const stepX = 0.4 * PX, stepY = 0.46 * PX;
    for (let row = 0, y = stepY * 0.92; y < H + stepY; y += stepY, row++) {
      for (let x = (row % 2 ? 0.5 : 0) * stepX + stepX * 0.3; x < W + stepX * 0.5; x += stepX) tree(x + pick(-10, 10), y + pick(-12, 12), pick(0.52, 0.6) * PX);
    }
    g.fillStyle = fruit;   // 実は、枝と葉の上に重ねる
    for (const [fx, fy, r] of fruits) { g.beginPath(); g.ellipse(fx, fy, r, r * pick(0.9, 1.05), 0, 0, 6.283); g.fill(); }
    grainy();
  } else {
    g.fillStyle = '#f1eadb'; g.fillRect(0, 0, W, H);
    const fir = '#4f7a5c', sage = '#8fae8a', mustard = '#d6a546', bark = '#8a6a4a', sky = '#b9cfd6';
    const rowH = 0.3 * PX;
    for (let row = 0, y = rowH * 0.9; y < H + rowH; y += rowH, row++) {
      for (let x = (row % 2 ? 0.11 : 0) * PX + pick(0, 10); x < W + 60; x += pick(0.19, 0.25) * PX) {
        const t = rnd();
        if (t < 0.45) {   // もみの木
          const tall = pick(86, 118), wide = tall * 0.5, col = rnd() < 0.7 ? fir : sage;
          g.fillStyle = bark; g.fillRect(x - 3, y - 16, 6, 16);
          g.fillStyle = col;
          for (let i = 0; i < 3; i++) { const y0 = y - 14 - i * tall * 0.26, hw = wide * (1 - i * 0.24) / 2; g.beginPath(); g.moveTo(x - hw, y0); g.lineTo(x, y0 - tall * 0.42); g.lineTo(x + hw, y0); g.closePath(); g.fill(); }
        } else if (t < 0.8) {   // 丸い木
          const r = pick(26, 36), col = rnd() < 0.5 ? sage : mustard;
          g.strokeStyle = bark; g.lineWidth = 5; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - r * 1.5); g.stroke();
          g.fillStyle = col; g.beginPath(); g.ellipse(x, y - r * 2.1, r * 0.82, r, 0, 0, 6.283); g.fill();
          g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 2.4; g.beginPath(); g.moveTo(x, y - r * 1.5); g.lineTo(x, y - r * 2.5); g.moveTo(x, y - r * 1.9); g.lineTo(x + r * 0.34, y - r * 2.3); g.moveTo(x, y - r * 2.15); g.lineTo(x - r * 0.3, y - r * 2.5); g.stroke();
        } else {   // 小さな草むらと花
          g.strokeStyle = sage; g.lineWidth = 3; g.lineCap = 'round';
          for (const a of [-0.5, 0, 0.5]) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.sin(a) * 26, y - Math.cos(a) * 26); g.stroke(); }
          g.fillStyle = mustard; g.beginPath(); g.arc(x, y - 30, 5, 0, 6.283); g.fill();
        }
      }
      g.fillStyle = sky;   // 段のあいだに、空の点
      for (let x = pick(20, 60); x < W; x += pick(70, 120)) { g.beginPath(); g.arc(x, y - rowH * pick(0.62, 0.72), 3.2, 0, 6.283); g.fill(); }
    }
    grainy();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso;
  return t;
}

// 葉の絵（左半分：先のとがった卵形の葉、右半分：切れこみのある大きな葉）。色は葉ごとの色に掛けるので、ここでは明暗と葉脈だけを描く。
// 絵の下が根もと、上が葉先。葉の外は透明で、そこが切り抜かれる
function leafAtlas(aniso){
  const W = 512, H = 1024, c = document.createElement('canvas'); c.width = W * 2; c.height = H;
  const g = c.getContext('2d');
  const blade = (x0, heart) => {
    const cx = x0 + W / 2, y0 = H * 0.955, y1 = H * 0.03, hw = W * 0.47;
    const path = () => {
      g.beginPath(); g.moveTo(cx, y0);
      if (heart) {   // 根もとがハート形にくぼむ、幅の広い葉
        g.bezierCurveTo(cx - hw * 0.5, y0 + H * 0.03, cx - hw * 1.02, y0 - H * 0.1, cx - hw, y0 - H * 0.36);
        g.bezierCurveTo(cx - hw * 0.98, y0 - H * 0.66, cx - hw * 0.3, y1 + H * 0.12, cx, y1);
        g.bezierCurveTo(cx + hw * 0.3, y1 + H * 0.12, cx + hw * 0.98, y0 - H * 0.66, cx + hw, y0 - H * 0.36);
        g.bezierCurveTo(cx + hw * 1.02, y0 - H * 0.1, cx + hw * 0.5, y0 + H * 0.03, cx, y0);
      } else {
        g.bezierCurveTo(cx - hw * 0.75, y0 - H * 0.08, cx - hw * 1.05, y0 - H * 0.36, cx - hw * 0.82, y0 - H * 0.56);
        g.bezierCurveTo(cx - hw * 0.6, y0 - H * 0.78, cx - hw * 0.16, y1 + H * 0.08, cx, y1);
        g.bezierCurveTo(cx + hw * 0.16, y1 + H * 0.08, cx + hw * 0.6, y0 - H * 0.78, cx + hw * 0.82, y0 - H * 0.56);
        g.bezierCurveTo(cx + hw * 1.05, y0 - H * 0.36, cx + hw * 0.75, y0 - H * 0.08, cx, y0);
      }
      g.closePath();
    };
    g.save(); path(); g.clip();
    const gr = g.createLinearGradient(x0, 0, x0 + W, 0);   // まんなかが少し暗く、ふちへ向かって明るい
    gr.addColorStop(0, '#f2f6e8'); gr.addColorStop(0.5, '#c9d6bd'); gr.addColorStop(1, '#eef4e2');
    g.fillStyle = gr; g.fillRect(x0, 0, W, H);
    const tip = g.createLinearGradient(0, y0, 0, y1); tip.addColorStop(0, 'rgba(40,70,30,.22)'); tip.addColorStop(0.5, 'rgba(0,0,0,0)'); tip.addColorStop(1, 'rgba(255,255,230,.25)');
    g.fillStyle = tip; g.fillRect(x0, 0, W, H);
    g.lineCap = 'round';
    for (const sx of [-1, 1]) for (let i = 0; i < 9; i++) {   // 側脈
      const t = 0.08 + i * 0.1, y = y0 + (y1 - y0) * t, len = hw * (heart ? 1.0 : 0.92) * Math.sin(Math.PI * Math.min(1, t * 0.9 + 0.12));
      g.strokeStyle = 'rgba(255,255,240,.8)'; g.lineWidth = 5 - i * 0.3;
      g.beginPath(); g.moveTo(cx, y); g.quadraticCurveTo(cx + sx * len * 0.55, y - H * 0.035, cx + sx * len, y - H * 0.1); g.stroke();
      g.strokeStyle = 'rgba(50,80,40,.18)'; g.lineWidth = 9;   // 葉脈のあいだのくぼみ
      g.beginPath(); g.moveTo(cx + sx * 6, y + H * 0.045); g.quadraticCurveTo(cx + sx * len * 0.5, y + H * 0.012, cx + sx * len * 0.9, y - H * 0.05); g.stroke();
    }
    g.strokeStyle = 'rgba(255,255,240,.95)'; g.lineWidth = 9; g.beginPath(); g.moveTo(cx, y0); g.lineTo(cx, y1 + 12); g.stroke();   // 主脈
    g.restore();
    if (heart) {   // 切れこみ（ふちから主脈へ向かう細いすきま）と、小さな穴
      g.globalCompositeOperation = 'destination-out';
      for (const sx of [-1, 1]) for (let i = 0; i < 5; i++) {
        const y = y0 - H * (0.2 + i * 0.13), far = cx + sx * hw * 1.1, near = cx + sx * hw * (0.36 + i * 0.03);
        g.beginPath(); g.moveTo(far, y - H * 0.105); g.quadraticCurveTo(near + sx * 20, y - H * 0.03, near, y); g.quadraticCurveTo(near + sx * 24, y - H * 0.012, far, y - H * 0.06); g.closePath(); g.fill();
        if (i % 2 === 0) { g.beginPath(); g.ellipse(cx + sx * hw * 0.2, y - H * 0.02, 11, 24, sx * 0.6, 0, 6.283); g.fill(); }
      }
      g.globalCompositeOperation = 'source-over';
    }
    g.strokeStyle = '#c9d6bd'; g.lineWidth = 14; g.lineCap = 'butt'; g.beginPath(); g.moveTo(cx, H); g.lineTo(cx, y0 - 6); g.stroke();   // 葉柄
  };
  blade(0, false); blade(W, true);
  const t = new THREE.CanvasTexture(c); t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso;
  return t;
}

// 外側の根・樹皮・苔が、店内の壁を突き抜けて見えるのを消す。その材質だけ、店内にあたる範囲（奥の壁〜入口の手前、壁の内側）の画素を描かない。
// 苔の材質は店内のラグなどと共用なので、外側の部品のぶんだけ複製してから手を入れる
function cutInside(root, names){
  const done = new Map();
  for (const name of names) root.getObjectByName(name)?.traverse(o => {
    if (!o.isMesh || !/^(Bark|Moss)$/.test(o.material?.name || '')) return;
    if (!done.has(o.material)) {
      const m = o.material.clone();
      m.onBeforeCompile = sh => {
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vCutPos;')
          .replace('#include <project_vertex>', '#include <project_vertex>\nvCutPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vCutPos;')
          .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (vCutPos.y > 0.05 && vCutPos.y < 4.7 && vCutPos.z > -3.47 && vCutPos.z < 2.5 && dot(vCutPos.xz, vCutPos.xz) < 17.6) discard;');
      };
      m.customProgramCacheKey = () => 'cut-inside';
      done.set(o.material, m);
    }
    o.material = done.get(o.material);
  });
}

// まんなかのラグ：模様（苔の絵・もりあがり・花）はそのままで、色だけを北欧風の配色に置きかえる（色は、添付の北欧風のラグから取った）。
// 地の部分は、元の明るい・暗いの並びのまま、濃い緑〜緑に。もりあがった苔のかたまりは、1つずつ黄緑か黄色に塗り分ける。白は花が受けもつ
// 照明で明るく出るぶんを見こんで、塗る色は少し暗くしてある（画面では 濃い緑 #2f4a2f・緑 #437f2c・黄緑 #a9b235・黄色 #eac615 に見える）
const RUG_BASE = ['#263c26', '#3d7428'], RUG_CLUMP = ['#879028', '#eac615'];
function recolorRug(o){
  const geo = o.geometry, ca = geo.attributes.color, pos = geo.attributes.position, n = ca.count, lum = new Float32Array(n);
  for (let i = 0; i < n; i++) lum[i] = 0.2126 * ca.getX(i) + 0.7152 * ca.getY(i) + 0.0722 * ca.getZ(i);
  const sorted = Float32Array.from(lum).sort();
  // かたまりと地の境目：明るさの上半分で、いちばん大きく飛んでいる所
  let cut = sorted[Math.floor(n * 0.75)], gap = 0;
  for (let i = Math.floor(n * 0.5); i < Math.floor(n * 0.97); i++) if (sorted[i + 1] - sorted[i] > gap) { gap = sorted[i + 1] - sorted[i]; cut = (sorted[i] + sorted[i + 1]) / 2; }
  const isClump = i => lum[i] > cut;
  // かたまりを1つずつ見分ける（同じ位置の点と、三角形でつながった点を同じかたまりにする）
  const parent = Int32Array.from({length:n}, (_, i) => i), find = i => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
  const join = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[b] = a; };
  const at = new Map();
  for (let i = 0; i < n; i++) if (isClump(i)) { const k = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`; at.has(k) ? join(at.get(k), i) : at.set(k, i); }
  const tri = geo.index ? (j => geo.index.getX(j)) : (j => j), tc = geo.index ? geo.index.count : n;
  for (let j = 0; j < tc; j += 3) { const a = tri(j), b = tri(j + 1), c = tri(j + 2); if (isClump(a) && isClump(b)) join(a, b); if (isClump(b) && isClump(c)) join(b, c); if (isClump(a) && isClump(c)) join(a, c); }
  const roots = [...new Set([...Array(n).keys()].filter(isClump).map(find))].sort((a, b) => pos.getX(a) - pos.getX(b));
  const clumpCol = new Map(roots.map((r, i) => [r, new THREE.Color(RUG_CLUMP[(i * 7 + (i >> 1)) % 2])]));   // となりどうしが同じ色に偏らないように
  const base = Float32Array.from(sorted.filter(v => v <= cut)), b0 = new THREE.Color(RUG_BASE[0]), b1 = new THREE.Color(RUG_BASE[1]), c = new THREE.Color();
  const rank = v => { let lo = 0, hi = base.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (base[m] < v) lo = m + 1; else hi = m; } return lo / Math.max(1, base.length - 1); };
  for (let i = 0; i < n; i++) {
    if (isClump(i)) c.copy(clumpCol.get(find(i))); else c.copy(b0).lerp(b1, rank(lum[i]));
    ca.setXYZ(i, c.r, c.g, c.b);
  }
  ca.needsUpdate = true;
  // 苔の絵は緑みがあるので、明るさのむらだけを残した灰色の絵にして重ねる（色は頂点色で決まる）
  const src = o.material.map, img = src?.image;
  const m = o.material.clone();
  if (img) {
    const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
    const g = cv.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, cv.width, cv.height), px = d.data; let sum = 0;
    for (let i = 0; i < px.length; i += 4) { const l = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]; px[i] = l; sum += l; }
    const k = 225 / (sum / (px.length / 4));
    for (let i = 0; i < px.length; i += 4) px[i] = px[i + 1] = px[i + 2] = Math.min(255, px[i] * k);
    g.putImageData(d, 0, 0);
    const t = new THREE.CanvasTexture(cv);
    for (const key of ['flipY', 'wrapS', 'wrapT', 'colorSpace', 'channel', 'anisotropy']) t[key] = src[key];
    t.repeat.copy(src.repeat); t.offset.copy(src.offset); t.rotation = src.rotation; t.center.copy(src.center);
    m.map = t;
  }
  o.material = m;
}

// クラフト紙：うすい茶色の地に、繊維のすじと細かいむら。凹凸（bump）にも同じ絵を使う
function kraftTexture(aniso){
  const N = 512, cv = document.createElement('canvas'); cv.width = cv.height = N;
  const g = cv.getContext('2d');
  g.fillStyle = '#c49c6c'; g.fillRect(0, 0, N, N);
  const img = g.getImageData(0, 0, N, N), px = img.data;
  for (let i = 0; i < px.length; i += 4) { const d = (Math.random() - 0.5) * 16; px[i] += d; px[i + 1] += d; px[i + 2] += d * 0.8; }
  g.putImageData(img, 0, 0);
  for (let k = 0; k < 2600; k++) {   // 短い繊維（明るいもの・暗いもの）。端をまたいでも続くように、9か所に描く
    const x = Math.random() * N, y = Math.random() * N, a = Math.random() * Math.PI, l = 4 + Math.random() * 14;
    g.strokeStyle = Math.random() < 0.5 ? 'rgba(235,205,160,.35)' : 'rgba(110,75,40,.22)'; g.lineWidth = 0.6 + Math.random() * 0.8;
    for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) {
      g.beginPath(); g.moveTo(x + ox, y + oy); g.lineTo(x + ox + Math.cos(a) * l, y + oy + Math.sin(a) * l); g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso;
  return t;
}

// レジの台の上：クリーム色の札に「お会計」と書き、紙袋はクラフト紙の質感にして、足あとの代わりにロゴを刷る
async function dressRegister(shell, g, logo, aniso){
  const items = shell.nodes.Register_Items; if (!items) return;
  const meshes = []; items.traverse(o => { if (o.isMesh) meshes.push(o); });
  const byMat = name => meshes.find(m => m.material.name === name);
  // 札（Cream paint）：表の面は x 0.343〜0.497、下 (y 0.961, z -2.049) から上 (y 1.063, z -2.071) へ、少しうしろに倒れている
  if (byMat('Cream paint')) {
    await document.fonts.load('900 120px "Zen Maru Gothic"', 'お会計').catch(() => {});
    const W = 0.15, H = 0.1, cv = document.createElement('canvas'); cv.width = 600; cv.height = 400;
    const c = cv.getContext('2d');
    c.fillStyle = '#f7f0dd'; c.fillRect(0, 0, 600, 400);
    c.strokeStyle = '#8a6a48'; c.lineWidth = 6; c.strokeRect(22, 22, 556, 356);
    c.fillStyle = '#4a3423'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = '900 150px "Zen Maru Gothic","Hiragino Maru Gothic ProN",sans-serif'; c.fillText('お会計', 300, 180);
    c.font = '600 44px "Fredoka","Zen Maru Gothic",sans-serif'; c.fillStyle = '#8a6a48'; c.fillText('CASHIER', 300, 300);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({map:t, roughness:0.85}));
    const tilt = Math.atan2(2.071 - 2.049, 1.063 - 0.961);
    face.rotation.x = -tilt; face.position.set(0.42, 1.012, -2.06 + 0.0016);
    face.receiveShadow = true; g.add(face);
  }
  // 紙袋（Kraft paper）：面ごとに貼れるように UV をつけ直して、クラフト紙の絵と凹凸をのせる。表は z -2.269、x 0.686〜0.954、y 0.956〜1.288
  const bag = byMat('Kraft paper');
  if (bag) {
    boxUV(bag, 3);
    const t = kraftTexture(aniso);
    bag.material = new THREE.MeshStandardMaterial({name:'Kraft paper', map:t, bumpMap:t, bumpScale:0.6, roughness:0.96, metalness:0, side:THREE.DoubleSide});
    const paw = byMat('Dark green print'); if (paw) paw.visible = false;
    if (logo) {
      const w = 0.2, h = w * logo.height / logo.width, lt = new THREE.Texture(logo);
      lt.colorSpace = THREE.SRGBColorSpace; lt.anisotropy = aniso; lt.needsUpdate = true;
      // 刷ったインクらしく、少しかすれて紙になじむように、つやを消して下地より少し沈める
      const ink = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({map:lt, transparent:true, alphaTest:0.3, roughness:0.9, bumpMap:t, bumpScale:0.6, color:0xe8e2d8, polygonOffset:true, polygonOffsetFactor:-2}));
      ink.position.set(0.82, 1.115, -2.269 + 0.0012); ink.receiveShadow = true; g.add(ink);
    }
  }
}

export async function buildTreeRoom(scene, room, renderer, sky){
  const model = room.model;
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  // 看板のロゴ・壁画・ポスターは、モデルと同時に読みはじめる（1つずつ待つと立ち上がりが遅くなる。2026-11-13）
  const signP = room.sign ? loadImage(room.sign).catch(() => null) : Promise.resolve(null);
  const texP = url => url ? new THREE.TextureLoader().loadAsync(url).catch(() => null) : Promise.resolve(null);
  const muralP = texP(room.mural), posterP = texP(room.poster);
  const [shell, roof] = await Promise.all([loadGLB(model.shell, {anisotropy:aniso}), model.roof ? loadGLB(model.roof, {anisotropy:aniso}) : null]);
  const g = new THREE.Group();
  g.add(shell.scene); if (roof) g.add(roof.scene);
  scene.add(g);
  for (const part of [shell, roof]) if (part) for (const node of Object.values(part.nodes)) {
    const cast = part === shell && CAST.test(node.name), receive = part === shell && RECEIVE.test(node.name);
    node.traverse(o => { if (o.isMesh) { o.castShadow = cast; o.receiveShadow = receive; } });
  }
  // 壁の上端をおおう苔（Moss_Rim）は、屋根を外した断面のときの飾り。屋根があるときは、入口の上に緑の帯として見えてしまうので隠す
  if (roof && shell.nodes.Moss_Rim) shell.nodes.Moss_Rim.visible = false;
  // 入口の看板：モデルの緑の看板（Sign_AnimalShop）をやめて、店内の札と同じ木の板に、ロゴを入れて掛ける
  if (room.sign && roof?.nodes.Sign_AnimalShop) {
    try {
      const logo = await signP; if (!logo) throw new Error('看板のロゴを読めません: ' + room.sign);
      const board = woodSign('', 2.5, 1.16, 0.07, {image:logo, radius:0.14});
      // お店の門構えらしく、幹から浮かせて、上を手前へ倒して（歩いてくる人のほうへ顔を向けて）掛ける。
      // 幹から出した2本の鉄の腕に、短い吊り金具で下げる
      const TILT = THREE.MathUtils.degToRad(11), HALF = 1.16 * 0.5 / 2;
      board.position.set(0, 3.3, 4.33); board.rotation.x = TILT;   // 板の下は幹から8cmほど、上は25cmほど離れる
      board.scale.setScalar(0.5);   // 元の看板の半分の大きさ（枝の外枠ごと）
      roof.nodes.Sign_AnimalShop.visible = false;
      board.add(branchFrame(2.5, 1.16, 0.07));
      g.add(board);
      const iron = new THREE.MeshStandardMaterial({color:0x2b2621, roughness:0.55, metalness:0.6});
      const topY = 3.3 + HALF * Math.cos(TILT), topZ = 4.33 + HALF * Math.sin(TILT) + 0.01, armY = topY + 0.07;
      for (const x of [-0.42, 0.42]) {
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, topZ - 3.98 + 0.03), iron);   // 幹に差しこんだ腕
        arm.position.set(x, armY, (3.98 + topZ) / 2); arm.castShadow = true; g.add(arm);
        const brace = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.022, 0.3), iron);   // 腕を下から支える斜めの棒
        brace.position.set(x, armY - 0.1, 4.12); brace.rotation.x = -0.75; brace.castShadow = true; g.add(brace);
        const plate = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.2, 0.02), iron);   // 幹に留める金具
        plate.position.set(x, armY - 0.07, 4.04); plate.rotation.x = -THREE.MathUtils.degToRad(9); g.add(plate);
        const hook = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 6, 14), iron);   // 腕の先から板を吊る輪
        hook.position.set(x, armY - 0.035, topZ - 0.005); hook.rotation.y = Math.PI / 2; g.add(hook);
      }
    } catch (e) { console.warn(e.message); }   // 読めないときは、元の看板のまま
  }
  // レジの後ろの壁画：緑の壁（North_GreenWall）の板いっぱいに、絵を1枚貼る。板の形に合わせて、絵の上下を少し切る
  if (room.mural) {
    const W = 3.2, H = 1.94, tex = await muralP;
    if (tex) {
      tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = aniso;
      const fit = (tex.image.width / tex.image.height) / (W / H);   // 1より小さければ、上下を切る
      if (fit < 1) { tex.repeat.y = fit; tex.offset.y = (1 - fit) / 2; } else { tex.repeat.x = 1 / fit; tex.offset.x = (1 - 1 / fit) / 2; }
      const pic = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({map:tex, roughness:.95}));
      pic.position.set(0, 1.92, -3.285); pic.receiveShadow = true;
      g.add(pic);
      const edge = new THREE.MeshStandardMaterial({color:0x5a3a20, roughness:.6});   // 細い木のふち
      for (const [w, h, x, y] of [[W + 0.08, 0.04, 0, H / 2 + 0.02], [W + 0.08, 0.04, 0, -H / 2 - 0.02], [0.04, H, W / 2 + 0.02, 0], [0.04, H, -W / 2 - 0.02, 0]]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.03), edge); bar.position.set(x, 1.92 + y, -3.28); g.add(bar);
      }
    }
  }
  for (const name of ['Round_Window_E', 'Round_Window_W']) if (shell.nodes[name]) ringUV(shell.nodes[name]);
  roughenWood(g, aniso);
  lanternGlow(g);
  // 壁面緑化の苔は、濃すぎるので明るめにする（地面や屋根の苔は、そのまま）
  const paleMoss = new Map(), weeds = weedTexture(aniso);
  for (const part of [shell]) for (const [name, node] of Object.entries(part.nodes)) if (/^GreenWall_/.test(name)) node.traverse(o => {
    if (!o.isMesh || o.material.name !== 'Moss') return;
    if (!paleMoss.has(o.material)) {   // 元の苔の絵は、斜めの筋が目立つので、草むらの絵に替える
      const m = o.material.clone(); m.map = weeds.map; m.bumpMap = weeds.bump; m.bumpScale = 2.2; m.roughness = 0.95; m.vertexColors = false; m.color.setRGB(1.0, 1.0, 0.97);   // モデルの頂点色（濃い緑）は使わず、絵の色（くすんだ緑）をそのまま出す
      paleMoss.set(o.material, m);
    }
    o.material = paleMoss.get(o.material);
    boxUV(o, 0.8);   // 元の貼り方は絵が斜めに引きのばされる（これが斜線の正体）ので、面の向きごとにまっすぐ貼り直す
  });
  // 東の棚（マグカップ・ステッカー）の後ろ：苔の壁は商品にめりこむので外して、平らな壁紙にする。売り場ごとに柄を変える
  if (shell.nodes.GreenWall_East) {
    shell.nodes.GreenWall_East.visible = false;
    const Y0 = 0.9, Y1 = 2.23, X = 4.186, H = Y1 - Y0;
    for (const [z0, z1, kind] of [[0.02, 1.53, 'leaf'], [-1.53, -0.02, 'forest']]) {
      const w = z1 - z0, paper = new THREE.Mesh(new THREE.PlaneGeometry(w, H), new THREE.MeshStandardMaterial({map:wallpaper(kind, w, H, aniso), roughness:.96}));
      paper.position.set(X, (Y0 + Y1) / 2, (z0 + z1) / 2); paper.rotation.y = -Math.PI / 2; paper.receiveShadow = true;
      g.add(paper);
    }
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.012, H, 0.04), new THREE.MeshStandardMaterial({color:0x8a5a34, roughness:.7}));   // 2枚のあいだの見切り
    strip.position.set(X - 0.004, (Y0 + Y1) / 2, 0); g.add(strip);
  }
  // ステッカーの横の板（Tote_Board）に貼るポスター。store.json の room.poster に画像を書くと出る。絵の縦横比のまま、板に収まる大きさで貼る
  if (room.poster && shell.nodes.Tote_Board) {
    const tex = await posterP;
    if (tex) {
      tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = aniso;
      const k = Math.min(0.62 / tex.image.width, 1.1 / tex.image.height), pw = tex.image.width * k, ph = tex.image.height * k, at = shell.nodes.Tote_Board.position;
      const poster = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), new THREE.MeshStandardMaterial({map:tex, roughness:.9}));
      poster.position.set(at.x - 0.033, at.y, at.z); poster.rotation.y = -Math.PI / 2; poster.receiveShadow = true;
      g.add(poster);
    }
  }
  // 店内の植物の葉：モデル側で、曲がりと折り目のある葉に作り替えてある。ここで、葉の形と葉脈の絵を貼って、ふちをなめらかに切り抜く
  const leafMats = new Map(), atlas = leafAtlas(aniso);
  g.traverse(o => {
    if (!o.isMesh || o.material.name !== 'Leaves' || !o.geometry.attributes.uv) return;
    if (!leafMats.has(o.material)) {
      const m = o.material.clone(); m.map = atlas; m.alphaTest = 0.42; m.side = THREE.DoubleSide; m.roughness = 0.62; m.color.setScalar(1.2);
      leafMats.set(o.material, m);
    }
    o.material = leafMats.get(o.material);
  });
  // MORINOA の後ろの壁：苔の壁をやめて、森の柄の北欧風の壁紙を貼る。この壁にかかっていた葉も外す
  if (shell.nodes.GreenWall_NW && shell.nodes.NW_MorinoaWall) {
    shell.nodes.GreenWall_NW.visible = false;
    const w = 1.64, h = 2.44, paper = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({map:wallpaper('grove', w, h, aniso), roughness:.96}));
    paper.position.set(0, 0.03 + h / 2, 0.004); paper.receiveShadow = true;
    shell.nodes.NW_MorinoaWall.add(paper);
    shell.scene.updateWorldMatrix(true, true);
    shell.nodes.GreenWall_Leaves?.traverse(o => {   // 葉は1つの部品なので、この壁の側（z < -2）の面だけ抜く
      if (!o.isMesh || !o.geometry.index) return;
      const pos = o.geometry.attributes.position, idx = o.geometry.index, keep = [], v = new THREE.Vector3();
      for (let i = 0; i < idx.count; i += 3) {
        let z = 0;
        for (let k = 0; k < 3; k++) z += v.fromBufferAttribute(pos, idx.getX(i + k)).applyMatrix4(o.matrixWorld).z / 3;
        if (z >= -2) keep.push(idx.getX(i), idx.getX(i + 1), idx.getX(i + 2));
      }
      o.geometry.setIndex(keep);
    });
  }
  // 西の壁（Tシャツの長いラックの後ろ）：苔の壁をやめて、実のなる木の柄の北欧風の壁紙を貼る。壁にかかっていた葉も外す
  if (shell.nodes.GreenWall_West) {
    shell.nodes.GreenWall_West.visible = false;
    if (shell.nodes.GreenWall_Leaves) shell.nodes.GreenWall_Leaves.visible = false;
    const Y0 = 0.78, Y1 = 2.93, w = 3.86, h = Y1 - Y0;
    const paper = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({map:wallpaper('orchard', w, h, aniso), roughness:.96}));
    paper.position.set(-3.99, (Y0 + Y1) / 2, 0); paper.rotation.y = Math.PI / 2; paper.receiveShadow = true;
    g.add(paper);
  }
  shell.nodes.Rug?.traverse(o => { if (o.isMesh && o.geometry.attributes.color) recolorRug(o); });   // まんなかのラグは、色だけ北欧風に
  // まんなかの台のたたんだTシャツは、2列とも少し奥へ寄せて、手前（右手前のプライスカードの場所）をあける。西のキャビネットの上は、入口側の端をあける
  shell.scene.updateMatrixWorld(true);
  shell.nodes.fx_Folded_Tees?.traverse(o => {
    if (!o.isMesh) return;
    const pos = o.geometry.attributes.position, m = o.matrixWorld, inv = m.clone().invert(), v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m);
      if (v.x < -3.3 && v.y > 0.7) {   // 西のキャビネット（Tシャツの棚）の上：並びを奥（-z）へ少し詰めて、入口側の端にオオカミの置物の場所をあける
        v.z = -1.84 + (v.z + 1.84) * 0.88;
        v.applyMatrix4(inv); pos.setXYZ(i, v.x, v.y, v.z); continue;
      }
      if (v.x < -0.8 || v.x > 0.8 || v.z < 0.38 || v.z > 1.22 || v.y < 0.78) continue;   // 西のキャビネットの上のぶんは動かさない
      v.z -= v.z > 0.8 ? 0.075 : 0.028;   // 手前の列 1.18 → 1.105、奥の列 0.43 → 0.40（台の奥のふちまで）
      v.applyMatrix4(inv); pos.setXYZ(i, v.x, v.y, v.z);
    }
    pos.needsUpdate = true; o.geometry.computeBoundingBox(); o.geometry.computeBoundingSphere();
  });
  // 壁面緑化の葉だけ、北欧風のくすんだ緑に寄せる（鉢植えや吊りの葉は、そのまま）
  shell.nodes.GreenWall_Leaves?.traverse(o => {
    if (!o.isMesh || !o.material.map) return;
    const m = o.material.clone(); m.color.setRGB(1.5, 1.32, 1.5); o.material = m;
  });
  cutInside(shell.scene, ['Roots_outer', 'Moss_Roots', 'Moss_Trunk']);   // 奥の壁から突き出る、外の根と苔を消す
  // 丸天井のてっぺんの穴（そこから上の樹皮が見えていた）を、木の円板でふさぐ
  const dome = roof?.nodes.Ceiling_Dome, domeMat = dome && (dome.isMesh ? dome : dome.children.find(o => o.isMesh))?.material;
  if (domeMat) {
    const cap = new THREE.Mesh(new THREE.CircleGeometry(0.5, 40), domeMat); cap.rotation.x = Math.PI / 2; cap.position.set(0, 4.775, 0); g.add(cap);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.03, 8, 48), new THREE.MeshStandardMaterial({color:0x6b4526, roughness:.7})); ring.rotation.x = Math.PI / 2; ring.position.copy(cap.position); g.add(ring);
  }
  // 動物の置物（レジ・台・いす・棚の上・外のベンチ）と、レジの札「お会計」と紙袋。たがいに関係しないので同時に
  await Promise.all([addFigurines(g, shell.scene), signP.then(logo => dressRegister(shell, g, logo, aniso))]);
  // 灯りの面は、まわりの光に負けないようにする
  g.traverse(o => { if (o.isMesh && /glow|shade/i.test(o.material.name)) o.material.toneMapped = false; });
  // 店の外の遠景（空・山・森）。筒より上に見える空は、遠景の空の上端と同じ色にする（main.js の背景と共有）
  const backdrop = buildBackdrop();
  g.add(backdrop.group);
  sky.set(backdrop.top);

  // ---------- 光 ----------
  const key = new THREE.DirectionalLight(0xfff0d8, 1.9);
  key.position.set(-3.5, 9, 6); key.target.position.set(0, 0, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, {left:-7, right:7, top:8, bottom:-6, near:0.5, far:26});
  key.shadow.radius = 5; key.shadow.blurSamples = 12;
  key.shadow.bias = -0.0005; key.shadow.normalBias = 0.02;
  const hemi = new THREE.HemisphereLight(0xfff3dc, 0x6f7f4a, 1.5);
  const warm = new THREE.PointLight(0xffd9a0, 5.5, 12, 1.5);
  warm.position.set(0, 2.9, 0.3);
  const back = new THREE.PointLight(0xffcf90, 2.4, 8, 1.6);
  back.position.set(0, 2.3, -1.6);
  const door = new THREE.PointLight(0xffc27a, 2.2, 9, 1.6);
  door.position.set(0, 2.2, 5.4);
  scene.add(key, key.target, hemi, warm, back, door);

  // ---------- 売り場の材質（ラック・棚板など、売り場の仕組みが描くもの） ----------
  const wood = new THREE.MeshStandardMaterial({map:woodTexture('#b07a45', [80, 48, 22]), roughness:.6});
  const darkWood = new THREE.MeshStandardMaterial({map:woodTexture('#6f4a2a', [44, 26, 12]), roughness:.6});
  const iron = new THREE.MeshStandardMaterial({color:0x26231f, roughness:.45, metalness:.7});

  // ---------- 売り場を置く場所 ----------
  const anchor = id => shell.nodes[id] && shell.nodes[id].children.length === 0 ? shell.nodes[id] : null;
  const e = new THREE.Euler();
  function frame(fx){
    const a = anchor(fx.id);
    if (a) { e.setFromQuaternion(a.quaternion, 'YXZ'); return {x:a.position.x, z:a.position.z, ry:e.y}; }
    const [x, z] = fx.floor || [0, 0];
    return {x, z, ry:THREE.MathUtils.degToRad(fx.turn || 0)};
  }
  // 目印に書いてある寸法を、売り場の設定に重ねる（store.json は書きかえない）
  function adapt(fx){
    const a = anchor(fx.id);
    if (!a) return fx;
    const u = a.userData, out = {...fx, wall:undefined};
    for (const k of ['width', 'height', 'tiers', 'depth']) if (typeof u[k] === 'number') out[k] = u[k];
    if (u.surface) out.surface = u.surface;   // 台の天板と脚はモデル側にある
    return out;
  }
  const view = (id, pos, look) => {
    const a = shell.nodes[id];
    return a ? {pos:a.position.clone(), look:new THREE.Vector3().fromArray(a.userData.look || look)} : {pos:new THREE.Vector3(...pos), look:new THREE.Vector3(...look)};
  };

  // solid：カメラが中に入ってはいけない物（main.js が、売り場から下がれる距離を調べるのに使う）
  // 出口：扉の開いているところに、見えない板を置く。店内でここを押すと、外へ出る（main.js）
  const exit = new THREE.Mesh(new THREE.PlaneGeometry(1.74, 2.6), new THREE.MeshBasicMaterial({visible:false, side:THREE.DoubleSide}));
  exit.position.set(0, 1.3, 3.9); g.add(exit);
  return {W:8.4, D:6.4, H:3.3, frame, adapt, exit, solid:shell.scene, lights:[key, hemi, warm, back, door], mats:{wood, darkWood, iron},
    outside:{pos:new THREE.Vector3(0, 1.7, 18.5), look:new THREE.Vector3(0, 3.0, 4)},
    overview:view('view-overview', [0, 1.55, 2.95], [0, 1.2, -3.3])};
}
