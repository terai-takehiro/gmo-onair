/**
 * 定例報告パック — 案件ページ（提案中）と実施報告の材料（keep-report.md §7）
 *
 * ヨミ表で「資料」に印を付けた案件（`project_pages`）と、前回の会議以降に本番を終えた案件
 * （`event_reports`）は**同じ骨組み**（`ProjectPageData`）。違うのは実施報告だけが持つ
 * 総括・箇条書き・報告の状態。
 *
 * 出どころ:
 *   帯          … `companies.short_name`（無ければ name）・`projects.name`・`event_start`〜`event_end`（曜日つき）
 *   確度        … `projects.stage` → E/D/C/B/A と語（`CONFIDENCE_LABELS`）
 *   写真        … 案件 Box の社外フォルダ `08_写真`（**正はここ**・ご判断 2026-09-06）。BOX につないでいない・
 *                 フォルダが無い・落ちている、のどれでも**空で返して止めない**
 *   概要        … `projects.goal` を行に割る（人が直せるのは構成側）
 *   進行表      … Qシートの香盤は段3以降。いまは空（構成側で人が書く）
 *   チェック／リハ／本番 … `studio_bookings`（setup / rehearsal / performance）
 *   売上／粗利  … `projectService.getSummaries`（確定売上・仕入）。無ければ最新見積（金額・仕入見込み）
 *   総括・箇条書き（実施報告だけ）… `event_reports.headline` と KPT の keep（**人が確かめた行だけ**）
 */
import { queryAll } from '../../../shared/db/connection';
import { isBoxConfigured, listFolderItems, isImageName } from '../../../shared/services/box';
import { projectService, ESTIMATE_AMOUNT_LATERAL } from '../../sales/services/project.service';
import { listProjectFolder } from '../../sales/services/project-box-files.service';
import { PHOTOS_SUBFOLDER } from '../../sales/services/box-folder.service';
import { listKptForProjects, type KptRow } from '../../sales/services/kpt.service';
import { confidenceOf, CONFIDENCE_LABELS, dateRangeLabel, dateLabel } from './keep-pack-calc';
import type { ProjectPageData } from './keep-pack.types';

/** 1案件に載せる写真の上限（資料は 1〜4 枚。多く取っても pptx に置けない） */
const MAX_PHOTOS = 6;
/** `08_写真` を見に行くときに BOX から引く件数の上限（当日の写真は 100 枚を超える） */
const PHOTO_SCAN_MAX = 200;

/**
 * 案件ページ・ヨミ表・実施報告が共通で読む列。`p` = projects / `c` = companies /
 * `est` = 最新見積の金額 / `estc` = 最新見積の仕入見込み（`ESTIMATE_*_LATERAL` を JOIN すること）。
 */
export const PAGE_SOURCE_COLUMNS = `
  p.id, p.name, p.gls_number, p.code, p.stage, p.customer_type, p.entity_code,
  p.event_start, p.event_end, p.intake_channel, p.goal,
  c.name AS customer_name, c.short_name AS customer_short,
  est.amount AS estimate_amount, estc.amount AS estimate_cost`;

/**
 * 最新見積の**仕入見込み**（明細の `cost` の合計）。
 *
 * どの版を「最新」とみなすか（旧版・失注を外し、束ごとに最新版）は
 * `project.service.ts` の `ESTIMATE_AMOUNT_LATERAL` が唯一の定義なので、**その文字列から
 * 金額の式だけを差し替えて作る**（写すと版の扱いが2か所になってずれる —
 * `weekly-stats.service.ts` の頭注と同じ理由）。元の形が変わって差し替えられなくなったら
 * **起動時に止める**（黙って金額を仕入として返すのがいちばん困る）。
 */
