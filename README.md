# GMO ONAiR

GMOグローバルスタジオの制作管理プラットフォーム（会社OS）。
複数のブロックアプリを単一のモノレポで束ね、案件・財務・カレンダー・日常業務・機材・
制作技術支援（Qシート）・計時を **GLS番号**を中核に連携させる統合業務システムです。

**本番環境**: https://gmo-onair.jp
**検証環境**: https://dev.gmo-onair.jp
**現在のバージョン**: v4.6.8 — **PR #650 が Codex のレビュー0件のままマージされたことを記録に残した**（`docs/branching.md`「マージしたら、その PR のレビューを棚卸しに移す」／`.claude/skills/pr-watch/references/pitfalls.md` の決めごと）。①一次情報で確認したところ `get_reviews` は空・レビュースレッド0件・Codex の要約コメント（Code Review / Security Review の ✅ 表）も一度も出ておらず、**Code Review が1巡も走らないままマージされていた**（作成 08:18:09Z → マージ 08:36:43Z＝18分34秒）。**0件と「指摘なし」は画面上で見分けが付かない**ため、`docs/reviews/codex-findings-v4.md` の「レビューが0件のままマージされた PR」に記録した（表に移す指摘は無い＝レビュー自体が届いていないため）。②この PR に付いていた唯一のボットコメントは**エージェント風の作業報告**（「コミット `edbba2e` を作り、同名の新規 PR を作成した」）で、**その成果物はリポジトリのどこにも入っていなかった** — `git cat-file -t edbba2e` は `Not a valid object name`、open な PR は #650 と #647 のみ、該当するリモート枝も無し。提案の中身（`pr-watch` の教訓への相対リンク）だけは妥当だったので、こちらで実装して push した（`5a8a65d`・相対リンク 492 → 493 本）。**エージェント風のコメントが1件付いていると「レビューが付いた」と見えてしまう**ので、レビューの有無は見た目ではなく `get_reviews` と要約表で判定する、と `pr-watch` の `references/pitfalls.md` に3つ目の教訓として足した。③**この PR（#651）自身の状態も、マージ前に同じ節へ書いた** — 連鎖を止めるため。Code Review・Security Review とも ✅ だが対象は最初のコミット `956800b` で、P2 の指摘（在籍時間の誤り）を直した `ee6e839` を読ませようと `@codex review` を投げたところ **Codex の利用上限**（`You have reached your Codex usage limits for code reviews.`）で走らなかった＝**直しそのものは誰にも読まれていない**。**要約表の ✅ は「この PR が読まれた」ではなく「その行のコミットが読まれた」**なので、`Commit` 列が頭のコミットかを必ず見る、と記録した。検証: `node scripts/check-md-links.mjs`・`npm run lint` 通過。 **PR #652（リリース v4.6.7 の版上げ）のレビュー指摘を棚卸しに移した**（`docs/branching.md`「マージしたら、その PR のレビューを棚卸しに移す」）。📝 Code Review は Codex の usage limits で一度も実行されず、🔒 Security Review は最初のコミットでのみ完了して findings なし。CI 修正で足した2つ目のコミットにはどちらのレビューも再実行されておらず、その旨を `docs/reviews/codex-findings-v4.md` に記録した（**表に移す未対応の指摘は無い**）。あわせて、#652 で直った `npm run lint` の `check-changelog.mjs` の不具合も記録する — リリースPRの版チェック除外が「枝の名前が `release/` で始まる」ときにしか効かず、Claude Code の Web セッションが作る `claude/release-version-update-<乱数>` のような固定形の枝ではリリースPRでも通常の作業PRと誤判定されて CI の `checks` が落ちていた。判定を「枝のいずれかのセグメントの先頭が `release`」に緩め、`claude/release-…` も拾うようにした。検証: `npm run check:version`・`RELEASE=1 npm run lint`・`npm run test`（shared Vitest 164ファイル/2269件）。 **案件作成の「スタジオの日程」で会場を選んでも、案件詳細が「会場・スタジオを押さえていません」のままになる不具合を直した**。案件を新規作成したとき、入力した本番日・部屋（例: 青山）から予約を作る処理（`createInitialBookings.ts`）が、予約の作成に失敗しても `catch` で何も出さず握りつぶしていた。案件そのものは先に保存が成功しており、保存後は即座に案件詳細へ遷移するため、利用者は「登録した」つもりのまま新しい案件詳細を開き、そこには予約が1件も無い（＝会場・スタジオが実際には押さえられていない）状態になっていた。エラーが一切表示されないため、原因を追う手がかりも無かった。本番日・リハーサルそれぞれの予約作成を個別に捕捉し、失敗したときは `notifyApiError` でサーバーの理由（分かる場合）とともに「案件は保存されています。案件詳細の『登録済みの予約』から入れ直してください」と案内するようにした。案件詳細の会場表示ロジック自体（`venue.ts`）は既存の修正で正しく動作している。 **GLS-B006・B009・B010の3件を、番号はそのまま案件（GLS-A）扱いに直した**。この3件（紹介動画撮影・ようが夏まつり・GMOインターネット キックオフMTG）は実際には通常の撮影・収録・イベント業務だが、`gls_category` が'B'（プロジェクト管理）のまま発番されていた。うちB006・B010はすでに見積書を発行済みで番号（BOXフォルダ名・回のコードも連動）を変えられないため、通常のA↔B切替（採番し直し）は使えない。この3件に限った特例のDBマイグレーションで、番号はそのまま`gls_category`のみ'A'に直した。B006・B010は既に2段分類（客入れの有無×案件分類）が正しく入っており、案件台帳の整合性チェック「GLS-Bなのに2段分類が入っている」に引っかかっていた状態を解消。B009は`gpm_kind='self_build'`（プロジェクト管理の印。制約上gls_categoryが'B'でないと持てない）を外し、実態（有観客・イベント）に合わせて2段分類と`project_type`を埋め、実施日（GPM側のstarted_on/ends_onに入っていた値）をevent_start/end へ引き継いだ。検証: 実Postgresで空DBから全マイグレーションを順に適用し、B006/B009相当のテスト行を作って本マイグレーションの前後の値・整合性チェックSQL（引っかからなくなること）を確認した。

