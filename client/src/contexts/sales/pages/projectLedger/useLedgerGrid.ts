/**
 * 升目としての操作（案件台帳）— 選ぶ・コピー・貼り付け・その場で直す
 *
 * ── 決めごと ────────────────────────────────────────────────
 *
 *  ・**コピーは閲覧モードでもできる**（読むだけなので壊せない）。
 *    **貼り付けと書き換えは編集モードのときだけ**
 *  ・⚠️ **貼り付けはすぐに書かない。** 何件がどう変わるか・何件が断られたかを
 *    先に出して、押してもらってから書きます。**取り消せない**ので
 *  ・⚠️ **1つに決まらない名前は当てずっぽうで選ばない**（`editable.ts`）。
 *    同姓同名・同名の取引先は実際にあり、**間違えても画面には出ません**
 *  ・**送る先は `PATCH /projects/bulk` の1本だけ。** その場の書き換えも
 *    貼り付けも同じ口を通します — 別の口を作ると、片方だけ検査が緩くなります
 *  ・**同じ中身の行はまとめて1回で送る。** Excel から1つの値を縦に貼るのが
 *    いちばん多い使い方なので、たいてい 1 回で済みます
 */
import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { CLASSIFICATION_COMBOS } from '@/contexts/sales/classification';
import {
  PASTE_MAX_CELLS, isEditable, parseCell, parseClipboardGrid, rangeOf, rangeSize,
  toClipboardText, type CellRange, type CellRef, type EditableCol, type NamedRow,
} from './editable';
import { cellText } from './ledgerCsv';
import type { LedgerColKey, LedgerRow } from './types';

/** 貼り付けの下見（押す前に出すもの） */
export interface PastePlan {
  /** 実際に書く中身。案件ごと */
  changes: { id: string; name: string; col: LedgerColKey; from: string; to: string; set: Record<string, unknown> }[];
  /** 読めなかった升目。**必ず画面に出す** */
  rejected: { name: string; col: LedgerColKey; raw: string; why: string }[];
  /** 多すぎて止めたとき */
  tooMany: number | null;
}

