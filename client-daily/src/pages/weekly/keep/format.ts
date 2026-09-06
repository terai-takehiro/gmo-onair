/**
 * 隔週キープの数字 — 画面だけの小さな整形
 *
 * パックは**円のまま**持つ（`shared/src/keepReport/types.ts` の約束）。千円への丸めと
 * 確度の文字はここ1か所。`shared/src/keepReport/calc.ts` が同じものを持つようになったら
 * そちらを読む（資料の出力と画面で丸め方が食い違わないように）。
 */
import type { ConfidenceLetter, EntityScope, PipelineRow } from '@gmo-onair/shared/src/keepReport/types';
import { toThousandYen as toThousandYenStrict } from '@gmo-onair/shared/src/keepReport/calc';
import type { SegmentScope } from '@/lib/keepApi';

/** 円 → 千円。丸め方は資料の出力と同じ `calc.ts` の1本。null（目標が無い）はそのまま通す */
export function toThousandYen(yen: number | null | undefined): number | null {
  if (yen === null || yen === undefined || !Number.isFinite(Number(yen))) return null;
  return toThousandYenStrict(Number(yen));
}

/**
 * 確度の文字 → 札に出す**ONAiR のステージ名**。
 * 資料の語（正式申込待／提案済 ＝ `calc.ts` の `CONFIDENCE_LABELS`）は pptx で使い、
 * ONAiR の画面はステージ名のまま（keep-report.md §1.2。案件一覧と同じ言い方で読めるように）。
 */
export const STAGE_WORDS: Record<ConfidenceLetter, string> = {
  A: '受注済', B: '口頭決定', C: '見積提案', D: '仮押さえ', E: '問い合わせ',
};

/** 確度の色。A は完了の緑、B は主色、C は「別種」の情報色、D/E は灰 */
export const CONFIDENCE_TONE: Record<ConfidenceLetter, { letter: string; badge: string }> = {
  A: { letter: 'text-success', badge: 'border-success-border bg-success-surface text-success' },
  B: { letter: 'text-primary', badge: 'border-primary-border bg-primary-surface text-primary' },
  C: { letter: 'text-info', badge: 'border-info-border bg-info-surface text-info' },
  D: { letter: 'text-muted-foreground', badge: 'bg-muted text-muted-foreground' },
  E: { letter: 'text-muted-foreground', badge: 'bg-muted text-muted-foreground' },
};

/** 絞り込みチップの並びと表示名（資料の言い方 ＝ 主体 と お客様の区分の対応を1行で見せる） */
export const ENTITY_CHIPS: Array<{ key: EntityScope; label: string }> = [
  { key: 'all', label: '全体（統合）' },
  { key: 'gss', label: 'GMOサムライスタジオ ＝ グループ内' },
  { key: 'gscs', label: 'GMOサムライコンテンツスタジオ ＝ 外部' },
  { key: 'gig', label: 'GMOインターネットグループ人格' },
];

export const SEGMENT_CHIPS: Array<{ key: SegmentScope; label: string }> = [
  { key: 'all', label: 'すべて' },
  { key: 'internal', label: 'グループ内' },
  { key: 'external', label: '外部' },
];

/** 表の見出しに出す短い主体名 */
export function scopeTitle(scope: EntityScope): string {
  return ENTITY_CHIPS.find((c) => c.key === scope)?.label.split(' ＝ ')[0] ?? '全体（統合）';
}

export function parseEntity(v: string | null): EntityScope {
  return ENTITY_CHIPS.some((c) => c.key === v) ? (v as EntityScope) : 'all';
}
export function parseSegment(v: string | null): SegmentScope {
  return SEGMENT_CHIPS.some((c) => c.key === v) ? (v as SegmentScope) : 'all';
}

/** 'YYYY-MM' → '8月'（`withYear` で '2026年8月'） */
export function ymLabel(ym: string | null | undefined, withYear = false): string {
  if (!ym) return '—';
  const m = ym.match(/^(\d{4})-(\d{2})/);
  if (!m) return ym;
  const month = Number(m[2]);
  return withYear ? `${m[1]}年${month}月` : `${month}月`;
}

/** 'YYYY-MM-DD' → '9/4' */
export function mdLabel(date: string | null | undefined): string {
  if (!date) return '—';
  const m = String(date).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${Number(m[2])}/${Number(m[3])}` : String(date);
}

/** 'YYYY-MM-DD' → '8/10（月）' */
export function mdDowLabel(date: string | null | undefined): string {
  if (!date) return '—';
  const d = new Date(`${String(date).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(date);
  const dow = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
  return `${d.getMonth() + 1}/${d.getDate()}（${dow}）`;
}

/** ISO → '9/6 13:20'（凍結・生成の時刻） */
export function timeLabel(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 比率（%）。null は目標が無い */
export function pctLabel(ratio: number | null | undefined, digits = 1): string {
  if (ratio === null || ratio === undefined || !Number.isFinite(Number(ratio))) return '—';
  return `${Number(ratio).toFixed(digits)}%`;
}

/** ① ②… 資料に載せる順（21 以上は数字のまま） */
export function circled(n: number | null | undefined): string {
  if (!n || n < 1) return '—';
  return n <= 20 ? String.fromCodePoint(0x245f + n) : String(n);
}

/**
 * ヨミ表の「資料」の印。パックの `project_pages` は「印を付けた案件」そのものなので、
 * 行に印が無くてもそこから引ける（行が `keep_pick` を持つ版ではそちらを優先）。
 */
export function pickOf(row: PipelineRow, pickedIds: ReadonlySet<string>): boolean {
  const own = (row as PipelineRow & { keep_pick?: boolean }).keep_pick;
  return typeof own === 'boolean' ? own : pickedIds.has(row.project_id);
}
