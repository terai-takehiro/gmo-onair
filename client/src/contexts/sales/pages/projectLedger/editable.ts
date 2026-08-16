/**
 * セルをその場で直す・貼り付ける — 「何を・どう受け取るか」の規則（案件台帳）
 *
 * **画面の物を1つも import しません**（`csv.ts` と同じ理由 — 試験からそのまま読める）。
 *
 * ── 直せる列を絞っている理由 ────────────────────────────────
 *
 * 直せるのは **`PATCH /projects/bulk` が受ける項目だけ**です。ここに列を足すと、
 * サーバーが知らない列を送ることになり、**押しても何も起きない**か、
 * **黙って捨てられます**（押した人には「直したのに戻っている」としか見えません）。
 *
 * ⚠️ **ステージ・案件名・金額は入れていません**:
 *  ・ステージ … 段を動かすと履歴が1行増え、失注なら理由が要り、受注なら
 *    GLS 発番の確認が挟まります。`bulk` はそのどれもしないので、
 *    ここから変えると**記録の残らない段の移動**になります
 *  ・案件名・金額 … `bulk` が受けません。1件ずつ「直す」画面から
 *
 * ── 貼り付けで名前から id を引くときの決めごと ──────────────
 *
 * Excel から来るのは**文字**です（「山田 太郎」「A社」）。id ではありません。
 * ⚠️ **1つに決まらないものは、当てずっぽうで選ばずに断ります。**
 * 同姓同名の担当・同じ名前の取引先は実際にあり、**間違えても画面には出ません**
 * （別の会社の案件になったことに誰も気づけない）。
 *  ・ちょうど1件に当たる → 通す
 *  ・0 件／2 件以上 → **そのセルだけ断って、理由を出す**
 */

/** その場で直せる列。**`BULK_FIELDS` にある物だけ** */
export const EDITABLE_COLS = [
  'classification', 'event_start', 'event_end',
  'assigned_to_name', 'customer_name', 'application_form',
] as const;

export type EditableCol = (typeof EDITABLE_COLS)[number];

export function isEditable(col: string): col is EditableCol {
  return (EDITABLE_COLS as readonly string[]).includes(col);
}

/** 名前を引くための一覧（利用者・取引先） */
export interface NamedRow { id: string; name: string }

export interface ParseCtx {
  users: NamedRow[];
  customers: NamedRow[];
  /** 分類の札 → 2段の値（`CLASSIFICATION_COMBOS` から呼ぶ側が作る） */
  combos: { label: string; audience: string; category: string }[];
}

export type ParseResult =
  | { ok: true; set: Record<string, unknown>; display: string }
  | { ok: false; why: string };

/** 空欄扱いにする文字（Excel から来る「—」「未定」も拾う） */
const BLANKS = new Set(['', '-', '—', '−', '未定', '入っていません', 'なし']);

/**
 * 比べる前にならす（Excel から来る文字は揺れる）。
 *
 * **空白は全部落とします。** 「山田 太郎」と「山田太郎」、
 * 「有観客 ・ 収録」と「有観客・収録」を別物として断ると、
 * **貼った人には理由が分かりません**（見た目は同じなので）。
 * ⚠️ ならした結果が2件に当たったときは `findOne` が断るので、
 * ゆるくしても**取り違えは起きません**。
 */
function norm(s: string): string {
  // `　` は全角の空白。**素の文字で書かないこと** — 半角と見分けが付かず、
  // `npm run lint`（`no-irregular-whitespace`）も止めます
  return s.replace(/[\u30FB\uFF65]/g, '\u30FB').replace(/[\s\u3000]+/g, '');
}

/** ちょうど1件に当たるものを探す。**2件以上なら決めない** */
function findOne(list: NamedRow[], text: string): { hit?: NamedRow; many: boolean } {
  const t = norm(text);
  const hits = list.filter((x) => norm(x.name) === t);
  if (hits.length === 1) return { hit: hits[0], many: false };
  return { many: hits.length > 1 };
}

/**
 * 貼り付けた1マスの文字を、サーバーへ送る形にする。
 *
 * **空欄にするのは「消してよい」項目だけ**です。`assigned_to` は
 * NOT NULL なので空にできず、`customer_id` を空にすると案件が
 * どのお客様のものでもなくなります — **どちらも断ります**。
 */
