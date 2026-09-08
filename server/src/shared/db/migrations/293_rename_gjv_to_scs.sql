-- 293: 計上会社コード「GJV」を「SCS」へ改名した（コンテンツスタジオの接頭辞の変更）
--
-- 設計の全文: docs/reorg-2026-10-plan.md（§4.2・§4.3）
--
-- ── 何のために ──────────────────────────────────────────────
--
-- 案件番号の接頭辞候補として先に決めていた `GJV`（GMOサムライコンテンツスタジオ）を
-- `SCS` に変更する（GSS・GMO は変わらない）。migration 284〜291 は `main` に既に
-- マージ済みで、検証環境には `legal_entities`／`money_rules`／`companies` の
-- マスター行が `code='GJV'`/`entity_code='GJV'` で入っている前提で書く
-- （実データ確認・2026-09-08: 発番済みの GJV 案件は 0 件・`org_transition.state` は
-- まだ 'off' なので業務データへの実害は無い）。
--
-- ⚠️ **既存の 284〜291 のファイルは書き換えない**（「マイグレーションは追加のみ」原則）。
-- ここでは PK（`legal_entities.code`）の値そのものを差し替えるため、FK 制約
-- （既定 `ON UPDATE NO ACTION`）に阻まれないよう「新しい行を先に足す → 子の参照を
-- 付け替える → 古い行を消す → CHECK 制約を締め直す」の順で行う。
--
-- ⚠️ **`companies.id = 'comp-self-gjv'`（自社行の主キー文字列）は変えない**
-- （`server/src/shared/constants/entity-default.ts` の `SELF_COMPANY_ID_BY_ENTITY` が
-- 同じ値をハードコードで参照している。ID をリネームする実益より、参照が食い違う
-- リスクのほうが大きい）。名前・`legal_entity_code` の値だけ揃える。

-- ── 1. CHECK 制約を一時的に広げる（GJV と SCS の両方を許す）───────────
ALTER TABLE legal_entities DROP CONSTRAINT IF EXISTS legal_entities_code_check;
ALTER TABLE legal_entities ADD CONSTRAINT legal_entities_code_check
  CHECK (code IN ('GJV', 'SCS', 'GSS', 'GMO'));

-- ── 2. 新しい親行 'SCS' を先に足す（GJV 行の中身をコピー。存在しなければ何もしない）──
INSERT INTO legal_entities (
  code, name, short_name, former_name, renamed_on, kind, parent_code, number_prefix,
  issuer_address1, issuer_address2, invoice_registration_number, bank_account, logo_ref,
  active_from, sort_order, updated_at, updated_by
)
SELECT
  'SCS', name, short_name, former_name, renamed_on, kind, parent_code, 'SCS-',
  issuer_address1, issuer_address2, invoice_registration_number, bank_account, logo_ref,
  active_from, sort_order, updated_at, updated_by
FROM legal_entities WHERE code = 'GJV'
ON CONFLICT (code) DO NOTHING;

-- ── 3. 子（GSS の parent_code）の参照を先に付け替える ─────────────────
UPDATE legal_entities SET parent_code = 'SCS' WHERE parent_code = 'GJV';

-- ── 4. 帳簿の行・案件・履歴・取引先の参照を付け替える（新しい親 'SCS' が
--    既に存在するので FK 違反にならない）──────────────────────────
UPDATE projects              SET entity_code = 'SCS' WHERE entity_code = 'GJV';
UPDATE revenues              SET entity_code = 'SCS' WHERE entity_code = 'GJV';
UPDATE purchases             SET entity_code = 'SCS' WHERE entity_code = 'GJV';
UPDATE sga_expenses          SET entity_code = 'SCS' WHERE entity_code = 'GJV';
UPDATE estimates             SET entity_code = 'SCS' WHERE entity_code = 'GJV';
UPDATE finance_docs          SET entity_code = 'SCS' WHERE entity_code = 'GJV';
UPDATE project_numbers       SET entity_code = 'SCS' WHERE entity_code = 'GJV';
UPDATE companies             SET legal_entity_code = 'SCS' WHERE legal_entity_code = 'GJV';

-- ── 5. money_rules: id = entity_code の CHECK を外してから両方を書き換える ──
ALTER TABLE money_rules DROP CONSTRAINT IF EXISTS money_rules_id_check;
UPDATE money_rules SET id = 'SCS', entity_code = 'SCS' WHERE id = 'GJV';
ALTER TABLE money_rules ADD CONSTRAINT money_rules_id_check CHECK (id = entity_code);

-- ── 6. monthly_budgets / monthly_actual_overrides（PK が (entity_code, year_month)）──
UPDATE monthly_budgets          SET entity_code = 'SCS' WHERE entity_code = 'GJV';
UPDATE monthly_actual_overrides SET entity_code = 'SCS' WHERE entity_code = 'GJV';

-- ── 7. 隔週キープの絞り込み値（CHECK 制約なしの自由な TEXT 列）───────────
UPDATE keep_report_packs SET scope_entity = 'SCS' WHERE scope_entity = 'GJV';

-- ── 8. sequences（動的に作られる採番カウンタ）。まだ1件も発番していなければ
--    該当行自体が存在しないので、下の UPDATE は無害に 0 行のまま終わる ────
UPDATE sequences SET seq_name = REPLACE(seq_name, 'GJV', 'SCS')
  WHERE seq_name LIKE '%GJV%';

-- ── 9. 古い親行 'GJV' を消し、CHECK 制約を最終形に締め直す ────────────
DELETE FROM legal_entities WHERE code = 'GJV';

ALTER TABLE legal_entities DROP CONSTRAINT IF EXISTS legal_entities_code_check;
ALTER TABLE legal_entities ADD CONSTRAINT legal_entities_code_check
  CHECK (code IN ('SCS', 'GSS', 'GMO'));
