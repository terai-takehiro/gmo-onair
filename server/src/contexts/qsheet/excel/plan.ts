/**
 * 取込の下見（dry run）を組み立てる。実装設計 03-excel.md §8。
 *
 * スコープを絞った点（impl/README.md の突き合わせ方針どおり、食い違いは正直に書く）:
 *  - モードは `merge`（既定）と `append` のみ。`sync`（無い行を消す）は作らない
 *    （§11-2 #8「要望が無ければ最初は merge と append だけ」を採用）。
 *  - 取込は**常に安全側**: 並び替え（move）は一切行わない。新しいロール/行は
 *    常に「対象ロールの末尾」「文書の末尾」に追加する（§8-6 の CRDT identity 消失問題を
 *    そもそも起こさないための単純化）。行の並び順そのものを Excel で組み替える機能は無い。
 *  - `parentId` 列は読まない（食い違い時の「並び順を優先」の判定は実装しない。ロール見出しの
 *    直後グループを常に正とする）。
 *  - マイク香盤シートは取込に対応する（`mic.ts`）。LEDシーン/立ち位置図ひな形/マイクCh/マスターの
 *    各シートそのものの編集は**書き出しのみ**（取込では読まない）。台本シートから
 *    LED シーン名・立ち位置図ひな形名を**参照する**列は取込に対応する
 *    （見つからない LED シーン名は自動作成 — §11-1 #9 の「既定は create」。
 *    立ち位置図ひな形は見つからなければ警告のみで作らない）。
 *  - `masters.video/audio/telop` は台本シートで実際に使われた ID を自動マージする
 *    （§7-6 の許可範囲）。`persons` はシナリオの話者名から自動マージする
 *    （既存 csvImport.ts と同じ考え方）。`masters.persons`/`micTypes` を
 *    マスターシートの列から自動追記することはしない（§7-6 の公開URL漏えい対策）。
 *
 * 小さい純関数は `planHelpers.ts`（列解決・id 索引・セル反映）と `mic.ts`（マイク香盤シート）に
 * 切り出してある（このファイルを 400 行前後に保つため）。
 */
import ExcelJS from 'exceljs';
import { randomUUID } from 'crypto';
import { ROW_KIND, COLOR_COLUMN, BLOCK_FIELD_DEFS } from './schema';
import { findSheet, readTableSheet, type TableRow } from './parseWorkbook';
import { computeBlockCols, buildCtx } from './rows';
import type { PlanOp, PlanResult, PlanEntry, ImportMode } from './planTypes';
import {
  indexCurrent, findColumn, valueAt, buildMetaPatch, emptySummary, sameValue, pruneUnchangedCells,
  mergeList, applyBlockFieldsToPatch, applyColorToPatch, createdLedScenes, type RowOpEntry,
} from './planHelpers';
import { applyMicSheet } from './mic';

const MAX_ROW_MULTIPLIER = 10;
const MAX_ROW_EXTRA = 1000;
const MAX_ENTRIES = 500;

function toPlanOp(e: RowOpEntry): PlanOp {
  if (e.op === 'add') return { op: 'add_row', sectionId: e.sectionId, afterRowId: null, row: { id: e.rowId, ...e.patch } };
  return { op: 'update_row', sectionId: e.sectionId, rowId: e.rowId, set: e.patch };
}

