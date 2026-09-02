/**
 * 見積の明細3点セット — **並べ替え・単位・グループ内価格の定価表記**
 *
 * ── なぜ試験にするのか ──────────────────────────────────────
 *
 * この3つはどれも**画面を見ても壊れたことに気づけない**形の不具合になりうる:
 *
 * ・並べ替え: サーバーは配列順を `sort_order` として書くだけなので、
 *   画面が送る配列の順そのものが壊れていれば静かに違う順で保存される
 * ・定価の表記: `list_unit_price` を金額計算（`amount`・`estimates.subtotal`・
 *   売上変換）に混ぜてしまうと、**紙の合計と実際の請求額が食い違う**のに
 *   保存も見積書の発行もエラーにならない（「それらしい数字」が出るだけ）
 * ・PDF の値引き行: 手動値引き（`estimates.discount`＝「お値引き」）と
 *   グループ価格の値引きを同じラベルで出すと、お客様にはどちらの値引きか
 *   区別が付かない
 *
 * `estimateVersioning.test.ts` / `estimateIntegrity.test.ts` / `moneyDouble.test.ts`
 * と同じ形式（DB を使わず、ソースの構造を正規表現で固定する）に倣う。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');

const ESTIMATE = read('server', 'src', 'contexts', 'sales', 'services', 'estimate.service.ts');
const ESTIMATE_PDF = read('server', 'src', 'contexts', 'sales', 'services', 'estimate-pdf.service.ts');
const PDF = read('server', 'src', 'shared', 'services', 'pdf.service.ts');
const ITEMS = read('client', 'src', 'contexts', 'sales', 'pages', 'projectDetail', 'EstimateItems.tsx');
const ROW = read('client', 'src', 'contexts', 'sales', 'pages', 'projectDetail', 'EstimateItemRow.tsx');
const PICKER = read('client', 'src', 'contexts', 'finance', 'components', 'PricingItemPicker.tsx');
const SUBTOTAL = read('client', 'src', 'contexts', 'sales', 'pages', 'projectDetail', 'EstimateCategorySubtotal.tsx');

describe('見積の明細 — 並べ替え（@dnd-kit）', () => {
  it('サーバー側は既に配列順を sort_order として書く（並べ替えのために変えていない）', () => {
    const at = ESTIMATE.indexOf('async replaceItems');
    const body = ESTIMATE.slice(at, ESTIMATE.indexOf('\n  },', at));
    expect(body).toMatch(/let order = 0;/);
    expect(body).toMatch(/for \(const it of items\)/);
    // sort_order は「渡された配列の何番目か」で決まる。画面が送った並びがそのまま保存順
    expect(body).toMatch(/order\+\+\]/);
  });

  it('画面はドラッグの並び替えを @dnd-kit で行い、別カテゴリへは越境させない', () => {
    expect(ITEMS).toMatch(/from '@dnd-kit\/core'/);
    expect(ITEMS).toMatch(/from '@dnd-kit\/sortable'/);
    expect(ITEMS).toMatch(/const handleDragEnd = \(event: DragEndEvent\) => \{/);
    // カテゴリが違う行の上に落としたら何もしない（帯をまたいだ並べ替えはしない）
    expect(ITEMS).toMatch(
      /if \(\(prev\[oldIndex\]\?\.category \?\? 'other'\) !== \(prev\[newIndex\]\?\.category \?\? 'other'\)\) return prev;/,
    );
    expect(ITEMS).toMatch(/return arrayMove\(prev, oldIndex, newIndex\);/);
  });

  it('行のドラッグハンドルは 44px タップ領域を持つ共通 Button（GripVertical）を使う', () => {
    expect(ROW).toMatch(/GripVertical/);
    // `Button` はモバイルで `data-ui='button'` 経由 44px が保証される（shared/CLAUDE.md）。
    // 生の <button> にしていないことを見る
    expect(ROW).toMatch(/<Button\s*\n?\s*\{\.\.\.attributes\} \{\.\.\.listeners\}/);
    // 編集できない（送付済み・閲覧のみ）ときはハンドルごと出さない
    expect(ROW).toMatch(/useSortable\(\{ id, disabled: locked \}\)/);
  });
});

describe('見積の明細 — 数量の単位（unit）', () => {
  it('画面に単位の入力欄がある（自由入力＋よく使う候補）', () => {
    expect(ITEMS).toMatch(/const UNIT_OPTIONS = \['人', '時間', '日', '式'\];/);
    expect(ROW).toMatch(/list="estimate-item-units"/);
    expect(ROW).toMatch(/onUpdate\(i, \{ unit: e\.target\.value \|\| null \}\)/);
  });

  it('見積書 PDF の SELECT が unit を読み、数量セルに続けて出す', () => {
    expect(ESTIMATE_PDF).toMatch(/SELECT description, quantity, unit, unit_price, list_unit_price, amount/);
    expect(ESTIMATE_PDF).toMatch(/unit:\s+\(it\.unit as string \| null\) \?\? null,/);
    // pdf.service 側は汎用の道具なので、渡された unit をそのまま数量に続けて出すだけ
    expect(PDF).toMatch(/it\.unit \? ` \$\{it\.unit\}` : ''/);
    // revenues 側（請求書・検収書）は unit を渡さなくても壊れない（任意フィールド）
    expect(PDF).toMatch(/unit\?:\s*string \| null;/);
  });
});

describe('見積の明細 — グループ内価格でも定価を表記する（migration 261）', () => {
  it('estimate_items.list_unit_price を migration 261 で足している', () => {
    const migration = read('server', 'src', 'shared', 'db', 'migrations', '261_estimate_item_list_price.sql');
    expect(migration).toMatch(/ALTER TABLE estimate_items ADD COLUMN IF NOT EXISTS list_unit_price INTEGER;/);
  });

  it('getById・版のコピー・明細の保存の3か所すべてが list_unit_price を運ぶ', () => {
    // ① 読み出し
    expect(ESTIMATE).toMatch(
      /SELECT id, description, quantity, unit, unit_price, list_unit_price, amount, cost, category,/,
    );
    // ② createNextVersion（前の版から次の版へ明細をコピーする INSERT ... SELECT）
    const nextAt = ESTIMATE.indexOf('async createNextVersion');
    const nextBody = ESTIMATE.slice(nextAt, ESTIMATE.indexOf('async update(', nextAt));
    expect(nextBody).toMatch(/unit_price,\s*\n\s*list_unit_price, amount, cost, category, pricing_item_id/);
    expect(nextBody).toMatch(/SELECT \$1, \$2, description, quantity, unit, unit_price, list_unit_price, amount/);
    // ③ replaceItems（画面からの一括保存）
    const replaceAt = ESTIMATE.indexOf('async replaceItems');
    const replaceBody = ESTIMATE.slice(replaceAt, ESTIMATE.indexOf('\n  },', replaceAt));
    expect(replaceBody).toMatch(/list_unit_price, amount, cost, category, item_notes/);
    expect(replaceBody).toMatch(
      /const listPrice = it\.list_unit_price != null \? Math\.round\(Number\(it\.list_unit_price\)\) : null;/,
    );
  });

  it('⚠️ 金額計算（convertToRevenue の明細 SELECT）には list_unit_price を混ぜていない', () => {
    // 表示・PDF 印字専用の列。売上変換の SELECT は unit_price（実額）だけを読む
    // （仕様変更 #14/#19 で item_date/item_date_end の to_char() 列が増えたため、
    // sort_order の直後に改行が来る前提を外し、SELECT 句の中身だけを見る）
    const at = ESTIMATE.indexOf('async convertToRevenue(');
    const body = ESTIMATE.slice(at, ESTIMATE.indexOf('\n};', at));
    expect(body).toMatch(
      /SELECT description, quantity, unit_price, amount, category, pricing_item_id, item_notes, sort_order,/,
    );
    expect(body).toMatch(/FROM estimate_items WHERE estimate_id = \$1/);
    expect(body).not.toMatch(/list_unit_price/);
  });

  it('画面: カタログから追加した行だけ定価を保存し、単価欄の近くに「定価／値引き」を出す', () => {
    expect(ITEMS).toMatch(/list_unit_price: picked\.list_unit_price,/);
    expect(ROW).toMatch(/it\.list_unit_price != null && it\.list_unit_price > it\.unit_price/);
    expect(ROW).toMatch(/<span>定価<\/span>/);
    expect(ROW).toMatch(/<span>／値引き<\/span>/);
    // **内部/外部を問わず出す** — customerType による出し分けが無いことを見る
    // （note を出す条件式のすぐ外側に customerType の分岐が無いか、周辺だけ見る）
    const noteAt = ROW.indexOf('it.list_unit_price != null && it.list_unit_price > it.unit_price');
    const around = ROW.slice(Math.max(0, noteAt - 300), noteAt);
    expect(around).not.toMatch(/customerType/);
  });

  it('PricingItemPicker は選んだ額（pickPrice）とは別に、生の定価も渡す', () => {
    expect(PICKER).toMatch(/list_unit_price: number \| null;/);
    // group_price を選んでいても（internal）、渡す定価は pickPrice() を通さない生の unit_price
    expect(PICKER).toMatch(/list_unit_price: it\.unit_price \?\? null,/);
  });

  it('見積書 PDF: 定価×数量で印字し、差額は「グループ価格による値引き」を**分類ごとに**1行ずつ出す', () => {
    // ⚠️ 全分類を1本に合算するスカラー（旧 `groupDiscountTotal`）に戻さないこと。
    // 戻すと値引きが「値引き」という独立した帯へ落ち、スタジオ・技術・人員などの
    // カテゴリ小計が**定価の合計のまま**紙に出る（お客様が分類ごとの実額を読めない）
    expect(ESTIMATE_PDF).not.toMatch(/groupDiscountTotal/);
    expect(ESTIMATE_PDF).toMatch(/const groupDiscountByCategory = new Map<string \| null, number>\(\);/);
    expect(ESTIMATE_PDF).toMatch(/const showListPrice = listUnitPrice != null && listUnitPrice > unitPrice;/);
    expect(ESTIMATE_PDF).toMatch(/\(groupDiscountByCategory\.get\(category\) \?\? 0\) \+ \(listUnitPrice - unitPrice\) \* qty/);
    expect(ESTIMATE_PDF).toMatch(/for \(const \[category, amount\] of groupDiscountByCategory\) \{/);
    expect(ESTIMATE_PDF).toMatch(/description: 'グループ価格による値引き'/);
    // 分類は**元の分類のまま**戻す（'値引き' という別の帯へ逃がさない）ので、
    // `pdf.service.ts` のカテゴリ小計が「値引き後の額」になる
    const at = ESTIMATE_PDF.indexOf("description: 'グループ価格による値引き'");
    expect(ESTIMATE_PDF.slice(at, at + 260)).toMatch(/period_end: null, item_notes: null, category,/);
    // 見積全体の値引き（お値引き）は今までどおりラベルも帯も別（共存する）
    expect(ESTIMATE_PDF).toMatch(/description: 'お値引き'/);
    expect(ESTIMATE_PDF).toMatch(/period_start: null, period_end: null, item_notes: null, category: '値引き',/);
    expect(ESTIMATE_PDF).toMatch(/if \(discount > 0\) \{/);
  });
});

describe('見積の明細 — 定価の編集はグループ内案件で決まる（GPM ではない）', () => {
  /**
   * ⚠️ v4.5.19 は「グループ内案件」を「プロジェクト管理(GPM)」と取り違え、
   * `allowListPriceEdit` / `allowCategoryDiscount` を GPM の見積タブからしか
   * 渡していなかった。その結果、ユーザーが実際に使う**案件管理の見積タブでは
   * 定価の編集欄もカテゴリ値引きのボタンも1つも出ない**状態だった。
   * 正しい定義は `projects.customer_type === 'internal'`
   * （取引先マスター `companies.is_gmo_group` から保存のたびに導く）。
   */
  it('既定は customer_type から決め、prop は明示的な上書きに留める', () => {
    expect(ITEMS).toMatch(/const listPriceEditable = allowListPriceEdit \?\? customerType === 'internal';/);
    expect(ITEMS).toMatch(/const categoryDiscountEnabled = allowCategoryDiscount \?\? customerType === 'internal';/);
    // 行と「値引き行を追加」ボタンは導出した値を見る（prop を直接見ない）
    expect(ITEMS).toMatch(/allowListPriceEdit=\{listPriceEditable\}/);
    expect(ITEMS).toMatch(/\{categoryDiscountEnabled && \(/);
  });

  it('案件管理の見積タブは案件の customer_type を明細へ渡している', () => {
    const TAB = read('client', 'src', 'contexts', 'sales', 'pages', 'projectDetail', 'EstimateTab.tsx');
    expect(TAB).toMatch(/customer_type: project\.customer_type/);
  });
});

