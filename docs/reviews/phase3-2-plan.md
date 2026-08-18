# Phase 3-2a 引き継ぎメモ — 顧客系FKを companies へ張り替える

> **2026-08-18 追記**: Phase 3-2a・3-2b とも実施済み（下記）。同日中に v4.1.5
> として**本番公開済み**（着手条件1は満たされた）。続きの Phase 3-3
> （`customers`/`vendors` テーブル自体の削除）は**さらに次の通常リリースを
> 1回挟んでから**（着手条件2・互換確認期間）でないと着手できないため、
> このタスクでは着手条件と工程表のみを文末の「Phase 3-3（3-2完了後）」節に
> 整理した（コード変更なし）。

**✅ 実施済み**（Issue #193 の続き）。migration `200_customer_fk_to_companies.sql` を追加し、
このメモの調査対象一覧＋実DBで見つかった追加分（`dashboard.routes.ts` 等・約30ファイル）を
同じPRで追随させた。実DB（`npm run verify:fresh` → `npm run db:seed`）で案件作成・売上・
顧客360°ビュー・`GET /customers` `/gpm/customers` の応答を確認済み。詳細は
`docs/changelog.d/` のPR記載、または `git log` でこの migration を含む PR を参照。
以下は着手時点の引き継ぎ資料（実装済みの記録として残す）。

**別セッションで着手する前提の引き継ぎ資料。** 会社リスト一本化（`customers`/`vendors` →
`companies`）の Phase 1/2/3-1 はマージ済み（PR #183, #184, #186, #188, #190, #192。
#191 は重複のためクローズ）。ここからは Phase 3-2 の実装メモ。

## 前提（すでに完了していること）

- **Phase 1**（PR #183/#184/#186）: 顧客・仕入先の登録経路を `company-directory.service.ts`
  経由に一本化。全 `customers`/`vendors` 行が必ず `companies.id`（`company_id` 列）に紐づく
- **Phase 2**（PR #183 の一部）: 顧客一覧UIを取引先マスター（`/sales/companies?role=customer`）
  に統合。顧客360°ビュー（`/sales/customers/:id`）は独立して残っている
- **Phase 3-1**（PR #188/#190/#192）: 支払条件の取引先ごとの例外（`closing_day`/
  `payment_months`/`payment_day`）を `companies` に一本化。旧列は**まだ残してある**
  （ロールバック互換のため。方針Aで「イメージだけ差し替える」ロールバックが使えなくなる
  変更を許容することにしたのは3-2から）

## 学んだ教訓（3-2でも必ず守ること）

1. **PRはレビュー前にマージされることがある**（自動マージが有効）。CI・レビュー結果を待たずに
   マージされる前提で動く。レビュー指摘は毎回 `docs/reviews/codex-findings-v4.md` に記録すること
2. **一度実行された migration ファイルは、内容を書き換えても再実行されない**
   （`runMigrations()` は `_migrations` テーブルでファイル名を記録する）。
   マージ後に指摘が来て直す必要がある場合は、**その回のPRの中で新しいmigrationファイルを追加する**
   （既存ファイルの编edit ではない）
3. **別のCodexボット（`codex/*`ブランチ）が同じ問題への重複PRを自動生成することがある**。
   自分のPRで既に対応済みなら、コメントで理由を説明してクローズする

## Phase 3-2a の内容

対象は**顧客系の5つのFK**（仕入先系の `purchases.vendor_id`/`sga_expenses.vendor_id` は別PR＝3-2b）:

| テーブル | 列 | NULL許容 |
| --- | --- | --- |
| `projects` | `customer_id` | NOT NULL |
| `revenues` | `customer_id` | NOT NULL |
| `activity_logs` | `customer_id` | nullable |
| `estimates` | `customer_id` | nullable |
| `gpm_projects` | `customer_id` | nullable |

いずれも今は `customers(id)` を指す。**値そのものを `companies.id` に書き換え、FKの向き先も
companies(id) に変える**（方針A・一気に切り替える。イメージだけのロールバックはこの変更以降
使えなくなることを `docs/deploy-pipeline.md` に追記すること）。

### migration ドラフト（未検証・そのまま使わずレビューすること）

`server/src/shared/db/migrations/197_customer_fk_to_companies.sql` として書きかけていた内容:

```sql
-- 顧客系FKを customers(id) から companies(id) へ張り替える（Phase 3-2a）
--
-- 対象は5つ: projects.customer_id / revenues.customer_id /
-- activity_logs.customer_id / estimates.customer_id / gpm_projects.customer_id。
--
-- ⚠️ これは「イメージだけ差し替える」ロールバックが使えなくなる変更（方針A）。
-- このリリース以降は、本番を戻すときは「Releases のタグでDeployワークフローを
-- 再実行」(DBも含めて丸ごと戻す) だけを使う — docs/deploy-pipeline.md に追記する。
--
-- 安全のための下ごしらえ: migration 195 は deleted_at IS NULL の customers/vendors
-- だけ companies へ埋め戻した。論理削除済みで company_id が無い行が残っていると、
-- NOT NULL の列（projects/revenues）で変換できずに移行が失敗するので、
-- deleted_at を問わず埋め戻す。

DO $$
DECLARE
  r   RECORD;
  cid TEXT;
BEGIN
  FOR r IN SELECT * FROM customers WHERE company_id IS NULL ORDER BY created_at LOOP
    cid := gen_random_uuid()::text;
    INSERT INTO companies (
      id, name, short_name, contact_name, email, phone, address,
      is_customer, is_gmo_group, notes, deleted_at,
      created_at, updated_at, created_by, updated_by
    ) VALUES (
      cid, r.name, r.short_name, r.contact_name, r.email, r.phone, r.address,
      TRUE, COALESCE(r.is_gmo_group, FALSE), r.notes, r.deleted_at,
      r.created_at, r.updated_at, r.created_by, r.updated_by
    );
    UPDATE customers SET company_id = cid WHERE id = r.id;
  END LOOP;
END $$;

-- 値の付け替え（customer_id はまだ customers.id。それを company_id に書き換える）
UPDATE projects p SET customer_id = c.company_id
  FROM customers c WHERE c.id = p.customer_id AND c.company_id IS NOT NULL;
UPDATE revenues r SET customer_id = c.company_id
  FROM customers c WHERE c.id = r.customer_id AND c.company_id IS NOT NULL;
UPDATE activity_logs a SET customer_id = c.company_id
  FROM customers c WHERE c.id = a.customer_id AND c.company_id IS NOT NULL;
UPDATE estimates e SET customer_id = c.company_id
  FROM customers c WHERE c.id = e.customer_id AND c.company_id IS NOT NULL;
UPDATE gpm_projects g SET customer_id = c.company_id
  FROM customers c WHERE c.id = g.customer_id AND c.company_id IS NOT NULL;

-- FK の向き先を companies に変える
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_customer_id_fkey;
ALTER TABLE projects ADD CONSTRAINT projects_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES companies(id);
ALTER TABLE revenues DROP CONSTRAINT IF EXISTS revenues_customer_id_fkey;
ALTER TABLE revenues ADD CONSTRAINT revenues_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES companies(id);
ALTER TABLE activity_logs DROP CONSTRAINT IF EXISTS activity_logs_customer_id_fkey;
ALTER TABLE activity_logs ADD CONSTRAINT activity_logs_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES companies(id);
ALTER TABLE estimates DROP CONSTRAINT IF EXISTS estimates_customer_id_fkey;
ALTER TABLE estimates ADD CONSTRAINT estimates_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES companies(id);
ALTER TABLE gpm_projects DROP CONSTRAINT IF EXISTS gpm_projects_customer_id_fkey;
ALTER TABLE gpm_projects ADD CONSTRAINT gpm_projects_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES companies(id);

-- customers テーブル自身は消さない（customers.id は顧客360°ビューの識別子として
-- そのまま残す。読み書きの経路をサーバー側で companies へ切り替えるのは別コミット。
-- customers テーブルの完全な削除は Phase 3-3、互換のためのリリースを1回挟んでから）
```

