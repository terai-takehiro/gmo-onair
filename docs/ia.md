# 情報設計 (IA) — v4 の入口の決めごと

新しいメニュー・入口を足したくなったときに読む文書。**基準は「入口は1つ」**。

> ⚠️ **v2.9〜v3.1 期のレール式IA**（`/today`・共通レール6項目・⌘Kの8区分・`railItems.ts`）は
> **v3.2.0 のロールバックで実装ごと消えた歴史**です。当時の合意・実測・段取りの全文は
> [archive/2026/ia-v2.9-rail-era.md](archive/2026/ia-v2.9-rail-era.md)（他文書からの
> 「§4.5」「Phase N」等の引用はそちらを指す）。

## 原則

1. **入口は1つ。** 同じ行き先を2か所のメニューに並べない。新しいメニューを足す前に、
   既にある入口（アプリ切替・左メニュー・トップのタイル・検索）で足りないかを先に確かめる。
   足りないなら、どれか1つに足す — 複数に足すと片方だけ直された日に食い違う
2. **アプリ登録の唯一の正は `shared/src/client/apps.ts`。**
   名前・アイコン・色・URL・権限モジュール・廃止の印はここだけが持つ。
   アプリ切替・左メニューの「他のアプリ」は `visibleApps()` がここから作る
3. **メニューの中身は各アプリの `src/components/layout/nav.ts`。**
   共通シェル（`shared/src/client/shell/`）は器だけで、項目を決めない
4. **トップのタイルは `DAILY_KEYS`（`client/.../HomePage.tsx`）と
   `EVENT_KEYS`（`.../home/AppTiles.tsx`）の対。** どちらも `apps.ts` の `key` で照合するので、
   **`key` を改名したら必ず追随する**（v4.2.0 で `qsheet`→`techops` の取り残しにより
   トップから制作技術支援が消える実障害が起きた）
5. **旧URLは消さない。** アプリ内は `App.tsx` の転送表（`<Navigate>` / `RedirectKeepQuery`）、
   バンドルをまたぐものはサーバー側のブリッジ（旧 `/qsheet/*` など）で生かす
6. **リンク切れは機械で見つける。** 画面内リンクは `scripts/check-links.mjs`、
   文書間リンクは `scripts/check-md-links.mjs`（どちらも `npm run lint` が回す）

## 壊してはいけない契約（リリースをまたいで維持する）

- **本番進行の5URL**: `/techops/{editor,onair,rundown,prompter,audio}` —
  旧 `/qsheet/*` は**無期限ブリッジ**で維持（印刷済みQRコード・OBSブラウザソースが旧URLを指す。
  撤去の判断は [reviews/qsheet-techops-migration-plan.md](reviews/qsheet-techops-migration-plan.md) §6）
- **音声サポートの公開URL**（認証なしで開く）と **サイネージURL** `/signage/:roomId`
- **ICSフィードのURLとトークン**（`studio_calendar_settings`）
- **MCPのエンドポイントとツール名** — 旧 `qsheet` 系ツール名は二重登録で互換維持
- **金額は税抜で保持** / `billing_key` の採番規則 / GLS採番の `ON CONFLICT` 原子性
- **権限は2段**: モジュール権限で「どのアプリを触れるか」を決め、そのうえで案件メンバーが
  「どの案件のものが見えるか」を広げる（権限とは別軸）。内部の区画名 `qsheet` は
  `permissionModule` として存続している（表示名の改名と独立・計時視聴者も同区画に統合済み）
