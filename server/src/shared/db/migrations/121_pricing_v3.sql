-- 121: 料金表マスターを Slack「料金表v3」で全面差し替え (v2.9.182)
-- ユーザー共有の見積雛形 xlsx「料金表v3」シートを機械パースして投入。
-- 現行公式マスター (065 の price-cat-* / price-item-*) は soft-delete。
-- FK (revenue_items.pricing_item_id / simulations.pricing_item_id) 温存のため hard-delete しない。
-- ユーザーが UI で追加した項目 (uuid ID) は price-% に一致しないため保持される。
-- calc_type: 式→fixed / 時間→hours / 人→days_people / 台→days_qty / 分・ファイル・回・ページ・箱→qty。

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pricing_categories WHERE id = 'price-cat-v3-01-basic') THEN
    UPDATE pricing_items      SET deleted_at = NOW() WHERE deleted_at IS NULL AND id LIKE 'price-item-%';
    UPDATE pricing_categories SET deleted_at = NOW() WHERE deleted_at IS NULL AND id LIKE 'price-cat-%';
  END IF;
END $$;

INSERT INTO pricing_categories (id, name, sort_order) VALUES
  ('price-cat-v3-01-basic', '①基本料金', 1),
  ('price-cat-v3-02-rooms', '②控室・スペース利用料金', 2),
  ('price-cat-v3-03-tech-ops', '③テクニカル（オペレーション関連）', 3),
  ('price-cat-v3-04-tech-equipment', '④テクニカル（機材関連）', 4),
  ('price-cat-v3-05-tech-materials', '⑤テクニカル（素材関連）', 5),
  ('price-cat-v3-06-production', '⑥制作（対応関連）', 6),
  ('price-cat-v3-07-options', '⑦追加オプション', 7)
ON CONFLICT (id) DO NOTHING;