describe('見積の明細 — カテゴリ小計は「定価小計 / 値引き / 小計」', () => {
  it('集計は足し算だけ（按分・割り算をしない）ので、分けても合計が1円もずれない', () => {
    expect(SUBTOTAL).toMatch(/export function categoryTotals/);
    expect(SUBTOTAL).toMatch(/return \{ list, net, discount: list - net \};/);
    // 手で足した値引き行（単価がマイナス）を定価側に積まない
    expect(SUBTOTAL).toMatch(/list \+= Math\.max\(0, qty \* Math\.round\(listUnit\)\);/);
    expect(SUBTOTAL).not.toMatch(/\* 0\.|\/ 100|Math\.floor/);
  });

  it('値引きが無い帯は今までどおり「小計（◯◯）」の1行だけ', () => {
    expect(SUBTOTAL).toMatch(/\{t\.discount > 0 && \(/);
    expect(SUBTOTAL).toMatch(/定価小計（\$\{label\}）/);
  });
});

describe('見積の明細 — 行の備考は改行できる（入力欄が textarea）', () => {
  /**
   * `<input>` は仕様上 CR/LF を保持できないので、備考が1行に潰れる。
   * DB は TEXT・PDF（pdfkit）は LF をそのまま改行として描くため、
   * **入力欄を textarea にするだけで見積書・検収書・請求書に改行が出る**。
   * 売上明細（`RevenueItemsTable.tsx` など）は先に textarea になっていた。
   */
  it('見積明細の備考は Textarea（auto-grow）で、直せないときは改行を保った素のテキスト', () => {
    const at = ROW.indexOf('aria-label="この行の備考"');
    expect(at).toBeGreaterThan(0);
    expect(ROW.slice(Math.max(0, at - 400), at)).toMatch(/<Textarea/);
    // 共通 Textarea の既定 min-h-[80px] を打ち消さないと明細の全行が80pxになる
    expect(ROW).toMatch(/min-h-0/);
    // 送付済み・閲覧のみのときは <input> ではなく改行を保つテキストで出す
    expect(ROW).toMatch(/whitespace-pre-wrap break-words/);
  });

  it('売上明細の備考も textarea のまま（退行防止）', () => {
    const REV = read('client', 'src', 'contexts', 'finance', 'pages', 'ledger', 'RevenueItemsTable.tsx');
    expect(REV).toMatch(/<Textarea/);
    expect(REV).toMatch(/item_notes/);
  });
});
