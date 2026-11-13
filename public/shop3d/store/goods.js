import * as THREE from 'three';
import {spring, lerp, box, signTexture, glowTexture, woodSign} from './util.js';

// 棚（壁づけ）と台（床置き）。マグカップと、平らな画像1枚で作れるカード類を並べる。
// 単位はメートル（実物の大きさ）。
const SHELF_D = 0.2, BOARD_T = 0.022, TIER_GAP = 0.32, WALL_GAP = 0.004;
const MUG_R = 0.041, MUG_H = 0.096;
const CARD = [0.075, 0.105];

const ceramic = new THREE.MeshPhysicalMaterial({color:0xf7f5f0, roughness:.22, clearcoat:1, clearcoatRoughness:.08});
const mugProfile = [
  [0, 0], [0.034, 0], [0.038, 0.0015], [0.0395, 0.005], [MUG_R, 0.012], [MUG_R, MUG_H - 0.004], [MUG_R - 0.0008, MUG_H],
  [MUG_R - 0.003, MUG_H - 0.0005], [MUG_R - 0.0034, MUG_H - 0.004], [MUG_R - 0.0034, 0.014], [0.03, 0.009], [0, 0.008],
].map(([r, y]) => new THREE.Vector2(r, y));
const mugBody = new THREE.LatheGeometry(mugProfile, 96);
const handleGeo = (() => {
  const g = new THREE.TorusGeometry(0.025, 0.0062, 18, 48, Math.PI * 1.25);
  g.rotateZ(-Math.PI * 0.625); g.scale(1, 1.18, 1); g.translate(MUG_R + 0.004, MUG_H * 0.52, 0);
  return g;
})();
const blob = glowTexture('rgba(40,28,16,.55)', 'rgba(40,28,16,0)');

function makeMug(artTex){
  const g = new THREE.Group();
  const body = new THREE.Mesh(mugBody, ceramic), handle = new THREE.Mesh(handleGeo, ceramic);
  body.castShadow = handle.castShadow = true; body.receiveShadow = true;
  g.add(body, handle);
  // 絵柄は胴に巻いた薄い帯（正面＝+z が絵柄の中心）
  const aspect = artTex.image.width / artTex.image.height;
  const bandH = Math.min(0.064, MUG_R * 2.3 / aspect), arc = bandH * aspect / MUG_R;
  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(MUG_R + 0.0002, MUG_R + 0.0002, bandH, 96, 1, true, Math.PI - arc / 2, arc),
    new THREE.MeshPhysicalMaterial({map:artTex, transparent:true, roughness:.25, clearcoat:1, clearcoatRoughness:.08, depthWrite:false}));
  band.rotation.y = Math.PI;
  band.position.y = 0.012 + (MUG_H - 0.016) / 2;
  g.add(band);
  return g;
}
function makeCard(tex, [w, h], withBase, wood){
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({map:tex, roughness:.85, alphaTest:.5, side:THREE.DoubleSide}));
  m.position.y = h / 2; m.castShadow = m.receiveShadow = true;
  g.add(m);
  if (withBase) { const b = box(w * 0.7, 0.012, 0.028, wood, 0, 0.006, -0.004); b.castShadow = true; g.add(b); }
  return g;
}

export class Shelf {
  static kinds = ['mug', 'card'];

  constructor(ctx, fx, placements){
    this.ctx = ctx; this.fx = fx; this.id = fx.id; this.label = fx.label; this.type = fx.type;
    this.placements = placements;
    this.table = fx.type === 'table';
    this.width = fx.width || 1; this.tiers = Math.max(1, fx.tiers || 1);
    this.depth = this.table ? (fx.depth || 0.6) : SHELF_D;
    this.height = fx.height || (this.table ? 0.78 : 1.1);
    this.group = new THREE.Group();
    this.items = []; this.hitTargets = [];
    this.table ? this.buildTable() : this.buildShelf();
  }

  tierY(t){ return this.table ? this.height : this.height + (this.tiers - t) * TIER_GAP; }
  tierZ(t){ // 商品を置く前後の位置
    if (!this.table) return WALL_GAP + SHELF_D / 2 - 0.01;
    if (this.tiers === 1) return 0.05;
    return lerp(this.depth / 2 - 0.15, -this.depth / 2 + 0.15, (t - 1) / (this.tiers - 1));
  }

