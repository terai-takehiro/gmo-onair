# ARCHITECTURE — システム構成と設計判断

要件定義書 (`REQUIREMENTS.md`) を実装ベースに落とし込んだ詳細設計。Phase 0 ではインフラ層のみを構築し、ここに記載した全体像は Phase 1 / Phase 2 で順次実装する。

---

## 1. 全体像

```
┌──────────────────────────────────────────────────────┐
│  オペレーターブラウザ (Next.js, /operator)           │
│  - マイク入力 (MediaDevices API)                     │
│  - WebSocket: PCM 16kHz mono                         │
└────────────────┬─────────────────────────────────────┘
                 │ WSS (TLS 1.3, JWT)
                 ▼
┌──────────────────────────────────────────────────────┐
│  Cloud Run: backend (FastAPI + uvicorn)              │
│  ┌────────────────────────────────────────────────┐  │
│  │ Session Orchestrator                          │  │
│  │  - WebSocket ingress                          │  │
│  │  - Session state (in-mem)                     │  │
│  └──────────┬─────────────────────────────────────┘  │
│             ▼                                        │
│  ┌────────────────────────────────────────────────┐  │
│  │ STT Streamer  (Speech-to-Text V2 / Chirp 3)   │  │
│  │  - Speech Adaptation (boost phrases from glossary)│
│  └──────────┬─────────────────────────────────────┘  │
│             │ partial / final transcript            │
│             ▼                                        │
│  ┌────────────────────────────────────────────────┐  │
│  │ Translation Fanout (asyncio.gather)            │  │
│  │  - Vertex AI Gemini 2.5 Flash (streaming)     │  │
│  │  - System prompt = glossary injection         │  │
│  └──────────┬─────────────────────────────────────┘  │
│             │ per-language token stream             │
│             ▼                                        │
│  ┌────────────────────────────────────────────────┐  │
│  │ TTS Streamer (Chirp 3 HD / Gemini Flash TTS)  │  │
│  └──────────┬─────────────────────────────────────┘  │
│             ▼                                        │
│  ┌────────────────────────────────────────────────┐  │
│  │ Pub/Sub Publisher (Memorystore Redis)         │  │
│  │   channel: stream:{session}:{lang}            │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
                                   │
                                   │ Pub/Sub
                                   ▼
┌──────────────────────────────────────────────────────┐
│  Cloud Run: backend (同インスタンス or別Service)     │
│  /stream/{session}/{lang}  → vMix 用 HTML            │
│   - WebSocket subscribe                              │
│   - 透過 HTML + WebAudio                             │
└──────────────────────────────────────────────────────┘
```

データストア:

- **Cloud SQL (PostgreSQL)**: ユーザー、セッション履歴、用語辞書プリセット、API 使用量サマリ
- **Memorystore (Redis)**: 言語別ファンアウト Pub/Sub。永続化なし
- **Secret Manager**: DB password / JWT secret / Auth keys

---

## 2. レイテンシ予算

| 区間 | 目標 | 手法 |
|---|---|---|
| マイク → バックエンド | 50〜150ms | WebSocket バイナリ・小さい frame size (20ms) |
| STT first partial | 200〜500ms | Chirp 3 streaming + interim_results=true |
| 翻訳 first token | 300〜500ms | Gemini 2.5 Flash streaming, 短い system prompt |
| TTS time-to-first-audio | 200〜500ms | streaming synthesize |
| バックエンド → vMix | 100〜500ms | Pub/Sub fanout + WebSocket push |
| **エンドツーエンド合計** | **1.5〜3秒** | 上記累積 |

---

## 3. 主要コンポーネント

### 3.1 Session Orchestrator

責務:
- WebSocket 接続のライフサイクル管理
- セッション ID 採番 (UUID v4)
- 用語辞書ロード（Cloud SQL → メモリキャッシュ）
- 各言語パイプライン (asyncio.Task) の起動・監視・停止

セッション復帰: クライアントがリロード時に `session_id` を再送 → サーバ側で同セッションの Pub/Sub channel を再購読。

### 3.2 STT Streamer

- **API**: Speech-to-Text V2 streaming
- **Recognizer**: 日本語 (`ja-JP`)、`Chirp_3` モデル
- **Speech Adaptation**: 用語辞書をフレーズセットとして boost
- **発話区切り判定**: STT の `is_final` を一次トリガ、補助として 500〜800ms の無音区間で部分トリガ
- **データロギング**: opt-in しない (default)

### 3.3 Translation Fanout

```python
# 概念コード
async def translate_all(text: str, target_langs: list[str], glossary: Glossary):
    tasks = [
        translate_one(text, lang, glossary) for lang in target_langs
    ]
    return await asyncio.gather(*tasks, return_exceptions=True)
```

- 1 言語の障害を他言語に伝播させない (`return_exceptions=True`)
- Vertex AI 呼び出し時は `cacheConfig.disableCache = true` がプロジェクトで有効
- system prompt:
  - 翻訳ロール定義
  - 用語辞書（"X は必ず Y と訳す" 形式で投入）
  - 言語ごとのスタイル指針（敬体・字幕向け短文化）

### 3.4 TTS Streamer

