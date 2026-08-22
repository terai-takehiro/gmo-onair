// 全 section / row に安定 ID (`id`) を付与するマイグレーション。
//
// 現状のエディタは section/row を配列 index (si/ri) で位置指定しており、
// React key も配列 index を使っている。これは
//   ① 並び替え時に編集中セルのフォーカスが飛ぶ
//   ② 将来の同時共同編集で 2 クライアントの変更を安全にマージできない
// という問題の根。
//
// 既存の splitMultiEntryRows と同じく「読み込み時に一度だけ」呼ぶことで、
// 新規データだけでなく既存データにも安定 ID を後付けする。
//
// ID 規約: モバイル (CueCardList) と migrateEntries が既に `id` フィールドを
// 安定 ID 前提で扱っているため、`id` に統一する (`_id` は使わない)。

type Row = Record<string, any>;
type Section = Record<string, any> & { rows?: Row[] };
type DocumentData = Record<string, any> & { sections?: Section[] };

let counter = 0;

/** 衝突しにくい安定 ID を生成する (crypto.randomUUID があれば優先)。 */
export function genId(prefix: string): string {
  const c: any = typeof crypto !== "undefined" ? crypto : undefined;
  if (c?.randomUUID) return `${prefix}_${c.randomUUID()}`;
  // フォールバック (古い環境): 時刻 + カウンタ + 乱数
  counter = (counter + 1) % 1_000_000;
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

export interface EnsureIdsResult {
  data: DocumentData;
  changed: boolean;
  addedSections: number;
  addedRows: number;
}

/**
 * 全 section / row に `id` が無ければ付与する。既に `id` を持つものは変更しない。
 * section / row のオブジェクト参照は id を足す場合のみ新規化する (不変性を保つ)。
 */
export function ensureStableIds(data: DocumentData): EnsureIdsResult {
  if (!data?.sections || !Array.isArray(data.sections)) {
    return { data, changed: false, addedSections: 0, addedRows: 0 };
  }

  let changed = false;
  let addedSections = 0;
  let addedRows = 0;

  const newSections = data.sections.map((sec) => {
    if (!sec || typeof sec !== "object") return sec;

    let secChanged = false;
    let nextSec: Section = sec;

    // row 側の id 付与
    if (Array.isArray(sec.rows)) {
      let rowsChanged = false;
      const newRows = sec.rows.map((row) => {
        if (row && typeof row === "object" && !row.id) {
          rowsChanged = true;
          addedRows += 1;
          return { ...row, id: genId("row") };
        }
        return row;
      });
      if (rowsChanged) {
        nextSec = { ...nextSec, rows: newRows };
        secChanged = true;
      }
    }

    // section 側の id 付与
    if (!nextSec.id) {
      nextSec = { ...nextSec, id: genId("sec") };
      addedSections += 1;
      secChanged = true;
    }

    if (secChanged) {
      changed = true;
      return nextSec;
    }
    return sec;
  });

  if (!changed) return { data, changed: false, addedSections: 0, addedRows: 0 };
  return {
    data: { ...data, sections: newSections },
    changed: true,
    addedSections,
    addedRows,
  };
}
