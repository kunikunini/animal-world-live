#!/usr/bin/env bash
# 仮映像（プレースホルダ）を生成する。色と文字だけの自作で、実写・外部素材は使わない。
# 出力は public/media/（.gitignore 済み）。実際の収録映像が届いたら同じファイル名で差し替える。
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p public/media

FONT="${FONT:-/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc}"
OUT="public/media/lions-family.mp4"

ffmpeg -y -loglevel error \
  -f lavfi -i "color=c=0xC9822E:s=1280x720:d=12:r=30" \
  -f lavfi -i "anullsrc=channel_layout=stereo:sample_rate=44100" \
  -filter_complex "\
[0:v]format=rgba,\
drawbox=x=0:y=0:w=1280:h=720:color=0xE8B45A@1:t=fill,\
drawbox=x=0:y=480:w=1280:h=240:color=0xA8652A@1:t=fill,\
drawbox=x='mod(t*120\,1480)-200':y=430:w=200:h=50:color=0xFFF0C2@0.6:t=fill,\
drawtext=fontfile='${FONT}':text='仮映像（プレースホルダ）':fontsize=56:fontcolor=0x2B1D12:x=(w-text_w)/2:y=200,\
drawtext=fontfile='${FONT}':text='ここに収録映像が入ります':fontsize=36:fontcolor=0x2B1D12:x=(w-text_w)/2:y=290,\
drawtext=fontfile='${FONT}':text='%{pts\:hms}':fontsize=28:fontcolor=0xFFF6E6:x=w-text_w-32:y=h-60,\
format=yuv420p[v]" \
  -map "[v]" -map 1:a -t 12 \
  -c:v libx264 -preset medium -crf 23 -profile:v main -level 3.1 \
  -c:a aac -b:a 64k -shortest -movflags +faststart \
  "$OUT"

echo "wrote $OUT"
