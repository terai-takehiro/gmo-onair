/**
 * 案件台帳の表（表頭 ＋ 本文）
 *
 * ── 表頭と本文を別々に書かない ──────────────────────────────
 *
 * どちらも **`shown`（出す列を出す順に並べたもの）を回して**作ります。
 * 2か所に列を並べると、列を1つ足したときに**片方だけ増えて全部の行がずれます**
 * （`RowHeader` が本文と同じ `RowSlot` を並べているのと同じ決めごと）。
 *
 * ── 横スクロールはここだけ ──────────────────────────────────
 *
 * 列は出し入れできるので、幅は端末と設定で変わります。**枠の外に漏らさない**
 * ように `overflow-x-auto` はこの部品が持ちます（ページ側に書くと、
 * 上のツールバーまで一緒に流れます）。
 *
 * ── 選択は「見えている行だけ」 ───────────────────────────────
 *
 * 表頭のチェックは**いま出ている 100 行**を選びます。**絞り込み全体を選ばせません** —
 * 見ていない行までまとめて書き換えると、何を変えたのか誰も確かめられません。
 * 何件選んだかはツールバーに出ます。
 */
import { Link } from 'react-router-dom';
import { Pencil } from 'lucide-react';
import { colDef, type LedgerColKey, type LedgerRow } from './types';
import { LedgerCell } from './LedgerCells';

export function LedgerTable({
  rows, shown, selected, onToggle, onToggleAll, canEdit,
}: {
  rows: LedgerRow[];
  shown: LedgerColKey[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  canEdit: boolean;
}) {
  const allOn = rows.length > 0 && rows.every((r) => selected.has(r.id));

  return (
    <div className="rounded-card overflow-x-auto border border-border bg-card">
      <table className="w-full min-w-max border-collapse">
        <thead>
          <tr className="border-b border-border bg-muted/40">
            {canEdit && (
              <th className="w-[44px] px-3 py-2">
                <input
                  type="checkbox"
                  aria-label="この画面の行をすべて選ぶ"
                  checked={allOn}
                  onChange={onToggleAll}
                  className="h-[18px] w-[18px] align-middle"
                />
              </th>
            )}
            {shown.map((key) => {
              const c = colDef(key);
              return (
                <th
                  key={key}
                  style={c.width ? { width: c.width, minWidth: c.width } : { minWidth: 220 }}
                  className={`text-th px-3 py-2 font-bold text-muted-foreground ${c.numeric ? 'text-right' : 'text-left'}`}
                >
                  {c.label}
                </th>
              );
            })}
            <th className="w-[56px] px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              data-row
              className={`border-b border-border-faint last:border-b-0 hover:bg-muted/40 ${
                selected.has(row.id) ? 'bg-primary-surface-weak' : ''
              }`}
            >
              {canEdit && (
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label={`${row.name} を選ぶ`}
                    checked={selected.has(row.id)}
                    onChange={() => onToggle(row.id)}
                    className="h-[18px] w-[18px] align-middle"
                  />
                </td>
              )}
              {shown.map((key) => {
                const c = colDef(key);
                return (
                  <td
                    key={key}
                    style={c.width ? { width: c.width, maxWidth: c.width } : { minWidth: 220 }}
                    className={`text-sub px-3 py-2 ${c.numeric ? 'text-right' : ''} ${c.width ? 'truncate' : ''}`}
                  >
                    <LedgerCell col={key} row={row} />
                  </td>
                );
              })}
              {/* **1件だけ直す道も残す。** まとめて直せない項目（案件名・金額）は
                  「直す」画面から。ここが無いと台帳から編集に辿り着けない */}
              <td className="px-3 py-2">
                <Link
                  to={`/sales/projects/${row.id}/edit`}
                  aria-label={`${row.name} を直す`}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-control text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