**FK制約名は実DBで確認済み**（`SELECT conname, conrelid::regclass FROM pg_constraint
WHERE confrelid='customers'::regclass`）: `projects_customer_id_fkey` /
`revenues_customer_id_fkey` / `activity_logs_customer_id_fkey` /
`estimates_customer_id_fkey` / `gpm_projects_customer_id_fkey`。

### この migration だけでは終わらない — 読み書き経路の追随が必須

FKの値が `customers.id` から `companies.id` に変わるので、`customer_id` を
`customers` テーブルと JOIN/検索している**すべてのコード**を同じPR内で
`companies` 参照に切り替える必要がある（さもないと `LEFT JOIN customers` は
一致しなくなり顧客名が消える・`customers` テーブルへの名前解決で書き込む id が
食い違う、などが起きる）。調査済みの対象一覧（2026-08-18 時点）:

- `server/src/contexts/finance/services/money-rules.service.ts` —
  `customerException()` は `customer_id` がそのまま `companies.id` になるので
  `company_id` 経由のサブクエリが不要になり簡略化できる
- `server/src/contexts/sales/services/project.service.ts` — `resolveCustomerType`
  など `customers.is_gmo_group` を `customer_id` で引いている箇所、
  `LEFT JOIN customers c ON c.id = p.customer_id` の各所（一覧・検索・PDF等）
- `server/src/contexts/sales/services/activity-log.service.ts` / `estimate.service.ts` /
  `estimate-pdf.service.ts` / `sales-analytics.service.ts` / `kpt.service.ts`
- `server/src/contexts/sales/routes/customers.routes.ts` — **これ自体を
  `companies`（`is_customer=TRUE`）参照に切り替える**。顧客一覧・案件作成の
  「お客様」ドロップダウン（`GET /customers`）が返す `id` は、この移行後は
  `companies.id` でなければ整合しない
- `server/src/contexts/sales/routes/excel.routes.ts`・
  `server/src/contexts/finance/routes/excel.routes.ts` — 名前→id解決・
  `LEFT JOIN customers`
- `server/src/contexts/sales/routes/project-groups.routes.ts` /
  `projects.routes.ts` / `billing.routes.ts`
- `server/src/contexts/platform/services/kessan-import.service.ts` — 顧客名解決
- `server/src/contexts/dailyops/services/inview.service.ts` — 内覧会の顧客名解決
- `server/src/contexts/tasks/services/task-intake.service.ts` — 投入口の顧客名解決
- `server/src/contexts/platform/routes/search.routes.ts` — グローバル検索
- `server/src/contexts/platform/routes/backup.routes.ts` — バックアップ出力のJOIN
- `server/src/contexts/gpm/index.ts`・`gpm.service.ts` — `/gpm/customers` エンドポイント
- `server/src/contexts/mcp/tools/customers.tools.ts` — MCPの顧客ツール一式
  （`list_customers`/`create_customer`等）。**返す `id` が `companies.id` になる**
  ことに注意（`create_project` へ渡す `customer_id` の契約が変わる）
- `server/src/contexts/mcp/tools/finance.tools.ts` / `activities.tools.ts`

### 検証すべきこと（このPRのマージ前に必ず）

- 実DBで: 案件作成・売上作成・活動記録・見積・GPMプロジェクト作成がいずれも
  正しい `companies.id` を書き込み、顧客名の表示が壊れていないこと
- 顧客360°ビュー（`/sales/customers/:id`）が壊れていないこと（内部で
  `WHERE p.customer_id = ?` を今までの `customers.id` ではなく突き合わせる
  必要が生まれる可能性がある — 要確認）
- MCP経由の `create_project`（本番のメール取込スキルが毎日叩いている）が
  移行前後で同じように動くこと
- `npm run test`（`droppedColumns.test.ts` 等）・`npm run typecheck` ・
  `npm run lint` ・実DBでの `verify:fresh`

### Phase 3-2b（実施済み）

**✅ 実施済み**。migration `201_vendor_fk_to_companies.sql` を追加し、
`purchases.vendor_id`（NOT NULL）/ `sga_expenses.vendor_id`（nullable）を
`vendors(id)` から `companies.id` へ張り替えた（3-2a と同じ方針A）。

- 読み書き経路（約20ファイル）を追随: 財務の仕入先タブ（`vendors.routes.ts` を
  `customers.routes.ts` と同じ形に書き換え・一覧/詳細は `companies` を正として読む）、
  仕入・販管費台帳（`purchases.routes.ts` / `sga.routes.ts`）、財務Excel入出力、
  決算取込（`kessan-import.service.ts` の `ensureVendor`）、X-Point取込
  （`xpoint-import.service.ts` の `matchVendor` / `xpoint.routes.ts` の新規仕入先作成）、
  書類受け渡し（`doc-handoff.service.ts`）、グループ按分仕入
  （`project-groups.routes.ts`）、取引先別サマリー（`companies.routes.ts` の
  `/summary` — `vendors` サブレコードでの絞り込みをやめ `companies.id` を直接使うよう修正）、
  横断検索、バックアップ出力、MCPの `list_purchases`、支払期日の取引先例外
  （`money-rules.service.ts` の `computeVendorDueDate`）、シード
