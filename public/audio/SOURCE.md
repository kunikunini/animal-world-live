# public/audio の出所

ワールドの BGM・環境音・効果音。すべて期間中に生成したもの。ほかに、「ともだちになる」の既定の音（`src/ui/chime.ts`）は音源を使わずにコードで合成している。

## 効果音・環境音（`se-*.mp3`、`amb-*.mp3`）

- **生成**: [ElevenLabs](https://elevenlabs.io) の Sound Effects（API `POST /v1/sound-generation`、モデル `eleven_text_to_sound_v2`、2026-11-06）。くにの ElevenLabs アカウントで生成した。1 つにつき 1 回生成し、撮り直しはしていない（計 19 回）
- **環境音**は `loop: true`（ループ用）で 30 秒。人の声と音楽は入れないよう指示した
- **編集**（ffmpeg 8）: 効果音は前後の無音を切り、最大音量をそろえ（足音 -4 dB、タップ -6 dB、ほか -3 dB）、末尾 40 ms をフェードアウトして、モノラル 96 kbps にした。環境音は平均音量を -30 dB にそろえて、ステレオ 96 kbps にした
- **ライセンス**: 生成したアカウントのプランと、それに伴う利用条件はまだ確認していない（API キーに契約情報を読む権限が無いため、こちらから確かめられなかった）。README のクレジットには「効果音・環境音: ElevenLabs で生成」と書く
- 個人情報は含まない

| ファイル | 用途（鳴る所） | 長さ | サイズ |
|---|---|---|---|
| `amb-savanna.mp3` | サバンナの空気の音（風・鳥・虫） | 30.0 s | 360,847 B |
| `amb-jungle.mp3` | ジャングルの空気の音（鳥・虫・葉擦れ・遠い水音） | 30.0 s | 360,847 B |
| `amb-north.mp3` | 北の世界の空気の音（冷たい風・雪が落ちる音） | 30.0 s | 360,847 B |
| `amb-south.mp3` | 南半球の空気の音（おだやかな風・鳥・草） | 30.0 s | 360,847 B |
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

Sound effects and ambience (`se-*.mp3`, `amb-*.mp3`) were generated with [ElevenLabs](https://elevenlabs.io) Sound Effects (API, model `eleven_text_to_sound_v2`, 2026-11-06), one generation each, then trimmed and level-matched with ffmpeg. The license terms of the generating account's plan have not been confirmed yet. The default "become friends" chime is synthesized in code (`src/ui/chime.ts`). No personal information is included.
