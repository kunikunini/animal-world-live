import * as THREE from 'three';

// 動物の置物：レジの後ろの壁画と同じ、粘土でこねたような丸い動物たち（ライオン・白いオオカミ・カピバラ・ミーアキャット・カンガルー・バク・インコ）。
// 粘土の絵（assets/figurines/、tools/make-figurines.py で整える）がある動物は、その絵を切り抜いて立てる（下の cardFigure）。
// 絵が無い動物（スコップなど）は、球とカプセルを組み合わせて、その場で作る。飾りで、商品ではない。
// 向き：前が +z、足もとが y=0。大きさは、高さ 15〜25cm くらいを基準に作って、置くときに scale で決める。
const INK = '#1d1b18';

function kit(){
  // 粘土の表面：こまかいでこぼこ
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'); let seed = 77;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  g.fillStyle = '#808080'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 1400; i++) { const v = Math.round(90 + rnd() * 90); g.fillStyle = `rgb(${v},${v},${v})`; g.beginPath(); g.arc(rnd() * 128, rnd() * 128, 1 + rnd() * 2.2, 0, 6.283); g.fill(); }
  const bump = new THREE.CanvasTexture(c); bump.wrapS = bump.wrapT = THREE.RepeatWrapping; bump.repeat.set(3, 2);
  const mats = new Map();
  const mat = col => {   // 目・鼻の黒は、つやのある玉。ほかは、ざらっとした粘土
    if (!mats.has(col)) mats.set(col, col === INK ? new THREE.MeshStandardMaterial({color:col, roughness:.22}) : new THREE.MeshStandardMaterial({color:col, roughness:.95, bumpMap:bump, bumpScale:2.0}));
    return mats.get(col);
  };
  const arcs = new Map();
  const SPHERE = new THREE.SphereGeometry(1, 22, 16), CONE = new THREE.ConeGeometry(1, 1, 14);
  const caps = new Map();
  return root => {
    const add = (geo, col, p, s, r) => {
      const m = new THREE.Mesh(geo, mat(col)); m.position.set(...p); m.scale.set(...s); if (r) m.rotation.set(...r);
      m.castShadow = true; root.add(m); return m;
    };
    return {
      ball:(r, col, p, s = [1, 1, 1], rot) => add(SPHERE, col, p, s.map(v => v * r), rot),   // 球（s でつぶす）
      cap:(r, len, col, p, rot) => {   // カプセル（手足・しっぽ）。もとは縦向き
        const k = r + '/' + len; if (!caps.has(k)) caps.set(k, new THREE.CapsuleGeometry(r, len, 6, 12));
        return add(caps.get(k), col, p, [1, 1, 1], rot);
      },
      cone:(r, h, col, p, rot) => add(CONE, col, p, [r, h, r], rot),   // 円すい（耳・くちばし）。もとは上向き
      eyes:(x, y, z, r = 0.009) => { for (const sx of [-1, 1]) {   // 黒い目に、小さな白い光
        add(SPHERE, INK, [sx * x, y, z], [r, r, r]); add(SPHERE, '#ffffff', [sx * x + r * 0.35, y + r * 0.4, z + r * 0.75], [r * 0.3, r * 0.3, r * 0.3]); } },
      // にっこりした口（下向きの弧）。w を付けると、イラストと同じ「ω」の形（弧を2つ並べる）
      smile:(y, z, r, w = false, col = '#5a3a22') => {
        if (!arcs.has(r)) arcs.set(r, new THREE.TorusGeometry(r, r * 0.16, 6, 14, Math.PI));
        for (const x of w ? [-r, r] : [0]) add(arcs.get(r), col, [x, y, z], [1, 1, 1], [0, 0, Math.PI]);
      },
      // 細い線（ひげ）：a から b へ
      line:(a, b, r, col) => {
        const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), len = A.distanceTo(B);
        const m = add(new THREE.CylinderGeometry(r, r, len, 5), col, A.clone().lerp(B, .5).toArray(), [1, 1, 1]);
        m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.sub(A).normalize());
      },
      pair:fn => { for (const sx of [-1, 1]) fn(sx); },
      cyl:(r, h, col, p, rot, s = [1, 1, 1]) => add(new THREE.CylinderGeometry(r, r, h, 24), col, p, s, rot),   // 円柱。もとは縦向き
      ring:(R, tube, col, p, rot) => add(new THREE.TorusGeometry(R, tube, 10, 28), col, p, [1, 1, 1], rot),      // 輪。もとは正面向き
      put:m => { root.add(m); return m; },
    };
  };
}

