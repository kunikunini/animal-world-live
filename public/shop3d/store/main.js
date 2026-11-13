import * as THREE from 'three';
import {RoomEnvironment} from 'three/addons/RoomEnvironment.js';
import {buildRoom} from './room.js';
import {buildTreeRoom} from './room-tree.js';
import {Rack} from './rack.js';
import {Shelf} from './goods.js';
import {spring, clamp, makeLoader, loadSignFonts} from './util.js';
import {initEditor} from './editor.js';
import {connectShop} from './shop-link.js';
import {buildPriceCards} from './pricecards.js';
import {buildNav} from './walk.js';

// 3Dのグッズ売り場。商品と配置は store.json だけで決まる（このファイルに商品は書かない）。
const FIXTURE_TYPES = {rack:Rack, shelf:Shelf, table:Shelf};
const DRAFT_KEY = 'haw-store-draft-v1';

const $ = s => document.querySelector(s);
const app = $('#app'), stage = $('#stage'), canvas = $('#scene');
const mobile = matchMedia('(max-width:700px)');
const reduced = matchMedia('(prefers-reduced-motion:reduce)');
const params = new URLSearchParams(location.search);
// ANIMAL WORLD LIVE のワールドに立つお店から、演出をはさんで飛んできたとき（?awl）。
// 外観から始まり、親の合図（awl-shop-go）で扉をくぐって店内へ歩く。外へ出たら、お礼のあいさつのあとワールドへ戻る
// スマホでは、ワールドの上に重ねず、ページごとここへ移ってくる（?awl=nav。ワールドとお店の 3D を同時に持つと、メモリが足りずにページが落ちる）。出る時は /?shop でワールドのお店の前へ戻る
const AWL_NAV = params.get('awl') === 'nav' && window.parent === window;
// ページごとワールドへ戻る前に、この売り場の 3D（GPU のメモリ）を手放す。
// 手放さないと、スマホのブラウザが前のページを裏に残したまま、ワールドの組み立てでメモリが足りなくなってページが落ち、スタートに戻ってしまう（2026-11-13 実機）
let gone = false;
function freeGL(){
  if (gone) return; gone = true;
  try { bgm?.pause(); } catch { /* 音が無くても続ける */ }
  try { renderer.dispose(); renderer.forceContextLoss(); } catch { /* 手放せなくても、移動は続ける */ }
}
// スマホでページごと移ってきた時は、ワールドの BGM が途切れるので、ここでふれあいワールドの曲を小さく流す。
// ブラウザは最初の操作まで音を出させないので、最初にさわった時から鳴る。音量と消音は、アプリの設定（localStorage）に合わせる
let bgm = null;
function startBgm(){
  if (bgm || gone) return;
  let vol = 0.6, mute = false;
  try {
    const v = Number(localStorage.getItem('awl.vol.bgm') ?? 0.6); if (Number.isFinite(v)) vol = Math.min(1, Math.max(0, v));
    mute = localStorage.getItem('awl.mute.all') === '1' || localStorage.getItem('awl.mute.bgm') === '1';
  } catch { /* 設定が読めなければ、既定の音量 */ }
  if (mute || vol <= 0) return;
  bgm = new Audio('/audio/bgm-partner.mp3');
  bgm.loop = true; bgm.volume = vol * vol * 0.5;   // 店内なので、ワールドより控えめ
  bgm.play().catch(() => { bgm = null; });   // まだ鳴らせなければ、次の操作でもう一度
}
const curtain = document.getElementById('awl-curtain');   // ページごと行き来する時の暗い幕（ワールドの側の幕と同じ色）
const AWL = AWL_NAV || (params.has('awl') && window.parent !== window);
if (AWL) document.getElementById('app').classList.add('awl');
const EDIT = params.has('edit');

const renderer = new THREE.WebGLRenderer({canvas, antialias:true});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
// スマホ・タブレット（指で操作する端末）では、影をやめ、解像度を下げる（ANIMAL WORLD LIVE、2026-11-13：実機で、何を押しても反応しないほど重かった）
const LITE = matchMedia('(pointer:coarse)').matches;
renderer.shadowMap.enabled = !LITE;
renderer.shadowMap.type = THREE.VSMShadowMap;
renderer.setPixelRatio(Math.min(devicePixelRatio, LITE ? 1.25 : 2));

const scene = new THREE.Scene();
const SKY = new THREE.Color(0xd9e6df);
scene.background = SKY;
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;
const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 60);
const loadTex = makeLoader(renderer);

let data, room, ctx, fixtures = [], warnings = [];
let mode = 'outside', current = -1, active = -1, ready = false, dirty = true;
let shop = null;   // 本番ショップとのつなぎ（読み込みが済むまで null）

// 売り場の商品を、ショップの内容で見る。名前・価格・サイズはショップ（管理画面の「ショップ」）が正。
//   state：'ok' 買える／'soon' ショップで準備中／'unlisted' ショップに未登録／'offline' ショップにつながっていない／'loading' 読み込み中
function view(p){
  const s = shop && shop.linked ? shop.product(p.id) : null;
  const state = !shop ? 'loading' : !shop.linked ? 'offline' : !s ? 'unlisted' : s.soon || !(Number(s.price) > 0) ? 'soon' : 'ok';
  // ショップに未登録の商品は、store.json の price を「仮の価格」として見せるだけ（買えない）
  if (!s) return {state, name:p.name, sub:p.sub || '', desc:p.desc || '', note:'', price:null, tentative:typeof p.price === 'number' ? p.price : null, options:p.options || [], optionLabel:p.optionLabel || ''};
  return {state, name:s.name || p.name, sub:s.sub || '', desc:s.desc || p.desc || '', note:s.note || '', price:Number(s.price) || null,
    options:(s.options || []).filter(Boolean), optionLabel:s.optionLabel || ''};
}

// ---------- データ ----------
function normalize(d){
  for (const p of d.products) p.display = [].concat(p.display || []);
  return d;
}
function placementsOf(fx){
  const Type = FIXTURE_TYPES[fx.type], out = [];
  for (const product of data.products) {
    if (product.visible === false) continue;
    for (const display of product.display) {
      if (display.fixture !== fx.id || display.off) continue;
      if (!Type.kinds.includes(display.kind)) { warnings.push(`「${product.name}」は「${fx.label}」には並べられません`); continue; }
      out.push({product, display});
    }
  }
  return out.sort((a, b) => (a.display.order || 0) - (b.display.order || 0));
}

async function buildFixtures(){
  const keep = fixtures[current]?.id;
  for (const f of fixtures) {
    scene.remove(f.group);
    f.group.traverse(o => { if (o.geometry && o.geometry.type === 'PlaneGeometry' && o.geometry.parameters.widthSegments > 1) o.geometry.dispose(); });
  }
  warnings = []; nav = null;   // 売り場が変わったら、歩ける場所の地図も作り直す
  const next = [];
  for (const fx0 of data.fixtures) {
    const fx = room.adapt ? room.adapt(fx0) : fx0;   // 大樹の店では、場所と寸法をモデルの目印から取る
    const Type = FIXTURE_TYPES[fx.type];
    if (!Type) { warnings.push(`売り場の種類「${fx.type}」は使えません`); continue; }
    const f = new Type(ctx, fx, placementsOf(fx));
    const at = room.frame(fx);
    f.group.position.set(at.x, 0, at.z); f.group.rotation.y = at.ry;
    scene.add(f.group);
    next.push(f);
  }
  const known = new Set(data.fixtures.map(f => f.id));
  for (const p of data.products) for (const d of p.display) if (!known.has(d.fixture)) warnings.push(`「${p.name}」の売り場「${d.fixture}」がありません`);
  await Promise.all(next.map(f => f.build()));
  for (const f of next) warnings.push(...(f.warnings || []));
  fixtures = next;
  scene.updateMatrixWorld(true);
  if (mode === 'fixture') {
    current = fixtures.findIndex(f => f.id === keep);
    if (current < 0) mode = 'overview';
    active = current >= 0 && mobile.matches && fixtures[current].type === 'rack' && fixtures[current].items.length ? 0 : -1;
  }
  buildChips();
  const note = $('#notice');
  note.hidden = !warnings.length || EDIT; note.textContent = warnings[0] || '';
  if (warnings.length) console.warn('売り場の注意:\n' + warnings.join('\n'));
  refresh();
  dirty = true;
}

