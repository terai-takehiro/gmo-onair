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

export const CLIENT_PC_ONLY: PcOnlyEntry[] = [
  // ── 案件管理 ──────────────────────────────────────────────
  //
  // ⚠️ **2026-08、この節の13画面（下の財務3画面も含む）をまとめてスマホに開放した**
  // （ユーザーの明示指示「一旦ここまでを実装しましょう」）。ガントチャート・見積・請求・
  // 案件台帳・案件を直す・標準工程テンプレート・料金表・費用を分け合うグループ（一覧・
  // 詳細）・営業活動記録・お客様の詳細・財務の売上/仕入/販管費台帳が対象。判定ロジック・
  // 文言・並びは変えず、見た目とレイアウトだけ変えている。移した先は下の
  // `CLIENT_MOBILE_OK`（対応内容のコメント付き）。「お客様」「お金」「ガント」「3列レビュー」
  // という上のコメントの分類は**方針転換前の記録として**残しているが、実際の判定は
  // この表と`CLIENT_MOBILE_OK`の現在の中身が正
  //
  // **`/sales/gls-import`（旧GLS決算取込）は削除した**（決算取込自体は終わっており、
  // まとめて直す機能は案件台帳が上位互換なため）。`/sales/projects/ledger` への
  // 転送にしたので、実体の画面が無く、この表に載せる対象ではない
  // **旧 `/sales/review`（営業レビュー）は `/sales/activity-logs` のタブへ統合した**
  // （ご指示・2026-08）。ルート自体が `RedirectKeepQuery` になり実体の画面が無いので、
  // この表に載せる対象ではない（他の転送と同じ扱い）
  // **`/sales/keep-report`（報告資料）は削除した**（v4 の要件未定・ご指示）。
  // ルート自体を消したので、実体の画面が無く、この表に載せる対象ではない
  // **`/sales/customers`（顧客の一覧）は Phase 2 で削除した** — `/sales/companies?role=customer`
  // への `RedirectKeepQuery` になったので、実体の画面が無く、この表に載せる対象ではない
  // （他の `RedirectKeepQuery` の転送先と同じ扱い。`/sales/pipeline` 等も載せていない）
  // **`/sales/ai-activity`（AI活動履歴）は削除した**（監査ログに過ぎず、AIが触ったかは
  // 案件一覧・案件詳細のほうが記録単位で上位互換なため）。実体の画面が無いので
  // この表に載せる対象ではない
  // **`/sales/projects/confirmed/:category`（確定案件の一覧）は削除した**（`ConfirmedProjectsPage`
  // ごと消して `/sales/projects` への転送にした）。実体の画面が無いので、この表に載せる対象ではない

  // ── 財務管理（モックの「お金は置かない」）─────────────────
  //   **`/budget/billing` は入れない** — ⑫ 入金の確認がスマホ用にある
  { path: '/budget/dashboard', what: '財務ダッシュボード', why: '売上から営業利益までの引き算を1枚で見る画面です。畳むと引き算の関係が読めません。' },
  { path: '/budget/documents', what: '受け取った書類', why: '金額・締月・支払期日を突き合わせる画面で、台帳に入れる操作は取り消せません。' },
  { path: '/budget/import', what: '取り込み', why: '外の数字を読んで確かめてから台帳に入れる3段の作業です。途中で止まると二重に入ります。', hidden: true },
  // **`/budget/detail`（案件月別詳細）は削除した**（v3時代の遺物の棚卸し・2026-08）。
  // `/budget/dashboard` への `RedirectKeepQuery` になったので、実体の画面が無く、
  // この表に載せる対象ではない
  { path: '/budget/reports/vendors', what: '仕入先集計', why: '仕入先を縦・月を横に並べる表です。', hidden: true },

  // ── カレンダー ────────────────────────────────────────────
  {
    path: '/studio/rooms',
    what: '部屋の空き',
    why: '部屋を縦・時間を横に並べて空いている幅を見る画面なので、畳むと目的そのものが消えます。',
    instead: { label: '今日の予約を見る', to: '/studio/calendar' },
  },
  { path: '/studio/settings', what: 'カレンダーの設定', why: '部屋・外部カレンダー・サイネージの設定で、落ち着いて触る画面です。' },
  { path: '/studio/studio-calendar', what: 'スタジオカレンダー', why: '月のマス目を横7列で見る画面です。' },
  // **`/studio/partners`（パートナースケジュール）は削除した**（v3時代の遺物の棚卸し・2026-08）。
  // `/studio/calendar` への `RedirectKeepQuery` になったので、実体の画面が無く、
  // この表に載せる対象ではない
  { path: '/studio/my-calendar', what: 'マイカレンダー', why: '月のマス目を横7列で見る画面です。' },

  // ── 設定（モックの「設定・権限は落ち着いて触るもの」）──────
  //   **`/settings` と `/settings/system` は入れない** —
  //   案内板とパスワード変更は全員が使い、畳んでも読める
  { path: '/settings/sites', what: '拠点・部屋', why: '拠点を1つ足すと予約できる部屋と見積の金額の両方が変わります。' },
  { path: '/settings/users', what: '権限とメンバー', why: '12 区画 × 5 段の表で、押し間違えると人の仕事が止まります。' },
  { path: '/settings/money', what: 'お金のルール', why: '支払期日・消費税の端数・値引きの上限が、以後つくる書類すべてに効きます。', hidden: true },
  { path: '/settings/hours', what: '休日・営業時間', why: '時刻を選ぶ欄が縦に並ぶ画面で、押し間違えると予約に注意が出続けます。', hidden: true },
  { path: '/settings/notify', what: '通知とテンプレート', why: '文面を貯める画面で、落ち着いて読み直してから直すものです。', hidden: true },
  { path: '/settings/data-viewer', what: 'データビューア', why: 'データベースの中身をそのまま出す道具です。', hidden: true },
  { path: '/settings/db-backups', what: 'DBバックアップ', why: '復元は取り消せない操作なので、手元が広い場所で行います。', hidden: true },

  // ── プロジェクト管理（工事・構築）────────────────────────
  //   **`new` を `:id` より前に置くこと**（後ろだと「詳細」と案内される）
  { path: '/gpm/projects/new', what: 'プロジェクトを作る', why: '5段のフォームで、体制・工程・金額をまとめて決めます。' },
  { path: '/gpm/projects/:id', what: 'プロジェクトの詳細', why: '工程表と体制図が横に伸びる画面です。' },
  { path: '/gpm/projects/:id/:tab', what: 'プロジェクトの詳細', why: '工程表と体制図が横に伸びる画面です。' },
  { path: '/gpm/templates', what: 'プロジェクトの標準工程', why: '型を変えると以後すべてのプロジェクトに効きます。' },
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
  '/sales/inbox/new',                   // 貼って送る（受付は廃止したが、この口は残す）
  '/sales/record',                      // 打合せを録音
  // v4 renewal で作り直した（`CompanyListPage.tsx`）。`Row stackOnMobile` ＋
  // `FilterChips`（横スクロール対応）で縦積みになり、375px で崩れないことを確認済み
  '/sales/companies',                   // 取引先マスター
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
  '/settings',                          // 案内板
  '/settings/system',                   // パスワード変更

  /*
    ── ここから下は2026-08、「PC専用画面もスマホ対応していく」という方針転換を受けて
    まとめて開放した13画面（ユーザーの明示指示「一旦ここまでを実装しましょう」）。
    判定ロジック・文言・並びは変えていない。
  */
  // ④ タスク一覧の内蔵タブ。gantt を含む全ビューをスマホで開放した
  // （`MobileTaskGantt.tsx` を新設。既存の `DashboardGanttView.tsx` 内の
  // `MobileGanttView` を実際に到達させ、その過程で見つかった不具合〔案件行の
  // はみ出し・期限の色分けの日付境界バグ〕も直した）
  '/sales/tasks/:view',
  // ⑤ 見積・請求（全案件）。`EstimateRows.tsx`/`InvoiceRows.tsx` はすでに
  // `Row stackOnMobile` で組まれており、実ブラウザ確認で375/414pxとも崩れなし
  '/sales/billing',
  // 案件台帳。既定表示9列を読み取り専用カードで開放（`MobileLedgerCards.tsx`
  // 新設）。列の出し入れ・チェックボックス選択・一括編集（戻せない操作）は
  // 引き続きPCのみ（画面内の `useIsMobile()` 判定で編集モード自体に入れない）
  '/sales/projects/ledger',
  // 案件を直す。`MobileEditProject.tsx` 新設。案件作成と同じ
  // `RequiredFields`/`MoreFields`（`mode="edit"`）をアコーディオンで開閉する形にした。
  // GLS操作・削除はシートに畳んだ。送信ロジックはPCと完全共通
  '/sales/projects/:id/edit',
  // 標準工程テンプレート。閲覧（`MobileTemplateRail.tsx`のセレクトでテンプレ切替
  // ＋各工程の閲覧）は開放。工程の追加・削除・並べ替え・複製は
  // `PcOnlyNote`（画面の一部だけPC限定にする帯）でPCへ誘導
  '/sales/flow-templates',
  // 料金表。定価とグループ内価格を縦積みにして桁の読み違えを防いだ
  // （`CategoryCard.tsx`）。編集操作は既存の権限判定のまま出す
  '/sales/pricing',
  // 費用を分け合うグループ 一覧・詳細。一覧・所属案件・売上仕入の閲覧は開放。
  // 「分け方」（`AllocationEditor.tsx`・複数案件の金額をその場で比べながら
  // 決める操作）だけは`PcOnlyPanel`でPCに誘導（`onOpenAnyway`で開ける）
  '/sales/project-groups',
  '/sales/project-groups/:id',
  // 営業活動記録・営業レビュー。「記録」タブは開放（既存の`Row stackOnMobile`
  // ＋`ActivityMobileFilters`がそのまま機能）。分析3タブ（ファネル・失注分析・
  // 営業評価）は`ActivityLogPage.tsx`内の`useIsMobile()`判定で`PcOnlyPanel`に
  // 差し替える（案件詳細の`MOBILE_TAB_KEYS`と同じ「タブだけ画面の中で判定する」型）
  '/sales/activity-logs',
  // お客様の詳細。**v4作り直しはまだ**（pre-v4のまま）。今回はレイアウトの
  // Tailwindクラスだけ直し、375pxで崩れない・44px未満のタップ対象を減らす
  // 最小対応にとどめた（本格的なv4化は別の機会に判断する）
  '/sales/customers/:id',
  // 財務の台帳3画面。共通の`ledger/LedgerRows.tsx`に`Row stackOnMobile`を正しく
  // 適用し、金額だけは畳まず常に右側に大きく表示。状態バッジ列の`hideOnMobile`
  // 抜けも直した（3画面とも同じ部品を直しただけで、それぞれの`ListPage.tsx`側は
  // 元から`flex-wrap`等でモバイル対応済みだった）
  '/budget/revenues',
  '/budget/purchases',
  '/budget/sga',
];
