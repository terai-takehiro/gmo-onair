**制作資料に足す「収録設定 / 配信設定」のモックアップと設計を出した**（コード変更なし）。
PR #278 で技術資料アプリを「制作資料へのマージに向けて」削除したあとの、その後継にあたる。
GMO ONAiR Assistant の収録（HyperDeck 12 台）と配信（Magewell 10 台）の設定を ONAiR 側で
打ち込み、**現場の Assistant がそのまま取り込める Excel を書き出す**までを設計した。
①**モックアップ 5 枚**（収録設定 PC・配信設定 PC・Excel 書き出し・収録設定スマホ・
配信設定スマホ）を Claude Design のキャンバスに置き、元ファイルを
`docs/design/qsheet-recording-streaming/mockups/` にコミットした。色・書体・角丸は
`docs/design/v4/_tokens.md` のとおりで、制作資料のアクセント `#c2410e` と既存モック
`v4-mockup-production.dc.html` に合わせてある。②**Excel の仕様を実装から起こした** —
Assistant の取込は `crates/server/src/sheet.rs` が **1 枚目のシートしか読まず**、見出しは
1 行目・列順は自由・途中の空行は行番号をずらす。収録で書けるのは 6 列・配信は 11 列で、
**収録の「TCソース」は機器の REST に書く道が無く必ず弾かれる**ため列ごと出さない。
解像度とコーデックは機器の綴りと完全一致（`1920x1080p59.94` / `ProRes:HQ`）でなければ
通らず、**空欄は「現地の設定を変えない」という意味**になる。配信のセッション名は
半角 32 文字までで日本語を送ると機器が断る（現場での実例あり）。③**書き出す前の点検**を
画面に置き、現地で弾かれる条件（RTMP のキー空・名前の文字種・同じ台の中の重複・SRT の
ポート空）を ONAiR 側で先に出すようにした。④**ストリームキーは Excel に平文で入る**
（Assistant は機器からキーを読み戻せない）ので、書き出し時に扱いを選ばせ、赤い面で
警告する形にした。⑤受け入れ側の実装のあたり（URL・新しいテーブルは migration `212_` から・
API と権限・サーバー側で `buildExcelWorkbook` を使う）と、**決めていただきたいこと**を
`docs/design/qsheet-recording-streaming.md` にまとめた。⚠️ 最大の論点は**見た目**で、
制作資料は v4.0.0 で凍結扱いのため `tokens-v4.css`・LINE Seed JP・共通シェル・お知らせ帯が
使えず、**モックアップどおりに作るには制作資料を v4 に載せ替える必要がある**。
載せ替えは別 PR に切ることを推奨として書いた。検証: 文書とモックアップのみでコード変更なし。`npm run lint` の自作検査
（changelog / fonts / tokens / shared-wiring / file-size / ui-tokens / mobile-declared /
env-passthrough / links / contrast）はすべて OK。⚠️ 最後の `eslint .` だけは、この作業環境に
`node_modules` が無く実行できていない（依存の未インストールによるもので、この PR の変更とは
無関係。lint 対象の JS/TS は 1 行も触っていない）。