// ---------- カメラ ----------
const cam = {cur:new Float64Array(7), vel:new Float64Array(7), goal:new Float64Array(7), snap:true};
const look = {yaw:0, pitch:0, gy:0, gp:0, vy:0, vp:0, zoom:1, gz:1, vz:0};   // zoom：拡大の倍率（1 がふつう。大きいほど寄る）
const UP = new THREE.Vector3(0, 1, 0), tmpQ = new THREE.Quaternion();

// 売り場から後ろへ下がるとき、家具や壁の中に入らないよう、最初にぶつかる物の手前までの距離を返す。
// （大樹の店は、部屋が四角でなく、反対側に棚や引き出しがある。箱の寸法だけで決めると、棚の中から見ることになる）
// 同じ売り場・同じ向きなら答えは変わらないので、覚えておく（モデルが大きく、毎回調べると重い）
const blockRay = new THREE.Raycaster(), blockMemo = new Map();
function clearance(center, dir){
  if (!room.solid) return Infinity;
  const key = [center.x, center.y, center.z, dir.x, dir.y, dir.z].map(n => n.toFixed(2)).join(',');
  if (!blockMemo.has(key)) {
    const START = 0.8, KEEP = 0.45;   // 売り場のすぐ前（ラックや棚板そのもの）は数えない／物の手前に残す余白
    blockRay.set(center.clone().addScaledVector(dir, START), dir);
    blockRay.far = 30;
    const hit = blockRay.intersectObject(room.solid, true).find(h => h.object.visible && !/glass/i.test(h.object.material?.name || ''));
    blockMemo.set(key, hit ? Math.max(START, START + hit.distance - KEEP) : Infinity);
  }
  return blockMemo.get(key);
}
// ほかの売り場（部屋のまんなかに吊るしたラックなど）が、見たい売り場の手前に写り込まないよう、その手前までの距離を返す。
// 見たい幅（halfW）の通り道に入っていて、目の高さより上まである売り場だけを数える（低い台は、上から見こせるので数えない）
const fxBox = new THREE.Box3(), fxPoint = new THREE.Vector3();
function fixtureClearance(self, center, dir, halfW){
  let limit = Infinity;
  const ax = Math.hypot(dir.x, dir.z) || 1, dx = dir.x / ax, dz = dir.z / ax;   // 水平の向き
  for (const other of fixtures) {
    if (other === self || !other.volume) continue;
    fxBox.setFromObject(other.volume);
    if (fxBox.max.y < center.y) continue;
    let aMin = Infinity, aMax = -Infinity, lMin = Infinity, lMax = -Infinity;
    for (const x of [fxBox.min.x, fxBox.max.x]) for (const z of [fxBox.min.z, fxBox.max.z]) {
      fxPoint.set(x - center.x, 0, z - center.z);
      const along = fxPoint.x * dx + fxPoint.z * dz, lat = fxPoint.x * dz - fxPoint.z * dx;
      aMin = Math.min(aMin, along); aMax = Math.max(aMax, along); lMin = Math.min(lMin, lat); lMax = Math.max(lMax, lat);
    }
    if (lMax < -halfW || lMin > halfW || aMin < 0.6) continue;   // 通り道の外、または横・後ろにある（となりの売り場は、手前をふさがない）
    limit = Math.min(limit, aMin - 0.3);
  }
  return limit;
}
function goalView(){
  const aspect = camera.aspect, tall = aspect < 0.85;
  if (walker.on) return {pos:walker.view, look:walker.view.clone().add(new THREE.Vector3(Math.sin(walker.yaw) * Math.cos(walker.pitch), Math.sin(walker.pitch), Math.cos(walker.yaw) * Math.cos(walker.pitch))), fov:walker.fov};
  if (mode === 'outside') return {pos:room.outside.pos, look:room.outside.look, fov:tall ? 62 : 42};
  if (mode === 'overview' || !fixtures[current]) return {pos:room.overview.pos, look:room.overview.look, fov:tall ? 78 : 68};
  const f = fixtures[current], v = f.view(mobile.matches, active);
  const center = f.group.localToWorld(v.center.clone());
  const dir = new THREE.Vector3(0, v.up, 1).normalize().applyQuaternion(f.group.getWorldQuaternion(tmpQ));
  let fov = mobile.matches ? Math.max(v.fov, 38) : v.fov;
  const need = k => Math.max(v.halfH, v.halfW / aspect) / Math.tan(THREE.MathUtils.degToRad(k / 2));
  // 部屋の中に収まる距離まで。足りなければ画角を広げる
  let max = Infinity;
  const lim = (c, d, lo, hi) => { if (Math.abs(d) > 1e-6) max = Math.min(max, ((d > 0 ? hi : lo) - c) / d); };
  lim(center.x, dir.x, -room.W / 2 + 0.3, room.W / 2 - 0.3);
  lim(center.z, dir.z, -room.D / 2 + 0.3, room.D / 2 - 0.3);
  lim(center.y, dir.y, 0.3, room.H - 0.35);
  max = Math.min(max, clearance(center, dir), fixtureClearance(f, center, dir, v.halfW));
  let dist = need(fov);
  if (dist > max) { dist = max; fov = Math.min(80, 2 * THREE.MathUtils.radToDeg(Math.atan(Math.max(v.halfH, v.halfW / aspect) / dist))); }
  return {pos:center.clone().addScaledVector(dir, dist), look:center, fov};
}
// 見回せる範囲（左右・上下、ラジアン）。店内を見渡すときは、ぐるっと一周できる。売り場の前でも、となりの売り場や天井・足もとまで見られる
function lookLimit(){ return walker.on ? [Infinity, 0.95] : mode === 'outside' ? [0.12, 0.06] : mode === 'overview' ? [Infinity, 0.95] : [Infinity, 0.8]; }   // 売り場の前でも、左右はぐるりと見回せる
// 拡大できる範囲（倍率）。店内では、大きく引いたり、商品の細部まで寄ったりできる
function zoomLimit(){ return mode === 'outside' && !walker.on ? [0.85, 1.8] : [0.55, 5]; }

