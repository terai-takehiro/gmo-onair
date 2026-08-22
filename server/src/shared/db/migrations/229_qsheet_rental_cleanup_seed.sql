-- レンタル機材検索: 検証環境に残った初期投入ダミー8件を後片付け。
--
-- 背景（rental-scraper/README.md「既知の不具合」節・v4.1.8 と同時期の話）:
-- `seed-rental.ts` は開発・検証環境で起動のたびに実行され、テーブルが空なら
-- 固定8件のダミー機材を投入する（「既に投入済みならスキップ」）。SKIP_RENTAL_SEED=true
-- を app_dev に設定して以降の再投入は止めたが、**それより前に一度でも投入された
-- 検証環境には、この8件がダミーのまま残り続ける**（rental_scraper_dev の実クロールは
-- SQLite の items テーブルに実在した (company, item_id) しか触らないため、
-- 偶然IDが衝突しない限り自然には上書きされない）。
--
-- 安全のため、company + item_id + name の3列が seed-rental.ts のダミー値と
-- 完全一致する行だけを消す。実クロールが同じ item_id を先に取り込んで
-- name が書き換わっていれば一致しないため消えない（誤って実データを消さない）。
DELETE FROM qsheet_rental_items WHERE (company, item_id, name) IN (
  ('東京オフラインセンター', '5043', 'SONY PXW-FX9 XDCAMメモリーカムコーダー'),
  ('東京オフラインセンター', '4102', 'SONY PXW-Z280 XDCAMメモリーカムコーダー'),
  ('東京オフラインセンター', '5121', 'Blackmagic ATEM Mini Extreme ISO'),
  ('東京オフラインセンター', '4988', 'SENNHEISER EW 512P G4 ワイヤレスマイクセット'),
  ('東京オフラインセンター', '5044', 'SONY BP-U70 バッテリー'),
  ('東京オフラインセンター', '5045', 'SONY SEL24105G レンズ'),
  ('レスター', '277', 'Panasonic AW-UE150 4Kインテグレーテッドカメラ'),
  ('レスター', '312', 'Roland V-160HD ストリーミングビデオスイッチャー')
);
