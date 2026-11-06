#!/bin/zsh
for f in "$@"; do
npx -y @gltf-transform/cli@4.5.1 inspect "$f" 2>/dev/null | python3 -c "
import sys,os,re
L=sys.stdin.read().splitlines()
def after(h):
  for i,l in enumerate(L):
    if l.strip()==h:
      for k in L[i+1:]:
        if k.startswith('│ 0'): return [x.strip() for x in k.split('│')]
m=after('SCENES'); t=after('TEXTURES')
print('$f'.split('/')[-1], 'tris',int(m[6].replace(',',''))//3,'verts',m[7], 'tex',t[7],t[8],t[9], 'bytes',os.path.getsize('$f'))"
done
