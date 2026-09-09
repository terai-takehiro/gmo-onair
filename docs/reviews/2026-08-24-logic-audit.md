# ロジック不具合の総点検（マルチエージェント監査）

> **種類**: 実施済みの記録
> **状態**: 確定25件は PR #415〜#424（v4.4.4）で全件修正済み。末尾の「対応方針（未着手・ご判断待ち）」は監査時点の記述
> **最終確認**: 2026-09-08（v4.6.10）

2026-08-24。ユーザー指摘「案件作成で残り20件を見る」「他の人が処理したものが各個人に残る」の
2件を直した流れで、「同種のロジックミスが多発している」というご指摘を受け、アプリ全体
（案件管理・財務・カレンダー・設定・GPM・日常業務・機材管理・制作技術支援・計時視聴者・共通ライブラリの
10領域。廃止済みの `client-awards` は対象外）を Workflow（多エージェント）で点検した。

## 進め方

1. **Find** — 10領域へ1エージェントずつ並行して割り当て、直近見つかった3パターン
   （① 件数の不一致 ② 行き止まりの導線 ③ invalidate漏れ）を中心に、確信度の高い順に最大5件ずつ探索
2. **Verify** — 指摘1件につき別のエージェントが実ファイルを再度読み、再現条件を具体的に
   説明できるものだけ CONFIRMED とし、severity（P1/P2/P3）を判定

**総指摘 28 件 → 確定 25 件**（誤検知・既知仕様として却下 3 件）。

⚠️ **これは点検（発見）のみで、まだ1件も直していない。** 対応方針は本文末尾を参照。

## 内訳（severity）

- P1（データ破損・機能が完全に動かない/明確に誤動作する）: **1 件**
- P2（混乱を招くが回避可能・限定的な条件でのみ発生）: **21 件**
- P3（軽微・見た目のみ）: **3 件**

## 一覧

### P1（急ぎ）

#### 1. [live] 番組（liveops_programs）を削除するとき、その番組が計測中（measuring=TRUE）でも計測を止めずにソフトデリートするため、組織全体で「同時に計測できるのは1案件だけ」というロックが永久に解放されなくなる。

- **ファイル**: `server/src/contexts/liveops/routes/programs.routes.ts`:296
- **なぜ不具合か**: DELETE /:id は `UPDATE liveops_programs SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL` を実行するだけで、measure.service.ts の `stopMeasurement()` を一切呼ばない。measure.service.ts の `startMeasurement()` は `NOT EXISTS (SELECT 1 FROM liveops_programs WHERE measuring)` で全体を見るがこの副問い合わせは deleted_at を見ていない（migration 221 の部分ユニーク索引 `liveops_single_measurement ON liveops_programs (measuring) WHERE measuring` も同様に deleted_at を見ない）。measuring=TRUE のまま削除された行の setInterval（measure.service.ts の ticks）は次の pollOnce 実行時に `WHERE id=$1 AND deleted_at IS NULL` で行が見つからず `clearTick()` して即 return するだけで、DB 側の measuring は FALSE に戻されない（170-186行目の通常の stopMeasurement 経路を通らない）。restoreMeasurements() も起動時に `WHERE measuring = TRUE AND deleted_at IS NULL` しか見ないので、このソフトデリートされた行は二度と検知・解放されない。結果、以後どの案件でも計測開始（POST /liveops/measure/:programId/start）が常に409（『別の案件がいま計測中です』、しかも current は deleted_at フィルタで見つからず null）で失敗し続ける。画面側にはこの詰まりを解消する導線が一切ない（削除済み番組は一覧・詳細どこにも出てこない）ため、DBを直接いじる以外に復旧手段がなく、CLAUDE.md の「本番DBへの直接SQLは緊急時のみ」方針にも反する詰まりを生む。
- **直し方の案**: programs.routes.ts の DELETE /:id で、削除前に measuring=TRUE なら stopMeasurement(id, 'system', ...) を呼んでから deleted_at を立てる。加えて、measure.service.ts の startMeasurement の NOT EXISTS 副問い合わせと部分ユニーク索引の対象に `deleted_at IS NULL` 条件を含める（索引は再作成が要る）。
- **根拠（読んだ箇所）**: server/src/contexts/liveops/routes/programs.routes.ts:296-306 (DELETE ハンドラに stopMeasurement 呼び出しなし) / server/src/contexts/liveops/measure.service.ts:111-128 (NOT EXISTS が deleted_at を見ない) / server/src/contexts/liveops/measure.service.ts:203-216 (pollOnce は行が見つからないと clearTick のみで stopMeasurement を呼ばない) / server/src/contexts/liveops/measure.service.ts:305-317 (restoreMeasurements も deleted_at IS NULL 行しか見ない) / server/src/shared/db/migrations/221_liveops_server_measure.sql:51-56 (部分ユニーク索引が deleted_at を見ない)
- **検証エージェントの判定理由**: Verified directly in code. DELETE /liveops/programs/:id (programs.routes.ts:296-306) soft-deletes by setting deleted_at without calling stopMeasurement or clearing `measuring`. If the deleted program was mid-measurement, measure.service.ts's startMeasurement (line 125) uses `NOT EXISTS (SELECT 1 FROM liveops_programs WHERE measuring)` — no deleted_at filter — so the lock is never released. pollOnce (line 207/211) filters by `deleted_at IS NULL`, so once the row is soft-deleted it can no longer find the row to call stopMeasurement; it just clears its own local setInterval and returns, leaving the DB's `measuring=TRUE` intact. restoreMeasurements on server restart (line 307) also filters `deleted_at IS NULL`, so it never recovers the stuck row. The partial unique index `liveops_single_measurement` (migration 221, line 55-56) likewise ignores deleted_at. Net effect: after this sequence, every subsequent POST /liveops/measure/:programId/start for any program returns 409 permanently, with `current: null` (since the "who is measuring" lookup also filters deleted_at IS NULL), and there is no UI path to see or fix the stuck deleted program — only a direct DB UPDATE recovers, which conflicts with the project's own policy against ad-hoc production DB writes.

### P2（通常）

#### 2. [equipment] 機材台帳の作成・更新・削除、貸出の記録・返却・削除、メンテナンス記録の作成・更新が、モジュール既定の 'reader' 権限のまま実行できてしまう（editor/manager 相当のチェックが抜けている）

- **ファイル**: `server/src/contexts/equipment/routes/equipment.routes.ts`:234
- **なぜ不具合か**: router.use(requireAuth, requirePermission('equipment')) (19-20行目) はモジュール既定の 'reader' しか要求しない。同じファイルの他の書き込み系エンドポイントは明示的に requirePermission('equipment','owner'|'manager'|'editor') を付けている（例: locations POST/PUT が 'owner'=56/70行目、items/bulk-update が 'manager'=221行目、inventory-checks の items/status 更新が 'editor'=371/378行目、rental-settings PUT が 'owner'=927行目、scans POST が 'editor'=866行目）。ところが POST /items (234)・PUT /items/:id (241)・PATCH /items/:id (249)・DELETE /items/:id (261)・POST /lendings (282)・POST /lendings/batch (289)・PUT /lendings/:id/checkout (300)・PUT /lendings/:id/return (307)・DELETE /lendings/:id (314)・POST /maintenance (335)・PUT /maintenance/:id (342) にはこの追加ゲートが無く、requirePermission('equipment') 既定の 'reader' のまま通ってしまう。一方フロント側は client-equipment/src/pages/equipmentList/ItemsPanel.tsx の68-69行目で `canEdit = hasPermission('equipment','editor')` / `canDelete = hasPermission('equipment','manager')` として編集・削除ボタンをその権限が無いと出さない設計になっており、バックエンドもそれと揃えるのが意図と読める。閲覧のみの 'reader' 権限を持つ利用者が API を直接叩けば、台帳の新規作成・編集・削除、貸出の記録・返却・削除、メンテナンス記録の作成・完了操作ができてしまう（本来のUI上の権限境界と食い違う）。
- **直し方の案**: items/lendings/maintenance の書き込み系ルートに、フロントの hasPermission と揃えた requirePermission('equipment','editor') （削除系は 'manager'）を明示的に追加する。
- **検証エージェントの判定理由**: Verified directly in server/src/contexts/equipment/routes/equipment.routes.ts. Line 21 sets the module default: `router.use(requireAuth, requirePermission('equipment'))`, and requirePermission's minLevel defaults to 'reader' (server/src/shared/middleware/auth.ts:184, `minLevel: PermissionLevel = 'reader'`). Many write routes in this same file explicitly add a second, stricter requirePermission('equipment', <level>) middleware (locations POST/PUT/DELETE = owner @56/70/159, items/bulk-update = manager @221, items/export = exporter @199, inventory-checks items/status/delete = editor/manager @371/378/385, settings PUT = owner @818, scans POST = editor @866, rental-settings PUT = owner @927) — showing this is the file's established, deliberate pattern for gating writes.

However, the following write endpoints have no such second gate and fall through to the bare 'reader' default:
- items: POST /items (234), PUT /items/:id (241), PATCH /items/:id (249), DELETE /items/:id (261)
- lendings: POST /lendings (282), POST /lendings/batch (289), PUT /lendings/:id/checkout (300), PUT /lendings/:id/return (307), DELETE /lendings/:id (314)
- maintenance: POST /maintenance (335), PUT /maintenance/:id (342)

I confirmed the corresponding services (item.service.ts, lending.service.ts, maintenance.service.ts) contain no internal role/permission checks of their own (grep for "permission|role" returned nothing), so the route middleware is the only enforcement point and there is no defense-in-depth catching this.

The frontend confirms the intended levels: client-equipment/src/pages/equipmentList/ItemsPanel.tsx:68-69 gates edit UI on `hasPermission('equipment','editor')` and delete UI on `hasPermission('equipment','manager')` — i.e. the UI already assumes a higher bar than 'reader' for exactly the item write operations that the backend fails to enforce.

Reproduction: a user granted only 'equipment' = 'reader' (view-only) authenticates normally and calls e.g. `POST /items`, `DELETE /items/:id`, `POST /lendings`, `PUT /lendings/:id/return`, or `POST /maintenance` directly (bypassing the UI, which hides these actions). Since no route-specific requirePermission raises the bar above 'reader', requirePermission('equipment') alone lets the request through, so the reader-only user can create/edit/delete equipment ledger entries, record/return/delete lendings, and create/update maintenance records — actions the UI intentionally prevents for that permission level.

Rated P2 rather than P1: this is a genuine broken-access-control bug (not already mitigated, not intentional — the surrounding code in the same file demonstrates the intended pattern was simply not applied here), but exploitation requires an authenticated user who already has at least 'equipment' module access at 'reader' level deliberately calling the API outside the UI; it is not a totally-broken feature nor does it corrupt data for ordinary usage through the app.

#### 3. [equipment] メンテナンスの状態変更（故障報告→修理中、完了→稼働中）でサーバー側が equipment_items.status を書き換えるのに、クライアントの invalidate() は 'maintenance-records' と 'equipment-stats' しか無効化しておらず、機材台帳・機材詳細・貸出ダイアログの候補一覧が古い状態のまま残る

- **ファイル**: `client-equipment/src/pages/MaintenancePage.tsx`:56
- **なぜ不具合か**: server/src/contexts/equipment/services/maintenance.service.ts の create() (72-77行目) は record_type==='breakdown' のとき equipment_items.status を 'in_repair' に、update() (96-108行目) は status==='completed' のとき 'active' に書き換える。ところが client-equipment/src/pages/MaintenancePage.tsx の invalidate() (56-59行目) は ['maintenance-records'] と ['equipment-stats'] しか invalidateQueries しておらず、機材そのものを引く ['equipment-items']（台帳一覧）・['equipment-item', id]（EquipmentDetailPage.tsx 84行目、326-327行目で status バッジを表示）・['equipment-lendable']（LendingDialog.tsx 65-71行目で status:'active' で貸出候補を絞り込む）のいずれも古いキャッシュのまま。修理完了直後に機材詳細を開いても『修理中』のバッジが残ったり、逆に故障報告直後に貸出ダイアログを開くと（30秒の staleTime 内なら）まだ稼働中扱いの壊れた機材が貸出候補に出続ける。
- **直し方の案**: MaintenancePage.tsx の invalidate() に qc.invalidateQueries({queryKey:['equipment-items']})・['equipment-item']（該当機材のみでも可）・['equipment-lendable'] を追加する。
- **検証エージェントの判定理由**: 実際にコードを確認し、指摘は正確だった。

server/src/contexts/equipment/services/maintenance.service.ts:
- create() 72-77行目: record_type==='breakdown' のとき equipment_items.status を 'in_repair' に更新
- update() 96-108行目: status==='completed' のとき equipment_items.status を 'active' に更新

client-equipment/src/pages/MaintenancePage.tsx:56-59行目の invalidate() は
  qc.invalidateQueries({ queryKey: ['maintenance-records'] })
  qc.invalidateQueries({ queryKey: ['equipment-stats'] })
の2つだけで、機材そのものを引くキーは一切含まれていない。

