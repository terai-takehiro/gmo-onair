制作資料の編集画面（`/qsheet/editor/:id`）の外枠をv4の見た目にし、Qシートの凍結を解いた。
`index.css` の読み込み先を `tokens.css` 直読みから `base.css` 経由（→ `tokens-v4.css` → `tokens.css`）に
切り替え、同梱済みの LINE Seed JP が効くようにした。ヘッダー・情報バー・サイドバーの角丸をv4の役割名
（`rounded-control-md` 等）に、情報バーの数字表示（稿番号・放送日・収録日・開始時刻・総尺）を生の
`fontFamily` 指定から共通のトークン（`.font-number`）に寄せた。本番の暗い3画面（進行・ランダウン・
プロンプター）は `tokens-v4.css` の `.dark` が引き続き効くことをビルド後のCSSで確認済み（実ブラウザでの
最終確認は別途必要）。表本体（`CueTable`/`CueRow`/セル）・`EditorSidebar` の詳細・モバイル専用画面は
対象外（並行PRの領域）。
