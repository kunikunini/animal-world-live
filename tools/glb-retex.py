# GLB の中の画像のバイトだけを縮小版に差し替える（形・骨・アニメのバイトは 1 バイトも変えない）
import sys,json,struct,io
from PIL import Image
c4=lambda n:(n+3)&~3
def load(p):
    b=open(p,'rb').read()
    jl=struct.unpack('<I',b[12:16])[0]; j=json.loads(b[20:20+jl])
    o=20+jl; bl=struct.unpack('<I',b[o:o+4])[0]; assert b[o+4:o+8]==b'BIN\x00'
    return j,bytearray(b[o+8:o+8+bl])
def save(p,j,bin_):
    js=json.dumps(j,separators=(',',':'),ensure_ascii=False).encode()
    js+=b' '*(c4(len(js))-len(js))
    bin_=bytes(bin_)+b'\x00'*(c4(len(bin_))-len(bin_))
    total=12+8+len(js)+8+len(bin_)
    open(p,'wb').write(struct.pack('<III',0x46546C67,2,total)+struct.pack('<I',len(js))+b'JSON'+js+struct.pack('<I',len(bin_))+b'BIN\x00'+bin_)
def views_on0(j):
    for bv in j['bufferViews']:
        if bv.get('buffer')==0: yield bv,'byteOffset'
        m=bv.get('extensions',{}).get('EXT_meshopt_compression')
        if m and m.get('buffer')==0: yield m,'byteOffset'
def retex(src,dst,size,q):
    j,bin_=load(src)
    imgviews=sorted({im['bufferView'] for im in j.get('images',[]) if 'bufferView' in im}, key=lambda i:-j['bufferViews'][i].get('byteOffset',0))
    for vi in imgviews:
        bv=j['bufferViews'][vi]; assert bv['buffer']==0
        st=bv.get('byteOffset',0); ln=bv['byteLength']
        im=Image.open(io.BytesIO(bytes(bin_[st:st+ln])))
        if max(im.size)<=size: continue
        mode='RGBA' if 'A' in im.getbands() else 'RGB'
        im=im.convert(mode).resize((size,size),Image.LANCZOS)
        out=io.BytesIO(); im.save(out,'WEBP',quality=q,method=6); nb=out.getvalue()
        old_span=c4(ln); new_span=c4(len(nb)); delta=new_span-old_span
        bin_[st:st+old_span]=nb+b'\x00'*(new_span-len(nb))
        for o,k in views_on0(j):
            if o is bv: continue
            if o.get(k,0)>=st+old_span: o[k]+=delta
            else: assert o.get(k,0)+0<st or o.get(k,0)>=st+old_span or o is bv
        bv['byteLength']=len(nb)
    j['buffers'][0]['byteLength']=len(bin_)
    save(dst,j,bin_)
def check(a,b):
    ja,ba=load(a); jb,bb=load(b)
    imgv={im['bufferView'] for im in ja.get('images',[])}
    def segs(j,bin_):
        out=[]
        for i,bv in enumerate(j['bufferViews']):
            if i in imgv: continue
            if bv.get('buffer')==0: out.append(bytes(bin_[bv.get('byteOffset',0):bv.get('byteOffset',0)+bv['byteLength']]))
            m=bv.get('extensions',{}).get('EXT_meshopt_compression')
            if m and m.get('buffer')==0: out.append(bytes(bin_[m['byteOffset']:m['byteOffset']+m['byteLength']]))
        return out
    strip=lambda j:{k:v for k,v in j.items() if k not in ('bufferViews','buffers','images')}
    same_json=strip(ja)==strip(jb) and ja.get('images')==jb.get('images')
    return same_json and segs(ja,ba)==segs(jb,bb)
if __name__=='__main__':
    size=int(sys.argv[1]); outdir=sys.argv[2]
    import os
    for p in sys.argv[3:]:
        d=os.path.join(outdir,os.path.basename(p)); retex(p,d,size,90)
        print(('OK ' if check(p,d) else 'NG ')+os.path.basename(p), os.path.getsize(p), '->', os.path.getsize(d))
