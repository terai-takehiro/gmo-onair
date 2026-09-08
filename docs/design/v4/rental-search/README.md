# レンタル機材検索 — UIモックアップ（制作技術支援のミニアプリ）

> **状態**: 実装済み（記録）
> **最終確認**: 2026-09-08（v4.6.10）
> **位置づけ**: 起こした時点（実装前）のモック。実装は `client-techops/src/pages/rental/`（migration 228〜231）。機材管理の左メニューにも「レンタル機材検索」の入口がある（`client-equipment/src/components/layout/nav.ts`）

映像機材レンタル会社2社（東京オフラインセンター／レスター）の機材を横断検索し、
番組・案件ごとの「予約リスト」（社内メモ）にまとめ、会社ごとの依頼メール文を
組み立てる **ミニアプリの実装前モックアップ**。データの出どころは
レンタル機材DB化プロジェクト（2社サイトを毎朝クロールして `rental_items.db` に集約。
スキーマ: `items(company, item_id, …)` 主キー `(company, item_id)`）。

## 画面の流れ

```
番組・案件のハブ（JourneyPage）にタイル「レンタル機材」を1枚追加
  → ① 機材検索  Main.dc.html（PC）／ Mobile.dc.html（スマホ 390px）
  → ② 機材詳細  Detail.dc.html（モーダル。仕様・写真・おすすめオプション・期間と数量）
  → ③ 予約リスト Reserve.dc.html（会社ごとにまとまる。未依頼／依頼済みの状態を持つ）
  → ④ 依頼メール Mail.dc.html（ひな形から本文を組み立て。コピー or mailto で開く）
```

## 決めごと（案・モックに描いたもの）

- **「予約」は社内メモ。** 各社の在庫は押さえない。確定は依頼メールへの各社の返信で行う
- **同じ期間に他番組が同じ機材を依頼予定なら警告バッジ**を出す（③の1行目）
- **会社は必ず区別する**（DB の `company` 列）。バッジ色: 東京オフラインセンター = 青
  （primary 系）、レスター = 藍（info 系）
- 価格表示: TOC は「ネット受付」を主・「電話受付」を従で併記。レスターは単一価格（税込）
- **メールは送信しない。** 本文を組み立てて「コピー」または「メールアプリで開く」（mailto）だけ。
  未確定の値（担当者名・住所・署名）は本文中でオレンジのプレースホルダにする
- クロール由来の `change_log`（status=missing）は「掲載終了の可能性」バッジで見せる（①）
- 一覧下に取得時刻を常時表示（「毎朝5時に自動取得 ・ 価格・掲載は各社サイトが正」）

## 見た目

v4 のトークンどおり（LINE Seed JP・#005bac・カード角丸14px・ボタン10px・
型スケール `_tokens.md`）。共通シェル（上辺バー64px＋左メニュー248px）に載る前提。

## ファイル

各 `.dc.html` が1アートボード。`canvas.json` が配置。ブラウザで直接開いても見られる
（`support.js` 同梱）。デザインキャンバス（Artifact）として公開済みのものが正。

## 実装状況

- **API・4画面は実装済み。** `server/src/contexts/qsheet/routes/rental.routes.ts` が API、
  `client-qsheet/src/pages/rental/`（`RentalSearchPage.tsx` / `RentalItemDetailDialog.tsx` /
  `RentalReservationsPage.tsx` / `RentalMailPage.tsx`）が①検索〜④依頼メールの4画面。
- **DB取り込みも実装済み。** `rental-scraper/`（2社サイトのクロール → `rental_items.db` →
  本体 Postgres の `qsheet_rental_items` への同期）。**検証環境では main へのマージのたびに
  自動実行される**（`rental_scraper_dev` コンテナ・`docker-compose.yml` / `deploy.yml`）。
  本番はまだ自動化していない。詳細は
  [rental-scraper/README.md](../../../../rental-scraper/README.md) を参照。
- **開発・検証環境では rental-scraper を動かさなくても画面確認できる。**
  `server/src/shared/db/seed-rental.ts`（`qsheet_rental_items` にサンプル機材8件を投入。
  本番は `SKIP_SEED=true` のため実行されない）がクロール結果の代わりになる。
