# レンタル機材DB化プロジェクト（スクレイパー）

映像機材レンタル会社2社（東京オフラインセンター／レスター）の機材ページを毎日クロールし、
SQLite（`rental_items.db`）にステージングした上で、GMO ONAiR 本体アプリの PostgreSQL
（`qsheet_rental_items`）へ同期する。GMO ONAiR「制作技術支援」の中のミニアプリ
**「レンタル機材検索」**（`client-qsheet/src/pages/rental/`）が検索対象にするデータの
取り込み元がこれ。モックアップ段階の仕様は
[docs/design/v4/rental-search/README.md](../docs/design/v4/rental-search/README.md) を参照。

**検証環境（dev.gmo-onair.jp）では、main へのマージのたびに自動で実行される。** 詳細は
下の「検証環境での自動実行」を参照。本番はまだ自動化していない。

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
- **`run_all.py`** — 上記2社分を順番に実行し、最後に `sync_to_postgres.py` で Postgres へ同期する
  （`main()` を公開。CLI からも `scheduler.py` からも同じ経路を通る）。
- **`scheduler.py`** — コンテナの常駐プロセス。`run_all.main()` を1日1回（既定 5時）実行し続ける。
  システムの cron は使わない（コンテナでは timezone・ログの扱いが面倒になるため、単純なループで足りる）。
- **`Dockerfile`** — `scheduler.py` を CMD にした軽量な Python イメージ。GHCR には積まず、
  VPS 上でその場ビルドする（`docker-compose.yml` の `rental_scraper_dev` サービス参照）。

## 検証環境での自動実行（rental_scraper_dev）

**main へのマージ → 検証環境への自動デプロイのたびに、`rental_scraper_dev` コンテナが
ビルド・起動される。** 手動での cron 登録は不要になった。仕組み:

- `docker-compose.yml` の `rental_scraper_dev` サービス（`build: ./rental-scraper`、
  `DATABASE_URL` は検証の Postgres（`onair_dev`）を指す）
- `.github/workflows/deploy.yml` の staging ジョブが、`app_dev` のデプロイに続けて
  `docker compose build rental_scraper_dev && docker compose up -d --no-deps rental_scraper_dev`
  を実行する（GHCR には積んでいないので毎回 VPS 上でビルドする。失敗しても本体アプリの
  デプロイ成否とは分けて扱われる — ジョブのログに `rental_scraper_dev container logs` が出る）
- コンテナは起動直後に1回クロールを実行し（`RENTAL_RUN_ON_STARTUP=true`）、以降は毎日
  `RENTAL_CRON_HOUR`（既定5時、VPSのローカル時刻）に1回実行し続ける

**マージ後に実際にスクレイピングできているか確認する方法**:

⚠️ **「件数が入っている」だけでは判断材料にならない。** `qsheet_rental_items` には
`app_dev`（本体アプリ）が起動時に投入するダミーサンプル（`seed-rental.ts`・8件固定）が
**別に**存在しうる。v4.1.8 で `SKIP_RENTAL_SEED=true` を `app_dev` に設定し、検証環境では
このダミー投入を止めた（本物のクロール結果と混ざって見分けがつかなくなるため）。

**この対処より前にデプロイされた検証環境に残っていた8件は、マイグレーション
`229_qsheet_rental_cleanup_seed.sql` で自動的に片付く。** `company + item_id + name`
の3列がダミー値と完全一致する行だけを消す設計なので、実クロールが同じIDを先に取り込んで
`name` が書き変わっていれば一致せず残る（誤って実データを消さない）。次にこのアプリのある
環境へデプロイした時点で1回だけ実行され、以降は何もしない。

判断は次の3段で行う:

