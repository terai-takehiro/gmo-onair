**PR #300 のマージ後の棚卸しを記録した**（コード変更なし）。制作技術支援のトップとハブの
モックを入れた #300 は、**レビューが1件も付かないままマージ**された（CI green から約1分24秒後に
手動マージ）。`npm run reviews:debt` は今回も 401 で使えなかったため GitHub MCP で直接確認し
（`get_reviews` / `get_comments` / `get_review_comments` いずれも0件）、
`docs/reviews/codex-findings-v4.md` の「レビューが0件のままマージされた PR」に記録した。
あわせて、#300 が `npm run typecheck` / `lint` / `build` / `verify:ui` を1つも回していないこと
（作業したサンドボックスに `node_modules` が無かった）と、PR本文に挙げた「決めていただきたいこと」
4点がレビューされないまま残っていることも書き添えた。