export function parseCell(col: EditableCol, raw: string, ctx: ParseCtx): ParseResult {
  const text = norm(raw);
  const blank = BLANKS.has(text);

  switch (col) {
    case 'classification': {
      if (blank) return { ok: false, why: '案件分類は空にできません（分類を書いてください）' };
      const hit = ctx.combos.find((c) => norm(c.label) === text);
      if (!hit) {
        return {
          ok: false,
          why: `「${raw}」は案件分類として読めません（例: ${ctx.combos[0]?.label ?? '有観客 ・ 収録'}）`,
        };
      }
      return {
        ok: true,
        set: { audience: hit.audience, project_category: hit.category },
        display: hit.label,
      };
    }

    case 'event_start':
    case 'event_end': {
      // **空にできる**（実施日は未定に戻すことがある）
      if (blank) return { ok: true, set: { [col]: '' }, display: '（空）' };
      const d = toIsoDate(text);
      if (!d) {
        /*
         * **断る理由を分ける。** 形が違うのか、形は合っているが
         * **その日が存在しない**（`2026-02-31`）のかで、直し方が違います。
         * 「2026-08-15 の形で書いてください」とだけ言われると、
         * すでにその形で書いている人には**何を直せばよいか分かりません**。
         */
        const shaped = /^(\d{4})[-/年.](\d{1,2})[-/月.](\d{1,2})日?$/.test(text);
        return {
          ok: false,
          why: shaped
            ? `「${raw}」はカレンダーに無い日です（その月に無い日付です）`
            : `「${raw}」は日付として読めません（2026-08-15 の形）`,
        };
      }
      return { ok: true, set: { [col]: d }, display: d };
    }

    case 'assigned_to_name': {
      // ⚠️ **空にできない**（`projects.assigned_to` は NOT NULL）
      if (blank) return { ok: false, why: '社内の担当は空にできません' };
      const { hit, many } = findOne(ctx.users, text);
      if (many) return { ok: false, why: `「${raw}」は同じ名前の人が2人以上います（画面から選んでください）` };
      if (!hit) return { ok: false, why: `「${raw}」という利用者がいません` };
      return { ok: true, set: { assigned_to: hit.id }, display: hit.name };
    }

    case 'customer_name': {
      // ⚠️ **空にできない**（お客様の無い案件を作らない）
      if (blank) return { ok: false, why: 'お客様は空にできません' };
      const { hit, many } = findOne(ctx.customers, text);
      if (many) return { ok: false, why: `「${raw}」は同じ名前の取引先が2つ以上あります（画面から選んでください）` };
      if (!hit) return { ok: false, why: `「${raw}」という取引先がありません` };
      return { ok: true, set: { customer_id: hit.id }, display: hit.name };
    }

    case 'application_form': {
      if (['あり', 'ある', '有', '○', 'o', 'yes', 'true', '1'].includes(text.toLowerCase())) {
        return { ok: true, set: { application_form: true }, display: 'あり' };
      }
      if (['なし', 'ない', '無', '×', 'x', 'no', 'false', '0', ''].includes(text.toLowerCase())) {
        return { ok: true, set: { application_form: false }, display: 'なし' };
      }
      return { ok: false, why: `「${raw}」は申込書の有無として読めません（あり／なし）` };
    }

    default:
      return { ok: false, why: 'この列は直せません' };
  }
}

/** 閏年か。**4 で割れて 100 で割れない、または 400 で割れる** */
function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** その月が何日あるか。**`new Date()` を使わない**（下の理由と同じ） */
function daysInMonth(year: number, month: number): number {
  const days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month === 2 && isLeapYear(year)) return 29;
  return days[month - 1];
}

/**
 * 日付をならす。**「2026/8/5」も「2026-08-05」も受ける**（Excel から来る形は揺れる）。
 * ⚠️ **`new Date()` に投げない** — 環境の時間帯で1日ずれます。
 *
 * ⚠️ **その月に本当にある日かまで見ます**（レビューでの指摘 #135）。
 * 前の版は「月が 1〜12・日が 1〜31」しか見ていなかったので、
 * **`2026-02-31` や `2026-04-31` が通り**、下見にも正しい日付として並んで、
 * そのまま実施日の列（TEXT）に入っていました。**入ってしまうと画面からは
 * 普通の日付に見えます** — 標準工程の逆算・実施日順の並びだけが静かに狂います。
 */
