// Excel 取込の適用（実装設計 03-excel.md §8-1・地雷#1 P0 対策）。
//
// サーバーは `qsheet_documents.data` を直接書かない（collab の persist に上書きされる・
// id の安全網がクライアントにしかない）。サーバーが返すのは**完全な data ではなく操作リスト
// （PlanOp[]）**。ここは「その時点の実際の prev」に対して操作を適用する純関数で、
// `updateData(prev => applyOps(prev, plan.ops))` から呼ぶ
// （collab 有効時は applyDataUpdate が Y.Doc の最新状態を prev として渡すため、
//  parse→確認→適用の間に他人・自分の別タブが足した行を黙って消さない）。
//
// `prev` に無い id への update/trash は黙って無視する（消された行を復活させない。§8-1）。

export type PlanOp =
  | { op: "update_section"; sectionId: string; set: Record<string, unknown> }
  | { op: "add_section"; afterSectionId: string | null; section: Record<string, unknown> }
  | { op: "trash_section"; sectionId: string }
  | { op: "update_row"; sectionId: string; rowId: string; set: Record<string, unknown> }
  | { op: "add_row"; sectionId: string; afterRowId: string | null; row: Record<string, unknown> }
  | { op: "trash_row"; sectionId: string; rowId: string }
  | { op: "set_extra"; key: "masters" | "ledScenes" | "stageTemplates" | "meta"; value: unknown };

type Row = Record<string, any> & { id: string };
type Section = Record<string, any> & { id: string; rows?: Row[] };
type DocumentData = Record<string, any> & { sections?: Section[] };

function mergeSet<T extends Record<string, any>>(target: T, set: Record<string, unknown>): T {
  const next: Record<string, any> = { ...target };
  for (const [k, v] of Object.entries(set)) {
    if (k === "cells" && v && typeof v === "object") {
      next.cells = { ...((target as Record<string, any>).cells || {}), ...(v as Record<string, unknown>) };
    } else {
      next[k] = v;
    }
  }
  return next as T;
}

function insertAfter<T extends { id: string }>(list: T[], item: T, afterId: string | null): T[] {
  if (afterId == null) return [...list, item];
  const idx = list.findIndex((x) => x.id === afterId);
  if (idx < 0) return [...list, item];
  const next = list.slice();
  next.splice(idx + 1, 0, item);
  return next;
}

/**
 * `prev`（その時点の実際の台本データ）に `ops` を適用した `next` を返す。
 * 追加・更新のみ安全に反映し、`prev` に無い id への操作は無視する
 * （同時編集で既に消えた行を復活させたり、無い行を触ったりしない）。
 */
export function applyOps(prev: DocumentData, ops: PlanOp[]): DocumentData {
  let sections: Section[] = Array.isArray(prev?.sections) ? [...prev.sections] : [];
  const extras: Record<string, unknown> = {};

  const findSectionIdx = (id: string) => sections.findIndex((s) => s?.id === id);

  for (const op of ops) {
    switch (op.op) {
      case "add_section": {
        const section: Section = { rows: [], ...(op.section as Section) };
        sections = insertAfter(sections, section, op.afterSectionId);
        break;
      }
      case "update_section": {
        const idx = findSectionIdx(op.sectionId);
        if (idx < 0) break; // prev に無い＝既に削除済み。黙って無視（§8-1）
        sections[idx] = mergeSet(sections[idx], op.set) as Section;
        break;
      }
      case "trash_section": {
        const idx = findSectionIdx(op.sectionId);
        if (idx < 0) break;
        sections = sections.filter((s) => s.id !== op.sectionId);
        break;
      }
      case "add_row": {
        const idx = findSectionIdx(op.sectionId);
        if (idx < 0) break; // 対象ロールが無い（同時に消された等）→ 静かに諦める
        const row: Row = { duration: "", cells: {}, ...(op.row as Row) };
        const rows = Array.isArray(sections[idx].rows) ? sections[idx].rows! : [];
        sections = sections.slice();
        sections[idx] = { ...sections[idx], rows: insertAfter(rows, row, op.afterRowId) };
        break;
      }
      case "update_row": {
        const idx = findSectionIdx(op.sectionId);
        if (idx < 0) break;
        const rows = sections[idx].rows || [];
        const rIdx = rows.findIndex((r) => r?.id === op.rowId);
        if (rIdx < 0) break; // prev に無い＝既に削除済み。黙って無視
        const newRows = rows.slice();
        newRows[rIdx] = mergeSet(newRows[rIdx], op.set);
        sections = sections.slice();
        sections[idx] = { ...sections[idx], rows: newRows };
        break;
      }
      case "trash_row": {
        const idx = findSectionIdx(op.sectionId);
        if (idx < 0) break;
        const rows = (sections[idx].rows || []).filter((r) => r?.id !== op.rowId);
        sections = sections.slice();
        sections[idx] = { ...sections[idx], rows };
        break;
      }
      case "set_extra": {
        extras[op.key] = op.value;
        break;
      }
    }
  }

  return { ...prev, ...extras, sections };
}