- `company-directory.service.ts` に `assertVendorCompanyId`（`assertCustomerCompanyId` の
  仕入先版）を追加し、直接APIを叩く書き込み経路（仕入・販管費・グループ按分仕入・
  書類受け渡し）で検証
- `vendors` テーブル自身は消さない（Phase 3-3 まで）。旧URL（移行前の `vendors.id`）は
  `findVendorRow` の legacy フォールバックで引き続き解決する

検証: `npm run test`（1,136件）/ `typecheck` / `lint`（0 errors）すべて green。
`verify:up` → `db:seed` で実Postgresに対して migration・FK整合（孤立0件）・
`GET /vendors` `GET /purchases` `GET /companies/:id/summary` `GET /search` の応答・
不正な `vendor_id` を渡した `POST /purchases` の400を確認済み。

### Phase 3-3（3-2完了後）

`customers`/`vendors` テーブル自体を削除する。3-1で残した旧支払条件列も
このタイミングで削除する（互換のためのリリースを1回挟んだあと）。

#### 着手できる条件（2026-08-18 更新: 1は満たされた・2は①②満たされた・③はまだ）

1. ✅ **満たされた**（2026-08-18 10:30 UTC）: ユーザーが GitHub Release で
   `v4.1.5`（タグ・target `main`）を公開し、3-2a/3-2b を含む版が `gmo-onair.jp`
   に本番公開された。これで `docs/deploy-pipeline.md` の**ロールバック不可の注記**
   （migration `200`/`201` 以降、イメージだけ戻すロールバックが使えなくなる）が
   実際に有効になった — 本番を戻す手段は「DBバックアップからの復元」のみ
   （`docs/ops/db-backup-restore.md`）
2. 🔶 **①②は満たされた・③はまだ**（詳細は下の追記）: その版で**最低1回リリース
   サイクルを挟む**（`customers`/`vendors` の
   legacy フォールバック経由でしかアクセスできない事故がないか、本番で実際に
   確かめる期間）。⚠️ **「次の通常リリースが公開された時点」だけでは条件を
   満たさない**（PR #214 2巡目レビュー指摘）: そのリリースが下記チェックリストB
   のログ追加を初めて含む場合、公開された瞬間はまだ本番での観測が0件のため。
   **条件を満たすのは次の3つがすべて揃ったとき**（下の「互換確認チェックリスト」
   Dと同一）: ①Bのログが本番に公開されている ②公開後、意味のある観測期間
   （実利用が一巡する程度）が経過している ③次の通常リリース（3-3を含まない版）
   が公開されている — v4.1.5 自体はこの「1回」に数えない
   - **2026-08-18 追記**: 上記①のログ追加（下記チェックリストBの実装）を
     PR #215 で実装しマージ済み。ただし**この時点では `main` マージ＝検証環境
     （dev.gmo-onair.jp）への自動デプロイまでで、本番（gmo-onair.jp）にはまだ
     出ていない**。①が満たされるのはこのPRを含む版がユーザーの指示で本番公開
     されたとき。それまでは②の観測期間も開始しない
   - **2026-08-18 追記（続報）**: ユーザーが GitHub Release で `v4.1.6`
     （PR #215 の legacy-ID ログを含む版・target `main`）を公開し、Deploy
     ワークフロー（`release` イベント、run 32135047648）が `success` で完了した。
     これにより**①「Bのログが本番に公開されている」は満たされた**
     （公開時刻: 2026-08-18 12:05 UTC 頃）。②の観測期間はここから起算する。
   - **2026-08-18 追記（②完了）**: ユーザーが**②「意味のある観測期間が経過している」
     を満たしたと判断した**（2026-08-18 12:26 UTC 時点・v4.1.6 デプロイから約21分後）。
     ⚠️ **この判断は当初の基準を見直したもの**: 本節はもともと「実利用が一巡する
     程度（MCPの日次取込みなど）」を基準にしており、21分はその基準を満たさない
     （MCPの `create_project` 日次実行は1日1回のため、少なくとも1回は回るまで
     待つ想定だった）。ユーザーに確認したところ、**legacy-ID の実利用が観測期間中
     実質0件（雑音レベル）だったことを踏まえ、基準を見直して短い観測でも可と
     する**ことを明示的に選択した。この経緯（当初基準・実際の経過時間・見直しの
     理由）は判断の記録として残す — 後で読む人が「21分で条件を満たした」を
     見て混乱しないように
   - legacy-ID 実利用の観測結果: **観測期間中、legacy-ID（旧ID・旧URL）経由の
     アクセスは実質0件（雑音レベル）**。下の「互換確認チェックリストD」の該当項目
     （①実質0件／②利用ありだが移行済み／③判断できず観測延長）は**①**に該当する
   - ⚠️ **この着手セッションからは本番（`gmo-onair.jp`）への直接アクセスができない**
     （サンドボックスの outbound ネットワークポリシーで拒否される）ため、下の
     「互換確認チェックリストA」のスモークテスト（デプロイ直後の疎通確認・
     旧ID経由のGET/PUT再検証）は**このセッションでは実施できていない**。
     本番アクセスできる場所（VPS・別セッション等）で改めて実施し、結果をこの
     文書に追記すること

Phase 3-3（テーブル削除・列削除）はさらに後戻りしにくい変更なので、**2も満たすまでは
migration を書かない**（実装は別セッション・別PRで、条件が揃ってから着手）。

#### 互換確認チェックリスト（着手条件② のあいだに行うこと）

**対象期間**: v4.1.5 公開（2026-08-18 10:30 UTC）〜 次の通常リリースが公開されるまで。
**目的**: `customers`/`vendors` への legacy フォールバック経由でしかアクセスできない
事故が無いか、本番の実データ・実利用で確かめる。

⚠️ **今の穴**: legacy フォールバック（旧ID・旧URLの解決）が実際に使われた回数を
記録する仕組みが**まだ無い**（`console.warn` すら出ていない）。このままだと
「事故が起きなかった」の根拠が「問い合わせが来なかった」だけになり、確かめたことに
ならない。下のB.が実質いちばん優先度が高い項目。

⚠️ **legacy-ID の解決箇所は `findCustomerRow`/`findVendorRow` の2つだけではない**
（PR #214 レビュー指摘）: `customers.routes.ts` の `PUT /:id`（219行目〜、独自に
`legacy.company_id` を解決している）、`vendors.routes.ts` の `PUT /:id`（161行目〜、
同様の独自解決）、両方の `DELETE /:id` も旧IDを直接受け付ける。**個別にログを
足すと漏れるので、まず全ての legacy-ID 解決を1か所（共通ヘルパー関数）に
まとめてから、そのヘルパーにログを1つ入れる**（下のB参照）。

