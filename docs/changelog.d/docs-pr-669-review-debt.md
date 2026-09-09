**PR #669のレビュー状況を棚卸しに記録した**（`docs/branching.md`「マージしたら、その PR のレビューを棚卸しに移す」）。
#669（`feat(finance): 財務ダッシュボードの損益の流れとグループ内外カードを見直し`）はCode ReviewがCodexの
usage limitsで一度も実行されず、Security Reviewは完走したがfindingsは無かった（`get_reviews`/
`get_review_comments`ともに0件）。表に移す未対応の指摘は無いが、レビューが1件も届いていないため
「指摘なし」と区別できるよう`docs/reviews/codex-findings-v4.md`「一覧（PR の新しい順）」に記録した。
検証: `node scripts/check-md-links.mjs`。
