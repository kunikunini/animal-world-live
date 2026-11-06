#!/bin/zsh
# 使い方: prep.sh <dir> <file>  — ~/Downloads の最新の Meshy GLB を experiments/animals-night/<dir>/raw/ へ移し、public/models/<file>.glb に最適化
T=${0:A:h}; cd ${T:h:h}
E=experiments/animals-night/$1; mkdir -p $E/raw $E/inputs $E/shots
F=$(ls -t ~/Downloads/Meshy_AI_*.glb | head -1); echo "from: $F"
mv "$F" $E/raw/$2-clay-walk-raw.glb
npx -y @gltf-transform/cli@4.5.1 optimize $E/raw/$2-clay-walk-raw.glb public/models/$2.glb --compress meshopt --texture-compress webp --texture-size 1024 --simplify-ratio 0.95 --simplify-error 0.001 2>&1 | tail -1
$T/stat.sh $E/raw/$2-clay-walk-raw.glb public/models/$2.glb
