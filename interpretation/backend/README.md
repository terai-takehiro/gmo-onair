# Interpretation Backend

リアルタイム多言語同時通訳配信システムのバックエンド。FastAPI + asyncio + WebSocket + Redis Pub/Sub で構成。

> Phase 1 で 1 言語パイプライン (日 → 英) MVP を実装し、Phase 2 で N 言語並列・用語辞書・コスト DB へ拡張する。現在は **Phase 1 スケルトン**段階。

---

## ディレクトリ構成

```
backend/
├── pyproject.toml
├── README.md
├── Dockerfile
├── .env.example
├── app/
│   ├── main.py              # FastAPI entrypoint
│   ├── config.py            # 設定 (pydantic-settings)
│   ├── languages.yaml       # ターゲット言語の設定
│   ├── languages.py         # languages.yaml ローダ
│   ├── auth.py              # JWT 検証
│   ├── api/
│   │   ├── sessions.py      # REST: セッション CRUD
│   │   ├── glossaries.py    # REST: 用語辞書 CRUD
│   │   ├── stream_ws.py     # WS: オペレーター → STT 入力
│   │   └── output_ws.py     # WS: vMix 用言語別出力 (字幕+音声)
│   ├── pipeline/
│   │   ├── orchestrator.py  # セッション全体のコーディネータ
│   │   ├── stt.py           # Speech-to-Text V2 streaming
│   │   ├── translator.py    # Vertex AI Gemini fanout
│   │   ├── tts.py           # Cloud TTS streaming
│   │   └── pubsub.py        # Redis Pub/Sub
│   ├── models/schemas.py    # pydantic スキーマ
│   └── db/                  # SQLAlchemy / Alembic
└── tests/
```

---

## ローカル開発

```bash
cd interpretation/backend
python3.12 -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'

cp .env.example .env
# .env を編集

uvicorn app.main:app --reload --port 8080
```

Swagger UI: http://localhost:8080/docs

ヘルスチェック: `curl http://localhost:8080/health`

---

## 環境変数

`.env.example` 参照。実値は GCP Secret Manager から起動時にロードする想定（`config.py` で対応）。ローカル開発では `.env` で済ませる。

---

## Docker

```bash
docker build -t interp-backend:dev .
docker run --rm -p 8080:8080 --env-file .env interp-backend:dev
```

Cloud Run へは GitHub Actions で push する（`/.github/workflows/` は別途追加）。

---

## テスト

```bash
pytest                    # ユニット + 統合
ruff check app tests
mypy app
```

外部 API（STT / Vertex / TTS）は `respx` でモックする。実機検証は `interpretation/verification/` のスクリプト群を使う。

---

## 設計

詳細: `interpretation/docs/ARCHITECTURE.md`
