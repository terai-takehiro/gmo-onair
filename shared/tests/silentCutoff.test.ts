/**
 * **黙って切らない**（一覧・合計・BOX・スマホのページ送り）
 *
 * ── なぜ試験にするのか ──────────────────────────────────────
 *
 * この一群は**画面を見ても気づけません**。切れた側には何も出ないからです:
 *
 * ・見積・請求の一覧は 300 件で切っているのに、**画面が並んだ行を数え、
 *   並んだ行を足して**いました。**301 件目からは件数にも合計にも入りません**
 *   （実測: 388 件 47,850,000 円 のところ **300 件 4,136,000 円** と出ていた）。
 *   月末に突き合わせるまで分かりません
 * ・BOX は1回に **100 件**しか返しません。101 個目からのファイル・写真は
 *   **一度も画面に出ていません**。置いた人は「上げたのに無い」と読み、
 *   **同じファイルをもう一度上げます**
 * ・スマホの案件一覧には**前へ／次へがありませんでした**。20 件で切っているので、
 *   **21 件目以降の案件はスマホから開けません**（続きがあることも出ていない）
 * ・打合せの録音は「最後に動いた 50 件」を手元で絞っていました。
 *   **51 件目の案件は名前を打っても出てきません**
 *
 * v4 の PR で指摘された形です（#53 / #51 / #61 / #60 / #68）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { collectFolderItems } from '../../server/src/shared/services/box';

const ROOT = join(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');

const BILLING = read('server', 'src', 'contexts', 'sales', 'routes', 'billing.routes.ts');
const BILLING_PAGE = read('client', 'src', 'contexts', 'sales', 'pages', 'BillingListPage.tsx');
const FILES_TAB = read('client', 'src', 'contexts', 'sales', 'pages', 'projectDetail', 'FilesTab.tsx');
const LIST_PAGE = read('client', 'src', 'contexts', 'sales', 'pages', 'ProjectListPage.tsx');
const RECORD = read('client', 'src', 'contexts', 'sales', 'pages', 'MeetingRecordPage.tsx');
const PALETTE = read('client', 'src', 'components', 'layout', 'SearchPalette.tsx');
const TILES = read('client', 'src', 'contexts', 'platform', 'pages', 'home', 'AppTiles.tsx');

/** BOX の返事のふり。`n` 件あるフォルダを、頼まれたぶんだけ返す */
const folderOf = (n: number, opts: { totalCount?: boolean } = {}) =>
  async (limit: number, offset: number) => ({
    entries: Array.from({ length: Math.max(0, Math.min(limit, n - offset)) }, (_, i) => ({
      id: String(offset + i + 1), type: 'file', name: `f${String(offset + i + 1).padStart(4, '0')}.pdf`,
    })),
    ...(opts.totalCount === false ? {} : { total_count: n }),
  });

describe('BOX のフォルダは端まで送って集める', () => {
  it('100 件を超えても全部出す（前の版は1回だけ呼んで 100 件で止まっていた）', async () => {
    const r = await collectFolderItems(folderOf(250));
    expect(r.items).toHaveLength(250);
    expect(r.total).toBe(250);
    expect(r.truncated).toBe(false);
  });

  it('1ページに収まるときは1回で終わる（無駄に叩かない）', async () => {
    let calls = 0;
    const r = await collectFolderItems(async (limit, offset) => {
      calls += 1;
      return folderOf(12)(limit, offset);
    });
    expect(r.items).toHaveLength(12);
    expect(calls).toBe(1);
  });

  it('上限に当たったら `truncated` を立てる（黙って切らない）', async () => {
    const r = await collectFolderItems(folderOf(1200), 600);
    expect(r.items).toHaveLength(600);
    expect(r.total).toBe(1200);
    expect(r.truncated).toBe(true);
  });

  it('総数を返さない応答でも、上限まで取れたら続きがある扱いにする', async () => {
    const r = await collectFolderItems(folderOf(1200, { totalCount: false }), 400);
    expect(r.items).toHaveLength(400);
    expect(r.truncated).toBe(true);
  });

  it('空のフォルダで止まる（無限に送らない）', async () => {
    const r = await collectFolderItems(folderOf(0));
    expect(r.items).toHaveLength(0);
    expect(r.truncated).toBe(false);
  });

  it('フォルダが先・次にファイル（並べ方は今までどおり）', async () => {
    const r = await collectFolderItems(async () => ({
      entries: [
        { id: '1', type: 'file', name: 'あ.pdf' },
        { id: '2', type: 'folder', name: 'ん' },
      ],
      total_count: 2,
    }));
    expect(r.items.map((i) => i.type)).toEqual(['folder', 'file']);
  });
});

