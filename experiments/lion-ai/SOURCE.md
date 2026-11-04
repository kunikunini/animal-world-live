# 素材の出所

- `alex-side-real.png`: くにがチャットから保存したアレックスの横向きのイメージ画像（Meshy の入力に使用。元ファイル `media-generation-alex-side-real-0-….webp` を PNG に変換）
- 3D モデル: Meshy（https://www.meshy.ai）の Image to 3D で生成。生成時のライセンス設定は CC BY 4.0。使う場合は「Meshy で生成」と CC BY 4.0 の表記を README に書く
- `alex-side-clay.png`: くにがチャットで渡したアレックスの粘土風の横向きのイメージ画像（Meshy の入力に使用。webp を PNG に変換）
- クレイ版の 3D モデル: 同じく Meshy の Image to 3D で生成、CC BY 4.0（11/5 に取得。下の glb）
- `shots/meshy-*.jpg`: Meshy のビューアの画面を撮ったもの。`shots/world-*.jpg`: このプロジェクトのゲーム画面
- `meshy-clay-static-*.glb`（クレイ版、リグなし）と `meshy-real-walk-*.glb`（リアル版、四足リグ＋歩行）: Meshy の Pro プランでダウンロード。生成時のライセンスは CC BY 4.0 なので、使う場合は README に「3D モデル: Meshy で生成（CC BY 4.0）」と書く。`-raw` は Meshy から落としたまま（コミットしない）、`-opt` は gltf-transform で最適化したもの
- `shots/world-*.jpg`: 上の GLB をこのプロジェクトのワールドに置いて撮ったゲーム画面
- `inputs/*-side-clay.jpg`: くにが用意したアンジー・ライリー・クレア・カーラのクレイ版イメージ画像（main 側 `artwork/meshy-clay-references/` の PNG を JPEG にした写し）。Meshy の入力に使用
- `inputs/*-side-real.jpg`: くにがチャットで渡した同じ 4 頭のリアル版イメージ画像。今回は使っていない（リグが全部通ったため）
- `meshy-{angie,riley,claire,kara}-clay-walk-opt.glb`、`meshy-alex-clay-smartrig-opt.glb`: Meshy（Pro）で生成・リグ・歩行を付けてダウンロードし、gltf-transform で最適化したもの。4 頭はライセンス設定「プライベート」、アレックスは CC BY 4.0。README に出す時の表記は、プライベートの扱いを Meshy の規約で確かめてから決める（未確認）
