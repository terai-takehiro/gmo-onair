/**
 * 案件管理・財務管理・カレンダー・設定・プロジェクト管理 —
 * **スマホでは開かない画面の一覧**（M2）
 *
 * ── なぜ1つの表にするのか ──────────────────────────────────
 *
 * 画面ごとに `useIsMobile()` を書いて分岐させると、**書き忘れに気づけません**
 * （出ないだけなので誰も報告しない）。ここに集めると
 * `scripts/check-mobile-declared.mjs` が **`App.tsx` のルートと突き合わせて
 * 「どちらにも入っていない画面」を数えられます**。
 *
 * ── 判断の出どころ ──────────────────────────────────────────
 *
 * モックの「スマホに置かないもの」（`docs/design/v4/mobile.md` の `spNotOnPhone`）:
 * **お客様**（列が多く読めない）／**お金**（表が横に伸びる）／
 * **設定・権限**（落ち着いて触るもの）／**ガント**（PCで見る）／
 * **3列レビュー**（MTG用の印刷向き）／Qシートの編集。
 *
 * > **「お金」を置かないのに「入金の確認」はある**のが要点です。
 * > 置かないのは**台帳の表**で、**片づく1つの仕事**は置きます。
 * > だから `/budget/billing`（⑫ 入金の確認）はここに**入れません**。
 *
 * ── 書くときの決めごと ──────────────────────────────────────
 *
 * - **`why` は具体的に。** 「読めません」だけだと「手抜きで作っていない」と受け取られる
 * - **`instead` をなるべく書く。** 無いと行き止まりになる
 * - **並び順が効く。** 先に一致したものが勝つので、`/gpm/projects/new` は
 *   `/gpm/projects/:id` より**前**に置くこと（後ろだと `new` が「詳細」と案内される）
 * - **`hidden: true` はスマホの左メニューからも消す**（ご判断）。データを入れる道具
 *   （決算の取込・DB バックアップ・データビューア）と、案件の仕事に出てこない設定です。
 *   **ルートは消しません** — 共有された URL を開いたときは今までどおり案内が出ます
 */
import type { PcOnlyEntry } from '@gmo-onair/shared/src/client-v4/pcOnly';

const TASKS = { label: 'やることを開く', to: '/sales/tasks/list' };
const PROJECTS = { label: '案件一覧を開く', to: '/sales/projects' };