実際に他画面で使われているキーを確認したところ:
- 台帳一覧: ['equipment-items', urlSearch, includeChildren]（useEquipmentListState.ts:87）
- 機材詳細: ['equipment-item', id]（EquipmentDetailPage.tsx:84）でステータスバッジ表示（313-327行目）
- 貸出候補: ['equipment-lendable']（LendingDialog.tsx:65-71）で status:'active' 絞り込み、**staleTime: 30_000 が明示的に設定されている**

これらはいずれも MaintenancePage の invalidate() の対象外。比較として LendingListPage.tsx（貸出の完了/返却時）は72-74行目で ['equipment-lendings']・['equipment-stats']・['equipment-lendable'] の3つを invalidate しており、機材ステータスが変わる操作では equipment-lendable も無効化するのが本来のパターンであることが分かる。MaintenancePage だけこのパターンが抜けている。

再現条件: (1) 機材Aの状態を「稼働中」から故障報告すると equipment_items.status が in_repair になるが、直前に開いていた貸出ダイアログ（staleTime 30秒以内）や機材詳細ページのキャッシュには反映されず、貸出候補に壊れた機材が出続けたり詳細のバッジが「稼働中」のまま残る。(2) 修理完了で active に戻したときも、事前に機材台帳/詳細を開いていた場合は 'in_repair' のバッジが残り続ける（ページ遷移で自然に再取得されるまで）。

MaintenancePage.tsx 冒頭のコメント（4-7行目）に「状態を遷移させる」ことは明記されているが、機材側キャッシュの無効化についての意図的な除外を示す記述はなく、意図した仕様ではなく単なる漏れと判断した。

#### 4. [equipment] ダッシュボードの『貸出中』タイルが表示する『返却遅延 N点』（正確な全件カウント）と、同じ画面の『返してもらう』一覧（直近5件からの抽出）が食い違いうる

- **ファイル**: `client-equipment/src/pages/DashboardPage.tsx`:98
- **なぜ不具合か**: server/src/contexts/equipment/services/stats.service.ts の overdue (52-54行目) は equipment_lendings 全体を COUNT する正確な値だが、DashboardPage.tsx が『返してもらう』セクションの元にする s.recent_lendings は同ファイル62-73行目の recentLendings で status='lent' の中から ORDER BY el.lent_at DESC LIMIT 5（＝直近に貸し出された5件、返却期限の近さ・超過では並んでいない）。DashboardPage.tsx 98-99行目で overdueLendings/soonLendings をこの最大5件からさらに絞り込んで表示するため、返却遅延が5件を超えている、または遅延している貸出がたまたま『直近に貸し出した5件』に入っていない場合、KPIタイル（dashboard/kpiCells.ts 41行目 `返却遅延 ${s.overdue} 点`）が示す件数より『返してもらう』セクションに並ぶ遅延件数の方が少なくなる。同一画面内でバッジの件数と実際に見える一覧の件数が食い違う。
- **直し方の案**: recentLendings のクエリを ORDER BY due_date（NULLは末尾）ASC などに変え、少なくとも返却遅延の全件（または妥当な上限まで）を優先して返すようにする。
- **検証エージェントの判定理由**: 実際に再現しうるロジック不整合。server/src/contexts/equipment/services/stats.service.ts の overdue (52-54行目) は equipment_lendings 全体を status='lent' AND due_date < 今日 で正確に COUNT する。一方 recent_lendings (62-76行目) は同じ status='lent' の中から ORDER BY el.lent_at DESC LIMIT 5（＝直近に貸し出された5件）で、due_date による絞り込みや並び替えは一切していない。DashboardPage.tsx 98-99行目の overdueLendings/soonLendings はこの最大5件からのみ dueIn(due_date)<0 で抽出している。

再現条件: 貸出中(status='lent')が6件以上あり、返却期限を過ぎている(過去のdue_date)ものが「直近に貸し出した5件」に含まれない場合（＝古くに貸し出して長期延滞している機材が、最近貸し出された非延滞の機材に「直近5件」の枠から押し出される）に発生する。この場合、KPIタイル（kpiCells.ts 41行目 `返却遅延 ${s.overdue} 点`、tone='danger'）およびページヘッダー副題（DashboardPage.tsx 106行目）は正しい延滞件数（例: 5点）を表示する一方、「返してもらう」セクション（159-213行目）は延滞0件のまま EmptyState「返してもらうものはありません」を出しうる（167-171行目）。同一画面内で「返却遅延あり」の警告表示と「返却遅延なし」の一覧表示が矛盾する。

なお「すべて見る」リンク先の LendingListPage.tsx は全件を独自に isLate() (39行目) で判定しており、そちらでは正確に表示されるため回避手段はある。またコード中のコメント（DashboardPage.tsx 17-18行目）は「本日・明日の入出庫」セクションについての注記であり、「返してもらう」一覧がKPIと異なる母集団になり得ることへの言及はなく、意図された仕様である形跡もない。破損や機能停止ではなく表示の不整合（誤解を招くが回避可能）のため P2。

#### 5. [equipment] 機材詳細ページの『貸出履歴』カードが equipment_section==='rental' のときしか表示されず、実際に貸出可（is_rental_listed）で貸出履歴のある『設備』区分の機材では、データがあっても履歴が一切見えない

- **ファイル**: `client-equipment/src/pages/EquipmentDetailPage.tsx`:777
- **なぜ不具合か**: 貸出可否を判定する実際のフラグは is_rental_listed（EquipmentDetailPage.tsx 内の貸出一覧設定セクション、618-636行目や useRentalToggle.ts）で、機材台帳のどのタブ（equipment_section: 'equipment'/'rental'）からでも独立にON/OFFできる（client-equipment/src/pages/equipmentList/useRentalToggle.ts 全体、EquipmentCells.tsx 69行目）。実際の貸出（equipment_lendings への登録）も lending.service.ts の create() は is_rental_listed どころか equipment_section も一切見ておらず、item.service.ts の getById() (309-312行目) は equipment_section に関係なく equipment_lendings を全部取得して item.lendings に積む。ところが EquipmentDetailPage.tsx 777行目のカード表示条件は `item.equipment_section === "rental"` であり、is_rental_listed / effective_rental_listed を見ていない。バッジ自体も783行目で『貸出可』と表示しており、意図された条件は is_rental_listed だったと考えられる。equipment_section='equipment' のまま貸出可にして実際に貸し借りした機材は、item.lendings にデータがあっても詳細画面には貸出履歴が一切出ない。
- **直し方の案**: カードの表示条件を item.equipment_section === 'rental' から item.is_rental_listed（または effective_rental_listed）に変える。
- **検証エージェントの判定理由**: 実際にファイルを読んで再現条件を確認した。

`client-equipment/src/pages/EquipmentDetailPage.tsx:777` の「貸出履歴」カードの表示条件は `item.equipment_section === "rental"` のみで、`is_rental_listed`/`effective_rental_listed` を見ていない（該当ファイル全体を grep しても `is_rental_listed` は一度も出現しない）。

- `equipment_section` は `SECTIONS`（`client-equipment/src/lib/constants.ts:23-26` "設備"/"貸出"）という新規登録時に選ぶ静的な区分（機材台帳のタブ分類）であり、実際に貸し借り可能かどうかを表す `is_rental_listed` フラグとは独立している。`is_rental_listed` は同じ `EquipmentDetailPage.tsx` 内の「貸出一覧設定」セクション（616-644行目）で `equipment_section` に関係なく編集でき、`RentalRulesTab.tsx`・`useRentalToggle.ts`・`EquipmentCells.tsx` でも独立にON/OFFされる設計であることを確認した。
- サーバー側 `item.service.ts` の `getById()`（288-333行目）は `lendings` を `WHERE equipment_id = $1` のみで取得しており（309-312行目）、`equipment_section` や `is_rental_listed` による絞り込みは一切ない。
- `lending.service.ts` の `create()`（73行目〜）も `equipment_section`・`is_rental_listed` を一切参照していない（grep で該当なし）。

これにより、`equipment_section='equipment'`（設備区分）のまま `is_rental_listed=true` にして実際に貸出・返却を行った機材は、`item.lendings` にデータが載っているにもかかわらず、詳細画面の「貸出履歴」カードそのものが描画されず、貸出履歴が一切見えない。バッジ文言「貸出可」（783行目）も `is_rental_listed` の意図を示唆しており、条件の取り違えと判断できる。

severityはP2とした：データ自体は失われておらず（`equipment_lendings` は健在）、`/equipment/lending-list`（`LendingListPage.tsx`、`GET /equipment/lendings` で全件取得・equipment_section絞り込みなし）で該当機材の貸出記録自体は別画面から確認可能なため回避手段があり、また発生条件も「equipment区分のまま貸出可にして実際に貸し借りした機材」という限定的な組み合わせに限られる。ただし詳細画面という主要な確認導線で情報が完全に欠落する点は実務上の混乱を招く。

#### 6. [finance] 仕入一覧の Excel 取り込み（インポート）成功後、一覧の react-query キーが違うため画面が古いままになる

- **ファイル**: `client/src/contexts/finance/pages/PurchaseListPage.tsx`:151
- **なぜ不具合か**: 一覧本体は `useCrudPage<PurchaseRow>({ endpoint: '/purchases', queryKey: ['purchases-all'], ... })`（79-88行目）で `['purchases-all']` を鍵に取得しているのに、同じ画面の `<ExcelToolbar queryKey={['purchases']} .../>`（148-152行目）は `['purchases']` を渡している。ExcelToolbar の commit 成功ハンドラ（client/src/components/ExcelToolbar.tsx 109-112行目）は `if (queryKey) qc.invalidateQueries({ queryKey })` しかせず、他の invalidate は一切ない。react-query の invalidateQueries は渡した配列が実際のクエリキーの**前方一致**でないと当たらないため、`['purchases']` は `['purchases-all']` に一致しない。結果、Excel で仕入を一括登録・更新しても「取り込み完了」ダイアログの裏の一覧は再取得されず、staleTime(60秒)が過ぎる／絞り込みを変える／画面を作り直すまで新しい行が出ない（更新した行も古い値のまま）。
- **直し方の案**: ExcelToolbar の queryKey を実際の一覧キーと同じ `['purchases-all']` にする（他の絞り込みパラメータ違いのクエリも前方一致で拾われる）。
- **根拠（読んだ箇所）**: PurchaseListPage.tsx: `const crud = useCrudPage<PurchaseRow>({ endpoint: '/purchases', queryKey: ['purchases-all'], ... })`（79-88行目）と `<ExcelToolbar resource="/purchases" name="仕入" queryKey={['purchases']} .../>`（148-152行目）。ExcelToolbar.tsx: `onSuccess: (d) => { setCommitted(d); setDryRun(null); if (queryKey) qc.invalidateQueries({ queryKey }); }`（109-112行目）。
- **検証エージェントの判定理由**: 実際にファイルを読んで確認した。PurchaseListPage.tsx:79-88 の一覧取得は `useCrudPage<PurchaseRow>({ endpoint: '/purchases', queryKey: ['purchases-all'], ... })` を使っており、shared/src/client/hooks/useCrudPage.ts:130-131 でこの `queryKey` は実際には `[...options.queryKey, 'list', {page, search, pageSize, extra}]`、つまり先頭要素が文字列 `'purchases-all'` の配列としてキャッシュされる。一方 PurchaseListPage.tsx:148-152 の `<ExcelToolbar queryKey={['purchases']} .../>` は、ExcelToolbar.tsx:110-112 の commit 成功ハンドラで `qc.invalidateQueries({ queryKey: ['purchases'] })` を呼ぶだけ。react-query の invalidateQueries は既定 `exact:false`（部分一致）でも、キー配列の各要素をインデックスごとに厳密比較するため、`['purchases'][0] === 'purchases'` と実クエリキーの `[0] === 'purchases-all'` は別の文字列であり一致しない（`'purchases'` は `'purchases-all'` の「前方一致文字列」であっても、query key の配列要素としては別要素なので前方一致にならない）。したがってこの invalidate は一覧のクエリに一切当たらない。

さらに `queryClient.ts:82,91` で `staleTime: 60_000` かつ `refetchOnWindowFocus: false` が既定になっており、PurchaseListPage はダイアログを開いたままインポートするだけで画面自体はアンマウントされないため、コミット成功後も一覧は自動では再取得されない（フィルタ変更や画面遷移で新しいクエリキーが作られたとき、または明示的にページを開き直したときにしか最新化されない）。

再現条件: 財務管理→仕入一覧を開いたまま、上部の「Excelインポート」から一括登録・更新を実行し「実行する」を押して commit を成功させる。ダイアログを閉じても、裏の仕入一覧（表本体）は追加/更新された行を反映せず、フィルタを変える・ページを移動する・画面を開き直すまで古いままになる（合計金額・件数チップも同様に古いまま）。

指摘は正確で、コード上ちょうどそのとおりに再現する。severity は P2 とした — データ自体は正しく保存されており、フィルタ変更や再訪問という容易な回避手段があるため（P1 の「機能が完全に動かない/データ破損」には当たらないが、明確な誤動作であり利用者が誤解する実害がある）。

#### 7. [finance] 販管費一覧の Excel 取り込み成功後も、一覧のクエリキーが違うため画面が古いままになる（PurchaseListPage と同型のバグ）