export function useLedgerGrid({
  rows, shown, canEdit, users, customers, onDone,
}: {
  rows: LedgerRow[];
  shown: LedgerColKey[];
  canEdit: boolean;
  users: NamedRow[];
  customers: NamedRow[];
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [anchor, setAnchor] = useState<CellRef | null>(null);
  const [range, setRange] = useState<CellRange | null>(null);
  const [editing, setEditing] = useState<CellRef | null>(null);
  const [plan, setPlan] = useState<PastePlan | null>(null);

  const ctx = useMemo(() => ({
    users,
    customers,
    combos: CLASSIFICATION_COMBOS.map((c) => ({
      label: c.label, audience: c.audience, category: c.category,
    })),
  }), [users, customers]);

  /** 升目を1つ選ぶ。`extend` は Shift 押し（長方形に広げる） */
  const pick = useCallback((row: number, col: number, extend = false) => {
    setEditing(null);
    if (extend && anchor) {
      setRange(rangeOf(anchor, { row, col }));
      return;
    }
    setAnchor({ row, col });
    setRange({ r1: row, c1: col, r2: row, c2: col });
  }, [anchor]);

  const clear = useCallback(() => {
    setAnchor(null); setRange(null); setEditing(null);
  }, []);

  /**
   * コピー。**表に出ている文字ではなく、書き出しと同じ文字**を使います
   * （`cellText`）— 表は狭いので短くしていますが、貼る先では元の形が要ります
   * （ステージは正式名・最後の動きは日時・金額に `¥` を付けない）。
   */
  const copy = useCallback(async (): Promise<boolean> => {
    if (!range) return false;
    const grid: string[][] = [];
    for (let r = range.r1; r <= range.r2; r += 1) {
      const row = rows[r];
      if (!row) continue;
      const line: string[] = [];
      for (let c = range.c1; c <= range.c2; c += 1) {
        const key = shown[c];
        line.push(key ? (cellText(key, row) ?? '') : '');
      }
      grid.push(line);
    }
    const text = toClipboardText(grid);
    try {
      await navigator.clipboard.writeText(text);
      notifySuccess(`${grid.length} 行 × ${grid[0]?.length ?? 0} 列をコピーしました`, {
        description: 'Excel にそのまま貼れます（タブ区切り）。',
      });
      return true;
    } catch {
      // **黙って失敗しない。** 権限が無いと `clipboard` は投げる
      notifyApiError('コピーできませんでした', new Error('ブラウザがコピーを許していません'));
      return false;
    }
  }, [range, rows, shown]);

  /**
   * 貼り付けの下見を作る。**まだ書きません。**
   * 貼る場所は「いま選んでいる升目の左上」から右下へ広げます（Excel と同じ）。
   */
  const planPaste = useCallback((text: string) => {
    if (!canEdit || !anchor) return;
    const grid = parseClipboardGrid(text);
    const cells = grid.length * (grid[0]?.length ?? 0);
    if (cells > PASTE_MAX_CELLS) {
      setPlan({ changes: [], rejected: [], tooMany: cells });
      return;
    }

    const changes: PastePlan['changes'] = [];
    const rejected: PastePlan['rejected'] = [];
    grid.forEach((line, dr) => {
      const row = rows[anchor.row + dr];
      if (!row) return;                        // 表からはみ出したぶんは静かに捨てる
      line.forEach((raw, dc) => {
        const key = shown[anchor.col + dc];
        if (!key) return;
        if (!isEditable(key)) {
          rejected.push({ name: row.name, col: key, raw, why: 'この列は直せません（読むだけの列です）' });
          return;
        }
        const r = parseCell(key as EditableCol, raw, ctx);
        if (!r.ok) { rejected.push({ name: row.name, col: key, raw, why: r.why }); return; }
        const from = cellText(key, row) ?? '';
        // **変わらないものは出さない。** 「12 件を直します」と出したのに
        // 中身が同じだと、何が起きたのか確かめようがない
        if (from === r.display) return;
        changes.push({ id: row.id, name: row.name, col: key, from, to: r.display, set: r.set });
      });
    });
    setPlan({ changes, rejected, tooMany: null });
  }, [anchor, canEdit, ctx, rows, shown]);

  const write = useMutation({
    mutationFn: async (changes: PastePlan['changes']) => {
      /**
       * **同じ中身の行はまとめて1回で送る。** Excel から1つの値を縦に貼るのが
       * いちばん多い使い方なので、たいてい 1 回で済みます。
       * ⚠️ **1件ずつ送ると、途中で失敗したときにどこまで入ったか分かりません。**
       */
      const groups = new Map<string, { set: Record<string, unknown>; ids: string[] }>();
      for (const c of changes) {
        const k = JSON.stringify(c.set);
        const g = groups.get(k) ?? { set: c.set, ids: [] };
        if (!g.ids.includes(c.id)) g.ids.push(c.id);
        groups.set(k, g);
      }
      for (const g of groups.values()) {
        await api.patch('/projects/bulk', { ids: g.ids, set: g.set });
      }
      return { rows: new Set(changes.map((c) => c.id)).size, cells: changes.length };
    },
    onSuccess: (res) => {
      // **落とす鍵を書き漏らさない**（`useLedgerState` と同じ一覧）
      qc.invalidateQueries({ queryKey: ['project-ledger'] });
      qc.invalidateQueries({ queryKey: ['project-integrity'] });
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['dashboard', 'sales-overview'] });
      setPlan(null);
      setEditing(null);
      onDone();
      notifySuccess(`${res.rows} 件（${res.cells} か所）を直しました`);
    },
    onError: (e) => notifyApiError('直せませんでした', e),
  });

  /** その場で1つ直す。**貼り付けと同じ口・同じ検査**を通す */
  const commitCell = useCallback((row: LedgerRow, col: EditableCol, raw: string) => {
    const r = parseCell(col, raw, ctx);
    if (!r.ok) { notifyApiError('直せませんでした', new Error(r.why)); return; }
    const from = cellText(col, row) ?? '';
    if (from === r.display) { setEditing(null); return; }   // 変わっていなければ何もしない
    write.mutate([{ id: row.id, name: row.name, col, from, to: r.display, set: r.set }]);
  }, [ctx, write]);

  return {
    anchor, range, editing, setEditing, pick, clear, commitCell,
    copy, planPaste, plan, setPlan,
    apply: () => plan && write.mutate(plan.changes),
    saving: write.isPending,
    rangeCount: range ? rangeSize(range) : 0,
  };
}

export type LedgerGrid = ReturnType<typeof useLedgerGrid>;
