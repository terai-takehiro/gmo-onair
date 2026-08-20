# 権限モデルの単純化 — 計画メモ

> 2026-08-20 起票。ユーザーから「管理権限がアプリ単位で、かつ訳が分からない。なるべく
> シンプルにしたい」との指示を受け、`AskUserQuestion` で方向性を確認した上での計画。
> ユーザー登録の仕組み自体は変更対象外（現状の招待制のままでよい、との確認済み）。
>
> **2026-08-20 追記（実装完了）**: 当初は §4 の「実データを見ないと危険」という理由で
> 計画の記録だけに留めたが、ユーザーから追加の実態説明を受けた:
> 「原則、このアプリにはチームのメンバーしか招待されない（フルアクセスOK）」
> 「一部、例えば機材情報だけにアクセスさせたいなど、臨時的にアプリにアクセスして
> もらっていたりする」。これにより、
> - **「型に何も割り当てられていない人＝個別の例外設定だけで運用されている人＝
>   臨時アクセス」「型が割り当てられている人＝正規メンバー」という、既存データの
>   形自体が、そのまま「フルアクセス」と「限定アクセス」の見分けに使える**ことが
>   分かった。実データを覗かなくても、移行ロジックの中でこの判定を機械的に
>   やらせられる（§5・migration 210）
> - 「権限とメンバーの管理」は `system_admin` だけに絞ることも確認した（`AskUserQuestion`）
>
> これにより実データ監査という前提条件が外れたため、この版で**コード実装まで完了**した。
> 実装内容は §6「実装結果」を参照。

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
4. **`admin`（権限とメンバーの管理）という区画は残さない。** 当初は「`sales` の
   `manager` レベルに含める」案を出したが、その後の `AskUserQuestion` で
   **「権限とメンバーの管理は `system_admin` だけに絞る」**という決定になった。
   `sales` の `manager` は業務アプリの設定（拠点・料金表など）までで、権限管理は
   `users.role === 'system_admin'` だけの特別枠として完全に切り離す。

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

権限とメンバー・データビューア・DBバックアップは `users.role === 'system_admin'` だけに
絞る（`sales` の `manager` レベルとは無関係）。

### 権限の正 = 「型」のみ、実行時の判定機構は変えない

⚠️ **当初の想定（`permission_role_modules` を判定時に直接 JOIN する）は実装時に
訂正した。** 実際のコード（`permission-role.service.ts`）を読むと、「型」は
判定に一切使われておらず、**型を人に押すと `user_permissions` の行がその場で
書き換わる「push 型」**だった（`applyRoleToUser`）。つまり `user_permissions` は
レガシーの個人編集の残骸ではなく、**いまも唯一の実行時判定テーブル**。

この事実を踏まえ、実装は次の形にした（`auth.ts` の判定ロジックには一切触れていない）:
- 「型」は `user_permissions` へ押すプリセットのまま。**`ROLE_MODULES` を7区画
  （凍結4アプリを含む）に拡張**し、型を押すと凍結アプリの権限も一緒に書き換わる
  ようにした（以前は凍結4アプリを意図的に対象外にしていた。理由は §4 の1）
- 個人ごとの例外編集 UI（`UserPermissionsDialog`）を廃止。これにより
  `user_permissions` は「型を押した結果」以外の値を持たなくなる
- `users.permission_role_id` は **NULL のまま許容**（`= NULL` は「権限なし」の
  今までの約束と一致する。無理に NOT NULL にする必要は無かった）

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

## 4. 危険地帯だったもの（解消の経緯）

1. **凍結4アプリの個人アクセスが消える懸念。**
   `client/CLAUDE.md` に明記の通り、`ROLE_MODULES` に凍結4アプリを足す実験は
   **過去に実際に試して「役割を押すだけでQシート・リアルタイムCGなどの権限が消える」
   ことを確認済み**（＝放送が止まる系の事故）だった。この危険は§1と同じユーザーからの
   実態説明（「原則フルアクセス・例外は個別設定で運用されている」）で解消した:
   **「型を押されていない人＝個別設定だけの実態（例外）」というデータの形をそのまま
   使い**、型を押されていた人だけをフルアクセスへ寄せ、型を押されていない
   個人設定オンリーの人は**現在の実効権限をそのまま captures する型を自動生成**
   して割り当てる（実データを見なくても、移行ロジック自体がこの判定をする）。
   実装は migration 210 のコメントと §6 を参照。
2. **`sales`・`budget`等の統合レベルの決め方。** 型ごとに複数区画のレベルが割れている
   場合（例: 営業管理者は `sales=editor` だが `budget=reader`）、統合後の1レベルを
   どちらに寄せるかで挙動が変わる。**安全側（アクセスが後退しない方向＝MAX）**に
   寄せた（誰かが急に閉め出される事故を避ける。逆に権限が広がる方向の変化は
   すでに§1-3で許容合意済み）。
