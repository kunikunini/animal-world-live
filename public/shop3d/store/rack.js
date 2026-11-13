import * as THREE from 'three';
import {spring, box, glowTexture, woodSign} from './util.js';

// 壁づけのハンガーラック。Tシャツは横向きに掛かり、選ぶとこちらを向く。
// 中の寸法は元の試作の単位のまま作り、全体を S 倍して実物の大きさに合わせる。
const S = 0.7;
const PX = 1 / 1100;
const PROFILE_YAW = Math.PI / 2;
const VIEW = new THREE.Vector3();
const RAIL_Y = 0, HOOK_R = 0.026, TUBE_R = 0.0055, RAIL_R = 0.017;
const APEX_Y = -0.08;
const RAIL_Z = -HOOK_R, WALL_Z = -0.85;
const PITCH = 0.42, GAP = 0.1, PROFILE_HALF = 0.05;
const FAR_TURN = 0.45, FAR_SPREAD = 1.75;
const END_ROOM = 1.5; // レールの両はしに要る余白（選んだ1着が正面を向く幅）

const shirtVert = `
  varying vec2 vUv; varying vec3 vN; varying float vSide, vY;
  void main(){
    vUv=uv; vN=normalize(normalMatrix*normal); vSide=1.-abs(normal.z);
    vec4 wp=modelMatrix*vec4(position,1.); vY=wp.y;
    gl_Position=projectionMatrix*viewMatrix*wp;
  }`;
// 色は写真のまま出す（色の変換や明るさの補正を通さない）
const shirtFrag = `
  uniform sampler2D map, sideMap; uniform float fallTop, fallBottom, dim;
  varying vec2 vUv; varying vec3 vN; varying float vSide, vY;
  void main(){
    vec4 t=texture2D(map,vUv);
    if(t.a<.04) discard;
    t.rgb=mix(t.rgb,texture2D(sideMap,vUv).rgb,smoothstep(.3,.7,vSide));
    vec3 n=normalize(vN); if(!gl_FrontFacing) n=-n;
    vec3 L=normalize(vec3(-.35,.4,1.));
    float lit=.76+.24*max(dot(n,L),0.);
    float flat_=.76+.24*L.z;
    float fall=mix(1.,.955,smoothstep(fallTop,fallBottom,vY));
    gl_FragColor=vec4(t.rgb*min(lit/flat_,1.06)*fall*dim,t.a);
  }`;

async function loadDepth(url){
  // decode() は画面が裏にあると終わらないことがあるので、読み込み完了を待つ
  const img = new Image();
  await new Promise((ok, ng) => { img.onload = ok; img.onerror = () => ng(new Error('画像を読み込めません: ' + url)); img.src = url; });
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
  return {w:img.width, h:img.height, data:ctx.getImageData(0, 0, img.width, img.height).data};
}
// 平面を厚みの地図で押し出す（sign=1が表、-1が裏）
function bulgedPlane(w, h, depth, maxZ, sign){
  const g = new THREE.PlaneGeometry(w, h, 96, 108);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = Math.min(depth.w - 1, Math.round(uv.getX(i) * (depth.w - 1)));
    const y = Math.min(depth.h - 1, Math.round((1 - uv.getY(i)) * (depth.h - 1)));
    p.setZ(i, sign * depth.data[(y * depth.w + x) * 4] / 255 * maxZ);
  }
  g.computeVertexNormals();
  return g;
}

export class Rack {
  static kinds = ['tee'];

