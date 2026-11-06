# 使い方: python3 sheets.py <out_dir> <fix_dir> <raw_dir> <prim_dir|-> <title> <posture_label> <crop_walk> <crop_view> <dist_label>
import json, sys
from PIL import Image, ImageDraw, ImageFont
OUT, FIX, RAW, PRIM, TITLE, PLAB, CW, CV, DL = sys.argv[1:10]
CW = tuple(map(int, CW.split(','))); CV = tuple(map(int, CV.split(',')))
font = ImageFont.truetype('/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc', 22)
small = ImageFont.truetype('/System/Library/Fonts/ヒラギノ角ゴシック W4.ttc', 17)
def load(d):
    t = open(f'{d}.json').read(); return json.loads(t[t.index('{\n'):])
fix, raw = load(FIX), load(RAW)
W = 350; H = round(W * (CW[3] - CW[1]) / (CW[2] - CW[0]))
def frame(d, name, marks):
    im = Image.open(f'shots/{d}/{name}.jpg').convert('RGB'); dr = ImageDraw.Draw(im)
    m = marks.get(name)
    if m:
        (x1, y1), (x2, y2) = m['line']; dr.line([(x1, y1), (x2, y2)], fill='white', width=4)
        hx, hy = m['hip']; dr.ellipse([hx - 9, hy - 9, hx + 9, hy + 9], outline='red', width=4)
    return im.crop(CW).resize((W, H))
ts = ['0', '0.125', '0.25', '0.375', '0.5', '0.625', '0.75', '0.875', '1.0']
rows = [('補正なし（&fix=off。接地もなし）', RAW, raw), (f'補正あり（{PLAB}）', FIX, fix)]
pad, cols = 6, 5; cell_h = H + 24
sheet = Image.new('RGB', (cols * (W + pad) + pad, 50 + 2 * (40 + 2 * cell_h)), 'white'); d = ImageDraw.Draw(sheet)
d.text((pad, 12), f'{TITLE} 歩行の判定: 側面・{DL}・1 秒ループを 0.125 秒ごと。白線＝立ち姿の腰の関節の高さ、赤丸＝各コマの腰の関節。各段の先頭は立ち姿', fill='black', font=small)
y0 = 46
for title, dname, data in rows:
    d.text((pad, y0), title, fill='black', font=font); y = y0 + 36
    cells = [('立ち姿', frame(dname, 'walk-rest', data['marks']))] + [(f'{t} 秒', frame(dname, f'walk-{i:02d}', data['marks'])) for i, t in enumerate(ts)]
    for i, (lab, fr) in enumerate(cells):
        r, c = divmod(i, cols); x = pad + c * (W + pad); yy = y + r * cell_h
        sheet.paste(fr, (x, yy)); d.text((x + 4, yy + H + 2), lab, fill='black', font=small)
    y0 = y + 2 * cell_h + 4
sheet.save(f'{OUT}/walk-sheet.jpg', quality=86)
views = [('正面', 'view-front'), ('斜め', 'view-diag'), ('側面', 'view-side'), ('反対側', 'view-opposite')]
w2 = 360; h2 = round(w2 * (CV[3] - CV[1]) / (CV[2] - CV[0]))
sets = [('生成モデル（Meshy、クレイ版から）', FIX)] + ([('プリミティブ版（従来）', PRIM)] if PRIM != '-' else [])
s2 = Image.new('RGB', (4 * (w2 + pad) + pad, 46 + len(sets) * (34 + h2 + 10)), 'white'); d2 = ImageDraw.Draw(s2)
d2.text((pad, 12), f'{TITLE}: ワールドの中。' + ('上が生成モデル（立ち姿）、下がプリミティブ版（伏せ）' if PRIM != '-' else '群れのプリミティブ版と入れ替え'), fill='black', font=small)
y = 46
for title, dname in sets:
    d2.text((pad, y), title, fill='black', font=font); y += 34
    for i, (lab, n) in enumerate(views):
        im = Image.open(f'shots/{dname}/{n}.jpg').convert('RGB').crop(CV).resize((w2, h2))
        x = pad + i * (w2 + pad); s2.paste(im, (x, y)); d2.text((x + 6, y + 6), lab, fill='white', font=font)
    y += h2 + 10
s2.save(f'{OUT}/views-sheet.jpg', quality=86)
print('ok', sheet.size, s2.size)
