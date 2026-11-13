import * as THREE from 'three';
import {FONT} from './util.js';

// プライスカード：売り場（商品の種類）ごとに1枚。木の台に、生成りのカードを少し寝かせて立てる。
// 置ける台が無い売り場（MORINOA）は、となりの木の柱に貼る（苔の壁には貼らない）。文字は、ショップの価格が読めたら描き直す。
// 置く場所：売り場の id → [x, z, だいたいの高さ, 向き]（その下の面を探して載せる）。'wall' は、売り場の右どなりの木の柱
const SPOTS = {
  'rack-tee': [-3.525, 0.0, 0.74, Math.PI / 2],     // 西のキャビネットの手前のふち
  'rack-mark': [0.6, 1.155, 0.8, 0.12],             // まんなかの台の右手前（たたんだTシャツを奥へ寄せて、あけた所）
  'rack-morinoa': 'wall',
  'shelf-mug': [3.8, 0.42, 0.9, -Math.PI / 2],      // 東の棚の台の上
  'shelf-sticker': [3.8, -0.72, 0.9, -Math.PI / 2],
};
const W = 0.2, H = 0.125, PX = 512, PY = 320;

export function buildPriceCards(group, solid, fixtures){
  const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0), cards = [];
  const base = new THREE.MeshStandardMaterial({color:0x9a6a3c, roughness:.7}), edge = new THREE.MeshStandardMaterial({color:0xe9e0cc, roughness:.9});
  solid.updateWorldMatrix(true, true);
  for (const f of fixtures) {
    const spot = SPOTS[f.id];
    if (!spot) continue;
    const canvas = document.createElement('canvas'); canvas.width = PX; canvas.height = PY;
    const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const face = new THREE.MeshStandardMaterial({map:tex, roughness:.85});
    const card = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.006), [edge, edge, edge, edge, face, edge]);
    const holder = new THREE.Group();
    card.castShadow = true;
    if (spot === 'wall') {   // 壁付け：苔の壁ではなく、売り場の右どなりの木の柱に貼る。柱の面を、売り場の前から探す
      f.group.updateWorldMatrix(true, false);
      const from = f.group.localToWorld(new THREE.Vector3(0.62, (f.height || 1.8) - 0.5, 1.2)), q = f.group.getWorldQuaternion(new THREE.Quaternion());
      ray.set(from, new THREE.Vector3(0, 0, -1).applyQuaternion(q)); ray.far = 2;
      const hit = ray.intersectObject(solid, true).find(h => h.object.visible && h.face && !/moss|leaves/i.test(h.object.material?.name || ''));
      if (hit) {
        const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
        holder.position.copy(hit.point).addScaledVector(n, 0.005);
        holder.lookAt(holder.position.clone().add(n));   // 柱の面の傾き（上下の倒れも）に合わせる
      } else { holder.position.copy(f.group.localToWorld(new THREE.Vector3(0.62, (f.height || 1.8) - 0.5, 0.05))); holder.quaternion.copy(q); }
      card.scale.setScalar(1.5);
      holder.add(card);
    } else {
      const [x, z, y, turn] = spot;
      ray.set(new THREE.Vector3(x, y + 0.4, z), down); ray.far = 0.8;
      const hit = ray.intersectObject(solid, true).find(h => h.object.visible);
      holder.position.set(x, hit ? hit.point.y : y, z); holder.rotation.y = turn;
      const foot = new THREE.Mesh(new THREE.BoxGeometry(W * 0.9, 0.022, 0.05), base); foot.position.y = 0.011; foot.castShadow = true;
      card.position.set(0, 0.018 + H / 2, -0.004); card.rotation.x = -0.2;
      holder.add(foot, card);
      if (f.type !== 'rack') holder.scale.setScalar(1.3);   // 棚の売り場は離れて見るので、少し大きく
    }
    holder.scale.multiplyScalar(0.5);   // カードは小さめ（はじめの大きさの、面積で4分の1）
    group.add(holder);
    cards.push({f, canvas, tex});
  }
  // text(f) → {price, note}。price は大きく、note は小さく下に出す
  return function paint(text){
    for (const {f, canvas, tex} of cards) {
      const g = canvas.getContext('2d'), t = text(f);
      g.fillStyle = '#fbf6e9'; g.fillRect(0, 0, PX, PY);
      g.strokeStyle = '#5f9a4a'; g.lineWidth = 6; g.strokeRect(14, 14, PX - 28, PY - 28);
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#3d2716';
      g.font = `700 52px ${FONT}`; g.fillText(f.label, PX / 2, 78, PX - 60);
      g.fillStyle = '#5f9a4a'; g.fillRect(PX / 2 - 60, 118, 120, 4);
      g.fillStyle = '#1d1b18'; g.font = `700 ${t.note ? 88 : 96}px ${FONT}`; g.fillText(t.price, PX / 2, t.note ? 186 : 204, PX - 60);
      if (t.note) { g.fillStyle = '#7a746b'; g.font = `500 34px ${FONT}`; g.fillText(t.note, PX / 2, 268, PX - 60); }
      tex.needsUpdate = true;
    }
  };
}
