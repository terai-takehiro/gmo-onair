-- 065: 料金表マスター — GMO グローバルスタジオの公式料金体系を投入
--
-- 前提: migration 064 で group_price カラム追加済。NULL = 「設定なし」を表現。
-- 運用: 旧シードデータ (7 カテゴリ / 約30 項目) は soft-delete して、
--       固定 ID を持つ公式マスター (8 カテゴリ / 70+ 項目) に差し替える。
--       再実行時は ON CONFLICT DO NOTHING で冪等、ユーザーによる UI 編集は保持。

-- 1) calc_type に 'qty' (数量×単価) を追加 — 本 / ページ / シーン 等の数量課金用
ALTER TABLE pricing_items DROP CONSTRAINT IF EXISTS pricing_items_calc_type_check;
ALTER TABLE pricing_items
  ADD CONSTRAINT pricing_items_calc_type_check
  CHECK (calc_type IN ('days','hours','fixed','days_qty','days_people','toggle','qty'));

-- 2) 公式マスターが未投入の場合のみ、旧シードデータを soft-delete
--    (id が 'price-cat-*' 形式でない = 旧データ)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pricing_categories WHERE id = 'price-cat-01-basic') THEN
    UPDATE pricing_items
      SET deleted_at = NOW()
      WHERE deleted_at IS NULL
        AND (id NOT LIKE 'price-item-%');
    UPDATE pricing_categories
      SET deleted_at = NOW()
      WHERE deleted_at IS NULL
        AND (id NOT LIKE 'price-cat-%');
  END IF;
END $$;

-- 3) カテゴリ投入
INSERT INTO pricing_categories (id, name, sort_order) VALUES
  ('price-cat-01-basic',             '①基本料金',                        1),
  ('price-cat-02-overtime',          '②時間外利用料金',                    2),
  ('price-cat-03-rooms',             '③控室・スペース利用料金',              3),
  ('price-cat-04-tech-ops',          '④テクニカル（オペレーション関連）',      4),
  ('price-cat-05-tech-equipment',    '⑤テクニカル（機材関連）',               5),
  ('price-cat-06-tech-materials',    '⑥テクニカル（素材関連）',               6),
  ('price-cat-07-production',        '⑦制作（対応関連）',                    7),
  ('price-cat-08-options',           '⑧追加オプション',                     8)
ON CONFLICT (id) DO NOTHING;

-- 4) 項目投入 (unit_price = 定価 / 外販, group_price = グループ内)
-- ① 基本料金
INSERT INTO pricing_items (id, category_id, name, sub_label, unit_price, group_price, calc_type, sort_order) VALUES
  ('price-item-01-01', 'price-cat-01-basic', '基本利用料金',              '平日 (9:00〜20:00)',                 700000,   560000, 'days', 1),
  ('price-item-01-02', 'price-cat-01-basic', '基本利用料金',              '土日祝／繁忙期 (9:00〜20:00)',       1000000,  800000, 'days', 2),
  ('price-item-01-03', 'price-cat-01-basic', '施設管理費・清掃対応費',       NULL,                                  50000,   50000, 'days', 3),
  ('price-item-01-04', 'price-cat-01-basic', 'LOUNGE STUDIO',           '平日 (9:00〜20:00)',                    NULL,   50000, 'days', 4),
  ('price-item-01-05', 'price-cat-01-basic', 'LOUNGE＋SKY STUDIO',      '平日 (9:00〜20:00)',                    NULL,   66000, 'days', 5),
  ('price-item-01-06', 'price-cat-01-basic', '基本利用料金（単室）',         '平日 (9:00〜20:00)',                    NULL,  100000, 'days', 6),
  ('price-item-01-07', 'price-cat-01-basic', 'LOUNGE STUDIO',           '土日祝／繁忙期 (9:00〜20:00)',           NULL,   70000, 'days', 7),
  ('price-item-01-08', 'price-cat-01-basic', 'LOUNGE＋SKY STUDIO',      '土日祝／繁忙期 (9:00〜20:00)',           NULL,   93000, 'days', 8),
  ('price-item-01-09', 'price-cat-01-basic', '基本利用料金（単室）',         '土日祝／繁忙期 (9:00〜20:00)',           NULL,  140000, 'days', 9)
