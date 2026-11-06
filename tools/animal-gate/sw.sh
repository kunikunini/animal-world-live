#!/bin/zsh
# 使い方: sw.sh <key> '<補正値の候補の JSON 配列>'  → 候補ごとに腰・尾・最下点・前後の両足浮き
T=${0:A:h}; K=$1; V=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$2")
SETUP=$T/setup.js DPR=1 SLEEP=3000 node $T/cdp-multi.mjs "http://localhost:5180/#key=$K&v=$V" $T/sweep.js 800 600 2>/dev/null | python3 -c "
import json,sys; t=sys.stdin.read(); d=json.loads(t[t.index('{'):])
if 'err' in d: print(d); sys.exit()
print('rest',d['rest'],'fallback',d['fallback'],'tail',d['tailBone'])
for r in d['res']:
  v=r['v']; print(f\"{v.get('hind')}/{v.get('spine')}/{v.get('tail')}/{v.get('front')}  hips {r['hips']}  tail {r['tailMin']}  low {r['lowest']}  F {r['frontUp']}  H {r['hindUp']}\")
"
