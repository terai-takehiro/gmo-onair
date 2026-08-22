-- レンタル機材検索: company の表示名「東京オフラインセンター」→「TOC」に短縮。
--
-- 理由: バッジ・チップ等の固定幅UIで文字数が長すぎたため（ご指示）。
-- company は qsheet_rental_items / qsheet_rental_reservations の主キー・自然キーの
-- 一部として保存されている実データ値なので、コードの定数を変えるだけでは
-- 既存行は古い名称のまま取り残される（company + item_id が主キーのため、
-- 名称を変えると「新しい行」として扱われてしまう — 229番の教訓と同じ構造）。
-- 既存データ側もここで一括リネームする。
UPDATE qsheet_rental_items
   SET company = 'TOC'
 WHERE company = '東京オフラインセンター';

UPDATE qsheet_rental_reservations
   SET company = 'TOC'
 WHERE company = '東京オフラインセンター';
