# GMO ONAiR

GMOグローバルスタジオの制作管理プラットフォーム（会社OS）。
複数のブロックアプリを単一のモノレポで束ね、案件・財務・カレンダー・日常業務・機材・
制作技術支援（Qシート）・計時を **GLS番号**を中核に連携させる統合業務システムです。

**本番環境**: https://gmo-onair.jp
**検証環境**: https://dev.gmo-onair.jp
**現在のバージョン**: v4.5.2 — **プロジェクト管理（GPM）の MCP ツール一式整備・カレンダー週表の短い予約対応・案件台帳（57列）の整理（Phase A〜C）をまとめてリリースした**。①これまで1本も無かった GPM の MCP ツールを40種新設（プロジェクト・工程・タスク・見積・議事録・BOXフォルダのCRUD、かんばん列、体制の並び替え）し、直後のマルチエージェントレビューで見つかった権限漏れ（案件のBOXファイルが読めていた）・エラー握りつぶし・並び替えの検証漏れの3件も修正した。②カレンダー週表で短い予約（10分など）が読めなかったのを直し、なぞって新規登録・下端を引いて延長できるようにした。あわせて日またぎ予約の消失・重複予約の重なり・不正な時刻の保存など実在バグ多数を2弾に分けて修正した。③会場・スタジオの表記ゆれを機に案件台帳57列を棚卸しし、読み手ゼロの死んだ列10本の削除・実バグ6件の修正・会場入力のガードレール追加・受注/失注日時やステージ変更ロジックの一本化（Phase A〜C）を行った。

旧 v4.5.1 — **画面見出し（PageHeader）のタイトルが、右の操作ボタンが多い画面で1文字ずつ縦に潰れていたのを直した**（ユーザー報告のスクリーンショット: 案件を直す画面で「案件を直す」が「案件/を直/す」と3行に折り返れ、副題の案件名も幅180px程度に潰れていた）。原因は共通部品 `PageHeader`（`shared/src/client/ui/pageHeader.tsx`）のタイトル枠が `flex-1`（= `flex-basis: 0%`）だったこと — flex-wrap の行分け計算で**見出しの幅が0と数えられ**、補助操作（children）が多い画面（案件を直すは9ボタン）では同じ行に押し込まれて見出しが残り幅しかもらえなかった。実ブラウザ（Playwright + 検証用Postgres + 実サーバー）で再現し、1440pxでも副題が183pxに潰れることを実測で確認したうえで `flex-auto`（basis=内容の幅）に変更 — 入り切らないときは children が下の行へ折り返す（部品ドキュメントの「スマホでは見出しの下に折り返る」という約束どおりの挙動）。修正後を 1440/1100/375px で実測し、案件を直す（見出し全幅・ボタン折り返し・横はみ出し0）・案件一覧（タイトル横の切替と右端の主ボタンは従来どおり）・ダッシュボードに回帰がないことをスクリーンショットで目視確認済み。`PageHeader` は全アプリの v4 画面が使う共通部品のため影響範囲は shared。検証: `npm run typecheck:all`・`npm run test`（1519件）緑。 **財務②「請求・入金」の GLS番号列で、番号が長いと隣の案件名に重なって潰れて見えていたのを直した**（ユーザー報告のスクリーンショット: `GLS-A010-2608` のような回・エピソードコード付きの番号で文字が案件名と重なっていた）。原因は `RowSlot`（96px 固定幅の列）の中に置いたチェック枠/鍵アイコン＋番号の入れ子 flex に `min-w-0` が無かったこと — flex アイテムは既定で「中身の幅より縮まない」ため、`truncate` クラスを付けていても実際には省略記号が一切効かず、長い番号がそのまま列の外へ突き抜けて案件名の先頭と重なっていた（実ブラウザ・実DBで再現し、DOM実測で番号側のspanが127pxまで広がり96px枠を31pxはみ出していることを確認）。番号側のspanに `min-w-0 flex-1`、外側のラップspanに `min-w-0` を足し、96pxに収まってから省略記号（…）が出る形にした。同型のバグが案件管理⑤「見積・請求」（`InvoiceRows.tsx` のエピソードコード列）にもあったため同じPRで直した。検証: 実ブラウザ（Playwright・検証用Postgres・実サーバー）で修正前後をDOM実測し、96px枠にちょうど収まること・隣列との重なりが消えたことを確認。`npx tsc -b client`・`npm run lint`・`npm run test`（1519件）緑。 **財務⑥「受け取った書類」から見積書を除外した**（ユーザー指摘「見積書は除外したい。実際に台帳に入れるのは請求書になるので」）。この画面は見積書・請求書・注文書の3種を同じキュー（受信→確認中→承認→台帳に入れる）で扱っていたが、見積書は承認しても「台帳に入れる」の先（仕入・販管費）が無く、ワークフローを最後までたどれないまま溜まり続けていた。`financeDocService.list()`／`pendingCount()`（受け取った書類の一覧・バッジ）と、ホームの受信箱が読む `dashboard.routes.ts` の `FINANCE_DOC_BASE`（案件管理⑤受信箱・お待たせ中カウント）を同じ条件で揃え、`doc_type='quote'` を既定の一覧・件数から外した（`doc_type=quote` を明示すれば従来どおり読める＝記録は消さず監査経路のみ残す）。台帳への受け渡し（`doc-handoff.service.ts`）にも `doc_type='quote'` を弾くガードを追加し、画面をバイパスして渡そうとしても明確なエラーで止まるようにした（二重の防御）。画面の説明文・空状態の文言も「請求書・注文書」に合わせて修正し、MCP `record_finance_doc` の説明にも見積書がこの画面に既定で出ない旨を明記した。検証: 実ブラウザ・実サーバー（検証用Postgres）で見積書1件・請求書1件を投入し、一覧・受信箱・バッジ件数から見積書が消えること、`doc_type=quote` 明示指定では引き続き読めること、見積書への「台帳に入れる」が `QUOTE_NOT_HANDOFFABLE` で拒否されることを確認。`npx tsc -b client`・server typecheck・`npm run lint`・`npm run test`（1519件）緑。

