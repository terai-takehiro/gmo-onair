**音声サポート公開URLの旧URLに「近く使えなくなる」予告帯を出すようにした**（実装設計
`docs/design/v4/qsheet-v4-coding/impl/02-audio-share-token-impl.md` §4-3 段階②）。段階①
（旧URL＝トークン無しアクセスの受け入れ＋ログ記録）は既にあったが、**開いた本人には
何も知らせていなかった**ため、いつか止まることに気づけないままだった。サーバーの
公開GET（`public-audio.routes.ts`）が旧URLアクセス時のレスポンスに `legacy: true` を
足すようにし（トークンありの通常アクセスではフィールドごと省略・既存の応答構成は
変えていない）、`AudioSupportPage` はこのフラグが立っているときだけ画面上部に細い帯
「この URL は近く使えなくなります。新しい QR を配布元に頼んでください」を出す。色は
生パレット直書きではなく v4 トークン（`--warning`）を低い不透明度で使い、このページの
「色は変えない」凍結期の名残の配色方針を崩さないようにした。375px でも崩れないことを
確認済み。検証: 実 Postgres で旧URL（token無し）を叩き `legacy: true` を確認 /
`npm run typecheck:all` `lint` `test` OK。