**A. デプロイ直後のスモークテスト（今すぐ・1回）**

- [ ] `curl -s -o /dev/null -w '%{http_code}\n' https://gmo-onair.jp/health` が
      `200`（`-s` だけだと HTTP エラーでも exit 0 になり見逃すのでステータス
      コードを見る。`-k`（証明書検証を無視）は**付けない**——本番の証明書が
      切れている・不一致でもこのチェックは200を返してしまい、実際の利用者が
      見ているエラーを見逃す。PR #214 2巡目レビュー指摘）
- [ ] 顧客一覧 `/sales/companies?role=customer` の表示・検索
- [ ] 顧客360°ビュー `/sales/customers/:id` — 通常URL（`companies.id`）に加えて、
      **`customers` テーブルに残っている実在の旧ID（移行前の `customers.id`）を
      1件選び、その旧IDでURLを開いて正しく解決されることを明示的に確認する**
      （「ブックマークが残っていれば」という受け身の確認だと、たまたま誰も
      旧URLを踏まなかった場合にこの項目が何も確かめずに終わる。PR #214
      2巡目レビュー指摘）
- [ ] 財務・仕入先タブでも同様に、**`vendors` テーブルに残っている実在の旧ID
      （移行前の `vendors.id`）で `GET /vendors/<旧ID>`・`PUT /vendors/<旧ID>`
      を認証付きで直接呼ぶ**（画面〔`CounterpartyPage`〕は `GET /vendors` の
      一覧が返す行からしか編集画面を開けず、その `id` は既に `companies.id`
      なので、**画面操作では旧IDのルートを一度も通せない**。API を直接叩く
      以外に確認する方法が無い。PR #214 3巡目レビュー指摘）
- [ ] 財務・仕入先タブの編集を、次の**2パターン**で行い、**`companies` 側の
      該当行を編集の前後で直接確認する**（`GET /companies/:id` 等。仕入先タブの
      画面自体は表示名・連絡先を常に `vendors` から読んでいるため、`companies`
      が更新されたかどうかは画面を見ただけでは分からない。PR #214 2巡目
      レビュー指摘）:
      ①`budget:editor`（`sales:owner` 無し）で編集 → `companies` 側は**変わらない**
      ことを確認
      ②`budget:editor`＋`sales:owner` で編集 → `companies` 側も**更新される**
      ことを確認
- [ ] 案件作成の「お客様」ドロップダウンから選択→保存
- [ ] 見積作成・活動記録・GPMプロジェクト作成
- [ ] MCP経由の `create_project`（本番のメール取込スキルが毎日叩いている）が
      **v4.1.5 のデプロイ時刻（2026-08-18 10:30 UTC）より後に実行された分**で
      いつも通り動いているかを確認する（このスキルは1日1回なので、直近の実行が
      デプロイ前のものだと移行後のコード・FKを一度も通らないまま確認済み扱いに
      なってしまう。PR #214 2巡目レビュー指摘。デプロイ直後は次回実行を待つ）
- [ ] Excel入出力（顧客・仕入先の名前解決）
- [ ] 決算取込・X-Point取込の仕入先解決
- [ ] 横断検索・バックアップ出力
- [ ] VPSのエラーログに `relation "customers"`/`"vendors" does not exist` や
      FK違反が出ていないか

**B. legacy フォールバック使用状況の可視化（実装済み・本番公開待ち）**

- [x] `customers.routes.ts`/`vendors.routes.ts` に散らばっていた legacy-ID 解決
      （`findCustomerRow`/`findVendorRow`・`PUT /:id`・`DELETE /:id` それぞれの
      独自解決）を、共通のヘルパー関数（`resolveLegacyCustomerId`/
      `resolveLegacyVendorId`）に一本化し、旧IDで解決できたときだけ
      `console.warn('[customers] legacy id 経由のアクセス ...')` 等の形で
      ログを1か所に入れた（PR #215・2026-08-18 マージ・`main` へ反映済み。
      DB・migration 不要。既存の検索・保存・削除のSQL条件は変更なし）
- [x] このPRが**本番に公開されてから**、VPSログを grep して旧URL・旧IDでの
      アクセス頻度を把握する（マージ＝検証環境止まりでは本番の実利用は分からない）。
      **2026-08-18 追記**: ユーザー確認により、観測期間中の legacy-ID 経由アクセスは
      **実質0件（雑音レベル）**。ただしこの記録は着手セッション（本番へ直接
      アクセス不可）ではなくユーザーからの報告に基づく。誰が・どのログを・
      どの期間で確認したかの詳細は本ドキュメントには残っていない
- [ ] 頻度が高ければ、Phase 3-3のlegacyフォールバック削除（下表#5の一部）の
      周知・移行期間を延ばす判断材料にする — **実質0件だったため対象外**
- [ ] ⚠️ **PR #215（legacy-ID解決を共通ヘルパーへまとめる書き換え）は
      GET・PUT・DELETEすべての挙動を変えるリファクタで、Aのスモークテストは
      これより前に1回しかやっていない**（PR #214 3巡目レビュー指摘）。
      特にPUT・DELETEは普段ほとんど実利用が無く、リグレッションが観測期間中
      ずっと気づかれない恐れがある。**PR #215 が本番に公開されたあと、Aで使った
      顧客・仕入先の旧ID（GET/PUT）をもう一度実行し直して壊れていないことを
      確認する**（DELETEは実データを消さない検証用の行があれば、無ければ
      コードレビューで代替）

**C. 期間中の継続監視（日次〜週次）**

- [ ] エラー率・5xx件数に通常時からの逸脱がないか
- [ ] `mcp_audit_log` 経由のAI登録判定（`is_ai_created`）の表示が壊れていないか
- [ ] 仕入先タブで `budget:editor`（`sales:owner` 無し）の編集時に `companies` 側が
      更新されない仕様（権限の壁・PR #183 P2）が期待通り保たれているかのサンプル
      チェック
- [ ] 利用者から「反映されない」「顧客・仕入先が消えた」等の問い合わせが無いか

**D. 着手条件②を満たしたと判断する基準**

