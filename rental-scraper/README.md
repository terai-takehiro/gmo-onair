# レンタル機材DB化プロジェクト（スクレイパー）

映像機材レンタル会社2社（東京オフラインセンター＝`company`列は'TOC'／レスター）の機材ページを毎日クロールし、
SQLite（`rental_items.db`）にステージングした上で、GMO ONAiR 本体アプリの PostgreSQL
（`qsheet_rental_items`）へ同期する。GMO ONAiR「制作技術支援」の中のミニアプリ
**「レンタル機材検索」**（`client-qsheet/src/pages/rental/`）が検索対象にするデータの
取り込み元がこれ。モックアップ段階の仕様は
[docs/design/v4/rental-search/README.md](../docs/design/v4/rental-search/README.md) を参照。

**検証環境（dev.gmo-onair.jp）では、main へのマージのたびに自動で実行される。** 詳細は
下の「検証環境での自動実行」を参照。**本番環境（gmo-onair.jp）も v4.3.1 から自動実行に対応した**
（`rental_scraper_prod`）。Release を公開したときだけ動く（本番の一般的なデプロイ経路と同じ）。
詳細は下の「本番環境での自動実行」を参照。

## 何をするものか

```
東京オフラインセンター＝TOC (toc_scraper.py) ─┐
                                               ├→ rental_items.db (SQLite・ステージング)
レスター (restar_scraper.py)           ───────┘        │
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
- **`toc_scraper.py`** — 東京オフラインセンター（`company`列は'TOC'。`ec.toc-net.jp`）のカテゴリ一覧から商品IDを収集し、
  商品詳細ページを1件ずつ取得してパースする。
- **`restar_scraper.py`** — レスター (`restargp.com`) の商品詳細ページを ID 連番スキャン
  （`START_ID`〜`END_ID`、404が `MAX_CONSECUTIVE_MISS` 件連続したら打ち切り）して取得する。
  検索結果一覧ページが JavaScript 動的描画のため一覧からの収集ができず、この方式になっている。
- **`run_all.py`** — 上記2社分を順番に実行し、最後に `sync_to_postgres.py` で Postgres へ同期する
  （`main()` を公開。CLI からも `scheduler.py` からも同じ経路を通る）。
- **`scheduler.py`** — コンテナの常駐プロセス。`run_all.main()` を1日1回（既定 5時）実行し続ける。
  システムの cron は使わない（コンテナでは timezone・ログの扱いが面倒になるため、単純なループで足りる）。
  **加えて、本体アプリからの手動「今すぐ取得」トリガーも同じループでポーリングする**
  （`sync_requests.py` 参照。20秒ごとに `qsheet_rental_sync_requests` を見に行く）。
- **`sync_requests.py`** — 手動トリガーのキュー処理（`qsheet_rental_sync_requests` の
  claim/done/error 更新）。scraper 側に HTTP サーバーは持たせない設計にしたため、
  本体アプリ→scraper の一方向の指示は Postgres の1テーブル越しに行う。
- **`Dockerfile`** — `scheduler.py` を CMD にした軽量な Python イメージ。GHCR には積まず、
  VPS 上でその場ビルドする（`docker-compose.yml` の `rental_scraper_dev` サービス参照）。

## 手動での「今すぐ取得」

レンタル機材検索の画面に「今すぐ取得」ボタンがある（`RentalSearchPage.tsx`）。仕組み:

```
[画面のボタン] → POST /qsheet/rental/sync-trigger（server/.../rental.routes.ts）
             → qsheet_rental_sync_requests に 'pending' 行を1件 INSERT
             → scheduler.py が最大20秒以内にポーリングで見つけて claim（'running'）
             → run_all.main() を実行 → 'done'/'error' で締める
             → 画面は GET /qsheet/rental/sync-status をポーリングして進行状況を表示
