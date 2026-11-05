# public/audio の出所

ワールドの BGM・環境音・効果音。すべて期間中に生成したもの。ほかに、「ともだちになる」の既定の音（`src/ui/chime.ts`）は音源を使わずにコードで合成している。

## BGM（`bgm-*.mp3`）

- **生成**: [Suno](https://suno.com)（くにのアカウント、Pro プラン、2026-11-06）。カスタムモードで Instrumental（歌なし）にし、1 曲につき 1 回だけ生成した（1 回で 2 案。8 曲で 16 案）。スタイルの指定は共通の「instrumental, no vocals, warm acoustic, cozy claymation adventure game soundtrack, marimba, wooden flute, gentle hand percussion, seamless loop, light and friendly」に、曲ごとの楽器とテンポを足したもの。歌詞は入れていない
- **ライセンス**: Suno の Pro プランは商用利用の権利つき（Suno の料金ページで確認、2026-11-06）。README のクレジットには「BGM: Suno で生成」と書く
- **編集**（ffmpeg 8、numpy で区間を選ぶ）: 元の曲（95〜205 秒）からテンポを推定し、4 拍 × 小節の数で 40〜55 秒の区間を選んだ。区間の頭と、区間の終わりの直後の音の中身がいちばん似ている所を選び、曲の頭のイントロと終わりは避けた。区間の頭の 2.5 秒に、区間の直後の 2.5 秒をクロスフェードで重ねて、終わりから頭へ戻る所が元の曲の続きになるようにした。平均音量は -18 dB（ピークは -1 dB まで）にそろえ、ステレオ 128 kbps
- **ループの余白**: mp3 の両端の数ミリ秒はデコードでぶれるので、ファイルにはループの前後に「ループの続き」を 0.25 秒ずつ足してある。再生側（`src/audio/sound.ts`）は `loops.json` に書いたループの長さを使って、内側だけをくり返す（環境音も同じ）
- **2 案のどちらを使うか**: 継ぎ目の前後が似ている方を仮に選んだ。最終判定はくに。もう 1 案もループにして、リポジトリの外（`~/apps/ANIMAL-WORLD-LIVE-HANDOFF/audio-candidates/`、`bgm-<場所>-a.mp3`／`-b.mp3`）に置いてある
- 水の世界・空の世界はまだ入れないワールドなので、`bgm-water.mp3`・`bgm-sky.mp3` はファイルだけ置いて、鳴らす所はまだ無い

| ファイル | 用途（鳴る所） | 使った案 | ループの長さ | 推定テンポ | サイズ |
|---|---|---|---|---|---|
| `bgm-home.mp3` | ホーム | A（元 123.5 s の 24.8 s から） | 48.3 s | 99 BPM | 782,190 B |
| `bgm-savanna.mp3` | サバンナ | A（元 204.7 s の 77.5 s から） | 44.1 s | 103 BPM | 715,320 B |
| `bgm-jungle.mp3` | ジャングル | A（元 127.6 s の 47.3 s から） | 40.1 s | 96 BPM | 651,371 B |
| `bgm-north.mp3` | 北の世界 | A（元 163.2 s の 25.0 s から） | 55.0 s | 70 BPM | 889,189 B |
| `bgm-south.mp3` | 南半球 | A（元 180.0 s の 27.0 s から） | 52.0 s | 92 BPM | 841,541 B |
| `bgm-water.mp3` | 水の世界（まだ鳴らさない） | B（元 199.9 s の 20.5 s から） | 43.5 s | 66 BPM | 704,869 B |
| `bgm-sky.mp3` | 空の世界（まだ鳴らさない） | B（元 184.9 s の 72.0 s から） | 40.1 s | 108 BPM（指定は 80。推定のずれの可能性あり） | 651,368 B |
| `bgm-partner.mp3` | ふれあい・パートナー（ともだち帳を開いている間） | B（元 148.2 s の 49.0 s から） | 52.9 s | 86 BPM | 856,172 B |

## 効果音・環境音（`se-*.mp3`、`amb-*.mp3`）

- **生成**: [ElevenLabs](https://elevenlabs.io) の Sound Effects（API `POST /v1/sound-generation`、モデル `eleven_text_to_sound_v2`、2026-11-06）。くにの ElevenLabs アカウントで生成した。1 つにつき 1 回生成し、撮り直しはしていない（計 19 回）
- **環境音**は `loop: true`（ループ用）で 30 秒を生成し、BGM と同じやり方（27.5 秒の区間＋直後の 2.5 秒をクロスフェード、前後に 0.25 秒の余白）でループにした。人の声と音楽は入れないよう指示した
- **編集**（ffmpeg 8）: 効果音は前後の無音を切り、最大音量をそろえ（足音 -4 dB、タップ -6 dB、ほか -3 dB）、末尾 40 ms をフェードアウトして、モノラル 96 kbps にした。環境音は平均音量を -30 dB にそろえて、ステレオ 96 kbps にした。草の足音と「スコープを閉じる」は元の音がとても小さく、+26〜30 dB 上げている
- **ライセンス**: 生成したアカウントのプランと、それに伴う利用条件はまだ確認していない（API キーに契約情報を読む権限が無いため、こちらから確かめられなかった）。README のクレジットには「効果音・環境音: ElevenLabs で生成」と書く
- 個人情報は含まない

| ファイル | 用途（鳴る所） | 長さ | サイズ |
|---|---|---|---|
| `amb-savanna.mp3` | サバンナの空気の音（風・鳥・虫） | ループ 27.5 s | 336,710 B |
| `amb-jungle.mp3` | ジャングルの空気の音（鳥・虫・葉擦れ・遠い水音） | ループ 27.5 s | 336,710 B |
| `amb-north.mp3` | 北の世界の空気の音（冷たい風・雪が落ちる音） | ループ 27.5 s | 336,710 B |
| `amb-south.mp3` | 南半球の空気の音（おだやかな風・鳥・草） | ループ 27.5 s | 336,710 B |
| `se-step-grass-1〜3.mp3` | 草の上の足音（歩きの揺れの 1 歩ごと、再生時に高さを ±4% ゆらす） | 0.16〜0.29 s | 2,238〜3,805 B |
| `se-step-snow-1〜3.mp3` | 雪の上の足音（北の世界） | 0.42〜0.44 s | 5,373〜5,686 B |
| `se-jump.mp3` | ジャンプ | 0.63 s | 7,880 B |
| `se-land.mp3` | 着地 | 0.42 s | 5,373 B |
| `se-scope-open.mp3` | 双眼鏡を構える（アニマルスコープを開く／ホームとワールドの間で幕が閉じる） | 0.57 s | 7,253 B |
| `se-scope-close.mp3` | 双眼鏡を下ろす（アニマルスコープを閉じる／幕が開く） | 0.50 s | 6,313 B |
| `se-encounter.mp3` | 動物との出会い（頭の上に双眼鏡の札が出た時。同じ子は 12 秒あけるまで鳴らし直さない） | 1.04 s | 12,896 B |
| `se-friend.mp3` | 「ともだちになる」の新しい音の候補（設定で「新しい音」を選んだ時だけ。既定は合成のチャイム） | 1.52 s | 18,538 B |
| `se-tap.mp3` | UI の決定・タップ（ボタン） | 0.13 s | 1,924 B |
| `se-book.mp3` | ともだち帳を開く | 0.78 s | 9,761 B |
| `se-notice.mp3` | お知らせ（スタッフ画面から新しいお知らせが出た時） | 0.73 s | 9,134 B |

## Source of `public/audio` (English)

Background music (`bgm-*.mp3`) was generated with [Suno](https://suno.com) (Pro plan, which includes commercial-use rights; 2026-11-06) as instrumentals, one generation (two takes) per track, then cut into 40-55 s seamless loops with ffmpeg. The other take of each track is kept outside the repository for comparison. `loops.json` holds the exact loop lengths; each file has 0.25 s of padding on both sides. Sound effects and ambience (`se-*.mp3`, `amb-*.mp3`) were generated with [ElevenLabs](https://elevenlabs.io) Sound Effects (API, model `eleven_text_to_sound_v2`, 2026-11-06), one generation each, then trimmed and level-matched with ffmpeg. The license terms of the generating account's plan have not been confirmed yet. The default "become friends" chime is synthesized in code (`src/ui/chime.ts`). No personal information is included.
