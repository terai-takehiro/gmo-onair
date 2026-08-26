# GMO ONAiR

GMOグローバルスタジオの制作管理プラットフォーム（会社OS）。
複数のブロックアプリを単一のモノレポで束ね、案件・財務・カレンダー・日常業務・機材・
制作技術支援（Qシート）・計時を **GLS番号**を中核に連携させる統合業務システムです。

**本番環境**: https://gmo-onair.jp
**検証環境**: https://dev.gmo-onair.jp
**現在のバージョン**: v4.4.9 — **リアルタイムCG（凍結中）のデモ用ダミーデータに、画像部分へ入るダミーの顔写真を追加した**（ユーザー要望「運用の際に画像部分にダミーの顔写真を入れられるようにしたい」）。`server/src/shared/db/seed-awards.ts` が開発・検証環境に自動投入するデモの37エントリは、これまで `photo_url` が未設定で、CG画面では初期文字だけのグラデーションプレースホルダー（`PortraitPlaceholder.tsx`）しか映らず、実際の放送CGの見え方をデモしづらかった。実在の人物写真は権利・プライバシー上使えないため、髪型・肌色・背景色をコードで組み合わせたイラスト調のアバター（架空の人物）をSVGで16種類生成し、通常の写真アップロードと同じ配信経路（`UPLOAD_DIR` 直下 + `/api/v1/internal/awards/images/:filename`）に載せて全37エントリに使い回しで割り当てた。検証: `npm run typecheck --workspace=server`・`npm run lint`・`npm run test`（1465件）を確認済み。実サーバー（検証用Postgres、フレッシュな状態から）で `db:seed:awards` を実行し、全37エントリに `photo_url` が入ること・再実行時にスキップされる（冪等性）ことを確認。実サーバーを起動して `GET /api/v1/internal/awards/images/dummy-avatar-01.svg` が `200 image/svg+xml` で返ること、公開エンドポイント `GET /api/v1/internal/awards/events/1/output` の各エントリに `photo_url` が入っていることも確認済み。生成したアバター画像をブラウザで実際にレンダリングし、見た目を目視確認済み。

旧 v4.4.8 — **PR #437（内覧会 来場予約の MCP ツールに update_inview_attendee を追加した）のマージ後の棚卸しを記録した**（コード変更なし）。作成からCI green まで約1分48秒、CI green から約3分29秒（作成から約5分17秒）でterai-takehiro本人が手動マージし、レビューが1件も付いていなかったことを `docs/reviews/codex-findings-v4.md` に記録した（`npm run reviews:debt` は今回も401で使えず、GitHub MCP で直接確認した）。 **PR #432（独自作成の番組の計時タイマー表示不具合を直した）のマージ後の棚卸しを記録した**（コード変更なし）。作成からCI green まで約1分50秒、CI green から約1分37秒（作成から約3分27秒）でterai-takehiro本人が手動マージし、レビューが1件も付いていなかったことを `docs/reviews/codex-findings-v4.md` に記録した（`npm run reviews:debt` は今回も401で使えず、GitHub MCP で直接確認した）。 **内覧会 来場予約の MCP ツールに `update_inview_attendee`（更新）を追加した**（ユーザー要望「ONAiRの内覧会関連ツールは『新規登録』と『一覧参照』のみで、既存レコードを更新・編集するツールを追加」）。`register_inview_attendee`（新規登録・同 email × 同 session_label のみ暗黙更新）と `list_inview_attendees`（一覧）はあったが、任意の登録を id 指定で直接更新する道が無かった。内部で既に使われていた `inviewService.update`（部分更新・session_label 変更時の日付/時間帯/対象の再抽出・companions の氏名突き合わせによる受付記録の引き継ぎに対応済み）をそのまま呼ぶ形で MCP ツールを新設し、権限ゲート（`dailyops` editor 以上）にも登録した。検証: `npm run typecheck --workspace=server`・`node scripts/generate-mcp-tools.mjs`（権限ゲート検証OK・112種に更新）を確認済み。

