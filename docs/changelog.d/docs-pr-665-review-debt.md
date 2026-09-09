**PR #665のレビュー状況を棚卸しに記録した**（`docs/branching.md`「マージしたら、その PR のレビューを棚卸しに移す」）。
#665（ドキュメント全体の体系的な書き直し）は、作成10秒後にCodexがusage limitsを返しCode Reviewが1巡も走らず、
Security Reviewも「Running」の要約が1回出たきり完了しないままマージされた。`get_reviews`/`get_review_comments`
で0件を確認し、`docs/reviews/codex-findings-v4.md`の「レビューが0件のままマージされたPR」に記録した
（表に移す未対応の指摘は無い＝レビュー自体が届いていないため）。検証: `node scripts/check-md-links.mjs`。