- **ファイル**: `client/src/contexts/finance/pages/SgaListPage.tsx`:240
- **なぜ不具合か**: 一覧本体は `useCrudPage<SgaExpense>({ endpoint: '/sga', queryKey: ['sga-list'], ... })`（87-96行目）だが、同画面の `<ExcelToolbar queryKey={['sga-expenses']} .../>`（237-241行目）は `['sga-expenses']` を渡しており、実際の一覧キー `['sga-list']` とは無関係な文字列。ExcelToolbar 側は渡された queryKey をそのまま invalidateQueries するだけ（前述の ExcelToolbar.tsx 109-112行目）なので、この invalidate は何にも当たらず、販管費の Excel 一括登録後に一覧が更新されない。
- **直し方の案**: ExcelToolbar の queryKey を `['sga-list']` に合わせる。
- **根拠（読んだ箇所）**: SgaListPage.tsx: `const crud = useCrudPage<SgaExpense>({ endpoint: '/sga', queryKey: ['sga-list'], ... })`（87-96行目）と `<ExcelToolbar resource="/sga-expenses" name="販管費" queryKey={['sga-expenses']} .../>`（237-241行目）。
- **検証エージェントの判定理由**: SgaListPage.tsx を実読して確認した。

- 87-96行目: `crud = useCrudPage<SgaExpense>({ endpoint: '/sga', queryKey: ['sga-list'], ... })`
- shared 側の実装（shared/src/client/hooks/useCrudPage.ts:130-131）で、実際の一覧クエリキーは `[...options.queryKey, 'list', {page, search, pageSize, extra}]` すなわち `['sga-list', 'list', {...}]` になる。
- 237-241行目: `<ExcelToolbar resource="/sga-expenses" name="販管費" queryKey={['sga-expenses']} .../>`
- ExcelToolbar.tsx 99-113行目: commit（取り込み確定）成功時に `if (queryKey) qc.invalidateQueries({ queryKey })` を呼ぶだけで、渡された `queryKey`（ここでは `['sga-expenses']`）をそのまま使う。

React Query の `invalidateQueries` は既定でキー配列の前方一致（fuzzy）マッチだが、`['sga-expenses']` は `['sga-list', 'list', {...}]` と最初の要素から食い違うため一切マッチしない。つまり Excel 一括取り込み確定後の invalidate は空振りし、一覧のキャッシュは無効化されない。

さらに共通 QueryClient（shared/src/client/queryClient.ts:82,91）は `staleTime: 60_000`・`refetchOnWindowFocus: false` なので、ダイアログを閉じて一覧に戻っても直後の再フェッチは起きず、フィルタ/検索/ページ/月を変えて別のクエリキーを発生させるか、60秒以上待つか、ページを再読み込みしない限り新規取り込み分が一覧に反映されない。

指摘どおり `PurchaseListPage.tsx`（`crud.queryKey=['purchases-all']` vs `ExcelToolbar queryKey={['purchases']}`）にも同型の不一致があり（`RevenueListPage.tsx` も同様に `['revenues-all', ...]` vs `['revenues']`）、"同型のバグ" という主張も裏付けられる。

再現条件: 販管費一覧画面で Excel インポートを開き、テンプレートに従い新規/更新行を含むファイルを取り込み確定（commit）する → インポート結果ダイアログには成功件数が出るが、閉じて一覧に戻っても（フィルタ操作や60秒経過、リロードをしない限り）取り込んだ行が一覧・件数・合計に反映されない。データ自体はサーバーに正しく保存されており実害（データ破損）はないため、機能は完全に死んではいないが利用者を確実に混乱させる（「取り込んだのに出てこない」）ので P2 とした。

#### 8. [finance] 売上一覧の Excel 取り込み成功後も、一覧のクエリキーが違うため画面が古いままになる（同上のパターン）

- **ファイル**: `client/src/contexts/finance/pages/RevenueListPage.tsx`:158
- **なぜ不具合か**: 一覧本体の useQuery は `queryKey: ['revenues-all', page, search, filterProjectId, month, cur.status, cur.state]`（97行目）だが、同画面の `<ExcelToolbar queryKey={['revenues']} .../>`（154-167行目、158行目が該当）は `['revenues']` を渡している。`['revenues']` は `['revenues-all', ...]` の前方一致にならない（先頭要素の文字列そのものが違う）ため、Excel で売上を一括登録・更新しても一覧に反映されない。
- **直し方の案**: ExcelToolbar の queryKey を実際の一覧キーの先頭要素 `['revenues-all']` に合わせる。
- **根拠（読んだ箇所）**: RevenueListPage.tsx: `queryKey: ['revenues-all', page, search, filterProjectId, month, cur.status, cur.state]`（97行目）と `<ExcelToolbar resource="/revenues" name="売上" queryKey={['revenues']} .../>`（154-167行目）。
- **検証エージェントの判定理由**: 実際にファイルを確認し、指摘どおりのクエリキー不一致を確認した。

- `RevenueListPage.tsx:97` の一覧本体 `useQuery` は `queryKey: ['revenues-all', page, search, filterProjectId, month, cur.status, cur.state]`
- 同ファイル `154-167行`（該当158行）の `<ExcelToolbar queryKey={['revenues']} .../>` は `['revenues']` を渡している
- `ExcelToolbar.tsx:112` の commit 成功時ハンドラは `if (queryKey) qc.invalidateQueries({ queryKey });` で、渡された `['revenues']` をそのまま使う

react-query の実装（`node_modules/@tanstack/query-core/build/modern/utils.js` の `partialMatchKey`）を確認したところ、`invalidateQueries` の既定の部分一致は `Object.keys(filterKey).every(key => partialMatchKey(actualKey[key], filterKey[key]))` で、配列の各インデックスを突き合わせる。フィルタキー `['revenues']` の index0 `'revenues'` と実クエリキー `['revenues-all', ...]` の index0 `'revenues-all'` は別の文字列であり `===` が成立しないため、`partialMatchKey` は false を返し、**このクエリはマッチしない**。つまり `['revenues']` は `['revenues-all', ...]` の前方一致にならない、という指摘の通り。

同じファイル内の他の書き込み経路（`RevenueDialog.tsx:176`、`ClosingPage.tsx:94`）は正しく `['revenues-all']` を invalidate しており、ExcelToolbar だけが異なるキーを渡している非対称な実装であることも確認した（意図した仕様ではなく単純なキーの取り違え）。

さらに `queryClient.ts` を確認すると共通の `staleTime: 60_000` かつ `refetchOnWindowFocus: false` のため、invalidate に失敗すると同一画面に留まる限り（ダイアログを閉じるだけでは remount しない）少なくとも60秒、実質的には他の絞り込み変更やページ再読み込みをするまで一覧が更新されない。

再現条件: 売上一覧画面（`/budget/revenues`）で「Excelインポート」から一括登録/更新を実行 (`commitMutation` 成功) → ダイアログの「閉じる」を押しても背後の一覧（`ledgerRows`）は import 前のデータのまま表示され続ける。ブラウザの再読み込みやフィルタ変更（新規のクエリキーになる操作）をすれば正しいデータが見えるため、機能停止ではなく表示の同期不備。データ自体はサーバーに正しく書き込まれておりデータ破損はないため severity は P2 と判定した。

#### 9. [finance] スマホの「入金の確認」で入金を記録しても、PC の財務③ 売上一覧（`revenues-all`）は invalidate されず古いまま残る

- **ファイル**: `client/src/contexts/finance/pages/closing/MobileCollect.tsx`:137
- **なぜ不具合か**: 129-136行目のコメントは「締めの鍵のままだったのを `['billing']` に直した」と経緯を説明しているが、続けて足された137行目の `qc.invalidateQueries({ queryKey: ['revenues'] })` は、案件詳細の `RevenueBillingPane.tsx`（117行目 `queryKey: ['revenues', 'project', projectId]`）には前方一致で当たるものの、財務の売上一覧 `RevenueListPage.tsx`（97行目 `queryKey: ['revenues-all', ...]`）には当たらない。売上一覧は行ごとに `paid_date`/`invoice_issued` から「入金済／発行済／未請求」バッジを算出して表示する（RevenueListPage.tsx 59-70行目 `billingState()`）ため、スマホで入金を記録した直後にPCの売上一覧を開いても、staleTime(60秒)が経つか手動で絞り込みを変えるまで「未請求」のまま表示され続ける（refetchOnWindowFocusはfalseなのでタブ切替でも直らない）。
- **直し方の案**: `['revenues']` に加えて（または代わりに）`['revenues-all']` も invalidate する。
- **根拠（読んだ箇所）**: MobileCollect.tsx: `qc.invalidateQueries({ queryKey: ['billing'] }); qc.invalidateQueries({ queryKey: ['revenues'] });`（136-137行目）。RevenueListPage.tsx: `queryKey: ['revenues-all', page, search, filterProjectId, month, cur.status, cur.state]`（97行目）、`billingState()`（59-70行目）。RevenueBillingPane.tsx: `queryKey: ['revenues', 'project', projectId]`（117行目）。共通 queryClient の `staleTime: 60_000` / `refetchOnWindowFocus: false`（shared/src/client/queryClient.ts 82,91行目）。
- **検証エージェントの判定理由**: MobileCollect.tsx:137 の invalidateQueries({queryKey:['revenues']}) は、PC財務③売上一覧 RevenueListPage.tsx:97 の実際のクエリキー ['revenues-all', ...] とは配列要素として不一致（'revenues' と 'revenues-all' は別の文字列）のため invalidate されない。同じ /billing/invoices/bulk を呼ぶPC版ClosingPage.tsx:94は明示的に ['revenues-all'] を invalidate しており、他の売上更新経路（RevenueDialog.tsx, ProjectGroupDetailPage.tsx, BusinessProjectView.tsx）もすべて 'revenues-all' を使っている中、MobileCollectだけがこのパターンを踏み外している。結果、スマホで入金記録後、PCの売上一覧（既に開いている場合はrefetchOnWindowFocus:falseのため無期限、再訪問時でもstaleTime 60秒以内なら）はバッジが「未請求」のまま古い表示になる。データ自体は破損せず、リロード・再訪問で解消するため深刻度はP2（誤解を招くが回避可能・限定的条件）とした。

#### 10. [gpm] ダッシュボードKPI「今週が期限の作業」のリンク先 `/gpm/tasks?tab=next` を、遷移先のGpmTaskListPageが一切解釈しないため、件数(weekDue)と実際に開いて見える一覧が食い違う。

- **ファイル**: `client/src/contexts/gpm/pages/dashboard/KpiStrip.tsx`:99
- **なぜ不具合か**: KpiStrip.tsx の kpiCells() は 'week' セルに `to: '/gpm/tasks?tab=next'` を設定し、kpis.weekDue（『今週が期限になっている、プロジェクトごとの直近タスク1件』の件数）を表示する。しかしリンク先の client/src/contexts/gpm/pages/GpmTaskListPage.tsx は `tab` クエリを `raw === 'asks' ? 'asks' : 'tasks'` としか判定しておらず（55-61行目）、'next' という値は存在しない扱いになり単に既定の 'tasks' タブへ落ちる。さらにタスクの絞り込みチップ（FilterChips）には 'open'/'overdue'/'done'/'all' の4種類しかなく（47-52行目, 196-206行目）、'今週期限' に相当する絞り込みは無く、taskChip の初期値は 'open'（69行目）なので、実際に開くのは『未完了の全タスク』であり、KPIが示した週内期限の件数とは無関係な一覧が表示される。MobileKpiRail.tsx も同じ kpiCells() を共用するためスマホでも同じ不具合が起きる。
- **直し方の案**: GpmTaskListPage 側で `tab=next`（または別のクエリキー）を認識し、`due_at` が今日〜週末に入るタスクだけに絞るチップ／初期状態を用意する。もしくは KpiStrip 側のリンクを、実際に存在する絞り込み（例えば `overdue` に相当するものか、素の `/gpm/tasks`）に変更し、存在しないフィルタを匂わせる文言・URLを出さない。
- **根拠（読んだ箇所）**: client/src/contexts/gpm/pages/dashboard/KpiStrip.tsx:92-100 と client/src/contexts/gpm/pages/GpmTaskListPage.tsx:59-106 を実際に読み、`tab=next` を処理するコードが存在しないことをリポジトリ全体で `tab=next`/`'next'` を grep して確認した（該当箇所はリンク元の1行のみ）。
- **検証エージェントの判定理由**: Verified by reading both files directly. KpiStrip.tsx:99 links to `/gpm/tasks?tab=next`, but GpmTaskListPage.tsx:60-61 only recognizes `tab=asks`, treating any other value (including `next`) as the default `tasks` tab; a repo-wide grep confirms no code anywhere handles the `'next'` value. Within the tasks tab, the task filter chips (open/overdue/done/all, lines 199-202) have no "due this week" option, and the chip state defaults to `open` (line 69), so the page always shows all incomplete tasks across all projects regardless of the query param. Additionally, the KPI's `weekDue` count (KpiStrip.tsx countKpis, lines 43-66) is computed per-project from `projects[].next_due` (one soonest-due item per live project), a different unit/granularity than the individual task rows the destination page lists — so even fixing the tab-parsing bug wouldn't make the displayed list match the KPI count without further changes. Reproduction: any user viewing the GPM dashboard (desktop KpiStrip or mobile MobileKpiRail, which share kpiCells()) clicks the "今週が期限の作業" tile; they land on /gpm/tasks showing an unrelated "未完了のタスク" (all open tasks) list with no indication the intended week-filter never applied.

