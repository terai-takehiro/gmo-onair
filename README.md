# GMO ONAiR

GMOグローバルスタジオの制作管理プラットフォーム（会社OS）。
複数のブロックアプリを単一のモノレポで束ね、案件・財務・カレンダー・日常業務・機材・
制作技術支援（Qシート）・計時を **GLS番号**を中核に連携させる統合業務システムです。

**本番環境**: https://gmo-onair.jp
**検証環境**: https://dev.gmo-onair.jp
**現在のバージョン**: v4.2.1 — **PR #339（qsheet Phase 3・4）のマージ後の棚卸しを記録した**（コード変更なし）。`get_review_comments`をGitHub MCPで直接確認し、レビュー0件（CI greenから約2分後にマージ）だったことを[docs/reviews/codex-findings-v4.md](docs/reviews/codex-findings-v4.md)の「レビューが0件のままマージされた PR」一覧に記録した。 **PR #343（release: v4.2.0）のマージ後の棚卸しを記録した**（コード変更なし）。`docs/branching.md`「マージしたら、その PR のレビューを棚卸しに移す」の決めごとどおり、CI green確認後すぐにマージし（コード変更なしのリリース版上げPR・typecheck/lint/test/check:versionすべて確認済み・ユーザーの明示指示を受けての実行）、レビューが1件も付いていなかったことを `docs/reviews/codex-findings-v4.md` に記録した。 **トップページのタイルから制作技術支援が消えていたのを直した**（v4.2.0 で発生）。qsheet→techops 移行 Phase 2（PR #337・2026-08-22）で `shared/src/client/apps.ts` の `AppKey` を `qsheet` から `techops` へ改名したが、`client/src/contexts/platform/pages/HomePage.tsx` の `DAILY_KEYS` 配列（トップのアプリタイルに出すキーの一覧）が旧キー `qsheet` のままだったため、`DAILY_KEYS.includes(a.key)` が一致せず**トップページから制作技術支援のタイルが1枚も出なくなっていた**（アプリ切替・左メニューは `visibleApps()` を通すので無事だった）。あわせて `home/AppTiles.tsx` の `SEPARATE_BUNDLE`（別バンドルへのフルリロード判定）も同じ理由で取り残されていたため直した（タイルが出ても押すと SPA 内 `navigate()` で壊れるところだった）。検証: `npx tsc -b client` / `npm run test`（shared 1452件）OK。 **PR #345（fix(client): トップページのタイルから制作技術支援が消えていたのを直した）のマージ後の棚卸しを記録した**（コード変更なし）。`docs/branching.md`「マージしたら、その PR のレビューを棚卸しに移す」の決めごとどおり、作成から28秒でユーザー自身がマージし（CIはまだ実行中の時点）、レビューが1件も付いていなかったことを `docs/reviews/codex-findings-v4.md` に記録した。

旧 v4.2.0 — **v4 の主要スコープが完成し、本番へ出す準備が整った。** 制作技術支援（旧Qシート）を表本体を除き v4 の見た目・共通シェルへ全面刷新した（台本・進行・プロンプター・音声サポートの本番画面／AI提案・生成／収録配信設定／レンタル機材検索を含む10段階の作り直し）。あわせてディレクトリ・URL・Socket.IO・MCPツール名を `techops` へ移行した（旧 `qsheet` 系は無期限のブリッジ・二重登録で互換維持）。計時・視聴者は制作技術支援のミニアプリへ統合し、表示画面のレイアウトを自由に組めるエディタを追加した。技術資料アプリは削除、リアルタイムCGは配信のみ停止（コードは保存）。会社リスト一本化（Phase 3-3）が完了し、顧客・仕入先の旧ID解決コードも役目を終えて削除した。ほかカレンダー・案件管理・機材台帳・現場サポート導線のUIUX刷新とモバイル対応、多数のレビュー指摘の棚卸しを行った。詳細は `docs/v4-plan.md`・`docs/reviews/phase3-2-plan.md`・`docs/reviews/qsheet-techops-migration-plan.md` を参照。

旧 v4.1.7 — **Phase 3-3 着手条件②・チェックリストBの①（本番公開）が満たされたことを記録した**（コード変更なし）。ユーザーが GitHub Release で `v4.1.6`（legacy-ID解決の記録の仕組み・PR #215を含む版）を公開し、本番デプロイが成功したことを `docs/reviews/phase3-2-plan.md` に反映した。②の観測期間はここから起算する。⚠️ このセッションからは本番への直接アクセスができない（サンドボックスのネットワークポリシー）ため、互換確認チェックリストAのスモークテストは未実施であることも明記した。 **Phase 3-3 着手条件②の①②が満たされたことを記録した**（コード変更なし）。①「Bのログが本番公開」はv4.1.6のデプロイ成功で満たし、②「意味のある観測期間の経過」はユーザーが legacy-ID の実利用が観測期間中実質0件だったことを踏まえて基準を見直し、短い観測期間（v4.1.6デプロイから約21分）でも可と明示的に判断したことを `docs/reviews/phase3-2-plan.md` に記録した。⚠️ 当初の基準（実利用が一巡する程度）とは異なる短い観測期間での判断であることを明記し、後で読む人が混乱しないようにした。残るは③次の通常リリースの公開のみ。互換確認チェックリストA・Cは着手セッションが本番へ直接アクセスできず未実施のまま。

旧 v4.1.6 — **Phase 3-3 着手条件の状況を更新した**（コード変更なし）。ユーザーが GitHub Release で `v4.1.5`（3-2a/3-2bを含む版）を本番公開したことを `docs/reviews/phase3-2-plan.md` に反映し、着手条件1（本番公開）は満たされた・条件2（次の通常リリースを1回挟む互換確認期間）はまだ、という状態に更新した。 **Phase 3-3 着手条件②（互換確認期間）のチェックリストを整理した**（コード変更なし）。v4.1.5 本番公開後〜次の通常リリースまでの期間に何を確かめるかを `docs/reviews/phase3-2-plan.md` に追加した（デプロイ直後のスモークテスト・legacyフォールバック使用状況の可視化・継続監視・条件②の判定基準）。⚠️ legacy フォールバック（`findCustomerRow`/`findVendorRow`）の使用状況を記録する仕組みが現状無いことを明記し、小さいログ追加PRを推奨項目として挙げた。 **Phase 3-3 着手条件②（互換確認）の記録の仕組みを追加した**。顧客・仕入先の画面が旧URL（移行前の `customers.id`/`vendors.id`）で開かれたとき、どれだけ使われているかを記録する仕組みが無かった。`customers.routes.ts`/`vendors.routes.ts` それぞれの旧ID解決ロジックを1箇所（`resolveLegacyCustomerId`/`resolveLegacyVendorId`）にまとめ、GET・PUT・DELETEの3箇所すべてがそこを通るようにした上で、旧IDで解決できたときだけ記録するようにした。実際の検索・保存・削除の条件（SQL）は変えていない。検証: `npm run typecheck` / `npm run lint` / `npm run test` OK。 **Claude の応答言語ポリシーを CLAUDE.md に明記した**（コード変更なし）。作業中（ツール呼び出しの説明・思考過程）は英語で処理してよいが、チャットでユーザーに返す最後の返信は必ず簡潔な日本語にする、というユーザー指示をルール化した。 **Phase 3-3 着手条件②の状況を更新した**（コード変更なし）。互換確認チェックリストBの記録の仕組み（PR #215）が実装され `main`（検証環境）へマージ済みであること、ただし本番公開まではまだ着手条件①のログ観測が始まらないことを `docs/reviews/phase3-2-plan.md` に反映した。

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
