# GMO ONAiR

GMOグローバルスタジオの制作管理プラットフォーム（会社OS）。
複数のブロックアプリを単一のモノレポで束ね、案件・財務・カレンダー・日常業務・機材・
制作技術支援（Qシート）・計時を **GLS番号**を中核に連携させる統合業務システムです。

**本番環境**: https://gmo-onair.jp
**検証環境**: https://dev.gmo-onair.jp
**現在のバージョン**: v4.5.25 — 案件を「受注済」にしないと売上・仕入の見通しを把握できず、受注前案件を含めた営業見通し・粗利見込みが分からなかった。案件フェーズごとに「受注確度（%）」を持たせ（初期値: E問い合わせ10%／D要件確認25%／C見積・提案50%／B決定見込み80%／A受注済100%。設定「お金のルール」画面から調整可能・`project_stage_probabilities`テーブル、migration 276）、財務ダッシュボードに「営業見通し（パイプライン）」カードを新設し、フェーズを問わず登録済みの売上・仕入予定額を「総額」（フェーズに関係なく100%で合算）と「確度加味」（フェーズごとの確度を掛けて合算）の2通りで切り替えて確認できるようにした（売上見込み・仕入見込み・粗利見込み・粗利率の4指標。`GET /pipeline-forecast`）。売上・仕入の新規登録自体は v4.5.23 で全フェーズ（失注を除く）へ既に開放済みだったため変更なし。検証: 新規マイグレーション（276番）を検証DBに適用、`server`/`client`の型チェック、`shared`のVitest 1996件全通過。

旧 v4.5.24 — **PR #552（案件管理＞回の削除・見積のひとまとまり化・回のフェーズ・売上仕入の全ステージ登録）のレビュー棚卸しを記録した**（決めごと: [docs/branching.md](docs/branching.md) 「マージしたら、その PR のレビューを棚卸しに移す」）。⚠️ **CI green から約6分後にユーザー自身がマージし、`get_reviews`・`get_review_comments`・`get_comments` とも0件**（API で直接確認。`npm run reviews:debt` はこの環境のトークンでは401）。29ファイル・+846/−488行、migration 1本（`estimates.episode_id`廃止・`estimate_episodes`新設・`episodes.stage`追加・`episode_unit_price`廃止）を含む変更にレビューが届いていない。実装時に意図して残した未検証事項（実ブラウザでのPC/スマホ確認なし・権限別403の画面確認なし・`npm run build`/`verify:ui`未実行）は [docs/reviews/codex-findings-v4.md](docs/reviews/codex-findings-v4.md) の一覧に書き出した。 **財務ダッシュボードの内訳クリックをモーダル表示に戻し、見積の売上登録を取り消せるようにし、回登録の話数重複バグを直した**（9/4 ご依頼・マルチエージェント調査）。①財務ダッシュボードの一覧で仕入・販管費の内訳行を押すと台帳ページへ遷移し、背景の一覧画面ごと切り替わっていた（`?edit=<id>` で台帳側の編集ダイアログを開く実装だったため）。行はすでに1件分のデータを持っているので、遷移をやめてこの画面のまま閲覧専用モーダル（`PurchaseDialog`/`SgaDialog` の `readOnly`）を重ねるだけにした（売上の内訳行は従来どおり台帳へ遷移）。②案件管理の見積タブで、見積から売上へ一度登録すると取り消す手段が無く、誤登録や見積の更新後の登録し直しに対応できなかった。`estimate.service.ts` に `revertToEstimate` を新設し、登録した売上をソフトデリートして `estimates.revenue_id` を外す（見積の明細・金額はそのまま残る）。`convertToRevenue` と同じガード（配分グループに入っている売上・請求書発行や検収・入金が済んだ売上は戻せない）を掛け、sibling reuse で複数版が同じ売上を指しているケースも売上ID起点で一括して外す。見積タブに「取り消す」ボタンを追加（`POST /projects/:projectId/estimates/:id/revert-to-estimate`）。③回を全部削除した状態で登録し直すと「他の操作と同時に重なったため、話数が重複しました」という誤ったエラーが出て登録できなかった。`episode_number` は migration 260/267 で「削除済みは空き番号扱い」の partial unique index (`deleted_at IS NULL`) に直していたが、`episode_code`（GLS番号+話数の文字列コード）の一意制約だけが素の `UNIQUE`（`deleted_at` を見ない）のまま残っていたため、削除済みの回と同じ話数で登録すると `episode_code` の一意制約に本当にぶつかっていた。migration 275 で `idx_episodes_code_unique`（`deleted_at IS NULL` の partial unique index）に置き換え、`migrate.ts` の起動時チェックにも対称に追加した。検証: 新規マイグレーション（275番）、`server`/`client` の型チェック、`shared` の Vitest 1996件 全通過。 **PR #555（財務ダッシュボードの詳細モーダル化・見積の売上取消・回の話数重複バグ修正）のレビュー棚卸しを記録した**（決めごと: [docs/branching.md](docs/branching.md) 「マージしたら、その PR のレビューを棚卸しに移す」）。⚠️ **CI green から約22秒後にユーザー自身がマージし、`get_reviews`・`get_review_comments` とも0件**（API で直接確認。`npm run reviews:debt` はこの環境のトークンでは401）。14ファイル・+312/−76行、migration 1本（`episodes.episode_code` の一意制約を `deleted_at IS NULL` の partial unique index に置き換え）を含む変更にレビューが届いていない。調査は3体の並列サブエージェントに委譲したが実装は自分で書いた。意図して残した未検証事項（実ブラウザでのPC/スマホ確認なし・権限別403の画面確認なし）は [docs/reviews/codex-findings-v4.md](docs/reviews/codex-findings-v4.md) の一覧に書き出した。