export function buildImportPlan(wb: ExcelJS.Workbook, current: any, mode: ImportMode): PlanResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const idx = indexCurrent(current);
  const blocks: any[] = current?.blocks || [];
  const blockCols = computeBlockCols(blocks);
  const scenarioBlock = blocks.find((b) => b?.type === 'scenario') || null;

  const ws = findSheet(wb, 'script');
  if (!ws) {
    return { ok: false, errors: ['「進行台本」シートが見つかりません。'], warnings, ops: [], summary: emptySummary(), entries: [], metaPatch: {} };
  }
  const { rows, keys, headers } = readTableSheet(ws);

  // 固定列の位置
  const idxKind = findColumn(keys, headers, 'kind', '種別');
  const idxId = findColumn(keys, headers, 'id', 'ID');
  const idxName = findColumn(keys, headers, 'name', 'ロール名');
  const idxDur = findColumn(keys, headers, 'dur', '尺');
  const idxRowLabel = findColumn(keys, headers, 'rowLabel', '行ラベル');
  const idxColor = findColumn(keys, headers, COLOR_COLUMN.key, COLOR_COLUMN.label);

  // ブロック列の位置（現在のブロック構成に対して解決。§8-3 ①②③）
  interface ResolvedBlockCol { blockId: string; type: string; field: string; colIdx: number }
  const resolvedBlockCols: ResolvedBlockCol[] = [];
  for (const bc of blockCols) {
    const defs = BLOCK_FIELD_DEFS[bc.type] || [];
    for (const def of defs) {
      if (def.locked) continue; // 画像・要約などロック列は取込で読まない
      const key = `${bc.blockKey}.${def.field}`;
      const label = def.suffix ? `${bc.label}:${def.suffix}` : bc.label;
      const colIdx = findColumn(keys, headers, key, label);
      if (colIdx >= 0) resolvedBlockCols.push({ blockId: bc.blockId, type: bc.type, field: def.field, colIdx });
    }
  }

  // ID の重複検知（§8-5・地雷対策）。空文字は対象外。
  const seenIds = new Set<string>();
  for (const r of rows) {
    const v = (valueAt(r, idxId) || '').trim();
    if (!v) continue;
    if (seenIds.has(v)) {
      errors.push(`シート${r.sheetRow}行目: ID「${v}」がファイル内で重複しています。取込を中止しました。`);
    }
    seenIds.add(v);
  }
  if (errors.length > 0) {
    return { ok: false, errors, warnings, ops: [], summary: emptySummary(), entries: [], metaPatch: {} };
  }

  const ctx = buildCtx(current);
  const usedVideo = new Set<string>();
  const usedAudio = new Set<string>();
  const usedTelop = new Set<string>();
  const usedPersons = new Set<string>();

  const sectionOps: PlanOp[] = [];
  const rowAliasMap = new Map<string, string>(); // ファイル内の未知 id テキスト → 新規採番 id
  const rowOps = new Map<string, RowOpEntry>();
  const entries: PlanEntry[] = [];
  const summary = emptySummary();

  let lastSectionId: string | null = null;
  let lastSectionIsGroup = false; // ロールのみ true（CM/VTR/改ページは行を受け付けない）
  let sectionAdds = 0, sectionUpdates = 0, rowAdds = 0, rowUpdates = 0;

  const pushEntry = (r: TableRow, kind: string, id: string | null, action: PlanEntry['action'], ref: string, messages: string[]) => {
    if (entries.length < MAX_ENTRIES) entries.push({ sheetRow: r.sheetRow, kind, id, action, ref, messages });
  };

  for (const r of rows) {
    const kindText = (valueAt(r, idxKind) || '').trim();
    const idText = (valueAt(r, idxId) || '').trim();

    if (kindText === ROW_KIND.SECTION || kindText === ROW_KIND.BREAK || kindText === ROW_KIND.VTR || kindText === ROW_KIND.PAGE_BREAK) {
      const name = (valueAt(r, idxName) || '').trim();
      const dur = (valueAt(r, idxDur) || '').trim();
      const existing = mode === 'merge' && idText && idx.sectionIds.has(idText) ? idx.sectionById.get(idText) : null;

      if (existing) {
        const set: Record<string, unknown> = {};
        if (kindText !== ROW_KIND.PAGE_BREAK) {
          if (idxName >= 0 && name !== (existing.label || '')) set.label = name;
          if (idxDur >= 0 && dur !== (existing.duration || '')) set.duration = dur;
        }
        if (Object.keys(set).length > 0) {
          sectionOps.push({ op: 'update_section', sectionId: existing.id, set });
          sectionUpdates++;
          pushEntry(r, kindText, idText, 'update', name || existing.label || '', []);
        } else {
          pushEntry(r, kindText, idText, 'skip', name || existing.label || '', ['変更なし']);
        }
        lastSectionId = existing.id;
        lastSectionIsGroup = kindText === ROW_KIND.SECTION;
        continue;
      }

      const newId = `sec_${randomUUID()}`;
      if (idText) rowAliasMap.set(idText, newId); // 通常は section だが、同じ別名帳を共用しても実害は無い
      let section: Record<string, unknown>;
      const msgs: string[] = [];
      if (idText && !idx.sectionIds.has(idText)) msgs.push(`ID「${idText}」は現在の台本に無いため、新しいロールとして追加します。`);
      if (kindText === ROW_KIND.PAGE_BREAK) {
        section = { id: newId, _pageBreak: true, rows: [] };
      } else if (kindText === ROW_KIND.BREAK) {
        section = { id: newId, _break: true, label: name || 'CM', duration: dur || '1:00', rows: [] };
      } else if (kindText === ROW_KIND.VTR) {
        section = { id: newId, _vtr: true, label: name || 'VTR', duration: dur || '0:30', rows: [] };
      } else {
        section = { id: newId, label: name || '【無題ロール】', rows: [] };
        if (dur) section.duration = dur;
      }
      sectionOps.push({ op: 'add_section', afterSectionId: null, section });
      sectionAdds++;
      pushEntry(r, kindText, idText || null, 'add', name || kindText, msgs);
      lastSectionId = newId;
      lastSectionIsGroup = kindText === ROW_KIND.SECTION;
      continue;
    }

    if (kindText === ROW_KIND.ROW) {
      if (!lastSectionId || !lastSectionIsGroup) {
        warnings.push(`シート${r.sheetRow}行目: 直前にロールが無いため、この行は取り込めません。`);
        pushEntry(r, kindText, idText || null, 'error', valueAt(r, idxRowLabel) || '', ['直前にロールが無いため取り込めません']);
        continue;
      }
      const dur = valueAt(r, idxDur);
      const label = valueAt(r, idxRowLabel);
      const color = idxColor >= 0 ? valueAt(r, idxColor) : undefined;

      const existingHit = mode === 'merge' && idText ? idx.rowById.get(idText) : undefined;

      if (existingHit) {
        const key = existingHit.row.id;
        const entry = rowOps.get(key) || { op: 'update' as const, sectionId: existingHit.sectionId, rowId: key, patch: {} as Record<string, any> };
        if (dur !== undefined && dur !== (existingHit.row.duration || '')) entry.patch.duration = dur;
        if (label !== undefined && label !== (existingHit.row.label || '')) entry.patch.label = label;
        if (existingHit.sectionId !== lastSectionId) {
          warnings.push(`シート${r.sheetRow}行目: 行「${key}」はファイル上ロールを移動していますが、並べ替えは行わず元のロールのまま更新しました。`);
        }
        applyBlockFieldsToPatch(entry, r, resolvedBlockCols, ctx, warnings, existingHit.row.cells, usedVideo, usedAudio, usedTelop, usedPersons);
        if (color !== undefined && scenarioBlock) applyColorToPatch(entry, color, scenarioBlock.id, existingHit.row.cells);
        pruneUnchangedCells(entry.patch, existingHit.row.cells);
        if (Object.keys(entry.patch).length > 0) {
          rowOps.set(key, entry);
          rowUpdates++;
          pushEntry(r, kindText, idText, 'update', label || '', []);
        } else {
          pushEntry(r, kindText, idText, 'skip', label || '', ['変更なし']);
        }
      } else {
        const newId = `row_${randomUUID()}`;
        if (idText) rowAliasMap.set(idText, newId);
        const entry = { op: 'add' as const, sectionId: lastSectionId, rowId: newId, patch: { duration: dur || '', label: label || '', cells: {} as Record<string, unknown> } };
        applyBlockFieldsToPatch(entry, r, resolvedBlockCols, ctx, warnings, {}, usedVideo, usedAudio, usedTelop, usedPersons);
        if (color !== undefined && scenarioBlock) applyColorToPatch(entry, color, scenarioBlock.id, {});
        rowOps.set(newId, entry);
        rowAdds++;
        const msgs = idText ? [`ID「${idText}」は現在の台本に無いため、新しい行として追加します。`] : [];
        pushEntry(r, kindText, idText || null, 'add', label || '', msgs);
      }
      continue;
    }

    warnings.push(`シート${r.sheetRow}行目: 種別「${kindText}」が認識できないため、この行はスキップしました。`);
    pushEntry(r, kindText || '(空)', idText || null, 'skip', '', ['種別が認識できません']);
  }

  // LED シーン名の新規作成（§11-1 #9・既定 create）は
  // applyBlockFieldsToPatch が台本シートを読みながら ctx を都度更新して行う。

  // マイク香盤シート（既存行は現在値と比べて変わった Ch だけを反映する。冪等性のため）
  const micResult = applyMicSheet(wb, current, idx, rowAliasMap, blockCols, warnings);
  for (const [rowId, cellsPatch] of micResult.byRowId) {
    const existing = rowOps.get(rowId);
    const hit = idx.rowById.get(rowId);
    if (existing?.op === 'add') {
      Object.assign(existing.patch.cells, cellsPatch); // 新規行に基準値は無い。そのまま設定
      continue;
    }
    const pruned: Record<string, unknown> = {};
    for (const [blockId, cell] of Object.entries(cellsPatch)) {
      if (!sameValue(cell, hit?.row.cells?.[blockId])) pruned[blockId] = cell;
    }
    if (Object.keys(pruned).length === 0) continue;
    if (existing) {
      existing.patch.cells = { ...(existing.patch.cells || {}), ...pruned };
    } else {
      if (!hit) continue; // resolveRowId 側で既にエラーを積んでいる
      rowOps.set(rowId, { op: 'update', sectionId: hit.sectionId, rowId, patch: { cells: pruned } });
      rowUpdates++;
    }
  }

  // set_extra（masters / ledScenes）
  const extraOps: PlanOp[] = [];
  const masters = current?.masters || {};
  const nextVideo = mergeList(masters.video, usedVideo);
  const nextAudio = mergeList(masters.audio, usedAudio);
  const nextTelop = mergeList(masters.telop, usedTelop);
  const nextPersons = mergeList(masters.persons, usedPersons);
  const addedVideo = nextVideo.length - (masters.video || []).length;
  const addedAudio = nextAudio.length - (masters.audio || []).length;
  const addedTelop = nextTelop.length - (masters.telop || []).length;
  const addedPersons = nextPersons.length - (masters.persons || []).length;
  if (addedVideo || addedAudio || addedTelop || addedPersons) {
    extraOps.push({ op: 'set_extra', key: 'masters', value: { ...masters, video: nextVideo, audio: nextAudio, telop: nextTelop, persons: nextPersons } });
  }
  const createdLedList = createdLedScenes.get(ctx) || [];
  if (createdLedList.length > 0) {
    extraOps.push({ op: 'set_extra', key: 'ledScenes', value: [...(current?.ledScenes || []), ...createdLedList] });
  }

  // 行数の暴走検知（§8-5 の 3 アサートのうち行数）
  if (rowAdds > idx.rowCount * MAX_ROW_MULTIPLIER + MAX_ROW_EXTRA) {
    return {
      ok: false,
      errors: [`追加される行数（${rowAdds}）が多すぎます（現在 ${idx.rowCount} 行の${MAX_ROW_MULTIPLIER}倍+${MAX_ROW_EXTRA} を超過）。ファイルを確認してください。`],
      warnings, ops: [], summary: emptySummary(), entries: [], metaPatch: {},
    };
  }

  const ops: PlanOp[] = [...sectionOps, ...Array.from(rowOps.values()).map((e) => toPlanOp(e)), ...extraOps];

  summary.sections = { add: sectionAdds, update: sectionUpdates };
  summary.rows = { add: rowAdds, update: rowUpdates };
  summary.masters = { video: Math.max(0, addedVideo), audio: Math.max(0, addedAudio), telop: Math.max(0, addedTelop), persons: Math.max(0, addedPersons) };
  summary.ledScenes = { add: createdLedList.length };
  summary.errors = errors.length;

  return { ok: true, errors, warnings, ops, summary, entries, metaPatch: buildMetaPatch(wb, warnings) };
}
