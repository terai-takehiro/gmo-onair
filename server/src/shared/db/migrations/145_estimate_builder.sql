-- 145: 見積をつくる (デザイン 30章 37a / 仕様書 §7.4)
--
-- ── なぜ新テーブルを作らないか ────────────────────────
--
-- 見積の器は既に2つある:
--   ① simulations        — 料金表から選ぶだけ (pricing_item_id が NOT NULL で自由記述が入らない)
--   ② revenues(status='estimate') + revenue_items — 概算見積。自由記述が入り、見積書PDFがあり、
--      GLS発番時に確定売上へ自動変換される (migrateEstimates)
--
-- 30章の見積は「料金表から選ぶ」と「自由に書く」の両方が要るので ② を土台にする。
-- ここに①相当の器をもう1つ作ると、同じ「見積」に入口が3つになり
-- 「どれが本物の見積か」が誰にも分からなくなる (原則2「入口は1つ」に反する)。
--
-- したがって足すのは **列だけ**。① simulations は料金シミュレーションとして残す
-- (AI の MCP 経路 set_project_simulation が使っており、消すと外の AI が壊れる)。
--
-- ── 仕入の列を持つ理由 ────────────────────────────────
--
-- 明細の行に「仕入(見込み)」を持たせ、受注したときにそのまま仕入の明細にする。
-- 見積を作るときには「この行は外部に幾ら払うか」が分かっているのに、
-- 受注後にもう一度仕入画面で打ち直すのが二度打ちの実体。
-- 粗利をその場で出すにも、行ごとの仕入が要る (案件合計だけでは行の良し悪しが読めない)。
--
-- 仕入先 (cost_vendor_id) は nullable。見積の時点では未定のことが普通で、
-- ここを必須にすると仕入の列が埋まらなくなる (= 粗利が出ない)。
-- 未定のまま受注したときは「(仕入先未定)」に寄せて見込み仕入を作る。

-- ── 明細の行 ──────────────────────────────────────────
ALTER TABLE revenue_items ADD COLUMN IF NOT EXISTS unit TEXT;
ALTER TABLE revenue_items ADD COLUMN IF NOT EXISTS cost_amount INTEGER NOT NULL DEFAULT 0;
ALTER TABLE revenue_items ADD COLUMN IF NOT EXISTS cost_vendor_id TEXT REFERENCES vendors(id);
-- AI が補った行の印。人が足した行と見分けが付かないと
-- 「勝手に増えている」と受け取られ、消すか残すかの判断ができない (v2.9.275 と同じ理由)
ALTER TABLE revenue_items ADD COLUMN IF NOT EXISTS is_ai_suggested BOOLEAN NOT NULL DEFAULT FALSE;

-- ── 見積の本体 ────────────────────────────────────────
-- 値引きは明細を書き換えずに持つ。明細の単価を下げて値引きを表すと
-- 「元は幾らだったか」が消え、次の案件の参考にできなくなる
ALTER TABLE revenues ADD COLUMN IF NOT EXISTS discount_amount INTEGER NOT NULL DEFAULT 0;
-- 版。作り直しても前の版の番号は戻さない (「第2版を送った」を後から言えるようにする)
ALTER TABLE revenues ADD COLUMN IF NOT EXISTS estimate_version INTEGER NOT NULL DEFAULT 1;
-- 送った記録。**ONAiR はメールを送らない**ので、送るのは人。ここは記録だけ
ALTER TABLE revenues ADD COLUMN IF NOT EXISTS estimate_sent_at TIMESTAMP;
-- 確定 (この金額で確定する) を押した時刻。想定金額とステージに反映した印
ALTER TABLE revenues ADD COLUMN IF NOT EXISTS estimate_confirmed_at TIMESTAMP;
-- BOX に残した PDF。実体は BOX で、ONAiR は参照だけ持つ (二重に持たない)
ALTER TABLE revenues ADD COLUMN IF NOT EXISTS estimate_pdf_box_file_id TEXT;

-- 案件の見積を引くクエリ (project_id + status) の索引
CREATE INDEX IF NOT EXISTS idx_revenues_project_status ON revenues(project_id, status);
