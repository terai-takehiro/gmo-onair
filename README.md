# GMO ONAiR

GMOグローバルスタジオの制作管理プラットフォーム（会社OS）。
複数のブロックアプリを単一のモノレポで束ね、案件・財務・カレンダー・日常業務・機材・
制作技術支援（Qシート）・計時を **GLS番号**を中核に連携させる統合業務システムです。

**本番環境**: https://gmo-onair.jp
**検証環境**: https://dev.gmo-onair.jp
**現在のバージョン**: v4.6.5 — **計上会社の接頭辞コードをGJVからSCSに変更し、認証・Socket・同時更新の整合性を修正した**。①2026年10月の事業再編で先に決めていたコンテンツスタジオ（グループ外案件の計上会社）の接頭辞コード「GJV」を「SCS」に変更した（GSS・GMOは変更なし）。設計文書・型定義・MCPツール・案件番号採番・隔週キープ・社内取引まわりを全面置換し、既存マイグレーションは書き換えず新規マイグレーションで安全に改名した（実データに発番実績は無く実害なし）。②無効化されたアカウントの既存セッション・OTP再送・共同編集/MCP認証を正しく拒否し、案件・台本の共同編集と本番タイマー／CG操作の権限をHTTP APIと同じ基準に揃え、OTP・招待・社内取引・機材貸出・セキュリティカード返却の同時操作での二重実行や履歴上書きを防いだ。検証: `npx tsc -b`・`npm run lint`・`npm run test`（shared Vitest 2240件）・認証/Socket/データ整合性の回帰テストいずれも通過。

旧 v4.6.4 — **「今日の営業」「受信箱」の期限超過の呼び名をビジネス用語に直し、行の中身が全文読めるようにした**。①案件管理ダッシュボード「今日の営業」の見出し「期限が来た次の一手」（将棋の比喩でビジネス文書に書けない語彙）と、受信箱（ホームの「受信箱」タブ・案件作成の「自動で届いたもの」レール）の同種バッジ「期限超過」を、`docs/wording.md` ルール9で決めていた置き換え先「期限超過の次アクション」に直した。②あわせて「今日の営業」の行1件ごとの中身が、AIが縮めた短い言い換え（`action_short`）だけでは何をすべきアクションか分からず概略すぎるというご指摘を受け、行の見出しは常に本文（次回アクションの全文）を出すように直した（短縮版は本文が無いときだけのフォールバックに降格）。③1行に収まらない分は、当初 `title` 属性のホバーだけで全文を読ませていたが、このカードをそのまま描く `MobileSalesDashboard`（タッチ操作）とキーボード操作の両方から全文を読む手段が無いという指摘を受け、実際に1行で切れているときだけ「続きを読む」の `<button>` を出す方式に直した（タップでもキーボード操作でも開閉でき、開くと折り返して全文を表示する）。受信箱側はもともと短縮していない本文をそのまま出していたため対象外（同じくホバーで全文を読めるようにした）。検証: `npx tsc -b client`・`npx eslint`（該当ファイル）ともエラーなし。`shared/tests/intakeInbox.test.ts`（18件）通過。

旧 v4.6.3 — **受付レールで「失注にする」を押すと画面が飛んでしまい、次々に見送れなかったのを直した。あわせて、案件になりえないメール（社内周知・設備連絡など）が案件受付レールに混ざる問題も直した**。①案件作成画面（受付を統合した画面）で自動で届いた引き合いを「失注にする」（見送る）と、押すたびに `/sales/dashboard` へ強制的に遷移していた（`useCreateProject.ts` の `drop` ミューテーション）。複数件を続けて見送る作業のたびに画面が飛び、都度レールへ戻る手間になっていた。押したあとは画面を移動せず、選択を外す（`?inquiry=` も付いていれば URL から外す）だけにし、レールの続きをそのまま選べるようにした。②「そもそも関係のないメールが投入される」というご指摘を受けて本番の `misc_inquiries` 実データ（16件）を確認したところ、中身自体は取材依頼・資料DLリード・社内周知・設備連絡・協業打診など実在の業務メールで、いわゆる迷惑メール・メルマガの混入は見当たらなかった。一方で、これらは全16件とも「見送り」で終わっており、原因は `GET /dashboard/inbox` が `misc_inquiries` の未仕分け全件をタグで絞らずそのまま案件受付レール（`IntakeRail.tsx`）へ渡していたこと — 決定表（`.claude/skills/mail-intake/`）自身が「案件にしない」と明言しているタグ（社内周知・設備・工事・協業・取材・メディア掲載・セキュリティ・採用・先の話・他スタジオ）まで、「ネタのまま残す／失注にする／案件にする」の3択を迫っていた。`dashboard.routes.ts` の `INQUIRY_BASE` にこれらのタグを除外する条件を追加し、案件受付のレールは案件化の芽があるものだけに絞った。除外したものは「入ってきた情報」一覧（`/daily/inquiries`。別の口 `GET /dailyops/inquiries*` を読むため無影響）には今までどおり残り、見送り・ストック・チケット化ができる。検証: `npx tsc -b client server`・`npx eslint` とも該当ファイルはエラーなし。検証用DB（`npm run verify:up`）に社内周知／設備／リード／タグ無しの4件を投入し、除外条件つきSQLを直接実行してリード・タグ無しの2件だけが残ることを確認した。③さらに「メールの種類に応じて適切な行き先に振り分けるべき」というご指摘を受け、`.claude/skills/ai-feedback-loop/` で監査したうえで対応した。AI が直接スタジオ予約（`create_studio_booking`）を作る案は、記録・修正差分・成果紐づけ・還流・レビューの5条件が軒並み未整備（会社方針「AIを使い捨てにしない」に抵触）で、かつ二重予約・部屋の競合という実害を伴うため見送り、フェーズ1（タグ強化＋画面誘導）だけを実装した。決定表（`.claude/skills/mail-intake/`）に、日程・場所が具体的でスタジオの予定表に登録すべきと読めるメール（現地調査・入室予定・搬入出予定など）へ `予定候補` タグを追加で付けるルールを足した（予約はAIが作らない）。「入ってきた情報」一覧（PC・スマホとも）は `予定候補` タグを色付きで目立たせ、「次のアクション」ボタンも「タスクにする」ではなく「カレンダーに登録する」を既定で強調するようにした（`state.ts` の `primaryActionFor`）。検証: `npx tsc -b client-daily`・`npx eslint`・`npm run lint`（全体）・`npm run test`（shared Vitest 2240件）すべて通過。

