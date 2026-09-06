-- 282: 計上会社マスターと切替状態の表を足した（2026年10月の事業再編）
--
-- 設計の全文: docs/reorg-2026-10-plan.md（§4.2・§4.9・§13）
--
-- ── 何のために足すか ──────────────────────────────────────────
--
-- 2026年10月、GMOグローバルスタジオ株式会社は GMOサムライスタジオ株式会社に
-- 社名変更し、売上を計上する会社が2社（グループ外の案件＝GMOサムライ
-- コンテンツスタジオ／グループ内の案件＝GMOサムライスタジオ）になる。
-- GLS-B（プロジェクト案件）はグループ本体の事業担当へ移管され、売上の無い
-- コストセンターになる。この3社を表す「計上会社」マスターと、旧→新の
-- 切替状態（このマイグレーションでは常に 'off'）をここで導入する。
--
-- ⚠️ **このマイグレーションは「土台を足すだけ」。** `org_transition.state` は
-- 'off' のまま・案件番号の採番も帳簿の書き込みも一切変えない。
-- 既存の振る舞いは1ミリも変わらないことが受け入れ条件（§13）。

-- ── 1. 計上会社マスター ──────────────────────────────────────
--
-- `code` が案件番号の prefix と同じ文字列（`GJV-0001` の `GJV`）。
-- `active_from`・`renamed_on` はあえて NULL のまま作る——切替日はまだ確定した
-- 特定の1日ではなく、設定画面（§13 の 0d）から system_admin が決める運用に
-- する（コードに特定の日付を焼き込まない）。
CREATE TABLE IF NOT EXISTS legal_entities (
  code                          TEXT PRIMARY KEY CHECK (code IN ('GJV', 'GSS', 'GMO')),
  name                          TEXT NOT NULL,
  short_name                    TEXT NOT NULL,
  -- GSS だけが持つ（社名変更前の名前）。GJV・GMO は NULL のまま
  former_name                   TEXT,
  renamed_on                    DATE,
  kind                          TEXT NOT NULL CHECK (kind IN ('revenue', 'cost_center')),
  parent_code                   TEXT REFERENCES legal_entities(code),
  number_prefix                 TEXT NOT NULL UNIQUE,
  -- 発行者情報（PDF・メールの発行者ブロックが読む）。GMO は請求書を出さない
  -- （kind='cost_center'）ので使わない。GJV は設定画面から入力してもらう
  -- （このマイグレーションでは空欄のまま作る——値をチャットで預からない）
  issuer_address1               TEXT,
  issuer_address2               TEXT,
  invoice_registration_number   TEXT,
  bank_account                  JSONB,
  logo_ref                      TEXT,
  active_from                   DATE,
  sort_order                    INTEGER NOT NULL DEFAULT 0,
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by                    TEXT
);

-- 親→子の順に入れる（GSS の parent_code が GJV を指すため。同一トランザクション
-- 内でも FK は行ごとの直後に検査されるので、参照先を先に作る）。
INSERT INTO legal_entities
  (code, name, short_name, kind, number_prefix, sort_order)
VALUES
  ('GJV', 'GMOサムライコンテンツスタジオ株式会社', 'コンテンツスタジオ',
   'revenue', 'GJV-', 1),
  ('GMO', 'GMOインターネットグループ株式会社', 'グループ本体',
   'cost_center', 'GMO-', 3)
ON CONFLICT (code) DO NOTHING;

-- GSS（今の会社。社名変更のみ・同一法人）は今の発行者情報
-- （`shared/services/pdf.service.ts` の `COMPANY` 定数）をそのまま初期値に
-- 入れる——消して打ち直させない。以後は設定画面から変更できる。
INSERT INTO legal_entities
  (code, name, short_name, former_name, kind, parent_code, number_prefix,
   issuer_address1, issuer_address2, invoice_registration_number, sort_order)
VALUES
  ('GSS', 'GMOサムライスタジオ株式会社', 'サムライスタジオ',
   'GMOグローバルスタジオ株式会社', 'revenue', 'GJV', 'GSS-',
   '東京都世田谷区用賀四丁目10番1号', 'GMOインターネットTOWER 27F',
   'T9011001154049', 2)
