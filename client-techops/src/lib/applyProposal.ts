// AI 提案の取り込みの唯一の入口（段7 §4-2）。
//
// ⚠️ **生成機能はまだ無い**（段8）。この段で作るのは「提案を data へ書き込む純関数」だけで、
// 呼び出し口（生成ボタン・プレビュー画面）は次段。往復テストのために先に固める。
//
// 対象は ②骨格（script_outline_draft）と ③セリフ（script_line_draft）の2つ。
// ①イベント設計（event_plan_draft）は `qsheet_schedule_items` への REST 書き込みで、
// Yjs の `data` を触らないため、この関数の対象外（段8で別の入口を作る）。
import { genId } from "./stableIds";
import { normalizeDur } from "./time";

export interface AppliedIds {
  sections: string[];
  rows: string[];
  items: string[];
  columns: string[];
}

export interface ScriptOutlineProposalRow {
  key: string;
  label: string;
  duration_sec: number;
  speaker: string | null;
  hint?: string | null;
}
export interface ScriptOutlineProposalSection {
  key: string;
  label: string;
  duration_sec: number;
  rows: ScriptOutlineProposalRow[];
}
export interface ScriptOutlineProposal {
  budget_sec: number | null;
  sections: ScriptOutlineProposalSection[];
}

export interface ScriptLinesProposalLine {
  row_id: string;
  name: string;
  text: string;
  is_q_word?: boolean;
}
export interface ScriptLinesProposal {
  lines: ScriptLinesProposalLine[];
  advice?: string[];
}

export type ProposalPlan = ScriptOutlineProposal | ScriptLinesProposal;

export interface ApplyPlanResult {
  data: any;
  appliedIds: AppliedIds;
  /** サーバーの `POST /apply` にそのまま送る（§4-4「data と同じ表現」） */
  appliedPayload: { rows: any[] };
  /** 提案の一時キー（または row_id）→ 採番された id。`rejected_keys` の計算に使う */
  keyToId: Record<string, string>;
}

function emptyIds(): AppliedIds {
  return { sections: [], rows: [], items: [], columns: [] };
}

function findScenarioBlockId(blocks: any[] | undefined): string | null {
  const blk = Array.isArray(blocks) ? blocks.find((b) => b?.type === "scenario") : null;
  return blk?.id ?? null;
}

function scenarioCell(name: string, html: string, isQWord = false) {
  return { entries: [{ name, html, isQWord }] };
}

/**
 * ②骨格の提案を data へ流し込む。**`prev.sections` をそのまま活かして末尾に足す**
 * （既存のロールを壊さない）。台詞（`html`）は書かない（§2-4）— 骨格の段は
 * ラベル・尺・話者だけを置く。
 */
function applyOutline(prev: any, plan: ScriptOutlineProposal): ApplyPlanResult {
  const scenarioBlockId = findScenarioBlockId(prev?.blocks);
  const appliedIds = emptyIds();
  const keyToId: Record<string, string> = {};
  const appliedRows: any[] = [];

  const newSections = plan.sections.map((s) => {
    const secId = genId("sec");
    appliedIds.sections.push(secId);
    keyToId[s.key] = secId;

    const rows = s.rows.map((r) => {
      const rowId = genId("row");
      appliedIds.rows.push(rowId);
      keyToId[r.key] = rowId;
      const row: any = {
        id: rowId,
        label: r.label,
        duration: normalizeDur(r.duration_sec),
        cells: scenarioBlockId ? { [scenarioBlockId]: scenarioCell(r.speaker ?? "", "") } : {},
      };
      appliedRows.push(row);
      return row;
    });

    return { id: secId, label: s.label, duration: normalizeDur(s.duration_sec), rows };
  });

  const data = { ...prev, sections: [...(prev?.sections ?? []), ...newSections] };
  return { data, appliedIds, appliedPayload: { rows: appliedRows }, keyToId };
}

/**
 * ③セリフの提案を data へ流し込む。**既存の行だけを埋める**（行を増やさない）。
 * `plan.lines[].row_id` が `prev` に実在しない場合は無視する
 * （AI が幻覚した id で書き込ませない。サーバー側の `normalize` でも落とすが、二重に守る）。
 */
function applyLines(prev: any, plan: ScriptLinesProposal): ApplyPlanResult {
  const scenarioBlockId = findScenarioBlockId(prev?.blocks);
  const existingRowIds = new Set<string>();
  for (const sec of prev?.sections ?? []) {
    for (const row of sec?.rows ?? []) if (row?.id) existingRowIds.add(row.id);
  }

  const appliedIds = emptyIds();
  const keyToId: Record<string, string> = {};
  const appliedRows: any[] = [];
  const byRowId = new Map(plan.lines.filter((l) => existingRowIds.has(l.row_id)).map((l) => [l.row_id, l]));

  const newSections = (prev?.sections ?? []).map((sec: any) => {
    if (!Array.isArray(sec.rows) || sec.rows.length === 0) return sec;
    let changed = false;
    const rows = sec.rows.map((row: any) => {
      const line = byRowId.get(row.id);
      if (!line || !scenarioBlockId) return row;
      changed = true;
      appliedIds.rows.push(row.id);
      keyToId[line.row_id] = row.id;
      const nextRow = { ...row, cells: { ...row.cells, [scenarioBlockId]: scenarioCell(line.name, line.text, !!line.is_q_word) } };
      appliedRows.push(nextRow);
      return nextRow;
    });
    return changed ? { ...sec, rows } : sec;
  });

  const data = { ...prev, sections: newSections };
  return { data, appliedIds, appliedPayload: { rows: appliedRows }, keyToId };
}

/**
 * 提案を data へ流し込む純関数。**呼び出し側は必ず**
 * `applyDataUpdate(ydoc, (prev) => applyProposalOps(prev, kind, plan).data)` の形で使うこと。
 *
 * ⚠️ **`prev` を受け取らない updater（引数無しの矢印関数で完成品を返す形）で
 * `applyDataUpdate` を呼んではいけない**。そのやり方だと定数スナップショットと同じ扱いになり、
 * 同時編集で入った行が黙って消える（07-ai-proposals-impl.md §4-2）。
 */
export function applyProposalOps(
  prev: any,
  kind: "script_outline_draft" | "script_line_draft",
  plan: ProposalPlan,
): ApplyPlanResult {
  if (kind === "script_outline_draft") return applyOutline(prev, plan as ScriptOutlineProposal);
  return applyLines(prev, plan as ScriptLinesProposal);
}
