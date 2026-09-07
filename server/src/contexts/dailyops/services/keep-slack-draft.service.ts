/**
 * Slack の定例投稿の下書き — 定例報告パックから文面を組む（keep-report.md §6.2「Slack の定例投稿は後日」の下準備）
 *
 * ── 決めごと ────────────────────────────────────────────────
 * - **パックを読むだけ**（§0「bot 化の下準備」: Slack も pptx もパックを読み、人の直しは構成側に持つ）。
 *   判定・比率・差はパックの計算済みの列をそのまま出す。ここで足し引きしない（§5.3）
 * - **決定的な整形で、AI ではない。** 同じパックからは必ず同じ文になるので `ai_outputs` には記録しない。
 *   bot が投稿したら**投稿の id（ts）を版に残す**のが §10 の条件3 — それは bot 側の仕事（docs/mcp-server.md）
 * - 金額は千円（3桁区切り・丸め方は `shared/src/keepReport/calc.ts` の `toThousandYen` と同じ）、比率は小数1桁、
 *   **絵文字は使わない**（○✕は文字）。mrkdwn の太字（`*…*`）は見出しの1行だけ
 * - 前回の資料（凍結した版・`previousPack`）があれば、動いた数字に ＊ を付けて脚注で説明する
 *   （資料の「変更点は赤字」の文字版。どの数字が動いたかは `keep-pack-diff.ts` と同じ判定）
 *
 * HTTP（`GET /dailyops/keep/slack-draft`）と MCP（`get_keep_slack_draft`）は `getSlackDraftForMeeting` の1本を通る。
 */
import { CONFIDENCE_ORDER, dateLabel } from './keep-pack-calc';
import { changedPlKeys, previousPlTable } from './keep-pack-diff';
import { getPackForMeeting } from './keep-pack-store.service';
import { loadPreviousPack } from './keep-prev-pack.service';
import {
  BUSINESS_ENTITIES, BUSINESS_ENTITY_LABELS,
  type BudgetLine, type BusinessEntity, type KeepReportPack, type MonthlyPlTable, type PipelineRow, type ProjectPageData,
} from './keep-pack.types';

export interface SlackDraftOptions {
  /** 見出しに出す会議日。省略時はパックの会議日 */
  meetingDate?: string | null;
  /** 前回の資料のパック（凍結版）。あれば動いた数字に ＊ を付ける */
  previousPack?: KeepReportPack | null;
}

/** ヨミ表に載せる上限（Slack は流し読みなので資料の 16 行より少なく） */
const MAX_PIPELINE_ROWS = 8;
/** 数値報告で Slack に出す3行 */
const HEADLINE_KEYS: readonly BudgetLine['key'][] = ['revenue', 'gross_profit', 'operating_profit'];
/** 動いた数字の印（`*` は mrkdwn の太字なので全角） */
const CHANGED_MARK = '＊';

/** 円 → 「1,762千円」。負は ASCII の − で 3桁区切り。丸め方は `toThousandYen` と同じ（絶対値で丸めて符号を戻す） */
export function senLabel(yen: number | null | undefined): string {
  if (yen == null || !Number.isFinite(yen)) return '—';
  const r = Math.sign(yen) * Math.round(Math.abs(yen) / 1000);
  return `${(r === 0 ? 0 : r).toLocaleString('ja-JP')}千円`;
}

/** 'YYYY-MM' → '8月' */
const monthLabel = (ym: string): string => `${Number(ym.slice(5, 7))}月`;

/** 'YYYY-MM-DD' → '9/20'。範囲は '9/20〜9/22'。無ければ '未定' */
function mdLabel(start: string | null | undefined, end?: string | null): string {
  const md = (s: string) => { const m = /^\d{4}-(\d{2})-(\d{2})/.exec(s); return m ? `${Number(m[1])}/${Number(m[2])}` : s; };
  if (!start) return '未定';
  return end && end.slice(0, 10) !== start.slice(0, 10) ? `${md(start)}〜${md(end)}` : md(start);
}

