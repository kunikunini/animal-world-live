import * as THREE from 'three';
import {box, canvasTexture, plankTexture, woodTexture, glowTexture, FONT} from './util.js';

// 店の箱（床・壁・天井・入口の外観）。原点は床の中央、奥が -z、入口が +z。
export function buildRoom(scene, room){
  const W = room.width, D = room.depth, H = room.height;
  const DOOR_W = 1.5, DOOR_H = 2.2, FACADE_T = 0.16;
  const g = new THREE.Group();
  scene.add(g);

  const plaster = new THREE.MeshStandardMaterial({color:0xece5d8, roughness:.96});
  const sage = new THREE.MeshStandardMaterial({color:0xb7c2ad, roughness:.9});
  const woodTex = woodTexture();
  const wood = new THREE.MeshStandardMaterial({map:woodTex, roughness:.6});
  const darkWood = new THREE.MeshStandardMaterial({map:woodTexture('#7a5433', [50, 30, 14]), roughness:.6});
  const iron = new THREE.MeshStandardMaterial({color:0x26231f, roughness:.45, metalness:.7});

  // ---------- 床 ----------
  const planks = plankTexture();
  planks.wrapS = planks.wrapT = THREE.RepeatWrapping;
  planks.repeat.set(D / 2.2, W / 1.1);
  // 板の向きを奥行き方向にそろえる（板の長手＝平面の横を、部屋の奥行きに向ける）
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(D, W), new THREE.MeshStandardMaterial({map:planks, roughness:.55}));
  floor.rotation.set(-Math.PI / 2, 0, Math.PI / 2); floor.receiveShadow = true;
  g.add(floor);

  // ---------- 壁（奥・左・右） ----------
  const WAIN = 0.92; // 腰壁の高さ
  function wall(len, x, z, ry){
    const w = new THREE.Group();
    const p = new THREE.Mesh(new THREE.PlaneGeometry(len, H), plaster);
    p.position.y = H / 2; p.receiveShadow = true;
    const low = box(len, WAIN, 0.02, sage, 0, WAIN / 2, 0.01); low.receiveShadow = true;
    const cap = box(len, 0.035, 0.035, wood, 0, WAIN + 0.017, 0.018);
    const base = box(len, 0.09, 0.03, wood, 0, 0.045, 0.016);
    w.add(p, low, cap, base);
    w.position.set(x, 0, z); w.rotation.y = ry;
    g.add(w);
  }
  wall(W, 0, -D / 2, 0);
  wall(D, -W / 2, 0, Math.PI / 2);
  wall(D, W / 2, 0, -Math.PI / 2);

  // ---------- 天井と梁、照明 ----------
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({color:0xf3eee4, roughness:1}));
  ceil.rotation.x = Math.PI / 2; ceil.position.y = H;
  g.add(ceil);
  for (const z of [-D / 2 + 0.9, 0, D / 2 - 0.9]) g.add(box(W, 0.14, 0.12, darkWood, 0, H - 0.07, z));

  const shadeMat = new THREE.MeshStandardMaterial({color:0x2f5d50, roughness:.5, side:THREE.DoubleSide});
  const bulbMat = new THREE.MeshBasicMaterial({color:0xfff1d6});
  const glow = glowTexture();
  for (const [x, z] of [[-W / 4, -0.2], [W / 4, -0.2], [0, D / 2 - 0.9]]) {
    const y = H - 0.62;
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.5, 6), iron);
    cord.position.set(x, H - 0.25, z);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.14, 32, 1, true), shadeMat);
    shade.position.set(x, y + 0.05, z);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 12), bulbMat);
    bulb.position.set(x, y, z);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({map:glow, transparent:true, opacity:.32, depthWrite:false, blending:THREE.AdditiveBlending}));
    halo.scale.set(0.42, 0.42, 1); halo.position.set(x, y - 0.02, z);
    g.add(cord, shade, bulb, halo);
  }

  // ---------- 入口の壁（内側と外観） ----------
  const FW = 14, FH = 3.7; // 外観は部屋より広く高い
  const shape = new THREE.Shape();
  // 入口は外枠の切り欠きとして描く（下の辺に接する穴は作れないため）
  shape.moveTo(-FW / 2, 0); shape.lineTo(-DOOR_W / 2, 0); shape.lineTo(-DOOR_W / 2, DOOR_H); shape.lineTo(DOOR_W / 2, DOOR_H); shape.lineTo(DOOR_W / 2, 0);
  shape.lineTo(FW / 2, 0); shape.lineTo(FW / 2, FH); shape.lineTo(-FW / 2, FH); shape.closePath();
  const hole = (x0, y0, x1, y1) => {
    const p = new THREE.Path();
    p.moveTo(x0, y0); p.lineTo(x0, y1); p.lineTo(x1, y1); p.lineTo(x1, y0); p.closePath();
    shape.holes.push(p);
  };
  const WIN = {x:2.0, w:1.4, y0:0.95, y1:2.1};
  for (const s of [-1, 1]) hole(s * WIN.x - WIN.w / 2, WIN.y0, s * WIN.x + WIN.w / 2, WIN.y1);

  const facadeMat = new THREE.MeshStandardMaterial({color:0x2f5d50, roughness:.85});
  const facade = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, {depth:FACADE_T, bevelEnabled:false}), facadeMat);
  facade.position.z = D / 2;
  const lining = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, {depth:0.012, bevelEnabled:false}), plaster);
  lining.position.z = D / 2 - 0.012;
  g.add(facade, lining);

  const zOut = D / 2 + FACADE_T;
  // 入口の枠と、開いた扉
  g.add(box(0.09, DOOR_H + 0.09, FACADE_T + 0.06, wood, -DOOR_W / 2, (DOOR_H + 0.09) / 2, D / 2 + FACADE_T / 2));
  g.add(box(0.09, DOOR_H + 0.09, FACADE_T + 0.06, wood, DOOR_W / 2, (DOOR_H + 0.09) / 2, D / 2 + FACADE_T / 2));
  g.add(box(DOOR_W + 0.09, 0.09, FACADE_T + 0.06, wood, 0, DOOR_H, D / 2 + FACADE_T / 2));
  const glass = new THREE.MeshStandardMaterial({color:0xdfeee8, roughness:.1, metalness:.2, transparent:true, opacity:.16});
  for (const s of [-1, 1]) {
    const leaf = new THREE.Group();
    const lw = DOOR_W / 2 - 0.01;
    leaf.add(box(lw, 0.12, 0.04, wood, s * -lw / 2, 0.06, 0), box(lw, 0.1, 0.04, wood, s * -lw / 2, DOOR_H - 0.07, 0),
      box(0.1, DOOR_H - 0.02, 0.04, wood, s * -0.05, DOOR_H / 2, 0), box(0.1, DOOR_H - 0.02, 0.04, wood, s * -(lw - 0.05), DOOR_H / 2, 0),
      box(lw, 0.07, 0.04, wood, s * -lw / 2, 0.95, 0));
    leaf.add(box(lw - 0.18, DOOR_H - 0.24, 0.008, glass, s * -lw / 2, DOOR_H / 2, 0));
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.028, 16, 12), iron);
    knob.position.set(s * -(lw - 0.05), 1.02, 0.04); leaf.add(knob);
    leaf.position.set(s * DOOR_W / 2, 0, zOut + 0.02);
    leaf.rotation.y = s * 1.75; // 外へ大きく開く
    g.add(leaf);
  }
  // 窓の枠とガラス
  for (const s of [-1, 1]) {
    const cx = s * WIN.x, cy = (WIN.y0 + WIN.y1) / 2, hh = WIN.y1 - WIN.y0, zc = D / 2 + FACADE_T / 2;
    g.add(box(WIN.w + 0.14, 0.07, FACADE_T + 0.05, wood, cx, WIN.y1, zc), box(WIN.w + 0.2, 0.07, FACADE_T + 0.12, wood, cx, WIN.y0, zc + 0.02),
      box(0.07, hh, FACADE_T + 0.05, wood, cx - WIN.w / 2, cy, zc), box(0.07, hh, FACADE_T + 0.05, wood, cx + WIN.w / 2, cy, zc),
      box(0.04, hh, 0.04, wood, cx, cy, zc), box(WIN.w, 0.04, 0.04, wood, cx, cy, zc));
    g.add(box(WIN.w, hh, 0.006, glass, cx, cy, zc));
  }
  // 看板
  const signTex = canvasTexture(1400, 300, (c, w, h) => {
    c.fillStyle = '#f6f1e6'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#2f5d50'; c.lineWidth = 6; c.strokeRect(14, 14, w - 28, h - 28);
    c.textAlign = 'center'; c.fillStyle = '#1d1b18';
    c.font = `600 82px ${FONT}`; c.letterSpacing = '6px'; c.fillText('HOKKAIDO ANIMAL WORLD', w / 2, 150);
    c.font = `500 58px ${FONT}`; c.letterSpacing = '26px'; c.fillStyle = '#2f5d50'; c.fillText('SHOP', w / 2, 240);
  });
  const sign = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.6, 0.05), [facadeMat, facadeMat, facadeMat, facadeMat,
    new THREE.MeshStandardMaterial({map:signTex, roughness:.8}), facadeMat]);
  sign.position.set(0, DOOR_H + 0.62, zOut + 0.03);
  g.add(sign);
  // 外の灯り
  for (const s of [-1, 1]) {
    const x = s * 1.05, y = DOOR_H - 0.25;
    g.add(box(0.05, 0.05, 0.14, iron, x, y + 0.14, zOut + 0.07));
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.075, 20, 14), bulbMat);
    lamp.position.set(x, y, zOut + 0.14);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({map:glow, transparent:true, opacity:.45, depthWrite:false, blending:THREE.AdditiveBlending}));
    halo.scale.set(0.7, 0.7, 1); halo.position.copy(lamp.position);
    g.add(lamp, halo);
  }
  // 外の地面、足ふきマット、鉢植え
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 16), new THREE.MeshStandardMaterial({color:0xcfc6b4, roughness:1}));
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.005, D / 2 + 8); ground.receiveShadow = true;
  g.add(ground);
  g.add(box(1.2, 0.012, 0.6, new THREE.MeshStandardMaterial({color:0x8a6a48, roughness:1}), 0, 0.006, zOut + 0.5));
  const leaf = new THREE.MeshStandardMaterial({color:0x5d8a5e, roughness:.9});
  function plant(x, z, s = 1){
    const p = new THREE.Group();
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.17 * s, 0.13 * s, 0.3 * s, 24), new THREE.MeshStandardMaterial({color:0xb86f4c, roughness:.9}));
    pot.position.y = 0.15 * s; pot.castShadow = true; p.add(pot);
    for (const [dx, dy, dz, r] of [[0, .5, 0, .24], [.12, .7, .05, .18], [-.13, .66, -.04, .19], [.02, .86, -.02, .15]]) {
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(r * s, 1), leaf);
      b.position.set(dx * s, dy * s, dz * s); b.castShadow = true; p.add(b);
    }
    p.position.set(x, 0, z); g.add(p);
  }
  plant(-1.32, zOut + 0.3, 0.8); plant(1.32, zOut + 0.3, 0.7);
  plant(-W / 2 + 0.38, D / 2 - 0.4, 1.15); // 店内の入口わき

  // 中央の敷物
  const rug = new THREE.Mesh(new THREE.CircleGeometry(1.15, 64), new THREE.MeshStandardMaterial({roughness:1, map:canvasTexture(512, 512, c => {
    c.fillStyle = '#3f6b5c'; c.fillRect(0, 0, 512, 512);
    c.strokeStyle = '#e9e1cf'; c.lineWidth = 10; c.beginPath(); c.arc(256, 256, 226, 0, 7); c.stroke();
    c.lineWidth = 3; c.beginPath(); c.arc(256, 256, 204, 0, 7); c.stroke();
  })}));
  rug.rotation.x = -Math.PI / 2; rug.position.set(0, 0.004, -0.3); rug.receiveShadow = true;
  g.add(rug);

  // ---------- 光 ----------
  const key = new THREE.DirectionalLight(0xfff6ea, 1.6);
  key.position.set(0.5, 5, 2.2); key.target.position.set(0, 0, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, {left:-4.2, right:4.2, top:4.2, bottom:-4.2, near:0.5, far:12});
  key.shadow.radius = 5; key.shadow.blurSamples = 12;
  key.shadow.bias = -0.0005; key.shadow.normalBias = 0.01;
  const hemi = new THREE.HemisphereLight(0xfbf8f1, 0xc4b8a4, 1.6);
  const warm = new THREE.PointLight(0xffe2b4, 2.2, 7, 1.6);
  warm.position.set(0, H - 0.7, -0.6);
  scene.add(key, key.target, hemi, warm);

  // 什器を置く場所：壁づけは壁の面・床の高さが原点で、+z が店の内側
  function frame(fx){
    if (fx.wall === 'back') return {x:fx.along || 0, z:-D / 2, ry:0};
    if (fx.wall === 'left') return {x:-W / 2, z:-(fx.along || 0), ry:Math.PI / 2};
    if (fx.wall === 'right') return {x:W / 2, z:(fx.along || 0), ry:-Math.PI / 2};
    const [x, z] = fx.floor || [0, 0];
    return {x, z, ry:THREE.MathUtils.degToRad(fx.turn || 0)};
  }

  return {W, D, H, frame, lights:[key, hemi, warm], mats:{wood, darkWood, iron},
    outside:{pos:new THREE.Vector3(0, 1.5, D / 2 + 6.2), look:new THREE.Vector3(0, 1.0, 0)},
    overview:{pos:new THREE.Vector3(0, 1.55, D / 2 - 0.3), look:new THREE.Vector3(0, 1.2, -D / 2)}};
}