ON CONFLICT (code) DO NOTHING;

-- ── 2. 旧⇄新の切替状態（1行だけ・money_rules と同じ形）────────
CREATE TABLE IF NOT EXISTS org_transition (
  id           TEXT PRIMARY KEY DEFAULT 'default' CHECK (id = 'default'),
  state        TEXT NOT NULL DEFAULT 'off' CHECK (state IN ('off', 'preparing', 'cutover', 'done')),
  cutover_date DATE,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by   TEXT
);

INSERT INTO org_transition (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;

-- ── 3. 取引先に「どの計上会社の自社行か」の印を持たせる ────────
ALTER TABLE companies ADD COLUMN IF NOT EXISTS legal_entity_code TEXT REFERENCES legal_entities(code);

-- ── 4. 取引先「GMOサムライコンテンツスタジオ」2行の名寄せ ──────
--
-- 実データ確認（2026-09-06・本番 MCP 読み取り）: 案件「インテリジェンス」
-- （GLS-A023）・「紹介動画撮影」（GLS-B006）はどちらも
-- `3d099e40-a593-4ab4-acfc-e2c461c4df88`（「GMOサムライコンテンツスタジオ
-- 株式会社」・作成 2026-04-20）の customer_id を参照している。もう1行
-- `ff64b0e1-a352-4fb0-9167-08ccfe0230fe`（「GMOサムライコンテンツスタジオ」・
-- 決算取込が 2026-06-15 に自動作成・notes='[kessan:2026-03]'）は参照 0 件。
--
-- `companies(id)` を指す FK は8列（migration 200/201/207 で companies へ
-- 張り替え済みの全部）。削除の前に防御的にすべて付け替える。
DO $$
DECLARE
  keep_id   TEXT := '3d099e40-a593-4ab4-acfc-e2c461c4df88';
  retire_id TEXT := 'ff64b0e1-a352-4fb0-9167-08ccfe0230fe';
BEGIN
  IF EXISTS (SELECT 1 FROM companies WHERE id = retire_id) THEN
    UPDATE projects      SET customer_id     = keep_id WHERE customer_id     = retire_id;
    UPDATE revenues      SET customer_id     = keep_id WHERE customer_id     = retire_id;
    UPDATE activity_logs SET customer_id     = keep_id WHERE customer_id     = retire_id;
    UPDATE estimates     SET customer_id     = keep_id WHERE customer_id     = retire_id;
    UPDATE gpm_projects  SET customer_id     = keep_id WHERE customer_id     = retire_id;
    UPDATE purchases     SET vendor_id       = keep_id WHERE vendor_id       = retire_id;
    UPDATE sga_expenses  SET vendor_id       = keep_id WHERE vendor_id       = retire_id;
    UPDATE revenue_items SET cost_vendor_id  = keep_id WHERE cost_vendor_id  = retire_id;

    DELETE FROM companies WHERE id = retire_id;
  END IF;
END $$;

-- ── 5. GJV の自社行を足す ────────────────────────────────────
--
-- `comp-self-gms`（migration 179・200）と同型。GPM の依頼元「自社」・
-- 社内取引（§4.12）の相手先として使う。
--
-- ⚠️ **`comp-self-gms` の名前はここでは変えない**（「自社（GMOグローバル
-- スタジオ）」のまま）。書き換えは切替のとき（`org_transition.state` が
-- 'off' のあいだ振る舞いを変えない・§13 の受け入れ条件）。
INSERT INTO companies (id, name, short_name, is_customer, is_gmo_group, legal_entity_code, notes)
VALUES ('comp-self-gjv', '自社（GMOサムライコンテンツスタジオ）', '自社', TRUE, TRUE, 'GJV',
        '社内取引・GPM の依頼元「自社」が使う行（2026年10月の事業再編・GJV 側）。請求先ではない')
ON CONFLICT (id) DO NOTHING;

UPDATE companies SET legal_entity_code = 'GSS'
  WHERE id = 'comp-self-gms' AND legal_entity_code IS NULL;
