-- opportunities テーブルに失注理由・リード情報カラムを追加
-- SQLiteではALTER TABLE ADD COLUMNのみ対応

-- 失注理由
ALTER TABLE opportunities ADD COLUMN lost_reason_id TEXT REFERENCES lost_reasons(id);
ALTER TABLE opportunities ADD COLUMN lost_reason_note TEXT;

-- リード獲得情報
ALTER TABLE opportunities ADD COLUMN lead_source TEXT;
ALTER TABLE opportunities ADD COLUMN first_contact_date TEXT;