旧 v4.6.2 — ウィークリー活動報告（`/daily/weekly`）をモックから再設計し、対象週の追加・削除を作った。**構成を「生成工程の順」から「読み手の順」へ。** 自動集計 → AI の要約 → 週次トピックスという並びは AI が作る順序であって読む人の順序ではなく、見出しにも AI が2回出て画面の主語が中身ではなく生成元になっていた。**総括 → 主要指標 → トピックス → 詳細内訳** に組み替え、見出しは「総括」、AI の関与は本文下の署名（AI下書き／確定者名）に集約した。詳細内訳（パイプライン・営業活動の内訳・イベント・翌週予定）は既定で畳み、下書きのときだけ開く。状態表示は3種（下書き／未確認／AI作成）の並列をやめ、下書き／確定済みの1系統にした。**画面の主役を対象週にした。** 見出しが対象週そのもので、前後移動（◀ ▶）と 今週／先週 の表示を添える。左の週レール（`WeekRail`/`WeekPickerSheet`）は廃止し、一覧・追加・削除はシートに入れた。**週の追加は月次カレンダーから週行を選ぶ**（日付入力欄の直置きをやめた。作成済みの週がその場で分かるので重複作成にならない）。**削除**（`DELETE /dailyops/reports/:id`・`ops_reports.deleted_at` への論理削除）を新設し、下書きの週にだけ出す（確定済みは`assertReportOpen` が断る）。あわせて、**主要指標に前週比**を足し（`payload.stats.prev_week` に確定時点の比較値を同梱）、**下書きでスナップショットが無い週は集計を引き直す**ようにした（`GET /dailyops/weekly-stats`。以前は「集計はまだありません」の空欄で、総括を書く人が材料を見られなかった）。確定済みの週に書こうとしたときの断り文が実在しないボタン名（「確定を解く」）を案内していたので、画面のボタン名（「確定を取り消す」）に直した。設計の正は [docs/design/v4/mockups/weekly-redesign/](docs/design/v4/mockups/weekly-redesign/)（PC 閲覧・PC 作成・対象週の管理・スマートフォン・現行画面の5枚）。 **財務ダッシュボードのグループ内外表示・ステータス短縮、明細ページの列ソート、見積書コードの不一致を直した**。①財務ダッシュボードで絞り込んでいる状態のまま「グループ内案件」「グループ外案件」の売上・仕入（変動原価まで）が分かるようにしてほしいというご要望に応え、`monthly-summary.service.ts` に案件の `customer_type` 別の内訳（`revenue_internal`/`revenue_external`/`purchase_internal`/`purchase_external`）を足し、ダッシュボードに新しいカード（`GroupSplit.tsx`）を追加した。総額／確度加味どちらのモードでも効く（固定原価は特定のお客様に紐づかないため対象外）。②仕入・販管費の申請ステータスの文言（「金額はまだ仮」「金額確定・精算まだ」「金額確定・精算申請済」）が台帳の状態列（96px固定）に収まらず見切れていた不具合を、以前の短い文言「仮」「確定：未申請」「確定：申請済」に戻した（`ledger/settlementState.ts` 1本に集約。狭い列向けに別途縮めていた `compactSettlementLabel` は不要になったため削除）。③売上・仕入・販管費の明細ページで、列見出しをクリックして昇順・降順に並び替えられるようにした。サーバー側の並べ替え（`list-query.ts` の `build{Revenue,Purchase,Sga}Order`）は既に実装済みだったが3画面ともクエリに渡していなかっただけで、案件一覧と同じ表頭クリックの作法（`ledger/sort.ts`・`LedgerRows.tsx` の `HeaderLabel`）を配線した。Excel書き出しも画面の並び順のまま出るようにした。④見積書で自動採番される「見積書コード」（例 `GLS-A018-v3`）と、検収書PDFに表示される「見積書コード」が別ロジック（案件の売上連番＋税区分）で組み立てられ食い違っていた不具合を直した。検収書PDF生成時に、受注承認されてこの売上に変換された元見積（`estimates.revenue_id`。書き直しで複数版が同じ売上を指すことがあるため最新版を採る）から見積書PDFと同じ組み立て（GLS番号＋版）でコードを作り、`pdf.service.ts` にそちらを優先させた（見積を経ずに直接登録した売上は従来どおり請求KEYへフォールバック）。検証: `server`/`client` の型チェック・`npm run lint` はいずれも通過。4件とも検証用DBに実データを投入し、SQLクエリの実行結果・実APIレスポンス（ソート順）・生成したPDFのテキスト抽出（見積書コードの一致）で期待どおりの挙動を確認した。自動テストは追加していない（既存のVitestスイートに該当領域のテストが無く、今回も実データでの検証のみ）。

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
| リアルタイムCG | [`client-awards/`](client-awards/CLAUDE.md) | `/awards/`（URL到達不可） | **廃止**（→ 制作技術支援＞テロップCG。コードは参照用に保存のみ） |
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
