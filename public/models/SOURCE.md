# public/models の出所

ワールドのサバンナにいるライオン 5 頭と、プレイヤーの姿（主人公の子ども 6 人。ホームで 1 人を選ぶ）、ほかのワールドの動物 3 体（ジャングルのベンガルトラ「ティガー」・サバンナのグラントシマウマ「グラン」・南半球のカピバラ「しずか」）の 3D モデル。ほかの造形（世界・風景の生き物・ほかのワールドの動物）はすべてコードで生成している。

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

## ベンガルトラ（`tiger-tigger.glb`）

| ファイル | 個体 | 入力画像 | 三角形 | 頂点 | サイズ |
|---|---|---|---|---|---|
| `tiger-tigger.glb` | ティガー（ベンガルトラ、ジャングル） | ティガーのクレイ版（写真を参照に画像生成で作った側面の絵） | 9,452 | 7,794 | 335,916 B |

- **生成**: [Meshy](https://www.meshy.ai) の Image to 3D（Pro プラン、2026-11-05）。設定はライオンと同じスマートトポロジー、ポリゴン数 10000、テクスチャ 2K。四足リグ（イヌ科）を付け、アニメーションライブラリの「歩く」を付けて glTF（GLB）で書き出した
- **入力画像**: くにが渡したティガー本人の写真（施設で撮影）を参照に、期間中に画像生成（GPT Image 2）で作ったクレイ風の横向き全身の絵。写真は正面の座り姿なので、側面の立ち姿・反対側の縞は推測で生成している。写真はリポジトリに入れていない。絵は実験ブランチ（exp/animals-1）の `experiments/animals-1/tiger/inputs/tigger-side-clay.jpg` に JPEG の写しだけ置く（原本の PNG は入れていない。ライオンの実験ブランチと同じ扱い）
- **ライセンス**: 生成時の設定は「プライベート」（ライオン 5 頭と同じ。Meshy の有料プランで生成したモデルは利用者が所有権を持つ）
- **最適化**: gltf-transform 4.5.1 でライオンと同じ設定（meshopt 圧縮、テクスチャを WebP 1024×1024 に、簡略化 0.95）。4.63 MB → 335.9 KB
- **読み込み時の扱い**（`src/world/aiLionModel.ts` をそのまま使う。配線は `src/main.ts`）: ライオンと同じくトゥーン素材に差し替え、大きさはプリミティブ版の体の長さにそろえる。姿勢の補正は後ろ脚 0.95・背骨 0.85・尾 0.5・前脚 0.7＋毎コマ接地（ライオン 4 頭より強い）。`?tiger=primitive` でプリミティブ版（伏せ）に戻る
- 個人情報は含まない。施設の未公表情報も含まない

## グラントシマウマ（`zebra-gran.glb`）

| ファイル | 個体 | 入力画像 | 三角形 | 頂点 | サイズ |
|---|---|---|---|---|---|
| `zebra-gran.glb` | グラン（グラントシマウマ、サバンナ） | グランのクレイ版（写真を参照に画像生成で作った側面の絵） | 8,670 | 8,426 | 341,856 B |

- **生成**: [Meshy](https://www.meshy.ai) の Image to 3D（Pro プラン、2026-11-06）。設定・リグ・歩行・最適化はティガーと同じ（4.90 MB → 341.9 KB）
- **入力画像**: くにが渡したグラン本人の写真（施設で撮影、正面寄り）を参照に、期間中に画像生成（GPT Image 2）で作ったクレイ風の横向き全身の絵。側面の縞の並び・反対側・尾は推測で生成している。写真はリポジトリに入れていない。絵は実験ブランチの `experiments/animals-1/zebra/inputs/gran-side-clay.jpg` に JPEG の写しだけ置く
- **ライセンス**: 生成時の設定は「プライベート」（ティガーと同じ。所有権はこちら）
- **読み込み時の扱い**: ティガーと同じ（トゥーン素材、姿勢の補正 後ろ脚 0.95・背骨 0.85・尾 0.5・前脚 0.7＋接地）。サバンナにはプリミティブ版が無いので、読めた時だけ新しく置く（`?zebra=off` で置かない）
- 個人情報は含まない。施設の未公表情報も含まない

## カピバラ（`capybara-shizuka.glb`）

| ファイル | 個体 | 入力画像 | 三角形 | 頂点 | サイズ |
|---|---|---|---|---|---|
| `capybara-shizuka.glb` | しずか（カピバラ、南半球） | しずかのクレイ版（写真を参照して画像生成した側面の絵） | 9,802 | 7,393 | 252,352 B |

- **生成**: [Meshy](https://www.meshy.ai) の Image to 3D（Pro プラン、2026-11-06）。設定・リグ・歩行・最適化はティガーと同じ（3.36 MB → 252.4 KB）
- **入力画像**: くにから受け取ったしずかの写真（施設で撮影）を参照画像として渡し、期間中に画像生成（GPT Image 2）で作ったクレイ風の横向き全身の絵。色は写真に寄せて調整した。写真はリポジトリに入れていない。絵は実験ブランチの `experiments/animals-1/capybara/inputs/shizuka-side-clay-photo.jpg` に JPEG の写しだけ置く
- **入力の出所の変更（2026-11-06）**: 最初の版（ブランチ exp/animals-1 のコミット 5b0917b。main には入れていない）は、写真のファイルが届かなかったので、写真から読み取った特徴を文章にして作った絵（`shizuka-side-clay.jpg`）から生成した。写真を受け取れたので、写真参照の絵から同じ設定で作り直し、モデルを差し替えた
- **ライセンス**: 生成時の設定は「プライベート」（ティガーと同じ。所有権はこちら）
- **読み込み時の扱い**: ティガーと同じ読み込み。姿勢の補正は後ろ脚 0.7・背骨 0.98・尾 1・前脚 0.9＋接地。尾が無いので、リグが付けた尾の骨は動かさない。`?capybara=primitive` でプリミティブ版（伏せ）に戻る
- 個人情報は含まない。施設の未公表情報も含まない

## シベリアンハスキー（`husky-ginga.glb`）

| ファイル | 個体 | 入力画像 | 三角形 | 頂点 | サイズ |
|---|---|---|---|---|---|
| `husky-ginga.glb` | 銀牙（シベリアンハスキー、北の世界） | 種の特徴から画像生成したクレイ風の側面の絵（銀牙の写真は無い） | 10,027 | 8,924 | 309,268 B |

- **生成**: [Meshy](https://www.meshy.ai) の Image to 3D（Pro プラン、2026-11-06）。設定（スマートトポロジー・ポリゴン数 10000・テクスチャ 2K）・四足リグ・「歩く」・最適化はティガーと同じ（3.57 MB → 309.3 KB）
- **入力画像**: 銀牙の写真が無いので、犬種の典型的な特徴（灰色〜銀灰色と白の毛、顔のマスク、淡い青い目、巻いた尾）を文章にして、期間中に画像生成（GPT Image 2）で作ったクレイ風の横向き全身の絵。銀牙本人の毛色や目の色に似せたものではない。絵は実験ブランチの `experiments/animals-2/husky/inputs/husky-side-clay.jpg` に JPEG の写しだけ置く
- **ライセンス**: 生成時の設定は「プライベート」（ティガーと同じ。所有権はこちら）
- **読み込み時の扱い**: ティガーと同じ（トゥーン素材）。姿勢の補正は後ろ脚 0.75・背骨 0.9・尾 0.5・前脚 0.7＋接地。北の世界にプリミティブ版は無いので、読めた時だけ新しく置く（`?husky=off` で置かない）
- 個人情報は含まない。施設の未公表情報も含まない

## ブチハイエナ（`hyena-peter.glb`）

| ファイル | 個体 | 入力画像 | 三角形 | 頂点 | サイズ |
|---|---|---|---|---|---|
| `hyena-peter.glb` | ピーター（ブチハイエナ、サバンナ） | 種の特徴から画像生成したクレイ風の側面の絵（ピーターの写真は無い） | 9,236 | 8,483 | 311,756 B |

- **生成**: [Meshy](https://www.meshy.ai) の Image to 3D（Pro プラン、2026-11-06）。設定・四足リグ・「歩く」・最適化はティガーと同じ（4.20 MB → 311.8 KB）
- **入力画像**: ピーターの写真が無いので、ブチハイエナの種の特徴を文章にして、期間中に画像生成（GPT Image 2）で作ったクレイ風の横向き全身の絵。施設のハイエナの収録映像はあるが、どの子が映っているか確かめられていないので使っていない。ピーター本人に似せたものではない。絵は実験ブランチの `experiments/animals-2/hyena/inputs/hyena-side-clay.jpg` に JPEG の写しだけ置く
- **ライセンス**: 生成時の設定は「プライベート」（所有権はこちら）
- **読み込み時の扱い**: ティガーと同じ（トゥーン素材）。姿勢の補正は後ろ脚 0.9・背骨 0.95・尾 0.5・前脚 0.8＋接地。サバンナにプリミティブ版は無いので、読めた時だけ新しく置く（`?hyena=off` で置かない）
- 個人情報は含まない。施設の未公表情報も含まない

## アメリカバク（`tapir-yumeko.glb`）

| ファイル | 個体 | 入力画像 | 三角形 | 頂点 | サイズ |
|---|---|---|---|---|---|
| `tapir-yumeko.glb` | ゆめこ（アメリカバク、ジャングル南米） | ゆめこのクレイ版（写真を参照して画像生成した側面の絵） | 9,728 | 7,403 | 209,392 B |

- **生成**: [Meshy](https://www.meshy.ai) の Image to 3D（Pro プラン、2026-11-06）。設定・四足リグ・「歩く」・最適化はティガーと同じ（3.33 MB → 209.4 KB）
- **入力画像**: くにから受け取ったゆめこの写真（施設で撮影。しずかと並んだもの）と収録映像の 1 コマを参照画像として渡し、期間中に画像生成（GPT Image 2）で作ったクレイ風の横向き全身の絵（2 枚目を採用）。写真は伏せ気味の横向きなので、脚・後ろ半身・反対側は推測で生成している。写真はリポジトリに入れていない。絵は実験ブランチの `experiments/animals-2/tapir/inputs/yumeko-side-clay-v2.jpg` に JPEG の写しだけ置く
- **ライセンス**: 生成時の設定は「プライベート」（所有権はこちら）
- **読み込み時の扱い**: ティガーと同じ（トゥーン素材）。姿勢の補正は後ろ脚 0.95・背骨 0.9・尾 1・前脚 0.8＋接地。尾はごく短いので、リグが付けた尾の骨は動かさない。ジャングルにプリミティブ版は無いので、読めた時だけ新しく置く（`?tapir=off` で置かない）
- 個人情報は含まない。施設の未公表情報も含まない

## マーラ（`mara-kabosu.glb`）

| ファイル | 個体 | 入力画像 | 三角形 | 頂点 | サイズ |
|---|---|---|---|---|---|
| `mara-kabosu.glb` | かぼす（マーラ、南半球） | 種の特徴から画像生成したクレイ風の側面の絵（かぼすの写真は無い） | 9,629 | 7,673 | 275,132 B |

- **生成**: [Meshy](https://www.meshy.ai) の Image to 3D（Pro プラン、2026-11-06）。設定・四足リグ・「歩く」・最適化はティガーと同じ（3.72 MB → 275.1 KB）
- **入力画像**: かぼすの写真が無いので、マーラの種の特徴を文章にして、期間中に画像生成（GPT Image 2）で作ったクレイ風の横向き全身の絵。施設の収録映像にマーラは映っているが、どの子か確かめられていないので使っていない。かぼす本人に似せたものではない。絵は実験ブランチの `experiments/animals-2/mara/inputs/mara-side-clay.jpg` に JPEG の写しだけ置く
- **ライセンス**: 生成時の設定は「プライベート」（所有権はこちら）
- **読み込み時の扱い**: ティガーと同じ（トゥーン素材）。姿勢の補正は後ろ脚 0.95・背骨 0.8・尾 1・前脚 0.7＋接地。尾はごく短いので、リグが付けた尾の骨は動かさない。`?mara=primitive` でプリミティブ版（伏せ）に戻る
- 個人情報は含まない。施設の未公表情報も含まない

## ホッキョクオオカミ（`wolf-fen.glb`）

| ファイル | 個体 | 入力画像 | 三角形 | 頂点 | サイズ |
|---|---|---|---|---|---|
| `wolf-fen.glb` | フェン（ホッキョクオオカミ、北の世界） | 種の特徴から画像生成したクレイ風の側面の絵（フェンの写真は無い） | 9,947 | 9,541 | 337,300 B |

- **生成**: [Meshy](https://www.meshy.ai) の Image to 3D（Pro プラン、2026-11-06）。設定・四足リグ・「歩く」・最適化はティガーと同じ（4.14 MB → 337.3 KB）。1 回目の生成モデルはリグの頂点の重みが崩れていたので使わず、尾を後ろ脚から離した絵に直して 1 回だけ生成し直した
- **入力画像**: フェンの写真が無いので、ホッキョクオオカミの種の特徴を文章にして、期間中に画像生成（GPT Image 2）で作ったクレイ風の横向き全身の絵（2 枚目を採用）。フェン本人に似せたものではない。絵は実験ブランチの `experiments/animals-2/wolf/inputs/fen-side-clay-v2.jpg` に JPEG の写しだけ置く
- **ライセンス**: 生成時の設定は「プライベート」（所有権はこちら）
- **読み込み時の扱い**: ティガーと同じ（トゥーン素材）。姿勢の補正は後ろ脚 0.9・背骨 0.95・尾 0.5・前脚 0.85＋接地。`?wolf=primitive` でプリミティブ版（伏せ）に戻る
- 個人情報は含まない。施設の未公表情報も含まない

## ポニー（`pony-mei.glb`）

| ファイル | 個体 | 入力画像 | 三角形 | 頂点 | サイズ |
|---|---|---|---|---|---|
| `pony-mei.glb` | めい（ポニー、ふれあいワールド） | 種の特徴から画像生成したクレイ風の側面の絵（毛色は施設のポニーの映像を参考。めい本人かは未確認） | 10,047 | 8,418 | 303,604 B |

- **生成**: [Meshy](https://www.meshy.ai) の Image to 3D（Pro プラン、2026-11-06）。設定・四足リグ・「歩く」・最適化はティガーと同じ（3.67 MB → 303.6 KB）
- **入力画像**: めいの写真が無いので、ポニーの特徴を文章にし、施設のポニーの収録映像の 1 コマ（白〜クリーム色のポニー。めいかは確かめていない）を毛色の参考に渡して、期間中に画像生成（GPT Image 2）で作ったクレイ風の横向き全身の絵。めい本人に似せたものではない。映像のコマはリポジトリに入れていない。絵は実験ブランチの `experiments/animals-2/pony/inputs/mei-side-clay.jpg` に JPEG の写しだけ置く
- **ライセンス**: 生成時の設定は「プライベート」（所有権はこちら）
- **読み込み時の扱い**: ティガーと同じ（トゥーン素材）。姿勢の補正は後ろ脚 0.95・背骨 0.9・尾 0.5・前脚 0.8＋接地。`?pony=primitive` でプリミティブ版に戻る
- 個人情報は含まない。施設の未公表情報も含まない

## ケープペンギン（`penguin-rinrin.glb`）

| ファイル | 個体 | 入力画像 | 三角形 | 頂点 | サイズ |
|---|---|---|---|---|---|
| `penguin-rinrin.glb` | リンリン（ケープペンギン、水の世界） | 種の特徴から画像生成したクレイ風のななめ前の絵（リンリンの写真は無い） | 10,024 | 7,918 | 244,552 B |

- **生成**: [Meshy](https://www.meshy.ai) の Image to 3D（Pro プラン、2026-11-06）。設定と最適化はティガーと同じ（3.96 MB → 244.6 KB）。リグは Meshy のヒューマノイド（Mixamo 名の骨）。歩かせるとペンギンの歩き方にならないので、アニメは使わず、骨は首を向けるのにだけ使う
- **入力画像**: リンリンの写真が無いので、ケープペンギンの種の特徴を文章にして、期間中に画像生成（GPT Image 2）で作ったクレイ風の全身の絵。リンリン本人に似せたものではない。絵は実験ブランチの `experiments/animals-2/penguin/inputs/rinrin-side-clay.jpg` に JPEG の写しだけ置く
- **ライセンス**: 生成時の設定は「プライベート」（所有権はこちら）
- **読み込み時の扱い**: トゥーン素材（ティガーと同じ）。歩かず、その場で呼吸・首・左右の揺れだけ。大きさはプリミティブ版の高さにそろえる。`?penguin=primitive` でプリミティブ版に戻る
- 個人情報は含まない。施設の未公表情報も含まない

## コツメカワウソ（`otter-haruto.glb`）

| ファイル | 個体 | 入力画像 | 三角形 | 頂点 | サイズ |
|---|---|---|---|---|---|
| `otter-haruto.glb` | ハルト（コツメカワウソ、水の世界） | 種の特徴から画像生成したクレイ風の側面の絵（ハルトの写真は無い） | 8,556 | 7,482 | 247,288 B |

- **生成**: [Meshy](https://www.meshy.ai) の Image to 3D（Pro プラン、2026-11-06）。設定・四足リグ・「歩く」・最適化はティガーと同じ（3.66 MB → 247.3 KB）
- **入力画像**: ハルトの写真が無いので、コツメカワウソの種の特徴を文章にして、期間中に画像生成（GPT Image 2）で作ったクレイ風の横向き全身の絵。ハルト本人に似せたものではない。絵は実験ブランチの `experiments/animals-2/otter/inputs/haruto-side-clay.jpg` に JPEG の写しだけ置く
- **ライセンス**: 生成時の設定は「プライベート」（所有権はこちら）
- **読み込み時の扱い**: ティガーと同じ（トゥーン素材）。姿勢の補正は後ろ脚 0.85・背骨 1・尾 0.5・前脚 0.95＋接地。`?otter=primitive` でプリミティブ版（伏せ）に戻る
- 個人情報は含まない。施設の未公表情報も含まない

## Source of `public/models` (English)

Five lion models generated with [Meshy](https://www.meshy.ai) Image to 3D (Pro plan, 2026-11-05) from clay-style reference pictures of each lion that were prepared during the hackathon. Rigged with Meshy's quadruped rig and its "Walk" animation, then optimized with gltf-transform 4.5.1 (meshopt, 1024px WebP textures). Generated with the license setting "Private": models generated on Meshy's paid plans are owned by the user with no restriction on publication or commercial use (checked against Meshy's help/terms on 2026-11-05). The six player characters (`hero-boy.glb` = the curly-haired boy in a yellow hoodie, plus `hero-teal.glb`, `hero-pink.glb`, `hero-bluecap.glb`, `hero-purple.glb`, `hero-braids.glb`) were generated the same way (Meshy Image to 3D, Pro plan, 2026-11-05, license setting "Private", owned by us) from the front view of each child's character sheet prepared during the hackathon, rigged with Meshy's humanoid rig with its "Walk" and "Run" clips, and optimized with the same settings (335–383 KB, about 10,000 triangles each). They have no idle or jump clip. The player picks one on the home screen ("Who will explore?") and only that model is loaded. For the girl with braids, the vertex weights were rewritten before optimization: weights on her nine braid bones (hanging from Spine2, not animated) were moved to the head bone so her hat stays on her head while moving (`experiments/heroes/tools/move-weights-to-head.py` on the `exp/heroes` branch). The Bengal tiger Tigger in the jungle (`tiger-tigger.glb`, 335,916 B, 9,452 triangles, 2026-11-05), the Grant's zebra Gran in the savanna (`zebra-gran.glb`, 341,856 B, 8,670 triangles, 2026-11-06) and the capybara Shizuka in the southern-hemisphere world (`capybara-shizuka.glb`, 252,352 B, 9,802 triangles, 2026-11-06) were generated the same way (Meshy Image to 3D, Pro plan, license setting "Private", owned by us, quadruped rig with the "Walk" clip, same optimization) from clay-style side views prepared during the hackathon with a photo of each animal as the reference. Shizuka's first version was made from a written description of her photo because the photo file had not reached us; it was replaced by the version made with the photo itself as the reference. Everything else in the world is generated by code. No personal information is included. The Siberian husky Ginga in the northern world (`husky-ginga.glb`, 309,268 B, 10,027 triangles, 2026-11-06) was generated the same way, but from a clay-style side view drawn from typical breed features, because there is no photo of Ginga; it is not a likeness of Ginga's own coat or eye color. The spotted hyena Peter in the savanna (`hyena-peter.glb`, 311,756 B, 9,236 triangles, 2026-11-06) was made the same way from typical species features (no photo of Peter; the facility's hyena video does not identify which hyena is shown, so it was not used). The lowland tapir Yumeko in the jungle (`tapir-yumeko.glb`, 209,392 B, 9,728 triangles, 2026-11-06) was made the same way with a photo of Yumeko and a frame of her recorded video as the reference. The mara Kabosu in the southern-hemisphere world (`mara-kabosu.glb`, 275,132 B, 9,629 triangles, 2026-11-06) was made the same way from typical species features (no photo of Kabosu) and replaces the primitive mara figure (`?mara=primitive` switches back). The arctic wolf Fen in the northern world (`wolf-fen.glb`, 337,300 B, 9,947 triangles, 2026-11-06) was made the same way from typical species features (no photo of Fen) and replaces the primitive wolf figure (`?wolf=primitive` switches back); the first generation was discarded because its rig weights were broken, and the model was generated once more from a revised picture with the tail held away from the hind legs. The pony Mei in the petting world (`pony-mei.glb`, 303,604 B, 10,047 triangles, 2026-11-06) was made the same way from typical pony features, with the coat color taken from a frame of the facility's pony video (it is not confirmed that the pony in the video is Mei), and replaces the primitive pony (`?pony=primitive` switches back). The Cape penguin Rinrin in the water world (`penguin-rinrin.glb`, 244,552 B, 10,024 triangles, 2026-11-06) was made the same way from typical species features (no photo of Rinrin), rigged with Meshy's humanoid rig; its walk clip does not look like a penguin, so it does not walk and only breathes, turns its head and sways in place. It replaces the primitive penguin (`?penguin=primitive` switches back). The small-clawed otter Haruto in the water world (`otter-haruto.glb`, 247,288 B, 8,556 triangles, 2026-11-06) was made the same way from typical species features (no photo of Haruto) and replaces the primitive otter (`?otter=primitive` switches back).