export const CLIENT_PC_ONLY: PcOnlyEntry[] = [
  // ── 案件管理 ──────────────────────────────────────────────
  {
    path: '/sales/tasks/gantt',
    what: 'ガントチャート',
    why: '横に長い時間軸なので、この幅では1週間ぶんも入りません。',
    instead: TASKS,
  },
  {
    path: '/sales/billing',
    what: '見積・請求（全案件）',
    why: '金額・期日・状態が横に並ぶ表で、桁を読み違えると請求を間違えます。',
    instead: PROJECTS,
  },
  /*
    ⚠️ **`/sales/projects/:id` より前に置くこと**（この表は先に一致したものが勝つ）。
    台帳は 20 列を出し入れして、選んだ行をまとめて書き換える画面です。
    375px では列が読めないうえ、**取り消せない一括更新を指で押すことになります**。
    行き先は案件一覧 — そちらはスマホ対応済みなので、外で見る道は残ります。
  */
  {
    path: '/sales/projects/ledger',
    what: '案件台帳',
    why: '列が 20 あり、選んだ案件をまとめて書き換える画面です。この幅では列が読めず、戻せない操作を指で押すことになります。',
    instead: PROJECTS,
  },
  {
    path: '/sales/projects/:id/edit',
    what: '案件を直す',
    why: '入力欄が 40 以上あり、途中で電話が入ると書きかけが残ります。',
    instead: PROJECTS,
  },
  {
    path: '/sales/flow-templates',
    what: '標準工程テンプレート',
    why: '型を変えると以後すべての案件に効くので、落ち着いて触る画面です。',
  },
  {
    path: '/sales/pricing',
    what: '料金表',
    why: '相手ごとの単価が横に並ぶ表で、1桁違うと見積の金額が変わります。',
  },
  // **一覧（`/sales/project-groups`）は M11 で `CLIENT_MOBILE_OK` へ移した。**
  // 詳細URL（次のエントリ）だけがPC専用として残る。理由は下の `CLIENT_MOBILE_OK` を参照
  // v4で作り直したが、任意比率の按分（案件ごとの金額をその場で比べながら入力する）は
  // 変わらずPC向きなので、詳細URLもここに残す
  {
    path: '/sales/project-groups/:id',
    what: 'グループ詳細（費用の分け合い）',
    why: '複数の案件にまたがる金額の割り当てなので、全体を見ながら決める必要があります。',
    instead: { label: 'グループ一覧を開く', to: '/sales/project-groups' },
    hidden: true,
  },
  // **`/sales/gls-import`（旧GLS決算取込）は削除した**（決算取込自体は終わっており、
  // まとめて直す機能は案件台帳が上位互換なため）。`/sales/projects/ledger` への
  // 転送にしたので、実体の画面が無く、この表に載せる対象ではない
  // **旧 `/sales/review`（営業レビュー）は `/sales/activity-logs` のタブへ統合した**
  // （ご指示・2026-08）。ルート自体が `RedirectKeepQuery` になり実体の画面が無いので、
  // この表に載せる対象ではない（他の転送と同じ扱い）
  /*
    ⚠️ **この段落は当時の記録。** 前は「営業活動記録は v4 で作り直したので
    `CLIENT_MOBILE_OK` へ外した」だったが、統合先の分析3タブ（旧営業レビュー）が
    「3列を並べて打合せの場で映す」前提の PC 専用画面だったため、**統合にあわせて
    画面全体を PC 専用に戻した**（ご指示）。タブごとにスマホ対応が割れると
    `useIsMobile()` の判定を画面の中に書くことになり、PC専用の判定を1か所
    （この表）に集める方針が崩れる。`ActivityMobileFilters` 等のスマホ用部品は
    「それでもこのまま開く」（`PcOnlyPanel` の `onOpenAnyway`）を選んだ人のために
    残してある
  */
  {
    path: '/sales/activity-logs',
    what: '営業活動記録・営業レビュー',
    why: '記録タブに加えて、3列を並べて打合せの場で映すための分析タブ（ファネル・失注分析・営業評価）を同じ画面に統合しています。',
    instead: PROJECTS,
  },
  // **`/sales/keep-report`（報告資料）は削除した**（v4 の要件未定・ご指示）。
  // ルート自体を消したので、実体の画面が無く、この表に載せる対象ではない
  /*
    ⚠️ **この2枚の理由は書き直しました**（M10）。
    元は「会社ごとに列が多く、この幅では1社ぶんも並びません」でしたが、
    **390px で開いて測ったら普通にカードで並びました**（表ですらなかった）。
    嘘の理由を出したままにはできないので、本当の理由に差し替えています。

    「お客様の詳細」は「**v4 でまだ作り直していない**」— 取引の履歴と担当者を
    並べて読む形のままです。作り直したらスマホに開放します
    （ご判断「外で判断するものは開ける」）。

    **「取引先マスター」は v4 renewal でここから外し、`CLIENT_MOBILE_OK` へ移した。**
    `Row stackOnMobile` ＋ `FilterChips`（横スクロール対応済み）で縦積みになり、
    375px で崩れないことを確認済み（下の `CLIENT_MOBILE_OK` を参照）。
  */
  // **`/sales/customers`（顧客の一覧）は Phase 2 で削除した** — `/sales/companies?role=customer`
  // への `RedirectKeepQuery` になったので、実体の画面が無く、この表に載せる対象ではない
  // （他の `RedirectKeepQuery` の転送先と同じ扱い。`/sales/pipeline` 等も載せていない）
  { path: '/sales/customers/:id', what: 'お客様の詳細', why: 'v4 でまだ作り直していない画面です。取引の履歴と担当者を並べて読む形になっています。' },
  // **営業活動記録**（`/sales/activity-logs`）は、この表の「案件管理」節にあります
  // （営業レビュー統合で PC 専用に戻したため。⚠️ の記録を参照）
  // **`/sales/ai-activity`（AI活動履歴）は削除した**（監査ログに過ぎず、AIが触ったかは
  // 案件一覧・案件詳細のほうが記録単位で上位互換なため）。実体の画面が無いので
  // この表に載せる対象ではない
  // **`/sales/projects/confirmed/:category`（確定案件の一覧）は削除した**（`ConfirmedProjectsPage`
  // ごと消して `/sales/projects` への転送にした）。実体の画面が無いので、この表に載せる対象ではない

  // ── 財務管理（モックの「お金は置かない」）─────────────────
  //   **`/budget/billing` は入れない** — ⑫ 入金の確認がスマホ用にある
  { path: '/budget/dashboard', what: '財務ダッシュボード', why: '売上から営業利益までの引き算を1枚で見る画面です。畳むと引き算の関係が読めません。' },
  { path: '/budget/revenues', what: '売上の台帳', why: '金額の桁を縦にそろえて読む表なので、畳むと桁が比べられません。' },
  { path: '/budget/purchases', what: '仕入の台帳', why: '金額の桁を縦にそろえて読む表なので、畳むと桁が比べられません。' },
  { path: '/budget/sga', what: '販管費の台帳', why: '金額の桁を縦にそろえて読む表なので、畳むと桁が比べられません。' },
  { path: '/budget/documents', what: '受け取った書類', why: '金額・締月・支払期日を突き合わせる画面で、台帳に入れる操作は取り消せません。' },
  { path: '/budget/import', what: '取り込み', why: '外の数字を読んで確かめてから台帳に入れる3段の作業です。途中で止まると二重に入ります。', hidden: true },
  // **`/budget/detail`（案件月別詳細）は削除した**（v3時代の遺物の棚卸し・2026-08）。
  // `/budget/dashboard` への `RedirectKeepQuery` になったので、実体の画面が無く、
  // この表に載せる対象ではない
  { path: '/budget/reports/vendors', what: '仕入先集計', why: '仕入先を縦・月を横に並べる表です。', hidden: true },

  // ── カレンダー ────────────────────────────────────────────
  // **`/studio/rooms`（部屋の空き）はここから外し、`CLIENT_MOBILE_OK` へ移した**
  // （2026-08・v4ネイティブUI化の一環）。「畳むと目的そのものが消える」という理由は
  // PCの表をそのまま横スクロールさせていた頃のもの — ① 予定のスマホ実装と対になる
  // 専用レイアウト（月表＋選んだ日の部屋カード。`rooms/MobileRoomAvailability.tsx` ＋
  // `rooms/RoomAvailabilityCards.tsx`）を新設したので、畳んでも「空いている幅」は読める
  { path: '/studio/settings', what: 'カレンダーの設定', why: '部屋・外部カレンダー・サイネージの設定で、落ち着いて触る画面です。' },
  // **`/studio/studio-calendar`（スタジオカレンダー）・`/studio/my-calendar`
  // （マイカレンダー）は退役した**（2026-08・v4ネイティブUI化のバックログB）。
  // どちらも `/studio/calendar` への `RedirectKeepQuery` になったので、実体の画面が無く、
  // この表に載せる対象ではない（① 予定は `CLIENT_MOBILE_OK` の対象）

  // ── 設定（モックの「設定・権限は落ち着いて触るもの」）──────
  //   **`/settings` と `/settings/system` は入れない** —
  //   案内板とパスワード変更は全員が使い、畳んでも読める
  //   **拠点・部屋 / 権限とメンバー / お金のルール / 休日・営業時間 / 通知とテンプレートは
  //   M11 で `CLIENT_MOBILE_OK` へ移した。** 理由は下の `CLIENT_MOBILE_OK` を参照
  { path: '/settings/data-viewer', what: 'データビューア', why: 'データベースの中身をそのまま出す道具です。', hidden: true },
  { path: '/settings/db-backups', what: 'DBバックアップ', why: '復元は取り消せない操作なので、手元が広い場所で行います。', hidden: true },

  // ── プロジェクト管理（工事・構築）────────────────────────
  //   **`new` を `:id` より前に置くこと**（後ろだと「詳細」と案内される）
  { path: '/gpm/projects/new', what: 'プロジェクトを作る', why: '5段のフォームで、体制・工程・金額をまとめて決めます。' },
  { path: '/gpm/projects/:id', what: 'プロジェクトの詳細', why: '工程表と体制図が横に伸びる画面です。' },
  { path: '/gpm/projects/:id/:tab', what: 'プロジェクトの詳細', why: '工程表と体制図が横に伸びる画面です。' },
  // **標準工程テンプレート（`/gpm/templates`）は M11 で `CLIENT_MOBILE_OK` へ移した。**
  // 理由は下の `CLIENT_MOBILE_OK` を参照
];

