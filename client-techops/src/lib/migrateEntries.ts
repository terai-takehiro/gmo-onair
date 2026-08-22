// 既存ドキュメントを新しい形へ寄せる読み込み時マイグレーション。
//
// 呼ぶのは EditorPage の読み込み直後 1 回だけ (`normalizeQsheetData`)。
// サーバーは `qsheet_documents.data` を書けない (Yjs の所有物) ので、
// ここで正規化した結果は `applyDataUpdate` 経由で書き戻される。
//
//  1. splitMultiEntryRows      — 複数エントリ行 → 単一エントリ行 (v2.8.155)
//  2. migrateStageTemplateRefs — stage_diagram セルの `templateIndex` (配列 index) →
//                                `templateId` (id 参照)。ひな形削除でずれないようにする
//  3. migrateMobileCellShapes  — モバイル編集が書いた旧形のセルを PC と同じ形に寄せる
import { genId } from "./stableIds";

type Row = Record<string, any> & { cells?: Record<string, any> };
type Section = Record<string, any> & { rows?: Row[] };
type DocumentData = Record<string, any> & { sections?: Section[] };

// エントリを持たせる対象のブロック種別 (それ以外はセル単位の row-level データ)
const ENTRY_BLOCK_TYPES = new Set(["scenario", "video", "audio", "telop", "led_xr"]);
// {value} 形のセルを持つブロック種別
const VALUE_BLOCK_TYPES = new Set(["remarks", "item", "lighting"]);
// led_xr の Cue / トランジション — PC の <select> の選択肢 (CueRow.tsx と同じ値)
const LED_CUE_OPTIONS = ["V明け", "Qワード", "卓D"];
const LED_TRANSITION_OPTIONS = ["F.I.", "C.I."];

function blockTypeMap(data: DocumentData): Map<string, string> {
  const map = new Map<string, string>();
  for (const b of (data as any).blocks || []) {
    if (b?.id && b?.type) map.set(b.id, b.type);
  }
  return map;
}

function maxEntryCount(row: Row, blockTypes: Map<string, string>): number {
  if (!row.cells) return 1;
  let max = 1;
  for (const [blockId, cell] of Object.entries(row.cells)) {
    const type = blockTypes.get(blockId);
    if (!type || !ENTRY_BLOCK_TYPES.has(type)) continue;
    const len = Array.isArray((cell as any)?.entries) ? (cell as any).entries.length : 0;
    if (len > max) max = len;
  }
  return max;
}

function buildRowAtEntryIndex(
  row: Row,
  ei: number,
  blockTypes: Map<string, string>,
  isFirst: boolean,
): Row {
  const newCells: Record<string, any> = {};
  for (const [blockId, cell] of Object.entries(row.cells || {})) {
    const type = blockTypes.get(blockId);
    if (type && ENTRY_BLOCK_TYPES.has(type)) {
      // entries を持つ系: i 番目の 1 エントリだけ抜き出す
      const entries = Array.isArray((cell as any)?.entries) ? (cell as any).entries : [];
      const entry = entries[ei];
      if (entry) {
        newCells[blockId] = { ...(cell as any), entries: [entry] };
      } else {
        // i 番目のエントリが無い場合は空セル
        newCells[blockId] = { entries: [] };
      }
    } else {
      // audio_mic / stage_diagram / slide / remarks / item など: row-level データ。
      // 最初の行にだけ残し、複製先には空セルを置く。
      if (isFirst) {
        newCells[blockId] = cell;
      } else {
        newCells[blockId] = {};
      }
    }
  }
  return {
    ...row,
    // duration / label / id 等の row-level メタは最初の行にだけ残す
    duration: isFirst ? row.duration : "",
    label: isFirst ? row.label : "",
    // 複製行は新規 id (元の id は最初の行が保持)
    id: isFirst ? row.id : undefined,
    cells: newCells,
  };
}

export interface MigrateResult {
  data: DocumentData;
  changed: boolean;
  splitRows: number;
}

/**
 * 複数エントリ行を単一エントリ行へ分割する。
 * 既に単一エントリ化されているデータには影響しない。
 */