```bash
# 1. 件数だけでなく、既知のダミーIDが混ざっていないか確認する。
#    ダミーの (company, item_id) は次の8件で固定（seed-rental.ts参照）:
#      東京オフラインセンター: 5043, 4102, 5121, 4988, 5044, 5045
#      レスター: 277, 312
#    これ「だけ」しか無ければ、まだ実際のクロールは成功していない（ダミーのまま）。
psql "$DATABASE_URL_DEV" -c "SELECT company, item_id, name, first_seen, last_seen FROM qsheet_rental_items ORDER BY company, item_id;"

# 2. コンテナのログで実際にクロールが完了しているか（新規/更新の実績、パース失敗の有無）を見る
docker compose -p gmo-onair -f /root/gmo-onair-dev/docker-compose.yml logs --tail=200 rental_scraper_dev
#   見るべき行:
#     [NEW][東京オフラインセンター] ... / [UPDATED][...] ...   ← 実際に取得できている
#     パース失敗(name取得不可): https://...                    ← セレクタが実HTMLと合っていない
#     取得断念: https://...                                     ← ネットワーク到達不可・ブロック
#     [sync-to-postgres] N件を upsert しました（うち missing 判定: M件）
#                                                                ← Postgresへの反映件数（これが実件数の裏付け）

# 3. 上記のダミー8件以外の (company, item_id) が実在し、last_seen が最近のクロール時刻に
#    更新され続けていれば、実際に動いている
psql "$DATABASE_URL_DEV" -c "
  SELECT company, item_id, name, last_seen FROM qsheet_rental_items
  WHERE (company, item_id) NOT IN (
    ('東京オフラインセンター','5043'),('東京オフラインセンター','4102'),
    ('東京オフラインセンター','5121'),('東京オフラインセンター','4988'),
    ('東京オフラインセンター','5044'),('東京オフラインセンター','5045'),
    ('レスター','277'),('レスター','312')
  )
  ORDER BY last_seen DESC LIMIT 20;
"
```

**手動での後片付けは不要になった**（上記マイグレーションが自動でやる）。まだ8件が残って
見える場合は、マイグレーションがまだ流れていない（デプロイがまだこのバージョンに
達していない）か、上の判断3段の1でまだ実クロールが完了していないだけの可能性が高い。

### 既知の不具合: 実クロール後もほぼ全件が missing 判定になっていた（v4.1.8で修正済み）

⚠️ **上の3段診断でダミー8件以外の実データが見えているのに、画面（レンタル機材検索）に
「数件しか出ない」場合、これが原因だった可能性が高い。**

原因: `sync_to_postgres.py` の `compute_statuses()` は「company ごとの最新 `last_seen`
と一致する行だけを `listed` とする」判定だが、`common_db.py` の `upsert_item`/
`mark_missing_items` が**商品ごとに独立して** `datetime.now()` を計算していたため、
実際のクロール（数百〜数千件を `SLEEP_SEC=1.5秒` 間隔で処理・**数十分〜1時間超**かかる）
では商品ごとに `last_seen` がバラけ、**最後に処理した1件を除いてほぼ全部が `missing`
に誤判定**されていた（画面側は `listed` のみ検索対象にするため、「数件しか出ない」ように見える）。

修正: `toc_scraper.py`/`restar_scraper.py` それぞれの `run()` 冒頭で1回だけ
`run_started_at` を計算し、そのクロール内の `upsert_item`/`mark_missing_items`
すべてに `now=run_started_at` として渡すよう変更（`common_db.py` の関数シグネチャに
`now` 引数を追加）。単体テストは `test_common_db.py` を参照。

**再発時の見分け方**: `qsheet_rental_items` を company ごとに `status` で
`GROUP BY` し、`listed` が1件しかない／極端に少ない場合はこの症状。

```sql
SELECT company, status, count(*) FROM qsheet_rental_items GROUP BY company, status ORDER BY company, status;
```

⚠️ **本番 (`app_prod`) 向けの同種サービスはまだ無い。** 本番で実際にスクレイピングを
始めるかどうかは、CLAUDE.md の本番デプロイ原則（「ユーザーが明示的に指示するまで本番へは
変更を加えない」）と同じ精神で、ユーザーが明示的に指示するまで着手しない。本番に出す
ときは `docker-compose.yml` に `rental_scraper_prod`（`DATABASE_URL` は `onair_prod`）を
追加し、`deploy.yml` の production ジョブにも同様の結線を足す形になる想定。

## セットアップ（Docker を使わない場合）

```bash
cd rental-scraper
pip install -r requirements.txt
python3 run_all.py
```

