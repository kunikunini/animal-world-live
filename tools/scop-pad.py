# スコップの色の画像: 切れ端のすき間（真っ黒な地、明るさ 8 以下）を、となりの切れ端の色でにじませて埋める。
# 切れ端のふち 2 画素も内側の色に（ふちに焼き込まれた暗い縁取りを消す）。それより内側の画素は変えない（遠くから見た時に、地の黒が切れ端のふちに混ざるのを防ぐ）
import sys,io,numpy as np
from PIL import Image
import importlib.util
spec=importlib.util.spec_from_file_location('r',__import__('os').path.join(__import__('os').path.dirname(__file__),'glb-retex.py')); r=importlib.util.module_from_spec(spec); spec.loader.exec_module(r)
def pad(img):
    a=np.asarray(img.convert('RGB')).astype(np.float32)
    # 地は、真っ黒（明るさ 8 以下）のうち大きくつながった所（3000 画素以上）だけ。白の中の口の線・瞳のような小さな黒は絵なので残す
    from scipy import ndimage
    dark=a.max(-1)<=8
    lab,n=ndimage.label(dark)
    sizes=ndimage.sum(dark,lab,np.arange(1,n+1))
    bgk=np.zeros(n+1,bool); bgk[1:]=sizes>=3000
    known=~bgk[lab]
    print('bg comps',int(bgk.sum()),'of',n,'bg ratio',round(float((~known).mean()),3))
    # 切れ端のふち 2 画素（地の黒となじませた暗い縁取りが焼き込まれている）も、内側の色で塗り直す
    for _ in range(2):
        e=known.copy()
        for dy,dx in ((1,0),(-1,0),(0,1),(0,-1)):
            e&=np.roll(np.roll(known,dy,0),dx,1)
        known=e
    out=a.copy(); k=known.copy()
    for _ in range(64):
        if k.all(): break
        acc=np.zeros_like(out); cnt=np.zeros(k.shape,np.float32)
        for dy,dx in ((1,0),(-1,0),(0,1),(0,-1),(1,1),(1,-1),(-1,1),(-1,-1)):
            sh=np.roll(np.roll(out,dy,0),dx,1); sk=np.roll(np.roll(k,dy,0),dx,1)
            acc+=sh*sk[...,None]; cnt+=sk
        grow=(~k)&(cnt>0)
        out[grow]=acc[grow]/cnt[grow][:,None]; k=k|grow
    return Image.fromarray(np.clip(out,0,255).astype(np.uint8)), known
src,dst=sys.argv[1],sys.argv[2]
j,b=r.load(src)
bv=j['bufferViews'][j['images'][0]['bufferView']]; st=bv.get('byteOffset',0); ln=bv['byteLength']
im=Image.open(io.BytesIO(bytes(b[st:st+ln])))
new,known=pad(im)
if len(sys.argv)>3: new.save(sys.argv[3])
o=io.BytesIO(); new.save(o,'WEBP',quality=90,method=6); nb=o.getvalue()
c4=r.c4; old=c4(ln); nw=c4(len(nb)); d=nw-old
b[st:st+old]=nb+b'\x00'*(nw-len(nb))
for v,key in r.views_on0(j):
    if v is bv: continue
    if v.get(key,0)>=st+old: v[key]+=d
bv['byteLength']=len(nb); j['buffers'][0]['byteLength']=len(b)
r.save(dst,j,b)
print('ok', r.check(src,dst), ln, '->', len(nb))
