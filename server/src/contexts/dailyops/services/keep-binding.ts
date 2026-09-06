/**
 * 部品の `binding`（パックのどこを読むか）を解決する — **画面と pptx で同じ答えを出すための1か所**。
 *
 * ── 使い方 ────────────────────────────────────────────────────
 *   const r = resolveBinding(pack, page, part, { meeting_date: deck.meeting_date, agenda: deckAgenda(deck.pages) });
 *   if (r.ok) draw(r.value) else drawPlaceholder(r.label)
 *
 * ── binding の文法 ────────────────────────────────────────────
 * - `landing.all` / `forecast.GSS` / `pipeline.external` / `project_pages[3].summary_lines` /
 *   `calendars[0]` / `minutes.next_meeting_date` … パック（KeepReportPack）へのパス。
 *   `.` で区切り、配列は `[i]`。**無いところを指したら `ok: false`**（投げない。画面は灰色の枠、pptx は灰色の文字にする）
 * - **仮想の葉**（パックに実体は無いが部品が要るもの）:
 *   `project_pages[i].money` / `event_reports[i].money` → `{ revenue, gross_profit, gross_margin }`
 *   `project_pages[i].confidence` → `{ letter, label }`（実体の文字ではなく、`confidence` と `confidence_label` を束ねたもの）
 *   `trend.revenue` → `TrendRevenuePoint[]`、`trend.utilization` → `TrendUtilizationPoint[]`
 *   `inview.summary` → 箇条書きの文字列の並び（開催日・参加・満足度・ヨミ化・次回）
 * - `$meeting_date` / `$meeting_title` / `$agenda` / `$pl_heading` … 資料の設定（`BindingContext`）。
 *   `$pl_heading` だけはページの部品の `options.mode` / `options.entity`（all / GJV / GSS / GMO / by_entity）とパックの対象月から組む
 * - `inputs.attendance` … ONAiR に無い手入力（`BindingContext.inputs`）
 * - **パスの形をしていない文字列は、そのまま文として使う**（`単位：千円` / `Appendix` など。テンプレの固定文）
 * - `project.*` / `report.*`（テンプレの相対パス）は、`buildStandardDeck` が組むときに
 *   `project_pages[i].*` / `event_reports[i].*` へ書き換える。書き換え前のまま来たら `ok: false`
 *
 * ── 上書きが最優先 ────────────────────────────────────────────
 * `part.text_override` が入っていれば binding を読まず、その文を返す（`overridden: true`）。
 * 写真の部品では Box の file id を改行・カンマで並べた文字列（読む側が割る）。
 *
 * ⚠️ **これは server 側の写しです**（正は `shared/src/keepReport/binding.ts`）。
 * server は `shared/` を import できないため（`rootDir` が `server/src`）、同じ関数をここにも置きます。
 * `shared/tests/keepReportDeckParity.test.ts` が両方を同じ材料で走らせて同じ答えになることを固定しています。
 * **正を直したらこちらも同じに直すこと。**
 */
import type { KeepReportPack, SlidePage, SlidePart, ProjectPageData, MonthlyTrendPoint } from './keep-deck.types';

export interface BindingContext {
  meeting_date: string;
  /** 表紙の会議名。無ければ既定（`GMOサムライスタジオ 隔週キープ`） */
  meeting_title?: string | null;
  /** アジェンダ（`deckAgenda(pages)` の結果） */
  agenda?: string[];
  /** ONAiR に無い手入力（keep_report_inputs）。key → value */
  inputs?: Record<string, unknown> | null;
}

export type ResolvedBinding =
  | { ok: true; value: unknown; overridden: boolean }
  | { ok: false; reason: 'no_binding' | 'no_pack' | 'not_found'; label: string };

export interface TrendRevenuePoint { year_month: string; internal: number; external: number; count: number }
export interface TrendUtilizationPoint { year_month: string; active_days: number; business_days: number; utilization: number | null }

export const DEFAULT_MEETING_TITLE = 'GMOサムライスタジオ 隔週キープ';

/** パスの形（`a.b[0].c`）。これに合わない binding は固定文として扱う */
const PATH_RE = /^[a-z_][a-z0-9_]*(\[\d+\])?(\.[a-z_][a-z0-9_]*(\[\d+\])?)*$/;

/** 固定ページ（アジェンダに載せない）。報告ページ（①〜⑦・自由）だけがアジェンダになる */
export const FIXED_TEMPLATES: ReadonlySet<string> = new Set([
  'cover', 'checklist', 'slogan', 'summary', 'org', 'attendance', 'prev_minutes', 'todo',
  'schedule', 'kpi_tree', 'progress_charts', 'agenda', 'next_meeting', 'appendix',
]);

