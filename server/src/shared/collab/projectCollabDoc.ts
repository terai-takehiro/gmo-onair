// 案件 (GLS-B) 共同編集 — ProjectCollabDoc ⇄ Y.Doc 変換層 (サーバー側コピー)
// ⚠️ shared/src/collab/projectCollabDoc.ts と構造を必ず一致させること (更新バイナリ互換性のため)。
// サーバーは server/src/ 外を import できないため意図的に複製している。
// 本文の一致は scripts/check-collab-parity.mjs がビルド時に検証する。
//
// 要件: docs/requirements/2026-07-25-collaboration-and-personal-agent.md (B1 / B2)
//
// ⚠️ server/src/shared/collab/projectCollabDoc.ts と**構造を必ず一致させること**
//    (更新バイナリの互換性のため)。サーバーは server/src/ の外を import できないので
//    意図的に複製している。乖離すると同時編集が静かに壊れるため、
//    scripts/check-collab-parity.mjs がビルド時に本文の一致を検証する。
//
// ── 対象を「メモとチェックリスト」に絞った理由 ────────────────
//
// 要件 B1 は「タスク・メモ・チェックリストから。金額欄は後回し」と書いているが、
// **タスクだけは同じ扱いにできない**。
//
//   - Qシートが Yjs に乗せられたのは、1 ドキュメント = 1 つの JSONB だから。
//     Y.Doc をその JSONB の写像にすれば真実の所在が 1 つで済む。
//   - 一方 GLS-B のタスクは `project_tasks` の**行**で、かんばん / ガント / リスト /
//     MCP / 依頼フロー (v2.9.245〜247) がすべて直接 SQL で書いている。
//     ここに Y.Doc を重ねると**同じ行に対する書き手が 2 系統**になり、
//     どちらが正かを常に調停しなければならない。調停を誤れば消える。
//   - 金額は監査の都合で同時編集の対象外 (要件 B1)。
//
// よって**まず blob 形の「作業メモ」と「チェックリスト」だけを Yjs に乗せる**。
// これは新しい入れ物なので既存の書き手と競合しない。タスクを乗せるかは
// 「行を Y.Doc の写像にする」設計を別途決めてから判断する (要件の未決に追記済み)。
//
// ── メモを Y.Text にしている理由 ──────────────────────────
//
// 自由テキストを Y.Map のスカラーとして持つと、2 人が同じメモを打った時点で
// **文字列まるごとの後勝ち**になる。それは今まさに解こうとしている問題そのもの。
// Y.Text にすると文字単位でマージされるので、同じ段落を同時に触っても両方残る。

import * as Y from 'yjs';

export interface ChecklistItem {
  /** 安定 id。行の並び替え・削除を競合フリーにマージするために必須 */
  id: string;
  text: string;
  done: boolean;
  /** 担当 (users.id)。未割当は null */
  assigned_to?: string | null;
  /** 期限。イズムに合わせて分まで持つ 'YYYY-MM-DD HH:mm' */
  due_at?: string | null;
  /**
   * AI が足した行かどうか。**人が足した行と見分けるために持つ** —
   * 見分けが付かないと「勝手に増えている」と受け取られ、消すか残すかの判断ができない。
   * 既存の行にこの鍵は無いので、無ければ false として読む。
   */
  by_ai?: boolean;
}

export interface ProjectCollabDoc {
  /** 作業メモ (自由テキスト・文字単位マージ) */
  notes: string;
  checklist: ChecklistItem[];
}

/** Y.Doc 内のトップレベルキー。両コピーで一致させること */
export const NOTES_KEY = 'notes';
export const CHECKLIST_KEY = 'checklist';

export function emptyProjectCollabDoc(): ProjectCollabDoc {
  return { notes: '', checklist: [] };
}

/** 素の値を Y.Map に写す (チェックリスト 1 件分) */
function itemToYMap(item: ChecklistItem): Y.Map<unknown> {
  const m = new Y.Map<unknown>();
  m.set('id', item.id);
  m.set('text', item.text ?? '');
  m.set('done', !!item.done);
  m.set('assigned_to', item.assigned_to ?? null);
  m.set('due_at', item.due_at ?? null);
  m.set('by_ai', !!item.by_ai);
  return m;
}

function yMapToItem(m: Y.Map<unknown>): ChecklistItem {
  const s = (k: string): string => {
    const v = m.get(k);
    return typeof v === 'string' ? v : '';
  };
  const sn = (k: string): string | null => {
    const v = m.get(k);
    return typeof v === 'string' && v !== '' ? v : null;
  };
  return {
    id: s('id'),
    text: s('text'),
    done: m.get('done') === true,
    assigned_to: sn('assigned_to'),
    due_at: sn('due_at'),
    by_ai: m.get('by_ai') === true,
  };
}

/**
 * 既存データを Y.Doc に流し込む (**種化専用**)。
 *
 * 種化は 1 度だけ走る前提。既存の Y state がある部屋にこれを当てると
 * メモが二重になるので、必ず「state が無いとき」だけ呼ぶこと
 * (roomManager.hydrate がその制御をしている)。
 */
export function applyDocToYDoc(ydoc: Y.Doc, doc: Partial<ProjectCollabDoc> | null): void {
  const src = { ...emptyProjectCollabDoc(), ...(doc ?? {}) };
  ydoc.transact(() => {
    const text = ydoc.getText(NOTES_KEY);
    if (text.length > 0) text.delete(0, text.length);
    if (src.notes) text.insert(0, String(src.notes));

    const arr = ydoc.getArray<Y.Map<unknown>>(CHECKLIST_KEY);
    if (arr.length > 0) arr.delete(0, arr.length);
    const items = Array.isArray(src.checklist) ? src.checklist : [];
    // id の無い行は id キーでのマージができないので落とさず補う
    arr.push(items.map((it, i) => itemToYMap({ ...it, id: it?.id || `chk_seed_${i}` })));
  });
}

export function yDocToDoc(ydoc: Y.Doc): ProjectCollabDoc {
  return {
    notes: ydoc.getText(NOTES_KEY).toString(),
    checklist: ydoc
      .getArray<Y.Map<unknown>>(CHECKLIST_KEY)
      .toArray()
      .filter((m): m is Y.Map<unknown> => m instanceof Y.Map)
      .map(yMapToItem),
  };
}

export function docToUpdate(doc: Partial<ProjectCollabDoc> | null): Uint8Array {
  const ydoc = new Y.Doc();
  applyDocToYDoc(ydoc, doc);
  const update = Y.encodeStateAsUpdate(ydoc);
  ydoc.destroy();
  return update;
}

export function updateToDoc(update: Uint8Array): ProjectCollabDoc {
  const ydoc = new Y.Doc();
  Y.applyUpdate(ydoc, update);
  const doc = yDocToDoc(ydoc);
  ydoc.destroy();
  return doc;
}