  constructor(ctx, fx, placements){
    this.ctx = ctx; this.fx = fx; this.id = fx.id; this.label = fx.label; this.type = 'rack';
    this.placements = placements;
    this.height = fx.height || 1.8;
    this.group = new THREE.Group();
    this.back = this.backGoal = 0; this.backV = 0;   // 吊るした服が、裏へ向き直っているか
    this.unit = new THREE.Group(); // 元の試作の単位
    this.unit.scale.setScalar(S);
    // hang：壁のラックではなく、天井から木の棒を吊るした展示（部屋のまんなかに置く）。服は、こちらを向けて間をあけて掛ける
    this.hang = !!fx.hang;
    this.pitch = this.hang ? 0.9 : PITCH;                 // となりの服との間隔
    this.rest = this.hang ? 0.82 : 0;                     // 選んでいないときの向き（0＝横向き、1＝正面）
    this.off = this.hang ? 0 : -WALL_Z * S;               // 壁から棒までの距離
    this.unit.position.set(0, this.height, this.off);
    this.group.add(this.unit);
    this.items = []; this.hitTargets = []; this.warnings = [];
    // レールは壁の幅から両はし1mずつ空ける（となりの売り場を見るとき、はしの服が視界に入らないように）。
    // 入りきらない分は並べない
    const wallLen = fx.wall === 'back' ? ctx.room.W : fx.wall ? ctx.room.D : Infinity;
    this.maxLen = Math.min(fx.width || Infinity, wallLen - 2) / S;
    this.capacity = Math.max(1, Math.floor((this.maxLen - END_ROOM) / this.pitch) + 1);
    if (placements.length > this.capacity) {
      const over = this.placements.splice(this.capacity);
      this.warnings.push(`「${this.label}」は${this.capacity}着までです。${over.map(p => `「${p.product.name}」`).join('')}は並べていません`);
    }
    this.n = this.placements.length;
    // 見渡すときの間隔は、着数が増えたら詰める
    this.farSpread = this.hang ? 1 : this.n > 1 ? Math.min(FAR_SPREAD, Math.max(1, (this.maxLen - END_ROOM) / ((this.n - 1) * PITCH))) : 1;
    this.chrome = new THREE.MeshStandardMaterial({color:0xd9d9d6, roughness:.18, metalness:1});
    this.iron = ctx.mats.iron;
    this.buildFrame();
  }

  restX(i){ return (i - (this.n - 1) / 2) * this.pitch; }

