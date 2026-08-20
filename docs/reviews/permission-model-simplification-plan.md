# 権限モデルの単純化 — 計画メモ

> 2026-08-20 起票。ユーザーから「管理権限がアプリ単位で、かつ訳が分からない。なるべく
> シンプルにしたい」との指示を受け、`AskUserQuestion` で方向性を確認した上での計画。
> **このコミットはコード変更なし**（計画の記録のみ）。ユーザー登録の仕組み自体は
> 変更対象外（現状の招待制のままでよい、との確認済み）。

## 1. 決まったこと（ユーザーとの確認結果）

1. **粒度はブロックアプリ単位に揃える。** 現状12区画あるうち、`equipment`（機材管理）・
   `dailyops`（日常業務）・凍結4アプリ（qsheet/techsheet/liveops/awards）はすでに
   ブロックアプリと1対1。ズレているのは「案件管理・財務管理・カレンダー・設定」という
   **1つのブロックアプリ内の6区画**（`sales`/`budget`/`gpm`/`studio`/`partner_schedule`/
   `admin`）だけ。ここを1つに統合する。
2. **「型（プリセット）」だけにして、個人ごとの例外編集（`user_permissions`の個別上書き）は
   廃止する。** ユーザーは「型」だけを押す。`UserPermissionsDialog`（個別編集画面）は消す。
3. **経理／営業の区別が失われることは承知の上で進める。** 現状は「経理は請求書だけ編集・
   見積は見るだけ」「営業は自分の案件だけ編集・全体予定は見るだけ」という**役割ごとに
   異なる組み合わせ**が型に入っているが、統合後はこの組み合わせ自体を表現できなくなる。
   → 経理に編集権限を渡すと見積も編集できる／営業に編集権限を渡すと請求書も触れる、が
   起きる。**後から型を増やしても復元できない構造的な喪失**であることを明示した上で、
   ユーザーは許容する判断をした。
4. **`admin`（権限とメンバーの管理）という区画は残さない。** 代わりに、統合後の
   「案件管理」アプリの**管理者レベル（`manager`）＝そのアプリの設定・権限まで触れる**、
   という今ある3段階（見るだけ／直せる／管理）の一番上の意味をそのまま使う。新しい概念を
   増やさない。

## 2. 目標の形

### 区画（module）: 12 → 7（ブロックアプリと1対1）

| 新区画 | 旧区画（統合元） | ブロックアプリ |
|---|---|---|
| `sales` | `sales` + `budget` + `gpm` + `studio` + `partner_schedule` + `admin` | 案件管理・財務管理・カレンダー・設定 (`client/`) |
| `dailyops` | `dailyops`（そのまま） | 日常業務 (`client-daily/`) |
| `equipment` | `equipment`（そのまま） | 機材管理 (`client-equipment/`) |
| `qsheet` | `qsheet`（そのまま） | 制作資料 (`client-qsheet/`, 凍結) |
| `techsheet` | `techsheet`（そのまま） | 技術資料 (`client-techsheet/`, 凍結) |
| `liveops` | `liveops`（そのまま） | 計時LIVE (`client-live/`, 凍結) |
| `awards` | `awards`（そのまま） | リアルタイムCG (`client-awards/`, 凍結) |

`sales` の `manager` レベル = 権限とメンバー・データビューア・DBバックアップも触れる
（旧 `admin` 区画の代替）。

### 権限の正 = 「型」のみ

- `permission_roles` / `permission_role_modules` を**唯一の正**にする。
- 個人ごとの `user_permissions` は使わない（テーブル自体は Phase 2 で削除、Phase 1 では
  読み取りを止めるだけに留める＝実データ監査が終わるまで残す。理由は §4）。
- `users.permission_role_id` を **NOT NULL** にする（型を持たないユーザーを許さない）。
- 凍結4アプリも「型」の対象に含める（現状は `ROLE_MODULES` の対象外＝個人の例外でしか
  付けられない。これも統合する）。

## 3. 影響範囲（実測）

- サーバー側の権限チェック呼び出し: **272箇所 / 74ファイル**
  （`requirePermission('...')` 231件 + `requireAnyPermission([...])` 10件の内訳、
  `grep -rE "requirePermission\(|requireAnyPermission\(" server/src` で実測）
  - `sales` 109 / `equipment` 49 / `budget` 32 / `awards` 12 / `studio` 11 /
    `dailyops` 11 / `qsheet` 10 / `liveops` 9 / `partner_schedule` 5 / `admin` 5 /
    `gpm` 3 / `techsheet` 1
  - **`budget`(32) `gpm`(3) `studio`(11) `partner_schedule`(5) `admin`(5) の 56箇所**が
    `sales` への書き換え対象。呼び出し方の形（`requirePermission(module, level)`）は
    変えず、第1引数の文字列だけを機械的に置換できる（`sed` 相当で対応可能、後段の
    `typecheck`/`test` で検知できるので比較的安全）。
