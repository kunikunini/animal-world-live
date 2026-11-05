# ANIMAL WORLD LIVE

**"Make friends with animals around the world."**

[日本語版はこちら](#日本語版)

Walk through a hand-built 3D savanna, meet real lions, read their profiles, press "Become friends" by your own choice, and come back to see them anytime from your Friends Book. A web prototype.

## Why this exists

Some people cannot come to meet animals in person: children in long hospital stays, older people who can no longer travel far, and families who live too far away. For them, a real animal stays a picture in a book or a clip that scrolls past — you watch it, but you never go to meet it, choose it, or keep anything of the encounter. ANIMAL WORLD LIVE removes that wall. You walk through the savanna yourself, find a real lion, watch recorded footage of that same animal, learn how to tell her apart and what her keeper sees in her, and press "Become friends" only when you choose to. The encounter stays in your Friends Book, so the animal becomes someone you can come back to — not content you once watched. After the hackathon, the facility can keep adding its real animals, so people who cannot visit can keep meeting them from a hospital room, a care home, or home.

**Live demo:** https://animal-world-live.pages.dev (recorded footage is served from Cloudflare R2)

An entry for **Built with Claude: Japan 2026**, built from scratch during the hackathon period (from 2026-11-02). Development with Claude Code is logged in `DEVLOG.md` (Japanese).

## What works now

- Walk anywhere in a savanna of blue sky and golden grass. Tap/click to move, WASD also works, Space or the "Jump" button to jump. Drag to look around (including up and down), scroll to zoom.
- A minimap at the top left, and an "Open map" overlay. The map is not a radar but a record of encounters: only animals you have met appear (friends are marked). Tap a spot to walk there.
- A family of five lions lives in the world as stylized figures (Angie and the twins on the plateau, Alex a little apart, Riley by the waterhole). Approach and their names appear; stand close and "Look through binoculars" opens that animal's observation monitor. The 3D figures are a "sign" of the encounter, not a reproduction of real behavior.
- Observation monitor with **recorded footage** of the real animals. Angie, Claire and Carla play footage recorded during the hackathon (2026-11-03). A "Recorded" badge is always shown; nothing is presented as live.
- Each animal's profile (family, identifying marks, keeper's comment). Fields without final text show "Coming soon" instead of placeholder prose.
- Press "Become friends" by your own choice → saved to the Friend Book (localStorage). The Friend Book is laid out like a messaging app's chat list: one row per friend with the latest note, date and an unread count; tapping a row opens that animal's "chat". The chat shows what the data can say (the day you became friends, the recorded video with a play card) and the notices posted from the staff screen (see below). Until a real notice exists, one bubble clearly marked **Sample** explains what will arrive. You can write a short letter to the animal (or tap a quick phrase); letters are saved only on this device and nothing pretends they were delivered or read. Tap your own bubble to take a letter back. A small filter blocks contact details (phone numbers, email, URLs) and a short list of unkind words; animal names and species pass even when they contain one. The "Go see" button at the top right reopens the footage without walking the 3D world again — only friends have a chat, so this shortcut is for friends only. The heart button opens a "for grown-ups" gate (birth year, not saved) in front of tipping; behind it is a plain "coming later" notice, since there is no payment system.
- **Staff screen (prototype)** at `/staff.html` (also linked from Settings): facility staff pick an animal and post notices from templates — a notice, a recording plan (explicitly "not a live stream"), or a photo of the day (resized on the device) — with a live preview of how it looks in the chat. Letters are grouped into weekly digests that can be copied as text for the keepers; a reply to a letter can only be saved as a draft and reaches the chat after "approve and post" labeled "Reply from the keeper", so only words a keeper has checked are delivered and nothing is phrased as if the animal wrote it. Everything is device-local: there is no server, login or delivery to other devices, and the screen says so. The page is public and has no authentication; it is a demo of the mechanism, not a production tool.
- Keeps working without WebGL, without video, and without localStorage (no blank screens).

## What's next (during the hackathon)

- Footage for Alex and Riley (currently shown as "coming soon")
- Final profile text for all five lions
- Polish of the world (light, fog, grass) and testing on real phones
- The 3-minute demo video

