# 使い方: python3 -I tools/animal-gate/fix-legs.py <in.glb> <out.glb> [front|back|both]
# 脚の骨の癒着を資産側で直す。脚の骨（左＝接頭なし・x が正、右＝R_・x が負）のウェイトのうち、
# 反対側（x の符号が逆）の頂点に付いている分を 0 にして、残りを足して 1 に正規化する。
# 体の中心の近く（|x| が x の最大の 5% 未満）の頂点は触らない。
# 脚の骨のウェイトしか無かった頂点で、全部 0 になったものは、同じ段の反対側の骨（frontleg1 → R_frontleg1）へ移す。
# Meshy の生の GLB（圧縮なし、WEIGHTS_0 は float）だけを扱う。最適化はこのあと gltf-transform で行う
import json, struct, sys
import numpy as np

src, dst = sys.argv[1], sys.argv[2]
which = sys.argv[3] if len(sys.argv) > 3 else 'front'
prefixes = {'front': ['frontleg'], 'back': ['backleg'], 'both': ['frontleg', 'backleg']}[which]

b = bytearray(open(src, 'rb').read())
jl = struct.unpack('<I', b[12:16])[0]
J = json.loads(b[20:20 + jl])
bin_off = 20 + jl + 8  # BIN チャンクの中身の先頭

def view(acc_i, dtype, ncomp):
    a = J['accessors'][acc_i]
    bv = J['bufferViews'][a['bufferView']]
    off = bin_off + bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    assert bv.get('byteStride') in (None, np.dtype(dtype).itemsize * ncomp), 'stride あり未対応'
    return np.frombuffer(b, dtype=dtype, count=a['count'] * ncomp, offset=off).reshape(a['count'], ncomp), off

skin = J['skins'][0]
names = [J['nodes'][j]['name'] for j in skin['joints']]
idx = {n: i for i, n in enumerate(names)}

def side_of(name):
    """+1 = 左（接頭なし）、-1 = 右（R_）、0 = 脚の骨ではない"""
    base = name[2:] if name.startswith('R_') else name
    if not any(base.startswith(p) for p in prefixes):
        return 0
    return -1 if name.startswith('R_') else 1

def mirror(name):
    return name[2:] if name.startswith('R_') else 'R_' + name

side = np.array([side_of(n) for n in names])
prim = J['meshes'][0]['primitives'][0]
assert J['accessors'][prim['attributes']['WEIGHTS_0']]['componentType'] == 5126, 'WEIGHTS_0 が float でない'
jt = {5121: np.uint8, 5123: np.uint16}[J['accessors'][prim['attributes']['JOINTS_0']]['componentType']]
pos, _ = view(prim['attributes']['POSITION'], np.float32, 3)
joints, joff = view(prim['attributes']['JOINTS_0'], jt, 4)
weights, woff = view(prim['attributes']['WEIGHTS_0'], np.float32, 4)
joints = joints.copy()
weights = weights.copy()

x = pos[:, 0]
eps = 0.05 * np.abs(x).max()
vside = np.where(x > eps, 1, np.where(x < -eps, -1, 0))

changed = moved = 0
removed_by_bone = {}
for i in range(len(x)):
    if vside[i] == 0:
        continue
    w = weights[i].copy()
    js = joints[i]
    bad = [k for k in range(4) if w[k] > 0 and side[js[k]] != 0 and side[js[k]] != vside[i]]
    if not bad:
        continue
    changed += 1
    for k in bad:
        removed_by_bone[names[js[k]]] = removed_by_bone.get(names[js[k]], 0) + 1
    if w.sum() - sum(w[k] for k in bad) <= 1e-6:
        # 残りが無い: 反対側の同じ段の骨へ移す
        for k in bad:
            joints[i][k] = idx[mirror(names[js[k]])]
        moved += 1
    else:
        for k in bad:
            w[k] = 0
        weights[i] = w / w.sum()

b[joff:joff + joints.nbytes] = joints.astype(jt).tobytes()
b[woff:woff + weights.nbytes] = weights.astype(np.float32).tobytes()
open(dst, 'wb').write(b)
print(json.dumps({'verts': int(len(x)), 'eps': float(eps), 'changed': changed, 'moved_to_mirror': moved,
                  'removed_by_bone': removed_by_bone}, ensure_ascii=False))
