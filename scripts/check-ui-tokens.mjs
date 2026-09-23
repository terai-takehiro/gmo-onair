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
// ⚠️ 制作資料 (client-techops/src) は v4.1 で凍結を解いたのでここに足した
// (03-app-structure-impl.md §7-2 の10番目の指摘)。まだ見た目は作り直していないので
// 実測値が大きく増える見込み。既存分は BASELINE にそのまま記録し、直す作業は
// 見た目を作り直す段で行う（raw-palette 等の v4Only 規則が新規に適用されるため）。
const V4_DIRS = ['client/src', 'client-daily/src', 'client-equipment/src', 'client-techops/src', 'shared/src'];
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
  'client/src', 'client-techops/src', 'client-equipment/src',
  'client-live/src', 'client-awards/src', 'client-daily/src', 'client-wiki/src',
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
  'client-techops/src/pages/PrompterPage',
  'client-live/src/pages/TimerDisplayPage',
  'client-equipment/src/pages/rackLayout/RackDisplay',
];

/**
 * **コメントの中は検査しない** — 「なぜそう書かないか」を残せるようにするため。
 *
 * 行頭の `//` `*` `/*` `{/*` を落とすだけでは足りない。**ブロックコメントの
 * 2行目以降は行頭が記号ではない**ので素通りする。実際 v4.7 で
 * 「自前の上辺バーは持たない（もとは … ＋ 14px の h1）」という**説明文**が
 * `page-h1-by-hand` に当たった（この製品が4回踏んだ「説明文の中に実物を書く」）。
 *
 * ⚠️ **直前3行だけ見る形にしてはいけない**（最初そう書いて Codex に指摘された）。
 * コメントが4行以上あって5行目で実物に触れると、窓の中に `/*` が入らないので
 * **コードとして扱われ、説明文が違反になる** — この関数が防ぎたかったものそのもの。
 *
 * そこで**ファイルを1度なめてコメントを空白で塗り潰した写し**を作り、
 * 検査はその写しに当てる（報告に出す文字列は元の行のまま）。
 * 文字列・テンプレートリテラルの中は塗らない（`'/*'` という**値**で
 * ファイルの残り全部がコメント扱いになると、逆に違反を丸ごと見逃す）。
 *
 * **塗り潰しに失敗したら（閉じていないブロックが残ったら）写しを使わない。**
 * 正規表現リテラルなど、この単純な走査で読み違える書き方が将来入ったとき、
 * 静かに検査が効かなくなるより、元の行で当てて多めに報告するほうが安全。
 */
function blankComments(text, { strings = false } = {}) {
  const out = text.split('');
  let i = 0;
  let inBlock = false;
  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];
    if (inBlock) {
      if (ch === '*' && next === '/') { out[i] = ' '; out[i + 1] = ' '; i += 2; inBlock = false; continue; }
      if (ch !== '\n') out[i] = ' ';
      i += 1;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      i += 1;
      let depth = 0;   // テンプレートの `${…}` の中は**コード**なので塗らない
      while (i < text.length) {
        if (text[i] === '\\') { i += 2; continue; }
        if (quote === '`' && depth === 0 && text[i] === '$' && text[i + 1] === '{') {
          depth = 1; i += 2;
          // 波括弧の対応を数えて `${…}` を素通りさせる（中の JSX を消さない）
          while (i < text.length && depth > 0) {
            if (text[i] === '{') depth += 1;
            else if (text[i] === '}') depth -= 1;
            i += 1;
          }
          continue;
        }
        if (text[i] === quote) { i += 1; break; }
        // `strings` を頼まれたときだけ**値の中身**を消す。
        // 文字列の中に書いた `'<PageShell>'` を「部品を置いた」と読ませないため
        if (strings && text[i] !== '\n') out[i] = ' ';
        i += 1;
      }
      continue;
    }
    /*
     * **エスケープの次の文字は読み飛ばす。** 正規表現リテラルの中の `\/` を
     * 素で読むと、`/a\/*b/` の `/*` を**ブロックコメントの始まり**と取り違え、
     * そこから次の `*​/` までのコードを塗り潰して**違反を静かに見逃す**。
     * (いま走査対象の 1300 ファイルにこの書き方は無いが、入った日に気づけない)
     */
    if (ch === '\\') { i += 2; continue; }
    if (ch === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') { out[i] = ' '; i += 1; }
      continue;
    }
    if (ch === '/' && next === '*') { out[i] = ' '; out[i + 1] = ' '; i += 2; inBlock = true; continue; }
    i += 1;
  }
  // 閉じ忘れ = 読み違えたということ。写しは使わない (呼ぶ側が元の行に戻す)
  return inBlock ? null : out.join('');
}

