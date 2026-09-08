# GMO ONAiR

GMOグローバルスタジオの制作管理プラットフォーム（会社OS）。
複数のブロックアプリを単一のモノレポで束ね、案件・財務・カレンダー・日常業務・機材・
制作技術支援（Qシート）・計時を **GLS番号**を中核に連携させる統合業務システムです。

**本番環境**: https://gmo-onair.jp
**検証環境**: https://dev.gmo-onair.jp
**現在のバージョン**: v4.6.10 — **案件編集画面の「スタジオの日程」で部屋を選んでチェックを入れても保存されない不具合を直した**。①利用者から「サムライスタジオ青山・用賀の WORLD STUDIO いずれも、編集画面で部屋にチェックを入れて保存しても、保存後リロードすると選択が消え、予約も1件も作られない」というご指摘。調査したところ、「使う部屋・空間」（`ScheduleSection.tsx`）は**予約が1件も無い案件だけ**編集画面にも表示され続けるのに、`useProjectForm.ts` の保存処理は `if (isEdit || ...) return;` で**編集時は常に予約作成をスキップ**していた（コメント上は「編集時はこのフォームから作成しない（登録済みの予約から CRUD する）」という意図的な設計だったが、画面はチェックボックスを出し続けるため、利用者からは「チェックを入れたのに保存されないバグ」にしか見えなかった）。②編集時でも、`ScheduleSection.tsx` が表示条件に使っているのと同じ判定（`hasEventBooking(actions.bookings)` — 実施日を決める予約が1件も無いか）を保存側にも使い、条件を満たすときだけ新規作成時と同じ `createInitialBookings` を呼んで予約を作るようにした。予約が1件でもあれば `ScheduleSection` 自体が非表示になるためこの分岐には来ず、二重作成にはならない。検証: `npx tsc -b client`・`npx eslint`（変更3ファイル）で確認。

旧 v4.6.9 — **PR #654・#655のレビュー指摘を棚卸しに移した**（`docs/branching.md`「マージしたら、その PR のレビューを棚卸しに移す」）。#654（案件作成でスタジオ予約の登録失敗を黙って握りつぶしていた不具合の修正）は📝 Code ReviewがCodexのusage limitsで未実行、🔒 Security Reviewは完走してfindingsなし。#655（GLS-B006/B009/B010の3件を番号はそのまま案件扱いに直すDBマイグレーション）も📝 Code Reviewは未実行、🔒 Security ReviewはPRマージ時点で「Running」のまま完走しなかった（#652・#648と同じ、CI green確認後まもなくのマージ）。両PRとも`get_reviews`/`get_review_comments`で0件を確認し、`docs/reviews/codex-findings-v4.md`に記録した（**表に移す未対応の指摘は無い**）。検証: `node scripts/check-md-links.mjs` 相当のリンク確認（ドキュメントのみの変更）。 **案件台帳の整合性チェック「受注しているのに実施日が無い」が、GLS-B（工事・構築のプロジェクト）まで拾っていた不具合を直した**。利用者から「GMO-0001・GMO-0002はプロジェクトなのでそもそも実施日の概念がない」というご指摘を受けて調査。他の整合性チェック（「案件分類が入っていない」「リード経路が入っていない」）は`gls_category = 'A'`だけを対象にしているのに対し、この項目だけ絞り込みが無く、実施日（`event_start`/`event_end`）という概念自体を持たないGLS-Bの案件（開始日・終了日は`started_on`/`ends_on`に持つ）が、受注段階に上がった時点で毎回「実施日が無い」と数えられ続けていた。`project-integrity.ts`のSQLに`gls_category = 'A'`を足し、他の項目と同じ絞り込みに揃えた。検証: 実Postgres（検証用インスタンス）で空DBから全マイグレーションを適用し、実施日の無いGLS-A案件・GLS-B案件のテスト行をそれぞれ作って、修正後のSQLがGLS-A側だけを拾いGLS-B側を拾わないことを確認した。 **グループ会社の案件で、リード経路が「グループ案件」に固定されていなかった不具合を直した**。利用者から「グループ内案件はリード経路でグループ内としてロックされてるはず」というご指摘。`intake.ts`のコメント通りこの値は本来「お客様が取引先マスターでグループ会社になっているとき、案件作成が固定でこの値を入れます」という決めごとだったが、実際に固定していたのは案件作成画面（`useNewProjectForm.ts`）だけで、サーバー（`project.service.ts`の`createCore`/`update`）は渡された値をそのまま受けるだけだった。MCPの`create_project`/`update_project`はそもそも`group`を選択肢に持たず、Excel・決算取込もこの列を送らないため、画面の新規登録フォーム以外の経路（AI/MCP・取込・古いデータ）で作られたグループ会社の案件はリード経路が空のまま残り、案件台帳の整合性チェック「リード経路が入っていない」に引っかかり続けていた（GLS-B006「紹介動画撮影」・GLS-B009「ようが夏まつり」など）。`customer_type`と同じく`cType`（`companies.is_gmo_group`から解決）を使ってサーバー側で常に確定させるようにし、既存データも同じ規則（人が明示した値は上書きしない・空のものだけ埋める）で埋め戻すマイグレーションを追加した。検証: 実Postgresでグループ×NULL・外部×NULL・グループ×既存値の3パターンのテスト行を作り、マイグレーション適用後の挙動（埋まる・変化なし・上書きされない）を確認した。