#### 11. [platform-home-settings] 案件管理ダッシュボードの「期限が過ぎたやること」パネルの「やること一覧で見る」リンクが、パネルに並ぶ項目（activity_logsのnext_action超過分）とは無関係な /sales/tasks/list（project_tasksのGLS-Aタスク看板）へ送っている。

- **ファイル**: `client/src/contexts/platform/pages/salesDashboard/OverduePanel.tsx`:63
- **なぜ不具合か**: このパネルの行（および note の件数表示）は `GET /dashboard/overdue-actions` （server/src/contexts/platform/routes/dashboard.routes.ts の OVERDUE_ACTIONS_SQL、`activity_logs.next_action`/`next_action_date` が根拠）を数えている。一方 `to="/sales/tasks/list"` の行き先（server/src/contexts/tasks/routes/task-dashboard.routes.ts）は `project_tasks` を GLS-A 案件だけに絞って返す全く別のテーブル・別の集合（タスクのカンバン）で、活動記録の「次回アクション」は1件も含まれない。したがって「N件のうち古い順にSHOW件」と表示された直後に「やること一覧で見る」を押しても、押した先にはこれらの超過アクションが1件も並ばず、押しても何も片付けられない（行き止まりの導線）。実際にこれらの次回アクションを一覧・並べ替えできる画面は別に存在する（client/src/contexts/sales/pages/ActivityLogPage.tsx 配下の UpcomingPanel.tsx / Filters.tsx の「次回アクション期限順」・ルート /sales/activity-logs）。これは TaskHubCard.tsx で既に修正された「'/sales/tasks/list' は GLS-A タスクしか出さないのに別集合の件数を約束していた」のと全く同じ形の不具合が、同じダッシュボード内の別コンポーネントに残っている。
- **直し方の案**: Panel の `to`/`toLabel` を `/sales/activity-logs?sort=next_action`（またはこの一覧が実際に読む次回アクション超過の絞り込み）へ向ける。もしくは `inboxHrefOf('overdue_action', ...)` と同様に、この集合を一望できる専用画面が無いなら『残り◯件を見る』のような数量の約束をやめ、単独行の遷移（案件のやり取りタブ）に留める。
- **根拠（読んだ箇所）**: OverduePanel.tsx はサーバーの OVERDUE_ACTIONS_SQL（activity_logs 由来）を描画し note で「N件のうち…」と数を明言しながら to="/sales/tasks/list" にリンクしているが、task-dashboard.routes.ts が返すのは project_tasks（GLS-Aのタスクのみ）で next_action は一切含まれない。実際に次回アクションを一覧できる画面は /sales/activity-logs（UpcomingPanel.tsx）であり、行き先が別物になっている。
- **検証エージェントの判定理由**: 実際に確認した。OverduePanel.tsx（client/src/contexts/platform/pages/salesDashboard/OverduePanel.tsx:63）は GET /dashboard/overdue-actions を表示しており、このデータはサーバー側 OVERDUE_ACTIONS_SQL（server/src/contexts/platform/routes/dashboard.routes.ts:303-321）に基づく。これは activity_logs（a.next_action, a.next_action_date が NULL でなく、next_action_done_at が NULL で next_action_date < 今日、かつ案件が s_completed/e_lost 以外）を数えている。

一方 to="/sales/tasks/list" は App.tsx の `<Route path="/sales/tasks/:view">` で TaskDashboardPage にマッチし、これは useTaskDashboard() 経由で GET /task-dashboard を呼ぶ。サーバー側 task-dashboard.routes.ts は project_tasks を「GLS-A（gls_category='A'）の案件だけ」に絞って返しており、next_action / next_action_date / activity_logs には一切触れていない（SELECT句にも次回アクション由来のカラムは無い）。したがって OverduePanel に並ぶ行（activity_logs 由来の次回アクション）はリンク先の一覧に1件も現れない。

さらに、同じダッシュボード内の TaskHubCard.tsx のコメント（1-31行目）に、まさに同じ形の不具合（「全部ひらく」が /sales/tasks/list に送るがそこは GLS-A のタスクしか出さず、カードが数えている集合（個人・案件・プロジェクトタスクの混合）とは別物だった）が「ご指摘」により発見・修正済みであることが明記されており、これと全く同種の穴が OverduePanel.tsx にはまだ残っている。実際に次回アクションを一覧できる正しい行き先（/sales/activity-logs の UpcomingPanel.tsx、activity_logs.next_action_date を参照）も存在することを確認した。

再現条件: 案件管理ダッシュボードを開き、期限超過の次回アクションが1件以上ある状態で「期限が過ぎたやること」パネルの「やること一覧で見る」を押すと、/sales/tasks/list（GLS-A案件のタスクかんばん）に着地するが、そこにはパネルに表示されていた超過アクションは1件も表示されない（表示されるのはproject_tasksのタスクのみで、次回アクションという概念自体が存在しない画面）。特に「相手を待たせています」の1文とセットで案内される導線が、押した先で何も解決できない行き止まりになる。

#### 12. [production-calendar] 予約を書き換えたときに落とす鍵の一覧（BOOKING_AFFECTED_KEYS）に、③仮押さえ一覧・①予定サイドレールが使う HOLD_KEY（['studio-holds']）が入っていない。

- **ファイル**: `client/src/lib/bookingQueries.ts`:45
- **なぜ不具合か**: `invalidateBookingQueries` は `client/src/contexts/production/pages/holds/holdLogic.ts:8` の `HOLD_KEY = ['studio-holds']` を含まない4つの鍵しか落とさない。しかし ③ 仮押さえ一覧（`HoldListPage.tsx:64`）と ① 予定の右レール「仮押さえ（超過・期限順）」ウィジェット（`calendar/SideRail.tsx:38`）はどちらも `HOLD_KEY` で `/studios/bookings?status=tentative` を読んでおり、`HoldListPage.tsx` 自身の「確定にする」「落とす」ミューテーション（94行目）でしか `HOLD_KEY` を明示的に invalidate していない。一方、新規の部屋予約は `StudioBookingDialog.tsx` の既定状態が `status: 'tentative'`（113行目付近, `useState<'confirmed'|'tentative'>('tentative')`）＝新規作成の多くが「仮押さえ」になり、その `onSuccess`（309行目）は `invalidateBookingQueries(qc)` しか呼ばない。案件作成時にスタジオ日程を入れると `createInitialBookings.ts` がサーバー既定の `tentative` で予約を作り（`studio-booking.service.ts:201`, status未指定時は tentative）、同じく `invalidateBookingQueries` のみを呼ぶ（`createInitialBookings.ts:76`）。`MobileToday.tsx:183-190` / `UnifiedCalendarPage.tsx:234-244` の削除ミューテーションも同様。結果、`項目作成・編集・削除どれをしても HOLD_KEY は落ちず、③ 仮押さえ一覧・① 予定サイドレールの仮押さえ件数・並びは最大60秒（queryClient の既定 staleTime）古いまま`になる。これはこのコードベースで既に一度直った「拠点の略称を保存したら project-studio-bookings も落とす」（client/CLAUDE.md）と全く同じクラスの invalidate 漏れが、別の鍵（HOLD_KEY）で再発している状態。
- **直し方の案**: `BOOKING_AFFECTED_KEYS` に `['studio-holds']`（`HOLD_KEY`）を追加する（あるいは `holdLogic.ts` から import して単一の定義にする）。あわせて `shared/tests/bookingInvalidation.test.ts` が新しい鍵を検査対象に含めているか確認する。
- **検証エージェントの判定理由**: 実際にファイルを確認し、指摘どおりの invalidate 漏れを確認した。

- `client/src/lib/bookingQueries.ts:45-54` の `BOOKING_AFFECTED_KEYS` は `['studio-bookings']` `['project-studio-bookings']` `['project']` `['projects']` の4鍵のみで、`['studio-holds']`（`holds/holdLogic.ts:8` の `HOLD_KEY`）を含まない。
- react-query の鍵一致は配列要素ごとの比較（コード中コメントにも明記）なので `['studio-bookings']` の invalidate は `['studio-holds']` に当たらない。
- `HOLD_KEY` を使って `/studios/bookings?status=tentative` を読む箇所は2つ: `HoldListPage.tsx:64`（③仮押さえ一覧）と `calendar/SideRail.tsx:38`（①予定右レール）。
- `/studios/bookings` を書き換える呼び出し箇所は6箇所確認したが、そのうち `HoldListPage.tsx` 自身の `fix`/`drop`（94-98行目）だけが `HOLD_KEY` を明示 invalidate しており、他の5箇所は `invalidateBookingQueries(qc)` のみを呼んで `HOLD_KEY` を落とさない:
  - `StudioBookingDialog.tsx:313`（新規作成の既定値は `status: 'tentative'`、`useState` 初期値113行目で確認）
  - `createInitialBookings.ts:76`（案件作成時の自動予約、サーバー既定も tentative）
  - `useProjectActions.ts:180`
  - `MobileToday.tsx:185`
  - `UnifiedCalendarPage.tsx:239`（`del` ミューテーション、220-242行目で確認）
- 共通 `QueryClient` は `staleTime: 60_000` かつ `refetchOnWindowFocus: false`（`shared/src/client/queryClient.ts:82,91`）であることも確認。
- 既存のテスト `shared/tests/bookingInvalidation.test.ts` は `project`/`projects` の2鍵しか検査しておらず、`studio-holds` の抜けは検出されない。

再現条件: カレンダー画面（SideRail 表示中）または仮押さえ一覧を開いた状態で、①新規に部屋予約を作成（既定 tentative）、②案件作成時にスタジオ日程を入れて初期予約が自動生成、③カレンダー/モバイル今日画面から予約を削除、のいずれかを行うと、`invalidateBookingQueries` しか呼ばれず `HOLD_KEY`（`studio-holds`）は落ちないため、③仮押さえ一覧・①予定サイドレールの仮押さえ件数・並びが最大60秒古いまま表示される。エラーは出ず、待てば直るため気づかれにくい。

データ破損や機能の完全停止ではなく、既存の staleTime 内で自然回復する表示の古さであるため P2（限定的条件下での混乱を招く不具合）と判定した。

#### 13. [production-calendar] 営業時間外の予約に「印」を付ける仕組み（out_of_hours）とその確認・一覧APIが、画面のどこからも呼ばれておらず機能として到達不能になっている。

- **ファイル**: `server/src/contexts/production/services/studio-booking.service.ts`:246
- **なぜ不具合か**: `studio-booking.service.ts:243-259`（作成時）と `studio.routes.ts:524-567`（更新時）はコメントで「止めません（ご判断）。印を残しておけば、あとから一覧で拾って個別に連絡できる」と明記し、`out_of_hours`/`out_of_hours_reason` を計算・保存している。これを使うための2つのAPI（①予約前に画面が訊く `POST /business-hours/check`＝`business-hours.routes.ts:114-118`「保存は止めないので、これは注意を出すためだけのもの」、②あとから拾うための `GET /business-hours/out-of-hours/list`＝`business-hours.routes.ts:121-133`「時間外の印が付いた予約の一覧（あとから拾うため）」）が存在するが、`client/src` 全体を検索しても `business-hours/check` `out-of-hours` の呼び出しは1件もない（StudioBookingDialog.tsx にも `hours_check`/`out_of_hours` を扱うコードが無い）。つまりサーバーが返す `hours_check`（作成/更新のレスポンスに含まれる `studio-booking.service.ts:259`, `studio.routes.ts:570`）を画面が一切読まず、営業時間外の予約を入れても利用者に警告が出ず、あとから連絡すべき一覧も存在しない＝設計意図（フィードバックを回収して個別連絡する導線）がUIに到達しない行き止まり状態。
- **直し方の案**: StudioBookingDialog の保存成功時に返り値の `hours_check.outside` を見て警告トーストを出す、または保存前に `POST /business-hours/check` を叩いて注意を表示する。あわせて `GET /business-hours/out-of-hours/list` を使う一覧画面（例: カレンダー設定または仮押さえ一覧に相当するもの）を用意する。
- **検証エージェントの判定理由**: 実際にコードを確認し、指摘は事実。server/src/contexts/production/services/studio-booking.service.ts:243-259（作成時）と server/src/contexts/production/routes/studio.routes.ts:524-570（更新時、コメントに「レビューでの指摘 #63」とあり過去に一度直された経緯もある）は、営業時間外の予約に out_of_hours/out_of_hours_reason を計算・保存し、レスポンスに hours_check として含めている。これを使うための2エンドポイント（POST /business-hours/check＝business-hours.routes.ts:114-118「予約を作る前に画面が訊く」、GET /business-hours/out-of-hours/list＝同120-133「あとから拾うため」）も実装済みで機能する。