```

- **同時に複数リクエストは受け付けない。** 既に `pending`/`running` の行があれば
  サーバー側で 409 を返す（`rental.service.ts` の `triggerSync`）。
- **クールダウンあり（既定30分）。** 対象2社サイトへの連打を防ぐため、直近のリクエストから
  一定時間経っていないと 429 を返す（利用規約の範囲内で行う原則・下の「サイト利用規約・
  アクセス方法について」参照）。
- **`DATABASE_URL` が未設定の環境（scheduler.py 単体をローカルで動かす場合等）では
  手動トリガーの監視自体を行わない。** 定期実行（毎日 `RENTAL_CRON_HOUR`）はそれでも動く。

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

判断は次の**4段**で行う。**最初に見るのはコンテナが生きているかどうか**:

```bash
# 0. ⚠️ まずここ。コンテナが「起動した」ことと「動き続けている」ことは別。
#    docker compose up -d はプロセスが直後に落ちても成功を返すので、
#    デプロイのログが「起動」と出ていても当てにならない
#    （実際、Dockerfile の COPY 漏れによる ModuleNotFoundError で
#     約4時間クラッシュし続けたことがある。下の「既知の不具合」参照）。
docker compose -p gmo-onair -f /root/gmo-onair-dev/docker-compose.yml ps rental_scraper_dev
#   STATUS が "Up ..." なら生きている。"Restarting (1) ..." ならクロールは1件も走っていない
#   → その場合は下の 2 のログに Traceback が出ているはず

# 1. 件数だけでなく、既知のダミーIDが混ざっていないか確認する。
#    ダミーの (company, item_id) は次の8件で固定（seed-rental.ts参照）:
#      TOC（東京オフラインセンター）: 5043, 4102, 5121, 4988, 5044, 5045
#      レスター: 277, 312
#    これ「だけ」しか無ければ、まだ実際のクロールは成功していない（ダミーのまま）。
psql "$DATABASE_URL_DEV" -c "SELECT company, item_id, name, first_seen, last_seen FROM qsheet_rental_items ORDER BY company, item_id;"

# 2. コンテナのログで実際にクロールが完了しているか（新規/更新の実績、パース失敗の有無）を見る
docker compose -p gmo-onair -f /root/gmo-onair-dev/docker-compose.yml logs --tail=200 rental_scraper_dev
#   見るべき行:
#     [NEW][TOC] ... / [UPDATED][...] ...                       ← 実際に取得できている
#     パース失敗(name取得不可): https://...                    ← セレクタが実HTMLと合っていない
#     取得断念: https://...                                     ← ネットワーク到達不可・ブロック
#     ### 途中経過 100件 → PostgreSQL へ同期 ###              ← 完走を待たず100件ごとに反映している
#     [sync-to-postgres] N件を upsert しました（うち missing 判定: M件）
#                                                                ← Postgresへの反映件数（これが実件数の裏付け）

# 3. 上記のダミー8件以外の (company, item_id) が実在し、last_seen が最近のクロール時刻に
#    更新され続けていれば、実際に動いている
psql "$DATABASE_URL_DEV" -c "
  SELECT company, item_id, name, last_seen FROM qsheet_rental_items
  WHERE (company, item_id) NOT IN (
    ('TOC','5043'),('TOC','4102'),
    ('TOC','5121'),('TOC','4988'),
    ('TOC','5044'),('TOC','5045'),
    ('レスター','277'),('レスター','312')
  )
  ORDER BY last_seen DESC LIMIT 20;
