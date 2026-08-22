// Qシート 同時共同編集 (Phase 2.2c) — 新旧 DocumentData の差分を Y 操作へ翻訳する純粋関数
//
// 既存エディタは `updateData(updater)` で「新しい data 全体」を作る。collab 有効時は
// この差分器で prev→next の差分を検出し、安定 ID をキーに **粒度 Y 操作 (ydocOps)** へ
// 変換して適用する。これにより既存の編集ヘルパをほぼ触らずに CRDT マージへ載せられる。
//
// 制約: 並び替え (move) は Yjs に atomic move が無いため clone (delete+insert) で表現し、
// 移動対象の CRDT identity を失う (= 移動中の同一要素への並行編集は稀に取りこぼす)。
// セル編集・行/ロールの挿入削除・スカラー変更は identity を保ったままマージされる。

import * as Y from 'yjs';
import * as ops from './ydocOps';
import { yDocToData } from '@gmo-onair/shared/src/collab/yjsDoc';
import { ensureStableIds } from '../stableIds';

function deepEq(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function keyById<T extends { id?: string }>(arr: T[] | undefined): Map<string, T> {
  const m = new Map<string, T>();
  for (const el of arr || []) if (el && el.id != null) m.set(el.id, el);
  return m;
}

function unionKeys(a: Record<string, unknown> | undefined, b: Record<string, unknown> | undefined): string[] {
  return Array.from(new Set([...Object.keys(a || {}), ...Object.keys(b || {})]));
}

/** 目標の id 順に合わせて move で並び替える (順序が違う位置だけ動かす)。 */
function reorder(current: string[], target: string[], move: (id: string, toIdx: number) => void): void {
  const work = current.slice();
  for (let i = 0; i < target.length; i++) {
    if (work[i] === target[i]) continue;
    const from = work.indexOf(target[i]);
    if (from < 0) continue; // まだ存在しない (異常) → skip
    work.splice(from, 1);
    work.splice(i, 0, target[i]);
    move(target[i], i);
  }
}

function diffScalarFields(
  prev: Record<string, unknown> | undefined,
  next: Record<string, unknown> | undefined,
  skip: Set<string>,
  set: (k: string, v: unknown) => void,
  del: (k: string) => void,
): void {
  for (const k of unionKeys(prev, next)) {
    if (skip.has(k)) continue;
    const pv = prev?.[k];
    const nv = next?.[k];
    if (deepEq(pv, nv)) continue;
    if (nv === undefined) del(k);
    else set(k, nv);
  }
}

const ROW_SKIP = new Set(['id', 'cells']);
const SECTION_SKIP = new Set(['id', 'rows']);

function diffRows(ydoc: Y.Doc, sectionId: string, prevRows: any[], nextRows: any[]): void {
  const prevMap = keyById(prevRows);
  const nextMap = keyById(nextRows);

  // 削除
  for (const id of prevMap.keys()) if (!nextMap.has(id)) ops.deleteRow(ydoc, sectionId, id);

  // 生存行の更新 (スカラー + セル)
  for (const nRow of nextRows) {
    const pRow = prevMap.get(nRow.id);
    if (!pRow) continue;
    diffScalarFields(
      pRow,
      nRow,
      ROW_SKIP,
      (k, v) => ops.setRowField(ydoc, sectionId, nRow.id, k, v),
      (k) => ops.deleteRowField(ydoc, sectionId, nRow.id, k),
    );
    for (const blockId of unionKeys(pRow.cells, nRow.cells)) {
      if (deepEq(pRow.cells?.[blockId], nRow.cells?.[blockId])) continue;
      if (nRow.cells?.[blockId] === undefined) ops.deleteRowCell(ydoc, sectionId, nRow.id, blockId);
      else ops.setRowCell(ydoc, sectionId, nRow.id, blockId, nRow.cells[blockId]);
    }
  }

  // 追加 (next 順の直前 id の後ろに挿入)
  for (let i = 0; i < nextRows.length; i++) {
    const nRow = nextRows[i];
    if (prevMap.has(nRow.id)) continue;
    const afterId = i > 0 ? nextRows[i - 1].id : null;
    ops.insertRowAfter(ydoc, sectionId, afterId, nRow);
  }

  // 並び替え
  reorder(
    ops.listRowIds(ydoc, sectionId),
    nextRows.map((r) => r.id),
    (id, toIdx) => ops.moveRow(ydoc, sectionId, id, toIdx),
  );
}

function diffSections(ydoc: Y.Doc, prevSecs: any[], nextSecs: any[]): void {
  const prevMap = keyById(prevSecs);
  const nextMap = keyById(nextSecs);

  for (const id of prevMap.keys()) if (!nextMap.has(id)) ops.deleteSection(ydoc, id);

  for (const nSec of nextSecs) {
    const pSec = prevMap.get(nSec.id);
    if (!pSec) continue;
    diffScalarFields(
      pSec,
      nSec,
      SECTION_SKIP,
      (k, v) => ops.setSectionField(ydoc, nSec.id, k, v),
      (k) => ops.deleteSectionField(ydoc, nSec.id, k),
    );
    diffRows(ydoc, nSec.id, pSec.rows || [], nSec.rows || []);
  }

  for (let i = 0; i < nextSecs.length; i++) {
    const nSec = nextSecs[i];
    if (!prevMap.has(nSec.id)) ops.addSection(ydoc, nSec, i);
  }

  reorder(
    ops.listSectionIds(ydoc),
    nextSecs.map((s) => s.id),
    (id, toIdx) => ops.moveSection(ydoc, id, toIdx),
  );
}

const TOP_KEYS = new Set(['meta', 'blocks', 'masters', 'sections']);

/**
 * prev → next の差分を Y.Doc へ適用する。ydoc.transact の中で呼ぶこと。
 * (useCollabDoc の mutate() 経由でローカル origin のトランザクションになる。)
 */
export function applyDataDiff(ydoc: Y.Doc, prev: any, next: any): void {
  const p = prev || {};
  const n = next || {};

  // meta (スカラー、フィールド単位 LWW)
  diffScalarFields(
    p.meta,
    n.meta,
    new Set(),
    (k, v) => ops.setMeta(ydoc, k, v),
    (k) => ops.deleteMeta(ydoc, k),
  );

  // masters (リスト単位で置換)
  for (const k of unionKeys(p.masters, n.masters)) {
    if (!deepEq(p.masters?.[k], n.masters?.[k])) ops.setMastersList(ydoc, k, n.masters?.[k] ?? []);
  }

  // blocks (低頻度、変化時のみ全置換)
  if (!deepEq(p.blocks, n.blocks)) ops.setBlocks(ydoc, n.blocks || []);

  // sections (id キーで構造マージ)
  diffSections(ydoc, p.sections || [], n.sections || []);

  // extras (ledScenes / stageTemplates / sectionTemplates 等、変化キーのみ置換)
  for (const k of unionKeys(p, n)) {
    if (TOP_KEYS.has(k)) continue;
    if (!deepEq(p[k], n[k])) ops.setExtra(ydoc, k, n[k]);
  }
}

/**
 * updater を Y.Doc へ適用する (EditorPage の updateData から呼ぶ唯一の入口)。
 *
 * **id の保証をここに集約している。** 差分は id を鍵に突き合わせるので、
 * id の無い section / row が prev と next の両方に居ると毎回「新規」と判定され、
 * **1 回の編集ごとに全部がもう一度追加されて倍々に増える**
 * (CSV 取込が id を付けていなかったため、取り込んだあと打鍵するたびに倍増し、
 *  20 回ほどでブラウザとサーバーが落ちた)。
 *
 * 順番が要点:
 *   ① 先に Y 側の id 無しを埋める (prev を読む前。あとで埋めるとその回の差分が増殖する)
 *   ② prev を読む
 *   ③ next にも id を付ける (updater が新しく足したロール/行の分)
 * これで「id を付け忘れた機能」が将来増えても、増殖という壊れ方はしなくなる。
 */
export function applyDataUpdate(ydoc: Y.Doc, updater: (prev: any) => any): any {
  ops.backfillIds(ydoc);
  const prev = yDocToData(ydoc);
  const next = ensureStableIds(updater(prev)).data;
  applyDataDiff(ydoc, prev, next);
  return next;
}
