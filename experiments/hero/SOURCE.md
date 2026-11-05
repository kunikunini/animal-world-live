# 素材の出所

- `inputs/boy-front.png`: くにが用意したキャラシート（デスクトップ `202611Claudeハッカソン関係/ハッカソン画像・動画/キービジュアル/天然パーマBoy.png`、1536×1024 の 3 面図・通常顔）から、正面のビューだけを切り出して 1000×1000 の白地に置いたもの（左から x 0–566・y 20–1010 を切り出し、拡大・縮小なし）。Meshy の入力に使用。元のシートと笑顔版（`天然パーマBoy2.png`）はコミットしない
- `meshy-hero-walk-run-opt.glb`: 上の画像から Meshy（Pro）の Image to 3D で生成し、ヒューマノイドのリグと、リグの時に自動で付いた「歩く」「走る」を付けてダウンロードし（スケルトンのテンプレートは Mixamo）、gltf-transform で最適化したもの。**生成時のライセンス設定は「プライベート」**（ライオン 5 頭と同じ）。ワールドでは `public/models/hero-boy.glb` として読み込む（`public/models/` は gitignore なので、このファイルからコピーする）
- `raw/`: Meshy から落としたままの GLB（コミットしない）
- `shots/meshy-*.png`: Meshy の画面を撮ったもの。`shots/world-*.jpg`: このプロジェクトのゲーム画面