ON CONFLICT (id) DO NOTHING;

-- ② 時間外利用料金
INSERT INTO pricing_items (id, category_id, name, sub_label, unit_price, group_price, calc_type, sort_order) VALUES
  ('price-item-02-01', 'price-cat-02-overtime', '時間外利用料金',       '平日 (20:00〜翌9:00)',                     100000,  100000, 'days', 1),
  ('price-item-02-02', 'price-cat-02-overtime', 'LOUNGE STUDIO',       '平日 (20:00〜翌9:00)',                       NULL,   50000, 'days', 2),
  ('price-item-02-03', 'price-cat-02-overtime', 'LOUNGE＋SKY STUDIO', '平日 (20:00〜翌9:00)',                       NULL,   66000, 'days', 3),
  ('price-item-02-04', 'price-cat-02-overtime', '時間外利用料金',       '土日祝／繁忙期 (20:00〜翌9:00)',           150000,  200000, 'days', 4),
  ('price-item-02-05', 'price-cat-02-overtime', 'LOUNGE STUDIO',       '土日祝／繁忙期 (20:00〜翌9:00)',             NULL,  100000, 'days', 5),
  ('price-item-02-06', 'price-cat-02-overtime', 'LOUNGE＋SKY STUDIO', '土日祝／繁忙期 (20:00〜翌9:00)',             NULL,  130000, 'days', 6),
  ('price-item-02-07', 'price-cat-02-overtime', '時間外対応料金',       '23:00〜翌8:00の稼働が発生する場合',           40000,   40000, 'days', 7)
ON CONFLICT (id) DO NOTHING;

-- ③ 控室・スペース利用料金
INSERT INTO pricing_items (id, category_id, name, sub_label, unit_price, group_price, calc_type, sort_order) VALUES
  ('price-item-03-01', 'price-cat-03-rooms', 'ROOM A',         NULL,                          20000,  0, 'days', 1),
  ('price-item-03-02', 'price-cat-03-rooms', 'ROOM B',         NULL,                          20000,  0, 'days', 2),
  ('price-item-03-03', 'price-cat-03-rooms', 'ROOM C',         NULL,                          20000,  0, 'days', 3),
  ('price-item-03-04', 'price-cat-03-rooms', 'VIP LOUNGE',     NULL,                          50000,  0, 'days', 4),
  ('price-item-03-05', 'price-cat-03-rooms', '全部屋利用',       'ROOM A / B / C ＋ VIP LOUNGE', 100000,  0, 'days', 5),
  ('price-item-03-06', 'price-cat-03-rooms', 'パントリー利用',    NULL,                         100000, 50000, 'days', 6)
ON CONFLICT (id) DO NOTHING;