function stepCamera(dt){
  let walking = walker.on && stepWalker(dt);
  const g = goalView();
  cam.goal.set([g.pos.x, g.pos.y, g.pos.z, g.look.x, g.look.y, g.look.z, g.fov]);
  let moving = false;
  const omega = mode === 'outside' ? 2.6 : 3.6;
  for (let i = 0; i < 7; i++) {
    if (cam.snap || reduced.matches || walker.on) { cam.cur[i] = cam.goal[i]; cam.vel[i] = 0; }   // 歩いているあいだは、歩く動きそのものがなめらか
    else [cam.cur[i], cam.vel[i]] = spring(cam.cur[i], cam.vel[i], cam.goal[i], dt, omega);
    if (Math.abs(cam.cur[i] - cam.goal[i]) > 1e-4 || Math.abs(cam.vel[i]) > 1e-4) moving = true;
  }
  cam.snap = false;
  if (walking) moving = true;
  const [ly, lp] = lookLimit();
  look.gy = clamp(look.gy, -ly, ly); look.gp = clamp(look.gp, -lp, lp);
  if (reduced.matches) { look.yaw = look.gy; look.pitch = look.gp; }
  else {
    [look.yaw, look.vy] = spring(look.yaw, look.vy, look.gy, dt, 14);
    [look.pitch, look.vp] = spring(look.pitch, look.vp, look.gp, dt, 14);
  }
  const [z0, z1] = zoomLimit();
  look.gz = clamp(look.gz, z0, z1);
  if (reduced.matches) look.zoom = look.gz; else [look.zoom, look.vz] = spring(look.zoom, look.vz, look.gz, dt, 14);
  if (Math.abs(look.yaw - look.gy) > 1e-4 || Math.abs(look.pitch - look.gp) > 1e-4 || Math.abs(look.zoom - look.gz) > 1e-4) moving = true;

  const c = cam.cur;
  camera.position.set(c[0], c[1], c[2]);
  const d = new THREE.Vector3(c[3] - c[0], c[4] - c[1], c[5] - c[2]).normalize();
  const yaw = Math.atan2(d.x, d.z) + look.yaw, pitch = clamp(Math.asin(d.y) + look.pitch, -1.2, 1.2);
  camera.lookAt(c[0] + Math.sin(yaw) * Math.cos(pitch), c[1] + Math.sin(pitch), c[2] + Math.cos(yaw) * Math.cos(pitch));
  // 拡大は、画角をせばめて行う（カメラは動かさないので、壁や棚にめりこまない）
  const fov = clamp(2 * THREE.MathUtils.radToDeg(Math.atan(Math.tan(THREE.MathUtils.degToRad(c[6] / 2)) / look.zoom)), 8, 104);
  if (Math.abs(camera.fov - fov) > 1e-3) { camera.fov = fov; camera.updateProjectionMatrix(); }
  return moving;
}

let last = 0;
function advance(dt){
  let moving = false;
  if (ready) fixtures.forEach((f, i) => { if (f.update(dt, mode === 'fixture' && i === current ? active : -1, reduced.matches, mode !== 'fixture', camera)) moving = true; });
  if (room && stepCamera(dt)) moving = true;
  if (moving || dirty) { renderer.render(scene, camera); dirty = false; }
  if (ready && room) showPayHere();
  return moving;
}
// レジの前（台の手前、まんなかの台より奥）まで来たら「お会計にすすむ」を出す
const REGISTER = {x0:-1.3, x1:1.3, z0:-2.0, z1:-0.2};
let payShown = false, payMsgTimer = 0;
function showPayHere(){
  const p = camera.position;
  const near = mode !== 'outside' && !$('#detail').open && !$('#cart').open && p.x > REGISTER.x0 && p.x < REGISTER.x1 && p.z > REGISTER.z0 && p.z < REGISTER.z1;
  if (near === payShown) return;
  payShown = near; $('#pay-here').hidden = !near || !(shop && shop.linked);   // お会計のない場所（ANIMAL WORLD LIVE）では出さない
  if (!near) { $('#pay-msg').hidden = true; clearTimeout(payMsgTimer); }
}
function frame(time){
  if (gone) return;   // 3D を手放したあとは描かない
  advance(last ? Math.min(0.05, (time - last) / 1000) : 0); last = time;
  requestAnimationFrame(frame);
}

function resize(){
  const r = stage.getBoundingClientRect();
  if (!r.width || !r.height) return;
  renderer.setSize(r.width, r.height, false);
  camera.aspect = r.width / r.height; camera.updateProjectionMatrix();
  dirty = true;
}
new ResizeObserver(resize).observe(stage);

// ---------- 画面の表示 ----------
function buildChips(){
  const nav = $('#places'); nav.replaceChildren();
  const add = (text, fn) => { const b = document.createElement('button'); b.textContent = text; b.addEventListener('click', fn); nav.append(b); return b; };
  add('店内を見渡す', () => goOverview()).dataset.place = 'overview';
  fixtures.forEach((f, i) => { add(f.label, () => walkToFixture(i)).dataset.place = String(i); });   // 売り場のボタンでも、歩いて行く
}
// プライスカードに書く価格：売り場の商品の価格をまとめる（ショップで買えるものは税込の価格、未登録のものは予定の価格）
let paintCards = null;
let goingBack = false;   // ワールドへ戻る合図を出したか（?awl）
let visited = false, thanked = false;   // お店に入ったか／お礼のあいさつに替えたか
function cardText(f){
  const vs = f.items.map(it => view(it.product)), ok = vs.filter(v => v.state === 'ok'), plan = vs.filter(v => v.state !== 'ok' && v.tentative);
  const nums = [...ok.map(v => v.price), ...plan.map(v => v.tentative)];
  if (!nums.length) return {price:'準備中', note:''};
  const lo = Math.min(...nums), hi = Math.max(...nums), yen = n => n.toLocaleString('ja-JP');
  const price = lo === hi ? `${yen(lo)}円` : `${yen(lo)}〜${yen(hi)}円`;
  return {price, note:!ok.length ? '予定の価格・準備中' : plan.length ? '税込・一部は準備中' : '税込'};
}
function refresh(){
  if (paintCards) { paintCards(cardText); dirty = true; }
  app.dataset.mode = mode;
  const inside = mode !== 'outside';
  // 一度お店に入ったあと外へ出たら、外のあいさつを「ようこそ」から、お礼に替える（外へ出るたびに、また現れる）
  if (inside) visited = true;
  else if (visited && !thanked) {
    thanked = true;
    $('#greeting').classList.add('thanks');
    $('#greeting').replaceChildren(...['ありがとうございました！', 'またきてね！'].map(t => { const line = document.createElement('span'); line.append(Object.assign(document.createElement('span'), {textContent:t})); return line; }));   // 行ごとに、外の枠（マスク）と中の文字
  }
  if (AWL && !inside && visited && !goingBack) { goingBack = true; setTimeout(() => { if (!AWL_NAV) return tellParent('awl-shop-close'); curtain?.classList.remove('is-out'); setTimeout(() => { freeGL(); location.assign('/?shop'); }, 480); }, 1700); }   // ページごと戻る時は、暗い幕を閉じてから   // お礼を見せてから、ワールドへ
  $('#hud').hidden = !inside; $('#leave').hidden = !inside;
  $('#enter').tabIndex = inside ? -1 : 0;
  for (const b of $('#places').children) b.setAttribute('aria-pressed', String(b.dataset.place === (mode === 'fixture' ? String(current) : 'overview')));
  const f = mode === 'fixture' ? fixtures[current] : null, it = f && active >= 0 ? f.items[active] : null;
  const n = f ? f.items.length : 0;
  if (it) {
    $('#h-kind').textContent = `${String(active + 1).padStart(2, '0')} / ${String(n).padStart(2, '0')}`;
    const v = view(it.product);
    $('#h-name').textContent = v.name;
    $('#h-sub').textContent = (v.state === 'ok' ? `${v.price.toLocaleString('ja-JP')}円（税込）` : v.tentative ? `準備中・予定 ${v.tentative.toLocaleString('ja-JP')}円` : '準備中') + (v.sub ? '・' + v.sub : '');
  } else if (f) {
    $('#h-kind').textContent = f.label;
    $('#h-name').textContent = n ? `${f.label}の売り場` : `${f.label}（準備中）`;
    $('#h-sub').textContent = !n ? 'まだ商品が並んでいません' : mobile.matches ? 'タップで手前に、もう一度タップで詳しく' : '気になる商品にカーソルを合わせて、クリックで詳しく';
  } else {
    $('#h-kind').textContent = '店内';
    $('#h-name').textContent = '見たい売り場を選んでください';
    $('#h-sub').textContent = mobile.matches ? 'タップでそこまで歩く・上へなでると前へ・横へなでると見回す' : '床や売り場をクリックすると、そこまで歩きます。スクロールで前へ・うしろへ、ドラッグで見回せます';
  }
  $('#h-prev').disabled = !f || !n || active <= 0;
  $('#h-next').disabled = !f || !n || active >= n - 1;
  $('#h-inspect').disabled = !it;
  const link = $('#cart-link'), inCart = shop && shop.linked ? shop.count() : 0;
  link.hidden = !(shop && shop.linked);
  link.querySelector('b').textContent = String(inCart);
  link.setAttribute('aria-label', `カートを開く（${inCart}点）`);
  resize();
}

