/**
 * 部品の `binding` → 描くための型つきの値 — `shared/src/keepReport/binding.ts` の薄い変換
 *
 * 解くのは shared の `resolveBinding`（pptx 出力と**同じ答え**を出す1か所。パスの文法・仮想の葉・
 * `$meeting_date` などの設定はそちらが持つ）。ここはその `value: unknown` を、描き手（`renderers/`）が
 * 受け取る形（着地表／ヨミ表／グラフ／帯／写真…）に振り分けるだけ。**パスの解釈をここで増やさない。**
 */
import {
  DEFAULT_MEETING_TITLE, dateLabel, deckAgenda, resolveBinding as sharedResolve, type BindingContext,
} from '@gmo-onair/shared/src/keepReport/binding';
import type {
  BudgetLine, KeepDeck, KeepReportPack, MonthlyPlTable, MonthlyTrendPoint, PipelineRow, PlByEntity, ProjectPageData,
  SlidePage, SlidePart, UtilizationCalendar,
} from '@gmo-onair/shared/src/keepReport/types';
import { BUSINESS_ENTITY_LABELS } from '@gmo-onair/shared/src/keepReport/types';
import { circled } from '../deckLabels';

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
  /** 手入力（keep_report_inputs）。`inputs.*` の部品が読む */
  inputs?: Record<string, unknown> | null;
}