- [ ] **A〜Cの各チェック項目を実際に実施済み**（チェックが付いているだけでなく、
      いつ・誰が・どう確認したかを分かる形で残す。「見つかった不具合が無い」は
      A〜Cを一つもやらなくても真になってしまうため、**やった記録そのもの**を
      条件にする。PR #214 3巡目レビュー指摘）。やらない項目がある場合は、
      その理由をここに明記した上でスキップしてよい。
      **2026-08-18 時点: 未達**。A（デプロイ直後のスモークテスト）・C（継続監視）
      は着手セッションが本番へ直接アクセスできず未実施のまま。B（legacy-ID使用
      状況の把握）はユーザー報告により実質0件と分かっているが、A・Cの実施記録
      が無い状態
- [ ] 上のA〜Cで見つかった不具合がすべて解消されている（P1相当が0件）—
      A・C自体が未実施のため判定不能
- [x] **Bのログが本番に公開され、そこから意味のある期間（実利用が一巡する程度）
      が経過している**（レビュー指摘: Bのログを含む版そのものの公開をもって
      条件②達成とすると、本番での観測が0件のまま次に進んでしまう）。
      ⚠️ **2026-08-18 追記**: 実際の経過時間は v4.1.6 デプロイ（12:05 UTC）から
      約21分（12:26 UTC 時点）で、当初想定していた「実利用が一巡する程度
      （MCPの日次取込みが最低1回回るまで、等）」には届いていない。
      legacy-ID の実利用が観測期間中実質0件だったことを踏まえ、**ユーザーが
      基準を見直し、この短い観測期間でも可とすることを明示的に選択した**
      （判断者: ユーザー、2026-08-18 12:26 UTC 頃）
- [x] **Bで観測した legacy-ID の実利用が、次のいずれかになっている**（レビュー
      指摘: 「頻度が高ければ判断材料にする」だけでは、実際に使われていても
      素通りできてしまう）:
      ①観測期間中の実利用が実質0件（雑音レベル） ②実利用はあるが、呼び出し元
      （古いブックマーク・外部連携等）を特定し、旧URL/旧IDを使わないよう
      案内・移行が完了している ③①②のどちらにもできない場合は、Phase 3-3の
      legacyフォールバック削除（下表#6）を見送り、観測期間を延長する
      → **①に該当**（ユーザー確認・2026-08-18）
- [ ] 次の通常リリース（Phase 3-3を含まない版）の内容が固まり、そのリリースが
      GitHub Release として公開される — **まだ**（v4.1.6 自体は着手条件②の①の
      ためのリリースであり、ここでいう「次の通常リリース」には数えない）
- [ ] → 上のすべてが揃った時点で着手条件②を満たしたとみなし、この節
      （「着手できる条件」）を更新してから Phase 3-3 に着手してよい

#### Phase 3-3 でやること（詳細化）

> ⚠️ **2026-08-18 PR #211 の Codex レビュー（6巡・P2合計20件）を反映**。
> 1巡目（3件）は「読み書き経路は既に `companies` が正」という前提の誤り
> （vendor側だけの最新値・洗い出し漏れの参照箇所・`mcp_audit_log` の旧ID）。
> 2巡目（5件）は**1巡目を直した結果生まれた「別々のPR/デプロイに分けてよい」
> という順序の誤り**（中間状態でエンドポイントが壊れる・検証条件の書き方が誤り）。
> 3巡目（5件）は**2巡目を直した結果でもまだ残っていた抜け**
> （バックフィルは1回やれば終わりではない・洗い出しがまだ漏れている・
> 不可逆な変更の直前にバックアップと最終検証を置いていなかった）。
> 4巡目（2件）は**3巡目を直した結果でもまだ残っていた抜け**
> （洗い出し一覧が `customers.routes.ts`/`vendors.routes.ts` 自身の通常フローと
> `xpoint.routes.ts` を見落としていた・「テーブル削除の直前にもう一度手で確認する」
> という案自体が確認とデプロイの間に書き込みが割り込む余地を残していた）。
> 5巡目（2件）は**4巡目を直した結果でもまだ残っていた抜け**
> （PR作成前の1回だけのバックアップでは、執筆〜マージ前検証の間の書き込みを
> 取りこぼす・`mcp_audit_log` の3点セットより先に `customers.routes.ts` の
> `CUSTOMER_JOIN` を消す順序になっていて、AI登録判定の読み込み手段を失う窓が
> あった）。6巡目（3件）は**5巡目を直した結果でもまだ残っていた抜け**
> （旧支払条件列の削除〔上表#4〕もテーブル削除〔#5〕と同格の不可逆変更なのに
> バックアップ・検証ゲートが#5専用だと思われていた・vendor側の一次分析を
> `companies` へ書き込む形にすると、`sales:owner` の承認前提で非公開に
> してきた `budget:editor` 単独編集の値を早期に公開してしまう権限漏れがあった）。
> **6巡経ても新しい抜けが見つかり続けている**ので、この表を
> **完全と見なさないこと** — 着手セッションは着手前に必ずコード側を実地で
> 再調査し、可能なら着手前にもう一度レビューを依頼すること。下の表・工程表は
> 6巡分すべてを反映して描き直したもの。**「同じPR/デプロイでまとめて出す」
> 「同一トランザクションで実行する」「先に行う」「書き込みは行わない」と
> 書いてある箇所の順序・まとまりを変えないこと** — 変えた瞬間に本番が壊れるか、
> 権限の壁を飛び越える。

