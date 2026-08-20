-- ============================================================
-- 208: customers / vendors テーブル本体を削除する（Phase 3-3-9）
--
-- 経緯（詳細: docs/reviews/phase3-2-plan.md「Phase 3-3 でやること」）
--
-- 会社リスト一本化（Phase 1〜3-2）で customers/vendors → companies への
-- 移行を進めてきた最終段階。migration 200/201 で主要7つのFKを companies(id)
-- へ張り替え、207 で revenue_items.cost_vendor_id も companies(id) へ
-- 張り替えた。アプリコード側も customers/vendors を直接参照する箇所を
-- すべて companies だけを見るよう書き換え済み（この migration と同じPR）。
--
-- ⚠️ これは「イメージだけ差し替える」ロールバックが使えなくなる変更（すでに
-- migration 200/201 の時点でロールバック手段は DB バックアップからの復元のみに
-- なっている）。
--
-- ⚠️ vendor の最終突き合わせは、この migration の中で LOCK TABLE と同じ
-- トランザクションで実行する（事前に別途確認するだけだと、確認からデプロイ
-- までの間の書き込みで再度差分が発生し得るため）。`budget:editor`
-- （`sales:owner` なし）が `vendors.routes.ts` 経由で `vendors` だけを
-- 更新できる設計だったが、この PR で `vendors.routes.ts` 自体が companies
-- 直接読み書きに変わり、その編集経路自体が無くなる。ここでは最後に
-- 残っている差分（このデプロイ直前までの vendors 側の更新）を companies へ
-- 反映してから DROP する。

-- 以降このトランザクションが終わるまで、customers/vendors への書き込みは
-- ブロックされる（PUT /vendors/:id 等は待たされ、テーブルが消えた後は
-- 正常に404/500として扱われる）。
LOCK TABLE customers IN ACCESS EXCLUSIVE MODE;
LOCK TABLE vendors IN ACCESS EXCLUSIVE MODE;

-- vendor 側だけにある最新値を companies へ反映する（このタイミングが唯一の
-- 反映機会 — 権限の壁を飛び越えるのは vendors 編集経路そのものが無くなる
-- このタイミングだけ、という設計。docs/reviews/phase3-2-plan.md 上表#1）
UPDATE companies co SET
  name = v.name,
  contact_name = v.contact_name,
  email = v.email,
  phone = v.phone,
  address = v.address,
  vendor_type = v.vendor_type,
  invoice_registration_number = v.invoice_registration_number,
  notes = v.notes,
  updated_at = NOW()
FROM vendors v
WHERE v.company_id = co.id
  AND v.deleted_at IS NULL
  AND co.deleted_at IS NULL
  AND (
    v.name IS DISTINCT FROM co.name
    OR v.contact_name IS DISTINCT FROM co.contact_name
    OR v.email IS DISTINCT FROM co.email
    OR v.phone IS DISTINCT FROM co.phone
    OR v.address IS DISTINCT FROM co.address
    OR v.vendor_type IS DISTINCT FROM co.vendor_type
    OR v.invoice_registration_number IS DISTINCT FROM co.invoice_registration_number
    OR v.notes IS DISTINCT FROM co.notes
  );

DROP TABLE IF EXISTS customers;
DROP TABLE IF EXISTS vendors;
