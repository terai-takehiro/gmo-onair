-- 213: 公開音声サポート URL を「取り消せる」ようにする
--
-- ── なぜ表を1本足すのか ────────────────────────────────────
--
-- 今は /qsheet/audio/<資料ID> が URL の全部で、資料IDは編集画面・ランダウン・
-- プロンプターの URL にもそのまま出ている。つまり社内で URL を1度見た人は
-- 公開URLを自分で組み立てられ、しかも配ったあとに止める手段が無い
-- (209 で audio_share_revoked_at / audio_share_revoked_by を DROP 済み。
--  それ以前も、失効を読むコードは1行も残っていなかった)。
--
-- ── なぜ qsheet_documents に列を足し直さないのか ────────────
--
-- 列で持つと「1資料に1本」しか持てず、**再発行すると前の URL の記録が消える**。
-- 「いつ配った分を、いつ誰が止めたか」を後から言えるようにしたいので、行で持つ。
-- 失効した行も**消さない**(消すと「止めた」という事実が消える)。
--
-- ── URL の形（実装設計 02 §4-1 からの変更点）─────────────────
--
-- 実装設計 02 §4-1 は「パスの資料ID部分をトークンに差し替える」案を採っているが、
-- 実装時点で「公開画面は URL の値をそのまま Socket.IO の room 名に使っている」
-- (doc:<資料ID>) ことが分かっており、パスをトークンに差し替えると
-- 誰もいない room に入って cue 同期が黙って止まる (設計書 §10-1 が指摘する事故)。
-- そのため実装では **資料IDはパスに残したまま**、トークンは
-- ?token= のクエリパラメータとして追加し、公開GETの検証と失効判定だけに使う
-- (Socket.IO の room キーは今までどおり資料ID)。詳細は audio-share.service.ts と
-- public-audio.routes.ts のコメントを参照。

CREATE TABLE IF NOT EXISTS qsheet_audio_shares (
  token        TEXT PRIMARY KEY,
  document_id  TEXT NOT NULL REFERENCES qsheet_documents(id) ON DELETE CASCADE,
  label        TEXT,
  created_by   TEXT REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at   TIMESTAMPTZ,
  revoked_by   TEXT REFERENCES users(id),
  last_seen_at TIMESTAMPTZ
);

-- 「この資料の生きている URL」を引くための索引。失効済みは入れない。
CREATE INDEX IF NOT EXISTS idx_qsheet_audio_shares_doc
  ON qsheet_audio_shares(document_id) WHERE revoked_at IS NULL;

COMMENT ON TABLE  qsheet_audio_shares          IS '公開音声サポート URL の失効トークン。失効しても行は消さない。URL は /qsheet/audio/<資料ID>?token=<token> のまま (資料IDはトークンに差し替えない)';
COMMENT ON COLUMN qsheet_audio_shares.token    IS '?token= に載る不透明な文字列。base64url 32文字 (192bit)';
COMMENT ON COLUMN qsheet_audio_shares.label    IS '「8/6 本番用」など、人が後で見分けるための覚え書き（第1版は未使用）';
COMMENT ON COLUMN qsheet_audio_shares.last_seen_at IS '最後に開かれた時刻。使われているかを見るためだけで、人数は数えない';

-- UNIQUE(document_id) WHERE revoked_at IS NULL は張らない。「同時に生きているのは1本」は
-- 画面側の決めであって、表の制約にすると将来の要件変更（本番用とリハ用を分ける等）で
-- migration が要る。