| # | 内容 | 対象 |
| --- | --- | --- |
| 1 | vendor 側だけにある最新値の突き合わせ（**一次分析のみ。`companies` への書き込みは行わない。実際の反映は5で行う**） | `vendors.routes.ts` は `budget:editor` が `sales:owner` を持たない保存で、意図的に `companies` を更新せず `vendors` だけ更新する（権限の壁・PR #183 P2）。そのため名前・連絡先・`vendor_type`・請求書登録番号などは **`vendors` 側が最新の場合がある**。⚠️ **この時点で `vendors` の値を `companies` へバックフィル（書き込み）してはいけない**（6巡目レビュー指摘）: `companies` は `GET /companies` 等の一覧・検索・サマリーで `sales:owner` を問わず参照されるため、`budget:editor` だけが編集した（＝`sales:owner` の承認前提で意図的に非公開のままにしてきた）値をここで書き込むと、その時点で権限の壁を飛び越えて公開してしまう。**この工程は SELECT による差分の把握・件数の見積もりだけに留める**（`UPDATE companies ...` は書かない）。あわせて「テーブルが無くなった後、この権限の壁をどう守るか」（`companies` に直接同じ制約を持たせる等）を決める。⚠️ **差分は把握しても消えない**（3巡目レビュー指摘）: `budget:editor` の `PUT /vendors/:id` は動き続けるため、把握した差分はすぐ古くなる。**実際に `companies` へ反映する（＝権限の壁を飛び越える）のは、`vendors` テーブル自体を消す5のタイミングだけ**にする（テーブルを消せば `vendors` 単独更新という編集経路自体が無くなるので、その時点で反映しても新しい非公開値を作り出さない。4巡目・6巡目レビュー指摘を踏まえた設計） |
| 2 | `customers`/`vendors` を直接参照している全箇所の書き換え（**旧支払条件列への書き込みを含む。`customers.routes.ts` の `CUSTOMER_JOIN` 除去は3より後**） | legacyフォールバック（`findCustomerRow`/`findVendorRow`）以外にも本番コードが直接テーブルを触っている。**洗い出し済みの対象**（2026-08-18時点・**4巡のレビューを経てもなお漏れが見つかり続けているので、この一覧を最終と見なさず、着手前に repo 全体を再検索すること** — `grep -rn "FROM customers\|JOIN customers\|FROM vendors\|JOIN vendors\|INTO customers\|INTO vendors"` 等。特に `SELECT`/`UPDATE`/`INSERT` 文字列を組み立てている箇所は素朴な `grep` に引っかからないことがあるので、`customers`/`vendors` という識別子そのものでも検索する）: **`sales/routes/customers.routes.ts` 自身（4巡目レビューで指摘・legacyフォールバック関数だけでなく、`CUSTOMER_JOIN` を使う一覧・詳細・360°ビューなど通常の読み書きフロー全体が対象。⚠️ ただしこのファイルの `CUSTOMER_JOIN` 除去（＝`cu.id as legacy_customer_id` を含む `customers` へのJOINをやめる変更）は**3（`mcp_audit_log` 旧ID移行）が完了してから**行うこと — 先に消すと `is_ai_created`/`ai_requested_by` が3の新しい実装に切り替わる前に読み込み手段を失う。5巡目レビュー指摘）**、**`finance/routes/vendors.routes.ts` 自身（同様に、legacyフォールバック関数だけでなく通常の一覧・詳細・更新フロー全体が対象）**、`companies.routes.ts`（`/summary` 等。**POST/PUTで `customers.closing_day`/`payment_months`/`payment_day` と `vendors` の対応列へ今も書き込んでいる** — これを直さないまま4の列削除をすると通常の取引先登録・編集が `undefined_column` で落ちる）、`sales/routes/excel.routes.ts` / `finance/routes/excel.routes.ts`、`company-directory.service.ts`、`purchases.routes.ts` / `sga.routes.ts`、`kessan-import.service.ts` / `xpoint-import.service.ts`、**`finance/routes/xpoint.routes.ts`（`xpoint-import.service.ts` とは別に、このルート自体が独立して `vendors` を JOIN・参照している。4巡目レビューで発見）**、`doc-handoff.service.ts`、`project-groups.routes.ts`、`search.routes.ts`、`backup.routes.ts`、`production/routes/reports.routes.ts` の `GET /vendor-summary`（`LEFT JOIN vendors`。3巡目レビューで発見）、MCPツール一式、シード、`server/scripts/import-kessan-dev.mjs`（dev専用。`findCustomer`/`ensureCustomer` が直接 `customers`/`vendors` を select/insert している）。**特に注意**: いくつかの箇所は `customers`/`vendors` 行の `deleted_at` を「その会社が今その役割（顧客/仕入先）を持っているか」の判定に使っている（`is_customer`/`is_vendor` 相当）。テーブルを消すと同じ判定ができなくなるので、`companies` 側だけで同じ意味を表せる代替（既存の `is_customer`/`companies.company_role` 相当の列があるか、無ければ追加）を先に用意する |
| 3 | `mcp_audit_log` の旧ID移行（バックフィル＋書き込み側＋読み込み側を**同じPR/デプロイで**切り替え。**2の `customers.routes.ts` の `CUSTOMER_JOIN` 除去より先に、または同じPRで行う**） | `customers.tools.ts`（MCP `create_customer`）が書き込む `result_summary.created_id` は今も `customers.id` のまま。`customers.routes.ts` の `is_ai_created`/`ai_requested_by` はこの値（`cu.id as legacy_customer_id`。`CUSTOMER_JOIN` から取っている）で `mcp_audit_log` を逆引きしている。**バックフィルだけを先に出すと、書き込み側がまだ旧ID空間で書き続け・読み込み側もまだ旧ID比較のままなので、バックフィル後に作られた行が未移行のまま取りこぼれる**（2巡目レビュー指摘）。そのため①バックフィルmigration ②`customers.tools.ts` の書き込み先を `company_id` に変更 ③`customers.routes.ts` の読み込みを `company_id` 比較に変更、の3つを同じPR/デプロイで出す（`vendors` 側の `create_vendor`〔あれば〕も同様）。**検証は `tool_name = 'create_customer'`（仕入先版があれば同様のツール名）に絞って**行う — `create_project`/`create_task` など他ツールの `created_id` はそれぞれ別テーブルのIDを指しており、`companies.id` として解決できなくて当然のため対象外（2巡目レビュー指摘）。⚠️ **2で `customers.routes.ts` の `CUSTOMER_JOIN`（＝`legacy_customer_id` を得る手段）を先に消してしまうと、③の読み込み切り替えが `company_id` 比較へ移る前に旧IDを得る手段そのものを失う**ので、この3点セットは**2の `customers.routes.ts` 分より先に、または同じPRで**着手する（5巡目レビュー指摘） |
| 4 | 旧支払条件列の削除（**これも不可逆。5と同じ扱いのゲートを課す**） | `customers.closing_day`/`payment_months`/`payment_day`、`vendors` の対応列。**2で `companies.routes.ts` を含む全ての書き込み経路が `companies` の列だけに書くよう直っていることが前提**（直す前に消すと `undefined_column` で取引先登録・編集が落ちる。2巡目レビュー指摘）。⚠️ **列削除も不可逆な変更であり、5（テーブル削除）専用だと思われていたゲートが実はここにも要る**（6巡目レビュー指摘）: このmigrationをマージする**前**に、①本番のオンデマンドバックアップを取りリストア可能なことを確認する（5と同じ手順）②下表7の検証一式（`test`/`typecheck`/`lint`/`verify:fresh`・実DBでの確認）を通す、の両方を済ませること。`main`マージ即検証環境へ自動デプロイされ、実行済みmigrationは再実行されないため、マージ後に見落としが見つかっても列は既に無く直しようがない |
| 5 | `customers`/`vendors` テーブル自体の削除 ＋ legacy フォールバック削除 ＋ dev専用スクリプトの書き換え（**すべて同じPR/デプロイで実施**） | migration。**1・2・3がすべて完了し、実DBで動作確認できてから**。**テーブル削除（migration）・`findCustomerRow`/`findVendorRow`〔legacyフォールバック〕の削除・`import-kessan-dev.mjs` の書き換えは3つとも分けない** — 分けると、テーブルだけ消えた中間状態で旧URL・未一致IDへのアクセス、または dev の決算取込が `relation does not exist` で落ちる（2巡目・3巡目レビュー指摘）。⚠️ **vendorの最終突き合わせは、このmigrationファイルの中で`DROP TABLE`と同じトランザクションで実行する**（4巡目レビュー指摘・下記参照。事前に別途「もう一度手で確認する」だけでは、確認からデプロイまでの間の書き込みで再度差分が発生し得る）: migrationの先頭で `LOCK TABLE vendors IN ACCESS EXCLUSIVE MODE`（`customers` も同様）を取り、以降そのトランザクションが終わるまで `vendors`/`customers` への書き込みはブロックされる状態にした上で、①差分の突き合わせ・`companies` への反映 ②`DROP TABLE` を同じトランザクション内で連続して実行する。これにより「確認した時点と削除する時点の間に別の書き込みが割り込む」余地を無くす（ロック待ちの間 `PUT /vendors/:id` は待たされ、テーブルが消えた後は正常に404/500として扱われる — 静かにデータが失われることはない）。**着手直前に必ず**: ①本番の**オンデマンドバックアップを取り、リストア可能なことを確認する**（`docs/ops/db-backup-restore.md` の手順。定期バックアップは最大3時間遅れており、かつ `deploy.yml` はmigrationのロールバックを行わないため、この一回限りのバックアップが唯一の戻し道になる。3巡目レビュー指摘）。⚠️ **このバックアップは「PR作成前」の1回では不十分**（5巡目レビュー指摘）: 執筆・レビュー・マージ前検証（下表7）には数時間〜数日かかり得、その間も本番は書き込みを受け続ける。`deploy.yml` はコンテナを作り直すだけでバックアップは取らない（`.github/workflows/deploy.yml`）。そのため**このPRをマージし、このmigrationを実行するデプロイを開始する直前にもう一度オンデマンドバックアップを取り直す**（PR作成前の1回はリハーサル、デプロイ直前の1回が本番のゲート）②実DBで「`customers.company_id`/`vendors.company_id` が NULL の行が0件」「その値が `companies.id` として実在すること」（`companies` 自体には `company_id` 列は無い。2巡目レビュー指摘で表現を訂正）「`tool_name='create_customer'` の `mcp_audit_log.created_id` が全て `companies.id` として解決できる」を確認。**この2点＋下表7の全項目がこのPRのマージ前ゲート**（3巡目レビュー指摘・下の注記参照） |
| 6 | ドキュメントの後始末 | `docs/deploy-pipeline.md` のロールバック注記に「Phase 3-3以降は `customers`/`vendors` テーブル自体が無いため、それ以前のタグには戻せない」を追記。この `phase3-2-plan.md` を `docs/version-history.md` 側にアーカイブするか判断 |
| 7 | 検証（**4・5どちらのPRに対してもマージ前ゲート**） | `npm run test` / `typecheck` / `lint` / `verify:fresh`（実Postgres）。本番相当データで孤立行0件・`GET /customers` `GET /vendors` `GET /gpm/customers` `GET /search` `GET /vendor-summary`（`reports.routes.ts`）の応答・`GET /companies/:id/summary` の権限別（`budget:editor` のみ／`sales:owner` あり）の見え方・MCP `list_customers`/`list_purchases`・`is_ai_created` 表示・`GET /companies` の役割判定（旧 `deleted_at` 判定の代替）・`import-kessan-dev.mjs` の動作を確認。⚠️ **4・5はどちらもメイン=検証環境という運用**（`main` マージ即 `dev.gmo-onair.jp` へ自動デプロイ・migrationは再実行されない）の上に載る不可逆な変更なので、**このチェックはそれぞれのPRをマージした後ではなく、マージする前にすべて終えること**（3巡目・6巡目レビュー指摘。マージ後に不具合が見つかっても、その時点で列・テーブルは検証環境から既に消えており、migrationを直して直せる状態ではない）。4のマージ後・5のマージ後それぞれで同じチェックを本番相当データで**繰り返す**（1回で終わりにしない） |