  buildFrame(){
    const u = this.unit, iron = this.iron;
    const len = Math.max(1.6, (this.n - 1) * this.pitch * this.farSpread + END_ROOM);
    this.railLen = len;
    const railY = RAIL_Y - (HOOK_R - RAIL_R - TUBE_R);
    const sign = woodSign(this.label, this.hang ? 0.9 : 0.66, 0.17);   // 木の札
    if (this.hang) {
      // 木の棒を、2本のワイヤーで天井から吊るす
      const wood = this.ctx.mats.wood, R = 0.021, up = (4.6 - this.height) / S;
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(R, R, len, 24, 1), wood);
      rail.rotation.z = Math.PI / 2; rail.position.set(0, RAIL_Y - (HOOK_R - R - TUBE_R), RAIL_Z); rail.castShadow = true;
      u.add(rail);
      for (const sx of [-1, 1]) {
        const cap = new THREE.Mesh(new THREE.SphereGeometry(R, 16, 10), wood);
        cap.position.set(sx * len / 2, rail.position.y, RAIL_Z);
        const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0022, up, 6), iron);
        wire.position.set(sx * len * 0.36, rail.position.y + up / 2, RAIL_Z);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(R + 0.004, 0.004, 8, 20), iron);
        ring.rotation.y = Math.PI / 2; ring.position.set(sx * len * 0.36, rail.position.y, RAIL_Z);
        u.add(cap, wire, ring);
      }
      // 札は、棒の上のワイヤーのあいだに下げる（裏からも見えるので、少し厚めに）
      sign.position.set(0, this.height + 0.3, -0.015 + RAIL_Z * S);
    } else {
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(RAIL_R, RAIL_R, len, 32, 1), iron);
      rail.rotation.z = Math.PI / 2; rail.position.set(0, railY, RAIL_Z);
      u.add(rail);
      for (const sx of [-1, 1]) {
        const d = RAIL_Z - WALL_Z;
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(RAIL_R * .8, RAIL_R * .8, d, 24), iron);
        arm.rotation.x = Math.PI / 2; arm.position.set(sx * len / 2, railY, (RAIL_Z + WALL_Z) / 2);
        const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.012, 32), iron);
        plate.rotation.x = Math.PI / 2; plate.position.set(sx * len / 2, railY, WALL_Z + 0.006);
        const cap = new THREE.Mesh(new THREE.SphereGeometry(RAIL_R * 1.15, 24, 16), iron);
        cap.position.set(sx * len / 2, railY, RAIL_Z);
        u.add(arm, plate, cap);
      }
      sign.position.set(0, this.height + 0.34, 0.028);   // 壁にじかに付ける（壁の苔より前に出す）
    }
    sign.visible = this.ctx.labels;   // 札は、store.json の room.labels が false のあいだは出さない
    this.group.add(sign);
    // 押せる範囲（店内を見渡しているとき）
    this.volume = box(len * S, 1.25, 0.7, new THREE.MeshBasicMaterial({visible:false}), 0, this.height - 0.4, this.hang ? 0 : 0.35);
    this.volume.userData.fixture = this;
    this.group.add(this.volume);
  }

  makeHook(){
    const pts = [];
    for (let i = 0; i <= 8; i++) pts.push(new THREE.Vector3(0, APEX_Y + (RAIL_Y - APEX_Y) * i / 8, 0));
    for (let i = 1; i <= 24; i++) {
      const a = (i / 24) * Math.PI * 1.15; // 手前から上を回って奥へ
      pts.push(new THREE.Vector3(0, RAIL_Y + Math.sin(a) * HOOK_R, RAIL_Z + Math.cos(a) * HOOK_R + (0 - RAIL_Z - HOOK_R)));
    }
    const g = new THREE.Group(), chrome = this.chrome;
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, TUBE_R, 12), chrome));
    const tip = new THREE.Mesh(new THREE.SphereGeometry(TUBE_R * 1.3, 12, 8), chrome);
    tip.position.copy(pts.at(-1)); g.add(tip);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(TUBE_R * 1.9, TUBE_R * 2.3, 0.022, 16), chrome);
    collar.position.set(0, APEX_Y + 0.006, 0); g.add(collar);
    return g;
  }

  async build(){
    // 素材が足りない商品は飛ばして、残りを並べる
    const done = await Promise.allSettled(this.placements.map((pl, i) => this.buildItem(pl, i)));
    done.forEach((r, i) => { if (r.status === 'rejected') this.warnings.push(`「${this.placements[i].product.name}」を並べられません（${r.reason.message}）`); });
    this.items = this.items.filter(Boolean);
    this.items.forEach((it, i) => { it.index = i; });
    this.n = this.items.length;
    this.hitTargets = this.items.map(it => it.hit);
    // はじめは「店内を見渡す」向きで置く（入口から柄が見える）
    this.items.forEach(it => { it.t = this.hang ? this.rest : FAR_TURN; it.x = this.restX(it.index) * this.farSpread; });
    this.update(0, -1, true, true);
  }

  async buildItem(pl, index){
    const {loadTex} = this.ctx, base = pl.display.asset + '/';
    const res = await fetch(base + 'meta.json');
    if (!res.ok) throw new Error('Tシャツの素材がありません: ' + base);
    const meta = await res.json();
    const [front, back, depth, shadowTex] = await Promise.all([
      loadTex(base + 'front.webp', false), loadTex(base + 'back.webp', false), loadDepth(base + 'depth.png'), loadTex(base + 'shadow.png', false)]);
    for (const t of [front, back]) { t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; }
    const w = meta.width * PX, h = meta.height * PX, maxZ = meta.depthMax * w;

    const holder = new THREE.Group(), turn = new THREE.Group();
    holder.add(turn, this.makeHook());
    const offset = new THREE.Vector3((0.5 - meta.apex[0]) * w, -(0.5 - meta.apex[1]) * h + APEX_Y, 0);
    for (const [tex, sign] of [[front, 1], [back, -1]]) {
      const uniforms = {map:{value:tex}, sideMap:{value:back}, dim:{value:1},
        fallTop:{value:this.height - 0.35 * S}, fallBottom:{value:this.height - 1.35 * S}};
      const mat = new THREE.ShaderMaterial({uniforms, vertexShader:shirtVert, fragmentShader:shirtFrag, side:THREE.DoubleSide, alphaToCoverage:true});
      const m = new THREE.Mesh(bulgedPlane(w, h, depth, maxZ, sign), mat);
      m.position.copy(offset); turn.add(m);
    }
    turn.rotation.y = PROFILE_YAW;

    // 壁の影（向きに合わせて幅が変わる）と、スポットの光だまり
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(w / (1 - 2 * meta.shadowPad), h / (1 - 2 * meta.shadowPad)),
      new THREE.MeshBasicMaterial({color:0x2a2218, transparent:true, depthWrite:false, alphaMap:shadowTex, opacity:.16, toneMapped:false}));
    shadow.position.set(0.03, offset.y - 0.13, WALL_Z + 0.04);
    shadow.scale.y = 1.04;
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.9),
      new THREE.MeshBasicMaterial({map:glowTexture(), transparent:true, opacity:.07, depthWrite:false, blending:THREE.AdditiveBlending, toneMapped:false}));
    pool.position.set(0, -0.55, WALL_Z + 0.035);
    if (!this.hang) holder.add(pool, shadow);   // 壁の影と光だまりは、壁のラックだけ

    const hit = box(w * 0.92, h, 0.22, new THREE.MeshBasicMaterial({visible:false}), offset.x, offset.y, 0);
    turn.add(hit);
    this.unit.add(holder);
    const item = {fixture:this, product:pl.product, display:pl.display, kind:'tee', holder, turn, shadow, hit, w, h, x:0, v:0, t:0, tv:0, side:1, sideGoal:1, sideV:0, index,
      photo:base + 'photo.webp'};
    hit.userData.item = item;
    this.items[index] = item; this.hitTargets[index] = hit;
  }

  targetX(i, active){
    if (active < 0 || i === active) return this.restX(i);
    const dir = Math.sign(i - active), k = Math.abs(i - active);
    const sep = Math.max(this.items[active].w / 2 + PROFILE_HALF + GAP, this.pitch);
    return this.restX(active) + dir * (sep + (k - 1) * this.pitch);
  }

  // far：店内を見渡しているとき。遠くからでも柄が見えるよう、少しこちらへ向けて間をあける
  update(dt, active, reduced, far, camera){
    let moving = false;
    // 見ている人がどちら側にいるかで、服の表を向ける側を変える（反対側へ回りこんでも、無地の背中ではなく柄が見える）
    if (camera) {
      this.group.worldToLocal(VIEW.copy(camera.position));
      if (this.hang && Math.abs(VIEW.z) > 0.25) this.backGoal = VIEW.z < 0 ? 1 : 0;   // 吊るした服は、裏へ回ったら、くるっと向き直る
    }
    if (reduced) { this.back = this.backGoal; this.backV = 0; }
    else {
      [this.back, this.backV] = spring(this.back, this.backV, this.backGoal, dt, 7);
    }
    if (Math.abs(this.back - this.backGoal) > 1e-3) moving = true;
    for (const it of this.items) {
      const goal = it.index === active ? 1 : this.hang ? this.rest : far ? FAR_TURN : 0;
      const tx = far ? this.restX(it.index) * this.farSpread : this.targetX(it.index, active);
      if (reduced) { it.t = goal; it.x = tx; it.v = it.tv = 0; }
      else {
        [it.t, it.tv] = spring(it.t, it.tv, goal, dt, 8.5);
        [it.x, it.v] = spring(it.x, it.v, tx, dt, 11);
      }
      if (Math.abs(it.t - goal) > 1e-4 || Math.abs(it.x - tx) > 1e-4 || Math.abs(it.v) > 1e-4) moving = true;
      const t = Math.min(1, Math.max(0, it.t));
      // 1着ずつ、見ている人のいる側へ表を向ける（左にある服は右向き、右にある服は左向き）
      if (camera) { const dx = VIEW.x / S - it.x; if (Math.abs(dx) > 0.12) it.sideGoal = dx < 0 ? -1 : 1; }
      if (reduced) { it.side = it.sideGoal; it.sideV = 0; } else [it.side, it.sideV] = spring(it.side, it.sideV, it.sideGoal, dt, 7);
      if (Math.abs(it.side - it.sideGoal) > 1e-3) moving = true;
      it.turn.rotation.y = it.side * PROFILE_YAW * (1 - t) + this.back * Math.PI;
      it.holder.position.x = it.x;
      it.shadow.scale.x = Math.max(0.1, Math.abs(Math.cos(it.turn.rotation.y)));
    }
    return moving;
  }

  // 見る位置：center は什器の座標、half は映したい範囲の半分
  view(mobile, active){
    const focus = mobile ? this.restX(Math.max(0, active)) : 0;
    const halfW = mobile ? 0.74 : (this.n - 1) / 2 * this.pitch + 0.9;
    return {center:new THREE.Vector3(focus * S, this.height - 0.6 * S, this.off), halfW:halfW * S, halfH:0.86 * S, up:0, fov:20};
  }

  snapshotInfo(item){ return {photo:item.photo}; }
}
