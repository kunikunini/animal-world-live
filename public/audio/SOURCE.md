# public/audio の出所

ワールドの BGM・環境音・効果音。すべて期間中に生成したもの。ほかに、「ともだちになる」の既定の音（`src/ui/chime.ts`）は音源を使わずにコードで合成している。

## BGM（`bgm-*.mp3`）

- **生成**: [Suno](https://suno.com)（くにのアカウント、Pro プラン、2026-11-06）。カスタムモードで Instrumental（歌なし）にし、1 曲につき 1 回だけ生成した（1 回で 2 案。8 曲で 16 案）。スタイルの指定は共通の「instrumental, no vocals, warm acoustic, cozy claymation adventure game soundtrack, marimba, wooden flute, gentle hand percussion, seamless loop, light and friendly」に、曲ごとの楽器とテンポを足したもの。歌詞は入れていない
- **ライセンス**: Suno の Pro プランは商用利用の権利つき（Suno の料金ページで確認、2026-11-06）。README のクレジットには「BGM: Suno で生成」と書く
- **編集**（ffmpeg 8、numpy で区間を選ぶ）: 元の曲（95〜205 秒）からテンポを推定し、4 拍 × 小節の数で 70〜88 秒の区間を選んだ（11/6 に、くにの「30 秒くらいで次の曲になる」を受けて 40〜55 秒から延ばした。ジャングルの B 案は元の曲が 94.7 秒なので 65 秒）。区間の頭と、区間の終わりの直後の音の中身がいちばん似ている所を選び、曲の頭のイントロと終わりは避けた。区間の頭の 2.5 秒に、区間の直後の 2.5 秒をクロスフェードで重ねて、終わりから頭へ戻る所が元の曲の続きになるようにした。平均音量は -18 dB（ピークは -1 dB まで）にそろえ、ステレオ 128 kbps（1 曲 1.05〜1.38 MB）
- **ループの余白**: mp3 の両端の数ミリ秒はデコードでぶれるので、ファイルにはループの前後に「ループの続き」を 0.25 秒ずつ足してある。再生側（`src/audio/sound.ts`）は `loops.json` に書いたループの長さを使って、内側だけをくり返す（環境音も同じ）
- **2 案は両方使う**（くにの指示、2026-11-06）: `bgm-<場所>.mp3` が 1 曲目、`bgm-<場所>-2.mp3` が 2 曲目。それぞれループ 1 回分（62〜83 秒）ずつ交互に流し、曲の切り替わりは 3 秒のクロスフェード（`src/audio/sound.ts`）。どちらを 1 曲目にするかは、継ぎ目の前後が似ている方にした
- 空の世界はまだ入れないワールドなので、`bgm-sky.mp3` はファイルだけ置いて、鳴らす所はまだ無い（水の世界は 11/6 に歩いて行けるようになったので、そこで鳴らす）

| ファイル | 用途（鳴る所） | 使った案 | ループの長さ | 推定テンポ | サイズ |
|---|---|---|---|---|---|
| `bgm-home.mp3` | ホーム | A（元 123.5 s の 35.8 s から） | 70.0 s | 99 BPM | 1,129,932 B |
| `bgm-savanna.mp3` | サバンナ | A（元 204.7 s の 40.8 s から） | 83.6 s | 103 BPM | 1,346,856 B |
| `bgm-jungle.mp3` | ジャングル | A（元 127.6 s の 16.8 s から） | 85.3 s | 96 BPM | 1,373,604 B |
| `bgm-north.mp3` | 北の世界 | A（元 163.2 s の 21.5 s から） | 72.2 s | 70 BPM | 1,163,788 B |
| `bgm-south.mp3` | 南半球 | A（元 180.0 s の 23.5 s から） | 70.2 s | 92 BPM | 1,132,859 B |
| `bgm-water.mp3` | 水の世界 | B（元 199.9 s の 93.0 s から） | 79.7 s | 66 BPM | 1,284,160 B |
| `bgm-sky.mp3` | 空の世界（まだ鳴らさない） | B（元 184.9 s の 60.8 s から） | 80.2 s | 108（指定は 80。推定のずれの可能性あり） BPM | 1,293,353 B |
| `bgm-partner.mp3` | ふれあいワールドと、ともだち帳を開いている間 | B（元 148.2 s の 29.0 s から） | 80.8 s | 86 BPM | 1,302,134 B |
| `bgm-home-2.mp3` | ホームの 2 曲目 | B（元 139.6 s の 13.8 s から） | 82.1 s | 99 BPM | 1,323,029 B |
| `bgm-savanna-2.mp3` | サバンナの 2 曲目 | B（元 203.5 s の 56.5 s から） | 76.6 s | 103 BPM | 1,235,261 B |
| `bgm-jungle-2.mp3` | ジャングルの 2 曲目（元の曲が短いので 65 秒） | B（元 94.7 s の 13.0 s から） | 65.2 s | 96 BPM | 1,052,612 B |
| `bgm-north-2.mp3` | 北の世界の 2 曲目 | B（元 165.1 s の 49.0 s から） | 85.9 s | 70 BPM | 1,384,052 B |
| `bgm-south-2.mp3` | 南半球の 2 曲目 | B（元 170.0 s の 65.5 s から） | 78.0 s | 92 BPM | 1,257,411 B |
| `bgm-water-2.mp3` | 水の世界の 2 曲目 | A（元 194.0 s の 75.3 s から） | 76.1 s | 66 BPM | 1,226,482 B |
| `bgm-sky-2.mp3` | 空の世界の 2 曲目（まだ鳴らさない） | A（元 177.2 s の 48.5 s から） | 82.8 s | 78 BPM | 1,333,477 B |
| `bgm-partner-2.mp3` | ふれあいの 2 曲目 | A（元 164.8 s の 64.0 s から） | 83.6 s | 86 BPM | 1,346,856 B |

## 主人公の声（`vo-<主人公>-<セリフ>.mp3`）

- **声づくり**: [ElevenLabs](https://elevenlabs.io) の Voice Design（API `POST /v1/text-to-voice/design`、モデル `eleven_ttv_v3`、2026-11-06）で、6 人それぞれ 1 回（3 案）作り、1 案を My Voices に登録した。ElevenLabs は子どもの声・子どもらしく作った声をボイスライブラリに載せられない決まりなので（公式ヘルプ）、声は「アニメで少年少女役を演じる、大人の声優のような声」として説明した。男の子 3 人（黄色・青緑・青い帽子）は少年役、女の子 3 人（ピンク・紫・三つ編み）は少女役で、性格ごとに声の調子を分けた
- **どの案を使うか**: 声の高さを測って仮に選んだ（男の子は 3 案のうち低め、女の子は高め。3 人どうしが近くならないように）。最終判定はくに。候補 3 案は聴き比べのページにある
- **セリフ**: Text to Speech（モデル `eleven_v4`、日本語、2026-11-06）。「冒険に出発だ！」（子を選んで出発する時）、ジャンプ「えいっ！」と「やっ！」（黄色・青い帽子）／「ホイッ！」（ほか。はじめは「それっ！」だったが、くにが聴いて語尾が下がって聞こえたので言い換えた）、着地「っと！」（高い所から落ちた時だけ）、息づかい 2 種（5 秒以上歩き続けた時、6 秒おき）、「あっ、見つけた！」（動物と出会った時）、「よしっ！」「やったー！」（ともだちになるを押した時。動物が承諾したという言い方はしない）。ローカルの whisper で文字起こしして、セリフどおりか確かめた（「よっ！」「とうっ！」は別の音に、「ほいっ！」「ほっ！」は「はい！」「はっ！」に聞こえたので言い換えた）
- **編集**: 前後の無音を切り、最大音量を -3 dB にそろえて、モノラル 96 kbps。音量は効果音のつまみとミュートに入る
- 6 人 × 9 種 = 54 本、合計 958,120 B

## おはなし（紙芝居のオープニング）のナレーションと曲（`vo-story-*.mp3`、`bgm-story.mp3`）

- **ナレーション**: 黄色いジャケットの子の声（上の Voice Design の声）で、Text to Speech（モデル `eleven_v4`、日本語、2026-11-06）。9 本（箱が届く・青い双眼鏡・のぞくと・走る・ライリー・収録映像・きみがきめる・ともだち帳・7 つのワールド）。最後の「世界中の どうぶつたちと、ともだちになろう！」は 6 人全員の声で 1 本ずつ作り（計 6 本）、ffmpeg で 20〜60 ms ずつずらして 1 つに重ねた（`vo-story-finale.mp3`）。前後の無音を切り、最大音量を -3 dB にそろえて、モノラル 96 kbps。台本どおりに読めているかの文字起こしでの確認はまだ（ローカルの whisper はモデルの取得が証明書で止まり、API キーに文字起こしの権限が無かった）。日本語だけ（英語表示の時はナレーションなし）
- **曲**: `bgm-story.mp3` はサバンナの曲（Suno、take A、元 204.7 s）をループに切る前の元の音源から、最初の 100 秒を切り出したもの（冒頭 1.5 秒フェードイン、95 秒から 5 秒フェードアウト、ステレオ 128 kbps、1,804,505 B）。おはなしの間だけ 1 回鳴らし、ループしない

## 効果音・環境音（`se-*.mp3`、`amb-*.mp3`）

- **生成**: [ElevenLabs](https://elevenlabs.io) の Sound Effects（API `POST /v1/sound-generation`、2026-11-06）。**今ゲームで鳴っているのは、新しいモデル `eleven_text_to_sound_v3` で 20 本すべてを作り直したもの**（11/6 午後。それまでの `eleven_text_to_sound_v2` は廃止予定の古いモデルだった）。前の版は聴き比べのページにある。くにの ElevenLabs アカウントで生成した。v3 も 1 つにつき 1 回生成した（20 回、1 秒 40 クレジットで計 4,400）
- **環境音**は `loop: true`（ループ用）で 20 秒を生成し、BGM と同じやり方（17.5 秒の区間＋直後の 2.5 秒をクロスフェード、前後に 0.25 秒の余白）でループにした。8 kHz から上を軽く削った（v3 は v2 より高い音がずっと少なく、サバンナの 8 kHz 以上は 62% → 6%）。人の声と音楽は入れないよう指示した
- **編集**（ffmpeg 8、v3 の版）: 効果音は前後の無音を切り、最大音量をそろえ（足音 -5 dB、ジャンプ・タップ -6 dB、着地 -4 dB、ほか -3 dB）、足音は 0.28 秒・ジャンプ 0.35 秒・着地 0.30 秒までに切って（次の 1 歩に重ならないよう）、末尾 50 ms をフェードアウト。足音は 7 kHz、スコープは 10 kHz から上を軽く削った。モノラル 96 kbps。v3 は雑音の床がとても低い（-83 dB 前後）ので、元が小さい音（草の足音 1 本目 +31 dB、スコープ +23 dB）を持ち上げても雑音は目立たない（最初の版の違和感は、床が高い音を持ち上げたためだった）。環境音は平均音量を -30 dB に（上げ幅は +20 dB まで）そろえて、ステレオ 96 kbps
- **これまでの版**（聴き比べのページにある）: v2 で作った最初の版 → 足音・ジャンプ・着地を素直な音で作り直した版 → 環境音と草の足音の高い音を削った版 → 今の v3
- **ライセンス**: くにの ElevenLabs の有料プランのアカウントで生成した。README のクレジットには「効果音・環境音: ElevenLabs で生成」と書く
- 個人情報は含まない

| ファイル | 用途（鳴る所） | 長さ | サイズ |
|---|---|---|---|
| `amb-savanna.mp3` | サバンナの空気の音（風・鳥・虫） | ループ 17.5 s | 216,964 B |
| `amb-jungle.mp3` | ジャングルの空気の音（鳥・虫・葉擦れ・遠い水音） | ループ 17.5 s | 216,964 B |
| `amb-north.mp3` | 北の世界の空気の音（冷たい風・雪が落ちる音） | ループ 17.5 s | 216,964 B |
| `amb-south.mp3` | 南半球の空気の音（おだやかな風・鳥・草） | ループ 17.5 s | 216,964 B |
| `amb-water.mp3` | 水の世界の空気の音（浜に寄せる小さな波・海風・遠い海鳥） | ループ 17.5 s | 216,964 B |
| `se-step-grass-1〜3.mp3` | 草の上の足音（歩きの揺れの 1 歩ごと、再生時に高さを ±4% ゆらす。水の世界の砂浜でもこれ） | 0.21〜0.31 s | 2,865〜4,119 B |
| `se-step-snow-1〜3.mp3` | 雪の上の足音（北の世界） | 0.26〜0.31 s | 3,492〜4,119 B |
| `se-jump.mp3` | ジャンプ | 0.39 s | 5,059 B |
| `se-land.mp3` | 着地 | 0.34 s | 4,432 B |
| `se-scope-open.mp3` | 双眼鏡を構える（アニマルスコープを開く／ホームとワールドの間で幕が閉じる） | 0.37 s | 4,746 B |
| `se-scope-close.mp3` | 双眼鏡を下ろす（アニマルスコープを閉じる／幕が開く） | 0.21 s | 2,865 B |
| `se-encounter.mp3` | 動物との出会い（頭の上に双眼鏡の札が出た時。同じ子は 12 秒あけるまで鳴らし直さない） | 0.78 s | 9,761 B |
| `se-friend.mp3` | 「ともだちになる」の新しい音の候補（設定で「新しい音」を選んだ時だけ。既定は合成のチャイム） | 1.15 s | 14,150 B |
| `se-tap.mp3` | UI の決定・タップ（ボタン） | 0.08 s | 1,297 B |
| `se-book.mp3` | ともだち帳を開く | 0.29 s | 3,805 B |
| `se-notice.mp3` | お知らせ（スタッフ画面から新しいお知らせが出た時） | 0.60 s | 7,567 B |

## Source of `public/audio` (English)

Background music (`bgm-*.mp3`) was generated with [Suno](https://suno.com) (Pro plan, which includes commercial-use rights; 2026-11-06) as instrumentals, one generation (two takes) per track, then cut into 65-86 s seamless loops with ffmpeg. Both takes of each track are used: `bgm-<place>.mp3` and `bgm-<place>-2.mp3` alternate, one loop each, with a 3 s crossfade. `loops.json` holds the exact loop lengths; each file has 0.25 s of padding on both sides. The player characters' voices (`vo-*.mp3`) were designed with ElevenLabs Voice Design (`eleven_ttv_v3`) as anime-style young hero roles performed by adult voice actresses (ElevenLabs does not allow child voices in its library), and the lines were generated with Text to Speech (`eleven_v4`, Japanese). Sound effects and ambience (`se-*.mp3`, `amb-*.mp3`) were generated with [ElevenLabs](https://elevenlabs.io) Sound Effects (API, model `eleven_text_to_sound_v3`, 2026-11-06), one generation each, then trimmed and level-matched with ffmpeg. They were generated on a paid ElevenLabs plan. The default "become friends" chime is synthesized in code (`src/ui/chime.ts`). No personal information is included.