旧 v4.5.0 — **PR #439（リアルタイムCGのデモ用ダミーデータにダミー顔写真を追加した）のマージ後の棚卸しを記録した**（コード変更なし）。作成からCI green まで約2分6秒、CI green から約49秒（作成から約2分55秒）でterai-takehiro本人が手動マージし、レビューが1件も付いていなかったことを `docs/reviews/codex-findings-v4.md` に記録した（`npm run reviews:debt` は未実行のため、GitHub MCP で直接確認した）。 **案件・タスク・AI・カレンダーの根源整理（Phase 1）を実装した**（ユーザー指摘「『お待たせ中』を含むこの辺りのロジックが意味不明・案件自動整理も不要判定ができずゴミが溜まり続ける — 本当に必要な要素をシンプルに全面設計し直すこと」。設計の正は `docs/core-redesign-plan.md`）。①**案件の健全性を「ステージ×次の一手」の2軸に一本化**: 新設 `project-health.ts` がステージ別停滞しきい値（ネタ30日/仮押さえ14日/見積提案14日/口頭決定7日）・生存証拠・健全性（期限超過/停滞/スヌーズ/健全）の唯一の定義を持ち、`GET /projects` が各行に `health`/`stalled_days`/`snooze_until` を返す（7日ハードコード3か所を撤去）。一覧は3色の健全性バッジ＋「要整理」ビュー（次の一手/スヌーズ/見送り/失注の4アクション）に置き換え、スヌーズは `projects.snooze_until`（migration 238・日付必須・無期限不可）＋`PATCH /projects/:id/snooze` で設定/解除できる。②**自動整理を三段構え（可逆・通知あり・削除しない）で新設**: 日次ジョブ `project_tidy` が、生存証拠の無いネタを60日で起票者へ整理候補として通知→90日で「自動整理（長期放置）」として履歴付きで見送りに動かし（対象はネタのみ・誤爆防止）、`event_end` を過ぎた受注案件を履歴付きで完了へ繰り上げる（`GET /dashboard/check-completed` の生 UPDATE 依存を廃止）。失注理由マスタに「見送り（案件化せず）」「自動整理（長期放置）」を追加し、見送りと失注を分けた。③**「お待たせ中」を「受信箱」に改名し作り直し**: 4種混在の1本リストを種類ごとの節に分け、全行にその場のアクション（AI起票ネタ=「不要」→1クリックで見送り＝却下が AI の教師データになる・期限超過=「済んだ」）を置き、脚注「残りN件」を実数（counts）ベースに直して件数の食い違いを解消した。④**タスク期限を `due_at` に一本化**: 読み手は全員 `COALESCE(due_at, due_date+18:00)`・書き手は全員 `due_at` を書く形に統一し、投入口・依頼・GPM 由来のタスクが「期限なし」になり期限前通知（tk_due）が絶対に飛ばなかった穴を塞いだ（リンク先も `/daily/tasks` に修正）。依頼（delegation）に通知3種（作成/承諾・辞退・相談/再割当。migration 239）を追加し、全案件タスク一覧・GPM 一覧が private タスクを担当者以外に返していた漏れも塞いだ。⑤**カレンダーに「タスクの期限」レイヤー**（新API `GET /dailyops/tasks/deadlines`・自分の未完了のみ）を追加し、ダッシュボードの週間予定にも期限を併載。⑥**メール取込2種の無修正時に正解ラベル（type:'none'）を書かないバグを修正**（無修正採用率が構造的に常に0だった）。⑦**ステージラベルを `shared/src/constants/statuses.ts` の1系統に統一**（client/MCP の4系統分裂を解消）。検証: `npm run typecheck:all`・`npm run lint`・`npm run test`（shared の新テスト31件含む）緑、検証用 Postgres で migration 238/239 の適用と冪等性を確認。 **PR テンプレートの「凍結アプリ」欄が古いままだったのを直した**（ユーザー指摘「client-techops/ は凍結ではないし、計時LIVEはアプリマージされて機能はもう復活している。Readme含めたドキュメント記載やルールが正しくない」）。`.github/pull_request_template.md` の「凍結アプリ (Qシート / 計時LIVE / リアルタイムCG) を触った場合」の節と「影響範囲」の凍結チェックリストが、制作技術支援（Qシート）・計時・視聴者（計時LIVE）を今も凍結アプリとして挙げていたが、ルート `CLAUDE.md`「ブロックアプリ一覧」・`shared/CLAUDE.md`（「凍結アプリは0個になった（v4.2.0時点）」）の実態と食い違っていた（制作技術支援は v4.1 段3で凍結解除・計時・視聴者は共通シェル＋v4トークンへ載せ替え済み。凍結中なのはリアルタイムCG（`client-awards/`）だけ）。節見出しをリアルタイムCGだけに絞り、制作技術支援・計時・視聴者は「v4.0.0 の対象」チェックリストへ移し（それぞれの残作業・例外（計時・視聴者は表示画面 `/live/display/` だけ見た目を変えない）を1行で明記）、経緯をコメントで残した。README.md・ルート CLAUDE.md 本体は元々正しい記載だったため変更不要。 **PR #442（案件・タスク・AI・カレンダーの根源整理 Phase 1）と PR #443（PR テンプレートの凍結アプリ欄修正）のマージ後の棚卸しを記録した**（コード変更なし）。#442 は作成からCI green まで約2分3秒、CI green から約15分19秒（作成から約17分22秒）、#443 は作成からCI green まで約2分3秒、CI green から約1分37秒（作成から約3分40秒）で、いずれもterai-takehiro本人が手動マージし、レビューが1件も付いていなかったことを `docs/reviews/codex-findings-v4.md` に記録した（`npm run reviews:debt` は未実行のため GitHub MCP で直接確認した）。 **案件・タスク・AI・カレンダーの根源整理（Phase 2）を実装した**（設計の正は `docs/core-redesign-plan.md` の Phase 2。Phase 1 = v4.4.6 の続き）。①**「今日の営業」カードを案件管理ダッシュボードの主役にした**: 新API `GET /dashboard/today-sales` が「期限が来た次の一手（超過＋今日）・今日スヌーズ明け（過去7日帯）・止まり始めた案件（stalled）」の3集合を1回で返し（判定は Phase 1 の `project-health.ts` を import 再利用・GLS-A 限定）、PC はページ最上部・スマホも最上部に同カードを置いた。同じ集合を2枚で数えないよう旧「期限超過の次の一手」パネル（OverduePanel）は削除し、「済んだ」ボタン・行クリックの導線は引き継いだ。GPM 一覧の行にも `health`/`stalled_days`/`snooze_until` を追加し、「おすすめ順」の停滞判定を旧 `STALE_DAYS`×更新日時の近似から健全性の単一定義に置き換え、3見え方（リスト/カード/ボード）に健全性バッジを付けた（`STALE_DAYS` は削除）。②**AI活動ページ（/settings/ai-activity）＋営業側の月次AIレビューを新設**: 新API `/ai-activity`（digest/recent/reviews・営業系9種+デイリーニュースのみ受け付け qsheet 系は構造で秘匿）を人間向け画面にし、直近の出力（無修正採用/修正あり/却下/未確認の状態バッジ）・kind ごとの無修正採用率とよく直される項目・月次レビューの確認打刻（sales manager）を1画面で見せる。夜間ジョブ `sales_ai_review`（月1・03:35）が営業系 AI 出力の digest から `ops_reports` に月次レビュー下書きを起こし営業マネージャーへ通知する（migration 241）。デイリーニュースの AI 投稿（`add_ops_report_items`）も `ai_outputs` に記録して採用/削除がループに乗るようにし、AI 経由の起票系ツール6種に `prompt_version` を通せるようにした。制作技術支援には AIナレッジ承認ページ（/techops/ai-knowledge・manager が draft を承認/却下すると版が進んで次の生成に載る）を追加。③**依頼のコメントスレッド・担当割当・ICSカレンダー連携**: 依頼タスクに当事者だけが読み書きできるコメント（`task_comments`・migration 240・相手方に通知 dg_comment）を付け、承諾/辞退のメモも description 追記からコメントに変えた。標準工程の適用ダイアログと議事録の持ち帰り行で生成時に担当者を選べるようにした（選ばなければ従来どおり未割当）。個人のタスク期限を外部カレンダーに出す ICS フィード（`user_task_feed_tokens`・`/schedule/task-feeds/:token.ics`・設定→通知で発行/再発行）を追加した。検証: `npm run typecheck:all`・`npm run lint`・`npm run test` 緑、検証用 Postgres で migration 240/241 の適用と冪等性、実サーバーで today-sales・ai-activity・コメントの403・ICS 配信・月次レビュー下書き作成を実測。 **PR #444（棚卸し記録）と PR #445（根源整理 Phase 2）のマージ後の棚卸しを記録した**（コード変更なし）。#444 は CI green から約1時間12分後、#445 は作成からCI green まで約2分12秒・CI green から約8分15秒（作成から約10分27秒）で、いずれもterai-takehiro本人が手動マージし、レビューが1件も付いていなかったことを `docs/reviews/codex-findings-v4.md` に記録した（`npm run reviews:debt` は未実行のため GitHub MCP で直接確認した）。