⚠️ **1は「テーブルは残ったまま」でも単独で着手できる**（読み込み側の挙動を変えない
純粋なバックフィルのため。ただし正式なゼロ件保証ではなく、最終確認は5のmigration内で
ロックと同時に行う）。**2・3は互いに順序依存がある**（**3〔`mcp_audit_log`旧ID移行〕は
2〔全参照箇所の書き換え〕の `customers.routes.ts` 分より先に着手する** — 逆順にすると
AI登録判定が読み込み手段を失う窓ができる。5巡目レビュー指摘）。**4・5は明確に不可逆**で、
4は2の完了が、5は1・2・3すべての完了＋直前のバックアップ（2回・PR作成前とデプロイ直前）・
7の全項目（マージ前ゲート）が前提。この計画では安全側に倒して 1〜3 も含め着手条件
（次の節）が揃うまでは着手しないこととする（本番相当データで検証したいため）。

#### 工程表

実カレンダー日程ではなく**依存順**（GMOのバージョニング方針上、リリース時期は
ユーザーの「本番に入れて」の指示に依存し事前に日付を確定できないため）。

```mermaid
gantt
    title Phase 3 継続工程表（3-2 完了 → 3-3）
    dateFormat  X
    axisFormat  %s

    section 完了済み
    Phase 3-1 支払条件のcompanies一本化 (PR #188/#190/#192) :done, p31, 0, 1
    Phase 3-2a 顧客系FK張り替え (migration 200)            :done, p32a, 1, 2
    Phase 3-2b 仕入先系FK張り替え (migration 201)           :done, p32b, 2, 3

    section 未着手（このタスクは計画のみ）
    本番リリース公開（3-2まで含む版・ユーザー指示待ち）      :crit, milestone1, 3, 4
    互換確認期間（最低1リリースサイクル）                    :active, wait1, 4, 5
    Phase 3-3-1 legacyフォールバック使用状況の確認           :p33_0, after wait1, 1
    Phase 3-3-2 vendor側最新値の分析(companiesへの書き込みなし) :p33_1, after p33_0, 1
    Phase 3-3-3 mcp_audit_log旧ID移行(バックフィル+書込+読込を同時)   :p33_2b, after p33_1, 1
    Phase 3-3-4 全参照箇所の書き換え・旧列書き込み停止(companiesのみに・customers.routes.tsのCUSTOMER_JOIN除去含む) :p33_2, after p33_2b, 2
    Phase 3-3-5 直前バックアップ+検証(旧列削除PRのマージ前ゲート) :crit, p33_3g, after p33_2, 1
    Phase 3-3-6 旧支払条件列の削除 (migration)               :p33_4, after p33_3g, 1
    Phase 3-3-7 直前バックアップ(1回目・テーブル削除PR作成前)  :p33_5a, after p33_4, 1
    Phase 3-3-8 検証(test/typecheck/lint/verify:fresh・マージ前ゲート) :crit, p33_5c, after p33_5a, 1
    Phase 3-3-9 直前バックアップ(2回目・デプロイ開始直前)+テーブル削除(vendor最終突合をロック内で同時実行)+フォールバック削除+dev script書換(同一デプロイ) :crit, p33_5, after p33_5c, 1
    Phase 3-3-10 ドキュメント後始末・本番相当データでの再検証  :p33_7, after p33_5, 1
```

