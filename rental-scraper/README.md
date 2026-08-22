# レンタル機材DB化プロジェクト（スクレイパー）

映像機材レンタル会社2社（東京オフラインセンター／レスター）の機材ページを毎朝クロールし、
SQLite（`rental_items.db`）にステージングした上で、GMO ONAiR 本体アプリの PostgreSQL
（`qsheet_rental_items`）へ同期する。GMO ONAiR「制作技術支援」の中のミニアプリ
**「レンタル機材検索」**（`client-qsheet/src/pages/rental/`）が検索対象にするデータの
取り込み元がこれ。モックアップ段階の仕様は
[docs/design/v4/rental-search/README.md](../docs/design/v4/rental-search/README.md) を参照。

## 何をするものか

```
東京オフラインセンター (toc_scraper.py) ─┐
                                          ├→ rental_items.db (SQLite・ステージング)
レスター (restar_scraper.py)      ───────┘        │
                                                    ▼
                                    sync_to_postgres.py
                                                    │
                                                    ▼
                              本体アプリ Postgres の qsheet_rental_items
```

- **`common_db.py`** — SQLite 側の共通スキーマ・upsert 処理。主キーは `(company, item_id)`。
  2社は別会社として必ず `company` 列で区別する（同じ数値IDが両社に存在しても別商品）。
  値が変わったら `change_log` に差分を記録し、今回のクロールで見つからなかった商品は
  `status=missing`（掲載終了の可能性）として記録する。
- **`toc_scraper.py`** — 東京オフラインセンター (`ec.toc-net.jp`) のカテゴリ一覧から商品IDを収集し、
  商品詳細ページを1件ずつ取得してパースする。
- **`restar_scraper.py`** — レスター (`restargp.com`) の商品詳細ページを ID 連番スキャン
  （`START_ID`〜`END_ID`、404が `MAX_CONSECUTIVE_MISS` 件連続したら打ち切り）して取得する。
  検索結果一覧ページが JavaScript 動的描画のため一覧からの収集ができず、この方式になっている。
- **`run_all.py`** — 上記2社分を順番に実行し、最後に `sync_to_postgres.py` で Postgres へ同期する。
  cron にはこのファイル1本を登録すればよい。

## セットアップ

```bash
cd rental-scraper
pip install -r requirements.txt
python3 run_all.py
```

`requirements.txt`: `requests` / `beautifulsoup4` / `psycopg2-binary`（Postgres同期用）。

## 環境変数

| 変数 | 必須 | 説明 |
|---|---|---|
| `DATABASE_URL` | 任意 | GMO ONAiR 本体アプリと同じ形式の Postgres 接続文字列。**未設定でもスクレイパー自体は正常に動く** — その場合は SQLite（`rental_items.db`）への保存だけを行い、Postgres への同期だけがスキップされてログに記録される（`run_all.py` のログ「### rental_items.db → PostgreSQL 同期 開始 ###」以降を参照）。クロール自体を失敗させない設計であることに注意。同期の失敗（接続エラー等）はクロールの失敗と分けてログ・扱いをすること。 |
| `RENTAL_SQLITE_PATH` | 任意 | `rental_items.db` の保存先パスを変えたいときに指定。省略時はカレントディレクトリの `rental_items.db`。 |

⚠️ **`DATABASE_URL` は本番用と検証用を絶対に混同しないこと。** 詳細は下の「cron設定」節を参照。

## cron 設定 — 環境を必ず選んで組む（最重要）