const ANIMALS = {
  // ライオン：花びらのたてがみ、黄色い丸顔、クリーム色の口もと、ひげ3本ずつ
  lion(k){
    const body = '#f5a623', mane = '#e2662c', face = '#f7b733', cream = '#fbe6bd';
    k.ball(.095, body, [0, .105, -.08], [.78, .72, 1.2]);
    k.pair(s => { k.cap(.03, .045, body, [s * .05, .045, .0]); k.cap(.03, .045, body, [s * .05, .045, -.16]); });
    k.cap(.011, .1, body, [0, .15, -.22], [-.9, 0, 0]); k.ball(.024, mane, [0, .2, -.275]);
    for (let i = 0; i < 9; i++) { const a = i / 9 * 6.283 + .35; k.ball(.056, mane, [Math.cos(a) * .1, .185 + Math.sin(a) * .1, .05], [1, 1, .5]); }   // 花びら
    k.ball(.088, face, [0, .185, .075], [1, 1, .55]);
    k.pair(s => { k.ball(.028, face, [s * .058, .262, .075], [1, 1, .5]); k.ball(.016, '#e89a2a', [s * .058, .262, .088], [1, 1, .4]); });
    k.ball(.04, cream, [0, .165, .112], [1.25, .85, .5]);
    k.ball(.014, '#6b3f22', [0, .182, .132], [1.2, .8, .8]);
    k.smile(.166, .134, .011, true);
    k.eyes(.036, .212, .121, .01);
    k.pair(s => { for (const dy of [-.012, 0, .012]) k.line([s * .03, .168 + dy * .4, .128], [s * .082, .168 + dy * 1.6, .112], .0016, '#5a3a22'); });
  },
  // カピバラ：オレンジがかった茶色、四角い大きな鼻づら、小さな耳
  capybara(k){
    const body = '#d6904c', dark = '#b8763a';
    k.ball(.095, body, [0, .09, -.04], [.85, .82, 1.25]);
    k.ball(.066, body, [0, .13, .095], [.92, .9, 1.1]);
    k.ball(.05, body, [0, .112, .155], [1, .86, .8]);
    k.pair(s => { k.ball(.006, '#5a3a22', [s * .014, .128, .196]); k.ball(.017, dark, [s * .042, .186, .06], [1, 1, .6]);
      k.cap(.024, .028, dark, [s * .048, .032, .045]); k.cap(.024, .028, dark, [s * .048, .032, -.115]); });
    k.smile(.1, .19, .013);
    k.eyes(.04, .158, .135, .009);
  },
  // ミーアキャット：目のまわりの濃い茶色、クリーム色の顔とおなか、立ち姿
  meerkat(k){
    const body = '#dcae72', cream = '#f5e6c4', mask = '#6b4a30';
    k.cap(.042, .09, body, [0, .09, 0]);
    k.ball(.036, cream, [0, .092, .022], [.82, 1.5, .6]);
    k.ball(.046, body, [0, .185, .005], [1.05, .92, 1]);
    k.ball(.034, cream, [0, .176, .026], [1, .8, .8]);
    k.ball(.009, INK, [0, .178, .056]);
    k.smile(.168, .052, .008);
    k.pair(s => { k.ball(.016, mask, [s * .022, .194, .036], [1, 1.1, .5]); k.ball(.011, mask, [s * .042, .212, 0]);
      k.cap(.011, .04, body, [s * .038, .108, .03], [.5, 0, 0]); k.ball(.017, body, [s * .022, .012, .02], [1, .6, 1.4]); });
    k.eyes(.022, .195, .045, .0075);
    k.cap(.011, .095, body, [0, .03, -.07], [1.2, 0, 0]); k.ball(.013, mask, [0, .014, -.118]);
  },
  // 白いオオカミ：羽のように重なる毛、ピンクの耳、黒い鼻
  wolf(k){
    const fur = '#f5edd9', white = '#fffaf0', shade = '#e6dcc4';
    k.ball(.088, fur, [0, .088, -.02], [.88, 1, 1]);
    k.ball(.058, white, [0, .112, .045], [.85, 1, .7]);
    for (let row = 0; row < 4; row++) for (let i = 0; i < 6; i++) {   // 毛の房：うろこのように、上の段が下の段に重なる
      const a = (i + (row % 2) * .5) / 6 * Math.PI * 1.5 + Math.PI * .75, y = .15 - row * .032, r = .074 + row * .006;
      k.ball(.03, row % 2 ? fur : shade, [Math.sin(a) * r, y, -.02 + Math.cos(a) * r], [.8, 1.15, .45], [.5, a, 0]);
    }
    for (const [x, y] of [[-.022, .1], [.022, .1], [0, .078]]) k.ball(.024, white, [x, y, .082], [.8, 1.1, .5], [-.3, 0, 0]);   // 胸の毛
    k.ball(.062, fur, [0, .198, .04]);
    k.pair(s => { k.ball(.026, fur, [s * .052, .178, .04], [1.2, .9, .6], [0, 0, s * .6]);   // ほおの毛
      k.cone(.024, .06, fur, [s * .037, .262, .028]); k.cone(.013, .038, '#f3b4ab', [s * .037, .258, .037]); k.cap(.019, .07, fur, [s * .036, .05, .068]); });
    k.ball(.032, white, [0, .184, .095], [.85, .72, 1.25]);
    k.ball(.012, INK, [0, .193, .134]);
    k.smile(.176, .128, .011);
    k.eyes(.026, .214, .09, .0085);
    for (let i = 0; i < 4; i++) k.ball(.032 - i * .003, i % 2 ? shade : fur, [.07 + i * .014, .04 + i * .012, -.07 - i * .022], [.8, .8, 1.2], [0, .5, 0]);   // ふさふさのしっぽ
  },
  // カンガルー：長い耳（内がピンク）、クリーム色のおなか、大きな後ろあし、太いしっぽ
  kangaroo(k){
    const body = '#cf9f6c', cream = '#f2dfc2', pink = '#f0b6a8';
    k.ball(.074, body, [0, .1, -.012], [.85, 1.25, .92]);
    k.ball(.048, cream, [0, .094, .036], [.8, 1.35, .6]);
    k.ball(.044, body, [0, .215, .028], [.92, .95, 1.1]);
    k.ball(.026, body, [0, .204, .07], [.82, .78, 1.2]);
    k.ball(.01, '#5a3a22', [0, .21, .098]);
    k.smile(.196, .088, .009);
    k.eyes(.025, .228, .062, .0078);
    k.pair(s => { k.cap(.014, .06, body, [s * .026, .285, .012], [0, 0, -s * .2]); k.cap(.0075, .044, pink, [s * .026, .285, .022], [0, 0, -s * .2]);
      k.cap(.012, .04, body, [s * .042, .13, .052], [.9, 0, 0]);
      k.ball(.042, body, [s * .052, .06, -.02], [.6, 1, 1.15]);   // 太もも
      k.ball(.021, body, [s * .04, .015, .045], [.8, .6, 2.3]); });
    k.cap(.022, .15, body, [0, .032, -.125], [1.38, 0, 0]);
  },
  // バク：灰色がかった茶色、下へのびる鼻、ふちが白い丸い耳
  tapir(k){
    const body = '#8c7466', rim = '#f1e7d4';
    k.ball(.09, body, [0, .105, -.04], [.82, .82, 1.3]);
    k.ball(.056, body, [0, .135, .1], [.88, .88, 1.1]);
    k.cap(.022, .05, body, [0, .1, .16], [1.0, 0, 0]);
    k.cap(.019, .02, body, [0, .066, .19], [.2, 0, 0]);
    k.smile(.092, .15, .01, false, '#5a463c');
    k.eyes(.034, .152, .14, .0085);
    k.pair(s => { k.ball(.021, body, [s * .04, .192, .07], [1, 1, .6]); k.ball(.014, rim, [s * .04, .194, .081], [1, 1, .4]);
      k.cap(.024, .045, body, [s * .048, .042, .04]); k.cap(.024, .045, body, [s * .048, .042, -.115]); });
  },
  // インコ：赤い体、黄・青・赤の羽が重なる翼、白い顔、クリーム色のくちばし
  parrot(k){
    const red = '#e2452f', yellow = '#f4c430', blue = '#2f6fd0', cream = '#f6ecd0';
    k.ball(.046, red, [0, .068, 0], [.88, 1.3, .92]);
    k.ball(.037, red, [0, .136, .012]);
    k.pair(s => { k.ball(.018, cream, [s * .021, .139, .03], [.6, 1, 1]);
      for (let i = 0; i < 3; i++) k.ball(.02, [yellow, blue, red][i], [s * (.044 + i * .003), .092 - i * .026, -.004 - i * .012], [.35, 1.25, .85], [-.25, 0, s * .12]);   // 翼の羽：黄→青→赤
      k.ball(.01, '#8a8a8a', [s * .016, .006, .012]); });
    k.eyes(.029, .141, .038, .0065);
    k.cone(.016, .034, cream, [0, .129, .052], [2.0, 0, 0]); k.ball(.007, '#6f6f6f', [0, .113, .062]);
    for (const [x, col, rx] of [[.012, red, -.45], [-.012, blue, -.55], [0, yellow, -.65]]) k.cap(.011, .07, col, [x, .02, -.05], [rx, 0, 0]);   // 尾羽
  },

  // スコップ：別アプリ「ANIMAL WORLD LIVE」の案内役。シルクハットをかぶった青い双眼鏡の子（赤い手袋とパンツ、白いベルト、黒いくつ、親指を立てている）
  scop(k){
    const blue = '#1f35d6', red = '#e03a2e', white = '#f7f3ea', black = '#1d1b18';
    k.pair(s => { k.ball(.036, black, [s * .046, .022, .016], [1, .6, 1.4]); k.cyl(.024, .02, black, [s * .042, .052, 0]); k.cap(.016, .04, white, [s * .041, .088, 0]); });
    k.ball(.07, red, [0, .132, 0], [1.05, .6, .8]);
    k.cyl(.073, .016, white, [0, .16, 0], null, [1, 1, .8]); k.ball(.014, '#b9bcc0', [0, .16, .058], [1.3, .9, .35]);
    k.ball(.076, blue, [0, .2, 0], [1, .8, .8]);
    k.ball(.05, blue, [0, .262, 0], [1.1, 1, .9]);
    k.pair(s => {
      const x = s * .068;
      k.cyl(.07, .09, blue, [x, .265, 0], [Math.PI / 2, 0, 0]);          // 筒
      k.cyl(.05, .03, black, [x, .265, -.056], [Math.PI / 2, 0, 0]);     // 目当て
      k.ring(.052, .01, black, [x, .265, .047]);                         // レンズのふち
      k.ball(.046, white, [x, .265, .046], [1, 1, .22]);                  // レンズ（白目）
      k.ball(.012, INK, [x - s * .008, .262, .058]);                       // 黒目
      k.ball(.03, red, [s * .088, .328, 0], [1.3, .35, .9], [0, 0, -s * .45]);
    });
    k.cyl(.022, .03, red, [0, .336, .02], [Math.PI / 2, 0, 0]);          // ピントのつまみ
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#f7f3ea'; g.beginPath(); g.arc(64, 64, 64, 0, 6.283); g.fill();
    g.fillStyle = '#e03a2e'; g.beginPath(); g.arc(64, 64, 50, 0, 6.283); g.fill();
    g.fillStyle = '#f7f3ea'; g.font = '800 78px "Fredoka","Zen Maru Gothic",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('S', 64, 69);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const badge = k.put(new THREE.Mesh(new THREE.CircleGeometry(.019, 24), new THREE.MeshStandardMaterial({map:tex, roughness:.8})));
    badge.position.set(0, .336, .0362);
    k.ball(.03, white, [0, .2, .06], [1.3, .8, .4]); k.smile(.203, .073, .012, false, INK);   // 口もと
    k.cap(.013, .06, white, [-.1, .165, 0], [0, 0, -.5]); k.ball(.027, red, [-.092, .128, .02]);   // 腰に当てた手
    k.cap(.013, .06, white, [.105, .215, 0], [0, 0, -1.0]); k.ball(.029, red, [.142, .25, 0]); k.cap(.0095, .022, red, [.142, .285, 0]);   // 親指を立てた手
    const tilt = [0, 0, .3];   // かたむけてかぶったシルクハット
    k.cyl(.05, .008, black, [-.085, .34, 0], tilt); k.cyl(.0345, .014, red, [-.0886, .3515, 0], tilt); k.cyl(.033, .06, black, [-.0965, .377, 0], tilt);
  },
};