export function splitMultiEntryRows(data: DocumentData): MigrateResult {
  if (!data?.sections || !Array.isArray(data.sections)) {
    return { data, changed: false, splitRows: 0 };
  }
  const blockTypes = blockTypeMap(data);

  let changed = false;
  let splitRows = 0;
  const newSections = data.sections.map((sec) => {
    if (!sec?.rows || !Array.isArray(sec.rows)) return sec;
    const newRows: Row[] = [];
    for (const row of sec.rows) {
      const count = maxEntryCount(row, blockTypes);
      if (count <= 1) {
        newRows.push(row);
      } else {
        changed = true;
        splitRows += 1;
        for (let ei = 0; ei < count; ei++) {
          newRows.push(buildRowAtEntryIndex(row, ei, blockTypes, ei === 0));
        }
      }
    }
    if (!changed && newRows.length === sec.rows.length) return sec;
    return { ...sec, rows: newRows };
  });

  if (!changed) return { data, changed: false, splitRows: 0 };
  return { data: { ...data, sections: newSections }, changed: true, splitRows };
}

// ============================================================
// migrateStageTemplateRefs — stage_diagram セルの templateIndex → templateId
// ============================================================
//
// 旧形: セルは data.stageTemplates[] の配列 index (`templateIndex`) を持つ。
//       ひな形を1つ消すと、それより後ろの index を指していた全行が別の図にずれる。
// 新形: stageTemplates[] の各要素に安定 id を持たせ、セルは id (`templateId`) で参照する。
//
// 変換できない index (範囲外・未選択の -1) は `templateId: null` にする (D6)。
export function migrateStageTemplateRefs(data: DocumentData): { data: DocumentData; changed: boolean } {
  const templates = Array.isArray((data as any)?.stageTemplates) ? (data as any).stageTemplates : null;
  if (!templates) return { data, changed: false };

  let changed = false;

  // 1) 既存ひな形に id が無ければ付与する (並び順は変えない)
  const newTemplates = templates.map((t: any) => {
    if (t && typeof t === "object" && !t.id) {
      changed = true;
      return { ...t, id: genId("stg") };
    }
    return t;
  });

  if (!data?.sections || !Array.isArray(data.sections)) {
    if (!changed) return { data, changed: false };
    return { data: { ...data, stageTemplates: newTemplates }, changed: true };
  }

  const blockTypes = blockTypeMap(data);

  // 2) row.cells の templateIndex → templateId
  const newSections = data.sections.map((sec) => {
    if (!sec?.rows || !Array.isArray(sec.rows)) return sec;
    let secChanged = false;
    const newRows = sec.rows.map((row) => {
      if (!row?.cells) return row;
      let rowChanged = false;
      const newCells: Record<string, any> = { ...row.cells };
      for (const [blockId, cell] of Object.entries(row.cells)) {
        if (blockTypes.get(blockId) !== "stage_diagram") continue;
        if (!cell || typeof cell !== "object" || "templateId" in cell) continue; // 移行済み・空
        const idx = (cell as any).templateIndex;
        let templateId: string | null = null;
        if (typeof idx === "number" && idx >= 0 && idx < newTemplates.length) {
          templateId = newTemplates[idx]?.id ?? null;
        }
        const { templateIndex: _drop, ...rest } = cell as Record<string, any>;
        newCells[blockId] = { ...rest, templateId };
        rowChanged = true;
      }
      if (!rowChanged) return row;
      secChanged = true;
      return { ...row, cells: newCells };
    });
    if (!secChanged) return sec;
    changed = true;
    return { ...sec, rows: newRows };
  });

  if (!changed) return { data, changed: false };
  return { data: { ...data, stageTemplates: newTemplates, sections: newSections }, changed: true };
}

