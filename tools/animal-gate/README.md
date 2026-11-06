# animal-gate — 生成モデルの数値ゲートと確認シート

Meshy の四足モデル（`src/main.ts` の `AI_RESIDENTS`）を、ヘッドレス Chrome で開いて測る道具。vite を `:5180` で動かしてから使う。出力は `work/`（コミットしない）。

| スクリプト | すること |
|---|---|
| `prep.sh <dir> <file>` | `~/Downloads` の最新の Meshy GLB を `experiments/animals-night/<dir>/raw/` へ移し、`public/models/<file>.glb` に最適化（gltf-transform 4.5.1） |
| `gate.sh <key> [&ws=-1]` | 補正あり／なしで歩行 17 コマを測る（腰の高さの立ち姿比・尾先の最小・いちばん低い足・前後の両足浮き・4 本浮きのコマ数）。4 方向と歩行の画像も撮る |
| `sw.sh <key> '<JSON>'` | 補正値の候補を並べて同じ項目を測る |
| `fin.sh <key> <dir> ...` | 歩行と 4 方向のシートを `experiments/animals-night/<dir>/shots/` へ。脚の骨ごとの頂点の x 範囲（左右の脚の癒着の確認）も出す |

合格の目安: 腰 99〜105%、尾先・お尻が地面より上、いちばん低い足が地面の 0〜1.4 cm 下、4 本とも浮くコマ 0、左右の脚が癒着していない。

`animal.js`・`sweep.js`・`cdp-multi.mjs`・`bones.js`・`sheets.py`・`stat.sh` は、一時フォルダが消えた（11/6 21:00 ごろ）あとにセッションの記録から復元したもの。ウーピー（0e472e4）の記録済みの数値と全項目一致することを確かめた。
