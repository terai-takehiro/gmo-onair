# GMO ONAiR

GMOグローバルスタジオの制作管理プラットフォーム（会社OS）。
複数のブロックアプリを単一のモノレポで束ね、案件・財務・カレンダー・日常業務・機材・
制作技術支援（Qシート）・計時を **GLS番号**を中核に連携させる統合業務システムです。

**本番環境**: https://gmo-onair.jp
**検証環境**: https://dev.gmo-onair.jp
**現在のバージョン**: v4.6.6 — **過去の一部の案件で「案件を編集」から GLS 番号を発番できなくなっていたのを直した**。①案件分類（`gls_category`）が未設定（AI起票・決算取込・Excel/GLS取込などで作られ、`project_type` も既定値 `'other'` のままの古い案件）を「案件を編集」で開くと、`useProjectForm.ts` が `project_type` から分類を推測して**フォーム上だけ**GLS-B（工事・構築）と誤判定し、「案件分類」欄そのものを隠したうえで「このプロジェクト（GLS-B）には客入れの有無と案件分類がありません」と案内していた。しかしサーバーの GLS 発番（`issueGls`）は DB の実値（NULL）を見て「案件分類（スタジオ／ビジネス）が未設定です」と拒否するため、画面の案内とサーバーの判定が食い違い、分類を入力する手段が無いまま発番できず編集不能に見えていた。②さらに深刻な点として、この誤判定を保存すると（`buildSavePayload` が `gls_category` を送信対象から除外していないため）GLS 未発番の案件は実際に DB の `gls_category` が `'B'` へ書き換わってしまう実害があった（サーバーの `allowCategoryUpdate` は未発番の間、送られた値をそのまま受け入れるため）。`project_type` からの分類推測ロジックを削除し、`gls_category` は常に DB の実値のみを見るように直した（未設定は GLS-A 扱い＝ `missingOf` の判定基準と統一）。同じ状態（分類未設定・未発番）にある案件はすべてこの1件の修正で直る。③Codexレビュー指摘（P1）を受けさらに直した — ①の直しだけでは「案件分類」欄が出るようになるだけで、そこに客入れの有無・案件分類を入力して保存しても `gls_category` 自体は空のまま送られ、DBはNULLを保持し続けるためGLS発番が引き続き失敗した。`gls_category` が未設定のまま2段（客入れの有無／案件分類）を新しく入力したら `'A'` を明示的に送るようにし、保存時にDBへ確定させた。検証: `npx tsc -b client`・`npx eslint`（該当ファイル）ともエラーなし。**あわせて v4.6.5 のバージョン履歴アーカイブ本文で、見出し・箇条書きの区切りが消えて読めなくなっていたのを直した**（Codexレビュー指摘、PR #639）。`npm run release:notes -- 4.6.5` で `docs/changelog.d/fix-security-consistency-review.md`（PR #636）のMarkdown 見出し「## 修正」「## 検証」と箇条書き「- 」を、`docs/version-history.md` の1エントリ＝1行のアーカイブ形式へ連結する際、改行だけが失われ記号がそのまま残り「## 修正- 無効化...」のように続き文として表示されていた（`RichDescription` は見出し・箇条書きを再分割しないため画面でも読めない）。見出しを太字、箇条書きを①②③④に置き換え、文として読めるように直した。この直しは当初PR #639自体に追加で積んだが、ユーザーがそのコミットが載る前に#639を先に手動マージしたため`main`にはまだ反映されておらず、改めて出し直した。検証: `node scripts/check-md-links.mjs` 通過。

旧 v4.6.5 — **計上会社の接頭辞コードをGJVからSCSに変更し、認証・Socket・同時更新の整合性を修正した**。①2026年10月の事業再編で先に決めていたコンテンツスタジオ（グループ外案件の計上会社）の接頭辞コード「GJV」を「SCS」に変更した（GSS・GMOは変更なし）。設計文書・型定義・MCPツール・案件番号採番・隔週キープ・社内取引まわりを全面置換し、既存マイグレーションは書き換えず新規マイグレーションで安全に改名した（実データに発番実績は無く実害なし）。②無効化されたアカウントの既存セッション・OTP再送・共同編集/MCP認証を正しく拒否し、案件・台本の共同編集と本番タイマー／CG操作の権限をHTTP APIと同じ基準に揃え、OTP・招待・社内取引・機材貸出・セキュリティカード返却の同時操作での二重実行や履歴上書きを防いだ。検証: `npx tsc -b`・`npm run lint`・`npm run test`（shared Vitest 2240件）・認証/Socket/データ整合性の回帰テストいずれも通過。

