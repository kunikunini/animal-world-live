#!/bin/zsh
# 使い方: fin.sh <key> <dir> <title> <posture_label> <crop_walk> <crop_view> <dist>
# gate.sh の結果から歩行と 4 方向のシートを作って experiments/animals-night/<dir>/shots/ へ。脚の骨ごとの頂点数と左右の x 範囲（癒着の確認）も出す
T=${0:A:h}; W=$T/work; cd $W; K=$1; D=$2
R=${T:h:h}/experiments/animals-night/$D
mkdir -p $R/shots out/$K
cp shots/$K-fix.json $K-fix.json; cp shots/$K-raw.json $K-raw.json
python3 $T/sheets.py out/$K $K-fix $K-raw - "$3" "$4" $5 $6 "$7" && cp out/$K/walk-sheet.jpg out/$K/views-sheet.jpg $R/shots/
SETUP=$T/setup.js DPR=1 SLEEP=3000 node $T/cdp-multi.mjs "http://localhost:5180/#key=$K" $T/bones.js 800 600 2>/dev/null > bones-$K.json
python3 -c "
import json; t=open('bones-$K.json').read(); d=json.loads(t[t.index('{'):]); c=d['cnt']; b=d['box']
print('bones',len(d['bones']),'with verts',len([k for k in c if k]))
for n in ['frontleg','frontleg1','frontleg2','R_frontleg','R_frontleg1','R_frontleg2','backleg','backleg1','backleg2','R_backleg','R_backleg1','R_backleg2','tail','tail1','tail2','tail3']:
  print(f'{n:12s}', c.get(n,0), b.get(n,{}).get('x'))
"
