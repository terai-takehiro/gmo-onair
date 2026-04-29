# リアルタイム多言語同時通訳配信システム 要件定義書

**バージョン**: 1.0
**作成日**: 2026年4月29日
**プロジェクトオーナー**: 寺井 赳博（GMO Global Studio / Technical Coordinator）

---

## 1. プロジェクト概要

### 1.1 目的

プレスカンファレンス・国際イベント向けに、登壇者の音声を起点として複数言語の字幕＋合成音声を同時生成し、配信現場（vMix）に取り込み可能なURLとして出力するクラウドベースのリアルタイム多言語同時通訳配信システムを構築する。

### 1.2 主要ユースケース

- 日本語登壇のプレスカンファレンスを、海外メディア・参加者向けに英語・タイ語・ベトナム語等で同時通訳配信
- vMixに各言語の翻訳URLを取り込み、配信画面にエンベッド（字幕オーバーレイ + 翻訳音声）
- 社外秘・未発表情報を含むカンファレンスを安全に処理（学習データに使われないことが必須）

### 1.3 既存運用との関係

- 現在使用しているサービスのリプレイス兼機能拡張版
- vMixを中核とした既存の配信ワークフローに統合される
- イベント単位（都度）での運用を想定

---

## 2. 主要ユーザー・ステークホルダー

| 役割 | 説明 | アクセス権限 |
|---|---|---|
| オペレーター | 配信現場で操作する技術スタッフ | 認証付き親URL（操作画面）|
| クライアント企業 | カンファレンス主催者・登壇企業 | コンプライアンス資料の確認 |
| vMix（配信機材） | 翻訳URLを取り込んで配信に合成 | 公開URL（限定公開的）|
| 配信視聴者 | YouTube Live等の視聴者 | vMix経由で完成済み配信を視聴 |

---

## 3. システム全体像

### 3.1 アーキテクチャ概要

```
[操作画面 (ブラウザ)]
   - PCマイク入力
   - 用語辞書アップロード
   - コスト監視ダッシュボード
        │
        ▼ (WebSocket: PCM音声ストリーム)
[バックエンド (FastAPI + Redis Pub/Sub)]
        │
        ▼
[STT: Google Cloud Speech-to-Text V2 (Chirp 3)]
        │
        ▼ (部分テキストのストリーム)
[並列ファンアウト]
   ├─ [翻訳: 英語] → [TTS: 英語]
   ├─ [翻訳: タイ語] → [TTS: タイ語]
   └─ [翻訳: ベトナム語] → [TTS: ベトナム語]
        │
        ▼
[言語別出力エンドポイント]
   /stream/en   (透過HTML字幕 + WebAudio音声) → vMixブラウザソースで取り込み
   /stream/th   (同上)
   /stream/vi   (同上)
```

### 3.2 データフロー詳細

1. オペレーターが操作画面でセッション開始 → マイク入力をWebSocket経由でバックエンドに送信
2. バックエンドがSTTにストリーミングリクエスト → 部分文字起こし結果を受信
3. 部分結果が安定（pause検出 or 文末記号）したタイミングで、N言語に並列で翻訳リクエスト
4. 翻訳結果をTTSにストリーミング → 各言語の音声生成
5. 各言語のテキスト＋音声を、対応する `/stream/{lang}` エンドポイントに配信
6. vMixが各URLをブラウザソースとして取り込み → 配信映像に合成
7. セッション中、API消費量を集計してダッシュボードに表示

### 3.3 主要設計判断

- **ストリーミング前提**: STT・翻訳・TTSすべて部分結果を即座に下流に流す（バッファリング最小化）
- **Google Cloud集約**: ベンダー単一化により契約・DPA・データガバナンスを一本化
- **vMix前提のフロントエンド**: HLS/LL-HLS等の視聴者向けスケーラブル配信は不要、vMix1接続前提
- **MVPはYouTube CC送出機能を含めず将来拡張**: 内部APIとして字幕フィードを最初から分離設計しておく

---

## 4. 機能要件

### 4.1 操作画面（Operator UI）

**画面構成**
- ログイン画面（メール/パスワードまたはSSO）
- セッション一覧画面（過去セッション履歴・新規セッション作成）
- ライブ操作画面（メイン画面）

