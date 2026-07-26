-- 151: リアルタイムCG の「テンプレート」— デザイン 20章 20e
--
-- 演出のテンプレートは複数あるが、**実装しているのは「アワード」だけ**。
-- 選ばせておいて何も起きない状態にすると「壊れている」と読まれるので、
-- 選べる一覧と「作れるか」をデータとして持ち、作れないものは
-- 画面が「準備中です」と言ってアワードに戻す。
--
-- 列を1つ足すだけにした理由: テンプレートはイベントに1つしか無く、
-- 別テーブルにすると「このイベントのテンプレートはどれか」を引くのに
-- JOIN が要るだけで得るものが無い。
ALTER TABLE awards_events
  ADD COLUMN IF NOT EXISTS template VARCHAR(30) NOT NULL DEFAULT 'awards';

-- 既存のイベントはすべてアワード (この機能はアワードしか作っていない)
UPDATE awards_events SET template = 'awards' WHERE template IS NULL OR template = '';
