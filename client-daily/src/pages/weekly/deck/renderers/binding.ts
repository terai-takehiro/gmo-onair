/**
 * 部品の `binding` → パックの中身 — 画面側の（暫定の）解決器
 *
 * ⚠️ 正は `shared/src/keepReport/binding.ts` の `resolveBinding(pack, page, part)` になる予定
 * （pptx 出力と同じ解決器を読む）。それが入るまでの間、ここで同じ語彙を解く。
 * 入ったら `PartRenderer.tsx` の import を差し替えて、このファイルは薄い変換だけにする。
 *
 * 語彙（`shared/src/keepReport/templates.ts` の regions と `SlidePart.binding` の例）:
 *   landing / forecast（+ `.all` `.gss` `.gscs` `.gig`・`options.entity = 'by_entity'`）
 *   landing.lines[i]         … 数字1つ（KPI）
 *   trend / trend.revenue / trend.utilization
 *   pipeline / pipeline.external / pipeline.samurai
 *   calendars[i]
 *   project_pages[i] / event_reports[i]（`.band` `.photos` `.summary_lines` `.schedule` `.key_dates` `.intake_channel` `.money` `.confidence` `.highlights`）
 *   project.<field> / report.<field> … ページの案件（`options.project_id` か上の添字）から引く
 *   inview.summary / inview.by_category / inview.photos
 *   minutes / minutes.next_meeting_date
 *   $meeting_title / $meeting_date / $pl_heading / $agenda … 資料の設定
 *   それ以外の日本語の文字列 … そのまま出す文（「単位：千円」など）
 */
import type {
  KeepDeck, KeepReportPack, MonthlyPlTable, MonthlyTrendPoint, PipelineRow, ProjectPageData, SlidePage, SlidePart,
  UtilizationCalendar,
} from '@gmo-onair/shared/src/keepReport/types';
import { BUSINESS_ENTITY_LABELS } from '@gmo-onair/shared/src/keepReport/types';
import { SLIDE_TEMPLATES } from '@gmo-onair/shared/src/keepReport/templates';
import { circled, formatMeetingDate, pageProject, plHeading, plOptions, stripAgenda } from '../deckLabels';

export type Resolved =
  | { kind: 'pl'; table: MonthlyPlTable; mode: 'landing' | 'forecast'; caption: string | null }
  | { kind: 'pl_by_entity'; mode: 'landing' | 'forecast'; tables: Array<{ label: string; table: MonthlyPlTable }> }
  | { kind: 'pipeline'; list: 'external' | 'samurai'; rows: PipelineRow[] }
  | { kind: 'trend'; metric: 'revenue' | 'utilization'; points: MonthlyTrendPoint[] }
  | { kind: 'calendar'; calendar: UtilizationCalendar }
  | { kind: 'text'; text: string; tone: 'plain' | 'band' | 'confidence' | 'cover' | 'heading' }
  | { kind: 'bullets'; items: string[] }
  | { kind: 'table'; head: string[]; rows: string[][]; align?: Array<'left' | 'right' | 'center'> }
  | { kind: 'money'; revenue: number | null; gross: number | null; margin: number | null }
  | { kind: 'key_dates'; items: Array<{ label: string; text: string }> }
  | { kind: 'photos'; projectId: string | null; photos: Array<{ box_file_id: string; caption: string | null }> }
  | { kind: 'kpi'; items: Array<{ label: string; value: string; sub?: string }> }
  | { kind: 'manual' }
  | { kind: 'empty'; reason: string };

export interface ResolveContext {
  deck?: KeepDeck | null;
  meeting?: string | null;
}