**ライブ操作画面の機能**
- マイク入力デバイス選択（ブラウザのMediaDevices API）
- 入力レベルメーター
- 配信開始/停止ボタン
- 翻訳対象言語のチェックボックス選択（英・タイ・越をデフォルト、中・韓を追加可能）
- 用語辞書プリセットの選択・編集
- 各言語の出力URLの表示（コピー用）・QRコード表示
- リアルタイムでの原文・翻訳文プレビュー（言語ごとにタブ切替）
- API消費量のリアルタイム表示（コスト金額・各サービスの使用量）
- セッション全体経過時間表示

**運用要件**
- セッション中に画面リロードしても再接続可能（セッションIDで復帰）
- 操作ミスでの誤停止を防ぐため、停止時に確認ダイアログ表示

### 4.2 リアルタイム翻訳パイプライン

**入力**
- フォーマット: 16-bit PCM, 16kHz, mono
- 転送: WebSocket（バイナリフレーム）

**処理フロー**
1. STTストリーミング: 部分文字起こし（interim）と確定（final）を受信
2. final結果ごとに、または500〜800ms以上の発話無音区間で部分翻訳をトリガー
3. 翻訳: 各対象言語に並列にLLM APIへリクエスト（用語辞書をシステムプロンプトに注入）
4. 翻訳テキストをTTSにストリーミング送信
5. 生成音声を対応するエンドポイントにWebSocketで配信

**ターゲットレイテンシ（エンドツーエンド）**
- 同時通訳並み: **1.5〜3秒以内**（プロ同時通訳者の遅延 2〜4秒と同等）
- 各レイヤ予算: STT 200〜500ms / 翻訳 first token 300〜500ms / TTS TTFA 200〜500ms / ネットワーク 100〜500ms

**辞書注入の仕組み**
- 翻訳プロンプトに「以下の用語は固定訳を使用すること」として注入
- STT側にもmodel adaptation（Speech Adaptation）の boost フレーズとして渡す
- 例: `{"GMOグローバルスタジオ": "GMO Global Studio", "プロダクト名X": "Product X"}`

### 4.3 多言語並列処理

- 1セッションで最大10言語まで対応可能な設計
- MVPでは英・タイ・越の3言語、設定で中国語（簡体・繁体）・韓国語を追加可能
- 言語追加は設定ファイル変更のみで完結する設計とする
- 各言語パイプラインは独立したasyncタスクで動かし、1言語の障害が他言語に影響しないこと

### 4.4 vMix連携出力

**出力URL仕様**
- URL形式: `https://<domain>/stream/{session_id}/{lang_code}`
- 言語コード: ISO 639-1（en, th, vi, zh, ko）
- 認証: 公開URL（推測困難なsession_id + 言語コード = 限定公開的）

**HTMLオーバーレイ仕様**
- 透過背景（rgba(0,0,0,0)）
- 字幕表示エリア: 画面下部中央、白文字＋黒縁取り、可読性重視
- フォント: 各言語に最適化（タイ語・ベトナム語は専用フォント指定）
- 表示制御: 新しい字幕が来たらフェードイン、一定時間後フェードアウト
- 同時表示行数: 最大2行（古い字幕は上にスライドして消える）

**音声出力**
- HTML内でWebAudio APIを使って自動再生（vMixはChromiumなのでautoplay制約に注意）
- 音声フォーマット: MP3またはOpus、サンプルレート 24kHz以上
- 必要に応じてHTMLパラメータで字幕のみ/音声のみ/両方を切替可能（`?mode=text|audio|both`）

### 4.5 用語辞書管理

**機能**
- イベントごとの用語辞書プリセットの作成・保存・呼び出し
- CSVまたはJSONでの一括インポート/エクスポート
- 各エントリ: 原語（日本語） / 各対象言語の固定訳 / カテゴリ（人名・会社名・製品名・専門用語）
- セッション開始時にプリセットを選択

**データモデル例**
```json
{
  "preset_name": "2026春 製品発表会",
  "entries": [
    {
      "source_ja": "GMOグローバルスタジオ",
      "translations": {"en": "GMO Global Studio", "th": "...", "vi": "..."},
      "category": "company"
    }
  ]
}
```