旧 v4.4.7 — **廃止したリアルタイムCG（client-awards）を「URLを叩けばアクセスできる」状態に戻した**（ユーザー要望「クローズしたリアルタイムCGですがURLを叩けばアクセスできるようにしてもらえますか」）。2026-08〜「廃止」（サーバー配信・API・Socket.IO・ビルド対象・トップページの入口をすべて外し、Webサイトのどこからも到達できない状態）にしていたが、`docs/v4-plan.md` の用語でいう一段手前の「凍結」（URLは生かすが、トップページのタイル・アプリ切替・左メニューには出さない）へ戻した。`client-awards/CLAUDE.md` の「復活させたいとき」に書かれていた手順のうち、`server/src/app.ts` の `serveApp('/awards', …)`・`server/src/routes/index.ts` の `createAwardsRoutes()`/`createQuizRoutes()`・`server/src/index.ts` の `initAwardsSocketIO()`/`initQuizSocketIO()`/`initInteractivePoller()`・`Dockerfile` の `build-client-awards` ステージと `production` への `COPY` の4点を戻した。`client/.../home/AppTiles.tsx` の `EVENT_KEYS` へ `awards` を戻す5点目だけは行わず、トップページのタイル・アプリ切替・左メニューには出さないままにした（コード自体も frozen:true のままのため、これらの画面には元々出ない）。ホームタイルにも出したい場合は別途対応が必要。**デモ用のダミーデータも投入した**（ユーザー要望「PRの前にデモンストレーションが可能な完全なダミーデータをある程度のボリュームで格納しておいてほしい」）。復活させても DB が空のままでは URL を開いても何も映らなかったため、他の `seed-*.ts` と同じ仕組みで `server/src/shared/db/seed-awards.ts` を新設し、開発・検証環境の起動時に自動投入されるようにした（本番は既存の仕組みどおり `SKIP_SEED=true` のため入らない）。イベント3件（開催中 `live`・終了済み `closed`・準備中 `draft` の3状態）・カテゴリ9本（直接選出 `direct` 7本・投票 `vote` 2本）・エントリ計37件、クイズ2問（正誤つき `quiz` モード1・投票のみ `survey` モード1、選択肢に投票数も投入）を用意した。開催中イベントは `awards_cue_state`・`awards_oneshot_cue_state` もあらかじめ「表示中」の状態まで進めてあるため、`/awards/*` を開いた瞬間から実際の画面が見える。検証: `client-awards`・`server` の型検査・ビルドに加え、実サーバー（検証用Postgres）を起動して `seed-awards.ts` の投入と再実行時のスキップ（冪等性）、`/awards/events`・`/events/:id`・`/events/:id/cg-status`・公開用 `/events/:id/output`（認証なし）が投入したダミーデータを正しく返すこと、`/awards/output/1` が200で返ることを確認済み。 **制作技術支援で案件に紐づけず「独自に番組作成」をすると、計時・視聴者（タイマー）のミニアプリが表示されなかった不具合を直した**（ユーザー指摘「独自に番組作成をした際に計時タイマーのアプリが表示されない」）。制作技術支援のトップ（`ProductionTopPage.tsx`）は「①案件管理の案件・番組を選ぶ」か「②案件管理に登録しない、ここだけの番組（`qsheet_programs`）を選ぶ」の2択だが、計時・視聴者が使う `liveops_programs.project_id` は `projects` テーブルだけを参照するFKで、②の番組に対応する列が無かった。そのため②で作った番組のハブ画面には計時・視聴者のタイル自体が出ず（`MiniAppTiles.tsx` が `scope === "project"` のときだけ表示）、直URLで開いても `useLiveProgram.ts` が `owner.kind !== 'project'` を検知して「案件からのみ開けます」と弾いていた（この制約は `12-live-timer-decision.md` に「既知の空白」として明記済みで、以前あった案件非依存のスタンドアロン新規作成という回避策もv4.1で意図的に廃止されていたため、②の番組から計時・視聴者に届く道が完全に無くなっていた）。`liveops_programs` に `qsheet_program_id`（`qsheet_programs` 参照・`project_id` とは同時に持たない CHECK。migration 237）を追加し、`POST /liveops/programs/resolve-by-program/:programId`（`resolve-by-project` と対になるエンドポイント）を新設。`useLiveProgram.ts` が owner の `kind`（`project`/`program`）に応じてどちらのエンドポイントを呼ぶか分岐するようにし、`MiniAppTiles.tsx` の計時・視聴者タイルもscopeを問わず出すようにした。あわせて、`project_id` が無いことだけを根拠に「案件に紐づかない旧スタンドアロン」と判定していた `LiveLegacyProgramsPage.tsx`（一覧の絞り込み）・`useLegacyProgramRedirect.ts`（旧URLの転送先判定）も、新しく `qsheet_program_id` が入っている行を誤って「紐づかない」扱いしないよう両方 NULL の行だけを対象にするよう修正した。検証: `npm run typecheck`・`npm run test` を確認済み（実サーバー・実DBでの動作確認はこのセッションから未実施）。 **PR #433（廃止したリアルタイムCGをURLアクセス可能に戻し、デモ用ダミーデータを投入した）のマージ後の棚卸しを記録した**（コード変更なし）。作成からCI green まで約2分40秒、CI green から約38秒（作成から約3分18秒）でterai-takehiro本人が手動マージし、レビューが1件も付いていなかったことを `docs/reviews/codex-findings-v4.md` に記録した（GitHub MCP で直接確認した）。

