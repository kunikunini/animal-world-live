try {
const W = (ms) => new Promise((r) => setTimeout(r, ms))
const F = (n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f) })
const $ = (id) => document.getElementById(id)
await W(2500); $('enter').click(); await W(500); { const pb = document.querySelector('#home-pick:not([hidden]) .home-pick-btn'); if (pb) pb.click() }
for (let i = 0; i < 300 && !(document.body.classList.contains('in-world') && $('iris').hidden); i++) await W(100)
await W(800)
const a = window.__awl
let ai; for (let i = 0; i < 200 && !(ai = a.aiLions()[new URLSearchParams(location.hash.slice(1)).get('key') || 'tiger']); i++) await W(100)
const host = a.lions.find((l) => { let p = ai.model; while (p) { if (p === l.group) return true; p = p.parent } return false })
const g = host.group
a.player.teleport(g.position.x - 10, g.position.z - 10, 0)
host.setReduceMotion(true)
const sw = ai.setWalking; ai.setWalking = () => {}
sw(false); for (let i = 0; i < 400 && ai.walkWeight() > 0; i++) await F(1)
let mesh = null; const bone = {}
g.traverse((o) => { if (o.isBone) bone[o.name] = o; if (o.isSkinnedMesh) mesh = o })
const bones = mesh.skeleton.bones, si = mesh.geometry.getAttribute('skinIndex'), swt = mesh.geometry.getAttribute('skinWeight'), pos = mesh.geometry.getAttribute('position')
const feet = ['backleg2', 'R_backleg2', 'frontleg2', 'R_frontleg2'], tailTip = 'tail3'
const TAILS = ['tail3', 'tail2', 'tail1', 'tail']
const groups = {}
for (let i = 0; i < pos.count; i++) { let best = 0, bi = -1; for (let k = 0; k < 4; k++) { const w = swt.getComponent(i, k); if (w > best) { best = w; bi = si.getComponent(i, k) } } const n = bones[bi]?.name; (groups[n] = groups[n] || []).push(i) }
// 足先の骨に頂点が無い時は、同じ脚の骨（付け根〜すね）全部の頂点で測る（最下点は足のあたり）
for (const f of feet) if (!groups[f]) { const base = f.replace(/2$/, ''); groups[f] = [base, base + '0', base + '1'].flatMap((b) => groups[b] || []); (window.__fallback = window.__fallback || []).push(f) }
const v = new (mesh.position.constructor)()
const TT = TAILS.find((t) => groups[t]); window.__tailBone = TT || null
const minY = (idx) => { if (!idx) return NaN; return minY0(idx) }
const minY0 = (idx) => { let m = Infinity; for (const i of idx) { mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld); if (v.y < m) m = v.y } return m }
const measure = () => { g.updateMatrixWorld(true); const py = g.position.y; const r = { hips: bone.Hips.getWorldPosition(v.clone()).y - py, tail: (minY(groups[TT]) - py) * 100 }; for (const n of feet) r[n] = (minY(groups[n]) - py) * 100; return r }
await F(3)
const rest = measure()
sw(true); for (let i = 0; i < 400 && ai.walkWeight() < 1; i++) await F(1)
ai.action.paused = true
const VARIANTS = JSON.parse(new URLSearchParams(location.hash.slice(1)).get('v'))
const res = []
for (const vv of VARIANTS) {
  Object.assign(ai.posture, vv)
  const rows = []
  for (let k = 0; k <= 16; k++) { ai.action.time = k / 16; await F(3); rows.push(measure()) }
  const lo = (r) => Math.min(...feet.map((n) => r[n]))
  res.push({ v: vv,
    hips: [Math.min(...rows.map((r) => r.hips / rest.hips * 100)).toFixed(1), Math.max(...rows.map((r) => r.hips / rest.hips * 100)).toFixed(1)].join('–'),
    tailMin: Math.min(...rows.map((r) => r.tail)).toFixed(1),
    lowest: [Math.min(...rows.map(lo)).toFixed(1), Math.max(...rows.map(lo)).toFixed(1)].join('〜'),
    frontUp: Math.max(...rows.map((r) => Math.min(r.frontleg2, r.R_frontleg2))).toFixed(1),
    hindUp: Math.max(...rows.map((r) => Math.min(r.backleg2, r.R_backleg2))).toFixed(1),
  })
}
return { fallback: window.__fallback || [], tailBone: TT, groups: Object.fromEntries(Object.entries(groups).map(([k, x]) => [k, x.length])), rest: { hips: rest.hips.toFixed(3), tail: rest.tail.toFixed(1) }, res }
} catch (e) { return { err: String(e.stack || e) } }
