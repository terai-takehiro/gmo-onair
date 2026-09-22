**決算取込CLI版の残り2件のレビュー指摘対応を反映した**（terai-takehiro/gmo-onair#713 のフォローアップ）。
#713 でCodexから付いた4件の指摘のうち、CLI版（`server/scripts/import-kessan-dev.mjs`）に対する2件（P2×2:
アクティブな案件検索が改番済み旧番号`project_numbers`を見ておらず重複案件を作りうる・仕入専用の未登録GLSで
`customer_id=NULL`のままINSERTしようとしNOT NULL制約違反になる）を修正したコミットが、#713のマージ直前に
pushされたため取り込まれていなかった（マージ後の`git log`で発覚）。Codexへの返信内容と実際のコードが
食い違ったままにならないよう、本PRで同じ修正をmainへ反映した。検証: `npm run typecheck`・`npm run lint`
（0 errors）・`npm run test`（shared 2469件・server 94件）・`node --check`によるCLIスクリプトの構文確認。