-- ④ テクニカル(オペレーション) — すべて 人日
INSERT INTO pricing_items (id, category_id, name, sub_label, unit_price, group_price, calc_type, sort_order) VALUES
  ('price-item-04-01', 'price-cat-04-tech-ops', 'テクニカルディレクター・テクニカルサポート', NULL, 55000, 55000, 'days_people', 1),
  ('price-item-04-02', 'price-cat-04-tech-ops', 'ビデオエンジニア',                      NULL, 55000, 55000, 'days_people', 2),
  ('price-item-04-03', 'price-cat-04-tech-ops', 'LED',                                 NULL, 60000, 60000, 'days_people', 3),
  ('price-item-04-04', 'price-cat-04-tech-ops', 'スイッチャー',                           NULL, 60000, 60000, 'days_people', 4),
  ('price-item-04-05', 'price-cat-04-tech-ops', 'カメラ',                                NULL, 55000, 55000, 'days_people', 5),
  ('price-item-04-06', 'price-cat-04-tech-ops', 'カメラアシスタント',                      NULL, 45000, 45000, 'days_people', 6),
  ('price-item-04-07', 'price-cat-04-tech-ops', '音声ミキサー',                           NULL, 55000, 55000, 'days_people', 7),
  ('price-item-04-08', 'price-cat-04-tech-ops', 'PAミキサー',                            NULL, 55000, 55000, 'days_people', 8),
  ('price-item-04-09', 'price-cat-04-tech-ops', 'オーディオアシスタント',                   NULL, 45000, 45000, 'days_people', 9),
  ('price-item-04-10', 'price-cat-04-tech-ops', 'ライティングディレクター',                 NULL, 55000, 55000, 'days_people', 10),
  ('price-item-04-11', 'price-cat-04-tech-ops', 'ライティングオペレーター',                 NULL, 55000, 55000, 'days_people', 11),
  ('price-item-04-12', 'price-cat-04-tech-ops', '配信管理',                              NULL, 55000, 55000, 'days_people', 12)
ON CONFLICT (id) DO NOTHING;

-- ⑤ テクニカル(機材) — すべて 日
INSERT INTO pricing_items (id, category_id, name, sub_label, unit_price, group_price, calc_type, sort_order) VALUES
  ('price-item-05-01', 'price-cat-05-tech-equipment', 'クレーンカメラ',                    '最大1式',                                       150000, 120000, 'days_qty', 1),
  ('price-item-05-02', 'price-cat-05-tech-equipment', 'スタジオカメラ',                    '最大2式',                                       100000,  80000, 'days_qty', 2),
  ('price-item-05-03', 'price-cat-05-tech-equipment', 'ワイヤレスジンバルカメラ',              '最大1式',                                        20000,  16000, 'days_qty', 3),
  ('price-item-05-04', 'price-cat-05-tech-equipment', 'PTZカメラ (常設セット)',             '常設6台で1式（セット）',                             60000,  48000, 'days',     4),
  ('price-item-05-05', 'price-cat-05-tech-equipment', 'PTZカメラ (追加)',                 '最大3式',                                        20000,  16000, 'days_qty', 5),
  ('price-item-05-06', 'price-cat-05-tech-equipment', '第1調整室利用費（映像・音声）',         '一式に含まれる機材は別途リスト化',                       300000, 240000, 'days',     6),
  ('price-item-05-07', 'price-cat-05-tech-equipment', '第2調整室利用費（LED含む）',          '一式に含まれる機材は別途リスト化',                       500000, 400000, 'days',     7),
  ('price-item-05-08', 'price-cat-05-tech-equipment', '照明機材一式',                      '一式に含まれる機材は別途リスト化',                       200000, 160000, 'days',     8),
  ('price-item-05-09', 'price-cat-05-tech-equipment', 'スタジオ機材フルセット',               '#1〜#8 をすべて利用可',                           1200000, 960000, 'days',     9)
ON CONFLICT (id) DO NOTHING;