旧 v4.6.7 — **機材メンテナンス記録の拡張・制作技術支援の一覧再設計とUI統一・「タスク・依頼」の作り直し・画面表記「GLS番号」の「管理番号」への統一など、マージ済みPR7件をまとめた**。①機材管理のメンテナンス記録に種別「記録」と修理引取／受取日を追加し、財務明細から案件詳細への遷移リンク、GLS発番可能なヨミ段階を「D 仮押さえ」まで前倒しした。②機材メンテナンスの修理日編集ダイアログで、保存中に他の操作と競合すると入力が消える不具合を直した（マージ後のレビュー指摘の追加修正含む）。③制作技術支援トップの番組・イベント一覧を本番日順に組み直し、工事・構築案件や失注案件を除外、案件台帳の絞り込みに新しい発番（SCS／GSS／GMO）を追加した。④画面表記の「GLS番号」を「管理番号」に統一した（内部識別子・DB列・発番操作の名称は変更なし）。⑤「タスク・依頼」画面をモックから設計し直し、依頼タブからの依頼作成・一覧と詳細の分離・状態での絞り込みなどを追加した。⑥制作技術支援131ファイルのUIを共通部品`<PageShell>`等で統一した。⑦マージ後に届いたレビュー指摘の棚卸し2件（PR #644・#648）を記録した。検証は各PRで実施済み（詳細はアーカイブの全文）。