"
```

**手動での後片付けは不要になった**（上記マイグレーションが自動でやる）。まだ8件が残って
見える場合は、マイグレーションがまだ流れていない（デプロイがまだこのバージョンに
達していない）か、上の判断3段の1でまだ実クロールが完了していないだけの可能性が高い。

## 本番環境での自動実行（rental_scraper_prod・v4.3.1〜）

**Release を公開する（`vX.Y.Z` タグ）たびに、`rental_scraper_prod` コンテナがビルド・起動される。**
`rental_scraper_dev` と同じ仕組みだが、同期先が本番の Postgres (`onair_prod`) になっている点だけが違う。

- `docker-compose.yml` の `rental_scraper_prod` サービス（`build: ./rental-scraper` は
  `rental_scraper_dev` と共通、`DATABASE_URL` は本番の Postgres を指す）
- `.github/workflows/deploy.yml` の production ジョブが、`app_prod` のデプロイに続けて
  `docker compose build rental_scraper_prod && docker compose up -d --no-deps rental_scraper_prod`
  を実行する（失敗しても本体アプリのデプロイ成否とは分けて扱われる）
- コンテナは起動直後に1回クロールを実行し（`RENTAL_RUN_ON_STARTUP=true`）、以降は毎日
  `RENTAL_CRON_HOUR_PROD`（既定4時、VPSのローカル時刻）に1回実行し続ける

⚠️ **`RENTAL_CRON_HOUR`（検証・既定5時）と `RENTAL_CRON_HOUR_PROD`（本番・既定4時）はわざと
別の環境変数・別の既定値にしてある。** 対象2社サイトは検証・本番の区別をしない同一の実サイトなので、
両方が同じ時刻に走ると実質的にクロール頻度が2倍になり、「サイト利用規約・アクセス方法について」の
節で決めているアクセス方法（間隔を空ける・連打しない）の趣旨に反する。`.env` で調整する場合も
2つの時刻が重ならないようにすること。

**本番デプロイは Release 公開のときだけ**なので、検証（main マージのたびに再作成される）ほど
頻繁にコンテナが作り直されるわけではない。そのぶん「1回のクロールが完走する前に次のデプロイで
コンテナが作り直されて途中経過が消える」事故は起きにくいが、ステージング SQLite は
`rental_scraper_dev` と同じ理由（`RENTAL_SQLITE_PATH=/data/rental_items.db`）で
専用の永続ボリューム（`rental_scraper_prod_data`）に置いてある。**`rental_scraper_data`
（検証用）とは別のボリューム** — 共有すると検証のステージングデータが本番の同期対象に混ざる。

**実際にスクレイピングできているかの確認方法**は「検証環境での自動実行」の4段診断と同じ
（本番 VPS のリポジトリ・`docker compose -p gmo-onair -f /root/gmo-onair/docker-compose.yml`・
コンテナ名は `rental_scraper_prod`・`DATABASE_URL` は本番用に読み替えること）。**ダミーデータの
混入は本番では起きない**（`server/src/index.ts` の起動時シードは本番 (`NODE_ENV=production`) では
`RUN_SEED_ON_STARTUP=true` を明示しない限りそもそも一切走らない設計のため、レンタルのダミー8件も
含めて最初から入らない）。

### 既知の不具合: コンテナが ModuleNotFoundError で起動できず、4時間1件も取れていなかった（v4.1.9で修正済み）

⚠️ **「数時間経っても1件も捕捉できていない」ときは、まずこの形を疑うこと。**

原因: `Dockerfile` の `COPY` がファイル名の個別列挙だったため、あとから足した
`sync_requests.py`（手動「今すぐ取得」のキュー処理）が**イメージに入っていなかった**。
`scheduler.py` は冒頭でそれを import するので、コンテナは起動のたびに
`ModuleNotFoundError: No module named 'sync_requests'` で即死し、
`restart: unless-stopped` で再起動を繰り返していた（クロールは1回も走らない）。

**なぜ気づけなかったか**: `docker compose up -d` は**プロセスが直後に落ちても成功を返す**ため、
デプロイのログは「✓ rental_scraper_dev 起動」と出ていた。画面側も、行が0件の会社は
取得状況の欄から消える作りだったので「取れていない」とすら表示されなかった。

修正:
- `Dockerfile` は `COPY *.py ./`（個別列挙をやめた）。取りこぼしは
  `test_dockerfile.py` が検査する
- CI（`.github/workflows/ci.yml` の checks）で `rental-scraper` の単体テストと
  `python3 -c "import scheduler"` を回す。**それまで CI は Python を1行も見ていなかった**
- `deploy.yml` はコンテナを起動したあと `docker inspect` で
  **生きているか（state=running / 再起動回数0）**を確かめ、駄目なら Actions の注釈を出す
- 本体アプリの取得状況は、行が0件の会社も「未取得」として必ず表示する
  （`rental.service.ts` の `getSyncStatus`）

### 完走しないクロールでも成果を捨てない仕組み（v4.1.9）

1回のクロールは `SLEEP_SEC=1.5秒` × 数百〜数千件で**数十分〜1時間超**かかる。一方、
`rental_scraper_dev` は **main へのマージのたびに作り直される**（マージが立て込む日は
10〜30分おき）。以前は

- ステージング SQLite がコンテナの中（＝作り直しで消える）
- Postgres への同期は2社ぶんを全部終えたあとに1回だけ

だったため、**完走できない日は永久に1件も画面に出ない**。次の3つで直した:

- `docker-compose.yml` に名前付きボリューム `rental_scraper_data:/data` を足し、
  `RENTAL_SQLITE_PATH=/data/rental_items.db` を指す（コンテナ作り直しをまたいで残る）
- `toc_scraper.py` / `restar_scraper.py` も `RENTAL_SQLITE_PATH` を見る。
  **以前はスクレイパー側だけ `rental_items.db` 固定**で、同期側と食い違う地雷だった
- `run_all.py` が **1社終わるごと・さらにクロール中も100件ごと**に同期する
  （`on_progress`。途中経過の同期は失敗してもクロールを止めない）

これを安全にするため、`status`（掲載中/掲載終了）は**時刻の推定をやめて
SQLite の `items.status` 列で明示的に持つ**ようにした。`upsert_item` が `listed` を、
**クロールを完走したときだけ呼ぶ** `mark_missing_items` が `missing` を立てる。
途中で止まった回を同期しても、まだ見に行っていない商品は `listed` のまま残る。

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

**この判定方式自体は v4.1.9 でやめた**（status を SQLite の列で明示的に持つ形にした。
上の「完走しないクロールでも成果を捨てない仕組み」参照）。以下は当時の見分け方の記録。

**再発時の見分け方**: `qsheet_rental_items` を company ごとに `status` で
`GROUP BY` し、`listed` が1件しかない／極端に少ない場合はこの症状。

```sql
SELECT company, status, count(*) FROM qsheet_rental_items GROUP BY company, status ORDER BY company, status;
```

本番 (`app_prod`) 向けの同種サービス `rental_scraper_prod` は v4.3.1 でユーザーの明示的な
指示のもと着手した（詳細は上の「本番環境での自動実行」）。

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
| `RENTAL_SQLITE_PATH` | 任意 | `rental_items.db` の保存先パスを変えたいときに指定。省略時はカレントディレクトリの `rental_items.db`。**クロール側（`toc_scraper.py`/`restar_scraper.py`）と同期側（`sync_to_postgres.py`）が同じ値を見る** — 検証環境では永続ボリュームの `/data/rental_items.db` を指している（コンテナ作り直しで途中経過を失わないため）。 |
| `RENTAL_CRON_HOUR` | 任意 | `scheduler.py` が毎日実行する時刻（0-23）。コンテナ内での変数名は常にこれ1つ。既定 5。`docker-compose.yml` は検証 (`rental_scraper_dev`) には `.env` の `RENTAL_CRON_HOUR`（既定5時）を、本番 (`rental_scraper_prod`) には `.env` の `RENTAL_CRON_HOUR_PROD`（既定4時）をそれぞれ渡す — 同時刻にすると対象サイトへのクロール頻度が実質2倍になるためわざとずらしてある。 |
| `RENTAL_RUN_ON_STARTUP` | 任意 | `"true"` なら `scheduler.py` 起動直後にも1回実行する。既定 false（`docker-compose.yml` の `rental_scraper_dev`/`rental_scraper_prod` はどちらも true にしてある）。 |

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

### 既知の不具合: 実クロール後、TOCの画像が表示されない・価格が出ない・日本語が文字化けする（v4.1.9で対処）

⚠️ 実際にクロールが動き出した後、検証環境で確認できた3件。

**画像が描画されない（URLは正しく取れている）**: 本体アプリ (`server/src/app.ts`) の
Content-Security-Policy `imgSrc` に対象2社の画像配信ドメインが入っておらず、
ブラウザが画像の読み込み自体をブロックしていた（CSP違反はネットワーク要求を出す前に
止まるため、`images` 列に正しい URL が入っていても「表示されない」形の不具合になる）。
`https://ec.toc-net.jp`・`https://www.restargp.com`・`https://*.kuroco-img.app` を
`imgSrc` に追加して直した。

