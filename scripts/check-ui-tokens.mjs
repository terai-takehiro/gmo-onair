#!/usr/bin/env node
/**
 * 部品と数字のサイズを画面ごとにバラバラに書けなくする — デザイン 6章
 *
 * ── なぜ検査を足すか ────────────────────────────────────
 *
 * 部品を用意しても、**手で書いても動く**ので直すきっかけが無いまま増える。
 * 実際に数えたら、金額を手で書いた箇所が14か所、万円に丸める関数が4本
 * (名前も丸め方も違う)、ページ見出しの重複が38か所 (書き方が3種類) あった。
 *
 * だから「入れたら止まる」形にする。`npm run lint` から走る (G2 で必須化)。
 *
 * ── 記録 (BASELINE) の考え方 ────────────────────────────
 *
 * 着手時点で 1,745 件あった。1つの版で直すと差分が読めずレビューが成立しないので、
 * **いまの数をアプリ別に記録して、増えたら止める**形にしてある。
 * 減らしたら `--update` で記録も下げること (下げ忘れると次に増えても気づけない)。
 *
 * **見た目を変える決まりは v4 対象3アプリ + shared だけ**に効かせる (`v4Only`)。
 * 凍結4アプリに当てると「直せない違反」が残り、検査ごと無視されるようになる。
 *
 * ── 何を止めるか（止める理由も一緒に出す）──────────────
 *
 *  1. `¥` を数字と一緒に手で書く    → 桁が揃わない・丸め方が揃わない
 *  2. 万円に丸める式をその場に書く   → 負の数で結果が変わる (Math.round vs toFixed)
 *  3. 大きい数字に `text-*` を直書き → 同じ数字が画面で違う大きさになる
 *  4. ページ見出しの `text-xl lg:text-2xl font-bold` を直書き → 見出しの大きさがばらつく
 *
 * **部品そのもの (`shared/src/client/ui/`) と グラフの軸などは対象から外す**
 * (そこが実装本体なので、そこで書けないと部品が作れない)。
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

/**
 * **見た目を変える決まりは v4 対象3アプリ + shared にだけ効かせる** (G2)。
 *
 * 凍結4アプリ (Qシート / 技術資料 / 計時LIVE / リアルタイムCG) は
 * **今日と同じ見た目を保つ**のが決定事項なので、色・寸法・タップ領域の決まりを
 * 当てると「直せない違反」が永久に残ります。**直せない違反は検査を無視させる**
 * ので、いちばん避けたい形です。
 *
 * 一方、**見た目に関係ないもの**（Excel の読み取り・AI が人名を出す・言葉づかい・
 * ブラウザ標準のダイアログ）は凍結アプリにも効かせます。
 */
// ⚠️ 制作資料 (client-qsheet/src) は v4.1 で凍結を解いたのでここに足した
// (03-app-structure-impl.md §7-2 の10番目の指摘)。まだ見た目は作り直していないので
// 実測値が大きく増える見込み。既存分は BASELINE にそのまま記録し、直す作業は
// 見た目を作り直す段で行う（raw-palette 等の v4Only 規則が新規に適用されるため）。
const V4_DIRS = ['client/src', 'client-daily/src', 'client-equipment/src', 'client-qsheet/src', 'shared/src'];
const v4Only = (rel) => V4_DIRS.some((d) => rel.startsWith(d));