// ---------- 歩いて移動 ----------
// 床を押すと、その場所まで目の高さのまま歩く。台や棚はよけて、手前で止まる。売り場・扉へも歩いて行く。
// 歩いているあいだと、歩いて着いた所で立ち止まっているあいだは、カメラを walker が動かす（walker.on）。
// 売り場に着いたら goFixture、「店内を見渡す」なら goOverview で、いつもの見え方（ばねの動き）に戻す。
const EYE = 1.55, SPEED = 1.45, ACCEL = 2.6, DOOR_Z = 4.45;   // 目の高さ／歩く速さ（m/秒）／加速／これより外は「外」
let nav = null;
const walker = {on:false, pos:new THREE.Vector3(), view:new THREE.Vector3(), base:0, yaw:0, pitch:0, fov:68,
  path:null, seg:1, speed:0, bob:0, face:null, done:null, goalYaw:null, goalPitch:null, steady:false};   // steady：スクロールで歩いている（向きを変えない）
function navMap(){
  if (!nav && room && room.solid && ready) nav = buildNav(THREE, room.solid, fixtures.filter(f => f.volume).map(f => new THREE.Box3().setFromObject(f.volume)));
  return nav;
}
const angleTo = (from, to) => { let d = (to - from) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return d; };
// 歩き出す：いまのカメラの位置・向きから、そのまま歩きはじめる（見回した向きも引きつぐ）
function takeOver(){
  if (!walker.on) {
    const c = cam.cur, d = new THREE.Vector3(c[3] - c[0], c[4] - c[1], c[5] - c[2]).normalize();
    walker.pos.set(c[0], c[1], c[2]); walker.base = c[1];
    walker.yaw = Math.atan2(d.x, d.z); walker.pitch = Math.asin(clamp(d.y, -1, 1));
    walker.fov = camera.fov; walker.speed = 0;
  }
  walker.yaw += look.yaw; walker.pitch = clamp(walker.pitch + look.pitch, -1.2, 1.2);
  look.yaw = look.gy = look.vy = 0; look.pitch = look.gp = look.vp = 0; look.zoom = look.gz = 1; look.vz = 0;
}
function enterArea(){
  const area = walker.pos.z > DOOR_Z ? 'outside' : 'overview';
  if (mode !== area || current >= 0) { mode = area; current = -1; active = -1; }
  refresh(); dirty = true;
}
function walkTo(x, z, {face = null, done = null} = {}){
  const n = navMap(); if (!n) return false;
  takeOver();
  const p = n.path(walker.pos.x, walker.pos.z, x, z);
  if (!p) return false;
  clearTimeout(intentTimer);
  let len = 0; for (let i = 1; i < p.points.length; i++) len += Math.hypot(p.points[i].x - p.points[i - 1].x, p.points[i].z - p.points[i - 1].z);
  walker.top = Math.min(2.8, SPEED + len * 0.08);   // 遠くへ行くときは、少し早足
  walker.on = true; walker.path = p.points; walker.seg = 1; walker.face = face; walker.done = done; walker.steady = false;
  if (reduced.matches) { const e = p.points[p.points.length - 1]; walker.pos.x = e.x; walker.pos.z = e.z; walker.seg = p.points.length; }
  enterArea();
  return true;
}
// スクロール：向いている方向へ、前へ（またはうしろへ）歩く。向きは変えない。台や棚・壁の手前で止まる
function walkBy(d){
  const n = navMap(); if (!n) return;
  clearTimeout(intentTimer);
  takeOver();
  const pos = walker.pos, dx = Math.sin(walker.yaw), dz = Math.cos(walker.yaw);
  // 続けて回したときは、いま向かっている先に足す
  let s = d;
  if (walker.path && walker.steady) { const e = walker.path[walker.path.length - 1]; s += (e.x - pos.x) * dx + (e.z - pos.z) * dz; }
  s = clamp(s, -4, 4);
  const dir = Math.sign(s); let ok = 0, wasFree = n.freeAt(pos.x, pos.z);
  for (let t = 0.05; t <= Math.abs(s) + 1e-6; t += 0.05) {   // 歩ける所だけ進む（いまの場所が台のそばでも、離れる向きには動ける）
    const free = n.freeAt(pos.x + dx * dir * t, pos.z + dz * dir * t);
    if (free) { ok = t; wasFree = true; } else if (wasFree || t > 1) break;
  }
  const len = Math.min(ok, Math.abs(s));
  walker.on = true; walker.face = null; walker.done = null; walker.steady = true; walker.top = SPEED * 1.2;
  walker.path = [{x:pos.x, z:pos.z}, {x:pos.x + dx * dir * len, z:pos.z + dz * dir * len}]; walker.seg = 1;
  if (reduced.matches) { pos.x = walker.path[1].x; pos.z = walker.path[1].z; walker.seg = 2; }
  enterArea();
}
function stepWalker(dt){
  const P = walker.path, pos = walker.pos;
  let moving = false;
  if (P) {
    let rem = 0, px = pos.x, pz = pos.z;
    for (let i = walker.seg; i < P.length; i++) { rem += Math.hypot(P[i].x - px, P[i].z - pz); px = P[i].x; pz = P[i].z; }
    walker.speed = Math.min(walker.top, walker.speed + ACCEL * dt, Math.sqrt(2 * ACCEL * rem) + 0.08);
    let step = walker.speed * dt;
    while (step > 0 && walker.seg < P.length) {
      const t = P[walker.seg], dx = t.x - pos.x, dz = t.z - pos.z, d = Math.hypot(dx, dz);
      if (d <= step) { pos.x = t.x; pos.z = t.z; step -= d; walker.seg++; }
      else { pos.x += dx / d * step; pos.z += dz / d * step; step = 0; }
    }
    walker.bob += walker.speed * dt;
    moving = true;
    // 進む先（少し先の道）を向く。着く手前からは、見たい物のほうへ向きを変える
    let ahead = null, need = 0.9; px = pos.x; pz = pos.z;
    for (let i = walker.seg; i < P.length && need > 0; i++) {
      const d = Math.hypot(P[i].x - px, P[i].z - pz);
      if (d >= need) { ahead = {x:px + (P[i].x - px) * need / d, z:pz + (P[i].z - pz) * need / d}; need = 0; }
      else { need -= d; px = P[i].x; pz = P[i].z; ahead = P[i]; }
    }
    walker.goalYaw = walker.steady ? walker.yaw : walker.face && rem < 0.8 ? Math.atan2(walker.face.x - pos.x, walker.face.z - pos.z)
      : ahead && Math.hypot(ahead.x - pos.x, ahead.z - pos.z) > 0.05 ? Math.atan2(ahead.x - pos.x, ahead.z - pos.z) : walker.yaw;
    walker.goalPitch = walker.steady ? walker.pitch : walker.face && rem < 0.8 ? null : -0.04;
    if (walker.seg >= P.length) {
      walker.path = null; walker.speed = 0; walker.steady = false;
      if (walker.face) walker.goalYaw = Math.atan2(walker.face.x - pos.x, walker.face.z - pos.z);
    }
    const area = pos.z > DOOR_Z ? 'outside' : 'overview';
    if (mode !== area) { mode = area; refresh(); }
  }
  // 目の高さ（床の高さ＋EYE）へ。歩いているあいだは、少しだけ上下にゆれる
  const ground = nav ? nav.groundAt(pos.x, pos.z) : 0;
  const k = reduced.matches ? 1 : 1 - Math.exp(-6 * dt);
  walker.base += (ground + EYE - walker.base) * k;
  const sway = reduced.matches ? 0 : Math.sin(walker.bob * Math.PI * 2 / 1.3) * 0.014 * Math.min(1, walker.speed / SPEED);   // 1歩およそ65cm
  pos.y = walker.base;
  walker.view.set(pos.x, walker.base + sway, pos.z);
  const fovGoal = camera.aspect < 0.85 ? 74 : 64;
  if (walker.face && walker.goalPitch === null) {
    walker.goalPitch = Math.atan2(walker.face.y - walker.base, Math.max(0.3, Math.hypot(walker.face.x - pos.x, walker.face.z - pos.z)));
  }
  const ty = walker.goalYaw ?? walker.yaw, tp = walker.goalPitch ?? walker.pitch;
  const r = reduced.matches ? 1 : 1 - Math.exp(-5 * dt);
  const dy = angleTo(walker.yaw, ty);
  walker.yaw += dy * r; walker.pitch += (tp - walker.pitch) * r; walker.fov += (fovGoal - walker.fov) * (reduced.matches ? 1 : 1 - Math.exp(-3 * dt));
  if (Math.abs(dy) > 1e-3 || Math.abs(tp - walker.pitch) > 1e-3 || Math.abs(ground + EYE - walker.base) > 1e-3 || Math.abs(fovGoal - walker.fov) > 0.01) moving = true;
  // 着いたら、売り場などの見え方へ引きつぐ（向きを変えきるのを待つ）
  if (!walker.path && walker.done && (Math.abs(dy) < 0.08 || reduced.matches)) { const fn = walker.done; walker.done = null; fn(); }
  if (!walker.path && !walker.done && !moving) { walker.goalYaw = walker.goalPitch = null; walker.face = null; }   // 向きを変えきったら、あとは見回しにまかせる
  return moving;
}
function stopWalking(){ walker.on = false; walker.path = null; walker.done = null; walker.face = null; walker.goalYaw = walker.goalPitch = null; }
// 売り場の前まで歩いて、着いたら売り場の見え方にする
function walkToFixture(i){
  const f = fixtures[i]; if (!f) return;
  const saved = [mode, current, active], wasOn = walker.on;
  walker.on = false; mode = 'fixture'; current = i; active = -1;
  const g = goalView();
  walker.on = wasOn; [mode, current, active] = saved;
  if (!walkTo(g.pos.x, g.pos.z, {face:g.look.clone(), done:() => goFixture(i)})) goFixture(i);
}
const SHOP_DOOR_IN = {x:0, z:2.9}, SHOP_DOOR_OUT = {x:0, z:7.2};
function walkIn(){ if (!walkTo(SHOP_DOOR_IN.x, SHOP_DOOR_IN.z, {face:new THREE.Vector3(0, 1.2, -3.3), done:() => goOverview()})) { enter(); } }
function walkOut(){ if (!walkTo(SHOP_DOOR_OUT.x, SHOP_DOOR_OUT.z, {face:new THREE.Vector3(0, 1.4, 14)})) leave(); }
// 押した所の床（または台・棚・壁）。歩ける地図の上で、目線の先をたどって探す
function floorHit(e){
  const n = navMap(); if (!n) return null;
  const r = canvas.getBoundingClientRect();
  ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  return n.march(ray.ray.origin, ray.ray.direction);
}
// 外から、お店（大樹の幹・屋根・扉）を押したか
function aimsAtShop(e, hit){
  if (hit) return hit.thing ? Math.hypot(hit.x, hit.z) < 7.4 : Math.hypot(hit.x, hit.z) < 4.6;
  const o = ray.ray.origin, d = ray.ray.direction, h = Math.hypot(d.x, d.z) || 1;   // 空へ向いた線：幹の軸のそばを通るなら、屋根を押した
  return d.y > 0 && Math.abs(o.x * d.z - o.z * d.x) / h < 6 && (o.x * d.x + o.z * d.z) < 0;
}