旧 v4.4.9 — **リアルタイムCG（凍結中）のデモ用ダミーデータに、画像部分へ入るダミーの顔写真を追加した**（ユーザー要望「運用の際に画像部分にダミーの顔写真を入れられるようにしたい」）。`server/src/shared/db/seed-awards.ts` が開発・検証環境に自動投入するデモの37エントリは、これまで `photo_url` が未設定で、CG画面では初期文字だけのグラデーションプレースホルダー（`PortraitPlaceholder.tsx`）しか映らず、実際の放送CGの見え方をデモしづらかった。実在の人物写真は権利・プライバシー上使えないため、髪型・肌色・背景色をコードで組み合わせたイラスト調のアバター（架空の人物）をSVGで16種類生成し、通常の写真アップロードと同じ配信経路（`UPLOAD_DIR` 直下 + `/api/v1/internal/awards/images/:filename`）に載せて全37エントリに使い回しで割り当てた。検証: `npm run typecheck --workspace=server`・`npm run lint`・`npm run test`（1465件）を確認済み。実サーバー（検証用Postgres、フレッシュな状態から）で `db:seed:awards` を実行し、全37エントリに `photo_url` が入ること・再実行時にスキップされる（冪等性）ことを確認。実サーバーを起動して `GET /api/v1/internal/awards/images/dummy-avatar-01.svg` が `200 image/svg+xml` で返ること、公開エンドポイント `GET /api/v1/internal/awards/events/1/output` の各エントリに `photo_url` が入っていることも確認済み。生成したアバター画像をブラウザで実際にレンダリングし、見た目を目視確認済み。

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
