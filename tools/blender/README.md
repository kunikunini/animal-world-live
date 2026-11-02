# Blender によるライオン造形の実験（閉じた実験）

2026-11-02 夜、約30分で検証。結論は **プリミティブ版（`src/world/lions.ts`）を本線として確定**。

## やったこと

- Blender 5.2 LTS を Claude Code から操作し（mcp-for-blender の addon 経由）、`angie_v2.py` で断面リングのロフト＋Mirror＋Subdivision Surface のモデルを生成、glTF に書き出した
- three.js 側は `src/world/lionModel.ts` で読み込み、材質名でトゥーンに置換。`?lion=v2` を付けたときだけ差し替わり、読めなければプリミティブ版のまま
- 同じ定点カメラ（`__awl.view('angie' | 'angie-front' | 'angie-side')`）で両版を撮って比較した

## 所見

- 面の連続性は向上した（1枚の面としての「造形」になり、横・斜め前は伏せたネコ科に読める）
- 正面の課題（クマ・小動物寄りに見える）は両版で同等。Subdivision は小さな凹凸をならすので、頬・口先・眉のような特徴は二重リングや別パーツが要り、プリミティブ版と手間が変わらない
- 耳・尾の微アニメは関節（ピボット）構造が要る。プリミティブ版は部位ごとに Object3D を持つので保てるが、ロフト版は首から先を別メッシュに切る必要があり、継ぎ目が出る
- 以上から、締切までの残り日数ではプリミティブ版を磨くほうが確実と判断した

## 残すもの・残さないもの

- 残す: `angie_v2.py`（再現できる生成スクリプト）、`src/world/lionModel.ts`（読み込み側。glb が無ければ何もしない）
- 残さない: 生成した `public/models/*.glb`（`.gitignore` 済み）。必要になれば Blender でスクリプトを実行すれば再生成できる

## 再実行のしかた

Blender を起動して addon のサーバーが動いていれば、Python から localhost:9876 に `{"type": "execute_code", "params": {"code": <スクリプトの中身>}}` を送る。ヘッドレスなら `blender -b -P tools/blender/angie_v2.py` でも動く（出力先は環境変数 `ANGIE_OUT`）。