describe('見積・請求の件数と合計はサーバーが数える', () => {
  it('絞り込み全体を数える（並んだ行ではない）', () => {
    // 実測: 388 件 47,850,000 円 に対して、前の版の出し方は 300 件 4,136,000 円
    expect(BILLING).toMatch(/const LIST_LIMIT = 300;/);
    expect(BILLING).toMatch(/SELECT COUNT\(\*\) AS n,\s*\n\s*COALESCE\(SUM\(COALESCE\(e\.subtotal, 0\) - COALESCE\(e\.discount, 0\)\), 0\) AS amount/);
    expect(BILLING).toMatch(/SELECT COUNT\(\*\) AS n, COALESCE\(SUM\(r\.amount\), 0\) AS amount/);
    // 切ったことも返す
    expect(BILLING).toMatch(/truncated: Number\(agg\?\.n \?\? 0\) > rows\.length/);
  });

  it('画面は行を数えない・足さない', () => {
    expect(BILLING_PAGE).toMatch(/const server = tab === 'estimate' \? estimates\.data\?\.total_amount : invoices\.data\?\.total_amount;/);
    expect(BILLING_PAGE).toMatch(/const eCount = estimates\.data\?\.total_count \?\? eRows\.length;/);
    // 出していない行があることを書く
    expect(BILLING_PAGE).toMatch(/ほか <span className="font-number">\{hidden\}<\/span> 件/);
  });
});

describe('書類タブ（BOX）', () => {
  it('通信の失敗を「まだ何も入っていません」と言わない', () => {
    // サーバーは BOX の障害を `reason` に載せて 200 で返すが、**サーバーに
    // 届かなかったとき**は `data` が無いだけなので、前の版は空の文言に落ちていた
    expect(FILES_TAB).toMatch(/\) : isError \? \(/);
    expect(FILES_TAB).toMatch(/<ErrorPanel title="中身を読み込めませんでした"/);
  });

  it('フォルダを作ったら中身の鍵も落とす（作った直後に「まだありません」）', () => {
    expect(FILES_TAB).toMatch(/qc\.invalidateQueries\(\{ queryKey: \['box-files'\] \}\)/);
    const gpm = read('client', 'src', 'contexts', 'gpm', 'queries.ts');
    expect(gpm).toMatch(/qc\.invalidateQueries\(\{ queryKey: \['box-files'\] \}\)/);
  });

  it('切ったことを書く', () => {
    expect(FILES_TAB).toMatch(/\{data\?\.truncated && \(/);
  });

  it('古い但し書きを残さない（もう置けるのに「次のバージョンで対応予定」と書いてあった）', () => {
    expect(FILES_TAB).not.toContain('次のバージョンで対応予定');
  });
});

describe('スマホからも 21 件目以降を開ける', () => {
  it('件数とページ送りは PC とスマホで同じ部品', () => {
    // 前の版は PC の一覧の中に直接書いてあり、スマホには1つも無かった。
    // **置き場所は別ファイルに移った**（一覧が 400 行を超えたため）が、
    // 「1つの部品を2か所から使う」という中身は同じ
    const NAV = read('client', 'src', 'contexts', 'sales', 'pages', 'projectList', 'PageNav.tsx');
    expect(NAV).toMatch(/export function PageNav\(\{/);
    const uses = LIST_PAGE.match(/<PageNav/g) ?? [];
    expect(uses.length).toBe(2);
  });
});

describe('打合せの録音で 51 件目の案件を選べる', () => {
  it('絞り込みをサーバーに投げる（手元の 50 件を絞っていた）', () => {
    expect(RECORD).toMatch(/queryKey: \['projects', 'for-record', debounced\]/);
    expect(RECORD).toMatch(/\.\.\.\(debounced \? \{ search: debounced \} : \{\}\)/);
    // サーバーが当てたものを画面がもう一度落とさない
    expect(RECORD).toMatch(/const rows = list\.data \?\? \[\];/);
  });

  /**
   * ⚠️ **手元の絞り込みをやめたら、食い違う瞬間を隠すこと**（この PR のレビューで指摘された）。
   * 打ってから 300ms ＋ 通信のあいだは**前の言葉の一覧**が並びます。
   * そこで選ぶと**録音が別の案件に付きます**（送ったあとは案件名しか出ないので、
   * 気づくのは相手の議事録を読んだときです）。
   */
  it('打った言葉と食い違う一覧を押させない', () => {
    expect(RECORD).toMatch(/const searching = q\.trim\(\) !== debounced \|\| list\.isFetching;/);
    expect(RECORD).toMatch(/\) : list\.isLoading \|\| searching \? \(/);
    // 前の言葉の結果を「そのまま置いておく」形にしない
    expect(RECORD).not.toContain('placeholderData');
  });

  it('「やり取りを開く」がやり取りタブに着く（`log` というタブは無い）', () => {
    expect(RECORD).toMatch(/\/sales\/projects\/\$\{picked\.id\}\/thread/);
    expect(RECORD).not.toContain('/log`');
  });
});

describe('探す窓・トップのタイル', () => {
  it('古い言葉の結果を新しい語の下に出さない', () => {
    // 番号（`seq`）は上書きを止めるだけで、**打ち替えた瞬間には消えない**
    expect(PALETTE).toMatch(/useState<\{ q: string; data: SearchResults \} \| null>\(null\)/);
    expect(PALETTE).toMatch(/const found = results && results\.q === q \? results\.data : null;/);
  });

  it('訊けなかったことを「見つかりませんでした」と言わない', () => {
    expect(PALETTE).toMatch(/いま探せませんでした/);
  });

  it('件数の丸はタイルを開くボタンの中にある（押しても何も起きなかった）', () => {
    const at = TILES.indexOf('onClick={onOpen}');
    const badgeAt = TILES.indexOf('app.badge !== undefined', at);
    const closeAt = TILES.indexOf('</button>', at);
    expect(badgeAt).toBeGreaterThan(at);
    expect(badgeAt).toBeLessThan(closeAt);
  });
});