旧 v4.6.8 — **PR #650 が Codex のレビュー0件のままマージされたことを記録に残した**（`docs/branching.md`「マージしたら、その PR のレビューを棚卸しに移す」／`.claude/skills/pr-watch/references/pitfalls.md` の決めごと）。①一次情報で確認したところ `get_reviews` は空・レビュースレッド0件・Codex の要約コメント（Code Review / Security Review の ✅ 表）も一度も出ておらず、**Code Review が1巡も走らないままマージされていた**（作成 08:18:09Z → マージ 08:36:43Z＝18分34秒）。**0件と「指摘なし」は画面上で見分けが付かない**ため、`docs/reviews/codex-findings-v4.md` の「レビューが0件のままマージされた PR」に記録した（表に移す指摘は無い＝レビュー自体が届いていないため）。②この PR に付いていた唯一のボットコメントは**エージェント風の作業報告**（「コミット `edbba2e` を作り、同名の新規 PR を作成した」）で、**その成果物はリポジトリのどこにも入っていなかった** — `git cat-file -t edbba2e` は `Not a valid object name`、open な PR は #650 と #647 のみ、該当するリモート枝も無し。提案の中身（`pr-watch` の教訓への相対リンク）だけは妥当だったので、こちらで実装して push した（`5a8a65d`・相対リンク 492 → 493 本）。**エージェント風のコメントが1件付いていると「レビューが付いた」と見えてしまう**ので、レビューの有無は見た目ではなく `get_reviews` と要約表で判定する、と `pr-watch` の `references/pitfalls.md` に3つ目の教訓として足した。③**この PR（#651）自身の状態も、マージ前に同じ節へ書いた** — 連鎖を止めるため。Code Review・Security Review とも ✅ だが対象は最初のコミット `956800b` で、P2 の指摘（在籍時間の誤り）を直した `ee6e839` を読ませようと `@codex review` を投げたところ **Codex の利用上限**（`You have reached your Codex usage limits for code reviews.`）で走らなかった＝**直しそのものは誰にも読まれていない**。**要約表の ✅ は「この PR が読まれた」ではなく「その行のコミットが読まれた」**なので、`Commit` 列が頭のコミットかを必ず見る、と記録した。検証: `node scripts/check-md-links.mjs`・`npm run lint` 通過。 **PR #652（リリース v4.6.7 の版上げ）のレビュー指摘を棚卸しに移した**（`docs/branching.md`「マージしたら、その PR のレビューを棚卸しに移す」）。📝 Code Review は Codex の usage limits で一度も実行されず、🔒 Security Review は最初のコミットでのみ完了して findings なし。CI 修正で足した2つ目のコミットにはどちらのレビューも再実行されておらず、その旨を `docs/reviews/codex-findings-v4.md` に記録した（**表に移す未対応の指摘は無い**）。あわせて、#652 で直った `npm run lint` の `check-changelog.mjs` の不具合も記録する — リリースPRの版チェック除外が「枝の名前が `release/` で始まる」ときにしか効かず、Claude Code の Web セッションが作る `claude/release-version-update-<乱数>` のような固定形の枝ではリリースPRでも通常の作業PRと誤判定されて CI の `checks` が落ちていた。判定を「枝のいずれかのセグメントの先頭が `release`」に緩め、`claude/release-…` も拾うようにした。検証: `npm run check:version`・`RELEASE=1 npm run lint`・`npm run test`（shared Vitest 164ファイル/2269件）。 **案件作成の「スタジオの日程」で会場を選んでも、案件詳細が「会場・スタジオを押さえていません」のままになる不具合を直した**。案件を新規作成したとき、入力した本番日・部屋（例: 青山）から予約を作る処理（`createInitialBookings.ts`）が、予約の作成に失敗しても `catch` で何も出さず握りつぶしていた。案件そのものは先に保存が成功しており、保存後は即座に案件詳細へ遷移するため、利用者は「登録した」つもりのまま新しい案件詳細を開き、そこには予約が1件も無い（＝会場・スタジオが実際には押さえられていない）状態になっていた。エラーが一切表示されないため、原因を追う手がかりも無かった。本番日・リハーサルそれぞれの予約作成を個別に捕捉し、失敗したときは `notifyApiError` でサーバーの理由（分かる場合）とともに「案件は保存されています。案件詳細の『登録済みの予約』から入れ直してください」と案内するようにした。案件詳細の会場表示ロジック自体（`venue.ts`）は既存の修正で正しく動作している。 **GLS-B006・B009・B010の3件を、番号はそのまま案件（GLS-A）扱いに直した**。この3件（紹介動画撮影・ようが夏まつり・GMOインターネット キックオフMTG）は実際には通常の撮影・収録・イベント業務だが、`gls_category` が'B'（プロジェクト管理）のまま発番されていた。うちB006・B010はすでに見積書を発行済みで番号（BOXフォルダ名・回のコードも連動）を変えられないため、通常のA↔B切替（採番し直し）は使えない。この3件に限った特例のDBマイグレーションで、番号はそのまま`gls_category`のみ'A'に直した。B006・B010は既に2段分類（客入れの有無×案件分類）が正しく入っており、案件台帳の整合性チェック「GLS-Bなのに2段分類が入っている」に引っかかっていた状態を解消。B009は`gpm_kind='self_build'`（プロジェクト管理の印。制約上gls_categoryが'B'でないと持てない）を外し、実態（有観客・イベント）に合わせて2段分類と`project_type`を埋め、実施日（GPM側のstarted_on/ends_onに入っていた値）をevent_start/end へ引き継いだ。検証: 実Postgresで空DBから全マイグレーションを順に適用し、B006/B009相当のテスト行を作って本マイグレーションの前後の値・整合性チェックSQL（引っかからなくなること）を確認した。