しかし client/src 全体を grep しても hours_check / out_of_hours / business-hours/check / out-of-hours の呼び出しは一件もない。予約作成・編集ダイアログ（client/src/contexts/production/components/studio/StudioBookingDialog.tsx）の保存ミューテーションは `onSuccess: () => {...}` と引数を取らずレスポンス本体を読み捨てており、事前チェックの呼び出しも存在しない。他のカレンダー関連画面（RoomAvailabilityPage.tsx, HoldListPage.tsx, UnifiedCalendarPage.tsx, SideRail.tsx 等）にも該当参照は無い。

したがって、サーバー側は正しく「印」を付け続けているのに、①予約作成・変更時に利用者へ営業時間外の注意が一切表示されず、②あとから拾って個別連絡するための一覧画面もどこにも存在しない、という設計意図がUIに到達しない行き止まり状態になっている。データ破損や誤動作ではなく「機能が呼ばれずデータが死蔵される」だけなので、重大度はP2（限定的：営業時間外予約という条件下でのみ発生し、業務は止まらないが意図した連絡フローが機能しない）と判断した。

#### 14. [production-calendar] 香盤ビューの拠点タブ判定（getLocationTab）が用賀/渋谷/青山のみをハードコードしており、それ以外の拠点（例: 設定画面の入力例そのままの「福岡スタジオ」）に実部屋があると、部屋を持たない外現場の予約がこの画面から見えなくなる。

- **ファイル**: `client/src/contexts/production/components/studio/KoubanView.tsx`:65
- **なぜ不具合か**: `getLocationTab`（65-72行目）は拠点名に用賀/グローバル/青山/渋谷/サムライを含まなければ `'other'` を返す。「その他」タブの表示分岐（268-290行目）は `activeTab === 'other' && filteredRooms.length === 0` のときだけ `otherBookings`（部屋を持たない予約のリスト、135-142行目）を描画し、それ以外（＝その他タブに実部屋が1つでもあるとき）はグリッド表示に落ち、グリッドは `roomBookings`（145-184行目）＝`b.rooms` に一致する予約しか置かない。`StudioRoomsManagerDialog.tsx:259` が新規拠点の入力例として「福岡スタジオ」を挙げている通り、実運用で用賀/渋谷/青山以外の拠点（部屋あり）を追加すると、その瞬間から部屋を持たない外現場予約（`location_note` だけの予約）が香盤ビューのどのタブにも出なくなる（一覧・カレンダー他画面には出るのに、この画面だけ消える）。
- **直し方の案**: 拠点名のハードコード判定をやめ、実際の `locations` 一覧からタブを動的生成する（あるいは『その他』タブは常に外現場予約リストと部屋グリッドを両方出す）よう作り直す。
- **検証エージェントの判定理由**: 実際にファイルを読んで再現性を確認した。`getLocationTab`（KoubanView.tsx:65-72）は拠点名に「用賀/グローバル」「青山」「渋谷/サムライ」のいずれも含まれなければ機械的に `'other'` を返す。`StudioRoomsManagerDialog.tsx`（250-286行目）は「新しい拠点を追加」欄の例として「福岡スタジオ、外現場 等」を挙げており、追加した拠点にはその場で部屋を登録できる（`AddRoomForm`／`addRoom.mutate`、208-245行目）。つまり運用担当が例示どおり「福岡スタジオ」という拠点を作り部屋を1つでも登録すると、`getLocationTab("福岡スタジオ")` は `'other'` を返すため `filteredRooms`（KoubanView.tsx:123-132）の `activeTab==='other'` に福岡の部屋が入る。

表示分岐（268-290行目）は `activeTab === 'other' && filteredRooms.length === 0` のときだけ `otherBookings`（部屋を持たない予約のリスト、135-142行目）を描画し、それ以外は素通りしてグリッド（333行目以降）に落ちる。グリッドは `roomBookings`（145-184行目）＝`b.rooms` が `filteredRooms` の room_id と一致する予約しか置かない。

一方 `StudioBookingDialog.tsx` を確認すると「外現場」（`location_note` のみ・`rooms` を選ばない予約）は通常のUIから作れる一級の予約種別（615-619行目）であり、`selectedRoomIds` が空のまま保存できる（`b.rooms.length===0` が実運用で普通に発生する）。

したがって、用賀/渋谷/青山以外に部屋ありの新拠点（例: 福岡スタジオ）を1つでも追加した瞬間から、部屋を持たない外現場予約（`location_note` のみ）は「その他」タブがグリッド表示に切り替わるため、香盤ビューのどのタブからも見えなくなる（一覧・カレンダー等の他画面には出るのに、この画面だけ消える）。指摘の再現条件・ロジックとも実装と一致しており、既に対処済みの様子や意図した仕様であることを示すコード・コメントは見当たらない。

severity は P2 とした：この画面が完全に機能しないわけではなく、①現状は拠点が用賀/渋谷/青山の3つのみで実害が出ていない可能性が高い、②「福岡スタジオのような部屋ありの新拠点を追加する」という特定の運用条件が揃って初めて発生する、③データ自体は消えず一覧・カレンダー等の他画面からは引き続き確認できる、という限定的・回避可能な条件下でのみ発生する不具合のため。

#### 15. [sales-core] グループ仕入の登録・編集（PurchaseDialog）が ['project-groups'] を invalidate しておらず、費用を分け合うグループ一覧（ProjectGroupListPage）の「仕入」合計バッジが古いまま残る。

- **ファイル**: `client/src/contexts/sales/pages/projectGroup/PurchaseDialog.tsx`:58
- **なぜ不具合か**: 同じ画面構成にある兄弟実装と比較すると欠落が明白。RevenueDialog.tsx（同ディレクトリ, 63-66行）は売上の登録・編集で ['project-group-detail', groupId] / ['revenues-all'] に加えて ['project-groups'] も invalidate している。さらに ProjectGroupDetailPage.tsx の deletePurchaseMutation（83-88行）は仕入の『削除』では ['project-groups'] を正しく invalidate している。つまり「仕入の削除」「売上の登録・編集・削除」はすべて一覧の合計を追随させているのに、「仕入の登録・編集」だけ ['project-group-detail', groupId] と ['purchases-all'] しか invalidate せず、ProjectGroupListPage.tsx（87-88行）が読む g.total_purchase が更新されない。ProjectGroupDetailPage から一覧へ戻ってきた際は remount で偶然直ることが多いが、一覧をタブ等で開いたまま別タブで仕入を追加・編集すると合計が古いまま表示され続ける。
- **直し方の案**: PurchaseDialog.tsx の saveMutation.onSuccess に qc.invalidateQueries({ queryKey: ['project-groups'] }) を追加し、RevenueDialog.tsx と揃える。
- **根拠（読んだ箇所）**: PurchaseDialog.tsx:58-65（['project-group-detail', groupId] と ['purchases-all'] のみ）／RevenueDialog.tsx:64-66（同じ操作クラスで ['project-groups'] を含む3鍵）／ProjectGroupDetailPage.tsx:83-99（削除系は購入・売上とも ['project-groups'] を含む）／ProjectGroupListPage.tsx:32,87-89（['project-groups'] から total_purchase を表示）
- **検証エージェントの判定理由**: PurchaseDialog.tsx の saveMutation.onSuccess（58-65行）が ['project-group-detail', groupId] と ['purchases-all'] のみ invalidate し、['project-groups'] を落としている。同ディレクトリの RevenueDialog.tsx（63-66行）は同じ操作クラス（登録・編集）で ['project-groups'] も含む3鍵を invalidate しており、ProjectGroupDetailPage.tsx の削除系3ミューテーション（deleteGroup/deletePurchase/deleteRevenue、73-103行）も全て ['project-groups'] を含んでいる。ProjectGroupListPage.tsx（32,87-88行）は ['project-groups'] をクエリキーとして total_purchase をバッジ表示するため、仕入の登録・編集だけ一覧のキャッシュが追随しない。react-query の共通設定（shared/src/client/queryClient.ts）は staleTime: 60_000・refetchOnWindowFocus: false のため、一覧を開いてから60秒以内に詳細画面で仕入を登録・編集し、60秒以内に一覧へ戻ると、['project-groups'] がまだ stale 扱いされず自動再取得もされないため、古い仕入合計バッジが表示され続ける（同一タブ内のSPA遷移でも再現し、複数タブは必須条件ではない）。データ自体は正しく保存され、60秒経過後や完全リロードでは直るため表示上のキャッシュ不整合に留まる。

#### 16. [sales-core] 「見積をつくる」ボタン・明細の保存・値引き承認など見積タブの編集操作一式が client 側で権限（sales の editor）を一切見ておらず、閲覧のみ（reader）権限の利用者にもボタンが出て、押すとサーバーの editor ゲートで 403 になる。

- **ファイル**: `client/src/contexts/sales/pages/projectDetail/EstimateTab.tsx`:221
- **なぜ不具合か**: server/src/contexts/sales/routes/estimates.routes.ts は POST '/' (117行), PUT '/:id' (130行), PUT '/:id/items' (136行), POST '/:id/approve' (149行), DELETE '/:id' (155行) すべてに `canEdit = requirePermission('sales','editor')`（40行）を課しているが、client の EstimateTab.tsx / EstimateItems.tsx はどこにも hasPermission('sales','editor') を呼んでおらず、「見積をつくる」ボタン（EstimateTab.tsx:221,232）や明細フォームの各入力・保存ボタン（EstimateItems.tsx:132-189、disabled は状態=locked のみでロールを見ない）が常に活性で表示される。client/CLAUDE.md の「ボタンは権限で出し分ける。サーバー側だけで止めると『押せるのに403』になる」という決めごとに反する。同じページの承認ボタンだけは can_approve をサーバーから受け取って正しく出し分けており（EstimateTab.tsx:57-61 のコメント）、作成・保存系だけが漏れている。
- **直し方の案**: useAuth().hasPermission('sales','editor') を EstimateTab/EstimateItems に渡し、「見積をつくる」ボタンと明細保存ボタンを非活性化・非表示にする（承認ボタンと同様、理由も表示する）。
- **根拠（読んだ箇所）**: server/src/contexts/sales/routes/estimates.routes.ts:40,117,130,136,149,155（canEdit = editor 必須）／client/src/contexts/sales/pages/projectDetail/EstimateTab.tsx（hasPermission 呼び出し0件、221・232行の作成ボタンに条件なし）／EstimateItems.tsx:132-189（disabled は locked のみ）
- **検証エージェントの判定理由**: 実際にファイルを読んで再現条件を確認した。client/src/contexts/sales/pages/projectDetail/EstimateTab.tsx には hasPermission 呼び出しが1つも無く（同ディレクトリの ThreadTab.tsx は `const canEdit = hasPermission('sales', 'editor')` を使い ComposeBox 等を disabled にしている、確立された既存パターン）、「見積をつくる」ボタン（221行目・232行目）、EstimateMetaCard のタイトル・備考欄（EstimateTab.tsx:96-111、`locked` は estimate.status のみで判定）、EstimateItems.tsx の各入力欄・「明細を保存する」ボタン（132-189行、disabled は `locked` すなわち状態のみ）、EstimateActions.tsx の版upグレード・送付・受注・失注・削除・売上変換ボタン（EstimateActions.tsx 全体、hasPermission 呼び出し0件）は、いずれも役割（sales の editor/reader）を一切見ていない。ProjectDetailPage.tsx（252行目）で EstimateTab はタブ切替のみで表示され、プロジェクトを開けるだけの reader 権限利用者にもタブ・ボタン一式がそのまま表示・活性化される。一方サーバー側（server/src/contexts/sales/routes/estimates.routes.ts）は `router.use(requireAuth, requirePermission('sales'))` の後に `canEdit = requirePermission('sales', 'editor')` を POST '/'・PUT '/:id'・PUT '/:id/items'・POST '/:id/approve'・DELETE '/:id' に課しており、reader は必ず 403 になる。承認ボタンだけは can_approve をサーバーから受け取り正しく出し分けている（EstimateTab.tsx:57-61 のコメントどおり）のに対し、作成・保存・状態変更・削除系だけ出し分けが漏れているという指摘内容と完全に一致する。既に対処済みという痕跡（コメント・条件分岐）は無く、client/CLAUDE.md の「ボタンは権限で出し分ける。サーバー側だけで止めると『押せるのに403』になる」という明記済みの決めごとにも反する。severity は P2 とした — データ破損や機能全損ではなく、reader 権限利用者が操作を試みると 403 で失敗するだけの限定的な UX 不具合（該当ロールの利用者のみ・エラートースト表示はされる想定で完全な機能不全ではない）ため。

#### 17. [sales-core] タスクの作成・更新・削除・完了切替・移動・並べ替え（invalidateTasks）が ['episodes', projectId] を invalidate しておらず、同じタスクタブ内で開いている『回（エピソード）』一覧（EpisodesPanel）のタスク件数・完了件数・進捗%バッジが編集後も古いまま残る。

