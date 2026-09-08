# DB バックアップ・復元（VPS）

**最終確認: 2026-09-08（v4.6.10）。** 一次情報は `server/scripts/backup-db-to-box.mjs`・
`server/scripts/restore-db-from-box.mjs`・`scripts/setup-backup-cron.sh`。
VPS の配置とコンテナ名は [vps-setup.md](vps-setup.md)。

## バックアップ

PostgreSQL の `onair_prod` / `onair_dev` を **3時間ごとに `pg_dump` → gzip → BOX** へ上げる。30日より古いものは BOX 上で自動削除する。

| 項目 | 内容 |
| --- | --- |
| スクリプト | `server/scripts/backup-db-to-box.mjs`。**アプリのコンテナの中**で動く（イメージに `postgresql16-client` を入れてあるので `pg_dump` が使える） |
| 起動 | ホストの cron。本番 `0 */3 * * *`（`gmo-onair-app_prod-1`）・検証 `30 */3 * * *`（`gmo-onair-app_dev-1`）。30分ずらして同時実行を避ける |
| cron の登録 | `sudo bash /root/gmo-onair/scripts/setup-backup-cron.sh`（`docker ps` から実在するコンテナ名を拾うので、`app_prod` が起動してから流す） |
| ログ | `/var/log/gmo-onair-backup.log`（`tail -f` で追える。ローテーションは logrotate 任せで未設定） |
| 必要な環境変数（`.env`） | `BOX_CONFIG_JSON`・`BOX_PROJECT_PARENT_FOLDER_ID_INTERNAL`。無ければスクリプトはエラーで終了する（exit 1）。`DATABASE_URL` と `NODE_ENV` はコンテナが持っている |
| 保存先 | BOX の社内限り親フォルダ（`BOX_PROJECT_PARENT_FOLDER_ID_INTERNAL`）/ `00_DB_Backup` / `prod` または `dev`（`NODE_ENV` で決まる）/ `<db名>_YYYYMMDD_HHMMSS.sql.gz`（時刻は **UTC**） |
| 保持 | 30日。BOX 上の `created_at` で判定して削除 |
| 一覧を見る | 画面: 設定 →「DBバックアップ」（`/settings/db-backups`。システム管理者のみ・PC 用）。API: `GET /api/v1/internal/data-viewer/db-backups`。画面は復元コマンドをコピーできるだけで、**画面から復元はできない** |

手動で1回回す（動作確認）:

```bash
docker exec gmo-onair-app_prod-1 node /app/server/scripts/backup-db-to-box.mjs
docker exec gmo-onair-app_dev-1  node /app/server/scripts/backup-db-to-box.mjs
```

> ⚠️ 要確認: `setup-backup-cron.sh` の本番側の重複判定は `grep -qF … | grep -qF …` と `-q` を挟んで pipe しているため常に偽になり、**2回流すと本番の行が重複登録される**（検証側は正しい）。流したあと `crontab -l | grep backup-db-to-box` で行数を見ること。

## 復元

BOX のバックアップから DB を丸ごと戻す CLI。**既存の全テーブルを消して上書きする破壊的操作。**

```bash
# 一覧（その環境のフォルダだけ出る。新しい順）
docker exec gmo-onair-app_prod-1 node /app/server/scripts/restore-db-from-box.mjs --list

# 復元（"yes" を全文入力するまで動かない。-it が必要）
docker exec -it gmo-onair-app_prod-1 node /app/server/scripts/restore-db-from-box.mjs onair_prod_YYYYMMDD_HHMMSS.sql.gz

# 確認を飛ばす（自動化用）
docker exec gmo-onair-app_prod-1 node /app/server/scripts/restore-db-from-box.mjs --yes onair_prod_YYYYMMDD_HHMMSS.sql.gz
```

検証は `gmo-onair-app_dev-1` と `onair_dev_…` に読み替える。

スクリプトが入れている安全策:

| # | 何をするか |
| --- | --- |
| 1 | 環境の照合。ファイル名の `onair_prod_` / `onair_dev_` とコンテナの `NODE_ENV` が食い違うと止まる（本番ファイルを検証へ、検証ファイルを本番へは入れられない） |
| 2 | 復元前に現在の DB をコンテナ内の `/tmp/before-restore_<db>_<時刻>.sql.gz` へ退避。退避に失敗したら復元しない |
| 3 | `yes` の全文入力（`y` では続行しない）。`--yes` で省略可 |
| 4 | 監査行 `[restore] AUDIT: env=… restored_from=… at=…` を stdout に出す（`docker logs` に残る） |
| 5 | 途中で失敗したら、退避ファイルから戻す `gunzip -c … \| psql …` の手順をその場に出す |

手順の中身は `DROP SCHEMA public CASCADE` → `CREATE SCHEMA public` → ダンプを `psql` で流す、の順。

復元したら **アプリのコンテナを再起動する**（`docker compose -p gmo-onair restart app_prod`）。
ダンプには `_migrations` テーブルも入っているので、バックアップより後に追加された migration だけが起動時に流れ直す。

## 注意

- **コードを戻すときは DB も同じ時点へ。** `deploy.yml` は DB に触らないため、migration 200（v4.1.5）や 206〜208 のように値やテーブルを変えた版をまたいでコードだけ戻すと動かない。境目は [../deploy-pipeline.md の「戻し方」](../deploy-pipeline.md#6-戻し方ロールバック)。
- バックアップはアプリのコンテナの中で動く。**`app_prod` / `app_dev` が止まっていると、その環境のバックアップも止まる**（cron はコンテナ名で `docker exec` する）。ログに `No such container` が出ていたらそれ。
- 退避ファイル（`/tmp/before-restore_*`）はコンテナのファイルシステムにあり、**コンテナを作り直す（＝次のデプロイ）と消える**。残したければ `docker cp` でホストへ出す。
- `db` コンテナは本番・検証で1つ。`db` を再起動すると両方が一瞬止まる。復元はアプリ側からの `psql` で行うので `db` の再起動は要らない。
- BOX のフォルダ `00_DB_Backup/{prod,dev}` はバックアップスクリプトが無ければ作る。復元スクリプトは作らない（無ければ「見つかりません」で終わる）。

> ⚠️ 要確認: 復元スクリプトの完了メッセージは退避ファイルを「1 時間後に削除されます」と言うが、削除する処理はどこにも無い（上記のとおりコンテナ再作成まで残る）。メッセージを直すか、削除処理を足すかは人の判断。