/**
 * **画面（ルートに割り当てた部品）のファイルだけ。**
 *
 * ダイアログやカードなど「画面ではない部品」に本文幅の決まりを当てると、
 * 例えばダイアログを `sm:max-w-4xl` で広げただけで
 * 「`<PageShell>` を使え」という**見当違いの案内**で lint が止まる。
 *
 * ⚠️ **`/pages/` を含むかで見てはいけない**（最初そう書いて Codex に指摘された）。
 * この製品は `src/pages/` の下に画面でない部品も置く — 実測で **521 個**あり、
 * `pages/sheets/CreateSheetDialog.tsx` や `pages/graphics/TemplateFormDialog.tsx`
 * のようなダイアログがそこに含まれる。
 *
 * **ファイル名が `…Page.tsx` かで見る。** ルーターの `element={<…/>}` を数えると
 * 68 個のうち画面はすべて `Page` で終わり、残りは `ProtectedRoute` や
 * `RedirectOnce` など**絵を持たない包み**だけだった（実測）。
 * 画面を `…Page.tsx` 以外の名前で作った日は見逃すが、**見逃しは静かに増えるだけ**で、
 * 誤検知のように他の人の lint を止めはしない。
 */
const isPageFile = (rel) =>
  /^client(-daily|-equipment|-techops)?\/src\//.test(rel) && /Page\.tsx$/.test(rel);

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
    // **「按分」は 2026-09-05 に外した。** 会計・帳簿の標準語で、社外や freee の総勘定元帳と
    // 突き合わせる語なので、開くと照合できなくなる (Salesforce が「フェーズ」「確度」を、
    // マネーフォワードが「仕訳」を残しているのと同じ判断)。開いた結果
    // 「按分グループ」と「費用を分け合うグループ」が同時に生き、同じものに名前が2つできていた。
    // 決定と経緯は `docs/reviews/2026-09-05-terminology-review.md`。
    //
    // **「MCP」「論理削除」「cron」「SSH」は 2026-09-05 に足した** — 同じ棚卸しで、
    // 全アプリの本人メニュー・設定画面に漏れているのが見つかったため。
    //
    // **「ビジネス案件」は 2026-08-08 に足した** (migration 179・`docs/design/gpm-merge.md` 決め⑪)。
    // GLS-B はプロジェクト管理へ移り、画面での呼び名は「プロジェクト」に決めた。
    // 同じものを指す言葉が2つ残ると、移ったことが伝わらない。
    // **2026-09-06 に口語・造語を足した**（`docs/wording.md` ルール9）。
    // 「基本単語がベースになるべきだし、表現も稚拙で一般的ではない」というご指摘。
    // ルール6が「開くかどうか」しか決めていなかったため、開いた先が口語・造語になっていた。
    re: /データがありません|共用キー|タイムアウト|トースト|ビジネス案件|MCP|論理削除|ぜんぶ|さばく|見るだけ|書ける|動いているもの|止まっているもの|今日さばくもの|書き留めたもの|やり切れ|壁打ち|ひと押し/,
    why: '画面に出さないと決めた言葉です（デザイン 4章 ことばの設計）。'
       + '「データがありません」→ **何が無いのかと次にやること**／'
       + '「共用キー」→「AI が自動実行」／'
       + '「ビジネス案件」→「プロジェクト」（GLS-B はプロジェクト管理の持ち物）／'
       + '「MCP」→「AI につなぐ」／「論理削除」→「画面から隠す（記録は残ります）」。'
       + '技術用語（トースト・タイムアウト）はそのまま出さず、起きたことを日本語で書きます／'
       + '口語・造語（ぜんぶ・さばく・見るだけ・書ける・動いているもの）は基本語へ'
       + '（すべて・対応・閲覧・編集・進行中）。`docs/wording.md` ルール9',
    // コメント行は開発者向けなので対象外 (概念名を残しておかないと DB と対応が取れない)。
    // **JSX コメント `{/* ... */}` も含む** — 2026-09-05 に禁止語を足したとき、
    // 「論理削除は画面に出さない」と**説明しているコメント自身**が引っかかった。
    extra: (line) => !/^\s*(\/\/|\*|\/\*|\{\s*\/\*)/.test(line),
  },
  {
    id: 'overdue-wording',
    /*
     * 期限を越えたことを口語で書かない（`docs/wording.md` ルール8・2026-09-22）。
     *
     * 利用者から「**過ぎてますとかそういう表現やめろ**」と明示のご指摘があった。
     * 「過ぎています」は和語の口語で、同じ意味の言い方が画面ごとに
     * 「2日 過ぎています」「返却の日を過ぎています」「（過ぎています）」と3通りに割れていた。
     * 正は**「期限超過」と「N日超過」の2つだけ**（`activityLog/dueState.ts` の `duePartsOf`）。
     *
     * `codeOnly`: コメントは対象外 — 「なぜこの言い方を禁じたか」を
     * コメントに書き残せなくなると、次に触る人が理由ごと消してしまう。
     * 記録（BASELINE）は持たない — 既存分をこの版で全部直したので 0 件から始まる。
     */
    re: /過ぎています|過ぎてます|期限ぎれ/,
    why: '期限を越えたことは **「期限超過」「N日超過」** と書きます（`docs/wording.md` ルール8）。'
       + '✕「2日 過ぎています」「返却の日を過ぎています」→ ○「2日超過」「返却期限超過」。'
       + '日付と注記を分けて出すときは `activityLog/dueState.ts` の `duePartsOf()` を使うと'
       + '「9/18」＋「4日超過」の形で返ります',
    codeOnly: true,
  },
  {
    id: 'metaphor-wording',
    /*
     * 開発文書の比喩語を画面に出さない（`docs/wording.md` ルール11・2026-09-22）。
     *
     * 設計書や CLAUDE.md は「道具・決めごと・棚・札・帯・木・種・口・手つき・作法」のような
     * 比喩で書いてあり、それが画面の文言に漏れて「この道具の決めごと」のような
     * 利用者には意味の取れない表現になっていた（ご指摘「謎表現が相も変わらず続いています。
     * 抹殺を。ちゃんとルール化してください」）。
     *
     * 1文字の語（帯・札・木・種・器）は普通の語と衝突する（帯域・名札・木曜・種類・機器）ので
     * 「の帯」「札が付く」のような比喩の形だけを見る。「小道具」「大道具」「棚卸」「凍結」は業務語なので除く。
     * 「生きている」「凍る」「古びる」と、入口・出口の比喩の形（「〜の入口」「入口は」「出口を」）も見る。
     * `codeOnly`: コメントは対象外（設計の経緯をコメントに書くときは比喩のままでよい）。
     * 記録（BASELINE）は持たない — 0件から始めるので1件でも止まる。
     */
    re: /決めごと|きめごと|(?<![小大])道具|手つき|作法|手入れ|棚(?!卸)|札(?=[がをに]付)|(?<=の)帯(?=[をがに]|$)|(?<=の)木(?![曜材])|(?<=の)種(?![類別])|(?<=の)器(?=[にをが]|$)|生きて|凍(?!結)|古び|(?<=の)(?:入口|出口)|(?:入口|出口)(?=[はを])/,
    why: '開発文書の比喩語は画面に出しません（`docs/wording.md` ルール11）。'
       + '道具→アプリ／機能／画面／ツールバー・決めごと→ルール／設定・棚→スペース／区分・'
       + '札→ラベル／バッジ／表示・帯→バナー／ツールバー・木→ツリー・種→候補・'
       + '口→メニュー／リンク・手つき／作法→操作・手入れ→見直し・'
       + '生きている／凍る／古びる→有効／固定／期限切れ・入口／出口→メニュー／リンク',
    codeOnly: true,
  },
  {
    id: 'wago-verb-wording',
    /*
     * 動詞が2系統になっていないか（`docs/wording.md` ルール8・9・2026-09-23）。
     *
     * 動詞は標準語系（追加／編集／削除／キャンセル／保存・検索）に統一するはずが、
     * 和語系（足す・直す・消す・やめる・入れる・打つ・見くらべる・探す）の活用形が
     * 画面のコードにそのまま残っていて利用者の目に触れていた
     * （「入れて追加します」「作ってから」「読み込み直します」「候補に出ます」）。
     * モック向けの `scripts/check-mock-wording.mjs` は同じ規則を先に持っていたが、
     * 画面のコードはまだ対象外だった（同スクリプルの `wago-verb-wording` のコメント参照）。
     *
     * **正規表現は check-mock-wording.mjs の `wago-verb-wording` と同じもの**
     * （片方だけ直すとまた食い違うので、足すときは両方に足す）。
     * 除外の理由（作業・作成・入力・出力・提出・直前・直接・直近・見直す・見直し・手直し・
     * 取り消す・消し込み・配布をやめる・足し算・消し込・手作りが対象外な理由）は
     * そちらのコメントを見る。
     *
     * `codeOnly`: コメントは対象外（metaphor-wording と同じ考え方。
     * 「なぜこの言い方を禁じたか」をコメントに書き残せるようにする）。
     * 記録（BASELINE）は持つ — 2026-09-23 時点の既存分をアプリ別に記録し、増えたら止める
     * （モックと違い、画面のコードは1つの版では直しきれない量が既にあったため）。
     */
    re: /(?<!手)作(?:る|り(?!物)|って)|足(?:す|し(?!算)|して)|(?<![見手])直(?:す|し(?!込)|して)|(?<!取り)消(?:す|し(?!込)|して)|(?<!配布を)やめ(?:る|て)|入れ(?:る|て|ます)|打(?:つ|って|つと)|見くらべ|探(?:す|し)/,
    why: '動詞が2系統になっています（`docs/wording.md` ルール8・9: 作る→作成・足す→追加・直す→編集・'
       + '消す→削除・やめる→キャンセル・入れる／打つ→入力・見くらべる→比較・探す→検索）',
    codeOnly: true,
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
  /* ── 画面の外枠 (v4.7・`_rules.md`「5. ページの外枠」) ────────── */
  {
    id: 'page-width-by-hand',
    /**
     * **本文の幅を画面ごとに書いている。**
     *
     * 制作技術支援を数えたら、ページ直下の枠が **8通り**に割れていた
     * (幅なし / `screen-2xl` / `6xl` が2種の余白で / `5xl` が2種 / `4xl` / `3xl` が2種)。
     * 同じサイドバーの中で隣り合う画面の本文幅と左右余白が違うと、
     * **画面を移るたびに文章の左端が動く**。文字の大きさより先に気づく差。
     *
     * `<PageShell>` が持つ段は `full`(制限なし) と `narrow`(`max-w-3xl`) の2つだけ。
     * **中間の段を1つ許すと、次の画面が別の中間を選んで元に戻る**ので、
     * 中間 (`4xl` `5xl` `6xl` `7xl` `screen-*`) をここで止める。
     */
    re: /\bmax-w-(?:4xl|5xl|6xl|7xl|screen-[a-z0-9]+)\b/,
    why: '本文の幅は `<PageShell>` の2段 (`full` / `narrow`) から選びます'
       + '（`shared/src/client/ui/pageShell.tsx`。中間の段を1つ許すと'
       + '次の画面が別の中間を選び、画面を移るたびに本文の左端が動きます）',
    // **画面のファイルだけ**。ダイアログ・カードなど画面でない部品は対象外
    // (そこに当てると「ダイアログを広げた」だけで見当違いの案内で止まる)
    only: isPageFile,
    // コメントの中は見ない (塗り潰した写しに当てる)
    codeOnly: true,
  },
  {
    id: 'page-h1-by-hand',
    /**
     * **画面の名前を `<h1>` で手書きしている。**
     *
     * 制作技術支援では h1 の書き方が **11通り・14px〜24px** に割れていた
     * (`text-h1` 7 / `truncate text-lg font-bold` 6 / `text-sm font-bold` 3 ほか)。
     * 自前の上辺バーを持つ画面では 14px まで小さくなっていた。
     * 画面の名前は `<PageHeader>` (`text-h1` = 23px/800) 1つに寄せる。
     */
    /**
     * ⚠️ **大きさを並べて当ててはいけない。** 最初はこう書いていた:
     *   `<h1 … className="… text-(xs|sm|base|lg|xl|2xl|3xl) …">`
     * これだと **(a) 素直に `text-h1` と手書きした見出し**も、
     * **(b) `className` が次の行にある書き方**も素通りする
     * (この検査は1行ずつ当てるため)。**この決まりが禁じたはずのものを、
     * この決まりが許す**状態だった (Codex レビュー #647 の指摘)。
     *
     * 大きさではなく**タグそのもの**を見る。画面の名前は `<PageHeader>` が出すので、
     * 画面側に `<h1>` が現れること自体が違反。
     */
    // **行末で終わる `<h1` も拾う**（`$`）。`[\s>/]` だけだと
    // 属性を次の行に書いた `<h1⏎  className=…>` に当たらず、
    // 指摘②の (b) がそのまま残っていた（再現して確認した）
    re: /<h1(?=[\s>/]|$)/,
    why: '画面の名前は `<PageHeader title=… />` を使います'
       + '（`shared/src/client/ui/pageHeader.tsx`。制作技術支援では h1 の書き方が'
       + '11通り・14px〜24px に割れていました）。'
       + '`text-h1` を手で当てるのも同じ — 大きさが合っていても、'
       + '副題の位置・スマホでの折り返し・主アクションの差し込み口が画面ごとにずれます',
    // 見出し部品の実装本体 (`ui/pageHeader` `ui/numbers` `dashboard/DashboardHeader`) は
    // そこが本体なので対象外
    only: (rel) =>
      v4Only(rel)
      && !/^shared\/src\/client\/(ui|dashboard|shell)\//.test(rel),
    // コメントの中は見ない (塗り潰した写しに当てる)
    codeOnly: true,
  },
  {
    id: 'page-safe-area-by-hand',
    /**
     * **画面が自分でホームバーの逃げを書いている。**
     *
     * ホームバーの逃げを持っているのは共通シェル (`shell/AppShell.tsx` の
     * 主アクションの差し込み口と `MobileTabs`)。画面側で
     * `style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}` と書くと、
     * **インラインの指定が `p-3` の下余白に勝って 0px になり**、
     * ノッチの無い端末では単に本文の下の余白が消える
     * (制作技術支援の計時・収録・配信の5画面で実際にそうなっていた)。
     *
     * シェル側は `calc(0.75rem + env(...))` と足し算で書いているので当たらない。
     */
    /*
     * Tailwind の任意値で書いた `pb-[env(safe-area-inset-bottom)]` も同じ壊れ方をする
     * （`p-3` の下余白を上書きして 0px になる）。いま使っている箇所は無いが、
     * **別の綴りで書けば通る**状態を残さない（自己監査で見つけた・#647）。
     * `calc(… + env(…))` の足し算はシェル側の正しい書き方なので当てない。
     */
    re: /paddingBottom:\s*(["'`])env\(safe-area-inset-bottom\)\1|pb-\[env\(safe-area-inset-bottom\)\]/,
    why: 'ホームバーの逃げは共通シェルが持っています'
       + '（画面側で書くと `p-*` の下余白にインライン指定が勝って **0px** になり、'
       + 'ノッチの無い端末では下の余白がただ消えます）。'
       + '外枠は `<PageShell>` を使ってください',
    // 画面 (pages / contexts) だけに当てる。シェル・下タブはここが本体
    only: (rel) => /^client(-daily|-equipment|-techops)?\/src\/(pages|contexts)\//.test(rel),
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
  // Wiki は新規アプリなので最初から共通の土台（base.css・shared の content）に載せる
  const apps = ['client', 'client-daily', 'client-equipment', 'client-wiki'];
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
  /*
   * コメントを空白で塗り潰した写し。`codeOnly` の規則だけがこちらを見る
   * (既存の規則の当たり方は変えない — 記録がずれるとレビューが読めなくなる)。
   * 読み違えて `null` が返ったときは元の行に戻す = 多めに報告する側に倒す。
   */
  const blanked = blankComments(text);
  const codeLines = blanked ? blanked.split('\n') : lines;
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
      // `codeOnly` の規則は「コメントを塗り潰した写し」に当てる。
      // 報告に出す文字列は元の行のまま (読む人には元の行が見えないと直せない)
      const target = rule.codeOnly ? codeLines[i] : line;
      if (!rule.re.test(target)) continue;
      if (rule.extra && !rule.extra(target, block)) continue;
      findings.push({ rel, line: i + 1, id: rule.id, why: rule.why, text: line.trim().slice(0, 120) });
    }
  });

  /*
   * ── 画面が `<PageShell>` を使っているか（行ではなくファイル単位）────
   *
   * 幅トークンの列挙（`page-width-by-hand`）だけでは
   * 「本文の幅と余白は `<PageShell>` から来る」という決まりを守らせられない。
   * `max-w-2xl` でも `max-w-[900px]` でも `px-8` でも、幅を書かなくても
   * 素通りする — **どれも今回直した「画面ごとに左端が動く」を作り直せる書き方**
   * （Codex レビュー #647 の指摘）。
   *
   * ⚠️ **当てるのは制作技術支援だけ。** 33 画面のうち 26 画面が
   * すでに `<PageShell>` に載っており、残り 7 つ（ログイン・編集・本番3画面・
   * 公開音声・テロップCG の出力）は**共通シェルの外にある画面**として
   * 意図的に対象外にしたもの。ここは記録に入れて「増えたら止める」。
   *
   * 案件管理・日常業務・機材管理（79 画面）は 1 つも載っていない。
   * ここへ広げるかは**アプリを跨ぐ決めごと**なので、当てない
   * （`missing-font-weight` を凍結アプリに当てないのと同じ考え方 —
   * 直せない違反を並べると検査ごと無視される）。
   */
  /*
   * ⚠️ **文字列として `PageShell` が出てくるかで見てはいけない**
   * （最初そう書いて Codex に指摘された）。`// TODO: PageShell に移す` と
   * 書いただけの画面が通ってしまい、**この決まりが防ぎたかった手書きの外枠**が
   * そのまま残る。**コメントを塗り潰した写しの中に、部品として置かれているか**を見る。
   * 行末で終わる `<PageShell` も拾う（属性を次の行に書く形。`page-h1-by-hand` と同じ）。
   */
  /*
   * ⚠️ **文字列の中身も消した写しで見る。** `blankComments()` は既定で
   * 文字列を残す（`'/*'` という値でファイルの残りがコメント扱いになるのを避けるため）
   * が、そのままだと `const example = '<PageShell>';` と書いた画面が
   * 「部品を置いた」と読まれて通ってしまう（Codex が実際に再現して指摘・#647）。
   * ここは**置いてあるか**を見たいので、文字列も潰した写しを別に作る。
   * テンプレートの `${…}` はコードなので潰さない。
   */
  const code = blankComments(text, { strings: true });
  const usesPageShell = /<PageShell(?=[\s>/]|$)/m.test(code ?? text);
  if (/^client-techops\/src\/pages\//.test(rel) && /Page\.tsx$/.test(rel) && !usesPageShell) {
    findings.push({
      rel,
      line: 1,
      id: 'page-shell-missing',
      why: '画面の外枠は `<PageShell>` から出します'
         + '（`shared/src/client/ui/pageShell.tsx`。幅と余白を画面ごとに書くと'
         + '画面を移るたび本文の左端が動きます。共通シェルの外に出す画面は'
         + '記録に入れてください）',
      text: rel.split('/').pop(),
    });
  }
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
      "client-techops": 11
    },
    "col-width-by-hand": {
      "client": 17,
      "client-equipment": 6,
      "client-techops": 9
    },
    "control-height": {
      "client": 7,
      "client-equipment": 2
    },
    "date-range-by-hand": {
      "client": 7,
      "client-daily": 1
    },
    "empty-by-hand": {
      "client": 4,
      "client-techops": 1,
      "shared": 2
    },
    "grow-column-min-w0": {
      "client": 1,
      "client-equipment": 2,
      "client-techops": 5,
      "shared": 1
    },
    "missing-font-weight": {
      "client": 124
    },
    "money-by-hand": {
      "client": 3,
      "client-equipment": 1
    },
    "page-h1-by-hand": {
      "client": 13,
      "client-techops": 5
    },
    "page-shell-missing": {
      "client-techops": 7
    },
    "page-title-by-hand": {
      "client": 4,
      "shared": 1
    },
    "page-width-by-hand": {
      "client": 3,
      "client-equipment": 1,
      "client-techops": 1
    },
    "raw-palette": {
      "client": 89,
      "client-daily": 3,
      "client-equipment": 48,
      "client-techops": 146,
      "shared": 6
    },
    "stat-size-by-hand": {
      "client": 1
    },
    "translucent-text": {
      "client": 13,
      "client-daily": 1,
      "client-equipment": 5,
      "client-techops": 20,
      "shared": 5
    },
    "wago-verb-wording": {
      "client": 323,
      "client-awards": 6,
      "client-daily": 87,
      "client-equipment": 45,
      "client-live": 4,
      "client-techops": 171,
      "client-wiki": 28,
      "shared": 4
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