- **ファイル**: `client/src/contexts/tasks/hooks/useProjectTasks.ts`:129
- **なぜ不具合か**: EpisodesPanel.tsx（113-116行）は `GET /projects/:id/episodes` が返す task_count/task_done_count から各回の進捗バーと状態（未着手/進行中/完了）を計算して表示する（46-52行）。TasksTab.tsx はこのパネルを同じタブ内に `episodesOpen` の状態で表示したまま、その真上でタスクの追加・完了・削除・移動を行わせる構成（147-183行）。しかしタスク側の全ミューテーション（useCreateTask/useUpdateTask/useDeleteTask/useToggleComplete/useMoveTask/useReorderTasks）は共通の invalidateTasks ヘルパー（129-132行）を通しており、そこは ['project-tasks', projectId] と ['task-dashboard'] しか invalidate しない。同じファイルの標準工程適用（flow/ApplyFlowDialog.tsx:98-102）では ['project-tasks']/['task-columns']/['task-dashboard']/['project'] の4つを几帳面に invalidate しているのと対照的に、日常的なタスク編集操作だけ ['episodes', projectId] が漏れている。パネルを閉じて開き直せば remount で直るが、開いたまま編集を続けると常に古い%のまま表示される。
- **直し方の案**: useProjectTasks.ts の invalidateTasks に qc.invalidateQueries({ queryKey: ['episodes', projectId] }) を追加する（または episode_id を持つタスクの操作時のみ）。
- **根拠（読んだ箇所）**: client/src/contexts/tasks/hooks/useProjectTasks.ts:129-132（invalidateTasks の中身）／client/src/contexts/tasks/components/EpisodesPanel.tsx:113-116,46-52（['episodes', projectId] を読んで進捗を出す）／client/src/contexts/sales/pages/projectDetail/TasksTab.tsx:147-183（同じタブ内に両方を同時表示）
- **検証エージェントの判定理由**: 実在するバグ。client/src/contexts/tasks/hooks/useProjectTasks.ts:129-132 の invalidateTasks は ['project-tasks', projectId] と ['task-dashboard'] のみを invalidate し、['episodes', projectId] を含まない。これは useCreateTask/useUpdateTask/useDeleteTask/useToggleComplete/useMoveTask/useReorderTasks 全てが共通で使うヘルパー。

一方 EpisodesPanel.tsx は queryKey ['episodes', projectId]（113-115行）で GET /projects/:id/episodes を読み、その task_count/task_done_count（46-52, 147-149行）から各回の進捗バー・%・状態ラベル（未着手/進行中/完了）を算出して表示する。サーバー側（episodes.routes.ts:43-44）は project_tasks を episode_id で集計するライブクエリで、TaskDialog.tsx:122 で新規タスク作成時に episode_id が実際にセットされる（EpisodeScopeToggle で選んだ回に紐づく）ため、タスクの追加・完了・削除・移動は対象の回の task_count/task_done_count を実際に変える。

TasksTab.tsx（155-223行）は isSeries（GLS-A案件）かつ episodesOpen のとき、EpisodesPanel と KanbanView/TaskListView/GanttView（いずれも上記ミューテーションを使用）を同じタブ内に同時マウントする（172-220行）。EpisodesPanel はタブを閉じない限りアンマウントされないため remount による再取得は起きない。

さらに shared/src/client/queryClient.ts の共通 QueryClient は staleTime: 60_000・refetchOnWindowFocus: false を既定にしているため、['episodes', projectId] のキャッシュは invalidate されない限り最低60秒、パネルを開いたまま作業を続ける限りそれ以上、実態と食い違ったまま表示され続ける。

再現条件: GLS-A（連続もの）案件の詳細画面タスクタブで「回の一覧」を開いたまま、その回に紐づくタスクを完了/追加/削除/移動すると、EpisodesPanel の進捗バー・%・状態バッジが古い値のまま変わらない。パネルを閉じて開き直す（remount）か60秒以上待って何かのきっかけで再取得されるまで直らない。

同ファイルのコメント（121-127行）で「task-dashboard も必ず落とすこと」と明記され、CLAUDE.md にも同種の“invalidate 漏れ”パターンが複数回踏まれた実例として記録されているのと同型の抜け。データ破損はなく、UIの表示が一時的に事実と乖離するだけなので severity は P2（誤解を招くが、パネルの開閉や時間経過で回避・自然解消する、限定的な条件下でのみ発生）と判定した。

#### 18. [sales-core] 営業活動記録の「活動を記録」ボタンおよび行クリックでの編集ダイアログが sales の editor 権限を見ておらず、閲覧のみの利用者にもボタン・編集導線が出て、保存を押すとサーバーの editor ゲートで 403 になる（削除ボタンだけは同ファイルで manager に絞って修正済み）。

- **ファイル**: `client/src/contexts/sales/pages/ActivityLogPage.tsx`:200
- **なぜ不具合か**: server/src/contexts/sales/routes/activity-logs.routes.ts は POST '/' (139行) と PUT '/:id' (143行) を `requirePermission('sales','editor')` で守っているが、client の ActivityLogPage.tsx は `canDelete = hasPermission('sales','manager')`（106行）だけを定義して ActivityLogDialog に渡しており（341-345行）、「活動を記録」ボタン（約200行、setEditing('new') を呼ぶだけで条件なし）にも、一覧行クリックでの編集オープン（ActivityRows.tsx:122, onOpen(row)）にも editor チェックが無い。ActivityLogDialog.tsx 自体にも hasPermission 呼び出しは無い。同じファイルの冒頭コメント（38-39行）で「削除ボタンはmanagerだけに絞った（サーバーは前からmanagerを要求しており、それ以外の人には押せるのに403だった）」と、まさに同種の不具合を削除ボタンについて自覚的に直した記述があるのに、作成・編集側は直っていない。同じ穴は顧客360°ビュー（CustomerDetailPage.tsx の「活動を記録」ボタン, 141行）にもある。
- **直し方の案**: hasPermission('sales','editor') を ActivityLogPage/CustomerDetailPage で計算し、「活動を記録」ボタンと行の編集導線をそれぞれ非活性化/非表示にする。
- **根拠（読んだ箇所）**: server/src/contexts/sales/routes/activity-logs.routes.ts:139,143（editor必須）／client/src/contexts/sales/pages/ActivityLogPage.tsx:38-39（削除だけ直した旨のコメント）,106-107,341-345（canDeleteのみ）／activityLog/ActivityRows.tsx:122／pages/customerDetail 配下の同型ボタン、CustomerDetailPage.tsx:141
- **検証エージェントの判定理由**: 実際にファイルを読んで再現条件を確認した。

サーバー側: server/src/contexts/sales/routes/activity-logs.routes.ts:16 の router.use(requireAuth, requirePermission('sales')) は minLevel 未指定＝既定 'reader'（auth.ts:184 requirePermission の第2引数デフォルトは 'reader'）。よって sales の reader（閲覧のみ）権限でも GET 系ルート・このページ自体には到達できる。一方 POST '/' (139行) と PUT '/:id' (143行) は requirePermission('sales','editor') で editor 以上を要求する。

クライアント側: ActivityLogPage.tsx は canDelete = hasPermission('sales','manager')（106行）のみを定義し、ActivityLogDialog に canDelete として渡しているだけ（341-345行）。
- 「活動を記録」ボタン（208-210行）は権限条件なしで常に表示され、押すと setEditing('new') でダイアログが開く。
- 一覧行クリック（ActivityRows.tsx:122 onClick={() => onOpen(row)}）も権限条件なしで常に編集ダイアログを開く。
- ActivityLogDialog.tsx 自体には hasPermission の呼び出しが一切なく、保存ボタン（134-139行）は !form.subject || !form.activity_date || saveMutation.isPending のみで無効化判定をしており、editor 権限の有無は見ていない。

再現: sales の reader（editorではない）権限を持つ利用者がこの画面を開く → 「活動を記録」ボタンや一覧行のクリックで編集/新規ダイアログが問題なく開き入力・保存操作ができるように見える → 保存を押すとサーバーの requirePermission('sales','editor') に弾かれ 403 が返る（saveMutation の onError で notifyApiError が出るのみでUIは閉じない）。同じ画面内で削除ボタンだけは canDelete（manager）で出し分け済みという冒頭コメント（42-43行、ActivityLogDialog.tsx冒頭コメント6-8行）が「削除は直したが作成/編集は直していない」ことを裏付けている。

顧客360°ビュー（CustomerDetailPage.tsx:142「やり取りを記録」ボタン）にも hasPermission 呼び出しが見当たらず、同型の未対処が確認できた。

CLAUDE.md の client/CLAUDE.md 内「権限」節にも明記された社内ルール「ボタンは権限で出し分ける。サーバー側だけで止めると『押せるのに403』になる」に反する実装であり、severityは機能を完全に破壊するわけではなく回避可能（editor以上のユーザーは問題なし）だが混乱を招く実在のUXバグのためP2と判定した。

#### 19. [sales-core] 「次回アクション予定（{items.length}件）」という見出しの件数と、実際に描画する行数（先頭5件に slice）が一致せず、6件目以降を見る手段がこのパネル自体には無い。

- **ファイル**: `client/src/contexts/sales/pages/activityLog/UpcomingPanel.tsx`:27
- **なぜ不具合か**: 見出し（27-28行）は `items.length`（=サーバーの activity-logs/upcoming が返す全件、活動記録サービス側に LIMIT 無し — server/src/contexts/sales/services/activity-log.service.ts:402-417 の getUpcomingActions）をそのまま出すのに、直後のリストは `items.slice(0, 5)`（31行）だけを描画し、6件目以降へのリンクや「すべて見る」導線が一切無い。同じファイル内の「案件詳細」（OverviewTab.tsx:281-283）は同様に slice(0,5) するときも必ず「すべて見る（N件）」のリンクを添えて件数と行き先を一致させているのに、この帯だけ見出しの数字と表示行数の食い違いを埋める手段が無い。ユーザーは「8件あるはずなのに5件しか見えない、残りはどこ？」となる。
- **直し方の案**: 見出しの件数を表示行数（slice後）に合わせるか、5件を超える場合は「すべて見る」等の導線（例えば活動記録一覧を『次回アクション』ソートで開くリンク）を追加する。
- **根拠（読んだ箇所）**: client/src/contexts/sales/pages/activityLog/UpcomingPanel.tsx:27-31（見出しはitems.length、描画はslice(0,5)、導線なし）／server/src/contexts/sales/services/activity-log.service.ts:402-417（getUpcomingActionsにLIMIT無し）／対比: client/src/contexts/sales/pages/projectDetail/OverviewTab.tsx:278-293（同じsliceパターンだが『すべて見る（N件）』リンク付き）
- **検証エージェントの判定理由**: UpcomingPanel.tsx:27-28 renders the heading as `items.length` (all rows from GET /activity-logs/upcoming, which is scoped to the current user and has no server-side LIMIT — activity-log.service.ts:402-417), while line 31 renders only `items.slice(0, 5)` with no link/button to the remainder. Verified the only nearby escape hatch — the "次回アクション期限順" sort in the main record list (Filters.tsx SORT_OPTIONS / activity-log.service.ts list()) — is not scoped to the current user (ActivityLogPage.tsx never sends `user_id`, and there is no "assigned to me" filter control), so it mixes in every user's activity logs and isn't a working substitute, nor is it linked from the panel. Confirmed the codebase already has the correct pattern elsewhere (OverviewTab.tsx:278-283, `すべて見る（N件）` link to a properly scoped full list) that this panel omits. A user with more than 5 pending next actions within the 7-day window (plausible for any moderately active salesperson) sees a count that doesn't match what's shown, with no way to reach the rest from this panel.

#### 20. [techops] 案件・番組のジャーニーAPIが「進行台本」を数える際（fetchDocsForProject/fetchDocsForProgram）、スケジュール表や枠の取得（fetchFramesForProject/fetchSchedulesForProject等）と違いユーザーのアクセス権（作成者/共有先/system_admin）でフィルタしていない。同じファイル内でスケジュール表側だけ `user` 引数を取り `isQsheetAdmin(user)` 判定＋`created_by`/共有チェックのSQLを付けているのに、台本側（130-140行目・297-307行目）だけ `user` 引数自体が無く無条件で `WHERE d.project_id = ?` の全件を返す。一方、実際に一覧を開くページ（SheetListPage.tsx→GET /techops/documents）は documents.routes.ts が非admin利用者を『自分が作成 or 自分に共有された』ドキュメントだけに絞る（76-84行目）。

- **ファイル**: `server/src/contexts/qsheet/services/journey.service.ts`:130
- **なぜ不具合か**: 非admin利用者がハブ画面（JourneyPage.tsx／MiniAppTiles.tsx）を開くと、①MiniAppTilesの「進行台本」タイルのバッジ件数（sheetCount）と、②JourneyDayCard.tsx『進行台本』欄に表示されるタイトル・更新日時が、自分がアクセス権を持たない他人の非共有ドキュメントまで含んでしまう。バッジの数字＝タイルを開いて実際に見える件数、という前提が崩れる（Class 1: 件数の不一致）。さらにJourneyDayCard.tsx 213行目の `<Link to={docPathOf(doc.app, doc.id)}>` を押すと、documents.routes.ts の GET /documents/:id（145-148行目）がアクセス不可なら404を返すため、タイトルは見えるのに開くと『見つかりません』になる行き止まり（Class 2）＋非共有ドキュメントのタイトル・更新日時が漏れるアクセス制御の抜けにもなる。
- **直し方の案**: fetchDocsForProject/fetchDocsForProgram にも `user: AccessUser` を渡し、fetchFramesForProject と同じ `isQsheetAdmin(user)` 判定＋`created_by = ? OR EXISTS(...qsheet_document_shares...)` のWHERE句を追加する（documents.routes.ts の既定挙動と合わせる）。
- **根拠（読んだ箇所）**: journey.service.ts 130-140行目 fetchDocsForProject と 173-214行目 fetchFramesForProject を比較すると、後者だけ `user: AccessUser` 引数とアクセス権フィルタを持つ。呼び出し元 433-444行目 getJourneyForProject でも `fetchDocsForProject(projectId)` だけ user を渡していない。documents.routes.ts 76-84行目で非adminの一覧取得は access フィルタ必須であることを確認、GET /documents/:id（145-148行目）でアクセス不可なら404を返すことも確認した。
- **検証エージェントの判定理由**: 実在するアクセス制御の抜けを確認した。