  buildShelf(){
    const {wood, iron} = this.ctx.mats, g = this.group, zc = WALL_GAP + SHELF_D / 2;
    for (let t = 1; t <= this.tiers; t++) {
      const y = this.tierY(t);
      const board = box(this.width, BOARD_T, SHELF_D, wood, 0, y - BOARD_T / 2, zc);
      board.castShadow = board.receiveShadow = true; g.add(board);
      for (const sx of [-1, 1]) {
        const x = sx * (this.width / 2 - 0.1);
        const down = box(0.014, 0.08, 0.006, iron, x, y - BOARD_T - 0.04, 0.003);
        const arm = box(0.014, 0.006, SHELF_D * 0.8, iron, x, y - BOARD_T - 0.003, SHELF_D * 0.4);
        const brace = box(0.008, 0.006, 0.12, iron, x, y - BOARD_T - 0.04, 0.05); brace.rotation.x = Math.atan2(0.074, 0.1);
        for (const m of [down, arm, brace]) { m.castShadow = true; g.add(m); }
      }
    }
    const top = this.tierY(1);
    const sign = woodSign(this.label, 0.5, 0.135);   // 木の札を、壁にじかに付ける
    sign.position.set(0, top + 0.36, 0.006); sign.visible = this.ctx.labels;
    g.add(sign);
    const h = (this.tiers - 1) * TIER_GAP + 0.45;
    this.volume = box(this.width + 0.1, h, 0.4, new THREE.MeshBasicMaterial({visible:false}), 0, this.tierY(this.tiers) + h / 2 - 0.12, 0.2);
    this.volume.userData.fixture = this; g.add(this.volume);
  }