`requirements.txt`: `requests` / `beautifulsoup4` / `psycopg2-binary`（Postgres同期用）。

## 環境変数

| 変数 | 必須 | 説明 |
|---|---|---|
| `DATABASE_URL` | 任意 | GMO ONAiR 本体アプリと同じ形式の Postgres 接続文字列。**未設定でもスクレイパー自体は正常に動く** — その場合は SQLite（`rental_items.db`）への保存だけを行い、Postgres への同期だけがスキップされてログに記録される。クロール自体を失敗させない設計であることに注意。同期の失敗（接続エラー等）はクロールの失敗と分けてログ・扱いをすること。 |
| `RENTAL_SQLITE_PATH` | 任意 | `rental_items.db` の保存先パスを変えたいときに指定。省略時はカレントディレクトリの `rental_items.db`。 |
| `RENTAL_CRON_HOUR` | 任意 | `scheduler.py` が毎日実行する時刻（0-23）。既定 5。 |
| `RENTAL_RUN_ON_STARTUP` | 任意 | `"true"` なら `scheduler.py` 起動直後にも1回実行する。既定 false（`docker-compose.yml` の `rental_scraper_dev` では true にしてある）。 |

⚠️ **`DATABASE_URL` は本番用と検証用を絶対に混同しないこと。** 手動で cron やスクリプトを
組む場合（下の「systemd/cron で直接動かす場合」）は特に注意すること。

## systemd/cron で直接動かす場合（Docker を使わない代替経路）

Docker を経由せず、VPS の OS 側の cron に直接登録して動かすこともできる
（`rental_scraper_dev` を使わない、あるいは本番向けに個別運用する場合）:

```
0 5 * * * cd /path/to/rental-scraper && /usr/bin/python3 run_all.py >> crawl.log 2>&1
```

- **本番 VPS のリポジトリ（`/root/gmo-onair`）で組む場合** → `DATABASE_URL` は必ず本番用
  （`onair_prod` を指すもの）にする。
- **検証 VPS のリポジトリ（`/root/gmo-onair-dev`）で組む場合** → `DATABASE_URL` は必ず検証用
  （`onair_dev` を指すもの）にする。
- 1つの cron 定義・1つの `.env` を本番・検証で兼用しない。取り違えると、検証用のダミー
  データが本番の「レンタル機材検索」に出てしまう、または逆に本番向けの実データが検証環境
  にしか反映されない、という事故になる。

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
段階で、実サイトの HTML タグ・class 名までは確認できていない）。この実装・自動デプロイの
結線を組んだ開発セッションのサンドボックスは対象2社サイトへの外部接続ができない環境
だったため、**実サイトに対する動作確認は一度も行えていない**。検証環境へのデプロイ後、
初めて実際の HTML 構造にさらされることになる。

- **デプロイ後は必ず `rental_scraper_dev` のログを確認すること。** 「パース失敗(name取得不可)」
  の警告が大量に出る場合、セレクタ（`h1` / テーブル抽出 / 価格の正規表現など）が実際の
  ページ構造と合っていない。
- レスター側はさらに、検索結果一覧が JavaScript 動的描画のため一覧取得ができず、商品IDの
  連番スキャン（`START_ID`〜`END_ID`）という代替方式になっている。実際の最大ID・欠番の分布に
  よっては取得件数が想定と大きくずれる可能性がある。サイト側に API（Kuroco CMS の可能性）が
  あれば、そちらに切り替えたほうが正確・高速（`restar_scraper.py` 冒頭のコメント参照）。

## ローカルでの動作確認方法

本番・検証の Postgres に触れずに、Postgres 同期部分だけを手元で確認する手順
（クロール自体・Docker ビルドの確認はここには含まれない — 開発セッションのサンドボックスでは
対象サイトへの接続も Docker デーモンも使えず、この手順の範囲でしか検証できなかった）:

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

**Docker イメージのビルド自体**（`docker build .` や `docker compose build rental_scraper_dev`）
も同じ理由で未検証。VPS への実デプロイが最初のビルド機会になる。手元に Docker が使える環境が
あれば、マージ前に `cd rental-scraper && docker build .` で一度確認しておくとより安全。
