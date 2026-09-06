-- 282: entity_code を NOT NULL にする（配線完了後・2026年10月の事業再編）
--
-- 281 で足した列を、全 INSERT 文が entity_code を明示するようになった後に締める。
-- 既存行（配線前に書かれた行）は今の唯一の会社＝GSS の実績として埋め戻す。

UPDATE projects      SET entity_code = 'GSS' WHERE entity_code IS NULL;
UPDATE revenues      SET entity_code = 'GSS' WHERE entity_code IS NULL;
UPDATE purchases     SET entity_code = 'GSS' WHERE entity_code IS NULL;
UPDATE sga_expenses  SET entity_code = 'GSS' WHERE entity_code IS NULL;
UPDATE estimates     SET entity_code = 'GSS' WHERE entity_code IS NULL;

ALTER TABLE projects      ALTER COLUMN entity_code SET NOT NULL;
ALTER TABLE revenues      ALTER COLUMN entity_code SET NOT NULL;
ALTER TABLE purchases     ALTER COLUMN entity_code SET NOT NULL;
ALTER TABLE sga_expenses  ALTER COLUMN entity_code SET NOT NULL;
ALTER TABLE estimates     ALTER COLUMN entity_code SET NOT NULL;
