-- 285: 社内取引（GJV⇄GSS）の売上・仕入を1対1で結ぶ表を新設した
-- （2026年10月の事業再編・P2 Round 2）
--
-- 設計の全文: docs/reorg-2026-10-plan.md §4.12（決定: 発生する → ONAiR に載せる）
--
-- 「社内取引は、同じ案件に付く、会社の違う2行」（写しの案件は作らない）。
-- 売り手（GSSの社内売上）と買い手（GJVの社内仕入）を1対1で結び、
-- 片方だけを直せない・消せないようにする（アプリ側のガードが参照する）。

CREATE TABLE IF NOT EXISTS intercompany_links (
  id          TEXT PRIMARY KEY,
  -- 売り手側（例: GSS の社内売上）。1つの売上は最大1つの社内仕入としか結べない
  revenue_id  TEXT NOT NULL UNIQUE REFERENCES revenues(id),
  -- 買い手側（例: GJV の社内仕入）
  purchase_id TEXT NOT NULL UNIQUE REFERENCES purchases(id),
  -- 便宜上の重複列（本来 revenues/purchases 双方の project_id から導けるが、
  -- 「この案件に社内取引があるか」を JOIN 無しで引けるようにするため持つ）
  project_id  TEXT NOT NULL REFERENCES projects(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  TEXT
);

CREATE INDEX IF NOT EXISTS idx_intercompany_links_project ON intercompany_links(project_id);