// 置く場所：[動物, x, z, だいたいの高さ（その下の面を探して、ぴったり載せる）, 向き（0＝入口向き）, 大きさ]
const SPOTS = [
  ['wolf', -3.74, 1.63, 0.95, 1.23, 1.3],      // 西のキャビネット（Tシャツの棚）の上、入口側の端。店内のまんなかを向く
  ['lion', -1.27, -2.2, 0.95, 0.3, 1.3],       // レジの台の左はし
  ['meerkat', -0.715, 0.8, 0.8, 0.35, 1.15],    // まんなかの台のはし
  ['capybara', 3.35, 2.05, 0.62, -1.9, 1.45],  // 東の丸いす
  ['parrot', 3.95, 0.3, 2.47, -1.57, 1.7],     // 東の棚のいちばん上（マグカップの棚の、向かって左はし）
  ['kangaroo', -3.08, 6.1, 0.51, 0.35, 1.7],   // 外のベンチ
  ['tapir', -2.4, 6.1, 0.51, 0.1, 1.6],        // 外のベンチ
  ['scop', 3.9, -1.25, 0.9, -1.57, 0.8],       // ステッカーの棚の左下（東の棚の台の上）
];

// 粘土の絵の置物：壁画と同じ粘土の質感で描いた絵（assets/figurines/<動物>.webp、背景は透明）を、輪郭で切り抜いて立てる。
// 板だとわからないよう、いつも見る人のほうへ向く（上下は傾けない）。絵がある動物は、球とカプセルの置物の代わりにこちらを使う。
// 高さ（m）：台やいすの上に置いて、ちょうどよく見える大きさ
const CARD_H = {wolf:0.36, lion:0.32, meerkat:0.27, capybara:0.25, parrot:0.26, kangaroo:0.42, tapir:0.27};
const CARDS = 'assets/figurines/';
async function loadCards(){
  try {
    const ratio = await (await fetch(CARDS + 'figurines.json')).json();
    const loader = new THREE.TextureLoader(), out = {};
    await Promise.all(Object.keys(ratio).filter(k => CARD_H[k]).map(async k => {
      const tex = await loader.loadAsync(CARDS + k + '.webp').catch(() => null);
      if (!tex) return;
      tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
      out[k] = {tex, ratio:ratio[k]};
    }));
    return out;
  } catch { return {}; }
}
const yawTo = new THREE.Vector3();
function cardFigure(name, card){
  const h = CARD_H[name], w = h * card.ratio;
  const geo = new THREE.PlaneGeometry(w, h); geo.translate(0, h / 2, 0);
  // 絵には光と影が描きこんであるので、店の明かりで暗くなりすぎないよう、少しだけ自分で光らせる
  const mat = new THREE.MeshLambertMaterial({map:card.tex, alphaTest:0.5, side:THREE.DoubleSide, emissive:0xffffff, emissiveMap:card.tex, emissiveIntensity:0.5});
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.onBeforeRender = (r, s, cam) => {   // 見る人（カメラ）のほうへ向ける
    mesh.parent.getWorldPosition(yawTo);
    const yaw = Math.atan2(cam.position.x - yawTo.x, cam.position.z - yawTo.z);
    if (Math.abs(mesh.rotation.y - yaw) > 1e-4) { mesh.rotation.y = yaw; mesh.updateMatrixWorld(); }
  };
  const fig = new THREE.Group(); fig.add(mesh);
  return fig;
}

// solid：店のモデル（置く面の高さを、上から下へ調べるのに使う）
export async function addFigurines(group, solid){
  const make = kit(), ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0);
  const cards = await loadCards();
  solid.updateWorldMatrix(true, true);
  for (const [name, x, z, y, turn, scale] of SPOTS) {
    let fig;
    if (cards[name]) fig = cardFigure(name, cards[name]);
    else { fig = new THREE.Group(); ANIMALS[name](make(fig)); fig.rotation.y = turn; fig.scale.setScalar(scale); }
    ray.set(new THREE.Vector3(x, y + 0.45, z), down); ray.far = 0.9;
    const hit = ray.intersectObject(solid, true).find(h => h.object.visible);
    fig.position.set(x, hit ? hit.point.y : y, z);
    fig.name = 'figurine-' + name;
    group.add(fig);
  }
}
