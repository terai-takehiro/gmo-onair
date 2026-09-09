**PR #667のレビュー状況を棚卸しに記録した**（`docs/branching.md`「マージしたら、その PR のレビューを棚卸しに移す」）。
#667（`release: v4.6.11`）はCode ReviewがCodexのusage limitsで作成6秒後に不能、Security Reviewも
「Running」のまま完走せずマージ（CI green から約1分24秒後）された。`get_comments`で要約コメントが
`running`のまま更新されていないことを確認し、`docs/reviews/codex-findings-v4.md`「レビューが0件のまま
マージされた PR」に記録した。あわせて、#665が次のリリースPRでの目視確認を求めていた
`npm run release:notes`のREADME.md書き込み（版差し替えが1行になっているか）を実地で確認し、
問題ないことを確認した。検証: `node scripts/check-md-links.mjs`。