## Future vision (not implemented in this entry)

Work with zoos and sanctuaries so that, through live streaming, you can visit animals around the world as they are right now.

The Friend Book's chat is designed as a letterbox, not a live conversation. The mechanism (staff notices, weekly letter digests, keeper-approved replies, a grown-ups gate before tipping) is built as a device-local prototype in this entry; what is not built is the server side: accounts for staff, delivery to visitors' devices, and payments for tipping. The UI says so wherever it matters.

## About the footage

All animal footage in this prototype is **recorded footage**, shot at Hokkaido Animal World during the hackathon. It is not a live stream. The facility has given permission to use the footage and photos.

- 2026-11-03: the lion family (Angie with the twins Claire and Carla)
- 2026-11-04: a spotted hyena; a South American tapir with a capybara; great white pelicans with kangaroos and a mara; ponies; a common squirrel monkey (listed in `src/data/videos.json`)

The species of each 2026-11-04 video come from the names of the original files. Which animal is on camera has not been checked, so for a species with several animals the same video is shown for each of them and the monitor says so. If only one animal of that species lives at the facility, the video is shown as that animal's.

The delivery versions are 720p, H.264/AAC, converted from HLG to SDR. The original files are not in this repository. `public/media/` holds the poster images and the lion family video; the 2026-11-04 videos are kept out of the repository to keep it small and are served from R2. On the published site a video appears once it has been uploaded to R2 (`onR2` in `src/data/videos.json`); until then it appears only on the development server.

The published site streams the footage from Cloudflare R2 (`https://media.kobakuni.com/<file>`); a copy in `public/media/` (when present) is the fallback for local development. See "Deployment" below.

For animals without footage yet, a self-made placeholder video (color and text only, no external material) can be generated with ffmpeg:

```bash
./scripts/make-placeholder-video.sh
```

## Data sources and credits