旧 v4.6.4 — **「今日の営業」「受信箱」の期限超過の呼び名をビジネス用語に直し、行の中身が全文読めるようにした**。①案件管理ダッシュボード「今日の営業」の見出し「期限が来た次の一手」（将棋の比喩でビジネス文書に書けない語彙）と、受信箱（ホームの「受信箱」タブ・案件作成の「自動で届いたもの」レール）の同種バッジ「期限超過」を、`docs/wording.md` ルール9で決めていた置き換え先「期限超過の次アクション」に直した。②あわせて「今日の営業」の行1件ごとの中身が、AIが縮めた短い言い換え（`action_short`）だけでは何をすべきアクションか分からず概略すぎるというご指摘を受け、行の見出しは常に本文（次回アクションの全文）を出すように直した（短縮版は本文が無いときだけのフォールバックに降格）。③1行に収まらない分は、当初 `title` 属性のホバーだけで全文を読ませていたが、このカードをそのまま描く `MobileSalesDashboard`（タッチ操作）とキーボード操作の両方から全文を読む手段が無いという指摘を受け、実際に1行で切れているときだけ「続きを読む」の `<button>` を出す方式に直した（タップでもキーボード操作でも開閉でき、開くと折り返して全文を表示する）。受信箱側はもともと短縮していない本文をそのまま出していたため対象外（同じくホバーで全文を読めるようにした）。検証: `npx tsc -b client`・`npx eslint`（該当ファイル）ともエラーなし。`shared/tests/intakeInbox.test.ts`（18件）通過。

旧 v4.6.3 — **受付レールで「失注にする」を押すと画面が飛んでしまい、次々に見送れなかったのを直した。あわせて、案件になりえないメール（社内周知・設備連絡など）が案件受付レールに混ざる問題も直した**。①案件作成画面（受付を統合した画面）で自動で届いた引き合いを「失注にする」（見送る）と、押すたびに `/sales/dashboard` へ強制的に遷移していた（`useCreateProject.ts` の `drop` ミューテーション）。複数件を続けて見送る作業のたびに画面が飛び、都度レールへ戻る手間になっていた。押したあとは画面を移動せず、選択を外す（`?inquiry=` も付いていれば URL から外す）だけにし、レールの続きをそのまま選べるようにした。②「そもそも関係のないメールが投入される」というご指摘を受けて本番の `misc_inquiries` 実データ（16件）を確認したところ、中身自体は取材依頼・資料DLリード・社内周知・設備連絡・協業打診など実在の業務メールで、いわゆる迷惑メール・メルマガの混入は見当たらなかった。一方で、これらは全16件とも「見送り」で終わっており、原因は `GET /dashboard/inbox` が `misc_inquiries` の未仕分け全件をタグで絞らずそのまま案件受付レール（`IntakeRail.tsx`）へ渡していたこと — 決定表（`.claude/skills/mail-intake/`）自身が「案件にしない」と明言しているタグ（社内周知・設備・工事・協業・取材・メディア掲載・セキュリティ・採用・先の話・他スタジオ）まで、「ネタのまま残す／失注にする／案件にする」の3択を迫っていた。`dashboard.routes.ts` の `INQUIRY_BASE` にこれらのタグを除外する条件を追加し、案件受付のレールは案件化の芽があるものだけに絞った。除外したものは「入ってきた情報」一覧（`/daily/inquiries`。別の口 `GET /dailyops/inquiries*` を読むため無影響）には今までどおり残り、見送り・ストック・チケット化ができる。検証: `npx tsc -b client server`・`npx eslint` とも該当ファイルはエラーなし。検証用DB（`npm run verify:up`）に社内周知／設備／リード／タグ無しの4件を投入し、除外条件つきSQLを直接実行してリード・タグ無しの2件だけが残ることを確認した。③さらに「メールの種類に応じて適切な行き先に振り分けるべき」というご指摘を受け、`.claude/skills/ai-feedback-loop/` で監査したうえで対応した。AI が直接スタジオ予約（`create_studio_booking`）を作る案は、記録・修正差分・成果紐づけ・還流・レビューの5条件が軒並み未整備（会社方針「AIを使い捨てにしない」に抵触）で、かつ二重予約・部屋の競合という実害を伴うため見送り、フェーズ1（タグ強化＋画面誘導）だけを実装した。決定表（`.claude/skills/mail-intake/`）に、日程・場所が具体的でスタジオの予定表に登録すべきと読めるメール（現地調査・入室予定・搬入出予定など）へ `予定候補` タグを追加で付けるルールを足した（予約はAIが作らない）。「入ってきた情報」一覧（PC・スマホとも）は `予定候補` タグを色付きで目立たせ、「次のアクション」ボタンも「タスクにする」ではなく「カレンダーに登録する」を既定で強調するようにした（`state.ts` の `primaryActionFor`）。検証: `npx tsc -b client-daily`・`npx eslint`・`npm run lint`（全体）・`npm run test`（shared Vitest 2240件）すべて通過。

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
