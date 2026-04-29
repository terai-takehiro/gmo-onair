# データ処理ポリシー説明書（テンプレート）

クライアント企業向けに「弊社のリアルタイム多言語同時通訳配信システムでは、貴社の発話・字幕データが AI モデルの学習に利用されません」を証明するためのテンプレート資料。案件ごとに会社名・日付を差し替えて提出する。

---

## 1. 概要

| 項目 | 内容 |
|---|---|
| サービス名 | リアルタイム多言語同時通訳配信システム |
| 提供事業者 | GMO グローバルスタジオ |
| 利用するクラウド | Google Cloud Platform (Google LLC) |
| 処理リージョン | asia-northeast1 (東京) ※ 一部 API は global / us-central1 |
| データ保持 | リアルタイムストリーミング処理。サーバ側で音声・テキストの永続化は行わない |
| 学習除外の根拠 | Google Cloud Service Specific Terms 第 17 条 (Training Restriction) |

---

## 2. データフロー

```
[登壇者マイク]
    │  PCM 16kHz mono (TLS 1.3)
    ▼
[操作画面 (ブラウザ)]
    │  WebSocket (TLS 1.3, JWT 認証)
    ▼
[FastAPI バックエンド (Cloud Run, asia-northeast1)]
    │
    ├─► [Speech-to-Text V2 (Chirp 3)]   音声 → テキスト
    │       data logging: 不参加 (default)
    │
    ├─► [Vertex AI Gemini 2.5 Flash]    日本語 → 各ターゲット言語
    │       cacheConfig.disableCache = true
    │
    └─► [Cloud Text-to-Speech]          テキスト → 音声
            data logging: 不参加 (default)
    │
    ▼
[/stream/{lang} (Cloud Run, vMix 取り込み用)]
```

すべての処理が GCP 内で完結し、第三者サービスを経由しない。

---

## 3. 学習除外の保証

### 3.1 Google Cloud Service Specific Terms 第 17 条 (Training Restriction) 抜粋

> **17.1 Training Restriction.** Google will not use Customer Data to train or fine-tune any AI/ML models without Customer's prior written permission or instruction.
>
> *(参照: https://cloud.google.com/terms/service-terms — 最新版を都度確認)*

### 3.2 各 API の保護設定

| API | 設定 | 確認方法 |
|---|---|---|
| Speech-to-Text V2 | data logging opt-in しない (default) | リクエストペイロードに `dataLoggingOpted: false` を送らない (デフォルト挙動) |
| Vertex AI Gemini | プロジェクトレベル cacheConfig で `disableCache: true` | `GET /v1/projects/<id>/cacheConfig` で検証 |
| Text-to-Speech | data logging opt-in しない (default) | 同上 |

### 3.3 設定証跡

毎回の案件で以下を保管する:

1. `disable-vertex-cache.sh` の実行ログ（`disableCache: true` を含むレスポンス）
2. `cacheConfig` の現在値 (`curl -X GET .../cacheConfig`)
3. Speech-to-Text / TTS リクエストのコード抜粋（`data_logging` フィールドなし or `false`）

---

## 4. データ保持

| データ | 保持場所 | 保持期間 |
|---|---|---|
| 入力音声 PCM | サーバ側で永続化しない (RAM のみ) | セッション中のみ |
| STT 中間テキスト | RAM (ファンアウト後破棄) | セッション中のみ |
| 翻訳テキスト | RAM | セッション中のみ |
| TTS 音声 | RAM (vMix 配信後破棄) | セッション中のみ |
| **メタデータ** (セッション ID / 開始終了時刻 / 言語 / API 使用量) | Cloud SQL (PostgreSQL) | 90 日 |
| **用語辞書プリセット** | Cloud SQL | クライアント明示削除まで |
| 監査ログ | Cloud Logging | 30 日 (Logging 標準) |

ペイロード本体（音声・字幕テキスト）は一切ログに残さない。

---

## 5. 暗号化

- **転送時**: TLS 1.3 (ブラウザ ↔ Cloud Run, Cloud Run ↔ GCP API すべて)
- **保管時**: AES-256 (Google Cloud のデフォルト暗号化、CMEK 対応も可)
- **シークレット**: Google Secret Manager (アクセス制御 + 暗号化)

---

## 6. アクセス権限

| ロール | 権限 |
|---|---|
| 管理者 | プロジェクト全体管理、ユーザー管理、全セッション履歴閲覧 |
| オペレーター | 自身のセッション作成・運用・コスト確認 |
| クライアント | 出力 URL の閲覧のみ (推測困難な session_id ベース限定公開) |
| 弊社開発・運用エンジニア | 障害対応時のみ Cloud Logging メタデータ参照可。ペイロード本体へのアクセス手段なし |

---

## 7. 第三者監査

- Google Cloud は SOC 2 / ISO 27001 / ISO 27017 / ISO 27018 認証取得済み
- 当社が AI モデルへの学習を行わないことは Google の契約上の義務に基づく

---

## 8. 問い合わせ窓口

| 項目 | 内容 |
|---|---|
| 担当部署 | GMO グローバルスタジオ 技術部 |
| 担当者 | 寺井 赳博 |
| メール | (案件ごとに記載) |

---

## 9. 改訂履歴

| バージョン | 日付 | 変更内容 |
|---|---|---|
| 1.0 | 2026-04-29 | 初版テンプレート作成 |

---

## 付録: クライアント提出時のチェックリスト

- [ ] 会社名・案件名・日付を差し替えた
- [ ] 担当窓口メールアドレスを記載した
- [ ] 設定証跡 (cacheConfig レスポンス JSON) を別添した
- [ ] データフロー図 PDF を別添した（必要に応じて）
- [ ] 案件で使用する具体的な言語・モデルを明記した
