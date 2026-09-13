**PR #684のレビュー状況を棚卸しに記録した**（`docs/branching.md`「マージしたら、その PR のレビューを棚卸しに移す」）。#684（会場図面ミニアプリの新設）はCode Reviewが1巡で完走し全8件（P1×6・P2×2）の指摘（camelCase変換漏れ・`copy_from`のIDOR・自動保存の取りこぼし・印刷縮尺の不一致・下敷き画像の二重結合と未配置・マーキー選択の未発火・線分品目の未保存）が付いたが、8件とも本PR内で修正・返信・スレッド解決まで完了し、実Postgres+実サーバーでcamelCase応答とIDOR拒否を確認した。表に移す未対応の指摘は無い。修正コミットにはCode Review・Security Reviewとも一度も再実行されず（Code Reviewはusage limits到達）、Security Reviewは初回コミットでは完走し別枠の指摘は無かった。検証: `node scripts/check-md-links.mjs`。あわせて、#684の修正コミット`e61b9b9`の
コミットメッセージが自動保存の取りこぼし修正（`useVenueAutosave.ts`）を「自主的に
対応した追加分」と誤って書いていた点を訂正した——実際は他の7件と同じCode Reviewの
指摘（P1）で、自主対応の品目は無く8件すべてがCode Reviewの指摘（本文書のレビューで
指摘・P2、修正済み）。