### 4.6 コスト監視ダッシュボード

- セッション開始時に各APIサービスの使用量スナップショットを取得
- セッション中、リアルタイムで以下を表示
  - STT累計使用時間（分）と推定金額
  - 翻訳トークン使用量と推定金額
  - TTS累計文字数と推定金額
  - インフラコスト（Cloud Run実行時間 等）
  - **合計推定金額（円換算）**
- セッション終了時に最終確定値をDBに記録、過去セッション履歴で参照可能
- 月次集計レポート（CSV出力）

### 4.7 認証・アクセス制御

- 操作画面: メール/パスワードまたはSSO（Google Workspace連携を将来検討）
- 翻訳出力URL: 推測困難なsession_id + 言語コードで限定公開
- 管理者ロール: ユーザー管理・全セッション履歴閲覧・全コスト集計
- 一般ユーザー: 自身のセッション作成・操作・コスト確認

---

## 5. 非機能要件

### 5.1 レイテンシ

| 区間 | 目標 |
|---|---|
| エンドツーエンド（マイク入力 → vMix表示） | 1.5〜3秒 |
| STT first partial | 200〜500ms |
| 翻訳 first token | 300〜500ms |
| TTS time-to-first-audio | 200〜500ms |

### 5.2 同時セッション・視聴者数

- 同時セッション数: 通常 1〜2、最大 10（複数イベント並行開催時）
- 各セッションの視聴者数: 1言語あたり10〜20人想定（vMixが1接続するのみ + オペレーターの確認用）
- スケーラブル配信（HLS等）は不要

### 5.3 可用性

- イベント開催中の安定稼働が必須（ダウンタイムは事故レベル）
- 自動再接続機能（ネットワーク瞬断時）
- 各APIサービスの障害検知・通知
- フェイルオーバー: MVPでは単一リージョン、Phase 3以降でリージョン冗長検討

### 5.4 データプライバシー・コンプライアンス

**最重要要件**
- **すべての音声・テキストデータがAIモデルの学習に使用されないこと**
- 社外秘・未発表情報を扱う前提

**実現方法**
- Google Cloud Service Specific Terms Section 17「Training Restriction」に基づく
- Vertex AI: キャッシング無効化API呼び出し（zero data retentionモード相当）
- Speech-to-Text: data logging opt-inしない（デフォルト）
- TTS: 同上

**コンプライアンス対応**
- データフロー図・データ処理ポリシー説明書（A4 1〜2枚）をテンプレート化
- 案件ごとに会社名・日付差し替えで提出可能にする

### 5.5 セキュリティ

- HTTPS必須（TLS 1.3）
- APIキーはシークレットマネージャ（Google Secret Manager）で管理、コード内ハードコード禁止
- セッションIDは推測困難なUUID v4以上
- 操作画面はパスワード認証 + 将来的にMFA検討

---

## 6. 技術スタック

### 6.1 採用技術一覧

| レイヤ | 採用技術 | 備考 |
|---|---|---|
| フロントエンド（操作画面）| Next.js 15+ (App Router) + TypeScript + Tailwind CSS | shadcn/ui推奨 |
| フロントエンド（出力URL）| 軽量HTML + Vanilla JS or Vite | vMix Chromium最適化 |
| バックエンド | Python 3.12+ FastAPI | WebSocket + asyncio |
| メッセージング | Redis Pub/Sub (Google Memorystore) | 言語別ファンアウト |
| データストア | Cloud SQL (PostgreSQL) | セッション履歴・用語辞書・ユーザー |
| 認証 | Supabase Auth または Auth0 | SSO拡張余地 |
| STT | Google Cloud Speech-to-Text V2 (Chirp 3) | streaming endpoint |
| 翻訳 | Vertex AI Gemini 2.5 Flash | streaming response |
| TTS | Google Cloud TTS (Chirp 3 HD or Gemini 3.1 Flash TTS) | streaming endpoint |
| インフラ | Google Cloud Run + Memorystore + Cloud SQL | 東京リージョン候補 |
| シークレット管理 | Google Secret Manager | |
| ログ・監視 | Google Cloud Logging + Monitoring | |
| CI/CD | GitHub Actions → Cloud Run deploy | |

