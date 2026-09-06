/**
 * 右の「部品」の中身 — パックから、置ける部品とページの一覧を組む（純粋関数）
 *
 * 数字／グラフ／一覧／案件ページ／実施報告／そのほか の6つの塊（モック `Builder.dc.html`）。
 * 「部品」はいまのページに入る。「ページ」（案件ページ・実施報告・内覧会）は
 * いまのページの下に新しいページとして入る — 1案件 = 1ページが資料の単位のため。
 */
import type { KeepReportPack } from '@gmo-onair/shared/src/keepReport/types';
import { circled, monthOf, shortMd, type PageKind } from './deckLabels';
import type { NewPageSpec, NewPartSpec } from './deckState';

export interface PartChip {
  key: string;
  label: string;
  badge: Extract<PageKind, '自動' | '自動＋手' | '手'>;
  kind: 'part' | 'page';
  part?: NewPartSpec;
  page?: NewPageSpec;
}

export interface ChipGroup {
  title: string;
  chips: PartChip[];
}

const part = (key: string, label: string, badge: PartChip['badge'], spec: NewPartSpec): PartChip => ({ key, label, badge, kind: 'part', part: spec });
const page = (key: string, label: string, badge: PartChip['badge'], spec: NewPageSpec): PartChip => ({ key, label, badge, kind: 'page', page: spec });

export function buildChips(pack: KeepReportPack | null): ChipGroup[] {
  const landingM = monthOf(pack?.landing.all.year_month);
  const forecastM = monthOf(pack?.forecast.all.year_month);
  const numbers: ChipGroup = {
    title: '数字',
    chips: [
      part('pl-landing', `${landingM ? `${landingM}月 ` : ''}着地 表`, '自動', { type: 'table', binding: 'landing.all', options: { mode: 'landing', entity: 'all' }, h: 52 }),
      part('pl-forecast', `${forecastM ? `${forecastM}月 ` : ''}着地見込 表`, '自動', { type: 'table', binding: 'forecast.all', options: { mode: 'forecast', entity: 'all' }, h: 52 }),
      part('pl-landing-entity', `${landingM ? `${landingM}月 ` : ''}着地 主体別`, '自動', { type: 'table', binding: 'landing', options: { mode: 'landing', entity: 'by_entity' }, h: 52 }),
      part('kpi', 'KPI の数字（売上・粗利・稼働率）', '自動', { type: 'kpi', binding: 'landing.all', options: { mode: 'landing' }, h: 16 }),
    ],
  };
  const charts: ChipGroup = {
    title: 'グラフ',
    chips: [
      part('trend-revenue', '売上高と稼働件数', '自動', { type: 'chart', binding: 'trend.revenue', h: 60 }),
      part('trend-utilization', '稼働率の推移', '自動', { type: 'chart', binding: 'trend.utilization', h: 60 }),
    ],
  };
  const lists: ChipGroup = {
    title: '一覧',
    chips: [
      part('pipeline-external', 'ヨミ表（外部案件）', '自動', { type: 'table', binding: 'pipeline.external', options: { list: 'external' }, h: 70 }),
      part('pipeline-samurai', 'ヨミ表（サムライ関連）', '自動', { type: 'table', binding: 'pipeline.samurai', options: { list: 'samurai' }, h: 70 }),
      ...(pack?.calendars ?? []).map((c, i) =>
        part(`calendar-${i}`, `稼働カレンダー ${monthOf(c.year_month)}月`, '自動', { type: 'calendar', binding: `calendars[${i}]`, h: 76 })),
      part('todo', 'ToDo リスト', '自動', { type: 'table', binding: 'todo', h: 60 }),
    ],
  };
  const projects: ChipGroup = {
    title: '案件ページ',
    chips: (pack?.project_pages ?? []).map((p, i) =>
      page(`project-${p.project_id}`, `案件${circled(p.ordinal ?? i + 1)} ${p.band.customer_short}`, '自動＋手', {
        template: 'project_page', scope: `project_pages[${i}]`, options: { project_id: p.project_id },
      })),
  };
  const reports: ChipGroup = {
    title: '実施報告',
    chips: (pack?.event_reports ?? []).map((r, i) =>
      page(`report-${r.project_id}`, `${r.band.date_label} ${r.band.event_name}`, '自動＋手', {
        template: 'event_report', scope: `event_reports[${i}]`, options: { project_id: r.project_id },
      })),
  };
  const others: ChipGroup = {
    title: 'そのほか',
    chips: [
      ...(pack?.inview ? [page('inview', `定期内覧会 ${shortMd(pack.inview.session_date)}`, '自動', { template: 'inview' })] : []),
      part('free-text', '文（自由に書く）', '手', { type: 'text', binding: null, h: 20 }),
      part('free-photos', '写真（Box から選ぶ）', '手', { type: 'photos', binding: null, options: { box_file_ids: [] }, h: 34 }),
      part('free-table', '表（空）', '手', { type: 'table', binding: null, h: 30 }),
      part('free-bullets', '箇条書き', '手', { type: 'bullets', binding: null, h: 24 }),
    ],
  };
  return [numbers, charts, lists, projects, reports, others].filter((g) => g.chips.length > 0);
}

export function findChip(groups: ChipGroup[], key: string): PartChip | null {
  for (const g of groups) {
    const c = g.chips.find((x) => x.key === key);
    if (c) return c;
  }
  return null;
}
