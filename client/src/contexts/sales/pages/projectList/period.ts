/**
 * 実施日の期間で絞る（v4 案件一覧・指示書 4-3）
 *
 * ── 単位と「対象」を分けて持つ ──────────────────────────────
 *
 * 単位（月／四半期／半年／年／全件）を選ぶだけでは、**どの月なのか**が決まりません。
 * 旧実装は単位ごとに違う入力欄（`<input type=month>` と 年＋Q の2つ…）を出していて、
 * 単位を変えるたびに帯の中身が入れ替わり、幅も段数も動いていました。
 *
 * → **単位と対象を分けて持ち、対象はどの単位でも「◀ ｜ プルダウン ｜ ▶」の
 *   同じ枠1つ**で選びます。枠の幅は固定なので、単位を変えてもバーが動きません。
 *
 * ── 既定は「半年（いま属する期）」──────────────────────────
 *
 * 旧実装の既定は「今月〜半年先」でした。**期の区切りに合っていない**ので、
 * 「下期の案件を全部見たい」と思っても月をまたぐたびに範囲が滑っていました。
 * いまは **1〜6月＝上期 ／ 7〜12月＝下期**の、**いま属する期**を出します。
 *
 * ── 実施日が未定の案件はどの期間でも出す ────────────────────
 *
 * 絞り込みはサーバー側で `event_start IS NULL` を通します（`project.service.ts`）。
 * 落とすと、日程がまだ決まっていない案件＝**いちばん動かさないといけないもの**が
 * 一覧から消えます。
 */

export type EventPeriodMode = 'month' | 'quarter' | 'half' | 'year' | 'all';

/** 単位。**並びは細かい順**（月 → 四半期 → 半年 → 年 → 全件） */
export const PERIOD_MODES: { mode: EventPeriodMode; label: string }[] = [
  { mode: 'month', label: '月' },
  { mode: 'quarter', label: '四半期' },
  { mode: 'half', label: '半年' },
  { mode: 'year', label: '年' },
  { mode: 'all', label: '全件' },
];

/**
 * いま選んでいる対象。**単位ごとに別の状態を持たない** —
 * 別々に持つと、月 → 年 → 月 と戻ったときに前の月が残って
 * 「同じ単位に戻したのに違う範囲」になります。
 *
 * `year` はどの単位でも使い、`index` の意味だけが単位によって変わります:
 *   月 … 1〜12 ／ 四半期 … 1〜4 ／ 半年 … 1（上期）2（下期）／ 年・全件 … 使わない
 */
