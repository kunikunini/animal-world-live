#!/bin/zsh
# 使い方: auto.sh <key> <dir> <title> [候補 "h/s/t/f" ...]
# 姿勢の候補を振り（sw.sh）、基準（腰 99〜105%・いちばん低い足 0〜1.4 cm 下）に入る中で腰の幅がいちばん狭いものを選んで
# src/main.ts のその子の posture を書き換え、gate.sh と fin.sh まで流す。合う候補が無ければ止まる（main.ts は触らない）
T=${0:A:h}; R=${T:h:h}; cd $R; K=$1; D=$2; TITLE=$3; shift 3
C=("$@"); [[ ${#C} -eq 0 ]] && C=(0/0/0/0 0.9/1/0.5/0.8 1/0.9/0.5/0.9 1/0.8/0.5/1 1/0.8/0.5/0.8 1/0.7/0.5/0.9 0.95/0.8/1/0.7)
J=$(python3 -c "
import json,sys
print(json.dumps([dict(zip(['hind','spine','tail','front'],map(float,t.split('/')))) | {'ground':True} for t in sys.argv[1:]]))" $C)
OUT=$T/work/sw-$K.txt
$T/sw.sh $K "$J" > $OUT 2>&1
PICK=$(python3 - $OUT <<'PY'
import re,sys
best=None
for l in open(sys.argv[1]):
    m=re.match(r'(\S+)\s+hips ([\d.]+)–([\d.]+)\s+tail ([\d.-]+)\s+low ([\d.-]+)〜([\d.-]+)',l)
    if not m: continue
    lab,a,b,tl,l1,l2=m.groups(); a,b,tl,l1=float(a),float(b),float(tl),float(l1)
    if lab=='0/0/0/0': continue
    if 99<=a and b<=105 and l1>=-1.4 and tl>0:
        if best is None or (b-a)<best[0]: best=(b-a,lab)
print(best[1] if best else '')
PY
)
cat $OUT
[[ -z $PICK ]] && { echo "NO PICK"; exit 2; }
echo "PICK $PICK"
IFS=/ read h s t f <<< "$PICK"
fmt() { python3 -c "import sys; x=float(sys.argv[1]); print(int(x) if x==int(x) else x)" $1; }
h=$(fmt $h); s=$(fmt $s); t=$(fmt $t); f=$(fmt $f)
perl -i -pe "s/(key: '$K',.*?posture: \\{ )hind: [\\d.]+, spine: [\\d.]+, tail: [\\d.]+, front: [\\d.]+/\${1}hind: $h, spine: $s, tail: $t, front: $f/" src/main.ts
grep "key: '$K'" src/main.ts
$T/gate.sh $K 2>&1 | tail -4
LAB="$h／$s／$t／$f・接地"
$T/fin.sh $K $D "$TITLE" "$LAB" 170,110,830,550 170,90,850,540 "約 3.6 m の側面" 2>&1 | tail -18