/** ISO の時刻 → 日本時間の 'M/D HH:MM'（凍結・生成の時刻。サーバーの時差に依存しない） */
export function jstTimeLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const parts = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d);
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('month')}/${get('day')} ${get('hour')}:${get('minute')}`;
}

/** 1行の数字: 「売上高 1,762千円（目標比 8.4%・✕）」。目標が無ければ「（目標なし）」。動いていれば ＊ */
function lineLabel(l: BudgetLine, changed: ReadonlySet<string>): string {
  const moved = changed.has(`${l.key}.actual`) || changed.has(`${l.key}.ratio`) || changed.has(`${l.key}.judge`);
  const ratio = l.ratio == null ? '目標なし' : `目標比 ${l.ratio.toFixed(1)}%${l.judge === '-' ? '' : `・${l.judge}`}`;
  return `${l.label} ${senLabel(l.actual)}${moved ? CHANGED_MARK : ''}（${ratio}）`;
}

/** 表の3行（売上高／粗利／営業利益）を `sep` でつなぐ */
function headline(t: MonthlyPlTable, changed: ReadonlySet<string>, sep: string): string {
  return HEADLINE_KEYS
    .map((k) => t.lines.find((l) => l.key === k))
    .filter((l): l is BudgetLine => !!l)
    .map((l) => lineLabel(l, changed))
    .join(sep);
}

/** ヨミ表の並び（確度 → 実施日 → 名前）。パックの2表（外部・サムライ）を1つにする */
function sortedPipeline(pack: KeepReportPack): PipelineRow[] {
  return [...pack.pipeline.external, ...pack.pipeline.samurai].sort((a, b) => {
    const ca = CONFIDENCE_ORDER.indexOf(a.confidence);
    const cb = CONFIDENCE_ORDER.indexOf(b.confidence);
    if (ca !== cb) return ca - cb;
    const ea = a.event_start ?? '9999-12-31';
    const eb = b.event_start ?? '9999-12-31';
    if (ea !== eb) return ea < eb ? -1 : 1;
    return a.name.localeCompare(b.name, 'ja');
  });
}

function pipelineLine(r: PipelineRow): string {
  const mark = r.since_last === 'new' ? '【新規】' : r.since_last === 'updated' ? '【更新】' : '';
  const amount = r.estimate_amount == null ? '見積なし' : senLabel(r.estimate_amount);
  return `・${r.confidence}（${r.probability}%）${mark}${r.name}／${r.customer_name}／${mdLabel(r.event_start, r.event_end)}／${amount}`;
}

function reportLine(r: ProjectPageData): string {
  const date = r.band.date_label.replace(/^\d{4}\//, '') || '日付未定';
  const money = r.revenue == null
    ? '売上 未登録'
    : `売上 ${senLabel(r.revenue)}${r.gross_margin != null ? `／粗利率 ${r.gross_margin.toFixed(1)}%` : ''}`;
  return `・${date} ${r.band.event_name}（${r.band.customer_short}）: ${money}${r.report_status === 'draft' ? '（ふりかえりは下書き）' : ''}`;
}

/** パック → Slack に貼る文（mrkdwn）。同じパックからは同じ文 */
export function buildSlackDraft(pack: KeepReportPack, opts: SlackDraftOptions = {}): string {
  const prev = opts.previousPack ?? null;
  const changedOf = (t: MonthlyPlTable, entity: 'all' | BusinessEntity) =>
    changedPlKeys(previousPlTable(prev, entity, t.year_month), t);
  const out: string[] = [];
  let starred = false;
  const push = (line: string) => { if (line.includes(CHANGED_MARK)) starred = true; out.push(line); };

  push(`*隔週キープ ${dateLabel(opts.meetingDate ?? pack.meeting_date, { withYear: false })}の数字*`);

  // 前月の着地（全体・計上会社別）
  const landing = pack.landing.all;
  push(`■ ${monthLabel(landing.year_month)} 着地（全体）`);
  for (const k of HEADLINE_KEYS) {
    const l = landing.lines.find((x) => x.key === k);
    if (l) push(`・${lineLabel(l, changedOf(landing, 'all'))}`);
  }
  // 計上会社別（GJV・GSS・数字があるときだけ GMO。並びは legal_entities.sort_order）
  push('計上会社別');
  for (const e of BUSINESS_ENTITIES) {
    const t = pack.landing[e];
    if (t) push(`・${BUSINESS_ENTITY_LABELS[e]}: ${headline(t, changedOf(t, e), '／')}`);
  }

  // 当月の見込（全体・1行）
  const forecast = pack.forecast.all;
  push(`■ ${monthLabel(forecast.year_month)} 見込（全体）: ${headline(forecast, changedOf(forecast, 'all'), '／')}`);

  // ヨミ表（確度順・上位）
  const rows = sortedPipeline(pack);
  push(`■ ヨミ表（確度順・上位${Math.min(rows.length, MAX_PIPELINE_ROWS)}件）`);
  if (rows.length === 0) push('・案件はありません');
  for (const r of rows.slice(0, MAX_PIPELINE_ROWS)) push(pipelineLine(r));
  if (rows.length > MAX_PIPELINE_ROWS) push(`・ほか ${rows.length - MAX_PIPELINE_ROWS} 件（ONAiR のヨミ表を参照）`);

  // 実施報告
  push('■ 実施報告');
  if (pack.event_reports.length === 0) push('・前回の会議日以降に終えた本番はありません');
  for (const r of pack.event_reports) push(reportLine(r));

  // 内覧会
  const v = pack.inview;
  if (v) {
    push(`■ 内覧会（${mdLabel(v.session_date)}）`);
    const sat = v.satisfaction == null ? '満足度 未入力' : `満足度 ${v.satisfaction}／4.0`;
    push(`・${v.groups}組 ${v.people}名・${sat}・ヨミ化 ${v.promoted_projects}件`);
    if (v.next_session) push(`・次回 ${mdLabel(v.next_session.date)}・申込 ${v.next_session.applied_groups}組`);
  } else {
    push('■ 内覧会');
    push('・直近の定期内覧会はありません');
  }

  // 見込に含めた未確定の売上（注記）— 確度加味で表に入っているもの
  push(`■ ${monthLabel(forecast.year_month)}の見込に含めた未確定の売上（確度加味）`);
  if (forecast.unconfirmed.length === 0) push('・なし');
  for (const u of forecast.unconfirmed) push(`・${u.project_name} ${senLabel(u.amount)}`);
  // 本番があるのに売上が未登録の案件 — 表には入っていない（登録し忘れの注意。無ければ節ごと出さない）
  if (forecast.unregistered.length > 0) {
    push(`■ ${monthLabel(forecast.year_month)}に本番があるのに売上が未登録の案件（見込には入れていない・見積または想定額）`);
    for (const u of forecast.unregistered) push(`・${u.project_name} ${senLabel(u.amount)}`);
  }

  // 脚注と数字の元
  if (starred && prev) push(`${CHANGED_MARK}＝前回（${mdLabel(prev.meeting_date)}）の資料から変わった数字`);
  const source = pack.frozen_at
    ? `凍結 ${jstTimeLabel(pack.frozen_at)}`
    : `いまの数字・${jstTimeLabel(pack.generated_at)} 時点`;
  push(`数字の元: ONAiR 定例報告パック（${source}）`);
  return out.join('\n');
}

export interface SlackDraftResponse {
  text: string;
  pack_id: string | null;
  /** 凍結した版から組んだか（false は「いまの数字」） */
  frozen: boolean;
  meeting_date: string;
}

/** 会議日の文面。パックは `getPackForMeeting`（凍結版があればそれ）、前回の資料は `loadPreviousPack` */
export async function getSlackDraftForMeeting(opts: {
  meetingDate?: string | null; entity?: unknown; segment?: unknown; live?: boolean;
}): Promise<SlackDraftResponse> {
  const r = await getPackForMeeting(opts);
  const previousPack = await loadPreviousPack(r.pack.meeting_date);
  return {
    text: buildSlackDraft(r.pack, { meetingDate: r.pack.meeting_date, previousPack }),
    pack_id: r.pack_id,
    frozen: r.frozen,
    meeting_date: r.pack.meeting_date,
  };
}