- **API**: Cloud Text-to-Speech (Phase 0 で Chirp 3 HD vs Gemini Flash TTS を比較)
- **言語ごとのボイス**: 設定ファイル (`config/languages.yaml`) で定義
- **フォーマット**: MP3 24kHz もしくは Opus
- **データロギング**: opt-in しない

### 3.5 Output Endpoint (`/stream/{session}/{lang}`)

- 単一の HTML ページ (Vite ビルド済み静的ファイル)
- パラメータ: `?mode=text|audio|both` (default: both)
- 透過背景, 字幕は下部中央, フェード・スライドアニメーション, 最大 2 行
- WebAudio で MP3/Opus バッファをデコード再生
- vMix Chromium での autoplay 対応: 接続時に短い無音 buffer を流して context を unlock
- 公開（限定）: 推測困難 UUID (32+ chars) を URL に含む。認証ヘッダなしで動く

---

## 4. データモデル (Phase 1+ で migration)

### 4.1 PostgreSQL スキーマ概略

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  display_name TEXT,
  role TEXT NOT NULL CHECK (role IN ('admin','operator')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE glossary_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_user_id UUID REFERENCES users(id),
  entries JSONB NOT NULL,    -- [{source_ja, translations:{en,th,vi}, category}]
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_user_id UUID REFERENCES users(id),
  glossary_preset_id UUID REFERENCES glossary_presets(id),
  target_languages TEXT[] NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  status TEXT NOT NULL,      -- 'live', 'ended', 'aborted'
  client_meta JSONB
);

CREATE TABLE session_costs (
  session_id UUID REFERENCES sessions(id),
  service TEXT NOT NULL,     -- 'stt','translate','tts','infra'
  units NUMERIC NOT NULL,    -- minutes / chars / tokens
  unit_label TEXT NOT NULL,
  amount_jpy NUMERIC NOT NULL,
  PRIMARY KEY (session_id, service)
);
```

ペイロード本体（音声・字幕テキスト）は永続化しない。

### 4.2 言語設定 (`config/languages.yaml`)

```yaml
languages:
  en:
    name: 英語
    locale: en-US
    tts_voice: en-US-Chirp3-HD-Aoede
    font_family: "Inter, system-ui, sans-serif"
    subtitle_max_chars_per_line: 80
  th:
    name: タイ語
    locale: th-TH
    tts_voice: th-TH-Chirp3-HD-Aoede
    font_family: "Noto Sans Thai"
    subtitle_max_chars_per_line: 60
  vi:
    name: ベトナム語
    locale: vi-VN
    tts_voice: vi-VN-Chirp3-HD-Aoede
    font_family: "Noto Sans Vietnamese, Inter"
    subtitle_max_chars_per_line: 70
```

言語追加 = この YAML にエントリを足すだけ。

---

## 5. セキュリティ

- **転送**: TLS 1.3 (Cloud Run マネージド)
- **WebSocket 認証**: JWT (HS256)、操作画面ログイン時に発行、WebSocket open 時に subprotocol で送信
- **出力 URL**: 推測困難 session_id (UUID v4) ベースで限定公開。認証なしで動くが URL を知る vMix のみ取り込み可能
- **シークレット**: Secret Manager から起動時にロード、メモリ上のみ
- **APIキー禁止**: Vertex AI / STT / TTS は SA 経由 (`google-cloud-aiplatform`, `google-cloud-speech`, `google-cloud-texttospeech` SDK)

---

## 6. 監視・ログ

- **メタデータログのみ**: セッション ID / 言語 / 経過時間 / API 呼び出しカウント
- **ペイロード本体はログ禁止** (音声バイト・字幕テキスト)
- Cloud Logging + Monitoring + Cloud Trace
- アラート: Cloud Run エラー率 / WebSocket 切断率 / API 失敗率

---

## 7. 設計判断

| 判断 | 理由 |
|---|---|
| GCP 単一ベンダー | DPA 一本化、契約・コンプライアンス資料の単純化 |
| Memorystore Pub/Sub (Redis) を採用 | Cloud Pub/Sub よりレイテンシが低く (<10ms) ファンアウト用途に十分 |
| Cloud Run (asyncio FastAPI) | WebSocket + 言語並列が asyncio で素直に書ける、コスト効率良 |
| HLS/LL-HLS 不採用 | vMix 1 接続前提なのでスケーラブル配信は不要 |
| YouTube CC 連携を Phase 1 で入れない | 最初は字幕テキストフィードを内部 API として分離設計 → 後付けで OK |
| Cloud SQL (Postgres) | ONAiR ファミリで実績、JSONB で用語辞書を素直に格納 |
| Vertex AI cacheConfig disable | Service Specific Terms 17 と組み合わせて学習除外を二重保証 |

---

## 8. Phase 別マイルストーン

| Phase | 期間 | 成果物 |
|---|---|---|
| **Phase 0** (今) | 1〜2 週 | GCP プロジェクト + Terraform IaC + 検証スクリプト + コンプラ資料テンプレ |
| Phase 1 | 2〜4 週 | 1 言語パイプライン (日 → 英) MVP、操作画面、vMix 取り込み確認 |
| Phase 2 | 2〜3 週 | 3 言語化、用語辞書 UI、コスト DB、字幕テキストフィード API |
| Phase 3 | 継続 | 実イベント運用、品質チューニング、CC 連携検討 |

詳細は `REQUIREMENTS.md` 第 9 章参照。