### 6.2 各APIサービス選定理由

**STT: Google Cloud Speech-to-Text V2 (Chirp 3)**
- データロギング opt-in しない限り学習・保存されない（デフォルト保護）
- ストリーミングAPI対応、多言語、東京リージョン処理可能
- 将来的にレイテンシ要件で不足が判明したらDeepgram Nova-3への差し替えを検討

**翻訳: Vertex AI Gemini 2.5 Flash**
- Service Specific Terms Section 17で学習禁止が明文化
- システムプロンプトで用語辞書注入が容易
- ストリーミングレスポンス対応
- in-memoryキャッシング無効化APIで完全ZDR化

**TTS: Google Cloud TTS**
- 同様の学習除外ポリシー
- Chirp 3 HD: 75+言語、安定品質
- Gemini 3.1 Flash TTS: 70+言語、200+の audio tag による表現制御
- 言語ごとに最適なモデルを選択可能

### 6.3 学習除外・データ保持ポリシー設定

**Vertex AI（翻訳）必須設定**
```bash
# キャッシング無効化（プロジェクトレベル）
curl -X PATCH \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "Content-Type: application/json" \
  https://us-central1-aiplatform.googleapis.com/v1/projects/PROJECT_ID/cacheConfig \
  -d '{"name": "projects/PROJECT_ID/cacheConfig", "disableCache": true}'
```

**Speech-to-Text/TTS**
- data logging opt-in しない（デフォルトで学習除外）
- v2 API使用、データレジデンシ設定可能

---

## 7. 対応言語

### 7.1 ソース言語

- 日本語（ja）固定（MVP）
- 将来的に英語ソースも対応可能な設計

### 7.2 ターゲット言語

| 言語 | コード | MVP | 備考 |
|---|---|---|---|
| 英語 | en | ✓ | |
| タイ語 | th | ✓ | フォント対応必須 |
| ベトナム語 | vi | ✓ | フォント対応必須 |
| 中国語（簡体） | zh-CN | 設定追加で対応 | |
| 中国語（繁体） | zh-TW | 設定追加で対応 | |
| 韓国語 | ko | 設定追加で対応 | |

### 7.3 言語追加方法

設定ファイル（YAML or JSON）に新言語エントリを追加するだけで対応できる構造とする：

```yaml
languages:
  th:
    name: タイ語
    locale: th-TH
    tts_voice: th-TH-Chirp3-HD-Aoede
    font_family: "Noto Sans Thai"
    subtitle_max_chars_per_line: 60
```

---

## 8. スコープ管理

### 8.1 MVPスコープ（Phase 1〜2で実装）

- 操作画面（ログイン・セッション管理・ライブ操作）
- STT → 翻訳 → TTS リアルタイムパイプライン
- 多言語並列処理（英・タイ・越の3言語）
- vMix用透過HTMLオーバーレイURL × 言語数
- 用語辞書（イベント単位プリセット）の作成・編集・適用
- API消費コストダッシュボード（リアルタイム + 履歴）
- 認証付き親URL + 公開（限定）翻訳URL
- 中国語・韓国語の設定追加対応（コードベースは多言語化済み）

### 8.2 将来拡張（Out of Scope だが設計余地は残す）

- **YouTube Live CC POST 連携** ─ 内部APIとして「言語別字幕テキストフィード」を最初から実装し、後から接続できるようにする
- **YouTube Live 言語別マルチ配信対応** ─ vMix側の運用と組み合わせて言語別チャンネル配信
- オペレーター手動修正機能（誤訳・誤認識のリアルタイム上書き）
- アーカイブ機能（録画・字幕データの長期保存）
- 自動議事録生成
- リージョン冗長・マルチリージョンフェイルオーバー
- カスタムTTSボイスクローニング（各クライアントブランドボイス）

### 8.3 明示的にやらないこと

- 視聴者向けのスケーラブル配信（HLS/LL-HLS等）
- vMix以外の配信ツールへの最適化
- オフライン処理・録画ファイルからのバッチ処理（リアルタイム専用）

---

## 9. 実装フェーズ

### Phase 0: 検証（1〜2週間）

