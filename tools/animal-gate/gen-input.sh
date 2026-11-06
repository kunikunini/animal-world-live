#!/bin/zsh
# 使い方: gen-input.sh <dir> [写真の id ...]  — experiments/animals-night/<dir>/inputs/prompt.txt で Codex（GPT Image 2、サブスク枠）に入力画を作らせる。
# 作業は tools/animal-gate/work/gen/<dir>（コミットしない）。写真は origin/main の public/faces/<id>.webp（アプリで公開済みのアイコン）を参考にだけ渡す。
# できた PNG は experiments/animals-night/<dir>/inputs/ に JPEG の写しを置く（collect.sh）
T=${0:A:h}; R=${T:h:h}; D=$1; shift
G=$T/work/gen/$D; mkdir -p $G; cp $T/style-ref.png $G/style-ref.png
A=()
for id in "$@"; do git -C $R show origin/main:public/faces/$id.webp > $G/photo-$id.webp; A+=(-i $G/photo-$id.webp); done
codex exec --skip-git-repo-check -s workspace-write -C $G "${A[@]}" -i $G/style-ref.png -- "$(cat $R/experiments/animals-night/$D/inputs/prompt.txt)" > $G/codex.log 2>&1
