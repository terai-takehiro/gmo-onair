**PR #670・#671のレビュー状況を棚卸しに記録した**（`docs/branching.md`「マージしたら、その PR のレビューを棚卸しに移す」）。
#670（#669のレビュー棚卸し記録）はCode ReviewがCodexのusage limitsで実行されず、Security Reviewはマージ前に
完走しfindingsは無かった。#671（`release: v4.6.12`）はCode Reviewが同じくusage limitsで実行されず、
Security Reviewは「Running」のままマージされ、完了（findings無し）はマージの約34秒後だった——#667と
同型の「走り切る前にマージされた」ケース。いずれも表に移す未対応の指摘は無いが、レビューが1件も
届かないまま・または完走前にマージされたことを「指摘なし」と混同しないよう記録した。
検証: `node scripts/check-md-links.mjs`。
