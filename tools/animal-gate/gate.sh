#!/bin/zsh
# 使い方: gate.sh <key> [追加のハッシュ 例 "&ws=-1"]
# 補正あり（fix）と補正なし（raw、?fix=off）で、歩行 17 コマの数値と 4 方向・歩行の画像を work/shots/<key>-fix|raw に出す。vite は :5180
T=${0:A:h}; W=$T/work; K=$1; X=$2
mkdir -p $W/shots/$K-fix $W/shots/$K-raw
SETUP=$T/setup.js DPR=1 SLEEP=3000 node $T/cdp-multi.mjs "http://localhost:5180/#key=$K$X" $T/animal.js 1024 768 $W/shots/$K-fix > $W/shots/$K-fix.json 2>/dev/null
SETUP=$T/setup.js DPR=1 SLEEP=3000 node $T/cdp-multi.mjs "http://localhost:5180/?fix=off#key=$K$X" $T/animal.js 1024 768 $W/shots/$K-raw > $W/shots/$K-raw.json 2>/dev/null
for m in fix raw; do python3 -c "
import json; t=open('$W/shots/$K-$m.json').read(); d=json.loads(t[t.index('{'):]); print('$m', d.get('err'), 'scale',d.get('scale'),'pos',d.get('pos'),'rest',d.get('rest'),'fallback',d.get('fallback'),'draw',d.get('draw')); print('  ', d.get('summary'))"; done