旧 v4.6.7 — **機材メンテナンス記録の拡張・制作技術支援の一覧再設計とUI統一・「タスク・依頼」の作り直し・画面表記「GLS番号」の「管理番号」への統一など、マージ済みPR7件をまとめた**。①機材管理のメンテナンス記録に種別「記録」と修理引取／受取日を追加し、財務明細から案件詳細への遷移リンク、GLS発番可能なヨミ段階を「D 仮押さえ」まで前倒しした。②機材メンテナンスの修理日編集ダイアログで、保存中に他の操作と競合すると入力が消える不具合を直した（マージ後のレビュー指摘の追加修正含む）。③制作技術支援トップの番組・イベント一覧を本番日順に組み直し、工事・構築案件や失注案件を除外、案件台帳の絞り込みに新しい発番（SCS／GSS／GMO）を追加した。④画面表記の「GLS番号」を「管理番号」に統一した（内部識別子・DB列・発番操作の名称は変更なし）。⑤「タスク・依頼」画面をモックから設計し直し、依頼タブからの依頼作成・一覧と詳細の分離・状態での絞り込みなどを追加した。⑥制作技術支援131ファイルのUIを共通部品`<PageShell>`等で統一した。⑦マージ後に届いたレビュー指摘の棚卸し2件（PR #644・#648）を記録した。検証は各PRで実施済み（詳細はアーカイブの全文）。

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