/**
 * **スマホの左メニューから落とすルート**（`hidden: true` の分）。
 * シェルに渡すと、スマホのときだけ項目が消えます。**ルートは生きています。**
 */
export const CLIENT_MOBILE_HIDDEN = CLIENT_PC_ONLY.filter((e) => e.hidden).map((e) => e.path);

/**
 * **スマホで触る／読む画面**（`check-mobile-declared.mjs` が使う）。
 *
 * ここと `CLIENT_PC_ONLY` の**どちらにも入っていないルートがあると `npm run lint` が止まります。**
 * 新しい画面を足したら、**どちらかに必ず入れてください**（決めないまま出すのを止めるためです）。
 */
export const CLIENT_MOBILE_OK: string[] = [
  '/',                                  // トップ（スマホ用に並べ替え済み）
  '/search',                            // ⑪ 探す
  '/sales/dashboard',                   // 読むだけ
  '/sales/projects',                    // ③ カード（ProjectCards）
  '/sales/projects/new',                // ④ MobileNewProject
  '/sales/projects/:id',                // ⑥ 概要・タスク・当日の3タブ
  '/sales/projects/:id/:tab',           // 同上（PC 向きのタブは画面の中で案内を出す）
  '/sales/tasks/:view',                 // ④ MobileTaskList（gantt だけ上で止める）
  '/sales/inbox/new',                   // 貼って送る（受付は廃止したが、この口は残す）
  '/sales/record',                      // 打合せを録音
  // v4 renewal で作り直した（`CompanyListPage.tsx`）。`Row stackOnMobile` ＋
  // `FilterChips`（横スクロール対応）で縦積みになり、375px で崩れないことを確認済み
  '/sales/companies',                   // 取引先マスター
  // **`/sales/activity-logs` はここから外した**（2026-08）。営業レビュー統合で
  // 画面全体を PC 専用に戻したため（`CLIENT_PC_ONLY` の同パスを参照）
  '/budget/billing',                    // ⑫ 入金の確認（MobileCollect）
  /*
    ── ここから下は M10 で開放した5枚（ご判断「外で判断するものは開ける」）──
    どれも **読む／1タップで進める** 画面で、390px で開いて崩れないことを実測済み。
    「入力欄が並ぶもの・設定・データを入れる道具」は PC のままにしてある。
  */
  '/budget/vendors',                    // 取引先（電話の前に相手を調べる）
  '/studio/holds',                      // 仮押さえ（外で「確定にする」を押す・HoldCards）
  '/gpm/dashboard',                     // プロジェクト管理ダッシュボード（読むだけ）
  '/gpm/projects',                      // プロジェクト一覧（カードで並ぶ）
  '/gpm/tasks',                         // GPM のやること（読む＋消し込み）
  '/studio/calendar',                   // ⑬ 今日の予約（MobileToday）
  // ⚠️ この1枚だけ M10 の実測開放ではない（2026-08・v4ネイティブUI化）。専用レイアウトを
  // 新設したうえで開放した（`MobileRoomAvailability.tsx` ＋ `RoomAvailabilityCards.tsx`）
  '/studio/rooms',                      // ② 部屋の空き（月表 → 選んだ日の部屋カード）
  '/settings',                          // 案内板
  '/settings/system',                   // パスワード変更
  /*
    ── ここから下は M11 で開放した7枚（2026-08・v4ネイティブUI化の監査の再検証）──
    監査（`docs/v4-native-ui-audit-2026-08-20.md`）で「理由が『影響が大きい』等の
    重要性の話に留まり、幅・列数の技術的根拠を欠く」と指摘された9枚のうち、
    大規模な2枚（顧客360・GPMプロジェクト詳細）を除く7枚を実ブラウザ375pxで
    1つずつ確かめ、崩れは軽微な直しで解消できたのですべて開放した。
    顧客・取引先マスターが M10 で「理由文が実測に基づいていなかった」と分かった
    のと同じ構図で、ここも実測が先だった。
  */
  // 一覧はカードグリッド（`ProjectGroupListPage.tsx`）で元から縦積みだったが、
  // グリッドに列数指定が無い375px幅では**グリッドの列がカード内の金額の
  // max-content幅まで広がり、カード自体が画面より広くなって右端の金額が
  // 画面外に切れていた**（`document.scrollWidth`には出ない — `#root`の
  // `overflow:hidden`で隠れるだけなので横スクロールバーも出ず、実機で
  // スクリーンショットを見て初めて気づいた）。`grid-cols-1`で列幅を固定し
  // `min-w-0`を足して解消。詳細（`/sales/project-groups/:id`）は比率入力が
  // 引き続きPC向きなので`CLIENT_PC_ONLY`に残す
  '/sales/project-groups',              // 費用を分け合うグループ一覧
  // `Row`に`stackOnMobile`が無く、略称(96)+部屋(96)+料金表(160)の3スロットが
  // カードの実効幅を超えて画面外へ計算上はみ出していた（文字が短いデータでは
  // 見た目には気づけなかった）。`stackOnMobile`を足して解消
  '/settings/sites',                    // ② 拠点・部屋
  // メンバー一覧は既に`Row stackOnMobile`＋`hideOnMobile`で縦積み済みで、
  // 375pxで崩れないことを実測（役割編集・メンバー招待の各ダイアログも含む）。
  // pcOnlyScreens.ts旧理由の「12区画×5段」は権限モデル単純化前の話で、
  // いまの実装（7区画バッジ表示）とは既に一致していなかった
  '/settings/users',                    // ③ 権限とメンバー
  // カード一覧はflex-wrapで元から縮まない塊を作っておらず、375pxで崩れない。
  // ひな形の作成・編集ダイアログ（`TemplateDialog`→`PhaseEditor`）で
  // 「工程の名前」欄が`min-w-0 flex-1`のまま日数・担当ロール・3つの操作ボタンと
  // 同じ行に詰め込まれ、和文は1文字ごとに改行できるためこの欄だけが数pxに
  // 潰れて見出しも入力欄も読めなくなっていた。スマホでは常にこの欄を単独の行に
  // する直しを工程・タスクの両方の名前欄に入れて解消
  '/gpm/templates',                     // ⑦ 標準工程テンプレート（GPM）
  // 選択肢は`flex-wrap`のチップ（`Pick`）で元から縮まない塊を作っていなかったが、
  // 選択肢が3つ以上ある行（例:「支払日が休業日のとき」）では`Pick`のチップ群だけで
  // 行の大半を使い切り、隣の説明文（`hint`）に残る幅が数pxしかなくなって、
  // 和文が1文字ごとに縦へ折り返される崩れが起きていた（値引き上限の表もmin-w-0で
  // 同じ理由の崩れ方をしたが元から折り返し前提の1行だったため見た目は保たれていた）。
  // `hint`をスマホでは常に単独の行にする直しで解消
  '/settings/money',                    // ⑤ お金のルール
  // 休業日の表の見出し行（`RowHeader`）だけ`stackOnMobile`が無く、期間・名前・
  // 種類・受付の4列を横一列に並べようとして見出し文字が重なって表示されていた
  // （本文の行はすでに`stackOnMobile`で縦積みになり崩れていなかった）。
  // 見出し行を`拠点・部屋`と同じくスマホでは隠して解消（祝日の表はもともと
  // 見出しを持たず本文だけで足りている）
  '/settings/hours',                    // ⑥ 休日・営業時間
  // sm:ブレークポイント対応済みで、社外/社内の文面カード・定時実行ログとも
  // 375pxで崩れなかった。ひな形コピーのダイアログも確認済み
  '/settings/notify',                   // ⑦ 通知とテンプレート
];