**目的**: 技術選定の前提を実機で検証

タスク:
- GCPプロジェクト作成、Vertex AI / Speech-to-Text / TTS 有効化
- Vertex AI のキャッシング無効化設定とその動作確認
- Chirp 3 STTで日本語登壇音声サンプルの精度検証（Speech Adaptation 有/無）
- Gemini 2.5 Flash翻訳の品質検証（用語辞書注入の効果確認）
- Chirp 3 HD と Gemini 3.1 Flash TTS の音質比較（特にタイ語・ベトナム語）
- エンドツーエンドレイテンシの実測（1言語パイプラインで仮実装）

**完了基準**: 技術選定が確定し、Phase 1の見積もりが固まる

### Phase 1: MVP コア（2〜4週間）

**目的**: 1言語（日→英）で動くフルパイプラインを構築

タスク:
- リポジトリ構成・CI/CD・GCPインフラのIaC（Terraform推奨）
- バックエンド: FastAPI + WebSocket + STT/翻訳/TTSパイプライン
- フロントエンド: 操作画面の基本UI（マイク入力・開始停止・URLコピー）
- 出力URL: 透過HTMLオーバーレイ（字幕 + 音声）
- vMixでの取り込み確認
- 基本的な認証（Supabase Authなど）

**完了基準**: 寺井さんが操作画面で日本語を話し、英語のvMixオーバーレイが動く

### Phase 2: 多言語化・運用機能（2〜3週間）

タスク:
- N言語並列パイプラインへの拡張（3言語：英・タイ・越）
- 用語辞書管理UI・データモデル・適用ロジック
- コスト監視ダッシュボード
- セッション履歴・管理画面
- 設定ファイル化された言語追加機構
- エラーハンドリング・自動再接続
- 内部API: 言語別字幕テキストフィード（YouTube CC将来連携用）

**完了基準**: 3言語同時運用 + 用語辞書 + コスト確認ができる

### Phase 3: 本番投入と改善（継続）

タスク:
- 実イベントでの試験運用
- レイテンシ・品質チューニング
- 運用フィードバック反映
- コンプライアンス資料テンプレート整備
- 中国語・韓国語の設定追加
- 将来拡張（YouTube CC連携・オペレーター介入機能）の判断

**目安**: Phase 0 〜 Phase 2 完了で **約2〜2.5ヶ月**

---

## 10. 検証ポイント

実装中に必ず確認すべき項目：

1. **Vertex AI キャッシング無効化が実際に動作しているか** ─ APIレスポンスヘッダや課金詳細で確認
2. **Speech-to-Text v2 が日本語登壇音声で十分な精度を出すか** ─ 専門用語・固有名詞含むサンプルでWER測定
3. **Gemini 2.5 Flash の翻訳品質と用語辞書注入の効果** ─ プロ翻訳者によるサンプル評価
4. **TTS 音質**: Chirp 3 HD vs Gemini 3.1 Flash TTS、各ターゲット言語で比較
5. **エンドツーエンドレイテンシが目標範囲（1.5〜3秒）に収まるか**
6. **vMix Chromium での autoplay 制約回避**（ユーザーインタラクション要否確認）
7. **同時10セッション運用時のリソース・コスト・レイテンシの劣化具合**

---

## 11. コスト試算

### 11.1 1時間イベント・3言語の場合（GCP集約構成）

| 項目 | 推定金額 |
|---|---|
| STT (Cloud Speech-to-Text Chirp 3) 60分 | 約 $1.0 |
| 翻訳 (Vertex AI Gemini 2.5 Flash × 3言語) 60,000文字 | 約 $0.1 |
| TTS (Cloud TTS Chirp 3 HD × 3言語) 60,000文字 | 約 $1.0 |
| インフラ (Cloud Run + Memorystore) | 約 $0.5 |
| **合計** | **約 $2.5〜4.0（≒400〜600円）** |

### 11.2 月次運用コスト想定

- イベント本数: 月10本想定 → API消費 **約4,000〜6,000円**
- インフラ固定費（Cloud SQL, Memorystore等の常時起動分）: **月 約5,000〜10,000円**
- **月次合計目安: 約10,000〜20,000円**

※ 実測で大きく変動する可能性あり、Phase 0で精度向上