// ---------- 移動と選択 ----------
let intentTimer;
function resetLook(){
  const turns = Math.round(look.yaw / (2 * Math.PI)) * 2 * Math.PI;   // 何周も回したあとでも、近いほうへ戻る
  look.yaw -= turns; look.gy = look.gp = 0; look.gz = 1;
}
function enter(){ if (mode !== 'outside') return; stopWalking(); mode = 'overview'; current = -1; active = -1; resetLook(); refresh(); dirty = true; }
function leave(){ stopWalking(); mode = 'outside'; current = -1; active = -1; resetLook(); refresh(); dirty = true; }
function goOverview(){ clearTimeout(intentTimer); stopWalking(); mode = 'overview'; active = -1; resetLook(); refresh(); dirty = true; }
function goFixture(i){
  if (!fixtures[i]) return;
  clearTimeout(intentTimer); stopWalking();
  mode = 'fixture'; current = i; resetLook();
  active = mobile.matches && fixtures[i].type === 'rack' && fixtures[i].items.length ? 0 : -1;
  refresh(); dirty = true;
}
function setActive(i){
  clearTimeout(intentTimer);
  if (i === active) return;
  active = i; refresh(); dirty = true;
}
function intend(i){ // ラックは素通りで回らないよう少し待つ
  if (i === active) { clearTimeout(intentTimer); return; }
  if (fixtures[current]?.type !== 'rack') { setActive(i); return; }
  clearTimeout(intentTimer);
  intentTimer = setTimeout(() => setActive(i), i < 0 ? 120 : 70);
}
function browse(step){
  const f = fixtures[current]; if (mode !== 'fixture' || !f || !f.items.length) return;
  setActive(clamp(active + step, 0, f.items.length - 1));
}

const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function pick(e, objects){
  const r = canvas.getBoundingClientRect();
  ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  return ray.intersectObjects(objects, false)[0]?.object;
}
const pickItem = e => (mode === 'fixture' && fixtures[current] ? pick(e, fixtures[current].hitTargets)?.userData.item : null);
const pickExit = e => !!room.exit && !!pick(e, [room.exit]);
const pickFixture = e => { const f = pick(e, fixtures.map(x => x.volume))?.userData.fixture; return f ? fixtures.indexOf(f) : -1; };