- 権限解決のコア: `server/src/shared/middleware/auth.ts`
  - `loadUserWithPermissions()`（38行目付近）… 現在 `user_permissions` を
    `user_id` で引いている。ここを `users.permission_role_id` →
    `permission_role_modules` の JOIN に差し替える。
  - `requirePermission()` のDBフォールバック（202行目付近）… 同様に参照先を
    `permission_role_modules` に変更。
  - `meetsPermissionLevel()` はレベル比較のみで無変更。
- UI: `client/src/contexts/platform/pages/members/`
  - `RoleDialog.tsx` … 表の行を12→7に。凍結4アプリも編集可能にする。
  - `UserPermissionsDialog.tsx` … **削除**（個別例外編集の廃止）。
  - `UserDialog.tsx` … 型の割り当てだけのシンプルな形に。
  - `moduleLabels.ts` … `ROLE_MODULE_ORDER` / `ALL_MODULE_ORDER` を7区画に統合、
    `admin` のラベルを削除。
  - サーバー側 `permission-role.service.ts` の `ROLE_MODULES` /
    `ROLE_UNTOUCHED_MODULES`（凍結4アプリを型の対象外にしていた仕組み）を撤廃。

## 4. 危険地帯 — 実データを見ずにコードだけで進めてはいけない部分

1. **凍結4アプリの個人アクセスが消える。**
   `client/CLAUDE.md` に明記の通り、`ROLE_MODULES` に凍結4アプリを足す実験は
   **過去に実際に試して「役割を押すだけでQシート・リアルタイムCGなどの権限が消える」
   ことを確認済み**（＝放送が止まる系の事故）。理由は、凍結アプリの権限は現状**すべて
   `user_permissions` の個人設定でしか付与されていない**ため、型ベースの解決に主導権を
   渡した瞬間、型に凍結アプリの割り当てがない全員が弾かれる。
   → **今どのユーザーが凍結4アプリにどのレベルでアクセスできているか**を、検証/本番の
   実データから先に把握し、それを反映した型（または型の初期値）を用意してからでないと
   コード側の切り替えをしてはいけない。このセッションは検証/本番DBへ直接アクセスできない
   （サンドボックスのネットワークポリシー）ため、**この監査は次のステップ**とする。
2. **`sales`・`budget`等の統合レベルの決め方。** 型ごとに複数区画のレベルが割れている
   場合（例: 営業管理者は `sales=editor` だが `budget=reader`）、統合後の1レベルを
   どちらに寄せるかで挙動が変わる。**安全側（アクセスが後退しない方向＝MAX）**に
   寄せる方針とする（誰かが急に閉め出される事故を避ける。逆に権限が広がる方向の変化は
   すでに§1-3で許容合意済み）。ビルトイン5型はこの資料に書いた通り機械的に決まるので
   実データ監査は不要。
3. **個人ごとの例外（`user_permissions`）を持つ既存ユーザーの移行。** 型に無い個人差分を
   持つ人がいた場合、黙って消すと「今まで見えていたものが見えなくなる」事故になる。
   移行スクリプトで「今の実効権限（型 ∪ 個人差分、7区画にMAX集約）と一致する型が
   無ければ、その人専用の型を自動生成して割り当てる」方式にし、**誰の実効権限も
   このマイグレーションの瞬間には変えない**。型の整理（重複した個人専用型の統合）は
   後回しでよい運用タスクとする。これも実データ（検証/本番の `user_permissions` の
   中身）を見てから移行スクリプトを書く必要がある。

## 5. フェーズ分け

- **Phase 0（このコミット）**: 計画の記録。コード変更なし。
- **Phase 1（実データ監査）**: 検証環境（できればユーザー経由で本番も）の
  `user_permissions` / `users.permission_role_id` の実データを取得し、
  - 凍結4アプリを個人設定で持っている人の一覧
  - 型に無い個人差分を持っている人の一覧
  をこの資料に追記する。ここまでは**コード変更なし**。
- **Phase 2（コード実装）**: Phase 1 の結果を反映した移行マイグレーション
  （型の再定義＋凍結4アプリの型組み込み＋個人差分の自動型生成）と、
  §3 の272箇所remap・`auth.ts`の参照先切り替え・UI簡略化を1つのPRで実施。
  `npm run verify:up` のローカルPostgresで移行前後の実効権限が変わっていないことを
  検証してからdevへ。
- **Phase 3（観測・後始末）**: dev環境で一定期間動かし、403エラーの増加が無いことを
  確認後、`user_permissions` テーブル・旧`admin/repair-permissions`エンドポイント・
  `UserPermissionsDialog` 関連の死んだコードを削除。ユーザーの「本番に入れて」指示を
  待って本番反映。

## 6. 次のアクション

Phase 1（実データ監査）は、このセッションでは検証/本番DBに直接アクセスできないため
代行できない。ユーザー側で以下のいずれかが必要:
- VPS上で監査用クエリ（`SELECT user_id, module, access_level FROM user_permissions
  WHERE module IN ('qsheet','techsheet','liveops','awards')` 等）を実行し結果を共有、
  または
- このリポジトリに検証DBへの読み取りアクセスがある別セッション/環境で実施
