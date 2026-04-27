# インタラクティブスタンプ 負荷試験

CoNoHa VPS (現状 2GB / 3core) 上で、インタラクティブスタンプアプリが
1万人同時連打にどこまで耐えられるかを測定するための k6 スクリプト群。

## ファイル

| ファイル | 用途 |
|---|---|
| `stamp-loadtest.js` | k6 メイン負荷試験スクリプト (WebSocket + REST) |
| `run-loadtest.sh` | 試験実行ヘルパー (環境変数を渡して k6 起動) |

## 前提

- k6 が試験実行マシンにインストール済みであること
  - macOS: `brew install k6`
  - Linux: <https://k6.io/docs/get-started/installation/>
- 試験対象の検証環境 (`https://dev.gmo-onair.jp`) にデプロイ済みのコード
  が今回のバッチ集約版 (v2.8.19+) であること
- 試験対象のイベントが事前に作成され、`status='live'` または
  `status='rehearsal'` であること
- 試験は **検証環境のみ** で実施すること。本番環境では絶対に実行しない

## 使い方

```bash
# 1) イベントIDを用意（管理画面で作成 → URLからUUIDを取得）
export TEST_EVENT_ID="00000000-0000-0000-0000-000000000000"

# 2) 試験対象URL
export TEST_BASE_URL="https://dev.gmo-onair.jp"

# 3) 段階的に負荷を上げる（推奨手順）
./scripts/loadtest/run-loadtest.sh 100      # まず100人
./scripts/loadtest/run-loadtest.sh 500      # 次に500人
./scripts/loadtest/run-loadtest.sh 1000     # 1000人
./scripts/loadtest/run-loadtest.sh 3000     # 3000人
./scripts/loadtest/run-loadtest.sh 5000     # 5000人
./scripts/loadtest/run-loadtest.sh 10000    # 最終1万人
```

各段階で `top`/`htop` または ConoHa の管理画面で VPS の CPU/メモリを観察。

## 試験プロファイル

各仮想ユーザーは下記を実行する：

1. `GET /events/:id` — イベント情報取得
2. `POST /events/:id/join` — セッショントークン発行
3. WebSocket で `/interactive` 名前空間に接続
4. **5分間**、ランダム間隔 (平均 200ms = 5タップ/秒) で `stamp` イベントを emit
5. 切断

## 出力指標

k6 が標準で出すもの：
- `vus`: 仮想ユーザー数
- `ws_connecting`/`ws_session_duration`: WebSocket接続状況
- `ws_msgs_sent`/`ws_msgs_received`: 送信/受信メッセージ数
- `http_req_duration`: REST APIのレスポンス時間
- `checks`: チェック合格率（接続成功率など）

カスタム指標:
- `stamp_emit_rate`: タップemit/秒
- `stamp_recv_rate`: stamp:update 受信/秒
- `connect_failed`: 接続失敗数
- `stamp_send_failed`: emit失敗数

## 判定基準

| 指標 | 合格ライン |
|---|---|
| WebSocket接続成功率 | 99% 以上 |
| `http_req_duration` p95 | 1000ms 以下 |
| stamp:update 受信レイテンシ | 2秒以下 (バッチ間隔1秒 + 余裕) |
| VPS CPU使用率 | 80% 以下 |
| VPS メモリ使用率 | 85% 以下 |
| OOM Killer発動 | 0回 |

## VPSメトリクス取得

並行して VPS 側で以下を流すと、コンソールに秒次のメトリクスが出る:

```bash
ssh root@dev.gmo-onair.jp 'while :; do echo "$(date +%H:%M:%S) $(free -m | awk "/Mem:/ {print \"mem=\"\$3\"M/\"\$2\"M\"}") $(top -bn1 | awk "/Cpu/ {print \"cpu=\"100-\$8\"%\"}")"; sleep 2; done'
```
