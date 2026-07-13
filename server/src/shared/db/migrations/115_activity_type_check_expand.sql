-- 営業活動記録 activity_type の CHECK 制約を UI 送信値との和集合に拡張 (v2.9.173)
-- 従来の CHECK は (call,email,meeting,visit,proposal,followup,other) の 7 値だったが、
-- UI (ActivityLogPage) は demo / follow_up を送るため CHECK 違反で保存できない既存バグがあった。
-- 違反値は既存行に存在し得ない (CHECK が弾いていた) ため、和集合への拡張は無条件に安全。
ALTER TABLE activity_logs DROP CONSTRAINT IF EXISTS activity_logs_activity_type_check;
ALTER TABLE activity_logs ADD CONSTRAINT activity_logs_activity_type_check
  CHECK (activity_type IN ('call','email','meeting','visit','proposal','demo','followup','follow_up','other'));