const k = (v: number | null | undefined) => (v === null || v === undefined ? '—' : Math.round(v / 1000).toLocaleString('ja-JP'));
const yen = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${Math.round(v).toLocaleString('ja-JP')}円`);
export { yen, k as thousands };

const empty = (reason: string): Resolved => ({ kind: 'empty', reason });
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isPlTable = (v: unknown): v is MonthlyPlTable => isObj(v) && Array.isArray(v.lines) && typeof v.year_month === 'string';
const isPlByEntity = (v: unknown): v is PlByEntity => isObj(v) && isPlTable(v.all);
const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

/** `project_pages[i].…` / `event_reports[i].…` の親（案件）。帯の①や写真の持ち主に要る */
function parentProject(pack: KeepReportPack, binding: string): { data: ProjectPageData; role: 'project' | 'report' } | null {
  const m = binding.match(/^(project_pages|event_reports)\[(\d+)\]/);
  if (!m) return null;
  const d = (m[1] === 'project_pages' ? pack.project_pages : pack.event_reports)[Number(m[2])];
  return d ? { data: d, role: m[1] === 'project_pages' ? 'project' : 'report' } : null;
}

/** 解けなかったときの、人が読む理由 */
function notFoundReason(binding: string): string {
  if (binding.startsWith('todo')) return 'ToDo は次の段で ONAiR のタスクから組みます（いまは右の「このページ」で文として入れます）';
  if (binding.startsWith('inputs.')) return '手入力の欄です（右の「このページ」で文として入れます）';
  if (/^(project|report)\./.test(binding)) return '案件が決まっていません（右の「部品」の案件ページから置きます）';
  if (binding.startsWith('minutes')) return '前回の議事録がありません（「次回開催日」ページで決定事項を入れます）';
  if (binding.startsWith('inview')) return '直近の定期内覧会がありません';
  if (binding.startsWith('calendars')) return 'その月のカレンダーはありません';
  return `ONAiR にまだ無い数字です（${binding}）`;
}

function kpiFromTable(t: MonthlyPlTable, pack: KeepReportPack): Resolved {
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

function projectValue(binding: string, part: SlidePart, value: unknown, pack: KeepReportPack): Resolved {
  const parent = parentProject(pack, binding);
  const field = binding.split('.')[1] ?? null;
  const d = parent?.data ?? null;
  if (!field && isObj(value) && 'band' in value) {
    // 案件そのもの。部品の種類で欄を決める
    const p = value as unknown as ProjectPageData;
    if (part.type === 'photos') return { kind: 'photos', projectId: p.project_id, photos: p.photos };
    if (part.type === 'bullets') return isStrings(p.highlights) && p.highlights.length ? { kind: 'bullets', items: p.highlights } : p.summary_lines.length ? { kind: 'bullets', items: p.summary_lines } : empty('概要がまだありません（案件の目的欄か、右の「このページ」で書きます）');
    return { kind: 'text', tone: 'band', text: `${circled(p.ordinal)}　${p.band.customer_short}／${p.band.event_name}　${p.band.date_label}` };
  }
  switch (field) {
    case 'band': {
      const b = value as ProjectPageData['band'];
      return {
        kind: 'text', tone: 'band',
        text: parent?.role === 'report'
          ? `${circled(d?.ordinal)}　${b.date_label}　${b.customer_short}／${b.event_name}`
          : `${circled(d?.ordinal)}　${b.customer_short}／${b.event_name}　${b.date_label}`,
      };
    }
    case 'confidence': {
      const c = value as { letter: string; label: string };
      return { kind: 'text', tone: 'confidence', text: `${c.letter}\n${c.label}` };
    }
    case 'photos':
      return { kind: 'photos', projectId: d?.project_id ?? null, photos: (value as ProjectPageData['photos']) ?? [] };
    case 'summary_lines':
      return isStrings(value) && value.length ? { kind: 'bullets', items: value } : empty('概要がまだありません（案件の目的欄か、右の「このページ」で書きます）');
    case 'highlights': {
      const items = [...(d?.headline ? [d.headline] : []), ...(isStrings(value) ? value : [])];
      return items.length ? { kind: 'bullets', items } : empty('ふりかえりがまだありません（案件のふりかえりタブで書きます）');
    }
    case 'headline':
      return typeof value === 'string' && value ? { kind: 'text', tone: 'heading', text: value } : empty('総括がまだありません');
    case 'schedule': {
      const rows = (value as ProjectPageData['schedule']) ?? [];
      return { kind: 'table', head: ['時間', '内容', '会場'], align: ['left', 'left', 'left'], rows: rows.length ? rows.map((s) => [s.time, s.content, s.venue]) : [['', '', ''], ['', '', ''], ['', '', '']] };
    }
    case 'key_dates':
      return { kind: 'key_dates', items: ((value as ProjectPageData['key_dates']) ?? []).map((x) => ({ label: x.label, text: x.text })) };
    case 'intake_channel':
      return { kind: 'text', tone: 'plain', text: `経路：${typeof value === 'string' && value ? value : '—'}` };
    case 'money': {
      const m = value as { revenue: number | null; gross_profit: number | null; gross_margin: number | null };
      return { kind: 'money', revenue: m.revenue, gross: m.gross_profit, margin: m.gross_margin };
    }
    default:
      return empty(`案件ページに「${field}」という欄はありません`);
  }
}

function classify(binding: string, part: SlidePart, value: unknown, pack: KeepReportPack | null): Resolved {
  if (binding === '$meeting_title') return { kind: 'text', tone: 'cover', text: String(value || DEFAULT_MEETING_TITLE) };
  if (binding === '$meeting_date') return { kind: 'text', tone: 'heading', text: dateLabel(String(value)) || '会議日 未定' };
  if (binding === '$pl_heading') return { kind: 'text', tone: 'heading', text: String(value) };
  if (binding === '$agenda') {
    const items = isStrings(value) ? value : [];
    return { kind: 'bullets', items: items.length ? items : ['①数値報告・営業進捗【報告｜3×3｜5分】', '②案件実施報告【報告｜3×3｜5分】', '③新規案件獲得【報告｜3×3｜2分】'] };
  }
  if (!pack) return empty('数字を読み込んでいます');

  if (/^(landing|forecast)/.test(binding)) {
    const mode = binding.startsWith('forecast') || part.options?.mode === 'forecast' ? 'forecast' : 'landing';
    if (isObj(value) && 'judge' in value) {
      const l = value as unknown as BudgetLine;
      return { kind: 'kpi', items: [{ label: l.label, value: `${k(l.actual)}千円`, sub: l.ratio === null ? undefined : `対目標 ${l.ratio.toFixed(1)}%` }] };
    }
    if (part.type === 'kpi') return kpiFromTable(isPlByEntity(value) ? value.all : isPlTable(value) ? value : pack[mode].all, pack);
    if (isPlByEntity(value)) {
      return {
        kind: 'pl_by_entity', mode,
        tables: [
          // GSS を先に（画面のチップ・計上会社別の表と同じ並び）
          { label: BUSINESS_ENTITY_LABELS.GSS, table: value.GSS },
          { label: BUSINESS_ENTITY_LABELS.GJV, table: value.GJV },
          ...(value.GMO ? [{ label: BUSINESS_ENTITY_LABELS.GMO, table: value.GMO }] : []),
        ],
      };
    }
    if (isPlTable(value)) {
      const caption = value.unconfirmed.length ? `未確定: ${value.unconfirmed.map((u) => `${u.project_name}（${k(u.amount)}千円）`).join('・')}` : null;
      return { kind: 'pl', table: value, mode, caption };
    }
  }
  if (binding.startsWith('trend')) return { kind: 'trend', metric: binding.endsWith('utilization') ? 'utilization' : 'revenue', points: pack.trend };
  if (binding.startsWith('pipeline')) {
    const list = binding.endsWith('samurai') || part.options?.list === 'samurai' ? 'samurai' : 'external';
    const rows = Array.isArray(value) ? (value as PipelineRow[]) : pack.pipeline[list];
    return { kind: 'pipeline', list, rows };
  }
  if (binding.startsWith('calendars') && isObj(value) && 'days' in value) return { kind: 'calendar', calendar: value as unknown as UtilizationCalendar };
  if (/^(project_pages|event_reports)\[/.test(binding)) return projectValue(binding, part, value, pack);
  if (binding === 'inview.by_category' && Array.isArray(value)) {
    const rows = value as Array<{ category: string; groups: number; people: number }>;
    return { kind: 'table', head: ['分類', '組数', '人数'], align: ['left', 'right', 'right'], rows: rows.map((c) => [c.category, String(c.groups), String(c.people)]) };
  }
  if (binding === 'minutes' && isObj(value)) {
    const mn = value as NonNullable<KeepReportPack['minutes']>;
    const items = [...(mn.decisions ?? []).map((d) => `決定：${d}`), ...(mn.topics ?? []).map((t) => `${t.area}：${t.text}`)];
    return items.length ? { kind: 'bullets', items } : empty('前回の決定事項はありません');
  }
  if (binding === 'minutes.next_meeting_date') return { kind: 'text', tone: 'heading', text: `次回開催日：${dateLabel(String(value))}` };

  // それ以外は値の形で決める（固定文・箇条書き・数）
  if (typeof value === 'string') return { kind: 'text', tone: part.type === 'bullets' ? 'plain' : 'heading', text: value };
  if (isStrings(value)) return value.length ? { kind: 'bullets', items: value } : empty(notFoundReason(binding));
  if (typeof value === 'number') return { kind: 'text', tone: 'heading', text: value.toLocaleString('ja-JP') };
  return empty(`この部品の形で出せない値です（${binding}）`);
}

/** 上書き（`text_override`）は `PartRenderer` が先に見るので、ここでは binding だけを解く */
export function resolveBinding(pack: KeepReportPack | null, page: SlidePage, part: SlidePart, ctx: ResolveContext = {}): Resolved {
  const binding = part.binding;
  if (binding === null || binding === undefined || binding === '') return { kind: 'manual' };
  const bctx: BindingContext = {
    meeting_date: ctx.meeting ?? pack?.meeting_date ?? '',
    meeting_title: null,
    agenda: ctx.deck ? deckAgenda(ctx.deck.pages) : undefined,
    inputs: ctx.inputs ?? null,
  };
  const r = sharedResolve(pack, page, { ...part, text_override: null }, bctx);
  if (!r.ok) {
    if (r.reason === 'no_pack') return empty('数字を読み込んでいます');
    if (binding === 'inview.photos') return { kind: 'photos', projectId: null, photos: [] };
    if (binding === 'minutes.next_meeting_date') return { kind: 'text', tone: 'heading', text: '次回開催日：未定' };
    return empty(notFoundReason(binding));
  }
  return classify(binding, part, r.value, pack);
}