**TOCの価格が出ない**: `toc_scraper.py` の価格取得は「電話受付」「ネット受付」という
ラベルの直後にある価格を拾う方式だが、2つの問題があった。

1. 以前の実装は「ラベルの祖父要素（`find_parent()`）全体のテキストから最初の価格」を
   拾っていたため、ラベルが `<p>` 直下などフラットな構造だと祖父要素が広すぎ、
   **「電話受付」で検索しても後ろにある「ネット受付」の価格まで拾ってしまう**
   （両方が同じ値になる）バグがあった。`find_next(string=PRICE_RE)` で
   「ラベルより後で最初に価格パターンに一致するテキスト」だけを見るように直した
   （`test_toc_scraper.py` で再現・回帰テストあり）。
2. 実クロールでは TOC の商品ページに「電話受付」「ネット受付」というラベル自体が
   見当たらないケースが多く、両方 `None` になっていた。テーブル抽出
   （`_extract_tables_as_dict` = 既に「カテゴリ」等では正しく動いている）の結果から
   「料金」「価格」を含む行を拾うフォールバックを追加し、それでも見つからなければ
   `パース失敗` と同様にログへ警告を残すようにした（`_extract_price_from_specs`）。

⚠️ **この開発セッションのサンドボックスは対象2社サイトへの外部接続ができないため、
上記2. のフォールバックが実際の TOC ページ構造に対して正しく効くかは検証できていない**
（README「未検証であることについて」と同じ制約）。デプロイ後もまだ価格が出ない商品が
多い場合は、`rental_scraper_dev` のログで `価格取得不可` の警告と `spec keys=[...]`
（そのページのテーブルから拾えた見出し一覧）を確認し、実際の価格の見出し名に合わせて
`_extract_price_from_specs` のキーワード（`"料金"`/`"価格"`）を調整すること。

