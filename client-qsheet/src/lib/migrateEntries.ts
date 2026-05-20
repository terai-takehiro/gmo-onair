// 既存ドキュメントの「複数エントリ行」を「複数の単一エントリ行」に分割するマイグレーション。
//
// 旧モデル: 1 つの row.cells[blockId].entries[] に複数のエントリ
//   → 視覚的には rowSpan で N サブ行に展開
// 新モデル: 1 行 = 1 エントリ (entries.length は常に 0 または 1)
//
// 読み込み時に一度だけ呼ぶことで、新規データだけでなく既存データも扱えるようにする。

type Row = Record<string, any> & { cells?: Record<string, any> };
type Section = Record<string, any> & { rows?: Row[] };
type DocumentData = Record<string, any> & { sections?: Section[] };

// エントリを持たせる対象のブロック種別 (それ以外はセル単位の row-level データ)
const ENTRY_BLOCK_TYPES = new Set(["scenario", "video", "audio", "telop", "led_xr"]);

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
  // blockId → type のマップを作成
  const blockTypes = new Map<string, string>();
  for (const b of (data as any).blocks || []) {
    if (b?.id && b?.type) blockTypes.set(b.id, b.type);
  }

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
