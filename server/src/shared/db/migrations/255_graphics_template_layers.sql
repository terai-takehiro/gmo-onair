-- ============================================================
-- 250: テロップCG — テンプレート層 段6-2 本格拡張（複数部品の組み合わせテンプレート）
--
-- docs/design/v4/graphics-awards-migration-plan.md §2-2 の6番。段6-2の第一段
-- （migration 249・単一部品の設定プリセット＋公開フィールド絞り込み）はそのまま生かし、
-- 「既存9部品のうち複数個を選んで1画面（1スロット）に重ねて置ける」組み合わせ機能を追加する。
--
-- ⚠️ 「自由なドラッグ配置キャンバス」は今回も対象外（既存9部品は自分の描画位置を内部で
-- 決め打ちしたまま）。追加するのは「複数部品を選んで重ねる」だけ——位置の指定は持たない。
--
-- layers（graphics_templates・graphics_pages とも NULL 許容・既定 NULL）:
--   null/未指定/空配列 = 従来どおりの単一部品（既存の part_key/base_fields/public_fields・
--                        part_key/fields が正）。既存データは一切触らない
--   非空配列（最大4要素・アプリ層でバリデーション） = 複数部品を重ねた組み合わせ
--     graphics_templates.layers: [{ partKey, baseFields, publicFields }]
--     graphics_pages.layers:     [{ partKey, fields }]
-- ============================================================

ALTER TABLE graphics_templates ADD COLUMN IF NOT EXISTS layers JSONB;
ALTER TABLE graphics_pages ADD COLUMN IF NOT EXISTS layers JSONB;