⚠️ **上記フォローアップ後も一部商品で「ー」（未取得）のまま報告あり（2026-08-22）。**
サンドボックスから実サイトのログ・HTML構造を直接見る手段が無いため、この再発時点でも
「実際にどのラベル・見出し名で価格が出ているか」が特定できていない。`価格取得不可`
警告に**ページ内で実際に見つかった「◯◯円」形式の数値**（`ページ内の価格らしき数値=[...]`）
を追加した（抽出には使わない、次に再発したときの当たりを絞るための診断ログ）。
**次にこの警告がログに出たら、`spec keys` と `価格らしき数値` の両方を確認し、
実際のラベル・見出し名に `_extract_price_near_label`/`_extract_price_from_specs` を
合わせること。** 「価格らしき数値」も空なら、そのページ自体に価格が出ていない
（お問い合わせ制の商品等）可能性が高く、その場合の「ー」表示はバグではない。

### 既知の不具合: レスターだけ0件のまま「取得できていない」（2026-08-23で対処）

⚠️ TOCは取得できているのに、レスターだけカタログが1件も画面に出ない、という報告。

原因: `restar_scraper.py` は検索結果一覧がJavaScript動的描画のため一覧から商品IDを
収集できず、商品詳細ページのURL（`item{ID}/`）を `START_ID=1`〜`END_ID=800` で連番
スキャンする代替方式を取っている（README「未検証であることについて」参照）。この
走査は連続404が `MAX_CONSECUTIVE_MISS`（既定40）続くと打ち切る作りだったが、**この
打ち切りが「1件も見つかっていない」段階から効いていた**。docstring の商品詳細ページ例
（`item277`）が示すとおり、実際のカタログの先頭IDは `START_ID=1` よりだいぶ手前が
まとまって欠番の可能性が高く、その欠番地帯が `MAX_CONSECUTIVE_MISS` より長いと、
本物のカタログへ辿り着く前に走査自体が止まり、レスターだけ0件のまま終わっていた
（TOCはカテゴリ一覧ページからIDを収集する方式のため、この問題は起きない）。

