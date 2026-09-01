**「回を足す」の追加数をテキスト入力にし、"1-2" のような話数の直接指定を受け付けるようにした**（ユーザー依頼「回を足すの『追加する数』は複数の回を登録することもあるのでテキストで入力出来るようにしたい『#1-2』みたいに」）。

これまでは数値ステッパーで「次の話数から連番でN件」しか作れなかった。案件名の慣習表記「#1-2」（同日収録した複数話数）に合わせ、`AddEpisodesDialog` のテキスト欄が①純粋な数字（例 "2"）＝従来どおり件数、②範囲（"1-2"/"#1-2"）＝話数を明示指定、③カンマ区切りの複数レンジ（"1,3,5-8"）＝非連続な話数をまとめて作成、の3通りを読み分ける。実行前に「作成する回: #3、#5〜#8（6件）」のプレビューを必ず出し、明示指定した話数が次の話数とズレているときは警告する（`docs/design/v4/regular-series.md` §7）。

サーバー（`POST /:projectId/episodes/batch`）は新しいテキスト欄 `episodes` を受け、旧 `count`（数）だけの呼び出しにも後方互換で対応する。既存話数との重複はDBのUNIQUE制約任せにせず事前にまとめてチェックし、採番からINSERTまでを1つのトランザクション・行ロックの中で行うようにした（`getNextEpisodeNumberAtomic` をトランザクション対応にし、非アトミックな旧 `getNextEpisodeNumber` は削除）。`episode_orders` は `start_episode`/`end_episode` の2列しか持たないため、非連続レンジは連続する区間ごとに複数レコードへ分けて記録する。パーサー本体（テキスト→話数リスト）は純粋関数として `shared/src/production/episodeSpec.ts` に切り出し、サーバー側は import できないため `server/src/shared/production/episodeSpec.ts` に意図的に複製した（`scripts/check-collab-parity.mjs` の `PAIRS` に追加し一致を検査）。

検証: `npm run typecheck:all` 全ワークスペース緑、`npx tsc -b client` 緑、`npm run test` 1907件緑（このパーサーのユニットテストを27件追加）、`npm run lint` 緑。呼び出し元は `EpisodesPanel.tsx` の1箇所のみであることを確認済み（MCPツールからの利用なし）。

**見積の明細に、並べ替え・数量の単位・グループ内価格の定価表記の3つを足した。**

①`EstimateItems.tsx` の明細行に `@dnd-kit` のドラッグハンドルを付け、行のドラッグ＆ドロップ並べ替えに対応した（`KanbanView`/`KanbanCard` の配線パターンに倣う。ハンドルは行ごとの `EstimateItemRowView`（新規切り出し）に持たせた — `useSortable` は行数だけフックを呼ぶ必要があり `.map()` の中で直接呼べないため）。並べ替えた配列順はサーバーの `replaceItems` が今までどおり `sort_order` として書くので、サーバー側の変更は不要（確認のみ）。カテゴリをまたぐ並べ替えは行わない（帯を越えると「カテゴリが変わった」のか「順番だけ変えたいのか」画面から読み取れないため）。ドラッグハンドルは共通 `Button`（`data-ui="button"`）を使い、375px幅でも44pxタップ領域を確保している。

②`estimate_items.unit` 列（DBには既にあったが入力UIが無かった）の入力欄を、数量セルに同居させる形で追加した（自由入力＋よく使う候補「人／時間／日／式」の `<datalist>`）。`estimate-pdf.service.ts` のSELECTと `pdf.service.ts` の明細出力にも `unit` を通し、紙の見積書にも「数量 単位」（例:「3 式」）が出るようにした。`unit` は見積の明細だけが持つ任意フィールドなので、`revenues.routes.ts`（請求書・検収書）側は変更不要（未指定は従来どおり数量だけ）。