const k = (v: number | null | undefined) => (v === null || v === undefined ? '—' : Math.round(v / 1000).toLocaleString('ja-JP'));
const yen = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${Math.round(v).toLocaleString('ja-JP')}円`);

function projectOf(pack: KeepReportPack, page: SlidePage, part: SlidePart, binding: string): { data: ProjectPageData; role: 'project' | 'report' } | null {
  const m = binding.match(/^(project_pages|event_reports)\[(\d+)\]/);
  if (m) {
    const list = m[1] === 'project_pages' ? pack.project_pages : pack.event_reports;
    const d = list[Number(m[2])];
    return d ? { data: d, role: m[1] === 'project_pages' ? 'project' : 'report' } : null;
  }
  const pid = part.options?.project_id as string | undefined;
  if (pid) {
    const pp = pack.project_pages.find((p) => p.project_id === pid);
    if (pp) return { data: pp, role: 'project' };
    const er = pack.event_reports.find((p) => p.project_id === pid);
    if (er) return { data: er, role: 'report' };
  }
  return pageProject(pack, page);
}

function projectField(pj: { data: ProjectPageData; role: 'project' | 'report' }, field: string): Resolved {
  const d = pj.data;
  const b = d.band;
  switch (field) {
    case 'band':
      return {
        kind: 'text', tone: 'band',
        text: pj.role === 'report'
          ? `${circled(d.ordinal)}　${b.date_label}　${b.customer_short}／${b.event_name}`
          : `${circled(d.ordinal)}　${b.customer_short}／${b.event_name}　${b.date_label}`,
      };
    case 'confidence':
      return { kind: 'text', tone: 'confidence', text: `${d.confidence}\n${d.confidence_label}` };
    case 'photos':
      return { kind: 'photos', projectId: d.project_id, photos: d.photos };
    case 'summary_lines':
      return d.summary_lines.length ? { kind: 'bullets', items: d.summary_lines } : { kind: 'empty', reason: '概要がまだありません（案件の目的欄か、右の「このページ」で書けます）' };
    case 'highlights': {
      const items = [...(d.headline ? [d.headline] : []), ...d.highlights];
      return items.length ? { kind: 'bullets', items } : { kind: 'empty', reason: 'ふりかえりがまだありません（案件のふりかえりタブで書きます）' };
    }
    case 'schedule':
      return {
        kind: 'table', head: ['時間', '内容', '会場'], align: ['left', 'left', 'left'],
        rows: d.schedule.length ? d.schedule.map((s) => [s.time, s.content, s.venue]) : [['', '', ''], ['', '', ''], ['', '', '']],
      };
    case 'key_dates':
      return { kind: 'key_dates', items: d.key_dates.map((x) => ({ label: x.label, text: x.text })) };
    case 'intake_channel':
      return { kind: 'text', tone: 'plain', text: `経路：${d.intake_channel ?? '—'}` };
    case 'money':
      return { kind: 'money', revenue: d.revenue, gross: d.gross_profit, margin: d.gross_margin };
    default:
      return { kind: 'empty', reason: `案件ページに「${field}」という欄はありません` };
  }
}

function plResolve(pack: KeepReportPack, part: SlidePart): Resolved {
  const { mode, entity } = plOptions(part);
  const set = pack[mode];
  if (entity === 'by_entity') {
    const tables = [
      { label: BUSINESS_ENTITY_LABELS.gss, table: set.gss },
      { label: BUSINESS_ENTITY_LABELS.gscs, table: set.gscs },
      ...(set.gig ? [{ label: BUSINESS_ENTITY_LABELS.gig, table: set.gig }] : []),
    ];
    return { kind: 'pl_by_entity', mode, tables };
  }
  const table = entity === 'all' ? set.all : set[entity];
  if (!table) return { kind: 'empty', reason: `${BUSINESS_ENTITY_LABELS[entity]} の数字はまだありません` };
  const caption = table.unconfirmed.length
    ? `未確定: ${table.unconfirmed.map((u) => `${u.project_name}（${k(u.amount)}千円）`).join('・')}`
    : null;
  return { kind: 'pl', table, mode, caption };
}

function agendaItems(deck: KeepDeck | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of deck?.pages ?? []) {
    if (p.removed || p.template === 'agenda' || !p.title.includes('【')) continue;
    const t = stripAgenda(p.title);
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(p.title);
  }
  return out.length ? out : ['①数値報告・営業進捗【報告｜3×3｜5分】', '②案件実施報告【報告｜3×3｜5分】', '③新規案件獲得【報告｜3×3｜2分】'];
}

export function resolveBinding(pack: KeepReportPack | null, page: SlidePage, part: SlidePart, ctx: ResolveContext = {}): Resolved {
  const binding = part.binding;
  if (binding === null || binding === undefined || binding === '') return { kind: 'manual' };

  if (binding.startsWith('$')) {
    switch (binding) {
      case '$meeting_title':
        return { kind: 'text', tone: 'cover', text: page.title || SLIDE_TEMPLATES.cover.defaultTitle };
      case '$meeting_date':
        return { kind: 'text', tone: 'heading', text: formatMeetingDate(ctx.meeting ?? pack?.meeting_date ?? null) };
      case '$pl_heading': {
        const table = page.parts.find((p) => p.type === 'table') ?? null;
        return { kind: 'text', tone: 'heading', text: plHeading(pack, table) };
      }
      case '$agenda':
        return { kind: 'bullets', items: agendaItems(ctx.deck) };
      default:
        return { kind: 'empty', reason: `読めない設定です（${binding}）` };
    }
  }

  if (!pack) return { kind: 'empty', reason: '数字を読み込んでいます' };

  if (/^(landing|forecast)\.lines\[\d+\]$/.test(binding)) {
    const m = binding.match(/^(landing|forecast)\.lines\[(\d+)\]$/)!;
    const line = pack[m[1] as 'landing' | 'forecast'].all.lines[Number(m[2])];
    return line ? { kind: 'kpi', items: [{ label: line.label, value: `${k(line.actual)}千円`, sub: line.ratio === null ? undefined : `対目標 ${line.ratio.toFixed(1)}%` }] }
      : { kind: 'empty', reason: 'その行はありません' };
  }
  if (/^(landing|forecast)(\.|$)/.test(binding)) {
    if (part.type === 'kpi') {
      const { mode } = plOptions(part);
      const t = pack[mode].all;
      const pick = (key: string) => t.lines.find((l) => l.key === key);
      const last = pack.trend[pack.trend.length - 1];
      return {
        kind: 'kpi',
        items: [
          { label: '売上高', value: `${k(pick('revenue')?.actual)}千円` },
          { label: '粗利', value: `${k(pick('gross_profit')?.actual)}千円` },
          { label: '営業利益', value: `${k(pick('operating_profit')?.actual)}千円` },
          { label: '稼働率', value: last?.utilization === null || last?.utilization === undefined ? '—' : `${last.utilization.toFixed(1)}%` },
        ],
      };
    }
    return plResolve(pack, part);
  }
  if (binding.startsWith('trend')) {
    return { kind: 'trend', metric: binding.endsWith('utilization') ? 'utilization' : 'revenue', points: pack.trend };
  }
  if (binding.startsWith('pipeline')) {
    const list = binding.endsWith('samurai') || part.options?.list === 'samurai' ? 'samurai' : 'external';
    return { kind: 'pipeline', list, rows: pack.pipeline[list] };
  }
  const cal = binding.match(/^calendars\[(\d+)\]$/);
  if (cal) {
    const c = pack.calendars[Number(cal[1])];
    return c ? { kind: 'calendar', calendar: c } : { kind: 'empty', reason: 'その月のカレンダーはありません' };
  }
  const pj = binding.match(/^(project_pages\[\d+\]|event_reports\[\d+\]|project|report)(?:\.(\w+))?$/);
  if (pj) {
    const found = projectOf(pack, page, part, binding);
    if (!found) return { kind: 'empty', reason: '案件が決まっていません（右の「部品」の案件ページから置きます）' };
    const field = pj[2] ?? (part.type === 'photos' ? 'photos' : part.type === 'bullets' ? (found.role === 'report' ? 'highlights' : 'summary_lines') : 'band');
    return projectField(found, field);
  }
  if (binding.startsWith('inview')) {
    const iv = pack.inview;
    if (!iv) return { kind: 'empty', reason: '直近の定期内覧会がありません' };
    if (binding.endsWith('by_category')) {
      return { kind: 'table', head: ['分類', '組数', '人数'], align: ['left', 'right', 'right'], rows: iv.by_category.map((c) => [c.category, String(c.groups), String(c.people)]) };
    }
    if (binding.endsWith('photos')) return { kind: 'photos', projectId: null, photos: [] };
    return {
      kind: 'bullets',
      items: [
        `開催日：${formatMeetingDate(iv.session_date)}`,
        `参加：${iv.groups}組 ${iv.people}名`,
        `満足度：${iv.satisfaction === null ? '（手入力）' : `${iv.satisfaction}/4.0`}`,
        `来場者から起票した案件：${iv.promoted_projects}件`,
        ...(iv.next_session ? [`次回：${formatMeetingDate(iv.next_session.date)}（申込 ${iv.next_session.applied_groups}組）`] : []),
      ],
    };
  }
  if (binding.startsWith('minutes')) {
    const mn = pack.minutes;
    if (binding.endsWith('next_meeting_date')) {
      return { kind: 'text', tone: 'heading', text: `次回開催日：${mn?.next_meeting_date ? formatMeetingDate(mn.next_meeting_date) : '未定'}` };
    }
    if (!mn) return { kind: 'empty', reason: '前回の議事録がありません（「次回開催日」ページで決定事項を入れます）' };
    const items = [...mn.decisions.map((d) => `決定：${d}`), ...mn.topics.map((t) => `${t.area}：${t.text}`)];
    return items.length ? { kind: 'bullets', items } : { kind: 'empty', reason: '前回の決定事項はありません' };
  }
  if (binding.startsWith('todo')) {
    return { kind: 'empty', reason: 'ToDo は次の段で ONAiR のタスクから組みます（いまは右の「このページ」で文として入れます）' };
  }
  if (binding.startsWith('inputs.')) {
    return { kind: 'empty', reason: '手入力の欄です（右の「このページ」で文として入れます）' };
  }
  if (/[^\x20-\x7e]/.test(binding)) return { kind: 'text', tone: 'heading', text: binding };
  return { kind: 'empty', reason: `読めない指定です（${binding}）` };
}

/** 案件の売上と粗利（帯の下の小さな表）。money 以外にも使うので export */
export { yen, k as thousands };