/** アジェンダの材料: 消していない報告ページの題を、重複を除いて並び順に */
export function deckAgenda(pages: SlidePage[]): string[] {
  const out: string[] = [];
  for (const p of pages) {
    if (p.removed || FIXED_TEMPLATES.has(p.template)) continue;
    const t = p.title.trim();
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

/** 'YYYY-MM' → 'M月' */
export function monthLabel(ym: string | null | undefined): string {
  const m = /^\d{4}-(\d{2})$/.exec(ym ?? '');
  return m ? `${Number(m[1])}月` : '';
}

/** 'YYYY-MM-DD' → 'YYYY/M/D（曜）' */
export function dateLabel(ymd: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd ?? '');
  if (!m) return ymd ?? '';
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const w = '日月火水木金土'[d.getUTCDay()];
  return `${m[1]}/${Number(m[2])}/${Number(m[3])}（${w}）`;
}

function plHeading(pack: KeepReportPack | null, page: SlidePage): string {
  const table = page.parts.find((p) => p.type === 'table');
  const mode = table?.options?.mode === 'forecast' ? 'forecast' : 'landing';
  const entity = String(table?.options?.entity ?? 'all');
  const ym = pack ? pack[mode].all.year_month : null;
  const month = monthLabel(ym);
  const what = mode === 'forecast' ? '着地見込' : '着地';
  // by_entity は「計上会社別」（画面の一覧・チップと同じ語）。1社なら entity_code をそのまま（GSS / GJV / GMO）
  const suffix = entity === 'by_entity' ? '（計上会社別）' : entity === 'all' ? '' : `（${entity}）`;
  return `${month} ${what}${suffix}`.trim();
}

function money(p: ProjectPageData): unknown {
  return { revenue: p.revenue, gross_profit: p.gross_profit, gross_margin: p.gross_margin };
}

function trendRevenue(trend: MonthlyTrendPoint[]): TrendRevenuePoint[] {
  return trend.map((t) => ({
    year_month: t.year_month, internal: t.revenue_internal, external: t.revenue_external,
    count: t.project_count_internal + t.project_count_external,
  }));
}

function trendUtilization(trend: MonthlyTrendPoint[]): TrendUtilizationPoint[] {
  return trend.map((t) => ({
    year_month: t.year_month, active_days: t.active_days, business_days: t.business_days, utilization: t.utilization,
  }));
}

function inviewSummary(pack: KeepReportPack): string[] {
  const v = pack.inview;
  if (!v) return [];
  const lines = [
    `開催日: ${dateLabel(v.session_date)}`,
    `参加: ${v.groups}組 ${v.people}名`,
    v.satisfaction != null ? `満足度: ${v.satisfaction} / 4.0` : '満足度: （未入力）',
    `ヨミ化: ${v.promoted_projects}件`,
  ];
  if (v.next_session) lines.push(`次回: ${dateLabel(v.next_session.date)}・申込 ${v.next_session.applied_groups}組`);
  return lines;
}

/** パス1段ぶんを読む。仮想の葉はここで作る */
function step(cur: unknown, key: string, pack: KeepReportPack): unknown {
  if (cur == null || typeof cur !== 'object') return undefined;
  const obj = cur as Record<string, unknown>;
  // 仮想の葉（`confidence` は実体の文字より先に、文字と語を束ねたものを返す）
  if (key === 'confidence' && 'confidence_label' in obj) return { letter: obj.confidence, label: obj.confidence_label };
  if (key in obj) return obj[key];
  if (key === 'money' && 'gross_margin' in obj) return money(obj as unknown as ProjectPageData);
  if (cur === pack.trend) {
    if (key === 'revenue') return trendRevenue(pack.trend);
    if (key === 'utilization') return trendUtilization(pack.trend);
  }
  if (cur === pack.inview && key === 'summary') return inviewSummary(pack);
  return undefined;
}

/** `a.b[0].c` → ['a', 'b', 0, 'c'] */
export function splitPath(path: string): Array<string | number> {
  const out: Array<string | number> = [];
  for (const seg of path.split('.')) {
    const m = /^([a-z_][a-z0-9_]*)(?:\[(\d+)\])?$/.exec(seg);
    if (!m) return [];
    out.push(m[1]);
    if (m[2] != null) out.push(Number(m[2]));
  }
  return out;
}

export function resolveBinding(
  pack: KeepReportPack | null, page: SlidePage, part: SlidePart, ctx: BindingContext,
): ResolvedBinding {
  const label = part.options?.label != null ? String(part.options.label) : part.id;
  if (part.text_override != null && part.text_override !== '') {
    return { ok: true, value: part.text_override, overridden: true };
  }
  const b = part.binding;
  if (b == null || b === '') return { ok: false, reason: 'no_binding', label };

  if (b.startsWith('$')) {
    switch (b) {
      case '$meeting_date': return { ok: true, value: ctx.meeting_date, overridden: false };
      case '$meeting_title': return { ok: true, value: ctx.meeting_title || DEFAULT_MEETING_TITLE, overridden: false };
      case '$agenda': return { ok: true, value: ctx.agenda ?? [], overridden: false };
      case '$pl_heading': return { ok: true, value: plHeading(pack, page), overridden: false };
      default: return { ok: false, reason: 'not_found', label };
    }
  }
  if (!PATH_RE.test(b)) return { ok: true, value: b, overridden: false }; // 固定文

  const segs = splitPath(b);
  if (segs[0] === 'inputs') {
    const v = segs.length > 1 ? ctx.inputs?.[String(segs[1])] : ctx.inputs;
    return v == null ? { ok: false, reason: 'not_found', label } : { ok: true, value: v, overridden: false };
  }
  if (!pack) return { ok: false, reason: 'no_pack', label };
  let cur: unknown = pack;
  for (const s of segs) {
    cur = typeof s === 'number' ? (Array.isArray(cur) ? cur[s] : undefined) : step(cur, s, pack);
    if (cur === undefined) return { ok: false, reason: 'not_found', label };
  }
  if (cur === null) return { ok: false, reason: 'not_found', label };
  return { ok: true, value: cur, overridden: false };
}
