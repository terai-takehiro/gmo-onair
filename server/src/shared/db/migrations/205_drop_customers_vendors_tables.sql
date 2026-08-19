-- customers/vendors テーブル本体を削除する（Phase 3-3-7〜9・不可逆）
--
-- ── 何を消すか ──────────────────────────────────────────────
--
-- Phase 1〜3-3-6 で `companies` を取引先マスターの唯一の正にしてきた
-- （companies へのFK張り替え・支払条件の一本化・旧列の削除・直接参照コードの
-- 書き換え）。この migration で最後に残っていた `customers`/`vendors` テーブル
-- 本体を削除する。これに合わせて、コード側でも以下を同じPR/デプロイで実施した:
--   ・仕入先編集の「壁」（budget:editor 単独の編集は companies へ反映しない）を撤廃し、
--     budget:editor の編集がそのまま companies に反映されるようにした（ユーザー承認済み）
--   ・customers/vendors への直接参照・書き込み・legacy URL 互換コードをすべて除去
--   ・data-viewer.routes.ts の ALLOWED_TABLES から 'customers'/'vendors' を除去
--   ・server/scripts/import-kessan-dev.mjs（dev専用）を companies 単独に書き換え
--
-- ── なぜロック＋最終突き合わせが要るか ──────────────────────────
--
-- `vendors.name` 等は「壁」の設計上 `companies` より新しい場合があった
-- （budget:editor が sales:owner 無しで vendors だけを更新できたため）。
-- テーブルを消す前に、この最終的な差分を companies へ反映しておかないと
-- budget:editor が付けた最新の値が失われる。反映は「壁」が実質的に消える
-- このタイミングでしか行わない（`shared/services/company-directory.service.ts`
-- の設計コメント・`docs/reviews/phase3-2-plan.md` 上表#1 参照）。
--
-- `LOCK TABLE ... IN ACCESS EXCLUSIVE MODE` で customers/vendors への書き込みを
-- 止めた状態にしてから最終突き合わせ→DROP TABLE を同一トランザクションで行うことで、
-- 「確認した時点と削除する時点の間に別の書き込みが割り込む」余地を無くす。
-- customers/vendors 側は主要な書き込み経路が既に companies だけに切り替わっているため
-- （company-directory.service.ts・vendors.routes.ts・customers.routes.ts・companies.routes.ts
-- 等はすべて companies のみを読み書きする）、このロックによる実質的な待ちは
-- 発生しない見込み。仮に発生しても、テーブルが消えたあとは正常に404/500として扱われる
-- （静かにデータが失われることはない）。

LOCK TABLE customers IN ACCESS EXCLUSIVE MODE;
LOCK TABLE vendors   IN ACCESS EXCLUSIVE MODE;

-- vendor側の最終突き合わせ。2026-08-19 の検証環境チェックでは diff_count=0 だったが、
-- 本番相当データで改めて実施する（`docs/reviews/phase3-2-plan.md` 上表#1参照）
UPDATE companies co SET
  name = v.name, contact_name = v.contact_name, email = v.email, phone = v.phone,
  address = v.address, vendor_type = v.vendor_type,
  invoice_registration_number = v.invoice_registration_number, notes = v.notes,
  updated_at = NOW()
FROM vendors v
WHERE v.company_id = co.id AND v.deleted_at IS NULL AND co.deleted_at IS NULL
  AND (v.name IS DISTINCT FROM co.name OR v.contact_name IS DISTINCT FROM co.contact_name
    OR v.email IS DISTINCT FROM co.email OR v.phone IS DISTINCT FROM co.phone
    OR v.address IS DISTINCT FROM co.address OR v.vendor_type IS DISTINCT FROM co.vendor_type
    OR v.invoice_registration_number IS DISTINCT FROM co.invoice_registration_number
    OR v.notes IS DISTINCT FROM co.notes);

-- customer側も同じ安全策。設計上は常に companies と同期されているはずだが
-- （customers.routes.ts は sales:owner 必須で保存のたびに companies も更新する）、
-- data-viewer.routes.ts のような汎用テーブル編集が customers だけを書き換えていた
-- 可能性を消すため、テーブルを消す前にもう一度突き合わせておく
UPDATE companies co SET
  name = cu.name, short_name = cu.short_name, contact_name = cu.contact_name, email = cu.email,
  phone = cu.phone, address = cu.address, notes = cu.notes, is_gmo_group = cu.is_gmo_group,
  updated_at = NOW()
FROM customers cu
WHERE cu.company_id = co.id AND cu.deleted_at IS NULL AND co.deleted_at IS NULL
  AND (cu.name IS DISTINCT FROM co.name OR cu.short_name IS DISTINCT FROM co.short_name
    OR cu.contact_name IS DISTINCT FROM co.contact_name OR cu.email IS DISTINCT FROM co.email
    OR cu.phone IS DISTINCT FROM co.phone OR cu.address IS DISTINCT FROM co.address
    OR cu.notes IS DISTINCT FROM co.notes OR cu.is_gmo_group IS DISTINCT FROM co.is_gmo_group);

DROP TABLE customers;
DROP TABLE vendors;