INSERT INTO pricing_items (id, category_id, name, sub_label, unit_price, group_price, calc_type, sort_order) VALUES
  ('price-item-v3-01-01', 'price-cat-v3-01-basic', '【平日】9~20時 11時間基本パッケージ', 'WORLD + SKY + LOUNGE', 700000, 560000, 'fixed', 1),
  ('price-item-v3-01-02', 'price-cat-v3-01-basic', '【平日】9~20時 11時間基本パッケージ', 'SKY + LOUNGE', 350000, 280000, 'fixed', 2),
  ('price-item-v3-01-03', 'price-cat-v3-01-basic', '【平日】9~20時 11時間基本パッケージ', 'LOUNGE', 210000, 168000, 'fixed', 3),
  ('price-item-v3-01-04', 'price-cat-v3-01-basic', '【平日】9~20時 6時間利用パッケージ', 'WORLD + SKY + LOUNGE', 480000, 384000, 'fixed', 4),
  ('price-item-v3-01-05', 'price-cat-v3-01-basic', '【平日】9~20時 6時間利用パッケージ', 'SKY + LOUNGE', 240000, 192000, 'fixed', 5),
  ('price-item-v3-01-06', 'price-cat-v3-01-basic', '【平日】9~20時 6時間利用パッケージ', 'LOUNGE', 150000, 120000, 'fixed', 6),
  ('price-item-v3-01-07', 'price-cat-v3-01-basic', '【平日】9~20時 4時間ミニマムパッケージ', 'WORLD + SKY + LOUNGE', 390000, 312000, 'fixed', 7),
  ('price-item-v3-01-08', 'price-cat-v3-01-basic', '【平日】9~20時 4時間ミニマムパッケージ', 'SKY + LOUNGE', 200000, 160000, 'fixed', 8),
  ('price-item-v3-01-09', 'price-cat-v3-01-basic', '【平日】9~20時 4時間ミニマムパッケージ', 'LOUNGE', 120000, 96000, 'fixed', 9),
  ('price-item-v3-01-10', 'price-cat-v3-01-basic', '【休日】9~20時 11時間基本パッケージ', 'WORLD + SKY + LOUNGE', 1000000, 800000, 'fixed', 10),
  ('price-item-v3-01-11', 'price-cat-v3-01-basic', '【休日】9~20時 11時間基本パッケージ', 'SKY + LOUNGE', 500000, 400000, 'fixed', 11),
  ('price-item-v3-01-12', 'price-cat-v3-01-basic', '【休日】9~20時 11時間基本パッケージ', 'LOUNGE', 300000, 240000, 'fixed', 12),
  ('price-item-v3-01-13', 'price-cat-v3-01-basic', '【休日】9~20時 6時間利用パッケージ', 'WORLD + SKY + LOUNGE', 690000, 552000, 'fixed', 13),
  ('price-item-v3-01-14', 'price-cat-v3-01-basic', '【休日】9~20時 6時間利用パッケージ', 'SKY + LOUNGE', 350000, 280000, 'fixed', 14),
  ('price-item-v3-01-15', 'price-cat-v3-01-basic', '【休日】9~20時 6時間利用パッケージ', 'LOUNGE', 210000, 168000, 'fixed', 15),
  ('price-item-v3-01-16', 'price-cat-v3-01-basic', '【休日】9~20時 4時間ミニマムパッケージ', 'WORLD + SKY + LOUNGE', 550000, 440000, 'fixed', 16),
  ('price-item-v3-01-17', 'price-cat-v3-01-basic', '【休日】9~20時 4時間ミニマムパッケージ', 'SKY + LOUNGE', 280000, 224000, 'fixed', 17),
  ('price-item-v3-01-18', 'price-cat-v3-01-basic', '【休日】9~20時 4時間ミニマムパッケージ', 'LOUNGE', 170000, 136000, 'fixed', 18),
  ('price-item-v3-01-19', 'price-cat-v3-01-basic', '施設管理費・清掃対応費', NULL, 50000, 50000, 'fixed', 19),
  ('price-item-v3-01-20', 'price-cat-v3-01-basic', '【平日】20~翌9時 1時間あたり', 'WORLD + SKY + LOUNGE', 100000, 100000, 'hours', 20),
  ('price-item-v3-01-21', 'price-cat-v3-01-basic', '【平日】20~翌9時 1時間あたり', 'SKY + LOUNGE', 65000, 65000, 'hours', 21),
  ('price-item-v3-01-22', 'price-cat-v3-01-basic', '【平日】20~翌9時 1時間あたり', 'LOUNGE', 50000, 50000, 'hours', 22),
  ('price-item-v3-01-23', 'price-cat-v3-01-basic', '【休日】20~翌9時 1時間あたり', 'WORLD + SKY + LOUNGE', 150000, 150000, 'hours', 23),
  ('price-item-v3-01-24', 'price-cat-v3-01-basic', '【休日】20~翌9時 1時間あたり', 'SKY + LOUNGE', 95000, 95000, 'hours', 24),
  ('price-item-v3-01-25', 'price-cat-v3-01-basic', '【休日】20~翌9時 1時間あたり', 'LOUNGE', 75000, 75000, 'hours', 25),
  ('price-item-v3-01-26', 'price-cat-v3-01-basic', '時間外対応料金', '23:00~翌7:00の稼働が発生する場合', 40000, 40000, 'days_people', 26),
  ('price-item-v3-02-01', 'price-cat-v3-02-rooms', 'ROOM A', NULL, 20000, 0, 'fixed', 1),
  ('price-item-v3-02-02', 'price-cat-v3-02-rooms', 'ROOM B', NULL, 20000, 0, 'fixed', 2),
  ('price-item-v3-02-03', 'price-cat-v3-02-rooms', 'ROOM C', NULL, 20000, 0, 'fixed', 3),
  ('price-item-v3-02-04', 'price-cat-v3-02-rooms', 'VIP LOUNGE', NULL, 50000, 0, 'fixed', 4),
  ('price-item-v3-02-05', 'price-cat-v3-02-rooms', '全部屋利用', 'ROOM A/B/C、VIP LOUNGE', 100000, 0, 'fixed', 5),
  ('price-item-v3-02-06', 'price-cat-v3-02-rooms', 'パントリー利用', NULL, 100000, 50000, 'fixed', 6),
  ('price-item-v3-03-01', 'price-cat-v3-03-tech-ops', 'テクニカルディレクター・テクニカルサポート', NULL, 55000, NULL, 'days_people', 1),
  ('price-item-v3-03-02', 'price-cat-v3-03-tech-ops', 'ビデオエンジニア', NULL, 55000, 50000, 'days_people', 2),
  ('price-item-v3-03-03', 'price-cat-v3-03-tech-ops', 'LED', NULL, 60000, NULL, 'days_people', 3),
  ('price-item-v3-03-04', 'price-cat-v3-03-tech-ops', 'スイッチャー', NULL, 60000, 55000, 'days_people', 4),
  ('price-item-v3-03-05', 'price-cat-v3-03-tech-ops', 'カメラ', NULL, 55000, 50000, 'days_people', 5),
  ('price-item-v3-03-06', 'price-cat-v3-03-tech-ops', 'カメラアシスタント', NULL, 45000, 35000, 'days_people', 6),
  ('price-item-v3-03-07', 'price-cat-v3-03-tech-ops', '音声ミキサー', NULL, 55000, 50000, 'days_people', 7),
  ('price-item-v3-03-08', 'price-cat-v3-03-tech-ops', 'PAミキサー', NULL, 55000, 50000, 'days_people', 8),
  ('price-item-v3-03-09', 'price-cat-v3-03-tech-ops', 'オーディオアシスタント', NULL, 45000, 40000, 'days_people', 9),
  ('price-item-v3-03-10', 'price-cat-v3-03-tech-ops', 'ライティングディレクター', NULL, 55000, NULL, 'days_people', 10),
  ('price-item-v3-03-11', 'price-cat-v3-03-tech-ops', 'ライティングオペレーター', NULL, 55000, 50000, 'days_people', 11),
  ('price-item-v3-03-12', 'price-cat-v3-03-tech-ops', '配信管理', NULL, 55000, 50000, 'days_people', 12),
  ('price-item-v3-04-01', 'price-cat-v3-04-tech-equipment', 'クレーンカメラ', '最大1式', 150000, 120000, 'fixed', 1),
  ('price-item-v3-04-02', 'price-cat-v3-04-tech-equipment', 'スタジオカメラ', '最大2式', 100000, 80000, 'fixed', 2),
  ('price-item-v3-04-03', 'price-cat-v3-04-tech-equipment', 'ワイヤレスジンバルカメラ', '最大1式', 20000, 16000, 'fixed', 3),
  ('price-item-v3-04-04', 'price-cat-v3-04-tech-equipment', 'PTZカメラ', '常設6台で1式(セット)', 60000, 48000, 'fixed', 4),
  ('price-item-v3-04-05', 'price-cat-v3-04-tech-equipment', 'PTZカメラ', '最大3式', 20000, 16000, 'fixed', 5),
  ('price-item-v3-04-06', 'price-cat-v3-04-tech-equipment', '第1調整室利用費（映像・音声）', '一式に含まれる機材は別途リスト化', 300000, 240000, 'fixed', 6),
  ('price-item-v3-04-07', 'price-cat-v3-04-tech-equipment', '第2調整室利用費（LED）', '一式に含まれる機材は別途リスト化', 500000, 400000, 'fixed', 7),
  ('price-item-v3-04-08', 'price-cat-v3-04-tech-equipment', '照明機材一式', '一式に含まれる機材は別途リスト化', 200000, 160000, 'fixed', 8),
  ('price-item-v3-04-09', 'price-cat-v3-04-tech-equipment', 'スタジオ機材フルセット', '#1~#8までをすべて利用可', 1200000, 960000, 'fixed', 9),
  ('price-item-v3-05-01', 'price-cat-v3-05-tech-materials', '入稿チェック', NULL, 1500, 1200, 'qty', 1),
  ('price-item-v3-05-02', 'price-cat-v3-05-tech-materials', '動画エンコード', '~10分未満', 300, 240, 'qty', 2),
  ('price-item-v3-05-03', 'price-cat-v3-05-tech-materials', '動画エンコード', '10分以上、30分未満', 180, 144, 'qty', 3),
  ('price-item-v3-05-04', 'price-cat-v3-05-tech-materials', '動画エンコード', '30分以上、60分未満', 150, 120, 'qty', 4),
  ('price-item-v3-05-05', 'price-cat-v3-05-tech-materials', '動画エンコード', '60分以上、90分未満', 120, 96, 'qty', 5),
  ('price-item-v3-05-06', 'price-cat-v3-05-tech-materials', '動画エンコード', '90分以上、120分未満', 90, 72, 'qty', 6),
  ('price-item-v3-05-07', 'price-cat-v3-05-tech-materials', '動画エンコード', '120分以上、180分未満', 60, 48, 'qty', 7),
  ('price-item-v3-05-08', 'price-cat-v3-05-tech-materials', '動画エンコード', '180分以上', 21000, 16800, 'qty', 8),
  ('price-item-v3-05-09', 'price-cat-v3-05-tech-materials', '表示調整費', 'LED表示調整（フォーマット不適合修正）', 1000, 800, 'qty', 9),
  ('price-item-v3-05-10', 'price-cat-v3-05-tech-materials', '動画エンコード', 'LED壁床全体サイズ、LED壁面全体サイズ、LED床面全体サイズ、納品動画解像度そのまま以外の 画角調整などが該当', 2000, 1600, 'qty', 10),
  ('price-item-v3-05-11', 'price-cat-v3-05-tech-materials', '表示調整費', 'LED壁床全体、LED壁面全体、LED床面全体表示に対するフォーマット不適合の修正', 3000, 2400, 'qty', 11),
  ('price-item-v3-06-01', 'price-cat-v3-06-production', '打ち合わせ', '1h/回', 40000, 20000, 'qty', 1),
  ('price-item-v3-06-02', 'price-cat-v3-06-production', '台本制作', '1ページ', 10000, 10000, 'qty', 2),
  ('price-item-v3-06-03', 'price-cat-v3-06-production', '制作スタッフ稼働', NULL, 50000, 50000, 'hours', 3),
  ('price-item-v3-06-04', 'price-cat-v3-06-production', '当日進行スタッフ', NULL, 70000, 70000, 'days_people', 4),
  ('price-item-v3-07-01', 'price-cat-v3-07-options', '特殊映像演出(AR/XR)', '※内容によって変動', 300000, 300000, 'fixed', 1),
  ('price-item-v3-07-02', 'price-cat-v3-07-options', 'インタラクティブ演出(投票/スタンプ)', '※内容によって変動', 200000, 200000, 'fixed', 2),
  ('price-item-v3-07-03', 'price-cat-v3-07-options', '多言語配信', '※内容によって変動', 150000, 150000, 'fixed', 3),
  ('price-item-v3-07-04', 'price-cat-v3-07-options', 'IP中継利用', '※内容によって変動', 300000, 300000, 'fixed', 4),
  ('price-item-v3-07-05', 'price-cat-v3-07-options', 'Zoom中継', '※内容によって変動', 100000, 100000, 'fixed', 5),
  ('price-item-v3-07-06', 'price-cat-v3-07-options', 'テロップシステム利用', '※内容によって変動', 80000, 80000, 'fixed', 6),
  ('price-item-v3-07-07', 'price-cat-v3-07-options', 'PCレンタル利用', '※内容によって変動', 15000, 15000, 'days_qty', 7),
  ('price-item-v3-07-08', 'price-cat-v3-07-options', '提携ケータリング', 'ご予算に応じてご提案いたします', 0, 0, 'fixed', 8),
  ('price-item-v3-07-09', 'price-cat-v3-07-options', '物販利用', '売上金額の15%を手数料として申し受けます', 0, 0, 'fixed', 9),
  ('price-item-v3-07-10', 'price-cat-v3-07-options', '保管料', '1箱/1日 1,000円', 1000, 1000, 'qty', 10)
ON CONFLICT (id) DO NOTHING;