- **Animals and footage:** Hokkaido Animal World ([official site](https://hokkaidoanimalworld.com)). The five lions are real animals kept there. Their profile data is extracted from the facility's keeping records, limited to items approved for publication, and stored as static JSON (`src/data/animals.json`). No personal information is included; keepers are not named. The list of the other animals by world (world, species, name, and whether the species is shown first) is generated from the facility's animal register as of 2026-11-04 (`src/data/roster.json`, via `tools/roster-from-csv.mjs`); animals currently away or no longer at the facility are excluded, and no keeper names, enclosure names or feeding data are included. Animals without a photo yet are shown as a paw silhouette.
- **Lion figures:** the five lions in the savanna are 3D models generated with [Meshy](https://www.meshy.ai) (Image to 3D, Pro plan) from clay-style reference pictures of each lion that we prepared during the hackathon, then rigged with Meshy's quadruped rig and optimized with gltf-transform. They were generated with the license setting "Private" (models generated on Meshy's paid plans are owned by the user; see `public/models/SOURCE.md`). Credit: 3D models generated with Meshy.
- **Everything else** (world, the other animals' figures, sounds, UI) is generated by code written during the hackathon. Apart from the five lion models above, no external 3D assets, textures, audio or photos are used.

## Tech

Vite + TypeScript + Three.js, plain DOM, deployed as a static site. The world is procedural; the five lions are AI-generated glTF models (`public/models/lion-*.glb`, about 1.3 MB in total) with a walk clip that plays only while a lion is actually moving. Animal data is JSON-driven; the Friends Book lives in localStorage; footage is MP4 played with `<video playsinline>`.

### Lion models

The five lions are loaded from `public/models/lion-*.glb` (source and license: `public/models/SOURCE.md`). On load, Meshy's materials are replaced with the world's shared toon material (keeping only the color texture), each model is scaled to the length of the primitive lion it replaces, and a posture fix straightens the walk clip (Meshy's quadruped rig is canine and makes a lion crouch). Lions wander a few meters around their spot and the walk clip plays only while they move; while standing they breathe and move head, ears and tail. Open the app with `?model=primitive` to fall back to the earlier primitive (lying) lions; if a model cannot be loaded, that lion stays primitive.

`tools/blender/angie_v2.py` remains as an earlier experiment: a Blender 5.2 Python script that models a stylized lion purely in code (`?lion=v2` swaps in `public/models/angie-v2.glb`, which is not committed).

## Development

```bash
npm install
npm run dev
```

## Deployment

- **Site:** Cloudflare Pages, connected to this GitHub repository. Build command `npm run build`, output directory `dist`, Node 22. Every push to `main` deploys.
- **Footage:** Cloudflare R2 bucket `awl-media`, served at `https://media.kobakuni.com/<file>`. Pages limits each file to 25 MiB, so the mp4 files are never part of the site build: the Vite plugin in `vite.config.ts` removes `dist/media/*.mp4` after the build (the build log prints each excluded file). The player tries the R2 URL first and falls back to the repository copy (`/media/<file>`), which keeps the dev server and phone testing over LAN working.
- To add footage for another animal: upload the mp4 to the bucket under the same name as in `public/media/`, then point its `video.url` / `video.fallbackUrl` in `src/data/animals.json` at it.

```bash
npx wrangler r2 object put awl-media/<file>.mp4 --file public/media/<file>.mp4 --content-type video/mp4 --cache-control "public, max-age=31536000, immutable" --remote
```

---

# 日本語版

**「世界中の動物たちと、友達になろう。」**

美しい3Dのサバンナを歩いて、実在するライオンたちと出会い、プロフィールを知り、自分の意思で「ともだちになる」を押して、ともだち帳からいつでも会いに行ける。そんなWebプロトタイプです。

## なぜ作るのか

動物に会いに来たくても、来られない人がいます。長期入院中の子ども、遠出が難しくなった高齢者、施設から遠くに住む家族です。その人たちにとって実在の動物は、図鑑の写真や、流れて終わる短い動画のままです。見て終わりで、自分で会いに行き、自分で選んで、思い出として残すことができません。ANIMAL WORLD LIVEは、その壁を取り払います。自分でサバンナを歩いて実在のライオンと出会い、その個体の収録映像を見て、見分け方や飼育員の見ている魅力を知り、自分の意思で「ともだちになる」を押す。ともだち帳に出会いが残るので、その動物は「一度見たコンテンツ」ではなく、何度でも会いに行ける存在になります。ハッカソン後も、施設が実在の動物を増やし続けることで、来られない人が病室や介護施設、自宅から会いに来続けられます。

**公開デモ:** https://animal-world-live.pages.dev （収録映像は Cloudflare R2 から配信）

Built with Claude: Japan 2026 の提出作品として、ハッカソン期間中（2026-11-02 以降）に新規制作しています。Claude Code との制作過程は `DEVLOG.md` に記録しています。

## いま動くもの

- 青空と金の草原のサバンナをどこでも歩ける（タップ／クリックで移動、WASD でも移動、Space か「ジャンプ」で跳ぶ。ドラッグで視点を回し上下にも向け、ホイールで寄る）
- 左上のミニマップと「地図を広げる」の全体地図。地図はレーダーではなく出会いの記録で、出会った動物だけが載る（ともだちは区別）。タップした場所へ歩ける
- ライオンの家族5頭が様式化した姿でワールドにいる（台地にアンジーと双子、少し離れてアレックス、水場のそばにライリー）。近づくと名前が出て、そばに来ると「双眼鏡で見る」からその個体の観察モニターへ。3Dの姿は本物の行動を写したものではなく、出会いの「しるし」
- 観察モニターで実在するライオンの**収録映像**を見る。アンジー・クレア・カーラはハッカソン期間中（2026-11-03）に収録した映像を再生。「収録映像」バッジを常時表示し、ライブ配信に見える表示はしない
- 個体のプロフィール（家族・見分けポイント・飼育員コメント。原稿が入るまでは「準備中」と表示）
- 自分の意思で「ともだちになる」→ ともだち帳に記録（localStorage）。ともだち帳はメッセージアプリのトーク一覧の形で、ともだち1頭が1行（最後のひとこと・日付・未読の数）。行を押すとその子の「トーク」が開き、データから言えること（ともだちになった日、収録映像のカード）と、スタッフ画面（下記）から出したお知らせが並ぶ。本物のお知らせがまだ無い子には、**みほん**と明記した1通で何が届くかを説明する。その子へ短いお手紙を書ける（ひとことの札もある）が、保存はこの端末だけで、届いた・読まれたという演出はしない。自分の吹き出しを押すと「とりけす」。連絡先（電話番号・メール・URL）と乱暴な言葉の短い一覧は送れない（動物の名前・種名は、止める言葉を含んでいても通す）。右上の「会いに行く」で3Dを歩かずに映像へ再訪できる（トークがあるのはともだちだけなので、この近道もともだち専用）。ハートは投げ銭の前の「おとなの方へ」（生まれた年を聞くだけで保存しない）。通った先は「準備中」の案内だけで、決済は無い
- **スタッフ画面（試作）** `/staff.html`（設定からも開ける）: 施設のスタッフが動物を選び、定型（お知らせ／収録の予定〈「ライブ配信ではない」と明記〉／きょうの写真〈端末の中で縮小〉）からお知らせを書いて出す。トークでの見え方をその場でプレビュー。届いたお手紙は週ごとの「お手紙まとめ」にして、文章としてコピーして飼育員に渡せる。お手紙へのお返事は下書きにしか保存できず、「承認して出す」で初めてトークに「飼育員さんからのお返事」として届く（飼育員が確かめた言葉だけが届き、動物が書いた形にはしない）。すべてこの端末の中だけで動く。サーバー・ログイン・ほかの端末への配信は無く、画面にもそう書いてある。このページは公開されていて認証は無い。しくみのデモであって、運用のための道具ではない
- WebGL・映像・localStorage が使えなくても操作を続けられる（白画面にしない）

## これから作るもの（期間中の予定）

- アレックスとライリーの映像（現在は「準備中」表示）
- 5頭のプロフィール原稿の投入
- 世界の磨き（光・霧・草）、スマホ実機での確認
- 3分のデモ動画

## 将来構想（今回は実装しません）

動物園や保護施設と連携し、ライブ配信で「今の姿」に会いに行ける世界へ。

ともだち帳のトークは、会話ではなく「手紙箱」として設計している。しくみ（スタッフのお知らせ、週ごとのお手紙まとめ、飼育員が承認したお返事、投げ銭の前の「おとなの方へ」）は、この端末の中だけで動く試作として今回作った。作っていないのはサーバー側で、スタッフのアカウント、来た人の端末への配信、投げ銭の決済。UI では要るところにそう書いている。

## 映像について

このプロトタイプで使う動物映像は、ハッカソン期間中に北海道アニマルワールドで収録した**収録映像**です。ライブ配信ではありません。映像・写真の使用は施設の許諾を得ています。

- 2026-11-03：ライオンの親子（アンジーと、ふたごのクレア・カーラ）
- 2026-11-04：ブチハイエナ、アメリカバクとカピバラ、モモイロペリカンとカンガルーとマーラ、ポニー、コモンリスザル（一覧は `src/data/videos.json`）

2026-11-04 の映像の種は、収録した元ファイルの名前から取っています。どの個体が映っているかは確かめていないので、同じ種が複数いる時はその子たちみんなに同じ映像を出し、モニターにそう書いています。施設にその種が 1 頭だけの時は、その子の映像として出しています。

配信用の版は 720p、H.264/AAC（HLG から SDR へ変換）です。収録した元ファイルはリポジトリに入れていません。`public/media/` にはポスター画像とライオンの親子の映像を置いています。2026-11-04 の映像はリポジトリを軽くするためリポジトリに入れず、R2 から配信します。公開サイトでは R2 に上げ終えた映像だけを出し（`src/data/videos.json` の `onR2`）、上げるまでは開発サーバーでだけ見えます。

公開サイトでは映像を Cloudflare R2（`https://media.kobakuni.com/<ファイル名>`）から配信します。`public/media/` に同じ名前の映像がある時は、ローカル開発時の予備になります。詳しくは下の「公開」を参照してください。

映像がまだない個体には、色と文字だけの自作プレースホルダ映像を使えます。生成するには ffmpeg を入れて次を実行します（実写や外部の素材は使いません）。

```bash
./scripts/make-placeholder-video.sh
```

## データの出所とクレジット

- **動物と映像**：北海道アニマルワールド（[公式サイト](https://hokkaidoanimalworld.com)）。5頭は同施設で飼育されている実在のライオンです。個体情報は施設の飼育記録から、公開してよい項目だけを静的データ（`src/data/animals.json`）として抽出したものです。個人情報は含みません。飼育員の氏名は記載しません。ほかの動物のワールド別の一覧（ワールド・種・個体名・先に作る種かどうか）は、施設の動物台帳（2026年11月4日時点）から生成しています（`src/data/roster.json`、`tools/roster-from-csv.mjs`）。お出かけ中の個体・施設にいない個体は除き、担当者名・飼育エリア名・給餌の情報は含みません。写真がまだ無い子は足あとのシルエットで出しています
- **ライオンの造形**：サバンナにいる5頭は、期間中に用意した各個体のクレイ風の参照画像から [Meshy](https://www.meshy.ai)（Image to 3D、Pro プラン）で生成した3Dモデルです。Meshy の四足リグと歩行を付け、gltf-transform で最適化しています。生成時のライセンス設定は「プライベート」で、Meshy の有料プランで生成したモデルは利用者が所有権を持ちます（出所の詳細は `public/models/SOURCE.md`）。クレジット：3D モデルは Meshy で生成
- **それ以外**（世界、ほかの動物の造形、音、UI）はすべて期間中に書いたコードで生成しています。上の5頭のモデルを除き、外部の3D素材・テクスチャ・音源・写真は使っていません

## 技術

Vite + TypeScript + Three.js、素のDOM、静的サイトとして配信。世界は手続き生成で、ライオン5頭だけ AI 生成の glTF モデル（`public/models/lion-*.glb`、合計 約 1.3 MB）。歩行クリップはライオンが実際に移動している間だけ再生します。個体データはJSON駆動、ともだち帳は localStorage、映像はMP4を `<video playsinline>` で再生。

### ライオンのモデル

5頭は `public/models/lion-*.glb` から読み込みます（出所とライセンスは `public/models/SOURCE.md`）。読み込み時に Meshy の素材をワールド共通のトゥーン素材に差し替え（色の画像だけ残す）、置き換えるプリミティブ版の体の長さに大きさをそろえ、歩行クリップの姿勢を補正します（Meshy の四足リグはイヌ科用で、ライオンの体だと腰が落ちるため）。ライオンは自分の場所のまわりを数 m 歩いては立ち止まり、歩行クリップは移動している間だけ再生します。止まっている間は呼吸と、首・耳・尾の動きだけです。`?model=primitive` を付けて開くと以前のプリミティブ版（伏せ）に戻り、モデルが読めない子もプリミティブ版のままになります。

`tools/blender/angie_v2.py` は以前の実験として残しています（Blender 5.2 の Python で様式化したライオンをコードだけで造形するスクリプト。`?lion=v2` で `public/models/angie-v2.glb` に差し替わりますが、この glb はコミットしていません）。

## 開発

```bash
npm install
npm run dev
```

## 公開

- **サイト本体:** Cloudflare Pages。この GitHub リポジトリに接続し、ビルドコマンド `npm run build`、出力 `dist`、Node 22。`main` への push ごとに公開されます
- **映像:** Cloudflare R2 のバケット `awl-media` を `https://media.kobakuni.com/<ファイル名>` で配信。Pages は1ファイル 25 MiB までなので、mp4 はサイトのビルドに含めません。`vite.config.ts` のプラグインがビルド後に `dist/media/*.mp4` を消します（ビルドログに除外したファイルが出ます）。プレイヤーはまず R2 の URL を試し、読めなければリポジトリ内の `/media/<ファイル名>` に切り替えるので、開発サーバーや LAN での実機確認はそのまま動きます
- 個体の映像を増やすときは、`public/media/` と同じ名前でバケットにアップロードし、`src/data/animals.json` の `video.url` / `video.fallbackUrl` を向けます

```bash
npx wrangler r2 object put awl-media/<file>.mp4 --file public/media/<file>.mp4 --content-type video/mp4 --cache-control "public, max-age=31536000, immutable" --remote
```
