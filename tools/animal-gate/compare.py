# 使い方: python3 compare.py <dir> <title>
# 写真の個体の見比べシート。左＝参考にした顔アイコン（tools/animal-gate/work/gen/<dir>/photo-*.webp。アプリで公開済みのもの）、
# 中＝入力画（experiments/animals-night/<dir>/inputs/*.jpg）、下＝ワールドの中の 4 方向（shots/views-sheet.jpg）。
# 出力は experiments/animals-night/<dir>/shots/compare-sheet.jpg。似ているかの判断はしない（くにが見る）
import glob, os, sys
from PIL import Image, ImageDraw, ImageFont
T = os.path.dirname(os.path.abspath(__file__)); R = os.path.dirname(os.path.dirname(T))
D, TITLE = sys.argv[1:3]
E = f'{R}/experiments/animals-night/{D}'
font = ImageFont.truetype('/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc', 22)
small = ImageFont.truetype('/System/Library/Fonts/ヒラギノ角ゴシック W4.ttc', 17)
H = 300
def fit(p, h=H):
    im = Image.open(p).convert('RGB'); return im.resize((round(im.width * h / im.height), h))
photos = [fit(p) for p in sorted(glob.glob(f'{T}/work/gen/{D}/photo-*.webp'))]
inp = [fit(p) for p in sorted(glob.glob(f'{E}/inputs/*.jpg'))]
views = Image.open(f'{E}/shots/views-sheet.jpg').convert('RGB')
top = photos + inp
W = max(sum(i.width for i in top) + 10 * len(top), views.width)
sheet = Image.new('RGB', (W, 40 + 30 + H + 20 + views.height), 'white'); dr = ImageDraw.Draw(sheet)
dr.text((8, 6), f'{TITLE}：写真（公開済みの顔アイコン）／入力画／生成モデル', fill='black', font=font)
x = 8
for i, im in enumerate(top):
    dr.text((x, 42), '写真' if i < len(photos) else '入力画（Codex）', fill='black', font=small)
    sheet.paste(im, (x, 70)); x += im.width + 10
sheet.paste(views, (0, 70 + H + 20))
sheet.save(f'{E}/shots/compare-sheet.jpg', quality=85)
print('ok', sheet.size, len(photos), 'photos')
