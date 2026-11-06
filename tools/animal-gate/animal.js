try {
const W = (ms) => new Promise((r) => setTimeout(r, ms))
const F = (n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f) })
const $ = (id) => document.getElementById(id)
const KEY = new URLSearchParams(location.hash.slice(1)).get('key') || 'tiger'
const MODE = new URLSearchParams(location.hash.slice(1)).get('mode') || 'all'
await W(7500)
$('enter').click(); await W(500); { const pb = document.querySelector('#home-pick:not([hidden]) .home-pick-btn'); if (pb) pb.click() }
for (let i = 0; i < 300 && !(document.body.classList.contains('in-world') && $('iris').hidden); i++) await W(100)
await W(800)
const a = window.__awl
let ai = null
for (let i = 0; i < 200 && !(ai = a.aiLions()[KEY]); i++) await W(100)
const findHost = (obj) => a.lions.find((l) => { let p = obj; while (p) { if (p === l.group) return true; p = p.parent } return false })
const host = ai ? findHost(ai.model) : a.lions.find((l) => l.id === new URLSearchParams(location.hash.slice(1)).get('id'))
if (!host) return { err: 'no host', keys: Object.keys(a.aiLions()) }
const g = host.group
// 撮影の時だけ、近く（10 m 以内）のほかの子を隠す（群れの子が側面のカメラをふさぐため）
for (const l of a.lions) if (l !== host && l.group.position.distanceTo(host.group.position) < 10) l.group.visible = false
const pl = a.player
const p0 = g.position.clone()
pl.teleport(p0.x - Math.sin(g.rotation.y) * 10, p0.z - Math.cos(g.rotation.y) * 10, 0)
await W(1500); await F(5)
const imgs = {}
const cam = (f, r, u, lookUp, dist) => {
  const p = g.position, yaw = g.rotation.y
  const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw)
  pl.setCameraOverride({ position: { x: p.x + (fx * f + rx * r) * dist, y: p.y + u, z: p.z + (fz * f + rz * r) * dist }, lookAt: { x: p.x, y: p.y + lookUp, z: p.z } })
}
const S = g.scale.y
const out = { scale: S, pos: [p0.x, p0.y, p0.z].map((v) => +v.toFixed(2)), clips: ai?.clipNames, clipSpeed: ai?.clipSpeed, posture: ai?.posture }
// 静止の4方向（歩行を止めて立ち姿）
if (ai) { ai.setWalking(false); const sw = ai.setWalking; ai.setWalking = () => {}; out._sw = !!sw; window.__sw = sw }
if (ai) for (let i = 0; i < 400 && ai.walkWeight() > 0; i++) await F(1)
await W(300); await F(4)
const VIEWS = { front: [1, 0], diag: [0.707, 0.707], side: [0, 1], opposite: [0, -1] }
const HP = new URLSearchParams(location.hash.slice(1)); const D = Number(HP.get('d') || 5.5) * Math.max(1, S); const DW = Number(HP.get('dw') || 4) * Math.max(1, S); const CU = Number(HP.get('cu') || 1.4); const WS = Number(HP.get('ws') || 1)
const VP = g.position.clone(), VR = g.rotation.y
const hold = () => { g.position.copy(VP); g.rotation.y = VR; g.updateMatrixWorld(true) }
if (MODE !== 'walk') for (const [k, [f, r]] of Object.entries(VIEWS)) { hold(); cam(f, r, CU, CU * 0.4, D); await F(4); await W(200); hold(); cam(f, r, CU, CU * 0.4, D); imgs['view-' + k] = a.capture(0.9) }
if (ai && MODE !== 'views') {
  // 計測: 骨と頂点
  let mesh = null; const bone = {}
  g.traverse((o) => { if (o.isBone) bone[o.name] = o; if (o.isSkinnedMesh) mesh = o })
  out.bones = Object.keys(bone)
  const bones = mesh.skeleton.bones, si = mesh.geometry.getAttribute('skinIndex'), sw = mesh.geometry.getAttribute('skinWeight'), pos = mesh.geometry.getAttribute('position')
  const tails = Object.keys(bone).filter((n) => /tail/i.test(n))
  const tailTip = tails.sort((x, y) => (parseInt(y.replace(/\D/g, '') || '0') - parseInt(x.replace(/\D/g, '') || '0')))[0]
  const feet = Object.keys(bone).filter((n) => /leg2$/i.test(n))
  const TAILS = [...tails]
  const groups = {}
  for (let i = 0; i < pos.count; i++) { let best = 0, bi = -1; for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > best) { best = w; bi = si.getComponent(i, k) } } const n = bones[bi]?.name; (groups[n] = groups[n] || []).push(i) }
  for (const f of feet) if (!groups[f]) { const base = f.replace(/2$/, ''); groups[f] = [base, base + '0', base + '1'].flatMap((b) => groups[b] || []); (out.fallback = out.fallback || []).push(f) }
  const v = new (mesh.position.constructor)()
  const TT = TAILS.find((t) => groups[t]); window.__tailBone = TT || null
