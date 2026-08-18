-- mcp_audit_log の create_customer 監査行を、customers.id ではなく companies.id で
-- 引けるように書き換える (Phase 3-3-3・docs/reviews/phase3-2-plan.md 表#3)
--
-- ── 何を直すか ────────────────────────────────────────────────
--
-- MCP の create_customer (customers.tools.ts) は今まで result_summary.created_id に
-- customers.id を書いており、customers.routes.ts の AI 登録判定 (is_ai_created /
-- ai_requested_by) はその customers.id (CUSTOMER_JOIN の cu.id as legacy_customer_id)
-- で mcp_audit_log を逆引きしていた。
--
-- Phase 3-3 で customers テーブル自体を削除する前に、この逆引きキーを companies.id
-- （customers.company_id で1段引いた先）へ揃えておく必要がある。この migration は
-- 既存の監査ログ (バックフィル) だけを直す。書き込み側 (customers.tools.ts) と
-- 読み込み側 (customers.routes.ts) の切り替えは同じPR内の別コミットで行い、
-- 3つを分割しない (バックフィルだけ先に出すと、その後に作られた行が旧ID空間の
-- ままになり取りこぼす — docs/reviews/phase3-2-plan.md 表#3 参照)。
--
-- ── 方針 ────────────────────────────────────────────────────────
--
-- tool_name = 'create_customer' の行に限り、result_summary->>'created_id' を
-- customers.id とみなして customers.company_id を引き、companies.id に置き換える。
-- customers.company_id が NULL (取引先マスターに未紐付けの孤立行) の場合は
-- 対応する companies.id が無いため更新しない — その行の is_ai_created は
-- 読み込み側切り替え後に一時的に false へ落ちるが、正式なゼロ件保証は
-- Phase 3-3-5 のテーブル削除 migration 内で改めて確認する (このPRの対象外)。
-- customers.id が既に customers テーブルに存在しない (通常運用では起きない
-- ハード削除等) 行も同様に対象外とする。

UPDATE mcp_audit_log m
SET result_summary = jsonb_set(m.result_summary, '{created_id}', to_jsonb(cu.company_id))
FROM customers cu
WHERE m.tool_name = 'create_customer'
  AND m.result_summary ->> 'created_id' = cu.id
  AND cu.company_id IS NOT NULL;
