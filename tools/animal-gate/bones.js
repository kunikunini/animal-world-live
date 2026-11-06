try {
const W = (ms) => new Promise((r) => setTimeout(r, ms))
const $ = (id) => document.getElementById(id)
await W(2500); $('enter').click(); await W(500); { const pb = document.querySelector('#home-pick:not([hidden]) .home-pick-btn'); if (pb) pb.click() }
for (let i = 0; i < 300 && !(document.body.classList.contains('in-world') && $('iris').hidden); i++) await W(100)
const a = window.__awl
let ai; for (let i = 0; i < 200 && !(ai = a.aiLions()[new URLSearchParams(location.hash.slice(1)).get('key')]); i++) await W(100)
let mesh = null; ai.model.traverse((o) => { if (o.isSkinnedMesh) mesh = o })
const bones = mesh.skeleton.bones, si = mesh.geometry.getAttribute('skinIndex'), sw = mesh.geometry.getAttribute('skinWeight'), pos = mesh.geometry.getAttribute('position')
const cnt = {}, box = {}
const v = new (mesh.position.constructor)()
mesh.updateMatrixWorld(true)
for (let i = 0; i < pos.count; i++) { let best = 0, bi = -1; for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > best) { best = w; bi = si.getComponent(i, k) } } const n = bones[bi]?.name; cnt[n] = (cnt[n] || 0) + 1
  v.fromBufferAttribute(pos, i); const b = box[n] || (box[n] = { x: [1e9, -1e9], y: [1e9, -1e9], z: [1e9, -1e9] }); for (const ax of ['x', 'y', 'z']) { b[ax][0] = Math.min(b[ax][0], v[ax]); b[ax][1] = Math.max(b[ax][1], v[ax]) } }
for (const k in box) for (const ax of ['x','y','z']) box[k][ax] = box[k][ax].map((t) => +t.toFixed(2))
return { bones: bones.map((b) => b.name), cnt, box }
} catch (e) { return { err: String(e.stack || e) } }
