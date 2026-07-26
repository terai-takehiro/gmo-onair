# 検証環境の使い回し (dev-verify)

実装のたびに「実 Postgres で N 項目」の検証をしている。その**土台**を毎回書き起こしていたのを
1 本にまとめたもの。土台 = 使い捨て Postgres の起動 → 全マイグレーション → 権限付きの検証ユーザー。

```bash
npm run verify:up      # 立ち上げ (既にあれば再利用。冷えた状態から 4 秒ほど)
source /tmp/onair-verify/env.sh
npm run verify:down    # 止める (データは残る)
npm run verify:fresh   # 作り直す
```

**本番/dev の DB とは完全に別**（ポート 5433 / `/tmp/onair-verify` / DB 名 `onair_verify`）。
環境分離ポリシーどおり、検証がそれらに触れることは無い。

## 検証ユーザー

開発モードの認証は **Bearer ではなく `x-user-id` ヘッダー**。

| id | 役割 | 権限 |
| --- | --- | --- |
| `v-admin` | system_admin | 全部 |
| `v-sales` | staff | `sales` editor |
| `v-keiri` | staff | `budget` editor |
| `v-none` | staff | なし |

権限の切り分け（見える／書ける／見えない）は毎回この 4 人で確かめる。

## 毎回踏んでいた落とし穴

- `initdb` / `postgres` は **root では動かない**。`postgres` ユーザーで実行する。
- サーバーが読む接続情報は **`DATABASE_URL` の 1 本だけ**。`DB_HOST` などの分割変数は読まない。
- `user_permissions` の列は **`access_level`**（`level` ではない）。`id` は **既定値なしの TEXT 主キー**なので明示する。
- `users.role` の CHECK は **`system_admin` / `staff` の 2 値のみ**。
- `JWT_SECRET` は **32 文字以上**。短いと起動時に使い捨ての鍵が生成され、発行したトークンが次の起動で無効になる。
- `projects.customer_id` は **NOT NULL**。顧客なしの案件は作れない。
- 金額は **税抜で保持**。消費税と支払額は表示時に足す。

## HTTP の検証

`createApp()` を直接叩く。サーバーを別プロセスで立てなくてよい。

```ts
import request from 'supertest';           // なければ fetch + app.listen(0) でも可
const res = await request(app).get('/api/v1/internal/billing?month=2026-07')
  .set('x-user-id', 'v-keiri');
```

## 画面の検証

Playwright の Chromium はイメージ同梱。`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`。
**1440px と 375px の両方**で、横はみ出し 0px / JS エラー 0 件 / 禁止語 0 件 /
タップ領域 44px 以上、を毎回見る。

外部フォント（fonts.gstatic.com）はサンドボックスから取れず `ERR_CONNECTION_RESET` を出す。
**これは JS エラーではないので数えない**（数えると毎回偽陽性になる）。