修正: 最初の1件が見つかるまでは `MAX_CONSECUTIVE_MISS` による打ち切りを適用しない
（`found_any` フラグ）ようにした。最初の1件を見つけたあとは、従来どおりカタログ末尾を
過ぎた欠番地帯を早めに切り上げるために使う。回帰テストは `test_restar_scraper.py`。

⚠️ この対処でも `END_ID=800` に達するまで一度も商品が見つからない場合（実カタログの
IDが800を超えている等）は0件のままになりうる。デプロイ後のログで
`[レスター] 収集した商品ID数` 相当の実績（`upsert_item` が呼ばれた件数）を確認し、
0件が続くようなら `END_ID` を広げるか、レスター側のサイトAPI（Kuroco CMSの可能性。
`restar_scraper.py` 冒頭のコメント参照）へ切り替えを検討すること。

**商品名・カテゴリ名の日本語部分だけ文字化けする**（例:
`Lightning－Digital AV変換アダプタ` の日本語部分だけが欧文の記号・アクセント文字の
羅列になる）: `toc_scraper.py`/`restar_scraper.py` の `fetch()` が
`resp.encoding = resp.apparent_encoding`（`requests` が `chardet`/`charset_normalizer`
でバイト列から文字コードを推定する仕組み）で決めた文字コードで `resp.text`
（デコード済み文字列）を返していたが、この推定は日本語ページで必ずしも当たらない
（ASCII混じり・カタカナ中心のページ等で欧文コードページに誤爆することがある）。

`fetch()` は**バイト列**（`resp.content`）を返すように変更し、文字コードの判定は
`BeautifulSoup(html, "html.parser")` 自身の自動検出（`UnicodeDammit`。HTML の
`<meta charset>` 宣言・BOM等を実際に見る）に任せるようにした。`test_toc_scraper.py` の
`FetchEncodingTest` で Shift_JIS ページを実際にエンコードして正しくデコードできることを
確認済み（ただし実サイトが宣言している実際の文字コードそのものはサンドボックスの制約で
確認できていない — `<meta charset>` を宣言してさえいれば方式によらず直る設計）。

⚠️ **上記の対処だけではデプロイ後も文字化けが再発した（2026-08-22 報告）。** 原因は
`<meta charset>` 宣言に依存していた点 — 実ページにその宣言が無いと、`UnicodeDammit` も
内部的には元の不具合と同じ chardet 系の統計的推定にフォールバックするため、根本原因
（統計的推定に日本語混じりの短いテキストで頼っている点）が変わっていなかった。

`common_db.py` に `decode_html()` を追加し、**宣言の有無に依存しない**確定的な判定を
先に行うよう変更した: ① UTF-8 として厳密デコード（成功すればほぼ確定） → ② 失敗すれば
CP932 → ③ それも失敗すれば EUC-JP → ④ すべて失敗した場合のみ最後の保険として
`UnicodeDammit` に委ねる。`toc_scraper.py`/`restar_scraper.py` の全ての
`BeautifulSoup(html, ...)` 呼び出しをこの `decode_html(html)` 経由に変更した。
`test_common_db.py` の `DecodeHtmlTest` で「`<meta charset>` 宣言が無い UTF-8/CP932
ページでも正しくデコードできる」ことを確認済み（実サイトの実際の文字コード・
宣言の有無そのものはこのセッションでも未確認 — 次にまだ再発する場合は下記の
価格診断ログと合わせてログを確認すること）。

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