journey.service.ts:130-140 の `fetchDocsForProject`（および 297-307行目の `fetchDocsForProgram`）は `AccessUser` を引数に取らず、`WHERE d.project_id = ?` のみで `qsheet_documents` を無条件取得する。同ファイル内の `fetchFramesForProject`（173-214行目）・`fetchSchedulesForProject`（150-166行目）は `user: AccessUser` を取り、`isQsheetAdmin(user)` でなければ `(s.created_by = ? OR EXISTS(...shares...))` でアクセス権フィルタをかけている——同じファイル内で意図的な対称設計（コメント「アクセス範囲は `fetchFramesForProject` と同じ」等）になっているのに、台本側だけこの対称から外れている。

呼び出し元 `getJourneyForProject`（433-444行目）・`getJourneyForProgram`（379-391行目）も `fetchDocsForProject(projectId)` / `fetchDocsForProgram(programId)` に user を渡していない。

ルート側（scopes.routes.ts）は `requirePermission('qsheet')` のみを要求し、案件単位のプロジェクトメンバーシップ等の追加チェックは無い。つまり qsheet 権限を持つ任意のユーザーが任意の projectId/programId でジャーニーAPIを呼べる。

アクセス制御モデル自体は access.ts の `canAccessDoc`/`isQsheetAdmin` のコメントで明示されている通り「system_admin 以外は qsheet の manager/owner でも他人の非共有ドキュメントは見えない」という強い前提であり、documents.routes.ts の一覧（76-84行目）・単体取得（145-148行目、アクセス不可なら404で存在秘匿）もこれを厳格に守っている。journey.service.ts の台本側だけがこの前提を破っている。

実害の再現手順:
1. 非admin・非共有のユーザーAが、他ユーザーBが作成し誰にも共有していない台本を、Bと同じ案件配下に持つ。
2. ユーザーAがその案件のハブ画面（JourneyPage.tsx）を開くと、`GET /scopes/project/:projectId/journey` が `fetchDocsForProject` の無条件クエリでBの非共有台本も含めて返す。
3. MiniAppTiles.tsx の `sheetCount`（48-52行目）は `days.flatMap(d=>d.docs)` を `app==='sheet'` で数えるため、Aから見えないはずのBの台本もバッジ件数に混入する（件数の不一致）。
4. JourneyDayCard.tsx は `sheetDocs = day.docs.filter(doc=>doc.app==='sheet')`（92行目）でapp種別だけ絞り込み、アクセス権では絞り込まないため、Bの台本のタイトル・更新日時がそのままカードに表示される（メタデータ漏えい）。
5. Aがそのリンク（213行目 `docPathOf(doc.app, doc.id)`）を押すと、documents.routes.ts の `GET /documents/:id` が `canAccessDoc` で弾いて404を返す（145-148行目）——タイトルは見えるのに開けない行き止まりになる。

指摘の Class 1（件数不一致）・Class 2（タイトル漏えい＋クリックで404の行き止まり）とも実装を読んで再現条件を確認でき、意図した仕様や既知の代替チェックによる相殺も見当たらなかった。

severity は P2 とした：他人の非共有ドキュメントのタイトル・更新日時という限定的なメタデータの漏えいであり（本文・台本の中身は漏れない）、影響を受けるのは同じ案件/番組にアクセスできる qsheet 利用者に限られ、データ破損や機能停止は伴わないが、明確な誤動作（件数不一致・混乱を招くリンク切れ・アクセス制御の一貫性の欠如）として再現できるため。

#### 21. [techops] スケジュール表の項目（枠）を追加・保存・削除・台本化しても、`refetchDetail`/`refetchBreakdown`（82-83行目）が invalidate するのは `["schedule", id]` と `["schedule-breakdown", id]` だけで、一覧画面（ScheduleListPage.tsx）が読む `["schedules", "list", ...]` と、ハブ画面（JourneyPage.tsx）が読む `["qsheet-journey", scope, id]` を invalidate していない。

- **ファイル**: `client-techops/src/pages/schedule/SchedulePage.tsx`:82
- **なぜ不具合か**: queryClient の既定 staleTime は60秒（shared/src/client/queryClient.ts 82行目）。ユーザーが一覧やハブ画面から来て schedule 項目を足す/消し、60秒以内に『一覧へ』ボタン（SchedulePage.tsx 175-176行目）や案件・番組のハブへ戻ると、キャッシュがまだ fresh 扱いのまま再フェッチされず、一覧の『項目 N 件』（schedule.service.ts の item_count サブクエリを含む行）やハブの『枠 N件』バッジ・「スケジュール表がまだありません」提案の消え方が更新前の数字のまま残る（Class 3: invalidate漏れ）。ScheduleListPage.tsx 48行目は新規作成時にのみ `["schedules","list"]` を invalidate しており、SchedulePage.tsx 側だけ両方の鍵が漏れている非対称な実装になっている。
- **直し方の案**: SchedulePage.tsx の handleSave/handleDelete/handleCreateScript（refetchDetail呼び出し箇所）で、あわせて `queryClient.invalidateQueries({ queryKey: ["schedules", "list"] })` と `queryClient.invalidateQueries({ queryKey: ["qsheet-journey"] })`（scope, id を絞れるならそちらを優先）を呼ぶ。
- **根拠（読んだ箇所）**: SchedulePage.tsx 82-129行目（refetchDetail/refetchBreakdownの定義とhandleSave/handleDelete/handleCreateScriptでの呼び出し）。ScheduleListPage.tsx 31-38行目のqueryKey ['schedules','list',projectFilter,programFilter] と48行目の invalidate。JourneyPage.tsx 47-48行目 queryKey ['qsheet-journey', scope, id]。queryClient.ts 82行目 staleTime: 60_000 を確認した。
- **検証エージェントの判定理由**: SchedulePage.tsx:82-83 で定義される refetchDetail/refetchBreakdown は ["schedule", id] と ["schedule-breakdown", id] のみを invalidate する（85-129行目、handleSave/handleDelete/handleCreateScript から呼ばれる箇所を確認）。一方、ScheduleListPage.tsx:32 の一覧クエリは ["schedules", "list", projectFilter, programFilter]、JourneyPage.tsx:48 のハブクエリは ["qsheet-journey", scope, id] という別系統のキーを使っており、SchedulePage側からはどちらも invalidate されない。ScheduleListPage.tsx:48 は新規作成成功時のみ ["schedules","list"] を invalidate しており、SchedulePage 側だけこの対称性が欠けている非対称実装であることも確認した。

queryClient.ts:82,91（shared/src/client/queryClient.ts）で defaultOptions.queries.staleTime: 60_000・refetchOnWindowFocus: false が設定されており、ScheduleListPage/JourneyPage の該当 useQuery はどちらも staleTime や refetchOnMount を個別に上書きしていない（grep で refetchOnMount の使用が client-techops/shared 全体に存在しないことも確認）。したがって react-query の既定挙動により、直近60秒以内に一度フェッチ済みのキャッシュはマウント時にも再フェッチされず、古い値がそのまま表示される。

サーバー側 schedule.service.ts:26 で item_count は都度 COUNT(*) するサブクエリであり、クライアント側キャッシュが古いままなことがそのまま画面の実害（一覧の「項目N件」・ハブの枠件数バッジ・no_schedule系の提案）になる。

再現条件: ①案件・番組のハブ画面（JourneyPage）または一覧画面（ScheduleListPage）を開いてクエリをキャッシュさせる → ②同じスケジュール表の詳細（SchedulePage）に遷移し、項目を追加/保存/削除、または台本化する → ③60秒以内に「一覧へ」ボタン（175-176行目）やハブへ戻る → 一覧の件数・ハブのバッジ・提案文言が更新前の値のまま表示される（ポーリング間隔15秒のSchedulePage自身の表示は正しく更新されるが、遷移先の一覧・ハブは古いキャッシュを表示）。60秒経過後や、そのページを一度も開いていない（キャッシュが無い）場合は再現しない。

#### 22. [techops] ハブ画面（JourneyDayCard.tsx）の『次に決めること』提案『スケジュール表がまだありません』の遷移先 `to: '/techops/schedules'`（256行目）が、案件・番組を絞り込むクエリ（`?project=`/`?program=`）を付けない。同じ関数内でMiniAppTilesのタイルは `to: /techops/schedules?project=<id>` のように必ず絞り込むのに、提案の『見る』ボタンだけ絞り込み無しの全件一覧に飛ぶ。ScheduleListPage.tsx の新規作成ダイアログはURLの `?project=`/`?program=` をそのまま `project_id`/`program_id` として送るだけで（40-46行目）、案件・番組を選び直すUI自体を持たない（`⚠️ フィルタで来ている時点で owner は決まっているので、選び直すダイアログは設けない` というコメントが1-7行目にある前提が、絞り込み無しで来た場合は成立しない）。

- **ファイル**: `server/src/contexts/qsheet/services/journey.service.ts`:256
- **なぜ不具合か**: 『スケジュール表がまだありません』という、この案件/番組向けの提案から『見る』→絞り込み無しの一覧→『新しく作る』と進むと、作成される表の `project_id`/`program_id` は両方 null になり、この案件/番組に一切紐付かない孤立したスケジュール表ができる。ユーザーは提案どおりに対応したつもりでも、journey.service.ts の `fetchSchedulesForProject`（`WHERE s.project_id = $1`）はこの表を拾えないため、ハブ画面に戻っても『スケジュール表がまだありません』が消えない（Class 2: 導線をたどっても実際には解決しない・作った表への再アクセス手段も一覧上ではその案件名で辿れない）。
- **直し方の案**: buildDayFromDocs が呼ばれる getJourneyForProject/getJourneyForProgram の側で `to` に `?project=${projectId}` または `?program=${programId}` を含める（MiniAppTilesの `to` の組み立て方に揃える）。
- **根拠（読んだ箇所）**: journey.service.ts 251-257行目の suggestions.push({key:'no_schedule', ..., to:'/techops/schedules'})。MiniAppTiles.tsx 69行目・77行目で `?${filterKey}=${id}` を必ず付けていることと対照。ScheduleListPage.tsx 1-7行目のコメント（絞り込みで来ている前提）と40-46行目の createMutation（project_id: projectFilter || null）を確認、SchedulePage.tsx含め作成後に project_id を選び直すUIが無いことを確認した。
- **検証エージェントの判定理由**: 実在する不具合。journey.service.ts 256行目の suggestions.push({key:'no_schedule', ..., to:'/techops/schedules'}) は、同関数内の他の提案（'no_sheet' → '/techops/sheets'）と同様に project/program の絞り込みクエリを一切付けていない。対照として MiniAppTiles.tsx 69・77行目は必ず `?${filterKey}=${id}` を付ける設計であり、同じ「スケジュール表」への導線でも suggestion 経由（JourneyDayCard.tsx 235行目 `<Link to={s.to}>`。s.to をそのまま使い、呼び出し元も project/program idを合成していない）だけがフィルタ無しになる非対称がある。

ScheduleListPage.tsx を確認すると、1-7行目のコメントで「フィルタで来ている時点で owner は決まっているので、選び直すダイアログは設けない」という前提を明記しており、実際 createMutation（40-46行目）は `project_id: projectFilter || null, program_id: programFilter || null` とURLクエリをそのまま使う。絞り込み無しで来た場合はどちらも null になり、案件・番組に一切紐付かないスケジュール表が作成される。

再現条件: ①ハブ画面（JourneyPage.tsx、案件/番組単位）である日の「次に決めること」に『スケジュール表がまだありません』が出る → ②『見る』を押す（`/techops/schedules` へフィルタ無しで遷移）→ ③そのまま「新しく作る」で作成 → project_id/program_id が両方 null の孤立したスケジュール表が生成される。SchedulePage.tsx を確認したが、作成後に project_id/program_id を選び直す・変更するUIは存在せず（58-61行目は表示用のnav context設定のみ）、journey.service.ts の fetchSchedulesForProject/fetchSchedulesForProgram はこの表を拾えないため、ハブ画面に戻っても『スケジュール表がまだありません』の提案は消えない。

severityはP2とした: 同じハブ画面上の MiniAppTiles の「スケジュール表」タイル（正しく `?project=`/`?program=` 付き）という正常な代替導線が並存しており、そちらを使えば問題は起きない（回避可能）。ただし製品が明示的に提示する「見る」ボタンの導線としては確実に誤動作し、一度発生すると画面上のUIだけでは修正手段が無い（データが孤立したまま残る）点で軽微とは言えない。