旧 v4.5.23 — **案件管理＞回を「削除できる」「ひとまとまりの見積」「回ごとのフェーズ」に作り直し、売上・仕入はフェーズを問わず登録できるようにした**。①一度登録した回を削除できるようにした（サーバーの `DELETE /episodes/:id` 自体は前からあったが画面にボタンが無かった。**売上・仕入がすでに紐づく回は 409 で削除を止める**ガードも新設）。②見積は「回ごと」の単数の紐づけ（`estimates.episode_id`）をやめ、**`estimate_episodes` 中間テーブルで多対多**にした——1日で複数本撮った日は、その日ぶんをまとめて1本の「ひとまとまりの見積」として作れる（見積タブに「複数の回をまとめて見積をつくる」を追加、「別の回として複製する」も複数選択に対応）。③**「回の単価」という概念そのものを廃止**した（`episodes.episode_unit_price` 列を削除）——複数本撮ると回あたりの単価が下がるため固定の単価は成立せず、回の一括登録3経路（話数指定・日付指定・頻度指定）が単価入力から確定売上を自動作成していた挙動もあわせて廃止（金額は見積・確定売上そのものが持つ）。④回ごとに**フェーズ**（`stage`。案件の受注ステージと同じ語彙・NULL可）を設定できるようにした。⑤売上・仕入の新規登録画面の案件プルダウンを、受注確定済み（A受注済以降）だけの絞り込みから**失注(E失注)以外の全ステージ**に広げた（`GET /projects/registerable-projects` を新設・精算PDF取込レビュー等ほかの4画面が使う「受注確定済みだけ」の絞り込みは変えていない）。検証: 新規マイグレーション（274番）を検証DBに適用、`server`/`client` の型チェック、`shared` の Vitest 1996件（列を落としたSQLが残っていないかを見る `droppedColumns.test.ts` を含む）全通過。

旧 v4.5.22 — **マルチエージェントで徹底調査し、財務・案件管理・カレンダーの9/3依頼9項目を実装した**。案件フェーズに「A受注済」と「完了」の間の中間ステージ「実施済（財務処理中）」を新設し、BOXの完了フォルダへの移動は財務処理後（完了）まで発火しないようにした。見積の値引き項目行の自動生成、「案件を直す」の保存ボタンが押せない不具合、案件概要のリロード反映漏れ（再発）、GLS発番への「リアルイベント」追加も合わせて直した。財務は取引先マスターに与信限度額・最新与信確認日を追加し、ダッシュボードの仕入・販管費を内訳行からそのまま編集できるようにした。カレンダーは仮抑えに「何番手か」を登録できるようにした。

> それより前の版の履歴（全件）は [docs/version-history.md](docs/version-history.md) にあります
> （画面ヘッダーの時計アイコンからも全件見られます。この節に残すのは旧3件だけ —
> リリース時に `npm run release:notes` が自動で古い分を落とします）。

---

## ブロックアプリ構成

アプリごとの決めごとは各ディレクトリの `CLAUDE.md` に、最新の一覧表はルート
[`CLAUDE.md`](CLAUDE.md)「ブロックアプリ一覧」にあります。要点だけ:

| アプリ | ディレクトリ | 公開パス | 状態 |
|---|---|---|---|
| 案件管理・財務管理・カレンダー・設定 | [`client/`](client/CLAUDE.md) | `/` | 稼働 |
| 日常業務 | [`client-daily/`](client-daily/CLAUDE.md) | `/daily/` | 稼働 |
| 機材管理 | [`client-equipment/`](client-equipment/CLAUDE.md) | `/equipment/` | 稼働 |
| 制作技術支援（Qシート） | [`client-techops/`](client-techops/CLAUDE.md) | `/techops/`（旧 `/qsheet/` も後方互換） | 稼働（表本体の v4 化が残） |
| 計時・視聴者 | [`client-live/`](client-live/CLAUDE.md) | `/live/` | 稼働（制作技術支援のミニアプリ） |
| リアルタイムCG | [`client-awards/`](client-awards/CLAUDE.md) | `/awards/`（URL直打ちのみ） | **移行中**（→ 制作技術支援＞テロップCG。一覧・メニューには出さない） |
| 共通ライブラリ | [`shared/`](shared/CLAUDE.md) | — | 全アプリの土台 |