3. **個人ごとの例外（`user_permissions`）を持つ既存ユーザーの移行。** 型に無い個人差分を
   持つ人がいた場合、黙って消すと「今まで見えていたものが見えなくなる」事故になる。
   移行マイグレーションで「型を押されていなかった人の実効権限（7区画にMAX集約）を
   そのまま captures する型を自動生成して割り当てる」方式にし、**誰の実効権限も
   このマイグレーションの瞬間には変えない**（`user_permissions` の中身は1文字も
   書き換わらない・型の割り当ては記録のためだけ）。ローカルの検証用Postgresで
   実際にこのシナリオを再現し、意図通りに動くことを確認済み（§6）。

## 5. フェーズ分け（実績）

- **Phase 0**: 計画の記録（コード変更なし）。
- **Phase 1（実データ監査）**: §1・§4 のとおり、ユーザーからの実態説明により
  不要になった。
- **Phase 2（コード実装・完了）**: 下記§6のとおり実施済み。
- **Phase 3（観測・後始末・未着手）**: dev環境で一定期間動かし、403エラーの増加が
  無いことを確認後に検討する運用タスク:
  - 自動生成された「限定アクセス（自動移行 N）」型が複数できた場合、中身が同じ／
    近いものを手で統合する（`system_admin` が「権限とメンバー」画面から）
  - 旧`admin/repair-permissions`エンドポイント（既に画面からは撤去済み・API のみ残存）
    の要否を再検討する
  - ユーザーの「本番に入れて」指示を待って本番反映

## 6. 実装結果

- **サーバー**: `requirePermission`/`requireAnyPermission`/MCP権限ゲート
  (`contexts/mcp/gate.ts`) など、旧区画（`budget`/`gpm`/`studio`/`partner_schedule`）
  を参照していた**272+α箇所**を `sales` へ機械的に remap。`admin` 区画を参照していた
  5箇所は `requireRole('system_admin')` に置き換え（`data-viewer.routes.ts` /
  `permission-roles.routes.ts` ×3 / `notifications.routes.ts`）。
  `auth.ts` の判定ロジック本体（`loadUserWithPermissions`/`requirePermission`/
  `meetsPermissionLevel`）は**無変更**（§2の訂正どおり、`user_permissions` が
  引き続き唯一の実行時テーブルのため）。
- **移行マイグレーション**: `server/src/shared/db/migrations/210_simplify_permission_modules.sql`。
  ①`user_permissions`/`permission_role_modules` の区画統合（MAX集約）②「フルアクセス」
  型の新設（全7区画 manager）③旧5つの組み込み型を押されていた人をフルアクセスへ
  一括移行④型を押されていなかった個人設定オンリーの人に、実効権限をそのまま
  captures する型を自動生成⑤旧5つの組み込み型を soft delete。**ローカルの検証用
  Postgresで「移行前の状態を人工的に再現→migration 210 を実行→結果を検証」を実施し、
  以下を確認済み**:
  - 旧組み込み型を押されていた人 → フルアクセス型・全7区画 manager になる
  - 個人設定オンリー（凍結アプリ含む）の人 → 自動生成された型が割り当てられるが、
    `user_permissions` の中身は1バイトも変わらない
  - 同じプロファイルを持つ複数人は同じ自動生成型を共有する（型の乱立を抑える）
  - 型を押されていないカスタム型（`is_builtin=FALSE`）を押されていた人 →
    フルアクセスへは移行されず、その型の定義のまま（区画名だけ `sales` に統合）
  - 権限が何も無い人 → 完全に無変更
- **サーバーの seed**: `server/src/shared/db/seed.ts`（開発用シード）と
  `scripts/dev-verify/up.sh`（検証用Postgresの4人）を新しい7区画に合わせて更新。
  `dev-verify` の `v-keiri` は「経理」の例から「限定アクセス（機材だけ）」の例に
  役割を変更した（経理/営業の区別が無くなったため）。
- **クライアント**: `shared/src/client/apps.ts`（アプリ登録の唯一の正）の
  `gpm`/`budget`/`studio`/`admin` の `permissionModule` を `sales` に統合。
  `App.tsx` のルートガード・`nav.ts`・`hubCards.ts`・`shortcuts.ts`・各画面の
  `hasPermission()` 呼び出しを同様に remap。`RoleDialog.tsx`（型編集）は7区画
  （凍結4アプリ込み）を表示するようになり、`UserPermissionsDialog.tsx`
  （個人ごとの例外編集）は削除、`MembersPage.tsx`/`UserDialog.tsx` からその導線を除去。
- **検証**: `npm run typecheck`（server/client 個別）/ `npm run lint` / `npm test`
  （1141件）すべて green。上記の移行シナリオはローカルの検証用Postgresで実データを
  人工的に再現して検証済み（実際の検証/本番DBには未反映・触れていない）。