旧 v4.4.6 — **案件から請求書Excel（業務推進提出用）を出す道が、v4のいくつかの画面で無くなっていたのを直した**（ユーザー指摘「請求書のExcelが出力できなくなっている」）。バックエンドの `GET /revenues/:id/excel` 自体は生きていたが、v4でレガシーの全機能コンソール（`BusinessProjectView.tsx`）を新しい画面に置き換えたとき、見積書・請求書・検収書PDFの3ボタンは戻したのに、4つ目の請求書Excelボタンだけ戻し忘れていた。同じ抜けが3画面（案件詳細＞見積タブの「売上・請求」ペイン・⑤見積・請求（全案件）・財務②締め処理）にあり、Excel出力に届く道が、旧GLS-B月次案件とGPMの請求タブ（今も旧コンソールを使う）だけに残っていた。PDF発行の共通部品（`lib/docPdf.ts`／`DocPdfButton.tsx`）と同じ形で `downloadRevenueExcel` と `DocExcelButton` を新設し、3画面に既存のPDFボタンと並べて追加した（Excel出力はBOXに保存しないため、その旨をボタンの文言では言わないようにしている）。検証: 型検査・実サーバーで対象の売上IDに対する `/revenues/:id/excel` が200＋有効なxlsxを返すことを確認済み。**見積の版をアーカイブ（一覧から非表示に）できるようにした**（ユーザー要望「過去バージョンなどをアーカイブ化する機能をつけたい」）。見積は版を重ねるほど古い版が一覧に積み上がり、いま見たい版（最新のdraft・sent）が埋もれていた。`estimates.archived_at`（migration 236）を新設し、`status`（draft/sent/accepted/rejected/superseded）とは独立した「一覧に出すかどうかだけ」の印にした（アーカイブしても送付・受注の記録は変わらない）。既定の一覧はアーカイブ済みを除き、「アーカイブした版を表示する」で戻せる。案件詳細の見積タブ・GPMの見積タブ両方に対応（GPMもサーバー側は同じ `estimate.service.ts` を呼んでいるため）。EstimateTab.tsxが400行を超えたため、版の一覧描画を `EstimateVersionList.tsx` に分離した。検証: 実サーバー・実DBで作成→次の版作成→旧版アーカイブ→一覧から消える→表示切替で戻る→アーカイブ解除まで一通り確認（案件側・GPM側の両方）。`npm run test`（1465件）・型検査・lintを確認済み。**財務管理（売上・仕入台帳）の一覧行から案件を開くボタンが実質使えなくなっていたのを直した**（ユーザー指摘「一覧表示時に設定しているリンクへ飛べるボタンを追加（以前はあったもの）」）。共通の行部品 `LedgerRows.tsx` の型は「行を押すと案件が開く」とコメントされていたが、実際は編集権限のあるユーザーが行を押すと編集ダイアログが開くだけで案件へは行けず（`RevenueListPage.tsx`）、仕入では編集権限が無いユーザーが押しても何も起きなかった（`PurchaseListPage.tsx`）。行のクリック挙動（`onOpen`）とは独立した小さなリンクボタンを行内に追加し、`project_id` があれば誰でも案件を開けるようにした。検証: 型検査・実サーバーでデータの存在を確認済み（クライアントのみの変更のためブラウザでのクリック確認は未実施）。 **PR #429（見積のアーカイブ・請求書Excel出力・財務一覧の案件リンクを直した）のマージ後の棚卸しを記録した**（コード変更なし）。作成からCI green まで約2分2秒、CI green から約27分57秒（作成から約29分59秒）でterai-takehiro本人が手動マージし、レビューが1件も付いていなかったことを `docs/reviews/codex-findings-v4.md` に記録した（`npm run reviews:debt` は今回も401で使えず、GitHub MCP で直接確認した）。

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
| リアルタイムCG | [`client-awards/`](client-awards/CLAUDE.md) | — | **廃止**（コードは保存・配信停止） |
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