旧 v4.6.6 — **過去の一部の案件で「案件を編集」から GLS 番号を発番できなくなっていたのを直した**。①案件分類（`gls_category`）が未設定（AI起票・決算取込・Excel/GLS取込などで作られ、`project_type` も既定値 `'other'` のままの古い案件）を「案件を編集」で開くと、`useProjectForm.ts` が `project_type` から分類を推測して**フォーム上だけ**GLS-B（工事・構築）と誤判定し、「案件分類」欄そのものを隠したうえで「このプロジェクト（GLS-B）には客入れの有無と案件分類がありません」と案内していた。しかしサーバーの GLS 発番（`issueGls`）は DB の実値（NULL）を見て「案件分類（スタジオ／ビジネス）が未設定です」と拒否するため、画面の案内とサーバーの判定が食い違い、分類を入力する手段が無いまま発番できず編集不能に見えていた。②さらに深刻な点として、この誤判定を保存すると（`buildSavePayload` が `gls_category` を送信対象から除外していないため）GLS 未発番の案件は実際に DB の `gls_category` が `'B'` へ書き換わってしまう実害があった（サーバーの `allowCategoryUpdate` は未発番の間、送られた値をそのまま受け入れるため）。`project_type` からの分類推測ロジックを削除し、`gls_category` は常に DB の実値のみを見るように直した（未設定は GLS-A 扱い＝ `missingOf` の判定基準と統一）。同じ状態（分類未設定・未発番）にある案件はすべてこの1件の修正で直る。③Codexレビュー指摘（P1）を受けさらに直した — ①の直しだけでは「案件分類」欄が出るようになるだけで、そこに客入れの有無・案件分類を入力して保存しても `gls_category` 自体は空のまま送られ、DBはNULLを保持し続けるためGLS発番が引き続き失敗した。`gls_category` が未設定のまま2段（客入れの有無／案件分類）を新しく入力したら `'A'` を明示的に送るようにし、保存時にDBへ確定させた。検証: `npx tsc -b client`・`npx eslint`（該当ファイル）ともエラーなし。**あわせて v4.6.5 のバージョン履歴アーカイブ本文で、見出し・箇条書きの区切りが消えて読めなくなっていたのを直した**（Codexレビュー指摘、PR #639）。`npm run release:notes -- 4.6.5` で `docs/changelog.d/fix-security-consistency-review.md`（PR #636）のMarkdown 見出し「## 修正」「## 検証」と箇条書き「- 」を、`docs/version-history.md` の1エントリ＝1行のアーカイブ形式へ連結する際、改行だけが失われ記号がそのまま残り「## 修正- 無効化...」のように続き文として表示されていた（`RichDescription` は見出し・箇条書きを再分割しないため画面でも読めない）。見出しを太字、箇条書きを①②③④に置き換え、文として読めるように直した。この直しは当初PR #639自体に追加で積んだが、ユーザーがそのコミットが載る前に#639を先に手動マージしたため`main`にはまだ反映されておらず、改めて出し直した。検証: `node scripts/check-md-links.mjs` 通過。

旧 v4.6.5 — **計上会社の接頭辞コードをGJVからSCSに変更し、認証・Socket・同時更新の整合性を修正した**。①2026年10月の事業再編で先に決めていたコンテンツスタジオ（グループ外案件の計上会社）の接頭辞コード「GJV」を「SCS」に変更した（GSS・GMOは変更なし）。設計文書・型定義・MCPツール・案件番号採番・隔週キープ・社内取引まわりを全面置換し、既存マイグレーションは書き換えず新規マイグレーションで安全に改名した（実データに発番実績は無く実害なし）。②無効化されたアカウントの既存セッション・OTP再送・共同編集/MCP認証を正しく拒否し、案件・台本の共同編集と本番タイマー／CG操作の権限をHTTP APIと同じ基準に揃え、OTP・招待・社内取引・機材貸出・セキュリティカード返却の同時操作での二重実行や履歴上書きを防いだ。検証: `npx tsc -b`・`npm run lint`・`npm run test`（shared Vitest 2240件）・認証/Socket/データ整合性の回帰テストいずれも通過。

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
