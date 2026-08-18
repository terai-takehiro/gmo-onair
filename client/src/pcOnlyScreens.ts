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
  {
    path: '/sales/project-groups',
    what: 'グループ（費用の分け合い）',
    why: '複数の案件にまたがる金額の割り当てなので、全体を見ながら決める必要があります。',
    hidden: true,
  },
  { path: '/sales/gls-import', what: '旧GLS（決算取込）', why: '会計の取り込みは、確かめる行が多く途中で止められません。', hidden: true },
  {
    path: '/sales/review',
    what: '営業レビュー',
    why: '3列を並べて見る画面で、打合せの場で映すためのものです。',
    instead: PROJECTS,
  },
  { path: '/sales/keep-report', what: '報告資料', why: '印刷して配る形なので、紙と同じ横幅を前提にしています。', hidden: true },
  /*
    ⚠️ **この3枚の理由は書き直しました**（M10）。
    元は「会社ごとに列が多く、この幅では1社ぶんも並びません」でしたが、
    **390px で開いて測ったら普通にカードで並びました**（表ですらなかった）。
    嘘の理由を出したままにはできないので、本当の理由に差し替えています。

    本当の理由は「**v4 でまだ作り直していない**」— 見出しの下に
    Excel の取込・出力・新規追加が縦に積まれ、指で押しにくい形のままです。
    作り直したらスマホに開放します（ご判断「外で判断するものは開ける」）。
  */
  { path: '/sales/companies', what: '取引先マスター', why: 'v4 でまだ作り直していない画面で、道具のボタンが縦に積まれていて指で押しにくい形です。' },
  // **`/sales/customers`（顧客の一覧）は Phase 2 で削除した** — `/sales/companies?role=customer`
  // への `RedirectKeepQuery` になったので、実体の画面が無く、この表に載せる対象ではない
  // （他の `RedirectKeepQuery` の転送先と同じ扱い。`/sales/pipeline` 等も載せていない）
  { path: '/sales/customers/:id', what: 'お客様の詳細', why: 'v4 でまだ作り直していない画面です。取引の履歴と担当者を並べて読む形になっています。' },
  { path: '/sales/activity-logs', what: '営業活動記録', why: 'v4 でまだ作り直していない画面です。' },
  { path: '/sales/ai-activity', what: 'AI活動履歴', why: 'AI が出したものと人が直したものを並べて見る画面です。', hidden: true },
  {
    path: '/sales/projects/confirmed/:category',
    what: '確定案件の一覧',
    why: '金額と日程が横に並ぶ表です。',
    instead: PROJECTS,
  },

  // ── 財務管理（モックの「お金は置かない」）─────────────────
  //   **`/budget/billing` は入れない** — ⑫ 入金の確認がスマホ用にある
  { path: '/budget/dashboard', what: '財務ダッシュボード', why: '売上から営業利益までの引き算を1枚で見る画面です。畳むと引き算の関係が読めません。' },
  { path: '/budget/revenues', what: '売上の台帳', why: '金額の桁を縦にそろえて読む表なので、畳むと桁が比べられません。' },
  { path: '/budget/purchases', what: '仕入の台帳', why: '金額の桁を縦にそろえて読む表なので、畳むと桁が比べられません。' },
  { path: '/budget/sga', what: '販管費の台帳', why: '金額の桁を縦にそろえて読む表なので、畳むと桁が比べられません。' },
  { path: '/budget/documents', what: '受け取った書類', why: '金額・締月・支払期日を突き合わせる画面で、台帳に入れる操作は取り消せません。' },
  { path: '/budget/import', what: '取り込み', why: '外の数字を読んで確かめてから台帳に入れる3段の作業です。途中で止まると二重に入ります。', hidden: true },
  { path: '/budget/detail', what: '案件月別詳細', why: '月を横に並べる表です。', hidden: true },
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
  { path: '/studio/partners', what: 'パートナースケジュール', why: '人を縦・日を横に並べる表です。' },
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
  '/sales/tasks/:view',                 // ④ MobileTaskList（gantt だけ上で止める）
  '/sales/inbox/new',                   // 貼って送る（受付は廃止したが、この口は残す）
  '/sales/record',                      // 打合せを録音
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
];
