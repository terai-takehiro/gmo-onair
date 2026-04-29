# Load Test

REQUIREMENTS §10.7 「同時 10 セッション運用時のリソース・コスト・レイテンシ」を実機で測るための [locust](https://locust.io/) シナリオ。

---

## ディレクトリ構成

```
load-test/
├── README.md
├── requirements.txt
├── locustfile.py         # 2 シナリオ: RestUser / AudioWsUser
├── auth_helpers.py       # login / create_session / end_session の薄ラッパ
├── scripts/
│   └── generate-silent-pcm.py
└── samples/              # 生成された .pcm を置く (gitignore)
```

---

## セットアップ

```bash
cd interpretation/load-test
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 60 秒のサイレント PCM (16kHz mono LINEAR16) を生成
python scripts/generate-silent-pcm.py --seconds 60 --out samples/silence_60s.pcm

# 専用ロードテストユーザを backend 側で作成
docker exec interp-app python -m scripts.bootstrap_user \
  --email loadtest@example.com --role operator
```

---

## 実行

### dev 環境に対するスモーク (1 ユーザ)

```bash
LOAD_TEST_EMAIL=loadtest@example.com LOAD_TEST_PASSWORD=... \
  locust -f locustfile.py \
    --host https://dev.example.com \
    -u 1 -r 1 --run-time 60s --headless --print-stats
```

### 同時 10 セッション (REQUIREMENTS §10.7 ターゲット)

```bash
LOAD_TEST_EMAIL=loadtest@example.com LOAD_TEST_PASSWORD=... \
LOAD_TEST_PCM_FILE=samples/silence_60s.pcm \
  locust -f locustfile.py \
    --host https://dev.example.com \
    -u 10 -r 1 --run-time 5m
```

### scenario 切替

`locustfile.py` には `RestUser` と `AudioWsUser` の 2 つを定義してある。
両方 spawn したくない場合は `--class-picker` か Web UI で選択する。

---

## 想定ベースライン (dev 環境)

| メトリクス | 目標 |
|---|---|
| `RestUser` POST /sessions p95 | < 600 ms |
| `RestUser` GET /cost p95 | < 200 ms |
| `AudioWsUser` 接続数 (同時) | 10 まで安定 |
| Cloud Run CPU 使用率 (10 ユーザ) | < 70% |
| Cloud Run メモリ | < 400 MiB / instance |

`AudioWsUser` は無音 PCM を送るので Cloud TTS / Vertex 課金は最小限
(STT は流れるが final が出ないため翻訳・TTS が発火しない)。実際の発話
シナリオは Phase 0 verification の `test_e2e_latency.py` を併用する。

---

## 結果の見方

- locust Web UI で p50 / p95 / p99 を確認
- 並行で `gcloud monitoring metrics list` または Cloud Console
  Monitoring > Cloud Run の standard metrics で resource 推移を観察
- 5xx が立て続けに出たら Cloud Logging で同 `request_id` を辿る
  (X-Request-Id をレスポンスに echo する設定済み)
- アラートポリシー (terraform/monitoring.tf) が発報したら原因を要確認

---

## 注意

- 本番環境への負荷テストは原則禁止 (DB 圧迫、コスト発生)。dev 環境のみで実施
- 実音声を流すシナリオはコスト試算 (REQUIREMENTS §11) を踏まえて慎重に
- locust master ノードがボトルネックになる場合は `--worker` 分散モード
