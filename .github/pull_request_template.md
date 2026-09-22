<!--
  1つの PR = 1つの機能・1つの修正。目安は 1 PR = 1画面。
  大きくなりそうなら分けてください (レビューできない PR は結局レビューされません)。

  タイトルは `種類(アプリ): 何をしたか` の形にしてください。
  例: feat(equipment): 機材台帳を v4 の見た目にした
  種類 = feat / fix / chore / docs / refactor  → docs/branching.md「PR を出す」
  版の番号は触らず、docs/changelog.d/<枝の名前>.md を1つ置く → docs/changelog.d/README.md
-->

## 何を変えたか

<!-- 画面を触る人が読んで分かる言葉で1〜3行。「〜できるようになった」の形で書く -->

## なぜ変えたか

<!-- 元の困りごと。利用者からの依頼なら、依頼の内容をそのまま引く -->

Closes #

## 検証したこと

<!-- やったものにチェック。やっていないものは外したままにする (嘘を書かない) -->

- [ ] `npm run typecheck` が通る (`shared/` を触ったら `npm run typecheck:all`)
- [ ] `npm run lint` が通る (warning 数が着手前と同じ)
- [ ] `npm run test` が通る
- [ ] `npm run build` が通る (`npm run build:changed` でもよい)
- [ ] `docs/changelog.d/<枝の名前>.md` を置いた
- [ ] 実際に画面で動かした — PC (1440px)
- [ ] 実際に画面で動かした — スマホ (375px、横はみ出し 0px / JS エラー 0件)
- [ ] 実 DB (Postgres) で保存 → 読み直しまで確認した (`npm run verify:up`)
- [ ] DB マイグレーションを足した場合: **番号が既存とぶつかっていない**ことを確認した
- [ ] 権限のない利用者で開いて 403 / 非表示になることを確認した

<!-- マージしたあとにやること (docs/branching.md「マージしたら、その PR のレビューを棚卸しに移す」)。
     マージすると指摘は GitHub の画面から消えるので、書かなければ存在ごと消えます。 -->
- [ ] **マージしたあと** `npm run reviews:debt` を走らせ、残った指摘を
      [docs/reviews/codex-findings-v4.md](../docs/reviews/codex-findings-v4.md) の表に移した

### v4 の画面を作った・直した場合

<!-- v4 の中核ルール。破ると縦の桁が揃わなくなり、後から全画面を直すことになる -->

- [ ] **金額**は `<Money>` を使った (`¥` と数字が別要素・縦に並べて右端が揃う)
- [ ] **バッジ・チップ**は固定幅の枠に入れた (文字数で幅が変わらない・値がない行も枠を置いた)
- [ ] **期間**は開始／`〜`／終了を別要素に分けた (`05/12〜05/31` を1つの文字列にしていない)
- [ ] **伸びるのは名前列だけ**にした (`min-w-0` + 省略記号)
- [ ] 色は共通トークンから選んだ (Tailwind の生パレットを直接書いていない)
- [ ] `npm run verify:ui` が通る (書体・地の色・桁揃い・タップ領域の実測)
- [ ] **サイトツリーを貼った** — `node scripts/v4-progress.mjs --write` を実行し、
      [docs/v4-progress.md](../docs/v4-progress.md) の内容を下の「進み具合」に貼る
      (**どこが出来てどこが手つかずか**が分からないと検証のしようがないため)

<details>
<summary>進み具合（サイトツリー）</summary>

</details>

<details>
<summary>検証の詳細 (項目数・気づいたこと)</summary>

</details>

## 影響範囲

<!-- 触ったブロックアプリにチェック -->

- [ ] 案件管理・財務管理・カレンダー・設定 (`client/`)
- [ ] 日常業務 (`client-daily/`)
- [ ] 機材管理 (`client-equipment/`)
- [ ] Wiki (`client-wiki/`)
- [ ] 制作技術支援 (`client-techops/`) — 凍結解除中。表本体・`EditorSidebar`・本番系画面の残作業は `client-techops/CLAUDE.md`
- [ ] 計時・視聴者 (`client-live/`) — **表示画面 (`/live/display/`) だけ見た目を変えない例外** (`client-live/CLAUDE.md`)
- [ ] リアルタイムCG (`client-awards/`) — **廃止**。コードは参照用に残るだけ (後継は制作技術支援＞テロップCG)
- [ ] サーバー (`server/`)
- [ ] 共通ライブラリ (`shared/`) — **他のアプリ全部に効きます**
- [ ] インフラ・CI・デプロイ

## 画面

<!-- UI を変えた場合はスクリーンショットか短い動画。before / after が並ぶと早い -->

## AI 機能を触った場合

<!--
  会社方針「AIを使い捨てにしない」。AI が関与しない UI 修正・CRUD・デプロイなら
  この節は消してよい。触った場合は 5 条件の充足を書く (詳細は .claude/skills/ai-feedback-loop/)
-->

- [ ] AI 出力を記録・保存している
- [ ] 人間の修正を差分として残している
- [ ] 顧客反応・成果指標を出力に紐づけている
- [ ] 貯めたデータを AI 改善に戻す経路がある
- [ ] レビュー頻度と担当を決めた