### P3（軽微）

#### 23. [daily] ホームの「内覧会 来場予約」「セキュリティカード」タイルの件数バッジは絞り込んだ集合（今後の回／貸出中・返却遅延）を数えているのに、リンク先の一覧画面は既定で絞り込まれていない全件を表示する。

- **ファイル**: `client-daily/src/pages/HomePage.tsx`:135
- **なぜ不具合か**: HomePage.tsx 66〜69行で `upcoming = all.filter(isUpcoming)` として「今後」の回だけを数え、135行で `${upcoming.length}組 / ${upcomingHead}名` のバッジを付けて `to="/inview"` にリンクしているが、遷移先の `InviewPage.tsx` は73行目で `const [scope, setScope] = useState<Scope>('all')` と既定 `all`（全期間）で開くため、バッジの数字とクリック後に一覧へ最初に出る件数（全期間の組数）が食い違う。同様に143〜146行の「貸出中 X」「返却遅延 Y」バッジも `to="/security-cards"` にリンクするが、`SecurityCardsPage.tsx` 58行目 `useState<CardFilter>('all')` により既定は「すべて」で開き、貸出中・返却遅延だけに絞られた状態にはならない。いずれも遷移先に絞り込み条件を渡す URL パラメータの受け口が無い（`/security-cards` は `?card=<id>` のみ対応）。
- **直し方の案**: HomePage のリンクに絞り込み条件をクエリパラメータ（例 `/inview?scope=upcoming`, `/security-cards?filter=lent`）で渡し、`InviewPage`/`SecurityCardsPage` 側でマウント時に `useSearchParams` から初期値を読むようにする。
- **検証エージェントの判定理由**: 実際にファイルを確認し、指摘どおりの食い違いを確認した。

- `HomePage.tsx` 66-69行: `upcoming = (inview.data ?? []).filter(r => !r.session_date || r.session_date >= today)` で「今後」の回だけを数え、135行で `${upcoming.length}組 / ${upcomingHead}名` のバッジを付けて `to="/inview"`（クエリ無し）にリンクしている。
- 遷移先 `InviewPage.tsx` 70行: `const [scope, setScope] = useState<Scope>('all')` で既定は「すべて」。71-88行を見てもURLクエリから `scope` を読む処理は無い（`useSearchParams`/`URLSearchParams` の使用箇所自体が無い）。よってクリック直後は全期間の組数が表示され、バッジの数字と食い違う。
- 同様に143-146行「貸出中 X」「返却遅延 Y」のバッジは `to="/security-cards"`（クエリ無し）にリンクしているが、`SecurityCardsPage.tsx` 58行: `const [filter, setFilter] = useState<CardFilter>('all')` が既定で、67-68行で読んでいるURLパラメータは `card`（個別カードの選択）のみ・絞り込み種別を受け取る口は無い。

`Tile` コンポーネント（192-225行）の `to` はただの文字列で、他のタイル（`/tasks`, `/weekly`, `/news`, `/inquiries`, `/finance` 等）も含めクエリを付与する仕組みは無く、一貫してこのパターン。ドキュメント（`client-daily/CLAUDE.md`、version-history）にもこの挙動を意図した設計として明記した記述は見当たらない。

再現条件: ホームで「内覧会 来場予約」タイルに「今後 2組 / 5名」のようなバッジが出ている状態でタイルをクリックすると、遷移先の一覧は既定で全期間（過去分含む）を表示するため、初見の件数がバッジの数字と一致しない（セキュリティカードの「貸出中」「返却遅延」も同様）。

ただしデータ破損や機能停止ではなく、単にバッジの数字と遷移直後の一覧件数が一致しないだけの表示上の食い違いであり、絞り込みチップをユーザーが1回押せばすぐに正しい集合に到達できる（回避容易）。よって severity は P3（誤解を招くが実害・機能損失は無い軽微な指摘）と判定した。

#### 24. [live] GET /liveops/timers/:id が返す残り時間フィールドが、タイマーが停止中か稼働中かでキー名が変わる（停止中は `remainingMs`、稼働中は `remaining_ms`）ため、この応答を素直に読むコードは片方の状態でだけ値が取れない。

- **ファイル**: `server/src/contexts/liveops/routes/timers.routes.ts`:192
- **なぜ不具合か**: computeClientState() は非稼働時に `{ ...row, remainingMs: Number(row.paused_remaining_ms ?? row.remaining_ms) }`（キャメルケースの `remainingMs` を追加）を返す一方、稼働中は `{ ...row, remaining_ms: Number(row.paused_remaining_ms) - elapsed }`（DBそのままのスネークケース `remaining_ms` を上書き）を返し、`remainingMs`（キャメルケース）は一切セットしない。同じエンドポイントの同じ論理フィールドが状態によって別名で返る作りは、他の liveops クライアント側（useTimer.ts・TimerDisplayPage.tsx 等）が一貫して `remainingMs`（キャメルケース、Socket.IO の getClientState() が返す形）を前提にしているのと食い違っており、将来この REST エンドポイントの値を画面に出す実装が増えたときに、稼働中だけ（または停止中だけ）残り時間が undefined になる不具合を生む。
- **直し方の案**: computeClientState() の両分岐で同じキー（`remainingMs`）に統一する。
- **根拠（読んだ箇所）**: server/src/contexts/liveops/routes/timers.routes.ts:192-198 (computeClientState の2分岐でキー名が異なる)。現状の呼び出し元（client-techops の TimerSettingsPanel.tsx・LiveDisplayLayoutEditorPage.tsx）はどちらも remaining_ms/remainingMs を読んでいないため今は表面化していないが、Socket.IO 側の getClientState()（server/src/contexts/liveops/socket.ts:27-33）は常に `remainingMs` で統一しており、このエンドポイントだけ形が割れている。
- **検証エージェントの判定理由**: Verified in server/src/contexts/liveops/routes/timers.routes.ts:82-96,192-198. GET /liveops/timers/:id calls computeClientState(row), whose two branches genuinely disagree on key casing: stopped timers get `remainingMs` (camelCase) spread onto the row, running timers get `remaining_ms` (snake_case) overwriting the raw DB column, and `remainingMs` is never set in the running branch. This is a real inconsistency, not a misread — any code that does `data.remainingMs` against this endpoint would get `undefined` while a timer is running, and any code that does `data.remaining_ms` would get the wrong (already-elapsed, unadjusted) value while stopped since only the running branch recomputes it against elapsed wall-clock time. The parallel Socket.IO getClientState() (socket.ts) is confirmed to consistently use `remainingMs` in both branches, so this REST route is the outlier. However, severity is P3 not higher: grepping client-live and client-techops shows zero call sites currently read `remainingMs`/`remaining_ms` off this REST response — TimerDisplayPage.tsx, TimerDisplay.tsx (both apps), and LiveDisplayLayoutEditorPage.tsx all source `remainingMs` from useTimer.ts's Socket.IO-driven state, not from this GET /:id route. The bug is real but currently inert/latent (no production code path is broken today); it would only surface if/when a future caller consumes this specific REST endpoint's remaining-time field directly, at which point it would silently break for one of the two states.

#### 25. [shared] AppSwitcher（グローバルアプリ切り替えメニュー）は apps.ts の唯一の一覧 APPS を丸ごと ONAIR_APPS にコピーして表示するだけで、権限（permissionModule）・hidden・frozen のどれも見ずに全アプリをクリック可能なタイルとして出す。

- **ファイル**: `shared/src/client/AppSwitcher.tsx`:19
- **なぜ不具合か**: 同じ apps.ts を使う shared/src/client/shell/AppTopbar.tsx（v4 共通シェルの実際のアプリ切替。117行目 `visibleApps({ current: appKey, role, permissions })`）は、権限が無いアプリ・`hidden: true`（liveops＝計時・視聴者の旧単独入口。apps.ts のコメントで『トップのタイル・アプリ切替…からは消える』と明記）・`frozen: true`（awards＝リアルタイムCG。client-awards/CLAUDE.md によれば『コードは保存・配信は停止』済みで実際には開けない）を除外して出す。ところが AppSwitcher.tsx の ONAIR_APPS（19-20行目）は `APPS.map(...)` するだけで、`AppSwitcherProps` に role/permissions を渡す仕組み自体が無く（21-24行目）、`isDisabled` の判定も `status === 'coming_soon'`（74行目）だけで hidden/frozen/権限は一切見ていない。結果として、この部品を使う画面では: (a) 権限を持たないアプリのタイルが押せる状態で出て、開くと403相当になる（依頼の『権限が無いのにボタンが出て押すと403になる』パターン）、(b) 廃止済みで配信停止の awards（リアルタイムCG）へのタイルが押せる見た目で残り、開いても何も出ない行き止まりになる、(c) 単独入口を消したはずの liveops（計時・視聴者）が復活して出てしまう——という、apps.ts 自身が定めた契約（hidden/frozen/permissionModule）に反する表示になる。apps.ts の冒頭コメントは『4か所で食い違っていたのでAPPSに一本化した』という経緯を語っているが、この一本化後もAppSwitcher側だけが『APPSの中身をそのまま出す』という形で権限フィルタを実装し忘れている。

※現状の実害は限定的: AppSwitcher/SharedHeader/AppHeader を実際に import しているのは、廃止決定済みで配信が止まっている client-awards のみ（client-techops 等の他5アプリは AppTopbar 経由の v4 共通シェルへ移行済みで、client-awards/src/components/layout/Header.tsx 以外に呼び出し元が無いことを確認した）。そのため今日時点でこの経路を実際に踏むユーザーはいないが、コード自体は shared にそのまま残っており、apps.ts が明記する『hidden は一覧から消す』『frozen はシェルの一覧から外す』という約束をこの部品だけが破ったままになっている。
- **直し方の案**: AppSwitcherProps に role/permissions（またはそのまま ShellAccess）を追加し、`ONAIR_APPS` を `visibleApps({ role, permissions, current: currentApp })` の結果から作るように直す（apps.ts の判定ロジックを再利用し、二重実装を避ける）。あるいは AppSwitcher.tsx 自体を廃止して呼び出し元を AppTopbar に統一する（client-awards は廃止済みなので、コード整理の一環として検討の余地あり）。
- **根拠（読んだ箇所）**: shared/src/client/AppSwitcher.tsx 19-20行目 `const ONAIR_APPS = APPS.map((a) => ({...}))` に権限/hidden/frozenのフィルタが無い。74行目 `const isDisabled = app.status === "coming_soon"` も comingSoon しか見ていない。対比: shared/src/client/shell/AppTopbar.tsx 117行目 `const apps = visibleApps({ current: appKey, role, permissions });`。shared/src/client/apps.ts 263-273行目 visibleApps() が hidden/frozen/権限を正しく除外するロジックの正本。呼び出し元の確認: `grep -rln "AppHeader\b"` の結果、client-awards/src/components/layout/Header.tsx のみがヒット。
- **検証エージェントの判定理由**: shared/src/client/AppSwitcher.tsx 19-20行目・74行目を実読して指摘のロジックを裏付けた: ONAIR_APPS = APPS.map(...) は apps.ts の hidden/frozen/permissionModule を一切見ておらず、isDisabled も comingSoon だけを見ている。apps.ts 263-273行目 visibleApps() と対比しても、確かにこの部品だけが hidden(liveops)/frozen(awards)/権限フィルタの契約を満たしていない。呼び出し元も grep で再確認し、AppSwitcher→SharedHeader→AppHeader の連鎖を実際に import しているのは client-awards/src/components/layout/Header.tsx のみ（client-techops側のヒットはMiniAppSwitcherという別物で無関係、指摘の通り誤検知ではない）。ただしさらに踏み込んで確認したところ、client-awardsはDockerfile 119-120行目の通り「ビルドステージを持たない」＝本番・検証いずれの配信イメージにも含まれておらず、shared/CLAUDE.mdにも「配信中のアプリに利用者はもう居ない…削除はフォローアップ」と明記された既知の技術的負債。つまりコード上のロジック不備自体は事実だが、今日の稼働環境でこの経路を実際に踏めるユーザーは存在せず（コードそのものがビルドされていない）、再現条件を実際のプロダクトで示すことができない。ロジック欠陥としては真だが実害・緊急性はほぼゼロの死んだコードパスであるためP3（軽微）とした。"根本原因を直す"よりは既定方針通り削除（フォローアップ）が妥当な対応と判断される。

## 対応方針（未着手・ご判断待ち）

> **2026-09-08 追記**: この節は監査時点（2026-08-24）の記述。確定25件は同日中に領域ごとの PR #415〜#424（v4.4.4）で全件修正した（棚卸し: [codex-findings-v4.md](codex-findings-v4.md)）。

- 25件は多いため、**全部を1本のPRにしない**。領域ごと・severityごとに分けて対応する想定
- P1（1件・計時視聴者のロック解放）は影響が大きいため最優先候補
- P2 の大半は「invalidate漏れ」（同じパターンが5領域で見つかった）と「権限の出し分け漏れ」
  （sales-core に集中）の2系統。まとめて直すなら系統ごとが効率的
- 着手する範囲をご指示いただき次第、対応するPRを作成する