/** 記録をアプリ別に持つための、パス → アプリ名 */
function appOf(rel) {
  const m = rel.match(/^(client(?:-[a-z]+)?|shared|server)\//);
  return m ? m[1] : 'other';
}


/**
 * preset に定義されている色の名前を読み取って、
 * 「知らない色トークン」を見つける正規表現を組む (v3.1.0)。
 *
 * **preset を正にする** — 検査側に色の一覧を書き写すと、色を足したときに
 * 片方だけ古くなって「定義したのに怒られる」が起きる。
 */
function buildUnknownColorRe() {
  const presetSrc = readFileSync(join(ROOT, 'shared/tailwind.preset.ts'), 'utf8');
  const colorsStart = presetSrc.indexOf('colors: {');
  const body = colorsStart >= 0 ? presetSrc.slice(colorsStart, presetSrc.indexOf('\n      },', colorsStart)) : presetSrc;

  /** preset の colors に実際に定義されている名前 */
  const defined = new Set();
  for (const m of body.matchAll(/^\s*'?([a-z][a-z0-9-]*)'?\s*:/gm)) defined.add(m[1]);

  /**
   * 「状態や意味の名前に見えるが、定義されていたら困らない」語の一覧。
   *
   * ── なぜ総当たりにしないか ─────────────────────────────
   *
   * 最初は「preset に無い色を全部止める」形で書いたが、色の接頭辞は
   * Tailwind の**色ではないユーティリティ**と重なっている
   * (`text-sm` `border-t` `bg-gradient-to-br` `shadow-inner` `from-font` …)。
   * 除外一覧を育てても、`restore-db-from-box` のような**ただの文字列**まで
   * `from-box` として当たってしまう。実測で 3,681 件の誤検知が出た。
   *
   * 本当に正確にやるなら**生成された CSS と突き合わせる**しかないが、
   * それはビルドが要るので `lint` では走らせられない。
   *
   * そこで**実際に起きた間違いの形**に絞る。v3.0.11 で 37 か所あったのは
   * 「状態を表す語を自分で考えて書いた」もの (`positive` / `negative`) で、
   * 名前を見れば何をしたかったかが分かる。この手の語を並べておけば、
   * 同じ間違いは入った瞬間に止まる。**必要になったら足す**。
   */
  const INVENTED = [
    'positive', 'negative', 'danger', 'error', 'ok', 'good', 'bad', 'alert', 'caution',
    'safe', 'critical', 'notice', 'highlight', 'brand', 'gray-light', 'gray-dark',
    'positive-surface', 'negative-surface',
  ].filter((n) => !defined.has(n));

  return new RegExp(
    '\\b(?:bg|text|border-[lrtxyb]|border|ring|divide|fill|stroke|caret|decoration|from|via|to)'
    + '-(?:' + INVENTED.join('|') + ')'
    + '(?:-[a-z]+)?(?:/[0-9]{1,3})?\\b'
  );
}

/** 見るディレクトリ (画面のコード) */
const TARGET_DIRS = [
  'client/src', 'client-qsheet/src', 'client-equipment/src',
  'client-live/src', 'client-awards/src', 'client-daily/src',
  // v3.1.0 で追加。**共通部品も画面に出る** —
  // ここを見ていなかったので、`shared/src/client/finance/FinanceDocOriginal.tsx` に
  // 禁止した `window.confirm` が残り、生パレットも 16 か所あるのに
  // 「違反0」と報告されていた (全アプリに出る場所なので影響はいちばん大きい)。
  'shared/src',
];

/** 対象から外すもの (部品の実装そのもの・自動生成・出力用CG) */
const SKIP = [
  'shared/src/client/ui/',
  // 部品の実装そのもの。ここが「金額の組み立て方」「大きい数字の段」を定義している
  'shared/src/client/format.ts',
  'shared/src/client/dashboard/KpiCard.tsx',
  '/components/ui/',            // 各アプリの再エクスポート層
  '/cg/',                       // 出力用CG (画面設計の対象外。放送の絵)
  '/quiz/QuizCG',
  'client-awards/src/pages/Output',
];

/**
 * **放送に出る絵と、紙に出る絵**。画面設計の対象外なので色の決まりが違う。
 *  - 放送CG: 黒背景に金・白。UI のトークンを当てると絵が変わる
 *  - 全画面表示 (プロンプター・計時の表示機): 暗所で遠くから読む前提
 *  - 印刷 (ラック図): 紙に出るので `--border` (#e6e9ed) では薄すぎる
 */
const NOT_A_SCREEN = [
  'client-awards/src/oneshot/headline/',
  'client-awards/src/oneshot/animation/',
  'client-awards/src/oneshot/modules/',
  'client-awards/src/oneshot/OneShotStage',
  'client-awards/src/oneshot/Ticker',
  'client-awards/src/oneshot/LowerThirdCG',
  'client-awards/src/oneshot/CountdownCG',
  'client-qsheet/src/pages/PrompterPage',
  'client-live/src/pages/TimerDisplayPage',
  'client-equipment/src/pages/rackLayout/RackDisplay',
];

const RULES = [
  {
    id: 'money-by-hand',
    // `¥` のすぐ後ろに `{` か `${` が来る = 金額を手で組み立てている
    re: /¥\s*\$?\{/,
    why: '金額を手で組み立てないでください。`<Money value={n} />` か `formatCurrency(n)` を使います'
       + '（手で書くと桁が揃わず、丸め方も画面ごとに変わります）',
  },
  {
    id: 'man-yen-by-hand',
    // `/10000` や `/ 10_000` で万円に丸めている
    re: /\/\s*10[_,]?000\s*\)?\s*\.?\s*(toFixed|toLocaleString)?/,
    why: '万円の丸めは `manYen(n)` を使います'
       + '（`Math.round` と `toFixed` は負の数で結果が違い、画面ごとに数字が変わります）',
    // グラフの軸・サーバーからの値の変換など「万円にしない」割り算も引っかかるので、
    // 「万」の字が同じ行にあるものだけを見る
    extra: (line) => line.includes('万'),
  },
  {
    id: 'stat-size-by-hand',
    // 大きい数字に text-* を直書き (font-number と同じ行にある = 数字の見た目)
    re: /font-number/,
    why: '大きい数字の大きさは `<StatValue size="lg|md|sm">` から選びます'
       + '（その場書きだと同じ数字が画面ごとに違う大きさになります）',
    extra: (line) => /text-(2xl|3xl|4xl|5xl)/.test(line),
    only: v4Only,   // 凍結アプリは見た目を変えないので当てない
  },
  {
    id: 'empty-by-hand',
    // 一覧の代わりに**縦の場所を取るブロック**として出している「ありません」。
    // `text-center` を必須にしているのは、カードの中の1行の状態表示
    // (「待たせているものはありません」= 良い知らせ) や検索欄の注記まで
    // 拾ってしまうと、枠付きパネルに置き換えて逆に読みにくくなるため。
    re: /<(?:p|div)[^>]*className="[^"]*text-center[^"]*"[^>]*>\s*[^<>{]{0,40}(?:ありません|該当なし|見つかりません)/,
    why: '一覧が空のときは `<EmptyState title=… description=… />` を使います'
       + '（検索0件は `<NoSearchResults />`、権限が無いときは `<NoPermissionPanel />`）。'
       + '「データがありません」で終わらせず、**何が無いのかと次にやること**を書いてください',
    only: v4Only,   // 凍結アプリは見た目を変えないので当てない
  },
  {
    id: 'loading-by-hand',
    // ページ全体を差し替える読み込み表示。Delayed を通さないと一瞬で点滅する
    re: /if \s*\([^)]*\b(?:isLoading|isPending)\b[^)]*\)\s*(?:\{\s*)?return\b[^;]{0,200}animate-spin/,
    why: 'ページ全体の読み込みは `<Delayed><SkeletonRows /></Delayed>` を使います'
       + '（1秒未満はスピナーを出さない = 一瞬で返る取得で点滅させない。'
       + ' 画面の骨格は出したまま中身だけ骨組みにする）',
    only: v4Only,   // 凍結アプリは見た目を変えないので当てない
  },
  {
    id: 'browser-dialog',
    // ブラウザ標準の alert() / confirm()。`.alert(` のようなメソッド呼び出しは除く
    re: /(?<![\w.$])(?:window\.)?(alert|confirm)\s*\(/,
    // コメント行は対象外 (「なぜ禁止か」を書き残せなくなる)
    extra: (line) => !/^\s*(\/\/|\*|\/\*)/.test(line),
    why: '`alert()` / `confirm()` は使いません。'
       + '知らせるときは `notifyError()` / `notifySuccess()`（お知らせ帯）、'
       + '確認するときは `await confirmAction({ title, description, tone })` を使います'
       + '（ブラウザ標準のダイアログはデザインの外側に出て、押すまで他の操作ができず、'
       + '何が一緒に起きるかを書けません。v2.9.290 で 129 か所を置き換えました）',
  },
  {
    id: 'raw-palette',
    // Tailwind の生パレット (slate-800 / amber-500 …) を画面に直接書く。
    // v2.9.297 で 1,800 か所を共通トークンに置き換えた。放置すると
    // **アプリごとに違う灰色・違う赤**になり、「別のシステムに見える」に戻る。
    re: new RegExp(
      '\\b(?:bg|text|border|ring|from|to|via|divide|placeholder|accent|shadow|fill|stroke)'
      + '(?:-[a-z]+)?-'
      + '(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal'
      + '|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)'
      + '-[0-9]{2,3}(?:/[0-9]{1,3})?\\b',
    ),
    why: '色は共通トークンから選びます'
       + '（面 = `bg-background` / `bg-card` / `bg-muted`、文字 = `text-foreground` / `text-muted-foreground`、'
       + '状態 = `success` / `warning` / `destructive` / `info`、AI = `ai`、'
       + '**意味を持たない見分けのための色 = `cat-1`〜`cat-8`**）。'
       + '生のパレットを書くと、同じ「灰色」がアプリごとに違う灰色になり、'
       + '状態の色 (赤 = 危ない) と区別の色 (話者3が赤) が混ざります',
    /**
     * v3.1.0 で**全アプリを対象にした**。
     *
     * それまでは `client-` で始まるディレクトリだけを見ていた
     * (= 案件管理 `client/` と 共通部品 `shared/` は丸ごと除外)。
     * 結果として「違反0」と報告しながら、**一番人が触るアプリに 370 か所、
     * 共通部品に 16 か所**残っていた。検査が嘘をついている状態のほうが、
     * 違反が残っているより悪い (直す必要がないと読める)。
     *
     * 既存分は `BASELINE` に件数で記録し、**増えたときだけ止める**。
     * 一気に 386 か所を置き換えると差分が読めずレビューが成立しないため。
     */
    only: v4Only,   // 凍結アプリは見た目を変えないので当てない
  },
  {
    id: 'translucent-text',
    // 文字色に透明度を掛けると #8b929c より薄くなり、下地によっては読めない
    re: /\btext-(?:foreground|muted-foreground|warning-strong|destructive|success|info|primary|ai)\/[0-9]{1,3}\b/,
    why: '文字の色に透明度を掛けないでください'
       + '（補助テキストは **#5d6470 以上の濃さ**。`#8b929c` は白地で 3.08:1 しかなく'
       + ' AA を満たさないので使用禁止です。`text-muted-foreground/60` は白地で'
       + ' #9ea3ab 相当まで薄くなり、これを下回ります）。'
       + '薄くしたいときは透明度ではなく `text-muted-foreground` を使います',
    only: v4Only,   // 凍結アプリは見た目を変えないので当てない
  },
  {
    id: 'forbidden-wording',
    // 画面に出さないと決めた言葉 (デザイン 4章 23a / 2026-07-26 の修正依頼)。
    // コードの識別子と DB の列名は対象外 — **画面に出る文字だけ**を止める。
    //
    // **「エピソード」は 2026-08-07 に外した。** v4 のモックがタブ名として
    // 「エピソード」を使っており、モックが v4 の正だと決まったため
    // (`docs/v4-plan.md` の「大前提」)。ルールのほうをモックに合わせる。
    //
    // **「ビジネス案件」は 2026-08-08 に足した** (migration 179・`docs/design/gpm-merge.md` 決め⑪)。
    // GLS-B はプロジェクト管理へ移り、画面での呼び名は「プロジェクト」に決めた。
    // 同じものを指す言葉が2つ残ると、移ったことが伝わらない。
    re: /按分|データがありません|共用キー|タイムアウト|トースト|ビジネス案件/,
    why: '画面に出さないと決めた言葉です（デザイン 4章 ことばの設計）。'
       + '「按分」→「費用を分け合う」「分け方」「分けた額」／'
       + '「データがありません」→ **何が無いのかと次にやること**／'
       + '「共用キー」→「AI が自動実行」／'
       + '「ビジネス案件」→「プロジェクト」（GLS-B はプロジェクト管理の持ち物）。'
       + '技術用語（トースト・タイムアウト）はそのまま出さず、起きたことを日本語で書きます',
    // コメント行は開発者向けなので対象外 (概念名を残しておかないと DB と対応が取れない)
    extra: (line) => !/^\s*(\/\/|\*|\/\*)/.test(line),
  },
  {
    id: 'control-height',
    // ボタンの高さは 32/36/40/44/48px の5種だけ (デザイン README「寸法」)。
    // 20/24/28px のような中間の値を作ると、並べたときに底が揃わない。
    // **`\[..px\]\b` は1度も当たっていなかった** (v3.1.0 で修正)。
    // `]` の次が `"` だと `\b` が成立しないため、`h-[38px]"` が常に false になる。
    // あわせて 40番台の並びを直した — 旧 `4[1-357-9]` は **48 を誤って弾き 46 を見逃していた**。
    // 正は 32 / 36 / 40 / 44 / 48。
    re: /\bh-(?:[567]\b|\[(?:2[0-9]|3(?:[01]|[3-5]|[7-9])|4(?:[1-3]|[5-7]|9))px\])/,
    // **案内文が実在しないものを指していた** (`h-ctl-1`〜5 も `size="xs|xl"` も無い)。
    // 直せない案内は「検査が間違っている」と読まれて無視されるので、実在するものだけ書く
    why: 'ボタンの高さは **32 / 36 / 40 / 44 / 48px の5種**から選びます'
       + '（`h-8` `h-9` `h-10` `h-11` `h-12`、または `<Button size="sm|default|lg|icon|icon-sm">`）。'
       + '中間の値を作ると、同じ意味のボタンが画面ごとに1〜2px 違い、並べたときに底が揃いません',
    only: v4Only,
    // ボタンの開始タグと同じ行にあるものだけ。アイコン (h-4 w-4) は対象外
    extra: (line) => /<(?:button|Button|a)\b/.test(line) && !/\bh-(\d)\b[^"']*\bw-\1\b/.test(line),
  },
  {
    id: 'tap-target',
    /*
     * スマホのタップ領域は **44px 以上** (iOS HIG / ルート CLAUDE.md / v4 の _rules.md)。
     *
     * **以前この案内文は「46〜52px。44px ちょうども作らない」と書いていた**が、
     * preset の `min-h-tap` は 44px で、**検査と部品が食い違っていた** (G2 で発見)。
     * 44px を正にする — 3つの文書がすべて「最低 44px」と書いているため。
     * 止めるのは 30〜43px だけにする。
     *
     * `lg:min-h-[38px]` のような**ブレークポイント付きは見ない** — 共通シェルの
     * 左メニューは「スマホ 44px / PC 38px」で、PC 側は指で押さないので正しい。
     */
    re: /(?<![:\w-])min-h-(?:11\b|\[(?:3[0-9]|4[0-3])px\])/,
    /**
     * **押すもの**にだけ効かせる。
     *
     * 有効にした途端に、`<textarea rows={1} className="min-h-[32px]">` の
     * 入力欄の最小の高さや、読み取り専用の `<div>` の高さ、表の見出し行まで
     * 当たってしまった。これらはタップ領域ではないので、この決まりの対象ではない。
     */
    extra: (line, block = line) =>
      /<(?:button|Button|a|Link|NavLink)\b/.test(block)
      || /\bonClick=/.test(block)
      || /role="(?:button|tab|option)"/.test(block),
    why: 'スマホのタップ領域は **44px 以上**です（`min-h-tap` を使う。標準は 46〜52px）。'
       + '小さいと指の腹が縁にかかって押し損ねます。PC でだけ低くしたいときは '
       + '`min-h-tap lg:min-h-[38px]` のようにブレークポイントを付けてください',
    only: v4Only,
  },
  {
    id: 'col-width-by-hand',
    // 表の列幅は7段だけ。48〜250px の帯に入る中間の値を止める
    // (これより小さいのは図形、大きいのはパネルの幅なので対象外)
    re: /\b(?:min-|max-)?w-\[(\d+)px\]/,
    // ここも実在しない `w-col-1`〜7 を案内していた。実際の移行先は
    // `shared/src/client/ui/row.tsx` の `SlotWidth` (P2 で入れた7段)
    why: '表の列幅は **56 / 72 / 96 / 128 / 160 / 200 / 240px の7段**から選びます'
       + '（`<RowSlot w={…}>`、金額は `<MoneyCell width={…} />`、バッジは `<TableBadge w={…}>`）。'
       + '中間の値 (120px・180px …) を作ると、同じ意味の列がページごとに違う幅になり、'
       + '目が横に流れなくなります',
    /**
     * これは**表の列幅**の決まり。アプリの枠 (レール 88px・ドロワー 220px・
     * ドロップダウンの最小幅・ロゴの最大幅) は表の列ではないので対象外にする。
     * v3.1.0 で `shared/src` を見るようにしたときに初めて当たった。
     */
    // アプリの枠 (共通シェル・モーダル) は表の列ではないので対象外。
    // `SharedHeader` は凍結アプリ用で直せないので同じく外す
    only: (rel) =>
      v4Only(rel)
      && !/^shared\/src\/client\/(shell|manual|mcpInfo|versionHistory)\//.test(rel)
      && !/^shared\/src\/client\/(SharedHeader|AppSwitcher|AppHeader)\.tsx$/.test(rel),
    extra: (line) => {
      const allowed = new Set([56, 72, 96, 128, 160, 200, 240]);
      for (const m of line.matchAll(/\b(?:min-|max-)?w-\[(\d+)px\]/g)) {
        const n = Number(m[1]);
        if (n >= 48 && n <= 250 && !allowed.has(n)) return true;
      }
      return false;
    },
  },
  {
    id: 'page-title-by-hand',
    // `lg:` と `sm:` の両方の変種を止める。**同じページに2つの段が出ていた**
    // (`/finance/import` は枠が `text-xl sm:text-2xl`、中身が `text-xl lg:text-2xl` だった)
    // 間に別のクラス (`font-bold` `text-foreground` …) が挟まっていても止める。
    // v2.9.297 まで `text-xl font-bold text-foreground sm:text-2xl` を見逃していた
    re: /\btext-xl\b[^"']{0,60}?\b(?:lg|sm|md):text-2xl\b/,
    why: 'ページの見出しは `<PageTitle>` を使います'
       + '（38か所で重複し、`lg:` `sm:` `heading-page` の3種類が混ざっていました）',
    only: v4Only,   // 凍結アプリは見た目を変えないので当てない
  },
  {
    id: 'ai-person-name',
    // AI (MCP 経由) がやったことに人名を出す書き方。
    // `requested_by` / `ai_requested_by` は **AI が名簿と突き合わせずに書く自由記述**で、
    // 実際に「寺井 赳博」さんが「寺井武大」として記録されていた。これを画面で
    // 「指示: 寺井武大」と出すと、実在しない人名を断定的に見せてしまう。
    // 型宣言 (`ai_requested_by?: string | null;`) と存在判定 (`!!requested_by`) は
    // 画面に出さないので対象外 — **値を波括弧や文字列に埋める書き方だけ**を止める。
    re: /指示した人|指示[:：]\s*[{$]|\$\{[^}]*\b(?:ai_)?requested_by\b|\{\s*(?:\w+\.)?(?:ai_)?requested_by\s*\}/,
    why: 'AI (MCP 経由) がやったことに**人名を出さないでください**。'
       + '`requested_by` / `ai_requested_by` は AI が名簿と突き合わせず自由記述で書く値で、'
       + '実際に「寺井 赳博」さんが**「寺井武大」**として記録されていました'
       + '（AI がメール本文から漢字を推測して書いたもの）。'
       + '画面には `AI_ACTOR_LABEL`（「AI が自動実行」）や `aiOriginTitle("登録")` を使い、'
       + '**特定の人物ではなく AI がやったことだけ**を示します'
       + '（`shared/src/client/aiAttribution.ts`。監査のための値は DB に残っています）',
    // コメント行は開発者向けなので対象外 (なぜ出さないかを書き残せるようにする)。
    // JSX の `{/* … */}` も対象外
    extra: (line) => !/^\s*(\/\/|\*|\/\*|\{\s*\/\*)/.test(line),
  },
  /* ── v4 で足した決まり (G3) ────────────────────────────────── */
  {
    id: 'date-range-by-hand',
    // 「2026/05/12 〜 2026/05/31」を1つの文字列にすると、片方が空の行・
    // 年をまたぐ行が混ざったときに日付の桁が縦にそろわず、期間の長短が読めない
    re: /(\}|\)|['"`]|\d)\s*[〜~～]\s*(\{|\$\{|['"`]|\d)/,
    why: '期間は `<DateRange start={…} end={…} />` を使います'
       + '（開始・区切り・終了を別の要素に分けないと、片方が空の行が混ざったとき'
       + '日付の桁が縦にそろわず、期間の長短が読み取れません）',
    /**
     * **「1〜5」「1Q（1〜3月）」のような数の範囲を落とす。**
     * 除外を入れないと 37 件の誤検知が出た (実測)。日付らしい語が
     * 同じ行にあることを条件にする。
     */
    extra: (line) => {
      const t = line.trim();
      if (/^(\/\/|\*|\/\*|\{\/\*)/.test(t)) return false;                       // コメント
      // 「4Q（10〜12月）」「1〜12月 合算」「3〜5件」のような**数の範囲**は期間ではない。
      // 右側が `${em}月` のように式でも落とす (これを入れないと 7 件の誤検知が出た)
      if (/[〜~～]\s*(\$\{[^}]*\}|\d+)\s*(月|点|人|件|秒|分|回|日間|以上|程度|文字|%)/.test(line)) return false;
      return /\d{1,4}[-/年]\d{1,2}|[Dd]ate|_at\b|_on\b|start|end|due|lent|returned/.test(line);
    },
    only: (rel) => v4Only(rel) && !/\/manual\/content\.tsx$/.test(rel),
  },
  {
    id: 'missing-font-weight',
    re: /\bfont-(medium|semibold)\b|font-\[(500|600)\]|fontWeight:\s*['"]?(500|600)/,
    why: 'LINE Seed JP は **400 / 700 / 800 しか配信されていません**（500/600 は黙って落ちます）。'
       + 'ウェイトは型スケール (`text-h1` `text-h2` `text-cardtitle` `text-list` `text-th` `text-badge`) '
       + 'が内包しているので、サイズと一緒に選んでください',
    /**
     * **`shared/` は対象外**。shared の指定は**凍結4アプリにも効く**ので、
     * 一律に消すと凍結の見た目が変わる = 決定事項に反する。
     * shared は v4 専用の部品 (`ui/row` `ui/money` `states/` `shell/`) に限って直す。
     */
    only: (rel) => /^client(-daily|-equipment)?\/src\//.test(rel),
  },
  {
    id: 'hand-radius',
    re: /\brounded-\[(?!inherit)/,
    why: '角丸は9段の役割名から選びます'
       + '（`rounded-badge-xs` `rounded-badge` `rounded-control` `rounded-control-md` '
       + '`rounded-control-lg` `rounded-note` `rounded-card` `rounded-app` `rounded-chip`）。'
       + '段が増えると、縦に並べたとき角の丸みがそろいません',
    only: v4Only,
  },
  {
    id: 'grow-column-min-w0',
    re: /className=("|'|`)[^"'`]*\bflex-1\b[^"'`]*\btruncate\b[^"'`]*\1/,
    why: '伸びる列に `truncate` を付けるときは `min-w-0` が要ります'
       + '（flex の子は既定で中身より縮まないので、省略記号が出ずに隣の固定列を'
       + '押し出して桁がずれます）。`<RowMain>` を使えば内包されています',
    extra: (line) => !/min-w-0/.test(line),
    only: v4Only,
  },
  {
    id: 'unknown-color-token',
    /**
     * **定義されていない色トークン**を書いている。
     *
     * v3.0.11 の時点で `text-positive` / `bg-negative` / `border-positive/40` が
     * 31 行 (37 か所) あったが、`positive` / `negative` は
     * `shared/tailwind.preset.ts` にも `tokens.css` にも**存在しなかった**。
     * Tailwind は知らない色のクラスを**黙って出力しない**ので、
     *   - 合同案件の「総額と一致 / ずれている」が どちらも黒文字で出る
     *   - 香盤表の本番レーンの枠と背景が付かない
     *   - 案件の予定タブの本番日の点が透明になる
     * という「デザインどおりに書いたのに何も起きない」状態になっていた。
     * 型でも lint でも落ちないので、**画面を開いた人が気づくしかない**種類の抜け。
     *
     * 許すのは preset の colors のキー + Tailwind の組み込み
     * (white/black/transparent/current/inherit) + 生パレット
     * (そちらは `raw-palette` が別に止める)。
     */
    re: buildUnknownColorRe(),
    // コメント行は対象外 (どのトークンが無かったかを書き残せるようにする)
    extra: (line) => !/^\s*(\/\/|\*|\/\*)/.test(line),
    why: '定義されていない色トークンです。'
       + 'Tailwind は知らない色を**黙って出力しない**ので、書いても色が付きません '
       + '(v3.0.11 では `positive` / `negative` が 37 か所あり、合同案件の一致/不一致、'
       + '香盤表の本番レーン、案件の予定タブの本番日がすべて無色で出ていました)。'
       + '面/文字は `background` `card` `muted` `foreground` `muted-foreground`、'
       + '状態は `success` `warning` `destructive` `info`、AI は `ai`、'
       + '**意味を持たない見分けの色は `cat-1`〜`cat-8`** から選んでください',
  },
];

/**
 * サーバー側の禁止パターン。画面の話ではないが、**同じ「入れたら止まる」形**で
 * 守りたいものをここに置く (検査を2本に分けると片方だけ走る事故が起きる)。
 */
const SERVER_DIRS = ['server/src'];
const SERVER_SKIP = ['server/src/shared/utils/xlsx-safe.ts'];
const SERVER_RULES = [
  {
    id: 'raw-xlsx-read',
    re: /XLSX\.read\s*\(/,
    why: 'Excel の読み取りは `safeReadWorkbook()` を通してください'
       + '（xlsx には npm 上に修正版が無い脆弱性が2件あり、中身の判定と'
       + ' prototype 汚染の検知を境界で必ず通す必要があります。詳細: server/src/shared/utils/xlsx-safe.ts）',
  },
];

/**
 * 各アプリが**共通の土台に載っているか**を見る (v2.9.297)。
 *
 * ここを検査するのは、実際に外れていて画面が壊れていたから:
 *  - `client-awards` だけ `tokens.css` を読まず、色の変数が 21 個しか無かった
 *    (他は 207 個)。共通部品の `bg-success` などに色が付かない。
 *  - `client-awards` だけ Tailwind の `content` に `../shared/src/client/**` が
 *    無く、**共通部品のクラスが1つも生成されていなかった**。
 *  - `height: 100%` を書いていたのが `client` だけで、共通シェル (`h-full`) が
 *    6アプリで**中身の高さまで縮み**、レールが画面の途中で切れていた。
 *
 * どれも「動くけれど見た目が壊れる」ので、型でもテストでも気づけない。
 */
function checkAppFoundation() {
  // **v4.0.0 の対象3アプリだけ。** 凍結4アプリ (Qシート / 技術資料 / 計時LIVE /
  // リアルタイムCG) は「今日と同じ見た目を保つ」のが決定事項で、`tokens.css` を
  // 直接読むままが正しい。base.css は高さ・書体・印刷を変えるので当ててはいけない。
  const apps = ['client', 'client-daily', 'client-equipment'];
  const out = [];
  for (const app of apps) {
    const cssPath = join(ROOT, app, 'src/index.css');
    let css = '';
    try { css = readFileSync(cssPath, 'utf8'); } catch { /* アプリが無ければ飛ばす */ continue; }
    if (!/@import\s+['"]@gmo-onair\/shared\/src\/client\/base\.css['"]/.test(css)) {
      out.push({
        rel: `${app}/src/index.css`, line: 1, id: 'app-foundation',
        text: '共通の土台を読んでいません',
        why: "各アプリの index.css は `@import '@gmo-onair/shared/src/client/base.css';` から始めます"
           + '（トークンと、html/body/#root の高さ・書体をここで配っています。'
           + '読まないと共通シェルが縮んでレールが画面の途中で切れます）',
      });
    }
    const cfgPath = join(ROOT, app, 'tailwind.config.ts');
    let cfg = '';
    try { cfg = readFileSync(cfgPath, 'utf8'); } catch { continue; }
    if (!/presets:\s*\[\s*preset/.test(cfg)) {
      out.push({
        rel: `${app}/tailwind.config.ts`, line: 1, id: 'app-foundation',
        text: '共通プリセットを継承していません',
        why: "`presets: [preset as Config]` で `shared/tailwind.preset.ts` を継承してください"
           + '（継承しないと `success` / `warning` / `info` / `ai` / `cat-1〜8` の色が存在せず、'
           + '共通部品が色無しで出ます）',
      });
    }
    if (!cfg.includes('../shared/src/client/**')) {
      out.push({
        rel: `${app}/tailwind.config.ts`, line: 1, id: 'app-foundation',
        text: 'content に共通部品が入っていません',
        why: "`content` に `'../shared/src/client/**/*.{js,ts,jsx,tsx}'` を入れてください"
           + '（入れないと**共通部品だけが使っているクラスが1つも生成されず**、'
           + 'レイアウトが崩れます。v2.9.297 まで リアルタイムCG がこの状態でした）',
      });
    }
  }
  return out;
}

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'dist') continue;
      walk(p, out);
    } else if (/\.tsx?$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

const files = TARGET_DIRS.flatMap((d) => walk(join(ROOT, d)));
const findings = checkAppFoundation();

for (const file of files) {
  const rel = relative(ROOT, file);
  if (SKIP.some((s) => rel.includes(s.replace(/^\//, '')) || `/${rel}`.includes(s))) continue;
  const notAScreen = NOT_A_SCREEN.some((s) => rel.startsWith(s));
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    // 「ここは意図してこう書いている」と書いた行は見逃す (逃げ道を1つだけ用意する)
    if (line.includes('ui-tokens-ok')) return;
    /**
     * 直前3行 + この行。JSX は属性が改行で分かれるので、
     * 「`<button` と同じ行に書いてあるか」だけを見ると**書き方によって見逃す**
     * (`<button\n  type="button"\n  className="min-h-[36px]"` が素通りしていた)。
     */
    const block = lines.slice(Math.max(0, i - 3), i + 1).join('\n');
    for (const rule of RULES) {
      // 放送・印刷に出る絵は色・寸法の決まりが違うので、その検査だけ外す
      // (紙は px 指定の表組みが普通で、放送CGはタップ領域もボタン段も関係ない)
      if (notAScreen && [
        'raw-palette', 'translucent-text', 'control-height', 'tap-target', 'col-width-by-hand',
      ].includes(rule.id)) continue;
      if (rule.only && !rule.only(rel)) continue;
      if (!rule.re.test(line)) continue;
      if (rule.extra && !rule.extra(line, block)) continue;
      findings.push({ rel, line: i + 1, id: rule.id, why: rule.why, text: line.trim().slice(0, 120) });
    }
  });
}

const serverFiles = SERVER_DIRS.flatMap((d) => walk(join(ROOT, d)));
for (const file of serverFiles) {
  const rel = relative(ROOT, file);
  if (SERVER_SKIP.some((s) => rel === s)) continue;
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (line.includes('ui-tokens-ok')) return;
    for (const rule of SERVER_RULES) {
      if (!rule.re.test(line)) continue;
      findings.push({ rel, line: i + 1, id: rule.id, why: rule.why, text: line.trim().slice(0, 120) });
    }
  });
}

/**
 * ベースライン (v3.1.0)
 *
 * ── なぜ件数で持つか ──────────────────────────────────────
 *
 * `raw-palette` と `translucent-text` は v3.0.11 まで **`client/` と `shared/` を
 * 丸ごと除外**していた。つまり検査は「違反0」と報告しながら、一番人が触る
 * 案件管理に 370 か所、全アプリに出る共通部品に 16 か所が残っていた。
 * **検査が嘘をついている状態は、違反が残っているより悪い** — 直す必要が
 * 無いように読めるので、誰も直さない。
 *
 * かといって 400 か所を1つの版で置き換えると差分が読めずレビューが成立しない。
 * そこで**いまの数を記録して、増えたら止める**形にする。
 * 減らしたときは記録も下げる (下げ忘れると次に増えても気づけない)。
 *
 * **新しく足す規則はベースラインを作らない。** 0 件のうちに入れれば
 * 「増えたら止まる」は最初から成立する。
 */
/**
 * 記録は**アプリ別**に持つ (G2)。
 *
 * 1つの数にまとめると「凍結アプリで +1・v4 で −1」が相殺されて増加を見逃す。
 * ここに無いアプリ・規則は 0 件が正で、**1件でも出たら止まる**。
 *
 * 減らしたら記録も下げること (下げ忘れると次に増えても気づけない)。
 * `node scripts/check-ui-tokens.mjs --update` で実測値に書き直せる。
 */
const BASELINE = {
    "ai-person-name": {
      "client": 8
    },
    "browser-dialog": {
      "client": 25,
      "client-awards": 17,
      "client-daily": 1,
      "client-live": 4,
      "client-qsheet": 17
    },
    "col-width-by-hand": {
      "client": 17,
      "client-equipment": 6,
      "client-qsheet": 9
    },
    "control-height": {
      "client": 7,
      "client-equipment": 2,
      "client-qsheet": 2
    },
    "date-range-by-hand": {
      "client": 7,
      "client-daily": 1
    },
    "empty-by-hand": {
      "client": 4,
      "client-equipment": 1,
      "client-qsheet": 1,
      "shared": 2
    },
    "forbidden-wording": {
      "client": 40,
      "client-live": 1,
      "client-qsheet": 3,
      "shared": 1
    },
    "grow-column-min-w0": {
      "client": 1,
      "client-equipment": 2,
      "client-qsheet": 5,
      "shared": 1
    },
    "missing-font-weight": {
      "client": 124,
      "client-daily": 6,
      "client-equipment": 46
    },
    "money-by-hand": {
      "client": 3,
      "client-equipment": 1
    },
    "page-title-by-hand": {
      "client": 4,
      "client-equipment": 1,
      "client-qsheet": 1,
      "shared": 1
    },
    "raw-palette": {
      "client": 94,
      "client-daily": 33,
      "client-equipment": 65,
      "client-qsheet": 129,
      "shared": 6
    },
    "raw-xlsx-read": {
      "server": 4
    },
    "stat-size-by-hand": {
      "client": 1
    },
    "translucent-text": {
      "client": 13,
      "client-daily": 2,
      "client-equipment": 5,
      "client-qsheet": 20,
      "shared": 5
    }
  };

/** 記録を持つ規則 = いま大量にあり、1つの版では直しきれないもの */
const BASELINED = new Set(Object.keys(BASELINE));

const byRule = new Map();
for (const f of findings) {
  if (!byRule.has(f.id)) byRule.set(f.id, []);
  byRule.get(f.id).push(f);
}

/** 規則 × アプリ の件数 */
function countByApp(list) {
  const n = {};
  for (const f of list) n[appOf(f.rel)] = (n[appOf(f.rel)] ?? 0) + 1;
  return n;
}

/** 記録を実測値で書き直す (`--update`) */
if (process.argv.includes('--update')) {
  // 初回の引き直しでは「いま出ているものすべて」を記録にする。
  // **0件の規則は記録に載せない** — 載せると「増えたら止まる」が効かなくなる
  const next = {};
  for (const [id, list] of [...byRule].sort()) {
    next[id] = Object.fromEntries(Object.entries(countByApp(list)).sort());
  }
  const file = new URL(import.meta.url).pathname;
  const src = readFileSync(file, 'utf8');
  const json = JSON.stringify(next, null, 2).split('\n').map((l, i) => (i ? '  ' + l : l)).join('\n');
  const re = /const BASELINE = \{[\s\S]*?\};/;
  writeFileSync(file, src.replace(re, `const BASELINE = ${json};`));
  console.log('記録を書き直しました:\n' + json);
  process.exit(0);
}

/** 止めるもの (記録超過 or 記録を持たない規則) */
const blocking = [];
const withinBaseline = [];
for (const [id, list] of byRule) {
  if (!BASELINED.has(id)) { blocking.push([id, list]); continue; }
  const allowed = BASELINE[id] ?? {};
  const actual = countByApp(list);
  const over = Object.entries(actual).filter(([app, n]) => n > (allowed[app] ?? 0));
  if (over.length) {
    blocking.push([id, list, over.map(([app, n]) => `${app} ${allowed[app] ?? 0} → ${n}`).join(' / ')]);
  } else {
    withinBaseline.push([id, list.length, Object.values(allowed).reduce((a, b) => a + b, 0)]);
  }
}

/**
 * `--soft` = 件数だけ出して止めない (G1)。
 *
 * この検査は前回の刷新でできた部品を前提に書かれていて、`main` に戻したときに
 * **部品だけが消えて検査が残った**状態でした。いきなり必須にすると2,000件で
 * 落ちるので、まず件数を見せるところから始めます。
 */
const SOFT = process.argv.includes('--soft') || process.env.UI_TOKENS_SOFT === '1';
if (SOFT && blocking.length) {
  console.log(`[ui-tokens] まだ止めません (--soft)。いま ${findings.length} 件あります:`);
  for (const [id, list] of [...byRule].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ・${id}: ${list.length} 件  ${JSON.stringify(countByApp(list))}`);
  }
  process.exit(0);
}

if (blocking.length === 0) {
  console.log(`[ui-tokens] ${files.length + serverFiles.length} ファイルを見ました。手で書かれた数字・見出し、禁止パターンはありません。`);
  for (const [id, n, allowed] of withinBaseline) {
    console.log(`  ・${id}: 残り ${n} 件 (記録 ${allowed} 件。増やさないこと。減らしたら --update で記録も下げる)`);
  }
  process.exit(0);
}

const total = blocking.reduce((n, [, list]) => n + list.length, 0);
console.error(`[ui-tokens] 直す必要がある箇所が ${total} 件あります。\n`);
for (const [id, list, allowed] of blocking) {
  if (allowed !== undefined) {
    console.error(`■ ${id} — **増えています**: ${allowed}`);
    console.error(`   ${list[0].why}`);
    console.error('   増えたぶんだけ直してください。全部を直す版は別に切ります。');
  } else {
    console.error(`■ ${id} — ${list[0].why}`);
  }
  for (const f of list) console.error(`   ${f.rel}:${f.line}  ${f.text}`);
  console.error('');
}
console.error('どうしてもその場で書く必要があるときは、その行に `ui-tokens-ok` のコメントを付けてください。');
process.exit(1);