| 順序 | 作業 | 前提 | 誰が着手を判断するか |
| --- | --- | --- | --- |
| 1 | 3-2まで含む版の本番リリース | ユーザーが「本番に入れて」と明示 | ユーザー |
| 2 | 互換確認期間（最低1リリースサイクル） | 1が完了 | **「次の通常リリースが出た時点」だけでは自動的に満了しない**（PR #214 2巡目レビュー指摘）。①legacyフォールバック使用状況の可視化（下表#3-3-1・B）が本番公開され②公開後に意味のある観測期間が経過し③次の通常リリースが出る、の3つが揃って満了（詳細は「互換確認チェックリスト」D） |
| 3 | 3-3-1 legacy URL の使用状況確認 | 2が満了 | 着手セッション（アクセスログ等で確認してから4以降に進む） |
| 4 | 3-3-2 vendor側最新値の分析（上表#1・**`companies` への書き込みは行わない**。差分の件数把握のみ） | 3の後（テーブルは残したまま安全に実施可・単独PRでよい） | 着手セッション |
| 5 | 3-3-3 `mcp_audit_log` の旧ID移行（バックフィル＋`customers.tools.ts`の書き込み切り替え＋`customers.routes.ts`の読み込み切り替えを**同一PR/デプロイ**で・上表#3） | 4と独立に着手可。**3つを分割しない**。**6より先に着手する**（5巡目レビュー指摘・下記参照） | 着手セッション |
| 6 | 3-3-4 `customers`/`vendors` を直接参照する全箇所の書き換え・旧支払条件列への書き込み停止（上表#2。`vendors.routes.ts` 自身の通常フロー・`xpoint.routes.ts` を含む。**着手前に対象一覧をコードで再確認**） | 4の反映内容を踏まえて設計。対象が多いため複数PRに分けてよいが、**`companies.routes.ts` の旧列書き込み停止は8より前に必ず完了させる**。⚠️ **`customers.routes.ts` の `CUSTOMER_JOIN` 除去（legacyフォールバック除去とは別の、通常の一覧・詳細・360°ビューが使うJOIN）は5がマージ済みであることを確認してから着手する**（先に消すと `is_ai_created`/`ai_requested_by` が読み込み手段を失う。5巡目レビュー指摘） | 着手セッション |
| 7 | 3-3-5 オンデマンドバックアップ＋検証一式（上表#7）を**旧支払条件列削除PRのマージ前ゲート**として実施 | 6がマージ済み | 着手セッション（6巡目レビュー指摘。**列削除もテーブル削除と同格の不可逆変更**として同じゲートを課す） |
| 8 | 3-3-6 旧支払条件列の削除（migration・上表#4） | 7が完了していること | 着手セッション（同一PR内で新規migrationファイルを追加。既存ファイルは編集しない） |
| 9 | 3-3-7 オンデマンドバックアップ（1回目・テーブル削除PR作成前のリハーサル） | 4・5・6・8がすべてマージ | 着手セッション（テーブル削除PRを作る**前**に実施。**vendorの最終突き合わせはここでは行わない** — 11のmigration内でロックと同時に行う。4巡目レビュー指摘） |
| 10 | 3-3-8 検証一式を**マージ前ゲート**として実施（`test`/`typecheck`/`lint`/`verify:fresh`・実DBでの孤立0件・エンドポイント応答・上表#7） | 9の後、11のPR（テーブル削除PR）をマージする**前** | 着手セッション |
| 11 | 3-3-9 オンデマンドバックアップ（**2回目・このデプロイを開始する直前**）＋ `customers`/`vendors` テーブル削除（**`LOCK TABLE ... IN ACCESS EXCLUSIVE MODE`の中でvendor最終突き合わせ〔`companies`への実際の反映はここが初めて〕を実行してから`DROP TABLE`・同一トランザクション**）＋ legacy フォールバックコード削除 ＋ dev専用スクリプト書き換え（**すべて同一PR/デプロイ**・上表#5） | 9・10が完了していること。**分割しない**。⚠️ **1回目のバックアップだけでは足りない**（執筆・レビュー・マージ前検証の間も本番は書き込みを受け続けるため。5巡目レビュー指摘） | 着手セッション |
| 12 | 3-3-10 ドキュメント後始末（上表#6）・本番相当データでの再検証（上表#7を**繰り返す**） | 11がマージ | 着手セッション |

4〜12のうち、**同一PR/デプロイで出すと明記した箇所（5の3点セット・11のバックアップ・
テーブル削除・フォールバック削除・dev script書き換えの4点セット）は分割しないこと**
— 分けた瞬間に中間状態の本番が壊れる（2026-08-18 PR #211 2巡目レビューで指摘された誤り）。
それ以外は複数PRに分けてよい（3-2a/3-2bの実績では「migration + 読み書き経路の追随」を
1PRにまとめている）。**8（列削除）と 11（テーブル削除）はどちらも不可逆**なので、
それぞれの直前に必ずバックアップと検証一式を済ませること（3巡目・6巡目レビュー指摘。
マージ後に問題が見つかっても、`main`マージ即検証環境へ自動デプロイかつmigrationは
再実行されないため、その時点では手遅れになる）。**5（`mcp_audit_log`旧ID移行）が
6（`customers.routes.ts`の書き換え）より先という順序も入れ替えないこと**
（5巡目レビュー指摘・入れ替えると `is_ai_created` の読み込み手段を失う窓が生まれる）。