export function toIsoDate(text: string): string | null {
  const m = text.match(/^(\d{4})[-/年.](\d{1,2})[-/月.](\d{1,2})日?$/);
  if (!m) return null;
  const [, y, mo, d] = m;
  const yy = Number(y);
  const mm = Number(mo);
  const dd = Number(d);
  if (mm < 1 || mm > 12) return null;
  if (dd < 1 || dd > daysInMonth(yy, mm)) return null;
  return `${y}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

// ───────────────────────────────────────────────────────
// コピー・貼り付けの文字（タブ区切り＝Excel と同じ形）
// ───────────────────────────────────────────────────────

/**
 * 貼り付けられた文字を升目にほどく。**Excel はタブ区切り・改行で行**。
 * ⚠️ **末尾の空行を落とす** — Excel は最後に改行を付けるので、
 * 落とさないと**最後の行が空文字で上書き**されます。
 */
export function parseClipboardGrid(text: string): string[][] {
  const rows = text.replace(/\r\n?/g, '\n').split('\n');
  while (rows.length > 1 && rows[rows.length - 1] === '') rows.pop();
  return rows.map((r) => r.split('\t'));
}

/**
 * 選んだ範囲をコピーする文字にする。**タブ区切り**（Excel にそのまま貼れる）。
 * ⚠️ **中身にタブや改行が入っていたら空白に置き換える** — 入れたまま出すと
 * **貼った先で升目がずれます**（1件の案件名が2列に分かれる）。
 */
export function toClipboardText(grid: string[][]): string {
  return grid.map((r) => r.map((c) => c.replace(/[\t\r\n]+/g, ' ')).join('\t')).join('\n');
}

// ───────────────────────────────────────────────────────
// 升目の範囲
// ───────────────────────────────────────────────────────

export interface CellRef { row: number; col: number }

export interface CellRange { r1: number; c1: number; r2: number; c2: number }

/** 2点から長方形を作る（どちらから掴んでも同じ範囲になる） */
export function rangeOf(a: CellRef, b: CellRef): CellRange {
  return {
    r1: Math.min(a.row, b.row), r2: Math.max(a.row, b.row),
    c1: Math.min(a.col, b.col), c2: Math.max(a.col, b.col),
  };
}

export function inRange(r: CellRange | null, row: number, col: number): boolean {
  if (!r) return false;
  return row >= r.r1 && row <= r.r2 && col >= r.c1 && col <= r.c2;
}

export function rangeSize(r: CellRange): number {
  return (r.r2 - r.r1 + 1) * (r.c2 - r.c1 + 1);
}

/**
 * 貼り付けた升目が**表からどれだけはみ出すか**（レビューでの指摘 #135）。
 *
 * 捨てること自体は正しい（無い行・無い列には書けない）のですが、
 * **黙って捨てると「入ったつもり」になります** — 95 行目に 20 行貼ると
 * 残りの数行しか入らないのに、下見には入るぶんだけが並びます。
 *
 * **はみ出しが無ければ `null`**（呼ぶ側が「出すものが無い」と分かる形）。
 */
export function outOfBoundsOf(
  grid: string[][], anchor: CellRef, rowCount: number, colCount: number,
): { rows: number; cols: number } | null {
  const rows = Math.max(0, grid.length - (rowCount - anchor.row));
  // **いちばん長い行で見る。** Excel から来る行は長さが揃っていないことがある
  const widest = grid.reduce((n, line) => Math.max(n, line.length), 0);
  const cols = Math.max(0, widest - (colCount - anchor.col));
  return rows > 0 || cols > 0 ? { rows, cols } : null;
}

/**
 * 一度に貼り付けられる升目の数。
 *
 * **黙って切らない**（呼ぶ側が「N 升は多すぎます」と出す）。多すぎる貼り付けは
 * たいてい**貼る場所を間違えている**ので、通すより止めたほうが安全です。
 */
export const PASTE_MAX_CELLS = 500;