-- ⑥ テクニカル(素材) — 本・シーン等の数量課金
INSERT INTO pricing_items (id, category_id, name, sub_label, unit_price, group_price, calc_type, sort_order) VALUES
  ('price-item-06-01', 'price-cat-06-tech-materials', '入稿チェック',           NULL,                                                    1500,  1200, 'qty', 1),
  ('price-item-06-02', 'price-cat-06-tech-materials', '動画エンコード',         '〜10分未満',                                              300,   240, 'qty', 2),
  ('price-item-06-03', 'price-cat-06-tech-materials', '動画エンコード',         '10分以上、30分未満',                                        180,   144, 'qty', 3),
  ('price-item-06-04', 'price-cat-06-tech-materials', '動画エンコード',         '30分以上、60分未満',                                        150,   120, 'qty', 4),
  ('price-item-06-05', 'price-cat-06-tech-materials', '動画エンコード',         '60分以上、90分未満',                                        120,    96, 'qty', 5),
  ('price-item-06-06', 'price-cat-06-tech-materials', '動画エンコード',         '90分以上、120分未満',                                        90,    72, 'qty', 6),
  ('price-item-06-07', 'price-cat-06-tech-materials', '動画エンコード',         '120分以上、180分未満',                                       60,    48, 'qty', 7),
  ('price-item-06-08', 'price-cat-06-tech-materials', '動画エンコード',         '180分以上',                                             21000, 16800, 'qty', 8),
  ('price-item-06-09', 'price-cat-06-tech-materials', '表示調整費',            'LED表示調整（フォーマット不適合修正）',                            1000,   800, 'qty', 9),
  ('price-item-06-10', 'price-cat-06-tech-materials', '動画エンコード（LED）',   'LED壁床／壁面／床面全体サイズ以外の画角調整等',                    2000,  1600, 'qty', 10),
  ('price-item-06-11', 'price-cat-06-tech-materials', '表示調整費（LED全体）',  'LED壁床／壁面／床面全体表示のフォーマット不適合修正（/シーン）',    3000,  2400, 'qty', 11)
ON CONFLICT (id) DO NOTHING;

-- ⑦ 制作(対応)
INSERT INTO pricing_items (id, category_id, name, sub_label, unit_price, group_price, calc_type, sort_order) VALUES
  ('price-item-07-01', 'price-cat-07-production', '打ち合わせ',         NULL, 40000, 20000, 'hours',       1),
  ('price-item-07-02', 'price-cat-07-production', '台本制作',           '/ページ', 10000, 10000, 'qty',         2),
  ('price-item-07-03', 'price-cat-07-production', '事前準備 制作スタッフ', NULL, 50000, 50000, 'days_people', 3),
  ('price-item-07-04', 'price-cat-07-production', '当日進行スタッフ',     NULL, 70000, 70000, 'days_people', 4)
ON CONFLICT (id) DO NOTHING;

-- ⑧ 追加オプション
INSERT INTO pricing_items (id, category_id, name, sub_label, unit_price, group_price, calc_type, sort_order) VALUES
  ('price-item-08-01', 'price-cat-08-options', '特殊映像演出（AR/XR）',       '※内容によって変動',                        300000, 300000, 'days',     1),
  ('price-item-08-02', 'price-cat-08-options', 'インタラクティブ演出（投票/スタンプ）', '※内容によって変動',                  200000, 200000, 'days',     2),
  ('price-item-08-03', 'price-cat-08-options', '多言語配信',                 '※内容によって変動',                        150000, 150000, 'days',     3),
  ('price-item-08-04', 'price-cat-08-options', 'IP中継利用',                 '※内容によって変動',                        300000, 300000, 'days',     4),
  ('price-item-08-05', 'price-cat-08-options', 'Zoom中継',                  '※内容によって変動',                        100000, 100000, 'days',     5),
  ('price-item-08-06', 'price-cat-08-options', 'テロップシステム利用',          '※内容によって変動',                         80000,  80000, 'days',     6),
  ('price-item-08-07', 'price-cat-08-options', 'PCレンタル利用',              '※内容によって変動',                         15000,  15000, 'days',     7),
  ('price-item-08-08', 'price-cat-08-options', '提携ケータリング',             'ご予算に応じてご提案いたします',                     0,      0, 'toggle',   8),
  ('price-item-08-09', 'price-cat-08-options', '物販利用',                   '売上金額の15%を手数料として申し受けます',              0,      0, 'toggle',   9),
  ('price-item-08-10', 'price-cat-08-options', '保管料',                    '1箱／1日',                                     1000,   1000, 'days_qty', 10)
ON CONFLICT (id) DO NOTHING;