export interface PeriodValue {
  mode: EventPeriodMode;
  year: number;
  index: number;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** いまの日付から既定（半年・いま属する期）を作る */
export function defaultPeriod(now: Date): PeriodValue {
  return {
    mode: 'half',
    year: now.getFullYear(),
    index: now.getMonth() < 6 ? 1 : 2,
  };
}

/** その単位で `index` が取りうる範囲。`all` と `year` は対象を選ばない */
function indexRange(mode: EventPeriodMode): { min: number; max: number } | null {
  if (mode === 'month') return { min: 1, max: 12 };
  if (mode === 'quarter') return { min: 1, max: 4 };
  if (mode === 'half') return { min: 1, max: 2 };
  return null;
}

/**
 * 単位を変えたときの対象。**いま見ている範囲を含む対象へ寄せる。**
 * 既定値に飛ばすと、8月を見ていた人が四半期に切り替えた瞬間に 1Q へ飛びます。
 */
export function switchMode(v: PeriodValue, mode: EventPeriodMode): PeriodValue {
  if (mode === v.mode) return v;
  // いま見ている範囲の**先頭の月**（1〜12）を求めてから、新しい単位に当て直す
  const startMonth = v.mode === 'month' ? v.index
    : v.mode === 'quarter' ? (v.index - 1) * 3 + 1
      : v.mode === 'half' ? (v.index - 1) * 6 + 1
        : 1;
  const index = mode === 'month' ? startMonth
    : mode === 'quarter' ? Math.floor((startMonth - 1) / 3) + 1
      : mode === 'half' ? (startMonth <= 6 ? 1 : 2)
        : 1;
  return { mode, year: v.year, index };
}

/**
 * `◀` `▶` で1つずつ動かす。**年をまたぐ**（12月の次は翌年1月）。
 * またがないと、年末年始の案件を見るのに年の欄を触ることになります。
 */
export function step(v: PeriodValue, dir: -1 | 1): PeriodValue {
  const range = indexRange(v.mode);
  if (!range) {
    // 年（と全件）は年そのものを動かす。全件は動かない
    return v.mode === 'year' ? { ...v, year: v.year + dir } : v;
  }
  const next = v.index + dir;
  if (next < range.min) return { ...v, year: v.year - 1, index: range.max };
  if (next > range.max) return { ...v, year: v.year + 1, index: range.min };
  return { ...v, index: next };
}

/** 対象を選ぶプルダウンの中身。**単位ごとに具体値で出す**（「1つ前」とは書かない） */
export function options(v: PeriodValue, now: Date): { value: string; label: string }[] {
  if (v.mode === 'all') return [{ value: 'all', label: '指定なし' }];
  const thisYear = now.getFullYear();
  // 前後3年ぶん。**過去のほうを広く取る** — 一覧を遡って見ることのほうが多い
  const years: number[] = [];
  for (let y = thisYear - 3; y <= thisYear + 2; y++) years.push(y);
  if (!years.includes(v.year)) years.push(v.year);
  years.sort((a, b) => a - b);

  if (v.mode === 'year') {
    return years.map((y) => ({ value: `${y}:1`, label: `${y}年` }));
  }
  const range = indexRange(v.mode)!;
  const out: { value: string; label: string }[] = [];
  for (const y of years) {
    for (let i = range.min; i <= range.max; i++) {
      out.push({ value: `${y}:${i}`, label: label({ mode: v.mode, year: y, index: i }) });
    }
  }
  return out;
}

export function toValue(v: PeriodValue): string {
  return v.mode === 'all' ? 'all' : `${v.year}:${v.index}`;
}

export function fromValue(v: PeriodValue, raw: string): PeriodValue {
  if (raw === 'all') return v;
  const [y, i] = raw.split(':').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(i)) return v;
  return { ...v, year: y, index: i };
}

/** 対象の表示。**指示書の表そのまま** */
export function label(v: PeriodValue): string {
  switch (v.mode) {
    case 'month': return `${v.year}年${v.index}月`;
    case 'quarter': return `${v.year}年 ${v.index}Q`;
    case 'half': return v.index === 1 ? `${v.year}年 上期（1〜6月）` : `${v.year}年 下期（7〜12月）`;
    case 'year': return `${v.year}年`;
    case 'all': return '指定なし';
  }
}

/**
 * サーバーに送る範囲（`YYYY-MM-DD`）。`all` は `null`（絞らない）。
 *
 * **月末は「翌月の1日の前日」で出す。** `-31` を固定で書くと 2月が 2/31 になり、
 * 文字列比較なので**2月末の案件が範囲から外れます**（旧実装がそうでした）。
 */
export function range(v: PeriodValue): { from: string; to: string } | null {
  if (v.mode === 'all') return null;
  const startMonth = v.mode === 'month' ? v.index
    : v.mode === 'quarter' ? (v.index - 1) * 3 + 1
      : v.mode === 'half' ? (v.index - 1) * 6 + 1
        : 1;
  const months = v.mode === 'month' ? 1 : v.mode === 'quarter' ? 3 : v.mode === 'half' ? 6 : 12;
  const from = `${v.year}-${pad2(startMonth)}-01`;
  // 月の 0 日 = 前の月の末日
  const end = new Date(v.year, startMonth - 1 + months, 0);
  const to = `${end.getFullYear()}-${pad2(end.getMonth() + 1)}-${pad2(end.getDate())}`;
  return { from, to };
}
