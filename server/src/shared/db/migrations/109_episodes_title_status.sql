-- 109: episodes テーブルに title / status カラムを追加
--
-- episodes の更新ルート (PUT /:projectId/episodes/:id) と、月次ユニット作成
-- (POST /:projectId/episodes/month — エピソードを「月」として流用し GLS-B005-2610 等を作る)
-- が title / status を INSERT/UPDATE で参照するが、001b_postgresql_schema.sql の基本スキーマに
-- これらのカラムが存在せず `column "title" does not exist` で 500 になっていた
-- (＝ビジネス案件の「月を追加」が失敗していた根本原因)。冪等に追加する。
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS title  TEXT;
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS status TEXT;