// ============================================================
// migrateMobileCellShapes — モバイル編集が書いた旧形セルを PC と同じ形に寄せる
// ============================================================
//
// モバイル (CueRowMobileEditor) はこの段の修正前、型を無視して常に
// `{ entries: [{ label }] }` でセルを丸ごと置き換えていた。
//   - remarks/item/lighting (本来 {value} 形) → PC で空に見える
//   - stage_diagram/slide (本来 row-level の {templateId,note} / {image}) →
//     テンプレの選択・画像が**復元不能に消えている** (この移行では戻せない。
//     ここでできるのは、意味の無い残骸 (entries キー) を取り除く正規化まで)
//   - led_xr の Cue/トランジションは自由文で書かれており、PC の <select> と
//     一致しない → 既知の選択肢に一致すればそのまま、しなければ「任意入力」に寄せる
export function migrateMobileCellShapes(data: DocumentData): { data: DocumentData; changed: boolean } {
  if (!data?.sections || !Array.isArray(data.sections)) return { data, changed: false };
  const blockTypes = blockTypeMap(data);

  let changed = false;
  const newSections = data.sections.map((sec) => {
    if (!sec?.rows || !Array.isArray(sec.rows)) return sec;
    let secChanged = false;
    const newRows = sec.rows.map((row) => {
      if (!row?.cells) return row;
      let rowChanged = false;
      const newCells: Record<string, any> = { ...row.cells };

      for (const [blockId, cell] of Object.entries(row.cells)) {
        const type = blockTypes.get(blockId);
        if (!type || !cell || typeof cell !== "object") continue;

        if (VALUE_BLOCK_TYPES.has(type)) {
          // 旧モバイル形式: {entries:[{label, highlight?}]} → {value, highlight?}
          if (Array.isArray((cell as any).entries) && !("value" in cell)) {
            const e0 = (cell as any).entries[0] || {};
            const next: Record<string, any> = { value: e0.label || "" };
            if (e0.highlight !== undefined) next.highlight = e0.highlight;
            newCells[blockId] = next;
            rowChanged = true;
          }
          continue;
        }

        if (type === "stage_diagram" || type === "slide") {
          // 旧モバイル形式が誤って書いた entries はこのセルにとって無意味なので取り除く。
          // 元の templateId/note や image は破壊的置換の時点で失われており復元できない。
          if (Array.isArray((cell as any).entries)) {
            const { entries: _drop, ...rest } = cell as Record<string, any>;
            newCells[blockId] = rest;
            rowChanged = true;
          }
          continue;
        }

        if (type === "led_xr" && Array.isArray((cell as any).entries)) {
          let entryChanged = false;
          const newEntries = (cell as any).entries.map((en: any) => {
            if (!en || typeof en !== "object") return en;
            let next = en;
            if ("cue" in next && !("cueType" in next)) {
              const raw = next.cue;
              const { cue: _cue, ...rest } = next;
              if (raw && LED_CUE_OPTIONS.includes(raw)) {
                next = { ...rest, cueType: raw };
              } else if (raw) {
                next = { ...rest, cueType: "custom", cueCustom: raw };
              } else {
                next = { ...rest, cueType: "" };
              }
              entryChanged = true;
            }
            if (
              typeof next.transition === "string" &&
              next.transition &&
              next.transition !== "custom" &&
              !LED_TRANSITION_OPTIONS.includes(next.transition)
            ) {
              next = { ...next, transition: "custom", transitionCustom: next.transition };
              entryChanged = true;
            }
            return next;
          });
          if (entryChanged) {
            newCells[blockId] = { ...cell, entries: newEntries };
            rowChanged = true;
          }
        }
      }

      if (!rowChanged) return row;
      secChanged = true;
      return { ...row, cells: newCells };
    });
    if (!secChanged) return sec;
    changed = true;
    return { ...sec, rows: newRows };
  });

  if (!changed) return { data, changed: false };
  return { data: { ...data, sections: newSections }, changed: true };
}

// ============================================================
// normalizeQsheetData — 読み込み時マイグレーションをまとめて1回で適用する
// ============================================================
export function normalizeQsheetData(data: DocumentData): MigrateResult {
  const step1 = splitMultiEntryRows(data);
  const step2 = migrateStageTemplateRefs(step1.data);
  const step3 = migrateMobileCellShapes(step2.data);
  return {
    data: step3.data,
    changed: step1.changed || step2.changed || step3.changed,
    splitRows: step1.splitRows,
  };
}
