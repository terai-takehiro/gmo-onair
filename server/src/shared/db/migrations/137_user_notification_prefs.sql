-- ========================================================
-- Migration 137: 通知の受け取り方 (§4.15 / デザイン 18a)
--
-- **通知そのものは保存しない**。ベルの中身は既存データ (inbox / tasks / bookings) からの
-- 導出で、既読の概念も持たない (終わったら消える)。
-- 保存するのは「どう受け取りたいか」だけ。
-- ========================================================

CREATE TABLE IF NOT EXISTS user_notification_prefs (
  user_id            TEXT PRIMARY KEY REFERENCES users(id),
  -- 朝の1通 (平日 6:00)
  morning_slack      BOOLEAN NOT NULL DEFAULT TRUE,
  morning_email      BOOLEAN NOT NULL DEFAULT FALSE,
  -- 期限を過ぎたものの即時通知。**1日1回にまとめる**のが既定
  overdue_digest     BOOLEAN NOT NULL DEFAULT TRUE,
  -- 依頼を受けたときだけ即時に知らせる
  delegation_instant BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at         TIMESTAMP NOT NULL DEFAULT NOW()
);
