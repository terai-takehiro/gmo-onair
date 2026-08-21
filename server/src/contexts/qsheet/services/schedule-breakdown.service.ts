/**
 * ブレイクダウン（`GET /schedules/:id/breakdown`）— 数えた事実だけ返す。
 * `stage` も `SCRIPT_THRESHOLD` も持たない（04-schedule-impl.md §4-6・README §5-2 #13）。
 *
 * 集計は Node 側で回す（SQL に jsonb_array_elements を書くと `_break`/`_vtr` の
 * 除外条件が埋まって読めなくなるため）。`data` は collab 編集中でも最大3秒古いだけ
 * （`collab.ts` の debounce）。ブレイクダウンは目安なのでこの鮮度で足りる。
 */
import { queryAll, type Row } from '../../../shared/db/connection';
import { docTotalSec, secToMinCeil } from '../../../shared/schedule/time';

interface SectionRow {
  duration?: string | number | null;
  _pageBreak?: boolean;
  _break?: boolean;
  _vtr?: boolean;
  rows?: Array<{ duration?: string | number | null; scenario?: { entries?: Array<{ html?: string }> } }>;
}

function isRealRole(sec: SectionRow): boolean {
  return !sec._pageBreak && !sec._break && !sec._vtr;
}

export interface ItemBreakdown {
  item_id: string;
  column_id: string;
  title: string;
  qsheet_document_id: string | null;
  link_broken: boolean;
  section_count: number;
  row_count: number;
  rows_with_duration: number;
  rows_with_scenario: number;
  frame_min: number;
  doc_total_sec: number | null;
  gap_min: number | null;
}

export async function getBreakdown(scheduleId: string): Promise<ItemBreakdown[]> {
  const items = await queryAll(
    `SELECT i.id, i.column_id, i.title, i.start_min, i.end_min, i.qsheet_document_id,
            (i.qsheet_document_id IS NOT NULL AND d.id IS NULL) AS link_broken,
            CASE WHEN jsonb_typeof(d.data->'sections') = 'array' THEN d.data->'sections' ELSE NULL END AS sections
     FROM qsheet_schedule_items i
     LEFT JOIN qsheet_documents d ON d.id = i.qsheet_document_id AND d.deleted_at IS NULL
     WHERE i.schedule_id = $1 AND i.deleted_at IS NULL
       AND i.kind IN ('onair', 'rehearsal', 'recording')
     ORDER BY i.start_min`,
    [scheduleId],
  );

  return items.map((row) => computeOne(row));
}

function computeOne(row: Row): ItemBreakdown {
  const frameMin = (row.end_min as number) - (row.start_min as number);
  const sections = (row.sections as SectionRow[] | null) ?? null;
  const linkBroken = !!row.link_broken;
  const hasDoc = !!row.qsheet_document_id && !linkBroken;

  let sectionCount = 0;
  let rowCount = 0;
  let rowsWithDuration = 0;
  let rowsWithScenario = 0;

  if (hasDoc && Array.isArray(sections)) {
    for (const sec of sections) {
      if (!sec || !isRealRole(sec)) continue;
      sectionCount++;
      const rows = Array.isArray(sec.rows) ? sec.rows : [];
      for (const r of rows) {
        rowCount++;
        if (r?.duration && String(r.duration).trim() !== '' && String(r.duration).trim() !== '0') rowsWithDuration++;
        const html = r?.scenario?.entries?.[0]?.html;
        if (html && html.trim() !== '') rowsWithScenario++;
      }
    }
  }

  // 台本側と同じフォールバック（ロール尺が空なら行の合計。EditorPage.tsx:515-518 と同じ挙動）
  const docTotalSecValue = hasDoc && Array.isArray(sections) ? docTotalSec(sections, { preferRoleDuration: true }) : null;
  const gapMin = docTotalSecValue != null ? frameMin - secToMinCeil(docTotalSecValue) : null;

  return {
    item_id: row.id as string,
    column_id: row.column_id as string,
    title: row.title as string,
    qsheet_document_id: (row.qsheet_document_id as string) ?? null,
    link_broken: linkBroken,
    section_count: sectionCount,
    row_count: rowCount,
    rows_with_duration: rowsWithDuration,
    rows_with_scenario: rowsWithScenario,
    frame_min: frameMin,
    doc_total_sec: docTotalSecValue,
    gap_min: gapMin,
  };
}
