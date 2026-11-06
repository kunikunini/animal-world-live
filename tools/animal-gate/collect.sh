#!/bin/zsh
# 使い方: collect.sh <dir>  — Codex の出力 PNG の JPEG の写しを experiments/animals-night/<dir>/inputs/ に置き、そのパスを出す
T=${0:A:h}; R=${T:h:h}; D=$1
P=$(ls $T/work/gen/$D/*-side-clay*.png | tail -1); O=$R/experiments/animals-night/$D/inputs/${P:t:r}.jpg
python3 -c "from PIL import Image; Image.open('$P').convert('RGB').save('$O', quality=90)"; echo $O
