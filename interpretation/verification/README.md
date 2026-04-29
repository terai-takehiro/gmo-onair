# Phase 0 検証スクリプト

要件定義書 第10章「検証ポイント」を実機で検証するためのローカル実行用Pythonスクリプト群。Cloud Run にデプロイせず、開発者のマシンから直接 GCP API を叩く構成。

---

## 検証対象

| # | 検証項目 | スクリプト |
|---|---|---|
| 1 | Vertex AI cacheConfig 無効化が効いているか | `check_vertex_cache.py` |
| 2 | Speech-to-Text V2 (Chirp 3) 日本語精度 + レイテンシ | `test_stt.py` |
| 3 | Gemini 2.5 Flash 翻訳品質 + 用語辞書効果 + first-token レイテンシ | `test_translate.py` |
| 4 | Chirp 3 HD vs Gemini Flash TTS の音質比較 + TTFA | `test_tts.py` |
| 5 | エンドツーエンドレイテンシ実測 (STT→翻訳→TTS) | `test_e2e_latency.py` |

---

## セットアップ

### 1. Python 環境

```bash
cd interpretation/verification
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 2. GCP 認証

```bash
gcloud auth application-default login
gcloud config set project <PROJECT_ID>
```

### 3. 環境変数

```bash
cp .env.example .env
# .env を編集
export $(cat .env | xargs)
```

### 4. サンプル音声の準備

`samples/` に検証用の日本語音声ファイル (.wav, 16kHz mono PCM) を配置する。
- `samples/keynote_30s.wav` — 30秒の登壇音声
- `samples/terminology_60s.wav` — 専門用語・固有名詞を含む60秒
- `samples/qa_120s.wav` — Q&Aセッション 120秒（複数話者）

参考:
```bash
# ffmpeg で他フォーマットから変換
ffmpeg -i input.mp3 -ac 1 -ar 16000 -acodec pcm_s16le samples/keynote_30s.wav
```

---

## 実行例

```bash
# 1. キャッシュ無効化の確認
python check_vertex_cache.py

# 2. STT 精度検証 (Speech Adaptation あり/なしを比較)
python test_stt.py samples/terminology_60s.wav --glossary sample_glossary.json

# 3. 翻訳品質検証
python test_translate.py --src-text "GMOグローバルスタジオの新製品Xを発表します" \
  --target-langs en,th,vi --glossary sample_glossary.json

# 4. TTS 音質比較
python test_tts.py --text "Hello, this is a test." --lang en --voices chirp3,gemini

# 5. エンドツーエンドレイテンシ
python test_e2e_latency.py samples/keynote_30s.wav --target-lang en
```

---

## 出力

各スクリプトは以下を出力:
- 標準出力: 計測結果のサマリ
- `out/` ディレクトリ: TTS音声 (.mp3)、STT結果 JSON、翻訳結果 JSON、レイテンシ計測 CSV

`out/` は gitignore 済み（音声・テキストの永続化を避ける）。

---

## 完了基準

要件定義書 第9章 Phase 0 完了基準:

- [ ] Vertex AI cacheConfig.disableCache = true を確認
- [ ] STT WER（専門用語含むサンプル）が許容範囲内 (< 10% 目標)
- [ ] Gemini 翻訳品質を寺井氏が「実用可」と判断
- [ ] TTS 音質をターゲット言語ごとに「Chirp 3 HD or Gemini Flash TTS」で決定
- [ ] エンドツーエンドレイテンシが 1.5〜3秒の範囲内