const AMOUNT_EXPR = '(e.subtotal - e.discount) AS amount';
const ALIAS_EXPR = ') est ON TRUE';
if (!ESTIMATE_AMOUNT_LATERAL.includes(AMOUNT_EXPR) || !ESTIMATE_AMOUNT_LATERAL.includes(ALIAS_EXPR)) {
  throw new Error('ESTIMATE_AMOUNT_LATERAL の形が変わりました。keep-pack-pages.service.ts の ESTIMATE_COST_LATERAL を直してください');
}
export const ESTIMATE_COST_LATERAL = ESTIMATE_AMOUNT_LATERAL
  .replace(AMOUNT_EXPR, '(SELECT COALESCE(SUM(ei.cost), 0) FROM estimate_items ei WHERE ei.estimate_id = e.id) AS amount')
  .replace(ALIAS_EXPR, ') estc ON TRUE');

export interface PageSource {
  id: string;
  name: string;
  gls_number: string | null;
  code: string | null;
  stage: string;
  customer_type: string | null;
  /** 計上会社（`projects.entity_code`・SCS／GSS／GMO） */
  entity_code: string | null;
  event_start: string | null;
  event_end: string | null;
  intake_channel: string | null;
  goal: string | null;
  customer_name: string | null;
  customer_short: string | null;
  estimate_amount: unknown;
  estimate_cost: unknown;
  /** 実施報告だけ（LEFT JOIN event_reports） */
  headline?: string | null;
  report_status?: string | null;
}

const numOrNull = (v: unknown): number | null => (v == null ? null : Number(v));

// ── 写真（Box `08_写真`）──────────────────────────────────────

type Photo = ProjectPageData['photos'][number];

async function listProjectPhotos(projectId: string): Promise<Photo[]> {
  if (!isBoxConfigured()) return [];
  try {
    const top = await listProjectFolder(projectId, 'external');
    const folder = top.items.find((i) => i.type === 'folder' && i.name === PHOTOS_SUBFOLDER);
    if (!folder) return [];
    const listing = await listFolderItems(folder.id, PHOTO_SCAN_MAX);
    return listing.items
      .filter((i) => i.type === 'file' && isImageName(i.name))
      .slice(0, MAX_PHOTOS)
      .map((i) => ({ box_file_id: i.id, caption: null }));
  } catch (err) {
    // BOX が落ちていても資料の数字は出す（`listProjectFolder` と同じ決めごと）
    console.warn('[keep-pack] 写真の一覧に失敗（続行）:', projectId, (err as Error).message);
    return [];
  }
}

// ── チェック／リハ／本番（studio_bookings）──────────────────────

type KeyDate = ProjectPageData['key_dates'][number];
const KEY_DATE_LABELS: Record<string, KeyDate['label']> = { setup: 'チェック', rehearsal: 'リハ', performance: '本番' };
const KEY_DATE_ORDER: KeyDate['label'][] = ['チェック', 'リハ', '本番'];

function timeOf(value: string | null | undefined): string | null {
  if (!value || value.length <= 10) return null;
  const m = /(\d{1,2}:\d{2})/.exec(value.slice(10));
  return m ? m[1] : null;
}

/** `10/3（土）13:00〜18:00`。終日・時刻の無い予約は日付だけ */
function bookingText(startTime: string, endTime: string | null, allDay: boolean): string {
  const day = dateLabel(startTime, { withYear: false });
  const s = allDay ? null : timeOf(startTime);
  const e = allDay ? null : timeOf(endTime);
  if (!s) return day;
  return e ? `${day}${s}〜${e}` : `${day}${s}`;
}

async function listKeyDates(ids: string[]): Promise<Map<string, KeyDate[]>> {
  const rows = await queryAll(
    `SELECT b.project_id, b.booking_type, b.start_time, b.end_time, b.all_day
       FROM studio_bookings b
      WHERE b.project_id = ANY(?) AND b.deleted_at IS NULL
        AND b.booking_type IN ('setup', 'rehearsal', 'performance')
      ORDER BY b.start_time`,
    [ids],
  ) as { project_id: string; booking_type: string; start_time: string; end_time: string | null; all_day: unknown }[];
  const texts = new Map<string, Map<KeyDate['label'], string[]>>();
  for (const r of rows) {
    const label = KEY_DATE_LABELS[r.booking_type];
    if (!label || !r.start_time) continue;
    const byLabel = texts.get(r.project_id) ?? new Map<KeyDate['label'], string[]>();
    const list = byLabel.get(label) ?? [];
    list.push(bookingText(r.start_time, r.end_time, Number(r.all_day) === 1));
    byLabel.set(label, list);
    texts.set(r.project_id, byLabel);
  }
  const out = new Map<string, KeyDate[]>();
  for (const [projectId, byLabel] of texts) {
    out.set(projectId, KEY_DATE_ORDER
      .filter((label) => byLabel.has(label))
      .map((label) => ({ label, text: byLabel.get(label)!.join('、') })));
  }
  return out;
}

