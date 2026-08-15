/**
 * 支払期日の逆算（お金のルール ⑤）
 *
 * ── なぜ shared に置くか ────────────────────────────────────
 *
 * 日付の計算は**画面でも先に見せます**（「この計上日なら期日は 8/31 です」）。
 * サーバーと画面で別々に書くと、画面が出した日と保存された日が食い違います。
 * ここは純粋な計算だけなので、Vitest でそのまま試せます。
 *
 * ── 「31日」は末日のこと ────────────────────────────────────
 *
 * 締め日・支払日は 1〜31 で持ちますが、**その月に無い日は月末に丸めます**。
 * 「31日締め」と書いて 2 月だけ締めが消える、を防ぐためです。
 * 逆に「30日締め」と決めた会社の 2 月は 28（29）日になります — これも
 * 実務どおりで、月をまたいで 3/2 に飛ばすほうが間違いです。
 */

/** その年月の日数（month は 1〜12） */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** `YYYY-MM-DD` を年・月・日に。時刻や TZ を持ち込まない（1日ずれるので） */
function parseYmd(s: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

function ymd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * 支払日が休業日に当たったときの寄せ方（設定「支払日が休業日のとき」）。
 * `none` は寄せない（そのままの日付を使う）。
 */
export type HolidayShift = 'before' | 'after' | 'none';

export interface DueDateRule {
  /** 締め日 1〜31（31 = 末日） */
  closingDay: number;
  /** 締め月の何か月後に払ってもらうか。0 = 締めた月のうち */
  paymentMonths: number;
  /** 支払日 1〜31（31 = 末日） */
  paymentDay: number;
}

/**
 * 計上日 → 締め日。
 *
 * 計上日が締め日より後なら**翌月の締め**になります
 * （20日締めの会社に 25日 の売上を立てたら、締まるのは翌月20日）。
 */
export function closingDateOf(recognitionDate: string, closingDay: number): string | null {
  const p = parseYmd(recognitionDate);
  if (!p) return null;
  const cap = (y: number, m: number) => Math.min(closingDay, daysInMonth(y, m));

  if (p.d <= cap(p.y, p.m)) return ymd(p.y, p.m, cap(p.y, p.m));
  const nm = p.m === 12 ? 1 : p.m + 1;
  const ny = p.m === 12 ? p.y + 1 : p.y;
  return ymd(ny, nm, cap(ny, nm));
}

/** 1日ずらす（`YYYY-MM-DD` のまま。時刻を持ち込まない） */
function addDay(s: string, delta: number): string {
  const p = parseYmd(s)!;
  const d = new Date(Date.UTC(p.y, p.m - 1, p.d + delta));
  return ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/**
 * 休業日に当たった支払期日を、営業日へ寄せる。
 *
 * ⚠️ **設定はあるのに、どこも読んでいませんでした**（レビューでの指摘 #63）。
 * 「支払日が休業日のとき → 前の営業日へ」を選んでも**日曜のままの期日**が入り、
 * しかも隣の欄には「休業日のときの寄せ方は下で決めます」と書いてあります
 * （設定したのに効かない、いちばん気づけない形）。
 *
 * **休業日かどうかは呼ぶ側が渡します**（`isClosed`）。ここは純粋な計算だけに
 * しておかないと、画面の下見（`/money-rules/preview`）と保存で別の道になります。
 *
 * **60 日で打ち切ります。** 表の入れ方を間違えて「全部休業日」になっても
 * 無限に回らないようにするためで、そのときは**寄せずに元の日を返します**
 * （日付が入らないより、寄っていない日付のほうが直せる）。
 */
export function shiftForHoliday(
  date: string,
  shift: HolidayShift,
  isClosed: (ymd: string) => boolean,
): string {
  if (shift === 'none') return date;
  const step = shift === 'before' ? -1 : 1;
  let d = date;
  for (let i = 0; i < 60; i += 1) {
    if (!isClosed(d)) return d;
    d = addDay(d, step);
  }
  return date;
}

/**
 * 計上日 → 支払期日。読めない日付は `null`（**推測で日付を作らない** —
 * 間違った期日が入ると「遅れている」の一覧が狂う）。
 *
 * `opts` を渡すと、休業日に当たった期日を営業日へ寄せます。
 * **渡さなければ今までどおり**（寄せない）。
 */
export function dueDateOf(
  recognitionDate: string,
  rule: DueDateRule,
  opts?: { shift?: HolidayShift; isClosed?: (ymd: string) => boolean },
): string | null {
  const closing = closingDateOf(recognitionDate, rule.closingDay);
  if (!closing) return null;
  const c = parseYmd(closing)!;

  const total = c.m - 1 + rule.paymentMonths;
  const y = c.y + Math.floor(total / 12);
  const m = (total % 12) + 1;
  const due = ymd(y, m, Math.min(rule.paymentDay, daysInMonth(y, m)));
  if (!opts?.shift || !opts.isClosed) return due;
  return shiftForHoliday(due, opts.shift, opts.isClosed);
}

/**
 * 会社のルールに取引先の例外を重ねる。
 *
 * **項目ごとに重ねます。** 「支払日だけ 20 日」の取引先に、締め日まで
 * 例外を持たせる必要はありません。`null` / `undefined` は「決めていない」。
 */
export function mergeRule(company: DueDateRule, exception?: Partial<DueDateRule> | null): DueDateRule {
  return {
    closingDay: exception?.closingDay ?? company.closingDay,
    paymentMonths: exception?.paymentMonths ?? company.paymentMonths,
    paymentDay: exception?.paymentDay ?? company.paymentDay,
  };
}

/** 「月末締め ・ 翌月末払い」のような読める文。画面と設定の両方で使う */
export function describeRule(rule: DueDateRule): string {
  const day = (d: number) => (d === 31 ? '末日' : `${d}日`);
  const months = rule.paymentMonths === 0 ? '当月' : rule.paymentMonths === 1 ? '翌月' : `${rule.paymentMonths}か月後`;
  return `${day(rule.closingDay)}締め ・ ${months}${day(rule.paymentDay)}`;
}
