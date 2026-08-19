/**
 * セルをその場で直すときの入力欄（案件台帳）
 *
 * ── 決めごと ────────────────────────────────────────────────
 *
 *  ・**出すのは列に合った入力欄だけ。** 日付に素の文字欄を出すと
 *    「8/5」と書かれて読めず、直したつもりで直っていないことになります
 *  ・**候補のあるものは候補から選ばせる**（担当・お客様・分類・申込書）。
 *    ⚠️ ただし**打ち込みも通します** — 貼り付けと同じ `parseCell` を通すので、
 *    1つに決まらない名前は**断られて理由が出ます**（当てずっぽうで選ばない）
 *  ・**Enter で確定・Escape でやめる。** 表計算と同じ手つきにする
 *  ・**開いたらすぐ書ける**（`autoFocus`）。もう一手間かかると、
 *    まとめて直したい人はこの欄を使いません
 */
import { useEffect, useRef, useState } from 'react';
import { CLASSIFICATION_COMBOS } from '@/contexts/sales/classification';
import type { EditableCol, NamedRow } from './editable';

export function CellEditor({
  col, initial, users, customers, onCommit, onCancel,
}: {
  col: EditableCol;
  initial: string;
  users: NamedRow[];
  customers: NamedRow[];
  onCommit: (raw: string) => void;
  onCancel: () => void;
}) {
  const [v, setV] = useState(initial);
  const ref = useRef<HTMLInputElement | HTMLSelectElement | null>(null);

  useEffect(() => { ref.current?.focus(); }, []);

  const keys = (e: React.KeyboardEvent) => {
    // **Enter/Escape だけ止める**（Escape で選択まで消えるのを防ぐ）。
    // ⚠️ 以前は全キーを無条件で stopPropagation しており、セル編集中は
    // ヘッダーの Ctrl+K（`document` レベルのリスナー）が document まで届かず
    // グローバル検索が開けなかった（UXレポート 2026-08-18 指摘）。
    // Enter/Escape 以外は素通しして上位のショートカットに影響しないようにする
    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); onCommit(v); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCancel(); }
  };

  const cls = 'text-sub h-7 w-full rounded-control border border-primary bg-card px-1.5';

  if (col === 'classification' || col === 'application_form') {
    const opts = col === 'classification'
      ? CLASSIFICATION_COMBOS.map((c) => c.label)
      : ['あり', 'なし'];
    return (
      <select
        ref={ref as React.Ref<HTMLSelectElement>}
        className={cls}
        value={opts.includes(v) ? v : ''}
        onChange={(e) => { setV(e.target.value); onCommit(e.target.value); }}
        onKeyDown={keys}
        onBlur={onCancel}
        aria-label="値を選ぶ"
      >
        {/* **いまの値が候補に無いときのための空**（選ばせないための行） */}
        <option value="" disabled>選ぶ</option>
        {opts.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }

  if (col === 'event_start' || col === 'event_end') {
    return (
      <input
        ref={ref as React.Ref<HTMLInputElement>}
        type="date"
        className={cls}
        value={/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : ''}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={keys}
        onBlur={() => onCommit(v)}
        aria-label="日付を入れる"
      />
    );
  }

  /*
    担当・お客様。**候補を出しつつ打ち込みも通す**（`datalist`）。
    500 件の取引先を選択肢に並べると探せないので、打ちながら絞れる形にします。
  */
  const list = col === 'assigned_to_name' ? users : customers;
  const listId = `ledger-${col}-options`;
  return (
    <>
      <input
        ref={ref as React.Ref<HTMLInputElement>}
        list={listId}
        className={cls}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={keys}
        onBlur={() => onCommit(v)}
        aria-label={col === 'assigned_to_name' ? '社内の担当を選ぶ' : 'お客様を選ぶ'}
      />
      <datalist id={listId}>
        {list.map((x) => <option key={x.id} value={x.name} />)}
      </datalist>
    </>
  );
}