---

## 12. コンプライアンス資料

クライアント企業からの「学習されていないか」という確認に対応するため、以下のテンプレート資料を準備する：

### 12.1 提供する説明資料

1. **データフロー図** ─ マイク入力からvMix出力までの経路、すべてGCP内処理であることを明示
2. **Google Cloud Service Specific Terms Section 17 抜粋** ─ 「Training Restriction」の明文（顧客の事前許可なく学習・ファインチューニングに使用しない）
3. **設定証跡** ─ Vertex AI のキャッシング無効化API呼び出しログ、Speech-to-Text/TTS のロギング opt-out 設定スクリーンショット
4. **データ処理ポリシー説明書（A4 1〜2枚）** ─ 案件ごとに会社名・日付差し替え可能なテンプレート

### 12.2 説明書テンプレートの記載項目

- 処理ベンダー（Google LLC）
- 処理リージョン
- データ保持期間（ストリーミング処理：保存なし）
- 学習除外の根拠（Section 17）
- 暗号化（TLS 1.3 in transit, AES-256 at rest）
- アクセス権限管理
- 問い合わせ窓口

---

## 13. 参考リンク

- Google Cloud Speech-to-Text V2: https://cloud.google.com/speech-to-text/v2/docs
- Google Cloud Text-to-Speech: https://cloud.google.com/text-to-speech/docs
- Vertex AI Gemini API: https://cloud.google.com/vertex-ai/generative-ai/docs
- Vertex AI Zero Data Retention: https://cloud.google.com/vertex-ai/generative-ai/docs/learn/security/zero-data-retention
- Google Cloud Service Specific Terms: https://cloud.google.com/terms/service-terms
- vMix Browser Source Documentation: https://www.vmix.com/help26/BrowserInput.html
- YouTube Live CC API（将来拡張用）: https://support.google.com/youtube/answer/3068031

---

## 14. 実装上の注意事項（Claude Codeへの指示）

### 14.1 開発の進め方

- **Phase 0から順番に実装すること**（フェーズスキップ禁止）
- 各Phase完了時にオペレーター（寺井氏）と動作確認を行う
- 大規模な技術選定の変更は事前に相談すること

### 14.2 コーディング規約

- バックエンド: Python 3.12+, type hints必須, Ruff + mypy
- フロントエンド: TypeScript strict mode, ESLint + Prettier
- コミットメッセージ: Conventional Commits
- ブランチ戦略: GitHub Flow（main + feature branch）

### 14.3 セキュリティ・プライバシー実装の必須事項

- **APIキーをコード・リポジトリにコミットしない** ─ Google Secret Manager 経由で取得
- **Vertex AI 呼び出し時は明示的にキャッシング無効化を確認すること**
- **Speech-to-Text / TTS リクエストで data logging opt-in しないこと**
- **すべてのAPIレスポンスをログに残さない**（ペイロード本体は除外、メタデータのみ）
- **音声・テキストデータをサーバ側で永続化しない**（リアルタイム処理のみ）

### 14.4 設計上の必須事項

- 言語追加が設定変更だけで完結する構造
- 内部APIとして「言語別字幕テキストフィード」を最初から分離（YouTube CC将来連携のため）
- セッション復帰可能（リロードしても継続）
- エラーログ・APIコスト集計はGCP内に閉じる

### 14.5 テスト要件

- ユニットテスト: コアロジック（翻訳呼び出し・用語辞書適用・コスト計算）
- 統合テスト: STT→翻訳→TTSパイプラインのモック化テスト
- E2Eテスト: Phase 2完了時に主要シナリオを自動化
- 負荷テスト: 同時10セッション想定の負荷検証

### 14.6 ドキュメンテーション

- README.md: セットアップ手順
- ARCHITECTURE.md: システム構成図と設計判断
- DEPLOYMENT.md: GCPリソース構成とデプロイ手順
- COMPLIANCE.md: クライアント説明用のデータ処理ポリシー
- 各APIエンドポイントのOpenAPI仕様書

---

## 15. 改訂履歴

| バージョン | 日付 | 変更内容 |
|---|---|---|
| 1.0 | 2026-04-29 | 初版作成 |
