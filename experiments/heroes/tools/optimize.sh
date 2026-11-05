#!/bin/bash
# 主人公の GLB の最適化（黄色い子・ライオンと同じ設定）。
# 使い方: optimize.sh <Meshy から落としたままの GLB> <出力 GLB> [--weights-to-head]
#   --weights-to-head: 名前の無い骨（Bone_*）に乗っている頂点の重みを頭の骨へ移してから最適化する
#                      （三つ編みの子: 三つ編みの骨が背骨にぶら下がっていて、動くと帽子がずれるため）
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
src="$1"; out="$2"; shift 2
work="$src"
if [ "${1:-}" = "--weights-to-head" ]; then
  # 途中のファイルは元の GLB の隣（raw/、コミットしない）に置く
  work="${src%.glb}-weights-to-head.glb"
  python3 -I "$here/move-weights-to-head.py" "$src" "$work"
fi
npx -y @gltf-transform/cli@4.5.1 optimize "$work" "$out" --compress meshopt --texture-compress webp --texture-size 1024 --simplify-ratio 0.95 --simplify-error 0.001
