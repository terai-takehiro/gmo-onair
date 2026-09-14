**会場図面「並べ方」で、v4.6.17で直したはずの盤への配置ずれが実は直っていなかったのを直した**（Codexレビュー指摘・P1。v4.6.17のリリースPRがレビュー反映前にマージされたため取り込めていなかった）。
①`shared/src/venue/arrange.ts`の`bboxOf`（触らない）は外接の幅・高さだけを返し、左上の位置（min）を持たない。プレビューが下端で切れる不具合を直すため、品目の実座標から左上を測る`boundsOfArrangeItems`を`venueArrangeConfig.ts`に足したが、当初は「追加」で盤に置く位置（`VenueArrangePanel`のdx/dy）・グループの「並べ直す」（`VenueInspector.tsx`）にも同じ補正を使っていた。
②これは誤りだった——`docs/design/v4/venue-layout.md`§7「起点はエリアの正面から前の空きを取った中央」の通り、劇場形式の`frontClearanceMm`（前の空き）・`sideAisleMm`（脇）は盤に置いたときの位置に効くのが仕様で、`boundsOfArrangeItems`で補正すると2つの入力欄の値を変えても盤上の位置が変わらなくなってしまう（入力欄が実質死んだ状態）。
③盤に置く側（`VenueArrangePanel`のdx/dy・`VenueInspector`の並べ直す）を元の式に戻し、`boundsOfArrangeItems`は**プレビューの中央寄せだけ**に使うよう修正した。
検証: `npx tsc -b client-techops`・`npm run test`（shared 2468件）・実ブラウザ（Playwright・検証用Postgres）でプレビュー全5行の表示を保ったまま、`frontClearanceMm`を変えると盤上の実座標（DB保存値）がその分だけ動くことを確認。