GMO ONAiR は本番 (`onair_prod` / `/root/gmo-onair`) と検証 (`onair_dev` / `/root/gmo-onair-dev`)
を完全に分離して運用している（[CLAUDE.md「環境分離ポリシー」](../CLAUDE.md#環境分離ポリシー最重要)）。
このスクレイパーの cron も同じ原則に従う。

- **本番 VPS のリポジトリ（`/root/gmo-onair`）で cron を組む場合** → その cron ジョブから見える
  `DATABASE_URL` は必ず本番用（`onair_prod` を指すもの）にする。
- **検証 VPS のリポジトリ（`/root/gmo-onair-dev`）で cron を組む場合** → その cron ジョブから見える
  `DATABASE_URL` は必ず検証用（`onair_dev` を指すもの）にする。
- **1つの cron 定義・1つの `.env` を本番・検証で兼用しない。** 取り違えると、検証用のダミー
  データが本番の「レンタル機材検索」に出てしまう、または逆に本番向けにクロールした実データが
  検証環境にしか反映されない、という事故になる。
- cron ジョブへの `DATABASE_URL` の渡し方（systemd の `EnvironmentFile` か、cron 呼び出し元で
  `.env` を読み込むラッパースクリプトを噛ませるか等）は環境依存なので本書では指定しない。
  方針は一つだけ：**本体アプリ（server）がその環境で使っているのと同じ `.env` の
  `DATABASE_URL` を、この cron ジョブにも見えるようにする**（新しく値を作らない・コピーしない、
  同じ値を参照させる）。
- どちらの環境に cron を実際に登録するかは、本体アプリの本番デプロイ原則
  （「ユーザーが明示的に指示するまで本番へは変更を加えない」）と同じ精神で、**ユーザーが判断して
  行う運用作業**とする。本書はその判断のためのチェックリストであり、実際に VPS へ SSH して
  cron を仕込む手順書ではない。

cron の例（時刻・パスは環境に合わせて調整。上記の環境分離を必ず先に確認してから登録する）:

```
0 5 * * * cd /path/to/rental-scraper && /usr/bin/python3 run_all.py >> crawl.log 2>&1
```

## サイト利用規約・アクセス方法について

- 対象2社サイトの利用規約・`robots.txt` の範囲内で行うこと。範囲外の使い方が分かった場合は
  クロールを止め、対象カテゴリ・頻度を見直すこと。
- リクエスト間隔は `SLEEP_SEC = 1.5`（秒）。各ページ取得のたびにこの間隔を空けており、
  短くしない。
- User-Agent はスクレイパーであることが分かる文字列（`Rental-Inventory-Bot/1.0 ...`）を
  送っている（`toc_scraper.py` / `restar_scraper.py` 内で連絡先メールアドレスも要更新）。

## 未検証であることについて（重要）

`toc_scraper.py` と `restar_scraper.py` は、**実際の HTML 構造でまだ動作検証されていない**
（各ファイルの docstring に明記の通り。レンダリング後のテキストを元に解析ロジックを組んだ
段階で、実サイトの HTML タグ・class 名までは確認できていない）。

- **初回実行時は必ずログを確認すること。** 「パース失敗(name取得不可)」の警告が大量に出る場合、
  セレクタ（`h1` / テーブル抽出 / 価格の正規表現など）が実際のページ構造と合っていない。
- レスター側はさらに、検索結果一覧が JavaScript 動的描画のため一覧取得ができず、商品IDの
  連番スキャン（`START_ID`〜`END_ID`）という代替方式になっている。実際の最大ID・欠番の分布に
  よっては取得件数が想定と大きくずれる可能性がある。サイト側に API（Kuroco CMS の可能性）が
  あれば、そちらに切り替えたほうが正確・高速（`restar_scraper.py` 冒頭のコメント参照）。

## ローカルでの動作確認方法

本番・検証の Postgres に触れずに、Postgres 同期部分だけを手元で確認する手順:

```bash
# 1. リポジトリルートで検証用 Postgres を立てる（本番・検証DBとは完全に別のポート5433）
npm run verify:up

# 2. 接続情報を環境変数に読み込む
source /tmp/onair-verify/env.sh

# 3. DATABASE_URL を検証用 Postgres に向けて同期スクリプトを単体実行
#    （$DATABASE_URL は上の source で入っているものをそのまま使う）
cd rental-scraper
python3 sync_to_postgres.py

# 4. qsheet_rental_items に入ったか psql で確認
psql "$DATABASE_URL" -c "SELECT company, item_id, name, status FROM qsheet_rental_items ORDER BY company, item_id LIMIT 20;"

# 5. 使い終わったら落とす
npm run verify:down
```

クロール自体（`toc_scraper.py` / `restar_scraper.py`）を試したくない場合でも、`rental_items.db`
さえ手元にあれば `sync_to_postgres.py` 単体で同期の挙動だけ確認できる。画面側のサンプルデータ
（クロールなしで見た目を確認する方法）は
[docs/design/v4/rental-search/README.md](../docs/design/v4/rental-search/README.md) の
「実装状況」節を参照。