③グループ内見積でも「定価→値引き→実額」を表記できるようにした。migration 261 で `estimate_items.list_unit_price`（定価。カタログ選択時のみ入る・手入力行はNULL）を追加し、`PricingItemPicker.tsx` がカタログから追加するとき `unit_price`（実際に課金する額）に加えて定価（`pricing_items.unit_price`）も渡すようにした。画面は単価欄の近くに「定価 ¥X／値引き ¥Y」を内部・外部を問わず出す。見積書PDFは定価が実額より高い行を「定価×数量」で印字し、差額をまとめて1行の値引き（「グループ価格による値引き」）にして、既存の手動値引き（「お値引き」）とは別ラベルで共存させる。⚠️ **`list_unit_price` は表示・PDF印字専用** — `estimates.subtotal`・`amount`・売上変換（`convertToRevenue`）の金額計算には一切混ぜていない（`convertToRevenue` の明細SELECTには含めていないことをテストで固定）。

検証: `npm run typecheck -w server` 緑、`npx tsc -b client` 緑、`npm run test -w shared` 1918件緑（既存の `estimateVersioning`/`estimateIntegrity`/`moneyDouble` 各テストを含め全緑・新規 `estimateItemListPrice.test.ts` を11件追加）、`npm run lint` 緑（`check-file-size`/`check-migration-numbers` 含む）。

**見積の版を重ねて受注すると売上がダブルカウントされていたのを直した**（ユーザー報告「一度登録した売上を上書き出来るようにしたい（見積もりに修正が入ったとき、新しい版の見積もりを登録すると過去の売上として登録されている見積もりとダブルカウントになる）」）。

見積 v1 を受注・売上変換したあと修正で v2 を作ると、`createNextVersion` は前の版が `sent` のときしか `superseded` にしない決めごとのため v1 は `accepted`＋`revenue_id` 付きのまま残る。この v1 をあとから普通に受注・変換すると、`convertToRevenue` の二重変換防止チェックは変換対象（v2自身）の `revenue_id` しか見ておらず、同じ案件に確定売上が2行できていた。`convertToRevenue` に「同じ `group_id` の別バージョンがすでに変換済みの売上を持っていないか」をトランザクション内で確認する分岐を追加し、見つかった場合は新しい売上行を作らずその売上を上書き（`billing_key` は請求書・検収書 PDF に印字済みの可能性があるため据え置き、明細は `PUT /revenues/:id` と同じ carryover の仕組みで単位・仕入額等を引き継ぎつつ全置換）するようにした。配分グループ（合同案件の費用按分）に入っている売上は自動では触らず、財務側で先に配分を外すよう案内して止める。

検証: `npm run typecheck -w server` 緑、`npm run test -w shared` 全緑（新規 `estimateRevenueOverwrite.test.ts` を追加。既存 `moneyDouble.test.ts` の窓を実測して広げた）。

**案件管理の仕入一覧を行クリックで詳細確認できるようにし、案件管理の売上・仕入と財務管理の台帳が同じデータであることを画面で分かるようにした**（ユーザー依頼「案件管理から仕入一覧を見たとき、クリックでその詳細を確認できるようにしたい」、「特定案件における『案件管理の売上』と『財務管理の売上』がどのように関連づいているのかがわからない」）。

「案件管理の売上」と「財務管理の売上」は実は同じ `revenues` テーブル・同じ `/revenues` API の2つの見え方（案件で絞った読み取り専用パネル vs 全案件の編集可能な台帳）で、二重管理ではなかった。`RevenueBillingPane.tsx`（案件詳細「見積・請求」タブ）の仕入行に `interactive`/`onClick` を足し、財務②仕入台帳が使う `PurchaseDialog` を新設の `readOnly` モードで開いて詳細を確認できるようにした（「編集・削除は台帳側にしか出さない」という既存方針は崩さず、閲覧専用のまま）。売上・仕入の各カード見出しに「財務管理の◯◯台帳で見る →」リンクと「この一覧は財務管理の◯◯台帳と同じデータを、この案件で絞り込んで表示しています」という説明文を追加し、関連が画面から分かるようにした。

検証: `npx tsc -b client` 緑、`npm run test -w shared` 緑（`estimateIntegrity.test.ts` の `RevenueBillingPane.tsx` 照合を含め全緑）、`npm run lint` 緑（`check-file-size` のため部品を `revenueBillingParts.tsx` に切り出し）。
