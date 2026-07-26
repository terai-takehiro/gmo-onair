/**
 * 案件の共同編集 — Y.Doc をローカル編集する操作
 *
 * 鍵 (NOTES_KEY / CHECKLIST_KEY) と構造は変換層 (shared/src/collab/projectCollabDoc.ts)
 * から import する。**ここで文字列リテラルを書くと乖離して静かに壊れる**ため。
 *
 * メモは Y.Text なので「まるごと置き換え」をしてはいけない。
 * 置き換えると同じ段落を触っている相手の入力が消え、いま解こうとしている
 * 「後勝ち上書き」そのものになる。**変わった部分だけ**を splice する。
 */
import * as Y from "yjs";
import { NOTES_KEY, CHECKLIST_KEY } from "@gmo-onair/shared/src/collab/projectCollabDoc";

/** 安定 id。並び替え・削除を競合フリーにマージするために必須 */
function newId(): string {
  return `chk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * メモを次の文字列に寄せる (差分だけ適用)。
 * 先頭と末尾の一致部分を除いた中央だけを delete + insert する。
 */
export function setNotes(ydoc: Y.Doc, next: string): void {
  const text = ydoc.getText(NOTES_KEY);
  const prev = text.toString();
  if (prev === next) return;

  let head = 0;
  const max = Math.min(prev.length, next.length);
  while (head < max && prev[head] === next[head]) head++;
  let tail = 0;
  while (
    tail < max - head &&
    prev[prev.length - 1 - tail] === next[next.length - 1 - tail]
  ) {
    tail++;
  }
  const delLen = prev.length - head - tail;
  const insert = next.slice(head, next.length - tail);
  if (delLen > 0) text.delete(head, delLen);
  if (insert) text.insert(head, insert);
}

function items(ydoc: Y.Doc): Y.Array<Y.Map<unknown>> {
  return ydoc.getArray<Y.Map<unknown>>(CHECKLIST_KEY);
}

function findIndex(ydoc: Y.Doc, id: string): number {
  return items(ydoc)
    .toArray()
    .findIndex((m) => m instanceof Y.Map && m.get("id") === id);
}

export function addChecklistItem(ydoc: Y.Doc, text: string): void {
  const m = new Y.Map<unknown>();
  m.set("id", newId());
  m.set("text", text);
  m.set("done", false);
  m.set("assigned_to", null);
  m.set("due_at", null);
  items(ydoc).push([m]);
}

/** 1件のフィールドを更新する (項目単位なので後勝ちで問題ない粒度) */
export function updateChecklistItem(
  ydoc: Y.Doc,
  id: string,
  patch: { text?: string; done?: boolean; due_at?: string | null },
): void {
  const i = findIndex(ydoc, id);
  if (i < 0) return;
  const m = items(ydoc).get(i);
  if (patch.text !== undefined) m.set("text", patch.text);
  if (patch.done !== undefined) m.set("done", patch.done);
  if (patch.due_at !== undefined) m.set("due_at", patch.due_at);
}

export function removeChecklistItem(ydoc: Y.Doc, id: string): void {
  const i = findIndex(ydoc, id);
  if (i >= 0) items(ydoc).delete(i, 1);
}
