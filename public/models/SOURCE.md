# public/models の出所

ワールドのサバンナにいるライオン 5 頭と、プレイヤーの姿（主人公の子ども 6 人。ホームで 1 人を選ぶ）の 3D モデル。ほかの造形（世界・風景の生き物・ほかのワールドの動物）はすべてコードで生成している。

## ライオン 5 頭（`lion-*.glb`）

| ファイル | 個体 | 入力画像 | 三角形 | 頂点 | サイズ |
|---|---|---|---|---|---|
| `lion-alex.glb` | アレックス（雄、たてがみ） | アレックスのクレイ版（11/5 作り直し版） | 9,914 | 7,396 | 273,140 B |
| `lion-angie.glb` | アンジー | アンジーのクレイ版 | 9,255 | 6,853 | 264,236 B |
| `lion-riley.glb` | ライリー | ライリーのクレイ版 | 9,945 | 7,205 | 261,668 B |
| `lion-claire.glb` | クレア | クレアのクレイ版 | 8,890 | 6,903 | 286,464 B |
| `lion-carla.glb` | カーラ | カーラのクレイ版 | 9,704 | 7,310 | 285,660 B |

合計 1,371,168 B（約 1.34 MB）。

- **生成**: [Meshy](https://www.meshy.ai) の Image to 3D（Pro プラン、2026-11-05）。設定はスマートトポロジー、ポリゴン数 10000、テクスチャ 2K。四足リグ（イヌ科）を付け、アニメーションライブラリの「歩く」を付けて glTF（GLB）で書き出した
- **入力画像**: 期間中に用意した各個体のクレイ風の横向き全身の絵（実物の写真を参照に画像生成で作ったもの）。絵そのものはリポジトリに入れていない
- **ライセンス**: 5 頭とも生成時の設定は「プライベート」。Meshy の有料プランで生成したモデルは利用者が所有権を持ち、公開・商用利用に制限はない（Meshy のヘルプ／利用規約で確認、2026-11-05）。README のクレジットには「3D モデル: Meshy で生成」と書く
- **最適化**: gltf-transform 4.5.1 で meshopt 圧縮、テクスチャを WebP 1024×1024 に、簡略化 0.95（Meshy からの書き出しは 1 頭 約 3.5 MB。アレックスは 3.47 MB → 273 KB）
- **読み込み時の扱い**（`src/world/aiLionModel.ts`）: Meshy の素材（自己発光と金属度 1）は捨て、ワールド共通のトゥーン素材（クレイの見た目込み）に色の画像だけ移す。大きさはプリミティブ版の体の長さにそろえる。歩行クリップは移動している間だけ再生し、姿勢の補正（後ろ脚・背骨・尾・前脚を立ち姿へ寄せる＋毎コマ接地）をかける。止まっている間は立ち姿で、首・耳・尾の生活感レイヤーを骨で動かす
- **名前の対応**: クレアとカーラは参照画像のファイル名どおりに割り当て、2 頭の見分け（額の黒い小さな斑点が多い方がクレア）で合っていることを確認した（2026-11-05）
- 個人情報は含まない。施設の未公表情報も含まない

## 主人公（`hero-*.glb`）

| ファイル | 内容 | 入力画像 | 三角形 | 頂点 | サイズ |
|---|---|---|---|---|---|
| `hero-boy.glb` | プレイヤーの姿（天然パーマの男の子、黄色のパーカー） | キャラクターシート（3 面図・通常の顔）の正面だけを切り出した画像 | 10,010 | 7,731 | 349,948 B |
| `hero-teal.glb` | 青緑のジャケットの子（青緑のキャップ） | 同上（その子のシート） | 9,981 | 8,073 | 375,668 B |
| `hero-pink.glb` | ピンクの服の子（つば広の帽子） | 同上 | 9,956 | 7,974 | 369,100 B |
| `hero-bluecap.glb` | 青い帽子の子（金髪、青いパーカー） | 同上 | 10,009 | 7,852 | 382,320 B |
| `hero-purple.glb` | 紫の服の子（お団子 2 つ、紫のヘアバンド） | 同上 | 9,924 | 7,348 | 335,344 B |
| `hero-braids.glb` | 三つ編みの子（つば広の帽子、緑のパーカー） | 同上 | 9,970 | 7,756 | 380,692 B |

- **生成**: [Meshy](https://www.meshy.ai) の Image to 3D（Pro プラン、2026-11-05）。設定はライオンと同じスマートトポロジー、ポリゴン数 10000、テクスチャ 2K。ヒューマノイドのリグ（身長 1.2 m）を付け、リグの時に付いた「歩く」「走る」の 2 本を入れて glTF（GLB、スケルトンのテンプレートは Mixamo）で書き出した。アニメーションライブラリの「待機」の追加は Meshy のエラーで付かず、「ジャンプ」も付けていない
- **ほかの子**（`hero-teal.glb` など）: 黄色い子と同じ条件で生成・リグ・最適化した。リグの時に付いた「歩く」「走る」だけで、待機・ジャンプは Meshy で試していない。ホームの「だれで冒険する？」で選んだ子だけを読み込む（`src/data/heroes.json`）。三つ編みの子だけ、最適化の前に GLB の頂点の重み（ウェイト）を書き換えた: 三つ編みの骨 9 本（背骨 Spine2 にぶら下がり、アニメでは動かない）に乗っている重みを頭の骨へ移し、合計を 1 に戻した（3,611 頂点）。そのままだと動いた時に帽子が頭と合わず、歩きで後ろに浮き、走りで顔にかぶさったため。手順は `exp/heroes` ブランチの `experiments/heroes/tools/move-weights-to-head.py`（`tools/optimize.sh --weights-to-head` から呼ぶ）。Meshy でのリグのやり直しは順番待ちのまま結果が出なかったので使っていない
- **入力画像**: 期間中に用意したキービジュアルの子どものキャラクターシート（正面・側面・背面の 3 面図）から、正面のビューだけを切り出したもの。シートと切り出した画像はリポジトリに入れていない
- **ライセンス**: 生成時の設定は「プライベート」（ライオン 5 頭と同じ）。Meshy の有料プランで生成したモデルは利用者が所有権を持ち、公開・商用利用に制限はない（ライオンと同じく Meshy のヘルプ／利用規約で確認、2026-11-05）
- **最適化**: gltf-transform 4.5.1 でライオンと同じ設定（meshopt 圧縮、テクスチャを WebP 1024×1024 に、簡略化 0.95）。Meshy からの書き出し 1 人 3.7〜4.3 MB → 335〜383 KB（黄色い子は 4.03 MB → 349.9 KB）
- **選択と読み込み**: 名簿は `src/data/heroes.json`（モデル・ホームの絵・高さの倍率・見た目の呼び名。名前は付けない）。読み込むのは選んでいる 1 人だけで、選択は localStorage の `awl.hero.v1` に保存する。既定は黄色い子。選んだ子が読めなければ黄色い子、それも読めなければ以前のプリミティブの姿（`?hero=off` でも以前の姿）。ホームの絵（`public/heroes/*.webp`）はキャラクターシートの正面を 144px に切り出したもの
- **読み込み時の扱い**（`src/player/heroModel.ts`）: Meshy の素材（自己発光と金属度 1）は捨て、ワールド共通のトゥーン素材（サバンナではクレイの見た目込み）に色の画像だけ移す。高さは 1.20 m（それまでのプレイヤーの姿の 0.59 倍）。歩きと走りは実際の移動の速さで混ぜる。待機とジャンプのクリップは無いので、止まっている時は生成時の立ち姿、空中は走りの両足が浮いたコマで止める。地面と見分けやすくするため、足元の接地影と細い輪郭を足す
- 個人情報は含まない

## Source of `public/models` (English)

Five lion models generated with [Meshy](https://www.meshy.ai) Image to 3D (Pro plan, 2026-11-05) from clay-style reference pictures of each lion that were prepared during the hackathon. Rigged with Meshy's quadruped rig and its "Walk" animation, then optimized with gltf-transform 4.5.1 (meshopt, 1024px WebP textures). Generated with the license setting "Private": models generated on Meshy's paid plans are owned by the user with no restriction on publication or commercial use (checked against Meshy's help/terms on 2026-11-05). The six player characters (`hero-boy.glb` = the curly-haired boy in a yellow hoodie, plus `hero-teal.glb`, `hero-pink.glb`, `hero-bluecap.glb`, `hero-purple.glb`, `hero-braids.glb`) were generated the same way (Meshy Image to 3D, Pro plan, 2026-11-05, license setting "Private", owned by us) from the front view of each child's character sheet prepared during the hackathon, rigged with Meshy's humanoid rig with its "Walk" and "Run" clips, and optimized with the same settings (335–383 KB, about 10,000 triangles each). They have no idle or jump clip. The player picks one on the home screen ("Who will explore?") and only that model is loaded. For the girl with braids, the vertex weights were rewritten before optimization: weights on her nine braid bones (hanging from Spine2, not animated) were moved to the head bone so her hat stays on her head while moving (`experiments/heroes/tools/move-weights-to-head.py` on the `exp/heroes` branch). Everything else in the world is generated by code. No personal information is included.