  buildTable(){
    const {wood, darkWood} = this.ctx.mats, g = this.group, w = this.width, d = this.depth, h = this.height;
    if (!this.fx.surface) {   // 店のモデルに台がある（surface）ときは、天板と脚を描かない
      const top = box(w, 0.035, d, wood, 0, h - 0.0175, 0); top.castShadow = top.receiveShadow = true; g.add(top);
      g.add(box(w - 0.12, 0.07, d - 0.12, darkWood, 0, h - 0.07, 0));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const leg = box(0.05, h - 0.035, 0.05, darkWood, sx * (w / 2 - 0.07), (h - 0.035) / 2, sz * (d / 2 - 0.07));
        leg.castShadow = true; g.add(leg);
      }
    }
    // 小さな立て札
    const tex = signTexture(this.label, null, {center:true});
    const tent = box(0.17, 0.07, 0.004, [0, 0, 0, 0, 1, 0].map(f => f ? new THREE.MeshStandardMaterial({map:tex, roughness:.8}) : new THREE.MeshStandardMaterial({color:0xfbfaf6, roughness:.8})),
      -w / 2 + 0.15, h + 0.034, -d / 2 + 0.13);
    tent.rotation.x = -0.28; tent.castShadow = true; tent.visible = this.ctx.labels; g.add(tent);
    this.volume = box(w + 0.1, h + 0.3, d + 0.1, new THREE.MeshBasicMaterial({visible:false}), 0, (h + 0.3) / 2, 0);
    this.volume.userData.fixture = this; g.add(this.volume);
  }

  async build(){
    const {loadTex, mats} = this.ctx;
    const usable = this.width - (this.table ? 0.36 : 0.12);
    this.warnings = [];
    for (let t = 1; t <= this.tiers; t++) {
      const row = this.placements.filter(p => Math.min(this.tiers, Math.max(1, p.display.tier || 1)) === t);
      const widths = row.map(p => p.display.kind === 'mug' ? 0.15 : (p.display.size || CARD)[0] + 0.03);
      const sum = widths.reduce((a, b) => a + b, 0);
      const free = row.length > 1 ? (usable - sum) / (row.length - 1) : 0;
      if (free < 0.005 && row.length > 1) this.warnings.push(`「${this.label}」の${t}段目は商品が多く、重なります`);
      const gap = Math.min(0.1, Math.max(0, free));
      let x = -(sum + gap * (row.length - 1)) / 2 + (this.table ? 0.08 : 0);
      await Promise.all(row.map(async (pl, i) => {
        const cx = x + widths[i] / 2; x += widths[i] + gap;
        try {
          const tex = await loadTex(pl.display.image);
          await this.addItem(pl, tex, t, cx, i, mats);
        } catch (err) { this.warnings.push(`「${pl.product.name}」を並べられません（${err.message}）`); }
      }));
    }
    this.items.forEach((it, i) => { it.index = i; this.pose(it); });
    this.hitTargets = this.items.map(it => it.hit);
  }

  async addItem(pl, tex, tier, x, i, mats){
    const kind = pl.display.kind, y = this.tierY(tier), z = this.tierZ(tier);
    const root = new THREE.Group();
    let obj, rest, size, tall;
    if (kind === 'mug') {
      obj = makeMug(tex); tall = MUG_H; size = [0.13, MUG_H + 0.02, 0.1];
      rest = {x, y, z, rx:0, ry:-0.95 + (i % 3) * 0.25, rz:0};
    } else {
      const dim = pl.display.size || CARD; tall = dim[1];
      obj = makeCard(tex, dim, this.table, mats.darkWood); size = [dim[0] + 0.02, dim[1] + 0.02, 0.05];
      const lean = this.table ? 0.14 : 0.2;
      // 棚では壁に立てかける。台では小さな台座に立てる。
      rest = {x, y, z:this.table ? z : WALL_GAP + 0.004 + dim[1] * Math.sin(lean), rx:-lean, ry:0, rz:this.table ? 0 : (i % 2 ? 1 : -1) * 0.025};
    }
    root.add(obj);
    const shade = new THREE.Mesh(new THREE.PlaneGeometry(size[0] * 1.5, size[0] * 1.1), new THREE.MeshBasicMaterial({map:blob, transparent:true, opacity:kind === 'mug' ? .5 : .28, depthWrite:false, toneMapped:false}));
    shade.rotation.x = -Math.PI / 2; shade.position.set(x, y + 0.0012, rest.z);
    this.group.add(shade);
    const hit = box(...size, new THREE.MeshBasicMaterial({visible:false}), 0, size[1] / 2 - 0.01, 0);
    root.add(hit);
    this.group.add(root);
    const item = {fixture:this, product:pl.product, display:pl.display, kind, root, obj, rest, hit, tall, t:0, v:0, shade,
      sort:tier * 100 + (pl.display.order || 0)};
    hit.userData.item = item;
    this.items.push(item);
    this.items.sort((a, b) => a.sort - b.sort);
  }

  pose(it){
    const t = it.t, r = it.rest;
    if (it.kind === 'mug') {
      // 手に取るように：少し持ち上がって手前へ、絵柄がこちらを向く
      it.root.position.set(r.x, r.y + 0.014 * Math.sin(Math.min(t, 1) * Math.PI / 2), r.z + 0.05 * t);
      it.root.rotation.set(0, lerp(r.ry, 0, t), 0);
    } else if (this.table) {
      it.root.position.set(r.x, r.y + 0.03 * t, r.z + 0.03 * t);
      it.root.rotation.set(lerp(r.rx, -0.5, t), 0, 0); // 見下ろす目線に向けて起こす
    } else {
      it.root.position.set(r.x, r.y + 0.012 * t, lerp(r.z, WALL_GAP + SHELF_D / 2 + 0.03, t));
      it.root.rotation.set(lerp(r.rx, 0.06, t), 0, lerp(r.rz, 0, t));
    }
    it.shade.material.opacity = (it.kind === 'mug' ? .5 : .28) * (1 - 0.6 * Math.min(1, Math.max(0, t)));
  }

  update(dt, active, reduced){
    let moving = false;
    for (const it of this.items) {
      const goal = it.index === active ? 1 : 0;
      if (reduced) { it.t = goal; it.v = 0; }
      else [it.t, it.v] = spring(it.t, it.v, goal, dt, 9);
      if (Math.abs(it.t - goal) > 1e-4 || Math.abs(it.v) > 1e-4) moving = true;
      this.pose(it);
    }
    return moving;
  }

  view(mobile, active){
    if (mobile && active >= 0 && this.items[active]) {
      const r = this.items[active].rest;
      return {center:new THREE.Vector3(r.x, r.y + 0.06, r.z), halfW:0.13, halfH:0.1, up:this.table ? 0.6 : 0.22, fov:24};
    }
    if (this.table) return {center:new THREE.Vector3(0, this.height + 0.05, 0), halfW:this.width / 2 + 0.04, halfH:0.26, up:0.6, fov:24};
    const mid = (this.tierY(1) + this.tierY(this.tiers)) / 2;
    return {center:new THREE.Vector3(0, mid + 0.13, WALL_GAP + SHELF_D / 2), halfW:this.width / 2 + 0.06, halfH:(this.tiers - 1) * TIER_GAP / 2 + 0.33, up:0.2, fov:24};
  }

  snapshotInfo(item){ return {object:item.root, tall:item.tall, size:item.kind === 'mug' ? 0.17 : item.tall + 0.035}; }
}