let press = null;
// マウス：ドラッグで見回す、ホイールで前へ・うしろへ歩く。
// タッチ（3Dの動物紹介ページと同じ）：1本指で上へなでると前へ、下へなでると後ろへ歩く。2本指で動かすと見回し、広げる・つまむと拡大・縮小
const fingers = new Map(); let pinch = null;
const SWIPE_M = 0.012;   // 指1pxあたりに進む距離（100pxなでて1.2m）
const spread = () => { const [a, b] = [...fingers.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
const centre = () => { const [a, b] = [...fingers.values()]; return {x:(a.x + b.x) / 2, y:(a.y + b.y) / 2}; };
stage.addEventListener('pointerdown', e => {
  if (e.target.closest('button,a') || $('#detail').open || $('#cart').open) return;
  if (e.pointerType === 'touch') {
    fingers.set(e.pointerId, {x:e.clientX, y:e.clientY});
    if (fingers.size === 2) { pinch = {d:Math.max(spread(), 1), zoom:look.gz, at:centre(), yaw:look.gy, pitch:look.gp}; if (press) press.moved = true; return; }
    if (fingers.size > 2) return;
  }
  press = {id:e.pointerId, x:e.clientX, y:e.clientY, lastY:e.clientY, yaw:look.gy, pitch:look.gp, moved:false, touch:e.pointerType === 'touch'};
  stage.setPointerCapture(e.pointerId);
});
stage.addEventListener('pointermove', e => {
  if (!ready || $('#detail').open || $('#cart').open) return;
  if (fingers.has(e.pointerId)) fingers.set(e.pointerId, {x:e.clientX, y:e.clientY});
  if (pinch) {
    if (fingers.size === 2) {
      const c = centre(), k = 0.0026 * (camera.fov / 50);
      look.gz = pinch.zoom * spread() / pinch.d;
      look.gy = pinch.yaw + (c.x - pinch.at.x) * k; look.gp = pinch.pitch + (c.y - pinch.at.y) * k;
      dirty = true;
    }
    return;
  }
  if (press && e.pointerId === press.id) {
    const dx = e.clientX - press.x, dy = e.clientY - press.y;
    if (!press.moved && Math.hypot(dx, dy) > 6) { press.moved = true; press.lastY = e.clientY; if (!press.touch) stage.classList.add('dragging'); return; }
    if (press.moved && press.touch) {   // 指を上へ動かすと前へ（ページのスクロールと同じ向き）。横へ動かすと見回す（ANIMAL WORLD LIVE、2026-11-13：実機で「スワイプが効かない」。横は2本指だけだった）
      if (!press.axis) press.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';   // なで始めの向きで、見回しか歩きかを決める
      const step = press.lastY - e.clientY; press.lastY = e.clientY;
      if (press.axis === 'x') { look.gy = press.yaw + dx * 0.0026 * (camera.fov / 50); dirty = true; }
      else if (step) walkBy(step * SWIPE_M);
      return;
    }
    if (press.moved) { const k = 0.0026 * (camera.fov / 50); look.gy = press.yaw + dx * k; look.gp = press.pitch + dy * k; dirty = true; }
    return;
  }
  if (e.pointerType === 'touch' || mobile.matches) return;
  if (mode === 'outside') { stage.classList.toggle('can-go', !!floorHit(e) || aimsAtShop(e, null)); return; }
  const it = pickItem(e);
  if (mode === 'fixture') intend(it ? it.index : -1);
  const fi = it ? -1 : pickFixture(e);
  stage.classList.toggle('can-go', !!it || (fi >= 0 && !(mode === 'fixture' && fi === current)) || (fi < 0 && !it && (pickExit(e) || !!floorHit(e))));
});
stage.addEventListener('pointerleave', () => { if (!mobile.matches && mode === 'fixture' && !press) intend(-1); });
function release(e){
  fingers.delete(e.pointerId);
  if (pinch) {   // つまむ操作のあとは、指を全部はなすまで、見回しもタップも起こさない
    if (press && e.pointerId === press.id) { press = null; stage.classList.remove('dragging'); }
    if (fingers.size === 0) { pinch = null; press = null; }
    return;
  }
  if (!press || e.pointerId !== press.id) return;
  const moved = press.moved; press = null;
  stage.classList.remove('dragging');
  if (moved || e.type === 'pointercancel' || !ready || e.target.closest('button,a')) return;
  if (mode === 'outside') {   // 外：お店を押したら歩いて入る。小道や芝生を押したら、そこまで歩く
    if (pickExit(e)) { walkIn(); return; }
    const hit = floorHit(e);
    if (aimsAtShop(e, hit)) { walkIn(); return; }
    if (hit) walkTo(hit.x, hit.z);
    return;
  }
  const touch = e.pointerType === 'touch' || mobile.matches;
  const it = pickItem(e);
  if (it) {
    if (touch && it.index !== active) setActive(it.index); else openDetail(it);
    return;
  }
  const fi = pickFixture(e);
  if (fi >= 0 && !(mode === 'fixture' && fi === current)) { walkToFixture(fi); return; }   // 売り場の前まで歩く
  const hit = fi >= 0 ? null : floorHit(e);   // いま見ている売り場の、商品のすきまを押したときは歩かない
  if (hit && hit.z > DOOR_Z && hit.z < SHOP_DOOR_OUT.z) { walkTo(hit.x, hit.z); return; }   // 扉のすぐ外の小道を押した
  if (pickExit(e)) { walkOut(); return; }   // 出口（開いた扉や、その向こうの遠くの景色）を押したら、歩いて外へ出る
  if (hit) { walkTo(hit.x, hit.z); return; }   // 床を押したら、そこまで歩く（台や棚を押したら、その手前まで）
  if (touch && mode === 'fixture' && fixtures[current].type !== 'rack') setActive(-1);
}
stage.addEventListener('pointerup', release);
stage.addEventListener('pointercancel', release);
stage.addEventListener('wheel', e => {
  if (!ready || $('#detail').open || $('#cart').open) return;
  e.preventDefault();
  // トラックパッドでつまむ（ctrl つき）ときは拡大・縮小。ふつうのスクロールは、前へ・うしろへ歩く
  if (e.ctrlKey) { look.gz *= Math.exp(-e.deltaY * 0.012); dirty = true; return; }
  const dy = e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1);
  if (Math.abs(dy) > Math.abs(e.deltaX) * 0.5) walkBy(clamp(dy * 0.007, -1.5, 1.5));   // 下へスクロールで前へ（3Dの動物紹介ページと同じ向き）。ホイール1目盛り（約100）で0.7m
}, {passive:false});

$('#enter').addEventListener('click', walkIn);
$('#leave').addEventListener('click', walkOut);
$('#h-prev').addEventListener('click', () => browse(-1));
$('#h-next').addEventListener('click', () => browse(1));
$('#h-inspect').addEventListener('click', () => { const it = fixtures[current]?.items[active]; if (it) openDetail(it); });
addEventListener('keydown', e => {
  if ($('#detail').open || $('#cart').open || e.target.closest('select,input')) return;
  if (e.key === 'Escape' && mode === 'fixture') goOverview();
  else if (e.key === 'ArrowLeft') browse(-1);
  else if (e.key === 'ArrowRight') browse(1);
});
// ほかのタブやショップページでカートが変わったら、数を合わせる
addEventListener('storage', () => { refresh(); if (cartBox.open && !$('#c-pay').hidden) paintCart(); });
addEventListener('pageshow', () => refresh());
mobile.addEventListener('change', () => { if (mode === 'fixture') goFixture(current); else refresh(); });

// ---------- 詳しく見る ----------
// 詳細の画像：その商品だけを、別の層に入れて正面から撮る
const shot = new THREE.WebGLRenderTarget(900, 900, {samples:4});
shot.texture.colorSpace = THREE.SRGBColorSpace;
const shotCam = new THREE.PerspectiveCamera(18, 1, 0.02, 10);
shotCam.layers.set(1);
function snapshot(item, info){
  const obj = info.object;
  const saved = {t:item.t, rot:obj.rotation.clone()};
  item.t = 1; item.fixture.pose(item); obj.rotation.set(0, 0, 0);
  obj.updateMatrixWorld(true);
  obj.traverse(o => o.layers.enable(1));
  const center = obj.getWorldPosition(new THREE.Vector3()); center.y += info.tall / 2;
  const dir = new THREE.Vector3(0, 0.12, 1).normalize().applyQuaternion(item.fixture.group.getWorldQuaternion(tmpQ));
  const dist = info.size / 2 / Math.tan(THREE.MathUtils.degToRad(shotCam.fov / 2));
  shotCam.position.copy(center).addScaledVector(dir, dist); shotCam.lookAt(center);
  scene.background = new THREE.Color(0xece6dc);
  renderer.setRenderTarget(shot); renderer.render(scene, shotCam);
  const px = new Uint8Array(900 * 900 * 4);
  renderer.readRenderTargetPixels(shot, 0, 0, 900, 900, px);
  renderer.setRenderTarget(null);
  scene.background = SKY;
  obj.traverse(o => o.layers.disable(1));
  item.t = saved.t; item.fixture.pose(item); dirty = true;
  const c = document.createElement('canvas'); c.width = c.height = 900;
  const g = c.getContext('2d'), img = g.createImageData(900, 900);
  for (let y = 0; y < 900; y++) img.data.set(px.subarray((899 - y) * 3600, (900 - y) * 3600), y * 3600); // 上下を戻す
  g.putImageData(img, 0, 0);
  return c.toDataURL('image/jpeg', 0.9);
}
const dialog = $('#detail');
let detail = null;   // 開いている商品と、選んでいる種類
function openDetail(item){
  setActive(item.index);
  const info = item.fixture.snapshotInfo(item);
  $('#d-photo').src = info.photo || snapshot(item, info);
  $('#d-photo-wrap').classList.toggle('render', !info.photo);
  $('#d-note').hidden = !!info.photo;
  $('#d-type').textContent = item.fixture.label;
  $('#d-added').hidden = true;
  const v = view(item.product), sold = o => shop.left(item.product.id, o) <= 0;
  let option = '';
  if (v.options.length) { // はじめは2番目（M など）。売り切れなら、買えるものを選ぶ
    const open = v.state === 'ok' ? v.options.filter(o => !sold(o)) : v.options;
    const first = v.options[Math.min(1, v.options.length - 1)];
    option = open.includes(first) ? first : open[0] || first;
  }
  detail = {item, option};
  paintDetail();
  dialog.showModal();
}
function paintDetail(){
  const {item} = detail, p = item.product, v = view(p);
  const linked = v.state === 'ok', sold = o => linked && shop.left(p.id, o) <= 0;
  $('#d-photo').alt = v.name;
  $('#d-name').textContent = v.name;
  $('#d-desc').textContent = v.desc;
  const spec = $('#d-spec'); spec.replaceChildren();
  for (const [k, val] of [...(p.spec || []), ['価格', linked ? `${v.price.toLocaleString('ja-JP')}円（税込）` : v.tentative ? `${v.tentative.toLocaleString('ja-JP')}円（税込・仮）` : '準備中']]) {
    const row = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd');
    dt.textContent = k; dd.textContent = val; row.append(dt, dd); spec.append(row);
  }
  const opts = $('#d-options'); opts.replaceChildren();
  opts.setAttribute('aria-label', v.optionLabel || '種類');
  for (const o of v.options) {
    const b = document.createElement('button'); b.textContent = sold(o) ? `${o}（売り切れ）` : o;
    b.disabled = sold(o);
    b.setAttribute('aria-pressed', String(o === detail.option));
    b.addEventListener('click', () => { detail.option = o; $('#d-added').hidden = true; paintDetail(); });
    opts.append(b);
  }
  const out = linked && sold(detail.option), cart = $('#d-cart');
  cart.disabled = !linked || out;
  cart.textContent = v.state === 'loading' ? '読み込んでいます…' : v.state === 'offline' ? 'ここでは見るだけです（買えません）' : !linked ? '準備中です' : out ? '売り切れ' : 'カートに入れる';
  $('#d-ship').textContent = v.note; $('#d-ship').hidden = !v.note;
}
$('#d-cart').addEventListener('click', () => {
  if (!detail || !shop) return;
  const r = shop.add(detail.item.product.id, detail.option), box = $('#d-added');
  box.hidden = false; box.classList.toggle('error', !!r.error);
  $('#d-added-text').textContent = r.error || `カートに入れました（この商品 ${r.qty}点・カート全体 ${r.count}点）`;
  $('#d-added-link').hidden = !!r.error;
  refresh();
});
$('#d-added-link').addEventListener('click', () => { dialog.close(); openCart(); });

// ---------- カート（確認・数の変更・お会計まで、この売り場の中で） ----------
const cartBox = $('#cart');
// view：'cart' 中身／'thanks' お礼／'cancel' まだ済んでいない／'unknown' たしかめられなかった
function openCart(view = 'cart', info = {}){
  paintCart(view, info);
  if (!cartBox.open) cartBox.showModal();
}
function paintCart(view = 'cart', info = {}){
  const lines = $('#c-lines'), sums = $('#c-sums'), pay = $('#c-pay'), note = $('#c-note'), lead = $('#c-lead');
  lines.replaceChildren(); sums.replaceChildren(); $('#c-error').hidden = true; note.textContent = ''; lead.textContent = '';
  pay.hidden = true; pay.disabled = false; pay.textContent = 'お支払いへ進む';
  if (view !== 'cart') {
    $('#c-title').textContent = view === 'thanks' ? 'ご注文、ありがとうございます' : view === 'cancel' ? 'お支払いは、まだ済んでいません' : 'お支払いを確かめられませんでした';
    lead.textContent = view === 'thanks'
      ? 'ご注文を受けつけました。発送の準備ができましたら、メールでお知らせします。\nお支払いの控えは、Stripe からメールで届きます。売上は、動物たちのごはん・医療・住まいに使います。'
        + (info.orderNo ? `\nご注文の番号：${info.orderNo}` : '')
        + ((info.tickets || []).length ? '\nお礼のチケット：' + info.tickets.map(t => `${t.label || ''} ${t.code}`).join('、') : '')
      : view === 'cancel' ? 'カートの中身は、そのまま残っています。'
      : 'Stripe から控えのメールが届いていれば、お支払いは済んでいます。届かないときは、お問い合わせください。';
    return;
  }
  const t = shop && shop.linked ? shop.totals() : null;
  $('#c-title').textContent = 'カートの中身';
  if (!t || !t.cart.length) { lead.textContent = 'カートは空です。気になる商品の「詳しく見る」から入れられます。'; return; }
  t.cart.forEach((c, i) => {
    const l = t.lines[i], li = document.createElement('li');
    const name = document.createElement('div'), b = document.createElement('b'), small = document.createElement('small'), sum = document.createElement('strong');
    b.textContent = l.name; small.textContent = `${l.sub ? l.sub + ' ／ ' : ''}${shop.yen(l.price)}`; name.append(b, small);
    sum.textContent = shop.yen(l.price * l.qty);
    const qty = document.createElement('div'); qty.className = 'qty';
    const mk = (text, label, fn, cls) => { const x = document.createElement('button'); x.type = 'button'; x.textContent = text; x.setAttribute('aria-label', label); if (cls) x.className = cls; x.addEventListener('click', fn); return x; };
    const out = document.createElement('output'); out.textContent = String(l.qty);
    const change = n => () => { shop.setQty(i, n); refresh(); paintCart(); };
    qty.append('数量', mk('－', `${l.name}を1つへらす`, change(l.qty - 1)), out, mk('＋', `${l.name}を1つふやす`, change(l.qty + 1)), mk('とりけす', `${l.name}をカートから出す`, change(0), 'remove'));
    li.append(name, sum, qty); lines.append(li);
  });
  const row = (k, v, cls) => { const d = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd'); if (cls) d.className = cls; dt.textContent = k; dd.textContent = v; d.append(dt, dd); sums.append(d); };
  if (t.goods) row('グッズ', shop.yen(t.goods));
  if (t.gifts) row('おうえん', shop.yen(t.gifts));
  if (t.hasGoods) row('送料', t.shipping ? shop.yen(t.shipping) : '無料');
  row('合計（税込）', shop.yen(t.total), 'total');
  note.textContent = [
    t.lines.some(l => l.madeToOrder) ? '受注生産の商品が入っています。発送まで3〜4週間ほどかかり、ご注文後のキャンセル・サイズ交換はできません。' : '',
    t.hasGoods ? 'お届け先とカードの入力は、次の Stripe の画面で行います。終わると、このお店に戻ってきます。' : 'カードの入力は、次の Stripe の画面で行います。',
    shop.pay.configured && shop.pay.testMode ? 'いまはテスト環境です。実際には請求されません（カード番号 4242 4242 4242 4242）。' : '',
  ].filter(Boolean).join('\n');
  pay.hidden = false; pay.textContent = `お支払いへ進む（${shop.yen(t.total)}）`;
}
$('#cart-link').addEventListener('click', () => openCart());
// レジの「お会計にすすむ」：カートに何か入っていれば中身の画面を開く。空なら開かずに、ひとこと出す
$('#pay-btn').addEventListener('click', () => {
  if (shop && shop.linked && shop.count() > 0) { $('#pay-msg').hidden = true; openCart(); return; }
  const m = $('#pay-msg'); m.hidden = false; clearTimeout(payMsgTimer); payMsgTimer = setTimeout(() => { m.hidden = true; }, 4000);
});
$('#c-pay').addEventListener('click', async () => {
  const pay = $('#c-pay'), label = pay.textContent, err = $('#c-error');
  pay.disabled = true; pay.textContent = '決済画面を用意しています…'; err.hidden = true;
  const r = await shop.checkout();
  if (r.url) { location.assign(r.url); return; }
  err.textContent = r.error; err.hidden = false; pay.disabled = false; pay.textContent = label;
});
for (const b of cartBox.querySelectorAll('[data-close]')) b.addEventListener('click', () => cartBox.close());
cartBox.addEventListener('click', e => { if (e.target === cartBox) cartBox.close(); });
// Stripe の画面から戻ってきたとき、または ?cart=1 で開いたとき
async function afterReturn(){
  const state = params.get('checkout'), id = params.get('session_id'), wantCart = params.has('cart');
  if (!state && !wantCart) return;
  const keep = new URLSearchParams(params); for (const k of ['checkout', 'session_id', 'cart']) keep.delete(k);
  history.replaceState(null, '', location.pathname + (keep.size ? '?' + keep : ''));
  if (!shop.linked) return;
  if (state === 'cancel') return openCart('cancel');
  if (state === 'success' && id) { const r = await shop.confirm(id); refresh(); return openCart(r.ok ? 'thanks' : 'unknown', r); }
  if (wantCart) openCart();
}

dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
dialog.addEventListener('close', () => { if (!mobile.matches) setActive(-1); });

// ---------- はじめる ----------
async function start(){
  const base = normalize(await (await fetch('store.json', {cache:'no-store'})).json());
  data = base;
  if (EDIT) {
    try { const d = JSON.parse(localStorage.getItem(DRAFT_KEY)); if (d && d.products && d.fixtures) data = normalize(d); } catch { /* 下書きなし */ }
  }
  const fonts = loadSignFonts(data.fixtures.map(f => f.label).join('') + 'HOKKAIDO ANIMAL WORLD SHOP');   // 札の文字を描く前に読み込む
  room = data.room.model ? await buildTreeRoom(scene, data.room, renderer, SKY) : buildRoom(scene, data.room);
  await fonts;
  room.lights.forEach(l => l.layers.enable(1));
  ctx = {renderer, loadTex, mats:room.mats, room, labels:data.room.labels !== false};   // labels：売り場の札を出すか（store.json の room.labels）
  resize(); refresh();
  requestAnimationFrame(frame);
  // 外観が出たら、ようこそのあいさつを始める（回線が遅いと、何も映っていないうちにあいさつが終わってしまうため）。
  // 「お店に入る」は、店内の商品まで読み込めてから出す
  app.classList.add('is-shown');
  $('#loading').textContent = 'お店の中を準備しています…';
  // ショップの内容は、売り場の組み立てと並行して読む（読めなくても売り場は見られる）
  connectShop().then(s => { shop = s; refresh(); if (dialog.open) paintDetail(); afterReturn(); });
  // 「ワールドにもどる」：ANIMAL WORLD LIVE の中（iframe）で開いているときは、親の画面に閉じてもらう。じかに開いたときは、ワールドのお店の前へ（/?shop）
  $('#to-world').addEventListener('click', e => {
    if (window.parent === window) return;
    e.preventDefault();
    window.parent.postMessage({type:'awl-shop-close'}, location.origin);
  });
  // 2026-11-13：お店の建物ができたら、すぐ歩けるようにする。商品（Tシャツなど）は、そのあと棚に並んでいく
  ready = true;
  $('#loading').hidden = true;
  app.classList.add('is-ready');
  tellParent('awl-shop-ready');
  if (AWL_NAV) { for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, startBgm, {passive:true}); addEventListener('pagehide', freeGL); startBgm(); }
  if (AWL_NAV) { curtain?.classList.add('is-out'); setTimeout(() => { if (mode === 'outside' && !visited) walkIn(); }, 1500); }   // ページごと移ってきた時は、合図を待たずに店内へ歩く
   // ANIMAL WORLD LIVE の中なら、親の「準備しています」を消してもらう
  const goods = buildFixtures().then(() => {
    if (room.solid) paintCards = buildPriceCards(scene, room.solid, fixtures);   // 売り場ごとのプライスカード
    nav = null; setTimeout(navMap, 0);   // 歩ける場所の地図は、売り場（よける場所）がそろってから作り直す
    refresh(); dirty = true;
    if (params.has('at')) { cam.snap = true; const i = fixtures.findIndex(f => f.id === params.get('at')); mode = 'overview'; i >= 0 ? goFixture(i) : refresh(); }
  });
  if (!EDIT) goods.catch(err => console.error(err));
  else await goods;
  if (EDIT) {
    app.classList.add('editing');
    initEditor({
      get data(){ return data; }, kindsOf:type => FIXTURE_TYPES[type]?.kinds || [],
      warnings:() => warnings,
      async apply(){ localStorage.setItem(DRAFT_KEY, JSON.stringify(data)); await buildFixtures(); },
      async reset(){ localStorage.removeItem(DRAFT_KEY); data = normalize(await (await fetch('store.json', {cache:'no-store'})).json()); await buildFixtures(); },
    });
    resize();
  }
  if (params.has('debug')) window.__store = {get fixtures(){ return fixtures; }, get data(){ return data; }, get state(){ return {mode, current, active}; },
    camera, renderer, cam, scene, get room(){ return room; }, get walker(){ return walker; }, get nav(){ return navMap(); }, walkTo, walkToFixture, walkIn, walkOut, enter, leave, goFixture, goOverview, setActive, openDetail,
    // 確認用：画面が裏にあっても、指定した秒数ぶん動きを進める
    step(seconds){ let moving = false; for (let i = 0; i < seconds * 60; i++) moving = advance(1 / 60); return moving; }};
}
// ANIMAL WORLD LIVE の中（iframe）で開いているとき、親の画面に知らせる
if (AWL) addEventListener('message', e => {   // 親の幕が開いたら、扉をくぐって店内へ
  if (e.origin === location.origin && e.source === window.parent && e.data?.type === 'awl-shop-go') setTimeout(() => { if (mode === 'outside' && !visited) walkIn(); }, 700);
});
function tellParent(type){ if (window.parent !== window) window.parent.postMessage({type}, location.origin); }
start().catch(err => {
  if (!ready) tellParent('awl-shop-fail');
  $('#loading').hidden = false; $('#loading').textContent = '読み込めませんでした';
  console.error(err);
});
