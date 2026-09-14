**PR #699の棚卸し記録の数え違い（Codexレビュー指摘2件）を直した**（`docs/branching.md`「マージしたら、その PR のレビューを棚卸しに移す」）。
直前のPR #700で記録した#699の棚卸しに、Code Reviewの完走回数（「3回」→実際は`4f4fb6a`・`da29fee`・`2d746a1`・`f799abe`の4コミット時点で完走）と、マージ後のファイル数（「9ファイル」→実際は11ファイル。最終コミット`8616a15`で設計書2件が追加されていた）の数え違いがあるとのCodexレビュー指摘（P2×2）を受け、git logとdiffで数え直して`docs/reviews/codex-findings-v4.md`と`docs/changelog.d/claude-review-debt-tally-699.md`を訂正した。
検証: `node scripts/check-md-links.mjs`。