外部リンク（別 VPS・別タブ）: [インタラクティブ](https://interactive.gmo-onair.jp/)・[翻訳](https://gmo-translate.jp/)

全アプリは同一ドメインで配信され、Nginx のパスルーティング + Express の静的配信で分岐します。
認証と API は共通（`/api/v1/internal/*`）です。

---

## 技術スタック

- **フロントエンド**: React 18 + Vite 6 + TypeScript + TailwindCSS 3 + shadcn/ui +
  TanStack Query + Zustand + React Router v6
- **バックエンド**: Node.js + Express + TypeScript + PostgreSQL 16（`pg`）
- **リアルタイム**: Socket.IO（`/techops` — 旧 `/qsheet` とは常時相互中継のブリッジ構成 — ほか各名前空間）
- **認証**: `AUTH_MODE`（環境変数 > `NODE_ENV` 既定）で切替 — 本番は Email/Password + SMS 2FA、
  検証・開発は mockAuth（ユーザーカード選択式）。Google 連携はカレンダー用
- **インフラ**: Docker Compose + Nginx + Let's Encrypt / CoNoHa VPS（本番・検証を単一 VPS で並走）
- **モノレポ**: npm workspaces / ローカル開発は Dev Containers

---

## 開発の始め方

環境構築から PR までの詳しい手順は [CONTRIBUTING.md](CONTRIBUTING.md)。

```bash
npm install
npm run verify:up      # 検証用 Postgres（ポート5433・本番と完全分離）
npm run dev            # 主要アプリ + server（全アプリは dev:all）
```

```bash
npm run typecheck      # 型チェック（CI は typecheck:all）
npm run lint           # eslint + 文書リンク・changelog 等の検査
npm run test           # shared の Vitest（CI が回す・手元の gate にも入れる）
npm run build:changed  # 変更したワークスペースだけビルド
npm run verify:ui      # 実ブラウザで書体・桁揃い・横はみ出しを実測
```

---

## デプロイ

手順は [docs/branching.md](docs/branching.md)、仕組みは [docs/deploy-pipeline.md](docs/deploy-pipeline.md)。要点:

| やりたいこと | 操作 |
| --- | --- |
| 検証環境 (dev.gmo-onair.jp) に出す | **`main` に PR をマージする**（自動デプロイ） |
| 特定ブランチだけ検証環境で見る | Actions → **Preview** → ref を入力（本番には出せない） |
| **本番 (gmo-onair.jp) に出す** | GitHub で **Release（タグ `vX.Y.Z`）を公開する** |
| 本番を戻す | Releases から**1つ前のタグの Deploy を再実行** |

ビルドは GitHub Actions 上で行い、イメージを GHCR (`ghcr.io/terai-takehiro/gmo-onair`) に
push、VPS は pull してコンテナを差し替えるだけです（VPS 上ではビルドしません）。

---

## ブランチ運用

**正は [docs/branching.md](docs/branching.md)。** GitHub Flow ＋ リリースタグです。

- **長く残るブランチは `main` だけ。** 直接 push 禁止（PR のみ・**Squash マージ固定**）
- **`main` は本番ではありません。** `main` = 検証環境／本番はタグが指すコード
- 作業ブランチは `feature/<Issue番号>-<短い名前>`（`fix/` `chore/` `docs/`）。数日で PR にして消す
- PR タイトルは `種類(アプリ): 何をしたか`（例 `feat(equipment): 機材台帳を v4 の見た目にした`）

### バージョン管理

**リリースするときだけ**上げます。作業 PR は版番号を触らず、`docs/changelog.d/` に
載せたい文を1つ置きます（`npm run lint` が強制）。リリース時は
`npm run release:notes -- X.Y.Z` が次の3か所を更新し、`npm run check:version` が整合を検査します:

1. ルート `package.json` の `version` ← **唯一の情報源**
2. `CLAUDE.md`「## 現在のバージョン」の先頭に1行追記（4件目はアーカイブへ）
3. `README.md` の「現在のバージョン」（この文書の冒頭・旧3件までに自動整理）

**各ワークスペースの `package.json` は更新しません**（どこからも読まれず、更新すると
Docker のビルドキャッシュが無効化されます）。

---

## ドキュメント

- **docs/ の目次**: [docs/README.md](docs/README.md) — 現役の正・生成物・作業場・archive の4分類
- **プロジェクトメモリ**: [CLAUDE.md](CLAUDE.md) — 開発方針・環境分離・セキュリティの決めごと
- **環境構築から PR まで**: [CONTRIBUTING.md](CONTRIBUTING.md)

---

## セキュリティ

- `.env` や認証情報は**絶対に Git にコミットしない**
- API キー・JWT シークレットをソースにハードコードしない
- 本番 DB と検証 DB は**完全分離**（相互参照・相互コピー禁止）
- 本番 DB への直接 SQL 操作は**最小限**（緊急時のみ）

詳細は [CLAUDE.md](CLAUDE.md) の「セキュリティポリシー」「環境分離ポリシー」。

---

## ライセンス

本プロジェクトは GMOグローバルスタジオ社内で利用するクローズドソースです。