// ── 1ページ分 ────────────────────────────────────────────────

function summaryLines(goal: string | null): string[] {
  return (goal ?? '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}

/**
 * 案件の一覧（`PAGE_SOURCE_COLUMNS` で引いた行）から `ProjectPageData[]` を組む。
 * `ordinal` は渡した順（①②…）。実施報告（`kind: 'event_report'`）だけ総括・箇条書きを入れる。
 */
export async function buildProjectPages(
  sources: PageSource[], kind: 'project_page' | 'event_report',
): Promise<ProjectPageData[]> {
  if (sources.length === 0) return [];
  const ids = sources.map((s) => s.id);
  const [summaries, keyDates, kpts] = await Promise.all([
    projectService.getSummaries(ids),
    listKeyDates(ids),
    // ⚠️ **人が確かめた行だけ**（`listEventReports` と同じ。AI の推測をそのまま資料に載せない）
    kind === 'event_report'
      ? listKptForProjects(ids, { confirmedOnly: true })
      : Promise.resolve(new Map<string, KptRow[]>()),
  ]);
  // 写真は BOX を叩くので**順に**引く（案件数ぶん同時に投げると BOX に絞られる）
  const photos = new Map<string, Photo[]>();
  for (const id of ids) photos.set(id, await listProjectPhotos(id));

  return sources.map((s, i) => {
    const summary = summaries.get(s.id);
    const estimateAmount = numOrNull(s.estimate_amount);
    const estimateCost = numOrNull(s.estimate_cost);
    let revenue: number | null = null;
    let grossProfit: number | null = null;
    let grossMargin: number | null = null;
    // **確定売上の行があるか**で実績と見る（合計 > 0 で見ると、値引き調整で合計が 0 や負になった実績が
    // 「無い」扱いになって最新見積に戻り、資料と Slack に見込の額が実績として出る・レビュー 5 回目 P2）。
    // 合計が 0 以下なら粗利率は出さない（割れない・意味も無い）
    if (summary && summary.revenue_count > 0) {
      revenue = summary.total_revenue;
      grossProfit = summary.gross_profit;
      grossMargin = summary.total_revenue > 0 ? summary.gross_margin : null;
    } else if (estimateAmount != null) {
      revenue = estimateAmount;
      grossProfit = estimateAmount - (estimateCost ?? 0);
      grossMargin = estimateAmount > 0 ? Math.round((grossProfit / estimateAmount) * 1000) / 10 : null;
    }
    const confidence = confidenceOf(s.stage);
    const status = s.report_status === 'draft' || s.report_status === 'confirmed' ? s.report_status : null;
    return {
      project_id: s.id,
      ordinal: i + 1,
      band: {
        customer_short: s.customer_short || s.customer_name || '',
        event_name: s.name,
        date_label: dateRangeLabel(s.event_start, s.event_end),
      },
      confidence,
      confidence_label: CONFIDENCE_LABELS[confidence],
      photos: photos.get(s.id) ?? [],
      summary_lines: summaryLines(s.goal),
      schedule: [],
      key_dates: keyDates.get(s.id) ?? [],
      intake_channel: s.intake_channel ?? null,
      revenue,
      gross_profit: grossProfit,
      gross_margin: grossMargin,
      headline: kind === 'event_report' ? (s.headline ?? null) : null,
      highlights: kind === 'event_report'
        ? (kpts.get(s.id) ?? []).filter((k) => k.kind === 'keep').map((k) => k.body)
        : [],
      report_status: kind === 'event_report' ? status : null,
    };
  });
}