const minY = (idx) => { if (!idx) return NaN; return minY0(idx) }
const minY0 = (idx) => { let m = Infinity; for (const i of idx || []) { mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld); if (v.y < m) m = v.y } return m }
  const hipsB = bone.Hips || Object.values(bone).find((b) => /hips/i.test(b.name))
  const measure = () => { g.updateMatrixWorld(true); const py = g.position.y; const r = { hips: hipsB.getWorldPosition(v.clone()).y - py, tail: (minY(groups[TT]) - py) * 100 }; for (const n of feet) r[n] = (minY(groups[n]) - py) * 100; return r }
  out.tailTip = TT; out.feet = feet
  const proj = (x, y, z) => { const q = new (mesh.position.constructor)(x, y, z).project(a.camera); return [+((q.x + 1) / 2 * innerWidth).toFixed(1), +((1 - q.y) / 2 * innerHeight).toFixed(1)] }
  out.marks = {}
  const mark = (name, restH) => { g.updateMatrixWorld(true); const hp = hipsB.getWorldPosition(v.clone()); out.marks[name] = { hip: proj(hp.x, hp.y, hp.z), line: [proj(hp.x - 1.2 * Math.cos(g.rotation.y), g.position.y + restH, hp.z + 1.2 * Math.sin(g.rotation.y)), proj(hp.x + 1.2 * Math.cos(g.rotation.y), g.position.y + restH, hp.z - 1.2 * Math.sin(g.rotation.y))] } }
  host.setReduceMotion(true); await F(3)
  const P0 = g.position.clone(), R0 = g.rotation.y
  const freeze = () => { g.position.copy(P0); g.rotation.y = R0; g.updateMatrixWorld(true) }
  freeze()
  const rest = measure(); out.rest = Object.fromEntries(Object.entries(rest).map(([k, x]) => [k, +x.toFixed(3)]))
  cam(0, WS, CU * 0.65, CU * 0.33, DW); await F(3); await W(200); imgs['walk-rest'] = a.capture(0.9); mark('walk-rest', rest.hips)
  // 歩行の重みを 1 に
  window.__sw(true); for (let i = 0; i < 400 && ai.walkWeight() < 1; i++) await F(1); out.ww = ai.walkWeight()
  ai.action.paused = true
  const rows = []
  for (let k = 0; k <= 16; k++) {
    ai.action.time = k / 16
    await F(3)
    freeze()
    const m = measure()
    rows.push({ t: +(k / 16).toFixed(4), hipsPct: +((m.hips / rest.hips) * 100).toFixed(1), tail: +m.tail.toFixed(1), ...Object.fromEntries(feet.map((n) => [n, +m[n].toFixed(1)])) })
    if (k % 2 === 0) { cam(0, WS, CU * 0.65, CU * 0.33, DW); await F(2); freeze(); imgs['walk-' + String(k / 2).padStart(2, '0')] = a.capture(0.9); mark('walk-' + String(k / 2).padStart(2, '0'), rest.hips) }
  }
  out.rows = rows
  const fl = feet.filter((n) => /front/i.test(n)), hl = feet.filter((n) => /back/i.test(n))
  out.summary = {
    hipsPct: [Math.min(...rows.map((r) => r.hipsPct)), Math.max(...rows.map((r) => r.hipsPct))],
    tailMin: Math.min(...rows.map((r) => r.tail)),
    lowestFoot: [Math.min(...rows.map((r) => Math.min(...feet.map((n) => r[n])))), Math.max(...rows.map((r) => Math.min(...feet.map((n) => r[n]))))],
    frontBothUpMax: Math.max(...rows.map((r) => Math.min(...fl.map((n) => r[n])))),
    hindBothUpMax: Math.max(...rows.map((r) => Math.min(...hl.map((n) => r[n])))),
    allUp: rows.filter((r) => Math.min(...feet.map((n) => r[n])) > 1).length,
  }
  ai.action.paused = false
}
out.imgs = imgs
out.draw = a.renderer.info.render.calls
delete out.bones
return out
} catch (e) { return { err: String(e && e.stack || e) } }
