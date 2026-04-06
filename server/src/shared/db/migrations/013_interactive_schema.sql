-- EventStamp (インタラクティブ演出) スキーマ
-- イベント: ライブ配信・番組収録時のリアルタイムスタンプ演出

CREATE TABLE IF NOT EXISTS interactive_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(500) NOT NULL,
  description TEXT,
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'live', 'ended', 'archived')),
  project_id UUID REFERENCES projects(id),
  episode_id UUID REFERENCES episodes(id),
  config JSONB DEFAULT '{}',
  audience_url TEXT,
  max_connections INT DEFAULT 1000,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- スタンプボタン定義 (各イベントに複数)
CREATE TABLE IF NOT EXISTS interactive_stamps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES interactive_events(id) ON DELETE CASCADE,
  label VARCHAR(100) NOT NULL,
  emoji VARCHAR(20) DEFAULT '',
  color VARCHAR(20) DEFAULT '#e11d48',
  animation VARCHAR(50) DEFAULT 'bounce',
  sound_url TEXT,
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- スタンプ集計 (1分バケット単位で集約)
CREATE TABLE IF NOT EXISTS interactive_stamp_counts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stamp_id UUID NOT NULL REFERENCES interactive_stamps(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES interactive_events(id) ON DELETE CASCADE,
  count INT DEFAULT 0,
  bucket_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 視聴者セッション (匿名)
CREATE TABLE IF NOT EXISTS interactive_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES interactive_events(id) ON DELETE CASCADE,
  session_token VARCHAR(64) UNIQUE NOT NULL,
  nickname VARCHAR(50),
  user_agent TEXT,
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  disconnected_at TIMESTAMPTZ
);

-- オーバーレイテンプレート
CREATE TABLE IF NOT EXISTS interactive_overlay_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) DEFAULT 'stamp_counter' CHECK (type IN ('stamp_counter', 'ticker', 'bar_chart', 'floating')),
  config JSONB DEFAULT '{}',
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_interactive_events_status ON interactive_events(status);
CREATE INDEX IF NOT EXISTS idx_interactive_events_project ON interactive_events(project_id);
CREATE INDEX IF NOT EXISTS idx_interactive_events_episode ON interactive_events(episode_id);
CREATE INDEX IF NOT EXISTS idx_interactive_stamps_event ON interactive_stamps(event_id);
CREATE INDEX IF NOT EXISTS idx_interactive_stamp_counts_event ON interactive_stamp_counts(event_id);
CREATE INDEX IF NOT EXISTS idx_interactive_stamp_counts_bucket ON interactive_stamp_counts(bucket_at);
CREATE INDEX IF NOT EXISTS idx_interactive_sessions_event ON interactive_sessions(event_id);
CREATE INDEX IF NOT EXISTS idx_interactive_sessions_token ON interactive_sessions(session_token);
