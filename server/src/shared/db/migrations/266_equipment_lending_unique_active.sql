-- 機材の二重貸出を DB レベルで防ぐ（security_card_lendings の migration 133 と同じ形）
--
-- ── なぜ足すか ─────────────────────────────────────────────
--
-- 貸出の作成はアプリ層の SELECT→INSERT（`findActiveLending`）でしか守られておらず、
-- 2 リクエストがほぼ同時に来ると両方が「貸出無し」と判定して INSERT が2本通る
-- （QR 読み取りからの一括貸出などで実際に起きうる）。以後の返却・棚卸しが合わなくなる。
--
-- ── 先に既存の二重貸出を掃除する ─────────────────────────────
--
-- 二重の行が残っているとユニーク索引の作成自体が失敗する。
-- 機材ごとに最新の 'lent' 行（lent_at, id の大きいほう）だけ残し、古いほうは
-- 返却済みへ落とす（消さない — いつ貸したかの記録は履歴として残す）。
UPDATE equipment_lendings el
   SET status = 'returned',
       returned_at = NOW(),
       updated_at = NOW(),
       notes = COALESCE(el.notes || E'\n', '') || '[migration 266] 二重貸出行のため自動で返却済みに変更'
 WHERE el.status = 'lent'
   AND EXISTS (
     SELECT 1 FROM equipment_lendings e2
      WHERE e2.equipment_id = el.equipment_id
        AND e2.status = 'lent'
        AND (e2.lent_at, e2.id) > (el.lent_at, el.id)
   );

-- 1 台の機材に同時に貸出中 (lent) の行は 1 本のみ
-- （equipment_lendings に deleted_at は無いので、条件は status だけでよい）
CREATE UNIQUE INDEX IF NOT EXISTS uq_equipment_active_lending
  ON equipment_lendings(equipment_id) WHERE status = 'lent';
