"""
Meshy の GLB（最適化前・圧縮なし）で、名前の無い骨（Bone_*）に乗っている頂点の重みを頭の骨へ移し、1 頂点の重みの合計を 1 に戻す。
三つ編みの子（braids）のリグでは、三つ編みの骨 9 本が頭ではなく背骨（Spine2）にぶら下がり、アニメでは動かないのに
帽子と頭の頂点の一部にも重みが乗っていて、動くと帽子がずれる。骨そのものは残す（動かないので、重みが無くなれば影響しない）。

使い方: python3 -I move-weights-to-head.py <in.glb> <out.glb> [--min-y <高さ>]
  --min-y: この高さ（メッシュの座標、m）より上の頂点だけ移す（背中側に影響が出る時に首から上へ絞る）
"""
import json
import struct
import sys

import numpy as np


def main() -> None:
    args = sys.argv[1:]
    src, dst = args[0], args[1]
    min_y = float(args[args.index('--min-y') + 1]) if '--min-y' in args else None

    data = bytearray(open(src, 'rb').read())
    json_len = struct.unpack('<I', data[12:16])[0]
    gltf = json.loads(data[20:20 + json_len])
    bin_head = 20 + json_len
    bin_len = struct.unpack('<I', data[bin_head:bin_head + 4])[0]
    bin_start = bin_head + 8

    comps = {5121: np.uint8, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
    sizes = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}

    def view(index: int) -> np.ndarray:
        acc = gltf['accessors'][index]
        bv = gltf['bufferViews'][acc['bufferView']]
        if bv.get('byteStride') not in (None, np.dtype(comps[acc['componentType']]).itemsize * sizes[acc['type']]):
            raise SystemExit('interleaved accessors are not supported')
        if acc.get('normalized') and acc['componentType'] != 5126:
            raise SystemExit('normalized integer weights are not supported')
        start = bin_start + bv.get('byteOffset', 0) + acc.get('byteOffset', 0)
        n = sizes[acc['type']]
        return np.frombuffer(data, dtype=comps[acc['componentType']], count=acc['count'] * n, offset=start).reshape(acc['count'], n)

    nodes = gltf['nodes']
    skin = gltf['skins'][0]
    names = [nodes[j].get('name', '') for j in skin['joints']]
    head = next(i for i, n in enumerate(names) if n in ('mixamorig:Head', 'mixamorigHead'))
    extra = {i for i, n in enumerate(names) if n.startswith('Bone_')}
    print('joints', len(names), 'head index', head, 'extra', sorted(names[i] for i in extra))

    total = 0
    for mesh in gltf['meshes']:
        for prim in mesh['primitives']:
            attrs = prim['attributes']
            pos = view(attrs['POSITION']).astype(np.float64)
            joints = view(attrs['JOINTS_0']).copy()
            weights = view(attrs['WEIGHTS_0']).astype(np.float64).copy()
            is_extra = np.isin(joints, list(extra)) & (weights > 0)
            target = is_extra.any(axis=1)
            if min_y is not None:
                target &= pos[:, 1] >= min_y
            moved = (weights * is_extra).sum(axis=1)
            for v in np.where(target)[0]:
                add = moved[v]
                slots = list(range(4))
                for k in slots:
                    if is_extra[v, k]:
                        weights[v, k] = 0.0
                has_head = [k for k in slots if joints[v, k] == head and weights[v, k] > 0]
                if has_head:
                    weights[v, has_head[0]] += add
                else:
                    free = min(slots, key=lambda k: weights[v, k])
                    joints[v, free] = head
                    weights[v, free] = add
                s = weights[v].sum()
                if s > 0:
                    weights[v] /= s
                # 重みの無い枠は 0 番の骨・重み 0 にしておく（同じ骨が 2 つの枠に入らないように）
                for k in slots:
                    if weights[v, k] == 0 and joints[v, k] in extra:
                        joints[v, k] = 0
            total += int(target.sum())
            view(attrs['JOINTS_0'])[:] = joints
            view(attrs['WEIGHTS_0'])[:] = weights.astype(np.float32)
            left = (np.isin(view(attrs['JOINTS_0']), list(extra)) & (view(attrs['WEIGHTS_0']) > 0)).any(axis=1).sum()
            sums = view(attrs['WEIGHTS_0']).sum(axis=1)
            print('vertices', len(pos), 'moved', int(target.sum()), 'still on extra bones', int(left),
                  'weight sum min/max', round(float(sums.min()), 5), round(float(sums.max()), 5))
    open(dst, 'wb').write(bytes(data))
    print('wrote', dst, 'moved vertices', total)


main()
