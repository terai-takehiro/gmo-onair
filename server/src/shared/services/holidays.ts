/**
 * 日本の祝日（休日・営業時間 ⑥）
 *
 * ── なぜ表に持たず計算するのか ──────────────────────────────
 *
 * 祝日は年 16 日あり、手で入れると**毎年 16 件の入力作業**になります。
 * かといって外の API を見に行くと、**通信できないときに予約画面が止まります**。
 * そこで計算して**表に書き出しておく**形にしました（起動時ではなく migration で
 * 1 度だけ。あとから 1 件ずつ直せます）。
 *
 * ── 春分・秋分は「予測」だと分かるようにする ────────────────
 *
 * 春分の日・秋分の日は天体の位置で決まり、**政府が前年 2 月に正式に公示するまで
 * 確定しません**。ここで使う式は 1980〜2099 で実績と一致する近似ですが、
 * **予測であることに変わりはありません**。画面にもそう出して、
 * 公示に合わせて直せるようにしてあります。
 *
 * ── 振替休日と国民の休日 ────────────────────────────────────
 *
 * どちらも「祝日そのもの」ではなく祝日の並びから生まれる休みなので、
 * 祝日を並べ終えたあとに足します。順番を逆にすると
 * **振替休日が別の祝日と重なったときに二重に出ます**。
 */

export interface Holiday {
  /** `YYYY-MM-DD` */
  date: string;
  name: string;
  /** 春分・秋分（およびその振替）は予測。公示に合わせて直せるように印を持つ */
  estimated: boolean;
}

const ymd = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** 0=日 … 6=土 */
function dow(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** その月の n 番目の月曜 */
function nthMonday(y: number, m: number, n: number): string {
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  // 月曜(1)までの距離。日曜(0)なら 1 日後
  const offset = (8 - first) % 7;
  return ymd(y, m, 1 + offset + (n - 1) * 7);
}

/**
 * 春分の日 / 秋分の日（1980〜2099 の近似式）。
 * **範囲外は返さない** — 当たらない値を返すより「無い」ほうが安全。
 */
function equinox(y: number, kind: 'spring' | 'autumn'): number | null {
  if (y < 1980 || y > 2099) return null;
  const base = kind === 'spring' ? 20.8431 : 23.2488;
  return Math.floor(base + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));
}

/** その年の祝日（振替休日・国民の休日を含む）を日付順に */
export function holidaysOf(y: number): Holiday[] {
  const fixed: Holiday[] = [
    { date: ymd(y, 1, 1), name: '元日', estimated: false },
    { date: nthMonday(y, 1, 2), name: '成人の日', estimated: false },
    { date: ymd(y, 2, 11), name: '建国記念の日', estimated: false },
    { date: ymd(y, 2, 23), name: '天皇誕生日', estimated: false },
    { date: ymd(y, 4, 29), name: '昭和の日', estimated: false },
    { date: ymd(y, 5, 3), name: '憲法記念日', estimated: false },
    { date: ymd(y, 5, 4), name: 'みどりの日', estimated: false },
    { date: ymd(y, 5, 5), name: 'こどもの日', estimated: false },
    { date: nthMonday(y, 7, 3), name: '海の日', estimated: false },
    { date: ymd(y, 8, 11), name: '山の日', estimated: false },
    { date: nthMonday(y, 9, 3), name: '敬老の日', estimated: false },
    { date: nthMonday(y, 10, 2), name: 'スポーツの日', estimated: false },
    { date: ymd(y, 11, 3), name: '文化の日', estimated: false },
    { date: ymd(y, 11, 23), name: '勤労感謝の日', estimated: false },
  ];

  const sp = equinox(y, 'spring');
  if (sp) fixed.push({ date: ymd(y, 3, sp), name: '春分の日', estimated: true });
  const au = equinox(y, 'autumn');
  if (au) fixed.push({ date: ymd(y, 9, au), name: '秋分の日', estimated: true });

  fixed.sort((a, b) => a.date.localeCompare(b.date));
  const set = new Set(fixed.map((h) => h.date));
  const out = [...fixed];

  // ── 振替休日 ──────────────────────────────────────────────
  // 日曜に当たった祝日の**次の平日**。すでに祝日の日は飛ばす
  // （5/3 が日曜なら振替は 5/6。5/4・5/5 も祝日なので）
  for (const h of fixed) {
    if (dow(h.date) !== 0) continue;
    let d = addDays(h.date, 1);
    while (set.has(d)) d = addDays(d, 1);
    if (!set.has(d)) {
      set.add(d);
      out.push({ date: d, name: '振替休日', estimated: h.estimated });
    }
  }

  // ── 国民の休日 ────────────────────────────────────────────
  // 祝日に挟まれた平日。**敬老の日と秋分の日の間**でしか起きない
  for (const h of fixed) {
    const mid = addDays(h.date, 1);
    const next = addDays(h.date, 2);
    if (set.has(mid) || !set.has(next)) continue;
    if (dow(mid) === 0 || dow(mid) === 6) continue; // 土日は元々休みなので作らない
    set.add(mid);
    out.push({ date: mid, name: '国民の休日', estimated: true });
  }

  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** 年をまたいで並べる（migration の書き出し用） */
export function holidaysBetween(fromYear: number, toYear: number): Holiday[] {
  const out: Holiday[] = [];
  for (let y = fromYear; y <= toYear; y++) out.push(...holidaysOf(y));
  return out;
}
